import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/listings/[slug]/track — track impression/click/ai_recommendation/lead
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = await request.json();
    const { type, source } = body; // type: impression | click | ai_recommendation | lead

    if (!type || !["impression", "click", "ai_recommendation", "lead"].includes(type)) {
      return NextResponse.json({ error: "Neveljaven tip eventa" }, { status: 400 });
    }

    const listing = await db.listing.findUnique({ where: { slug }, select: { id: true } });
    if (!listing) {
      return NextResponse.json({ error: "Lokal ni najden" }, { status: 404 });
    }

    // Ustvari event
    await db.listingEvent.create({
      data: {
        listingId: listing.id,
        type,
        source: source || null,
      },
    });

    // Posodobi števce na listing-u (za hitre poizvedbe)
    if (type === "impression") {
      await db.listing.update({ where: { id: listing.id }, data: { viewCount: { increment: 1 } } });
    } else if (type === "click") {
      await db.listing.update({ where: { id: listing.id }, data: { clickCount: { increment: 1 } } });
    } else if (type === "ai_recommendation") {
      await db.listing.update({ where: { id: listing.id }, data: { aiRecommendations: { increment: 1 } } });
    } else if (type === "lead") {
      await db.listing.update({ where: { id: listing.id }, data: { leadCount: { increment: 1 } } });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[track] napaka:", error);
    return NextResponse.json({ error: "Napaka pri tracking" }, { status: 500 });
  }
}
