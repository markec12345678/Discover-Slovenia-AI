import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/experiences/[slug] — vrne posamezno izkušnjo + poveča viewCount
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const experience = await db.experience.findUnique({
      where: { slug },
    });

    if (!experience) {
      return NextResponse.json(
        { error: "Izkušnja ni najdena" },
        { status: 404 }
      );
    }

    // Povečaj števec ogledov (ne blokiraj)
    db.experience
      .update({
        where: { id: experience.id },
        data: { viewCount: { increment: 1 } },
      })
      .catch(() => {});

    const parsed = {
      ...experience,
      images: JSON.parse(experience.images || "[]") as string[],
      languages: JSON.parse(experience.languages || "[]") as string[],
    };

    return NextResponse.json({ experience: parsed });
  } catch (error) {
    console.error("[experiences/slug] GET napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pridobivanju izkušnje" },
      { status: 500 }
    );
  }
}
