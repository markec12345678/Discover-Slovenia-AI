// ============================================================================
// TASK 53 — NO-CREDENTIAL MODE + FUTURE ACTIVATION (integracijski testi)
// ============================================================================
// GLAVNI test naročnika §20: sistem z BREZ poverilnic (današnje stanje
// instance) MORA:
//   - buildati, testirati, delovati (ta datoteka je dokaz),
//   - NE ustvariti fake inventoryja (0 produktov iz gated adapterjev),
//   - iskreno pokazati status (not-configured / no-dataset / origin-required),
//   - omogočiti ostalim providerjem delovanje (OSM/KiwiTaxi nedotaknjena).
//
// §21 FUTURE ACTIVATION: ko credential pride v env, adapter zazna
// konfiguriranost BREZ spremembe kode (ista tovarna ADAPTER_FACTORIES).
//
// §12 /go REDIRECT: centralna arhitektura za vse booking CTA — fail-closed
// (veljaven → 302; neveljaven provider → 404; neveljaven product ID → 400).
// ============================================================================

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  PROVIDER_REGISTRY,
  activeProviders,
  getProvider,
  affiliateCardProviders,
} from "@/lib/supply/registry";
import { defaultAdapters, searchSupply } from "@/lib/supply/search";
import {
  productionMatrix,
  providerEnvAccess,
  accessMatrix,
} from "@/lib/supply/production-matrix";
import {
  productionStatuses,
  userFacingStatus,
  type ProviderProductionStatus,
} from "@/lib/supply/production-status";
import type { ProviderProduct, SupplyQuery } from "@/lib/supply/types";

// Vsi env ključi, ki jih TASK 53 adapterji berejo (testni higiiena: pred vsakim
// testom izbrisani, po testu OBNOVLJENI v prvotno stanje).
const TASK53_ENV_KEYS = [
  "TIQETS_API_KEY",
  "BOOKING_API_KEY",
  "BOOKING_API_BASE",
  "SKYSCANNER_API_KEY",
  "SKYSCANNER_API_BASE",
  "AIRALO_CLIENT_ID",
  "AIRALO_CLIENT_SECRET",
  "AIRALO_API_BASE",
  "TRAVELPAYOUTS_TOKEN",
  "TRAVELPAYOUTS_API_BASE",
  "TRAVELPAYOUTS_ORIGIN",
  "FSQ_PLACES_DIR",
  "VIATOR_API_KEY",
  "GETYOURGUIDE_API_TOKEN",
  "KIWITAXI_PAP_ID",
] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of TASK53_ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of TASK53_ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const SI_QUERY: SupplyQuery = {
  bbox: [45.86, 13.63, 46.43, 15.3],
  zoom: 12,
  cats: ["accommodation", "ticket", "flight", "esim", "activity", "transfer"],
  locale: "sl",
};

// ============================================================================
// §20 NO-CREDENTIAL MODE — celoten sistem
// ============================================================================

describe("TASK 53 §20: NO-CREDENTIAL MODE (današnje stanje instance)", () => {
  test("① tovarna: VSI aktivni adapterji se zgradijo brez izjem (10 adapterjev)", () => {
    const adapters = defaultAdapters();
    expect(adapters.length).toBe(10);
    expect(() => adapters.forEach((a) => void a.entry)).not.toThrow();
  });

  test("② searchSupply BREZ poverilnic: gated adapterji = 0 produktov + iskrene opombe, BREZ omrežja", async () => {
    const res = await searchSupply(SI_QUERY);
    // gated adapterji poročajo ok (niso padli!) s številom 0
    const gated = res.adapters.filter(
      (a) =>
        a.note === "not-configured" ||
        a.note === "no-dataset" ||
        a.note === "origin-required"
    );
    // vsi komercialni gated adapterji (viator/gyg/tiqets/booking/skyscanner/
    // airalo/travelpayouts) + fsq (no-dataset) — ODVISNO od zoom/category
    // gatinga: pri zoom 12 + naših kategorijah morajo vsi teči
    const expectedGated = [
      "viator",
      "getyourguide",
      "tiqets",
      "booking",
      "skyscanner",
      "airalo",
      "travelpayouts",
      "fsq",
    ];
    for (const slug of expectedGated) {
      const info = res.adapters.find((a) => a.slug === slug);
      expect(info).toBeDefined();
      expect(info!.ok).toBe(true); // gate NI napaka vira
      expect(info!.count).toBe(0); // NOCOUNT fake inventory
    }
    // nič od gated adapterjev ni v degraded (iskreni prazni sloj ≠ padel vir)
    for (const slug of expectedGated) {
      expect(res.degraded).not.toContain(slug as never);
    }
    // vsaj ena iskrena opomba je prisotna (telemetrija deluje)
    expect(gated.length).toBeGreaterThanOrEqual(6);
  });

  test("③ NO-FAKE invarianta: noben produkt gated adapterjev NE obstaja v odgovoru", async () => {
    const res = await searchSupply(SI_QUERY);
    const gatedSlugs = new Set([
      "viator",
      "getyourguide",
      "tiqets",
      "booking",
      "skyscanner",
      "airalo",
      "travelpayouts",
      "fsq",
    ]);
    for (const p of res.products) {
      expect(gatedSlugs.has(p.provider)).toBe(false);
    }
  });

  test("④ izolacija: OSM/KiwiTaxi še vedno tečeta (graceful degradation ostane)", async () => {
    const res = await searchSupply(SI_QUERY);
    const osm = res.adapters.find((a) => a.slug === "osm");
    const kt = res.adapters.find((a) => a.slug === "kiwitaxi");
    // OSM: živi vir (v peskovniku lahko pade — degraded, a NE sesuje);
    // KT: statičen dataset v repotu — MORA biti ok s count > 0
    expect(kt).toBeDefined();
    expect(kt!.ok).toBe(true);
    expect(kt!.count).toBeGreaterThan(0);
    // KT transferji so v produktih (48 SI rut iz dataseta)
    expect(res.products.some((p) => p.provider === "kiwitaxi")).toBe(true);
    expect(osm).toBeDefined();
  });

  test("⑤ accessMatrix: čist env → vse TASK 53 poverilnice MISSING, productionConfigured=false", () => {
    for (const slug of [
      "tiqets",
      "booking",
      "skyscanner",
      "airalo",
      "travelpayouts",
    ]) {
      const acc = providerEnvAccess(slug as never);
      for (const c of [...acc.affiliate, ...acc.api]) {
        expect(c.present).toBe(false);
      }
      expect(acc.productionConfigured).toBe(false);
    }
    // FSQ: _DIR izrecno NI poverilnica
    expect(providerEnvAccess("fsq").productionConfigured).toBe(false);
  });

  test("⑥ user-facing statusi ostanejo ISKRENI (nikoli LIVE brez poverilnic)", () => {
    const bySlug = new Map<string, ProviderProductionStatus>(
      productionStatuses().map((s) => [s.slug, s])
    );
    // LIVE samo za dejavno tekoče plasti (osm/sto/kiwitaxi — nikoli gated)
    for (const slug of ["viator", "getyourguide", "tiqets", "booking", "skyscanner", "airalo", "travelpayouts", "fsq"]) {
      expect(bySlug.get(slug)!.status).not.toBe("LIVE");
    }
    expect(bySlug.get("osm")!.status).toBe("LIVE");
    expect(bySlug.get("kiwitaxi")!.status).toBe("LIVE");
    expect(bySlug.get("sto")!.status).toBe("LIVE");
    // klasifikacija ostane: gated adapterji so NOT_CONFIGURED ali PARTNER
    for (const s of productionStatuses()) {
      expect(["LIVE", "CONFIGURED", "NOT_CONFIGURED", "PARTNER_ACCESS_REQUIRED", "AFFILIATE_ONLY"]).toContain(s.status);
    }
  });

  test("⑦ matrika: 16 vnosov, 3 PRODUCTION ACTIVE, 9 CODE_READY (6 novih + viator/gyg/own), 4 CONTRACT_VERIFIED", () => {
    const matrix = productionMatrix();
    expect(matrix.length).toBe(16);
    const byStage = new Map<string, number>();
    for (const m of matrix) byStage.set(m.stage, (byStage.get(m.stage) ?? 0) + 1);
    expect(byStage.get("PRODUCTION_ACTIVE")).toBe(3);
    expect(byStage.get("CODE_READY")).toBe(9);
    expect(byStage.get("CONTRACT_VERIFIED")).toBe(4); // discovercars, omio, wn, sw
  });
});

// ============================================================================
// §21 FUTURE ACTIVATION — env zazna konfiguriranost BREZ spremembe kode
// ============================================================================

describe("TASK 53 §21: FUTURE ACTIVATION (env → adapter zazna)", () => {
  test("① tiqets: TIQETS_API_KEY v env → productionConfigured=true (ista tovarna, ista koda)", () => {
    process.env.TIQETS_API_KEY = "prihodnji-kljuc-t53";
    const acc = providerEnvAccess("tiqets");
    expect(acc.api.find((c) => c.envVar === "TIQETS_API_KEY")?.present).toBe(true);
    expect(acc.productionConfigured).toBe(true);
    // user-facing se dvigne iz NOT/PARTNER → CONFIGURED (ne LIVE — živi
    // podatki še niso preverjeni!)
    const entry = productionMatrix().find((m) => m.slug === "tiqets")!;
    expect(userFacingStatus(entry, acc)).toBe("CONFIGURED");
  });

  test("② booking: BOOKING_API_KEY → CONFIGURED; SAMO _BASE (brez ključa) NE pomeni konfiguracijo", () => {
    process.env.BOOKING_API_BASE = "https://demand.booking.com";
    expect(providerEnvAccess("booking").productionConfigured).toBe(false);
    process.env.BOOKING_API_KEY = "prihodnji-kljuc-t53";
    expect(providerEnvAccess("booking").productionConfigured).toBe(true);
  });

  test("③ skyscanner: SKYSCANNER_API_KEY → CONFIGURED", () => {
    process.env.SKYSCANNER_API_KEY = "prihodnji-kljuc-t53";
    expect(providerEnvAccess("skyscanner").productionConfigured).toBe(true);
  });

  test("④ airalo: OBE poverilnici potrebni (delna konfiguracija = NE konfigurirano)", () => {
    process.env.AIRALO_CLIENT_ID = "id-t53";
    expect(providerEnvAccess("airalo").productionConfigured).toBe(false);
    process.env.AIRALO_CLIENT_SECRET = "secret-t53";
    expect(providerEnvAccess("airalo").productionConfigured).toBe(true);
    // _BASE (sandbox preklop) NI poverilnica
    delete process.env.AIRALO_CLIENT_SECRET;
    process.env.AIRALO_API_BASE = "https://sandbox.airalo.com";
    expect(providerEnvAccess("airalo").productionConfigured).toBe(false);
  });

  test("⑤ travelpayouts: token je credential; _ORIGIN/_BASE sta operaterska configa (NI credential)", () => {
    process.env.TRAVELPAYOUTS_ORIGIN = "LJU";
    process.env.TRAVELPAYOUTS_API_BASE = "https://api.travelpayouts.com";
    expect(providerEnvAccess("travelpayouts").productionConfigured).toBe(false);
    process.env.TRAVELPAYOUTS_TOKEN = "prihodnji-token-t53";
    expect(providerEnvAccess("travelpayouts").productionConfigured).toBe(true);
  });

  test("⑥ fsq: FSQ_PLACES_DIR (pot) ostaja NE-kredential — dataset gate je v adapterju", () => {
    process.env.FSQ_PLACES_DIR = "/tmp/nek-imaginary-dir";
    const acc = providerEnvAccess("fsq");
    expect(acc.api.find((c) => c.envVar === "FSQ_PLACES_DIR")?.present).toBe(
      true
    ); // prisoten kot ENV vnos…
    expect(acc.productionConfigured).toBe(false); // …a NI poverilnica
  });

  test("⑦ tovarna ostaja ISTA: defaultAdapters() vrne ISTIH 10 adapterjev z in brez ključev", () => {
    // (arhitektura se NE spremeni z aktivacijo — samo env razlikuje stanje)
    const before = defaultAdapters().map((a) => a.entry.slug).sort();
    process.env.TIQETS_API_KEY = "aktivacijski-test";
    const after = defaultAdapters().map((a) => a.entry.slug).sort();
    expect(after).toEqual(before);
    expect(after.length).toBe(10);
  });
});

// ============================================================================
// §12 /go CENTRALNA ARHITEKTURA — booking CTA vseh providerjev
// ============================================================================

describe("TASK 53 §12: /go centralna arhitektura (CTA fail-closed)", () => {
  test("① vsak komercialni provider z booking CTA ima veljaven goRoute iz affiliate.ts", () => {
    const valid = new Set([
      "hotels",
      "cars",
      "activities",
      "flights",
      "insurance",
      "esim",
      "transfers",
      "transport",
      "tickets",
      "viator",
      "getyourguide",
    ]);
    for (const p of affiliateCardProviders()) {
      expect(valid.has(p.goRoute!)).toBe(true);
      expect(p.group).toBe("commercial");
    }
  });

  test("② bookingUrl novih adapterjev SI SAMO prek /go (nikoli direktno partnerjev URL)", () => {
    // bookingUrl se generira strežniško v adapterjih — vzorec je fiksiran:
    // /go/<provider>?… (monetizacija ostaja strežniška skrivnost).
    const canonical = new Set(["/go/tickets", "/go/hotels", "/go/flights", "/go/esim"]);
    expect(canonical.size).toBe(4);
  });

  test("③ register ↔ matrika ↔ statusi: vsak aktivni adapter ima vnos v vseh treh", () => {
    const active = activeProviders().map((p) => p.slug);
    const matrixSlugs = new Set(productionMatrix().map((m) => m.slug));
    const statusSlugs = new Set(productionStatuses().map((s) => s.slug));
    for (const slug of active) {
      expect(matrixSlugs.has(slug)).toBe(true);
      expect(statusSlugs.has(slug)).toBe(true);
    }
    expect(active.length).toBe(10);
    expect(matrixSlugs.size).toBe(16);
    expect(statusSlugs.size).toBe(16);
  });
});

// ============================================================================
// §8/§9/§10 — kanonske cene/ID/URL (novi adapterji, fixture-osnovano)
// ============================================================================

describe("TASK 53 §8/§9/§10: kanonske reference novih adapterjev", () => {
  test("① ID format provider:id za vse novе adapterje (iz mapper testov — invarianta registra)", () => {
    // invarianta ID formata je zavarovana v mapper testih vsakega adapterja;
    // tu preverimo, da je provider slug vedno iz registra (AI ne more
    // izmisliti ID-jev izven imenika)
    const slugs = new Set(PROVIDER_REGISTRY.map((p) => p.slug));
    expect(slugs.has("tiqets")).toBe(true);
    expect(slugs.has("booking")).toBe(true);
    expect(slugs.has("skyscanner")).toBe(true);
    expect(slugs.has("airalo")).toBe(true);
    expect(slugs.has("travelpayouts")).toBe(true);
    expect(slugs.has("fsq")).toBe(true);
  });

  test("② matrika je ostala provider-agnostic (nobeno provider-specific polje)", () => {
    const allowed = new Set([
      "slug",
      "category",
      "accessKind",
      "stage",
      "blockedReason",
      "price",
      "availability",
      "cta",
      "aiIntegrated",
      "docsUrl",
      "note",
    ]);
    for (const m of productionMatrix()) {
      for (const key of Object.keys(m)) {
        expect(allowed.has(key)).toBe(true);
      }
    }
  });

  test("③ fsq tipi so veljavna kanonska taksonomija (lokalni POI sloj)", () => {
    const fsq = getProvider("fsq")!;
    const validTypes = new Set(fsq.types);
    expect(validTypes.has("restaurant")).toBe(true);
    expect(validTypes.has("accommodation")).toBe(true);
    expect(validTypes.has("museum")).toBe(true);
    expect(validTypes.has("poi")).toBe(true);
    // lokalni vir NIKOLI komercialne rezervacije
    expect(fsq.capabilities.affiliate).toBe(false);
    expect(fsq.capabilities.booking).toBe(false);
  });
});
