import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/bookings/[bookingNumber]/cancel-request  { email }
 *
 * TASK 99 (issue #1 §10 — customer state): gost ZAHTEVA preklic svoje
 * rezervacije. To je ZAHTEVEK, ne preklic — preklic izvede lastnik prek
 * PATCH /api/owner/bookings (action=cancel), ki stanje resetira na "none".
 * Iskrena semantika:
 *  - samo lastnik emaila (enak varnostni model kot GET lookup);
 *  - samo rezervacije v statusu pending | confirmed (končane/preklicane
 *    nima smisla — 409 z razlago);
 *  - idempotentno: ponovna zahteva ne spremeni ničesar (200);
 *  - zapiše se AuditLog (sledljivost za lastnika/admina).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookingNumber: string }> }
) {
  try {
    const limited = rateLimit(request, {
      limit: 10,
      windowMs: 10 * 60_000,
      key: "booking-cancel-request",
    });
    if (limited) return limited;

    const { bookingNumber } = await params;
    if (!bookingNumber) {
      return NextResponse.json(
        { success: false, error: "Manjka bookingNumber" },
        { status: 400 }
      );
    }

    let email = "";
    try {
      const body = (await request.json()) as { email?: unknown };
      email =
        typeof body.email === "string" ? body.email.toLowerCase().trim() : "";
    } catch {
      return NextResponse.json(
        { success: false, error: "Neveljaven JSON" },
        { status: 400 }
      );
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { success: false, error: "Manjka/nezveljaven email gosta" },
        { status: 401 }
      );
    }

    const booking = await db.booking.findUnique({
      where: { bookingNumber },
      select: {
        id: true,
        guestEmail: true,
        status: true,
        customerStatus: true,
        bookingDate: true,
        experienceName: true,
      },
    });

    // Enako sporočilo za neobstoječe in tuje rezervacije (brez razkrivanja)
    if (!booking || booking.guestEmail.toLowerCase().trim() !== email) {
      return NextResponse.json(
        { success: false, error: "Rezervacija ni najdena" },
        { status: 404 }
      );
    }

    if (booking.status === "cancelled") {
      return NextResponse.json(
        {
          success: false,
          error: "Rezervacija je že preklicana — nič za zahtevati.",
        },
        { status: 409 }
      );
    }
    if (booking.status === "completed") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Rezervacija je že opravljena — preklic ni mogoč (morebitno vračilo uredite neposredno s ponudnikom).",
        },
        { status: 409 }
      );
    }
    if (booking.status !== "pending" && booking.status !== "confirmed") {
      return NextResponse.json(
        {
          success: false,
          error: `Rezervacija v statusu "${booking.status}" ne sprejema zahtevkov za preklic.`,
        },
        { status: 409 }
      );
    }

    // Idempotenca: zahtevek je že zabeležen → brez spremembe (200).
    if (booking.customerStatus === "cancellation_requested") {
      return NextResponse.json({
        success: true,
        alreadyRequested: true,
        customerStatus: "cancellation_requested",
        message:
          "Zahtevek za preklic je že zabeležen — ponudnik ga bo obravnaval.",
      });
    }

    await db.$transaction([
      db.booking.update({
        where: { id: booking.id },
        data: { customerStatus: "cancellation_requested" },
      }),
      db.auditLog.create({
        data: {
          actorRole: "system",
          action: "booking_cancel_requested",
          resourceType: "booking",
          resourceId: booking.id,
          resourceName: booking.experienceName,
          metadata: JSON.stringify({
            bookingNumber,
            guestEmail: email,
            bookingStatus: booking.status,
          }),
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      customerStatus: "cancellation_requested",
      message:
        "Zahtevek za preklic je zabeležen. Ponudnik potrdi preklic (status rezervacije se sporoči ob naslednjem pregledu).",
    });
  } catch (error) {
    console.error("[bookings/cancel-request] POST napaka:", error);
    return NextResponse.json(
      { success: false, error: "Zahtevek trenutno ni možen" },
      { status: 500 }
    );
  }
}
