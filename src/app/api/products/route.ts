import { NextResponse } from "next/server";
import { db } from "@/lib/db";

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
    const where: Record<string, unknown> = {};
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
    const parsed = products.map((p) => ({
      ...p,
      images: JSON.parse(p.images || "[]") as string[],
    }));

    return NextResponse.json({
      products: parsed,
      total: parsed.length,
    });
  } catch (error) {
    console.error("[products] GET napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pridobivanju izdelkov" },
      { status: 500 }
    );
  }
}
