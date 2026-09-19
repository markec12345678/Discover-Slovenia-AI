// ============================================================================
// TASK 53 — SKYSCANNER ADAPTER: CAPABILITY GATE / PRODUCT GAP / POLL /
// CACHE / IZOLACIJA
// ============================================================================
// Mock fetch je TEST-ONLY preslikava JAVNO DOKUMENTIRANE pogodbe vira
// (developers.skyscanner.net — Flights Live Prices v3; vrata brez ključa
// so ŽIVO preverjena: HTTP 403 "Request Forbidden"). NI izmišljenega
// inventarja — adapter se preskuša proti dokumentiranim odgovorom vira.
//
// KLJUČNE INVARIANTE:
//  - CAPABILITY GATE: brez SKYSCANNER_API_KEY → iskreno PRAZEN sloj,
//    0 klicev na vir (NI simulacije živega API-ja)
//  - PRODUCT GAP (izvor leta): ključ je, izvora NI (SupplyQuery nima
//    origin polja) → [] + „origin-required" + 0 klicev (iskreno!)
//  - PRIHODNJA AKTIVACIJA: ključ + deps.originPlaceId → polna
//    dvostopna pot (create → poll COMPLETE) → kanonski produkti
//  - STRICT fail-closed mapper: manjkajoč id/eta → skipped+preštet;
//    cena SAMO numerična > 0; deep_link SAMO https skyscanner.net
//  - negativni predpomnilnik okvar (60 s) + coalescing (TTL 0 = žive
//    cene BREZ predpomnilnika rezultatov)
//  - klasifikacija napak klienta (401/403/429+Retry-After/5xx/invalid)
//  - env leak: izhod NIKOLI ne vsebuje vrednosti ključa
// ============================================================================
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { readFileSync } from "node:fs";
import {
  createSkyscannerAdapter,
  resetSkyscannerAdapterCaches,
  skyscannerLastNote,
} from "@/lib/supply/providers/skyscanner/adapter";
import {
  SkyscannerClient,
  SkyscannerApiError,
} from "@/lib/supply/providers/skyscanner/client";
import { runAdapter, type SupplyAdapter } from "@/lib/supply/adapter";
import type { ProviderRegistryEntry } from "@/lib/supply/registry";
import type { SupplyQuery } from "@/lib/supply/types";

// ---------------------------------------------------------------------------
// REGISTAR (INLINE mock — glavni agent ga poveže v registry.ts; vrednosti
// po specifikaciji TASK 53: flight, minZoom 7, TTL 0 = žive cene no-store)
// ---------------------------------------------------------------------------

const SKYSCANNER_ENTRY: ProviderRegistryEntry = {
  slug: "skyscanner",
  labels: { sl: "Skyscanner", en: "Skyscanner" },
  group: "commercial",
  inventoryAccess: ["affiliate_deep_link"],
  status: "affiliate",
  active: true,
  types: ["flight"],
  goRoute: "flights",
  capabilities: {
    geo: true,
    price: true,
    availability: false,
    images: false,
    reviews: false,
    map: true,
    booking: true,
    affiliate: true,
  },
  envKeys: {
    affiliate: ["SKYSCANNER_MEDIA_PARTNER_ID"],
    api: ["SKYSCANNER_API_KEY", "SKYSCANNER_API_BASE"],
  },
  minZoom: 7,
  cacheTtlMs: 0, // žive cene letov — iskren no-store
  timeoutMs: 20_000,
  maxCallsPerMin: 10,
  docsUrl: "https://developers.skyscanner.net",
};

// ---------------------------------------------------------------------------
// MOCK NAPREDA (DI fetch) — javno dokumentirana shema odgovorov v3
// ---------------------------------------------------------------------------

interface RecordedCall {
  url: string;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

/** Uradni primer itinererja (Flights Live Prices poll odgovor). */
function itinerary(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "12345-212980210000-212980218000",
    leg_ids: ["leg-1"],
    pricing_options: [
      {
        price: { amount: 120.5, unit_type: "QUANTITY" },
        agent_id: "1",
        deep_link:
          "https://www.skyscanner.net/transport/flights/lhr/lju/261001/261015/?adults=1",
      },
    ],
    ...overrides,
  };
}

/** Eta + places + carriers (dokumentirana polja poll odgovora). */
const LEG_1 = {
  id: "leg-1",
  origin_place_id: "lhr-sky",
  destination_place_id: "lju-sky",
  departure_date_time: "2026-10-05T07:20:00",
  duration: 780,
  carriers: ["ba"],
};

const PLACES = [
  {
    id: "lhr-sky",
    name: "London Heathrow",
    type: "Airport",
    coordinates: { latitude: 51.47, longitude: -0.4543 },
  },
  {
    id: "lju-sky",
    name: "Ljubljana Jože Pučnik Airport",
    type: "Airport",
    coordinates: { latitude: 46.2237, longitude: 14.4576 },
  },
];

const CARRIERS = [{ id: "ba", name: "British Airways" }];

function pollResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status: "RESULT_STATUS_COMPLETE",
    itineraries: [itinerary()],
    legs: [LEG_1],
    places: PLACES,
    carriers: CARRIERS,
    ...overrides,
  };
}

/** Zgradi mock fetch, ki beleži klice in odgovarja po URADNI shemi. */
function makeMockFetch(opts: {
  createStatus?: number;
  createBody?: unknown;
  pollHttpStatus?: number;
  pollBody?: unknown;
  /** Zaporedne vrednosti polja status v poll odgovorih (po klicu). */
  pollStatuses?: string[];
  delayMs?: number;
}) {
  const calls: RecordedCall[] = [];
  let pollIndex = 0;
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({
      url: u,
      method: init?.method,
      body:
        typeof init?.body === "string"
          ? init.body.length > 0
            ? JSON.parse(init.body)
            : undefined
          : undefined,
      headers,
    });
    if (opts.delayMs) {
      await new Promise((r) => setTimeout(r, opts.delayMs));
    }
    if (u.endsWith("/flights/live/search/create")) {
      const body = opts.createBody ?? {
        session_token: "sess-123",
        status: "RESULT_STATUS_CREATING",
      };
      const extraHeaders: Record<string, string> = {};
      if (opts.createStatus === 429) extraHeaders["retry-after"] = "30";
      return new Response(JSON.stringify(body), {
        status: opts.createStatus ?? 200,
        headers: { "content-type": "application/json", ...extraHeaders },
      });
    }
    if (u.includes("/flights/live/search/poll/")) {
      if (opts.pollStatuses != null) {
        const seq = opts.pollStatuses[pollIndex] ?? "RESULT_STATUS_INCOMPLETE";
        pollIndex++;
        return new Response(JSON.stringify({ status: seq, itineraries: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      const body = opts.pollBody ?? pollResponse();
      return new Response(
        typeof body === "string" ? body : JSON.stringify(body),
        {
          status: opts.pollHttpStatus ?? 200,
          headers: { "content-type": "application/json" },
        }
      );
    }
    return new Response(JSON.stringify({ error: "unexpected-url" }), {
      status: 500,
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

/** Adapter z mock fetch DI (+ opcijski prihodnji resolver izvora). */
function adapterWith(
  fetchImpl: typeof fetch,
  deps?: { originPlaceId?: () => string | null }
): SupplyAdapter {
  return createSkyscannerAdapter(SKYSCANNER_ENTRY, {
    fetchImpl,
    ...(deps ?? {}),
  });
}

/** Ljubljanski viewport z datumom (pogodbeno obvezen za leta). */
const LJU_FLIGHT_VIEW: SupplyQuery = {
  bbox: [46.02, 14.47, 46.09, 14.55],
  zoom: 12,
  cats: ["flight"],
  locale: "sl",
  date: "2026-10-05",
};

// ---------------------------------------------------------------------------
// ZAGON/ČIŠČENJE — vsak test doba čisto stanje (cache + env vedno pobrisan)
// ---------------------------------------------------------------------------

let prevKey: string | undefined;
let prevBase: string | undefined;

beforeEach(() => {
  prevKey = process.env.SKYSCANNER_API_KEY;
  prevBase = process.env.SKYSCANNER_API_BASE;
  delete process.env.SKYSCANNER_API_KEY;
  delete process.env.SKYSCANNER_API_BASE;
  resetSkyscannerAdapterCaches();
});

afterEach(() => {
  if (prevKey === undefined) delete process.env.SKYSCANNER_API_KEY;
  else process.env.SKYSCANNER_API_KEY = prevKey;
  if (prevBase === undefined) delete process.env.SKYSCANNER_API_BASE;
  else process.env.SKYSCANNER_API_BASE = prevBase;
  resetSkyscannerAdapterCaches();
});

// ---------------------------------------------------------------------------
// CAPABILITY GATE — brez ključa NI podatkov (in NI klicev)
// ---------------------------------------------------------------------------

describe("TASK 53 skyscanner: capability gate — brez SKYSCANNER_API_KEY", () => {
  test("① iskreno PRAZEN sloj + opomba not-configured + 0 klicev na vir", async () => {
    delete process.env.SKYSCANNER_API_KEY;
    const { fetchImpl, calls } = makeMockFetch({});
    const adapter = adapterWith(fetchImpl, {
      originPlaceId: () => "lhr-sky",
    });
    const products = await adapter.search(LJU_FLIGHT_VIEW);
    expect(products).toEqual([]);
    expect(skyscannerLastNote()).toBe("not-configured");
    expect(calls).toHaveLength(0); // NIKAKOR ne pokličemo vira
  });

  test("② runner: iskrena opomba v AdapterRunInfo (ok=true, count=0, NE degraded)", async () => {
    delete process.env.SKYSCANNER_API_KEY;
    const { fetchImpl, calls } = makeMockFetch({});
    const run = await runAdapter(adapterWith(fetchImpl), LJU_FLIGHT_VIEW);
    expect(run.info.ok).toBe(true); // stanje, NE napaka vira
    expect(run.info.slug).toBe("skyscanner");
    expect(run.info.count).toBe(0);
    expect(run.info.note).toBe("not-configured");
    expect(calls).toHaveLength(0);
    expect(run.products).toEqual([]);
  });

  test("③ SOURCE CONTRACT: adapter NE vsebuje izmišljenega inventarja (regresijska varovalka)", () => {
    const src = readFileSync(
      new URL("../supply/providers/skyscanner/adapter.ts", import.meta.url),
      "utf-8"
    );
    expect(src.includes("not-configured")).toBe(true); // iskrena opomba obstaja
    expect(src.includes("origin-required")).toBe(true); // PRODUCT GAP opomba obstaja
    expect(src.includes("sample")).toBe(false);
    expect(src.includes("DEMO_")).toBe(false);
    expect(src.includes("fallbackProducts")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PRODUCT GAP — izvor leta (ključ JE, izvora NI → iskreno prazno)
// ---------------------------------------------------------------------------

describe("TASK 53 skyscanner: product gap — izvor leta ni znan", () => {
  test("① ključ nastavljen, resolverja izvora NI → [] + origin-required + 0 klicev", async () => {
    process.env.SKYSCANNER_API_KEY = "test-key";
    const { fetchImpl, calls } = makeMockFetch({});
    const adapter = adapterWith(fetchImpl); // DEPS brez originPlaceId (današnja realnost)
    const products = await adapter.search(LJU_FLIGHT_VIEW);
    expect(products).toEqual([]);
    expect(skyscannerLastNote()).toBe("origin-required");
    expect(calls).toHaveLength(0); // NE izmišljujemo privzetega izvora!
  });

  test("② ključ + NEVELJAVEN izvor (metaznaki) → isti iskreni gate", async () => {
    process.env.SKYSCANNER_API_KEY = "test-key";
    const { fetchImpl, calls } = makeMockFetch({});
    const adapter = adapterWith(fetchImpl, {
      originPlaceId: () => "javascript:alert(1)",
    });
    const products = await adapter.search(LJU_FLIGHT_VIEW);
    expect(products).toEqual([]);
    expect(skyscannerLastNote()).toBe("origin-required");
    expect(calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// PRIHODNJA AKTIVACIJA — polna dvostopna pot (create → poll COMPLETE)
// ---------------------------------------------------------------------------

describe("TASK 53 skyscanner: prihodnja aktivacija (ključ + izvor)", () => {
  test("① dvostopna pot: create (pogodbeno telo) → poll (prazen {}) → produkti", async () => {
    process.env.SKYSCANNER_API_KEY = "11111111-2222-3333-4444-555555555555";
    const { fetchImpl, calls } = makeMockFetch({});
    const products = await adapterWith(fetchImpl, {
      originPlaceId: () => "lhr-sky",
    }).search(LJU_FLIGHT_VIEW);

    // 2 klica: POST create + POST poll (COMPLETE na prvi poizvedbi).
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toContain("/flights/live/search/create");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers?.["x-api-key"]).toBe(
      "11111111-2222-3333-4444-555555555555"
    );
    // Pogodbeno telo create (javna dokumentacija v3):
    expect(calls[0].body).toEqual({
      query: {
        market: "SI",
        locale: "en-GB",
        currency: "EUR",
        outbound_leg: {
          origin_place_id: "lhr-sky",
          destination_place_id: "lju-sky",
          date: "2026-10-05",
        },
        adults: 1, // iskrena enota per_person (cena na odraslo osebo)
        cabin_class: "CABIN_CLASS_ECONOMY",
      },
    });
    expect(calls[1].url).toContain("/flights/live/search/poll/sess-123");
    expect(calls[1].method).toBe("POST");
    expect(calls[1].body).toEqual({}); // dokumentirano prazno telo {}

    // Kanonski produkt:
    expect(products).toHaveLength(1);
    const p = products[0];
    expect(p.id).toBe("skyscanner:12345-212980210000-212980218000");
    expect(p.provider).toBe("skyscanner");
    expect(p.providerProductId).toBe("12345-212980210000-212980218000");
    expect(p.type).toBe("flight");
    expect(p.title).toBe(
      "Let London Heathrow → Ljubljana Jože Pučnik Airport · British Airways"
    );
    // Cena: prva pricing option, EUR (zahtevan v poizvedbi), per_person.
    expect(p.price).toEqual({
      amount: 120.5,
      currency: "EUR",
      unit: "per_person",
      fromPrice: true,
      note: "cena leta na odraslo osebo (gospodarski)",
    });
    // Pin: place lju-sky IZ SUROVEGA odgovora (geoPrecision city).
    expect(p.lat).toBe(46.2237);
    expect(p.lng).toBe(14.4576);
    expect(p.geoPrecision).toBe("city");
    expect(p.address).toBe("Ljubljana Jože Pučnik Airport");
    // Razpoložljivost: unknown (koncept obstaja, NE preverjamo).
    expect(p.availability?.status).toBe("unknown");
    expect(p.availability?.note).toBe(
      "razpoložljivost se preveri pri ponudniku"
    );
    // CTA arhitektura: prek /go/flights + kanonski dest slug.
    expect(p.bookingMode).toBe("affiliate_redirect");
    expect(p.bookingUrl).toBe("/go/flights?dest=ljubljana");
    // sourceUrl = deep_link vira (validiran https skyscanner.net).
    expect(p.sourceUrl).toBe(
      "https://www.skyscanner.net/transport/flights/lhr/lju/261001/261015/?adults=1"
    );
    expect(p.license).toEqual({
      source: "Skyscanner Travel API",
      attribution: "© Skyscanner",
    });
    // Leti NIMAJO slik — iskreno izpuščeno.
    expect(p.image).toBeUndefined();
    expect(p.lastUpdated).toBeTruthy();
  });

  test("② opis vsebuje SAMO vsebino vira + lastne oznake (odhod/trajanje/kabina)", async () => {
    process.env.SKYSCANNER_API_KEY = "k";
    const { fetchImpl } = makeMockFetch({});
    const products = await adapterWith(fetchImpl, {
      originPlaceId: () => "lhr-sky",
    }).search({ ...LJU_FLIGHT_VIEW, locale: "en" });
    expect(products[0].description).toContain("British Airways");
    expect(products[0].description).toContain("Departure: 2026-10-05T07:20:00");
    expect(products[0].description).toContain("Duration: 13 h");
    expect(products[0].description).toContain("economy class");
    expect(products[0].price?.note).toBe("flight price per adult (economy)");
  });

  test("③ drugačen viewport (Bled) → dest slug v bookingUrl se spremeni", async () => {
    process.env.SKYSCANNER_API_KEY = "k";
    const { fetchImpl } = makeMockFetch({});
    const products = await adapterWith(fetchImpl, {
      originPlaceId: () => "lhr-sky",
    }).search({
      bbox: [46.35, 14.08, 46.39, 14.15],
      zoom: 12,
      cats: ["flight"],
      locale: "sl",
      date: "2026-10-05",
    });
    expect(products).toHaveLength(1);
    expect(products[0].bookingUrl).toBe("/go/flights?dest=bled");
  });

  test("④ viewport BREZ kanonske destinacije (Dunaj) → no-destination-in-view + 0 klicev", async () => {
    process.env.SKYSCANNER_API_KEY = "k";
    const { fetchImpl, calls } = makeMockFetch({});
    const products = await adapterWith(fetchImpl, {
      originPlaceId: () => "lhr-sky",
    }).search({
      bbox: [48.1, 16.3, 48.3, 16.5],
      zoom: 12,
      cats: ["flight"],
      locale: "sl",
      date: "2026-10-05",
    });
    expect(products).toEqual([]);
    expect(skyscannerLastNote()).toBe("no-destination-in-view");
    expect(calls).toHaveLength(0);
  });

  test("⑤ brez datuma → date-required (pogodba ZAHTEVA datum etape) + 0 klicev", async () => {
    process.env.SKYSCANNER_API_KEY = "k";
    const { fetchImpl, calls } = makeMockFetch({});
    const { date: _omit, ...noDate } = LJU_FLIGHT_VIEW;
    const products = await adapterWith(fetchImpl, {
      originPlaceId: () => "lhr-sky",
    }).search(noDate);
    expect(products).toEqual([]);
    expect(skyscannerLastNote()).toBe("date-required");
    expect(calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// STRICT MAPPER — fail-closed (slabi zapisi odpadejo + se preštejejo)
// ---------------------------------------------------------------------------

describe("TASK 53 skyscanner: strict mapper (fail-closed)", () => {
  test("① zapis BREZ id-ja na sredini odgovora odpade (skipped števec)", async () => {
    process.env.SKYSCANNER_API_KEY = "k";
    const { fetchImpl } = makeMockFetch({
      pollBody: pollResponse({
        itineraries: [
          itinerary(),
          { leg_ids: ["leg-1"], pricing_options: [] }, // BREZ id → skip
          itinerary({ id: "9999-1" }),
        ],
      }),
    });
    const adapter = adapterWith(fetchImpl, { originPlaceId: () => "lhr-sky" });
    const products = await adapter.search(LJU_FLIGHT_VIEW);
    expect(products).toHaveLength(2);
    expect(products.map((p) => p.providerProductId).sort()).toEqual([
      "12345-212980210000-212980218000",
      "9999-1",
    ]);
    expect(adapter.lastRunSkipped?.() ?? 0).toBe(1);
  });

  test("② nerazrešljiva eta (leg_ids → neznan leg) → zapis PRESKOČEN", async () => {
    process.env.SKYSCANNER_API_KEY = "k";
    const { fetchImpl } = makeMockFetch({
      pollBody: pollResponse({
        itineraries: [itinerary({ leg_ids: ["leg-neobstoječa"] })],
      }),
    });
    const adapter = adapterWith(fetchImpl, { originPlaceId: () => "lhr-sky" });
    const products = await adapter.search(LJU_FLIGHT_VIEW);
    expect(products).toEqual([]); // brez poti (izvor→cilj) NI produkta
    expect(adapter.lastRunSkipped?.() ?? 0).toBe(1);
  });

  test("③ cena 0 / negativna / odsotna → polje price IZPUŠČENO (nikoli 0)", async () => {
    process.env.SKYSCANNER_API_KEY = "k";
    const { fetchImpl } = makeMockFetch({
      pollBody: pollResponse({
        itineraries: [
          itinerary({ id: "zero-1", pricing_options: [{ price: { amount: 0 } }] }),
          itinerary({ id: "neg-1", pricing_options: [{ price: { amount: -5 } }] }),
          itinerary({ id: "none-1", pricing_options: [] }),
          itinerary({ id: "ok-1" }),
        ],
      }),
    });
    const products = await adapterWith(fetchImpl, {
      originPlaceId: () => "lhr-sky",
    }).search(LJU_FLIGHT_VIEW);
    const byId = new Map(products.map((p) => [p.providerProductId, p]));
    expect(byId.get("zero-1")?.price).toBeUndefined();
    expect(byId.get("neg-1")?.price).toBeUndefined();
    expect(byId.get("none-1")?.price).toBeUndefined();
    expect(byId.get("ok-1")?.price?.amount).toBe(120.5);
    expect(products).toHaveLength(4);
  });

  test("④ deep_link NEVELJAVEN (http / tuji host) → sourceUrl IZPUŠČEN", async () => {
    process.env.SKYSCANNER_API_KEY = "k";
    const { fetchImpl } = makeMockFetch({
      pollBody: pollResponse({
        itineraries: [
          itinerary({
            id: "http-1",
            pricing_options: [
              {
                price: { amount: 90 },
                deep_link: "http://www.skyscanner.net/transport/flights/x",
              },
            ],
          }),
          itinerary({
            id: "evil-1",
            pricing_options: [
              {
                price: { amount: 80 },
                deep_link: "https://evil.com/redirect",
              },
            ],
          }),
          itinerary({ id: "ok-1" }),
        ],
      }),
    });
    const products = await adapterWith(fetchImpl, {
      originPlaceId: () => "lhr-sky",
    }).search(LJU_FLIGHT_VIEW);
    const byId = new Map(products.map((p) => [p.providerProductId, p]));
    expect(byId.get("http-1")?.sourceUrl).toBeUndefined();
    expect(byId.get("evil-1")?.sourceUrl).toBeUndefined();
    expect(byId.get("ok-1")?.sourceUrl).toContain("skyscanner.net");
  });

  test("⑤ kap 48 itinererjev (gostota pod nadzorom) + opomba capped", async () => {
    process.env.SKYSCANNER_API_KEY = "k";
    const many = Array.from({ length: 60 }, (_, i) =>
      itinerary({ id: `it-${i}` })
    );
    const { fetchImpl } = makeMockFetch({
      pollBody: pollResponse({ itineraries: many }),
    });
    const adapter = adapterWith(fetchImpl, { originPlaceId: () => "lhr-sky" });
    const products = await adapter.search(LJU_FLIGHT_VIEW);
    expect(products).toHaveLength(48);
    expect(skyscannerLastNote()).toBe("capped");
    expect(adapter.lastRunSkipped?.() ?? 0).toBe(12); // zavrnjeni nad kapico
  });
});

// ---------------------------------------------------------------------------
// OKVARE / NEGATIVNI PREDPOMNILNIK / COALESCING
// ---------------------------------------------------------------------------

describe("TASK 53 skyscanner: okvare vira + negativni predpomnilnik", () => {
  test("① deformiran create odgovor (brez session_token) → invalid-response → recently-failed brez novega klica", async () => {
    process.env.SKYSCANNER_API_KEY = "k";
    const { fetchImpl, calls } = makeMockFetch({ createBody: { status: "?" } });
    const adapter = adapterWith(fetchImpl, { originPlaceId: () => "lhr-sky" });
    await expect(adapter.search(LJU_FLIGHT_VIEW)).rejects.toThrow();
    expect(calls).toHaveLength(1); // samo (neveljaven) create poskus
    // Ponovitev ISTIH pogojev v oknu 60 s → takoj prazna, 0 novih klicev:
    const products = await adapter.search(LJU_FLIGHT_VIEW);
    expect(products).toEqual([]);
    expect(skyscannerLastNote()).toBe("recently-failed");
    expect(calls).toHaveLength(1); // NI novih klicev (vljudnost do vira)
  });

  test("② poll NIKOLI ne dokonča → zgornja meja 5 poskusov → odpoved (NE preslikamo delnega)", async () => {
    process.env.SKYSCANNER_API_KEY = "k";
    const { fetchImpl, calls } = makeMockFetch({
      pollStatuses: [
        "RESULT_STATUS_INCOMPLETE",
        "RESULT_STATUS_INCOMPLETE",
        "RESULT_STATUS_INCOMPLETE",
        "RESULT_STATUS_INCOMPLETE",
        "RESULT_STATUS_INCOMPLETE",
      ],
    });
    const adapter = adapterWith(fetchImpl, { originPlaceId: () => "lhr-sky" });
    await expect(adapter.search(LJU_FLIGHT_VIEW)).rejects.toThrow();
    // create + NATANKO 5 poll poskusov (zgornja meja — ne neskončno):
    expect(calls).toHaveLength(6);
    expect(
      calls.filter((c) => c.url.includes("/flights/live/search/poll/"))
    ).toHaveLength(5);
    // Negativni predpomnilnik tudi za to okvaro:
    const products = await adapter.search(LJU_FLIGHT_VIEW);
    expect(products).toEqual([]);
    expect(skyscannerLastNote()).toBe("recently-failed");
  });

  test("③ 401 na create → negativni predpomnilnik po KLJUČU (drug viewport poskuša naprej)", async () => {
    process.env.SKYSCANNER_API_KEY = "k";
    const { fetchImpl, calls } = makeMockFetch({ createStatus: 401 });
    const adapter = adapterWith(fetchImpl, { originPlaceId: () => "lhr-sky" });
    await expect(adapter.search(LJU_FLIGHT_VIEW)).rejects.toThrow();
    // Bled viewport — DRUG ključ → svež poskus (vir spet odkloni, a POSKUŠA):
    await expect(
      adapter.search({
        bbox: [46.35, 14.08, 46.39, 14.15],
        zoom: 12,
        cats: ["flight"],
        locale: "sl",
        date: "2026-10-05",
      })
    ).rejects.toThrow();
    expect(calls.filter((c) => c.url.endsWith("/create"))).toHaveLength(2);
  });

  test("④ coalescing: 2 SOČASNI identični poizvedbi → ENA izvedba (create+poll enkrat)", async () => {
    process.env.SKYSCANNER_API_KEY = "k";
    const base = makeMockFetch({});
    const slow = (async (url: string | URL | Request, init?: RequestInit) => {
      await new Promise((r) => setTimeout(r, 120));
      return base.fetchImpl(url, init);
    }) as unknown as typeof fetch;
    const adapter = adapterWith(slow, { originPlaceId: () => "lhr-sky" });
    const [a, b] = await Promise.all([
      adapter.search(LJU_FLIGHT_VIEW),
      adapter.search(LJU_FLIGHT_VIEW),
    ]);
    expect(a).toEqual(b);
    expect(a).toHaveLength(1);
    // Skupna izvedba: 1× create + 1× poll:
    expect(base.calls).toHaveLength(2);
  });

  test("⑤ ŽIVE cene BREZ predpomnilnika rezultatov: druga ZAPOREDNA poizvedba → NOV klic vira", async () => {
    process.env.SKYSCANNER_API_KEY = "k";
    const { fetchImpl, calls } = makeMockFetch({});
    const adapter = adapterWith(fetchImpl, { originPlaceId: () => "lhr-sky" });
    await adapter.search(LJU_FLIGHT_VIEW);
    expect(adapter.lastRunCached()).toBe(false);
    await adapter.search(LJU_FLIGHT_VIEW);
    // TTL 0 (register): žive cene — izpisa NE predpomnimo (4 klicev = 2× full):
    expect(calls).toHaveLength(4);
    expect(adapter.lastRunCached()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// KLASIFIKACIJA NAPAK KLIENTA (isti nabor kot viator klient)
// ---------------------------------------------------------------------------

describe("TASK 53 skyscanner: klasifikacija napak klienta", () => {
  const REQ = {
    query: {
      market: "SI",
      locale: "en-GB",
      currency: "EUR",
      outbound_leg: {
        origin_place_id: "lhr-sky",
        destination_place_id: "lju-sky",
        date: "2026-10-05",
      },
      adults: 1,
      cabin_class: "CABIN_CLASS_ECONOMY",
    },
  };

  async function captureError(promise: Promise<unknown>): Promise<SkyscannerApiError> {
    try {
      await promise;
    } catch (e) {
      return e as SkyscannerApiError;
    }
    throw new Error("expected rejection");
  }

  test("① 401 → unauthorized (klasifikacija + status)", async () => {
    const fetchImpl = (async () =>
      new Response("{}", { status: 401 })) as unknown as typeof fetch;
    const err = await captureError(
      new SkyscannerClient({ apiKey: "k", fetchImpl }).createLiveSearch(REQ)
    );
    expect(err).toBeInstanceOf(SkyscannerApiError);
    expect(err.kind).toBe("unauthorized");
    expect(err.status).toBe(401);
  });

  test("② 403 → forbidden (živi dokaz: brez ključa = 403 Request Forbidden)", async () => {
    const fetchImpl = (async () =>
      new Response("Request Forbidden", { status: 403 })) as unknown as typeof fetch;
    const err = await captureError(
      new SkyscannerClient({ apiKey: "k", fetchImpl }).createLiveSearch(REQ)
    );
    expect(err.kind).toBe("forbidden");
    expect(err.status).toBe(403);
  });

  test("③ 429 + Retry-After 30 → rate-limited + retryAfterSec", async () => {
    const fetchImpl = (async () =>
      new Response("{}", {
        status: 429,
        headers: { "retry-after": "30" },
      })) as unknown as typeof fetch;
    const err = await captureError(
      new SkyscannerClient({ apiKey: "k", fetchImpl }).createLiveSearch(REQ)
    );
    expect(err.kind).toBe("rate-limited");
    expect(err.status).toBe(429);
    expect(err.retryAfterSec).toBe(30);
  });

  test("④ 500 → server", async () => {
    const fetchImpl = (async () =>
      new Response("{}", { status: 500 })) as unknown as typeof fetch;
    const err = await captureError(
      new SkyscannerClient({ apiKey: "k", fetchImpl }).createLiveSearch(REQ)
    );
    expect(err.kind).toBe("server");
    expect(err.status).toBe(500);
  });

  test("⑤ 200 z ne-JSON → invalid-response", async () => {
    const fetchImpl = (async () =>
      new Response("ni-json{{{", { status: 200 })) as unknown as typeof fetch;
    const err = await captureError(
      new SkyscannerClient({ apiKey: "k", fetchImpl }).createLiveSearch(REQ)
    );
    expect(err.kind).toBe("invalid-response");
  });

  test("⑥ omrežna napaka fetch → network", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const err = await captureError(
      new SkyscannerClient({ apiKey: "k", fetchImpl }).createLiveSearch(REQ)
    );
    expect(err.kind).toBe("network");
  });
});

// ---------------------------------------------------------------------------
// ENV LEAK — izhod NIKOLI ne vsebuje vrednosti ključa
// ---------------------------------------------------------------------------

describe("TASK 53 skyscanner: env leak guard", () => {
  test("① produkti + opombe + sporočila napak NE vsebujejo vrednosti ključa", async () => {
    const SECRET = "sk-super-secret-987654321";
    process.env.SKYSCANNER_API_KEY = SECRET;
    const ok = makeMockFetch({});
    const products = await adapterWith(ok.fetchImpl, {
      originPlaceId: () => "lhr-sky",
    }).search(LJU_FLIGHT_VIEW);
    expect(JSON.stringify(products)).not.toContain(SECRET);

    // Napaka vira: sporočilo klasifikacije NE razkrije ključa.
    const bad = makeMockFetch({ createStatus: 401 });
    let errMessage = "";
    try {
      await adapterWith(bad.fetchImpl, {
        originPlaceId: () => "lhr-sky",
      }).search(LJU_FLIGHT_VIEW);
    } catch (e) {
      errMessage = e instanceof Error ? e.message : String(e);
    }
    expect(errMessage).not.toContain(SECRET);
    expect(skyscannerLastNote()).toBeUndefined(); // napaka NE nastavi opombe
  });
});
