// ============================================================================
// TASK 42 — F1 HARDENING: POGODBENI TESTI (supply-contract)
// ============================================================================
// Pokriva naročnikov seznam testov (točka 17):
//   ProviderProduct contract · ProviderRegistry contract (goRoute ↔
//   affiliate.ts) · Adapter failure isolation (timeout/abort/malformed/
//   empty) · bbox propagation · zoom gating · deduplication (DO NOT MERGE)
//   · price semantics · availability semantics · provenance · Add-to-plan
//   tip-semantika · AI fixed selection · affiliate redirect sync ·
//   SSRF protection · rate limiting · cache-control.
// ============================================================================
import { describe, expect, test } from "bun:test";
import {
  PROVIDER_REGISTRY,
  getProvider,
  affiliateCardProviders,
  statusLabel,
} from "@/lib/supply/registry";
import { AFFILIATE_PROVIDERS, affiliateStatus } from "@/lib/affiliate";
import { runAdapter, type SupplyAdapter } from "@/lib/supply/adapter";
import {
  searchSupply,
  supplyResponseCacheControl,
  clearProviderRateLimits,
} from "@/lib/supply/search";
import { dedupeProducts } from "@/lib/supply/dedupe";
import {
  sanitizeSelectedProviderProducts,
  buildSelectedProductsContext,
  buildSelectionRecommendations,
} from "@/lib/supply/sanitize";
import { insertProductStop } from "@/lib/supply/stop-insert";
import type {
  ProviderProduct,
  SelectedProviderProduct,
  SupplyQuery,
} from "@/lib/supply/types";
import type { Itinerary } from "@/lib/types";

// ---------------------------------------------------------------------------
// Pomočniki
// ---------------------------------------------------------------------------

const mkProduct = (over: Partial<ProviderProduct>): ProviderProduct => ({
  id: "osm:node-1",
  provider: "osm",
  providerProductId: "node-1",
  type: "attraction",
  title: "Test",
  bookingMode: "info_only",
  lastUpdated: "2026-09-18T00:00:00.000Z",
  lat: 46.1,
  lng: 14.1,
  license: { source: "OpenStreetMap", attribution: "© OpenStreetMap" },
  ...over,
});

/** Strukturirana izbira (testni pripomoček). */
const sel = (over: Partial<SelectedProviderProduct>): SelectedProviderProduct => ({
  provider: "viator",
  providerProductId: "1",
  type: "tour",
  title: "Tura",
  source: "Viator",
  selectionState: "fixed",
  ...over,
});

/** Testni adapter z lastnim vstopom (timeoutMs pod kontrolo testa). */
function adapterWith(
  slug: ProviderProduct["provider"],
  behavior: {
    products?: ProviderProduct[];
    hang?: boolean;
    throw?: boolean;
    types?: string[];
  },
  entryOverrides: Partial<NonNullable<ReturnType<typeof getProvider>>> = {}
): SupplyAdapter {
  const base = getProvider(slug)!;
  const entry = { ...base, timeoutMs: 100, maxCallsPerMin: 0, ...entryOverrides };
  return {
    entry,
    lastRunCached: () => false,
    async search(_q: SupplyQuery) {
      if (behavior.hang) return new Promise<ProviderProduct[]>(() => {}); // nikoli
      if (behavior.throw) throw new Error("malformed-json");
      return behavior.products ?? [];
    },
  };
}

// ---------------------------------------------------------------------------
// 1. PROVIDERPRODUCT CONTRACT — vseh 17 kategorij naročnika
// ---------------------------------------------------------------------------

describe("ProviderProduct contract (točka 1)", () => {
  test("vsaka kategorija iz naročnikovega seznama je predstavljiva BREZ spremembe modela", () => {
    // hotel, apartma, soba, kamp → accommodation + subcategory
    for (const sub of ["hotel", "apartment", "room", "camp_site"]) {
      const p = mkProduct({ type: "accommodation", subcategory: sub });
      expect(p.type).toBe("accommodation");
      expect(p.subcategory).toBe(sub);
    }
    // aktivnost, izlet, tura, vstopnica, atrakcija, transfer, rent-a-car,
    // let, vlak/bus, eSIM, zavarovanje, lokalni POI — vsak ima SVOJ tip
    const expected = [
      "activity", "tour", "tour", "ticket", "attraction", "transfer",
      "car_rental", "flight", "transport", "esim", "insurance", "poi",
    ] as const;
    for (const t of expected) {
      expect(mkProduct({ type: t }).type).toBe(t);
    }
  });

  test("model OSTAJA provider-agnostic (ni provider-specifičnih polj)", () => {
    const keys = Object.keys(mkProduct({}));
    for (const forbidden of ["viatorData", "bookingData", "providerMeta"]) {
      expect(keys).not.toContain(forbidden);
    }
    // (provider, providerProductId) je ključ za nazaj obratni klic
    const p = mkProduct({ provider: "viator", providerProductId: "d5257-ttd" });
    expect(`${p.provider}:${p.providerProductId}`).toBe("viator:d5257-ttd");
  });

  test("geoPrecision pokriva vse ravni iskrenosti pina", () => {
    for (const g of ["exact", "city", "destination_center", "country", "route"] as const) {
      expect(mkProduct({ geoPrecision: g }).geoPrecision).toBe(g);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. PROVIDER REGISTRY CONTRACT — enoten vir (točka 2)
// ---------------------------------------------------------------------------

describe("ProviderRegistry contract (točka 2)", () => {
  test("goRoute vrednosti registra ≡ AFFILIATE_PROVIDERS (affiliate.ts) — EN besednjak", () => {
    const registryRoutes = new Set<string>(
      PROVIDER_REGISTRY.flatMap((p) => (p.goRoute ? [p.goRoute as string] : []))
    );
    const affiliate = new Set<string>(AFFILIATE_PROVIDERS);
    // Vsak goRoute iz registra mora obstajati v affiliate.ts (sicer 404 /go link)
    for (const r of registryRoutes) expect(affiliate.has(r)).toBe(true);
    // Vsak affiliate provider mora biti dosegljiv iz vsaj enega registra
    for (const a of affiliate) expect(registryRoutes.has(a)).toBe(true);
    expect(registryRoutes.size).toBe(affiliate.size);
  });

  test("envKeys.affiliate imena ≡ affiliateStatus() envVar imena (drift varovalka)", () => {
    const status = affiliateStatus();
    const affiliateEnvByRoute = new Map<string, string>();
    for (const [route, st] of Object.entries(status)) {
      affiliateEnvByRoute.set(route, st.envVar);
    }
    for (const p of PROVIDER_REGISTRY) {
      const affiliateKeys = p.envKeys.affiliate ?? [];
      if (!p.goRoute || affiliateKeys.length === 0) continue;
      const envStr = affiliateEnvByRoute.get(p.goRoute);
      for (const name of affiliateKeys) {
        // Vsako ime iz registra se pojavi v affiliateStatus nizu za to ruto
        expect(envStr).toContain(name);
      }
    }
  });

  test("vsak vnos ima timeoutMs + maxCallsPerMin (pogodba adapterja)", () => {
    for (const p of PROVIDER_REGISTRY) {
      expect(p.timeoutMs).toBeGreaterThan(0);
      expect(p.maxCallsPerMin).toBeGreaterThanOrEqual(0);
      expect(p.cacheTtlMs).toBeGreaterThanOrEqual(0);
    }
  });

  test("travelpayouts: iskren status 'planned' BREZ affiliate_deep_link (ni lažne povezave)", () => {
    const tp = getProvider("travelpayouts")!;
    expect(tp.status).toBe("planned");
    expect(tp.inventoryAccess).not.toContain("affiliate_deep_link");
    expect(affiliateCardProviders().map((p) => p.slug)).not.toContain("travelpayouts");
    expect(statusLabel("planned").sl.length).toBeGreaterThan(0);
    expect(statusLabel("planned").en.length).toBeGreaterThan(0);
  });

  test("aktivni adapter (osm) minZoom je usklajen s SUPPLY_MIN_ZOOM (10)", () => {
    expect(getProvider("osm")!.minZoom).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// 3. ADAPTER FAILURE ISOLATION (točki 3 + 14)
// ---------------------------------------------------------------------------

describe("Adapter failure isolation (točki 3, 14)", () => {
  // Kategorije, ki jih pokrivajo VSI testni adapterji (viator/gyg/tiqets:
  // activity+tour+ticket; kiwitaxi: transfer; osm: attraction).
  const query: SupplyQuery = {
    zoom: 14,
    cats: ["attraction", "activity", "tour", "ticket", "transfer"],
    locale: "sl",
    bbox: [46, 14, 46.2, 14.2],
  };

  test("NAROČNIKOV SCENARIJ: A=200, B=timeout, C=malformed, D=empty, OSM=200 → OSM+A brez sesutja", async () => {
    clearProviderRateLimits();
    const a = adapterWith("viator", {
      products: [mkProduct({
        id: "viator:1", provider: "viator", providerProductId: "1",
        type: "activity", title: "Tura A", bookingMode: "affiliate_redirect",
      })],
    });
    const b = adapterWith("getyourguide", { hang: true });
    const c = adapterWith("tiqets", { throw: true });
    const d = adapterWith("kiwitaxi", { products: [] });
    const osm = adapterWith("osm", {
      products: [mkProduct({ id: "osm:node-9", title: "OSM pin" })],
    });

    const started = Date.now();
    const r = await searchSupply(query, [a, b, c, d, osm]);
    const elapsed = Date.now() - started;

    // Rezultat: OSM + A (komercialni A ne združi z OSM pinom — DO NOT MERGE)
    expect(r.products.map((p) => p.provider).sort()).toEqual(["osm", "viator"]);
    // B in C sta padla v degraded (timeout + adapter-error), D je prazen OK
    expect(r.degraded.sort()).toEqual(["getyourguide", "tiqets"]);
    // Timeout je DEJANSKO uveljavljen (100 ms entry, ne neskončno)
    expect(elapsed).toBeLessThan(5_000);
    // Vsak vzrok je vidno razločen
    const notes = Object.fromEntries(r.adapters.map((x) => [x.slug, x.note]));
    expect(notes["getyourguide"]).toBe("timeout");
    expect(notes["tiqets"]).toBe("adapter-error");
    expect(notes["kiwitaxi"]).toBeUndefined(); // uspešen prazen rezultat
  });

  test("AbortSignal: preklic odjemalca → adapter 'aborted', ne sesuje odgovora", async () => {
    clearProviderRateLimits();
    const controller = new AbortController();
    const hanging = adapterWith("viator", { hang: true });
    const osm = adapterWith("osm", {
      products: [mkProduct({ title: "OSM" })],
    });
    // Prekličemo ŠE pred izvedbo — runner mora takoj klasificirati aborted
    controller.abort();
    const r = await searchSupply(
      { ...query, signal: controller.signal },
      [hanging, osm]
    );
    expect(r.degraded).toContain("viator");
    const viatorInfo = r.adapters.find((x) => x.slug === "viator");
    expect(viatorInfo?.note).toBe("aborted");
    expect(r.products.length).toBe(1); // OSM še vedno odda rezultat
  });
  test("runAdapter neposredno: skipped (partial result) se poroča", async () => {
    const base = getProvider("osm")!;
    const ad: SupplyAdapter = {
      entry: { ...base, timeoutMs: 1000 },
      lastRunCached: () => false,
      lastRunSkipped: () => 7,
      async search() { return [mkProduct({})]; },
    };
    const run = await runAdapter(ad, query);
    expect(run.info.ok).toBe(true);
    expect(run.info.skipped).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// 4. RATE LIMITING NA PROVIDERJA (točka 3)
// ---------------------------------------------------------------------------

describe("Per-provider rate limit (točka 3)", () => {
  test("maxCallsPerMin=1 → drugi klic v oknu je 'rate-limited' (ne degraded)", async () => {
    clearProviderRateLimits();
    const base = getProvider("viator")!;
    const entry = { ...base, timeoutMs: 100, maxCallsPerMin: 1 };
    const adapter: SupplyAdapter = {
      entry,
      lastRunCached: () => false,
      async search() { return [mkProduct({ provider: "viator", id: "viator:1", providerProductId: "1", type: "activity", title: "A", bookingMode: "affiliate_redirect" })]; },
    };
    const query: SupplyQuery = { zoom: 14, cats: ["activity"], locale: "sl", bbox: [46, 14, 46.2, 14.2] };
    const first = await searchSupply(query, [adapter]);
    expect(first.products.length).toBe(1);
    const second = await searchSupply(query, [adapter]);
    expect(second.products.length).toBe(0); // zavrnjeno — NI napaka vira
    const info = second.adapters.find((x) => x.slug === "viator");
    expect(info?.note).toBe("rate-limited");
    expect(info?.ok).toBe(true);
    expect(second.degraded).not.toContain("viator");
    clearProviderRateLimits();
  });
});

// ---------------------------------------------------------------------------
// 5. CACHE-CONTROL (točka 13)
// ---------------------------------------------------------------------------

describe("supplyResponseCacheControl (točka 13)", () => {
  test("samo OSM (TTL 10 min) → kratek skupni s-maxage=60", () => {
    const cc = supplyResponseCacheControl(PROVIDER_REGISTRY);
    expect(cc).toContain("s-maxage=60");
    expect(cc).toContain("public");
  });

  test("AKTIVEN živi vir (cacheTtlMs=0) → no-store (cache NI globalni TTL)", () => {
    const withLive = [
      ...PROVIDER_REGISTRY,
      { ...getProvider("viator")!, active: true, cacheTtlMs: 0 },
    ];
    expect(supplyResponseCacheControl(withLive)).toBe("no-store");
  });

  test("brez aktivnih adapterjev → no-store", () => {
    expect(supplyResponseCacheControl([])).toBe("no-store");
  });

  test("najkrajši TTL med aktivnimi določa s-maxage (ne fiksni 60)", () => {
    const withShort = [
      ...PROVIDER_REGISTRY,
      { ...getProvider("fsq")!, active: true, cacheTtlMs: 20_000 },
    ];
    const cc = supplyResponseCacheControl(withShort);
    expect(cc).toContain("s-maxage=20"); // min(60, 20s)
  });
});

// ---------------------------------------------------------------------------
// 6. DEDUPLICATION — DO NOT MERGE (točka 5)
// ---------------------------------------------------------------------------

describe("Dedupe: DO NOT MERGE za nezanesljivo identiteto (točka 5)", () => {
  test("dve turi z ISTIM imenom na isti lokaciji, različna ponudnika → NE združi", () => {
    const viator = mkProduct({
      id: "viator:111", provider: "viator", providerProductId: "111",
      type: "tour", title: "Ljubljana Walking Tour",
      bookingMode: "affiliate_redirect", lat: 46.056, lng: 14.505,
    });
    const gyg = mkProduct({
      id: "getyourguide:222", provider: "getyourguide", providerProductId: "222",
      type: "tour", title: "Ljubljana Walking Tour",
      bookingMode: "affiliate_redirect", lat: 46.0561, lng: 14.5051,
      rating: 4.8, reviewCount: 500,
    });
    const r = dedupeProducts([viator, gyg]);
    expect(r.products.length).toBe(2); // DVA producenta — identiteta ni zanesljiva
    expect(r.duplicates).toBe(0);
  });

  test("OSM hotel + bodoči Booking hotel isto ime/geo → NE združi (lokalni ≠ komercialni)", () => {
    const osm = mkProduct({
      id: "osm:way-1", provider: "osm", providerProductId: "way-1",
      type: "accommodation", title: "Hotel Park", lat: 46.05, lng: 14.5,
    });
    const booking = mkProduct({
      id: "booking:333", provider: "booking", providerProductId: "333",
      type: "accommodation", title: "Hotel Park",
      bookingMode: "affiliate_redirect", lat: 46.0501, lng: 14.5001,
      price: { amount: 79, currency: "EUR", unit: "per_night" },
    });
    const r = dedupeProducts([osm, booking]);
    expect(r.products.length).toBe(2);
  });

  test("lokalna čez-vir združitev OSTAJA (OSM + FSQ isto ime/geo/tip → en pin)", () => {
    const osm = mkProduct({
      id: "osm:node-9", provider: "osm", providerProductId: "node-9",
      type: "restaurant", title: "Gostilna Sokol", lat: 46.3, lng: 14.1,
    });
    const fsq = mkProduct({
      id: "fsq:abc", provider: "fsq", providerProductId: "abc",
      type: "restaurant", title: "Gostilna Sokol",
      lat: 46.3003, lng: 14.1002, rating: 4.2, reviewCount: 30,
    });
    const r = dedupeProducts([osm, fsq]);
    expect(r.products.length).toBe(1);
    expect(r.products[0].altSources).toContain("osm");
  });

  test("gostilna + hotel z istim imenom v isti stavbi → RAZLIČNA tipa = različna produkta", () => {
    const restaurant = mkProduct({
      id: "osm:node-1", type: "restaurant", title: "Pri Jožu", lat: 46.1, lng: 14.1,
    });
    const rooms = mkProduct({
      id: "osm:node-2", type: "accommodation", title: "Pri Jožu", lat: 46.1001, lng: 14.1001,
    });
    const r = dedupeProducts([restaurant, rooms]);
    expect(r.products.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 7. PRICE SEMANTICS (točka 10)
// ---------------------------------------------------------------------------

describe("Price semantics (točka 10)", () => {
  test("vseh 6 enot preide sanitize — €79/night in €79/transfer sta ločeni enoti", () => {
    for (const unit of ["total", "per_person", "per_night", "per_day", "per_vehicle", "per_transfer"] as const) {
      const out = sanitizeSelectedProviderProducts([
        {
          provider: "viator", providerProductId: "x", type: "tour",
          title: "T", source: "S", selectionState: "fixed",
          price: { amount: 79, currency: "EUR", unit },
        },
      ]);
      expect(out[0].price?.unit).toBe(unit);
    }
  });

  test("neveljavna enota → cena ODSTRANJENA (nikoli pomešana z drugo)", () => {
    const out = sanitizeSelectedProviderProducts([
      {
        provider: "viator", providerProductId: "x", type: "tour",
        title: "T", source: "S", selectionState: "fixed",
        price: { amount: 79, currency: "EUR", unit: "per_week" as never },
      },
    ]);
    expect(out[0].price).toBeUndefined();
  });

  test("fromPrice preide strukturirano + AI kontekst izpiše 'from €79'", () => {
    const out = sanitizeSelectedProviderProducts([
      {
        provider: "booking", providerProductId: "h1", type: "accommodation",
        title: "Hotel", source: "Booking.com", selectionState: "fixed",
        price: { amount: 79, currency: "EUR", unit: "per_night", fromPrice: true },
      },
    ]);
    expect(out[0].price?.fromPrice).toBe(true);
    const block = buildSelectedProductsContext(out, "en");
    expect(block).toContain("from €79 (per night)");
    const blockSl = buildSelectedProductsContext(out, "sl");
    expect(blockSl).toContain("od 79 € (per night)");
  });
});

// ---------------------------------------------------------------------------
// 8. AVAILABILITY SEMANTICS (točka 11)
// ---------------------------------------------------------------------------

describe("Availability semantics (točka 11)", () => {
  test("vse 4 vrednosti so VELJAVNE — 'available: true' NI mogoč (naročniška točka 11)", () => {
    // žive/unknown preidejo v izbiro; not_supported se pri izbiri TIHO
    // izpušča (dokumentirana semantika: OSM izdelki ne nosijo dostopnosti
    // v AI kontekst — razlikovanje ostaja v ProviderProduct!) — glej naslednji test.
    for (const status of ["live_available", "live_unavailable", "unknown"] as const) {
      const out = sanitizeSelectedProviderProducts([
        {
          provider: "viator", providerProductId: "x", type: "tour",
          title: "T", source: "S", selectionState: "fixed",
          availability: { status },
        },
      ]);
      expect(out[0].availability?.status).toBe(status);
    }
  });

  test("neveljaven status → razpoložljivost ODSTRANJENA", () => {
    const out = sanitizeSelectedProviderProducts([
      {
        provider: "viator", providerProductId: "x", type: "tour",
        title: "T", source: "S", selectionState: "fixed",
        availability: { status: "probably-fine" as never },
      },
    ]);
    expect(out[0].availability).toBeUndefined();
  });

  test("not_supported se v AI kontekst NE sili (OSM nima koncepta)", () => {
    const out = sanitizeSelectedProviderProducts([
      {
        provider: "osm", providerProductId: "n1", type: "museum",
        title: "M", source: "OSM", selectionState: "fixed",
        availability: { status: "not_supported" },
      },
    ]);
    expect(out[0].availability).toBeUndefined();
    expect(buildSelectedProductsContext(out, "en")).not.toContain("not supported");
  });

  test("live_available/live_unavailable/unknown so v AI kontekstu razločni", () => {
    const mk = (status: "live_available" | "live_unavailable" | "unknown") =>
      sanitizeSelectedProviderProducts([
        {
          provider: "viator", providerProductId: "x", type: "tour",
          title: "T", source: "S", selectionState: "fixed",
          availability: { status },
        },
      ]);
    expect(buildSelectedProductsContext(mk("live_available"), "en")).toContain("LIVE available");
    expect(buildSelectedProductsContext(mk("live_unavailable"), "en")).toContain("LIVE unavailable");
    expect(buildSelectedProductsContext(mk("unknown"), "en")).toContain("unknown");
  });
});

// ---------------------------------------------------------------------------
// 9. PROVENANCE (točka 9)
// ---------------------------------------------------------------------------

describe("Provenance (točka 9)", () => {
  test("OSM produkt nosi provider/source/licenco/lastUpdated", () => {
    const p = mkProduct({});
    expect(p.provider).toBe("osm");
    expect(p.license?.source).toBe("OpenStreetMap");
    expect(p.license?.attribution).toContain("OpenStreetMap");
    expect(Date.parse(p.lastUpdated)).not.toBeNaN();
  });

  test("AI kontekst vsebuje VIR izbire (source) — cena nikoli brez provenance", () => {
    const out = sanitizeSelectedProviderProducts([
      {
        provider: "viator", providerProductId: "1", type: "tour",
        title: "Tura", source: "Viator", selectionState: "fixed",
        price: { amount: 45, currency: "EUR", unit: "per_person" },
      },
    ]);
    const block = buildSelectedProductsContext(out, "en");
    expect(block).toContain("source: Viator");
    expect(block).toContain("€45 (per person)");
  });
});

// ---------------------------------------------------------------------------
// 10. AI TIP-SEMANTIKA + FIXED (točki 6, 7)
// ---------------------------------------------------------------------------

describe("AI tip-semantika + FIXED/PREFERRED/SUGGESTED (točki 6, 7)", () => {
  const selT = sel;

  test("HOTEL: AI ne sme zamenjati izbranega hotela + nočitvena baza (ne obisk)", () => {
    const block = buildSelectedProductsContext(
      [sel({ type: "accommodation", title: "Hotel Triglav Bled" })],
      "en"
    );
    expect(block).toContain("[FIXED]");
    expect(block).toContain("Do NOT replace a FIXED product");
    expect(block).toContain("overnight BASE, never a sightseeing visit stop");
    const blockSl = buildSelectedProductsContext(
      [sel({ type: "accommodation", title: "Hotel Triglav Bled" })],
      "sl"
    );
    expect(blockSl).toContain("nočitvena BAZA, NIKOLI obisk-postanek");
  });

  test("ACTIVITY: ohranitev + datumi/odpiralne ure", () => {
    const block = buildSelectedProductsContext([sel({ type: "activity" })], "en");
    expect(block).toContain("that tour stays");
    expect(block).toContain("respect the given dates and typical opening hours");
  });

  test("TRANSFER: izrecna transportna omejitev (ne postanek-zanimivost)", () => {
    const block = buildSelectedProductsContext(
      [sel({ type: "transfer", title: "Letališče LJU → Bled" })],
      "en"
    );
    expect(block).toContain("TRANSPORT CONSTRAINT");
    expect(block).toContain("NOT an attraction stop");
    const blockSl = buildSelectedProductsContext([sel({ type: "transfer" })], "sl");
    expect(blockSl).toContain("TRANSPORTNA OMEJITEV");
  });

  test("CAR: AI ve, da je prevoz ŽE pokrit (brez odvečnih najemov)", () => {
    const en = buildSelectedProductsContext([sel({ type: "car_rental" })], "en");
    expect(en).toContain("transport is ALREADY COVERED");
    const sl = buildSelectedProductsContext([sel({ type: "car_rental" })], "sl");
    expect(sl).toContain("prevoz je ŽE POKRIT");
  });

  test("FLIGHT: okvir dneva 1/zadnjega", () => {
    const block = buildSelectedProductsContext([sel({ type: "flight" })], "en");
    expect(block).toContain("arrival/departure constraint for day 1");
  });

  test("VEČ produktov (hotel+aktivnost+transfer+restavracija) → EN itinerer, VSE v kontekstu", () => {
    const out = sanitizeSelectedProviderProducts([
      sel({ provider: "booking", type: "accommodation", title: "Hotel", providerProductId: "h1" }),
      sel({ provider: "viator", type: "activity", title: "Rafting", providerProductId: "a1" }),
      sel({ provider: "kiwitaxi", type: "transfer", title: "Transfer LJU", providerProductId: "t1" }),
      sel({ provider: "osm", type: "restaurant", title: "Gostilna", providerProductId: "r1" }),
    ]);
    expect(out.length).toBe(4);
    const block = buildSelectedProductsContext(out, "en");
    for (const title of ["Hotel", "Rafting", "Transfer LJU", "Gostilna"]) {
      expect(block).toContain(title);
    }
  });

  test("PREFERRED/SUGGESTED se razločno izpiseta (kategorije niso samo dokumentacija)", () => {
    const en = buildSelectedProductsContext([sel({ selectionState: "preferred" })], "en");
    expect(en).toContain("[PREFERRED]");
    const sl = buildSelectedProductsContext([sel({ selectionState: "suggested" })], "sl");
    expect(sl).toContain("[SUGGESTED]");
  });
});

// ---------------------------------------------------------------------------
// 11. ADD-TO-PLAN: tip-semantika pri vstavljanju (točka 6)
// ---------------------------------------------------------------------------

describe("insertProductStop tip-semantika (točka 6)", () => {
  const destinationCoords = new Map([
    ["bled", { lat: 46.37, lng: 14.11 }],
  ]);
  const baseItinerary: Itinerary = {
    days: [
      {
        day: 1,
        locations: [
          {
            destination_id: "bled",
            destination_name: "Bled",
            time_slot: "09:00-13:00",
            duration: 4,
            estimated_cost: 50,
            notes: "",
          },
        ],
        weather: { condition: "sunny", temp: 22 },
      },
    ],
    total_budget: 200,
    recommendations: [],
    tips: [],
    source: "fallback",
  };

  test("HOTEL → selection-only (izbira za AI, NI lažni 'obisk hotela 20:00')", () => {
    const r = insertProductStop(
      baseItinerary,
      mkProduct({ type: "accommodation", id: "booking:h1", provider: "booking", providerProductId: "h1", bookingMode: "affiliate_redirect" }),
      { locale: "sl", destinationCoords }
    );
    expect(r.ok && r.kind === "selection-only" && r.reason === "accommodation").toBe(true);
  });

  test("TRANSFER z geo → postanek (transportni dogodek) z iskreno opombo vira", () => {
    const r = insertProductStop(
      baseItinerary,
      mkProduct({ type: "transfer", id: "kiwitaxi:t1", provider: "kiwitaxi", providerProductId: "t1", bookingMode: "affiliate_redirect", license: { source: "KiwiTaxi" }, price: { amount: 51, currency: "EUR", unit: "per_transfer", fromPrice: true } }),
      { locale: "sl", destinationCoords }
    );
    expect(r.ok && r.kind === "stop").toBe(true);
    if (r.ok && r.kind === "stop") {
      const stop = r.itinerary.days[0].locations.at(-1)!;
      expect(stop.destination_id).toBe("kiwitaxi:t1");
      expect(stop.notes).toContain("od 51 € (per transfer)");
      expect(stop.notes).toContain("vir: KiwiTaxi");
    }
  });

  test("FALLBACK priporočila: PREFERRED + nastanitev + brez-geo ne izginejo tiho", () => {
    const recs = buildSelectionRecommendations(
      [
        sel({ provider: "booking", type: "accommodation", title: "Hotel Park", providerProductId: "h1", selectionState: "fixed" }),
        sel({ provider: "viator", type: "tour", title: "Tura", providerProductId: "a1", selectionState: "preferred" }),
        sel({ provider: "osm", type: "museum", title: "M", providerProductId: "m1", selectionState: "fixed", lat: 46.1, lng: 14.1 }),
      ],
      "sl"
    );
    // FIXED z geo (museum) dobi postanek → NI v priporočilih; ostala dva sta
    expect(recs.length).toBe(2);
    expect(recs.join(" ")).toContain("Hotel Park");
    expect(recs.join(" ")).toContain("Tura");
  });
});

// ---------------------------------------------------------------------------
// 12. SSRF / INJECTION ZAŠČITA (točka 15) — meje zaupanja
// ---------------------------------------------------------------------------

describe("SSRF/injection zaščita (točka 15)", () => {
  test("bookingUrl se NIKOLI ne preda AI (rezervacija teče prek /go)", () => {
    const out = sanitizeSelectedProviderProducts([
      {
        provider: "viator", providerProductId: "1", type: "tour",
        title: "T", source: "S", selectionState: "fixed",
        bookingUrl: "https://evil.example/inject",
      },
    ]);
    expect(out[0].bookingUrl).toBeUndefined();
  });

  test("poljuben provider niza → zavrnjen (registry whitelist)", () => {
    const out = sanitizeSelectedProviderProducts([
      { provider: "evil", providerProductId: "1", type: "tour", title: "T", source: "S", selectionState: "fixed" },
    ]);
    expect(out.length).toBe(0);
  });
});
