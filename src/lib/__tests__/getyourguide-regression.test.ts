// ============================================================================
// TASK 46 §20–§28 — GETYOURGUIDE: REGRESIJA + IZOLACIJA + DISCIPLINA + i18n
// ============================================================================
// Druga faza specifikacije Taska 46 (dostavljena po zaključku §1–§19 v
// commitu 91332df). Ta datoteka pokriva:
//
// §20  REGRESIJA KOMBINACIJ — OSM / KiwiTaxi / Viator / GetYourGuide vsemi
//      kombinacijami (4 samotne + 6 parov + vse 4). Viator not-configured
//      NE vpliva na KiwiTaxi. GYG odpoved NE pokvari OSM+KiwiTaxi.
// §21  IZOLACIJA ODPOVEDI — GYG {200, empty, malformed, 400, 401, 403,
//      429, 500, timeout} × živi sosedi → degraded=[getyourguide], NIKOLI
//      „whole supply failed“. Točen scenarij naročnika: OSM=200, KT=200,
//      Viator=not-configured, GYG=timeout → OSM+KT produkti,
//      degraded=[getyourguide].
// §22  VARNOST — ogromni nizi/seznavi v odgovoru vira, encoded URL,
//      unexpected JSON oblike, /go oversize/ničelni ID.
// §23  REDIRECT — /go/getyourguide BREZ produkta → fail-closed čista
//      povezava (open redirect nemogoč).
// §24  REQUEST DISCIPLINA — klient timeout (dira), AbortSignal propagacija,
//      coalescing sub-mrežnih pan-ov (< 0,02°), zaporedna enaka poizvedba =
//      NOV klic (POGODBA VIRA prepoveduje predpomnilnik izpisa — iskreno).
// §25  i18n — SL in EN izpisi celotnega produkta; NI SL besedila v EN
//      izpisu in obratno.
// §28  REGRESIJA — realna KiwiTaxi plast (dataset 1494 rut) + realni GYG
//      adapter v ISTI poizvedbi; OSM lokalni fuzzy dedupe intakten.
// ============================================================================
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  createGetYourGuideAdapter,
  resetGetYourGuideAdapterCaches,
} from "@/lib/supply/providers/getyourguide/adapter";
import { gygTourToProduct, clearGygTourUrls } from "@/lib/supply/providers/getyourguide/mapper";
import { gygImageUrl } from "@/lib/supply/providers/getyourguide/mapper";
import { GygClient, GygApiError } from "@/lib/supply/providers/getyourguide/client";
import { createViatorAdapter, resetViatorAdapterCaches } from "@/lib/supply/providers/viator/adapter";
import { createKiwiTaxiAdapter } from "@/lib/supply/providers/kiwitaxi/adapter";
import { resetKiwitaxiDataset } from "@/lib/supply/providers/kiwitaxi/dataset";
import { searchSupply, clearProviderRateLimits } from "@/lib/supply/search";
import { getProvider } from "@/lib/supply/registry";
import { dedupeProducts } from "@/lib/supply/dedupe";
import type { SupplyAdapter } from "@/lib/supply/adapter";
import type { ProviderProduct, ProviderSlug, SupplyQuery } from "@/lib/supply/types";
import type { GygTour } from "@/lib/supply/providers/getyourguide/types";

// ---------------------------------------------------------------------------
// SKUPNE GRADNICE
// ---------------------------------------------------------------------------

const ENTRY = getProvider("getyourguide")!;

/** Vse kategorije, ki sprožijo vse štiri adapterje pri zoom 12. */
const ALL_CATS: SupplyQuery = {
  bbox: [46.02, 14.47, 46.09, 14.55],
  zoom: 12,
  cats: ["attraction", "activity", "tour", "transfer"],
  locale: "sl",
};

const MAP_CTX = {
  locale: "sl" as const,
  fetchedAt: "2026-09-18T12:00:00Z",
  currencyConfirmedEur: true,
  dateFiltered: false,
};

const MAP_CTX_EN = { ...MAP_CTX, locale: "en" as const };

/** Uradni primer vira (Making-a-booking.md — t66985, prilagojen Ljubljani,
 *  da mine adapterjev post-filter pinov na LJU bbox). */
function officialTour(overrides: Partial<GygTour> = {}): GygTour {
  return {
    tour_id: 66985,
    title: "Paris: Catacombs Direct Entry Ticket",
    abstract: "Skip the cash desk line.",
    overall_rating: 4.5,
    number_of_ratings: 7000,
    pictures: [
      { ssl_url: "https://cdn.getyourguide.com/img/tour/59cba8cb6b06c.jpeg/[format_id].jpg" },
    ],
    coordinates: { lat: 46.0569, long: 14.5058 }, // znotraj LJU_VIEW bbox
    price: { values: { amount: 29 }, description: "individual" },
    url: "https://www.getyourguide.com/paris-l16/x-t66985/?partner_id=TEST&psrc=partner_api&currency=EUR",
    durations: [{ duration: 1, unit: "hour" }],
    activity_type: "entryTicket",
    ...overrides,
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

/** Mock fetch z nadzorovano odpovedjo /1/tours (razširjena o 403/timeout). */
function gygFetch(mode: {
  status?: number;
  malformed?: boolean;
  network?: boolean;
  empty?: boolean;
  timeout?: boolean;
  tours?: GygTour[];
}): typeof fetch {
  return (async () => {
    if (mode.timeout) {
      // Simulacija dirе (klientov AbortController sproži odbijanje fetch-a):
      // AbortError brez zunanjega signala → klasifikacija „timeout“.
      throw Object.assign(new Error("The operation was aborted"), {
        name: "AbortError",
      });
    }
    if (mode.network) throw new TypeError("fetch-failed");
    if (mode.status) return new Response("{}", { status: mode.status });
    if (mode.malformed) return new Response("not-json{{", { status: 200 });
    const tours = mode.tours ?? (mode.empty ? [] : [officialTour()]);
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
let prevViatorKey: string | undefined;

beforeEach(() => {
  prevToken = process.env.GETYOURGUIDE_API_TOKEN;
  prevPid = process.env.GETYOURGUIDE_PARTNER_ID;
  prevViatorKey = process.env.VIATOR_API_KEY;
  process.env.GETYOURGUIDE_API_TOKEN = "test-gyg-token";
  delete process.env.GETYOURGUIDE_PARTNER_ID;
  delete process.env.VIATOR_API_KEY; // realni Viator = not-configured
  resetGetYourGuideAdapterCaches();
  resetViatorAdapterCaches();
  clearGygTourUrls();
  // NE puščamo rate-limit okna (OSM cap 60) poznejšim datotekam — isti
  // vzorec kot getyourguide-adapter.test.ts (vsi adapterji z istim slugom
  // delijo strežniško okno, tudi mock lažni adapterji).
  clearProviderRateLimits();
});

afterEach(() => {
  if (prevToken === undefined) delete process.env.GETYOURGUIDE_API_TOKEN;
  else process.env.GETYOURGUIDE_API_TOKEN = prevToken;
  if (prevPid === undefined) delete process.env.GETYOURGUIDE_PARTNER_ID;
  else process.env.GETYOURGUIDE_PARTNER_ID = prevPid;
  if (prevViatorKey === undefined) delete process.env.VIATOR_API_KEY;
  else process.env.VIATOR_API_KEY = prevViatorKey;
  resetGetYourGuideAdapterCaches();
  resetViatorAdapterCaches();
  resetKiwitaxiDataset();
  clearGygTourUrls();
  clearProviderRateLimits();
});

// ---------------------------------------------------------------------------
// §20 REGRESIJA KOMBINACIJ — 4 providerji, vse kombinacije
// ---------------------------------------------------------------------------

describe("TASK 46 §20: kombinacijska matrika OSM × KiwiTaxi × Viator × GYG", () => {
  const healthy = {
    osm: () => healthyAdapter("osm", "Blejski grad"),
    kiwitaxi: () => healthyAdapter("kiwitaxi", "Bohinj → Ljubljana"),
    viator: () => healthyAdapter("viator", "Viator Bled tour"),
  };
  const gyg = () => createGetYourGuideAdapter(ENTRY, { fetchImpl: gygFetch({}) });

  const cases: Array<{ name: string; build: () => SupplyAdapter[]; expect: ProviderSlug[] }> = [
    { name: "OSM", build: () => [healthy.osm()], expect: ["osm"] },
    { name: "KiwiTaxi", build: () => [healthy.kiwitaxi()], expect: ["kiwitaxi"] },
    { name: "Viator", build: () => [healthy.viator()], expect: ["viator"] },
    { name: "GetYourGuide", build: () => [gyg()], expect: ["getyourguide"] },
    { name: "OSM + KiwiTaxi", build: () => [healthy.osm(), healthy.kiwitaxi()], expect: ["kiwitaxi", "osm"] },
    { name: "OSM + Viator", build: () => [healthy.osm(), healthy.viator()], expect: ["osm", "viator"] },
    { name: "OSM + GetYourGuide", build: () => [healthy.osm(), gyg()], expect: ["getyourguide", "osm"] },
    { name: "KiwiTaxi + Viator", build: () => [healthy.kiwitaxi(), healthy.viator()], expect: ["kiwitaxi", "viator"] },
    { name: "KiwiTaxi + GetYourGuide", build: () => [healthy.kiwitaxi(), gyg()], expect: ["getyourguide", "kiwitaxi"] },
    { name: "Viator + GetYourGuide", build: () => [healthy.viator(), gyg()], expect: ["getyourguide", "viator"] },
    {
      name: "OSM + KiwiTaxi + Viator + GetYourGuide",
      build: () => [healthy.osm(), healthy.kiwitaxi(), healthy.viator(), gyg()],
      expect: ["getyourguide", "kiwitaxi", "osm", "viator"],
    },
  ];

  for (const { name, build, expect: expected } of cases) {
    test(`${name} → vsak ponudnik prispeva pin, 0 degraded, 0 duplikatov`, async () => {
      const res = await searchSupply(ALL_CATS, build());
      expect(res.degraded).toEqual([]);
      expect(res.products.map((p) => p.provider).sort()).toEqual(expected);
      expect(res.duplicates).toBe(0);
    });
  }

  test("Viator NOT_CONFIGURED (realni adapter, brez ključa) NE vpliva na KiwiTaxi (realni dataset)", async () => {
    const viator = createViatorAdapter(getProvider("viator")!); // brez VIATOR_API_KEY
    const kt = createKiwiTaxiAdapter(getProvider("kiwitaxi")!); // realni dataset
    const res = await searchSupply(
      { ...ALL_CATS, cats: ["activity", "tour", "transfer"] },
      [viator, kt]
    );
    // Viator not-configured ≠ degraded (iskreno prazen sloj z opombo)
    expect(res.degraded).toEqual([]);
    const ktProducts = res.products.filter((p) => p.provider === "kiwitaxi");
    expect(ktProducts.length).toBeGreaterThan(0); // KT ŽIV kljub viator=not-configured
    expect(ktProducts.every((p) => /^\d+$/.test(p.providerProductId))).toBe(true); // realni ID-ji
    const viatorInfo = res.adapters.find((a) => a.slug === "viator");
    expect(viatorInfo?.ok).toBe(true);
    expect(viatorInfo?.count).toBe(0);
    expect(viatorInfo?.note).toBe("not-configured");
  });

  test("GYG ODPOVE (500) → KiwiTaxi in OSM ostaneva UPORABNA", async () => {
    const gyg = createGetYourGuideAdapter(ENTRY, { fetchImpl: gygFetch({ status: 500 }) });
    const res = await searchSupply(ALL_CATS, [
      healthy.osm(),
      healthy.kiwitaxi(),
      gyg,
    ]);
    expect(res.degraded).toEqual(["getyourguide"]);
    expect(res.products.map((p) => p.provider).sort()).toEqual(["kiwitaxi", "osm"]);
  });
});

// ---------------------------------------------------------------------------
// §21 IZOLACIJA ODPOVEDI — popolna matrika (dopolnjena o 403 + timeout)
// ---------------------------------------------------------------------------

describe("TASK 46 §21: izolacija odpovedi — GYG {200, empty, malformed, 400, 401, 403, 429, 500, timeout}", () => {
  const failing: Array<{ name: string; mode: Parameters<typeof gygFetch>[0] }> = [
    { name: "HTTP 400", mode: { status: 400 } },
    { name: "HTTP 401 (neveljaven žeton)", mode: { status: 401 } },
    { name: "HTTP 403 (tier brez dostopa)", mode: { status: 403 } },
    { name: "HTTP 429 (5-minutna blokada vira)", mode: { status: 429 } },
    { name: "HTTP 500", mode: { status: 500 } },
    { name: "malformed JSON", mode: { malformed: true } },
    { name: "network odpoved", mode: { network: true } },
    { name: "timeout", mode: { timeout: true } },
  ];

  for (const { name, mode } of failing) {
    test(`${name} × {OSM 200, KT 200, Viator 200} → degraded=[getyourguide], sosedi ŽIVI (NE „whole supply failed")`, async () => {
      const gyg = createGetYourGuideAdapter(ENTRY, { fetchImpl: gygFetch(mode) });
      const res = await searchSupply(ALL_CATS, [
        healthyAdapter("osm", "Blejski grad"),
        healthyAdapter("kiwitaxi", "Bohinj → Ljubljana"),
        healthyAdapter("viator", "Viator Bled tour"),
        gyg,
      ]);
      expect(res.degraded).toEqual(["getyourguide"]);
      expect(res.products.map((p) => p.provider).sort()).toEqual(["kiwitaxi", "osm", "viator"]);
      // odgovor JE uspešen (200-oblika) — sloj NE sesuje celotnega supply
      expect(Array.isArray(res.products)).toBe(true);
      expect(res.counts.byProvider?.getyourguide ?? 0).toBe(0);
    });
  }

  test("GYG 200 (prazen seznam) → NI degraded (iskren prazen sloj)", async () => {
    const gyg = createGetYourGuideAdapter(ENTRY, { fetchImpl: gygFetch({ empty: true }) });
    const res = await searchSupply(ALL_CATS, [gyg]);
    expect(res.degraded).toEqual([]);
    expect(res.products).toHaveLength(0);
  });

  test("TOČEN SCENARIJ §21: OSM=200, KT=200 (realni dataset), Viator=not-configured (realni), GYG=timeout → OSM+KT produkti, degraded=[getyourguide]", async () => {
    const gyg = createGetYourGuideAdapter(ENTRY, { fetchImpl: gygFetch({ timeout: true }) });
    const res = await searchSupply(
      { ...ALL_CATS, cats: ["attraction", "activity", "tour", "transfer"] },
      [
        healthyAdapter("osm", "Blejski grad"),
        createKiwiTaxiAdapter(getProvider("kiwitaxi")!),
        createViatorAdapter(getProvider("viator")!), // not-configured (brez ključa)
        gyg,
      ]
    );
    expect(res.degraded).toEqual(["getyourguide"]); // TOČNO — ne „whole supply failed"
    const providers = new Set(res.products.map((p) => p.provider));
    expect(providers.has("osm")).toBe(true);
    expect(providers.has("kiwitaxi")).toBe(true); // realni dataset produkti
    expect(providers.has("viator")).toBe(false); // not-configured = prazen, NE degraded
    expect(providers.has("getyourguide")).toBe(false); // padel vir
  });
});

// ---------------------------------------------------------------------------
// §22 VARNOST — dopolnitve (ogromni seznami, encoded URL, unexpected JSON,
// /go oversize ID)
// ---------------------------------------------------------------------------

describe("TASK 46 §22: varnost — ogromni vhodi in nestandardne oblike", () => {
  test("OGROMEN seznam slik (10.000 vnosov) → preslikava USPE, uporabi samo pictures[0]", () => {
    const pictures = Array.from({ length: 10_000 }, (_, i) => ({
      ssl_url: `https://cdn.getyourguide.com/img/tour/x${i}.jpeg/[format_id].jpg`,
    }));
    const p = gygTourToProduct(officialTour({ pictures }), MAP_CTX);
    expect(p).not.toBeNull();
    expect(p!.image).toBe("https://cdn.getyourguide.com/img/tour/x0.jpeg/132.jpg");
  });

  test("OGROMEN seznam lokacij (10.000) → NE sesuje (iskanje city/poi + locations[0])", () => {
    const locations = Array.from({ length: 10_000 }, () => ({
      type: "area",
      name: "X".repeat(80),
    }));
    locations[9999] = { type: "city", name: "Ljubljana" };
    const p = gygTourToProduct(officialTour({ locations }), MAP_CTX);
    expect(p).not.toBeNull();
    expect(p!.address).toBe("Ljubljana");
  });

  test("OGROMEN seznam tur (1.000 veljavnih) → vsi preslikani brez sesutja (kap da runner)", async () => {
    const tours = Array.from({ length: 1_000 }, (_, i) =>
      officialTour({ tour_id: 100_000 + i, title: `Tour ${i}` })
    );
    const gyg = createGetYourGuideAdapter(ENTRY, { fetchImpl: gygFetch({ tours }) });
    const products = await gyg.search(ALL_CATS);
    expect(products).toHaveLength(1_000);
    expect(products.every((p) => p.provider === "getyourguide")).toBe(true);
  });

  test("KODIRAN URL v slikah (https%3A%2F%2Fevil…) → NEVALIDEN (URL parser meja)", () => {
    expect(gygImageUrl("https%3A%2F%2Fevil.example.com%2Fx.jpg")).toBeUndefined();
    expect(gygImageUrl("https://evil.example.com/%2E%2E%2Fgetyourguide.com/x.jpg")).toBeUndefined();
    expect(gygImageUrl(`${"a".repeat(501)}`)).toBeUndefined(); // oversize
  });

  test("UNEXPECTED JSON: data je SEZNAM (ne objekt) → invalid-response (adapter degraded, NE sesuje)", async () => {
    const raw = (async () =>
      new Response(JSON.stringify({ data: ["t1", "t2"] }), { status: 200 })) as unknown as typeof fetch;
    const gyg = createGetYourGuideAdapter(ENTRY, { fetchImpl: raw });
    try {
      await gyg.search(ALL_CATS);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(GygApiError);
      expect((e as GygApiError).kind).toBe("invalid-response");
    }
  });

  test("UNEXPECTED JSON: data.tours vsebuje MEŠANE tipe → samo veljavni preslikani (fail-safe)", async () => {
    const tours = [
      officialTour(),
      null,
      42,
      "x",
      { tour_id: 5, title: "Drugi veljavni" },
    ] as unknown as GygTour[];
    const gyg = createGetYourGuideAdapter(ENTRY, { fetchImpl: gygFetch({ tours }) });
    const products = await gyg.search(ALL_CATS);
    expect(products).toHaveLength(2);
    expect(products.map((p) => p.providerProductId).sort()).toEqual(["5", "66985"]);
  });

  test("/go oversize ID (11 števk) in ničelni/negativni ID → 400", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GET } = require("../../app/go/[provider]/route") as {
      GET: (req: Request, ctx: { params: Promise<{ provider: string }> }) => Promise<Response>;
    };
    const call = (qs: string) =>
      GET(new Request(`http://localhost/go/getyourguide${qs}`), {
        params: Promise.resolve({ provider: "getyourguide" }),
      });
    for (const qs of ["?product=12345678901", "?product=0", "?product=-5", "?product=99999999999999999999"]) {
      const res = await call(qs);
      expect(res.status).toBe(400);
      expect(res.headers.get("location")).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// §23 REDIRECT — /go/getyourguide BREZ produkta (fail-closed)
// ---------------------------------------------------------------------------

describe("TASK 46 §23: /go/getyourguide brez produkta → čista povezava (fail-closed)", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GET } = require("../../app/go/[provider]/route") as {
    GET: (req: Request, ctx: { params: Promise<{ provider: string }> }) => Promise<Response>;
  };

  test("BREZ product parametra → 302 na https://www.getyourguide.com/ (monetizacija NI konfigurirana — NE 400)", async () => {
    clearGygTourUrls();
    const res = await GET(new Request("http://localhost/go/getyourguide"), {
      params: Promise.resolve({ provider: "getyourguide" }),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://www.getyourguide.com/");
  });

  test("BREZ produkta + partner_id konfiguriran → 302 z partner_id (monetizirano)", async () => {
    clearGygTourUrls();
    process.env.GETYOURGUIDE_PARTNER_ID = "TESTPID";
    const res = await GET(new Request("http://localhost/go/getyourguide"), {
      params: Promise.resolve({ provider: "getyourguide" }),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://www.getyourguide.com/?partner_id=TESTPID");
  });
});

// ---------------------------------------------------------------------------
// §24 REQUEST DISCIPLINA — timeout, AbortSignal, coalescing, disciplina pana
// ---------------------------------------------------------------------------

describe("TASK 46 §24: request disciplina (timeout / abort / coalescing / panning)", () => {
  /** Obeseni fetch, ki spoštuje init.signal (kot pravi fetch). */
  const hangingFetch = ((async (_url: string | URL | Request, init?: RequestInit) => {
    return await new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(Object.assign(new Error("The operation was aborted"), { name: "AbortError" }));
      });
    });
  }) as unknown as typeof fetch);

  test("KLIENT TIMEOUT: vir ne odgovori v roku → GygApiError kind „timeout“ (dira NE hang)", async () => {
    const client = new GygClient({
      apiToken: "test-token",
      timeoutMs: 20,
      fetchImpl: hangingFetch,
    });
    const started = Date.now();
    try {
      await client.searchTours({ coordinates: [46.05, 14.5, 30], limit: 24 });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(GygApiError);
      expect((e as GygApiError).kind).toBe("timeout");
    }
    expect(Date.now() - started).toBeLessThan(1_000); // NE obesi
  });

  test("ABORT SIGNAL: preklic odjemalca se ŠIRI do vira → kind „aborted“ (NI napaka vira)", async () => {
    const client = new GygClient({
      apiToken: "test-token",
      timeoutMs: 5_000,
      fetchImpl: hangingFetch,
    });
    const controller = new AbortController();
    const task = client.searchTours(
      { coordinates: [46.05, 14.5, 30], limit: 24 },
      { signal: controller.signal }
    );
    setTimeout(() => controller.abort(), 15);
    try {
      await task;
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(GygApiError);
      expect((e as GygApiError).kind).toBe("aborted");
    }
  });

  test("COALESCING PANA: dve SOČASNI poizvedbi z bbox-om, ki se razlikujeta < 0,02° (sub-mreža) → EN klic vira", async () => {
    let calls = 0;
    const countingFetch = (async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 30)); // počasen vir → sočasnost
      return new Response(
        JSON.stringify({
          _metadata: { exchange: { rate: 1, currency: "eur" } },
          data: { tours: [officialTour()] },
        }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;
    const gyg = createGetYourGuideAdapter(ENTRY, { fetchImpl: countingFetch });
    const pan1 = { ...ALL_CATS, bbox: [46.02, 14.47, 46.09, 14.55] as [number, number, number, number] };
    const pan2 = { ...ALL_CATS, bbox: [46.025, 14.475, 46.095, 14.555] as [number, number, number, number] }; // premik 0,005°
    const [r1, r2] = await Promise.all([gyg.search(pan1), gyg.search(pan2)]);
    expect(calls).toBe(1); // ENA izvedba za obe sočasni poizvedbi
    expect(r1).toHaveLength(1);
    expect(r2).toHaveLength(1);
  });

  test("ZAPOREDNA enaka poizvedba = NOV klic vira (POGODBA: vir prepoveduje predpomnilnik izpisa — iskrena odločitev, dokumentirana v registru cacheTtlMs 0)", async () => {
    let calls = 0;
    const countingFetch = (async () => {
      calls++;
      return new Response(
        JSON.stringify({
          _metadata: { exchange: { rate: 1, currency: "eur" } },
          data: { tours: [officialTour()] },
        }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;
    const gyg = createGetYourGuideAdapter(ENTRY, { fetchImpl: countingFetch });
    await gyg.search(ALL_CATS);
    await gyg.search(ALL_CATS);
    expect(calls).toBe(2); // NE cachamo izpisa (pogodba vira) — vsak klic je svež
  });

  test("REGISTRARNA MEJA: maxCallsPerMin 60 < 130 uradnega limita vira (vljudnost + blokada 5 min)", () => {
    expect(ENTRY.maxCallsPerMin).toBeLessThanOrEqual(60);
    expect(ENTRY.maxCallsPerMin).toBeLessThan(130);
    expect(ENTRY.timeoutMs).toBeLessThanOrEqual(10_000);
  });
});

// ---------------------------------------------------------------------------
// §25 INTERNATIONALIZACIJA — SL + EN izpisi (NI SL v EN, NI EN v SL)
// ---------------------------------------------------------------------------

describe("TASK 46 §25: i18n — celoten produkt v SL in EN", () => {
  test("EN locale: VSE opombe v angleščini (cena, razpoložljivost, trajanje)", () => {
    const p = gygTourToProduct(officialTour(), MAP_CTX_EN);
    expect(p?.price?.note).toBe("from price (lowest, per person)");
    expect(p?.availability?.note).toBe("availability confirmed with the provider");
    expect(p?.description).toContain("Duration: 1 h");
    // NI slovenskih nizov v EN izpilu:
    expect(p?.price?.note).not.toMatch(/od-cena|na osebo/);
    expect(p?.availability?.note).not.toMatch(/razpoložljivost|ponudniku/);
    expect(p?.description).not.toContain("Trajanje");
  });

  test("SL locale: VSE opombe v slovenščini", () => {
    const p = gygTourToProduct(officialTour(), MAP_CTX);
    expect(p?.price?.note).toBe("od-cena (najnižja, na osebo)");
    expect(p?.availability?.note).toBe("razpoložljivost se preveri pri ponudniku");
    expect(p?.description).toContain("Trajanje: 1 h");
    // NI angleških nizov v SL izpilu:
    expect(p?.price?.note).not.toMatch(/from price|per person/);
    expect(p?.availability?.note).not.toMatch(/availability|provider/);
    expect(p?.description).not.toContain("Duration");
  });

  test("EN „per group“: enota total + EN opomba (semantika vira ohranjena v obeh jezikih)", () => {
    const en = gygTourToProduct(
      officialTour({ price: { values: { amount: 250 }, description: "per Group up to 10 people" } }),
      MAP_CTX_EN
    );
    expect(en?.price?.unit).toBe("total");
    expect(en?.price?.note).toBe("from price per group (source)");
    const sl = gygTourToProduct(
      officialTour({ price: { values: { amount: 250 }, description: "per Group up to 10 people" } }),
      MAP_CTX
    );
    expect(sl?.price?.note).toBe("od-cena na skupino (vir)");
  });

  test("TRAJANJE dnevi/minuti: lokalizirana oznaka (day/days — min)", () => {
    const enDays = gygTourToProduct(
      officialTour({ durations: [{ duration: 2, unit: "day" }] }),
      MAP_CTX_EN
    );
    expect(enDays?.description).toContain("Duration: 2 days");
    const slMin = gygTourToProduct(
      officialTour({ durations: [{ duration: 90, unit: "minute" }] }),
      MAP_CTX
    );
    expect(slMin?.description).toContain("Trajanje: 90 min");
  });

  test("REGISTRARNA accessNote je DVOJEZIČNA (provider panel SL+EN)", () => {
    expect(ENTRY.accessNote?.sl.length).toBeGreaterThan(10);
    expect(ENTRY.accessNote?.en.length).toBeGreaterThan(10);
    expect(ENTRY.accessNote?.en).not.toBe(ENTRY.accessNote?.sl);
  });
});

// ---------------------------------------------------------------------------
// §28 REGRESIJA — realni KiwiTaxi + realni GYG v isti poizvedbi; OSM fuzzy
// ---------------------------------------------------------------------------

describe("TASK 46 §28: regresija — realni providerji soobstajajo z GYG", () => {
  test("REALNI KiwiTaxi (dataset 1494 rut) + REALNI GYG adapter v ENI poizvedbi → oba prispevata, 0 duplikatov med njima", async () => {
    const kt = createKiwiTaxiAdapter(getProvider("kiwitaxi")!);
    const gyg = createGetYourGuideAdapter(ENTRY, { fetchImpl: gygFetch({}) });
    const res = await searchSupply(
      { ...ALL_CATS, cats: ["activity", "tour", "transfer"] },
      [kt, gyg]
    );
    expect(res.degraded).toEqual([]);
    const ktProducts = res.products.filter((p) => p.provider === "kiwitaxi");
    const gygProducts = res.products.filter((p) => p.provider === "getyourguide");
    expect(ktProducts.length).toBeGreaterThan(0); // realni dataset produkti (LJU viewport)
    expect(gygProducts).toHaveLength(1); // uradni primer vira
    expect(gygProducts[0]?.providerProductId).toBe("66985");
    // realni KT ID-ji so numerični (dataset), GYG ID je tour_id — LOČENA prostora
    expect(ktProducts.some((p) => p.providerProductId === "66985")).toBe(false);
  });

  test("OSM lokalni fuzzy dedupe OSTAJA intakten (isti naslov OSM+OSM → 1; GYG z istim naslovom NE vpliva)", () => {
    const osmA: ProviderProduct = {
      id: "osm:node-1",
      provider: "osm",
      providerProductId: "node-1",
      type: "attraction",
      title: "Blejski grad",
      lat: 46.04,
      lng: 14.11,
      bookingMode: "info_only",
      lastUpdated: "2026-09-18T00:00:00Z",
    };
    const osmB = { ...osmA, id: "osm:node-2", providerProductId: "node-2" };
    const gygP: ProviderProduct = {
      id: "getyourguide:1",
      provider: "getyourguide",
      providerProductId: "1",
      type: "tour",
      title: "Blejski grad",
      lat: 46.04,
      lng: 14.11,
      bookingMode: "affiliate_redirect",
      lastUpdated: "2026-09-18T00:00:00Z",
    };
    // lokalni fuzzy: OSM+OSM z istim naslovom/lokacijo → združi (OBSTOJEČA semantika)
    const local = dedupeProducts([osmA, osmB]);
    expect(local.products).toHaveLength(1);
    // komercialni NE sme vplivati nanj: GYG + 2 OSM → GYG ostane + OSM se združi
    const mixed = dedupeProducts([osmA, osmB, gygP]);
    expect(mixed.products.map((p) => p.provider).sort()).toEqual(["getyourguide", "osm"]);
  });

  test("Viator regresija: pogodbene glave ostanejo LOČENE (GYG X-ACCESS-TOKEN NE pušča v Viator klicu in obratno)", async () => {
    // GYG klient ne more poslati exp-api-key (Viator glava) — dokazano v
    // pogodbenih testih; tu preverjamo, da vira GYG ne onesnažijo Viator
    // glave in da pot ostaja /1/tours.
    let captured: { url: string; headers: Record<string, string> } | null = null;
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      captured = { url: String(url), headers: (init?.headers ?? {}) as Record<string, string> };
      return new Response(
        JSON.stringify({ data: { tours: [officialTour()] } }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;
    const client = new GygClient({ apiToken: "gyg-token", fetchImpl });
    await client.searchTours({ coordinates: [46.05, 14.5, 30], limit: 24 });
    expect(captured!.url.startsWith("https://api.getyourguide.com/1/tours?")).toBe(true);
    expect(captured!.headers["X-ACCESS-TOKEN"]).toBe("gyg-token");
    expect(captured!.headers["exp-api-key"]).toBeUndefined(); // Viator glava izključena
    expect(captured!.headers["Accept"]).toBe("application/json");
  });
});
