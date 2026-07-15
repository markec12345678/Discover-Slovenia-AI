import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/auth-guards";
import { canSubmitForReview } from "@/lib/profile-completion";

// POST /api/owner/listings/submit — oddaj lokal v pregled (DRAFT → PENDING)
// Body: { listingId: string }
export async function POST(request: Request) {
  try {
    const { error, ownerId } = await requireOwner();
    if (error) return error;

    const { listingId } = await request.json();

    if (!listingId) {
      return NextResponse.json(
        { error: "Manjka listingId" },
        { status: 400 }
      );
    }

    // Preveri lastništvo
    const listing = await db.listing.findUnique({
      where: { id: listingId },
    });

    if (!listing || listing.ownerId !== ownerId) {
      return NextResponse.json(
        { error: "Lokal ni najden ali nimate dovoljenja" },
        { status: 404 }
      );
    }

    // Preveri ali je že pending/published
    if (listing.status === "pending") {
      return NextResponse.json(
        { error: "Lokal že čaka na odobritev" },
        { status: 400 }
      );
    }

    if (listing.status === "published" || listing.status === "approved") {
      return NextResponse.json(
        { error: "Lokal je že objavljen" },
        { status: 400 }
      );
    }

    // Preveri popolnost profila
    const { canSubmit, missingRequired } = canSubmitForReview(listing);
    if (!canSubmit) {
      return NextResponse.json(
        {
          error: "Profil ni dovolj popoln za oddajo",
          missingRequired: missingRequired.map((f) => f.label),
        },
        { status: 400 }
      );
    }

    // Oddaj v pregled
    await db.listing.update({
      where: { id: listingId },
      data: {
        status: "pending",
        submittedAt: new Date(),
        rejectionReason: null, // počisti prejšnji razlog
      },
    });

    console.log(`[owner/submit] ${listing.name} → pending`);

    return NextResponse.json({
      success: true,
      message: "Lokal oddan v pregled. Admin ga bo pregledal v 24-48 urah.",
    });
  } catch (error) {
    console.error("[owner/submit] napaka:", error);
    return NextResponse.json({ error: "Napaka pri oddaji" }, { status: 500 });
  }
}
