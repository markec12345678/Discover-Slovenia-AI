// ============================================================================
// TASK 53 — TRAVELPAYOUTS ADAPTER: CAPABILITY GATE / PRODUCT GAP / CACHE
// ============================================================================
// Mock fetch je TEST-ONLY preslikava JAVNO DOKUMENTIRANE pogodbe Travelpayouts
// Data API (support.travelpayouts.com — /aviasales/v3/prices_for_dates).
// NI izmišljenega inventarja: adapter se preskuša proti dokumentiranim
// oblikam odgovorov vira. (LIVE-VERIFIED: brez žetona vir odgovori 401.)
//
// KLJUČNE INVARIANTE:
//  - CAPABILITY GATE: brez TRAVELPAYOUTS_TOKEN → iskreno PRAZEN sloj,
//    0 klicev na vir (NI simulacije živega API-ja)
//  - PRODUCT GAP: žeton je, izhodišče (TRAVELPAYOUTS_ORIGIN) pa NI →
//    [] + „origin-required“ + 0 klicev (SupplyQuery NIMA izvornega
//    letališča — letalske cene so izhodišče→cilj; NE sklepamo privzetka)
//  - STRICT MAPPER: manjkajoča cena → produkt BREZ cene (NE 0); manjkajoča
//    origin/destination → zapis zavrnjen + štet
//  - NEGATIVNI PREDPOMNILNIK: okvara vira (invalid-response/401/429/5xx)
//    → naslednja poizvedba „recently-failed“ (0 novih klicev)
//  - ENV LEAK: vrednost žetona NIKOLI ne prispe v odgovor/telemetrijo
// ============================================================================

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  createTravelpayoutsAdapter,
  resetTravelpayoutsAdapterCaches,
  travelpayoutsLastNote,
} from "@/lib/supply/providers/travelpayouts/adapter";
import {
  TravelpayoutsClient,
  TravelpayoutsApiError,
} from "@/lib/supply/providers/travelpayouts/client";
import {
  mapTravelpayoutsPrices,
  travelpayoutsItemToProduct,
} from "@/lib/supply/providers/travelpayouts/mapper";
import {
  filterValidPriceItems,
  type TravelpayoutsPriceItem,
} from "@/lib/supply/providers/travelpayouts/types";
import type { ProviderRegistryEntry } from "@/lib/supply/registry";
import type { ProviderProduct, SupplyQuery } from "@/lib/supply/types";
import type { SupplyAdapter } from "@/lib/supply/adapter";

// ---------------------------------------------------------------------------
// INLINE REGISTRSKI VSTOP (main agent ga kasneje poveže v registry.ts —
// vrednosti so dogovorjene: flight sloj, državni zoom 7, predpomnjene
// cene vira → TTL 10 min, vljudnih 30 klicev/min)
// ---------------------------------------------------------------------------

const TP_ENTRY: ProviderRegistryEntry = {
  slug: "travelpayouts",
  labels: { sl: "Travelpayouts", en: "Travelpayouts" },
  group: "commercial",
  inventoryAccess: ["affiliate_deep_link"],
  status: "affiliate",
  active: true,
  types: ["flight"],
  capabilities: {
    geo: false, // let = route (izhodišče→cilj), NE pin
    price: true, // predpomnjene najnižje cene (ni živi citat)
    availability: false,
    images: false,
    reviews: false,
    map: false,
    booking: true,
    affiliate: true,
  },
  envKeys: {
    api: ["TRAVELPAYOUTS_TOKEN", "TRAVELPAYOUTS_API_BASE", "TRAVELPAYOUTS_ORIGIN"],
  },
  minZoom: 7,
  cacheTtlMs: 10 * 60 * 1000,
  timeoutMs: 10_000,
  maxCallsPerMin: 30,
};

// ---------------------------------------------------------------------------
// MOCK NAPREDA (DI fetch) — dokumentirana shema odgovorov
// ---------------------------------------------------------------------------

/** Uradni primer elementa data[] (dokumentirana polja, EUR). */
function priceItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    origin: "CDG",
    destination: "LJU",
    origin_airport: "CDG",
    destination_airport: "LJU",
    price: 123,
    airline: "AF",
    flight_number: "1234",
    departure_at: "2026-10-01T09:35:00+02:00",
    return_at: null,
    transfers: 0,
    return_transfers: 0,
    duration: 110,
    duration_to: 110,
    link: "/search/flights?origin=CDG&destination=LJU",
    ...overrides,
  };
}

interface RecordedCall {
  url: string;
  method?: string;
  headers?: Record<string, string>;
}

/** Snemalnik klicev (skupen vsem mock različicam). */
function recorder(): { calls: RecordedCall[]; record: typeof fetch } {
  const calls: RecordedCall[] = [];
  const record = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method,
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    // Odgovor zamenja konkretni mock (ta funkcija samo beleži).
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, record };
}

/** Zgradi mock fetch, ki beleži klice in odgovarja po dokumentirani shemi. */
function makeMockFetch(opts: {
  items?: Record<string, unknown>[];
  currency?: string;
  status?: number;
  headers?: Record<string, string>;
  body?: string;
}) {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push({
      url: u,
      method: init?.method,
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    if (!u.includes("/aviasales/v3/prices_for_dates")) {
      return new Response(JSON.stringify({ error: "unexpected-url" }), { status: 500 });
    }
    if (opts.status != null && opts.status !== 200) {
      return new Response(opts.body ?? "Unauthorized", {
        status: opts.status,
        headers: opts.headers ?? { "content-type": "text/plain" },
      });
    }
    return new Response(
      JSON.stringify({
        success: true,
        data: opts.items ?? [],
        currency: opts.currency ?? "eur",
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

/** Adapter z mock fetch DI. */
function adapterWith(fetchImpl: typeof fetch): SupplyAdapter {
  return createTravelpayoutsAdapter(TP_ENTRY, { fetchImpl });
}

/** Ljubljanski viewport (kanonska destinacija z lastnim letališčem LJU). */
const LJU_VIEW: SupplyQuery = {
  bbox: [46.02, 14.47, 46.09, 14.55],
  zoom: 12,
  cats: ["flight"],
  locale: "sl",
};

// ---------------------------------------------------------------------------
// ZAGON/ČIŠČENJE — vsak test doba čisto stanje (cache + env)
// ---------------------------------------------------------------------------

let prevToken: string | undefined;
let prevOrigin: string | undefined;
let prevBase: string | undefined;

beforeEach(() => {
  prevToken = process.env.TRAVELPAYOUTS_TOKEN;
  prevOrigin = process.env.TRAVELPAYOUTS_ORIGIN;
  prevBase = process.env.TRAVELPAYOUTS_API_BASE;
  delete process.env.TRAVELPAYOUTS_TOKEN;
  delete process.env.TRAVELPAYOUTS_ORIGIN;
  delete process.env.TRAVELPAYOUTS_API_BASE;
  resetTravelpayoutsAdapterCaches();
});

afterEach(() => {
  if (prevToken === undefined) delete process.env.TRAVELPAYOUTS_TOKEN;
  else process.env.TRAVELPAYOUTS_TOKEN = prevToken;
  if (prevOrigin === undefined) delete process.env.TRAVELPAYOUTS_ORIGIN;
  else process.env.TRAVELPAYOUTS_ORIGIN = prevOrigin;
  if (prevBase === undefined) delete process.env.TRAVELPAYOUTS_API_BASE;
  else process.env.TRAVELPAYOUTS_API_BASE = prevBase;
  resetTravelpayoutsAdapterCaches();
});

// ---------------------------------------------------------------------------
// ① CAPABILITY GATE — brez žetona NI podatkov (in NI klicev)
// ---------------------------------------------------------------------------

describe("TASK 53: capability gate — brez TRAVELPAYOUTS_TOKEN", () => {
  test("① iskreno PRAZEN sloj + opomba not-configured + 0 klicev na vir", async () => {
    delete process.env.TRAVELPAYOUTS_TOKEN;
    process.env.TRAVELPAYOUTS_ORIGIN = "CDG";
    const { fetchImpl, calls } = makeMockFetch({ items: [priceItem()] });
    const products = await adapterWith(fetchImpl).search(LJU_VIEW);
    expect(products).toEqual([]);
    expect(travelpayoutsLastNote()).toBe("not-configured");
    expect(calls).toHaveLength(0); // NIKAKOR ne pokličemo vira
  });

  test("② vrata vira so ŽIVA (regresijska dokumentacija pogodbe): dokumentirana pot obstaja v klientu", () => {
    // Klient gradi natanko dokumentirani endpoint + glavo X-Access-Token
    // (živi dokaz 401 brez žetona, 19. 9. 2026 — glej client.ts glavo).
    const c = new TravelpayoutsClient({ token: "x" });
    expect(c).toBeInstanceOf(TravelpayoutsClient);
  });
});

// ---------------------------------------------------------------------------
// ② PRIHODNJA AKTIVACIJA — žeton + izhodišče → živa pot BREZ spremembe kode
// ---------------------------------------------------------------------------

describe("TASK 53: prihodnja aktivacija (žeton + izhodišče + mock dokumentirane pogodbe)", () => {
  test("① X-Access-Token glava + dokumentirani query parametri + produkti", async () => {
    process.env.TRAVELPAYOUTS_TOKEN = "tp-test-token-123";
    process.env.TRAVELPAYOUTS_ORIGIN = "CDG";
    const { fetchImpl, calls } = makeMockFetch({ items: [priceItem()] });
    const products = await adapterWith(fetchImpl).search(LJU_VIEW);

    expect(calls).toHaveLength(1);
    const call = calls[0];
    // POGODBA: žeton v GLAVI X-Access-Token (alternativa query „token“ NI
    // v uporabi — žeton ne sme končati v URL-ju/dnevnikih).
    expect(call.headers?.["X-Access-Token"]).toBe("tp-test-token-123");
    expect(call.url).not.toContain("tp-test-token-123");
    // POGODBA: endpoint + dokumentirani parametri.
    expect(call.url).toContain("/aviasales/v3/prices_for_dates");
    const params = new URL(call.url).searchParams;
    expect(params.get("origin")).toBe("CDG");
    expect(params.get("destination")).toBe("LJU");
    expect(params.get("currency")).toBe("eur");
    expect(params.get("one_way")).toBe("true");
    expect(params.get("sorting")).toBe("price");
    expect(Number(params.get("limit"))).toBeGreaterThan(0);

    // Preslikava v kanonski model:
    expect(products).toHaveLength(1);
    const p = products[0];
    expect(p.id).toBe("travelpayouts:CDG-LJU-20261001"); // determinističen ID
    expect(p.provider).toBe("travelpayouts");
    expect(p.providerProductId).toBe("CDG-LJU-20261001");
    expect(p.type).toBe("flight");
    expect(p.subcategory).toBe("direct_flight");
    expect(p.title).toBe("Let CDG → LJU (AF)");
    expect(p.description).toContain("Direktni let");
    // GEO: let je ROUTE — NAMERNO brez pina (geografska laž prepovedana).
    expect(p.lat).toBeUndefined();
    expect(p.lng).toBeUndefined();
    expect(p.geoPrecision).toBeUndefined();
    expect(p.address).toBeUndefined();
    // CENA: per_person + fromPrice + iskrenost (predpomnjena, ni živi citat).
    expect(p.price).toBeDefined();
    expect(p.price!.amount).toBe(123);
    expect(p.price!.currency).toBe("EUR");
    expect(p.price!.unit).toBe("per_person");
    expect(p.price!.fromPrice).toBe(true);
    expect(p.price!.note).toContain("predpomnjena najnižja cena");
    // RAZPOLOŽLJIVOST: unknown (Data API ne poroča sedežev).
    expect(p.availability!.status).toBe("unknown");
    // REZERVACIJA: /go/flights?dest=<kanonska destinacija>.
    expect(p.bookingMode).toBe("affiliate_redirect");
    expect(p.bookingUrl).toBe("/go/flights?dest=ljubljana");
    // sourceUrl NAMERNO izpuščen (link vira je relativen — NE fabriciramo).
    expect(p.sourceUrl).toBeUndefined();
    expect(p.lastUpdated).toBeDefined();
    expect(p.license).toEqual({ source: "Travelpayouts Data API" });
  });

  test("② EN locale: naslov „Flight …“ + angleška opomba cene", async () => {
    process.env.TRAVELPAYOUTS_TOKEN = "t";
    process.env.TRAVELPAYOUTS_ORIGIN = "CDG";
    const { fetchImpl } = makeMockFetch({ items: [priceItem()] });
    const products = await adapterWith(fetchImpl).search({
      ...LJU_VIEW,
      locale: "en",
    });
    expect(products[0].title).toBe("Flight CDG → LJU (AF)");
    expect(products[0].price!.note).toContain("cached lowest price");
  });

  test("③ datum uporabnika → departure_at v zahtevi (dokumentiran parameter)", async () => {
    process.env.TRAVELPAYOUTS_TOKEN = "t";
    process.env.TRAVELPAYOUTS_ORIGIN = "CDG";
    const { fetchImpl, calls } = makeMockFetch({ items: [] });
    await adapterWith(fetchImpl).search({ ...LJU_VIEW, date: "2026-10-05" });
    expect(new URL(calls[0].url).searchParams.get("departure_at")).toBe("2026-10-05");
  });

  test("④ rezultatni predpomnilnik: druga IDENTIČNA poizvedba → 0 novih klicev (cached=true)", async () => {
    process.env.TRAVELPAYOUTS_TOKEN = "t";
    process.env.TRAVELPAYOUTS_ORIGIN = "CDG";
    const { fetchImpl, calls } = makeMockFetch({ items: [priceItem()] });
    const adapter = adapterWith(fetchImpl);
    const first = await adapter.search(LJU_VIEW);
    expect(calls).toHaveLength(1);
    expect(adapter.lastRunCached()).toBe(false);

    const second = await adapter.search(LJU_VIEW);
    expect(calls).toHaveLength(1); // NI novih klicev (TTL iz registra: 10 min)
    expect(adapter.lastRunCached()).toBe(true);
    expect(second).toEqual(first);
  });

  test("⑤ coalescing: SOČASNI identični poizvedbi delita ENO izvedbo", async () => {
    process.env.TRAVELPAYOUTS_TOKEN = "t";
    process.env.TRAVELPAYOUTS_ORIGIN = "CDG";
    const { fetchImpl, calls } = makeMockFetch({ items: [priceItem()] });
    const adapter = adapterWith(fetchImpl);
    const [a, b] = await Promise.all([
      adapter.search(LJU_VIEW),
      adapter.search(LJU_VIEW),
    ]);
    expect(calls).toHaveLength(1); // ENA izvedba za obe sočasni poizvedbi
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// ③ PRODUCT GAP — žeton je, izhodišča NI (SupplyQuery nima origin polja)
// ---------------------------------------------------------------------------

describe("TASK 53: product gap — izhodiščno letališče NI znano", () => {
  test("① token brez TRAVELPAYOUTS_ORIGIN → [] + „origin-required“ + 0 klicev", async () => {
    process.env.TRAVELPAYOUTS_TOKEN = "t";
    delete process.env.TRAVELPAYOUTS_ORIGIN;
    const { fetchImpl, calls } = makeMockFetch({ items: [priceItem()] });
    const products = await adapterWith(fetchImpl).search(LJU_VIEW);
    expect(products).toEqual([]);
    expect(travelpayoutsLastNote()).toBe("origin-required");
    expect(calls).toHaveLength(0); // NE tolčemo vira brez poštene poizvedbe
  });

  test("② neveljavna izhodiščna koda (ne-IATA) → isto iskreno vrata", async () => {
    process.env.TRAVELPAYOUTS_TOKEN = "t";
    process.env.TRAVELPAYOUTS_ORIGIN = "PARIS"; // 5 črk — NI IATA koda
    const { fetchImpl, calls } = makeMockFetch({ items: [priceItem()] });
    const products = await adapterWith(fetchImpl).search(LJU_VIEW);
    expect(products).toEqual([]);
    expect(travelpayoutsLastNote()).toBe("origin-required");
    expect(calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// ④ STRICT MAPPER — fail-closed (cena/povezava iz SAMO veljavnih polj vira)
// ---------------------------------------------------------------------------

describe("TASK 53: strict mapper (fail-closed)", () => {
  const CTX = {
    locale: "sl" as const,
    fetchedAt: "2026-09-19T00:00:00Z",
    currencyConfirmedEur: true,
    canonicalDest: "ljubljana",
  };

  /** Preskusni vnos (namerno tudi deformiran — fail-closed pot). */
  const asItems = (
    ...rows: Record<string, unknown>[]
  ): TravelpayoutsPriceItem[] => rows as unknown as TravelpayoutsPriceItem[];

  test("① manjkajoča cena → produkt BREZ cene (NE 0, NE izmišljena)", () => {
    const { products } = mapTravelpayoutsPrices(
      asItems(priceItem({ price: undefined })),
      CTX
    );
    expect(products).toHaveLength(1);
    expect(products[0].price).toBeUndefined();
  });

  test("② cena 0 NI cena (predpomnilnik vira ne sme pošiljati lažne 0)", () => {
    const { products } = mapTravelpayoutsPrices(asItems(priceItem({ price: 0 })), CTX);
    expect(products).toHaveLength(1);
    expect(products[0].price).toBeUndefined();
  });

  test("③ valuta NI potrjena eur → cene NE preslikamo (NE pretvarjamo)", () => {
    const { products } = mapTravelpayoutsPrices(asItems(priceItem()), {
      ...CTX,
      currencyConfirmedEur: false,
    });
    expect(products).toHaveLength(1);
    expect(products[0].price).toBeUndefined();
  });

  test("④ manjkajoča origin/destination → zapis ZAVRNJEN + štet", () => {
    const { products, skipped } = mapTravelpayoutsPrices(
      asItems(
        priceItem({ origin: undefined }),
        priceItem({ destination: "" }),
        priceItem()
      ),
      CTX
    );
    expect(products).toHaveLength(1);
    expect(skipped).toBe(2);
  });

  test("⑤ filterValidPriceItems: neobjekti/kratke kode odpadejo + štejo", () => {
    const { valid, skipped } = filterValidPriceItems([
      priceItem(),
      null,
      "x",
      priceItem({ origin: "LJ" }), // 2 črki — ni IATA
      priceItem({ origin: 12 }), // tip
    ]);
    expect(valid).toHaveLength(1);
    expect(skipped).toBe(4);
  });

  test("⑥ brez departure_at → ID iz določenega hash (stabilen med klici)", () => {
    const a = travelpayoutsItemToProduct(
      priceItem({ departure_at: undefined }) as unknown as TravelpayoutsPriceItem,
      CTX
    );
    const b = travelpayoutsItemToProduct(
      priceItem({ departure_at: undefined }) as unknown as TravelpayoutsPriceItem,
      CTX
    );
    expect(a?.id).toBe(b?.id);
    expect(a?.id).toMatch(/^travelpayouts:CDG-LJU-[a-z0-9]+$/);
  });

  test("⑦ prestopi → subcategory connecting_flight + opis z prestopi", () => {
    const { products } = mapTravelpayoutsPrices(asItems(priceItem({ transfers: 2 })), CTX);
    expect(products[0].subcategory).toBe("connecting_flight");
    expect(products[0].description).toContain("2 prestopa");
  });
});

// ---------------------------------------------------------------------------
// ⑤ OKVARA VIRA → invalid-response → NEGATIVNI PREDPOMNILNIK
// ---------------------------------------------------------------------------

describe("TASK 53: okvara vira (invalid-response) → negativni predpomnilnik", () => {
  test("① neveljavna oblika odgovora → izjema + naslednja poizvedba „recently-failed“ (0 novih klicev)", async () => {
    process.env.TRAVELPAYOUTS_TOKEN = "t";
    process.env.TRAVELPAYOUTS_ORIGIN = "CDG";
    // 200, a NE dokumentirana oblika (success:false brez data array) —
    // vir je „zdrav“, a odgovor ni pogodben → invalid-response.
    const { calls, record } = recorder();
    const badFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      record(url, init);
      return new Response(JSON.stringify({ success: false, error: "weird" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const adapter = adapterWith(badFetch);
    await expect(adapter.search(LJU_VIEW)).rejects.toThrow();
    expect(calls).toHaveLength(1);

    // Negativni predpomnilnik: NE tolčemo vira, ki je ravno odklonil.
    const second = await adapter.search(LJU_VIEW);
    expect(second).toEqual([]);
    expect(travelpayoutsLastNote()).toBe("recently-failed");
    expect(calls).toHaveLength(1); // 0 NOVIH klicev
  });

  test("② ne-JSON telo → invalid-response (isti negativni vzorec)", async () => {
    process.env.TRAVELPAYOUTS_TOKEN = "t";
    process.env.TRAVELPAYOUTS_ORIGIN = "CDG";
    const notJson = (async () =>
      new Response("Server Error plain text", {
        status: 200,
        headers: { "content-type": "text/plain" },
      })) as unknown as typeof fetch;
    const adapter = adapterWith(notJson);
    await expect(adapter.search(LJU_VIEW)).rejects.toThrow();
    const second = await adapter.search(LJU_VIEW);
    expect(second).toEqual([]);
    expect(travelpayoutsLastNote()).toBe("recently-failed");
  });
});

// ---------------------------------------------------------------------------
// ⑥ KLASIFIKACIJA NAPAK (401 / 429 / 5xx) — klient
// ---------------------------------------------------------------------------

describe("TASK 53: klasifikacija napak klienta (pogodbena vrata)", () => {
  function clientWith(status: number, headers: Record<string, string> = {}) {
    const fetchImpl = (async () =>
      new Response("x", { status, headers })) as unknown as typeof fetch;
    return new TravelpayoutsClient({ token: "t", fetchImpl });
  }

  test("① 401 → unauthorized (živi dokaz pogodbe: vrata odklonijo brez žetona)", async () => {
    await expect(
      clientWith(401).getPricesForDates({
        origin: "CDG",
        destination: "LJU",
        currency: "eur",
        one_way: true,
        sorting: "price",
        limit: 12,
      })
    ).rejects.toMatchObject({
      name: "TravelpayoutsApiError",
      kind: "unauthorized",
      status: 401,
    });
  });

  test("② 429 + Retry-After → rate-limited + retryAfterSec izpostavljen", async () => {
    await expect(
      clientWith(429, { "retry-after": "600" }).getPricesForDates({
        origin: "CDG",
        destination: "LJU",
        currency: "eur",
        one_way: true,
        sorting: "price",
        limit: 12,
      })
    ).rejects.toMatchObject({
      kind: "rate-limited",
      status: 429,
      retryAfterSec: 600,
    });
  });

  test("③ 500 → server; 403 → forbidden; 400 → bad-request", async () => {
    await expect(
      clientWith(500).getPricesForDates({
        origin: "CDG",
        destination: "LJU",
        currency: "eur",
        one_way: true,
        sorting: "price",
        limit: 12,
      })
    ).rejects.toMatchObject({ kind: "server", status: 500 });
    await expect(
      clientWith(403).getPricesForDates({
        origin: "CDG",
        destination: "LJU",
        currency: "eur",
        one_way: true,
        sorting: "price",
        limit: 12,
      })
    ).rejects.toMatchObject({ kind: "forbidden", status: 403 });
    await expect(
      clientWith(400).getPricesForDates({
        origin: "CDG",
        destination: "LJU",
        currency: "eur",
        one_way: true,
        sorting: "price",
        limit: 12,
      })
    ).rejects.toMatchObject({ kind: "bad-request", status: 400 });
  });

  test("④ 401 prek adapterja → negativni predpomnilnik („recently-failed“)", async () => {
    process.env.TRAVELPAYOUTS_TOKEN = "t";
    process.env.TRAVELPAYOUTS_ORIGIN = "CDG";
    const { fetchImpl, calls } = makeMockFetch({
      status: 401,
      body: "Unauthorized",
    });
    const adapter = adapterWith(fetchImpl);
    await expect(adapter.search(LJU_VIEW)).rejects.toMatchObject({
      name: "TravelpayoutsApiError",
      kind: "unauthorized",
    });
    const second = await adapter.search(LJU_VIEW);
    expect(second).toEqual([]);
    expect(travelpayoutsLastNote()).toBe("recently-failed");
    expect(calls).toHaveLength(1);
  });

  test("⑤ 429 prek adapterja → negativni predpomnilnik („recently-failed“)", async () => {
    process.env.TRAVELPAYOUTS_TOKEN = "t";
    process.env.TRAVELPAYOUTS_ORIGIN = "CDG";
    const { fetchImpl, calls } = makeMockFetch({
      status: 429,
      headers: { "retry-after": "600" },
      body: "Too Many Requests",
    });
    const adapter = adapterWith(fetchImpl);
    await expect(adapter.search(LJU_VIEW)).rejects.toMatchObject({
      kind: "rate-limited",
      retryAfterSec: 600,
    });
    const second = await adapter.search(LJU_VIEW);
    expect(second).toEqual([]);
    expect(travelpayoutsLastNote()).toBe("recently-failed");
    expect(calls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// ⑦ ENV LEAK — vrednost žetona NIKOLI v izhodu
// ---------------------------------------------------------------------------

describe("TASK 53: varnost — žeton ne pušča", () => {
  test("① produkti/opombe/telemetrija NE vsebujejo vrednosti žetona", async () => {
    const SECRET = "SECRET-tp-leak-value-9f8e7d";
    process.env.TRAVELPAYOUTS_TOKEN = SECRET;
    process.env.TRAVELPAYOUTS_ORIGIN = "CDG";
    const { fetchImpl } = makeMockFetch({ items: [priceItem()] });
    const adapter = adapterWith(fetchImpl);
    const products = await adapter.search(LJU_VIEW);
    expect(products).toHaveLength(1);

    const dump = JSON.stringify({
      products,
      note: travelpayoutsLastNote(),
      cached: adapter.lastRunCached(),
      skipped: adapter.lastRunSkipped?.() ?? 0,
    });
    expect(dump).not.toContain(SECRET);
    for (const p of products as ProviderProduct[]) {
      expect(p.id).not.toContain(SECRET);
      expect(p.title).not.toContain(SECRET);
      expect(p.bookingUrl).not.toContain(SECRET);
    }
  });
});

// ---------------------------------------------------------------------------
// DODATNE ISKRENE VRZELI (viewport / destinacije)
// ---------------------------------------------------------------------------

describe("TASK 53: iskrene vrzeli viewporta", () => {
  test("① brez bbox → [] + „no-bbox“ + 0 klicev", async () => {
    process.env.TRAVELPAYOUTS_TOKEN = "t";
    process.env.TRAVELPAYOUTS_ORIGIN = "CDG";
    const { fetchImpl, calls } = makeMockFetch({ items: [priceItem()] });
    const products = await adapterWith(fetchImpl).search({
      ...LJU_VIEW,
      bbox: undefined,
    });
    expect(products).toEqual([]);
    expect(travelpayoutsLastNote()).toBe("no-bbox");
    expect(calls).toHaveLength(0);
  });

  test("② pogled BREZ destinacije z lastnim letališčem (Bled) → [] + „no-airport-destination“ (NE preusmerjamo na LJU)", async () => {
    process.env.TRAVELPAYOUTS_TOKEN = "t";
    process.env.TRAVELPAYOUTS_ORIGIN = "CDG";
    const { fetchImpl, calls } = makeMockFetch({ items: [priceItem()] });
    const products = await adapterWith(fetchImpl).search({
      bbox: [46.34, 14.03, 46.39, 14.12], // ozek pogled na Bled
      zoom: 13,
      cats: ["flight"],
      locale: "sl",
    });
    expect(products).toEqual([]);
    expect(travelpayoutsLastNote()).toBe("no-airport-destination");
    expect(calls).toHaveLength(0); // brez lastnega letališča NI poizvedbe
  });
});
