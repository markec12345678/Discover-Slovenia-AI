import { NextResponse } from "next/server";
import { db } from "@/lib/db";

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

    // Razčleni JSON polja (images, languages)
    const parsed = experiences.map((e) => ({
      ...e,
      images: JSON.parse(e.images || "[]") as string[],
      languages: JSON.parse(e.languages || "[]") as string[],
    }));

    return NextResponse.json({
      experiences: parsed,
      total: parsed.length,
    });
  } catch (error) {
    console.error("[experiences] GET napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pridobivanju izkušenj" },
      { status: 500 }
    );
  }
}
