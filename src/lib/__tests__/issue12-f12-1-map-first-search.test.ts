// ============================================================================
// ISSUE #12 (F12-1, 1.118.0) — MAP-FIRST DISCOVERY: vedno-aktiven zemljevid
// ----------------------------------------------------------------------------
// Jedro faze 1 (issue §2 + §12 + guardrail matrika):
//  1. SOURCE-CONTRACT — Pokaži/Skrij POI gumb ODSTRANJEN (showPois/togglePois/
//     EyeOff izginili iz map-view); supply poizvedba IZVEDENA iz konteksta
//     (enabled: supplyActive = searchResults ‖ catsTouched); glavno iskanje
//     („Kaj iščeš?“) živi NAD zemljevidom; fly-to + zlati poudarni marker;
//     loading/zoom/error badgeji le ob kontekstu; loadingPois literal ostaja
//     (kompatibilen s task8-f3b pinom).
//  2. SOURCE-CONTRACT (ruta) — /api/smart-search selekta lat/lng/slug
//     (Listing/Experience) in dopolni zadetke (additive, nazaj kompatibilno).
//  3. SOURCE-CONTRACT (analytics) — map_search_submitted +
//     map_search_result_selected na OBEH whitelistah.
//  4. FUNKCIONALNO — POST /api/smart-search (dbReachable varovalka, vzorec
//     task31/33): geo zadetki nosijo lat/lng/slug iz DB; destinacije VEDNO
//     nosijo koordinate (statični dataset); izdelki ostanejo brez geo
//     (iskreno — Product nima geo stolpcev).
// ============================================================================
import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "@/lib/db";
import { DESTINATIONS } from "@/lib/slovenia-data";
// TASK 76 higiena: funkcionalni blok dinamično uvaža route handler prek
// @/app/api (žetoni deljenega omejevalnika runnerja) → okno OBVEZNO
// počistimo (konvencija suite-a, glej task76-suite-hygiene.test.ts).
import { clearProviderRateLimits } from "@/lib/supply/search";

const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const mapViewSrc = read("src/components/sections/map-view.tsx");
const smartSearchRouteSrc = read("src/app/api/smart-search/route.ts");
const plannerAnalyticsSrc = read("src/lib/planner-analytics.ts");
const analyticsRouteSrc = read("src/app/api/analytics/event/route.ts");
const useSupplyQuerySrc = read("src/lib/supply/use-supply-query.ts");

// ─────────────────────────────────────────────────────────────────────────
// 1. SOURCE-CONTRACT — map-view (gumb odstranjen, kontekst izveden)
// ─────────────────────────────────────────────────────────────────────────

describe("ISSUE #12 F12-1: Pokaži/Skrij POI gumb ODSTRANJEN (mentalni model)", () => {
  test("showPois state + togglePois + EyeOff ikona so IZGINILI iz map-view", () => {
    // Nobena od teh konstrukcij ne sme več obstajati (ne samo skriti gumb):
    expect(mapViewSrc).not.toContain("const [showPois, setShowPois]");
    expect(mapViewSrc).not.toContain("togglePois");
    expect(mapViewSrc).not.toContain("aria-pressed={showPois}");
    expect(mapViewSrc).not.toContain("EyeOff");
    // T niza sta odstranjena (ne samo neuporabljena — izbrisana):
    expect(mapViewSrc).not.toContain('showPois: { sl: "Pokaži POI"');
    expect(mapViewSrc).not.toContain('hidePois: { sl: "Skrij POI"');
  });

  test("supply poizvedba je IZVEDENA iz konteksta: enabled: supplyActive", () => {
    expect(mapViewSrc).toContain("enabled: supplyActive");
    expect(mapViewSrc).toContain(
      "const supplyActive = searchResults !== null || catsTouched;"
    );
    // Kontekst se postavi ob kliku čipa (filter) in ob uspehu iskanja:
    expect(mapViewSrc).toContain("setCatsTouched(true);");
  });

  test("glavno iskanje živi NAD zemljevidom (placeholder + debounce + fly-to)", () => {
    expect(mapViewSrc).toContain("searchPlaceholder");
    expect(mapViewSrc).toContain('"/api/smart-search"');
    expect(mapViewSrc).toContain("}, 600);"); // debounce (isti ritem kot SmartSearch)
    expect(mapViewSrc).toContain("map.flyTo([lat, lng], zoom ?? 13");
    // Zlati poudarni marker — ISTI kanon kot deep-link highlight:
    expect(mapViewSrc).toContain("zIndexOffset: 1000");
    expect(mapViewSrc).toContain('className: "map-search-highlight"');
  });

  test("kategorije iskanja → kanonski čipi (ISKRENA preslikava, samo enakovredne)", () => {
    expect(mapViewSrc).toContain("SEARCH_CATEGORY_TO_TYPE");
    // Semantično enakovredne preslikave:
    expect(mapViewSrc).toContain('hotel: "accommodation"');
    expect(mapViewSrc).toContain('restaurant: "restaurant"');
    expect(mapViewSrc).toContain('tour: "tour"');
    // NEENAKOVREDNE kategorije se NE preslikajo (wellness/workshop/tasting
    // nimajo čipa — iskanje NE aktivira izmišljenih kategorij):
    expect(mapViewSrc).not.toContain("wellness:");
    expect(mapViewSrc).not.toContain("workshop:");
    expect(mapViewSrc).not.toContain("tasting:");
  });

  test("badgeji so vezani na kontekst (loading/zoom/error) — ne na gumb", () => {
    expect(mapViewSrc).toContain("supply.loading && supplyActive");
    expect(mapViewSrc).toContain(
      "const zoomTooLow = supplyActive && Math.floor(viewport.zoom) < SUPPLY_MIN_ZOOM;"
    );
    expect(mapViewSrc).toContain("supply.error && supplyActive");
  });

  test("loadingPois literal OSTAJA (pin task8-f3b — kompatibilnost suite-a)", () => {
    expect(mapViewSrc).toContain('loadingPois: { sl: "Nalagam POI-je…"');
  });

  test("zoom-gating ostaja NEDOTAKNJEN (samozaščita gostote — z ≥ 10)", () => {
    // Hook pogodba nespremenjena: enabled je nadzorovalna vrata, z≥10 + cats
    // zahteve ostajajo (pan-storm varnost issue #12 §11):
    expect(useSupplyQuerySrc).toContain("enabled &&");
    expect(useSupplyQuerySrc).toContain("SUPPLY_MIN_ZOOM");
  });

  test("reset → IZHOD iz konteksta (svež obisk brez supply poizvedb)", () => {
    expect(mapViewSrc).toContain("setCatsTouched(false);");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. SOURCE-CONTRACT — /api/smart-search geo razširitev
// ─────────────────────────────────────────────────────────────────────────

describe("ISSUE #12 F12-1: smart-search geo razširitev (additive)", () => {
  test("select vključuje lat/lng (Listing + Experience) in slug (vsi trije)", () => {
    expect(smartSearchRouteSrc).toContain("slug: true, lat: true, lng: true,");
    // Dve poizvedbi z geo (listing + experience), product samo slug:
    const geoSelects = smartSearchRouteSrc.match(/slug: true, lat: true, lng: true,/g);
    expect(geoSelects?.length).toBe(2);
  });

  test("dopolnitev zadetkov: id → geo/slug mape + izpeljava na ruti (ne v iskalniku)", () => {
    expect(smartSearchRouteSrc).toContain("destGeoById");
    expect(smartSearchRouteSrc).toContain("listingById");
    expect(smartSearchRouteSrc).toContain("experienceById");
    // Iskalni moduli ostanejo čisti (dopolnitev je odgovornost rute):
    expect(smartSearchRouteSrc).toContain(
      "Iskalni moduli ostanejo ČISTI"
    );
  });

  test("destinacije VEDNO nosijo koordinate (statični dataset — fly-to)", () => {
    expect(smartSearchRouteSrc).toContain("lat: geo?.lat ?? 0");
    expect(smartSearchRouteSrc).toContain("lng: geo?.lng ?? 0");
  });

  test("izdelki ostanejo BREZ geo (iskreno — Product nima geo stolpcev)", () => {
    const productsMap = smartSearchRouteSrc.match(
      /products: results\.products\.map\(\(item\) => \(\{[^}]*\}\)\)/
    );
    expect(productsMap).toBeTruthy();
    expect(productsMap![0]).not.toContain("lat:");
    expect(productsMap![0]).toContain("slug: productById.get(item.id)?.slug ?? null");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. SOURCE-CONTRACT — analytics whitelist (klient + strežnik)
// ─────────────────────────────────────────────────────────────────────────

describe("ISSUE #12 F12-1: analytics dogodki na OBEH whitelistah", () => {
  test("map_search_submitted + map_search_result_selected (klient)", () => {
    expect(plannerAnalyticsSrc).toContain('"map_search_submitted"');
    expect(plannerAnalyticsSrc).toContain('"map_search_result_selected"');
  });

  test("map_search_submitted + map_search_result_selected (strežnik)", () => {
    expect(analyticsRouteSrc).toContain('"map_search_submitted"');
    expect(analyticsRouteSrc).toContain('"map_search_result_selected"');
  });

  test("map-view dejansko izstreli oba dogodka", () => {
    expect(mapViewSrc).toContain('trackPlannerEvent("map_search_submitted"');
    expect(mapViewSrc).toContain('trackPlannerEvent("map_search_result_selected"');
  });

  test("PII disciplina: telemetrija NE nosi besedila poizvedbe (samo query_len)", () => {
    const submittedCall = mapViewSrc.match(
      /trackPlannerEvent\("map_search_submitted", \{[^}]*\}/
    );
    expect(submittedCall).toBeTruthy();
    expect(submittedCall![0]).toContain("query_len");
    expect(submittedCall![0]).not.toContain("query:");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. FUNKCIONALNO — geo zadetki iz PRAVE baze (dbReachable varovalka)
// ─────────────────────────────────────────────────────────────────────────

let dbReachable = false;

beforeAll(async () => {
  try {
    await db.savedItinerary.count();
    dbReachable = true;
  } catch {
    dbReachable = false;
  }
});

// TASK 76: počisti okno deljenega omejevalnika pred vsakim testom
beforeEach(() => {
  clearProviderRateLimits();
});

describe("ISSUE #12 F12-1: funkcionalno — POST /api/smart-search z geo", () => {
  test("destinacijski zadetki nosijo lat/lng ≡ slovenia-data (fly-to vir)", async () => {
    if (!dbReachable) {
      console.log("[issue12-f12-1] DB ni dosegljiva — preskakujem (vzorec task33)");
      return;
    }
    clearProviderRateLimits();
    const { POST } = await import("@/app/api/smart-search/route");
    // Iskanje po znani kanonski destinaciji (Bled) — unikatna beseda,
    // ki ne kolidira z drugimi vrsticami:
    const req = new Request("http://localhost/api/smart-search", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-real-ip": "10.12.20.1",
      },
      body: JSON.stringify({ query: "Bled", limit: 3 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      destinations: Array<{ id: string; lat: number; lng: number; slug: string }>;
      listings: Array<{ id: string; lat?: number | null; slug?: string | null }>;
      experiences: Array<{ id: string; lat?: number | null; slug?: string | null }>;
      products: Array<{ id: string; slug?: string | null; lat?: unknown }>;
      source: string;
    };
    expect(data.source).toBe("deterministic");
    expect(data.destinations.length).toBeGreaterThan(0);

    // Destinacijski zadetki: koordinate ≡ kanonski dataset (NEODVISNO).
    const bled = data.destinations.find((d) => d.id === "bled");
    expect(bled).toBeDefined();
    const canonical = DESTINATIONS.find((d) => d.id === "bled");
    expect(bled!.lat).toBe(canonical!.coords.lat);
    expect(bled!.lng).toBe(canonical!.coords.lng);
    expect(bled!.slug).toBe(canonical!.slug);

    // Nazaj kompatibilna oblika: vrstični zadetki imajo OPCIJSKA polja
    // (izdelki brez geo — Product nima stolpcev; iskreno null/undefined):
    for (const p of data.products) {
      expect(p.lat === undefined || p.lat === null).toBe(true);
    }
    // Listing/Experience: polje je število ali null (nikoli niz):
    for (const l of [...data.listings, ...data.experiences]) {
      expect(
        l.lat === null || l.lat === undefined || typeof l.lat === "number"
      ).toBe(true);
    }
  });
});
