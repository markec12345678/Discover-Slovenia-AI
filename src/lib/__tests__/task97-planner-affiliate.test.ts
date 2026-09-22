// ============================================================================
// TASK 97 — AFFILIATE POKRITOST NAČRTOVALNIKA BREZ POVERILNIC: testi (1.84.0)
// ============================================================================
//
// Kontekst direktive: "poverilnice ki jih nerabim jaz ti dat naredi ce mozno"
// → vse, kar za delovanje NE potrebuje uporabnikovih poverilnic, mora biti
// ŽIVE na vseh glavnih površinah. /go/[provider] redirect + affiliate.ts
// gradilci so fail-closed (brez ID-ja → ČISTA partner povezava, monetized:
// false) — ta test varuje, da je ta plast celovita tudi v načrtovalniku:
//
//   1. ČISTI HELPERJI (booking-panel, klient-varni — brez env/window):
//      clampInsuranceDays (meje 1–30 /go rute, zaokrožitev, neveljavni vnosi)
//      + insuranceGoHref (format /go/insurance?days=…, izpust parametra);
//   2. MONETIZACIJA SE PRIŽGE Z ENV BREZ SPREMEMBE KODE (jedro direktive):
//      Tiqets/WorldNomads/SafetyWing gradilci — brez env → čista povezava
//      (monetized: false, NIKOLI lažni tracking), z env → tracking URL
//      (monetized: true) + WN precedenca pred SafetyWing;
//   3. SOURCE-CONTRACT BookingPanel: Tiqets kartica (zavihek Aktivnosti) +
//      kartica zavarovanja (zavihek Transport) + goHref union vsebuje
//      "tickets" + tripDays prop + IKONE + AffiliateCard rel/target;
//      KLIENT NIKOLI ne uvaža @/lib/affiliate (ID-ji ostanejo strežniški)
//      in NIMA process.env dostopov;
//   4. SOURCE-CONTRACT načrtovalnik: tripDays={itinerary.days.length};
//   5. SOURCE-CONTRACT /go rute: days validacija 1–30 (400 izven), allowlist
//      gostiteljev za tickets/insurance;
//   6. REGISTAR: AFFILIATE_PROVIDERS + PARTNER_LABELS pokrivata tickets +
//      insurance (drift guard ene resnice).
// ============================================================================

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

import { insuranceGoHref, clampInsuranceDays } from "@/components/sections/booking-panel";
import {
  AFFILIATE_PROVIDERS,
  PARTNER_LABELS,
  getTiqetsUrl,
  getWorldNomadsUrl,
  insurancePartnerName,
} from "@/lib/affiliate";

const panel = source("src/components/sections/booking-panel.tsx");
const planner = source("src/components/sections/itinerary-planner.tsx");
const goRoute = source("src/app/go/[provider]/route.ts");

// ---------------------------------------------------------------------------
// 1. Čisti helperji (klient-varni, brez env/window)
// ---------------------------------------------------------------------------

describe("TASK 97: clampInsuranceDays — meje /go rute (1–30)", () => {
  test("veljavne vrednosti se ohranijo", () => {
    expect(clampInsuranceDays(1)).toBe(1);
    expect(clampInsuranceDays(5)).toBe(5);
    expect(clampInsuranceDays(30)).toBe(30);
  });

  test("nad mejo rute (30) → 30 (ne 400)", () => {
    expect(clampInsuranceDays(31)).toBe(30);
    expect(clampInsuranceDays(45)).toBe(30);
    expect(clampInsuranceDays(100)).toBe(30);
  });

  test("neceli vnos → zaokrožitev", () => {
    expect(clampInsuranceDays(5.4)).toBe(5);
    expect(clampInsuranceDays(5.6)).toBe(6);
  });

  test("neveljavni vnosi → null (parameter se izpusti)", () => {
    expect(clampInsuranceDays(undefined)).toBeNull();
    expect(clampInsuranceDays(0)).toBeNull();
    expect(clampInsuranceDays(-5)).toBeNull();
    expect(clampInsuranceDays(Number.NaN)).toBeNull();
    expect(clampInsuranceDays(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("TASK 97: insuranceGoHref — format povezave", () => {
  test("veljavna dolžina → days parameter", () => {
    expect(insuranceGoHref(5)).toBe("/go/insurance?days=5");
    expect(insuranceGoHref(1)).toBe("/go/insurance?days=1");
  });

  test("nad mejo → clamp na 30", () => {
    expect(insuranceGoHref(45)).toBe("/go/insurance?days=30");
  });

  test("manjkajoč/neveljaven vnos → brez parametra (ruta privzame 7)", () => {
    expect(insuranceGoHref(undefined)).toBe("/go/insurance");
    expect(insuranceGoHref(0)).toBe("/go/insurance");
  });
});

// ---------------------------------------------------------------------------
// 2. Monetizacija se prižge z ENV brez spremembe kode (jedro direktive)
// ---------------------------------------------------------------------------

const ENV_KEYS = [
  "TIQETS_AFFILIATE_URL",
  "WORLDNOMADS_AFFILIATE_URL",
  "SAFETYWING_AMBASSADOR_ID",
] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    const v = saved[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("TASK 97: Tiqets — čista povezava brez poverilnic, tracking z env", () => {
  test("BREZ env → čista Tiqets stran, monetized: false (0 lažnega trackinga)", () => {
    const r = getTiqetsUrl();
    expect(r.url).toBe("https://www.tiqets.com/");
    expect(r.monetized).toBe(false);
  });

  test("Z env (awin1.com/cread.php) → tracking URL, monetized: true", () => {
    process.env.TIQETS_AFFILIATE_URL =
      "https://www.awin1.com/cread.php?awinmid=1234&awinaffid=567&ued=https%3A%2F%2Fwww.tiqets.com";
    const r = getTiqetsUrl();
    expect(r.url).toContain("awin1.com/cread.php");
    expect(r.monetized).toBe(true);
  });

  test("ne-https vnos → fail-closed na čisto povezavo", () => {
    process.env.TIQETS_AFFILIATE_URL = "http://evil.example/track";
    const r = getTiqetsUrl();
    expect(r.url).toBe("https://www.tiqets.com/");
    expect(r.monetized).toBe(false);
  });
});

describe("TASK 97: Zavarovanje — WN precedenca, SafetyWing alternativa, čisti fallback", () => {
  test("BREZ env → čista World Nomads stran, monetized: false", () => {
    const r = getWorldNomadsUrl();
    expect(r.url).toBe("https://www.worldnomads.com/travel-insurance");
    expect(r.monetized).toBe(false);
    expect(insurancePartnerName()).toBe("World Nomads");
  });

  test("SAMO SafetyWing ID → referenceID povezava, monetized: true", () => {
    process.env.SAFETYWING_AMBASSADOR_ID = "24757629";
    const r = getWorldNomadsUrl();
    expect(r.url).toBe(
      "https://safetywing.com/nomad-insurance?referenceID=24757629",
    );
    expect(r.monetized).toBe(true);
    expect(insurancePartnerName()).toBe("SafetyWing");
  });

  test("OBA → World Nomads ima precedenco (uradna semantika)", () => {
    process.env.SAFETYWING_AMBASSADOR_ID = "24757629";
    process.env.WORLDNOMADS_AFFILIATE_URL =
      "https://www.dpbolvw.net/click-1-2-3";
    const r = getWorldNomadsUrl();
    expect(r.url).toBe("https://www.dpbolvw.net/click-1-2-3");
    expect(r.monetized).toBe(true);
    expect(insurancePartnerName()).toBe("World Nomads");
  });
});

// ---------------------------------------------------------------------------
// 3. SOURCE-CONTRACT BookingPanel — kartici + klient-varnost
// ---------------------------------------------------------------------------

describe("TASK 97: BookingPanel source-contract", () => {
  test("goHref union vsebuje tickets (Tiqets)", () => {
    expect(panel).toContain('| "tickets"');
  });

  test("Tiqets kartica: /go/tickets z destinacijo, ime partnerja, CTA", () => {
    expect(panel).toContain('goHref("tickets", loc.destination_name)');
    expect(panel).toContain('partnerName="Tiqets"');
    expect(panel).toContain('cta="Vstopnice"');
  });

  test("kartica zavarovanja: /go/insurance prek helperja, ime, CTA, opis", () => {
    expect(panel).toContain("href={insuranceHref}");
    expect(panel).toContain('partnerName="World Nomads"');
    expect(panel).toContain('cta="Zavarovanje"');
    expect(panel).toContain("description={insuranceDescription}");
    expect(panel).toContain("-dnevno potovanje");
  });

  test("tripDays prop v vmesniku + destrukturiran v komponenti", () => {
    expect(panel).toContain("tripDays?: number");
    expect(panel).toContain("clampInsuranceDays(tripDays)");
    expect(panel).toContain("insuranceGoHref(tripDays)");
  });

  test("ikoni kartic uvoženi iz lucide (ShieldCheck, Landmark)", () => {
    expect(panel).toContain("ShieldCheck");
    expect(panel).toContain("Landmark");
  });

  test("AffiliateCard: target=_blank + rel=noopener noreferrer sponsored", () => {
    expect(panel).toContain('target="_blank"');
    expect(panel).toContain('rel="noopener noreferrer sponsored"');
  });

  test("KLIENT NE uvaža @/lib/affiliate (ID-ji ostanejo strežniški)", () => {
    expect(panel).not.toContain('from "@/lib/affiliate');
  });

  test("KLIENT NIMA process.env dostopov (0 puščanj ID-jev)", () => {
    expect(panel).not.toContain("process.env");
  });

  test("9 /go providerjev na površini (vse affiliate kategorije, odkrito)", () => {
    // hotels, cars, activities, flights, esim, transfers, transport + tickets
    // (prek goHref) + insurance (prek insuranceGoHref)
    for (const p of [
      'goHref("hotels"',
      'goHref("cars"',
      'goHref("activities"',
      'goHref("flights"',
      'goHref("esim"',
      'goHref("transport"',
      "/go/transfers?from=",
      'goHref("tickets"',
      "insuranceGoHref",
    ]) {
      expect(panel).toContain(p);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. SOURCE-CONTRACT načrtovalnik — tripDays iz dolžine načrta
// ---------------------------------------------------------------------------

describe("TASK 97: itinerary-planner source-contract", () => {
  test("BookingPanel prejme tripDays={itinerary.days.length}", () => {
    expect(planner).toContain("tripDays={itinerary.days.length}");
  });
});

// ---------------------------------------------------------------------------
// 5. SOURCE-CONTRACT /go rute — days validacija + allowlist
// ---------------------------------------------------------------------------

describe("TASK 97: /go/[provider] ruta source-contract", () => {
  test("insurance days validacija 1–30 (izven → 400)", () => {
    expect(goRoute).toContain("parsed < 1 || parsed > 30");
    expect(goRoute).toContain("Parameter 'days' mora biti 1–30");
  });

  test("allowlist gostiteljev pokriva tickets (tiqets/awin/tp) in insurance (WN/SW/CJ)", () => {
    expect(goRoute).toContain('"www.tiqets.com"');
    expect(goRoute).toContain('"www.awin1.com"');
    expect(goRoute).toContain('"www.worldnomads.com"');
    expect(goRoute).toContain('"www.safetywing.com"');
  });

  test("tickets sprejema days NE (samo insurance) — days ostaja specifičen", () => {
    // days parameter se bere SAMO za provider === "insurance"
    expect(goRoute).toContain('provider === "insurance"');
  });
});

// ---------------------------------------------------------------------------
// 6. Registar — ena resnica (drift guard)
// ---------------------------------------------------------------------------

describe("TASK 97: registar affiliate providerjev", () => {
  test("AFFILIATE_PROVIDERS vsebuje tickets + insurance", () => {
    expect(AFFILIATE_PROVIDERS).toContain("tickets");
    expect(AFFILIATE_PROVIDERS).toContain("insurance");
  });

  test("PARTNER_LABELS: tickets → Tiqets, insurance → World Nomads", () => {
    expect(PARTNER_LABELS.tickets).toBe("Tiqets");
    expect(PARTNER_LABELS.insurance).toBe("World Nomads");
  });
});
