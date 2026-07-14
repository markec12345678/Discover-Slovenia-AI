import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRecommendedIds } from "@/lib/ai-recommendations";

// GET /api/recommendations/experiences?experienceId=XXX&limit=4
// Vrne AI-priporočene podobne izkušnje.
// AI (GLM) izbere 4 najbolj smiselne iz 10 SQL kandidatov.
// Rezultati so cachirani 24 ur (data/ai-rec-cache.json).
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const experienceId = searchParams.get("experienceId");
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || String(4), 10) || 4, 1),
      12
    );

    if (!experienceId) {
      return NextResponse.json(
        { error: "Manjka parameter experienceId" },
        { status: 400 }
      );
    }

    const current = await db.experience.findUnique({
      where: { id: experienceId },
      select: { id: true },
    });

    if (!current) {
      return NextResponse.json(
        { error: "Izkušnja ni najdena" },
        { status: 404 }
      );
    }

    // === AI PRIPOROČILA (z 24h cache) ===
    const { itemIds, source } = await getRecommendedIds("experience", experienceId);

    if (itemIds.length === 0) {
      return NextResponse.json({ experiences: [], total: 0, source });
    }

    // Pridobi full podatke za AI-izbrane IDs (v vrstnem redu priporočila)
    const rows = await db.experience.findMany({
      where: { id: { in: itemIds } },
    });

    // Ohrani vrstni red AI priporočila
    const ordered = itemIds
      .map((id) => rows.find((r) => r.id === id))
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .slice(0, limit);

    const experiences = ordered.map((e) => ({
      ...e,
      images: JSON.parse(e.images || "[]") as string[],
      languages: JSON.parse(e.languages || "[]") as string[],
    }));

    return NextResponse.json({ experiences, total: experiences.length, source });
  } catch (error) {
    console.error("[recommendations/experiences] GET napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri priporočilih izkušenj" },
      { status: 500 }
    );
  }
}
