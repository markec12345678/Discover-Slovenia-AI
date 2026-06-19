import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/bookings — ustvari rezervacijo izkušnje (demo ali production Stripe)
//
// Body:
//   {
//     experienceId, experienceName, pricePerPerson, groupSize, bookingDate,
//     guest: { name, email, phone, notes },
//     provider: { name, email, meetingPoint }
//   }
//
// DEMO mode (brez realnih Stripe ključev): direktno ustvari Booking z
// status="confirmed", confirmedAt=now. V production mode-u bo tu Stripe
// Checkout Session (TODO).
export async function POST(request: Request) {
  try {
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

    const experienceName = String(b.experienceName ?? "").trim();
    if (!experienceName) {
      return NextResponse.json(
        { success: false, error: "Manjka experienceName" },
        { status: 400 }
      );
    }

    const pricePerPerson = Number(b.pricePerPerson);
    if (!Number.isFinite(pricePerPerson) || pricePerPerson < 0) {
      return NextResponse.json(
        { success: false, error: "Neveljavna cena na osebo" },
        { status: 400 }
      );
    }

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
    const notesRaw = String(guestRaw.notes ?? "").trim();

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

    // Provider (snapshot)
    const providerRaw = (b.provider ?? {}) as Record<string, unknown>;
    const providerName =
      String(providerRaw.name ?? "").trim() || "Neznan ponudnik";
    const providerEmail =
      String(providerRaw.email ?? "").trim() || "ni-na-voljo@ifslovenia.si";
    const meetingPointRaw = String(providerRaw.meetingPoint ?? "").trim();
    const meetingPoint = meetingPointRaw || null;

    // === Server-side izračun cene ===
    const total = Math.round(pricePerPerson * groupSize * 100) / 100;
    const currency = "EUR";

    // === Generiraj bookingNumber ===
    const bookingNumber = `IF-EXP-${Date.now().toString().slice(-6)}`;

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
