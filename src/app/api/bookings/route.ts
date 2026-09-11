import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { randomId } from "@/lib/security";
import { sendEmail, isEmailDemo } from "@/lib/email";
import {
  bookingConfirmationEmail,
  providerBookingNotificationEmail,
} from "@/lib/email-templates";

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
// DEMO mode (brez realnih Stripe ključev): direktno ustvari Booking z
// status="confirmed", confirmedAt=now, ter pošlje potrditvena e-pošta
// gostu in obvestilo ponudniku (ne-blokirajoče). V production mode-u bo tu
// Stripe Checkout Session (TODO).
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (bookingDate < today) {
      return NextResponse.json(
        { success: false, error: "Datum rezervacije mora biti v prihodnosti" },
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
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const isDemo = !stripeKey || stripeKey.includes("demo_placeholder");

    // === DEMO MODE: direktno ustvari Booking z status="confirmed" ===
    if (isDemo) {
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
                  },
                  select: { bookingNumber: true },
                });
                if (existing) {
                  return {
                    duplicate: true,
                    bookingNumber: existing.bookingNumber,
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
                    status: "confirmed",
                    paymentMethod: "demo",
                    notes: notesRaw || null,
                    providerName,
                    providerEmail,
                    meetingPoint,
                    source,
                    confirmedAt: new Date(),
                  },
                  select: { bookingNumber: true },
                });
                return {
                  duplicate: false,
                  bookingNumber: created.bookingNumber,
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
                },
                select: { bookingNumber: true },
              });
              if (lateDup) {
                return {
                  duplicate: true,
                  bookingNumber: lateDup.bookingNumber,
                };
              }
              throw error;
            }
            await new Promise((r) => setTimeout(r, 60));
          }
        }
      };

      const outcome = await createAtomically();
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
    }

    // === PRODUCTION MODE: TODO Stripe Checkout Session ===
    // TODO: ko boš dodal realne Stripe ključe:
    //   1. Ustvari Booking z status="pending" (brez confirmedAt)
    //   2. Ustvari Stripe Checkout Session z metadata { bookingNumber }
    //   3. Vrni { url } za preusmeritev
    //   4. Webhook (stripe/webhook) posluša za checkout.session.completed
    //      in nastavi status="confirmed", confirmedAt=now, stripeSessionId
    return NextResponse.json(
      {
        success: false,
        error: "Stripe checkout še ni konfiguriran v production načinu",
      },
      { status: 501 }
    );
  } catch (error) {
    console.error("[bookings] POST napaka:", error);
    return NextResponse.json(
      { success: false, error: "Napaka pri ustvarjanju rezervacije" },
      { status: 500 }
    );
  }
}
