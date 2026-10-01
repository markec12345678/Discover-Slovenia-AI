import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { randomId } from "@/lib/security";
import { sendEmail, isEmailDemo } from "@/lib/email";
import { isStripeConfigured, isStripeDemo } from "@/lib/stripe-server";
import {
  MARKETPLACE_BOOKING_TYPE,
  BOOKING_ACTIVE_STATUSES,
  checkoutExpiresAt,
} from "@/lib/marketplace-checkout";
import { releasePendingBooking } from "@/lib/marketplace-checkout-server";
import {
  bookingConfirmationEmail,
  providerBookingNotificationEmail,
} from "@/lib/email-templates";
import {
  capacitySufficient,
  checkDayAvailability,
  refusalMessage,
  toDayKey,
} from "@/lib/experience-availability";

// POST /api/bookings — ustvari rezervacijo izkušnje (demo ali production Stripe)
//
// Body:
//   {
//     experienceId, groupSize, bookingDate,
//     guest: { name, email, phone, notes },
//     provider: { name, email, meetingPoint } (fallback, če iz DB manjka)
//   }
//
// VARNOST: ceno, ime izkušnje in kontakt ponudnika preberemo iz baze
// (client posredovana cena se NE zaupa — prej je bila možna €0 rezervacija).
//
// TASK 33 (Tier 2 #1, 1.110.0): KOLEDAR RAZPOLOŽLJIVOSTI — preverba dneva
// (blackout / sezona / kapaciteta/dan) teče ZNOTRAJ SERIALIZABLE
// transakcije (atomarna preprečitev overbookinga — isti P2034 retry
// vzorec kot dedup). DORMANT: brez nastavitev (ExperienceAvailability)
// je dan neomejen in se obnašanje NE spremeni.
//
// DEMO mode (brez realnih Stripe ključev; v produkciji SAMO z
// DSA_DEMO_PAYMENTS=1): direktno ustvari Booking z status="confirmed",
// confirmedAt=now, ter pošlje potrditvena e-pošto gostu in obvestilo
// ponudniku (ne-blokirajoče).
// PRODUCTION mode (Issue #20 §4 FAZA 2, 1.158.0): ista atomarna
// transakcija (dedup + koledar razpoložljivosti + create) ustvari PENDING
// Booking (brez confirmedAt; ZASEDA kapaciteto dneva) → Stripe Checkout
// Session (payment mode, metadata type=marketplace_booking) → { url }.
// "confirmed" + "paid" zapiše IZKLJUČNO overjeni webhook
// (checkout.session.completed s preverbo payment_status + zneska);
// potek/plačilni propad seje (expired | async_payment_failed) rezervacijo
// prekliče in kapaciteto sprosti.
export async function POST(request: Request) {
  try {
    // Rate limit (preprečuje spam rezervacij)
    const limited = rateLimit(request, {
      limit: 10,
      windowMs: 60 * 60_000,
      key: "booking-create",
    });
    if (limited) return limited;

    const body: unknown = await request.json();
    const b = (body ?? {}) as Record<string, unknown>;

    // === Validacija ===
    const experienceId = String(b.experienceId ?? "").trim();
    if (!experienceId) {
      return NextResponse.json(
        { success: false, error: "Manjka experienceId" },
        { status: 400 }
      );
    }

    // === Server-side preverjanje izkušnje in cene (iz DB!) ===
    // Client poslane vrednosti se uporabijo le kot fallback, če v DB manjka podatek.
    const dbExperience = await db.experience.findUnique({
      where: { id: experienceId },
      select: {
        name: true,
        pricePerPerson: true,
        providerName: true,
        providerEmail: true,
        meetingPoint: true,
        status: true,
        // P3b-3: meje skupine iz DB — splošna meja 1–100 je samo groba varovalka
        minGroupSize: true,
        maxGroupSize: true,
      },
    });

    // P3b-9: rezervirati je možno SAMO objavljene izkušnje — pending /
    // rejected / unpublished / deleted vsi → enoten 404 (brez razlikovanja
    // vzroka, da ne razkrivamo moderatorskega stanja).
    if (!dbExperience || dbExperience.status !== "published") {
      return NextResponse.json(
        { success: false, error: "Izkušnja ne obstaja" },
        { status: 404 }
      );
    }

    // Cena iz baze — client ne more manipulirati
    const pricePerPerson = dbExperience.pricePerPerson;
    const experienceName = dbExperience.name;
    const providerName =
      dbExperience.providerName ||
      String(((b.provider ?? {}) as Record<string, unknown>).name ?? "").trim() ||
      "Neznan ponudnik";
    // P3b-8: providerEmail IZKLJUČNO iz DB (ali varna konstanta) — client
    // posredovanega emaila se NE zaupa (sicer bi lahko gost preusmeril
    // ponudnikovo obvestilo o rezervaciji na poljuben naslov). providerName /
    // meetingPoint fallback iz clienta sta OK (samo prikaz, brez popačenja).
    const providerEmail =
      dbExperience.providerEmail || "ni-na-voljo@discoverslovenia.ai";
    const meetingPoint =
      dbExperience.meetingPoint ||
      String(((b.provider ?? {}) as Record<string, unknown>).meetingPoint ?? "").trim() ||
      null;

    const groupSize = Number(b.groupSize);
    if (!Number.isInteger(groupSize) || groupSize < 1 || groupSize > 100) {
      return NextResponse.json(
        { success: false, error: "Neveljavno število oseb" },
        { status: 400 }
      );
    }

    // P3b-3: meje te izkušnje iz DB (prej se je sprejel tudi groupSize 9 pri
    // maxGroupSize 6 — strežnik meje izkušnje ni preverjal).
    if (
      groupSize < dbExperience.minGroupSize ||
      groupSize > dbExperience.maxGroupSize
    ) {
      return NextResponse.json(
        {
          success: false,
          error: `Število oseb mora biti med ${dbExperience.minGroupSize} in ${dbExperience.maxGroupSize}`,
        },
        { status: 400 }
      );
    }

    // Datum — mora biti veljaven in v prihodnosti (>= danes)
    const bookingDateRaw = b.bookingDate;
    if (
      typeof bookingDateRaw !== "string" &&
      !(bookingDateRaw instanceof Date)
    ) {
      return NextResponse.json(
        { success: false, error: "Manjka bookingDate" },
        { status: 400 }
      );
    }
    const bookingDate = new Date(bookingDateRaw as string);
    if (Number.isNaN(bookingDate.getTime())) {
      return NextResponse.json(
        { success: false, error: "Neveljaven datum rezervacije" },
        { status: 400 }
      );
    }
    // 19-f-8 (revizija 1.36.0, P3): "danes" po stenski uri strežnika (UTC na
    // Vercelu) je ljubljansko mejo "veljaven datum" zamaknil za 1–2 uri
    // (rezervacija za današnji dan v LJ večer je bila zavrnjena kot pretekla).
    // Isti princip kot 1.34.0 fix obračunskega meseca in
    // startOfTodayLjubljana v consultations/ask-local.
    const LJ_TZ = "Europe/Ljubljana";
    const today = (() => {
      const parts = Object.fromEntries(
        new Intl.DateTimeFormat("en-US", {
          timeZone: LJ_TZ,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        })
          .formatToParts(new Date())
          .map((p) => [p.type, p.value])
      );
      return new Date(
        Date.UTC(
          Number(parts.year),
          Number(parts.month) - 1,
          Number(parts.day)
        )
      );
    })();
    if (bookingDate < today) {
      return NextResponse.json(
        { success: false, error: "Datum rezervacije mora biti v prihodnosti" },
        { status: 400 }
      );
    }
    // FW1 (audit R3 🔴 #1): zgornja meja datuma (18 mesecev) — prej je bilo
    // mogoče ustvarjati rezervacije poljubno daleč v prihodnosti (širitveni
    // prostor za inflacijo števcev/osnov prek skript).
    const maxDate = new Date(today);
    maxDate.setMonth(maxDate.getMonth() + 18);
    if (bookingDate > maxDate) {
      return NextResponse.json(
        { success: false, error: "Datum rezervacije je predaleč v prihodnosti (največ 18 mesecev)" },
        { status: 400 }
      );
    }

    // Guest
    const guestRaw = (b.guest ?? {}) as Record<string, unknown>;
    const guestName = String(guestRaw.name ?? "").trim();
    const guestEmail = String(guestRaw.email ?? "").trim();
    const guestPhone = String(guestRaw.phone ?? "").trim();
    const notesRaw = String(guestRaw.notes ?? "").slice(0, 2000).trim();

    if (guestName.length < 2) {
      return NextResponse.json(
        { success: false, error: "Manjka ime in priimek" },
        { status: 400 }
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
      return NextResponse.json(
        { success: false, error: "Neveljaven email naslov" },
        { status: 400 }
      );
    }
    if (guestPhone.length < 5) {
      return NextResponse.json(
        { success: false, error: "Manjka telefonska številka" },
        { status: 400 }
      );
    }

    // (providerName, providerEmail, meetingPoint so že prevzeti iz DB zgoraj)

    // === Atribucija izvora (Faza 3c — model „ponudniki plačajo") ===
    // whitelist — stranka NE more zapisati poljubnih vrednosti.
    // P3b-2: "consultation" se prizna SAMO, če v DB obstaja dostavljena
    // konzultacija tega gosta v zadnjih 30 dneh (enako okno kot piškotek
    // dsai_consultation_ref) — sicer bi vsak POST lahko pripisal rezervacijo
    // AI kanalu in s tem provociral 12 % provizijski model.
    const sourceRaw = typeof b.source === "string" ? b.source.trim() : "";
    let source: "consultation" | null =
      sourceRaw === "consultation" ? "consultation" : null;
    if (source === "consultation") {
      const consultations = await db.consultation.findMany({
        where: {
          email: guestEmail.toLowerCase(),
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60_000) },
          // /api/consultations ustvari zapis ŽE s status "delivered" (v isti
          // create klicu) — vsak API-created zapis je torej "delivered".
          status: "delivered",
        },
        select: { recommendedPartners: true, answer: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      });
      // P7-C3 (P1): konzultacija mora PRAV TEGA ponudnika/izkušnjo tudi
      // PRIPOROČITI — obstoj "delivered" konzultacije pri gostu sam po sebi
      // ni dovolj (sicer si gost/konkurent z eno self-minted konzultacijo
      // pripisuje 12 % provizijo na poljubni rezervaciji). Preverimo
      // recommendedPartners (imena) in AI odgovor (vsebina).
      const expName = experienceName.trim().toLowerCase();
      const provName = providerName.trim().toLowerCase();
      const attributed = consultations.some((c) => {
        const names: string[] = [];
        try {
          const parsed = c.recommendedPartners
            ? (JSON.parse(c.recommendedPartners) as unknown)
            : [];
          if (Array.isArray(parsed)) {
            for (const p of parsed) {
              if (
                p &&
                typeof p === "object" &&
                typeof (p as { name?: unknown }).name === "string"
              ) {
                names.push((p as { name: string }).name);
              }
            }
          }
        } catch {
          // pokvarjen JSON — ignoriramo, zanesemo na answer besedilo
        }
        const answer = (c.answer ?? "").toLowerCase();
        return (
          names.some(
            (n) =>
              n.trim().toLowerCase() === expName ||
              n.trim().toLowerCase() === provName
          ) ||
          (expName.length >= 4 && answer.includes(expName)) ||
          (provName.length >= 4 && answer.includes(provName))
        );
      });
      if (!attributed) {
        source = null;
        console.log(
          "[bookings] source=consultation zavrnjen — konzultacija gosta ni priporočila te izkušnje/ponudnika:",
          experienceId
        );
      }
    }

    // === Server-side izračun cene ===
    const total = Math.round(pricePerPerson * groupSize * 100) / 100;
    const currency = "EUR";

    // === Generiraj bookingNumber (nerodljiv — vključuje entropijo) ===
    // P3b-10: 12 hex znakov (48-bit entropije) namesto prej 8 (32-bit).
    // Daljši format ne seka starih številk — nasprotno: stare (8 zn.) in nove
    // (12 zn.) so po dolžini vedno različne, @unique pa varuje unikatnost.
    const bookingNumber = `IF-EXP-${randomId(12)}`;

    // === Preveri ali je Stripe v demo mode ===
    // 19e-1 (revizija 1.36.0, P2): skupni fail-closed helper — demo v
    // produkciji zahteva DSA_DEMO_PAYMENTS=1 (prej: unset ključ v produkciji
    // bi tiho potrdil rezervacijo brez plačila).
    const isDemo = isStripeDemo();

    // ISSUE #20 §4 FAZA 2 (1.158.0): PRODUCTION MODE za izkušnje — prej je
    // bila tu 501 varovalka (TODO). Zdaj je tu PRAVA aktivacijska pot
    // (pending Booking + Stripe Checkout Session); brez ključev ostaja
    // fail-closed 503 — NIKOLI tiho demo potrditev v produkciji.
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!isDemo && (!isStripeConfigured() || !stripeKey)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Plačila niso konfigurirana (STRIPE_SECRET_KEY manjka). Nastavite Stripe ključe ali DSA_DEMO_PAYMENTS=1 za demo način.",
        },
        { status: 503 }
      );
    }

    // ISSUE #20 §4 FAZA 2: v produkciji dedup zajema SAMO aktivne vrstice
    // (pending = seja še čaka na plačilo, confirmed = opravljena).
    // Preklicana (potekla/plačilno propadla) vrstica NOVEGA poskusa NE
    // blokira — njena kapaciteta je bila sproščena.
    const dedupStatusFilter = isDemo
      ? undefined
      : { in: [...BOOKING_ACTIVE_STATUSES] };

    // === Skupna atomarna transakcija (demo in produkcija) ===
      // === P3b-4: deduplikacija (dvojni klik / client retry) ===
      // Ista izkušnja + gost + datum v zadnjih 10 minutah → 409 s številko
      // PRVE rezervacije. Legitimna ponovna rezervacija istega dne po 10 min
      // ostaje možna.
      // P8 (P1): findFirst -> create je prej potekal loceno = TOCTOU race
      // (dva sočasna requesta oba preglesta "ni duplikata" in oba kreirata
      // rezervacijo). Dedup + create sta zdaj ATOMARNO v SERIALIZABLE
      // transakciji: ob konfliktu (P2034) retry; nastane natanko ENA
      // rezervacija, sogibajoči request ob retryju vidi zmagovalno vrstico
      // in dobi 409. SERIALIZABLE podpira PostgreSQL (Neon/produkcija);
      // SQLite (lokalna demo baza, enouporabniška) pusti privzeto raven.
      const txOptions = process.env.DATABASE_URL?.startsWith("file:")
        ? undefined
        : {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          };
      const dupWindowStart = new Date(Date.now() - 10 * 60_000);
      const createAtomically = async (): Promise<{
        duplicate: boolean;
        bookingNumber: string;
        refused: string | null;
      }> => {
        for (let attempt = 0; ; attempt++) {
          try {
            return await db.$transaction(
              async (tx) => {
                const existing = await tx.booking.findFirst({
                  where: {
                    experienceId,
                    guestEmail,
                    bookingDate,
                    createdAt: { gte: dupWindowStart },
                    ...(dedupStatusFilter ? { status: dedupStatusFilter } : {}),
                  },
                  select: { bookingNumber: true },
                });
                if (existing) {
                  return {
                    duplicate: true,
                    bookingNumber: existing.bookingNumber,
                    refused: null,
                  };
                }

                // TASK 33 (Tier 2 #1): koledar razpoložljivosti — ATOMARNA
                // preverba znotraj transakcije (dva sočasna requesta vidita
                // isto vsoto → overbooking nemogoč). checkDayAvailability
                // šteje Σ groupSize rezervacij tega UTC-dneva z statusom ≠
                // "cancelled" (preklic sprosti mesto).
                const dayKey = toDayKey(bookingDate);
                const { policy, booked } = await checkDayAvailability({
                  db: tx,
                  experienceId,
                  dayKey,
                });
                if (policy.kind === "closed") {
                  return {
                    duplicate: false,
                    bookingNumber: "",
                    refused: refusalMessage(policy, booked),
                  };
                }
                if (
                  policy.kind === "open" &&
                  !capacitySufficient({
                    capacity: policy.capacity,
                    booked,
                    groupSize,
                  })
                ) {
                  return {
                    duplicate: false,
                    bookingNumber: "",
                    refused: refusalMessage(policy, booked),
                  };
                }

                const created = await tx.booking.create({
                  data: {
                    bookingNumber,
                    guestEmail,
                    guestName,
                    guestPhone,
                    experienceId,
                    experienceName,
                    bookingDate,
                    groupSize,
                    pricePerPerson,
                    total,
                    currency,
                    // ISSUE #20 §4 FAZA 2 (1.158.0): demo = takoj
                    // "confirmed" (izrecen demo); produkcija = "pending"
                    // (brez confirmedAt) — "confirmed" bo zapisal IZKLJUČNO
                    // overjeni Stripe webhook po plačilu.
                    status: isDemo ? "confirmed" : "pending",
                    paymentMethod: isDemo ? "demo" : "stripe",
                    // FW1 (audit R3 🔴 #1): demo pot NIKOLI ne zapiše "paid" —
                    // demo rezervacija je potrjena (confirmed) a NEPLAČANA
                    // (unpaid) in kot taka NE vstopi v provizijsko osnovo
                    // (lib/commissions.ts). "paid" bo nastavljal izključno
                    // Stripe webhook ob dejanskem plačilu (§4 FAZA 2: zdaj
                    // res — webhook marketplace_booking veja).
                    paymentStatus: "unpaid",
                    notes: notesRaw || null,
                    providerName,
                    providerEmail,
                    meetingPoint,
                    source,
                    confirmedAt: isDemo ? new Date() : null,
                  },
                  select: { bookingNumber: true },
                });
                return {
                  duplicate: false,
                  bookingNumber: created.bookingNumber,
                  refused: null,
                };
              },
              txOptions
            );
          } catch (error) {
            const conflict =
              error instanceof Prisma.PrismaClientKnownRequestError &&
              error.code === "P2034";
            if (!conflict || attempt >= 2) {
              // Nepričakovana napaka ali izčrpani poskusi: ce je drug request
              // vmes uspel, vrnemo duplikat (idempotenten odgovor), sicer
              // napaka gre v splošni handler (500).
              const lateDup = await db.booking.findFirst({
                where: {
                  experienceId,
                  guestEmail,
                  bookingDate,
                  createdAt: { gte: dupWindowStart },
                  ...(dedupStatusFilter ? { status: dedupStatusFilter } : {}),
                },
                select: { bookingNumber: true },
              });
              if (lateDup) {
                return {
                  duplicate: true,
                  bookingNumber: lateDup.bookingNumber,
                  refused: null,
                };
              }
              throw error;
            }
            await new Promise((r) => setTimeout(r, 60));
          }
        }
      };

      const outcome = await createAtomically();

      // TASK 33 (Tier 2 #1): zavrnjena rezervacija (blackout / izven sezone /
      // zasedena dnevna kapaciteta) — 409 s iskrenim razlogom.
      if (outcome.refused) {
        return NextResponse.json(
          { success: false, error: outcome.refused },
          { status: 409 }
        );
      }

      const dup = outcome.duplicate
        ? { bookingNumber: outcome.bookingNumber }
        : null;
      if (dup) {
        return NextResponse.json(
          {
            success: false,
            error: "Ta rezervacija je bila pravkar ustvarjena. Preverite svojo e-pošto za potrditev.",
            bookingNumber: dup.bookingNumber,
          },
          { status: 409 }
        );
      }

      // Rezervacija je bila ustvarjena (ali zavrnjena kot duplikat) znotraj
      // transakcije zgoraj; `booking` tu nosi samo se stevilko za odgovor
      // in potrditveni e-posti.
      const booking = { bookingNumber: outcome.bookingNumber };

      // === PRODUCTION MODE (Issue #20 §4 FAZA 2) — Stripe Checkout Session ===
      // Pending rezervacija (z zasedeno kapaciteto dneva) že varno obstaja v
      // bazi; zdaj odpremo plačilno sejo in shranimo njen ID. Ta koda NE
      // piše "confirmed"/"paid" — to stori izključno webhook po overitvi
      // podpisa in zneska.
      if (!isDemo) {
        if (!stripeKey) {
          // Defenzivna tipovska ozka vrata — 503 preverba zgoraj že varuje.
          return NextResponse.json(
            { success: false, error: "Stripe ni konfiguriran" },
            { status: 503 }
          );
        }
        try {
          const stripe = new Stripe(stripeKey, {
            // FIXME: stripe v22 tipi pričakujejo le LatestApiVersion
            // ("2026-05-27.dahlia"); pin ostaja na "2024-12-18.acacia"
            // (nespremenjeno obnašanje, enako ostalim Stripe rutam).
            apiVersion: "2024-12-18.acacia" as NonNullable<
              ConstructorParameters<typeof Stripe>[1]
            >["apiVersion"],
          });
          const baseUrl =
            process.env.NEXTAUTH_URL ??
            (process.env.VERCEL_URL
              ? `https://${process.env.VERCEL_URL}`
              : "http://localhost:3000");

          const checkoutSession = await stripe.checkout.sessions.create({
            mode: "payment",
            customer_email: guestEmail,
            // Cena je STREŽNIŠKA (iz DB — glej preverbo zgoraj).
            line_items: [
              {
                price_data: {
                  currency: "eur",
                  product_data: {
                    name: experienceName,
                    description: `${bookingDate.toISOString().slice(0, 10)} · ${groupSize} ${
                      groupSize === 1 ? "oseba" : "oseb"
                    } · ${providerName}`,
                  },
                  unit_amount: Math.round(pricePerPerson * 100),
                },
                quantity: groupSize,
              },
            ],
            metadata: {
              type: MARKETPLACE_BOOKING_TYPE,
              bookingNumber: booking.bookingNumber,
            },
            // Rezervacija kapacitete je časovno OMEJENA (60 min) — po poteku
            // jo webhook checkout.session.expired sprosti (pending →
            // cancelled; kapaciteta se sprosti, ker jo checkDayAvailability
            // šteje samo za status ≠ "cancelled").
            expires_at: checkoutExpiresAt(),
            success_url: `${baseUrl}/dozivetja?placilo=uspeh&rezervacija=${booking.bookingNumber}`,
            cancel_url: `${baseUrl}/dozivetja?placilo=preklicano`,
          });

          await db.booking.update({
            where: { bookingNumber: booking.bookingNumber },
            data: { stripeSessionId: checkoutSession.id },
          });

          return NextResponse.json({
            success: true,
            url: checkoutSession.url,
            bookingNumber: booking.bookingNumber,
            total,
            status: "pending" as const,
            bookingDate: bookingDate.toISOString(),
            currency,
            meetingPoint,
            providerName,
            providerEmail,
          });
        } catch (error) {
          // KOMPENZACIJA (Issue #20 §4 FAZA 2): seja ni nastala → pending
          // vrstica NIMA webhook-a, ki bi jo sprostil — prekličemo jo takoj
          // (kapaciteta se sprosti prek statusa "cancelled").
          await releasePendingBooking(booking.bookingNumber).catch((e) => {
            console.error(
              "[bookings] kompenzacija releasePendingBooking napaka:",
              e
            );
          });
          console.error("[bookings] stripe session napaka:", error);
          return NextResponse.json(
            {
              success: false,
              error: "Napaka pri pripravi plačila. Poskusite znova.",
            },
            { status: 500 }
          );
        }
      }

      // === DEMO MODE — štetje, e-pošta, potrditev (izključno demo) ===

      // Poskusi inkrementirati bookingCount na izkušnji (če obstaja)
      try {
        await db.experience.update({
          where: { id: experienceId },
          data: { bookingCount: { increment: 1 } },
        });
      } catch {
        // Izkušnja morda ne obstaja — ignoriraj (snapshot je že shranjen)
      }

      // === E-pošta gostu: potrditev rezervacije — NE-BLOKIRAJOČE ===
      // Rezervacija je že varno shranjena v bazi — napaka emaila NE sme
      // sesuti odgovora (isti vzorec kot /api/listing-inquiry).
      try {
        const guestMail = bookingConfirmationEmail({
          bookingNumber: booking.bookingNumber,
          guestName,
          experienceName,
          bookingDate,
          groupSize,
          pricePerPerson,
          total,
          meetingPoint,
          providerName,
        });

        void sendEmail({
          to: guestEmail,
          subject: guestMail.subject,
          html: guestMail.html,
          text: guestMail.text,
        })
          .then((sent) => {
            console.log(
              `[bookings] potrditev ${booking.bookingNumber} → ${guestEmail}: ${
                sent ? "poslana" : "NEUSPEŠNA"
              } (email demo: ${isEmailDemo()}).`
            );
          })
          .catch(() => {
            // email ne sme sesuti odgovora
          });
      } catch (e) {
        console.error("[bookings] priprava potrditvenega emaila:", e);
      }

      // === E-pošta ponudniku: obvestilo o novi rezervaciji — NE-BLOKIRAJOČE ===
      // providerEmail ni nujno veljaven naslov — morebitna napaka pošiljanja
      // prav tako ne sme sesuti odgovora.
      try {
        const providerMail = providerBookingNotificationEmail({
          bookingNumber: booking.bookingNumber,
          experienceName,
          bookingDate,
          groupSize,
          guestName,
          guestEmail,
          guestPhone,
          total,
        });

        void sendEmail({
          to: providerEmail,
          subject: providerMail.subject,
          html: providerMail.html,
          text: providerMail.text,
        })
          .then((sent) => {
            console.log(
              `[bookings] obvestilo ponudniku za ${booking.bookingNumber} → ${providerEmail}: ${
                sent ? "poslano" : "NEUSPEŠNO"
              } (email demo: ${isEmailDemo()}).`
            );
          })
          .catch(() => {
            // email ne sme sesuti odgovora
          });
      } catch (e) {
        console.error("[bookings] priprava emaila ponudniku:", e);
      }

      return NextResponse.json({
        success: true,
        bookingNumber: booking.bookingNumber,
        total,
        status: "confirmed" as const,
        bookingDate: bookingDate.toISOString(),
        currency,
        meetingPoint,
        providerName,
        providerEmail,
      });
  } catch (error) {
    console.error("[bookings] POST napaka:", error);
    return NextResponse.json(
      { success: false, error: "Napaka pri ustvarjanju rezervacije" },
      { status: 500 }
    );
  }
}
