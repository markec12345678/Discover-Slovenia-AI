import type { Itinerary, DayPlan, LocationVisit } from "@/lib/types";

/**
 * SANITIZACIJA ITINERERJA NA MEJI ZAUPANJA (revizija 1.33.0, auditorski
 * ugotovitvi 16-c P2 + 16-d P2).
 *
 * Problem: AI JSON izhod (`{...JSON.parse(content), source:"ai"}`) in
 * klientov payload na /api/itinerary/save sta bila NEVALIDIRANA struktura —
 * razlita poljubna oblika:
 *   · `duration: -3` / `estimated_cost: -9999` so tiho zniževali obremenitev
 *     dneva in skupni proračun (downstream Number.isFinite sprejme negativne
 *     vrednosti) ter premagala invariantna pravila;
 *   · `recommendations: "string"` (ne array) je strmoglavil klienta
 *     (`.length > 0` res, `.map` pa ne obstaja);
 *   · `notes: {}` na /pot/[shareId] SSR vrže "Objects are not valid as a
 *     React child" → 500 za vsakega odjemalca deljene povezave;
 *   · `days: 20` čeprav je uporabnik zahteval 3.
 *
 * Rešitev: ta čisti, deterministični "shape guard" teče NA OBEH mejah
 * zaupanja — takoj po JSON.parse AI odgovora (generacija + refine) IN pred
 * persistenco v /api/itinerary/save. Ne zavrne (načrt je nasvet, ne
 * transakcija) — obdrži veljavne dele, izpusti/normalizira neveljavne:
 *   · vsa besedilna polja: typeof string + kap dolžine (ne-string → "");
 *   · številski polji duration/estimated_cost: coercija v Number, clamp
 *     [0.25, 24] h in [0, 5000] € (negativi so bili izkoriščljivi);
 *   · dnevi: array, max 14 (in max `maxDays`, če je podan od vhoda);
 *   · lokacije: array, max 12 na dan (pitni maksimum je bil 6–8);
 *   · recommendations/tips/packingList: array stringov, kap števila/dolžine;
 *   · total_budget: Number ≥ 0.
 *
 * Fallback pot že vedno proizvede pravilne oblike — sanitizer ji ne škodi
 * (idempotentna). Po sanitizaciji velja ISTA invariantna plast (geo
 * validation, quality) na obeh poteh — ni mogoče "obiiti" preverjanja z
 * forsiranjem fallbacka ali pokvarjenim AI odgovorom.
 */

const MAX_DAYS = 14;
const MAX_LOCS_PER_DAY = 12;
const MAX_NOTES_CHARS = 1000;
const MAX_NAME_CHARS = 120;
const MAX_LIST_ITEMS = 20;
const MAX_LIST_ITEM_CHARS = 300;
const MIN_DURATION_H = 0.25;
const MAX_DURATION_H = 24;
const MAX_COST_EUR = 5000;

function asStr(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

function asNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function asStrList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .slice(0, MAX_LIST_ITEMS)
    .map((x) => x.slice(0, MAX_LIST_ITEM_CHARS));
}

/** Sanitizira eno lokacijo (postanek) — vsebuje vsa tveganja zgoraj. */
function sanitizeLocation(raw: unknown): LocationVisit | null {
  if (typeof raw !== "object" || raw === null) return null;
  const loc = raw as Record<string, unknown>;
  const destination_id = asStr(loc.destination_id, 80);
  const destination_name = asStr(loc.destination_name, MAX_NAME_CHARS);
  // Brez imena je postanek neuporaben (zemljevid/UX) — izpusti ga.
  if (!destination_name) return null;
  return {
    destination_id,
    destination_name,
    time_slot: asStr(loc.time_slot, 60),
    // NEGATIVE-FIX: clamp ≥ 0 — prej je -3 znižal day-load (premagal
    // day_overload invarianto) in -9999 € skupni proračun.
    duration: clamp(asNum(loc.duration), MIN_DURATION_H, MAX_DURATION_H),
    estimated_cost: clamp(asNum(loc.estimated_cost), 0, MAX_COST_EUR),
    notes: asStr(loc.notes, MAX_NOTES_CHARS),
    ...(typeof loc.recommendationType === "string"
      ? { recommendationType: loc.recommendationType.slice(0, 40) }
      : {}),
    ...(typeof loc.affiliateType === "string"
      ? { affiliateType: loc.affiliateType.slice(0, 40) }
      : {}),
    ...(typeof loc.category === "string"
      ? { category: loc.category.slice(0, 60) }
      : {}),
    ...(typeof loc.reason === "string"
      ? { reason: loc.reason.slice(0, MAX_LIST_ITEM_CHARS) }
      : {}),
  };
}

/** Sanitizira en dan. */
function sanitizeDay(raw: unknown): DayPlan | null {
  if (typeof raw !== "object" || raw === null) return null;
  const day = raw as Record<string, unknown>;
  const locations = Array.isArray(day.locations)
    ? day.locations
        .map(sanitizeLocation)
        .filter((l): l is LocationVisit => l !== null)
        .slice(0, MAX_LOCS_PER_DAY)
    : [];
  const weather =
    typeof day.weather === "object" && day.weather !== null
      ? {
          condition: asStr((day.weather as Record<string, unknown>).condition, 60),
          temp: clamp(asNum((day.weather as Record<string, unknown>).temp), -60, 60),
        }
      : { condition: "", temp: 0 };
  return {
    day: clamp(Math.round(asNum(day.day)) || 1, 1, MAX_DAYS),
    locations,
    weather,
  };
}

/**
 * Glavna funkcija — sanitizira cel itinerer (AI izhod ali klientov save
 * payload). Vrne NOV objekt (vhoda ne mutira). `maxDays` (opcijsko) je
 * število dni, ki ga je uporabnik ZAHTeval — AI odgovor z več dnevi se
 * poreže na njega (fallback jih generira točno).
 */
export function sanitizeItinerary(raw: unknown, maxDays?: number): Itinerary {
  const obj =
    typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const dayCap = Math.min(MAX_DAYS, Math.max(1, maxDays ?? MAX_DAYS));
  const days = (Array.isArray(obj.days) ? obj.days : [])
    .map(sanitizeDay)
    .filter((d): d is DayPlan => d !== null)
    .slice(0, dayCap)
    // Zaporedno številčenje 1..N (AI rad duplicira day številke).
    .map((d, i) => ({ ...d, day: i + 1 }));

  return {
    days,
    total_budget: Math.max(0, asNum(obj.total_budget)),
    recommendations: asStrList(obj.recommendations),
    tips: asStrList(obj.tips),
    source: obj.source === "fallback" ? "fallback" : "ai",
    ...(Array.isArray(obj.packingList) || typeof obj.packingList === "undefined"
      ? { packingList: asStrList(obj.packingList) }
      : {}),
    ...(typeof obj.rationale === "string"
      ? { rationale: obj.rationale.slice(0, 500) }
      : {}),
    ...(typeof obj.tripStartDate === "string"
      ? { tripStartDate: obj.tripStartDate.slice(0, 10) }
      : {}),
    ...(typeof obj.tripEndDate === "string"
      ? { tripEndDate: obj.tripEndDate.slice(0, 10) }
      : {}),
    // quality / events / geoValidation: deterministično izračunani NADALJE
    // (obogatitev teče po sanitizaciji in jih zamenja/izračuna na novo) —
    // tu jih namerno NE prenašamo iz nezaupanja vrednega vhoda.
  };
}
