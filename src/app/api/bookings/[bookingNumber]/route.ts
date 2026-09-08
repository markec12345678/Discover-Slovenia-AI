import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

/**
 * GET /api/bookings/[bookingNumber]?email=gost@primer.si
 *
 * Vrne Booking po bookingNumber (za potrditev/status rezervacije).
 *
 * VARNOST: zahtevamo, da klicatelj navede email gosta, ki se mora ujemati
 * z guestEmail rezervacije — sicer ne vrnemo PII podatkov (prej je bil
 * endpoint popolnoma odprt — PII leak).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ bookingNumber: string }> }
) {
  try {
    // Rate limit lookupov (preprečuje enumeracijo rezervacij)
    const limited = rateLimit(request, {
      limit: 20,
      windowMs: 10 * 60_000,
      key: "booking-lookup",
    });
    if (limited) return limited;

    const { bookingNumber } = await params;

    if (!bookingNumber) {
      return NextResponse.json(
        { success: false, error: "Manjka bookingNumber" },
        { status: 400 }
      );
    }

    // Email verifikacija — zahtevan in mora ustrezati gostu
    const requestUrl = new URL(request.url);
    const email = requestUrl.searchParams.get("email")?.toLowerCase().trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Za ogled rezervacije navedite veljaven email naslov (query ?email=).",
        },
        { status: 401 }
      );
    }

    const booking = await db.booking.findUnique({
      where: { bookingNumber },
    });

    // Enako sporočilo za neobstoječe in tuje rezervacije (brez razkrivanja)
    if (!booking || booking.guestEmail.toLowerCase().trim() !== email) {
      return NextResponse.json(
        { success: false, error: "Rezervacija ni najdena" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      booking,
    });
  } catch (error) {
    console.error("[bookings/[bookingNumber]] GET napaka:", error);
    return NextResponse.json(
      { success: false, error: "Napaka pri iskanju rezervacije" },
      { status: 500 }
    );
  }
}
