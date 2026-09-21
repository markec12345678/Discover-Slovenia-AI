// ============================================================================
// TASK 43 — KIWITAXI ADAPTER + VERIGA TESTI
// ============================================================================
// Pokrivajo naročnikove zahteve: §9 (viewport/zoom gating — sloj SAMO ob
// izrecnem vklopu), §6/§7 (cena per_transfer, fromPrice, availability
// not_supported), §8 (/go product deep-link), §11 (dedupe izolacija virov),
// §13/§14 (Add to my plan → FIXED transfer → AI kontekst), §15 (fail-safe:
// dataset manjka/pokvarjen, OSM plast OSTANE).
// ============================================================================

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { createKiwiTaxiAdapter, kiwiRouteToProduct } from "@/lib/supply/providers/kiwitaxi/adapter";
import {
  disableKiwitaxiBaselineForTests,
  installKiwitaxiDataset,
  kiwitaxiDatasetStats,
  resetKiwitaxiDataset,
} from "@/lib/supply/providers/kiwitaxi/dataset";
import { isKiwiTaxiDataset, filterValidRoutes } from "@/lib/supply/providers/kiwitaxi/validate";
import type { KiwiRoute, KiwiTaxiDataset } from "@/lib/supply/providers/kiwitaxi/types";
import { getProvider } from "@/lib/supply/registry";
import { searchSupply, clearProviderRateLimits } from "@/lib/supply/search";
import { dedupeProducts } from "@/lib/supply/dedupe";
import type { SupplyAdapter } from "@/lib/supply/adapter";
import type { ProviderProduct, SupplyQuery } from "@/lib/supply/types";
import { toSelectedProduct } from "@/lib/supply/selection";
import {
  buildSelectedProductsContext,
  sanitizeSelectedProviderProducts,
} from "@/lib/supply/sanitize";
import { insertProductStop } from "@/lib/supply/stop-insert";
import { getKiwitaxiUrl } from "@/lib/affiliate";
import type { Itinerary } from "@/lib/types";

// ---------------------------------------------------------------------------
// FIXTURES
// ---------------------------------------------------------------------------

const LJU_BBOX: [number, number, number, number] = [46.209, 14.433, 46.236, 14.485];
const BLED_BBOX: [number, number, number, number] = [46.33, 13.99, 46.38, 14.05];
const ZAGREB_BBOX: [number, number, number, number] = [45.75, 15.9, 45.85, 16.1];

function fixtureRoute(partial: Partial<KiwiRoute>): KiwiRoute {
  return {
    id: 410,
    fromId: 103,
    fromName: "Ljubljana Airport",
    toId: 109,
    toName: "Bled",
    fromLat: 46.2254,
    fromLng: 14.4623,
    fromBbox: LJU_BBOX,
    distanceKm: 35,
    durationMin: 30,
    weight: 3.1,
    minPriceEur: 77,
    cheapestTransferId: 1440,
    classes: [
      { transferId: 1440, name: "Economy", pax: 4, eur: 77 },
      { transferId: 1199, name: "Comfort", pax: 4, eur: 106 },
    ],
    urlPath: "/slovenia/ljubljana+airport-%3Ebled",
    fromType: "airport",
    toType: "city",
    ...partial,
  };
}

function fixtureDataset(routes: KiwiRoute[]): KiwiTaxiDataset {
  return {
    version: 1,
    fetchedAt: "2026-09-18T00:00:00Z",
    source: "KiwiTaxi Partner Data API (CSV)",
    paymentType: "partial",
    counts: {
      places: 2,
      routes: routes.length,
      transfers: routes.length * 2,
      pinnedRoutes: routes.filter((r) => r.fromLat != null).length,
    },
    places: [
      { id: 103, name: "Ljubljana Airport", type: "airport", iata: "LJU", lat: 46.2254, lng: 14.4623, bbox: LJU_BBOX },
      { id: 109, name: "Bled", type: "city", lat: 46.36, lng: 14.02, bbox: BLED_BBOX },
    ],
    routes,
  };
}

const VIEW_LJU: [number, number, number, number] = [46.1, 14.3, 46.35, 14.6];

let seq = 0;
/** Lažni OSM adapter (za izolacijo odpovedi). */
function fakeOsmAdapter(products: ProviderProduct[]): SupplyAdapter {
  const entry = getProvider("osm")!;
  return {
    entry,
    async search() {
      return products.map((p) => ({ ...p, id: `osm:fake-${seq++}` }));
    },
    lastRunCached: () => false,
  };
}

beforeEach(() => {
  resetKiwitaxiDataset();
  clearProviderRateLimits(); // TASK 76: runner omejevalnik (deljen module state)
});

afterEach(() => {
  resetKiwitaxiDataset();
  disableKiwitaxiBaselineForTests(false);
  clearProviderRateLimits();
});

// ---------------------------------------------------------------------------
// KANONSKA PRESLIKAVA (§5, §6, §7, §12)
// ---------------------------------------------------------------------------

describe("kiwitaxi kanonska preslikava (ruta → ProviderProduct)", () => {
  const route = fixtureRoute({});
  const product = kiwiRouteToProduct(route, "sl", "2026-09-18T00:00:00Z");

  test("identiteta: provider/providerProductId/id (kanonski tip transfer)", () => {
    expect(product.provider).toBe("kiwitaxi");
    expect(product.providerProductId).toBe("410");
    expect(product.id).toBe("kiwitaxi:410");
    expect(product.type).toBe("transfer");
    expect(product.title).toBe("Ljubljana Airport → Bled");
  });

  test("geo: pin prevzemnega območja + geoPrecision city (NI exact, NI route centroid)", () => {
    expect(product.lat).toBeCloseTo(46.2254, 4);
    expect(product.lng).toBeCloseTo(14.4623, 4);
    expect(product.geoPrecision).toBe("city");
    expect(product.address).toBe("Ljubljana Airport");
  });

  test("cena: min med razredi, per_transfer, fromPrice, note „ni živi citat“", () => {
    expect(product.price).toBeDefined();
    expect(product.price!.amount).toBe(77);
    expect(product.price!.currency).toBe("EUR");
    expect(product.price!.unit).toBe("per_transfer");
    expect(product.price!.fromPrice).toBe(true);
    expect(product.price!.note).toContain("ni živi citat");
  });

  test("razpoložljivost: not_supported (CSV koncepta nima — cena NI dokaz)", () => {
    expect(product.availability).toBeDefined();
    expect(product.availability!.status).toBe("not_supported");
  });

  test("rezervacija: bookingUrl je NAŠA /go konstrukcija z numeričnim produktom", () => {
    expect(product.bookingMode).toBe("affiliate_redirect");
    expect(product.bookingUrl).toBe(
      "/go/transfers?product=1440&from=Ljubljana%20Airport&dest=Bled"
    );
  });

  test("vir: sourceUrl absoluten na kiwitaxi.com/en + licenca + lastUpdated", () => {
    expect(product.sourceUrl).toBe(
      "https://kiwitaxi.com/en/slovenia/ljubljana+airport-%3Ebled"
    );
    expect(product.license?.source).toContain("KiwiTaxi");
    expect(product.license?.attribution).toContain("© KiwiTaxi");
    expect(product.lastUpdated).toBe("2026-09-18T00:00:00Z");
  });

  test("iskrenost: BREZ slike in BREZ ocene (vir ju na ravni rute nima)", () => {
    expect(product.image).toBeUndefined();
    expect(product.imageCredit).toBeUndefined();
    expect(product.rating).toBeUndefined();
    expect(product.reviewCount).toBeUndefined();
  });

  test("opis SL: razdalja/trajanje/razredi iz DEJANSKIH podatkov vira", () => {
    expect(product.description).toContain("35 km");
    expect(product.description).toContain("30 min");
    expect(product.description).toContain("Economy");
    expect(product.description).toContain("€77");
    expect(product.description).toContain("celoten prevoz");
  });

  test("opis EN: isti podatki v angleščini", () => {
    const en = kiwiRouteToProduct(route, "en", "2026-09-18T00:00:00Z");
    expect(en.description).toContain("Private transfer");
    expect(en.description).toContain("35 km");
    expect(en.description).toContain("per transfer");
    expect(en.price!.note).toContain("not a live quote");
  });

  test("ruta brez pina: brez lat/lng (koordinat NE izmišljamo — §13)", () => {
    const noGeo = kiwiRouteToProduct(
      fixtureRoute({ fromLat: undefined, fromLng: undefined, fromBbox: undefined }),
      "sl",
      "2026-09-18T00:00:00Z"
    );
    expect(noGeo.lat).toBeUndefined();
    expect(noGeo.lng).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// ADAPTER — VIEWPORT FILTRIRANJE (§9)
// ---------------------------------------------------------------------------

describe("kiwitaxi adapter — viewport filtriranje", () => {
  function adapterWith(routes: KiwiRoute[]) {
    installKiwitaxiDataset(fixtureDataset(routes));
    return createKiwiTaxiAdapter(getProvider("kiwitaxi")!);
  }

  function query(
    bbox?: [number, number, number, number],
    locale: "sl" | "en" = "sl"
  ): SupplyQuery {
    return { bbox, zoom: 12, cats: ["transfer"], locale };
  }

  test("vrne SAMO rute, katerih prevzemno območje se preseka z bbox", async () => {
    const adapter = adapterWith([
      fixtureRoute({ id: 410, fromBbox: LJU_BBOX, fromLat: 46.2254, fromLng: 14.4623 }),
      fixtureRoute({
        id: 999,
        fromName: "Bled",
        fromBbox: BLED_BBOX,
        fromLat: 46.36,
        fromLng: 14.02,
        fromType: "city",
      }),
      fixtureRoute({
        id: 888,
        fromName: "Zagreb Airport",
        fromBbox: ZAGREB_BBOX,
        fromLat: 45.8,
        fromLng: 16.0,
      }),
    ]);
    const products = await adapter.search(query(VIEW_LJU));
    // Viewport Ljubljana: LJU pin DA; Bled (14.0) in Zagreb (16.0) sta MIMO
    expect(products.map((p) => p.providerProductId)).toEqual(["410"]);
  });

  test("(bbox na Bledu) vrne rute s prevzemom iz Bleda — obe smeri pokriti", async () => {
    const adapter = adapterWith([
      fixtureRoute({ id: 411, fromName: "Bled", fromBbox: BLED_BBOX, fromLat: 46.36, fromLng: 14.02, toName: "Ljubljana Airport", fromType: "city" }),
    ]);
    const view: [number, number, number, number] = [46.3, 13.95, 46.4, 14.1];
    const products = await adapter.search(query(view));
    expect(products).toHaveLength(1);
    expect(products[0].title).toBe("Bled → Ljubljana Airport");
  });

  test("brez bbox → prazno (ne moremo pošteno filtrirati)", async () => {
    const adapter = adapterWith([fixtureRoute({})]);
    const products = await adapter.search(query(undefined));
    expect(products).toHaveLength(0);
  });

  test("daleč stran → prazno", async () => {
    const adapter = adapterWith([fixtureRoute({})]);
    const far: [number, number, number, number] = [40.0, 10.0, 40.5, 10.5];
    expect(await adapter.search(query(far))).toHaveLength(0);
  });

  test("gostota: kapika na 48 rezultatov (utež prodaje desc)", async () => {
    const routes = Array.from({ length: 80 }, (_, i) =>
      fixtureRoute({ id: 1000 + i, weight: 80 - i })
    );
    const adapter = adapterWith(routes);
    const products = await adapter.search(query(VIEW_LJU));
    expect(products.length).toBe(48);
    // utež desc: prvi = najvišja utež (80 → id 1000)
    expect(products[0].providerProductId).toBe("1000");
  });

  test("brez nameščenega dataseta → PRAZNO (iskrena odsotnost, ne napaka)", async () => {
    disableKiwitaxiBaselineForTests(true);
    const adapter = createKiwiTaxiAdapter(getProvider("kiwitaxi")!);
    const products = await adapter.search(query(VIEW_LJU));
    expect(products).toHaveLength(0);
    expect(kiwitaxiDatasetStats().serving).toBe("missing");
  });

  test("installKiwitaxiDataset zavrne pokvarjen overlay (obrambna validacija)", () => {
    const malformed = { ...fixtureDataset([fixtureRoute({})]), version: 99 } as unknown as KiwiTaxiDataset;
    expect(installKiwitaxiDataset(malformed)).toBe(false);
    expect(kiwitaxiDatasetStats().serving).toBe("baseline"); // prejšnja ostane
  });

  test("filterValidRoutes: pokvarjene vrstice znotraj dataseta se izluščijo", () => {
    const good = fixtureRoute({});
    const bad = { ...good, minPriceEur: -5 } as unknown;
    const bad2 = { ...good, urlPath: "javascript:alert(1)" } as unknown;
    const bad3 = { ...good, fromLat: 999 } as unknown;
    const valid = filterValidRoutes([good, bad, bad2, bad3]);
    expect(valid).toHaveLength(1);
  });

  test("TASK 44 §4: slab zapis NA SREDINI dataseta NE uniči plasti (fail-safe)", async () => {
    // isKiwiTaxiDataset vzorči prvo+zadnjo ruto — slab ZGORNJI sredinski
    // zapis ne sme niti zavrniti dataseta niti podreti iskanja: bralna
    // plast (filterValidRoutes) ga izlušči POIZVEDBO za poizvedbo.
    const routes = [
      fixtureRoute({ id: 101 }),
      fixtureRoute({ id: 102 }),
      { ...fixtureRoute({ id: 103 }), fromLat: NaN, fromLng: NaN } as unknown as KiwiRoute, // slab sredinski
      fixtureRoute({ id: 104 }),
      fixtureRoute({ id: 105 }),
    ];
    installKiwitaxiDataset(fixtureDataset(routes));
    const adapter = createKiwiTaxiAdapter(getProvider("kiwitaxi")!);
    const res = await searchSupply(
      { zoom: 12, cats: ["transfer"], locale: "sl", bbox: VIEW_LJU },
      [adapter]
    );
    // 4 od 5 rut preživi; NaN sredinski zapis je tiho izločen, plast ŽIVI.
    expect(res.products.length).toBe(4);
    expect(res.degraded).toEqual([]);
    expect(res.products.every((p) => p.id !== "kiwitaxi:103")).toBe(true);
    resetKiwitaxiDataset();
  });

  test("isKiwiTaxiDataset: pravi baseline iz gita je veljaven", () => {
    const baseline = kiwitaxiDatasetStats();
    // Baseline je prisoten (git verzioniran) in strežen
    expect(baseline.serving).toBe("baseline");
    expect(baseline.routes).toBeGreaterThan(1000);
    expect(baseline.pinnedRoutes).toBeGreaterThan(1000);
  });
});

// ---------------------------------------------------------------------------
// RUNNER INTEGRACIJA — ZOOM GATING + KATEGORIJSKI GATING + IZOLACIJA (§9, §15)
// ---------------------------------------------------------------------------

describe("kiwitaxi skozi searchSupply runner", () => {
  function ktAdapter(routes: KiwiRoute[]): SupplyAdapter {
    installKiwitaxiDataset(fixtureDataset(routes));
    return createKiwiTaxiAdapter(getProvider("kiwitaxi")!);
  }

  test("§9: brez vklopljene kategorije transfer se adapter NE pokliče", async () => {
    let called = 0;
    const kt = ktAdapter([fixtureRoute({})]);
    const spy: SupplyAdapter = {
      ...kt,
      async search(q) {
        called++;
        return kt.search(q);
      },
    };
    const res = await searchSupply(
      { zoom: 12, cats: ["attraction", "museum"], locale: "sl", bbox: VIEW_LJU },
      [spy]
    );
    expect(called).toBe(0); // transfer NI med kategorijami → brez klica
    // TASK 44: izvedba je padla zaradi KATEGORIJ (zoom 12 ≥ minZoom 10) —
    // iskrena oznaka je cat-gated, ne zavajuči "zoom-gated".
    expect(res.adapters.find((a) => a.slug === "kiwitaxi")?.note).toBe("cat-gated");
  });

  test("§9: zoom < minZoom (10) → adapter NE kliče vira", async () => {
    let called = 0;
    const kt = ktAdapter([fixtureRoute({})]);
    const spy: SupplyAdapter = {
      ...kt,
      async search(q) {
        called++;
        return kt.search(q);
      },
    };
    const res = await searchSupply(
      { zoom: 9, cats: ["transfer"], locale: "sl", bbox: VIEW_LJU },
      [spy]
    );
    expect(called).toBe(0);
    expect(res.products).toHaveLength(0);
  });

  test("§9: vklopljen transfer + zoom ≥ 10 → adapter se pokliče in vrne produkte", async () => {
    const res = await searchSupply(
      { zoom: 12, cats: ["transfer"], locale: "sl", bbox: VIEW_LJU },
      [ktAdapter([fixtureRoute({})])]
    );
    expect(res.products).toHaveLength(1);
    expect(res.products[0].type).toBe("transfer");
    expect(res.counts.byProvider.kiwitaxi).toBe(1);
    expect(res.degraded).toHaveLength(0);
  });

  test("§15 fail-safe: kiwitaxi dataset manjka + OSM živ → lokalna plast OSTANE", async () => {
    disableKiwitaxiBaselineForTests(true);
    const osmProduct: ProviderProduct = {
      id: "osm:node-1",
      provider: "osm",
      providerProductId: "node-1",
      type: "attraction",
      title: "Blejski grad",
      bookingMode: "info_only",
      lastUpdated: "2026-09-18T00:00:00Z",
    };
    const res = await searchSupply(
      { zoom: 12, cats: ["transfer", "attraction"], locale: "sl", bbox: VIEW_LJU },
      [fakeOsmAdapter([osmProduct]), createKiwiTaxiAdapter(getProvider("kiwitaxi")!)]
    );
    // OSM plast živi, kiwitaxi je prazen (ni napaka vira — dataset odsoten)
    expect(res.products.map((p) => p.provider)).toEqual(["osm"]);
    expect(res.degraded).toHaveLength(0);
    const ktInfo = res.adapters.find((a) => a.slug === "kiwitaxi")!;
    expect(ktInfo.ok).toBe(true);
    expect(ktInfo.count).toBe(0);
  });

  test("§15: kiwitaxi adapter vrže izjimo → degraded, OSM nadaljuje (izolacija)", async () => {
    const entry = getProvider("kiwitaxi")!;
    const exploding: SupplyAdapter = {
      entry,
      async search() {
        throw new Error("boom");
      },
      lastRunCached: () => false,
    };
    const osmProduct: ProviderProduct = {
      id: "osm:node-1",
      provider: "osm",
      providerProductId: "node-1",
      type: "attraction",
      title: "Blejski grad",
      bookingMode: "info_only",
      lastUpdated: "2026-09-18T00:00:00Z",
    };
    const res = await searchSupply(
      { zoom: 12, cats: ["transfer", "attraction"], locale: "sl", bbox: VIEW_LJU },
      [fakeOsmAdapter([osmProduct]), exploding]
    );
    expect(res.products.map((p) => p.provider)).toEqual(["osm"]);
    expect(res.degraded).toContain("kiwitaxi");
  });

  test("§11 dedupe: komercialni vir se NIKOLI ne združuje z OSM (DO NOT MERGE)", () => {
    const ktProduct = kiwiRouteToProduct(fixtureRoute({}), "sl", "2026-09-18T00:00:00Z");
    const osmProduct: ProviderProduct = {
      id: "osm:node-77",
      provider: "osm",
      providerProductId: "node-77",
      type: "attraction",
      title: "Ljubljana Airport → Bled", // ISTO ime, ISTA lokacija!
      lat: 46.2254,
      lng: 14.4623,
      bookingMode: "info_only",
      lastUpdated: "2026-09-18T00:00:00Z",
    };
    const { products, duplicates } = dedupeProducts([ktProduct, osmProduct]);
    expect(products).toHaveLength(2); // DVA produkta — komercialna izolacija
    expect(duplicates).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ADD TO MY PLAN → FIXED TRANSFER → AI KONTEKST (§13, §14)
// ---------------------------------------------------------------------------

describe("kiwitaxi → izbira → AI FIXED transfer", () => {
  const route = fixtureRoute({});
  const product = kiwiRouteToProduct(route, "sl", "2026-09-18T00:00:00Z");

  test("§13: strukturiran FIXED item z geo/ceno/identity (kot v specih)", () => {
    const selected = toSelectedProduct(product);
    expect(selected).toEqual({
      provider: "kiwitaxi",
      providerProductId: "410",
      type: "transfer",
      title: "Ljubljana Airport → Bled",
      lat: 46.2254,
      lng: 14.4623,
      locationName: "Ljubljana Airport",
      price: {
        amount: 77,
        currency: "EUR",
        unit: "per_transfer",
        fromPrice: true,
        note: "objavljena cena, ni živi citat",
      },
      availability: { status: "not_supported" },
      source: "KiwiTaxi Partner Data API (CSV)",
      selectionState: "fixed",
    });
  });

  test("sanitizeSelectedProviderProducts: preživi mejo zaupanja (brez bookingUrl!)", () => {
    // Odjemalcu lahko pošlje tudi bookingUrl — meja ga MORA odstraniti.
    const withBookingUrl = {
      ...toSelectedProduct(product),
      bookingUrl: "/go/transfers?product=1440",
    };
    const clean = sanitizeSelectedProviderProducts([withBookingUrl]);
    expect(clean).toHaveLength(1);
    expect(clean[0].bookingUrl).toBeUndefined();
    expect(clean[0].selectionState).toBe("fixed");
    expect(clean[0].price!.unit).toBe("per_transfer");
    expect(clean[0].providerProductId).toBe("410");
  });

  test("§14 AI kontekst: transfer line + izrecna transportna semantika", () => {
    const selected = toSelectedProduct(product);
    const ctx = buildSelectedProductsContext([selected], "sl");
    expect(ctx).toContain("[FIXED] Ljubljana Airport → Bled");
    expect(ctx).toContain("provider: kiwitaxi");
    expect(ctx).toContain("id: 410");
    expect(ctx).toContain("type: transfer");
    expect(ctx).toContain("od 77 € (per transfer)");
    expect(ctx).toContain("transfer = TRANSPORTNA OMEJITEV");
    expect(ctx).toContain("NE dodajaj odvečnih");

    const ctxEn = buildSelectedProductsContext([selected], "en");
    expect(ctxEn).toContain("from €77 (per transfer)");
    expect(ctxEn).toContain("transfer = a TRANSPORT CONSTRAINT");
    expect(ctxEn).toContain("do NOT add redundant car rentals, bus transfers");
  });

  test("§14 vstavljanje v načrt: transfer postane postanek z lastnimi koordinatami", () => {
    const itinerary: Itinerary = {
      days: [
        {
          day: 1,
          locations: [
            {
              destination_id: "bled",
              destination_name: "Bled",
              time_slot: "09:00-11:00",
              duration: 2,
              estimated_cost: 0,
              notes: "",
            },
          ],
          weather: { condition: "sunny", temp: 20 },
        },
      ],
      total_budget: 500,
      recommendations: [],
      tips: [],
      source: "fallback",
    };
    const destCoords = new Map([
      ["bled", { lat: 46.378, lng: 14.114 }],
    ]);
    const result = insertProductStop(itinerary, product, {
      locale: "sl",
      destinationCoords: destCoords,
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.kind === "stop") {
      const stop = itinerary.days[0].locations.at(-1)!;
      // hmm — result.itinerary ima vstavljen postanek:
      const inserted = result.itinerary.days[0].locations.at(-1)!;
      expect(inserted.destination_id).toBe("kiwitaxi:410");
      expect(inserted.category).toBe("supply");
      expect(inserted.lat).toBeCloseTo(46.2254, 4);
      expect(inserted.lng).toBeCloseTo(14.4623, 4);
      expect(inserted.estimated_cost).toBe(77);
      expect(inserted.notes).toContain("od 77");
      expect(inserted.notes).toContain("per transfer");
      expect(inserted.notes).toContain("KiwiTaxi");
      void stop;
    } else {
      throw new Error("transfer ni bil vstavljen kot postanek");
    }
  });
});

// ---------------------------------------------------------------------------
// /GO DEEP-LINK VERIGA (§8)
// ---------------------------------------------------------------------------

describe("kiwitaxi /go product deep-link (affiliate fail-closed)", () => {
  test("produkt ID: numeričen → /en/transfers/{id}?pap brez pap: čist URL", () => {
    // Brez KIWITAXI_PAP_ID (fail-closed): čista partnerjeva stran BREZ pap
    delete process.env.KIWITAXI_PAP_ID;
    const noPap = getKiwitaxiUrl("Bled", "Ljubljana Airport", "1440");
    expect(noPap.url).toBe("https://kiwitaxi.com/en/transfers/1440");
    expect(noPap.monetized).toBe(false);

    process.env.KIWITAXI_PAP_ID = "test-pap-123";
    const withPap = getKiwitaxiUrl("Bled", "Ljubljana Airport", "1440");
    expect(withPap.url).toBe("https://kiwitaxi.com/en/transfers/1440?pap=test-pap-123");
    expect(withPap.monetized).toBe(true);
    delete process.env.KIWITAXI_PAP_ID;
  });

  test("produkt ID ima PREDNOST pred destinacijskimi oblikami", () => {
    process.env.KIWITAXI_PAP_ID = "test-pap-123";
    const url = getKiwitaxiUrl("Bled", "Ljubljana Airport", "1440");
    expect(url.url).toContain("/transfers/1440");
    expect(url.url).not.toContain("/search");
    expect(url.url).not.toContain("/slovenia/");
    delete process.env.KIWITAXI_PAP_ID;
  });

  test("NEVELJAVEN produkt ID (injekcijski poskusi) → pade na destinacijske oblike", () => {
    for (const bad of [
      "1440/evil",
      "javascript:alert(1)",
      "https://evil.com/transfers/1440",
      "1440?x=1",
      "1440#frag",
      "abc",
      "1440'--",
      "9".repeat(11),
    ]) {
      const result = getKiwitaxiUrl("Bled", undefined, bad);
      expect(result.url).not.toContain(bad);
      expect(result.url).toContain("kiwitaxi.com/en"); // vedno naš host
      expect(result.url).not.toContain("/transfers/"); // produkt IGNORIRAN
    }
    // PRAZEN produkt ID = kot da ga ni (destinacijska oblika)
    const empty = getKiwitaxiUrl("Bled", undefined, "");
    expect(empty.url).not.toContain("/transfers/");
  });

  test("brez produkta: obstoječe destinacijske oblike ostanejo nespremenjene", () => {
    delete process.env.KIWITAXI_PAP_ID;
    // znan from + to → iskalni deep-link
    const search = getKiwitaxiUrl("Bled", "Ljubljana");
    expect(search.url).toContain("/search?from=");
    // neznan → slovenska stran
    const fallback = getKiwitaxiUrl("Nepoznano mesto");
    expect(fallback.url).toBe("https://kiwitaxi.com/en/slovenia");
  });
});

// ---------------------------------------------------------------------------
// INGEST (brez omrežja — vbrizgani readFile)
// ---------------------------------------------------------------------------

describe("kiwitaxi ingest (lokalni viri, brez omrežja)", () => {
  const PLACE_TSV = [
    "id\tcountry_id\tregion_id\ttype_id\tname_en\tname_ru\tname_de\tname_fr\tname_es\tiata\tplace_polygon",
    "103\t3\t21\t2\tLjubljana Airport\t\t\t\t\tLJU\t" + "POLYGON((14.44 46.23,14.46 46.23,14.46 46.24,14.44 46.24,14.44 46.23))",
    "109\t3\t21\t1\tBled\t\t\t\t\t\t" + "POLYGON((13.99 46.33,14.05 46.33,14.05 46.38,13.99 46.38,13.99 46.33))",
  ].join("\n");

  const ROUTE_TSV = [
    "id\tcountry_id\tplace_from_id\tplace_to_id\tdistance\ttimeinway\tweight\turl",
    "410\t3\t103\t109\t35\t30\t3.1\t/slovenia/ljubljana+airport-%3Ebled",
  ].join("\n");

  const TYPES_TSV = [
    "id\tname_en\tname_ru\tpax\tbaggage\tdescription_en\tdescription_ru\tcar_examples_en\tcar_examples_ru\tphoto\tsortno\tphoto2",
    "1\tEconomy\t\t4\t3\t\t\t\t\t\t1\t",
  ].join("\n");

  const TRANSFERS_TSV = [
    "id\troute_id\ttype_id\tprice_rub\tprice_eur\tprice_usd\turl",
    "1440\t410\t1\t0\t77\t0\t/transfers/1440",
  ].join("\n");

  test("ingest iz vbrizganih datotek → veljaven dataset", async () => {
    const { ingestKiwiTaxi } = await import("@/lib/supply/providers/kiwitaxi/ingest");
    const files: Record<string, string> = {
      "/tmp/places.csv": PLACE_TSV,
      "/tmp/routes.csv": ROUTE_TSV,
      "/tmp/transfer_types.csv": TYPES_TSV,
      "/tmp/transfers.csv": TRANSFERS_TSV,
    };
    const result = await ingestKiwiTaxi({
      cacheDir: "/tmp",
      readFile: (p) => {
        if (!(p in files)) throw new Error(`missing: ${p}`);
        return Promise.resolve(files[p]);
      },
    });
    expect(result.ok).toBe(true);
    expect(result.dataset!.routes).toHaveLength(1);
    expect(result.dataset!.routes[0].fromName).toBe("Ljubljana Airport");
    expect(result.dataset!.routes[0].minPriceEur).toBe(77);
  });

  test("ingest odpoved (datoteka manjka) → ok:false, DELNIH baz ne nameščamo", async () => {
    const { ingestKiwiTaxi } = await import("@/lib/supply/providers/kiwitaxi/ingest");
    const result = await ingestKiwiTaxi({
      cacheDir: "/tmp",
      readFile: () => Promise.reject(new Error("eno-error")),
    });
    expect(result.ok).toBe(false);
    expect(result.dataset).toBeUndefined();
  });
});
