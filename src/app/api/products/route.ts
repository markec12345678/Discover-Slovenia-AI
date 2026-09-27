import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toPublicProduct } from "@/lib/public-fields";

// GET /api/products — vrne izdelke (tržnica) z opcionalnimi filtri
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
    // admin approve → published; moderacijski vrata držijo tudi tu).
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
        orderBy = { price: "asc" };
        break;
      case "price-desc":
        orderBy = { price: "desc" };
        break;
      case "rating":
        orderBy = { rating: "desc" };
        break;
      case "newest":
        orderBy = { createdAt: "desc" };
        break;
      default:
        // featured: featured prvi, nato rating
        orderBy = { featured: "desc" };
    }

    const products = await db.product.findMany({
      where,
      orderBy,
      take: Math.min(Math.max(limit, 1), 100),
    });

    // Razčleni JSON polje images
    // FW1 (audit R3 🟠): sanitiziran javni odgovor — brez ownerId/
    // rejectionReason/submittedAt (glej public-fields.ts)
    const parsed = products.map((p) => ({
      ...toPublicProduct(p),
      images: JSON.parse(p.images || "[]") as string[],
    }));

    // P0-2 (Issue #13 / G4 — UX BENCHMARK 2026): REALNI UGC agregat mnenj iz
    // Review tabel — iskreni social-proof signali na karticah kataloga.
    // NAMERNO ločeno od demo rating/reviewCount stolpcev (CSV seed): demo
    // ocena ostaja uredniška (s kvalifikatorjem v UI), števci mnenj pa so
    // SAMO realne vrstice. Prazno agregat = 0 → kartica ne pokaže signala
    // (nikoli „0 mnenj“, nikoli izmišljenih števcev). Ena groupBy poizvedba
    // na zahtevo (limit ≤ 100) — ne ena po izdelku.
    const reviewAgg = parsed.length
      ? await db.review.groupBy({
          by: ["productId"],
          where: { productId: { in: parsed.map((p) => p.id) } },
          _count: { _all: true },
          _avg: { rating: true },
        })
      : [];
    const ugcById = new Map(
      reviewAgg.map((r) => [r.productId as string, r])
    );
    const withUgc = parsed.map((p) => {
      const agg = ugcById.get(p.id);
      const count = agg?._count._all ?? 0;
      return {
        ...p,
        ugcReviewCount: count,
        ugcRating:
          count > 0 && agg?._avg.rating != null
            ? Math.round(agg._avg.rating * 10) / 10
            : null,
      };
    });

    return NextResponse.json({
      products: withUgc,
      total: withUgc.length,
    });
  } catch (error) {
    console.error("[products] GET napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pridobivanju izdelkov" },
      { status: 500 }
    );
  }
}
