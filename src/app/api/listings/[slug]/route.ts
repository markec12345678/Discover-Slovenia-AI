import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/listings/[slug] — vrne posamezni lokal
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const listing = await db.listing.findUnique({
      where: { slug },
    });

    if (!listing) {
      return NextResponse.json(
        { error: "Lokal ni najden" },
        { status: 404 }
      );
    }

    // Povečaj števec ogledov (async, ne blokiraj)
    db.listing
      .update({
        where: { id: listing.id },
        data: { viewCount: { increment: 1 } },
      })
      .catch(() => {});

    const parsed = {
      ...listing,
      images: JSON.parse(listing.images || "[]") as string[],
      specialties: listing.specialties
        ? (JSON.parse(listing.specialties) as string[])
        : [],
    };

    return NextResponse.json({ listing: parsed });
  } catch (error) {
    console.error("[listings/slug] GET napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pridobivanju lokala" },
      { status: 500 }
    );
  }
}
