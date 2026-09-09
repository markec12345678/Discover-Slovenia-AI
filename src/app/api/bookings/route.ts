import { NextResponse } from "next/server";
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
      },
    });

    if (!dbExperience || dbExperience.status === "deleted") {
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
    const providerEmail =
      dbExperience.providerEmail ||
      String(((b.provider ?? {}) as Record<string, unknown>).email ?? "").trim() ||
      "ni-na-voljo@discoverslovenia.ai";
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
    const sourceRaw = typeof b.source === "string" ? b.source.trim() : "";
    const source =
      sourceRaw === "consultation" ? "consultation" : null;

    // === Server-side izračun cene ===
    const total = Math.round(pricePerPerson * groupSize * 100) / 100;
    const currency = "EUR";

    // === Generiraj bookingNumber (nerodljiv — vključuje entropijo) ===
    const bookingNumber = `IF-EXP-${randomId(8)}`;

    // === Preveri ali je Stripe v demo mode ===
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const isDemo = !stripeKey || stripeKey.includes("demo_placeholder");

    // === DEMO MODE: direktno ustvari Booking z status="confirmed" ===
    if (isDemo) {
      const booking = await db.booking.create({
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
      });

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
        status: booking.status,
        bookingDate: booking.bookingDate.toISOString(),
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
