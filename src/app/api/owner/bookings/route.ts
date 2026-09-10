import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";

// ============================================================================
// /api/owner/bookings — Booking manager za ponudnike (P0-3)
// ============================================================================
// GET:  seznam rezervacij izkušenj trenutno prijavljenega lastnika
//       (povezava prek Experience.ownerId ALI snapshot providerEmail)
// PATCH: sprememba statusa rezervacije — { bookingNumber, action }
//        action: "confirm" | "cancel" | "complete"
//
// Dovoljeni prehodi (GYG/Booking-style):
//   pending   → confirmed (confirm) | cancelled (cancel)
//   confirmed → completed (complete) | cancelled (cancel)
//   cancelled/completed → zaključena (brez sprememb)
// ============================================================================

// Lastništvo rezervacije: izkušnja pripada lastniku (Experience.ownerId —
// Booking shranjuje samo experienceId snapshot BREZ Prisma relacije)
// ali snapshot providerEmail ustreza e-pošti lastnika.
async function findOwnerBooking(ownerId: string, ownerEmail: string, bookingNumber: string) {
  const booking = await db.booking.findUnique({
    where: { bookingNumber },
  });
  if (!booking) return null;

  const owned =
    booking.providerEmail === ownerEmail ||
    (booking.experienceId
      ? (
          await db.experience.findUnique({
            where: { id: booking.experienceId },
            select: { ownerId: true },
          })
        )?.ownerId === ownerId
      : false);

  if (!owned) return null;
  return booking;
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Niste prijavljeni" }, { status: 401 });
  }
  // P3a-6: B2C seja (popotnik) nima dostopa do ponudniških endpointov —
  // prej je B2C tukaj dobil 404 (owner lookup po User ID); eksplicitna 403.
  if (session.user.accountType === "user") {
    return NextResponse.json(
      { error: "Ta endpoint je za račune ponudnikov" },
      { status: 403 }
    );
  }

  try {
    const owner = await db.owner.findUnique({
      where: { id: session.user.id },
      select: { id: true, email: true },
    });
    if (!owner) {
      return NextResponse.json({ error: "Lastnik ni najden" }, { status: 404 });
    }

    const url = new URL(request.url);
    const statusFilter = url.searchParams.get("status"); // neobvezen filter

    // IDji izkušenj v lasti lastnika (Booking nima Prisma relacije na Experience)
    const ownedExperiences = await db.experience.findMany({
      where: { ownerId: owner.id },
      select: { id: true },
    });
    const ownedExperienceIds = ownedExperiences.map((e) => e.id);

    const bookings = await db.booking.findMany({
      where: {
        AND: [
          statusFilter ? { status: statusFilter } : {},
          {
            OR: [
              { experienceId: { in: ownedExperienceIds } },
              { providerEmail: owner.email },
            ],
          },
        ],
      },
      orderBy: { bookingDate: "desc" },
      select: {
        id: true,
        bookingNumber: true,
        guestName: true,
        guestEmail: true,
        guestPhone: true,
        experienceName: true,
        bookingDate: true,
        groupSize: true,
        pricePerPerson: true,
        total: true,
        currency: true,
        status: true,
        notes: true,
        meetingPoint: true,
        source: true,
        createdAt: true,
        confirmedAt: true,
      },
    });

    // Statistika po statusih + prihodki
    const now = new Date();
    const stats = {
      total: bookings.length,
      pending: bookings.filter((b) => b.status === "pending").length,
      confirmed: bookings.filter((b) => b.status === "confirmed").length,
      completed: bookings.filter((b) => b.status === "completed").length,
      cancelled: bookings.filter((b) => b.status === "cancelled").length,
      // prihodki: potrjene + zaključene, prihodnje rezervacije
      upcomingRevenue: bookings
        .filter(
          (b) =>
            (b.status === "confirmed" || b.status === "completed") &&
            b.bookingDate >= now
        )
        .reduce((sum, b) => sum + b.total, 0),
      // atribucija AI kanala (source="consultation")
      fromConsultation: bookings.filter((b) => b.source === "consultation").length,
    };

    return NextResponse.json({ bookings, stats });
  } catch (error) {
    console.error("[api/owner/bookings] GET napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pridobivanju rezervacij" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Niste prijavljeni" }, { status: 401 });
  }
  // P3a-6: B2C seja — eksplicitna 403 (enako kot GET)
  if (session.user.accountType === "user") {
    return NextResponse.json(
      { error: "Ta endpoint je za račune ponudnikov" },
      { status: 403 }
    );
  }

  try {
    const owner = await db.owner.findUnique({
      where: { id: session.user.id },
      select: { id: true, email: true, name: true },
    });
    if (!owner) {
      return NextResponse.json({ error: "Lastnik ni najden" }, { status: 404 });
    }

    const body = await request.json();
    const { bookingNumber, action } = body ?? {};

    if (!bookingNumber || !action) {
      return NextResponse.json(
        { error: "Manjka bookingNumber ali action" },
        { status: 400 }
      );
    }

    if (!["confirm", "cancel", "complete"].includes(action)) {
      return NextResponse.json(
        { error: "Neveljavna akcija (dovoljene: confirm, cancel, complete)" },
        { status: 400 }
      );
    }

    const booking = await findOwnerBooking(
      owner.id,
      owner.email,
      bookingNumber
    );
    if (!booking) {
      return NextResponse.json(
        { error: "Rezervacija ni najdena ali nimate dovoljenja" },
        { status: 404 }
      );
    }

    // Validacija prehodov statusov
    const transitions: Record<string, Record<string, string>> = {
      confirm: { pending: "confirmed" },
      cancel: { pending: "cancelled", confirmed: "cancelled" },
      complete: { confirmed: "completed" },
    };

    const newStatus = transitions[action]?.[booking.status];
    if (!newStatus) {
      const actionLabels: Record<string, string> = {
        confirm: "potrditi",
        cancel: "preklicati",
        complete: "zaključiti",
      };
      return NextResponse.json(
        {
          error: `Rezervacije s statusom "${booking.status}" ni mogoče ${actionLabels[action]}.`,
        },
        { status: 400 }
      );
    }

    const updated = await db.booking.update({
      where: { id: booking.id },
      data: {
        status: newStatus,
        confirmedAt:
          newStatus === "confirmed" ? new Date() : booking.confirmedAt,
      },
    });

    // E-pošta gostu o spremembi statusa — NE-BLOKIRAJOČE
    void sendBookingStatusEmail({
      to: booking.guestEmail,
      guestName: booking.guestName,
      bookingNumber: booking.bookingNumber,
      experienceName: booking.experienceName,
      newStatus,
      providerName: owner.name,
    }).catch(() => {});

    console.log(
      `[owner/bookings] ${booking.bookingNumber}: ${booking.status} → ${newStatus} (owner: ${owner.email})`
    );

    return NextResponse.json({
      success: true,
      booking: updated,
      message:
        newStatus === "confirmed"
          ? "Rezervacija potrjena. Gost je bil obveščen po e-pošti."
          : newStatus === "cancelled"
          ? "Rezervacija preklicana. Gost je bil obveščen po e-pošti."
          : "Rezervacija zaključena. Hvala za potrditev izvedbe!",
    });
  } catch (error) {
    console.error("[api/owner/bookings] PATCH napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri posodabljanju rezervacije" },
      { status: 500 }
    );
  }
}

// E-pošta o spremembi statusa rezervacije (potrjena/preklicana/zaključena)
async function sendBookingStatusEmail({
  to,
  guestName,
  bookingNumber,
  experienceName,
  newStatus,
  providerName,
}: {
  to: string;
  guestName: string;
  bookingNumber: string;
  experienceName: string;
  newStatus: string;
  providerName: string;
}) {
  const { sendEmail, emailTemplate } = await import("@/lib/email");
  const { escapeHtml } = await import("@/lib/security");

  const statusInfo: Record<string, { title: string; body: string }> = {
    confirmed: {
      title: "Vaša rezervacija je potrjena",
      body: `Ponudnik <strong>${escapeHtml(providerName)}</strong> je potrdil vašo rezervacijo izkušnje <strong>${escapeHtml(experienceName)}</strong>. Vidimo se kmalu!`,
    },
    cancelled: {
      title: "Vaša rezervacija je preklicana",
      body: `Ponudnik <strong>${escapeHtml(providerName)}</strong> je žal preklical vašo rezervacijo izkušnje <strong>${escapeHtml(experienceName)}</strong>. Oprostite za nevšečnosti — pišite nam, če želite pomoč pri alternativi.`,
    },
    completed: {
      title: "Hvala, da ste bili z nami!",
      body: `Vaša rezervacija izkušnje <strong>${escapeHtml(experienceName)}</strong> je zaključena. Upamo, da ste uživali — veseli bomo vašega mnenja!`,
    },
  };

  const info = statusInfo[newStatus] ?? statusInfo.confirmed;

  await sendEmail({
    to,
    subject: `${info.title} — ${bookingNumber} — Discover Slovenia AI`,
    html: emailTemplate(
      info.title,
      `<p>Pozdravljeni <strong>${escapeHtml(guestName)}</strong>,</p>
      ${info.body}
      <p style="color:#6b7280; font-size:13px;">Rezervacijska številka: <strong>${escapeHtml(bookingNumber)}</strong></p>`
    ),
  });
}
