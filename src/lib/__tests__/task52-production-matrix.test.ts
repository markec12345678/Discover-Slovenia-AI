// ============================================================================
// TASK 52 — FULL PROVIDER PRODUCTION ACTIVATION: matrika testov (§0–§19)
// ============================================================================
// Iskrenostne invariante MASTER matrike produkcijske aktivacije:
//  §0  življenjski cikel (11 stopenj, blokirni razlogi)
//  §2  popolna pokritost registra (§3: NOBEN provider ne manjka)
//  §4  vrsta dostopa NIKOLI pomešana (affiliate ≠ live inventory)
//  §6  env dostop SAMO PRESENT/MISSING (nikoli vrednosti — leak test)
//  §7–§11 kategorije aktivacije A–E + lokalna/lastna/infra
//  §12 OSM = odprti podatki, NIKOLI affiliate
//  §16 cene: FROM_PRICE se NIKOLI ne predstavi kot živi citat;
//      affiliate-only providerji NIMAOJO cen
//  §17 razpoložljivost: affiliate-only → NOT_SUPPORTED, nikoli „available"
//  §19 affiliate status usklajen z affiliate.ts (isti env, isti odgovor)
// ============================================================================

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  LIFECYCLE_STAGES,
  productionMatrix,
  getProductionMatrixEntry,
  productionSummary,
  providerEnvAccess,
  accessMatrix,
  reachedStages,
  type LifecycleStage,
} from "../supply/production-matrix";
import { PROVIDER_REGISTRY, getProvider } from "../supply/registry";
import { affiliateStatus, AFFILIATE_PROVIDERS } from "../affiliate";

// --- pomožniki --------------------------------------------------------------

const MATRIX_ENV_KEYS = [
  // affiliate ID-ji/URL-ji (11 — isti nabor kot affiliate.test.ts)
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
  // API ključi/žetoni/baze
  "VIATOR_API_KEY",
  "VIATOR_API_BASE",
  "GETYOURGUIDE_API_TOKEN",
  "GETYOURGUIDE_API_BASE",
  "FSQ_PLACES_DIR",
] as const;

function clearMatrixEnv() {
  for (const k of MATRIX_ENV_KEYS) delete process.env[k];
}

beforeEach(() => clearMatrixEnv());
afterEach(() => clearMatrixEnv());

// ============================================================================
// §2/§3 — POPOLNA POKRITNOST (noben obstoječi provider ni izpuščen)
// ============================================================================

describe("T52 §2/§3: master matrika pokriva CEL register", () => {
  test("število vrstic matrike === število vnosov registra", () => {
    expect(productionMatrix().length).toBe(PROVIDER_REGISTRY.length);
  });

  test("vsak slug registra ima TOČNO en vnos matrike (množici enaki)", () => {
    const registrySlugs = PROVIDER_REGISTRY.map((p) => p.slug).sort();
    const matrixSlugs = productionMatrix().map((m) => m.slug).sort();
    expect(matrixSlugs).toEqual(registrySlugs);
    // brez duplikatov
    expect(new Set(matrixSlugs).size).toBe(matrixSlugs.length);
  });

  test("zahtevani providerji naročnika so vsi prisotni (§3 seznam)", () => {
    const slugs = new Set(PROVIDER_REGISTRY.map((p) => p.slug));
    for (const required of [
      "osm",
      "kiwitaxi",
      "viator",
      "getyourguide",
      "booking",
      "discovercars",
      "skyscanner",
      "airalo",
      "omio",
      "tiqets",
      "worldnomads",
      "safetywing",
    ]) {
      expect(slugs.has(required as never)).toBe(true);
    }
  });

  test("getProductionMatrixEntry: poznan slug → vnos; neznan → undefined", () => {
    for (const p of PROVIDER_REGISTRY) {
      const e = getProductionMatrixEntry(p.slug);
      expect(e).toBeDefined();
      expect(e!.slug).toBe(p.slug);
    }
    expect(getProductionMatrixEntry("neznan-provider")).toBeUndefined();
  });
});

// ============================================================================
// §0 — ŽIVLJENJSKI CIKLUS (stopnje + blokirni razlogi)
// ============================================================================

describe("T52 §0: veriga življenjskega cikla", () => {
  test("11 stopenj, urejenih po naročnikovi verigi, brez ponovitev", () => {
    expect(LIFECYCLE_STAGES.length).toBe(11);
    expect(LIFECYCLE_STAGES[0]).toBe("DISCOVERED");
    expect(LIFECYCLE_STAGES.at(-1)).toBe("PRODUCTION_ACTIVE");
    expect(new Set(LIFECYCLE_STAGES).size).toBe(11);
  });

  test("reachedStages je monotona predpona verige", () => {
    expect(reachedStages("DISCOVERED")).toEqual(["DISCOVERED"]);
    expect(reachedStages("PRODUCTION_ACTIVE")).toEqual([...LIFECYCLE_STAGES]);
    const mid = reachedStages("CODE_READY" as LifecycleStage);
    expect(mid.length).toBe(4);
    expect(mid.at(-1)).toBe("CODE_READY");
  });

  test("invarianta: PRODUCTION_ACTIVE ⟺ NI blokirnega razloga", () => {
    for (const m of productionMatrix()) {
      if (m.stage === "PRODUCTION_ACTIVE") {
        expect(m.blockedReason).toBeUndefined();
      } else {
        expect(m.blockedReason).toBeDefined();
      }
    }
  });

  test("PRODUCTION ACTIVE (današnje stanje): osm, sto, kiwitaxi — NIKOLI affiliate-only", () => {
    const summary = productionSummary();
    const activeSet = [...summary.productionActive].sort().join(",");
    expect(activeSet).toBe(["kiwitaxi", "osm", "sto"].sort().join(","));
    for (const m of productionMatrix()) {
      if (m.stage === "PRODUCTION_ACTIVE") {
        // odprti podatki ali objavljeni statični vir — NIKOLI affiliate-only
        expect(m.accessKind === "AFFILIATE_DEEP_LINK").toBe(false);
      }
    }
  });

  test("productionSummary: vsota stopenj === total; blokirni razlogi se seštejejo", () => {
    const s = productionSummary();
    expect(s.total).toBe(PROVIDER_REGISTRY.length);
    const stageSum = Object.values(s.byStage).reduce((a, b) => a! + b!, 0);
    expect(stageSum).toBe(s.total);
    const blockedSum = Object.values(s.byBlockReason).reduce(
      (a, b) => a! + b!,
      0
    );
    // vsi NE-active imajo razlog → vsota razlogov === total − active
    expect(blockedSum).toBe(s.total - s.productionActive.length);
  });
});

// ============================================================================
// §4 — VRSTA DOSTOPA (affiliate NIKOLI live inventory)
// ============================================================================

describe("T52 §4: klasifikacija vrste dostopa", () => {
  test("AFFILIATE_DEEP_LINK providerji NIKOLI trdijo žive cene/razpoložljivosti", () => {
    for (const m of productionMatrix()) {
      if (m.accessKind === "AFFILIATE_DEEP_LINK") {
        expect(m.price).not.toBe("LIVE_PRICE");
        expect(m.availability).not.toBe("LIVE");
      }
    }
  });

  test("DANES nihče nima LIVE_PRICE niti LIVE razpoložljivosti (iskreno)", () => {
    for (const m of productionMatrix()) {
      expect(m.price).not.toBe("LIVE_PRICE");
      expect(m.availability).not.toBe("LIVE");
    }
  });

  test("osm: OPEN_DATA + info_only (§12 — nikoli affiliate)", () => {
    const osm = getProductionMatrixEntry("osm")!;
    expect(osm.accessKind).toBe("OPEN_DATA");
    expect(osm.cta).toBe("info_only");
    expect(osm.category).toBe("LOCAL_OPEN_DATA");
    const reg = getProvider("osm")!;
    expect(reg.group).toBe("local");
    expect(reg.goRoute).toBeUndefined();
    expect(reg.capabilities.affiliate).toBe(false);
  });

  test("kiwitaxi: STATIC_CONTENT (objavljeni CSV) — ne „live inventory“", () => {
    const kt = getProductionMatrixEntry("kiwitaxi")!;
    expect(kt.accessKind).toBe("STATIC_CONTENT");
    expect(kt.stage).toBe("PRODUCTION_ACTIVE");
    expect(kt.price).toBe("FROM_PRICE");
    expect(kt.availability).toBe("NOT_SUPPORTED");
  });

  test("vsak vnos ima veljavno vrsto dostopa in kategorijo", () => {
    const accessKinds = [
      "LIVE_INVENTORY_API",
      "SEARCH_API",
      "STATIC_CONTENT",
      "PARTNER_FEED",
      "AFFILIATE_DEEP_LINK",
      "API_BOOKING",
      "DIRECT_BOOKING",
      "OPEN_DATA",
    ];
    const categories = [
      "LOCAL_OPEN_DATA",
      "A_ACTIVITIES",
      "B_ACCOMMODATION",
      "C_TRANSPORT",
      "D_FLIGHTS",
      "E_INSURANCE_CONNECTIVITY",
      "OWN_MARKETPLACE",
      "INFRASTRUCTURE",
    ];
    for (const m of productionMatrix()) {
      expect(accessKinds).toContain(m.accessKind);
      expect(categories).toContain(m.category);
    }
  });
});

// ============================================================================
// §7–§11 — KATEGORIJE AKTIVACIJE
// ============================================================================

describe("T52 §7–§11: prioritetne kategorije", () => {
  test("A — activities: viator, getyourguide, tiqets", () => {
    for (const slug of ["viator", "getyourguide", "tiqets"]) {
      expect(getProductionMatrixEntry(slug)!.category).toBe("A_ACTIVITIES");
    }
  });
  test("B — accommodation: booking", () => {
    expect(getProductionMatrixEntry("booking")!.category).toBe(
      "B_ACCOMMODATION"
    );
  });
  test("C — transport: kiwitaxi, discovercars, omio", () => {
    for (const slug of ["kiwitaxi", "discovercars", "omio"]) {
      expect(getProductionMatrixEntry(slug)!.category).toBe("C_TRANSPORT");
    }
  });
  test("D — flights: skyscanner", () => {
    expect(getProductionMatrixEntry("skyscanner")!.category).toBe("D_FLIGHTS");
  });
  test("E — insurance/connectivity: airalo, worldnomads, safetywing", () => {
    for (const slug of ["airalo", "worldnomads", "safetywing"]) {
      expect(getProductionMatrixEntry(slug)!.category).toBe(
        "E_INSURANCE_CONNECTIVITY"
      );
    }
  });
});

// ============================================================================
// §16/§17 — CENE IN RAZPOLOŽLJIVOST (klasifikacija po dostopu)
// ============================================================================

describe("T52 §16/§17: klasifikacija cen in razpoložljivosti", () => {
  test("adapter-PRIPLOPLJENI viri (osm/kiwitaxi/viator/gyg) imajo usklajene\n     klasifikacije z registry capabilities", () => {
    for (const m of productionMatrix()) {
      const reg = getProvider(m.slug)!;
      if (reg.active) {
        // priklopljen adapter: klasifikacija matrike sledi capabilities
        if (!reg.capabilities.price) expect(m.price).toBe("NOT_SUPPORTED");
        if (!reg.capabilities.availability) {
          // adapter NE vrača razpoložljivosti: NOT_SUPPORTED (vir koncepta
          // nima — OSM/CSV) ALI UNKNOWN (vir koncept IMA, a je nad našim
          // tierjem — npr. Viator Basic Access; types.ts semantika)
          expect(["NOT_SUPPORTED", "UNKNOWN"]).toContain(m.availability);
        }
      } else {
        // NEPRIKLOPLJEN adapter danes ne dostavlja cen iz ZUNANJIH virov →
        // NOT_SUPPORTED/UNKNOWN (izjema own: lastne cene lastne tržnice so
        // REALNE — FROM_PRICE; izjema travelpayouts: UNKNOWN, vir bo vračal)
        if (m.slug !== "own") {
          expect(["NOT_SUPPORTED", "UNKNOWN"]).toContain(m.price);
        } else {
          expect(m.price).toBe("FROM_PRICE");
        }
        expect(["NOT_SUPPORTED", "UNKNOWN"]).toContain(m.availability);
      }
    }
  });

  test("affiliate-only providerji (brez adapterja) NIMAOJO cen (§8/§10: povezava NI inventar)", () => {
    for (const slug of [
      "booking",
      "tiqets",
      "discovercars",
      "skyscanner",
      "omio",
      "airalo",
      "worldnomads",
      "safetywing",
    ]) {
      const m = getProductionMatrixEntry(slug)!;
      expect(m.price).toBe("NOT_SUPPORTED");
      expect(m.availability).toBe("NOT_SUPPORTED");
      expect(m.cta).toBe("affiliate_redirect");
      expect(m.aiIntegrated).toBe(false);
    }
  });

  test("viator/gyg: fromPrice cena (NIKOLI živi citat) + UNKNOWN razpoložljivost", () => {
    for (const slug of ["viator", "getyourguide"]) {
      const m = getProductionMatrixEntry(slug)!;
      expect(m.price).toBe("FROM_PRICE");
      expect(m.availability).toBe("UNKNOWN");
      // adapter je CODE READY a pošteno čaka na ključ
      expect(m.stage).toBe("CODE_READY");
      expect(m.cta).toBe("affiliate_redirect");
    }
  });
});

// ============================================================================
// §6 — ENV DOSTOP (PRESENT/MISSING, fail-closed, BREZ skrivnosti)
// ============================================================================

describe("T52 §6: access matrix (env dostop)", () => {
  test("čist env: VSE affiliate/api preverbe MISSING, productionConfigured=false", () => {
    const am = accessMatrix();
    for (const [slug, acc] of Object.entries(am)) {
      if (slug === "osm" || slug === "sto") {
        // odprti viri brez env odvisnosti — aktivni brez ključev
        expect(acc.affiliate).toEqual([]);
        expect(acc.api).toEqual([]);
        expect(acc.productionConfigured).toBe(true);
        continue;
      }
      for (const c of [...acc.affiliate, ...acc.api]) {
        expect(c.present).toBe(false);
      }
      expect(acc.productionConfigured).toBe(false);
    }
  });

  test("viator: VIATOR_API_KEY nastavljen → PRESENT + productionConfigured", () => {
    process.env.VIATOR_API_KEY = "testni-kljuc-t52";
    const acc = providerEnvAccess("viator");
    const key = acc.api.find((c) => c.envVar === "VIATOR_API_KEY");
    expect(key?.present).toBe(true);
    expect(acc.productionConfigured).toBe(true);
    // _BASE SAMO (brez ključa) NE pomeni konfiguracijo:
    delete process.env.VIATOR_API_KEY;
    process.env.VIATOR_API_BASE = "https://api.sandbox.viator.com/partner";
    const acc2 = providerEnvAccess("viator");
    expect(acc2.api.find((c) => c.envVar === "VIATOR_API_BASE")?.present).toBe(
      true
    );
    expect(acc2.productionConfigured).toBe(false);
  });

  test("URL spremenljivke: http/smét → MISSING (veljaven https → PRESENT)", () => {
    process.env.WORLDNOMADS_AFFILIATE_URL = "http://neveljavno.example";
    expect(
      providerEnvAccess("worldnomads").affiliate[0]?.present
    ).toBe(false);
    process.env.WORLDNOMADS_AFFILIATE_URL = "https://www.dpbolvw.net/c/123";
    expect(providerEnvAccess("worldnomads").affiliate[0]?.present).toBe(true);
  });

  test("PRAZEN niz ID-ja (BOOKING_AFFILIATE_ID=\"\") → MISSING (fail-closed)", () => {
    process.env.BOOKING_AFFILIATE_ID = "   ";
    expect(providerEnvAccess("booking").affiliate[0]?.present).toBe(false);
    expect(providerEnvAccess("booking").productionConfigured).toBe(false);
  });

  test("kiwitaxi v čistem envu: inventar PRODUCTION_ACTIVE, monetizacija NE — ločeno", () => {
    const acc = providerEnvAccess("kiwitaxi");
    expect(acc.affiliate[0]?.envVar).toBe("KIWITAXI_PAP_ID");
    expect(acc.affiliate[0]?.present).toBe(false);
    expect(acc.productionConfigured).toBe(false); // PAP manjka
    // a matrika: inventar je v produkciji (CSV dataset)
    expect(getProductionMatrixEntry("kiwitaxi")!.stage).toBe(
      "PRODUCTION_ACTIVE"
    );
  });

  test("LEAK TEST: vrednosti env NIKOLI ne zapustijo modula (samo Boolean)", () => {
    const SKRIVNOST = "SKRIVNOST-T52-xyz-123456";
    for (const k of MATRIX_ENV_KEYS) process.env[k] = SKRIVNOST;
    const serialized = JSON.stringify({
      matrix: accessMatrix(),
      summary: productionSummary(),
    });
    expect(serialized.includes(SKRIVNOST)).toBe(false);
    // vsak check ima NATANČNO obliko {envVar, present:boolean}
    for (const acc of Object.values(accessMatrix())) {
      for (const c of [...acc.affiliate, ...acc.api]) {
        expect(Object.keys(c).sort()).toEqual(["envVar", "present"]);
        expect(typeof c.present).toBe("boolean");
      }
    }
  });
});

// ============================================================================
// §19 — USKLAJENOST z affiliate.ts (isti env → isti odgovor) + drift guard
// ============================================================================

describe("T52 §19: affiliateStatus ↔ accessMatrix (en vir resnice)", () => {
  test("vseh 11 go-rut: configured status se ujema z env dostopom matrike", () => {
    const st = affiliateStatus();
    const am = accessMatrix();
    const expected: Record<string, boolean> = {
      hotels: am.booking.affiliate.some((c) => c.present),
      cars: am.discovercars.affiliate.some((c) => c.present),
      activities: am.getyourguide.affiliate.some((c) => c.present),
      flights: am.skyscanner.affiliate.some((c) => c.present),
      insurance:
        am.worldnomads.affiliate.some((c) => c.present) ||
        am.safetywing.affiliate.some((c) => c.present),
      esim: am.airalo.affiliate.some((c) => c.present),
      transfers: am.kiwitaxi.affiliate.some((c) => c.present),
      transport: am.omio.affiliate.some((c) => c.present),
      tickets: am.tiqets.affiliate.some((c) => c.present),
      viator: am.viator.affiliate.some((c) => c.present),
      getyourguide: am.getyourguide.affiliate.some((c) => c.present),
    };
    for (const route of AFFILIATE_PROVIDERS) {
      expect(st[route].configured).toBe(expected[route]);
    }
  });

  test("drift guard: vsako affiliate env ime iz affiliateStatus() obstaja v registry envKeys", () => {
    const st = affiliateStatus();
    const envNamesBySlug = new Map<string, Set<string>>();
    for (const p of PROVIDER_REGISTRY) {
      envNamesBySlug.set(
        p.slug,
        new Set([...(p.envKeys.affiliate ?? []), ...(p.envKeys.api ?? [])])
      );
    }
    const affiliateEnvToSlug: Record<string, string> = {
      BOOKING_AFFILIATE_ID: "booking",
      DISCOVERCARS_AFFILIATE_CODE: "discovercars",
      GETYOURGUIDE_PARTNER_ID: "getyourguide",
      SKYSCANNER_MEDIA_PARTNER_ID: "skyscanner",
      WORLDNOMADS_AFFILIATE_URL: "worldnomads",
      SAFETYWING_AMBASSADOR_ID: "safetywing",
      AIRALO_AFFILIATE_URL: "airalo",
      KIWITAXI_PAP_ID: "kiwitaxi",
      OMIO_AFFILIATE_URL: "omio",
      TIQETS_AFFILIATE_URL: "tiqets",
      VIATOR_AFFILIATE_URL: "viator",
    };
    for (const route of AFFILIATE_PROVIDERS) {
      for (const envName of st[route].envVar.split(" / ")) {
        const slug = affiliateEnvToSlug[envName];
        expect(slug).toBeDefined();
        expect(envNamesBySlug.get(slug)?.has(envName)).toBe(true);
      }
    }
  });
});

// ============================================================================
// §13/§14 — KANONSKI MODEL: matrika ne vnese provider-specifičnih polj
// ============================================================================

describe("T52 §13: matrika ostaja provider-agnostic (brez viatorPrice/…)", () => {
  test("vnosi matrike vsebujejo SAMO kanonska polja (ni provider-polj)", () => {
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

  test("registry capabilities ↔ matrika: affiliate=true le pri komercialnih z goRoute", () => {
    for (const reg of PROVIDER_REGISTRY) {
      const m = getProductionMatrixEntry(reg.slug)!;
      if (reg.capabilities.affiliate) {
        expect(m.cta).toBe("affiliate_redirect");
        if (reg.inventoryAccess.includes("affiliate_deep_link")) {
          // dejansko obstoječa partner povezava (/go) — komercialna skupina
          expect(reg.goRoute).toBeDefined();
          expect(reg.group).toBe("commercial");
        } else {
          // affiliate ZMOŽNOST brez povezave (travelpayouts, planned) —
          // NIKOLI prikazan kot obstoječ partner: ostaja na DISCOVERED
          expect(m.stage).toBe("DISCOVERED");
          expect(m.blockedReason).toBe("NOT_CONFIGURED");
        }
      } else if (reg.slug !== "own") {
        // lastna tržnica ima own_checkout; ostali brez affiliate → info_only
        expect(m.cta).toBe("info_only");
      }
    }
  });
});
