// ============================================================================
// TASK 53 — TIQETS ADAPTER: CAPABILITY GATE / DESTINACIJE / MAPPER /
// NEGATIVNI PREDPOMNILNIK / KLASIFIKACIJA NAPAK
// ============================================================================
// Mock fetch je TEST-ONLY preslikava dokumentirane oblike odgovorov vira:
// uspešna ovojnica {success:true, data:[…]} je KONVENCIJA, izpeljana iz
// ŽIVO preverjene napakovne ovojnice (sonda Task 53-1: GET /v2/products?
// city=amsterdam → 401 {success:false, api_version:{major:2,minor:7}}).
// NI izmišljenega inventarja: adapter se preskuša proti obliki, ki jo
// vir dejansko uporablja.
//
// KLJUČNE INVARIANTE:
//  - CAPABILITY GATE: brez TIQETS_API_KEY → iskreno PRAZEN sloj,
//    0 klicev na vir (NI simulacije živega API-ja)
//  - DESTINACIJSKO ISKANJE: bbox → 1–3 kanonskih mest (city param);
//    viewport brez kanonske destinacije → iskreno prazno
//  - STRICT MAPPER: manjkajoči id/naslov → skipped (NI delnega
//    izumljanja); cena samo numerična > 0 + IZRECNO EUR (NIKDOLI 0)
//  - GEO: pin SAMO iz venue koordinat (exact); brez venue = brez pina
//  - NEGATIVNI PREDPOMNILNIK: okvara vira → 60 s brez novih klicev
//  - ENV LEAK GUARD: vrednost ključa NIKOLI v izhodnih produktih
// ============================================================================
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { readFileSync } from "node:fs";
import {
  createTiqetsAdapter,
  resetTiqetsAdapterCaches,
  selectCanonicalDestinations,
  tiqetsLastNote,
  tiqetsLastSkipped,
} from "@/lib/supply/providers/tiqets/adapter";
import { TiqetsApiError } from "@/lib/supply/providers/tiqets/client";
import { searchSupply } from "@/lib/supply/search";
import { DESTINATIONS } from "@/lib/slovenia-data";
import type { SupplyAdapter } from "@/lib/supply/adapter";
import type { ProviderRegistryEntry } from "@/lib/supply/registry";
import type { SupplyQuery } from "@/lib/supply/types";

// ---------------------------------------------------------------------------
// REGISTER MOCK (oblika ProviderRegistryEntry iz registry.ts — smiselne
// vrednosti po nalogi 53: portal-gated svežost → cacheTtlMs 0)
// ---------------------------------------------------------------------------

const ENTRY: ProviderRegistryEntry = {
  slug: "tiqets",
  labels: { sl: "Tiqets", en: "Tiqets" },
  group: "commercial",
  inventoryAccess: ["affiliate_deep_link"],
  status: "affiliate",
  active: true,
  types: ["ticket", "activity"],
  goRoute: "tickets",
  capabilities: {
    geo: true,
    price: true,
    availability: false,
    images: true,
    reviews: false,
    map: true,
    booking: true,
    affiliate: true,
  },
  envKeys: { affiliate: ["TIQETS_AFFILIATE_URL"], api: ["TIQETS_API_KEY"] },
  minZoom: 11,
  cacheTtlMs: 0,
  timeoutMs: 15_000,
  maxCallsPerMin: 20,
  docsUrl: "https://developers.tiqets.dev",
  accessNote: {
    sl: "Distributor API (portal-gated) — danes samo affiliate povezava",
    en: "Distributor API (portal-gated) — today affiliate link only",
  },
};

// ---------------------------------------------------------------------------
// MOCK NAPREDA (DI fetch) — dokumentirana oblika odgovorov vira
// ---------------------------------------------------------------------------

/** Realističen produkt vira po DEFENZIVNI obliki (glej types.ts). */
function ticket(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 123,
    name: "Ljubljana Castle: Skip The Line Ticket",
    description: "Skip-the-line entry to the medieval castle above Ljubljana.",
    venue: {
      name: "Ljubljana Castle",
      latitude: 46.0483,
      longitude: 14.5044,
      address: "Grajska planota 1",
      city: "Ljubljana",
      country: "Slovenia",
    },
    price: { value: 13.0, currency: "EUR" },
    images: [{ url: "https://www.tiqets.com/assets/castle-main.jpg" }],
    url: "https://www.tiqets.com/ljubljana-castle-tickets-p123/en/",
    ...overrides,
  };
}

interface RecordedCall {
  url: string;
  method?: string;
  headers?: Record<string, string>;
}

/**
 * Zgradi mock fetch, ki beleži klice in odgovarja po dokumentirani obliki.
 * productsByCity["*"] = odgovor za KATEROKOLI mesto (testi širokega bbox).
 * status != null → napakovni odgovor vira (živo preverjena ovojnica 401).
 * body → surov odgovor 200 (testi neveljavne ovojnice/ne-JSON).
 */
function makeMockFetch(opts: {
  productsByCity?: Record<string, Record<string, unknown>[]>;
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
    if (opts.status != null && opts.status !== 200) {
      // ŽIVO preverjena napakovna ovojnica (sonda Task 53-1 — 401):
      return new Response(
        JSON.stringify({
          success: false,
          api_version: { major: 2, minor: 7 },
          error: "unauthorized",
          message:
            "The key is incorrect or the user is not authorized to access this resource.",
        }),
        {
          status: opts.status,
          headers: {
            "content-type": "application/json",
            ...(opts.headers ?? {}),
          },
        }
      );
    }
    if (opts.body !== undefined) {
      return new Response(opts.body, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (u.startsWith("https://api.tiqets.com/v2/products")) {
      const city = new URL(u).searchParams.get("city") ?? "?";
      const data =
        opts.productsByCity?.[city] ?? opts.productsByCity?.["*"] ?? [];
      return new Response(JSON.stringify({ success: true, data }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "unexpected-url" }), {
      status: 500,
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

/** Adapter z mock fetch DI. */
function adapterWith(fetchImpl: typeof fetch): SupplyAdapter {
  return createTiqetsAdapter(ENTRY, { fetchImpl });
}

/** Ljubljanski viewport (ozek — 1 kanonska destinacija). */
const LJU_VIEW: SupplyQuery = {
  bbox: [46.02, 14.47, 46.09, 14.55],
  zoom: 12,
  cats: ["ticket"],
  locale: "sl",
};

/** Širok viewport (≥ 4 destinacije → kap na 3 iskanja). */
const WIDE_VIEW: SupplyQuery = {
  bbox: [45.0, 13.0, 47.0, 16.6],
  zoom: 10,
  cats: ["ticket"],
  locale: "sl",
};

/** Viewport BREZ kanonske destinacije (iskreno prazno). */
const NOWHERE_VIEW: SupplyQuery = {
  bbox: [45.9, 14.4, 45.95, 14.5],
  zoom: 12,
  cats: ["ticket"],
  locale: "sl",
};

// ---------------------------------------------------------------------------
// ZAGON/ČIŠČENJE — vsak test doba čisto stanje (cache + env)
// ---------------------------------------------------------------------------

let prevKey: string | undefined;

beforeEach(() => {
  prevKey = process.env.TIQETS_API_KEY;
  resetTiqetsAdapterCaches();
});

afterEach(() => {
  if (prevKey === undefined) delete process.env.TIQETS_API_KEY;
  else process.env.TIQETS_API_KEY = prevKey;
  resetTiqetsAdapterCaches();
});

// ---------------------------------------------------------------------------
// CAPABILITY GATE — brez ključa NI podatkov (in NI klicev)
// ---------------------------------------------------------------------------

describe("TASK 53 Tiqets: capability gate — brez TIQETS_API_KEY", () => {
  test("① iskreno PRAZEN sloj + opomba not-configured + 0 klicev na vir", async () => {
    delete process.env.TIQETS_API_KEY;
    const { fetchImpl, calls } = makeMockFetch({
      productsByCity: { ljubljana: [ticket()] },
    });
    const adapter = adapterWith(fetchImpl);
    const products = await adapter.search(LJU_VIEW);
    expect(products).toEqual([]);
    expect(tiqetsLastNote()).toBe("not-configured");
    expect(calls).toHaveLength(0); // NIKAKOR ne pokličemo vira
  });

  test("② runner: adapter med ADAPTERJI z iskreno opombo, NE v degraded", async () => {
    delete process.env.TIQETS_API_KEY;
    const { fetchImpl, calls } = makeMockFetch({});
    const res = await searchSupply(LJU_VIEW, [adapterWith(fetchImpl)]);
    const info = res.adapters.find((a) => a.slug === "tiqets")!;
    expect(info.ok).toBe(true);
    expect(info.count).toBe(0);
    expect(info.note).toBe("not-configured");
    expect(res.degraded).not.toContain("tiqets"); // NI napaka — stanje
    expect(calls).toHaveLength(0);
    expect(res.products).toEqual([]);
  });

  test("③ SOURCE CONTRACT: adapter NE vsebuje izmišljenega inventory fallbacka", () => {
    // Adapterjeva koda NE sme vsebovati „sample/demo" produktov — edini vir
    // podatkov je pogodbena pot (client). Regresijska varovalka.
    const src = readFileSync(
      new URL("../supply/providers/tiqets/adapter.ts", import.meta.url),
      "utf-8"
    );
    expect(src.includes("not-configured")).toBe(true); // iskrena opomba obstaja
    expect(src.includes("sample")).toBe(false);
    expect(src.includes("DEMO_")).toBe(false);
    expect(src.includes("fallbackProducts")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PRIHODNJA AKTIVACIJA — env ključ + mock po dokumentirani obliki
// ---------------------------------------------------------------------------

describe("TASK 53 Tiqets: prihodnja aktivacija (kanonski produkti)", () => {
  test("① dokumentirana oblika → KANONSKI ProviderProduct + pravilna zahteva", async () => {
    process.env.TIQETS_API_KEY = "test-key-tiqets-123";
    const { fetchImpl, calls } = makeMockFetch({
      productsByCity: { ljubljana: [ticket()] },
    });
    const adapter = adapterWith(fetchImpl);
    const products = await adapter.search(LJU_VIEW);

    // Zahteva: fiksen host + city parameter (živo opažena oblika) + glava.
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.tiqets.com/v2/products?city=ljubljana");
    expect(calls[0].method).toBe("GET");
    const headers = calls[0].headers as Record<string, string>;
    expect(headers["Api-Key"]).toBe("test-key-tiqets-123");
    expect(headers["Accept"]).toBe("application/json");

    // Kanonski produkt (vsa polja IZ VIRA — brez izmišljenih dopolnil):
    expect(products).toHaveLength(1);
    const p = products[0];
    expect(p.id).toBe("tiqets:123");
    expect(p.provider).toBe("tiqets");
    expect(p.providerProductId).toBe("123");
    expect(p.type).toBe("ticket");
    expect(p.title).toBe("Ljubljana Castle: Skip The Line Ticket");
    expect(p.description).toContain("Skip-the-line entry");
    // geo: venue koordinate → exact (NI mestni center):
    expect(p.lat).toBe(46.0483);
    expect(p.lng).toBe(14.5044);
    expect(p.geoPrecision).toBe("exact");
    expect(p.address).toBe("Grajska planota 1, Ljubljana");
    // cena: objavljena od-cena na osebo (EUR, fromPrice):
    expect(p.price).toEqual({
      amount: 13,
      currency: "EUR",
      unit: "per_person",
      fromPrice: true,
      note: "objavljena od-cena na osebo (ni živi citat)",
    });
    // razpoložljivost: unknown (NE preverjamo — NIKOLI available):
    expect(p.availability?.status).toBe("unknown");
    expect(p.availability?.note).toBe("razpoložljivost se preveri pri ponudniku");
    expect(p.bookingMode).toBe("affiliate_redirect");
    // kategorijaška affiliate preusmeritev BREZ product parametra:
    expect(p.bookingUrl).toBe("/go/tickets");
    expect(p.image).toBe("https://www.tiqets.com/assets/castle-main.jpg");
    expect(p.imageCredit).toBe("© Tiqets");
    expect(p.sourceUrl).toBe("https://www.tiqets.com/ljubljana-castle-tickets-p123/en/");
    expect(p.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(p.license).toEqual({
      source: "Tiqets Distributor API",
      attribution: "© Tiqets",
    });
    // ocena NAMERNO odsotna (imena polj portal-gated — ne ugibamo):
    expect(p.rating).toBeUndefined();
    expect(p.reviewCount).toBeUndefined();
    // telemetrija čista izvedba:
    expect(adapter.lastRunCached()).toBe(false);
    expect(tiqetsLastSkipped()).toBe(0);
    expect(tiqetsLastNote()).toBeUndefined();
  });

  test("② BREZ venue koordinat → BREZ pina (iskreno — NE pinamo po mestu)", async () => {
    process.env.TIQETS_API_KEY = "k";
    const bare = ticket({ id: 777, venue: undefined });
    const { fetchImpl } = makeMockFetch({
      productsByCity: { ljubljana: [bare] },
    });
    const products = await adapterWith(fetchImpl).search(LJU_VIEW);
    expect(products).toHaveLength(1);
    expect(products[0].lat).toBeUndefined();
    expect(products[0].lng).toBeUndefined();
    expect(products[0].geoPrecision).toBeUndefined();
    expect(products[0].address).toBeUndefined();
    expect(products[0].title).toBe("Ljubljana Castle: Skip The Line Ticket");
  });

  test("③ EN naslov iz title (defenzivna alternativa za name)", async () => {
    process.env.TIQETS_API_KEY = "k";
    const titled = ticket({ id: 888, title: "Bled Castle Entrance", name: undefined });
    const { fetchImpl } = makeMockFetch({
      productsByCity: { ljubljana: [titled] },
    });
    const products = await adapterWith(fetchImpl).search(LJU_VIEW);
    expect(products).toHaveLength(1);
    expect(products[0].title).toBe("Bled Castle Entrance");
    expect(products[0].id).toBe("tiqets:888");
  });
});

// ---------------------------------------------------------------------------
// DESTINACIJSKA IZBIRA (bbox → 1–3 kanonskih mest)
// ---------------------------------------------------------------------------

describe("TASK 53 Tiqets: destinacijska izbira (city iskanja)", () => {
  test("① selectCanonicalDestinations: vrne SAMO destinacije V bbox (kap 3)", () => {
    const wide = selectCanonicalDestinations([45.0, 13.0, 47.0, 16.6]);
    expect(wide.length).toBe(3); // kap na 3 iskanja (vljudnost vira)
    const [s, w, n, e] = [45.0, 13.0, 47.0, 16.6];
    for (const d of wide) {
      expect(d.lat).toBeGreaterThanOrEqual(s);
      expect(d.lat).toBeLessThanOrEqual(n);
      expect(d.lng).toBeGreaterThanOrEqual(w);
      expect(d.lng).toBeLessThanOrEqual(e);
      expect(DESTINATIONS.some((x) => x.name === d.name)).toBe(true);
    }
    const lju = selectCanonicalDestinations([46.02, 14.47, 46.09, 14.55]);
    expect(lju.map((d) => d.slug)).toEqual(["ljubljana"]);
  });

  test("② ŠIROK viewport → NATANČNO 3 mestna iskanja (cap 1–3)", async () => {
    process.env.TIQETS_API_KEY = "k";
    const many = Array.from({ length: 60 }, (_, i) => ticket({ id: 1000 + i }));
    const { fetchImpl, calls } = makeMockFetch({
      productsByCity: { "*": many },
    });
    const products = await adapterWith(fetchImpl).search(WIDE_VIEW);
    // ≤ 3 klicev na poizvedbo (vljudnost do vira):
    expect(calls).toHaveLength(3);
    for (const c of calls) {
      const city = new URL(c.url).searchParams.get("city") ?? "";
      // ime kanonske destinacije v malih črkah (živo opažena oblika):
      expect(DESTINATIONS.some((d) => d.name.toLowerCase() === city)).toBe(true);
    }
    // dedupe po id → 60 produktov, kap 48 (gostota pod nadzorom):
    expect(products).toHaveLength(48);
    expect(products[0].id).toBe("tiqets:1000");
  });

  test("③ viewport BREZ kanonske destinacije → 0 klicev + no-destination-in-view", async () => {
    process.env.TIQETS_API_KEY = "k";
    const { fetchImpl, calls } = makeMockFetch({ productsByCity: { "*": [ticket()] } });
    const adapter = adapterWith(fetchImpl);
    const products = await adapter.search(NOWHERE_VIEW);
    expect(products).toEqual([]); // NE ugibamo mest (iskreno prazno)
    expect(tiqetsLastNote()).toBe("no-destination-in-view");
    expect(calls).toHaveLength(0);
  });

  test("④ vir vrne PRAZNO data → iskreno prazno (no-match)", async () => {
    process.env.TIQETS_API_KEY = "k";
    const { fetchImpl } = makeMockFetch({ productsByCity: { ljubljana: [] } });
    const adapter = adapterWith(fetchImpl);
    const products = await adapter.search(LJU_VIEW);
    expect(products).toEqual([]);
    expect(tiqetsLastNote()).toBe("no-match");
  });
});

// ---------------------------------------------------------------------------
// STRICT MAPPER — fail-closed (brez delnega izumljanja)
// ---------------------------------------------------------------------------

describe("TASK 53 Tiqets: strict mapper (fail-closed)", () => {
  test("① manjka id ALI naslov → zapis ZAVRŠEN in štet (skipped)", async () => {
    process.env.TIQETS_API_KEY = "k";
    const { fetchImpl } = makeMockFetch({
      productsByCity: {
        ljubljana: [
          ticket(), // veljaven
          { name: "Vstopnica brez ID" }, // BREZ id → zavrnjen
          { id: 456 }, // BREZ naslova → zavrnjen
          { id: "", name: "Prazen id" }, // prazen id → zavrnjen
          ticket({ id: 789, name: "Druga vstopnica" }), // veljaven
        ],
      },
    });
    const adapter = adapterWith(fetchImpl);
    const products = await adapter.search(LJU_VIEW);
    expect(products).toHaveLength(2); // slabim zapisom NI sledi
    expect(products.map((p) => p.providerProductId).sort()).toEqual(["123", "789"]);
    expect(tiqetsLastSkipped()).toBe(3); // šteti v telemetriji
  });

  test("② cena 0/undefined/brez valute/ne-EUR → BREZ cene (NIKDOLI 0)", async () => {
    process.env.TIQETS_API_KEY = "k";
    const { fetchImpl } = makeMockFetch({
      productsByCity: {
        ljubljana: [
          ticket({ id: 201, price: { value: 0, currency: "EUR" } }), // 0 NI cena
          ticket({ id: 202, price: undefined }), // brez cene
          ticket({ id: 203, price: { value: 20, currency: "USD" } }), // izrecna ne-EUR
          ticket({ id: 204, price: { value: 25 } }), // valuta NEZNANA → ne trdimo EUR
          ticket({ id: 205, price: { amount: 31.5, currency: "EUR" } }), // amount oblika
          ticket({ id: 206, price: 9.5 }), // golo število brez valute → ne trdimo EUR
        ],
      },
    });
    const products = await adapterWith(fetchImpl).search(LJU_VIEW);
    expect(products).toHaveLength(6);
    const byId = new Map(products.map((p) => [p.providerProductId, p]));
    expect(byId.get("201")!.price).toBeUndefined(); // NIKOLI 0 kot lažna cena
    expect(byId.get("202")!.price).toBeUndefined();
    expect(byId.get("203")!.price).toBeUndefined(); // ne pretvarjamo, ne lažemo
    expect(byId.get("204")!.price).toBeUndefined(); // neznana valuta → brez cene
    expect(byId.get("205")!.price).toEqual({
      amount: 31.5,
      currency: "EUR",
      unit: "per_person",
      fromPrice: true,
      note: "objavljena od-cena na osebo (ni živi citat)",
    });
    expect(byId.get("206")!.price).toBeUndefined();
  });

  test("③ tuji sourceUrl/slika host → ODSOTNA (meja zaupanja)", async () => {
    process.env.TIQETS_API_KEY = "k";
    const evil = ticket({
      id: 300,
      url: "https://evil.example.com/phishing",
      images: [{ url: "http://www.tiqets.com/insecure.jpg" }], // http NE
    });
    const { fetchImpl } = makeMockFetch({
      productsByCity: { ljubljana: [evil] },
    });
    const products = await adapterWith(fetchImpl).search(LJU_VIEW);
    expect(products).toHaveLength(1);
    expect(products[0].sourceUrl).toBeUndefined(); // tuj host NE
    expect(products[0].image).toBeUndefined(); // http NE (samo https)
  });
});

// ---------------------------------------------------------------------------
// NEGATIVNI PREDPOMNILNIK + KLASIFIKACIJA NAPAK (klient)
// ---------------------------------------------------------------------------

describe("TASK 53 Tiqets: negativni predpomnilnik + klasifikacija napak", () => {
  test("① NAPAČNA ovojnica (200) → invalid-response + recently-failed (0 novih klicev)", async () => {
    process.env.TIQETS_API_KEY = "k";
    const { fetchImpl, calls } = makeMockFetch({ body: '{"foo":"bar"}' });
    const adapter = adapterWith(fetchImpl);

    let caught: unknown;
    try {
      await adapter.search(LJU_VIEW);
    } catch (e) {
      caught = e;
    }
    expect(caught instanceof TiqetsApiError).toBe(true);
    expect((caught as TiqetsApiError).kind).toBe("invalid-response");
    expect(calls).toHaveLength(1); // prvi poskus je bil

    // Negativni predpomnilnik: ponovitev v oknu 60 s → praznina, 0 klicev:
    const second = await adapter.search(LJU_VIEW);
    expect(second).toEqual([]);
    expect(tiqetsLastNote()).toBe("recently-failed");
    expect(calls).toHaveLength(1); // NI novih klicev (vljudnost do vira)
  });

  test("② ne-JSON odgovor → invalid-response (invalid-json) + negativni cache", async () => {
    process.env.TIQETS_API_KEY = "k";
    const { fetchImpl, calls } = makeMockFetch({ body: "ne-JSON {{{" });
    const adapter = adapterWith(fetchImpl);
    let caught: unknown;
    try {
      await adapter.search(LJU_VIEW);
    } catch (e) {
      caught = e;
    }
    expect(caught instanceof TiqetsApiError).toBe(true);
    expect((caught as TiqetsApiError).kind).toBe("invalid-response");
    expect((caught as TiqetsApiError).message).toBe("invalid-json");
    await adapter.search(LJU_VIEW);
    expect(tiqetsLastNote()).toBe("recently-failed");
    expect(calls).toHaveLength(1);
  });

  test("③ HTTP 401 → unauthorized (živo preverjena vrata) + negativni cache", async () => {
    process.env.TIQETS_API_KEY = "k";
    const { fetchImpl, calls } = makeMockFetch({ status: 401 });
    const adapter = adapterWith(fetchImpl);
    let caught: unknown;
    try {
      await adapter.search(LJU_VIEW);
    } catch (e) {
      caught = e;
    }
    expect(caught instanceof TiqetsApiError).toBe(true);
    expect((caught as TiqetsApiError).kind).toBe("unauthorized");
    expect((caught as TiqetsApiError).status).toBe(401);
    // Okvara ključa se zapomni 60 s — vir NE dobiva zaporednih klicev:
    await adapter.search(LJU_VIEW);
    expect(tiqetsLastNote()).toBe("recently-failed");
    expect(calls).toHaveLength(1);
  });

  test("④ HTTP 429 + Retry-After → rate-limited + retryAfterSec", async () => {
    process.env.TIQETS_API_KEY = "k";
    const { fetchImpl } = makeMockFetch({
      status: 429,
      headers: { "retry-after": "30" },
    });
    const adapter = adapterWith(fetchImpl);
    let caught: unknown;
    try {
      await adapter.search(LJU_VIEW);
    } catch (e) {
      caught = e;
    }
    expect(caught instanceof TiqetsApiError).toBe(true);
    const err = caught as TiqetsApiError;
    expect(err.kind).toBe("rate-limited");
    expect(err.retryAfterSec).toBe(30); // prebrano iz glave vira
  });

  test("⑤ HTTP 503 → server (začasna odpoved vira)", async () => {
    process.env.TIQETS_API_KEY = "k";
    const { fetchImpl } = makeMockFetch({ status: 503 });
    const adapter = adapterWith(fetchImpl);
    let caught: unknown;
    try {
      await adapter.search(LJU_VIEW);
    } catch (e) {
      caught = e;
    }
    expect(caught instanceof TiqetsApiError).toBe(true);
    expect((caught as TiqetsApiError).kind).toBe("server");
    expect((caught as TiqetsApiError).status).toBe(503);
  });
});

// ---------------------------------------------------------------------------
// PREDPOMNILNIK (TTL iz registra) + COALESCING
// ---------------------------------------------------------------------------

describe("TASK 53 Tiqets: predpomnilnik + coalescing", () => {
  test("① cacheTtlMs 0 (portal-gated svežost) → BREZ predpomnilnika (vsaka poizvedba sveža)", async () => {
    process.env.TIQETS_API_KEY = "k";
    const { fetchImpl, calls } = makeMockFetch({
      productsByCity: { ljubljana: [ticket()] },
    });
    const adapter = adapterWith(fetchImpl); // ENTRY.cacheTtlMs === 0
    await adapter.search(LJU_VIEW);
    expect(adapter.lastRunCached()).toBe(false);
    await adapter.search(LJU_VIEW);
    expect(adapter.lastRunCached()).toBe(false); // iskreno no-store
    expect(calls).toHaveLength(2); // druga poizvedba = nov klic vira
  });

  test("② cacheTtlMs > 0 (register preklop) → druga ISTA poizvedba iz predpomnilnika", async () => {
    process.env.TIQETS_API_KEY = "k";
    const { fetchImpl, calls } = makeMockFetch({
      productsByCity: { ljubljana: [ticket()] },
    });
    const adapter = createTiqetsAdapter(
      { ...ENTRY, cacheTtlMs: 60_000 },
      { fetchImpl }
    );
    const first = await adapter.search(LJU_VIEW);
    expect(calls).toHaveLength(1);
    expect(adapter.lastRunCached()).toBe(false);
    const second = await adapter.search(LJU_VIEW);
    expect(calls).toHaveLength(1); // NI novih klicev
    expect(adapter.lastRunCached()).toBe(true);
    expect(second).toEqual(first);
  });

  test("③ coalescing: 2 SOČASNI identični poizvedbi → ENA izvedba (1 klic)", async () => {
    process.env.TIQETS_API_KEY = "k";
    const base = makeMockFetch({ productsByCity: { ljubljana: [ticket()] } });
    const slow = (async (url: string | URL | Request, init?: RequestInit) => {
      await new Promise((r) => setTimeout(r, 120)); // sočasnost je realna
      return base.fetchImpl(url, init);
    }) as unknown as typeof fetch;
    const adapter = adapterWith(slow);
    const [a, b] = await Promise.all([
      adapter.search(LJU_VIEW),
      adapter.search(LJU_VIEW),
    ]);
    expect(a).toEqual(b);
    expect(a).toHaveLength(1);
    expect(base.calls).toHaveLength(1); // deljena izvedba
  });
});

// ---------------------------------------------------------------------------
// ENV LEAK GUARD — vrednost ključa NIKOLI v izhodnih produktih
// ---------------------------------------------------------------------------

describe("TASK 53 Tiqets: env leak guard", () => {
  test("① vrednost TIQETS_API_KEY se NE razkrije v izhodu adapterja", async () => {
    const secret = "LEAKGUARD-tiqets-9f1e-do-not-leak";
    process.env.TIQETS_API_KEY = secret;
    const many = [ticket(), ticket({ id: 999, name: "Druga" })];
    const { fetchImpl, calls } = makeMockFetch({
      productsByCity: { ljubljana: many },
    });
    const products = await adapterWith(fetchImpl).search(LJU_VIEW);
    expect(products).toHaveLength(2);
    // Ključ JE v zahtevi (glava) …
    expect((calls[0].headers as Record<string, string>)["Api-Key"]).toBe(secret);
    // … a NIKOLI v izhodnih produktih (vsa polja, vse globine):
    const dump = JSON.stringify(products);
    expect(dump).not.toContain(secret);
    expect(dump).not.toContain("LEAKGUARD");
  });
});
