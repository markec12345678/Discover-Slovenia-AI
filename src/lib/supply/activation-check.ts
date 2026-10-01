// ============================================================================
// ISSUE #20 §11 — ENOTEN PRODUCTION ACTIVATION CHECK (1.157.0)
// ============================================================================
// Preverljiv izpis stanja VSEH supply providerjev v ŠTIRIH iskrenih stanjih:
//
//   ACTIVE         — PRODUCTION_ACTIVE v matriki (živo dokazano)
//   CONFIGURED     — PRODUCTION_CONFIGURED (sloj priklopljen, živi podatki
//                    še niso prispevali — npr. own: NO_LIVE_DATA)
//   NOT CONFIGURED — ključ/ID je self-serve dostopen, a NI v env
//                    (blockedReason NOT_CONFIGURED)
//   BLOCKED        — vse ostalo (potrebna zunanja odobritev/pogodba,
//                    vir nima te vrste dostopa, ali psevdo-vir)
//
// IZKLJUČNO IZPELJANO iz produkcijske matrike in registra (ena resnica —
// Issue #20 §2: agent matrike NE sme dvigovati; ta modul je mehanski
// prevod brez lastnih odločitev). ENV prisotnost je IZKLJUČNO Boolean
// (PRESENT/MISSING po providerEnvAccess) — vrednosti NIKOLI ne zapustijo
// te plasti (preverjeno s testom kanarčkom).
//
// Potrošniki: scripts/activation-check.ts (CLI: tabela / --json),
// testi (issue20-activation-check.test.ts), dokumentacija
// docs/PRODUCTION-ACTIVATION-STATUS.md.
// ============================================================================

import {
  LIFECYCLE_STAGES,
  productionMatrix,
  providerEnvAccess,
  reachedStages,
  type ProductionMatrixEntry,
} from "./production-matrix";
import { PROVIDER_REGISTRY } from "./registry";

/** Štiri iskrena stanja po Issue #20 §11 (izpis, ne odločitev). */
export type ActivationState = "ACTIVE" | "CONFIGURED" | "NOT CONFIGURED" | "BLOCKED";

/** Ena vrstica aktivacijskega poročila (brez skrivnosti — samo Boolean). */
export interface ActivationCheckRow {
  slug: string;
  /** Prikazno ime (register, SL). */
  label: string;
  /** Arhitekturna skupina (local / own / commercial). */
  group: string;
  state: ActivationState;
  /** Najvišja DOKAZANA stopnja življenjskega cikla (matrika). */
  stage: ProductionMatrixEntry["stage"];
  /** Ali je stopnja LIVE_DATA_VERIFIED dosežena (veriga §0). */
  liveDataVerified: boolean;
  /** Dejanska vrsta dostopa, ki jo IMAMO (§4 — nikoli "želi si"). */
  accessKind: ProductionMatrixEntry["accessKind"];
  /** CTA: affiliate_redirect / own_checkout / info_only. */
  cta: ProductionMatrixEntry["cta"];
  /** Klasifikacija cen (FROM_PRICE NIKOLI != živ citat). */
  price: ProductionMatrixEntry["price"];
  /** Klasifikacija razpoložljivosti. */
  availability: ProductionMatrixEntry["availability"];
  /** Affiliate env prisotnost — samo imena + Boolean (npr. "KIWITAXI_PAP_ID:✓"). */
  envAffiliate: string[];
  /** API env prisotnost — samo imena + Boolean. */
  envApi: string[];
  /** Združeni Boolean iz providerEnvAccess (productionConfigured). */
  envConfigured: boolean;
  /** Iskrena opomba matrike (administrativni kontekst). */
  note: string;
}

/** Povzetek poročila (števci po stanjih — za hitri pregled). */
export interface ActivationReportSummary {
  total: number;
  active: number;
  configured: number;
  notConfigured: number;
  blocked: number;
}

export interface ActivationReport {
  rows: ActivationCheckRow[];
  summary: ActivationReportSummary;
}

// ---------------------------------------------------------------------------
// MEHANSKI PREVOD matrika → štiri stanja (Issue #20 §11)
// ---------------------------------------------------------------------------

/**
 * Stanje enega providerja IZKLJUČNO iz matrike. Pravila (zaklenjena s
 * testi issue20-activation-check.test.ts — drift nemogoč):
 *  - PRODUCTION_ACTIVE                     → ACTIVE
 *  - stopnja ≥ PRODUCTION_CONFIGURED in
 *    < PRODUCTION_ACTIVE (PRODUCTION_CONFIGURED, LIVE_DATA_VERIFIED,
 *    PRICE_VERIFIED, AVAILABILITY_STATUS_VERIFIED, CTA_BOOKING_VERIFIED,
 *    AI_INTEGRATION_VERIFIED) → CONFIGURED (sloj teče; polna aktivacija
 *    še ni dokazana — npr. own: LIVE_DATA_VERIFIED od 1.157.0)
 *  - blockedReason NOT_CONFIGURED          → NOT CONFIGURED (self-serve)
 *  - vse ostalo (PARTNER_APPROVAL_REQUIRED,
 *    ACCESS_NOT_AVAILABLE, BLOCKED, NO_LIVE_DATA,
 *    NOT_APPLICABLE — tudi psevdo-vir "manual") → BLOCKED
 */
export function activationStateOf(
  entry: Pick<ProductionMatrixEntry, "stage" | "blockedReason">
): ActivationState {
  if (entry.stage === "PRODUCTION_ACTIVE") return "ACTIVE";
  // Vmesne priklopljene stopnje (PRODUCTION_CONFIGURED … AI_INTEGRATION_
  // VERIFIED): sloj DEJANSKO teče (morda že z živimi podatki), polna
  // aktivacija (booking/CTA verifikacija) pa še ni dokazana → CONFIGURED.
  const configuredFloor = LIFECYCLE_STAGES.indexOf("PRODUCTION_CONFIGURED");
  if (LIFECYCLE_STAGES.indexOf(entry.stage) >= configuredFloor) {
    return "CONFIGURED";
  }
  if (entry.blockedReason === "NOT_CONFIGURED") return "NOT CONFIGURED";
  return "BLOCKED";
}

/** ENV vrstica kot "IME:✓" / "IME:✗" (Boolean — vrednost NIKOLI ven). */
function envToken(check: { envVar: string; present: boolean }): string {
  return `${check.envVar}:${check.present ? "✓" : "✗"}`;
}

// ---------------------------------------------------------------------------
// POROČILO (izpeljano iz registra — popolna pokritost, testno varovano)
// ---------------------------------------------------------------------------

export function buildActivationReport(): ActivationReport {
  const rows: ActivationCheckRow[] = [];
  for (const reg of PROVIDER_REGISTRY) {
    const matrix = productionMatrix().find((m) => m.slug === reg.slug);
    if (!matrix) continue; // nemogoče (matrika je testno vezana na register)
    const env = providerEnvAccess(reg.slug);
    rows.push({
      slug: reg.slug,
      label: reg.labels.sl,
      group: reg.group,
      state: activationStateOf(matrix),
      stage: matrix.stage,
      liveDataVerified: reachedStages(matrix.stage).includes("LIVE_DATA_VERIFIED"),
      accessKind: matrix.accessKind,
      cta: matrix.cta,
      price: matrix.price,
      availability: matrix.availability,
      envAffiliate: env.affiliate.map(envToken),
      envApi: env.api.map(envToken),
      envConfigured: env.productionConfigured,
      note: matrix.note,
    });
  }
  const summary: ActivationReportSummary = {
    total: rows.length,
    active: rows.filter((r) => r.state === "ACTIVE").length,
    configured: rows.filter((r) => r.state === "CONFIGURED").length,
    notConfigured: rows.filter((r) => r.state === "NOT CONFIGURED").length,
    blocked: rows.filter((r) => r.state === "BLOCKED").length,
  };
  return { rows, summary };
}

// ---------------------------------------------------------------------------
// FORMATIRANJE (CLI — scripts/activation-check.ts)
// ---------------------------------------------------------------------------

/** Simbol stanja za hitro branje tabele. */
function stateSymbol(state: ActivationState): string {
  switch (state) {
    case "ACTIVE":
      return "🟢";
    case "CONFIGURED":
      return "🟡";
    case "NOT CONFIGURED":
      return "⚪";
    case "BLOCKED":
      return "🔴";
  }
}

/** Tabela (privzeti izpis). Širine so namerno fiksne — berljivost v CLI. */
export function formatActivationTable(report: ActivationReport): string {
  const lines: string[] = [];
  lines.push("PRODUCTION ACTIVATION CHECK — Issue #20 §11 (iskren izpis stanja)");
  lines.push("=".repeat(118));
  lines.push(
    "PROVIDER".padEnd(14) +
      "STANJE".padEnd(17) +
      "STAGE".padEnd(23) +
      "LIVE".padEnd(6) +
      "DOSTOP".padEnd(21) +
      "CTA".padEnd(20) +
      "CENA".padEnd(14) +
      "ENV"
  );
  lines.push("-".repeat(118));
  for (const r of report.rows) {
    const envParts = [...r.envAffiliate, ...r.envApi];
    const env = envParts.length > 0 ? envParts.join(" ") : "–";
    lines.push(
      r.slug.padEnd(14) +
        `${stateSymbol(r.state)} ${r.state}`.padEnd(17) +
        r.stage.padEnd(23) +
        (r.liveDataVerified ? "DA" : "ne").padEnd(6) +
        r.accessKind.padEnd(21) +
        r.cta.padEnd(20) +
        r.price.padEnd(14) +
        env
    );
  }
  lines.push("-".repeat(118));
  const s = report.summary;
  lines.push(
    `SKUPAJ ${s.total}: 🟢 ACTIVE ${s.active} · 🟡 CONFIGURED ${s.configured} · ⚪ NOT CONFIGURED ${s.notConfigured} · 🔴 BLOCKED ${s.blocked}`
  );
  lines.push("");
  lines.push("ENV: ✓/✗ = PRESENT/MISSING (samo Boolean — vrednosti NIKOLI niso izpisane).");
  lines.push("CENA: FROM_PRICE = objavljena/izpeljana cena, NIKOLI živ citat; NOT_SUPPORTED = vir nima cen.");
  lines.push("Opombe po providerjih (iskreni razlogi):");
  for (const r of report.rows) {
    lines.push(`  • ${r.slug} [${r.state}]: ${r.note}`);
  }
  return lines.join("\n");
}

/** JSON izpis (strojno berljiv — brez opomb, brez skrivnosti). */
export function formatActivationJson(report: ActivationReport): string {
  return JSON.stringify(
    {
      generatedBy: "issue20-activation-check/1",
      summary: report.summary,
      providers: report.rows.map((r) => ({
        slug: r.slug,
        state: r.state,
        stage: r.stage,
        liveDataVerified: r.liveDataVerified,
        accessKind: r.accessKind,
        cta: r.cta,
        price: r.price,
        availability: r.availability,
        env: {
          affiliate: Object.fromEntries(
            r.envAffiliate.map((t) => [t.split(":")[0], t.endsWith("✓")])
          ),
          api: Object.fromEntries(
            r.envApi.map((t) => [t.split(":")[0], t.endsWith("✓")])
          ),
          configured: r.envConfigured,
        },
      })),
    },
    null,
    2
  );
}
