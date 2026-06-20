import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/recommendations/experiences?experienceId=XXX&limit=4
// Vrne do `limit` podobnih izkušenj (ista kategorija ALI ista destinacija),
// izključi trenutno izkušnjo, sortira po rating in featured.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const experienceId = searchParams.get("experienceId");
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || "4", 10) || 4, 1),
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
      select: { id: true, category: true, destinationId: true },
    });

    if (!current) {
      return NextResponse.json(
        { error: "Izkušnja ni najdena" },
        { status: 404 }
      );
    }

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

    const rows = await db.experience.findMany({
      where,
      orderBy: [
        { featured: "desc" },
        { rating: "desc" },
        { reviewCount: "desc" },
      ],
      take: limit,
    });

    const experiences = rows.map((e) => ({
      ...e,
      images: JSON.parse(e.images || "[]") as string[],
      languages: JSON.parse(e.languages || "[]") as string[],
    }));

    return NextResponse.json({
      experiences,
      total: experiences.length,
    });
  } catch (error) {
    console.error("[recommendations/experiences] GET napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri priporočilih izkušenj" },
      { status: 500 }
    );
  }
}
