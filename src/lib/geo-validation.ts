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
//   9. zaprtje v mesecu obiska      (F5.5: npr. Vintgar nov–mar — ERROR na
//                                    ravni destinacije, WARN na ravni atrakcije;
//                                    samo z znanim datumom; vir v sporočilu)
//  10. dan v tednu = dan zaprtja    (F5.5: npr. Ptujski grad ob ponedeljkih —
//                                    WARN; samo z znanim datumom; vir v sporočilu)
//
// NAČELO POŠTENOSTI (enako kot itinerary-quality.ts / crowd-alternatives.ts):
// - VSE metrike so DETERMINISTIČNO izračunane iz realnih koordinat destinacij
//   (haversine × 1,3 cestni faktor ÷ 55 km/h povprečje) — niso prometne
//   informaciji v realnem času in se nikoli ne predstavljajo kot take.
// - F5.6 (road routing): kadar klicnik poda indeks nog (src/lib/road-routing.ts),
//   se za razdalje/čase uporabijo REALNE CESTE (OSRM/OpenStreetMap) — katera
//   metoda je bila uporabljena, je razkrito v geoValidation.method.
// - Kjer podatka ni (neparsable time_slot, neznan destination_id), se pravilo
//   preskoči ali označi kot missing_coords — NE izmišljujemo si vrednosti.
// - Čista funkcija: isto obnašanje na serverju (API ob generiranju/refinu)
//   in na clientu (stari shranjeni načrti brez geoValidation polja).
// ============================================================================

import { DESTINATIONS } from "@/lib/slovenia-data";
import { dayISOForDayNumber, parseISODateLocal } from "@/lib/trip-dates";
import {
  legIndexMethod,
  legKey,
  type LegRouteIndex,
} from "@/lib/road-routing";
import type { Itinerary, RoutingMethod } from "@/lib/types";

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
  | "missing_coords"
  // F5.5 ( odpiralni časi, MindTrip pariteta — »Louvre je zaprt ob torkih«):
  // zaprtje destinacije/atribacije na dan obiska ( SAMO z znanim datumom
  // odhoda — brez datuma NE trdimo ničesar)
  | "closed_month"
  | "closed_weekday";

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
  /**
   * F5.6 (road routing): od kod so razdalje/časi — "osrm" (realne ceste),
   * "heuristic" (haversine × 1,3 ÷ 55 km/h) ali "mixed". Opcijsko: stari
   * shranjeni načrti brez OSRM obogatitve ga nimajo → panel izpiše
   * hevristiko (nazaj kompatibilno, pošteno razkrito).
   * (Zrcali types.ts GeoValidation.method — strukturno enako.)
   */
  method?: RoutingMethod;
}

// ---------------------------------------------------------------------------
// Geometrija (ista enačba kot itinerary-quality.ts — enoten vir resnice o
// razdaljah v platformi; haversine tu sprejema objekte, ker delamo z Map)
// ---------------------------------------------------------------------------

const COORDS = new Map(DESTINATIONS.map((d) => [d.id, d.coords]));

/** F5.5: odpiralni podatki (SAMO preverjeni vnosi — glej slovenia-data.ts). */
const OPENING = new Map(
  DESTINATIONS.filter((d) => d.opening).map((d) => [d.id, d.opening!])
);

const DEST_BY_ID = new Map(DESTINATIONS.map((d) => [d.id, d]));

/** Imena dni v tednu ( getDay konvencija: 0=ned … 6=sob) — za sporočila. */
const WEEKDAY_LABELS: Record<Lang, string[]> = {
  sl: ["nedeljo", "ponedeljek", "torek", "sredo", "četrtek", "petek", "soboto"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};

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

function msgClosedMonth(
  lang: Lang,
  name: string,
  note: string,
  source: string,
  isDestinationLevel: boolean
): string {
  return lang === "en"
    ? isDestinationLevel
      ? `${name} is closed in this period (${note}; source: ${source}) — the stop as planned is not possible, swap it for an open destination`
      : `${name} is closed in this period (${note}; source: ${source}) — check whether the main sight is open on your date`
    : isDestinationLevel
      ? `${name} je v tem obdobju zaprta (${note}; vir: ${source}) — postanek, kot je načrtovan, ni možen; zamenjaj ga z odprto destinacijo`
      : `${name} je v tem obdobju zaprta (${note}; vir: ${source}) — preveri, ali je glavna znamenitost na tvoj datum odprta`;
}

function msgClosedWeekday(
  lang: Lang,
  name: string,
  weekday: number,
  note: string,
  source: string
): string {
  const day = WEEKDAY_LABELS[lang][weekday] ?? String(weekday);
  return lang === "en"
    ? `This day falls on a ${day}, when the main sight at ${name} is closed (${note}; source: ${source}) — the town itself is open, but plan the castle/museum for another day`
    : `Ta dan je ${day}, ko je glavna znamenitost v ${name} zaprta (${note}; vir: ${source}) — samo kraj je odprt, grad/muzej pa preveri za drug dan`;
}

// ---------------------------------------------------------------------------
// Glavna čista funkcija
// ---------------------------------------------------------------------------

export function validateItineraryGeo(
  itinerary: Itinerary,
  lang: Lang = "sl",
  /** F5.6: indeks nog (realne ceste, OSRM) — opcijsko; brez njega hevristika. */
  legs?: LegRouteIndex
): GeoValidation {
  const days = Array.isArray(itinerary.days) ? itinerary.days : [];
  const dayMetrics: DayGeoMetrics[] = [];
  const issues: GeoValidationIssue[] = [];
  // F5.6: metoda razdalj (razkritje v odgovoru) — štejemo porabljene noge.
  const usedLegs: LegRouteIndex = new Map();

  // F5.5: datum tega dneva ( dan N = tripStartDate + N-1) — SAMO z znanim
  // datumom odhoda. Brez datuma pravili odpiralnih časov NE veljata
  // ( neznani datum = ni poštene trditve o dnevu v tednu/mesecu).
  const tripStart =
    typeof itinerary.tripStartDate === "string"
      ? itinerary.tripStartDate
      : null;

  for (const day of days) {
    const stops = Array.isArray(day.locations) ? day.locations : [];
    const dayNo = typeof day.day === "number" ? day.day : 0;

    // Datum dneva za pravili odpiralnih časov ( izven zanke over stops —
    // izračun enkrat na dan)
    const dayDateMs = tripStart
      ? (() => {
          const iso = dayISOForDayNumber(tripStart, dayNo);
          return iso ? parseISODateLocal(iso) : null;
        })()
      : null;
    const dayMonth = dayDateMs !== null ? new Date(dayDateMs).getMonth() + 1 : null;
    const dayWeekday = dayDateMs !== null ? new Date(dayDateMs).getDay() : null;

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

    // --- pravili 9 + 10 ( F5.5): odpiralni časi — zaprtje meseca/dneva v
    //     tednu. SAMO z znanim datumom + SAMO za preverjene vnose. Raven
    //     zaprtja: destination → ERROR ( soteska JE kraj), mainAttraction →
    //     WARN ( mesto odprto, grad/muzej zaprt). Vir je VEDNO v sporočilu. ---
    if (dayMonth !== null) {
      for (const s of stops) {
        const opening = OPENING.get(s.destination_id);
        const dest = DEST_BY_ID.get(s.destination_id);
        if (!opening || !dest) continue;
        const name = s.destination_name ?? dest.name;

        if (
          opening.closedMonths &&
          opening.closedMonths.includes(dayMonth)
        ) {
          issues.push({
            day: dayNo,
            level: opening.closureLevel === "destination" ? "error" : "warn",
            rule: "closed_month",
            message: msgClosedMonth(
              lang,
              name,
              lang === "en" ? opening.noteEn : opening.note,
              opening.source,
              opening.closureLevel === "destination"
            ),
          });
        } else if (
          dayWeekday !== null &&
          opening.closedWeekdays &&
          opening.closedWeekdays.includes(dayWeekday)
        ) {
          issues.push({
            day: dayNo,
            level: "warn",
            rule: "closed_weekday",
            message: msgClosedWeekday(
              lang,
              name,
              dayWeekday,
              lang === "en" ? opening.noteEn : opening.note,
              opening.source
            ),
          });
        }
      }
    }

    // --- zaporedne noge: razdalje, vožnja, urnik ---
    let kmStraight = 0; // hevristična razdalja (rezerva, kadar ni indeksa)
    let driveH = 0;
    let dayKm = 0; // F5.6: seštevek km nog (realne ceste, kadar so na voljo)
    for (let i = 0; i < stops.length - 1; i++) {
      const a = COORDS.get(stops[i].destination_id);
      const b = COORDS.get(stops[i + 1].destination_id);
      if (!a || !b) continue;
      const leg = legs?.get(
        legKey(stops[i].destination_id, stops[i + 1].destination_id)
      );
      const straight = haversineKm(a, b);
      const roadKm = leg ? leg.km : round5(straight * ROAD_FACTOR);
      const legH = leg ? leg.min / 60 : (straight * ROAD_FACTOR) / AVG_SPEED_KMH;
      kmStraight += straight;
      driveH += legH;
      dayKm += roadKm;
      if (leg) {
        usedLegs.set(
          legKey(stops[i].destination_id, stops[i + 1].destination_id),
          leg
        );
      }

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

    const roadKmDay = dayKm > 0 ? round5(dayKm) : round5(kmStraight * ROAD_FACTOR);
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

  // F5.6: metoda razdalj tega izračuna (razkritje v UI). Brez indeksa
  // (client, stari načrti) polje manjka → panel izpiše hevristiko.
  let method: RoutingMethod | undefined;
  if (legs && usedLegs.size > 0) method = legIndexMethod(usedLegs);
  else if (legs) method = "heuristic";

  return {
    days: dayMetrics,
    issues,
    tripKm,
    worst,
    ...(method ? { method } : {}),
  };
}
