// ============================================================================
// TASK 46 — GETYOURGUIDE: POGODBENI TESTI (mapper / klient / tipi)
// ============================================================================
// Mock je TEST-ONLY preslikava ŽIVO preverjene uradne sheme (OpenAPI spec
// code.getyourguide.com/partner-api-spec + uradni wiki + uradni primer
// Making-a-booking.md, 18. 9. 2026) — identičen vzorec kot viator/kiwitaxi
// testi: NI izmišljenega inventarja, samo preslikava dokumentiranih
// odgovorov vira.
//
// Kritične invariante:
//  - §4/§5: ProviderProduct OSTANE provider-agnostic (0 gyg* polj)
//  - §7: podatki, ki jih vir nima → ODSOTNI (nikoli izmišljeni)
//  - §9: geo SEMANTIKA — tour.coordinates = predstavitvena lokacija
//         (geoPrecision "city", NIKOLI exact meeting point)
//  - §12: cena = StartingPrice (fromPrice) + enota iz PROSTEGA BESEDILA
//         vira; valuta potrjena iz _metadata (NE pretvarjamo)
//  - §13: razpoložljivost = unknown (iskanje je brez nje; cena ≠ dostopnost)
//  - §14: slike samo iz vira ([format_id] zamenjan, https, copyright vira)
//  - §15: ocena samo pri dokazanih recenzijah
// ============================================================================
import { describe, expect, test } from "bun:test";
import {
  gygTourToProduct,
  mapGygTours,
  canonicalType,
  gygImageUrl,
  gygSourceUrl,
  rememberGygTourUrl,
  lookupGygTourUrl,
  clearGygTourUrls,
  GYG_IMAGE_FORMAT_ID,
} from "@/lib/supply/providers/getyourguide/mapper";
import {
  isGygTour,
  filterValidTours,
  isGygTourId,
  isValidGygCoordinates,
  GYG_TOUR_ID_RE,
} from "@/lib/supply/providers/getyourguide/types";
import {
  GygClient,
  GygApiError,
  type GygErrorKind,
  gygApiTokenFromEnv,
  gygBaseUrlFromEnv,
  GYG_DEFAULT_BASE,
} from "@/lib/supply/providers/getyourguide/client";
import type { GygTour } from "@/lib/supply/providers/getyourguide/types";
import type { ProviderProduct } from "@/lib/supply/types";

// ---------------------------------------------------------------------------
// FIXTURE — PRESLIKAVA URADNEGA PRIMERA (Making-a-booking.md: Catacombs)
// ---------------------------------------------------------------------------

const MAP_CTX = {
  locale: "sl" as const,
  fetchedAt: "2026-09-18T12:00:00Z",
  currencyConfirmedEur: true,
  dateFiltered: false,
};

/** Uradi primer Tour (Making-a-booking.md) — preslikava dokumentirane oblike. */
function officialTour(overrides: Partial<GygTour> = {}): GygTour {
  return {
    tour_id: 66985,
    title: "Paris: Catacombs Skip-the-Cash-Desk Ticket with Audio Guide",
    abstract:
      "Skip the cash desk line at the Paris Catacombs. Discover a darker side to the \u201cCity of Lights.\u201d",
    overall_rating: 4.4974,
    number_of_ratings: 7000,
    pictures: [
      {
        id: 1,
        url: "https://cdn.getyourguide.com/img/tour/59cba8cb6b06c.jpeg/[format_id].jpg",
        ssl_url: "https://cdn.getyourguide.com/img/tour/59cba8cb6b06c.jpeg/[format_id].jpg",
        verified: true,
      },
    ],
    coordinates: { lat: 48.85693, long: 2.3412 },
    price: { values: { amount: 29 }, description: "individual" },
    categories: [{ category_id: 27, name: "Culture & History" }],
    locations: [
      {
        location_id: 965,
        type: "area",
        name: "Ile-de-France",
        country: "FR",
        coordinates: { lat: 48.680809, long: 2.50261 },
      },
    ],
    url: "https://www.getyourguide.com/paris-l16/paris-catacombs-skip-the-line-ticket-t66985/?partner_id=8OXMHTJ&psrc=partner_api&currency=EUR",
    durations: [{ duration: 1, unit: "hour" }],
    activity_type: "entryTicket",
    ...overrides,
  };
}

beforeEach(() => {
  clearGygTourUrls();
});

import { beforeEach } from "bun:test";

// ---------------------------------------------------------------------------
// §4/§5: KANONSKI MODEL OSTAJA PROVIDER-AGNOSTIC
// ---------------------------------------------------------------------------

describe("TASK 46 §4: kanonski model ostaja provider-agnostic (GetYourGuide)", () => {
  test("NI gyg*/getyourguide* polj v preslikanem produktu (source-scan na objektu)", () => {
    const p = gygTourToProduct(officialTour(), MAP_CTX) as unknown as Record<string, unknown>;
    expect(p).toBeTruthy();
    for (const key of Object.keys(p)) {
      expect(key.toLowerCase().startsWith("gyg")).toBe(false);
      expect(key.toLowerCase().startsWith("getyourguide")).toBe(false);
    }
    // kanonska polja so izključno iz ProviderProduct
    expect(p.provider).toBe("getyourguide");
    expect(p.providerProductId).toBe("66985");
    expect(p.id).toBe("getyourguide:66985");
  });

  test("taksonomija: activity_type → kanonski tipi — brez GYG kategorij", () => {
    expect(canonicalType("guidedTour")).toBe("tour");
    expect(canonicalType("privateTour")).toBe("tour");
    expect(canonicalType("multiDayTrip")).toBe("tour");
    expect(canonicalType("dayTrip")).toBe("tour");
    expect(canonicalType("hopOnHopOff")).toBe("tour");
    expect(canonicalType("waterActivity")).toBe("activity");
    expect(canonicalType("workshopOrClass")).toBe("activity");
    // vstopniški produkti — ISKREN kanonski tip ticket (ikona 🎟️ v plasti)
    expect(canonicalType("entryTicket")).toBe("ticket");
    expect(canonicalType("hostedTicket")).toBe("ticket");
    expect(canonicalType("ticket")).toBe("ticket");
    expect(canonicalType("cityCard")).toBe("ticket");
    // prevozi GYG tržnice — iskren tip transfer
    expect(canonicalType("transfer")).toBe("transfer");
    // neznan/odsoten → večinski privzeti (ture — isti vzorec kot Viator)
    expect(canonicalType(undefined)).toBe("tour");
    expect(canonicalType("someFutureType")).toBe("tour");
  });

  test("subcategory je IZ vira (snake_case activity_type) — izpeljano, ne izmišljeno", () => {
    const p = gygTourToProduct(officialTour(), MAP_CTX);
    expect(p?.subcategory).toBe("entry_ticket");
    const p2 = gygTourToProduct(officialTour({ activity_type: "privateTour" }), MAP_CTX);
    expect(p2?.subcategory).toBe("private_tour");
    const p3 = gygTourToProduct(officialTour({ activity_type: undefined }), MAP_CTX);
    expect(p3?.subcategory).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// §7: PODATKI, KI JIH VIR NIMA, SO ODSOTNI
// ---------------------------------------------------------------------------

describe("TASK 46 §7: podatki, ki jih vir nima, so ODSOTNI (nikoli izmišljeni)", () => {
  test("brez cene v viru → price undefined (NE 0, NE izmišljena)", () => {
    const p = gygTourToProduct(officialTour({ price: undefined }), MAP_CTX);
    expect(p?.price).toBeUndefined();
  });

  test("_metadata potrdi NE-EUR valuto → price undefined (NE pretvarjamo, NE lažemo)", () => {
    const p = gygTourToProduct(officialTour(), { ...MAP_CTX, currencyConfirmedEur: false });
    expect(p?.price).toBeUndefined();
  });

  test("cena 0 / negativna / NaN / Infinity → price undefined", () => {
    for (const amount of [0, -5, NaN, Infinity]) {
      const p = gygTourToProduct(officialTour({ price: { values: { amount }, description: "individual" } }), MAP_CTX);
      expect(p?.price).toBeUndefined();
    }
  });

  test("0 recenzij → NI ocene (rating/reviewCount ODSOTNA)", () => {
    const p = gygTourToProduct(officialTour({ number_of_ratings: 0, overall_rating: 4.5 }), MAP_CTX);
    expect(p?.rating).toBeUndefined();
    expect(p?.reviewCount).toBeUndefined();
  });

  test("ocena 0 / > 5 / NaN → NI ocene (samo veljavne vrednosti vira)", () => {
    for (const rating of [0, 5.5, NaN]) {
      const p = gygTourToProduct(officialTour({ overall_rating: rating }), MAP_CTX);
      expect(p?.rating).toBeUndefined();
    }
  });

  test("brez slik v viru → image undefined (NE placeholderja, NE naključnih slik)", () => {
    const p = gygTourToProduct(officialTour({ pictures: [] }), MAP_CTX);
    expect(p?.image).toBeUndefined();
    expect(p?.imageCredit).toBeUndefined();
  });

  test("tour_code (DEPRECATED v viru) se NE preslika; brez abstract+description+durations → opis ODSOTEN", () => {
    // tour_code vir označuje kot deprecated ("does not contain any meaningful
    // information") — preslikava ga NAMERNO ignorira (ni kanonskega polja zanj).
    const p = gygTourToProduct(
      officialTour({ abstract: undefined, description: undefined, durations: [] }),
      MAP_CTX
    );
    expect(p?.description).toBeUndefined();
    // abstract je primarni vir opisa (teaser tier); description je rezerva
    const p2 = gygTourToProduct(
      officialTour({ abstract: undefined, description: "Long description from source." }),
      MAP_CTX
    );
    expect(p2?.description).toContain("Long description from source.");
  });
});

// ---------------------------------------------------------------------------
// §9: GEO SEMANTIKA — PREDSTAVITVENA LOKACIJA (city, NIKOLI exact)
// ---------------------------------------------------------------------------

describe("TASK 46 §9: geo semantika (predstavitvena lokacija — geoPrecision city)", () => {
  test("tour.coordinates → lat/lng + geoPrecision city (NIKOLI exact — uradni primer vira je mestni center)", () => {
    const p = gygTourToProduct(officialTour(), MAP_CTX);
    expect(p?.lat).toBe(48.85693);
    expect(p?.lng).toBe(2.3412);
    expect(p?.geoPrecision).toBe("city");
  });

  test("brez koordinat → brez lat/lng/geoPrecision — NE izmišljujemo lokacije", () => {
    const p = gygTourToProduct(officialTour({ coordinates: undefined }), MAP_CTX);
    expect(p?.lat).toBeUndefined();
    expect(p?.lng).toBeUndefined();
    expect(p?.geoPrecision).toBeUndefined();
  });

  test("malformed koordinate (NaN / Infinity / izven obsega / wrong type) → geo ODSOTNO", () => {
    for (const coordinates of [
      { lat: NaN, long: 2.34 },
      { lat: 48.85, long: Infinity },
      { lat: 91, long: 2.34 },
      { lat: 48.85, long: -181 },
      { lat: "48.85" as unknown as number, long: 2.34 },
      {},
    ]) {
      const p = gygTourToProduct(officialTour({ coordinates }), MAP_CTX);
      expect(p?.lat).toBeUndefined();
      expect(p?.lng).toBeUndefined();
      expect(p?.geoPrecision).toBeUndefined();
    }
  });

  test("address = prva city/poi lokacija vira (sicer locations[0]); brez → ODSOTEN", () => {
    const p = gygTourToProduct(
      officialTour({
        locations: [
          { type: "area", name: "Ile-de-France" },
          { type: "city", name: "Paris", coordinates: { lat: 48.85, long: 2.35 } },
        ],
      }),
      MAP_CTX
    );
    expect(p?.address).toBe("Paris");
    const p2 = gygTourToProduct(officialTour({ locations: [] }), MAP_CTX);
    expect(p2?.address).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// §12: SEMANTIKA CEN (StartingPrice + enota iz PROSTEGA BESEDILA vira)
// ---------------------------------------------------------------------------

describe("TASK 46 §12: cena in enota (semantika vira ohranjena)", () => {
  test("cena: amount + EUR + per_person + fromPrice + opomba (opis vira 'individual')", () => {
    const p = gygTourToProduct(officialTour(), MAP_CTX);
    expect(p?.price).toEqual({
      amount: 29,
      currency: "EUR",
      unit: "per_person",
      fromPrice: true,
      note: "od-cena (najnižja, na osebo)",
    });
  });

  test("opis vira 'per person' → per_person (EN opomba pri EN locale)", () => {
    const p = gygTourToProduct(
      officialTour({ price: { values: { amount: 45 }, description: "per person" } }),
      { ...MAP_CTX, locale: "en" }
    );
    expect(p?.price?.unit).toBe("per_person");
    expect(p?.price?.note).toBe("from price (lowest, per person)");
  });

  test("opis vira 'per Group up to 10 people' → total + opomba na skupino (pomen ohranjen)", () => {
    const p = gygTourToProduct(
      officialTour({ price: { values: { amount: 250 }, description: "per Group up to 10 people" } }),
      MAP_CTX
    );
    expect(p?.price?.unit).toBe("total");
    expect(p?.price?.note).toBe("od-cena na skupino (vir)");
  });

  test("opis ODSOTEN → per_person + RAZKRIVAJOČA opomba (privzetek dokumentiran, NE tiho)", () => {
    const p = gygTourToProduct(
      officialTour({ price: { values: { amount: 30 } } }),
      MAP_CTX
    );
    expect(p?.price?.unit).toBe("per_person");
    expect(p?.price?.note).toBe("od-cena (enota po viru)");
  });

  test("REGRESIJA: cena OBSTOJI ≠ razpoložljivost (unknown — iskanje je brez nje)", () => {
    const p = gygTourToProduct(officialTour(), MAP_CTX);
    expect(p?.price).toBeDefined();
    expect(p?.availability?.status).toBe("unknown");
    expect(p?.availability?.note).toBe("razpoložljivost se preveri pri ponudniku");
  });
});

// ---------------------------------------------------------------------------
// §13/§15: RAZPOLOŽLJIVOST, SLIKE, OCENE
// ---------------------------------------------------------------------------

describe("TASK 46 §13/§14/§15: razpoložljivost / slike / ocene", () => {
  test("razpoložljivost: VEDNO unknown + opomba (iskanje ne vrača žive razpoložljivosti)", () => {
    const p = gygTourToProduct(officialTour(), MAP_CTX);
    expect(p?.availability?.status).toBe("unknown");
    expect(p?.availability?.checkedAt).toBeUndefined();
  });

  test("slika: [format_id] zamenjan z uradnim formatom 132 (480×320) — https ssl_url", () => {
    const p = gygTourToProduct(officialTour(), MAP_CTX);
    expect(p?.image).toBe(
      `https://cdn.getyourguide.com/img/tour/59cba8cb6b06c.jpeg/${GYG_IMAGE_FORMAT_ID}.jpg`
    );
    expect(p?.imageCredit).toBe("© GetYourGuide");
  });

  test("slika: copyright VIRA → imageCredit (atribucija po pogodbi)", () => {
    const p = gygTourToProduct(
      officialTour({
        pictures: [
          {
            ssl_url: "https://cdn.getyourguide.com/img/tour/x.jpeg/[format_id].jpg",
            copyright: "Copyrights of this image belongs to ACME Inc",
          },
        ],
      }),
      MAP_CTX
    );
    expect(p?.imageCredit).toBe("Copyrights of this image belongs to ACME Inc");
  });

  test("slika: http url zavrnjen; tuj host zavrnjen; wrong-type pictures → ODSOTNO", () => {
    expect(gygImageUrl("http://cdn.getyourguide.com/img/x.jpeg/132.jpg")).toBeUndefined();
    expect(gygImageUrl("https://evil.example.com/x.jpg")).toBeUndefined();
    expect(gygImageUrl("javascript:alert(1)")).toBeUndefined();
    expect(gygImageUrl("data:image/png;base64,xxxx")).toBeUndefined();
    expect(gygImageUrl("https://getyourguide.com.evil.example.com/x.jpg")).toBeUndefined();
    expect(gygImageUrl(undefined)).toBeUndefined();
    expect(gygImageUrl(42 as unknown as string)).toBeUndefined();
    // veljavni: produkcija + uradni test domeni iz specifikacije
    expect(gygImageUrl("https://cdn.getyourguide.com/img/x.jpeg/132.jpg")).toBe(
      "https://cdn.getyourguide.com/img/x.jpeg/132.jpg"
    );
    expect(gygImageUrl("https://img-getyourguide-com.partner.gygtest.net/img/x.jpeg/132.jpg")).toContain(
      "gygtest.net"
    );
    expect(gygImageUrl("https://www-getyourguide-com.partner.gygtest.com/x/132.jpg")).toContain(
      "gygtest.com"
    );
  });

  test("ocena: overall_rating zaokrožen na 2 decimalki + reviewCount", () => {
    const p = gygTourToProduct(officialTour(), MAP_CTX);
    expect(p?.rating).toBe(4.5);
    expect(p?.reviewCount).toBe(7000);
  });

  test("opis: abstract vira + trajanje iz durations vira (day/hour/minute)", () => {
    const p = gygTourToProduct(officialTour(), MAP_CTX);
    expect(p?.description).toContain("Skip the cash desk line");
    expect(p?.description).toContain("Trajanje: 1 h");
    const p2 = gygTourToProduct(
      officialTour({ durations: [{ duration: 90, unit: "minute" }] }),
      MAP_CTX
    );
    expect(p2?.description).toContain("Trajanje: 90 min");
    const p3 = gygTourToProduct(
      officialTour({ durations: [{ duration: 2, unit: "day" }] }),
      MAP_CTX
    );
    expect(p3?.description).toContain("Trajanje: 2 dni");
  });
});

// ---------------------------------------------------------------------------
// §16: BOOKING / SOURCEURL / PREDPOMNILNIK URL-JEV
// ---------------------------------------------------------------------------

describe("TASK 46 §16: bookingUrl / sourceUrl (Option 1 povezava vira)", () => {
  test("bookingUrl = NAŠA /go/getyourguide?product= konstrukcija; sourceUrl = tour.url vira", () => {
    const p = gygTourToProduct(officialTour(), MAP_CTX);
    expect(p?.bookingUrl).toBe("/go/getyourguide?product=66985");
    expect(p?.bookingMode).toBe("affiliate_redirect");
    expect(p?.sourceUrl).toBe(officialTour().url);
    expect(p?.license).toEqual({
      source: "GetYourGuide Partner API",
      attribution: "© GetYourGuide",
    });
  });

  test("tour.url predpomnilnik se napolni (za /go razrešitev)", () => {
    gygTourToProduct(officialTour(), MAP_CTX);
    expect(lookupGygTourUrl("66985")).toBe(officialTour().url!);
  });

  test("NEVELJAVEN tour.url (http / javascript: / tuj host) → sourceUrl ODSOTEN, NE shrani", () => {
    for (const url of [
      "http://www.getyourguide.com/x/",
      "javascript:alert(1)",
      "https://evil.example.com/tour/",
      "https://getyourguide.com.evil.example.com/x/",
      "not a url",
    ]) {
      clearGygTourUrls();
      const p = gygTourToProduct(officialTour({ url }), MAP_CTX);
      expect(p?.sourceUrl).toBeUndefined();
      expect(lookupGygTourUrl("66985")).toBeNull();
    }
  });

  test("gygSourceUrl: https + dovoljeni gostitelji (produkcija + test domeni specifikacije)", () => {
    expect(gygSourceUrl("https://www.getyourguide.com/paris-l16/x-t66985/?partner_id=8OXMHTJ")).toContain(
      "www.getyourguide.com"
    );
    expect(gygSourceUrl("https://getyourguide.com/x/")).toContain("getyourguide.com");
    expect(gygSourceUrl("https://www-getyourguide-com.partner.gygtest.com/x/")).toContain("gygtest.com");
    expect(gygSourceUrl("https://img-getyourguide-com.partner.gygtest.net/img/x.jpg")).toContain(
      "gygtest.net"
    );
    expect(gygSourceUrl("http://www.getyourguide.com/x/")).toBeUndefined();
    expect(gygSourceUrl(undefined)).toBeUndefined();
  });

  test("rememberGygTourUrl: ista meja zaupanja (javni vhod — NE zaupamo URL nizu)", () => {
    rememberGygTourUrl(66985, "https://evil.example.com/x/");
    expect(lookupGygTourUrl("66985")).toBeNull();
    rememberGygTourUrl(66985, "https://www.getyourguide.com/ok/");
    expect(lookupGygTourUrl("66985")).toBe("https://www.getyourguide.com/ok/");
    // neveljaven tour_id (ne-celo / <= 0) se NE shrani
    rememberGygTourUrl(-1, "https://www.getyourguide.com/x/");
    expect(lookupGygTourUrl("-1")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §4: FAIL-SAFE VALIDACIJA (en slab zapis ne sesuje plasti)
// ---------------------------------------------------------------------------

describe("TASK 46 §4: fail-safe validacija (en slab zapis ne sesuje plasti)", () => {
  test("filterValidTours: brez tour_id/naslova odpade, ostali preživijo", () => {
    const { valid, skipped } = filterValidTours([
      officialTour(),
      null,
      42,
      "x",
      { tour_id: 1 }, // brez naslova
      { title: "brez id-ja" },
      { tour_id: 1.5, title: "ne-celo število" },
      { tour_id: -5, title: "negativen id" },
    ]);
    expect(valid.length).toBe(1);
    expect(skipped).toBe(7);
  });

  test("isGygTourId meje zaupanja (števke 1–10, > 0) — /go varnostni vzorec", () => {
    expect(GYG_TOUR_ID_RE.test("66985")).toBe(true);
    expect(GYG_TOUR_ID_RE.test("1")).toBe(true);
    expect(isGygTourId("66985")).toBe(true);
    expect(isGygTourId("0")).toBe(false); // > 0
    expect(isGygTourId("abc")).toBe(false);
    expect(isGygTourId("66985P1")).toBe(false);
    expect(isGygTourId("../etc")).toBe(false);
    expect(isGygTourId("%2E%2E%2F")).toBe(false);
    expect(isGygTourId("12345678901")).toBe(false); // 11 števk
    expect(isGygTourId("")).toBe(false);
    expect(isGygTourId(undefined)).toBe(false);
  });

  test("mapGygTours: slab zapis → skipped, NE napaka (defenziven za vsakega klicatelja)", () => {
    const { products, skipped } = mapGygTours(
      [officialTour(), null as unknown as GygTour, officialTour({ title: "  " })],
      MAP_CTX
    );
    expect(products.length).toBe(1);
    expect(skipped).toBe(2);
  });

  test("isValidGygCoordinates: meje ISO 6709 (spec fields.yaml)", () => {
    expect(isValidGygCoordinates({ lat: 48.85, long: 2.34 })).toBe(true);
    expect(isValidGygCoordinates({ lat: 0, long: 0 })).toBe(true);
    expect(isValidGygCoordinates({ lat: -90, long: -180 })).toBe(true);
    expect(isValidGygCoordinates({ lat: 90.1, long: 0 })).toBe(false);
    expect(isValidGygCoordinates({ lat: 0, long: 180.1 })).toBe(false);
    expect(isValidGygCoordinates(undefined)).toBe(false);
    expect(isValidGygCoordinates({})).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §2: KLIENT — POGODBENE GLAVE IN KLASIFIKACIJA NAPAK
// ---------------------------------------------------------------------------

describe("TASK 46 §2: GygClient — pogodbene glave, pot /1/tours, parametri", () => {
  function makeClient(fetchImpl: typeof fetch) {
    return new GygClient({ apiToken: "test-token", fetchImpl });
  }

  test("searchTours pošlje IZKLJUČNO pogodbene glave (X-ACCESS-TOKEN + Accept) + pravo pot + parametre", async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      captured = { url: String(url), init: init ?? {} };
      return new Response(
        JSON.stringify({
          _metadata: { totalCount: 1, exchange: { rate: 1, currency: "eur" } },
          data: { tours: [officialTour()] },
        }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;
    const client = makeClient(fetchImpl);
    await client.searchTours({
      coordinates: [46.05, 14.5, 30],
      date: "2026-09-25",
      limit: 24,
    });
    expect(captured).toBeTruthy();
    const c = captured as unknown as { url: string; init: RequestInit };
    expect(c.url.startsWith("https://api.getyourguide.com/1/tours?")).toBe(true);
    const headers = c.init.headers as Record<string, string>;
    expect(headers["X-ACCESS-TOKEN"]).toBe("test-token");
    expect(headers["Accept"]).toBe("application/json");
    expect(headers["exp-api-key"]).toBeUndefined(); // Viator glava NE sme tu
    const u = new URL(c.url);
    expect(u.searchParams.getAll("coordinates[]")).toEqual(["46.05", "14.5", "30"]);
    expect(u.searchParams.get("cnt_language")).toBe("en");
    expect(u.searchParams.get("currency")).toBe("EUR");
    expect(u.searchParams.get("preformatted")).toBe("teaser");
    expect(u.searchParams.get("limit")).toBe("24");
    expect(u.searchParams.get("offset")).toBe("0");
    expect(u.searchParams.get("sortfield")).toBe("popularity");
    expect(u.searchParams.getAll("date[]")).toEqual([
      "2026-09-25T00:00:00",
      "2026-09-25T23:59:59",
    ]);
    // q se NE pošlje (medsebojno izključno s coordinates — pogodba)
    expect(u.searchParams.get("q")).toBeNull();
  });

  test("brez datuma → date[] ODSOTEN (vir ne dobi okna)", async () => {
    let capturedUrl = "";
    const fetchImpl = (async (url: string | URL | Request) => {
      capturedUrl = String(url);
      return new Response(JSON.stringify({ data: { tours: [] } }), { status: 200 });
    }) as unknown as typeof fetch;
    await makeClient(fetchImpl).searchTours({ coordinates: [46, 14.5, 10], limit: 24 });
    expect(new URL(capturedUrl).searchParams.getAll("date[]").length).toBe(0);
  });

  test("401 → unauthorized (živi dokaz pogodbe: errorCode 2420); 429 → rate-limited; 400 → bad-request; 5xx → server; ne-JSON → invalid-response", async () => {
    const statusResponse = (status: number, body = "{}") =>
      new Response(body, { status });
    const cases: Array<{ res: Response; kind: GygErrorKind }> = [
      { res: statusResponse(401, JSON.stringify({ errors: [{ errorCode: 2420 }] })), kind: "unauthorized" },
      { res: statusResponse(429), kind: "rate-limited" },
      { res: statusResponse(400), kind: "bad-request" },
      { res: statusResponse(404), kind: "not-found" },
      { res: statusResponse(500), kind: "server" },
      { res: statusResponse(200, "not-json{{"), kind: "invalid-response" },
    ];
    for (const { res, kind } of cases) {
      const fetchImpl = (async () => res) as unknown as typeof fetch;
      try {
        await makeClient(fetchImpl).searchTours({ coordinates: [46, 14.5, 10], limit: 5 });
        expect.unreachable(`expected ${kind}`);
      } catch (e) {
        expect(e).toBeInstanceOf(GygApiError);
        expect((e as GygApiError).kind).toBe(kind);
      }
    }
  });

  test("ne-JSON data oblika (data.tours ni array) → invalid-response", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ data: { tours: "ne-array" } }), { status: 200 })) as unknown as typeof fetch;
    try {
      await makeClient(fetchImpl).searchTours({ coordinates: [46, 14.5, 10], limit: 5 });
      expect.unreachable();
    } catch (e) {
      expect((e as GygApiError).kind).toBe("invalid-response");
    }
  });

  test("prazen žeton → unauthorized (konstruktor varovalka)", () => {
    expect(() => new GygClient({ apiToken: "  " })).toThrow(GygApiError);
  });

  test("env konfiguracija: GETYOURGUIDE_API_TOKEN / GETYOURGUIDE_API_BASE (strežniško)", () => {
    const hadToken = process.env.GETYOURGUIDE_API_TOKEN;
    const hadBase = process.env.GETYOURGUIDE_API_BASE;
    try {
      delete process.env.GETYOURGUIDE_API_TOKEN;
      expect(gygApiTokenFromEnv()).toBeNull();
      process.env.GETYOURGUIDE_API_TOKEN = "  gyg-token-1  ";
      expect(gygApiTokenFromEnv()).toBe("gyg-token-1");
      delete process.env.GETYOURGUIDE_API_BASE;
      expect(gygBaseUrlFromEnv()).toBe(GYG_DEFAULT_BASE);
      process.env.GETYOURGUIDE_API_BASE = "https://api.gygtest.net/";
      expect(gygBaseUrlFromEnv()).toBe("https://api.gygtest.net");
    } finally {
      if (hadToken == null) delete process.env.GETYOURGUIDE_API_TOKEN;
      else process.env.GETYOURGUIDE_API_TOKEN = hadToken;
      if (hadBase == null) delete process.env.GETYOURGUIDE_API_BASE;
      else process.env.GETYOURGUIDE_API_BASE = hadBase;
    }
  });
});
