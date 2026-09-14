#!/usr/bin/env bun
/**
 * PILOT VALIDATION GATE — Test 3: geografska izvedljivost itinererjev
 *
 * TESTNI VALIDATOR (ni nov engine — samo detektor očitno slabih dni).
 * Prebere scenarije iz scripts/pilot-results/scenario-*.json in za vsak dan
 * preveri uporabnikova pravila:
 *
 *   1. opozori pri zelo velikem številu kilometrov (dan > 150 km WARN, > 250 ERROR)
 *   2. opozori pri več kot 4–5 glavnih postankih na dan (>4 WARN, >5 ERROR)
 *   3. opozori pri preveč oddaljenih zaporednih točkah (>80 km WARN, >150 ERROR)
 *   4. opozori pri kombinaciji dolgih aktivnosti in dolgih transferjev
 *      (aktivnosti + transferji > 11 h WARN, > 13 h ERROR)
 *   5. opozori, kadar manjkajo koordinate (ERROR)
 *   6. ne prikazuj lažne natančnosti — preveri, ali notes vsebujejo
 *      pretirano natančne trditve o časih vožnje brez vira
 *
 * Uporaba: bun run scripts/pilot-geo-validator.ts
 */

import { DESTINATIONS } from "../src/lib/slovenia-data";

const OUT = "scripts/pilot-results";

interface LocationVisit {
  destination_id: string;
  destination_name: string;
  time_slot: string;
  duration: number;
  estimated_cost: number;
  notes?: string;
}

interface DayPlan {
  day: number;
  locations: LocationVisit[];
  weather: { condition: string; temp: number };
}

interface ItineraryJson {
  days: DayPlan[];
  source?: string;
  tripStartDate?: string;
}

// ---------------------------------------------------------------------------
// Geografija
// ---------------------------------------------------------------------------

const COORDS = new Map(DESTINATIONS.map((d) => [d.id, d.coords]));
const NAME = new Map(DESTINATIONS.map((d) => [d.id, d.name]));
const REGION = new Map(DESTINATIONS.map((d) => [d.id, d.region]));

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la = (a.lat * Math.PI) / 180;
  const lb = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Cestni faktor: ravne črte ~1,3× cesta v Sloveniji (hribovita država). */
const ROAD_FACTOR = 1.3;
/** Povprečna hitrost: 55 km/h (vključuje gorske ceste, kraje, parkiranje). */
const AVG_SPEED = 55;

function driveHours(kmStraight: number): number {
  return (kmStraight * ROAD_FACTOR) / AVG_SPEED;
}

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

interface Issue {
  level: "WARN" | "ERROR";
  rule: string;
  message: string;
}

function parseSlot(slot: string): { startMin: number; endMin: number } | null {
  const m = slot.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const s = Number(m[1]) * 60 + Number(m[2]);
  const e = Number(m[3]) * 60 + Number(m[4]);
  return { startMin: s, endMin: e };
}

function validateDay(day: DayPlan): { km: number; transferH: number; activityH: number; issues: Issue[] } {
  const issues: Issue[] = [];
  const stops = day.locations ?? [];

  // Pravilo 2: število postankov
  if (stops.length > 5) {
    issues.push({ level: "ERROR", rule: "postanki", message: `${stops.length} glavnih postankov na dan (meja 5)` });
  } else if (stops.length > 4) {
    issues.push({ level: "WARN", rule: "postanki", message: `${stops.length} postankov na dan (meja 4–5)` });
  }

  // Pravilo 5: manjkajoče koordinate
  const coords = stops.map((s) => COORDS.get(s.destination_id));
  coords.forEach((c, i) => {
    if (!c) {
      issues.push({
        level: "ERROR",
        rule: "koordinate",
        message: `manjkajo koordinate za "${stops[i].destination_name}" (${stops[i].destination_id})`,
      });
    }
  });

  // Rute med zaporednimi točkami
  let km = 0;
  let transferH = 0;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    if (!a || !b) continue;
    const straight = haversineKm(a, b);
    const road = straight * ROAD_FACTOR;
    const h = driveHours(straight);
    km += road;
    transferH += h;
    // Pravilo 3: prevelika zaporedna razdalja
    if (road > 150) {
      issues.push({
        level: "ERROR",
        rule: "razdalja",
        message: `${stops[i].destination_name} → ${stops[i + 1].destination_name}: ${Math.round(road)} km zaporedno (meja 150)`,
      });
    } else if (road > 80) {
      issues.push({
        level: "WARN",
        rule: "razdalja",
        message: `${stops[i].destination_name} → ${stops[i + 1].destination_name}: ${Math.round(road)} km zaporedno (meja 80)`,
      });
    }
    // Časovna združljivost: preveri vrzel med time_slot-i
    const sa = parseSlot(stops[i].time_slot);
    const sb = parseSlot(stops[i + 1].time_slot);
    if (sa && sb) {
      const gapH = (sb.startMin - sa.endMin) / 60;
      if (gapH < 0) {
        issues.push({
          level: "ERROR",
          rule: "časi",
          message: `prekrivanje časovnih okvirov: ${stops[i].time_slot} in ${stops[i + 1].time_slot}`,
        });
      } else if (gapH + 0.25 < h) {
        issues.push({
          level: "ERROR",
          rule: "časi",
          message: `${stops[i].destination_name} → ${stops[i + 1].destination_name}: vrzel ${gapH.toFixed(1)} h, vožnja pa ~${h.toFixed(1)} h — neizvedljivo`,
        });
      } else if (gapH < h) {
        issues.push({
          level: "WARN",
          rule: "časi",
          message: `vrzel ${gapH.toFixed(1)} h komaj pokrije vožnjo ~${h.toFixed(1)} h (brez rezerve)`,
        });
      }
    }
  }

  // Pravilo 1: kilometri na dan
  if (km > 250) {
    issues.push({ level: "ERROR", rule: "km", message: `${Math.round(km)} km na dan (meja 250)` });
  } else if (km > 150) {
    issues.push({ level: "WARN", rule: "km", message: `${Math.round(km)} km na dan (meja 150)` });
  }

  // Pravilo 4: dolge aktivnosti + dolgi transferji
  const activityH = stops.reduce((s, x) => s + (x.duration || 0), 0);
  const totalH = activityH + transferH;
  if (totalH > 13) {
    issues.push({ level: "ERROR", rule: "obseg", message: `aktivnosti ${activityH} h + vožnje ${transferH.toFixed(1)} h = ${totalH.toFixed(1)} h (meja 13)` });
  } else if (totalH > 11) {
    issues.push({ level: "WARN", rule: "obseg", message: `aktivnosti ${activityH} h + vožnje ${transferH.toFixed(1)} h = ${totalH.toFixed(1)} h (meja 11)` });
  }

  // Isti kraj dvakrat isti dan brez razloga
  const seen = new Set<string>();
  for (const s of stops) {
    if (seen.has(s.destination_id)) {
      issues.push({ level: "WARN", rule: "ponovitev", message: `"${s.destination_name}" dvakrat isti dan brez razloga` });
    }
    seen.add(s.destination_id);
  }

  return { km, transferH, activityH, issues };
}

// Pravilo 6: lažna natančnost v notes (točni časi vožnje brez vira)
const FALSE_PRECISION = /\b\d{2,3}\s*min\s*(vožnje|drive|pota)\b|\b\d+,\d\s*h\s*(vožnje|drive)\b/i;

// ---------------------------------------------------------------------------
// Glavni program
// ---------------------------------------------------------------------------

const files = ["scenario-1", "scenario-2", "scenario-3", "scenario-4", "scenario-5", "scenario-6", "scenario-7", "scenario-8", "scenario-9", "scenario-10", "scenario-10-en"];
const report: Record<string, unknown>[] = [];
let totalErrors = 0;
let totalWarns = 0;

for (const f of files) {
  const file = Bun.file(`${OUT}/${f}.json`);
  if (!(await file.exists())) continue;
  const data = (await file.json()) as { id?: number; name?: string; json?: ItineraryJson } & ItineraryJson;
  const itinerary = (data.json as ItineraryJson | undefined) ?? data;
  if (!itinerary?.days?.length) continue;

  const dayReports = [];
  let tripKm = 0;
  for (const day of itinerary.days) {
    const v = validateDay(day);
    tripKm += v.km;
    const regions = [...new Set(day.locations.map((l) => REGION.get(l.destination_id) ?? "?"))];
    dayReports.push({
      day: day.day,
      stops: day.locations.map((l) => l.destination_name),
      regions,
      km: Math.round(v.km),
      activityH: v.activityH,
      transferH: Number(v.transferH.toFixed(1)),
      issues: v.issues,
    });
    totalErrors += v.issues.filter((i) => i.level === "ERROR").length;
    totalWarns += v.issues.filter((i) => i.level === "WARN").length;
  }

  // Pravilo 6: lažna natančnost — preglej notes
  const falsePrecision: string[] = [];
  for (const day of itinerary.days) {
    for (const l of day.locations) {
      if (l.notes && FALSE_PRECISION.test(l.notes)) {
        falsePrecision.push(`Dan ${day.day} ${l.destination_name}: "${l.notes.match(FALSE_PRECISION)?.[0]}"`);
      }
    }
  }

  const scenarioErrors = dayReports.flatMap((d) => (d.issues as Issue[]).filter((i) => i.level === "ERROR"));
  console.log(`\n=== ${f} (source: ${itinerary.source ?? "?"}) ===`);
  console.log(`  skupaj km: ${Math.round(tripKm)} | dnevi: ${itinerary.days.length}`);
  for (const d of dayReports) {
    const flag = d.issues.length === 0 ? "✓" : d.issues.some((i) => i.level === "ERROR") ? "✗" : "⚠";
    console.log(`  ${flag} Dan ${d.day}: ${d.stops.join(" → ")} | ${d.km} km | regije: ${d.regions.join("/")}`);
    for (const i of d.issues) console.log(`      ${i.level === "ERROR" ? "🔴" : "🟡"} [${i.rule}] ${i.message}`);
  }
  if (falsePrecision.length > 0) {
    console.log(`  🟡 [lažna natančnost] ${falsePrecision.length} opomb s pretirano natančnimi časi`);
  }
  report.push({
    scenario: f,
    source: itinerary.source,
    tripKm: Math.round(tripKm),
    days: dayReports,
    falsePrecision,
    verdict: scenarioErrors.length === 0 ? (totalWarns >= 0 ? "OK/warn" : "OK") : "FAIL",
  });
}

console.log(`\n========== SKUPAJ: ${totalErrors} ERROR, ${totalWarns} WARN ==========`);
await Bun.write(`${OUT}/geo-validation.json`, JSON.stringify(report, null, 2));
console.log("Zapisano v scripts/pilot-results/geo-validation.json");
