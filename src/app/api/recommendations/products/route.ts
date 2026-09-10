import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRecommendedIds } from "@/lib/ai-recommendations";

// GET /api/recommendations/products?productId=XXX&limit=4
// Vrne AI-priporočene podobne izdelke.
// AI (GLM) izbere 4 najbolj smiselne iz 10 SQL kandidatov.
// Rezultati so cachirani 24 ur (data/ai-rec-cache.json).
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || String(4), 10) || 4, 1),
      12
    );

    if (!productId) {
      return NextResponse.json(
        { error: "Manjka parameter productId" },
        { status: 400 }
      );
    }

    // P3c-8: tudi referenčni izdelek mora biti objavljen — pending/rejected
    // vrnejo enoten 404 (enaka javna vrata kot /api/products).
    const current = await db.product.findUnique({
      where: { id: productId },
      select: { id: true, status: true },
    });

    if (!current || current.status !== "published") {
      return NextResponse.json(
        { error: "Izdelek ni najden" },
        { status: 404 }
      );
    }

    // === AI PRIPOROČILA (z 24h cache) ===
    const { itemIds, source } = await getRecommendedIds("product", productId);

    if (itemIds.length === 0) {
      return NextResponse.json({ products: [], total: 0, source });
    }

    // Pridobi full podatke za AI-izbrane IDs (v vrstnem redu priporočila)
    // P3c-8: kandidati v getRecommendedIds so že filtrirani na published —
    // a cache (24h) lahko zastara (item je medtem umaknjen iz javnosti),
    // zato obrambno filtriramo TUDI tukaj.
    const rows = await db.product.findMany({
      where: { id: { in: itemIds }, status: "published" },
    });

    // Ohrani vrstni red AI priporočila
    const ordered = itemIds
      .map((id) => rows.find((r) => r.id === id))
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .slice(0, limit);

    const products = ordered.map((p) => ({
      ...p,
      images: JSON.parse(p.images || "[]") as string[],
    }));

    return NextResponse.json({ products, total: products.length, source });
  } catch (error) {
    console.error("[recommendations/products] GET napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri priporočilih izdelkov" },
      { status: 500 }
    );
  }
}
