import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toPublicExperience } from "@/lib/public-fields";

// GET /api/experiences/[slug] — vrne posamezno izkušnjo + poveča viewCount
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    // P3c-8: javna detaljna stran sme kazati SAMO objavljene zapise —
    // pending/rejected vrnejo enoten 404 (brez razkritja statusa).
    const experience = await db.experience.findUnique({
      where: { slug },
    });

    if (!experience || experience.status !== "published") {
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

    // FW1 (audit R3 🟠): sanitiziran javni odgovor — brez ownerId/
    // rejectionReason/submittedAt (glej public-fields.ts)
    const parsed = {
      ...toPublicExperience(experience),
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
