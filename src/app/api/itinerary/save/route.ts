import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { randomId } from "@/lib/security";

// POST /api/itinerary/save — ANONIMNO shranjevanje itinererja (brez računa)
//
// Body:
//   { itinerary: Itinerary, formData?: unknown, name?: string }
//
// Vrne javni shareId in URL (/pot/{shareId}), ki ga uporabnik deli s prijatelji.
// Itinerer se shrani brez userId (anonimno) — v prihodnosti ga lahko povežemo
// z registriranim uporabnikom.
export async function POST(request: Request) {
  // Rate limit shranjevanj (preprečuje zlorabo DB prostora)
  const limited = rateLimit(request, {
    limit: 30,
    windowMs: 60 * 60_000,
    key: "itinerary-save",
  });
  if (limited) return limited;

  try {
    const body: unknown = await request.json();
    const b = (body ?? {}) as Record<string, unknown>;

    const itinerary = b.itinerary as unknown;

    // === Validacija itinererja ===
    if (
      typeof itinerary !== "object" ||
      itinerary === null ||
      !Array.isArray((itinerary as { days?: unknown }).days)
    ) {
      return NextResponse.json(
        { error: "Manjka ali neveljaven itinerer (days)" },
        { status: 400 }
      );
    }

    const days = (itinerary as { days: unknown[] }).days;
    if (days.length < 1 || days.length > 14) {
      return NextResponse.json(
        { error: "Itinerer mora imeti med 1 in 14 dni" },
        { status: 400 }
      );
    }

    // Vsak dan mora imeti locations array
    for (const day of days) {
      if (
        typeof day !== "object" ||
        day === null ||
        !Array.isArray((day as { locations?: unknown }).locations)
      ) {
        return NextResponse.json(
          { error: "Vsak dan itinererja mora vsebovati seznam lokacij" },
          { status: 400 }
        );
      }
    }

    // Omeji velikost shranjenega JSON (preprečuje zlorabo)
    const itineraryJson = JSON.stringify(itinerary);
    if (itineraryJson.length >= 200_000) {
      return NextResponse.json(
        { error: "Itinerer je prevelik" },
        { status: 400 }
      );
    }

    // Ime (opcijsko, skrajšano)
    const nameRaw = typeof b.name === "string" ? b.name.trim() : "";
    const name = nameRaw ? nameRaw.slice(0, 120) : null;

    // formData (opcijsno) — vhodni podatki načrtovalnika (PlannerInput)
    const formDataJson = JSON.stringify(b.formData ?? null);
    if (formDataJson.length >= 200_000) {
      return NextResponse.json(
        { error: "Podatki obrazca so preveliki" },
        { status: 400 }
      );
    }

    // Javni ID za deljenje (lowercase hex — URL-varen)
    const shareId = randomId(10).toLowerCase();

    const saved = await db.savedItinerary.create({
      data: {
        shareId,
        itinerary: itineraryJson,
        formData: formDataJson,
        name,
        // userId ostaja null — anonimno shranjevanje
      },
      select: { shareId: true, createdAt: true },
    });

    return NextResponse.json({
      success: true,
      shareId: saved.shareId,
      url: `/pot/${saved.shareId}`,
      createdAt: saved.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("[itinerary/save] POST napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri shranjevanju itinererja" },
      { status: 500 }
    );
  }
}
