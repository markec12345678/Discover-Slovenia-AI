import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/products/[slug] — vrne posamezni izdelek + poveča viewCount
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const product = await db.product.findUnique({
      where: { slug },
    });

    if (!product) {
      return NextResponse.json(
        { error: "Izdelek ni najden" },
        { status: 404 }
      );
    }

    // Povečaj števec ogledov (ne blokiraj)
    db.product
      .update({
        where: { id: product.id },
        data: { viewCount: { increment: 1 } },
      })
      .catch(() => {});

    const parsed = {
      ...product,
      images: JSON.parse(product.images || "[]") as string[],
    };

    return NextResponse.json({ product: parsed });
  } catch (error) {
    console.error("[products/slug] GET napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pridobivanju izdelka" },
      { status: 500 }
    );
  }
}
