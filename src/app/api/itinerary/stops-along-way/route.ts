import { NextResponse } from "next/server";
import { DESTINATIONS } from "@/lib/slovenia-data";
import { DESTINATIONS_EN } from "@/lib/slovenia-data-en";
import { rateLimit } from "@/lib/rate-limit";
import { getRoadLeg } from "@/lib/road-routing-server";
import {
  DESTINATION_COORDS,
  heuristicLeg,
  round5,
} from "@/lib/road-routing";
// Koridor geometrija — izluščena v skupno lib (geo-corridor.ts), da jo deli
// z backlog #6 meal-stops (isti pas okrog odseka, identične formule)
import { pointToSegmentKm } from "@/lib/geo-corridor";
import type { RoutingMethod } from "@/lib/types";

// GET /api/itinerary/stops-along-way?from=bled&to=bohinj&exclude=…&lang=sl
//
// BACKLOG #5 (COMPETITIVE-ANALYSIS-MINDTRIP.md §22) — "Postanki na poti" z
// POŠTENIM detourjem: MEM road-trip članek — "suggestion needs the actual
// extra distance attached". Za vsak predlog izračunamo
//
//     detour = road(A→s) + road(s→B) − road(A→B)
//
// iz ISTE OSRM plasti kot značke ~km dni (F5.6 predpomnilnik + varovalka;
// ob napaki hevristika, razkrito v `source`). Nič izmišljenih številk.
//
// Kandidati: destinacije v pasu okrog odseka A→B (razdalja točke od odseka,
// ne samo od midpointa — Sprint 5 hevristika je spuščala postanke blizu
// krajišč), brez že uporabljenih (exclude = VSI postanki trenutnega načrta).
// Omejitev omrežja: največ 4 kandidati × 2 OSRM para (+1 direktna noga,
// ponavadi že v predpomnilniku od generiranja) — vljudno do javnega demo
// strežnika (sočasnost 4, timeout 2,5 s, varovalka 4 napake → 10 min).

/** Max razdalja (km) od odseka A→B, da kandidat šteje za "na poti". */
const CORRIDOR_KM = 30;
/** Max št. kandidatov, za katere izračunamo detour (vljudnost do OSRM). */
const MAX_CANDIDATES = 4;
/** Max predlogov v odgovoru. */
const MAX_SUGGESTIONS = 3;
/** Onkaj tega ovinka predlog ni več "postanek na poti", ampak drugo
 *  potovanje (Bled→Bohinj je ~5 km; Triglav od tam je +70 km ovinka). */
const MAX_DETOUR_KM = 50;

export async function GET(request: Request) {
  try {
    // Backlog #5: javni endpoint (expand klik) — enak vzorec varovanja kot
    // tts/ingest poti (60 s okno je za klikanje radodarno, a varovalka je).
    const limited = rateLimit(request, { limit: 20, windowMs: 60_000 });
    if (limited) return limited;

    const { searchParams } = new URL(request.url);
    const fromId = searchParams.get("from");
    const toId = searchParams.get("to");
    const lang = searchParams.get("lang") === "en" ? "en" : "sl";
    const excludeIds = new Set(
      (searchParams.get("exclude") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    );

    if (!fromId || !toId) {
      return NextResponse.json(
        { error: "Manjkata from in to parametra" },
        { status: 400 }
      );
    }

    const from = DESTINATIONS.find((d) => d.id === fromId);
    const to = DESTINATIONS.find((d) => d.id === toId);

    if (!from || !to) {
      return NextResponse.json(
        { error: "Destinaciji nista najdeni" },
        { status: 404 }
      );
    }

    // ------------------------------------------------------------------
    // 1) Koridor predfilter: destinacije znotraj pasu okrog odseka, brez
    //    krajišč in brez že načrtovanih postankov
    // ------------------------------------------------------------------
    const candidates = DESTINATIONS.filter(
      (d) =>
        d.id !== fromId &&
        d.id !== toId &&
        !excludeIds.has(d.id) &&
        pointToSegmentKm(d.coords, from.coords, to.coords) <= CORRIDOR_KM
    )
      .sort(
        (x, y) =>
          pointToSegmentKm(x.coords, from.coords, to.coords) -
          pointToSegmentKm(y.coords, from.coords, to.coords)
      )
      .slice(0, MAX_CANDIDATES);

    if (candidates.length === 0) {
      return NextResponse.json({
        from: { id: from.id, name: from.name },
        to: { id: to.id, name: to.name },
        stops: [],
        totalStops: 0,
        method: "osrm" as const,
      });
    }

    // ------------------------------------------------------------------
    // 2) POŠTEN detour: road(A→s) + road(s→B) − road(A→B) iz OSRM plasti
    //    (predpomnilnik → omrežje → hevristika; vir razkrit po paru)
    // ------------------------------------------------------------------
    const legOf = async (
      aId: string,
      bId: string
    ): Promise<{ km: number; min: number; source: "osrm" | "heuristic" }> => {
      const real = await getRoadLeg(aId, bId);
      if (real) return { km: real.km, min: real.min, source: "osrm" };
      const a = DESTINATION_COORDS.get(aId)!;
      const b = DESTINATION_COORDS.get(bId)!;
      const h = heuristicLeg(a, b);
      return { km: h.km, min: h.min, source: "heuristic" };
    };

    const direct = await legOf(fromId, toId);

    // Kandidati zaporedno (z vzporednim parom znotraj vsakega) — največ 2
    // sočasna OSRM klica na klik, vljudno do javnega demo strežnika.
    const stops: {
      id: string;
      name: string;
      tagline: string;
      image: string;
      category: (typeof DESTINATIONS)[number]["type"];
      region: (typeof DESTINATIONS)[number]["region"];
      detourKm: number;
      detourMin: number;
      source: "osrm" | "heuristic";
    }[] = [];
    for (const d of candidates) {
      const [toStop, fromStop] = await Promise.all([
        legOf(fromId, d.id),
        legOf(d.id, toId),
      ]);
      const detourKm = Math.max(0, round5(toStop.km + fromStop.km - direct.km));
      const detourMin = Math.max(
        0,
        round5(toStop.min + fromStop.min - direct.min)
      );
      const tagline =
        lang === "en"
          ? (DESTINATIONS_EN[d.id]?.tagline ?? d.tagline)
          : d.tagline;
      stops.push({
        id: d.id,
        name: d.name,
        tagline,
        image: d.image,
        category: d.type,
        region: d.region,
        detourKm,
        detourMin,
        source: (toStop.source === "osrm" && fromStop.source === "osrm"
          ? "osrm"
          : "heuristic") as "osrm" | "heuristic",
      });
    }

    // najmanjši ovinek naprej (voznikovo dejansko odločevalno merilo) in
    // zgolj smiselni ovinki (≤ MAX_DETOUR_KM) — številka ostaja poštena,
    // odločitev je voznikova
    stops.sort((a, b) => a.detourKm - b.detourKm);
    const sensible = stops.filter((s) => s.detourKm <= MAX_DETOUR_KM);
    const shown = sensible.slice(0, MAX_SUGGESTIONS);

    const sources = new Set(shown.map((s) => s.source));
    const method: RoutingMethod =
      shown.length === 0
        ? "osrm"
        : sources.size === 1 && sources.has("osrm")
          ? "osrm"
          : sources.size === 1
            ? "heuristic"
            : "mixed";

    return NextResponse.json({
      from: { id: from.id, name: from.name },
      to: { id: to.id, name: to.name },
      stops: shown,
      totalStops: sensible.length,
      method,
    });
  } catch (error) {
    console.error("[stops-along-way] napaka:", error);
    return NextResponse.json({ error: "Napaka" }, { status: 500 });
  }
}
