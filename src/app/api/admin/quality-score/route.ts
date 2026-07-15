import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAdmin } from "@/lib/auth-guards";
import { calculateQualityScore } from "@/lib/quality-score";

// GET /api/admin/quality-score — Quality Score za vse lokale (admin overview)
// Header: x-admin-password
// Query: ?sortBy=quality|rating|name (default: quality)
export async function GET(request: Request) {
  try {
    if (!checkAdmin(request.headers.get("x-admin-password"))) {
      return NextResponse.json({ error: "Neavtorizirano" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sortBy = searchParams.get("sortBy") || "quality";

    const listings = await db.listing.findMany({
      where: { status: { not: "deleted" } },
      select: {
        id: true,
        name: true,
        category: true,
        destinationName: true,
        plan: true,
        partnerStatus: true,
        featured: true,
        verifiedByAdmin: true,
        rating: true,
        images: true,
        description: true,
        longDescription: true,
        specialties: true,
        updatedAt: true,
      },
    });

    // Izračunaj Quality Score za vsak lokal
    const scored = listings.map((l) => {
      const qs = calculateQualityScore(l);
      return {
        id: l.id,
        name: l.name,
        category: l.category,
        destinationName: l.destinationName,
        plan: l.plan,
        partnerStatus: l.partnerStatus,
        featured: l.featured,
        verifiedByAdmin: l.verifiedByAdmin,
        rating: l.rating,
        qualityScore: qs.total,
        signals: qs.signals,
        details: qs.details,
      };
    });

    // Sort
    if (sortBy === "rating") {
      scored.sort((a, b) => b.rating - a.rating);
    } else if (sortBy === "name") {
      scored.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      scored.sort((a, b) => b.qualityScore - a.qualityScore);
    }

    // Povzetek
    const summary = {
      total: scored.length,
      avgQuality: Math.round(scored.reduce((s, l) => s + l.qualityScore, 0) / scored.length),
      topQuality: scored[0]?.qualityScore || 0,
      lowQuality: scored[scored.length - 1]?.qualityScore || 0,
      above90: scored.filter((l) => l.qualityScore >= 90).length,
      above70: scored.filter((l) => l.qualityScore >= 70).length,
      below50: scored.filter((l) => l.qualityScore < 50).length,
    };

    return NextResponse.json({
      listings: scored,
      summary,
    });
  } catch (error) {
    console.error("[admin/quality-score] napaka:", error);
    return NextResponse.json({ error: "Napaka" }, { status: 500 });
  }
}
