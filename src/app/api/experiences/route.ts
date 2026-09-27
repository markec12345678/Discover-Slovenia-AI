import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toPublicExperience } from "@/lib/public-fields";

// GET /api/experiences — vrne izkušnje z opcionalnimi filtri
// Query params: category, destinationId, plan, featured, limit, sort
// sort: featured (default) | price-asc | price-desc | rating | newest
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const destinationId = searchParams.get("destinationId");
    const plan = searchParams.get("plan");
    const featured = searchParams.get("featured");
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const sort = searchParams.get("sort") || "featured";

    // Zgradi where pogoj
    // P3c-8: javna tržnica sme kazati SAMO objavljene zapise (pending →
    // admin approve → published; moderacijska vrata držijo tudi tu).
    const where: Record<string, unknown> = { status: "published" };
    if (category && category !== "all") where.category = category;
    if (destinationId && destinationId !== "all")
      where.destinationId = destinationId;
    if (plan && plan !== "all") where.plan = plan;
    if (featured === "true") where.featured = true;

    // Sortiranje
    let orderBy: Record<string, string> = {};
    switch (sort) {
      case "price-asc":
        orderBy = { pricePerPerson: "asc" };
        break;
      case "price-desc":
        orderBy = { pricePerPerson: "desc" };
        break;
      case "rating":
        orderBy = { rating: "desc" };
        break;
      case "newest":
        orderBy = { createdAt: "desc" };
        break;
      default:
        orderBy = { featured: "desc" };
    }

    const experiences = await db.experience.findMany({
      where,
      orderBy,
      take: Math.min(Math.max(limit, 1), 100),
    });

    // FW1 (audit R3 🟠): sanitiziran javni odgovor — brez ownerId/
    // rejectionReason/submittedAt (glej public-fields.ts)
    const parsed = experiences.map((e) => ({
      ...toPublicExperience(e),
      images: JSON.parse(e.images || "[]") as string[],
      languages: JSON.parse(e.languages || "[]") as string[],
    }));

    // P0-2 (Issue #13 / G4 — UX BENCHMARK 2026): REALNI UGC agregat mnenj iz
    // Review tabel — iskreni social-proof signali na karticah kataloga
    // (enaka slovnica kot /api/products: demo ocena ostaja uredniška,
    // števci mnenj so SAMO realne vrstice; prazno → brez signala).
    const reviewAgg = parsed.length
      ? await db.review.groupBy({
          by: ["experienceId"],
          where: { experienceId: { in: parsed.map((e) => e.id) } },
          _count: { _all: true },
          _avg: { rating: true },
        })
      : [];
    const ugcById = new Map(
      reviewAgg.map((r) => [r.experienceId as string, r])
    );
    const withUgc = parsed.map((e) => {
      const agg = ugcById.get(e.id);
      const count = agg?._count._all ?? 0;
      return {
        ...e,
        ugcReviewCount: count,
        ugcRating:
          count > 0 && agg?._avg.rating != null
            ? Math.round(agg._avg.rating * 10) / 10
            : null,
      };
    });

    return NextResponse.json({
      experiences: withUgc,
      total: withUgc.length,
    });
  } catch (error) {
    console.error("[experiences] GET napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pridobivanju izkušenj" },
      { status: 500 }
    );
  }
}
