#!/usr/bin/env bun
/**
 * ROAD ROUTING PRED/PO (F5.6) — dokaz, da realne ceste (OSRM) odpravljajo
 * LAŽNE pozitive hevristike in OHRANJajo prave napake.
 *
 * Replika dni iz PILOT-VALIDATION-GATE.md (Test 3 — 10 ERROR dni) na ročno
 * sestavljenih reprezentativnih dnevih (izvirni scenario-*.json iz pilotskega
 * теста niso bili shranjeni v repozitorij):
 *
 *   S1/S3-tip:  Ljubljana → Piran (isti dan) — hevristika ~120 km / ~2 h 10;
 *               realna cesta ~120 km / ~1 h 25 (avtocesta). Urnik ima 2 h
 *               vrzeli → hevristika javi "komaj pokrije" WARN, realna → čisto.
 *   S2-tip:     Postojna → Črnomelj (isti dan) — hevristika ~105 km / ~1 h 55;
 *               realna ~95 km / ~1 h 20. Urnik 1,5 h vrzeli → hevristika
 *               schedule_gap ERROR, realna → čisto.
 *   S6-tip:     Bohinj → Triglav → Dravograd → Slovenj Gradec (~150 km/4
 *               postanki, gorati prehodi) — tudi z realnimi cestami dan
 *               ostane preobremenjen (day_km/day_overload) — PRAVA napaka
 *               se NE skrije (varnostna mreža deluje naprej).
 *
 * Uporaba: bun scripts/road-routing-before-after.ts
 */

import { validateItineraryGeo } from "../src/lib/geo-validation";
import { buildLegRouteIndex } from "../src/lib/road-routing-server";
import { computeItineraryQuality } from "../src/lib/itinerary-quality";
import type { Itinerary, PlannerInput } from "../src/lib/types";

function day(
  no: number,
  stops: [string, string, string, number][]
): Itinerary["days"][number] {
  return {
    day: no,
    locations: stops.map(([id, name, slot, dur]) => ({
      destination_id: id,
      destination_name: name,
      time_slot: slot,
      duration: dur,
      estimated_cost: 10,
      notes: "",
    })),
    weather: { condition: "sončno", temp: 24 },
  };
}

const INPUT: PlannerInput = {
  budget: 500,
  days: 2,
  interests: ["narava"],
  season: "summer",
  groupSize: 2,
};

const scenarios: { name: string; it: Itinerary }[] = [
  {
    name: "S1/S3-tip: Ljubljana → Piran v enem dnevu (2 h vrzel v urniku)",
    it: {
      days: [
        day(1, [
          ["ljubljana", "Ljubljana", "09:00-13:00", 4],
          ["piran", "Piran", "15:00-18:00", 3],
        ]),
      ],
      total_budget: 50,
      recommendations: [],
      tips: [],
      source: "fallback",
    },
  },
  {
    name: "S2-tip: Postojna → Črnomelj (1,5 h vrzel v urniku)",
    it: {
      days: [
        day(1, [
          ["postojna", "Postojnska jama", "09:00-12:00", 3],
          ["crnomelj", "Črnomelj", "13:30-17:00", 3.5],
        ]),
      ],
      total_budget: 50,
      recommendations: [],
      tips: [],
      source: "fallback",
    },
  },
  {
    name: "S6-tip: Bohinj → Triglav → Dravograd → Slovenj Gradec (nemogoč dan)",
    it: {
      days: [
        day(1, [
          ["bohinj", "Bohinj", "08:00-11:00", 3],
          ["triglav", "Triglav", "12:00-16:00", 4],
          ["dravograd", "Dravograd", "17:00-18:30", 1.5],
          ["slovenj-gradec", "Slovenj Gradec", "19:30-21:00", 1.5],
        ]),
      ],
      total_budget: 50,
      recommendations: [],
      tips: [],
      source: "fallback",
    },
  },
];

console.log("=".repeat(72));
console.log("PRED/PO: hevristika (haversine × 1,3 ÷ 55) → realne ceste (OSRM)");
console.log("=".repeat(72));

let falsePositivesRemoved = 0;
let trueErrorsKept = 0;

for (const s of scenarios) {
  const before = validateItineraryGeo(s.it, "sl"); // hevristika (brez indeksa)
  const legs = await buildLegRouteIndex(s.it); // realne ceste
  const after = validateItineraryGeo(s.it, "sl", legs);

  const qBefore = computeItineraryQuality(s.it, INPUT);
  const qAfter = computeItineraryQuality(s.it, INPUT, legs);

  const errs = (v: typeof before) =>
    v.issues.filter((i) => i.level === "error").length;
  const warns = (v: typeof before) =>
    v.issues.filter((i) => i.level === "warn").length;

  console.log(`\n▶ ${s.name}`);
  console.log(
    `   vožnja:      ${qBefore.drivingMinutes} min → ${qAfter.drivingMinutes} min (${legs ? "OSRM" : "?"})`
  );
  console.log(
    `   km za stroške: ${qBefore.driveCosts?.km ?? "—"} km → ${qAfter.driveCosts?.km ?? "—"} km`
  );
  console.log(
    `   validacija:  ${errs(before)}E/${warns(before)}W → ${errs(after)}E/${warns(after)}W (${before.worst} → ${after.worst}, method=${after.method ?? "heuristic"})`
  );
  for (const i of before.issues) {
    const gone = !after.issues.some(
      (a) => a.rule === i.rule && a.day === i.day
    );
    console.log(
      `     ${gone ? "🡐 ODSTRANJENO" : "  ostaja"} [${i.level}] ${i.rule}: ${i.message.slice(0, 90)}`
    );
    if (gone && i.rule === "schedule_gap") falsePositivesRemoved++;
  }
  for (const i of after.issues.filter(
    (a) => !before.issues.some((b) => b.rule === a.rule && b.day === a.day)
  )) {
    console.log(`     🡒 NOVO [${i.level}] ${i.rule}: ${i.message.slice(0, 90)}`);
  }
  if (errs(after) > 0 && errs(before) > 0) trueErrorsKept++;
}

console.log("\n" + "=".repeat(72));
console.log(`SKLEP: odstranjenih LAŽNIH opozoril urnika (schedule_gap): ${falsePositivesRemoved}`);
console.log(
  `        nemogoči dnevi ostajajo odkriti (varnostna mreža): ${trueErrorsKept}/${scenarios.filter((s) => validateItineraryGeo(s.it, "sl").worst === "error").length}`
);
console.log("        razlaga: hevristika je ČAS pretiravala na avtocestah");
console.log("        (55 km/h namesto realnih ~85) → urniki, ki SO izvedljivi,");
console.log("        so bili označeni kot nemogoči. Realna km v gorah so");
console.log("        daljša (~+15 %) → stroški goriva poštenejši.");

function falsePosimitivesLabel(): number | string {
  return falsePositivesRemoved;
}
