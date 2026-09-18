// ============================================================================
// TASK 46 — GETYOURGUIDE: ADAPTER TESTI (capability gate / geo / predpomnilnik)
// ============================================================================
// Invariante:
//  - §3 CAPABILITY GATE: brez žetona → PRAZEN sloj + „not-configured“ +
//    0 klicev na vir (NI simulacije živega API-ja)
//  - §10 GEO: viewport → center + radius (domneva km — dokumentirana);
//    post-filter pinov na bbox; brez-geo produkti ostanejo
//  - §11 PREDPOMNILNIK: vir prepoveduje cachanje izpisa → NI predpomnilnika
//    rezultatov (zaporedna enaka poizvedba = NOV klic); coalescing deli
//    SOČASNE poizvedbe; negativni predpomnilnik 60 s (429: 310 s —
//    dokumentirana 5-minutna blokada vira)
//  - REGISTROVNA integracija: adapter priklopljen, zoom gating, kategorije
// ============================================================================
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  createGetYourGuideAdapter,
  resetGetYourGuideAdapterCaches,
  gygLastNote,
  searchRadiusKm,
} from "@/lib/supply/providers/getyourguide/adapter";
import { clearGygTourUrls } from "@/lib/supply/providers/getyourguide/mapper";
import { getProvider } from "@/lib/supply/registry";
import { searchSupply } from "@/lib/supply/search";
import { clearProviderRateLimits } from "@/lib/supply/search";
import type { SupplyAdapter } from "@/lib/supply/adapter";
import type { ProviderProduct, SupplyQuery } from "@/lib/supply/types";
import type { GygToursResponse } from "@/lib/supply/providers/getyourguide/types";

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

/** Uradi primer Tour (Making-a-booking.md), Ljubljansko prilagojen za geo teste. */
function gygTour(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tour_id: 12345,
    title: "Ljubljana: Old Town Walking Tour",
    abstract: "Discover the charms of Ljubljana's old town.",
    overall_rating: 4.6,
    number_of_ratings: 850,
    pictures: [
      {
        ssl_url: "https://cdn.getyourguide.com/img/tour/abc.jpeg/[format_id].jpg",
      },
    ],
    coordinates: { lat: 46.0569, long: 14.5058 },
    price: { values: { amount: 19 }, description: "individual" },
    url: "https://www.getyourguide.com/ljubljana-l16/x-t12345/?partner_id=TEST&psrc=partner_api&currency=EUR",
    durations: [{ duration: 2, unit: "hour" }],
    activity_type: "guidedTour",
    ...overrides,
  };
}

/** Odgovor vira (200 OK, EUR potrjjen). */
function toursResponse(tours: Array<Record<string, unknown>>, totalCount?: number): Response {
  const body: GygToursResponse = {
    _metadata: {
      ...(totalCount != null ? { totalCount } : {}),
      exchange: { rate: 1, currency: "eur" },
    },
    data: { tours: tours as never },
  };
  return new Response(JSON.stringify(body), { status: 200 });
}

/** Fetch shim, ki beleži klice in vrne pripravljen odgovor. */
function recordingFetch(responses: Array<() => Response>) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    calls.push(String(url));
    const next = responses.shift();
    if (!next) throw new Error("no-more-responses");
    return next();
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const ENV_BACKUP = {
  token: process.env.GETYOURGUIDE_API_TOKEN,
  base: process.env.GETYOURGUIDE_API_BASE,
};

beforeEach(() => {
  resetGetYourGuideAdapterCaches();
  clearGygTourUrls();
  clearProviderRateLimits();
  process.env.GETYOURGUIDE_API_TOKEN = "test-gyg-token";
  delete process.env.GETYOURGUIDE_API_BASE;
});

afterEach(() => {
  if (ENV_BACKUP.token == null) delete process.env.GETYOURGUIDE_API_TOKEN;
  else process.env.GETYOURGUIDE_API_TOKEN = ENV_BACKUP.token;
  if (ENV_BACKUP.base == null) delete process.env.GETYOURGUIDE_API_BASE;
  else process.env.GETYOURGUIDE_API_BASE = ENV_BACKUP.base;
});

function makeAdapter(fetchImpl?: typeof fetch): SupplyAdapter {
  return createGetYourGuideAdapter(ENTRY, fetchImpl ? { fetchImpl } : {});
}

// ---------------------------------------------------------------------------
// §3: CAPABILITY GATE (iskren — brez žetona NI podatkov)
// ---------------------------------------------------------------------------

describe("TASK 46 §3: capability gate — brez žetona plast iskreno PRAZNA", () => {
  test("brez GETYOURGUIDE_API_TOKEN → [] + note „not-configured“ + 0 klicev na vir", async () => {
    delete process.env.GETYOURGUIDE_API_TOKEN;
    const { calls, fetchImpl } = recordingFetch([]);
    const adapter = makeAdapter(fetchImpl);
    const products = await adapter.search(LJU_VIEW);
    expect(products).toEqual([]);
    expect(gygLastNote()).toBe("not-configured");
    expect(calls.length).toBe(0); // vir NI klican (NE simuliramo)
  });

  test("brez bbox → note „no-bbox“ (že z žetonom)", async () => {
    const { calls, fetchImpl } = recordingFetch([]);
    const adapter = makeAdapter(fetchImpl);
    const products = await adapter.search({ ...LJU_VIEW, bbox: undefined });
    expect(products).toEqual([]);
    expect(gygLastNote()).toBe("no-bbox");
    expect(calls.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// §10: GEO SEMANTIKA (center + radius + post-filter)
// ---------------------------------------------------------------------------

describe("TASK 46 §10: geo iskanje (coordinates[] krog + post-filter na bbox)", () => {
  test("EN klic na poizvedbo z centerjem bboxa + radiusom (domneva km, dokumentirana)", async () => {
    const { calls, fetchImpl } = recordingFetch([
      () => toursResponse([gygTour()]),
    ]);
    const adapter = makeAdapter(fetchImpl);
    const products = await adapter.search(LJU_VIEW);
    expect(products.length).toBe(1);
    expect(calls.length).toBe(1);
    const u = new URL(calls[0]);
    const coords = u.searchParams.getAll("coordinates[]");
    // center LJU bboxa [46.02,14.47,46.09,14.55]
    expect(Number(coords[0])).toBeCloseTo(46.055, 2);
    expect(Number(coords[1])).toBeCloseTo(14.51, 2);
    // radius = pol-diagonala × 1.25 (~5 km), min 5
    expect(Number(coords[2])).toBeGreaterThanOrEqual(5);
    expect(Number(coords[2])).toBeLessThanOrEqual(150);
  });

  test("searchRadiusKm: meje (min 5 km, max 150 km) + rast z viewportom", () => {
    // ozek Ljubljanski viewport (~0.07°×0.08°) → ~6 km (pol-diagonala × 1.25)
    const narrow = searchRadiusKm([46.02, 14.47, 46.09, 14.55]);
    expect(narrow).toBeGreaterThanOrEqual(5);
    expect(narrow).toBeLessThanOrEqual(10);
    // regionalni (~1.5°) → 100+ km
    const regional = searchRadiusKm([45.4, 13.5, 46.9, 15.0]);
    expect(regional).toBeGreaterThanOrEqual(80);
    expect(regional).toBeLessThanOrEqual(150);
    // državni (6°) → kapiran na 150
    expect(searchRadiusKm([45.3, 13.3, 46.9, 16.7])).toBe(150);
  });

  test("post-filter: pin IZVEN bboxa odpade (varovalka domneve km) + note bbox-filtered", async () => {
    const far = gygTour({
      tour_id: 999,
      coordinates: { lat: 45.5, long: 13.5 }, // Koper — zunaj LJU bboxa
      title: "Piran: Coastal Walk",
    });
    const { fetchImpl } = recordingFetch([() => toursResponse([gygTour(), far])]);
    const adapter = makeAdapter(fetchImpl);
    const products = await adapter.search(LJU_VIEW);
    expect(products.length).toBe(1);
    expect(products[0]?.providerProductId).toBe("12345");
    expect(gygLastNote()).toBe("bbox-filtered");
  });

  test("produkt BREZ koordinat OSTANE (vir ga je geografsko uvrstil v krog)", async () => {
    const noGeo = gygTour({ tour_id: 777, coordinates: undefined, title: "No-geo product" });
    const { fetchImpl } = recordingFetch([() => toursResponse([gygTour(), noGeo])]);
    const adapter = makeAdapter(fetchImpl);
    const products = await adapter.search(LJU_VIEW);
    expect(products.length).toBe(2);
    const nogeo = products.find((p) => p.providerProductId === "777");
    expect(nogeo?.lat).toBeUndefined();
    expect(nogeo?.geoPrecision).toBeUndefined();
  });

  test("datum uporabnika → date[] okno poslano viru (pogodbena semantika offered-on-date)", async () => {
    const { calls, fetchImpl } = recordingFetch([() => toursResponse([gygTour()])]);
    const adapter = makeAdapter(fetchImpl);
    await adapter.search({ ...LJU_VIEW, date: "2026-09-25" });
    expect(new URL(calls[0]).searchParams.getAll("date[]")).toEqual([
      "2026-09-25T00:00:00",
      "2026-09-25T23:59:59",
    ]);
  });

  test("kap: totalCount vira > vrnjenih → note „capped“ (iskrenost)", async () => {
    const { fetchImpl } = recordingFetch([() => toursResponse([gygTour()], 120)]);
    const adapter = makeAdapter(fetchImpl);
    await adapter.search(LJU_VIEW);
    expect(gygLastNote()).toBe("capped");
  });
});

// ---------------------------------------------------------------------------
// §11: PREDPOMNILNIK (pogodba vira: real-time, NE scrapati)
// ---------------------------------------------------------------------------

describe("TASK 46 §11: predpomnilnik — NI predpomnilnika rezultatov (vir prepoveduje)", () => {
  test("ZAPOREDNA enaka poizvedba = NOV klic vira (NE cachamo izpisa iskanj)", async () => {
    const { calls, fetchImpl } = recordingFetch([
      () => toursResponse([gygTour()]),
      () => toursResponse([gygTour()]),
    ]);
    const adapter = makeAdapter(fetchImpl);
    await adapter.search(LJU_VIEW);
    await adapter.search(LJU_VIEW);
    expect(calls.length).toBe(2); // ← nasprotje Viatorja (tam 1) — po pogodbi vira
  });

  test("COALESCING: SOČASNI enaki poizvedbi delita ENO izvedbo (dedup klicev, ne cache)", async () => {
    let hits = 0;
    const fetchImpl = (async () => {
      hits++;
      return toursResponse([gygTour()]);
    }) as unknown as typeof fetch;
    const adapter = makeAdapter(fetchImpl);
    // OBE poizvedbi zagnani SINHRONO (isti mikrotask) — druga najde prvo
    // v izvedbi (inflight) in delita IZVEDBO, ne odpoved.
    const [a, b] = await Promise.all([
      adapter.search(LJU_VIEW),
      adapter.search(LJU_VIEW),
    ]);
    expect(a.length).toBe(1);
    expect(b.length).toBe(1);
    expect(hits).toBe(1); // ENA izvedba za DVE sočasni poizvedbi
  });

  test("negativni predpomnilnik: okvara vira → 60 s NE kličemo (vljudnost)", async () => {
    const { calls, fetchImpl } = recordingFetch([
      () => new Response("{}", { status: 500 }),
    ]);
    const adapter = makeAdapter(fetchImpl);
    await expect(adapter.search(LJU_VIEW)).rejects.toThrow();
    const products = await adapter.search(LJU_VIEW);
    expect(products).toEqual([]);
    expect(gygLastNote()).toBe("recently-failed");
    expect(calls.length).toBe(1); // drugi poskus NI šel na vir
  });

  test("429 → negativni predpomnilnik 310 s (dokumentirana 5-minutna blokada vira)", async () => {
    const { calls, fetchImpl } = recordingFetch([
      () => new Response("{}", { status: 429 }),
    ]);
    const adapter = makeAdapter(fetchImpl);
    await expect(adapter.search(LJU_VIEW)).rejects.toThrow();
    await adapter.search(LJU_VIEW);
    expect(gygLastNote()).toBe("recently-failed");
    expect(calls.length).toBe(1);
  });

  test("401 (neveljaven žeton) → okvara (degraded), NE tiho prazen", async () => {
    const { fetchImpl } = recordingFetch([
      () => new Response(JSON.stringify({ errors: [{ errorCode: 2420 }] }), { status: 401 }),
    ]);
    const adapter = makeAdapter(fetchImpl);
    await expect(adapter.search(LJU_VIEW)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// §12: VALUTA (NE pretvarjamo, NE lažemo)
// ---------------------------------------------------------------------------

describe("TASK 46 §12: valuta — _metadata.exchange mora potrditi EUR", () => {
  test("odgovor v NE-EUR (metadata) → cene ODSOTNE, produkti ŽIVI", async () => {
    const body = {
      _metadata: { exchange: { rate: 1, currency: "usd" } },
      data: { tours: [gygTour()] },
    };
    const { fetchImpl } = recordingFetch([
      () => new Response(JSON.stringify(body), { status: 200 }),
    ]);
    const adapter = makeAdapter(fetchImpl);
    const products = await adapter.search(LJU_VIEW);
    expect(products.length).toBe(1);
    expect(products[0]?.price).toBeUndefined(); // NE pretvarjamo
  });

  test("odgovor BREZ exchange metadata → cene ŽIVE (EUR bil zahtevan, vir stateless)", async () => {
    const body = { data: { tours: [gygTour()] } };
    const { fetchImpl } = recordingFetch([
      () => new Response(JSON.stringify(body), { status: 200 }),
    ]);
    const adapter = makeAdapter(fetchImpl);
    const products = await adapter.search(LJU_VIEW);
    expect(products[0]?.price?.currency).toBe("EUR");
    expect(products[0]?.price?.amount).toBe(19);
  });
});

// ---------------------------------------------------------------------------
// REGISTROVNA INTEGRACIJA (priklop v supply search)
// ---------------------------------------------------------------------------

describe("TASK 46 §6: centralni registry — priklop brez novih seznamov", () => {
  test("register: getyourguide AKTIVEN, cacheTtlMs 0 (vir prepoveduje cache izpisa), maxCallsPerMin 60 (< 130 vira)", () => {
    expect(ENTRY.active).toBe(true);
    expect(ENTRY.slug).toBe("getyourguide");
    expect(ENTRY.group).toBe("commercial");
    expect(ENTRY.cacheTtlMs).toBe(0);
    expect(ENTRY.maxCallsPerMin).toBe(60);
    expect(ENTRY.minZoom).toBe(10);
    expect(ENTRY.timeoutMs).toBeGreaterThan(0);
    expect(ENTRY.types).toContain("activity");
    expect(ENTRY.types).toContain("tour");
    expect(ENTRY.envKeys.api).toContain("GETYOURGUIDE_API_TOKEN");
    expect(ENTRY.goRoute).toBe("activities"); // obstoječa kartica; produkt pot = /go/getyourguide
  });

  test("defaultAdapters(): GYG je med privzetimi adapterji (skupaj z OSM + KT + Viator)", async () => {
    const { defaultAdapters } = await import("@/lib/supply/search");
    const slugs = defaultAdapters().map((a) => a.entry.slug);
    expect(slugs).toContain("getyourguide");
    expect(slugs).toContain("osm");
    expect(slugs).toContain("kiwitaxi");
    expect(slugs).toContain("viator");
  });

  test("searchSupply: cats=activity (z ≥ 10) pokliče GYG adapter; zoom < minZoom ga NE", async () => {
    const { calls, fetchImpl } = recordingFetch([() => toursResponse([gygTour()])]);
    const adapter = makeAdapter(fetchImpl);
    const res = await searchSupply(LJU_VIEW, [adapter]);
    expect(res.products.length).toBe(1);
    expect(res.products[0]?.provider).toBe("getyourguide");
    expect(calls.length).toBe(1);
    const gygInfo = res.adapters.find((a) => a.slug === "getyourguide");
    expect(gygInfo?.ok).toBe(true);
    expect(gygInfo?.count).toBe(1);

    // zoom 9 < minZoom 10 → zoom-gated, 0 klicev
    const { calls: calls2, fetchImpl: fetch2 } = recordingFetch([]);
    const adapter2 = makeAdapter(fetch2);
    const res2 = await searchSupply({ ...LJU_VIEW, zoom: 9 }, [adapter2]);
    expect(calls2.length).toBe(0);
    const gygInfo2 = res2.adapters.find((a) => a.slug === "getyourguide");
    expect(gygInfo2?.note).toBe("zoom-gated");
  });

  test("searchSupply: cats=transfer (brez activity/tour) → GYG cat-gated (0 klicev)", async () => {
    const { calls, fetchImpl } = recordingFetch([]);
    const adapter = makeAdapter(fetchImpl);
    const res = await searchSupply(
      { ...LJU_VIEW, cats: ["transfer"] },
      [adapter]
    );
    expect(calls.length).toBe(0);
    const gygInfo = res.adapters.find((a) => a.slug === "getyourguide");
    expect(gygInfo?.note).toBe("cat-gated");
  });

  test("mapping skozi searchSupply: kanonski produkt (provider, id, geo, cena, booking)", async () => {
    const { fetchImpl } = recordingFetch([() => toursResponse([gygTour()])]);
    const adapter = makeAdapter(fetchImpl);
    const res = await searchSupply(LJU_VIEW, [adapter]);
    const p: ProviderProduct | undefined = res.products[0];
    expect(p?.provider).toBe("getyourguide");
    expect(p?.providerProductId).toBe("12345");
    expect(p?.id).toBe("getyourguide:12345");
    expect(p?.type).toBe("tour");
    expect(p?.lat).toBeCloseTo(46.0569, 4);
    expect(p?.geoPrecision).toBe("city");
    expect(p?.price?.amount).toBe(19);
    expect(p?.price?.unit).toBe("per_person");
    expect(p?.bookingUrl).toBe("/go/getyourguide?product=12345");
    expect(p?.availability?.status).toBe("unknown");
    expect(res.counts.byProvider.getyourguide).toBe(1);
  });
});
