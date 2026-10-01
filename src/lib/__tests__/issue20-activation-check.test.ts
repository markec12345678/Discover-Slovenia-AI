// ============================================================================
// ISSUE #20 §11 — ACTIVATION CHECK: testi iskrenosti (1.157.0)
// ============================================================================
// Zaklepi (vsak samostojen, vsi skupaj preprečujejo "lepo lažno" poročilo):
//
//  §A POPOLNOST — poročilo vsebuje TOČNO vse vnose registra (nobenega
//     manjkajočega, nobenega zunajregistra; duplicate nemogoči po slug).
//  §B MEHANSKA PRESLIKAVA — stanje vsake vrstice je IZPELJANO iz matrike
//     po pravilih iz activationStateOf (ist-input-ist-output preverjen
//     neodvisno od izvedbe — direkti ponovni izračun iz productionMatrix).
//  §C AKTIVNI SKLOP — ACTIVE ⇔ productionSummary().productionActive
//     (natančno osm/fsq/sto/kiwitaxi; nihče drug ne more biti ACTIVE).
//  §D KANARČEK — vrednost prisotne env spremenljivke NIKOLI ne zapusti
//     poročila (tabela + JSON). PRESENT/MISSING Boolean edini dovoljeni
//     izpis (envAccessCheck preverja vrednosti le po imenu).
//  §E KLJUČNE INVARIANTE — own je CONFIGURED (nikdi ACTIVE brez dokaza),
//     viator/travelpayouts NOT CONFIGURED, manual NIKOLI nad BLOCKED.
//  §F CLI OVOJ — scripts/activation-check.ts je TANAK (uvoz SAMO iz
//     knjižnice, --json podprt, brez lastne logike — source contract).
// ============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  activationStateOf,
  buildActivationReport,
  formatActivationTable,
  formatActivationJson,
  type ActivationState,
} from "@/lib/supply/activation-check";
import {
  productionMatrix,
  productionSummary,
  providerEnvAccess,
} from "@/lib/supply/production-matrix";
import { PROVIDER_REGISTRY } from "@/lib/supply/registry";
import type { ProviderSlug } from "@/lib/supply/types";

const ALL_STATES: ActivationState[] = [
  "ACTIVE",
  "CONFIGURED",
  "NOT CONFIGURED",
  "BLOCKED",
];

describe("ISSUE #20 §11: activation check — popolnost in preslikava", () => {
  test("§A poročilo pokrije TOČNO vse vnose registra (1:1 po slug)", () => {
    const { rows } = buildActivationReport();
    expect(rows.length).toBe(PROVIDER_REGISTRY.length);
    const registrySlugs = new Set<string>(PROVIDER_REGISTRY.map((p) => p.slug));
    const rowSlugs = new Set<string>(rows.map((r) => r.slug));
    expect(rowSlugs.size).toBe(rows.length); // brez duplikatov
    for (const slug of registrySlugs) expect(rowSlugs.has(slug)).toBe(true);
    for (const slug of rowSlugs) expect(registrySlugs.has(slug)).toBe(true);
  });

  test("§B vsako stanje je neodvisno izpeljano iz matrike (ist-input-ist-output)", () => {
    const { rows } = buildActivationReport();
    const matrix = productionMatrix();
    expect(rows.length).toBe(matrix.length);
    for (const row of rows) {
      const m = matrix.find((x) => x.slug === (row.slug as ProviderSlug));
      expect(m).toBeDefined();
      if (!m) continue;
      const stages = [
        "DISCOVERED",
        "CONTRACT_VERIFIED",
        "ACCESS_AVAILABLE",
        "CODE_READY",
        "PRODUCTION_CONFIGURED",
        "LIVE_DATA_VERIFIED",
        "PRICE_VERIFIED",
        "AVAILABILITY_STATUS_VERIFIED",
        "CTA_BOOKING_VERIFIED",
        "AI_INTEGRATION_VERIFIED",
        "PRODUCTION_ACTIVE",
      ];
      const idx = stages.indexOf(m.stage);
      const expected: ActivationState =
        m.stage === "PRODUCTION_ACTIVE"
          ? "ACTIVE"
          : idx >= stages.indexOf("PRODUCTION_CONFIGURED")
            ? "CONFIGURED"
            : m.blockedReason === "NOT_CONFIGURED"
              ? "NOT CONFIGURED"
              : "BLOCKED";
      expect(row.state).toBe(expected);
      expect(row.stage).toBe(m.stage);
      expect(ALL_STATES).toContain(row.state);
    }
  });

  test("§C ACTIVE množica ≡ productionSummary().productionActive (osm/fsq/sto/kiwitaxi)", () => {
    const { rows } = buildActivationReport();
    const active = rows.filter((r) => r.state === "ACTIVE").map((r) => r.slug);
    const summaryActive = [...productionSummary().productionActive].sort();
    expect(active.sort()).toEqual(summaryActive);
    expect(summaryActive).toEqual(["fsq", "kiwitaxi", "osm", "sto"]);
  });

  test("§C2 LIVE podatki so potrjeni za ACTIVE providerje IN own (LIVE_DATA_VERIFIED, Issue #20 §3)", () => {
    const { rows } = buildActivationReport();
    for (const r of rows) {
      expect(r.liveDataVerified).toBe(r.state === "ACTIVE" || r.slug === "own");
    }
    const own = rows.find((r) => r.slug === "own");
    expect(own?.liveDataVerified).toBe(true); // 2 geo listinga, 2026-10-01
    expect(own?.state).toBe("CONFIGURED"); // še vedno NE ACTIVE (Stripe bloker)
  });

  test("§E ključne invariante: own CONFIGURED, viator/travelpayouts NOT CONFIGURED; psevdo-vir manual NI vrsta poročila", () => {
    const { rows } = buildActivationReport();
    const by = (slug: string) => rows.find((r) => r.slug === slug);
    expect(by("own")?.state).toBe("CONFIGURED"); // LIVE_DATA_VERIFIED stopnja (Issue #20 §3) — vmesna, ne ACTIVE
    expect(by("viator")?.state).toBe("NOT CONFIGURED");
    expect(by("travelpayouts")?.state).toBe("NOT CONFIGURED");
    // "manual" je psevdo-vir (DISCOVERED, ne-aktivni) ŽUNAJ registra —
    // poročilo pokriva SAMO registrirane providerje (testno varovano §A):
    expect(by("manual")).toBeUndefined();
    // partner-odobritev blokirani NIKOLI v NOT CONFIGURED (niso self-serve):
    for (const slug of ["getyourguide", "tiqets", "booking", "skyscanner", "airalo"]) {
      expect(by(slug)?.state).toBe("BLOCKED");
    }
  });
});

describe("ISSUE #20 §11: activation check — iskrenost izpisa (brez skrivnosti)", () => {
  test("§D kanarček: vrednost env spremenljivke NE zapusti tabele ne JSON izpisa", () => {
    const CANARY = "dsa-issue20-canary-SUPER-SECRET-value-8f3a";
    const slug = "viator";
    const reg = PROVIDER_REGISTRY.find((p) => p.slug === slug);
    expect(reg).toBeDefined();
    const apiKeys = reg?.envKeys.api ?? [];
    expect(apiKeys.length).toBeGreaterThan(0);
    const key = apiKeys[0]!;
    const before = process.env[key];
    process.env[key] = CANARY;
    try {
      const access = providerEnvAccess(slug);
      const apiCheck = access.api.find((c) => c.envVar === key);
      expect(apiCheck?.present).toBe(true); // kanarček dejansko prisoten
      const report = buildActivationReport();
      const table = formatActivationTable(report);
      const json = formatActivationJson(report);
      expect(table).not.toContain(CANARY);
      expect(json).not.toContain(CANARY);
      // ime spremenljivke + Boolean sta edina dovoljena izpisa:
      expect(table).toContain(`${key}:✓`);
      expect(json).toContain(`"${key}": true`);
    } finally {
      if (before === undefined) delete process.env[key];
      else process.env[key] = before;
    }
  });

  test("§D2 vsi env izpisi ustrezajo obliki IME:✓/✗ (regex — brez vrednosti)", () => {
    const { rows } = buildActivationReport();
    const token = /^([A-Z][A-Z0-9_]+):(✓|✗)$/;
    for (const r of rows) {
      for (const t of [...r.envAffiliate, ...r.envApi]) {
        expect(token.test(t)).toBe(true);
      }
    }
  });

  test("§D3 Boolean prisotnost se ujema z providerEnvAccess (ista resnica)", () => {
    const { rows } = buildActivationReport();
    for (const r of rows) {
      const access = providerEnvAccess(r.slug as never);
      expect(r.envConfigured).toBe(access.productionConfigured);
      expect(r.envAffiliate.length).toBe(access.affiliate.length);
      expect(r.envApi.length).toBe(access.api.length);
    }
  });
});

describe("ISSUE #20 §11: activation check — oblika izpisa in CLI ovoj", () => {
  test("tabela vsebuje glavo, vsa štiri stanja in povzetek", () => {
    const out = formatActivationTable(buildActivationReport());
    expect(out).toContain("PRODUCTION ACTIVATION CHECK");
    expect(out).toContain("ACTIVE");
    expect(out).toContain("CONFIGURED");
    expect(out).toContain("NOT CONFIGURED");
    expect(out).toContain("BLOCKED");
    expect(out).toContain("SKUPAJ");
  });

  test("JSON vsebuje povzetek in vse providerje (strojno berljiv)", () => {
    const out = formatActivationJson(buildActivationReport());
    const parsed = JSON.parse(out) as {
      summary: { total: number };
      providers: { slug: string; state: string }[];
    };
    expect(parsed.summary.total).toBe(PROVIDER_REGISTRY.length);
    expect(parsed.providers.length).toBe(PROVIDER_REGISTRY.length);
    const stateSet = new Set<string>(ALL_STATES);
    for (const p of parsed.providers) expect(stateSet.has(p.state)).toBe(true);
  });

  test("§F CLI ovoj je TANAK: uvozi SAMO iz knjižnice, podpira --json, brez lastne logike", () => {
    const src = readFileSync("scripts/activation-check.ts", "utf8");
    expect(src).toContain('from "../src/lib/supply/activation-check"');
    expect(src).toContain("--json");
    // brez lastnih preslikav/poizvedb v ovoju (logika živi v knjižnici):
    expect(src).not.toContain("productionMatrix()");
    expect(src).not.toContain("providerEnvAccess(");
    expect(src).not.toContain("process.env[");
  });

  test("§F2 package.json ponuja activation:check skripto", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["activation:check"]).toContain("scripts/activation-check.ts");
  });
});
