// ============================================================================
// TASK 53 — AIRALO ADAPTER: CAPABILITY GATE / ŽETON / KATALOG / CACHE
// ============================================================================
// Mock fetch je TEST-ONLY preslikava pogodbe vira (sandbox /api/v2/
// TEST FIXTURE — NOT LIVE DATA (§23): vse odgovore v tej datoteki
// so SANITIZIRANE POGODBEBNE FIXTURE — samo za unit/integration teste,
// NIKOLI za produkcjski runtime.
// countries oblika je ŽIVO preverjena — GOLI array; paketi + žeton so
// DOCUMENTED-ASSUMPTION iz uradne dokumentacije). NI izmišljenega
// inventarja — adapter se preskuša proti dokumentiranim odgovorom vira.
//
// KLJUČNE INVARIANTE:
//  - CAPABILITY GATE: brez AIRALO_CLIENT_ID + AIRALO_CLIENT_SECRET (OBE!)
//    → iskreno PRAZEN sloj, 0 klicev na vir (tudi pri DELNIH poverilnicah)
//  - PRIHODNJA AKTIVACIJA: poverilnice + mock (žeton → države → paketi)
//    → kanonski produkti tipa esim (državni pin, /go/esim)
//  - ŽETON: single-flight + predpomnilnik (2 klica = 1 zahteva za žeton)
//  - CENA: SAMO ob potopljeni EUR valuti vira — USD/neznan → price
//    IZPUŠČEN + iskrena opomba (NIKOLI lažna konverzija, NIKOLI 0)
//  - STRICT fail-closed mapper: manjkajoč id/title → skipped+preštet
//  - negativni predpomnilnik okvar (60 s) + coalescing + TTL registra
//  - klasifikacija napak klienta (401/403/429+Retry-After/5xx/invalid)
//  - env leak: izhod NIKOLI ne vsebuje vrednosti poverilnic
// ============================================================================
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { readFileSync } from "node:fs";
import {
  createAiraloAdapter,
  resetAiraloAdapterCaches,
  airaloLastNote,
} from "@/lib/supply/providers/airalo/adapter";
import {
  AiraloClient,
  AiraloApiError,
} from "@/lib/supply/providers/airalo/client";
import { runAdapter, type SupplyAdapter } from "@/lib/supply/adapter";
import type { ProviderRegistryEntry } from "@/lib/supply/registry";
import type { SupplyQuery } from "@/lib/supply/types";

// ---------------------------------------------------------------------------
// REGISTAR (INLINE mock — glavni agent ga poveže v registry.ts; vrednosti
// po specifikaciji TASK 53: esim, minZoom 5, TTL 1 h, 20 klicev/min)
// ---------------------------------------------------------------------------

const AIRALO_ENTRY: ProviderRegistryEntry = {
  slug: "airalo",
  labels: { sl: "Airalo", en: "Airalo" },
  group: "commercial",
  inventoryAccess: ["affiliate_deep_link"],
  status: "affiliate",
  active: true,
  types: ["esim"],
  goRoute: "esim",
  capabilities: {
    geo: true, // kanonski center SI (geoPrecision: country)
    price: true, // SAMO ob potrjeni EUR valuti vira (iskreno)
    availability: false, // NE preverjamo (nikoli "available")
    images: true, // image[] paketov vira (imageCredit: © Airalo)
    reviews: false,
    map: true,
    booking: true, // affiliate_redirect (/go/esim)
    affiliate: true,
  },
  envKeys: {
    affiliate: ["AIRALO_AFFILIATE_URL"],
    api: ["AIRALO_CLIENT_ID", "AIRALO_CLIENT_SECRET", "AIRALO_API_BASE"],
  },
  minZoom: 5,
  cacheTtlMs: 60 * 60 * 1000,
  timeoutMs: 20_000,
  maxCallsPerMin: 20,
  docsUrl: "https://developers.partners.airalo.com",
};

// ---------------------------------------------------------------------------
// MOCK NAPREDA (DI fetch) — LIVE-VERIFIED oblika držav + dokumentirana
// (ASSUMPTION) oblika paketov/žetona
// ---------------------------------------------------------------------------

interface RecordedCall {
  url: string;
  method?: string;
  body?: string;
  headers?: Record<string, string>;
}

/** LIVE-VERIFIED oblika /api/v2/countries (sandbox, 19. 9. 2026). */
const COUNTRIES_SL = [
  {
    id: 210,
    slug: "slovenia",
    title: "Slovenia",
    image: {
      width: 132,
      height: 99,
      url: "https://sandbox.airalo.com/images/5594d9ca-3574-4189-9e7d-73ef29bb5421.png",
    },
    seo: null,
    package_count: 4,
    location_illustration: null,
    title_en: "Slovenia",
    is_banned: null,
  },
];

/** Paket v EUR valuti vira (cena se preslika). */
const PKG_EUR = {
  id: 101,
  slug: "slovenia-1gb-7days",
  title: "Slovenia 1GB",
  description: "eSIM podatkovni paket za Slovenijo",
  net_price: 4.5,
  amount: 5.0,
  currency: "EUR",
  days: 7,
  volume: "1GB",
  is_unlimited: false,
  type: "local",
  country: { country_id: 210, slug: "slovenia", title: "Slovenia" },
  image: [
    { url: "https://sandbox.airalo.com/images/pkg101.png", width: 132, height: 99 },
  ],
  created_at: "2026-09-01T00:00:00.000000Z",
};

/** Paket v USD valuti vira (cena se NE pretvarja — izpust + opomba). */
const PKG_USD = {
  id: 102,
  slug: "slovenia-3gb-15days",
  title: "Slovenia 3GB",
  description: "eSIM podatkovni paket za Slovenijo",
  net_price: 9.0,
  currency: "USD",
  days: 15,
  volume: "3GB",
  is_unlimited: false,
  type: "local",
  created_at: "2026-09-01T00:00:00.000000Z",
};

/** Paket brez net_price (amount fallback), EUR, neomejen. */
const PKG_AMOUNT_ONLY = {
  id: 103,
  slug: "slovenia-unlimited-30days",
  title: "Slovenia Unlimited",
  amount: 12.5,
  currency: "EUR",
  days: 30,
  is_unlimited: true,
  type: "global",
  created_at: "2026-09-01T00:00:00.000000Z",
};

const PACKAGES_SL = { data: [PKG_EUR, PKG_USD, PKG_AMOUNT_ONLY] };

const TOKEN_OK = {
  data: { access_token: "tok-1", token_type: "Bearer", expires_in: 86400 },
};

/** Zgradi mock fetch, ki beleži klice in odgovarja po shemi vira. */
function makeMockFetch(opts: {
  tokenStatus?: number;
  tokenBody?: unknown;
  countriesStatus?: number;
  countriesBody?: unknown;
  packagesStatus?: number;
  packagesBody?: unknown;
  delayMs?: number;
}) {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({
      url: u,
      method: init?.method,
      body: typeof init?.body === "string" ? init.body : undefined,
      headers,
    });
    if (opts.delayMs) {
      await new Promise((r) => setTimeout(r, opts.delayMs));
    }
    if (u.endsWith("/api/v2/oauth/token")) {
      const extraHeaders: Record<string, string> = {};
      if (opts.tokenStatus === 429) extraHeaders["retry-after"] = "30";
      return new Response(JSON.stringify(opts.tokenBody ?? TOKEN_OK), {
        status: opts.tokenStatus ?? 200,
        headers: { "content-type": "application/json", ...extraHeaders },
      });
    }
    if (u.endsWith("/api/v2/countries")) {
      const body =
        opts.countriesBody !== undefined ? opts.countriesBody : COUNTRIES_SL;
      return new Response(JSON.stringify(body), {
        status: opts.countriesStatus ?? 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (u.includes("/api/v2/packages")) {
      const body =
        opts.packagesBody !== undefined ? opts.packagesBody : PACKAGES_SL;
      return new Response(JSON.stringify(body), {
        status: opts.packagesStatus ?? 200,
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
  return createAiraloAdapter(AIRALO_ENTRY, { fetchImpl });
}

/** Širok slovenski viewport (državni produkt — zoom ≥ minZoom 5). */
const SI_VIEW: SupplyQuery = {
  bbox: [45.4, 13.3, 46.9, 16.7],
  zoom: 7,
  cats: ["esim"],
  locale: "sl",
};

// ---------------------------------------------------------------------------
// ZAGON/ČIŠČENJE — vsak test doba čisto stanje (cache + žeton + env vedno
// pobrisan; tudi DELNI ostanki poverilnic so izključeni)
// ---------------------------------------------------------------------------

let prevId: string | undefined;
let prevSecret: string | undefined;
let prevBase: string | undefined;

beforeEach(() => {
  prevId = process.env.AIRALO_CLIENT_ID;
  prevSecret = process.env.AIRALO_CLIENT_SECRET;
  prevBase = process.env.AIRALO_API_BASE;
  delete process.env.AIRALO_CLIENT_ID;
  delete process.env.AIRALO_CLIENT_SECRET;
  delete process.env.AIRALO_API_BASE;
  resetAiraloAdapterCaches();
});

afterEach(() => {
  if (prevId === undefined) delete process.env.AIRALO_CLIENT_ID;
  else process.env.AIRALO_CLIENT_ID = prevId;
  if (prevSecret === undefined) delete process.env.AIRALO_CLIENT_SECRET;
  else process.env.AIRALO_CLIENT_SECRET = prevSecret;
  if (prevBase === undefined) delete process.env.AIRALO_API_BASE;
  else process.env.AIRALO_API_BASE = prevBase;
  resetAiraloAdapterCaches();
});

// ---------------------------------------------------------------------------
// CAPABILITY GATE — brez OBEH poverilnic NI podatkov (in NI klicev)
// ---------------------------------------------------------------------------

describe("TASK 53 airalo: capability gate — poverilnice", () => {
  test("① brez poverilnic → iskreno PRAZEN sloj + not-configured + 0 klicev", async () => {
    delete process.env.AIRALO_CLIENT_ID;
    delete process.env.AIRALO_CLIENT_SECRET;
    const { fetchImpl, calls } = makeMockFetch({});
    const adapter = adapterWith(fetchImpl);
    const products = await adapter.search(SI_VIEW);
    expect(products).toEqual([]);
    expect(airaloLastNote()).toBe("not-configured");
    expect(calls).toHaveLength(0); // NIKAKOR ne pokličemo vira
  });

  test("② DELNE poverilnice (samo CLIENT_ID) → not-configured + 0 klicev", async () => {
    process.env.AIRALO_CLIENT_ID = "cid";
    delete process.env.AIRALO_CLIENT_SECRET;
    const { fetchImpl, calls } = makeMockFetch({});
    const products = await adapterWith(fetchImpl).search(SI_VIEW);
    expect(products).toEqual([]);
    expect(airaloLastNote()).toBe("not-configured");
    expect(calls).toHaveLength(0);
  });

  test("③ DELNE poverilnice (samo CLIENT_SECRET) → not-configured + 0 klicev", async () => {
    delete process.env.AIRALO_CLIENT_ID;
    process.env.AIRALO_CLIENT_SECRET = "csec";
    const { fetchImpl, calls } = makeMockFetch({});
    const products = await adapterWith(fetchImpl).search(SI_VIEW);
    expect(products).toEqual([]);
    expect(airaloLastNote()).toBe("not-configured");
    expect(calls).toHaveLength(0);
  });

  test("④ runner: iskrena opomba v AdapterRunInfo (ok=true, count=0)", async () => {
    delete process.env.AIRALO_CLIENT_ID;
    delete process.env.AIRALO_CLIENT_SECRET;
    const { fetchImpl, calls } = makeMockFetch({});
    const run = await runAdapter(adapterWith(fetchImpl), SI_VIEW);
    expect(run.info.ok).toBe(true); // stanje, NE napaka vira
    expect(run.info.slug).toBe("airalo");
    expect(run.info.count).toBe(0);
    expect(run.info.note).toBe("not-configured");
    expect(calls).toHaveLength(0);
    expect(run.products).toEqual([]);
  });

  test("⑤ SOURCE CONTRACT: adapter NE vsebuje izmišljenega inventarja", () => {
    const src = readFileSync(
      new URL("../supply/providers/airalo/adapter.ts", import.meta.url),
      "utf-8"
    );
    expect(src.includes("not-configured")).toBe(true); // iskrena opomba obstaja
    expect(src.includes("sample")).toBe(false);
    expect(src.includes("DEMO_")).toBe(false);
    expect(src.includes("fallbackProducts")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PRIHODNJA AKTIVACIJA — polna pot (žeton → države → paketi)
// ---------------------------------------------------------------------------

describe("TASK 53 airalo: prihodnja aktivacija (poverilnice + mock)", () => {
  test("① veriga žeton → države → paketi: pravilni klici + kanonski produkti", async () => {
    process.env.AIRALO_CLIENT_ID = "cid";
    process.env.AIRALO_CLIENT_SECRET = "csec";
    const { fetchImpl, calls } = makeMockFetch({});
    const products = await adapterWith(fetchImpl).search(SI_VIEW);

    // 3 klici: POST žeton → GET države → GET paketi (slovenija).
    expect(calls).toHaveLength(3);
    expect(calls[0].url).toContain("/api/v2/oauth/token");
    expect(calls[0].method).toBe("POST");
    // Žetonska zahteva: form-encoded poverilnici (dokumentirana oblika).
    const form = new URLSearchParams(calls[0].body ?? "");
    expect(form.get("client_id")).toBe("cid");
    expect(form.get("client_secret")).toBe("csec");
    expect(calls[1].url).toContain("/api/v2/countries");
    expect(calls[1].method).toBe("GET");
    expect(calls[1].headers?.["Authorization"]).toBe("Bearer tok-1");
    expect(calls[2].url).toContain(
      "/api/v2/packages?country_slug=slovenia"
    );
    expect(calls[2].headers?.["Authorization"]).toBe("Bearer tok-1");

    // Kanonski produkti (EUR → preslikana; USD → izpuščena iskreno):
    expect(products).toHaveLength(3);
    const byId = new Map(products.map((p) => [p.providerProductId, p]));

    const eur = byId.get("101")!;
    expect(eur.id).toBe("airalo:101");
    expect(eur.provider).toBe("airalo");
    expect(eur.type).toBe("esim");
    expect(eur.title).toBe("Slovenia 1GB · 1GB · 7 dni");
    // EUR valuta vira → cena preslikana (neto cena vira, enota total).
    expect(eur.price).toEqual({
      amount: 4.5,
      currency: "EUR",
      unit: "total",
      note: "cena paketa eSIM (skupaj)",
    });
    expect(eur.image).toBe("https://sandbox.airalo.com/images/pkg101.png");
    expect(eur.imageCredit).toBe("© Airalo");

    const usd = byId.get("102")!;
    // USD valuta vira → ceno NE pretvarjamo (price IZPUŠČEN + opomba).
    expect(usd.price).toBeUndefined();
    expect(usd.description).toContain(
      "cena v USD pri viru (konverzija ob aktivaciji)"
    );
    expect(usd.title).toBe("Slovenia 3GB · 3GB · 15 dni");

    const unlimited = byId.get("103")!;
    // amount fallback (net_price odsoten) + neomejen prenos.
    expect(unlimited.price?.amount).toBe(12.5);
    expect(unlimited.description).toContain("Neomejen prenos podatkov");

    // Skupna kanonska polja (državni pin, razpoložljivost, /go/esim):
    for (const p of products) {
      expect(p.lat).toBe(46.15);
      expect(p.lng).toBe(14.47);
      expect(p.geoPrecision).toBe("country");
      expect(p.address).toBe("Slovenija");
      expect(p.availability?.status).toBe("unknown");
      expect(p.bookingMode).toBe("affiliate_redirect");
      expect(p.bookingUrl).toBe("/go/esim");
      expect(p.license).toEqual({
        source: "Airalo Partner API",
        attribution: "© Airalo",
      });
      expect(p.lastUpdated).toBeTruthy();
    }
  });

  test("② druga IDENTIČNA poizvedba → predpomnilnik rezultatov (0 novih klicev)", async () => {
    process.env.AIRALO_CLIENT_ID = "cid";
    process.env.AIRALO_CLIENT_SECRET = "csec";
    const { fetchImpl, calls } = makeMockFetch({});
    const adapter = adapterWith(fetchImpl);
    const first = await adapter.search(SI_VIEW);
    expect(calls).toHaveLength(3);
    expect(adapter.lastRunCached()).toBe(false);
    const second = await adapter.search(SI_VIEW);
    expect(calls).toHaveLength(3); // NI novih klicev (TTL registra 1 h)
    expect(adapter.lastRunCached()).toBe(true);
    expect(second).toEqual(first);
  });

  test("③ seznam držav se prenese ENKRAT (24 h) — nov bbox = samo paketi", async () => {
    process.env.AIRALO_CLIENT_ID = "cid";
    process.env.AIRALO_CLIENT_SECRET = "csec";
    const { fetchImpl, calls } = makeMockFetch({});
    const adapter = adapterWith(fetchImpl);
    await adapter.search(SI_VIEW);
    // DRUGAČEN bbox (še vedno SI) — nov ključ: države iz PREDPOMNILNIKA.
    await adapter.search({
      bbox: [46.0, 14.6, 46.9, 16.7],
      zoom: 8,
      cats: ["esim"],
      locale: "sl",
    });
    expect(
      calls.filter((c) => c.url.endsWith("/api/v2/countries"))
    ).toHaveLength(1);
    expect(calls.filter((c) => c.url.includes("/api/v2/packages"))).toHaveLength(
      2
    );
    // Žetona TUDI ne ponovno (predpomnilnik klienta):
    expect(
      calls.filter((c) => c.url.endsWith("/api/v2/oauth/token"))
    ).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// ŽETON — single-flight + predpomnilnik (1 zahteva na veljavnost)
// ---------------------------------------------------------------------------

describe("TASK 53 airalo: žetonski predpomnilnik (single-flight)", () => {
  test("① dva ZAPOREDNA klica paketov → žeton pridobljen SAMO ENKRAT", async () => {
    const { fetchImpl, calls } = makeMockFetch({});
    const client = new AiraloClient({
      clientId: "cid",
      clientSecret: "csec",
      baseUrl: "https://sandbox.airalo.com",
      fetchImpl,
    });
    await client.getPackages("slovenia");
    await client.getPackages("slovenia");
    expect(
      calls.filter((c) => c.url.endsWith("/api/v2/oauth/token"))
    ).toHaveLength(1); // žeton ENKRAT
    expect(calls.filter((c) => c.url.includes("/api/v2/packages"))).toHaveLength(
      2
    ); // paketi dvakrat
  });

  test("② dva SOČASNA klica paketov → žeton pridobljen SAMO ENKRAT (single-flight)", async () => {
    const base = makeMockFetch({});
    const slow = (async (url: string | URL | Request, init?: RequestInit) => {
      await new Promise((r) => setTimeout(r, 120));
      return base.fetchImpl(url, init);
    }) as unknown as typeof fetch;
    const client = new AiraloClient({
      clientId: "cid",
      clientSecret: "csec",
      baseUrl: "https://sandbox.airalo.com",
      fetchImpl: slow,
    });
    const [a, b] = await Promise.all([
      client.getPackages("slovenia"),
      client.getPackages("slovenia"),
    ]);
    expect(a).toEqual(b);
    expect(
      base.calls.filter((c) => c.url.endsWith("/api/v2/oauth/token"))
    ).toHaveLength(1); // ENA zahteva za žeton (deljena!)
    expect(
      base.calls.filter((c) => c.url.includes("/api/v2/packages"))
    ).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// STRICT MAPPER — fail-closed (slabi zapisi odpadejo + se preštejejo)
// ---------------------------------------------------------------------------

describe("TASK 53 airalo: strict mapper (fail-closed)", () => {
  test("① zapis brez id-ja ALI brez naslova odpade (skipped števec)", async () => {
    process.env.AIRALO_CLIENT_ID = "cid";
    process.env.AIRALO_CLIENT_SECRET = "csec";
    const { fetchImpl } = makeMockFetch({
      packagesBody: {
        data: [
          PKG_EUR,
          { title: "Brez id", days: 7 }, // BREZ id → skip
          { id: 104, days: 7 }, // BREZ naslovu → skip
          { ...PKG_AMOUNT_ONLY, id: 105 }, // veljaven
        ],
      },
    });
    const adapter = adapterWith(fetchImpl);
    const products = await adapter.search(SI_VIEW);
    expect(products).toHaveLength(2);
    expect(products.map((p) => p.providerProductId).sort()).toEqual([
      "101",
      "105",
    ]);
    expect(adapter.lastRunSkipped?.() ?? 0).toBe(2);
  });

  test("② cena 0 / negativna / odsotna (ob EUR) → polje price IZPUŠČENO (nikoli 0)", async () => {
    process.env.AIRALO_CLIENT_ID = "cid";
    process.env.AIRALO_CLIENT_SECRET = "csec";
    const { fetchImpl } = makeMockFetch({
      packagesBody: {
        data: [
          { ...PKG_EUR, id: 201, net_price: 0, amount: 0 },
          { ...PKG_EUR, id: 202, net_price: -3, amount: -1 },
          { ...PKG_EUR, id: 203, net_price: 4.5 },
        ],
      },
    });
    const products = await adapterWith(fetchImpl).search(SI_VIEW);
    const byId = new Map(products.map((p) => [p.providerProductId, p]));
    expect(byId.get("201")?.price).toBeUndefined();
    expect(byId.get("202")?.price).toBeUndefined();
    expect(byId.get("203")?.price?.amount).toBe(4.5);
  });

  test("③ neznan tip paketa → tip IZPUŠČEN iz opisa (NE izmišljujemo oznake)", async () => {
    process.env.AIRALO_CLIENT_ID = "cid";
    process.env.AIRALO_CLIENT_SECRET = "csec";
    const { fetchImpl } = makeMockFetch({
      packagesBody: {
        data: [{ ...PKG_EUR, id: 301, type: "čudno-neznano" }],
      },
    });
    const products = await adapterWith(fetchImpl).search(SI_VIEW);
    expect(products).toHaveLength(1);
    // Neznana vrsta → BREZ lastne oznake vrste (NE izmišljujemo) — opis
    // vsebuje SAMO surovi description vira.
    expect(products[0].description).not.toContain("Lokalni paket");
    expect(products[0].description).not.toContain("Regionalni paket");
    expect(products[0].description).not.toContain("Globalni paket");
    expect(products[0].description).toContain("eSIM podatkovni paket");
  });

  test("④ slika NEVELJAVNA (http / tuji vnos) → image IZPUŠČEN", async () => {
    process.env.AIRALO_CLIENT_ID = "cid";
    process.env.AIRALO_CLIENT_SECRET = "csec";
    const { fetchImpl } = makeMockFetch({
      packagesBody: {
        data: [
          { ...PKG_EUR, id: 401, image: [{ url: "http://sandbox.airalo.com/x.png" }] },
          { ...PKG_EUR, id: 402, image: "ni-seznam" },
        ],
      },
    });
    const products = await adapterWith(fetchImpl).search(SI_VIEW);
    expect(products.every((p) => p.image === undefined)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GEO GATING + KATALOG DRŽAV (iskrene opombe brez klicev po pakete)
// ---------------------------------------------------------------------------

describe("TASK 53 airalo: geo gating + katalog držav", () => {
  test("① viewport BREZ Slovenije (Dunaj) → no-country-in-view + 0 klicev", async () => {
    process.env.AIRALO_CLIENT_ID = "cid";
    process.env.AIRALO_CLIENT_SECRET = "csec";
    const { fetchImpl, calls } = makeMockFetch({});
    const products = await adapterWith(fetchImpl).search({
      bbox: [48.1, 16.3, 48.3, 16.5],
      zoom: 12,
      cats: ["esim"],
      locale: "sl",
    });
    expect(products).toEqual([]);
    expect(airaloLastNote()).toBe("no-country-in-view");
    expect(calls).toHaveLength(0);
  });

  test("② Slovenije NI v katalogu vira → no-country (brez klica po pakete)", async () => {
    process.env.AIRALO_CLIENT_ID = "cid";
    process.env.AIRALO_CLIENT_SECRET = "csec";
    const { fetchImpl, calls } = makeMockFetch({
      countriesBody: [
        { id: 6, slug: "albania", title: "Albania", package_count: 4, is_banned: null },
      ],
    });
    const products = await adapterWith(fetchImpl).search(SI_VIEW);
    expect(products).toEqual([]);
    expect(airaloLastNote()).toBe("no-country");
    // Žeton + države sta se prenesla, po pakete NI klica:
    expect(calls).toHaveLength(2);
    expect(calls.some((c) => c.url.includes("/api/v2/packages"))).toBe(false);
  });

  test("③ Slovenija je BANNED pri viru → country-banned (iskreno prazno)", async () => {
    process.env.AIRALO_CLIENT_ID = "cid";
    process.env.AIRALO_CLIENT_SECRET = "csec";
    const { fetchImpl, calls } = makeMockFetch({
      countriesBody: [
        { ...COUNTRIES_SL[0], is_banned: true },
      ],
    });
    const products = await adapterWith(fetchImpl).search(SI_VIEW);
    expect(products).toEqual([]);
    expect(airaloLastNote()).toBe("country-banned");
    expect(calls).toHaveLength(2);
  });

  test("④ package_count 0 pri viru → no-packages (brez odvečnega klica)", async () => {
    process.env.AIRALO_CLIENT_ID = "cid";
    process.env.AIRALO_CLIENT_SECRET = "csec";
    const { fetchImpl, calls } = makeMockFetch({
      countriesBody: [{ ...COUNTRIES_SL[0], package_count: 0 }],
    });
    const products = await adapterWith(fetchImpl).search(SI_VIEW);
    expect(products).toEqual([]);
    expect(airaloLastNote()).toBe("no-packages");
    expect(calls).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// OKVARE / NEGATIVNI PREDPOMNILNIK / COALESCING
// ---------------------------------------------------------------------------

describe("TASK 53 airalo: okvare vira + negativni predpomnilnik", () => {
  test("① deformiran odgovor paketov (brez data) → invalid-response → recently-failed brez novega klica", async () => {
    process.env.AIRALO_CLIENT_ID = "cid";
    process.env.AIRALO_CLIENT_SECRET = "csec";
    const { fetchImpl, calls } = makeMockFetch({ packagesBody: { foo: 1 } });
    const adapter = adapterWith(fetchImpl);
    await expect(adapter.search(SI_VIEW)).rejects.toThrow();
    expect(calls).toHaveLength(3); // žeton + države + (deformirani) paketi
    // Ponovitev ISTIH pogojev v oknu 60 s → takoj prazna, 0 novih klicev:
    const products = await adapter.search(SI_VIEW);
    expect(products).toEqual([]);
    expect(airaloLastNote()).toBe("recently-failed");
    expect(calls).toHaveLength(3); // NI novih klicev (vljudnost do vira)
  });

  test("② deformiran seznam držav (NI array — npr. ovoj data) → invalid-response → recently-failed", async () => {
    process.env.AIRALO_CLIENT_ID = "cid";
    process.env.AIRALO_CLIENT_SECRET = "csec";
    const { fetchImpl, calls } = makeMockFetch({
      countriesBody: { data: COUNTRIES_SL },
    });
    const adapter = adapterWith(fetchImpl);
    await expect(adapter.search(SI_VIEW)).rejects.toThrow();
    expect(calls).toHaveLength(2); // žeton + (deformirane) države
    const products = await adapter.search(SI_VIEW);
    expect(products).toEqual([]);
    expect(airaloLastNote()).toBe("recently-failed");
    expect(calls).toHaveLength(2);
  });

  test("③ coalescing: 2 SOČASNI identični poizvedbi → ENA izvedba (žeton+države+paketi enkrat)", async () => {
    process.env.AIRALO_CLIENT_ID = "cid";
    process.env.AIRALO_CLIENT_SECRET = "csec";
    const base = makeMockFetch({});
    const slow = (async (url: string | URL | Request, init?: RequestInit) => {
      await new Promise((r) => setTimeout(r, 120));
      return base.fetchImpl(url, init);
    }) as unknown as typeof fetch;
    const adapter = adapterWith(slow);
    const [a, b] = await Promise.all([
      adapter.search(SI_VIEW),
      adapter.search(SI_VIEW),
    ]);
    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
    // Skupna izvedba: 1× žeton + 1× države + 1× paketi:
    expect(base.calls).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// KLASIFIKACIJA NAPAK KLIENTA (isti nabor kot viator klient)
// ---------------------------------------------------------------------------

describe("TASK 53 airalo: klasifikacija napak klienta", () => {
  async function captureError(promise: Promise<unknown>): Promise<AiraloApiError> {
    try {
      await promise;
    } catch (e) {
      return e as AiraloApiError;
    }
    throw new Error("expected rejection");
  }

  function clientWith(status: number, extraHeaders?: Record<string, string>) {
    const fetchImpl = (async () =>
      new Response("{}", {
        status,
        headers: extraHeaders ?? {},
      })) as unknown as typeof fetch;
    return new AiraloClient({
      clientId: "cid",
      clientSecret: "csec",
      baseUrl: "https://sandbox.airalo.com",
      fetchImpl,
    });
  }

  test("① 401 → unauthorized (klasifikacija + status)", async () => {
    const err = await captureError(clientWith(401).getPackages("slovenia"));
    expect(err).toBeInstanceOf(AiraloApiError);
    expect(err.kind).toBe("unauthorized");
    expect(err.status).toBe(401);
  });

  test("② 403 → forbidden", async () => {
    const err = await captureError(clientWith(403).getPackages("slovenia"));
    expect(err.kind).toBe("forbidden");
    expect(err.status).toBe(403);
  });

  test("③ 429 + Retry-After 30 → rate-limited + retryAfterSec", async () => {
    const err = await captureError(
      clientWith(429, { "retry-after": "30" }).getPackages("slovenia")
    );
    expect(err.kind).toBe("rate-limited");
    expect(err.status).toBe(429);
    expect(err.retryAfterSec).toBe(30);
  });

  test("④ 500 → server", async () => {
    const err = await captureError(clientWith(500).getPackages("slovenia"));
    expect(err.kind).toBe("server");
    expect(err.status).toBe(500);
  });

  test("⑤ 200 z ne-JSON → invalid-response", async () => {
    const fetchImpl = (async () =>
      new Response("ni-json{{{", { status: 200 })) as unknown as typeof fetch;
    const client = new AiraloClient({
      clientId: "cid",
      clientSecret: "csec",
      baseUrl: "https://sandbox.airalo.com",
      fetchImpl,
    });
    const err = await captureError(client.getAccessToken());
    expect(err.kind).toBe("invalid-response");
  });

  test("⑥ deformiran žeton (brez access_token) → invalid-response", async () => {
    const { fetchImpl } = makeMockFetch({ tokenBody: { data: {} } });
    const client = new AiraloClient({
      clientId: "cid",
      clientSecret: "csec",
      baseUrl: "https://sandbox.airalo.com",
      fetchImpl,
    });
    const err = await captureError(client.getAccessToken());
    expect(err.kind).toBe("invalid-response");
  });

  test("⑦ omrežna napaka fetch → network", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const client = new AiraloClient({
      clientId: "cid",
      clientSecret: "csec",
      baseUrl: "https://sandbox.airalo.com",
      fetchImpl,
    });
    const err = await captureError(client.getAccessToken());
    expect(err.kind).toBe("network");
  });
});

// ---------------------------------------------------------------------------
// ENV LEAK — izhod NIKOLI ne vsebuje vrednosti poverilnic
// ---------------------------------------------------------------------------

describe("TASK 53 airalo: env leak guard", () => {
  test("① produkti + opombe + sporočila napak NE vsebujejo poverilnic", async () => {
    const SECRET_ID = "cid-super-secret-123";
    const SECRET_SEC = "csec-top-secret-value-456";
    process.env.AIRALO_CLIENT_ID = SECRET_ID;
    process.env.AIRALO_CLIENT_SECRET = SECRET_SEC;
    const ok = makeMockFetch({});
    const products = await adapterWith(ok.fetchImpl).search(SI_VIEW);
    expect(JSON.stringify(products)).not.toContain(SECRET_ID);
    expect(JSON.stringify(products)).not.toContain(SECRET_SEC);

    // Napaka vira: sporočilo klasifikacije NE razkrije poverilnic.
    const bad = makeMockFetch({ tokenStatus: 401 });
    let errMessage = "";
    try {
      await adapterWith(bad.fetchImpl).search(SI_VIEW);
    } catch (e) {
      errMessage = e instanceof Error ? `${e.message} ${String(e)}` : String(e);
    }
    expect(errMessage).not.toContain(SECRET_ID);
    expect(errMessage).not.toContain(SECRET_SEC);
  });
});
