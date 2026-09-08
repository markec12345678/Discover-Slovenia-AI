import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

// GET /api/itinerary/shared/[shareId] — javni ogled deljenega itinererja
//
// Poveča števec ogledov (views) in vrne itinerer BREZ formData
// (vhodni podatki načrtovalnika so zasebni).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  // Rate limit ogledov deljenih itinererjev
  const limited = rateLimit(request, {
    limit: 120,
    windowMs: 60 * 60_000,
    key: "itinerary-shared",
  });
  if (limited) return limited;

  try {
    const { shareId } = await params;

    if (!shareId || shareId.length > 32) {
      return NextResponse.json(
        { error: "Neveljaven ID itinererja" },
        { status: 400 }
      );
    }

    const saved = await db.savedItinerary.findUnique({
      where: { shareId },
      select: {
        name: true,
        itinerary: true,
        createdAt: true,
        views: true,
      },
    });

    if (!saved) {
      return NextResponse.json(
        { error: "Itinerer ne obstaja" },
        { status: 404 }
      );
    }

    // Inkrementiraj števec ogledov (ne-critical — napaka se tiho ignorira)
    try {
      await db.savedItinerary.update({
        where: { shareId },
        data: { views: { increment: 1 } },
      });
    } catch (e) {
      console.error("[itinerary/shared] views increment napaka:", e);
    }

    // Parse itinererja — neveljaven JSON ne sme sesuti celotnega odgovora
    let itinerary: unknown;
    try {
      itinerary = JSON.parse(saved.itinerary);
    } catch {
      return NextResponse.json(
        { error: "Shranjeni itinerer je pokvarjen" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      name: saved.name,
      itinerary,
      createdAt: saved.createdAt.toISOString(),
      views: saved.views + 1,
    });
  } catch (error) {
    console.error("[itinerary/shared] GET napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pridobivanju itinererja" },
      { status: 500 }
    );
  }
}
