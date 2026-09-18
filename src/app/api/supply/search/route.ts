import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { parseSupplyQuery, searchSupply } from "@/lib/supply/search";

// GET /api/supply/search — TRAVEL SUPPLY MAP (F1 fundacija, 1.49.0)
//
// Viewport poizvedba: NE nalagamo celotne Slovenije — odjemalec pošlje
// bbox trenutnega pogleda + zoom + izbrane kategorije (+ datum/potnike
// za bodoče komercialne adapterje). Glej src/lib/supply/*.
//
// Query parametri:
//  - bbox: "south,west,north,east" (viewport; obvezen za sloj)
//  - zoom: 3–19 (gating gostote — zoom.ts)
//  - cats: csv kanonskih tipov (prazno = privzeti vidni za zoom)
//  - date: ISO YYYY-MM-DD (opcijsko; OSM ga iskreno ignorira)
//  - pax:  1–20
//  - locale: sl|en
//
// Odgovor: SupplySearchResponse { products, counts, adapters, degraded,
// duplicates, query, generatedAt } — stanje vsakega adapterja je vidno
// (zoom-gated / ok / napaka), OSM lokalna plast je vedno rezerva.
//
// Rate limit 30/min/IP (profil /api/pois — živi Overpass klici na serveru).

export async function GET(request: Request) {
  const limited = rateLimit(request, {
    limit: 30,
    windowMs: 60_000,
    key: "supply-search",
  });
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const parsed = parseSupplyQuery({
    bbox: searchParams.get("bbox"),
    zoom: searchParams.get("zoom"),
    cats: searchParams.get("cats"),
    date: searchParams.get("date"),
    pax: searchParams.get("pax"),
    locale: searchParams.get("locale"),
  });
  if (!parsed.ok) {
    return NextResponse.json(
      { error: `invalid-${parsed.error}` },
      { status: 400 }
    );
  }

  const started = Date.now();
  const response = await searchSupply(parsed.query);
  const ms = Date.now() - started;

  // Telemetrija (strežniška, agregatno — brez PII; vzorec
  // planner_plan_check_reported). Napaka zapisa NIKOLI ne blokira odgovora.
  try {
    const { db } = await import("@/lib/db");
    await db.analyticsEvent.create({
      data: {
        type: "supply_query",
        sessionId: "server",
        metadata: JSON.stringify({
          props: {
            zoom: response.query.zoom,
            cats: response.query.cats.length,
            products: response.products.length,
            degraded: response.degraded.length,
            cached: response.adapters.find((a) => a.slug === "osm")?.cached ? 1 : 0,
            ms,
          },
        }),
      },
    });
  } catch {
    // analitika je "nice to have"
  }

  return NextResponse.json(
    { ...response, ms },
    {
      headers: {
        // Kratek skupni TTL: viewporti se spreminjajo, a ponovljeni pani
        // z istim bbox+zoom zadenejo CDN cache (merce 1 min).
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    }
  );
}
