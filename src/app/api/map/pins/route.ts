import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import {
  parseMapPinsQuery,
  queryMapPins,
  MAP_PINS_SOURCE,
} from "@/lib/map-pins";

// GET /api/map/pins — STATIČNI FSQ SLOJ ZEMLJEVIDA (1.95.1)
//
// Osnovni pogled "vsa mesta na Balkanu" (bencinske/restavracije/nastanitve/
// trgovine …) IZ POMNILNIŠKEGA FSQ INDEKSA — brez omrežja, brez živih
// poizvedb (~8 ms na celotno regijo). ZOOM-AWARE: z≤10 grid agregacija,
// z≥11 posamezni pini (kap 800). Glej src/lib/map-pins.ts.
//
// Query parametri:
//  - bbox: "south,west,north,east" (viewport; OBVEZEN, kap površine 400°²)
//  - zoom: 3–19 (določa grid/pins način)
//  - cats: csv kanonskih tipov (prazno = vse preslikane kategorije)
//
// Odgovor: { mode, cells|pins, total, returned, capped, dataset, source }
// — z atribucijo vira (Apache-2.0) za klienta.
//
// Rate limit 60/min/IP: debounced klient (400 ms) pošlje ~1 klic na gesto;
// 60/min pokrije agresivno raziskovanje zemljevida.

export async function GET(request: Request) {
  const limited = rateLimit(request, {
    limit: 60,
    windowMs: 60_000,
    key: "map-pins",
  });
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const parsed = parseMapPinsQuery({
    bbox: searchParams.get("bbox"),
    zoom: searchParams.get("zoom"),
    cats: searchParams.get("cats"),
  });
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const result = await queryMapPins(parsed.query);

  // Množica je statična (mtime osveževanje v dataset plasti) → kratek
  // skupni edge cache je pošten: isti viewport = isti odgovor. NE no-store
  // (to NI živa razpoložljivost — enaka odločitev kot fsq register 24 h;
  // tu konservativno 10 min + stale-while-revalidate 24 h).
  return NextResponse.json(
    { ...result, source: MAP_PINS_SOURCE },
    {
      status: 200,
      headers: {
        "Cache-Control":
          "public, s-maxage=600, stale-while-revalidate=86400",
      },
    }
  );
}
