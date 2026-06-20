import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/recommendations/products?productId=XXX&limit=4
// Vrne do `limit` podobnih izdelkov (ista kategorija ALI ista destinacija),
// izključi trenutni izdelek, sortira po rating in featured.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || "4", 10) || 4, 1),
      12
    );

    if (!productId) {
      return NextResponse.json(
        { error: "Manjka parameter productId" },
        { status: 400 }
      );
    }

    const current = await db.product.findUnique({
      where: { id: productId },
      select: { id: true, category: true, destinationId: true },
    });

    if (!current) {
      return NextResponse.json(
        { error: "Izdelek ni najden" },
        { status: 404 }
      );
    }

    // Poišči podobne: ista kategorija ALI ista destinacija, izključi trenutni.
    const orClauses: Record<string, unknown>[] = [];
    if (current.category) {
      orClauses.push({ category: current.category });
    }
    if (current.destinationId) {
      orClauses.push({ destinationId: current.destinationId });
    }

    const where: Record<string, unknown> = {
      id: { not: current.id },
    };
    if (orClauses.length > 0) {
      where.OR = orClauses;
    }

    const rows = await db.product.findMany({
      where,
      orderBy: [{ featured: "desc" }, { rating: "desc" }, { reviewCount: "desc" }],
      take: limit,
    });

    const products = rows.map((p) => ({
      ...p,
      images: JSON.parse(p.images || "[]") as string[],
    }));

    return NextResponse.json({ products, total: products.length });
  } catch (error) {
    console.error("[recommendations/products] GET napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri priporočilih izdelkov" },
      { status: 500 }
    );
  }
}
