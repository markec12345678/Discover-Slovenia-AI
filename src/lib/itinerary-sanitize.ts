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

  // AUDIT 42 (42-d RED #1): koordinate postanka (supply/chat pini) so se
  // TU IZPUSTILE — AI-odmev_fixed izdelki so izgubili pince, vsi shranjeni/
  // deljeni načrti (/pot/[shareId]) pa ZADETNO vse ne-T1 postanke. Zdaj:
  // končna števila + clamp (±90/±180) — enaka semantika kot vstop v
  // stop-insert.ts. Nezaupanja vredni vnosi (NaN/neskončnost/rob) odpadejo.
  const latNum = asNum(loc.lat);
  const lngNum = asNum(loc.lng);
  const hasLat = Number.isFinite(latNum) && Math.abs(latNum) <= 90;
  const hasLng = Number.isFinite(lngNum) && Math.abs(lngNum) <= 180;

  return {
    destination_id,
    destination_name,
    time_slot: asStr(loc.time_slot, 60),
    // NEGATIVE-FIX: clamp ≥ 0 — prej je -3 znižal day-load (premagal
    // day_overload invarianto) in -9999 € skupni proračun.
    duration: clamp(asNum(loc.duration), MIN_DURATION_H, MAX_DURATION_H),
    estimated_cost: clamp(asNum(loc.estimated_cost), 0, MAX_COST_EUR),
    notes: asStr(loc.notes, MAX_NOTES_CHARS),
    ...(hasLat ? { lat: latNum } : {}),
    ...(hasLng ? { lng: lngNum } : {}),
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
  // TASK 4 / K-2: ohrani resnični marker "sezonska ocena" skozi save/refine
  // meje (gost shranjuje načrt → /pot/[shareId] mora vedeti, da vreme ni
  // realna napoved). Podeduje se SAMO izrecno true; vse ostalo ostane
  // neoznačeno (AI izhod sam po sebi nima pojma o izvoru — določi ga šele
  // enrichWithRealWeather na ruti).
  const weatherEstimated = day.weatherEstimated === true;
  return {
    day: clamp(Math.round(asNum(day.day)) || 1, 1, MAX_DAYS),
    locations,
    weather,
    ...(weatherEstimated ? { weatherEstimated: true } : {}),
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
    // 1.89.1 (Issue #1 FA): "deterministic" (TASK 100 — Brez AI motor) je
    // veljaven vir od types.ts:179 dalje, a ga je stara preslikava vseh
    // ne-fallback vrednosti pretvorila v "ai" — shranjen načrt z 0 LLM
    // žetoni se je na /pot/{shareId} prikazal z napačno oznako "AI načrt"
    // (browser dokaz: e2e-i1-shots/11-share-clean-deterministic-badge.png).
    // Sedaj se veljavna vira (fallback/deterministic) preneseta; vsi ostali
    // nizi, vključno z neveljavnimi, ostanejo "ai" (nezaupan vnos NE more
    // izmisliti tretjega vira).
    source:
      obj.source === "fallback" || obj.source === "deterministic"
        ? obj.source
        : "ai",
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

// ---------------------------------------------------------------------------
// HARDENING I5 — LAHKOTNI OBLIKOVNI PREVERJENIK ZA REFINE MEJO
// ---------------------------------------------------------------------------
// Refine je edina meja zaupanja, ki je klientov `current` itinerer uporabljala
// SUROVEGA (generacija: sanitize po JSON.parse; save: sanitize pred
// persistenco). Popolna sanitizacija bi tukaj ODSTRANILA polja, ki se na
// echo poti ne preračunavajo (events/quality) → minimalna varna različica je
// OBLIKOVNI preverjenik, ki ZAVRNE (400) le dejansko pokvarjene payloade —
// točno razred hrošča, ki ga je shape guard rešil na drugih mejah
// (notes:{} → "Objects are not valid as a React child"; days brez arraya →
// TypeError .map). Veljavni payloadi grejo nespremenjeni.
// ---------------------------------------------------------------------------

/** Ali klientov `current` itinerer ima strukturo, ki jo strežniška koda
 *  (applyQuickAction/validateItinerarySupply/repairScheduleGaps/echo) varno
 *  bere — objekt, dnevi array 1..14, lokacije array, občutljiva nizovna in
 *  številska polja pravih tipov. NE spreminja ničesar — samo preverja. */
export function hasItineraryShape(raw: unknown): boolean {
  if (typeof raw !== "object" || raw === null) return false;
  const it = raw as Record<string, unknown>;
  if (!Array.isArray(it.days) || it.days.length < 1 || it.days.length > 14) {
    return false;
  }
  // crash-razred: strežnik bere .days.map, klient ( echo) pa React otroke
  if (it.recommendations !== undefined && !isStringArray(it.recommendations)) {
    return false;
  }
  if (it.tips !== undefined && !isStringArray(it.tips)) return false;
  if (it.packingList !== undefined && !isStringArray(it.packingList)) {
    return false;
  }
  if (it.total_budget !== undefined && !isFiniteNumber(it.total_budget)) {
    return false;
  }
  for (const d of it.days) {
    if (typeof d !== "object" || d === null) return false;
    const day = d as Record<string, unknown>;
    if (!Array.isArray(day.locations) || day.locations.length > 24) {
      return false;
    }
    if (day.weather !== undefined && !isWeatherShape(day.weather)) {
      return false;
    }
    for (const l of day.locations) {
      if (typeof l !== "object" || l === null) return false;
      const loc = l as Record<string, unknown>;
      // React-otrok razred: nizi morajo biti nizi (notes:{} je padal SSR)
      for (const field of [
        "destination_name",
        "notes",
        "reason",
        "category",
        "time_slot",
      ]) {
        if (loc[field] !== undefined && typeof loc[field] !== "string") {
          return false;
        }
      }
      for (const field of [
        "duration",
        "estimated_cost",
        "lat",
        "lng",
      ]) {
        if (loc[field] !== undefined && !isFiniteNumberOrNull(loc[field])) {
          return false;
        }
      }
    }
  }
  return true;
}

function isStringArray(v: unknown): boolean {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function isFiniteNumber(v: unknown): boolean {
  return typeof v === "number" && Number.isFinite(v);
}

function isFiniteNumberOrNull(v: unknown): boolean {
  return v === null || isFiniteNumber(v);
}

function isWeatherShape(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return false;
  const w = v as Record<string, unknown>;
  return (
    (w.condition === undefined || typeof w.condition === "string") &&
    (w.temp === undefined || isFiniteNumber(w.temp))
  );
}
