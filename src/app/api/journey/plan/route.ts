import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { planJourney } from "@/lib/journey/orchestrator";
import type { JourneyIntent } from "@/lib/journey/types";
import { JOURNEY_CATEGORY_KEYS } from "@/lib/journey/types";

// POST /api/journey/plan — OSREDNJI ORKESTRATOR POTOVANJA (TASK 58).
//
// Telo: { origin, destination, startDate?, arrivalTime?, travelers?, categories?, lang? }
// Odgovor: { journey: TravelJourney } (kanonski produkti + zmožnosti
// rezervacije + skupna cena s semantiko + validacija čas/geo).
//
// ISKRENOST: vsi kanonski podatki so strežniški (KT dataset / OSM Overpass /
// lokalni EVENTS); 0 klientovih cen/IDjev/geo. Lokalne kategorije zahtevajo
// živi Overpass klic (obstoječa arhitektura runnerja, spoštovani timeouti).
export async function POST(request: Request) {
  // Orkestracija poganja žive OSM poizvedbe → zmerno omejimo.
  const limited = rateLimit(request, {
    limit: 20,
    windowMs: 60_000,
    key: "journey-plan",
  });
  if (limited) return limited;

  try {
    const body: unknown = await request.json();
    const b = (body ?? {}) as Record<string, unknown>;

    const origin = typeof b.origin === "string" ? b.origin.trim().slice(0, 120) : "";
    const destination =
      typeof b.destination === "string" ? b.destination.trim().slice(0, 120) : "";
    if (!destination) {
      return NextResponse.json({ error: "Manjka destinacija" }, { status: 400 });
    }

    const startDate =
      typeof b.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.startDate)
        ? b.startDate
        : undefined;
    const arrivalTime =
      typeof b.arrivalTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(b.arrivalTime)
        ? b.arrivalTime
        : undefined;
    const travelersRaw = Number(b.travelers);
    const travelers =
      Number.isInteger(travelersRaw) && travelersRaw >= 1 && travelersRaw <= 20
        ? travelersRaw
        : 2;
    const lang = b.lang === "en" ? "en" : "sl";
    const categories = Array.isArray(b.categories)
      ? (b.categories.filter(
          (c): c is (typeof JOURNEY_CATEGORY_KEYS)[number] =>
            typeof c === "string" &&
            (JOURNEY_CATEGORY_KEYS as readonly string[]).includes(c)
        ) as JourneyIntent["categories"])
      : undefined;

    const journey = await planJourney({
      origin: origin || destination,
      destination,
      ...(startDate ? { startDate } : {}),
      ...(arrivalTime ? { arrivalTime } : {}),
      travelers,
      ...(categories ? { categories } : {}),
      lang,
    });

    if ("error" in journey) {
      return NextResponse.json({ error: journey.error }, { status: 400 });
    }

    return NextResponse.json({ journey });
  } catch (error) {
    console.error("[journey/plan] POST napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri načrtovanju potovanja" },
      { status: 500 }
    );
  }
}
