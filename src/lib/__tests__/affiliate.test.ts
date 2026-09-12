/// <reference types="bun-types" />
// Affiliate monetizacija — unit testi (FAZA 12)
// Zagon: bun test src/lib/__tests__/affiliate.test.ts
//
// Pokriva za VSAKEGA partnerja (po uporabnikovih zahtevah):
//   1. valid request → pravi URL + pravi tracking parameter
//   2. unknown destination → kanonski fallback "Slovenija"
//   3. missing destination → fallback (route vrže 400 — lib ne more manjkati)
//   4. malicious destination (https://evil.com, <script>, encoded URL,
//      path traversal) → payload NE pride v partner URL
//   5. affiliate configuration missing → fail-closed (monetized:false,
//      BREZ fake ID-jev)
//   6. PII nikoli v URL
//
// Plus: whitelist (canonicalDest/isKnownDest), Skyscanner IATA map,
// WorldNomads full-URL validacija, affiliateStatus() refleksija env.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  getBookingUrl,
  getDiscoverCarsUrl,
  getGetYourGuideUrl,
  getSkyscannerUrl,
  getWorldNomadsUrl,
  getAiraloUrl,
  getKiwitaxiUrl,
  getOmioUrl,
  getTiqetsUrl,
  insurancePartnerName,
  buildPartnerUrl,
  affiliateStatus,
  canonicalDest,
  isKnownDest,
} from "../affiliate";

// --- pomožniki --------------------------------------------------------------

const ENV_KEYS = [
  "BOOKING_AFFILIATE_ID",
  "DISCOVERCARS_AFFILIATE_CODE",
  "GETYOURGUIDE_PARTNER_ID",
  "SKYSCANNER_MEDIA_PARTNER_ID",
  "WORLDNOMADS_AFFILIATE_URL",
  "SAFETYWING_AMBASSADOR_ID",
  "AIRALO_AFFILIATE_URL",
  "KIWITAXI_PAP_ID",
  "OMIO_AFFILIATE_URL",
  "TIQETS_AFFILIATE_URL",
] as const;

function clearAffiliateEnv() {
  for (const k of ENV_KEYS) delete process.env[k];
}

function setEnv(key: (typeof ENV_KEYS)[number], value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

/** URLSearchParams iz Location query niza. */
function paramsOf(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

// --- skupna namestitev ------------------------------------------------------

beforeEach(() => clearAffiliateEnv());
afterEach(() => clearAffiliateEnv());

// ============================================================================
// BOOKING.COM
// ============================================================================

describe("Booking.com", () => {
  test("configured: pravi aid parameter + destinacija + https host", () => {
    setEnv("BOOKING_AFFILIATE_ID", "2039847");
    const { url, monetized } = getBookingUrl("Ljubljana");
    expect(monetized).toBe(true);
    const u = new URL(url);
    expect(u.protocol).toBe("https:");
    expect(u.hostname).toBe("www.booking.com");
    expect(u.pathname).toBe("/searchresults.html");
    expect(paramsOf(url).get("aid")).toBe("2039847");
    expect(paramsOf(url).get("ss")).toBe("Ljubljana");
  });

  test("NOT configured: fail-closed — BREZ aid parametra (nikoli fake ID)", () => {
    const { url, monetized } = getBookingUrl("Bled");
    expect(monetized).toBe(false);
    expect(paramsOf(url).get("aid")).toBe(null);
    expect(url).not.toContain("1234567");
    expect(url).not.toContain("slovenia-demo");
    expect(new URL(url).hostname).toBe("www.booking.com");
  });

  test("neznana destinacija → kanonski fallback 'Slovenija'", () => {
    setEnv("BOOKING_AFFILIATE_ID", "2039847");
    const { url } = getBookingUrl("Nikjerznano");
    expect(paramsOf(url).get("ss")).toBe("Slovenija");
  });

  test("zlobna destinacija (URL) → payload NE pride v povezavo", () => {
    setEnv("BOOKING_AFFILIATE_ID", "2039847");
    const { url } = getBookingUrl("https://evil.com/x");
    expect(url).not.toContain("evil.com");
    expect(paramsOf(url).get("ss")).toBe("Slovenija");
  });

  test("slug ujemanje: 'bled' → 'Bled'", () => {
    const { url } = getBookingUrl("bled");
    expect(paramsOf(url).get("ss")).toBe("Bled");
  });
});

// ============================================================================
// DISCOVERCARS
// ============================================================================

describe("DiscoverCars", () => {
  test("configured: tracking parameter je a_aid (ne odstranjeni 'affiliate=')", () => {
    setEnv("DISCOVERCARS_AFFILIATE_CODE", "discoverslovenia");
    const { url, monetized } = getDiscoverCarsUrl("Ljubljana");
    expect(monetized).toBe(true);
    const u = new URL(url);
    expect(u.protocol).toBe("https:");
    expect(u.hostname).toBe("www.discovercars.com");
    expect(paramsOf(url).get("a_aid")).toBe("discoverslovenia");
    // stari (mrtvi) parameter NE sme obstajati
    expect(paramsOf(url).get("affiliate")).toBe(null);
    expect(paramsOf(url).get("pickuplocation")).toBe("Ljubljana");
  });

  test("NOT configured: BREZ a_aid (fail-closed, brez 'slovenia-demo')", () => {
    const { url, monetized } = getDiscoverCarsUrl("Bled");
    expect(monetized).toBe(false);
    expect(paramsOf(url).get("a_aid")).toBe(null);
    expect(url).not.toContain("slovenia-demo");
  });

  test("neznana destinacija → 'Slovenija' pickup", () => {
    setEnv("DISCOVERCARS_AFFILIATE_CODE", "x");
    const { url } = getDiscoverCarsUrl("Mars");
    expect(paramsOf(url).get("pickuplocation")).toBe("Slovenija");
  });

  test("zlobna destinacija → payload izključen", () => {
    setEnv("DISCOVERCARS_AFFILIATE_CODE", "x");
    const { url } = getDiscoverCarsUrl("<script>alert(1)</script>");
    expect(url).not.toContain("<script>");
    expect(paramsOf(url).get("pickuplocation")).toBe("Slovenija");
  });
});

// ============================================================================
// GETYOURGUIDE
// ============================================================================

describe("GetYourGuide", () => {
  test("configured: partner_id parameter + q destinacija", () => {
    setEnv("GETYOURGUIDE_PARTNER_ID", "882910");
    const { url, monetized } = getGetYourGuideUrl("Bled");
    expect(monetized).toBe(true);
    const u = new URL(url);
    expect(u.protocol).toBe("https:");
    expect(u.hostname).toBe("www.getyourguide.com");
    expect(paramsOf(url).get("partner_id")).toBe("882910");
    expect(paramsOf(url).get("q")).toBe("Bled");
  });

  test("NOT configured: BREZ partner_id (fail-closed)", () => {
    const { url, monetized } = getGetYourGuideUrl("Piran");
    expect(monetized).toBe(false);
    expect(paramsOf(url).get("partner_id")).toBe(null);
    expect(url).not.toContain("slovenia-demo");
  });

  test("encoded URL destinacija → fallback, payload izključen", () => {
    setEnv("GETYOURGUIDE_PARTNER_ID", "882910");
    const { url } = getGetYourGuideUrl("https%3A%2F%2Fevil.com");
    expect(url).not.toContain("evil.com");
    expect(paramsOf(url).get("q")).toBe("Slovenija");
  });
});

// ============================================================================
// SKYSCANNER
// ============================================================================

describe("Skyscanner", () => {
  test("configured: mediaPartnerId (Impact) + whitelist slug path", () => {
    setEnv("SKYSCANNER_MEDIA_PARTNER_ID", "4285");
    const { url, monetized } = getSkyscannerUrl("Ljubljana");
    expect(monetized).toBe(true);
    const u = new URL(url);
    expect(u.protocol).toBe("https:");
    expect(u.hostname).toBe("www.skyscanner.net");
    expect(u.pathname.startsWith("/transport/flights-to/")).toBe(true);
    expect(paramsOf(url).get("mediaPartnerId")).toBe("4285");
    // IATA override za Ljubljano
    expect(u.pathname).toContain("/lju");
  });

  test("NOT configured: BREZ mediaPartnerId (bilo prej: sploh ni trackinga)", () => {
    const { url, monetized } = getSkyscannerUrl("Bled");
    expect(monetized).toBe(false);
    expect(paramsOf(url).get("mediaPartnerId")).toBe(null);
    expect(paramsOf(url).get("associateid")).toBe(null); // legacy tudi ne
  });

  test("IATA map: Ljubljana → lju; Maribor → lju; Bled → whitelisted slug", () => {
    setEnv("SKYSCANNER_MEDIA_PARTNER_ID", "4285");
    const lj = new URL(getSkyscannerUrl("Ljubljana").url).pathname;
    const mb = new URL(getSkyscannerUrl("Maribor").url).pathname;
    const bl = new URL(getSkyscannerUrl("Bled").url).pathname;
    expect(lj).toContain("/flights-to/lju/");
    expect(mb).toContain("/flights-to/lju/");
    expect(bl).toContain("/flights-to/bled/");
  });

  test("zlobna destinacija → path traversal izključen (fallback lju)", () => {
    setEnv("SKYSCANNER_MEDIA_PARTNER_ID", "4285");
    const { url } = getSkyscannerUrl("../../evil");
    const u = new URL(url);
    expect(u.hostname).toBe("www.skyscanner.net");
    expect(u.pathname).toContain("/flights-to/lju/");
    expect(u.pathname).not.toContain("..");
  });
});

// ============================================================================
// WORLD NOMADS
// ============================================================================

describe("World Nomads", () => {
  test("configured: CEL CJ URL preide nedotaknjen (monetized)", () => {
    setEnv(
      "WORLDNOMADS_AFFILIATE_URL",
      "https://www.dpbolvw.net/click-1001-22334?sid=discoverslovenia&url=https%3A%2F%2Fwww.worldnomads.com%2Ftravel-insurance",
    );
    const { url, monetized } = getWorldNomadsUrl();
    expect(monetized).toBe(true);
    expect(url).toBe(
      "https://www.dpbolvw.net/click-1001-22334?sid=discoverslovenia&url=https%3A%2F%2Fwww.worldnomads.com%2Ftravel-insurance",
    );
  });

  test("NOT configured: čista stran BREZ lažnega affiliate= trackinga", () => {
    const { url, monetized } = getWorldNomadsUrl();
    expect(monetized).toBe(false);
    const u = new URL(url);
    expect(u.hostname).toBe("www.worldnomads.com");
    expect(paramsOf(url).get("affiliate")).toBe(null); // mrtvi legacy param ven
  });

  test("neveljaven env (http) → fail-closed fallback", () => {
    setEnv("WORLDNOMADS_AFFILIATE_URL", "http://neveljavno.example");
    const { url, monetized } = getWorldNomadsUrl();
    expect(monetized).toBe(false);
    expect(new URL(url).hostname).toBe("www.worldnomads.com");
  });

  test("neveljaven env (smet) → fail-closed fallback", () => {
    setEnv("WORLDNOMADS_AFFILIATE_URL", "ni-to-url");
    const { monetized } = getWorldNomadsUrl();
    expect(monetized).toBe(false);
  });

  test("SAFETYWING: samostojen ambassador ID → referenceID povezava (monetized)", () => {
    setEnv("SAFETYWING_AMBASSADOR_ID", "24757629");
    const { url, monetized } = getWorldNomadsUrl();
    expect(monetized).toBe(true);
    const u = new URL(url);
    expect(u.hostname).toBe("safetywing.com");
    expect(paramsOf(url).get("referenceID")).toBe("24757629");
  });

  test("SAFETYWING: WN URL ima PRECEDENCO pred SafetyWing", () => {
    setEnv("WORLDNOMADS_AFFILIATE_URL", "https://www.dpbolvw.net/click-1-1");
    setEnv("SAFETYWING_AMBASSADOR_ID", "24757629");
    const { url } = getWorldNomadsUrl();
    expect(new URL(url).hostname).toBe("www.dpbolvw.net");
    expect(url).not.toContain("referenceID");
  });

  test("SAFETYWING: neveljaven ID (prazen po trimu) → fail-closed", () => {
    setEnv("SAFETYWING_AMBASSADOR_ID", "   ");
    const { monetized } = getWorldNomadsUrl();
    expect(monetized).toBe(false);
  });

  test("insurancePartnerName(): odraža AKTIVNEGA partnerja", () => {
    expect(insurancePartnerName()).toBe("World Nomads");
    setEnv("SAFETYWING_AMBASSADOR_ID", "24757629");
    expect(insurancePartnerName()).toBe("SafetyWing");
    setEnv("WORLDNOMADS_AFFILIATE_URL", "https://www.dpbolvw.net/click-1-1");
    expect(insurancePartnerName()).toBe("World Nomads");
  });
});

// ============================================================================
// AIRALO (eSIM) — celoten URL iz Impact/Travelpayouts dashboarda
// ============================================================================

describe("Airalo (eSIM)", () => {
  test("configured: CEL URL preide nedotaknjen (monetized)", () => {
    setEnv(
      "AIRALO_AFFILIATE_URL",
      "https://tp.media/r?marker=123456&trs=5&p=8310&u=https%3A%2F%2Fwww.airalo.com%2Fesims&campaign_id=541",
    );
    const { url, monetized } = getAiraloUrl();
    expect(monetized).toBe(true);
    expect(url).toBe(
      "https://tp.media/r?marker=123456&trs=5&p=8310&u=https%3A%2F%2Fwww.airalo.com%2Fesims&campaign_id=541",
    );
  });

  test("NOT configured: čista Airalo stran (monetized:false)", () => {
    const { url, monetized } = getAiraloUrl();
    expect(monetized).toBe(false);
    expect(url).toBe("https://www.airalo.com/");
  });

  test("neveljaven env (http/smét) → fail-closed fallback", () => {
    setEnv("AIRALO_AFFILIATE_URL", "http://airalo.example");
    expect(getAiraloUrl().monetized).toBe(false);
    setEnv("AIRALO_AFFILIATE_URL", "smet");
    expect(getAiraloUrl().monetized).toBe(false);
    expect(getAiraloUrl().url).toBe("https://www.airalo.com/");
  });
});

// ============================================================================
// KIWITAXI (transferji) — pap parameter, uradno dokumentirane oblike povezav
// ============================================================================

describe("Kiwitaxi (transfers)", () => {
  test("configured + znan dest: waypoint povezava s pap (monetized)", () => {
    setEnv("KIWITAXI_PAP_ID", "59942b21df77e");
    const { url, monetized } = getKiwitaxiUrl("Bled");
    expect(monetized).toBe(true);
    const u = new URL(url);
    expect(u.hostname).toBe("kiwitaxi.com");
    expect(u.pathname).toBe("/en/slovenia/bled");
    expect(paramsOf(url).get("pap")).toBe("59942b21df77e");
  });

  test("configured + from+to (oba znana, različna): iskalni deep-link", () => {
    setEnv("KIWITAXI_PAP_ID", "59942b21df77e");
    const { url } = getKiwitaxiUrl("Bled", "Piran");
    const u = new URL(url);
    expect(u.pathname).toBe("/en/search");
    expect(paramsOf(url).get("from")).toBe("Piran");
    expect(paramsOf(url).get("to")).toBe("Bled");
    expect(paramsOf(url).get("pap")).toBe("59942b21df77e");
  });

  test("from == to → NE iskalni povezavi (waypoint)", () => {
    setEnv("KIWITAXI_PAP_ID", "59942b21df77e");
    const { url } = getKiwitaxiUrl("Bled", "bled");
    expect(new URL(url).pathname).toBe("/en/slovenia/bled");
  });

  test("configured + NEZNAN dest: slovenska državna stran (whitelist)", () => {
    setEnv("KIWITAXI_PAP_ID", "59942b21df77e");
    const { url } = getKiwitaxiUrl("https://evil.com");
    const u = new URL(url);
    expect(u.pathname).toBe("/en/slovenia");
    expect(url).not.toContain("evil.com");
    expect(paramsOf(url).get("pap")).toBe("59942b21df77e");
  });

  test("configured + malign from: from se ignorira (whitelist)", () => {
    setEnv("KIWITAXI_PAP_ID", "59942b21df77e");
    const { url } = getKiwitaxiUrl("Bled", "<script>alert(1)</script>");
    expect(url).not.toContain("script");
    expect(new URL(url).pathname).toBe("/en/slovenia/bled");
  });

  test("NOT configured: čista slovenska stran BREZ pap", () => {
    const { url, monetized } = getKiwitaxiUrl("Bled");
    expect(monetized).toBe(false);
    expect(url).toBe("https://kiwitaxi.com/en/slovenia/bled");
    expect(url).not.toContain("pap=");
  });

  test("PII nikoli v URL (dest je izključno destinacija)", () => {
    setEnv("KIWITAXI_PAP_ID", "59942b21df77e");
    const { url } = getKiwitaxiUrl("Bled", "Ljubljana");
    expect(url).not.toContain("email");
    expect(url).not.toContain("@example");
  });
});

// ============================================================================
// OMIO (transport) + TIQETS (vstopnice) — celotni URL-ji iz dashboardov
// ============================================================================

describe("Omio (transport)", () => {
  test("configured: CEL URL preide (monetized)", () => {
    setEnv("OMIO_AFFILIATE_URL", "https://tp.media/r?marker=1&p=1111&u=https%3A%2F%2Fwww.omio.com");
    const { url, monetized } = getOmioUrl();
    expect(monetized).toBe(true);
    expect(new URL(url).hostname).toBe("tp.media");
  });

  test("NOT configured: čista Omio stran (monetized:false)", () => {
    const { url, monetized } = getOmioUrl();
    expect(monetized).toBe(false);
    expect(url).toBe("https://www.omio.com/");
  });

  test("neveljaven env → fail-closed", () => {
    setEnv("OMIO_AFFILIATE_URL", "http://omio.example");
    expect(getOmioUrl().monetized).toBe(false);
  });
});

describe("Tiqets (tickets)", () => {
  test("configured: Awin cread.php URL preide nedotaknjen (monetized)", () => {
    setEnv(
      "TIQETS_AFFILIATE_URL",
      "https://www.awin1.com/cread.php?awinmid=13075&awinaffid=1395991&ued=https%3A%2F%2Fwww.tiqets.com%2Fen%2Fpostojna",
    );
    const { url, monetized } = getTiqetsUrl();
    expect(monetized).toBe(true);
    expect(url).toContain("awin1.com/cread.php");
    expect(url).toContain("awinmid=13075");
  });

  test("NOT configured: čista Tiqets stran (monetized:false)", () => {
    const { url, monetized } = getTiqetsUrl();
    expect(monetized).toBe(false);
    expect(url).toBe("https://www.tiqets.com/");
  });

  test("neveljaven env → fail-closed", () => {
    setEnv("TIQETS_AFFILIATE_URL", "ftp://tiqets.example");
    expect(getTiqetsUrl().monetized).toBe(false);
  });
});

// ============================================================================
// CENTRALNI buildPartnerUrl + status
// ============================================================================

describe("buildPartnerUrl (centralni razrez)", () => {
  test("vseh 5 prvih providerjev vrača https URL na pravem hostu", () => {
    setEnv("BOOKING_AFFILIATE_ID", "1");
    setEnv("DISCOVERCARS_AFFILIATE_CODE", "2");
    setEnv("GETYOURGUIDE_PARTNER_ID", "3");
    setEnv("SKYSCANNER_MEDIA_PARTNER_ID", "4");
    setEnv(
      "WORLDNOMADS_AFFILIATE_URL",
      "https://www.dpbolvw.net/click-1-1",
    );
    const cases: Array<[Parameters<typeof buildPartnerUrl>[0], string]> = [
      ["hotels", "www.booking.com"],
      ["cars", "www.discovercars.com"],
      ["activities", "www.getyourguide.com"],
      ["flights", "www.skyscanner.net"],
      ["insurance", "www.dpbolvw.net"],
    ];
    for (const [provider, host] of cases) {
      const { url, monetized } = buildPartnerUrl(provider, "Ljubljana", 7);
      const u = new URL(url);
      expect(u.protocol).toBe("https:");
      expect(u.hostname).toBe(host);
      expect(monetized).toBe(true);
    }
  });

  test("novi providerji (esim/transfers/transport/tickets) vračajo prave hoste", () => {
    setEnv("AIRALO_AFFILIATE_URL", "https://airalo.sjv.io/c/1/2/3?u=https%3A%2F%2Fwww.airalo.com");
    setEnv("KIWITAXI_PAP_ID", "abc123");
    setEnv("OMIO_AFFILIATE_URL", "https://www.omio.com/affiliate-x");
    setEnv("TIQETS_AFFILIATE_URL", "https://www.awin1.com/cread.php?awinmid=1&awinaffid=2");
    const cases: Array<[Parameters<typeof buildPartnerUrl>[0], string, boolean]> = [
      ["esim", "airalo.sjv.io", true],
      ["transfers", "kiwitaxi.com", true],
      ["transport", "www.omio.com", true],
      ["tickets", "www.awin1.com", true],
    ];
    for (const [provider, host, monetized] of cases) {
      const { url, monetized: m } = buildPartnerUrl(provider, "Bled", 7);
      const u = new URL(url);
      expect(u.protocol).toBe("https:");
      expect(u.hostname).toBe(host);
      expect(m).toBe(monetized);
    }
  });

  test("transfers: from parameter se prenese v iskalni deep-link", () => {
    setEnv("KIWITAXI_PAP_ID", "abc123");
    const { url } = buildPartnerUrl("transfers", "Bled", 7, "Piran");
    expect(new URL(url).pathname).toBe("/en/search");
    expect(url).toContain("from=Piran");
    expect(url).toContain("to=Bled");
  });
});

describe("affiliateStatus (fail-closed refleksija env)", () => {
  test("brez env: VSEHI partnerji not_configured", () => {
    const s = affiliateStatus();
    for (const p of [
      "hotels",
      "cars",
      "activities",
      "flights",
      "insurance",
      "esim",
      "transfers",
      "transport",
      "tickets",
    ] as const) {
      expect(s[p].configured).toBe(false);
      expect(s[p].envVar.length).toBeGreaterThan(3);
    }
  });

  test("z env: ustrezni partnerji configured", () => {
    setEnv("BOOKING_AFFILIATE_ID", "123");
    setEnv("SKYSCANNER_MEDIA_PARTNER_ID", "456");
    const s = affiliateStatus();
    expect(s.hotels.configured).toBe(true);
    expect(s.flights.configured).toBe(true);
    expect(s.cars.configured).toBe(false);
    expect(s.activities.configured).toBe(false);
    expect(s.insurance.configured).toBe(false);
  });

  test("novi providerji: status odraža env (Airalo/Kiwitaxi/Omio/Tiqets/SafetyWing)", () => {
    setEnv("AIRALO_AFFILIATE_URL", "https://airalo.sjv.io/c/1/2/3");
    setEnv("KIWITAXI_PAP_ID", "abc123");
    setEnv("OMIO_AFFILIATE_URL", "https://tp.media/r?marker=1");
    setEnv("TIQETS_AFFILIATE_URL", "https://www.awin1.com/cread.php?awinmid=1&awinaffid=2");
    setEnv("SAFETYWING_AMBASSADOR_ID", "24757629");
    const s = affiliateStatus();
    expect(s.esim.configured).toBe(true);
    expect(s.transfers.configured).toBe(true);
    expect(s.transport.configured).toBe(true);
    expect(s.tickets.configured).toBe(true);
    expect(s.insurance.configured).toBe(true); // prek SafetyWing
    expect(s.insurance.envVar).toContain("SAFETYWING_AMBASSADOR_ID");
  });
});

// ============================================================================
// WHITELISTA (FAZA 5)
// ============================================================================

describe("destinacijska whitelist", () => {
  test("znana imena po imenu in slugu", () => {
    expect(canonicalDest("Ljubljana")).toBe("Ljubljana");
    expect(canonicalDest("ljubljana")).toBe("Ljubljana");
    expect(canonicalDest("bled")).toBe("Bled");
    expect(canonicalDest("reka-soca")).toBe("Reka Soča");
    expect(isKnownDest("Piran")).toBe(true);
  });

  test("neznano/prazno/maligno → fallback", () => {
    expect(canonicalDest("NedefiniranoMesto")).toBe("Slovenija");
    expect(canonicalDest("")).toBe("Slovenija");
    expect(canonicalDest("  ")).toBe("Slovenija");
    expect(canonicalDest("https://evil.com")).toBe("Slovenija");
    expect(canonicalDest("<img src=x>")).toBe("Slovenija");
    expect(isKnownDest("https://evil.com")).toBe(false);
  });
});

// ============================================================================
// PII — nikoli v URL
// ============================================================================

describe("PII izključitev", () => {
  test("v generiranih URL-jih ni email/PII vzorcev", () => {
    setEnv("BOOKING_AFFILIATE_ID", "1");
    setEnv("DISCOVERCARS_AFFILIATE_CODE", "2");
    setEnv("GETYOURGUIDE_PARTNER_ID", "3");
    setEnv("SKYSCANNER_MEDIA_PARTNER_ID", "4");
    const urls = [
      getBookingUrl("Bled").url,
      getDiscoverCarsUrl("Bled").url,
      getGetYourGuideUrl("Bled").url,
      getSkyscannerUrl("Bled").url,
      getWorldNomadsUrl().url,
    ];
    for (const u of urls) {
      expect(u).not.toMatch(/@/); // brez emaillov
      expect(u).not.toMatch(/(user_?id|email|firstname|lastname|fullname)/i);
    }
  });
});
