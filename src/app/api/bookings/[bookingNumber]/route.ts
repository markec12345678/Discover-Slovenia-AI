import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/bookings/[bookingNumber] — vrne Booking po bookingNumber
//
// Uporaba: iskanje rezervacije po številki (npr. za potrditev, pregled
// statusa). Vrne vse podatke o rezervaciji.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookingNumber: string }> }
) {
  try {
    const { bookingNumber } = await params;

    if (!bookingNumber) {
      return NextResponse.json(
        { success: false, error: "Manjka bookingNumber" },
        { status: 400 }
      );
    }

    const booking = await db.booking.findUnique({
      where: { bookingNumber },
    });

    if (!booking) {
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
