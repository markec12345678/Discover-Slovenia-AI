// ============================================================================
// TASK 45 — VIATOR ADAPTER: CAPABILITY GATE / RUNNER / CACHE / IZOLACIJA
// ============================================================================
// Mock fetch je TEST-ONLY preslikava ŽIVO preverjene uradne pogodbe
// (docs.viator.com — Golden Path primer). NI izmišljenega inventarja:
// adapter se preskuša proti dokumentiranim odgovorom vira.
//
// KLJUČNE INVARIANTE:
//  - §2/§3 CAPABILITY GATE: brez VIATOR_API_KEY → iskreno PRAZEN sloj,
//    0 klicev na vir (NI simulacije živega API-ja)
//  - §9 VIEWPORT: sloj OFF → 0 klicev; zoom < 10 → 0 klicev; ON+z≥10 →
//    destinacijsko-scoped poizvedba (1–3 mesta oz. 1 država)
//  - §10 CACHE: pozitivni TTL, negativni (okvarа 60 s), coalescing
//  - §6 IZOLACIJA: 401 Viator → degraded=[viator], drugi adapterji živi
//  - §16/17 ADD-TO-PLAN + AI FIXED: viator produkt → FIXED item skozi
//    cel chain (ne zamenja providerja/ID-ja/cene)
// ============================================================================
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { readFileSync } from "node:fs";
import { createViatorAdapter, resetViatorAdapterCaches, viatorLastNote } from "@/lib/supply/providers/viator/adapter";
import { resetViatorDestinations } from "@/lib/supply/providers/viator/destinations";
import { clearViatorProductUrls, lookupViatorProductUrl } from "@/lib/supply/providers/viator/mapper";
import { getProvider } from "@/lib/supply/registry";
import { searchSupply, defaultAdapters, clearProviderRateLimits } from "@/lib/supply/search";
import { runAdapter, type SupplyAdapter } from "@/lib/supply/adapter";
import { toSelectedProduct } from "@/lib/supply/selection";
import {
  sanitizeSelectedProviderProducts,
  buildSelectedProductsContext,
} from "@/lib/supply/sanitize";
import { insertProductStop } from "@/lib/supply/stop-insert";
import { getViatorUrl } from "@/lib/affiliate";
import type { ProviderProduct, SupplyQuery } from "@/lib/supply/types";
import type { Itinerary } from "@/lib/types";

// ---------------------------------------------------------------------------
// MOCK NAPREDA (DI fetch) — uradna shema odgovorov
// ---------------------------------------------------------------------------

/** Uradni primer ProductSummary (Golden Path) v EUR. */
function summary(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    productCode: "227717P1",
    title: "Acadia National Park private minivan tour- 3 Hours Local Guides",
    description: "A local guide will show you all the highlights of Acadia National Park!",
    images: [
      {
        imageSource: "SUPPLIER_PROVIDED",
        caption: "Bar Harbor",
        isCover: true,
        variants: [
          { height: 400, width: 400, url: "https://media-cdn.tripadvisor.com/media/attractions-splice-spp-400x400/0b/d5/69/3d.jpg" },
        ],
      },
    ],
    reviews: {
      sources: [
        { provider: "VIATOR", totalCount: 10, averageRating: 5.0 },
        { provider: "TRIPADVISOR", totalCount: 63, averageRating: 5.0 },
      ],
      totalReviews: 73,
      combinedAverageRating: 4.972603,
    },
    pricing: { summary: { fromPrice: 500.0, fromPriceBeforeDiscount: 500.0 }, currency: "EUR" },
    productUrl:
      "https://www.viator.com/tours/Bar-Harbor/3-Hour-ACADIA-NATIONAL-PARK-TOUR/d4371-227717P1?mcid=42383&pid=P00063937&medium=api&api_version=2.0",
    destinations: [{ ref: "5257", primary: true }],
    tags: [11930],
    flags: ["FREE_CANCELLATION", "PRIVATE_TOUR"],
    translationInfo: { containsMachineTranslatedText: false },
    ...overrides,
  };
}

/** Slovenska test taksonomija (uradna oblika DestinationDetails). */
const TAXONOMY_RESPONSE = {
  destinations: [
    { destinationId: 5257, name: "Ljubljana", type: "CITY", parentDestinationId: 4526, center: { latitude: 46.0569, longitude: 14.5058 } },
    { destinationId: 5258, name: "Bled", type: "CITY", parentDestinationId: 4526, center: { latitude: 46.3683, longitude: 14.114 } },
    { destinationId: 5259, name: "Piran", type: "CITY", parentDestinationId: 4526, center: { latitude: 45.5271, longitude: 13.5687 } },
    { destinationId: 5260, name: "Maribor", type: "CITY", parentDestinationId: 4526, center: { latitude: 46.5547, longitude: 15.6459 } },
    { destinationId: 4526, name: "Slovenia", type: "COUNTRY", center: { latitude: 46.15, longitude: 14.47 } },
    // TUJA destinacija (izven širokega SI bboxa — za post-filter test):
    { destinationId: 7001, name: "Vienna", type: "CITY", parentDestinationId: 6999, center: { latitude: 48.2082, longitude: 16.3738 } },
  ],
  totalCount: 6,
};

interface RecordedCall {
  url: string;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

/** Zgradi mock fetch, ki beleži klice in odgovarja po URADNI shemi. */
function makeMockFetch(opts: {
  searchByDest?: Record<string, Record<string, unknown>[]>;
  status?: number;
}) {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({
      url: u,
      method: init?.method,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      headers,
    });
    if (u.endsWith("/destinations")) {
      return new Response(JSON.stringify(TAXONOMY_RESPONSE), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (u.endsWith("/products/search")) {
      if (opts.status != null && opts.status !== 200) {
        return new Response(JSON.stringify({ code: "UNAUTHORIZED", message: "Invalid API Key" }), {
          status: opts.status,
          headers: { "content-type": "application/json" },
        });
      }
      const body = (init?.body ? JSON.parse(init.body as string) : {}) as {
        filtering?: { destination?: string };
      };
      const dest = body.filtering?.destination ?? "?";
      const products = opts.searchByDest?.[dest] ?? [];
      return new Response(JSON.stringify({ products, totalCount: products.length }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "unexpected-url" }), { status: 500 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const ENTRY = getProvider("viator")!;

/** Adapter z mock fetch DI. */
function adapterWith(fetchImpl: typeof fetch): SupplyAdapter {
  return createViatorAdapter(ENTRY, { fetchImpl });
}

/** Ljubljanski viewport (ozek — 1 destinacija). */
const LJU_VIEW: SupplyQuery = {
  bbox: [46.02, 14.47, 46.09, 14.55],
  zoom: 12,
  cats: ["activity", "tour"],
  locale: "sl",
};

// ---------------------------------------------------------------------------
// ZAGON/ČIŠČENJE — vsak test doba čisto stanje (cache + env)
// ---------------------------------------------------------------------------

let prevKey: string | undefined;

beforeEach(() => {
  prevKey = process.env.VIATOR_API_KEY;
  resetViatorAdapterCaches();
  clearViatorProductUrls();
  // TASK 76: runner-jev drseči omejevalnik (providerRateLimited) je
  // MODULE-LEVEL stanje, ki se v bun testu deli med VSE datoteke suite-a
  // (en proces). Brez tega čiščenja so opazke v tej datoteki odvisne od
  // žetonov, ki so jih pred njo porabile prejšnje datoteke prek
  // route-testov (13 + 3 + 4 = 20/20 kapa) → note „rate-limited"
  // namesto „not-configured".
  clearProviderRateLimits();
});

afterEach(() => {
  if (prevKey === undefined) delete process.env.VIATOR_API_KEY;
  else process.env.VIATOR_API_KEY = prevKey;
  resetViatorAdapterCaches();
  clearViatorProductUrls();
  resetViatorDestinations();
  clearProviderRateLimits(); // TASK 76: ne puščaj žetonov naslednjim datotekam
});

// ---------------------------------------------------------------------------
// §2/§3 CAPABILITY GATE — brez ključa NI podatkov (in NI klicev)
// ---------------------------------------------------------------------------

describe("TASK 45 §2/§3: capability gate — brez VIATOR_API_KEY", () => {
  test("① iskreno PRAZEN sloj + opomba not-configured + 0 klicev na vir", async () => {
    delete process.env.VIATOR_API_KEY;
    const { fetchImpl, calls } = makeMockFetch({ searchByDest: { "5257": [summary()] } });
    const adapter = adapterWith(fetchImpl);
    const products = await adapter.search(LJU_VIEW);
    expect(products).toEqual([]);
    expect(viatorLastNote()).toBe("not-configured");
    expect(calls).toHaveLength(0); // NIKAKOR ne pokličemo vira
  });

  test("② runner: adapter med ADAPTERJI z iskreno opombo, NE v degraded", async () => {
    delete process.env.VIATOR_API_KEY;
    const { fetchImpl, calls } = makeMockFetch({});
    const res = await searchSupply(
      { ...LJU_VIEW, zoom: 12 },
      [adapterWith(fetchImpl)]
    );
    const viatorInfo = res.adapters.find((a) => a.slug === "viator")!;
    expect(viatorInfo.ok).toBe(true);
    expect(viatorInfo.count).toBe(0);
    expect(viatorInfo.note).toBe("not-configured");
    expect(res.degraded).not.toContain("viator"); // NI napaka — stanje
    expect(calls).toHaveLength(0);
    expect(res.products).toEqual([]);
  });

  test("③ defaultAdapters() vključuje viator (tovarna priklopljena — 11 adapterjev)", () => {
    // Task 46: + getyourguide (tretji realni adapter). Task 53: + tiqets,
    // booking, skyscanner, airalo, travelpayouts, fsq (iskreni gates —
    // brez poverilnic/dataseta PRAZEN sloj, brez omrežnih klicev).
    // TASK 84: + own (lastna tržnica — živa DB, listingi s koordinatami).
    // Red je iz registra (activeProviders) — tovarna le preslika slug → factory.
    const adapters = defaultAdapters();
    expect(adapters.map((a) => a.entry.slug).sort()).toEqual([
      "airalo",
      "booking",
      "fsq",
      "getyourguide",
      "kiwitaxi",
      "osm",
      "own",
      "skyscanner",
      "tiqets",
      "travelpayouts",
      "viator",
    ]);
  });

  test("④ SOURCE CONTRACT: adapter NE vsebuje izmišljenega inventory fallbacka (živi virs)", () => {
    // Adapterjeva koda NE sme vsebovati „sample/demo" produktov — edini vir
    // podatkov je pogodbena pot (client). Regresijska varovalka.
    const src = readFileSync(
      new URL("../supply/providers/viator/adapter.ts", import.meta.url),
      "utf-8"
    );
    expect(src.includes("not-configured")).toBe(true); // iskrena opomba obstaja
    expect(src.includes("sample")).toBe(false);
    expect(src.includes("DEMO_")).toBe(false);
    expect(src.includes("fallbackProducts")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §9 VIEWPORT — klici SAMO ob vklopu sloja + ustreznem zoomu
// ---------------------------------------------------------------------------

describe("TASK 45 §9: viewport/zoom gating (0 klicev, ko sloj izklopljen)", () => {
  test("① zoom 9 < minZoom 10 → 0 klicev na vir (zoom-gated opomba runnerja)", async () => {
    process.env.VIATOR_API_KEY = "test-key";
    const { fetchImpl, calls } = makeMockFetch({ searchByDest: { "5257": [summary()] } });
    const res = await searchSupply({ ...LJU_VIEW, zoom: 9 }, [adapterWith(fetchImpl)]);
    expect(calls).toHaveLength(0);
    const viatorInfo = res.adapters.find((a) => a.slug === "viator")!;
    expect(viatorInfo.note).toBe("zoom-gated");
  });

  test("② cats=transfer (viator tipi se ne sekajo) → 0 klicev (cat-gated)", async () => {
    process.env.VIATOR_API_KEY = "test-key";
    const { fetchImpl, calls } = makeMockFetch({});
    const res = await searchSupply(
      { ...LJU_VIEW, cats: ["transfer"] },
      [adapterWith(fetchImpl)]
    );
    expect(calls).toHaveLength(0);
    const viatorInfo = res.adapters.find((a) => a.slug === "viator")!;
    expect(viatorInfo.note).toBe("cat-gated");
  });

  test("③ brez bbox → 0 klicev (no-bbox opomba adapterja)", async () => {
    process.env.VIATOR_API_KEY = "test-key";
    const { fetchImpl, calls } = makeMockFetch({});
    const products = await adapterWith(fetchImpl).search({
      ...LJU_VIEW,
      bbox: undefined,
    });
    expect(products).toEqual([]);
    expect(viatorLastNote()).toBe("no-bbox");
    expect(calls).toHaveLength(0);
  });

  test("④ OZEK viewport (Ljubljana) → 1 mestno iskanje s pravilno zahtevo", async () => {
    process.env.VIATOR_API_KEY = "11111111-2222-3333-4444-555555555555";
    const { fetchImpl, calls } = makeMockFetch({ searchByDest: { "5257": [summary()] } });
    const products = await adapterWith(fetchImpl).search(LJU_VIEW);

    // 2 klica: GET /destinations (taksonomija) + POST /products/search:
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toContain("/destinations");
    expect(calls[1].url).toContain("/products/search");
    expect(calls[1].method).toBe("POST");
    // Pogodbeno telo: destination kot NIZ, TRAVELER_RATING sort, paginacija, EUR:
    expect(calls[1].body).toEqual({
      filtering: { destination: "5257" },
      sorting: { sort: "TRAVELER_RATING", order: "DESCENDING" },
      pagination: { start: 1, count: 24 },
      currency: "EUR",
    });
    const headers = calls[1].headers as Record<string, string>;
    expect(headers["exp-api-key"]).toBe("11111111-2222-3333-4444-555555555555");
    expect(headers["Accept"]).toBe("application/json;version=2.0");

    // Produkt preslikan (pin = center Ljubljane iz taksonomije vira):
    expect(products).toHaveLength(1);
    expect(products[0].id).toBe("viator:227717P1");
    expect(products[0].lat).toBe(46.0569);
    expect(products[0].lng).toBe(14.5058);
    expect(products[0].geoPrecision).toBe("destination_center");
    // productUrl predpomnjen za /go:
    expect(lookupViatorProductUrl("227717P1")).toContain("viator.com/tours/");
  });

  test("⑤ datum uporabnika → startDate/endDate okno v zahtevi (pogodbena polja)", async () => {
    process.env.VIATOR_API_KEY = "k";
    const { fetchImpl, calls } = makeMockFetch({ searchByDest: { "5257": [] } });
    await adapterWith(fetchImpl).search({ ...LJU_VIEW, date: "2026-10-05" });
    const body = calls[1].body as { filtering: Record<string, unknown> };
    expect(body.filtering).toEqual({
      destination: "5257",
      startDate: "2026-10-05",
      endDate: "2026-10-05",
    });
  });

  test("⑥ ŠIROK viewport (≥ 4 destinacije) → 1 DRŽAVNO iskanje + post-filter pinov", async () => {
    process.env.VIATOR_API_KEY = "k";
    const productsByDest: Record<string, Record<string, unknown>[]> = {
      // Državno iskanje vrne produkte z RAZLIČNIMI primarnimi destinacijami:
      "4526": [
        summary({ productCode: "10001P1", destinations: [{ ref: "5257", primary: true }] }),
        summary({ productCode: "10002P2", destinations: [{ ref: "5258", primary: true }] }),
        // Pin ZUNAJ bboxa (Dunaj) → post-filter ga izloči:
        summary({ productCode: "10003P3", destinations: [{ ref: "7001", primary: true }] }),
      ],
    };
    const { fetchImpl, calls } = makeMockFetch({ searchByDest: productsByDest });
    // ŠIROK bbox: vseh 4 slovenskih mest v pogledu → državno iskanje:
    const products = await adapterWith(fetchImpl).search({
      bbox: [45.0, 13.0, 47.0, 16.6],
      zoom: 10,
      cats: ["activity"],
      locale: "sl",
    });
    // Taksonomija + 1 državno iskanje:
    expect(calls).toHaveLength(2);
    expect((calls[1].body as { filtering: { destination: string } }).filtering.destination).toBe("4526");
    // Post-filter: Ljubljana + Bled ostanejo, Dunaj izločen:
    expect(products.map((p) => p.providerProductId).sort()).toEqual(["10001P1", "10002P2"]);
  });

  test("⑦ dedupe po productCode (isti produkt iz dveh iskanj ostane ENKRAT)", async () => {
    process.env.VIATOR_API_KEY = "k";
    const same = summary();
    // OZEK viewport z 2 destinacijama (Ljubljana + Bled), oba iskanja
    // vrneta ISTI produkt:
    const { fetchImpl, calls } = makeMockFetch({
      searchByDest: { "5257": [same], "5258": [same] },
    });
    const products = await adapterWith(fetchImpl).search({
      bbox: [46.0, 14.0, 46.4, 14.6],
      zoom: 12,
      cats: ["activity"],
      locale: "sl",
    });
    expect(calls.filter((c) => c.url.endsWith("/products/search"))).toHaveLength(2);
    expect(products).toHaveLength(1);
  });

  test("⑧ slab zapis NA SREDINI odgovora ne uniči plasti (skipped števec)", async () => {
    process.env.VIATOR_API_KEY = "k";
    const { fetchImpl } = makeMockFetch({
      searchByDest: {
        "5257": [summary(), { productCode: "", title: "slab" }, summary({ productCode: "9999P9" })],
      },
    });
    const products = await adapterWith(fetchImpl).search(LJU_VIEW);
    expect(products).toHaveLength(2); // slab odpade, oba dobra preživita
    expect(products.map((p) => p.providerProductId).sort()).toEqual(["227717P1", "9999P9"]);
  });

  test("⑨ kap 48 produktov (gostota pod nadzorom)", async () => {
    process.env.VIATOR_API_KEY = "k";
    const many = Array.from({ length: 60 }, (_, i) =>
      summary({ productCode: `1000${i}P${i}` })
    );
    // ŠIROK bbox → državno iskanje (viri 60 produktov, vsi pin Ljubljana):
    const { fetchImpl } = makeMockFetch({ searchByDest: { "4526": many } });
    const products = await adapterWith(fetchImpl).search({
      bbox: [45.0, 13.0, 47.0, 16.6],
      zoom: 10,
      cats: ["activity"],
      locale: "sl",
    });
    expect(products).toHaveLength(48);
    expect(viatorLastNote()).toBe("capped");
  });
});

// ---------------------------------------------------------------------------
// §10 CACHE — pozitivni TTL + negativni (okvare) + coalescing
// ---------------------------------------------------------------------------

describe("TASK 45 §10: predpomnilnik (pogodbeno vljuden do vira)", () => {
  test("① druga IDENTIČNA poizvedba → predpomnilnik (0 novih klicev, cached=true)", async () => {
    process.env.VIATOR_API_KEY = "k";
    const { fetchImpl, calls } = makeMockFetch({ searchByDest: { "5257": [summary()] } });
    const adapter = adapterWith(fetchImpl);
    const first = await adapter.search(LJU_VIEW);
    expect(calls).toHaveLength(2); // taksonomija + iskanje
    expect(adapter.lastRunCached()).toBe(false);

    const second = await adapter.search(LJU_VIEW);
    expect(calls).toHaveLength(2); // NI novih klicev
    expect(adapter.lastRunCached()).toBe(true);
    expect(second).toEqual(first);
  });

  test("② taksonomija se prenese ENKRAT (tedenski cache) — nova poizvedba = samo iskanje", async () => {
    process.env.VIATOR_API_KEY = "k";
    const { fetchImpl, calls } = makeMockFetch({ searchByDest: { "5257": [summary()] } });
    const adapter = adapterWith(fetchImpl);
    await adapter.search(LJU_VIEW);
    // DRUGAČEN bbox (Bled) — novo iskanje, a STARA taksonomija:
    await adapter.search({
      bbox: [46.35, 14.08, 46.39, 14.15],
      zoom: 12,
      cats: ["activity"],
      locale: "sl",
    });
    const destCalls = calls.filter((c) => c.url.endsWith("/destinations"));
    const searchCalls = calls.filter((c) => c.url.endsWith("/products/search"));
    expect(destCalls).toHaveLength(1);
    expect(searchCalls).toHaveLength(2);
  });

  test("③ 401 okvara → degraded + negativni predpomnilnik (60 s): ponovitev = 0 klicev", async () => {
    process.env.VIATOR_API_KEY = "k";
    const { fetchImpl, calls } = makeMockFetch({ status: 401 });
    const adapter = adapterWith(fetchImpl);

    const run1 = await runAdapter(adapter, LJU_VIEW);
    expect(run1.info.ok).toBe(false);
    expect(run1.info.note).toBe("adapter-error");
    expect(calls).toHaveLength(2); // taksonomija + iskanje — prvi poskus

    // Ponovitev ISTIH pogojev v oknu 60 s → takojšnja praznina, 0 klicev:
    const products = await adapter.search(LJU_VIEW);
    expect(products).toEqual([]);
    expect(viatorLastNote()).toBe("recently-failed");
    expect(calls).toHaveLength(2); // NI novih klicev (vljudnost do vira)
  });

  test("④ negativni predpomnilnik je PO KLJUČU (drug viewport poskuša NAPREJ)", async () => {
    process.env.VIATOR_API_KEY = "k";
    const { fetchImpl, calls } = makeMockFetch({ status: 401 });
    const adapter = adapterWith(fetchImpl);
    await expect(adapter.search(LJU_VIEW)).rejects.toThrow(); // 401 → negativni cache za LJU ključ
    // Bled viewport — DRUG ključ → svež poskus (pravočasen, ne blokiran;
    // vir spet odkloni — a POSKUŠI se, to je poanta):
    await expect(
      adapter.search({
        bbox: [46.35, 14.08, 46.39, 14.15],
        zoom: 12,
        cats: ["activity"],
        locale: "sl",
      })
    ).rejects.toThrow();
    expect(calls.filter((c) => c.url.endsWith("/products/search"))).toHaveLength(2);
  });

  test("⑤ coalescing: 2 SOČASNI identični poizvedbi → ENA izvedba (1× iskanje)", async () => {
    process.env.VIATOR_API_KEY = "k";
    // Počasen mock (odgovori po 120 ms) — sočasnost je realna:
    const base = makeMockFetch({ searchByDest: { "5257": [summary()] } });
    const slow = (async (url: string | URL | Request, init?: RequestInit) => {
      await new Promise((r) => setTimeout(r, 120));
      return base.fetchImpl(url, init);
    }) as unknown as typeof fetch;
    const adapter = adapterWith(slow);
    const [a, b] = await Promise.all([adapter.search(LJU_VIEW), adapter.search(LJU_VIEW)]);
    expect(a).toEqual(b);
    expect(a).toHaveLength(1);
    // Skupna izvedba: 1× taksonomija + 1× iskanje:
    const searchCalls = base.calls.filter((c) => c.url.endsWith("/products/search"));
    expect(searchCalls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// §6 IZOLACIJA — viator 401 NE podre drugih adapterjev
// ---------------------------------------------------------------------------

describe("TASK 45 §6: izolacija providerjev (viator okvara → ostali živi)", () => {
  test("① viator 401 + delujoč lažni adapter → degraded=[viator], drugi produkti živi", async () => {
    process.env.VIATOR_API_KEY = "k";
    const viator = adapterWith(makeMockFetch({ status: 401 }).fetchImpl);
    const healthy: SupplyAdapter = {
      entry: { ...getProvider("osm")!, types: ["attraction", "activity"] },
      async search() {
        return [
          {
            id: "osm:node-1",
            provider: "osm",
            providerProductId: "node-1",
            type: "activity",
            title: "Blejski grad",
            lat: 46.36,
            lng: 14.11,
            bookingMode: "info_only",
            lastUpdated: "2026-09-18T00:00:00Z",
          },
        ];
      },
      lastRunCached() {
        return false;
      },
    };
    const res = await searchSupply(LJU_VIEW, [healthy, viator]);
    expect(res.degraded).toEqual(["viator"]); // SAMO viator
    expect(res.products.map((p) => p.provider)).toEqual(["osm"]); // OSM živi
    const viatorInfo = res.adapters.find((a) => a.slug === "viator")!;
    expect(viatorInfo.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §16/§17 ADD TO PLAN + AI FIXED — viator produkt skozi cel chain
// ---------------------------------------------------------------------------

function emptyItinerary(days: number): Itinerary {
  return {
    id: "test",
    title: "Test",
    days: Array.from({ length: days }, (_, i) => ({
      day: i + 1,
      title: `Dan ${i + 1}`,
      locations: [],
      overnight: "Ljubljana",
    })),
  } as unknown as Itinerary;
}

const DEST_COORDS = new Map<string, { lat: number; lng: number }>([
  ["ljubljana", { lat: 46.05, lng: 14.51 }],
]);

const VIATOR_PRODUCT: ProviderProduct = {
  id: "viator:227717P1",
  provider: "viator",
  providerProductId: "227717P1",
  type: "activity",
  subcategory: "private_tour",
  title: "Acadia National Park private minivan tour- 3 Hours Local Guides",
  description: "A local guide will show you all the highlights.",
  lat: 46.0569,
  lng: 14.5058,
  geoPrecision: "destination_center",
  address: "Ljubljana",
  image: "https://media-cdn.tripadvisor.com/media/attractions-splice-spp-400x400/0b/d5/69/3d.jpg",
  imageCredit: "© Viator",
  rating: 4.97,
  reviewCount: 73,
  price: {
    amount: 500,
    currency: "EUR",
    unit: "per_person",
    fromPrice: true,
    note: "od-cena (najnižja, navadno na osebo)",
  },
  availability: { status: "unknown", note: "razpoložljivost se preveri pri ponudniku" },
  bookingMode: "affiliate_redirect",
  bookingUrl: "/go/viator?product=227717P1",
  sourceUrl:
    "https://www.viator.com/tours/Bar-Harbor/3-Hour-ACADIA/d4371-227717P1?mcid=42383&pid=P00063937",
  lastUpdated: "2026-09-18T12:00:00Z",
  license: { source: "Viator Partner API", attribution: "© Viator" },
};

describe("TASK 45 §16/§17: Add to plan + AI FIXED invariant", () => {
  test("① toSelectedProduct: strukturiran FIXED item (provider/id/cena/vir)", () => {
    const sel = toSelectedProduct(VIATOR_PRODUCT);
    expect(sel.selectionState).toBe("fixed"); // uporabnikova izbira = OBVEZNA
    expect(sel.provider).toBe("viator");
    expect(sel.providerProductId).toBe("227717P1");
    expect(sel.type).toBe("activity");
    expect(sel.price?.amount).toBe(500);
    expect(sel.price?.fromPrice).toBe(true);
    expect(sel.availability?.status).toBe("unknown");
    expect(sel.source).toBe("Viator Partner API");
    // Komercialni: bookingUrl se NE pošilje klientu (gre prek /go ob kliku):
    expect(sel.bookingUrl).toBeUndefined();
  });

  test("② sanitize + AI kontekst: FIXED identiteta izrecna (provider+id+cena)", () => {
    const sel = toSelectedProduct(VIATOR_PRODUCT);
    const clean = sanitizeSelectedProviderProducts([sel]);
    expect(clean).toHaveLength(1);
    expect(clean[0].provider).toBe("viator");
    expect(clean[0].providerProductId).toBe("227717P1");
    expect(clean[0].selectionState).toBe("fixed");

    const ctx = buildSelectedProductsContext(clean, "sl");
    expect(ctx).toContain("[FIXED]");
    expect(ctx).toContain("provider: viator, id: 227717P1");
    expect(ctx).toContain("od 500 € (per person)");
    expect(ctx).toContain("Viator Partner API");
    expect(ctx).toContain("NE zamenjuj FIXED produkta"); // pravilo AI
  });

  test("③ insertProductStop: postanek ohrani identiteto NATANČNO (activity tip)", () => {
    const it = emptyItinerary(3);
    const res = insertProductStop(it, VIATOR_PRODUCT, {
      locale: "sl",
      destinationCoords: DEST_COORDS,
    });
    expect(res.ok).toBe(true);
    if (!res.ok || res.kind !== "stop") return;
    const stop = res.itinerary.days.flatMap((d) => d.locations).find(
      (l) => l.destination_id === "viator:227717P1"
    )!;
    expect(stop.destination_id).toBe("viator:227717P1");
    expect(stop.destination_name).toBe(VIATOR_PRODUCT.title);
    expect(stop.estimated_cost).toBe(500);
    expect(stop.notes).toContain("od 500");
    expect(stop.notes).toContain("Viator");
    expect(stop.category).toBe("supply");
    expect(stop.lat).toBe(46.0569);
    expect(stop.lng).toBe(14.5058);
  });

  test("④ isti produkt dvakrat → duplicate (NI dvojnikov v načrtu)", () => {
    const it = emptyItinerary(3);
    const first = insertProductStop(it, VIATOR_PRODUCT, {
      locale: "sl",
      destinationCoords: DEST_COORDS,
    });
    expect(first.ok && first.kind === "stop").toBe(true);
    const second = insertProductStop(
      first.ok && first.kind === "stop" ? first.itinerary : it,
      VIATOR_PRODUCT,
      { locale: "sl", destinationCoords: DEST_COORDS }
    );
    expect(second).toEqual({ ok: false, reason: "duplicate" });
  });
});

// ---------------------------------------------------------------------------
// §7 BOOKING URL — /go/viator?product veriga (affiliate.ts + route)
// ---------------------------------------------------------------------------

describe("TASK 45 §7: booking deep-link veriga (getViatorUrl)", () => {
  afterEach(() => {
    delete process.env.VIATOR_AFFILIATE_URL;
  });

  test("① productUrl iz predpomnilnika (polni ga adapter) → monetized globoka povezava", () => {
    clearViatorProductUrls();
    // Adapter je (v testu ④ zgoraj) predpomnil productUrl; tukaj neposredno:
    const url = "https://www.viator.com/tours/Bar-Harbor/3-Hour/d4371-227717P1?mcid=42383&pid=P00063937&medium=api";
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { rememberViatorProductUrl } = require("../supply/providers/viator/mapper") as {
      rememberViatorProductUrl: (code: string, url: string) => void;
    };
    rememberViatorProductUrl("227717P1", url);
    const res = getViatorUrl("227717P1");
    expect(res.url).toBe(url); // povezava vira (pid/mcid vgrajen)
    expect(res.monetized).toBe(true);
    clearViatorProductUrls();
  });

  test("② productCode IZVEN predpomnilnika + brez VIATOR_AFFILIATE_URL → fail-closed čista povezava", () => {
    clearViatorProductUrls();
    const res = getViatorUrl("9999P9");
    expect(res.url).toBe("https://www.viator.com/");
    expect(res.monetized).toBe(false); // NI lažnega sledenja
  });

  test("③ VIATOR_AFFILIATE_URL konfiguriran → tista povezava (monetized)", () => {
    clearViatorProductUrls();
    process.env.VIATOR_AFFILIATE_URL =
      "https://www.viator.com/Slovenia/d4526-ttd?pid=P000123&mcid=42383";
    const res = getViatorUrl("9999P9");
    expect(res.url).toBe(process.env.VIATOR_AFFILIATE_URL);
    expect(res.monetized).toBe(true);
  });

  test("④ NEVELJAVEN productCode → ignoriran (pade na affiliate/fallback — NE injicira)", () => {
    clearViatorProductUrls();
    for (const bad of ["javascript:alert(1)", "../../evil", "https://evil.com/x", "a b"]) {
      const res = getViatorUrl(bad);
      expect(res.url).not.toContain("evil");
      expect(res.url).not.toContain("javascript");
      expect(res.url).not.toContain("../");
    }
  });
});

// ---------------------------------------------------------------------------
// /go/viator ROUTE — product validacija + redirect (route-level)
// ---------------------------------------------------------------------------

describe("TASK 45: /go/viator route (product deep-link)", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GET } = require("../../app/go/[provider]/route") as {
    GET: (req: Request, ctx: { params: Promise<{ provider: string }> }) => Promise<Response>;
  };

  const call = (qs: string) =>
    GET(new Request(`http://localhost/go/viator${qs}`), {
      params: Promise.resolve({ provider: "viator" }),
    });

  test("① veljaven productCode + predpomnjen productUrl → 302 na povezavo vira", async () => {
    clearViatorProductUrls();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { rememberViatorProductUrl } = require("../supply/providers/viator/mapper") as {
      rememberViatorProductUrl: (code: string, url: string) => void;
    };
    const url = "https://www.viator.com/tours/Bar-Harbor/3-Hour/d4371-227717P1?mcid=42383&pid=P00063937";
    rememberViatorProductUrl("227717P1", url);
    const res = await call("?product=227717P1");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(url);
    clearViatorProductUrls();
  });

  test("② veljaven productCode BREZ predpomnilnika → 302 fail-closed na čisto povezavo", async () => {
    clearViatorProductUrls();
    delete process.env.VIATOR_AFFILIATE_URL;
    const res = await call("?product=62330P2");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://www.viator.com/");
  });

  test("③ ZLOBEN product (injekcija) → 400 (nikamor ne preusmeri)", async () => {
    for (const bad of [
      "?product=javascript:alert(1)",
      "?product=../../evil",
      "?product=https://evil.com/x",
      "?product=data:text/html,<script>",
      "?product=62330P2%20OR%201=1",
      "?product=ab", // prekratek
      "?product=" + "A".repeat(21), // predolg
    ]) {
      const res = await call(bad);
      expect(res.status).toBe(400);
      expect(res.headers.get("location")).toBeNull();
    }
  });

  test("④ BREZ product → 302 na čisto Viator stran (kontrolirano, ne 500)", async () => {
    clearViatorProductUrls();
    delete process.env.VIATOR_AFFILIATE_URL;
    const res = await call("");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://www.viator.com/");
  });

  test("⑤ transfers validacija ŠE VEDNO deluje (regresija — po providerju)", async () => {
    const res = await GET(
      new Request("http://localhost/go/transfers?product=1441&dest=Bled&from=Ljubljana"),
      { params: Promise.resolve({ provider: "transfers" }) }
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toMatch(/^https:\/\/kiwitaxi\.com\/en\/transfers\/1441$/);
    // Neveljaven transfers product (števke samo) → 400:
    const res2 = await GET(
      new Request("http://localhost/go/transfers?product=abc"),
      { params: Promise.resolve({ provider: "transfers" }) }
    );
    expect(res2.status).toBe(400);
  });
});
