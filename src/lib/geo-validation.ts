// ============================================================================
// GEO-VALIDACIJA ITINERERJA (P0.2) — geografska/časovna izvedljivost poti
// ============================================================================
//
// NAMEN: plast NAD obstoječo generacijo (ni nov engine) — po generiranju
// (AI ali fallback) se vsak dan preveri po uporabnikovih pravilih iz
// pilot validacije (scripts/pilot-geo-validator.ts, test 3 — vrstna vrstica
// "P0 = validacijska plast nad obstoječim itinerarjem, ne nova funkcija"):
//
//   1. kilometri na dan            (> 150 WARN, > 250 ERROR)
//   2. število glavnih postankov    (> 4 WARN,   > 5 ERROR)
//   3. zaporedna razdalja med točkama (> 80 km WARN, > 150 km ERROR)
//   4. obseg dneva (aktivnosti + vožnje) (> 11 h WARN, > 13 h ERROR)
//   5. časovna združljivost urnika   (vrzel < vožnja → WARN/ERROR; prekrivanje → ERROR)
//   6. isti kraj dvakrat isti dan    (WARN)
//   7. manjkajoče koordinate         (ERROR)
//   8. brez lažne natančnosti        (zaokroževanje na 5 km/5 min, "~" prefix)
//
// NAČELO POŠTENOSTI (enako kot itinerary-quality.ts / crowd-alternatives.ts):
// - VSE metrike so DETERMINISTIČNO izračunane iz realnih koordinat destinacij
//   (haversine × 1,3 cestni faktor ÷ 55 km/h povprečje) — niso prometne
//   informacije v realnem času in se nikoli ne predstavljajo kot take.
// - Kjer podatka ni (neparsable time_slot, neznan destination_id), se pravilo
//   preskoči ali označi kot missing_coords — NE izmišljujemo si vrednosti.
// - Čista funkcija: isto obnašanje na serverju (API ob generiranju/refinu)
//   in na clientu (stari shranjeni načrti brez geoValidation polja).
// ============================================================================

import { DESTINATIONS } from "@/lib/slovenia-data";
import type { Itinerary } from "@/lib/types";

/** Cestni faktor — dejanske ceste so ~1,3× daljše od ravne črte (Slovenija). */
const ROAD_FACTOR = 1.3;
/** Povprečna hitrost (km/h) — vključuje gorske ceste, kraje, parkiranje. */
const AVG_SPEED_KMH = 55;

/** Pragi (isti kot pilot validator — konsistentnost med testom in produkcijo). */
const THRESHOLDS = {
  dayKm: { warn: 150, error: 250 },
  dayStops: { warn: 4, error: 5 },
  legKm: { warn: 80, error: 150 },
  dayLoadHours: { warn: 11, error: 13 },
  /** Toleranca vozne vrzeli (h) — pod to razliko je urnik "komaj" izvedljiv. */
  scheduleTightBuffer: 0.25,
} as const;

export type GeoIssueLevel = "warn" | "error";

export type GeoRuleId =
  | "day_km"
  | "day_stops"
  | "leg_distance"
  | "day_overload"
  | "schedule_gap"
  | "schedule_overlap"
  | "duplicate_stop"
  | "missing_coords";

export interface DayGeoMetrics {
  day: number;
  /** Število glavnih postankov. */
  stops: number;
  /** Cestni kilometri tega dne (zaokroženo na 5). */
  km: number;
  /** Skupni čas vožnje v minutah (zaokroženo na 5). */
  drivingMinutes: number;
  /** Seštevek trajanj aktivnosti v minutah. */
  activityMinutes: number;
  /** Obseg dneva: aktivnosti + vožnje (minute). */
  loadMinutes: number;
}

export interface GeoValidationIssue {
  day: number;
  level: GeoIssueLevel;
  rule: GeoRuleId;
  /** Lokalizirano sporočilo (lang parameter) — pošteno, z "~" ocenami. */
  message: string;
}

export interface GeoValidation {
  /** Metrike po dnevih (tudi za dneve brez opozoril — za prikaz v UI). */
  days: DayGeoMetrics[];
  issues: GeoValidationIssue[];
  /** Skupni cestni kilometri celotnega potovanja (brez prehodov med dnevi). */
  tripKm: number;
  /** Najhujšja raven: "ok" (0 opozoril) | "warn" | "error". */
  worst: "ok" | "warn" | "error";
}

// ---------------------------------------------------------------------------
// Geometrija (ista enačba kot itinerary-quality.ts — enoten vir resnice o
// razdaljah v platformi; haversine tu sprejema objekte, ker delamo z Map)
// ---------------------------------------------------------------------------

const COORDS = new Map(DESTINATIONS.map((d) => [d.id, d.coords]));

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
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la) * Math.cos(lb) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Zaokroži na 5 (km ali minute) — brez lažne natančnosti "137 km". */
function round5(n: number): number {
  return Math.round(n / 5) * 5;
}

/** "HH:MM-HH:MM" → minute od polnoči; null pri drugačnem formatu (brez ugibanj). */
function parseSlot(slot: string): { startMin: number; endMin: number } | null {
  if (typeof slot !== "string") return null;
  const m = slot.match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const s = Number(m[1]) * 60 + Number(m[2]);
  const e = Number(m[3]) * 60 + Number(m[4]);
  if (e <= s) return null; // čez noč ali smešno — preskoči
  return { startMin: s, endMin: e };
}

// ---------------------------------------------------------------------------
// Lokalizirana sporočila (strežniško, vzorec crowd-alternatives.ts;
// struktura issue ostane strojno berljiva: rule + day + level)
// ---------------------------------------------------------------------------

type Lang = "sl" | "en";

function msgDayKm(lang: Lang, km: number): string {
  return lang === "en"
    ? `~${km} km of driving in one day (comfortable limit is around ${THRESHOLDS.dayKm.warn} km)`
    : `~${km} km vožnje v enem dnevu (udoben okvir je okoli ${THRESHOLDS.dayKm.warn} km)`;
}
function msgDayStops(lang: Lang, stops: number): string {
  return lang === "en"
    ? `${stops} main stops in one day — very little time to actually experience each place`
    : `${stops} glavnih postankov v enem dnevu — zelo malo časa, da karkoli res doživiš`;
}
function msgLegDistance(
  lang: Lang,
  from: string,
  to: string,
  km: number,
  level: GeoIssueLevel
): string {
  const limit = level === "error" ? THRESHOLDS.legKm.error : THRESHOLDS.legKm.warn;
  return lang === "en"
    ? `${from} → ${to}: ~${km} km in one leg (long transfers work best above ${limit} km only with a clear reason)`
    : `${from} → ${to}: ~${km} km v enem kosu (prenose nad ${limit} km se splača le s dobrim razlogom)`;
}
function msgDayOverload(lang: Lang, activityH: number, drivingH: number): string {
  const total = Math.round((activityH + drivingH) * 10) / 10;
  return lang === "en"
    ? `Day is overloaded: ~${total} h of activities + driving (${activityH} h + ${drivingH} h)`
    : `Dan je preobremenjen: ~${total} h aktivnosti in vožnje skupaj (${activityH} h + ${drivingH} h)`;
}
function msgScheduleGap(
  lang: Lang,
  from: string,
  to: string,
  gapH: number,
  driveH: number,
  level: GeoIssueLevel
): string {
  if (level === "error") {
    return lang === "en"
      ? `Schedule doesn't work: ${from} → ${to} has only ${gapH.toFixed(1)} h between time slots, but the drive alone takes ~${driveH.toFixed(1)} h`
      : `Urnik ne gre skupaj: ${from} → ${to} ima samo ${gapH.toFixed(1)} h med termini, sama vožnja pa vzame ~${driveH.toFixed(1)} h`;
  }
  return lang === "en"
    ? `Tight schedule: ${from} → ${to} — the ${gapH.toFixed(1)} h gap barely covers the ~${driveH.toFixed(1)} h drive (no buffer)`
    : `Napak urnik: ${from} → ${to} — vrzel ${gapH.toFixed(1)} h komaj pokrije vožnjo ~${driveH.toFixed(1)} h (brez rezerve)`;
}
function msgScheduleOverlap(lang: Lang, a: string, b: string): string {
  return lang === "en"
    ? `Time slots overlap: ${a} and ${b} — one of them has to move`
    : `Termini se prekrivajo: ${a} in ${b} — enega bo treba prestaviti`;
}
function msgDuplicateStop(lang: Lang, name: string): string {
  return lang === "en"
    ? `${name} appears twice on the same day without an apparent reason`
    : `${name} je isti dan na programu dvakrat brez očitnega razloga`;
}
function msgMissingCoords(lang: Lang, name: string, id: string): string {
  return lang === "en"
    ? `Cannot verify "${name}" (${id}) — unknown destination, distances for this day may be understated`
    : `"${name}" (${id}) ne morem preveriti — neznana destinacija, razdalje tega dne so lahko podcenjene`;
}

// ---------------------------------------------------------------------------
// Glavna čista funkcija
// ---------------------------------------------------------------------------

export function validateItineraryGeo(
  itinerary: Itinerary,
  lang: Lang = "sl"
): GeoValidation {
  const days = Array.isArray(itinerary.days) ? itinerary.days : [];
  const dayMetrics: DayGeoMetrics[] = [];
  const issues: GeoValidationIssue[] = [];

  for (const day of days) {
    const stops = Array.isArray(day.locations) ? day.locations : [];
    const dayNo = typeof day.day === "number" ? day.day : 0;

    // --- pravilo 7: manjkajoče koordinate (neznan ID → ne moremo računati) ---
    for (const s of stops) {
      if (!COORDS.has(s.destination_id)) {
        issues.push({
          day: dayNo,
          level: "error",
          rule: "missing_coords",
          message: msgMissingCoords(
            lang,
            s.destination_name ?? s.destination_id,
            s.destination_id
          ),
        });
      }
    }

    // --- zaporedne noge: razdalje, vožnja, urnik ---
    let kmStraight = 0;
    let driveH = 0;
    for (let i = 0; i < stops.length - 1; i++) {
      const a = COORDS.get(stops[i].destination_id);
      const b = COORDS.get(stops[i + 1].destination_id);
      if (!a || !b) continue;
      const straight = haversineKm(a, b);
      const roadKm = round5(straight * ROAD_FACTOR);
      const legH = (straight * ROAD_FACTOR) / AVG_SPEED_KMH;
      kmStraight += straight;
      driveH += legH;

      // pravilo 3: zaporedna razdalja
      if (roadKm > THRESHOLDS.legKm.error) {
        issues.push({
          day: dayNo,
          level: "error",
          rule: "leg_distance",
          message: msgLegDistance(
            lang,
            stops[i].destination_name ?? stops[i].destination_id,
            stops[i + 1].destination_name ?? stops[i + 1].destination_id,
            roadKm,
            "error"
          ),
        });
      } else if (roadKm > THRESHOLDS.legKm.warn) {
        issues.push({
          day: dayNo,
          level: "warn",
          rule: "leg_distance",
          message: msgLegDistance(
            lang,
            stops[i].destination_name ?? stops[i].destination_id,
            stops[i + 1].destination_name ?? stops[i + 1].destination_id,
            roadKm,
            "warn"
          ),
        });
      }

      // pravilo 5: časovna združljivost (SAMO če sta termina parsable —
      // drugače preskoči, brez izmišljenih časov)
      const sa = parseSlot(stops[i].time_slot);
      const sb = parseSlot(stops[i + 1].time_slot);
      if (sa && sb) {
        const gapH = (sb.startMin - sa.endMin) / 60;
        if (gapH < 0) {
          issues.push({
            day: dayNo,
            level: "error",
            rule: "schedule_overlap",
            message: msgScheduleOverlap(
              lang,
              stops[i].time_slot,
              stops[i + 1].time_slot
            ),
          });
        } else if (gapH + THRESHOLDS.scheduleTightBuffer < legH) {
          issues.push({
            day: dayNo,
            level: "error",
            rule: "schedule_gap",
            message: msgScheduleGap(
              lang,
              stops[i].destination_name ?? stops[i].destination_id,
              stops[i + 1].destination_name ?? stops[i + 1].destination_id,
              gapH,
              legH,
              "error"
            ),
          });
        } else if (gapH < legH) {
          issues.push({
            day: dayNo,
            level: "warn",
            rule: "schedule_gap",
            message: msgScheduleGap(
              lang,
              stops[i].destination_name ?? stops[i].destination_id,
              stops[i + 1].destination_name ?? stops[i + 1].destination_id,
              gapH,
              legH,
              "warn"
            ),
          });
        }
      }
    }

    const roadKmDay = round5(kmStraight * ROAD_FACTOR);
    const drivingMinutes = round5(driveH * 60);
    const activityMinutes = round5(
      stops.reduce((s, x) => s + (Number.isFinite(x.duration) ? x.duration : 0), 0) * 60
    );
    const loadMinutes = drivingMinutes + activityMinutes;

    // pravilo 1: kilometri na dan
    if (roadKmDay > THRESHOLDS.dayKm.error) {
      issues.push({
        day: dayNo,
        level: "error",
        rule: "day_km",
        message: msgDayKm(lang, roadKmDay),
      });
    } else if (roadKmDay > THRESHOLDS.dayKm.warn) {
      issues.push({
        day: dayNo,
        level: "warn",
        rule: "day_km",
        message: msgDayKm(lang, roadKmDay),
      });
    }

    // pravilo 2: število postankov
    if (stops.length > THRESHOLDS.dayStops.error) {
      issues.push({
        day: dayNo,
        level: "error",
        rule: "day_stops",
        message: msgDayStops(lang, stops.length),
      });
    } else if (stops.length > THRESHOLDS.dayStops.warn) {
      issues.push({
        day: dayNo,
        level: "warn",
        rule: "day_stops",
        message: msgDayStops(lang, stops.length),
      });
    }

    // pravilo 4: obseg dneva (aktivnosti + vožnje)
    const loadH = loadMinutes / 60;
    if (loadH > THRESHOLDS.dayLoadHours.error) {
      issues.push({
        day: dayNo,
        level: "error",
        rule: "day_overload",
        message: msgDayOverload(
          lang,
          Math.round((activityMinutes / 60) * 10) / 10,
          Math.round((drivingMinutes / 60) * 10) / 10
        ),
      });
    } else if (loadH > THRESHOLDS.dayLoadHours.warn) {
      issues.push({
        day: dayNo,
        level: "warn",
        rule: "day_overload",
        message: msgDayOverload(
          lang,
          Math.round((activityMinutes / 60) * 10) / 10,
          Math.round((drivingMinutes / 60) * 10) / 10
        ),
      });
    }

    // pravilo 6: isti kraj dvakrat isti dan
    const seen = new Set<string>();
    for (const s of stops) {
      if (seen.has(s.destination_id)) {
        issues.push({
          day: dayNo,
          level: "warn",
          rule: "duplicate_stop",
          message: msgDuplicateStop(lang, s.destination_name ?? s.destination_id),
        });
      }
      seen.add(s.destination_id);
    }

    dayMetrics.push({
      day: dayNo,
      stops: stops.length,
      km: roadKmDay,
      drivingMinutes,
      activityMinutes,
      loadMinutes,
    });
  }

  const tripKm = dayMetrics.reduce((s, d) => s + d.km, 0);
  const worst: GeoValidation["worst"] = issues.some((i) => i.level === "error")
    ? "error"
    : issues.some((i) => i.level === "warn")
      ? "warn"
      : "ok";

  return { days: dayMetrics, issues, tripKm, worst };
}
