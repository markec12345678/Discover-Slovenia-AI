import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/listings — vrne lokale z opcionalnimi filtri
// Query params: category, destinationId, plan, featured, limit, sort
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const destinationId = searchParams.get("destinationId");
    const plan = searchParams.get("plan");
    const featured = searchParams.get("featured");
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const sort = searchParams.get("sort") || "featured"; // featured | rating | newest

    // Zgradi where pogoj — samo PUBLISHED lokalci so javno vidni
    const where: Record<string, unknown> = {
      status: "published", // Rule: AI in uporabnik vidijo samo published
    };
    if (category && category !== "all") where.category = category;
    if (destinationId && destinationId !== "all") where.destinationId = destinationId;
    if (plan && plan !== "all") where.plan = plan;
    if (featured === "true") where.featured = true;

    // Sortiranje
    let orderBy: Record<string, string> = {};
    if (sort === "rating") {
      orderBy = { rating: "desc" };
    } else if (sort === "newest") {
      orderBy = { createdAt: "desc" };
    } else {
      // featured: featured first, then by rating
      // SQLite ne podpira kompleksnih orderBy, zato najprej featured
      orderBy = { featured: "desc" };
    }

    const listings = await db.listing.findMany({
      where,
      orderBy,
      take: Math.min(limit, 100),
    });

    // Razčleni JSON polja (images, specialties)
    const parsed = listings.map((l) => ({
      ...l,
      images: JSON.parse(l.images || "[]") as string[],
      specialties: l.specialties ? (JSON.parse(l.specialties) as string[]) : [],
    }));

    return NextResponse.json({
      listings: parsed,
      total: parsed.length,
    });
  } catch (error) {
    console.error("[listings] GET napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pridobivanju lokalov" },
      { status: 500 }
    );
  }
}
