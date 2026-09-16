import type { PlanCheckReport } from "@/lib/plan-check";
import type { GeoRuleId } from "@/lib/geo-validation";

// ============================================================================
// F17 — JAVNA TELEMETRIJA VALIDATORJA ( "Koliko napak ujame naš preverjevalnik")
// ============================================================================
//
// Backlog #2 ( sekcija 22): "stran z našimi realnimi številkami + citati
// javnih študij ( Tow 37/67/94 %, BBC 37/33 %, MEM 43,2 %) z viri". MEM je
// to naredil za 356 potovanj in postal referenca — mi štejemo LASTNA
// preverjanja odkrito, od trenutka, ko smo štetje začeli.
//
// NAČELO POŠTENOSTI ( isto kot F13/F16 — samo dokazljive številke):
// - Šteje se SAMO DOKONČANO preverjanje: dogodek zapiše STREŽNIK ob izračunu
//   poročila ( POST /api/plan-check, status 200) — imun na izgubljene
//   klientske klice in na klikce brez poročila. Zavrnitve ( 422 "ne ugibam")
//   se NE štejejo kot opravljena preverjanja.
// - Brez PII: samo števke ( dnevi, postanki, vrste opozoril, zaključki) —
//   NIKOLI besedilo načrta, IP ali kaj drugega.
// - Štetje se prične z 1.21.0 — zgodovine NE domnevamo nazaj; zato agregat
//   nosi "since" ( datum prvega dogodka), javna stran pa to odkrito pokaže.
// - Fail-open: pokvarjena vrstica v bazi NE zruši agregata ( preskoči se);
//   tudi pisanje dogodka v API poti je fail-open ( poročilo vedno vrne).
// ============================================================================

/** Tip dogodka v AnalyticsEvent ( isti "planner_" prefix kot klientske poti). */
export const PLAN_CHECK_REPORTED_TYPE = "planner_plan_check_reported";

/** Props dogodka — samo števke ( brez besedila načrta, brez IP, brez PII). */
export interface PlanCheckReportedProps {
  lang: "sl" | "en";
  days: number;
  stops: number;
  issuesTotal: number;
  issuesError: number;
  issuesWarn: number;
  /** Število opozoril po vrsti pravila ( samo neničelne vrste). */
  rules: Partial<Record<GeoRuleId, number>>;
  /** Duplikati prek dnevov ( isti kraj v ≥ 2 dnevih; MEM 5,1 % dni). */
  duplicates: number;
  /** Dnevi s cik-cak predlogom preureditve ( MEM 9,5 % dni). */
  zigzagDays: number;
  /** Vsota prihrankov km vseh cik-cak predlogov ( zaokroženo). */
  zigzagSavedKm: number;
  worst: "ok" | "warn" | "error";
  /** "osrm" | "heuristic" | "mixed" — metoda razdalj v poročilu ( razkrito). */
  method: string;
}

/** Javni agregat za GET /api/plan-check/stats ( kar vidi stran). */
export interface ValidatorPublicStats {
  plansChecked: number;
  /** ISO "YYYY-MM-DD" prvega dogodka ( kdaj smo začeli šteti) ali null. */
  since: string | null;
  daysParsed: number;
  stopsRecognized: number;
  issuesTotal: number;
  issuesError: number;
  issuesWarn: number;
  /** Po vrsti pravila, padajoče ( pri izenačitvi po imenu — determinizem). */
  rules: { rule: string; count: number }[];
  crossDayDuplicates: number;
  zigzagDays: number;
  zigzagSavedKm: number;
  worstCounts: { error: number; warn: number; ok: number };
  /** Zaokroženo na 1 decimalko ( 0, ko plansChecked = 0). */
  avgIssuesPerPlan: number;
}

/** Poročilo → števke dogodka. Čista funkcija ( brez omrežja/baze). */
export function buildPlanCheckReportProps(
  report: PlanCheckReport
): PlanCheckReportedProps {
  const rules: Partial<Record<GeoRuleId, number>> = {};
  for (const issue of report.validation.issues) {
    rules[issue.rule] = (rules[issue.rule] ?? 0) + 1;
  }
  const errors = report.validation.issues.filter((i) => i.level === "error");
  const warns = report.validation.issues.filter((i) => i.level === "warn");

  return {
    lang: report.lang,
    days: report.parsed.days.length,
    stops: report.parsed.totalStops,
    issuesTotal: report.validation.issues.length,
    issuesError: errors.length,
    issuesWarn: warns.length,
    rules,
    duplicates: report.duplicates.length,
    zigzagDays: report.zigzag.length,
    zigzagSavedKm: Math.round(
      report.zigzag.reduce((sum, z) => sum + z.savedKm, 0)
    ),
    worst: report.validation.worst,
    method: report.validation.method ?? "heuristic",
  };
}

// ---------------------------------------------------------------------------
// Agregacija ( javna stran) — čista funkcija, bazo bere klicnik
// ( API z 60 s predpomnilnikom, da javna stran ne tolče baze)
// ---------------------------------------------------------------------------

/** Primitivni prop → varno število ( negativno/NaN/neskončno → 0). */
function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0
    ? Math.round(v)
    : 0;
}

/**
 * Združi vrstice AnalyticsEvent ( type = PLAN_CHECK_REPORTED_TYPE) v javni
 * agregat. Pokvarjene vrstice ( JSON napaka / props ni objekt) se preskočijo
 * — NE štejejo in NE zrušijo agregata ( fail-open).
 */
export function aggregateValidatorStats(
  rows: { metadata: string; createdAt: Date }[]
): ValidatorPublicStats {
  const stats: ValidatorPublicStats = {
    plansChecked: 0,
    since: null,
    daysParsed: 0,
    stopsRecognized: 0,
    issuesTotal: 0,
    issuesError: 0,
    issuesWarn: 0,
    rules: [],
    crossDayDuplicates: 0,
    zigzagDays: 0,
    zigzagSavedKm: 0,
    worstCounts: { error: 0, warn: 0, ok: 0 },
    avgIssuesPerPlan: 0,
  };

  const rules = new Map<string, number>();
  let firstAt: Date | null = null;

  for (const row of rows) {
    let props: unknown;
    try {
      props = (JSON.parse(row.metadata) as { props?: unknown }).props;
    } catch {
      continue; // pokvarjen JSON — preskoči ( fail-open)
    }
    if (typeof props !== "object" || props === null) continue;

    const p = props as Record<string, unknown>;
    stats.plansChecked += 1;
    stats.daysParsed += num(p.days);
    stats.stopsRecognized += num(p.stops);
    stats.issuesTotal += num(p.issuesTotal);
    stats.issuesError += num(p.issuesError);
    stats.issuesWarn += num(p.issuesWarn);
    stats.crossDayDuplicates += num(p.duplicates);
    stats.zigzagDays += num(p.zigzagDays);
    stats.zigzagSavedKm += num(p.zigzagSavedKm);
    if (p.worst === "error" || p.worst === "warn" || p.worst === "ok") {
      stats.worstCounts[p.worst] += 1;
    }
    if (typeof p.rules === "object" && p.rules !== null) {
      for (const [rule, count] of Object.entries(
        p.rules as Record<string, unknown>
      )) {
        const c = num(count);
        if (c > 0) rules.set(rule, (rules.get(rule) ?? 0) + c);
      }
    }
    if (!firstAt || row.createdAt < firstAt) firstAt = row.createdAt;
  }

  stats.rules = [...rules.entries()]
    .map(([rule, count]) => ({ rule, count }))
    .sort((a, b) => b.count - a.count || a.rule.localeCompare(b.rule));
  stats.since = firstAt ? firstAt.toISOString().slice(0, 10) : null;
  stats.avgIssuesPerPlan =
    stats.plansChecked > 0
      ? Math.round((stats.issuesTotal / stats.plansChecked) * 10) / 10
      : 0;

  return stats;
}
