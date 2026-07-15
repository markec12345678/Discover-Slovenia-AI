import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/auth-guards";
import { calculateProfileCompletion } from "@/lib/profile-completion";

// GET /api/owner/profile-completion?listingId=XXX
// Vrne popolnost profita lokalca + manjkajoča polja
export async function GET(request: Request) {
  try {
    const { error, ownerId } = await requireOwner();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const listingId = searchParams.get("listingId");

    if (!listingId) {
      return NextResponse.json(
        { error: "Manjka listingId" },
        { status: 400 }
      );
    }

    const listing = await db.listing.findUnique({
      where: { id: listingId },
    });

    if (!listing || listing.ownerId !== ownerId) {
      return NextResponse.json(
        { error: "Lokal ni najden" },
        { status: 404 }
      );
    }

    const completion = calculateProfileCompletion(listing);

    return NextResponse.json({
      ...completion,
      status: listing.status,
      rejectionReason: listing.rejectionReason,
      canSubmit: listing.status === "draft" || listing.status === "rejected",
    });
  } catch (error) {
    console.error("[owner/profile-completion] napaka:", error);
    return NextResponse.json({ error: "Napaka" }, { status: 500 });
  }
}
