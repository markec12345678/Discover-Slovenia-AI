// ============================================================================
// ISSUE #21 — LIVE TRIP NAVIGATOR: TRAVEL STATE (čista plast, 1.159.0)
// ============================================================================
// Kanonični TRAVEL state postanka — VESLOJ LOČEN od rezervacijskega statusa
// (JourneyBooking / TripItemStatus). Rezervacija = resnica ponudnika;
// travel = uporabnikova realnost gibanja. GPS prihod NIKOLI ne potrdi
// rezervacije — to sta DVE LOČENI RESNICI (Issue #21 §3, §7).
//
// DETERMINIZEM (§5, §22-8): celoten modul je čista funkcija istih vhodov —
// 0 omrežja, 0 db, 0 localStorage, 0 AI. Iz istih vhodov VEDNO isti izhod
// (testirljivo, reproducibilno — iskrenostni kanon projekta).
//
// ARRIVAL DETECTION (§7): prag prihoda je odvisen od natančnosti fiksacije
// (slaba fiksacija razširi prag do stropa), stanje ima HYSTEREZO (GPS šum
// ne utripa stanj) in MINIMALNO ČASOVNO STABILNOST (prihod mora vzdržati,
// preden ga smemo izpisati). Velika območja/parkirišča: prag je fiksen in
// iskreno dokumentiran — ne izmišljujemo območij objektov.
//
// ZASEBNOST (§16): ta plast NE shranjuje ničesar — kontekst stanja drži
// klicnik (GoMode v refu seje); lokacija ne gre nikamor.
// ============================================================================

import { haversineKm } from "@/lib/geo-corridor";

// ---------------------------------------------------------------------------
// TIP — TRAVEL STATE (§3: ločeno od reservation state)
// ---------------------------------------------------------------------------

/**
 * Potovalni status postanka (NIKOLI rezervacijski status).
 * - upcoming     — prihodnji postanek dneva (ni trenutno relevanten)
 * - active       — NASLEDNJI postanek (brez GPS konteksta: ne poznamo bližine)
 * - navigating   — aktiven + GPS daleč (razdalja znana, zunaj NEAR območja)
 * - near_destination — aktiven + GPS znotraj NEAR območja (»Približuješ se«)
 * - arrived      — aktiven + STABILEN prihod (geofence + hystereza + čas)
 * - completed    — uporabnik je IZRECNO potrdil zaključek (done mapa)
 * - skipped      — uporabnik je izrecno preskočil (skip mapa — ročni nadzor)
 */
export type TravelStatus =
  | "upcoming"
  | "active"
  | "navigating"
  | "near_destination"
  | "arrived"
  | "completed"
  | "skipped";

/** Zaznava prihoda (interni klasifikator — ločen od TravelStatus). */
export type ArrivalState = "unknown" | "far" | "near" | "arrived";

// ---------------------------------------------------------------------------
// KONFIGURACIJA (konfigurabilna pravila — Issue #21 §7)
// ---------------------------------------------------------------------------

export interface ArrivalConfig {
  /** Radij »Približuješ se« v metrih (izstop z histerezo). */
  nearM: number;
  /** Osnovni prag prihoda v metrih (tipičen POI/parkirišče). */
  arriveBaseM: number;
  /** Priklenek ob znani natančnosti fiksacije (accuracyM + konstanta). */
  arriveAccuracyGainM: number;
  /** STROP praga prihoda — slaba fiksacija NE razširi preko (iskrenost). */
  arriveMaxM: number;
  /** Hystereza izstopa iz stanja (vstop takojšen, izstop čez prag+histereza). */
  hysteresisM: number;
  /** Prihod mora vzdržati toliko ms, preden je STABILEN (izpisljiv). */
  minStableMs: number;
}

/** Kanon projekta (testno zaklenjen — sprememba zahteva osvežitev testov). */
export const DEFAULT_ARRIVAL_CONFIG: ArrivalConfig = {
  nearM: 300,
  arriveBaseM: 60,
  arriveAccuracyGainM: 10,
  arriveMaxM: 150,
  hysteresisM: 75,
  minStableMs: 8_000,
};

/** Prag zastarele GPS fiksacije (prikaz starosti — ne izrekamo svežine). */
export const STALE_POSITION_MS = 60_000;

// ---------------------------------------------------------------------------
// VHODNE OBLIKE (strukturne — GoPosition je strukturno združljiv)
// ---------------------------------------------------------------------------

/** Živi položaj (strukturno enak GoPosition iz go-view — brez krožnega uvoza). */
export interface TravelPosition {
  lat: number;
  lng: number;
  accuracyM?: number;
  timestamp: number; // ms epoch
}

/** Ciljni postanek (samo geo plat — TripEntry je strukturno združljiv). */
export interface TravelStop {
  lat?: number;
  lng?: number;
}

/**
 * Kontekst zadnjega stanja prihoda — ga drži klicnik PER entryKey v seji
 * (GoMode ref; NI persistiran — po refreshu se klasifikacija začne na novo,
 * kar je iskreno in brez zgodovine sledenja na disku).
 */
export interface ArrivalContext {
  /** Za kateri postanek (TripEntry.key) kontekst velja. */
  key: string;
  state: ArrivalState;
  /** Kdaj (epoch ms) je trenutno stanje nastopilo (za stabilnost). */
  sinceMs: number;
  /** Zadnja znana razdalja (m) — samo informativno. */
  lastDistanceM?: number;
}

// ---------------------------------------------------------------------------
// GEO POMOŽNE (čiste)
// ---------------------------------------------------------------------------

/** Veljavne koordinate postanka (±90/±180, končni, ne null-island 0,0). */
export function hasValidStopGeo(stop: TravelStop | null | undefined): boolean {
  if (stop == null) return false;
  const { lat, lng } = stop;
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false; // null island sentinel (kanon projekta)
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/** Razdalja do cilja v METRIH (haversine — isti vir resnice kot go-view). */
export function distanceToStopM(
  position: { lat: number; lng: number } | null | undefined,
  stop: TravelStop | null | undefined
): number | null {
  if (position == null || !hasValidStopGeo(stop)) return null;
  const km = haversineKm(position.lat, position.lng, stop!.lat!, stop!.lng!);
  if (!Number.isFinite(km)) return null;
  return Math.round(km * 1000);
}

/**
 * Prag prihoda glede na natančnost fiksacije:
 *   clamp(arriveBaseM, accuracyM + gain, arriveMaxM)
 * Brez znane natančnosti → osnovni prag. Slaba fiksacija (npr. 800 m) NE
 * razširi praga preko stropa — takrat iskreno ostanemo pri »near«.
 */
export function arriveRadiusM(
  accuracyM: number | undefined,
  config: ArrivalConfig = DEFAULT_ARRIVAL_CONFIG
): number {
  if (typeof accuracyM !== "number" || !Number.isFinite(accuracyM) || accuracyM <= 0) {
    return config.arriveBaseM;
  }
  const raw = accuracyM + config.arriveAccuracyGainM;
  return Math.min(
    config.arriveMaxM,
    Math.max(config.arriveBaseM, Math.round(raw))
  );
}

// ---------------------------------------------------------------------------
// KLASIFIKACIJA PRIHODA (hystereza + stabilnost — čista)
// ---------------------------------------------------------------------------

export interface ArrivalInput {
  position: TravelPosition | null | undefined;
  stop: TravelStop | null | undefined;
}

export interface ArrivalResult {
  state: ArrivalState;
  /** Ali stanje »arrived« zdrži ≥ minStableMs (edini izpisljivi prihod). */
  stable: boolean;
  /** Razdalja v metrih (null kadar ni mogoče izračunati — ne izmišlujemo). */
  distanceM: number | null;
  /** Uporabljen prag prihoda (m) — za transparenten prikaz. */
  arriveRadiusM: number | null;
  /** Nov kontekst (null kadar ni geo para — klicnik ga ponastavi). */
  context: ArrivalContext | null;
}

/**
 * Razvrsti bližino/prihod za EN postanek iz živega položaja.
 *
 * Pravila (deterministična, §7):
 *  - brez položaja ALI brez veljavnega geo postanka → unknown (fail-closed:
 *    Discover NE trdi, da pozna bližino);
 *  - d ≤ arriveRadius → arrived (vstop takojšen);
 *  - d ≤ nearM → near;
 *  - sicer far;
 *  - HYSTEREZA izstopa: arrived zdrži, dokler d > radius + hysteresisM ne;
 *    near zdrži, dokler d > nearM + hysteresisM ne (GPS šum ne utripa);
 *  - stabilnost: state === previous.state ohrani sinceMs, sicer nowMs;
 *    stable ⇔ arrived ∧ (nowMs − sinceMs) ≥ minStableMs;
 *  - sprememba postanka (key ne ujema) → kontekst se začne na novo.
 */
export function classifyArrival(
  key: string,
  input: ArrivalInput,
  previous: ArrivalContext | null,
  nowMs: number,
  config: ArrivalConfig = DEFAULT_ARRIVAL_CONFIG
): ArrivalResult {
  const d = distanceToStopM(input.position, input.stop);
  if (input.position == null || d == null) {
    // Fail-closed: brez para ni bližine — NE izmišljujemo (§4 Geo contract).
    return { state: "unknown", stable: false, distanceM: null, arriveRadiusM: null, context: null };
  }

  const radius = arriveRadiusM(input.position.accuracyM, config);

  // Surovi ciljni stanji (brez histereze — za vstop).
  const raw: Exclude<ArrivalState, "unknown"> =
    d <= radius ? "arrived" : d <= config.nearM ? "near" : "far";

  // Hystereza izstopa (samo ZNIŽANJE stanja zadržimo; vzpon je takojšen).
  const prev = previous != null && previous.key === key ? previous : null;
  let state: Exclude<ArrivalState, "unknown"> = raw;
  if (prev != null && prev.state !== "unknown") {
    if (prev.state === "arrived" && raw !== "arrived") {
      if (d <= radius + config.hysteresisM) state = "arrived"; // še znotraj histereze
    } else if (prev.state === "near" && raw === "far") {
      if (d <= config.nearM + config.hysteresisM) state = "near";
    }
  }

  const sinceMs = prev != null && prev.state === state ? prev.sinceMs : nowMs;
  const stable =
    state === "arrived" && nowMs - sinceMs >= config.minStableMs;

  return {
    state,
    stable,
    distanceM: d,
    arriveRadiusM: radius,
    context: { key, state, sinceMs, lastDistanceM: d },
  };
}

// ---------------------------------------------------------------------------
// TRAVEL STATUS (ločitev od rezervacij — §3)
// ---------------------------------------------------------------------------

export interface TravelStatusInput {
  isNext: boolean;
  /** ISO čas opravitve iz done mape (uporabnikov klik) — ima prednost. */
  doneAt?: string | null;
  /** ISO časa preskoka iz skip mape (uporabnikov klik) — ima prednost. */
  skippedAt?: string | null;
  /** Zaznava prihoda (samo za NASLEDNJI postanek). */
  arrival?: { state: ArrivalState; stable: boolean } | null;
}

/**
 * Potovalni status postanka — IZKLJUČNO iz travel vhodov. Ta funkcija NE
 * pozna (in ne sme poznati) rezervacijskih statusov: JourneyBooking ostaja
 * edini vir resnice rezervacij; GPS prihod pomeni samo PRIHOD (§3, §7).
 *
 * Prednost: completed > skipped > (next: arrived > near > navigating > active)
 * > upcoming. »arrived« zahteva STABILNO zaznavo (stabilizacija še teče →
 * iskreno near_destination, nikoli utripajoč prihod).
 */
export function resolveTravelStatus(input: TravelStatusInput): TravelStatus {
  if (input.doneAt) return "completed";
  if (input.skippedAt) return "skipped";
  if (!input.isNext) return "upcoming";
  const a = input.arrival;
  if (a == null || a.state === "unknown") return "active";
  if (a.state === "arrived") return a.stable ? "arrived" : "near_destination";
  if (a.state === "near") return "near_destination";
  return "navigating"; // far
}

// ---------------------------------------------------------------------------
// STAROST FIKSACIJE (§6: zastarel položaj NI svež)
// ---------------------------------------------------------------------------

/** Starost fiksacije v ms (0 za prihodnje ure — ne glede na uro negativna). */
export function positionAgeMs(timestamp: number, nowMs: number): number {
  return Math.max(0, nowMs - timestamp);
}

/** Ali je fiksacija zastarela (starejša od praga — prikaz opombe). */
export function isPositionStale(
  timestamp: number,
  nowMs: number,
  thresholdMs: number = STALE_POSITION_MS
): boolean {
  return positionAgeMs(timestamp, nowMs) >= thresholdMs;
}

// ---------------------------------------------------------------------------
// KLASIFIKACIJA NATANČNOSTI (§6: uporabnik vidi KAKO natančno, ne samo da)
// ---------------------------------------------------------------------------

/** Iskrena razredba natančnosti fiksacije (prikaz + odločitve UI). */
export type AccuracyClass = "high" | "medium" | "low";

/** Praga razredov (m) — testno zaklenjena konstanta (kanon projekta). */
export const ACCURACY_THRESHOLDS = {
  /** high: ±do 50 m — tipičen mestni GPS s patrjenjem. */
  highMaxM: 50,
  /** medium: ±do 200 m — še vedno uporabno za razdaljo/smer. */
  mediumMaxM: 200,
  /** low: čez 200 m — prikaz opozorila; arrival že pokrit prek stropa
   *  arriveMaxM (slaba fiksacija NE razširi praga — iskrenost §7). */
} as const;

/**
 * Razred natančnosti fiksacije. null = natančnost NEZNANA (vir je ni podal)
 * — nikoli ne izmišljujemo razreda (isti kanon kot razdalja: kar ni, ni).
 */
export function accuracyClassOf(accuracyM: number | undefined | null): AccuracyClass | null {
  if (typeof accuracyM !== "number" || !Number.isFinite(accuracyM) || accuracyM < 0) {
    return null;
  }
  if (accuracyM <= ACCURACY_THRESHOLDS.highMaxM) return "high";
  if (accuracyM <= ACCURACY_THRESHOLDS.mediumMaxM) return "medium";
  return "low";
}

/** Oznake razredov (dvojezične — za prikaz ob ±X m). */
export const ACCURACY_CLASS_LABELS: Record<AccuracyClass, { sl: string; en: string }> = {
  high: { sl: "natančnost dobra", en: "accuracy good" },
  medium: { sl: "natančnost srednja", en: "accuracy medium" },
  low: { sl: "natančnost nizka", en: "accuracy low" },
};

// ---------------------------------------------------------------------------
// UI OZNAKE (dvojezične — L vzorec, ISKRENE)
// ---------------------------------------------------------------------------

export const TRAVEL_LABELS: Record<TravelStatus, { sl: string; en: string }> = {
  upcoming: { sl: "Prihodnji postanek", en: "Upcoming stop" },
  active: { sl: "Naslednji postanek", en: "Next stop" },
  navigating: { sl: "Na poti do postanka", en: "On the way to the stop" },
  near_destination: { sl: "Približuješ se", en: "Approaching" },
  arrived: { sl: "Prišel si na lokacijo", en: "You have arrived" },
  completed: { sl: "Zaključeno", en: "Completed" },
  skipped: { sl: "Preskočeno", en: "Skipped" },
};

export const ARRIVAL_LABELS = {
  /** »Približuješ se — 180 m« (samo z dejansko razdaljo). */
  near: {
    sl: (m: number) => `Približuješ se — ${m} m`,
    en: (m: number) => `Approaching — ${m} m`,
  },
  /** Prihod — stabilen (samo stabilized izpis). */
  arrived: {
    sl: (title: string) => `✓ Prišel si na lokacijo ${title}`,
    en: (title: string) => `✓ You have arrived at ${title}`,
  },
  /** Iskrena ločitev dveh resnic: GPS prihod ≠ rezervacija. */
  arrivedHint: {
    sl: "GPS prihod NE potrdi rezervacije — rezervacija ostaja pri ponudniku. Potrdi, ko si res zaključil.",
    en: "GPS arrival does NOT confirm a booking — the booking stays with the provider. Confirm when you are truly done.",
  },
  /** Zastarela fiksacija (NE trdimo svežine). */
  stale: {
    sl: (min: number) => `zadnja fiksacija pred ${min} min`,
    en: (min: number) => `last fix ${min} min ago`,
  },
  /** Prag prihoda (transparentnost klasifikacije). */
  radiusHint: {
    sl: (m: number) => `prihod = GPS znotraj ~${m} m (glede na natančnost)`,
    en: (m: number) => `arrival = GPS within ~${m} m (based on accuracy)`,
  },
} as const;
