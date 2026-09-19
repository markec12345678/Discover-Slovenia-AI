// ============================================================================
// TASK 53 — BOOKING ADAPTER: CAPABILITY GATE / BBOX PRETVORBA / DATUMI /
// RATES VERIGA / NEGATIVNI PREDPOMNILNIK / KLASIFIKACIJA NAPAK
// ============================================================================
// Mock fetch je TEST-ONLY preslikava DOKUMENTIRANE oblike Demand API v3
// TEST FIXTURE — NOT LIVE DATA (§23): vse odgovore v tej datoteki
// so SANITIZIRANE POGODBEBNE FIXTURE — samo za unit/integration teste,
// NIKOLI za produkcjski runtime.
// (developers.booking.com/demand/docs — endpoint obliki iz Task 53-1):
//  - GET  /v3/accommodations/search?bbox=west,south,east,north&… →
//        {"data": [{"accommodation": {id, name, location: {latitude,
//         longitude, address: […]}}, …}, …]}
//  - POST /v3/accommodations/rates {"accommodations_ids": […], …} →
//        {"data": [{"accommodation_id": …, "blocks": […]}]}
// NI izmišljenega inventarja: adapter se preskuša proti dokumentirani
// obliki odgovorov vira.
//
// KLJUČNE INVARIANTE:
//  - CAPABILITY GATE: brez BOOKING_API_KEY → iskreno PRAZEN sloj,
//    0 klicev na vir (NI simulacije živega API-ja)
//  - BBOX PRETVORBA: naš [south,west,north,east] → POGODBENI
//    [west,south,east,north] v URL-ju (regresijsko varovano!)
//  - DATUMI: q.date → checkin + naslednji dan; brez datuma +7/+8 dni
//  - CENE: iskanje + EN batch rates klic → najnižja NOČNA cena
//    (per_night, fromPrice); rates odpoved → BREZ cene + opomba
//  - STRICT MAPPER: manjkajoči id/naslov → skipped; cena NIKDOLI 0
//  - NEGATIVNI PREDPOMNILNIK: okvara iskanja → 60 s brez novih klicev
//  - ENV LEAK GUARD: vrednost ključa NIKOLI v izhodnih produktih
// ============================================================================
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { readFileSync } from "node:fs";
import {
  createBookingAdapter,
  resetBookingAdapterCaches,
  bookingBboxFromSupply,
  stayDates,
  bookingLastNote,
  bookingLastSkipped,
} from "@/lib/supply/providers/booking/adapter";
import { BookingApiError } from "@/lib/supply/providers/booking/client";
import { searchSupply } from "@/lib/supply/search";
import type { SupplyAdapter } from "@/lib/supply/adapter";
import type { ProviderRegistryEntry } from "@/lib/supply/registry";
import type { SupplyQuery } from "@/lib/supply/types";

// ---------------------------------------------------------------------------
// REGISTER MOCK (oblika ProviderRegistryEntry iz registry.ts — smiselne
// vrednosti po nalogi 53: standardna svežost cen nastanitev → 10 min)
// ---------------------------------------------------------------------------

const ENTRY: ProviderRegistryEntry = {
  slug: "booking",
  labels: { sl: "Booking.com", en: "Booking.com" },
  group: "commercial",
  inventoryAccess: ["affiliate_deep_link"],
  status: "affiliate",
  active: true,
  types: ["accommodation"],
  goRoute: "hotels",
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
  envKeys: {
    affiliate: ["BOOKING_AFFILIATE_ID"],
    api: ["BOOKING_API_KEY", "BOOKING_API_BASE"],
  },
  minZoom: 12,
  cacheTtlMs: 10 * 60 * 1000,
  timeoutMs: 20_000,
  maxCallsPerMin: 20,
  docsUrl: "https://developers.booking.com/demand/docs",
  accessNote: {
    sl: "Demand API zahteva status Managed Affiliate Partner — danes samo affiliate povezava",
    en: "Demand API requires Managed Affiliate Partner status — today affiliate link only",
  },
};

// ---------------------------------------------------------------------------
// MOCK NAPREDA (DI fetch) — dokumentirana oblika odgovorov vira
// ---------------------------------------------------------------------------

/** Realistična nastanitev po DOKUMENTIRANI obliki iskanja. */
function accommodation(
  id: string,
  name: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    accommodation: {
      id,
      name,
      location: {
        address: ["Slovenska cesta 34", "1000 Ljubljana", "Slovenia"],
        latitude: 46.0517,
        longitude: 14.5048,
      },
      photo_url: "https://cf.bstatic.com/xdata/images/hotel/square200/12345.jpg",
      ...overrides,
    },
  };
}

interface RecordedCall {
  url: string;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * Zgradi mock fetch, ki beleži klice in odgovarja po dokumentirani obliki.
 *  - searchItems: elementi data[] iskanja;
 *  - ratesBlocks: bloki cen PO ID-ju nastanitve (id brez vnosa = brez cene);
 *  - searchStatus/ratesStatus: napakovni HTTP odgovor endpointa;
 *  - searchBody: surov odgovor iskanja 200 (neveljavna ovojnica/ne-JSON).
 */
function makeMockFetch(opts: {
  searchItems?: unknown[];
  ratesBlocks?: Record<string, Record<string, unknown>[]>;
  searchStatus?: number;
  ratesStatus?: number;
  searchBody?: string;
  headers?: Record<string, string>;
}) {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push({
      url: u,
      method: init?.method,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    // Po POTI (ne po celotnem URL-ju) — testu preklopa baze (BOOKING_API_BASE)
    // sme spremeniti host, ne pa logike odgovorov.
    const path = new URL(u).pathname;

    if (path === "/v3/accommodations/search") {
      if (opts.searchBody !== undefined) {
        return new Response(opts.searchBody, {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (opts.searchStatus != null) {
        return new Response(JSON.stringify({ message: "error" }), {
          status: opts.searchStatus,
          headers: {
            "content-type": "application/json",
            ...(opts.headers ?? {}),
          },
        });
      }
      return new Response(
        JSON.stringify({ data: opts.searchItems ?? [] }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    if (path === "/v3/accommodations/rates") {
      if (opts.ratesStatus != null) {
        return new Response(JSON.stringify({ message: "error" }), {
          status: opts.ratesStatus,
          headers: {
            "content-type": "application/json",
            ...(opts.headers ?? {}),
          },
        });
      }
      // Dokumentirano telo zahteve: accommodations_ids → bloki po nastanitvi.
      const body = (init?.body ? JSON.parse(init.body as string) : {}) as {
        accommodations_ids?: string[];
      };
      const data = (body.accommodations_ids ?? [])
        .filter((id) => opts.ratesBlocks?.[id] != null)
        .map((id) => ({
          accommodation_id: id,
          blocks: opts.ratesBlocks?.[id],
        }));
      return new Response(JSON.stringify({ data }), {
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
  return createBookingAdapter(ENTRY, { fetchImpl });
}

/** Ljubljanski viewport (bbox = [south, west, north, east]). */
const LJU_VIEW: SupplyQuery = {
  bbox: [46.02, 14.47, 46.09, 14.55],
  zoom: 13,
  cats: ["accommodation"],
  locale: "sl",
  date: "2026-10-05",
  pax: 2,
};

// ---------------------------------------------------------------------------
// ZAGON/ČIŠČENJE — vsak test doba čisto stanje (cache + env)
// ---------------------------------------------------------------------------

let prevKey: string | undefined;
let prevBase: string | undefined;

beforeEach(() => {
  prevKey = process.env.BOOKING_API_KEY;
  prevBase = process.env.BOOKING_API_BASE;
  resetBookingAdapterCaches();
});

afterEach(() => {
  if (prevKey === undefined) delete process.env.BOOKING_API_KEY;
  else process.env.BOOKING_API_KEY = prevKey;
  if (prevBase === undefined) delete process.env.BOOKING_API_BASE;
  else process.env.BOOKING_API_BASE = prevBase;
  resetBookingAdapterCaches();
});

// ---------------------------------------------------------------------------
// CAPABILITY GATE — brez ključa NI podatkov (in NI klicev)
// ---------------------------------------------------------------------------

describe("TASK 53 Booking: capability gate — brez BOOKING_API_KEY", () => {
  test("① iskreno PRAZEN sloj + opomba not-configured + 0 klicev na vir", async () => {
    delete process.env.BOOKING_API_KEY;
    const { fetchImpl, calls } = makeMockFetch({
      searchItems: [accommodation("8504", "Hotel Slon")],
    });
    const adapter = adapterWith(fetchImpl);
    const products = await adapter.search(LJU_VIEW);
    expect(products).toEqual([]);
    expect(bookingLastNote()).toBe("not-configured");
    expect(calls).toHaveLength(0); // NIKAKOR ne pokličemo vira
  });

  test("② runner: adapter med ADAPTERJI z iskreno opombo, NE v degraded", async () => {
    delete process.env.BOOKING_API_KEY;
    const { fetchImpl, calls } = makeMockFetch({});
    const res = await searchSupply(LJU_VIEW, [adapterWith(fetchImpl)]);
    const info = res.adapters.find((a) => a.slug === "booking")!;
    expect(info.ok).toBe(true);
    expect(info.count).toBe(0);
    expect(info.note).toBe("not-configured");
    expect(res.degraded).not.toContain("booking"); // NI napaka — stanje
    expect(calls).toHaveLength(0);
    expect(res.products).toEqual([]);
  });

  test("③ SOURCE CONTRACT: adapter NE vsebuje izmišljenega inventory fallbacka", () => {
    const src = readFileSync(
      new URL("../supply/providers/booking/adapter.ts", import.meta.url),
      "utf-8"
    );
    expect(src.includes("not-configured")).toBe(true); // iskrena opomba obstaja
    expect(src.includes("sample")).toBe(false);
    expect(src.includes("DEMO_")).toBe(false);
    expect(src.includes("fallbackProducts")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// BBOX PRETVORBA + DATUMI (čiste funkcije — regresijsko varovani)
// ---------------------------------------------------------------------------

describe("TASK 53 Booking: bbox pretvorba + datumsko okno", () => {
  test("① bookingBboxFromSupply: [s,w,n,e] → POGODBENI [w,s,e,n]", () => {
    // NAPAČNA pretvorba bi tiho iskala drug geografski pravokotnik!
    expect(bookingBboxFromSupply([46.02, 14.47, 46.09, 14.55])).toEqual([
      14.47, 46.02, 14.55, 46.09,
    ]);
    expect(bookingBboxFromSupply([45.4, 13.3, 46.9, 16.7])).toEqual([
      13.3, 45.4, 16.7, 46.9,
    ]);
  });

  test("② stayDates: q.date → checkin + NASLEDNJI dan (1-nočno okno)", () => {
    expect(stayDates("2026-10-05")).toEqual({
      checkin: "2026-10-05",
      checkout: "2026-10-06",
    });
    // Prekroc mesečne/mejni dnevi (UTC račun — brez DST presenetljivk):
    expect(stayDates("2026-12-31")).toEqual({
      checkin: "2026-12-31",
      checkout: "2027-01-01",
    });
    expect(stayDates("2028-02-28")).toEqual({
      checkin: "2028-02-28",
      checkout: "2028-02-29", // prestopno leto
    });
  });

  test("③ stayDates brez datuma → privzeto +7/+8 dni od danes (deterministično)", () => {
    const now = new Date("2026-09-20T10:30:00Z");
    expect(stayDates(undefined, now)).toEqual({
      checkin: "2026-09-27",
      checkout: "2026-09-28",
    });
    // Neveljaven datumski niz → privzeto okno (garbage-in obramba):
    expect(stayDates("aa-bb-cc", now)).toEqual({
      checkin: "2026-09-27",
      checkout: "2026-09-28",
    });
  });

  test("④ URL iskanja nosi POGODBENI vrstni red bbox + datumsko okno + adults", async () => {
    process.env.BOOKING_API_KEY = "test-key-booking-123";
    const { fetchImpl, calls } = makeMockFetch({
      searchItems: [accommodation("8504", "Hotel Slon")],
      ratesBlocks: { "8504": [{ price: { amount: 95.5, currency: "EUR" } }] },
    });
    await adapterWith(fetchImpl).search(LJU_VIEW);
    expect(calls).toHaveLength(2); // iskanje + rates
    const search = new URL(calls[0].url);
    expect(calls[0].method).toBe("GET");
    expect(search.pathname).toBe("/v3/accommodations/search");
    // POZOR — vrstni red vira: west,south,east,north (iz našega s,w,n,e):
    expect(search.searchParams.get("bbox")).toBe("14.47,46.02,14.55,46.09");
    expect(search.searchParams.get("checkin")).toBe("2026-10-05");
    expect(search.searchParams.get("checkout")).toBe("2026-10-06");
    expect(search.searchParams.get("adults")).toBe("2");
    expect(search.searchParams.get("room_quantity")).toBe("1");
    expect(search.searchParams.get("currency")).toBe("EUR");
    expect(search.searchParams.get("locale")).toBe("en-us");
    const headers = calls[0].headers as Record<string, string>;
    expect(headers["Booking-API-Key"]).toBe("test-key-booking-123");
    expect(headers["Accept"]).toBe("application/json");
  });

  test("⑤ pax vpliva na adults parameter (1–20; privzeto 2)", async () => {
    process.env.BOOKING_API_KEY = "k";
    const { fetchImpl, calls } = makeMockFetch({ searchItems: [] });
    const adapter = adapterWith(fetchImpl);
    await adapter.search({ ...LJU_VIEW, pax: 4 });
    expect(new URL(calls[0].url).searchParams.get("adults")).toBe("4");
    await adapter.search({ ...LJU_VIEW, pax: 99 }); // nad mejo → 20
    expect(new URL(calls[1].url).searchParams.get("adults")).toBe("20");
    await adapter.search({ ...LJU_VIEW, pax: undefined });
    expect(new URL(calls[2].url).searchParams.get("adults")).toBe("2");
  });

  test("⑥ BOOKING_API_BASE preklop baze (test integracija ob aktivaciji)", async () => {
    process.env.BOOKING_API_KEY = "k";
    process.env.BOOKING_API_BASE = "https://demand-test.example.internal";
    const { fetchImpl, calls } = makeMockFetch({ searchItems: [] });
    await adapterWith(fetchImpl).search(LJU_VIEW);
    expect(
      calls[0].url.startsWith("https://demand-test.example.internal")
    ).toBe(true);
    expect(calls[0].url).toContain("/v3/accommodations/search");
  });
});

// ---------------------------------------------------------------------------
// PRIHODNJA AKTIVACIJA — iskanje + EN batch rates klic → kanonski produkti
// ---------------------------------------------------------------------------

describe("TASK 53 Booking: prihodnja aktivacija (kanonski produkti + cene)", () => {
  test("① dokumentirana oblika → KANONSKI ProviderProduct z nočno ceno", async () => {
    process.env.BOOKING_API_KEY = "test-key-booking-123";
    const { fetchImpl, calls } = makeMockFetch({
      searchItems: [accommodation("8504", "Hotel Slon")],
      ratesBlocks: {
        "8504": [
          { price: { amount: 129.0, currency: "EUR" } },
          { price: { amount: 95.5, currency: "EUR" } },
        ],
      },
    });
    const adapter = adapterWith(fetchImpl);
    const products = await adapter.search(LJU_VIEW);

    // Veriga: ENO iskanje + EN batch rates klic za najdene ID-je:
    expect(calls).toHaveLength(2);
    expect(calls[1].method).toBe("POST");
    expect(calls[1].url).toBe("https://demand.booking.com/v3/accommodations/rates");
    const ratesBody = calls[1].body as Record<string, unknown>;
    expect(ratesBody.accommodations_ids).toEqual(["8504"]); // batch za vse
    expect(ratesBody.checkin).toBe("2026-10-05");
    expect(ratesBody.checkout).toBe("2026-10-06");
    expect(ratesBody.currency).toBe("EUR");

    // Kanonski produkt (vsa polja IZ VIRA — brez izmišljenih dopolnil):
    expect(products).toHaveLength(1);
    const p = products[0];
    expect(p.id).toBe("booking:8504");
    expect(p.provider).toBe("booking");
    expect(p.providerProductId).toBe("8504");
    expect(p.type).toBe("accommodation");
    expect(p.title).toBe("Hotel Slon");
    // geo: točna lokacija nepremičnine → exact:
    expect(p.lat).toBe(46.0517);
    expect(p.lng).toBe(14.5048);
    expect(p.geoPrecision).toBe("exact");
    expect(p.address).toBe("Slovenska cesta 34, 1000 Ljubljana, Slovenia");
    // cena: NAJNIŽJA nočna cena med bloki (fromPrice, per_night, EUR):
    expect(p.price).toEqual({
      amount: 95.5,
      currency: "EUR",
      unit: "per_night",
      fromPrice: true,
      note: "od-cena na noč (najnižji blok)",
    });
    expect(p.availability?.status).toBe("unknown"); // NIKOLI available
    expect(p.availability?.note).toBe("razpoložljivost se preveri pri ponudniku");
    expect(p.bookingMode).toBe("affiliate_redirect");
    // affiliate ruta /go/hotels z najbližjo KANONSKO destinacijo:
    expect(p.bookingUrl).toBe("/go/hotels?dest=Ljubljana");
    expect(p.image).toBe("https://cf.bstatic.com/xdata/images/hotel/square200/12345.jpg");
    expect(p.imageCredit).toBe("© Booking.com");
    // sourceUrl NAMERNO odsoten (pogodba ne vrača javnega URL-ja produkta):
    expect(p.sourceUrl).toBeUndefined();
    expect(p.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(p.license).toEqual({
      source: "Booking.com Demand API",
      attribution: "© Booking.com",
    });
    // ocena NAMERNO odsotna (dokumentirana oblika je ne navaja):
    expect(p.rating).toBeUndefined();
    expect(p.reviewCount).toBeUndefined();
    expect(bookingLastSkipped()).toBe(0);
    expect(bookingLastNote()).toBeUndefined();
  });

  test("② nastanitev BREZ rates vnosa → BREZ cene (iskreno, NIKDOLI 0)", async () => {
    process.env.BOOKING_API_KEY = "k";
    const { fetchImpl } = makeMockFetch({
      searchItems: [
        accommodation("8504", "Hotel Slon"),
        accommodation("9901", "Brez cene"),
      ],
      ratesBlocks: {
        "8504": [{ price: { amount: 95.5, currency: "EUR" } }],
        // 9901: BREZ vnosa → brez cene
      },
    });
    const products = await adapterWith(fetchImpl).search(LJU_VIEW);
    expect(products).toHaveLength(2);
    const byId = new Map(products.map((p) => [p.providerProductId, p]));
    expect(byId.get("8504")!.price?.amount).toBe(95.5);
    expect(byId.get("9901")!.price).toBeUndefined(); // NIKOLI 0
  });

  test("③ rates bloki v ne-EUR valuti ali 0 → BREZ cene; per_night prednost", async () => {
    process.env.BOOKING_API_KEY = "k";
    const { fetchImpl } = makeMockFetch({
      searchItems: [
        accommodation("usd", "Hotel USD"),
        accommodation("zero", "Hotel Zero"),
        accommodation("night", "Hotel Nightly"),
      ],
      ratesBlocks: {
        usd: [{ price: { amount: 50, currency: "USD" } }], // ne-EUR → brez
        zero: [{ price: { amount: 0, currency: "EUR" } }], // 0 NI cena
        night: [
          { price: { amount: 120, currency: "EUR" } },
          { price: { amount: 80, currency: "EUR", per_night: 75.25 } }, // izrecna nočna
        ],
      },
    });
    const products = await adapterWith(fetchImpl).search(LJU_VIEW);
    const byId = new Map(products.map((p) => [p.providerProductId, p]));
    expect(byId.get("usd")!.price).toBeUndefined(); // NE pretvarjamo, NE lažemo
    expect(byId.get("zero")!.price).toBeUndefined(); // NIKOLI 0
    // per_night (izrecna nočna, 75.25) ima prednost pred amount (120):
    expect(byId.get("night")!.price?.amount).toBe(75.25);
    expect(byId.get("night")!.price?.unit).toBe("per_night");
  });

  test("④ rates klic odpove → nastanitve BREZ cene + opomba rates-unavailable", async () => {
    process.env.BOOKING_API_KEY = "k";
    const { fetchImpl, calls } = makeMockFetch({
      searchItems: [accommodation("8504", "Hotel Slon")],
      ratesStatus: 503, // rates endpoint odpovedal — iskanje JE uspelo
    });
    const adapter = adapterWith(fetchImpl);
    const products = await adapter.search(LJU_VIEW);
    expect(products).toHaveLength(1); // plast NI padla (iskreno brez cene)
    expect(products[0].price).toBeUndefined();
    expect(products[0].title).toBe("Hotel Slon");
    expect(bookingLastNote()).toBe("rates-unavailable");
    expect(calls).toHaveLength(2); // iskanje + poskus rates
  });

  test("⑤ DEFENZIVNA oblika: ravna nastanitev (brez ovijajočega accommodation)", async () => {
    process.env.BOOKING_API_KEY = "k";
    const { fetchImpl } = makeMockFetch({
      searchItems: [
        { id: "flat-1", name: "Ravna oblika", location: { latitude: 46.3, longitude: 14.1 } },
      ],
      ratesBlocks: { "flat-1": [{ price: { amount: 60, currency: "EUR" } }] },
    });
    const products = await adapterWith(fetchImpl).search(LJU_VIEW);
    expect(products).toHaveLength(1);
    expect(products[0].id).toBe("booking:flat-1");
    expect(products[0].lat).toBe(46.3);
    // Najbližja kanonska destinacija (46.3, 14.1) je Bled:
    expect(products[0].bookingUrl).toBe("/go/hotels?dest=Bled");
  });
});

// ---------------------------------------------------------------------------
// STRICT MAPPER — fail-closed (brez delnega izumljanja)
// ---------------------------------------------------------------------------

describe("TASK 53 Booking: strict mapper (fail-closed)", () => {
  test("① manjka id ALI ime → zapis ZAVRŠEN in štet (skipped)", async () => {
    process.env.BOOKING_API_KEY = "k";
    const { fetchImpl } = makeMockFetch({
      searchItems: [
        accommodation("ok-1", "Veljavna nastanitev"),
        { accommodation: { name: "Brez ID" } }, // BREZ id → zavrnjen
        { accommodation: { id: "no-name" } }, // BREZ imena → zavrnjen
        { accommodation: { id: "", name: "Prazen ID" } }, // prazen id → zavrnjen
        "ne-objekt", // smetenje → zavrnjen
      ],
      ratesBlocks: { "ok-1": [{ price: { amount: 70, currency: "EUR" } }] },
    });
    const adapter = adapterWith(fetchImpl);
    const products = await adapter.search(LJU_VIEW);
    expect(products).toHaveLength(1);
    expect(products[0].providerProductId).toBe("ok-1");
    expect(bookingLastSkipped()).toBe(4); // šteti v telemetriji
  });

  test("② BREZ location koordinat → BREZ pina (iskreno — NE pinamo po mestu)", async () => {
    process.env.BOOKING_API_KEY = "k";
    const { fetchImpl } = makeMockFetch({
      searchItems: [
        accommodation("nogeo", "Brez koordinat", { location: { address: ["Samo naslov"] } }),
      ],
    });
    const products = await adapterWith(fetchImpl).search(LJU_VIEW);
    expect(products).toHaveLength(1);
    expect(products[0].lat).toBeUndefined();
    expect(products[0].lng).toBeUndefined();
    expect(products[0].geoPrecision).toBeUndefined();
    // naslov ostane (je v viru); bookingUrl pade na središče viewporta:
    expect(products[0].address).toBe("Samo naslov");
    expect(products[0].bookingUrl).toBe("/go/hotels?dest=Ljubljana");
  });

  test("③ tuja slika host → ODSOTNA (meja zaupanja)", async () => {
    process.env.BOOKING_API_KEY = "k";
    const { fetchImpl } = makeMockFetch({
      searchItems: [
        accommodation("evil-img", "Hotel", {
          photo_url: "https://evil.example.com/hotel.jpg",
        }),
      ],
    });
    const products = await adapterWith(fetchImpl).search(LJU_VIEW);
    expect(products).toHaveLength(1);
    expect(products[0].image).toBeUndefined(); // tuj host NE
    expect(products[0].imageCredit).toBeUndefined();
  });

  test("④ kap BOOKING_MAX_RESULTS (48) — gostota pod nadzorom", async () => {
    process.env.BOOKING_API_KEY = "k";
    const many = Array.from({ length: 60 }, (_, i) =>
      accommodation(`acc-${i}`, `Hotel ${i}`)
    );
    const { fetchImpl, calls } = makeMockFetch({ searchItems: many });
    const adapter = adapterWith(fetchImpl);
    const products = await adapter.search(LJU_VIEW);
    expect(products).toHaveLength(48);
    expect(bookingLastNote()).toBe("capped");
    // rates batch sprašuje SAMO za ohranjene ID-je:
    const ratesBody = calls[1].body as { accommodations_ids: string[] };
    expect(ratesBody.accommodations_ids).toHaveLength(48);
  });
});

// ---------------------------------------------------------------------------
// NEGATIVNI PREDPOMNILNIK + KLASIFIKACIJA NAPAK (iskanje = trda okvara)
// ---------------------------------------------------------------------------

describe("TASK 53 Booking: negativni predpomnilnik + klasifikacija napak", () => {
  test("① NAPAČNA ovojnica iskanja (200) → invalid-response + recently-failed", async () => {
    process.env.BOOKING_API_KEY = "k";
    const { fetchImpl, calls } = makeMockFetch({ searchBody: '{"foo":"bar"}' });
    const adapter = adapterWith(fetchImpl);
    let caught: unknown;
    try {
      await adapter.search(LJU_VIEW);
    } catch (e) {
      caught = e;
    }
    expect(caught instanceof BookingApiError).toBe(true);
    expect((caught as BookingApiError).kind).toBe("invalid-response");
    expect(calls).toHaveLength(1);
    // Negativni predpomnilnik: ponovitev v oknu 60 s → praznina, 0 klicev:
    const second = await adapter.search(LJU_VIEW);
    expect(second).toEqual([]);
    expect(bookingLastNote()).toBe("recently-failed");
    expect(calls).toHaveLength(1); // NI novih klicev
  });

  test("② ne-JSON odgovor iskanja → invalid-response (invalid-json)", async () => {
    process.env.BOOKING_API_KEY = "k";
    const { fetchImpl, calls } = makeMockFetch({ searchBody: "ne-JSON {{{" });
    const adapter = adapterWith(fetchImpl);
    let caught: unknown;
    try {
      await adapter.search(LJU_VIEW);
    } catch (e) {
      caught = e;
    }
    expect(caught instanceof BookingApiError).toBe(true);
    expect((caught as BookingApiError).kind).toBe("invalid-response");
    expect((caught as BookingApiError).message).toBe("invalid-json");
    await adapter.search(LJU_VIEW);
    expect(bookingLastNote()).toBe("recently-failed");
    expect(calls).toHaveLength(1);
  });

  test("③ HTTP 401 → unauthorized + negativni cache", async () => {
    process.env.BOOKING_API_KEY = "k";
    const { fetchImpl, calls } = makeMockFetch({ searchStatus: 401 });
    const adapter = adapterWith(fetchImpl);
    let caught: unknown;
    try {
      await adapter.search(LJU_VIEW);
    } catch (e) {
      caught = e;
    }
    expect(caught instanceof BookingApiError).toBe(true);
    expect((caught as BookingApiError).kind).toBe("unauthorized");
    expect((caught as BookingApiError).status).toBe(401);
    await adapter.search(LJU_VIEW);
    expect(bookingLastNote()).toBe("recently-failed");
    expect(calls).toHaveLength(1); // vir NE dobi zaporednih klicev
  });

  test("④ HTTP 429 + Retry-After → rate-limited + retryAfterSec", async () => {
    process.env.BOOKING_API_KEY = "k";
    const { fetchImpl } = makeMockFetch({
      searchStatus: 429,
      headers: { "retry-after": "30" },
    });
    const adapter = adapterWith(fetchImpl);
    let caught: unknown;
    try {
      await adapter.search(LJU_VIEW);
    } catch (e) {
      caught = e;
    }
    expect(caught instanceof BookingApiError).toBe(true);
    const err = caught as BookingApiError;
    expect(err.kind).toBe("rate-limited");
    expect(err.retryAfterSec).toBe(30); // prebrano iz glave vira
  });

  test("⑤ HTTP 503 → server (začasna odpoved vira)", async () => {
    process.env.BOOKING_API_KEY = "k";
    const { fetchImpl } = makeMockFetch({ searchStatus: 503 });
    const adapter = adapterWith(fetchImpl);
    let caught: unknown;
    try {
      await adapter.search(LJU_VIEW);
    } catch (e) {
      caught = e;
    }
    expect(caught instanceof BookingApiError).toBe(true);
    expect((caught as BookingApiError).kind).toBe("server");
    expect((caught as BookingApiError).status).toBe(503);
  });
});

// ---------------------------------------------------------------------------
// PREDPOMNILNIK (TTL iz registra — 10 min) + COALESCING + IDENTITETA POIZVEDBE
// ---------------------------------------------------------------------------

describe("TASK 53 Booking: predpomnilnik + coalescing", () => {
  test("① druga IDENTIČNA poizvedba → predpomnilnik (0 novih klicev, cached=true)", async () => {
    process.env.BOOKING_API_KEY = "k";
    const { fetchImpl, calls } = makeMockFetch({
      searchItems: [accommodation("8504", "Hotel Slon")],
      ratesBlocks: { "8504": [{ price: { amount: 95.5, currency: "EUR" } }] },
    });
    const adapter = adapterWith(fetchImpl); // ENTRY.cacheTtlMs = 10 min
    const first = await adapter.search(LJU_VIEW);
    expect(calls).toHaveLength(2); // iskanje + rates
    expect(adapter.lastRunCached()).toBe(false);
    const second = await adapter.search(LJU_VIEW);
    expect(calls).toHaveLength(2); // NI novih klicev
    expect(adapter.lastRunCached()).toBe(true);
    expect(second).toEqual(first);
  });

  test("② SPREMEMBA pax/datum = DRUGA poizvedba (novi klici — čist dogovor)", async () => {
    process.env.BOOKING_API_KEY = "k";
    const { fetchImpl, calls } = makeMockFetch({
      searchItems: [accommodation("8504", "Hotel Slon")],
      ratesBlocks: { "8504": [{ price: { amount: 95.5, currency: "EUR" } }] },
    });
    const adapter = adapterWith(fetchImpl);
    await adapter.search(LJU_VIEW);
    await adapter.search({ ...LJU_VIEW, pax: 3 }); // drugačni adults → nov izid
    await adapter.search({ ...LJU_VIEW, date: "2026-10-20" }); // drugačno okno
    expect(calls).toHaveLength(6); // 3 × (iskanje + rates)
  });

  test("③ coalescing: 2 SOČASNI identični poizvedbi → ENA izvedba (2 klica skupaj)", async () => {
    process.env.BOOKING_API_KEY = "k";
    const base = makeMockFetch({
      searchItems: [accommodation("8504", "Hotel Slon")],
      ratesBlocks: { "8504": [{ price: { amount: 95.5, currency: "EUR" } }] },
    });
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
    expect(base.calls).toHaveLength(2); // deljena izvedba (iskanje + rates)
  });
});

// ---------------------------------------------------------------------------
// ENV LEAK GUARD — vrednost ključa NIKOLI v izhodnih produktih
// ---------------------------------------------------------------------------

describe("TASK 53 Booking: env leak guard", () => {
  test("① vrednost BOOKING_API_KEY se NE razkrije v izhodu adapterja", async () => {
    const secret = "LEAKGUARD-booking-4e2a-do-not-leak";
    process.env.BOOKING_API_KEY = secret;
    const { fetchImpl, calls } = makeMockFetch({
      searchItems: [accommodation("8504", "Hotel Slon")],
      ratesBlocks: { "8504": [{ price: { amount: 95.5, currency: "EUR" } }] },
    });
    const products = await adapterWith(fetchImpl).search(LJU_VIEW);
    expect(products).toHaveLength(1);
    // Ključ JE v zahtevi (glava) …
    expect((calls[0].headers as Record<string, string>)["Booking-API-Key"]).toBe(secret);
    // … a NIKOLI v izhodnih produktih (vsa polja, vse globine):
    const dump = JSON.stringify(products);
    expect(dump).not.toContain(secret);
    expect(dump).not.toContain("LEAKGUARD");
  });
});
