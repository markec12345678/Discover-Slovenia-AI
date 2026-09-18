// ============================================================================
// TASK 45 — VIATOR: POGODBENI TESTI (mapper / klient / destinations)
// ============================================================================
// Mock je TEST-ONLY preslikava ŽIVO preverjene uradne sheme (docs.viator.com
// /partner-api/technical + Golden Path primer, 18. 9. 2026) — identičen
// vzorec kot kiwitaxi testi (fs injekcija) pri Tasku 43: NI izmišljenega
// inventarja, samo preslikava dokumentiranih odgovorov vira.
//
// Kritične invariante:
//  - §4/§5: ProviderProduct OSTANE provider-agnostic (0 viator* polj)
//  - §7: podatek, ki ga vir nima → ODSOTEN (nikoli izmišljen)
//  - §8: geo SEMANTIKA — destination_center (nikoli exact)
//  - §11: cena = od-cena per_person + opomba; cena ≠ razpoložljivost
//  - §12: availability = unknown (Basic Access NIMA /availability/check)
//  - §13: slike samo iz vira (https, cover, © Viator)
//  - §14: ocena samo pri dokazanih recenzijah
// ============================================================================
import { describe, expect, test } from "bun:test";
import {
  viatorSummaryToProduct,
  canonicalType,
  rememberViatorProductUrl,
  lookupViatorProductUrl,
  clearViatorProductUrls,
  mapViatorSummaries,
} from "@/lib/supply/providers/viator/mapper";
import {
  isViatorProductSummary,
  filterValidSummaries,
  isViatorDestination,
  isViatorProductCode,
  VIATOR_PRODUCT_CODE_RE,
} from "@/lib/supply/providers/viator/types";
import {
  buildDestIndex,
  selectViewportDestinations,
  canonicalInView,
  resolveProductPin,
  pinInBbox,
  resetViatorDestinations,
  type CanonicalDestInput,
} from "@/lib/supply/providers/viator/destinations";
import {
  ViatorClient,
  ViatorApiError,
  viatorApiKeyFromEnv,
  viatorBaseUrlFromEnv,
  VIATOR_DEFAULT_BASE,
} from "@/lib/supply/providers/viator/client";
import type { ViatorProductSummary } from "@/lib/supply/providers/viator/types";
import type { ProviderProduct } from "@/lib/supply/types";

// ---------------------------------------------------------------------------
// FIXTURE — PRESLIKAVA URADNEGA PRIMERA (Golden Path / docs.viator.com)
// ---------------------------------------------------------------------------

/** Uradi primer ProductSummary (Golden Path, Acadia) — prilagojen na EUR. */
function officialSummary(overrides: Partial<ViatorProductSummary> = {}): ViatorProductSummary {
  return {
    productCode: "227717P1",
    title: "Acadia National Park private minivan tour- 3 Hours Local Guides",
    description:
      "A local guide will show you all the highlights of Acadia National Park!\n\nWe will pick you up and we will drive along the stunning 27-mile long Park Loop Road.",
    images: [
      {
        imageSource: "SUPPLIER_PROVIDED",
        caption: "Bar Harbor",
        isCover: true,
        variants: [
          { height: 50, width: 50, url: "https://media-cdn.tripadvisor.com/media/attractions-splice-spp-50x50/0b/d5/69/3d.jpg" },
          { height: 400, width: 400, url: "https://media-cdn.tripadvisor.com/media/attractions-splice-spp-400x400/0b/d5/69/3d.jpg" },
          { height: 446, width: 674, url: "https://media-cdn.tripadvisor.com/media/attractions-splice-spp-674x446/0b/d5/69/3d.jpg" },
          { height: 60, width: 40, url: "http://insecure.example.com/x.jpg" }, // http → zavrnjen
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
    destinations: [{ ref: "4371", primary: true }],
    tags: [11930, 21956],
    flags: ["FREE_CANCELLATION", "PRIVATE_TOUR", "LIKELY_TO_SELL_OUT"],
    translationInfo: { containsMachineTranslatedText: false },
    ...overrides,
  };
}

const LJU_PIN = { lat: 46.0569, lng: 14.5058, name: "Ljubljana", fallback: false };

const MAP_CTX = { locale: "sl" as const, fetchedAt: "2026-09-18T12:00:00Z", pin: LJU_PIN };

// ---------------------------------------------------------------------------
// §5 KANONSKA ČISTOST — ProviderProduct OSTAJE provider-agnostic
// ---------------------------------------------------------------------------

describe("TASK 45 §5: kanonski model ostaja provider-agnostic (Viator)", () => {
  test("NI viator* polj v preslikanem produktu (source-scan na objektu)", () => {
    clearViatorProductUrls();
    const p = viatorSummaryToProduct(officialSummary(), MAP_CTX);
    expect(p).not.toBeNull();
    for (const key of Object.keys(p as object)) {
      expect(key.toLowerCase().startsWith("viator")).toBe(false);
    }
    // Ključ nazaj pri ponudniku je (provider, providerProductId) — arhitektura:
    expect((p as ProviderProduct).provider).toBe("viator");
    expect((p as ProviderProduct).providerProductId).toBe("227717P1");
    expect((p as ProviderProduct).id).toBe("viator:227717P1");
  });

  test("taksonomija: itineraryType → kanonski tipi (activity/tour) — brez Viator kategorij", () => {
    expect(canonicalType("ACTIVITY")).toBe("activity");
    expect(canonicalType("STANDARD")).toBe("tour");
    expect(canonicalType("MULTI_DAY_TOUR")).toBe("tour");
    expect(canonicalType("HOP_ON_HOP_OFF")).toBe("tour");
    expect(canonicalType("UNSTRUCTURED")).toBe("tour");
    expect(canonicalType(undefined)).toBe("tour");
    const p = viatorSummaryToProduct(officialSummary({ itineraryType: "ACTIVITY" }), MAP_CTX);
    expect(p?.type).toBe("activity");
    const p2 = viatorSummaryToProduct(officialSummary({ itineraryType: "STANDARD" }), MAP_CTX);
    expect(p2?.type).toBe("tour");
  });

  test("subcategory IZ vira (PRIVATE_TOUR flag) — izpeljano, ne izmišljeno", () => {
    clearViatorProductUrls();
    const withPrivate = viatorSummaryToProduct(officialSummary(), MAP_CTX);
    expect(withPrivate?.subcategory).toBe("private_tour");
    const without = viatorSummaryToProduct(
      officialSummary({ flags: ["FREE_CANCELLATION"] }),
      MAP_CTX
    );
    expect(without?.subcategory).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// §7 REAL DATA ONLY — vir nima → ODSOTNO
// ---------------------------------------------------------------------------

describe("TASK 45 §7: podatki, ki jih vir nima, so ODSOTNI (nikoli izmišljeni)", () => {
  test("brez cene v viru → price undefined (NE 0, NE izmišljena)", () => {
    clearViatorProductUrls();
    const p = viatorSummaryToProduct(
      officialSummary({ pricing: { summary: {}, currency: "EUR" } }),
      MAP_CTX
    );
    expect(p?.price).toBeUndefined();
  });

  test("cena v NE-EUR valuti → price undefined (NE pretvarjamo, NE lažemo o valuti)", () => {
    clearViatorProductUrls();
    const p = viatorSummaryToProduct(
      officialSummary({ pricing: { summary: { fromPrice: 500 }, currency: "USD" } }),
      MAP_CTX
    );
    expect(p?.price).toBeUndefined();
  });

  test("cena 0 / NaN / Infinity → price undefined", () => {
    clearViatorProductUrls();
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const p = viatorSummaryToProduct(
        officialSummary({ pricing: { summary: { fromPrice: bad }, currency: "EUR" } }),
        MAP_CTX
      );
      expect(p?.price).toBeUndefined();
    }
  });

  test("0 recenzij → NI ocene (rating/reviewCount ODSOTNA)", () => {
    clearViatorProductUrls();
    const p = viatorSummaryToProduct(
      officialSummary({
        reviews: { sources: [], totalReviews: 0, combinedAverageRating: 0 },
      }),
      MAP_CTX
    );
    expect(p?.rating).toBeUndefined();
    expect(p?.reviewCount).toBeUndefined();
  });

  test("http (ne-https) slikovne variante so zavrnjene; izbere največjo https ≤ 674", () => {
    clearViatorProductUrls();
    const p = viatorSummaryToProduct(officialSummary(), MAP_CTX);
    expect(p?.image).toBe(
      "https://media-cdn.tripadvisor.com/media/attractions-splice-spp-674x446/0b/d5/69/3d.jpg"
    );
    expect(p?.imageCredit).toBe("© Viator");
  });

  test("brez slik v viru → image undefined (NE placeholderja)", () => {
    clearViatorProductUrls();
    const p = viatorSummaryToProduct(officialSummary({ images: [] }), MAP_CTX);
    expect(p?.image).toBeUndefined();
    expect(p?.imageCredit).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// §8 GEO SEMANTIKA — destination_center, NIKOLI exact
// ---------------------------------------------------------------------------

describe("TASK 45 §8: geo semantika (destination_center)", () => {
  test("pin = center destinacije + geoPrecision destination_center (NIKOLI exact)", () => {
    clearViatorProductUrls();
    const p = viatorSummaryToProduct(officialSummary(), MAP_CTX);
    expect(p?.lat).toBe(46.0569);
    expect(p?.lng).toBe(14.5058);
    expect(p?.geoPrecision).toBe("destination_center");
    expect(p?.address).toBe("Ljubljana");
  });

  test("brez pina (neznanje) → brez lat/lng/geoPrecision — NE izmišljujemo lokacije", () => {
    clearViatorProductUrls();
    const p = viatorSummaryToProduct(officialSummary(), {
      ...MAP_CTX,
      pin: null,
    });
    expect(p?.lat).toBeUndefined();
    expect(p?.lng).toBeUndefined();
    expect(p?.geoPrecision).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// §11 CENA — semantika od-cene; §12 RAZPOLOŽLJIVOST ≠ CENA
// ---------------------------------------------------------------------------

describe("TASK 45 §11/§12: cena in razpoložljivost (semantika)", () => {
  test("cena: amount + EUR + per_person + fromPrice + opomba (dokumentirana od-cena)", () => {
    clearViatorProductUrls();
    const p = viatorSummaryToProduct(officialSummary(), MAP_CTX);
    expect(p?.price).toEqual({
      amount: 500,
      currency: "EUR",
      unit: "per_person",
      fromPrice: true,
      note: "od-cena (najnižja, navadno na osebo)",
    });
    // EN lokalizacija:
    const en = viatorSummaryToProduct(officialSummary(), { ...MAP_CTX, locale: "en" });
    expect(en?.price?.note).toBe("from price (lowest, usually per person)");
  });

  test("REGRESIJA: cena OBSTOJI ≠ razpoložljivost (unknown — Basic Access nima /availability/check)", () => {
    clearViatorProductUrls();
    const p = viatorSummaryToProduct(officialSummary(), MAP_CTX);
    expect(p?.price).toBeDefined();
    expect(p?.availability?.status).toBe("unknown");
    expect(p?.availability?.note).toContain("ponudniku");
    // NIKOLI live_available (nismo preverili) in NIKOLI not_supported
    // (vir KONCEPT ima — to je točno ločena semantika našega enuma):
    expect(p?.availability?.status).not.toBe("live_available");
    expect(p?.availability?.status).not.toBe("not_supported");
  });

  test("ocena: combinedAverageRating zaokrožena na 2 decimalki + reviewCount", () => {
    clearViatorProductUrls();
    const p = viatorSummaryToProduct(officialSummary(), MAP_CTX);
    expect(p?.rating).toBe(4.97);
    expect(p?.reviewCount).toBe(73);
  });
});

// ---------------------------------------------------------------------------
// §15 MODAL PODATKI — naslov/opis/vir iz VIRA; bookingUrl naš /go
// ---------------------------------------------------------------------------

describe("TASK 45 §15: modal podprtje (naslov/opis/vir/booking)", () => {
  test("naslov + opis IZ vira (trajanje dodano iz duration vira)", () => {
    clearViatorProductUrls();
    const p = viatorSummaryToProduct(
      officialSummary({ duration: { fixedDurationInMinutes: 180 } }),
      MAP_CTX
    );
    expect(p?.title).toBe("Acadia National Park private minivan tour- 3 Hours Local Guides");
    expect(p?.description).toContain("A local guide will show you");
    expect(p?.description).toContain("Trajanje: 3 h");
  });

  test("bookingUrl = NAŠA /go/viator?product= konstrukcija; sourceUrl = productUrl vira", () => {
    clearViatorProductUrls();
    const p = viatorSummaryToProduct(officialSummary(), MAP_CTX);
    expect(p?.bookingUrl).toBe("/go/viator?product=227717P1");
    expect(p?.sourceUrl).toBe(officialSummary().productUrl);
    expect(p?.bookingMode).toBe("affiliate_redirect");
    expect(p?.license).toEqual({ source: "Viator Partner API", attribution: "© Viator" });
    expect(p?.lastUpdated).toBe("2026-09-18T12:00:00Z");
  });

  test("productUrl predpomnilnik se napolni (za /go razrešitev) — NEVELJAVEN URL se NE shrani", () => {
    clearViatorProductUrls();
    viatorSummaryToProduct(officialSummary(), MAP_CTX);
    expect(lookupViatorProductUrl("227717P1")).toBe(officialSummary().productUrl);
    // Neveljaven productCode/URL (defenzivno):
    rememberViatorProductUrl("bad code!", "https://www.viator.com/x");
    rememberViatorProductUrl("62330P2", "http://insecure.example.com/");
    expect(lookupViatorProductUrl("bad code!")).toBeNull();
    expect(lookupViatorProductUrl("62330P2")).toBeNull();
    clearViatorProductUrls();
  });
});

// ---------------------------------------------------------------------------
// §4 FAIL-SAFE — slab zapis NE sesuje plasti
// ---------------------------------------------------------------------------

describe("TASK 45 §4: fail-safe validacija (en slab zapis ne sesuje plasti)", () => {
  test("filterValidSummaries: brez productCode/naslova odpade, ostali preživijo", () => {
    const { valid, skipped } = filterValidSummaries([
      officialSummary(),
      { productCode: "", title: "prazen code" },
      { productCode: "62330P2" }, // brez naslova
      null,
      "niz",
      officialSummary({ productCode: "7908P9" }),
    ]);
    expect(valid).toHaveLength(2);
    expect(skipped).toBe(4);
  });

  test("isViatorProductSummary: meje (dolžina code/naslova)", () => {
    expect(isViatorProductSummary(officialSummary())).toBe(true);
    expect(isViatorProductSummary({ productCode: "x".repeat(41), title: "x" })).toBe(false);
    expect(isViatorProductSummary({ productCode: "123", title: "   " })).toBe(false);
  });

  test("mapViatorSummaries: slab povzetek → skipped, NE napaka", () => {
    clearViatorProductUrls();
    const { products, skipped } = mapViatorSummaries(
      [officialSummary(), { productCode: "BAD", title: "" }],
      { locale: "sl", fetchedAt: "2026-09-18T12:00:00Z" },
      () => LJU_PIN
    );
    expect(products).toHaveLength(1);
    expect(skipped).toBe(1);
    clearViatorProductUrls();
  });

  test("productCode meje zaupanja (alfanumerični 3–20) — /go varnostni vzorec", () => {
    expect(isViatorProductCode("227717P1")).toBe(true);
    expect(isViatorProductCode("62330P2")).toBe(true);
    expect(isViatorProductCode("ab")).toBe(false);
    expect(isViatorProductCode("javascript:alert(1)")).toBe(false);
    expect(isViatorProductCode("../../evil")).toBe(false);
    expect(isViatorProductCode("https://evil.com/x")).toBe(false);
    expect(isViatorProductCode("1441 20OR")).toBe(false);
    expect(isViatorProductCode("A".repeat(21))).toBe(false);
    expect(VIATOR_PRODUCT_CODE_RE.test("7908P9")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DESTINACIJSKA TAKSONOMIJA — ujemanje + viewport
// ---------------------------------------------------------------------------

const CANONICAL: CanonicalDestInput[] = [
  { slug: "ljubljana", name: "Ljubljana", lat: 46.0569, lng: 14.5058 },
  { slug: "bled", name: "Bled", lat: 46.3683, lng: 14.114 },
  { slug: "piran", name: "Piran", lat: 45.5271, lng: 13.5687 },
  { slug: "maribor", name: "Maribor", lat: 46.5547, lng: 15.6459 },
];

const TAXONOMY = [
  { destinationId: 5257, name: "Ljubljana", type: "CITY", parentDestinationId: 4526, center: { latitude: 46.0569, longitude: 14.5058 } },
  { destinationId: 5258, name: "Bled", type: "CITY", parentDestinationId: 4526, center: { latitude: 46.3683, longitude: 14.114 } },
  { destinationId: 5259, name: "Piran", type: "CITY", parentDestinationId: 4526, center: { latitude: 45.5271, longitude: 13.5687 } },
  { destinationId: 5260, name: "Maribor", type: "CITY", parentDestinationId: 4526, center: { latitude: 46.5547, longitude: 15.6459 } },
  { destinationId: 4526, name: "Slovenia", type: "COUNTRY", center: { latitude: 46.15, longitude: 14.47 } },
  { destinationId: 343, name: "Bangkok", type: "CITY", parentDestinationId: 749, center: { latitude: 13.7563, longitude: 100.5018 } },
];

describe("TASK 45: destinacijska taksonomija (ujemanje + viewport)", () => {
  test("buildDestIndex: naša imena ↔ Viator ID-ji; Slovenija = COUNTRY koren poddrevesa", () => {
    resetViatorDestinations();
    const idx = buildDestIndex(TAXONOMY, CANONICAL);
    expect(idx.matched.map((m) => m.viatorId).sort()).toEqual([5257, 5258, 5259, 5260]);
    expect(idx.country?.destinationId).toBe(4526);
    expect(idx.slovenianIds.has(5257)).toBe(true);
    expect(idx.slovenianIds.has(343)).toBe(false); // Bangkok NI slovenski
    expect(isViatorDestination(TAXONOMY[0])).toBe(true);
  });

  test("fallback pina: manjkajoč Viator center → NAŠE kanonske koordinate", () => {
    const idx = buildDestIndex(
      [{ ...TAXONOMY[0], center: {} }],
      CANONICAL.slice(0, 1)
    );
    expect(idx.matched[0].center).toEqual({ lat: 46.0569, lng: 14.5058 });
  });

  test("viewport ozek (1–3 destinacije) → MESTNA iskanja po naših koordinatah v bbox", () => {
    const idx = buildDestIndex(TAXONOMY, CANONICAL);
    // Ljubljana (14.5058) + Bled (14.114) v pogledu:
    const view = selectViewportDestinations(idx, [46.0, 14.0, 46.4, 14.6]);
    expect(view.cities.map((c) => c.viatorId).sort()).toEqual([5257, 5258]);
    expect(view.country).toBeNull();
  });

  test("viewport širok (≥ 4) → DRŽAVNO iskanje (1 klic) + post-filter", () => {
    const idx = buildDestIndex(TAXONOMY, CANONICAL);
    const view = selectViewportDestinations(idx, [45.0, 13.0, 47.0, 16.5]);
    expect(view.cities).toHaveLength(0);
    expect(view.country?.destinationId).toBe(4526);
  });

  test("viewport 0 destinacij → država (kraj po morju/meji — državno iskanje pokriva)", () => {
    const idx = buildDestIndex(TAXONOMY, CANONICAL);
    const view = selectViewportDestinations(idx, [40.0, 10.0, 41.0, 11.0]);
    expect(view.country?.destinationId).toBe(4526);
    expect(view.cities).toHaveLength(0);
  });

  test("resolveProductPin: PRIMARNA destinacija produkta (ne iskana) + fallback", () => {
    const idx = buildDestIndex(TAXONOMY, CANONICAL);
    // Produkt z lastno primarno destinacijo Bled:
    const pin = resolveProductPin(
      officialSummary({ destinations: [{ ref: "5258", primary: true }] }),
      idx,
      { center: { lat: 46.0569, lng: 14.5058 }, name: "Ljubljana" }
    );
    expect(pin).toEqual({ lat: 46.3683, lng: 14.114, name: "Bled", fallback: false });
    // Neznan ref → fallback na iskano:
    const pin2 = resolveProductPin(
      officialSummary({ destinations: [{ ref: "999999", primary: true }] }),
      idx,
      { center: { lat: 46.0569, lng: 14.5058 }, name: "Ljubljana" }
    );
    expect(pin2).toEqual({ lat: 46.0569, lng: 14.5058, name: "Ljubljana", fallback: true });
    // Brez destinacij → fallback:
    const pin3 = resolveProductPin(
      officialSummary({ destinations: [] }),
      idx,
      { center: { lat: 46.0569, lng: 14.5058 }, name: "Ljubljana" }
    );
    expect(pin3?.fallback).toBe(true);
  });

  test("canonicalInView + pinInBbox (post-filter državnega iskanja)", () => {
    const idx = buildDestIndex(TAXONOMY, CANONICAL);
    const inView = canonicalInView(idx.matched, [46.0, 14.0, 46.4, 14.6]);
    expect(inView.map((m) => m.ourSlug).sort()).toEqual(["bled", "ljubljana"]);
    expect(pinInBbox({ lat: 46.2, lng: 14.2, name: "x", fallback: false }, [46.0, 14.0, 46.4, 14.4])).toBe(true);
    expect(pinInBbox({ lat: 45.9, lng: 14.2, name: "x", fallback: false }, [46.0, 14.0, 46.4, 14.4])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// KLIENT — pogodbene glave + klasifikacija napak (mock fetch)
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("TASK 45 §2: ViatorClient — pogodbene glave in klasifikacija napak", () => {
  test("searchProducts pošlje IZKLJUČNO pogodbene glave (exp-api-key, verzija 2.0, jezik, Content-Type) + telo", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return jsonResponse({ products: [officialSummary()], totalCount: 1 });
    }) as unknown as typeof fetch;

    const client = new ViatorClient({
      apiKey: "11111111-2222-3333-4444-555555555555",
      fetchImpl,
      timeoutMs: 2_000,
    });
    await client.searchProducts({
      filtering: { destination: "5257" },
      sorting: { sort: "TRAVELER_RATING", order: "DESCENDING" },
      pagination: { start: 1, count: 24 },
      currency: "EUR",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${VIATOR_DEFAULT_BASE}/products/search`);
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["exp-api-key"]).toBe("11111111-2222-3333-4444-555555555555");
    expect(headers["Accept"]).toBe("application/json;version=2.0");
    expect(headers["Accept-Language"]).toBe("en-US"); // sl vir ne podpira
    expect(headers["Content-Type"]).toBe("application/json");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      filtering: { destination: "5257" },
      sorting: { sort: "TRAVELER_RATING", order: "DESCENDING" },
      pagination: { start: 1, count: 24 },
      currency: "EUR",
    });
  });

  test("401 → unauthorized; 429 + Retry-After → rate-limited s sekundami; 5xx → server; ne-JSON → invalid-response", async () => {
    const mk = (status: number, body: string, headers: Record<string, string> = {}) =>
      (async () => new Response(body, { status, headers })) as unknown as typeof fetch;

    const c401 = new ViatorClient({ apiKey: "k", fetchImpl: mk(401, "{}") });
    await expect(c401.searchProducts({ filtering: {}, currency: "EUR" })).rejects.toThrow();
    try {
      await c401.searchProducts({ filtering: {}, currency: "EUR" });
    } catch (e) {
      expect((e as ViatorApiError).kind).toBe("unauthorized");
    }

    const c429 = new ViatorClient({
      apiKey: "k",
      fetchImpl: mk(429, "{}", { "retry-after": "7" }),
    });
    try {
      await c429.searchProducts({ filtering: {}, currency: "EUR" });
    } catch (e) {
      expect((e as ViatorApiError).kind).toBe("rate-limited");
      expect((e as ViatorApiError).retryAfterSec).toBe(7);
    }

    const c500 = new ViatorClient({ apiKey: "k", fetchImpl: mk(500, "oops") });
    try {
      await c500.getDestinations();
    } catch (e) {
      expect((e as ViatorApiError).kind).toBe("server");
    }

    const cBad = new ViatorClient({ apiKey: "k", fetchImpl: mk(200, "not json") });
    try {
      await cBad.getDestinations();
    } catch (e) {
      expect((e as ViatorApiError).kind).toBe("invalid-response");
    }
  });

  test("getDestinations: oblika {destinations:[…]} (drugače invalid-response); timeout dira deluje", async () => {
    const ok = new ViatorClient({
      apiKey: "k",
      fetchImpl: (async () => jsonResponse({ destinations: TAXONOMY, totalCount: 6 })) as unknown as typeof fetch,
    });
    const dests = await ok.getDestinations();
    expect(dests).toHaveLength(6);

    const slow = new ViatorClient({
      apiKey: "k",
      timeoutMs: 30,
      // Mock spoštuje abort signal (kot pravi fetch):
      fetchImpl: ((url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          const timer = setTimeout(() => reject(new Error("late")), 400);
          init?.signal?.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(new DOMException("aborted", "AbortError"));
            },
            { once: true }
          );
        })) as unknown as typeof fetch,
    });
    try {
      await slow.getDestinations();
      expect.unreachable();
    } catch (e) {
      expect((e as ViatorApiError).kind).toBe("timeout");
    }
  });

  test("prazen API ključ → takojšnja napaka (constructor varovalka)", () => {
    expect(() => new ViatorClient({ apiKey: "  " })).toThrow(ViatorApiError);
  });

  test("env konfiguracija: viatorApiKeyFromEnv / viatorBaseUrlFromEnv", () => {
    const prevKey = process.env.VIATOR_API_KEY;
    const prevBase = process.env.VIATOR_API_BASE;
    try {
      delete process.env.VIATOR_API_KEY;
      delete process.env.VIATOR_API_BASE;
      expect(viatorApiKeyFromEnv()).toBeNull();
      expect(viatorBaseUrlFromEnv()).toBe(VIATOR_DEFAULT_BASE);
      process.env.VIATOR_API_KEY = "  test-key  ";
      process.env.VIATOR_API_BASE = "https://api.sandbox.viator.com/partner/";
      expect(viatorApiKeyFromEnv()).toBe("test-key"); // trim
      expect(viatorBaseUrlFromEnv()).toBe("https://api.sandbox.viator.com/partner"); // brez končnega /
    } finally {
      if (prevKey === undefined) delete process.env.VIATOR_API_KEY;
      else process.env.VIATOR_API_KEY = prevKey;
      if (prevBase === undefined) delete process.env.VIATOR_API_BASE;
      else process.env.VIATOR_API_BASE = prevBase;
    }
  });
});
