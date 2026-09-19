// ============================================================================
// TASK 52 §32 — USER-FACING PRODUCTION STATUS: testi iskrenosti
// ============================================================================
// Register mora uporabniku/administratorju pokazati IZKLJUČNO:
//   LIVE | CONFIGURED | NOT CONFIGURED | PARTNER ACCESS REQUIRED | AFFILIATE ONLY
// Invariante (naročnik §32/§26/§35):
//  - NIKOLI „LIVE“, če poverilnica manjka (LIVE ⟺ PRODUCTION_ACTIVE)
//  - affiliate ID/URL NIKOLI ne povzroči LIVE niti CONFIGURED
//    (monetizacija je ločen prikaz — povezava NI inventar)
//  - AFFILIATE_ONLY ostane AFFILIATE_ONLY tudi z nastavljenim ID-jem
//    (vir NIMA inventarskega API-ja — sposobnost je stalna)
//  - CONFIGURED nastopi SAMO ob prisotnem API ključu/žetonu
//  - env vrednosti NIKOLI ne zapustijo modula (leak test)
// ============================================================================

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  productionStatuses,
  providerProductionStatus,
  userFacingStatus,
  monetizationState,
  USER_FACING_STATUSES,
  type UserFacingStatus,
} from "../supply/production-status";
import {
  productionMatrix,
  providerEnvAccess,
} from "../supply/production-matrix";
import { PROVIDER_REGISTRY } from "../supply/registry";

// --- pomožniki (isti nabor kot task52-production-matrix.test.ts) ----------

const MATRIX_ENV_KEYS = [
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
  "VIATOR_AFFILIATE_URL",
  "VIATOR_API_KEY",
  "VIATOR_API_BASE",
  "GETYOURGUIDE_API_TOKEN",
  "GETYOURGUIDE_API_BASE",
  "FSQ_PLACES_DIR",
] as const;

function clearMatrixEnv() {
  for (const k of MATRIX_ENV_KEYS) delete process.env[k];
}

function statusOf(slug: string): UserFacingStatus {
  const s = providerProductionStatus(slug);
  if (!s) throw new Error(`providerProductionStatus(${slug}) === undefined`);
  return s.status;
}

beforeEach(() => clearMatrixEnv());
afterEach(() => clearMatrixEnv());

// ============================================================================
// §32 — pokritost + dovoljen nabor vrednosti
// ============================================================================

describe("T52 §32: produkcjski status pokriva CEL register", () => {
  test("vsak vnos registra ima status (iste slugi, isti vrstni red)", () => {
    const statuses = productionStatuses();
    expect(statuses.map((s) => s.slug)).toEqual(
      PROVIDER_REGISTRY.map((p) => p.slug)
    );
  });

  test("statusi so IZKLJUČNO iz dovoljenega nabora §32", () => {
    for (const s of productionStatuses()) {
      expect(USER_FACING_STATUSES).toContain(s.status);
    }
  });

  test("neznan slug → undefined (fail-closed, nikoli izmišljen)", () => {
    expect(providerProductionStatus("neobstojec-provider")).toBeUndefined();
  });
});

// ============================================================================
// §32 — LIVE ⟺ PRODUCTION_ACTIVE (nikoli brez dokazanih podatkov)
// ============================================================================

describe("T52 §32: LIVE samo za dejavno tekoče podatke", () => {
  test("LIVE točno za PRODUCTION_ACTIVE (osm, sto, kiwitaxi)", () => {
    const live = productionStatuses()
      .filter((s) => s.status === "LIVE")
      .map((s) => s.slug)
      .sort();
    expect(live).toEqual(["kiwitaxi", "osm", "sto"]);
  });

  test("invarianta: LIVE ⟹ stage === PRODUCTION_ACTIVE (vsak provider)", () => {
    for (const s of productionStatuses()) {
      if (s.status === "LIVE") {
        expect(s.stage).toBe("PRODUCTION_ACTIVE");
      }
    }
  });

  test("invarianta tudi ob VSAH env poverilnicah nastavljenih (lažni LIVE nemogoč)", () => {
    // Nastavi VSE affiliate ID-je in API ključe — affiliate povezava NI
    // inventar: statusi se NE smejo spremeniti v LIVE.
    process.env.VIATOR_API_KEY = "t52-probe";
    process.env.GETYOURGUIDE_API_TOKEN = "t52-probe";
    process.env.KIWITAXI_PAP_ID = "t52-probe";
    process.env.VIATOR_AFFILIATE_URL = "https://www.viator.com/Slovenia/d4526-ttd?pid=P1&mcid=1";
    process.env.BOOKING_AFFILIATE_ID = "t52-probe";
    process.env.TIQETS_AFFILIATE_URL = "https://tp.media/r?marker=1";
    for (const s of productionStatuses()) {
      if (s.status === "LIVE") {
        expect(s.stage).toBe("PRODUCTION_ACTIVE");
      }
    }
    // Affiliate-only viri ostanejo AFFILIATE_ONLY (sposobnost, ne konfiguracija)
    expect(statusOf("worldnomads")).toBe("AFFILIATE_ONLY");
    expect(statusOf("safetywing")).toBe("AFFILIATE_ONLY");
  });
});

// ============================================================================
// §32 — današnje DEJANSKO stanje instance (env vsebuje SAMO DATABASE_URL)
// ============================================================================

describe("T52 §32: današnje stanje (brez poverilnic)", () => {
  test("viator → NOT CONFIGURED (self-serve ključ manjka)", () => {
    expect(statusOf("viator")).toBe("NOT_CONFIGURED");
  });

  test("getyourguide → PARTNER ACCESS REQUIRED (žeton NI self-serve)", () => {
    expect(statusOf("getyourguide")).toBe("PARTNER_ACCESS_REQUIRED");
  });

  test("tiqets/booking/omio/skyscanner/airalo → PARTNER ACCESS REQUIRED", () => {
    for (const slug of ["tiqets", "booking", "omio", "skyscanner", "airalo"]) {
      expect(statusOf(slug)).toBe("PARTNER_ACCESS_REQUIRED");
    }
  });

  test("discovercars → PARTNER ACCESS REQUIRED (B4B pogodba)", () => {
    expect(statusOf("discovercars")).toBe("PARTNER_ACCESS_REQUIRED");
  });

  test("worldnomads/safetywing → AFFILIATE ONLY (brez inventarskega API-ja)", () => {
    expect(statusOf("worldnomads")).toBe("AFFILIATE_ONLY");
    expect(statusOf("safetywing")).toBe("AFFILIATE_ONLY");
  });

  test("fsq/travelpayouts/own → NOT CONFIGURED (dataset/plast/račun manjka)", () => {
    for (const slug of ["fsq", "travelpayouts", "own"]) {
      expect(statusOf(slug)).toBe("NOT_CONFIGURED");
    }
  });

  test("monetizacija: lokalni/lastni viri NOT_APPLICABLE, ostali NOT_CONFIGURED", () => {
    const bySlug = new Map(productionStatuses().map((s) => [s.slug, s]));
    expect(bySlug.get("osm")?.monetization).toBe("NOT_APPLICABLE");
    expect(bySlug.get("sto")?.monetization).toBe("NOT_APPLICABLE");
    expect(bySlug.get("own")?.monetization).toBe("NOT_APPLICABLE");
    expect(bySlug.get("kiwitaxi")?.monetization).toBe("NOT_CONFIGURED");
    expect(bySlug.get("viator")?.monetization).toBe("NOT_CONFIGURED");
    expect(bySlug.get("booking")?.monetization).toBe("NOT_CONFIGURED");
  });
});

// ============================================================================
// §32 + §26 — CONFIGURED zahteva API poverilnico (affiliate ID ne zadostuje)
// ============================================================================

describe("T52 §32/§26: CONFIGURED samo ob API ključu", () => {
  test("viator z VIATOR_API_KEY → CONFIGURED (ključ prisoten, živa preverba še sledi)", () => {
    process.env.VIATOR_API_KEY = "t52-self-serve-kljuc";
    expect(statusOf("viator")).toBe("CONFIGURED");
  });

  test("viator SAMO z affiliate URL ostane NOT CONFIGURED (povezava NI inventar)", () => {
    process.env.VIATOR_AFFILIATE_URL =
      "https://www.viator.com/Slovenia/d4526-ttd?pid=P1&mcid=1";
    expect(statusOf("viator")).toBe("NOT_CONFIGURED");
    // monetizacija se pa prizna (ločen prikaz)
    expect(providerProductionStatus("viator")?.monetization).toBe(
      "CONFIGURED"
    );
  });

  test("gyg z GETYOURGUIDE_API_TOKEN → CONFIGURED", () => {
    process.env.GETYOURGUIDE_API_TOKEN = "t52-zeton";
    expect(statusOf("getyourguide")).toBe("CONFIGURED");
  });

  test("gyg SAMO s partner ID (affiliate) ostane PARTNER ACCESS REQUIRED", () => {
    process.env.GETYOURGUIDE_PARTNER_ID = "1234567";
    expect(statusOf("getyourguide")).toBe("PARTNER_ACCESS_REQUIRED");
    expect(providerProductionStatus("getyourguide")?.monetization).toBe(
      "CONFIGURED"
    );
  });

  test("tiqets z affiliate URL ostane PARTNER ACCESS REQUIRED (Distributor API odobritev)", () => {
    process.env.TIQETS_AFFILIATE_URL = "https://tp.media/r?marker=1&p=8310";
    expect(statusOf("tiqets")).toBe("PARTNER_ACCESS_REQUIRED");
  });

  test("kiwitaxi z PAP ID ostane LIVE (podatki tečejo iz CSV, ne iz poverilnice)", () => {
    process.env.KIWITAXI_PAP_ID = "12345";
    expect(statusOf("kiwitaxi")).toBe("LIVE");
    expect(providerProductionStatus("kiwitaxi")?.monetization).toBe(
      "CONFIGURED"
    );
  });

  test("booking z affiliate ID ostane PARTNER ACCESS REQUIRED (Demand API pogodba)", () => {
    process.env.BOOKING_AFFILIATE_ID = "1234567";
    expect(statusOf("booking")).toBe("PARTNER_ACCESS_REQUIRED");
  });

  test("WN z affiliate URL ostane AFFILIATE ONLY + monetizacija CONFIGURED", () => {
    process.env.WORLDNOMADS_AFFILIATE_URL =
      "https://www.dpbolvw.net/c/12345678-12345678";
    expect(statusOf("worldnomads")).toBe("AFFILIATE_ONLY");
    expect(providerProductionStatus("worldnomads")?.monetization).toBe(
      "CONFIGURED"
    );
  });

  test("osm NIKOLI ne postane monetiziran vir (odprti podatki)", () => {
    const s = providerProductionStatus("osm");
    expect(s?.status).toBe("LIVE");
    expect(s?.monetization).toBe("NOT_APPLICABLE");
  });
});

// ============================================================================
// §6 — ENV LEAK: vrednosti ne zapustijo modula (SAMO Boolean)
// ============================================================================

describe("T52 §6/§32: leak test — env vrednosti ne zapustijo statusa", () => {
  test("JSON izpis vseh statusov NE vsebuje skrivnosti (vsi ključi nastavljeni)", () => {
    for (const k of MATRIX_ENV_KEYS) {
      process.env[k] = `SKRIVNOST-T52-status-${k}`;
    }
    const json = JSON.stringify(productionStatuses());
    for (const k of MATRIX_ENV_KEYS) {
      expect(json).not.toContain(`SKRIVNOST-T52-status-${k}`);
    }
    expect(json).not.toContain("SKRIVNOST-T52-status");
  });
});

// ============================================================================
// Čistost funkcij — enotna izpeljava iz matrike (drift nemogoč)
// ============================================================================

describe("T52 §32: izpeljava usklajena z matriko", () => {
  test("userFacingStatus(preslikava vseh vnosov) === productionStatuses", () => {
    for (const entry of productionMatrix()) {
      const env = providerEnvAccess(entry.slug);
      expect(userFacingStatus(entry, env)).toBe(statusOf(entry.slug));
    }
  });

  test("monetizationState brez affiliate envKeys → NOT_APPLICABLE", () => {
    expect(monetizationState({ affiliate: [], api: [], productionConfigured: false })).toBe(
      "NOT_APPLICABLE"
    );
  });
});
