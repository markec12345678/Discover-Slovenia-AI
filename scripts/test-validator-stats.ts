// Test validator-stats (F17) — javna telemetrija preverjevalnika.
// Zagon: bun scripts/test-validator-stats.ts
import {
  buildPlanCheckReportProps,
  aggregateValidatorStats,
  PLAN_CHECK_REPORTED_TYPE,
  type PlanCheckReportedProps,
  type ValidatorPublicStats,
} from "../src/lib/validator-stats";
import { checkPlan, type PlanCheckReport } from "../src/lib/plan-check";
import type { GeoValidation } from "../src/lib/geo-validation";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    console.log(`  ✅ ${name}`);
  } else {
    failures += 1;
    console.error(`  ❌ ${name} ${detail}`);
  }
}

// Demo načrt z NAMERNIMI napakami (ista kot v plan-check-section): 4 dnevi,
// Ptuj ob ponedeljkih (closed_weekday), dolg dan 2, duplikat Piran (2 + 3).
const EXAMPLE_SL = `Potovalni načrt: Slovenija, 4 dni (odhod 21. 9. 2026)

1. dan: Ptuj in Maribor
Zjutraj obisk Ptujskega gradu, popoldne sprehod po Mariboru.

2. dan: proti obali in nazaj
Piran zjutraj, nato vožnja v Ljubljano na kosilo, odtam Bled
za sprehod ob jezeru, ob sončnem zahodu spet Piran.

3. dan: morje
Sproščujoč dopoldne v Piranu, popoldne v Portorožu.

4. dan: domov
Še Vintgarska soteska na poti domov.`;

/** Sintetično poročilo ( poljubne številke — deterministično). */
function synthReport(over: {
  issues: { rule: string; level: "warn" | "error" }[];
  duplicates?: number;
  zigzag?: { savedKm: number }[];
  worst?: "ok" | "warn" | "error";
}): PlanCheckReport {
  const issues = over.issues.map((i, idx) => ({
    day: 1 + (idx % 3),
    level: i.level,
    rule: i.rule as never,
    message: "test",
  }));
  const worst =
    over.worst ??
    (issues.some((i) => i.level === "error")
      ? "error"
      : issues.length > 0
        ? "warn"
        : "ok");
  const validation: GeoValidation = {
    days: [{ day: 1, stops: 3, km: 100, drivingMinutes: 120, activityMinutes: 240, loadMinutes: 360 }],
    issues,
    tripKm: 100,
    worst,
    method: "heuristic",
  };
  return {
    lang: "sl",
    parsed: {
      dayHeadersFound: true,
      days: [
        { day: 1, stops: [{ id: "bled", name: "Bled" }] },
        { day: 2, stops: [{ id: "piran", name: "Piran" }] },
      ],
      tripStartDate: null,
      totalStops: 2,
    },
    validation,
    duplicates: Array.from({ length: over.duplicates ?? 0 }, (_, i) => ({
      id: `d${i}`,
      name: `X${i}`,
      days: [1, 2],
    })),
    zigzag: (over.zigzag ?? []).map((z, i) => ({
      day: i + 1,
      currentKm: z.savedKm + 50,
      optimizedKm: 50,
      savedKm: z.savedKm,
      order: [],
    })),
    driveCosts: null,
    sources: [],
  };
}

/** Vrstica AnalyticsEvent ( kot jo vrne Prisma). */
function row(props: unknown, iso: string) {
  return {
    metadata: JSON.stringify({ props, path: "/api/plan-check" }),
    createdAt: new Date(iso),
  };
}

console.log("=== 1) buildPlanCheckReportProps — sintetično poročilo ===");
{
  const report = synthReport({
    issues: [
      { rule: "day_km", level: "warn" },
      { rule: "day_km", level: "error" },
      { rule: "leg_distance", level: "warn" },
      { rule: "closed_weekday", level: "warn" },
    ],
    duplicates: 2,
    zigzag: [{ savedKm: 42.4 }, { savedKm: 17.8 }],
    worst: "error",
  });
  const props = buildPlanCheckReportProps(report);
  check("days = 2", props.days === 2, `dobili ${props.days}`);
  check("stops = 2", props.stops === 2);
  check("issuesTotal = 4, error 1 / warn 3", props.issuesTotal === 4 && props.issuesError === 1 && props.issuesWarn === 3);
  check("rules po vrsti: day_km 2, leg_distance 1, closed_weekday 1", props.rules.day_km === 2 && props.rules.leg_distance === 1 && props.rules.closed_weekday === 1);
  check("vsota rules = issuesTotal", Object.values(props.rules).reduce((s, n) => s! + n!, 0) === props.issuesTotal);
  check("duplicates = 2", props.duplicates === 2);
  check("zigzagDays = 2, savedKm zaokrožen 60", props.zigzagDays === 2 && props.zigzagSavedKm === 60, `dobili ${props.zigzagSavedKm}`);
  check("worst/method razkrita", props.worst === "error" && props.method === "heuristic");
  const keys = Object.keys(props).sort().join(",");
  check("brez PII ključev (natančen nabor)", keys === "days,duplicates,issuesError,issuesTotal,issuesWarn,lang,method,rules,stops,worst,zigzagDays,zigzagSavedKm", keys);
}

console.log("=== 2) buildPlanCheckReportProps — pravi demo (invariante) ===");
{
  const report = checkPlan(EXAMPLE_SL, "sl");
  const props = buildPlanCheckReportProps(report);
  check("days = 4 (parser)", props.days === 4, `dobili ${props.days}`);
  check("issuesTotal = error + warn", props.issuesTotal === props.issuesError + props.issuesWarn);
  check("vsota rules = issuesTotal", Object.values(props.rules).reduce((s, n) => s! + n!, 0) === props.issuesTotal);
  check("closed_weekday zadet (Ptuj ob ponedeljkih)", (props.rules.closed_weekday ?? 0) >= 1);
  check("duplikat Piran prek dnevov zadet", props.duplicates >= 1);
  check("worst ustreza poročilu (demo = warn pri demo heuristicah)", props.worst === report.validation.worst);
  console.log(`     demo: ${props.issuesTotal} opozoril (E:${props.issuesError} W:${props.issuesWarn}), duplikati ${props.duplicates}, cik-cak ${props.zigzagDays}`);
}

console.log("=== 3) aggregateValidatorStats — prazno in fail-open ===");
{
  const empty = aggregateValidatorStats([]);
  check("prazno: 0 načrtov, since null, rules []", empty.plansChecked === 0 && empty.since === null && empty.rules.length === 0);
  check("prazno: avg 0", empty.avgIssuesPerPlan === 0);

  const malformed = aggregateValidatorStats([
    { metadata: "{ni json", createdAt: new Date("2026-09-17T10:00:00Z") },
    { metadata: JSON.stringify({ bezProps: true }), createdAt: new Date("2026-09-17T11:00:00Z") },
  ]);
  check("pokvarjene vrstice preskočene (0 načrtov)", malformed.plansChecked === 0);
}

console.log("=== 4) aggregateValidatorStats — seštevanje in vrstni red ===");
{
  const p1: PlanCheckReportedProps = {
    lang: "sl", days: 4, stops: 9, issuesTotal: 5, issuesError: 2, issuesWarn: 3,
    rules: { day_km: 2, leg_distance: 1, closed_weekday: 1, schedule_gap: 1 },
    duplicates: 1, zigzagDays: 1, zigzagSavedKm: 45, worst: "error", method: "osrm",
  };
  const p2: PlanCheckReportedProps = {
    lang: "en", days: 2, stops: 5, issuesTotal: 3, issuesError: 0, issuesWarn: 3,
    rules: { day_km: 3 }, duplicates: 0, zigzagDays: 0, zigzagSavedKm: 0,
    worst: "warn", method: "heuristic",
  };
  const p3: PlanCheckReportedProps = {
    lang: "sl", days: 1, stops: 2, issuesTotal: 0, issuesError: 0, issuesWarn: 0,
    rules: {}, duplicates: 0, zigzagDays: 0, zigzagSavedKm: 0, worst: "ok", method: "heuristic",
  };
  const agg = aggregateValidatorStats([
    row(p1, "2026-09-17T08:30:00Z"),
    row(p2, "2026-09-18T12:00:00Z"),
    row(p3, "2026-09-19T09:15:00Z"),
  ]);
  check("plansChecked = 3", agg.plansChecked === 3);
  check("since = datum PRVEGA dogodka (2026-09-17)", agg.since === "2026-09-17", `dobili ${agg.since}`);
  check("days 7 / stops 16", agg.daysParsed === 7 && agg.stopsRecognized === 16);
  check("issues 8 (E2 W6), duplikati 1, cik-cak 1 (~45 km)", agg.issuesTotal === 8 && agg.issuesError === 2 && agg.issuesWarn === 6 && agg.crossDayDuplicates === 1 && agg.zigzagDays === 1 && agg.zigzagSavedKm === 45);
  check("worstCounts: error 1, warn 1, ok 1", agg.worstCounts.error === 1 && agg.worstCounts.warn === 1 && agg.worstCounts.ok === 1);
  check("avg = 8/3 → 2,7", agg.avgIssuesPerPlan === 2.7, `dobili ${agg.avgIssuesPerPlan}`);
  check("rules padajoče: day_km 5 vodi", agg.rules[0].rule === "day_km" && agg.rules[0].count === 5);
  check("day_km se sešteje PREK vrstic (2+3)", agg.rules[0].count === 5);
  check("pravil po pričakovanju (day_km, leg_distance, schedule_gap, closed_weekday)", ["day_km", "leg_distance", "schedule_gap", "closed_weekday"].every((r) => agg.rules.some((x) => x.rule === r)));
}

console.log("=== 5) aggregateValidatorStats — nezaupljivi vhodi ===");
{
  const agg = aggregateValidatorStats([
    row({ days: -3, stops: 2.4, issuesTotal: Number.POSITIVE_INFINITY, rules: { day_km: -2, leg_distance: 1.6 }, worst: "hmm" }, "2026-09-20T10:00:00Z"),
  ]);
  check("negativno/NaN/∞ → 0 (dni, opozoril)", agg.daysParsed === 0 && agg.issuesTotal === 0);
  check("stops 2,4 → 2 (zaokroženo)", agg.stopsRecognized === 2);
  check("rules: negativ izpust, 1,6 → 2", agg.rules.length === 1 && agg.rules[0].rule === "leg_distance" && agg.rules[0].count === 2);
  check("neveljaven worst se NE šteje v buckete", agg.worstCounts.error === 0 && agg.worstCounts.warn === 0 && agg.worstCounts.ok === 0);
  check("a vsak zapisk veljavne vrstice šteje kot načrt", agg.plansChecked === 1);
}

console.log("=== 6) Konstanta dogodka ===");
{
  check("tip dogodka = planner_plan_check_reported", PLAN_CHECK_REPORTED_TYPE === "planner_plan_check_reported");
}

if (failures > 0) {
  console.error(`\n❌ ${failures} preverjanj NI USPELO`);
  process.exit(1);
}
console.log(`\n✅ VSA preverjanja uspešna`);
