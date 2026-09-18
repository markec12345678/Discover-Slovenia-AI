// ============================================================================
// TASK 46 — GETYOURGUIDE: UTRDITVENI TESTI (varnost / izolacija / invariant)
// ============================================================================
// §17  SECURITY — provider response je UNTRUSTED INPUT: validacija na
//      meji adapterja (naslov/opis/HTML/script/URL/NaN/Infinity/wrong
//      types/huge strings)
// §18  DUPLICATE — isti provider + isti tour_id v izbiri/načrtu → EN;
//      semantično podoben RAZLIČEN ID = ločen produkt
// §19  DO NOT MERGE — komercialni produkti Viator/GetYourGuide/KiwiTaxi
//      se NE združujejo kljub istemu naslovu/lokaciji
// §23  API FAILURE ISOLATION — gyg {200,empty,malformed,400,401,429,500,
//      timeout,network} × ostala 200 → degraded=[getyourguide], osm+
//      kiwitaxi+viator živi (in obratno)
// §17b /go/getyourguide — open redirect NEMOGOČ (url= ne obstaja; kodirani
//      zlobni tour_id → 400; host allowlist)
// §8   NO FAKE FALLBACK — source-scan CELE getyourguide mape
// ============================================================================
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  createGetYourGuideAdapter,
  resetGetYourGuideAdapterCaches,
} from "@/lib/supply/providers/getyourguide/adapter";
import {
  gygTourToProduct,
  clearGygTourUrls,
} from "@/lib/supply/providers/getyourguide/mapper";
import { dedupeProducts } from "@/lib/supply/dedupe";
import { insertProductStop } from "@/lib/supply/stop-insert";
import { sanitizeSelectedProviderProducts, buildSelectedProductsContext } from "@/lib/supply/sanitize";
import { toSelectedProduct } from "@/lib/supply/selection";
import { searchSupply } from "@/lib/supply/search";
import { getProvider } from "@/lib/supply/registry";
import type { SupplyAdapter } from "@/lib/supply/adapter";
import type { ProviderProduct, ProviderSlug, SupplyQuery } from "@/lib/supply/types";
import type { GygTour } from "@/lib/supply/providers/getyourguide/types";
import type { Itinerary } from "@/lib/types";

// ---------------------------------------------------------------------------
// SKUPNE GRADNICE
// ---------------------------------------------------------------------------

const ENTRY = getProvider("getyourguide")!;

const LJU_VIEW: SupplyQuery = {
  bbox: [46.02, 14.47, 46.09, 14.55],
  zoom: 12,
  cats: ["activity", "tour"],
  locale: "sl",
};

const MAP_CTX = {
  locale: "sl" as const,
  fetchedAt: "2026-09-18T12:00:00Z",
  currencyConfirmedEur: true,
  dateFiltered: false,
};

/** Uradi primer Tour (Making-a-booking.md, Ljubljana prilagojen). */
function officialTour(overrides: Partial<GygTour> = {}): GygTour {
  return {
    tour_id: 12345,
    title: "Ljubljana: Old Town Walking Tour",
    abstract: "Discover the charms of the old town.",
    overall_rating: 4.6,
    number_of_ratings: 850,
    pictures: [
      { ssl_url: "https://cdn.getyourguide.com/img/tour/abc.jpeg/[format_id].jpg" },
    ],
    coordinates: { lat: 46.0569, long: 14.5058 },
    price: { values: { amount: 19 }, description: "individual" },
    url: "https://www.getyourguide.com/ljubljana-l16/x-t12345/?partner_id=TEST&psrc=partner_api&currency=EUR",
    durations: [{ duration: 2, unit: "hour" }],
    activity_type: "guidedTour",
    ...overrides,
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

function gygProduct(tourId: string, title: string): ProviderProduct {
  return {
    id: `getyourguide:${tourId}`,
    provider: "getyourguide",
    providerProductId: tourId,
    type: "activity",
    title,
    lat: 46.0569,
    lng: 14.5058,
    geoPrecision: "city",
    bookingMode: "affiliate_redirect",
    bookingUrl: `/go/getyourguide?product=${tourId}`,
    price: { amount: 19, currency: "EUR", unit: "per_person", fromPrice: true },
    availability: { status: "unknown" },
    lastUpdated: "2026-09-18T12:00:00Z",
    license: { source: "GetYourGuide Partner API" },
  };
}

/** Zdrav lažni adapter (osm/kiwitaxi/viator) z enim produktom. */
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

/** Mock fetch z nadzorovano odpovedjo /1/tours. */
function gygFetch(mode: {
  status?: number;
  malformed?: boolean;
  network?: boolean;
  empty?: boolean;
}): typeof fetch {
  return (async () => {
    if (mode.network) throw new TypeError("fetch-failed");
    if (mode.status) return new Response("{}", { status: mode.status });
    if (mode.malformed) return new Response("not-json{{", { status: 200 });
    const tours = mode.empty ? [] : [officialTour()];
    return new Response(
      JSON.stringify({
        _metadata: { exchange: { rate: 1, currency: "eur" } },
        data: { tours },
      }),
      { status: 200 }
    );
  }) as unknown as typeof fetch;
}

let prevToken: string | undefined;
let prevPid: string | undefined;

beforeEach(() => {
  prevToken = process.env.GETYOURGUIDE_API_TOKEN;
  prevPid = process.env.GETYOURGUIDE_PARTNER_ID;
  process.env.GETYOURGUIDE_API_TOKEN = "test-gyg-token";
  resetGetYourGuideAdapterCaches();
  clearGygTourUrls();
});

afterEach(() => {
  if (prevToken === undefined) delete process.env.GETYOURGUIDE_API_TOKEN;
  else process.env.GETYOURGUIDE_API_TOKEN = prevToken;
  if (prevPid === undefined) delete process.env.GETYOURGUIDE_PARTNER_ID;
  else process.env.GETYOURGUIDE_PARTNER_ID = prevPid;
  resetGetYourGuideAdapterCaches();
  clearGygTourUrls();
});

// ---------------------------------------------------------------------------
// §18 DUPLICATE ACTIVITY INVARIANT
// ---------------------------------------------------------------------------

describe("TASK 46 §18: duplicate activity invariant", () => {
  test("① isti provider + isti tour_id v izbiri → SANITIZIRANO na ENEGA", () => {
    const raw = [
      toSelectedProduct(gygProduct("12345", "X")),
      toSelectedProduct(gygProduct("12345", "X")),
    ];
    const clean = sanitizeSelectedProviderProducts(raw);
    expect(clean).toHaveLength(1); // provider:providerProductId ključ
    expect(clean[0]?.provider).toBe("getyourguide");
    expect(clean[0]?.providerProductId).toBe("12345");
  });

  test("② isti produkt dvakrat v NAČRT → duplicate (NI dvojnikov)", () => {
    const it = emptyItinerary(3);
    const p = gygProduct("12345", "Bled tour");
    const first = insertProductStop(it, p, { locale: "sl", destinationCoords: DEST_COORDS });
    expect(first.ok && first.kind === "stop").toBe(true);
    const second = insertProductStop(
      first.ok && first.kind === "stop" ? first.itinerary : it,
      p,
      { locale: "sl", destinationCoords: DEST_COORDS }
    );
    expect(second).toEqual({ ok: false, reason: "duplicate" });
  });

  test("③ SEMANTIČNO podoben RAZLIČEN tour_id = LOČEN produkt (NI fuzzy dedupe)", () => {
    const a = gygProduct("10001", "Bled lake tour");
    const b = gygProduct("10002", "Bled lake tour");
    let it = emptyItinerary(3);
    const ra = insertProductStop(it, a, { locale: "sl", destinationCoords: DEST_COORDS });
    expect(ra.ok).toBe(true);
    if (ra.ok && ra.kind === "stop") it = ra.itinerary;
    const rb = insertProductStop(it, b, { locale: "sl", destinationCoords: DEST_COORDS });
    expect(rb.ok).toBe(true);
    if (rb.ok && rb.kind === "stop") it = rb.itinerary;
    const stops = it.days.flatMap((d) => d.locations).filter((l) => l.category === "supply");
    expect(stops).toHaveLength(2);
    expect(stops.map((s) => s.destination_id).sort()).toEqual([
      "getyourguide:10001",
      "getyourguide:10002",
    ]);
  });

  test("④ izbira [gyg:X, gyg:Y] → OBA (različna produkta ostaneta)", () => {
    const clean = sanitizeSelectedProviderProducts([
      toSelectedProduct(gygProduct("10001", "A")),
      toSelectedProduct(gygProduct("10002", "B")),
    ]);
    expect(clean).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// §19 COMMERCIAL DEDUPE — DO NOT MERGE (3 komercialni providerji)
// ---------------------------------------------------------------------------

describe("TASK 46 §19: komercialni dedupe (DO NOT MERGE — GYG/Viator/KiwiTaxi)", () => {
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

  test("① GetYourGuide + Viator z ISTIM naslovom in lokacijo → OSTANETA DVA", () => {
    const res = dedupeProducts([
      pp("getyourguide:12345", "getyourguide", "Ljubljana: Old Town Walking Tour"),
      pp("viator:10001P1", "viator", "Ljubljana: Old Town Walking Tour"),
    ]);
    expect(res.products).toHaveLength(2);
    expect(res.duplicates).toBe(0);
  });

  test("② GetYourGuide + KiwiTaxi z istim naslovom/lokacijo → OSTANETA DVA", () => {
    const res = dedupeProducts([
      pp("getyourguide:12345", "getyourguide", "Ljubljana → Bled"),
      pp("kiwitaxi:47235", "kiwitaxi", "Ljubljana → Bled", "transfer"),
    ]);
    expect(res.products).toHaveLength(2);
    expect(res.duplicates).toBe(0);
  });

  test("③ VSI TRIJE komercialni (GYG + Viator + KT) z istim naslovom → TRIJE", () => {
    const res = dedupeProducts([
      pp("getyourguide:1", "getyourguide", "Bled lake tour"),
      pp("viator:10001P1", "viator", "Bled lake tour"),
      pp("kiwitaxi:47235", "kiwitaxi", "Bled lake tour", "transfer"),
    ]);
    expect(res.products).toHaveLength(3);
    expect(res.duplicates).toBe(0);
  });

  test("④ isti GYG produkt dvakrat v inventarju → DEDUPE na enega (id ključ)", () => {
    const res = dedupeProducts([
      pp("getyourguide:12345", "getyourguide", "X"),
      pp("getyourguide:12345", "getyourguide", "X"),
    ]);
    expect(res.products).toHaveLength(1);
    expect(res.duplicates).toBe(1);
  });

  test("⑤ komercialni + LOKALNI (OSM) z istim naslovom → OSTANETA DVA", () => {
    const res = dedupeProducts([
      pp("osm:node-1", "osm", "Blejski grad"),
      pp("getyourguide:12345", "getyourguide", "Blejski grad"),
    ]);
    expect(res.products).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// §18b AI FIXED INVARIANT — GYG izbira je CONSTRAINT za AI
// ---------------------------------------------------------------------------

describe("TASK 46 §18: AI FIXED invariant (GYG produkt je constraint)", () => {
  test("AI kontekst vsebuje [FIXED] provider: getyourguide + id + ceno + vir", () => {
    const clean = sanitizeSelectedProviderProducts([
      toSelectedProduct(gygProduct("12345", "Ljubljana: Old Town Walking Tour")),
    ]);
    const ctx = buildSelectedProductsContext(clean, "sl");
    expect(ctx).toContain("[FIXED]");
    expect(ctx).toContain("provider: getyourguide");
    expect(ctx).toContain("id: 12345");
    expect(ctx).toContain("od 19");
    expect(ctx).toContain("GetYourGuide Partner API");
    // izrecno pravilo: NE zamenjuj FIXED produkta
    expect(ctx).toContain("NE zamenjuj FIXED produkta");
  });

  test("GYG + Viator + KiwiTaxi IZBIRE SOOBSTAJAJO v enem AI kontekstu (brez podvajanj)", () => {
    const clean = sanitizeSelectedProviderProducts([
      toSelectedProduct(gygProduct("12345", "GYG tour")),
      toSelectedProduct({
        ...gygProduct("1", "Viator tour"),
        provider: "viator",
        id: "viator:10001P1",
        providerProductId: "10001P1",
        bookingUrl: "/go/viator?product=10001P1",
        license: { source: "Viator Partner API" },
      }),
      toSelectedProduct({
        ...gygProduct("47235", "KT transfer"),
        provider: "kiwitaxi",
        id: "kiwitaxi:47235",
        providerProductId: "47235",
        type: "transfer",
        bookingUrl: "/go/transfers?product=47235",
        license: { source: "KiwiTaxi" },
      }),
    ]);
    expect(clean).toHaveLength(3);
    const ctx = buildSelectedProductsContext(clean, "sl");
    expect(ctx).toContain("provider: getyourguide");
    expect(ctx).toContain("provider: viator");
    expect(ctx).toContain("provider: kiwitaxi");
  });
});

// ---------------------------------------------------------------------------
// §23 API FAILURE ISOLATION — gyg odpoved → ostali živi
// ---------------------------------------------------------------------------

describe("TASK 46 §23: API failure isolation (GYG odpoved → ostali živi)", () => {
  const cases: Array<{ name: string; mode: Parameters<typeof gygFetch>[0] }> = [
    { name: "HTTP 400", mode: { status: 400 } },
    { name: "HTTP 401 (neveljaven žeton)", mode: { status: 401 } },
    { name: "HTTP 429 (5-minutna blokada)", mode: { status: 429 } },
    { name: "HTTP 500", mode: { status: 500 } },
    { name: "malformed JSON", mode: { malformed: true } },
    { name: "network odpoved", mode: { network: true } },
  ];

  for (const { name, mode } of cases) {
    test(`${name} × {OSM 200, KiwiTaxi 200, Viator 200} → degraded=[getyourguide], sosedje ŽIVI`, async () => {
      const gyg = createGetYourGuideAdapter(ENTRY, { fetchImpl: gygFetch(mode) });
      const res = await searchSupply(LJU_VIEW, [
        healthyAdapter("osm", "Blejski grad"),
        healthyAdapter("kiwitaxi", "Bohinj → Ljubljana"),
        healthyAdapter("viator", "Viator Bled tour"),
        gyg,
      ]);
      expect(res.degraded).toEqual(["getyourguide"]);
      expect(res.products.map((p) => p.provider).sort()).toEqual(["kiwitaxi", "osm", "viator"]);
    });
  }

  test("PRAZEN odgovor (200, 0 produktov) → NI degraded (iskren prazen sloj)", async () => {
    const gyg = createGetYourGuideAdapter(ENTRY, { fetchImpl: gygFetch({ empty: true }) });
    const res = await searchSupply(LJU_VIEW, [gyg]);
    expect(res.degraded).toEqual([]);
    expect(res.products).toHaveLength(0);
  });

  test("OBARATNO: KiwiTaxi timeout → degraded=[kiwitaxi], GYG ŽIV (izolacija v obe smeri)", async () => {
    const failingKt: SupplyAdapter = {
      entry: { ...getProvider("kiwitaxi")!, types: ["transfer"] },
      async search() {
        throw new Error("adapter-timeout");
      },
      lastRunCached() {
        return false;
      },
    };
    const gyg = createGetYourGuideAdapter(ENTRY, { fetchImpl: gygFetch({}) });
    const res = await searchSupply(
      { ...LJU_VIEW, cats: ["activity", "tour", "transfer"] },
      [failingKt, gyg]
    );
    expect(res.degraded).toEqual(["kiwitaxi"]);
    expect(res.products.map((p) => p.provider)).toEqual(["getyourguide"]);
  });

  test("VSI ŠTIRI živi (OSM + KT + Viator + GYG) → 0 degraded, vsak prispeva pin", async () => {
    const gyg = createGetYourGuideAdapter(ENTRY, { fetchImpl: gygFetch({}) });
    const res = await searchSupply(LJU_VIEW, [
      healthyAdapter("osm", "Blejski grad"),
      healthyAdapter("kiwitaxi", "Bohinj → Ljubljana"),
      healthyAdapter("viator", "Viator Bled tour"),
      gyg,
    ]);
    expect(res.degraded).toEqual([]);
    expect(res.products.map((p) => p.provider).sort()).toEqual([
      "getyourguide",
      "kiwitaxi",
      "osm",
      "viator",
    ]);
    expect(res.products).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// §17b /go/getyourguide REDIRECT SECURITY
// ---------------------------------------------------------------------------

describe("TASK 46 §17: /go/getyourguide redirect security", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GET } = require("../../app/go/[provider]/route") as {
    GET: (req: Request, ctx: { params: Promise<{ provider: string }> }) => Promise<Response>;
  };

  const call = (qs: string) =>
    GET(new Request(`http://localhost/go/getyourguide${qs}`), {
      params: Promise.resolve({ provider: "getyourguide" }),
    });

  afterEach(() => {
    delete process.env.GETYOURGUIDE_PARTNER_ID;
  });

  test("① ?url= NAPAD (open redirect) → parameter NE obstaja v arhitekturi; 302 na čisto povezavo", async () => {
    clearGygTourUrls();
    delete process.env.GETYOURGUIDE_PARTNER_ID;
    const res = await call("?url=https://attacker.example&product=12345");
    expect(res.status).toBe(302);
    const loc = res.headers.get("location")!;
    expect(loc.startsWith("https://www.getyourguide.com/")).toBe(true);
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

  test("⑤ ne-številčni product (alfanumerični kot Viatorjev) → 400 (GYG prostor ID je številčen)", async () => {
    const res = await call("?product=227717P1");
    expect(res.status).toBe(400);
  });

  test("⑥ produkt IZ PREDPOMNILNIKA (iz vira) → 302 na tour.url (monetizirano)", async () => {
    clearGygTourUrls();
    gygTourToProduct(officialTour(), MAP_CTX); // napolni predpomnilnik
    const res = await call("?product=12345");
    expect(res.status).toBe(302);
    const loc = res.headers.get("location")!;
    expect(loc).toBe(officialTour().url!);
    expect(loc).toContain("partner_id=TEST"); // vir samodejno priključi partner_id
  });

  test("⑦ BREZ predpomnilnika + GETYOURGUIDE_PARTNER_ID → domača stran z partner_id (monetized)", async () => {
    clearGygTourUrls();
    process.env.GETYOURGUIDE_PARTNER_ID = "TESTPID";
    const res = await call("?product=12345");
    expect(res.status).toBe(302);
    const loc = res.headers.get("location")!;
    expect(loc).toBe("https://www.getyourguide.com/?partner_id=TESTPID");
  });

  test("⑧ BREZ predpomnilnika BREZ partner_id → čista povezava (monetized: false — fail-closed)", async () => {
    clearGygTourUrls();
    delete process.env.GETYOURGUIDE_PARTNER_ID;
    const res = await call("?product=12345");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://www.getyourguide.com/");
  });

  test("⑨ neznan provider → 404 (allowlist)", async () => {
    const res = await GET(new Request("http://localhost/go/getyourguide2"), {
      params: Promise.resolve({ provider: "getyourguide2" }),
    });
    expect(res.status).toBe(404);
  });

  test("⑩ predpomnjen ZLOBEN URL (tuj host) NE more obstajati (meja rememberGygTourUrl)", async () => {
    clearGygTourUrls();
    // poskus vbrizga zlobnega URL v predpomnilnik prek preslikave vira
    gygTourToProduct(officialTour({ url: "https://evil.example.com/x" }), MAP_CTX);
    delete process.env.GETYOURGUIDE_PARTNER_ID;
    const res = await call("?product=12345");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")!).toBe("https://www.getyourguide.com/"); // fail-closed
  });
});

// ---------------------------------------------------------------------------
// §17 SECURITY — provider response je UNTRUSTED INPUT (meja adapterja)
// ---------------------------------------------------------------------------

describe("TASK 46 §17: adversarial vhodi na meji preslikave", () => {
  test("① ZLOBEN naslov (HTML/script) → očiščen injekcijski nabor znakov", () => {
    clearGygTourUrls();
    const p = gygTourToProduct(
      officialTour({ title: '<script>alert("XSS")</script> Ljubljana tour' }),
      MAP_CTX
    );
    expect(p).not.toBeNull();
    expect(p!.title).not.toContain("<");
    expect(p!.title).not.toContain(">");
    expect(p!.title).not.toContain('"');
    expect(p!.title).not.toContain("<script"); // oznaka NE more obstati
    expect(p!.title).toContain("Ljubljana tour");
  });

  test("② ZLOBEN abstract → očiščen (isti nabor kot naslov)", () => {
    const p = gygTourToProduct(
      officialTour({ abstract: 'Dangerous `description` ${x} <img src=x onerror=alert(1)>' }),
      MAP_CTX
    );
    expect(p).not.toBeNull();
    expect(p!.description).not.toContain("<");
    expect(p!.description).not.toContain("`");
    expect(p!.description).not.toContain("${");
  });

  test("③ KONTROLNI znaki (\\u0000–\\u001f, \\u007f) ostranjeni", () => {
    const p = gygTourToProduct(
      officialTour({ title: "Lju\x00blja\x1fna\x7f tour" }),
      MAP_CTX
    );
    expect(p!.title).toBe("Ljubljana tour");
  });

  test("④ OGROMEN naslov/opis → kap dolžine (200/1200)", () => {
    const p = gygTourToProduct(
      officialTour({
        title: "X".repeat(5000),
        abstract: "Y".repeat(5000),
      }),
      MAP_CTX
    );
    expect(p!.title.length).toBeLessThanOrEqual(200);
    expect((p!.description ?? "").length).toBeLessThanOrEqual(1200);
  });

  test("⑤ wrong-type pictures (objekt/niz/številka/null) → slika ODSOTNA, NE sesuje", () => {
    for (const pictures of [
      "ne-array" as unknown as GygTour["pictures"],
      42 as unknown as GygTour["pictures"],
      null as unknown as GygTour["pictures"],
      [null as unknown as never],
      [42 as unknown as never],
    ]) {
      const p = gygTourToProduct(officialTour({ pictures }), MAP_CTX);
      expect(p).not.toBeNull();
      expect(p!.image).toBeUndefined();
    }
  });

  test("⑥ wrong-type nested price/locations/durations → polja ODSOTNA, NE sesuje", () => {
    const p = gygTourToProduct(
      officialTour({
        price: "free" as unknown as GygTour["price"],
        locations: "x" as unknown as GygTour["locations"],
        durations: 5 as unknown as GygTour["durations"],
      }),
      MAP_CTX
    );
    expect(p).not.toBeNull();
    expect(p!.price).toBeUndefined();
    expect(p!.address).toBeUndefined();
    expect(p!.description).not.toContain("Trajanje");
  });

  test("⑦ cena kot NIZ v viru → price undefined (typeof meja)", () => {
    const p = gygTourToProduct(
      officialTour({
        price: { values: { amount: "19" as unknown as number }, description: "individual" },
      }),
      MAP_CTX
    );
    expect(p!.price).toBeUndefined();
  });

  test("⑧ nested wrong-type overall_rating/number_of_ratings → ocena ODSOTNA", () => {
    const p = gygTourToProduct(
      officialTour({
        overall_rating: NaN,
        number_of_ratings: 850,
      }),
      MAP_CTX
    );
    expect(p!.rating).toBeUndefined();
    const p2 = gygTourToProduct(
      officialTour({
        overall_rating: 4.5,
        number_of_ratings: Infinity,
      }),
      MAP_CTX
    );
    expect(p2!.rating).toBeUndefined();
    expect(p2!.reviewCount).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// §8 NO FAKE FALLBACK — source-scan CELE getyourguide mape
// ---------------------------------------------------------------------------

describe("TASK 46 §8: NI fake/demo inventarja (source-scan)", () => {
  const GYG_DIR = join(import.meta.dir, "../supply/providers/getyourguide");

  test("① nobena datoteka GYG ne vsebuje sample/DEMO/fallback produktov", () => {
    const files = readdirSync(GYG_DIR).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThanOrEqual(4); // adapter/client/mapper/types
    for (const f of files) {
      const src = readFileSync(join(GYG_DIR, f), "utf-8");
      expect(src.includes("sample")).toBe(false);
      expect(src.includes("DEMO_")).toBe(false);
      expect(src.includes("fallbackProducts")).toBe(false);
      expect(src.includes("hardcodedProducts")).toBe(false);
    }
  });

  test("② NI statičnih JSON/CSV/inventarskih podatkov v mapi (podatki izključno iz API-ja)", () => {
    const dataFiles = readdirSync(GYG_DIR).filter((f) => /\.(json|csv|db)$/i.test(f));
    expect(dataFiles).toEqual([]); // GYG je ČISTO API (kot Viator)
  });

  test("③ iskrena opomba not-configured ostaja (NI lažnega LIVE)", () => {
    const src = readFileSync(join(GYG_DIR, "adapter.ts"), "utf-8");
    expect(src.includes("not-configured")).toBe(true);
  });

  test("④ kanonski model NI razširjen z GYG specifičnimi polji (0 gyg* polj v types.ts)", () => {
    const src = readFileSync(
      join(import.meta.dir, "../supply/types.ts"),
      "utf-8"
    );
    expect(src.includes("gygProductId")).toBe(false);
    expect(src.includes("gygRating")).toBe(false);
    expect(src.includes("gygDestination")).toBe(false);
    expect(src.includes("getYourGuideProductId")).toBe(false);
    expect(src.includes("gygTourId")).toBe(false);
  });
});
