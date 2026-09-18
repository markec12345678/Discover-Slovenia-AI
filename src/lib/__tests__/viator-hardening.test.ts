// ============================================================================
// TASK 45 §18–§23 + §30 — VIATOR HARDENING (nadaljevanje specifikacije)
// ============================================================================
// §18  DUPLICATE ACTIVITY INVARIANT — isti provider+ID = duplikat;
//      SEMANTIČNO podoben RAZLIČEN ID = LOČEN produkt (NI fuzzy dedupe)
// §19  KIWI TAXI REGRESSION — kombinacije OSM+KT / OSM+VT / KT+VT / vse;
//      timeout NE podre sosede (OBE smeri)
// §20  COMMERCIAL DEDUPE — KT+VT z enakim imenom/lokacijo = DO NOT MERGE;
//      OSM/local pravila ostanejo LOČENA od komercialne ponudbe
// §21  REDIRECT — /go/viator?url=… (open redirect NEMOGOČ po konstrukciji),
//      kodirani zlobni product (%2E%2E%2F, data:, javascript:)
// §22  SECURITY — provider response je UNTRUSTED INPUT: validacija na
//      meji adapterja (naslov/opis/HTML/script/URL/NaN/Infinity/wrong
//      types/huge strings/nested objekti/malformed)
// §23  API FAILURE ISOLATION — viator {200,empty,malformed,400,401,403,
//      429,500,timeout,network} × ostala 200 → degraded=[viator], osm+
//      kiwitaxi živa (in obratno: KT okvara NE podre viatorja)
// §30  NO FAKE FALLBACK — source-scan CELE viator mape (ni sample/DEMO
//      inventarja, ni statičnih JSON podatkov)
// ============================================================================
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createViatorAdapter, resetViatorAdapterCaches } from "@/lib/supply/providers/viator/adapter";
import { resetViatorDestinations, buildDestIndex, type CanonicalDestInput } from "@/lib/supply/providers/viator/destinations";
import {
  viatorSummaryToProduct,
  mapViatorSummaries,
  clearViatorProductUrls,
  lookupViatorProductUrl,
} from "@/lib/supply/providers/viator/mapper";
import { filterValidSummaries } from "@/lib/supply/providers/viator/types";
import { dedupeProducts } from "@/lib/supply/dedupe";
import { insertProductStop } from "@/lib/supply/stop-insert";
import { sanitizeSelectedProviderProducts } from "@/lib/supply/sanitize";
import { toSelectedProduct } from "@/lib/supply/selection";
import { searchSupply } from "@/lib/supply/search";
import { getProvider } from "@/lib/supply/registry";
import type { SupplyAdapter } from "@/lib/supply/adapter";
import type { ProviderProduct, ProviderSlug, SupplyQuery } from "@/lib/supply/types";
import type { ViatorProductSummary } from "@/lib/supply/providers/viator/types";
import type { Itinerary } from "@/lib/types";

// ---------------------------------------------------------------------------
// SKUPNE GRADNICE
// ---------------------------------------------------------------------------

const ENTRY = getProvider("viator")!;

const LJU_VIEW: SupplyQuery = {
  bbox: [46.02, 14.47, 46.09, 14.55],
  zoom: 12,
  cats: ["activity", "tour"],
  locale: "sl",
};

const LJU_PIN = { lat: 46.0569, lng: 14.5058, name: "Ljubljana", fallback: false };
const MAP_CTX = { locale: "sl" as const, fetchedAt: "2026-09-18T12:00:00Z", pin: LJU_PIN };

/** Uradni primer povzetka (Golden Path) — EUR. */
function officialSummary(overrides: Partial<ViatorProductSummary> = {}): ViatorProductSummary {
  return {
    productCode: "227717P1",
    title: "Acadia National Park private minivan tour- 3 Hours Local Guides",
    description: "A local guide will show you all the highlights of Acadia National Park!",
    images: [
      {
        imageSource: "SUPPLIER_PROVIDED",
        isCover: true,
        variants: [
          { height: 400, width: 400, url: "https://media-cdn.tripadvisor.com/media/attractions-splice-spp-400x400/0b/d5/69/3d.jpg" },
        ],
      },
    ],
    reviews: { sources: [], totalReviews: 73, combinedAverageRating: 4.972603 },
    pricing: { summary: { fromPrice: 500.0 }, currency: "EUR" },
    productUrl: "https://www.viator.com/tours/Bar-Harbor/3-Hour/d4371-227717P1?mcid=42383&pid=P00063937",
    destinations: [{ ref: "5257", primary: true }],
    flags: ["FREE_CANCELLATION"],
    ...overrides,
  } as ViatorProductSummary;
}

/** Taksonomija (uradna oblika) — Ljubljana + Slovenija. */
const TAXONOMY_RESPONSE = {
  destinations: [
    { destinationId: 5257, name: "Ljubljana", type: "CITY", parentDestinationId: 4526, center: { latitude: 46.0569, longitude: 14.5058 } },
    { destinationId: 4526, name: "Slovenia", type: "COUNTRY", center: { latitude: 46.15, longitude: 14.47 } },
  ],
  totalCount: 2,
};

/**
 * Mock fetch z NADZOROVANO odpovedjo SAMO na /products/search
 * (taksonomija vedno odgovori 200 — izolira iskalno odpoved).
 */
function failingSearchFetch(mode: {
  status?: number;
  malformed?: boolean;
  network?: boolean;
  empty?: boolean;
}): typeof fetch {
  return (async (url: string | URL | Request) => {
    const u = String(url);
    if (u.endsWith("/destinations")) {
      return new Response(JSON.stringify(TAXONOMY_RESPONSE), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (u.endsWith("/products/search")) {
      if (mode.network) throw new TypeError("fetch failed (ECONNREFUSED)");
      if (mode.malformed) return new Response("not json at all", { status: 200 });
      if (mode.empty) {
        return new Response(JSON.stringify({ products: [], totalCount: 0 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ code: "ERR", message: "x" }), {
        status: mode.status ?? 500,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("unexpected-url", { status: 500 });
  }) as unknown as typeof fetch;
}

/** Delujoč mock fetch (1 produkt v Ljubljani). */
function healthyViatorFetch(): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith("/destinations")) {
      return new Response(JSON.stringify(TAXONOMY_RESPONSE), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (u.endsWith("/products/search")) {
      const body = init?.body ? JSON.parse(init.body as string) : {};
      const dest = (body as { filtering?: { destination?: string } }).filtering?.destination;
      const products =
        dest === "5257" ? [officialSummary() as unknown as Record<string, unknown>] : [];
      return new Response(JSON.stringify({ products, totalCount: products.length }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("unexpected-url", { status: 500 });
  }) as unknown as typeof fetch;
}

/** Zdrav lažni adapter (osm/kiwitaxi) z enim produktom. */
function healthyAdapter(slug: ProviderSlug, title: string): SupplyAdapter {
  return {
    entry: { ...getProvider(slug)!, types: ["activity", "tour", "transfer", "attraction"] },
    async search() {
      return [
        {
          id: `${slug}:fake-1`,
          provider: slug,
          providerProductId: "fake-1",
          type: "activity",
          title,
          lat: 46.05,
          lng: 14.51,
          bookingMode: "info_only",
          lastUpdated: "2026-09-18T00:00:00Z",
        },
      ];
    },
    lastRunCached() {
      return false;
    },
  };
}

/** Odpovedan lažni adapter (timeout class — runner ne sprašuje vzroka). */
function failingAdapter(slug: ProviderSlug): SupplyAdapter {
  return {
    entry: { ...getProvider(slug)!, types: ["activity", "tour", "transfer", "attraction"] },
    async search() {
      throw new Error("simulated-timeout");
    },
    lastRunCached() {
      return false;
    },
  };
}

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

function viatorProduct(code: string, title: string): ProviderProduct {
  return {
    id: `viator:${code}`,
    provider: "viator",
    providerProductId: code,
    type: "activity",
    title,
    lat: 46.0569,
    lng: 14.5058,
    geoPrecision: "destination_center",
    bookingMode: "affiliate_redirect",
    bookingUrl: `/go/viator?product=${code}`,
    price: { amount: 100, currency: "EUR", unit: "per_person", fromPrice: true },
    availability: { status: "unknown" },
    lastUpdated: "2026-09-18T12:00:00Z",
    license: { source: "Viator Partner API" },
  };
}

let prevKey: string | undefined;

beforeEach(() => {
  prevKey = process.env.VIATOR_API_KEY;
  resetViatorAdapterCaches();
  clearViatorProductUrls();
});

afterEach(() => {
  if (prevKey === undefined) delete process.env.VIATOR_API_KEY;
  else process.env.VIATOR_API_KEY = prevKey;
  resetViatorAdapterCaches();
  clearViatorProductUrls();
  resetViatorDestinations();
});

// ---------------------------------------------------------------------------
// §18 DUPLICATE ACTIVITY INVARIANT
// ---------------------------------------------------------------------------

describe("TASK 45 §18: duplicate activity invariant", () => {
  test("① isti provider + isti product ID v izbiri → SANITIZIRANO na ENEGA", () => {
    const raw = [toSelectedProduct(viatorProduct("227717P1", "X")), toSelectedProduct(viatorProduct("227717P1", "X"))];
    const clean = sanitizeSelectedProviderProducts(raw);
    expect(clean).toHaveLength(1); // provider:providerProductId ključ
  });

  test("② isti produkt dvakrat v NAČRT → duplicate (NI dvojnikov)", () => {
    const it = emptyItinerary(3);
    const p = viatorProduct("227717P1", "Bled tour");
    const first = insertProductStop(it, p, { locale: "sl", destinationCoords: DEST_COORDS });
    expect(first.ok && first.kind === "stop").toBe(true);
    const second = insertProductStop(
      first.ok && first.kind === "stop" ? first.itinerary : it,
      p,
      { locale: "sl", destinationCoords: DEST_COORDS }
    );
    expect(second).toEqual({ ok: false, reason: "duplicate" });
  });

  test("③ SEMANTIČNO podoben RAZLIČEN productCode = LOČEN produkt (NI fuzzy dedupe)", () => {
    // Dva različna produkta Viatorja z IDENTIČNIM naslovom in lokacijo —
    // naročnikovo pravilo: brez agresivnega fuzzy dedupe (dva produkta sta
    // dva producenta; spajanje bi bilo izmišljanje).
    const a = viatorProduct("10001P1", "Bled lake tour");
    const b = viatorProduct("10002P2", "Bled lake tour");
    let it = emptyItinerary(3);
    const ra = insertProductStop(it, a, { locale: "sl", destinationCoords: DEST_COORDS });
    expect(ra.ok).toBe(true);
    if (ra.ok && ra.kind === "stop") it = ra.itinerary;
    const rb = insertProductStop(it, b, { locale: "sl", destinationCoords: DEST_COORDS });
    expect(rb.ok).toBe(true); // DRUGAČEN ID = veljaven drugi produkt
    if (rb.ok && rb.kind === "stop") it = rb.itinerary;
    const stops = it.days.flatMap((d) => d.locations).filter((l) => l.category === "supply");
    expect(stops).toHaveLength(2);
    expect(stops.map((s) => s.destination_id).sort()).toEqual(["viator:10001P1", "viator:10002P2"]);
  });

  test("④ izbira [viator:X, viator:Y] → OBA (različna produkta ostaneta)", () => {
    const clean = sanitizeSelectedProviderProducts([
      toSelectedProduct(viatorProduct("10001P1", "A")),
      toSelectedProduct(viatorProduct("10002P2", "B")),
    ]);
    expect(clean).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// §20 COMMERCIAL DEDUPE — DO NOT MERGE
// ---------------------------------------------------------------------------

describe("TASK 45 §20: komercialni dedupe (DO NOT MERGE)", () => {
  function pp(
    id: string,
    provider: ProviderSlug,
    title: string,
    type: ProviderProduct["type"] = "activity"
  ): ProviderProduct {
    return {
      id,
      provider,
      providerProductId: id.split(":")[1],
      type,
      title,
      lat: 46.05,
      lng: 14.51,
      bookingMode: "info_only",
      lastUpdated: "2026-09-18T00:00:00Z",
    };
  }

  test("① KiwiTaxi + Viator z ISTIM naslovom in lokacijo → OSTAjeta DVA (ne merge)", () => {
    const res = dedupeProducts([
      pp("kiwitaxi:47235", "kiwitaxi", "Ljubljana → Bled", "transfer"),
      pp("viator:10001P1", "viator", "Ljubljana → Bled"),
    ]);
    expect(res.products).toHaveLength(2);
    expect(res.duplicates).toBe(0);
  });

  test("② komercialni + LOKALNI (OSM) z istim naslovom/lokacijo → OSTAjeta DVA", () => {
    const res = dedupeProducts([
      pp("osm:node-1", "osm", "Blejski grad"),
      pp("viator:10001P1", "viator", "Blejski grad"),
    ]);
    expect(res.products).toHaveLength(2); // komercialni se NE združuje niti z lokalnim
  });

  test("③ OSM/local fuzzy dedupe ŠE VEDNO deluje (pravila ostanejo ločena)", () => {
    const res = dedupeProducts([
      pp("osm:node-1", "osm", "Blejski grad"),
      pp("osm:way-99", "osm", "Blejski grad"), // isti geohash+tip+ime → združitev
    ]);
    expect(res.products).toHaveLength(1); // lokalna skupina: fizični objekt
  });

  test("④ isti komercialni ID iz dveh iskanj → EN (id dedupe ostane)", () => {
    const res = dedupeProducts([
      pp("viator:10001P1", "viator", "A"),
      pp("viator:10001P1", "viator", "A"),
    ]);
    expect(res.products).toHaveLength(1);
    expect(res.duplicates).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// §19 + §23 FAILURE ISOLATION + KOMBINACIJE
// ---------------------------------------------------------------------------

describe("TASK 45 §23: API failure isolation (viator odpoved → ostali živi)", () => {
  const cases: { name: string; mode: Parameters<typeof failingSearchFetch>[0] }[] = [
    { name: "Viator 400 (bad-request)", mode: { status: 400 } },
    { name: "Viator 401 (unauthorized)", mode: { status: 401 } },
    { name: "Viator 403 (forbidden)", mode: { status: 403 } },
    { name: "Viator 429 (rate-limited)", mode: { status: 429 } },
    { name: "Viator 500 (server)", mode: { status: 500 } },
    { name: "Viator malformed (200 ne-JSON)", mode: { malformed: true } },
    { name: "Viator network (fetch thrown)", mode: { network: true } },
  ];

  for (const { name, mode } of cases) {
    test(`① ${name} → degraded=[viator], OSM + KiwiTaxi produkti ŽIVI`, async () => {
      process.env.VIATOR_API_KEY = "k";
      const viator = createViatorAdapter(ENTRY, { fetchImpl: failingSearchFetch(mode) });
      const res = await searchSupply(LJU_VIEW, [
        healthyAdapter("osm", "Blejski grad"),
        healthyAdapter("kiwitaxi", "Bohinj → Ljubljana"),
        viator,
      ]);
      expect(res.degraded).toEqual(["viator"]); // SAMO viator
      expect(res.products.map((p) => p.provider).sort()).toEqual(["kiwitaxi", "osm"]);
      const info = res.adapters.find((a) => a.slug === "viator")!;
      expect(info.ok).toBe(false);
      expect(info.note).toBe("adapter-error");
    });
  }

  test("② Viator timeout (adapter vrže) → degraded=[viator], ostali živi", async () => {
    process.env.VIATOR_API_KEY = "k";
    const res = await searchSupply(LJU_VIEW, [
      healthyAdapter("osm", "Blejski grad"),
      healthyAdapter("kiwitaxi", "Bohinj → Ljubljana"),
      failingAdapter("viator"),
    ]);
    expect(res.degraded).toEqual(["viator"]);
    expect(res.products.map((p) => p.provider).sort()).toEqual(["kiwitaxi", "osm"]);
  });

  test("③ Viator PRAZEN (200, 0 produktov) → NI degraded (iskren prazen sloj)", async () => {
    process.env.VIATOR_API_KEY = "k";
    const viator = createViatorAdapter(ENTRY, { fetchImpl: failingSearchFetch({ empty: true }) });
    const res = await searchSupply(LJU_VIEW, [healthyAdapter("osm", "Blejski grad"), viator]);
    expect(res.degraded).toEqual([]);
    expect(res.products.map((p) => p.provider)).toEqual(["osm"]);
    const info = res.adapters.find((a) => a.slug === "viator")!;
    expect(info.ok).toBe(true);
    expect(info.count).toBe(0);
  });

  test("④ OBRATNO: KiwiTaxi timeout → degraded=[kiwitaxi], Viator ŽIV", async () => {
    process.env.VIATOR_API_KEY = "k";
    const viator = createViatorAdapter(ENTRY, { fetchImpl: healthyViatorFetch() });
    const res = await searchSupply(LJU_VIEW, [failingAdapter("kiwitaxi"), viator]);
    expect(res.degraded).toEqual(["kiwitaxi"]); // SAMO kiwitaxi
    expect(res.products.map((p) => p.provider)).toEqual(["viator"]); // viator živ
  });

  test("⑤ OSM timeout → degraded=[osm], Viator ŽIV (regresija OSM neha ≠ vsi)", async () => {
    process.env.VIATOR_API_KEY = "k";
    const viator = createViatorAdapter(ENTRY, { fetchImpl: healthyViatorFetch() });
    const res = await searchSupply(LJU_VIEW, [failingAdapter("osm"), viator]);
    expect(res.degraded).toEqual(["osm"]);
    expect(res.products.map((p) => p.provider)).toEqual(["viator"]);
  });
});

describe("TASK 45 §19: kombinacije slojev (vsi živi — brez medsebojnih motenj)", () => {
  test("① OSM + KiwiTaxi (brez viator ključa — not-configured)", async () => {
    delete process.env.VIATOR_API_KEY;
    const res = await searchSupply(LJU_VIEW, [
      healthyAdapter("osm", "Blejski grad"),
      healthyAdapter("kiwitaxi", "Bohinj → Ljubljana"),
      createViatorAdapter(ENTRY),
    ]);
    expect(res.degraded).toEqual([]);
    expect(res.products.map((p) => p.provider).sort()).toEqual(["kiwitaxi", "osm"]);
  });

  test("② OSM + Viator", async () => {
    process.env.VIATOR_API_KEY = "k";
    const res = await searchSupply(LJU_VIEW, [
      healthyAdapter("osm", "Blejski grad"),
      createViatorAdapter(ENTRY, { fetchImpl: healthyViatorFetch() }),
    ]);
    expect(res.degraded).toEqual([]);
    expect(res.products.map((p) => p.provider).sort()).toEqual(["osm", "viator"]);
  });

  test("③ KiwiTaxi + Viator", async () => {
    process.env.VIATOR_API_KEY = "k";
    const res = await searchSupply(LJU_VIEW, [
      healthyAdapter("kiwitaxi", "Bohinj → Ljubljana"),
      createViatorAdapter(ENTRY, { fetchImpl: healthyViatorFetch() }),
    ]);
    expect(res.degraded).toEqual([]);
    expect(res.products.map((p) => p.provider).sort()).toEqual(["kiwitaxi", "viator"]);
  });

  test("④ OSM + KiwiTaxi + Viator (vsi trije hkrati)", async () => {
    process.env.VIATOR_API_KEY = "k";
    const res = await searchSupply(LJU_VIEW, [
      healthyAdapter("osm", "Blejski grad"),
      healthyAdapter("kiwitaxi", "Bohinj → Ljubljana"),
      createViatorAdapter(ENTRY, { fetchImpl: healthyViatorFetch() }),
    ]);
    expect(res.degraded).toEqual([]);
    expect(res.products.map((p) => p.provider).sort()).toEqual(["kiwitaxi", "osm", "viator"]);
    expect(res.products).toHaveLength(3); // vsak sloj prispeva svoj pin
  });
});

// ---------------------------------------------------------------------------
// §21 REDIRECT / BOOKING — open redirect NEMOGOČ
// ---------------------------------------------------------------------------

describe("TASK 45 §21: /go/viator redirect security", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GET } = require("../../app/go/[provider]/route") as {
    GET: (req: Request, ctx: { params: Promise<{ provider: string }> }) => Promise<Response>;
  };

  const call = (qs: string) =>
    GET(new Request(`http://localhost/go/viator${qs}`), {
      params: Promise.resolve({ provider: "viator" }),
    });

  afterEach(() => {
    delete process.env.VIATOR_AFFILIATE_URL;
  });

  test("① ?url= NAPAD (open redirect) → parameter NE obstaja v arhitekturi; 302 na čisto povezavo", async () => {
    clearViatorProductUrls();
    delete process.env.VIATOR_AFFILIATE_URL;
    const res = await call("?url=https://attacker.example&product=227717P1");
    expect(res.status).toBe(302);
    const loc = res.headers.get("location")!;
    expect(loc.startsWith("https://www.viator.com/")).toBe(true);
    expect(loc).not.toContain("attacker"); // url param NIKOLI ne pride v location
  });

  test("② KODIRANI zlobni product (%2E%2E%2F = ../) → 400", async () => {
    const res = await call("?product=%2E%2E%2Fevil");
    expect(res.status).toBe(400);
    expect(res.headers.get("location")).toBeNull();
  });

  test("③ KODIRANI data: URL (%64ata%3Atext%2Fhtml) → 400", async () => {
    const res = await call("?product=%64ata%3Atext%2Fhtml%2C%3Cscript%3E");
    expect(res.status).toBe(400);
  });

  test("④ KODIRANI javascript: (%6Aavascript%3A) → 400", async () => {
    const res = await call("?product=%6Aavascript%3Aalert%281%29");
    expect(res.status).toBe(400);
  });

  test("⑤ produkt + ZLOBEN dest hkrati → dest gre skozi whitelist (NIKOLI raw v URL)", async () => {
    clearViatorProductUrls();
    delete process.env.VIATOR_AFFILIATE_URL;
    const res = await call("?product=227717P1&dest=%3Cscript%3Eevil%3C%2Fscript%3E");
    expect(res.status).toBe(302);
    const loc = res.headers.get("location")!;
    expect(loc).not.toContain("<");
    expect(loc).not.toContain("script");
    expect(loc.startsWith("https://www.viator.com/")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §22 SECURITY — provider response je UNTRUSTED INPUT (meja adapterja)
// ---------------------------------------------------------------------------

describe("TASK 45 §22: adversarial vhodi na meji preslikave", () => {
  test("① ZLOBEN naslov (HTML/script) → očiščen injekcijski nabor znakov", () => {
    clearViatorProductUrls();
    const p = viatorSummaryToProduct(
      officialSummary({ title: '<script>alert("XSS")</script> Bled tour' }),
      MAP_CTX
    );
    expect(p).not.toBeNull();
    expect(p!.title).not.toContain("<");
    expect(p!.title).not.toContain(">");
    expect(p!.title).not.toContain('"');
    expect(p!.title).not.toContain("'");
    expect(p!.title).not.toContain("`");
    expect(p!.title).toContain("Bled tour"); // vsebina ostane
  });

  test("② ZLOBEN opis (img onerror / script) → očiščen", () => {
    clearViatorProductUrls();
    const p = viatorSummaryToProduct(
      officialSummary({ description: '<img src=x onerror=alert(1)><script>evil()</script>Počitnice.' }),
      MAP_CTX
    );
    expect(p!.description).toBeDefined();
    expect(p!.description).not.toContain("<");
    expect(p!.description).not.toContain(">");
    expect(p!.description).toContain("Počitnice");
  });

  test("③ KONTROLNI znaki v naslovu/opisu → odstranjeni (\\u0000, \\u0007, \\u007f)", () => {
    clearViatorProductUrls();
    const p = viatorSummaryToProduct(
      officialSummary({ title: "Bled\u0000 tour\u0007", description: "Opis\u007f besedilo" }),
      MAP_CTX
    );
    expect(p!.title).toBe("Bled tour");
    expect(p!.description).not.toContain("\u0000");
    expect(p!.description).not.toContain("\u007f");
  });

  test("④ OGROMEN naslov (10 000 znakov) → kap 200; opis 10 000 → kap 1200", () => {
    clearViatorProductUrls();
    const p = viatorSummaryToProduct(
      officialSummary({ title: "A".repeat(10_000), description: "B".repeat(10_000) }),
      MAP_CTX
    );
    expect(p!.title.length).toBeLessThanOrEqual(200);
    expect(p!.description!.length).toBeLessThanOrEqual(1200);
  });

  test("⑤ variants NEPRavi tip (objekt/niz namesto seznama) → NE sesuje, slika undefined", () => {
    clearViatorProductUrls();
    // Popolnoma skrhan primer — preslikava ne sme metti izjem:
    for (const badVariants of [{ evil: true }, "not-array", 42, null]) {
      const s = {
        ...officialSummary(),
        images: [{ isCover: true, variants: badVariants }],
      } as unknown as ViatorProductSummary;
      const p = viatorSummaryToProduct(s, MAP_CTX);
      expect(p).not.toBeNull(); // produkt živi
      expect(p!.image).toBeUndefined(); // slika ni na voljo — iskreno
    }
  });

  test("⑥ images niz/objekt namesto seznama → slika undefined (brez padca)", () => {
    clearViatorProductUrls();
    for (const badImages of ["not-array", { a: 1 }, null, [null], [42]]) {
      const s = { ...officialSummary(), images: badImages } as unknown as ViatorProductSummary;
      const p = viatorSummaryToProduct(s, MAP_CTX);
      expect(p).not.toBeNull();
      expect(p!.image).toBeUndefined();
    }
  });

  test("⑦ wrong types: cena kot niz / ocena z wrong nested / pricing niz → brez polja (NE padec)", () => {
    clearViatorProductUrls();
    const p1 = viatorSummaryToProduct(
      {
        ...officialSummary(),
        pricing: { summary: { fromPrice: "500" as unknown as number }, currency: "EUR" },
      },
      MAP_CTX
    );
    expect(p1!.price).toBeUndefined();
    const p2 = viatorSummaryToProduct(
      {
        ...officialSummary(),
        reviews: { sources: "x" as unknown as never, totalReviews: 5, combinedAverageRating: 4.5 },
      },
      MAP_CTX
    );
    expect(p2!.rating).toBe(4.5); // brane so SAMO številčne vrednosti
    const p3 = viatorSummaryToProduct(
      { ...officialSummary(), pricing: "niz" as unknown as never },
      MAP_CTX
    );
    expect(p3!.price).toBeUndefined();
  });

  test("⑧ productUrl javascript:/data:/http/TUJ https host → NE razrešen, NE predpomnjen", () => {
    clearViatorProductUrls();
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html,<script>x</script>",
      "http://insecure.example.com/x",
      "https://evil.example.com/path", // https, a TUJ host — meja zaupanja §22
      "https://viator.com.evil.example.com/", // subdomain simulacija — NI viator.com host
    ]) {
      const p = viatorSummaryToProduct(
        { ...officialSummary(), productUrl: bad },
        MAP_CTX
      );
      expect(p!.sourceUrl).toBeUndefined(); // vir ni razrešen → ODSOTNO
    }
    expect(lookupViatorProductUrl("227717P1")).toBeNull(); // NIČ ni prišlo v predpomnilnik
  });

  test("⑨ filterValidSummaries: wrong types/null/nizi/številke → skipped, ne sesuje", () => {
    const { valid, skipped } = filterValidSummaries([
      null,
      42,
      "niz",
      { productCode: 42, title: "številčni code" },
      { productCode: "ABC123", title: 42 },
      { productCode: "ABC123", title: "   " },
      officialSummary(),
    ]);
    expect(valid).toHaveLength(1);
    expect(skipped).toBe(6);
  });

  test("⑩ mapViatorSummaries z adversarial seznamom → fail-safe (0 izjem, skipped šteje)", () => {
    clearViatorProductUrls();
    const adversarial = [
      null,
      "x",
      { productCode: "", title: "prazno" },
      officialSummary({ productCode: "10001P1" }),
      { productCode: "10002P2", title: 42 },
    ] as unknown as ViatorProductSummary[];
    const { products, skipped } = mapViatorSummaries(adversarial, {
      locale: "sl",
      fetchedAt: "2026-09-18T12:00:00Z",
    }, () => LJU_PIN);
    expect(products).toHaveLength(1);
    expect(products[0].providerProductId).toBe("10001P1");
    expect(skipped).toBe(4);
  });

  test("⑪ NaN/Infinity center destinacije v taksonomiji → fallback na NAŠE kanonske koordinate", () => {
    const CANONICAL: CanonicalDestInput[] = [
      { slug: "ljubljana", name: "Ljubljana", lat: 46.0569, lng: 14.5058 },
    ];
    const idx = buildDestIndex(
      [
        { destinationId: 5257, name: "Ljubljana", type: "CITY", center: { latitude: Number.NaN, longitude: 14.5058 } },
        { destinationId: 5258, name: "Bled", type: "CITY", center: { latitude: 46.3683, longitude: Number.POSITIVE_INFINITY } },
      ],
      [{ ...CANONICAL[0] }, { slug: "bled", name: "Bled", lat: 46.3683, lng: 14.114 }]
    );
    // Oba centra sta neveljavna → naši koordinate (NI NaN pinov na zemljevidu):
    expect(idx.matched[0].center).toEqual({ lat: 46.0569, lng: 14.5058 });
    expect(idx.matched[1].center).toEqual({ lat: 46.3683, lng: 14.114 });
  });

  test("⑫ productCode z ločili/URL metaznaki/predolg → IZLOČEN na meji (filterValidSummaries)", () => {
    clearViatorProductUrls();
    const { valid, skipped } = filterValidSummaries([
      { ...officialSummary(), productCode: "AB;CD?E" },
      { ...officialSummary(), productCode: "A".repeat(25) },
      { ...officialSummary(), productCode: "ab" }, // prekratek
      { ...officialSummary(), productCode: "227717P1" }, // VELJAVEN
    ]);
    expect(valid).toHaveLength(1);
    expect(valid[0].productCode).toBe("227717P1");
    expect(skipped).toBe(3); // koda z metaznaki NIKOLI ne pride v inventar/bookingUrl
  });
});

// ---------------------------------------------------------------------------
// §30 NO FAKE FALLBACK — source-scan CELE viator mape
// ---------------------------------------------------------------------------

describe("TASK 45 §30: NI fake/demo inventarja (source-scan)", () => {
  const VIATOR_DIR = join(import.meta.dir, "../supply/providers/viator");

  test("① nobena datoteka viatorja ne vsebuje sample/DEMO/fallback produkrov", () => {
    const files = readdirSync(VIATOR_DIR).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThanOrEqual(5); // adapter/client/destinations/mapper/types
    for (const f of files) {
      const src = readFileSync(join(VIATOR_DIR, f), "utf-8");
      expect(src.includes("sample")).toBe(false);
      expect(src.includes("DEMO_")).toBe(false);
      expect(src.includes("fallbackProducts")).toBe(false);
      expect(src.includes("hardcodedProducts")).toBe(false);
    }
  });

  test("② NI statičnih JSON/inventarskih podatkov v mapi (podatki PRIHAJAJO izključno iz API-ja)", () => {
    const dataFiles = readdirSync(VIATOR_DIR).filter((f) => /\.(json|csv|db)$/i.test(f));
    expect(dataFiles).toEqual([]); // Za razliko od kiwitaxi (CSV ingest) — viator je ČISTO API
  });

  test("③ iskrena opomba not-configured ostaja (NI lažnega LIVE)", () => {
    const src = readFileSync(join(VIATOR_DIR, "adapter.ts"), "utf-8");
    expect(src.includes("not-configured")).toBe(true);
  });
});
