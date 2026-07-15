import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/auth-guards";
import { calculateQualityScore } from "@/lib/quality-score";

// GET /api/owner/quality-score?listingId=XXX
// Vrne Quality Score za lastnikov lokal z razčlenitvijo
export async function GET(request: Request) {
  try {
    const { error, ownerId } = await requireOwner();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const listingId = searchParams.get("listingId");

    if (!listingId) {
      // Če ni listingId, vrni vse lastnikove lokale z Quality Scores
      const listings = await db.listing.findMany({
        where: { ownerId },
        select: {
          id: true,
          name: true,
          partnerStatus: true,
          plan: true,
          status: true,
          rating: true,
          images: true,
          description: true,
          longDescription: true,
          specialties: true,
          verifiedByAdmin: true,
          updatedAt: true,
        },
      });

      const scored = listings.map((l) => {
        const qs = calculateQualityScore(l);
        return {
          id: l.id,
          name: l.name,
          partnerStatus: l.partnerStatus,
          plan: l.plan,
          status: l.status,
          rating: l.rating,
          qualityScore: qs.total,
          signals: qs.signals,
        };
      });

      scored.sort((a, b) => b.qualityScore - a.qualityScore);

      return NextResponse.json({ listings: scored });
    }

    // Posamezni lokal z polno razčlenitvijo
    const listing = await db.listing.findUnique({
      where: { id: listingId },
    });

    if (!listing || listing.ownerId !== ownerId) {
      return NextResponse.json({ error: "Lokal ni najden" }, { status: 404 });
    }

    const qs = calculateQualityScore(listing);

    return NextResponse.json({
      ...qs,
      partnerStatus: listing.partnerStatus,
      status: listing.status,
    });
  } catch (error) {
    console.error("[owner/quality-score] napaka:", error);
    return NextResponse.json({ error: "Napaka" }, { status: 500 });
  }
}
