import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateCommissionInvoicePdf } from "@/lib/pdf/commission-invoice-pdf";

export const runtime = "nodejs"; // fs dostop do pisav

// ============================================================================
// /api/owner/commissions/invoice-pdf?id=<invoiceId> — PDF izpis računa (4c)
// ============================================================================
// Vrne tiskanju prijazen PDF provizijskega računa (A4, Liberation Sans —
// slovenski diakritiki). Dostop: samo prijavljeni lastnik računa (enako
// lastništvo kot mark_paid). Podrobnosti rezervacij se pridobijo ob vsakem
// klicu; zneski na računu pa so posnetek (snapshot) ob izdaji.
// ============================================================================

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Niste prijavljeni" }, { status: 401 });
    }

    const owner = await db.owner.findUnique({
      where: { email: session.user.email },
      select: { id: true, name: true, businessName: true, email: true },
    });
    if (!owner) {
      return NextResponse.json({ error: "Lastnik ni najden" }, { status: 404 });
    }

    const invoiceId = new URL(request.url).searchParams.get("id");
    if (!invoiceId) {
      return NextResponse.json({ error: "Manjka id računa" }, { status: 400 });
    }

    const invoice = await db.commissionInvoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice || invoice.ownerId !== owner.id) {
      return NextResponse.json(
        { error: "Račun ni najden ali nimate dovoljenja" },
        { status: 404 }
      );
    }

    // Podrobnosti atribuiranih rezervacij v obdobju računa
    const experiences = await db.experience.findMany({
      where: { ownerId: owner.id },
      select: { id: true },
    });
    const experienceIds = experiences.map((e) => e.id);

    const bookings = experienceIds.length
      ? await db.booking.findMany({
          where: {
            experienceId: { in: experienceIds },
            source: "consultation",
            createdAt: { gte: invoice.periodStart, lt: invoice.periodEnd },
          },
          orderBy: { createdAt: "asc" },
          select: {
            bookingNumber: true,
            createdAt: true,
            experienceName: true,
            guestName: true,
            groupSize: true,
            total: true,
          },
        })
      : [];

    const pdfBytes = await generateCommissionInvoicePdf({
      invoiceNumber: invoice.invoiceNumber,
      periodStart: invoice.periodStart,
      periodEnd: invoice.periodEnd,
      issuedAt: invoice.issuedAt,
      paidAt: invoice.paidAt,
      status: invoice.status,
      bookingCount: invoice.bookingCount,
      commissionBase: invoice.commissionBase,
      rate: invoice.rate,
      amount: invoice.amount,
      ownerName: owner.name,
      ownerBusinessName: owner.businessName,
      ownerEmail: owner.email,
      bookings,
    });

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        // inline: odpre v zavihku, brskalnik ponudi shrani; filename za shranjevanje
        "Content-Disposition": `inline; filename="${invoice.invoiceNumber}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[owner/commissions/invoice-pdf] napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri generiranju PDF računa" },
      { status: 500 }
    );
  }
}
