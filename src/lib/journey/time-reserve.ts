// ============================================================================
// ISSUE #22 — TRAVEL GUARDIAN: TIME RESERVE ENGINE (čista plast)
// ============================================================================
// Kanonični izračun ČASOVNE REZERVE naslednjega postanka (§5):
//   ETA    = now + veljavna ocena vozne traje (hevristika premica ×1,3 / 55 km/h
//            — ISTA čista funkcija kot Go Mode etaInfo; prometa ni, zato je
//            vedno IZRECNO označena kot ocena);
//   rezerva = čas fiksnega termina (time.start) − ETA.
//
// SEMANTIKA ČASOV (§5 — dejansko podprte, ne izmišljene):
//  - fixed_start  — postanek ima time.start (vpis uporabnika / vir) = TRD
//                   termin; SAMO zanj obstaja rezerva;
//  - flexible     — postanek brez realnega časa (timeNote pove zakaj) —
//                   rezerve NI in je ne izmišljujemo.
// Ni check-in oken / time-range semantike — če jih vir kdaj ponudi, se ta
// tip razširi (issue prepoveduje predpostavko, da je vsak čas trd termin).
//
// KAKOVOST V HODU (§18): vsak rezultat nosi DataQuality — VERIFIED (samo
// lastna tržnica geo — a ETA je iz hevristike, zato ETA nikoli ni VERIFIED),
// ESTIMATED (hevristika, approximate geo), STALE (zastarel GPS), MISSING
// (manjkajoč vir), UNKNOWN (sploh ni mogoče izračunati).
//
// DETERMINIZEM (§3, #21 kanon): 0 omrežja, 0 db, 0 localStorage, 0 AI;
// `now` je VEDNO parameter. Iskrenost: slaba fiksacija (> 1 km) in stale
// pozicija NE data rezerve — UNKNOWN (ne lažna umirjenost).
// ============================================================================

import { heuristicLeg } from "@/lib/road-routing";
import {
  isPositionStale,
  accuracyClassOf,
  type AccuracyClass,
} from "./travel-state";
import type { StopGeo } from "./resolve-stop-geo";

// ---------------------------------------------------------------------------
// TIPI
// ---------------------------------------------------------------------------

/** Iskrena razvrstitev kakovosti podatka (§18 — pet razredov). */
export type DataQuality =
  | "VERIFIED" // lastna tržnica / OSRM noga / booking vrstica
  | "ESTIMATED" // hevristika / approximate geo
  | "UNKNOWN" // sploh ni mogoče izračunati
  | "STALE" // podatek obstaja, a je zastarel (GPS fiksacija)
  | "MISSING"; // vir podatka ni podal ničesar

/** Kakšna časovna semantika postanek DEJANSKO ima (raziskava §25/4). */
export type TerminalKind = "fixed_start" | "flexible";

/** Rezultat ocene časa do naslednjega postanka. */
export interface EtaEstimate {
  /** Predvideni prihod "HH:MM" (ista stenska ura kot time.start). */
  hhmm: string;
  /** Minute vožnje od zdaj (zaokroženo na 5 — kanon round5). */
  min: number;
  /** Ocena km (premica ×1,3 — kanon heuristicLeg). */
  km: number;
  /** Vedno ESTIMATED — prometa nimamo, OSRM od žive pozicije ni kanon. */
  quality: DataQuality;
  /** Opomba kakovosti (bilingvalna) — samo kadar ni čista. */
  note?: { sl: string; en: string };
}

/** Rezultat izračuna rezerve za NASLEDNJI postanek. */
export interface TimeReserve {
  /** Ocena rezerve (UNKNOWN = ni mogoče izračunati — ne lažna umirjenost). */
  status: "ON_TIME" | "TIGHT" | "LATE" | "UNKNOWN";
  /** Časovna semantika termina (fixed_start ima rezervo; flexible je brez). */
  terminal: TerminalKind;
  /** ETA — SAMO kadar je izračunljiv (GPS + veljaven geo). */
  eta?: EtaEstimate;
  /** Fiksni termin "HH:MM" — SAMO pri fixed_start. */
  bookingStart?: string;
  /** Rezerva v minutah (start − ETA) — SAMO pri izračunljivi rezervi. */
  reserveMin?: number;
  /** Zakaj rezerve NI (bilingvalno — vedno, kadar status UNKNOWN). */
  reason?: { sl: string; en: string };
  /** Kakovost vhodov (najšibkejši člen — iskrenost). */
  quality: DataQuality;
}

// ---------------------------------------------------------------------------
// KONFIGURACIJA (konfigurabilna — testno zaklenjena, §10)
// ---------------------------------------------------------------------------

export interface ReserveConfig {
  /** Rezerva ≥ tega → ON_TIME (min). */
  onTimeMin: number;
  /** Rezerva ≥ 0 → TIGHT (še izvedljivo; pod 0 = LATE). */
  tightMin: number;
  /** Fiksacija starejša od tega → rezerva NE velja (kanon STALE_POSITION_MS). */
  staleMs: number;
  /** Natančnost fiksacije čez to mejo → ETA NE velja (preveč negotovo). */
  maxAccuracyM: number;
}

/** Kanon projekta (testno zaklenjen — sprememba zahteva osvežitev testov). */
export const DEFAULT_RESERVE_CONFIG: ReserveConfig = {
  onTimeMin: 15,
  tightMin: 0,
  staleMs: 60_000,
  maxAccuracyM: 1_000,
};

// ---------------------------------------------------------------------------
// POMOŽNE (čiste)
// ---------------------------------------------------------------------------

/** "HH:MM" → minute od polnoči (neveljavno → null — ne ugibamo). */
export function hhmmToMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Minute od polnoči → "HH:MM" (dan se vrti — 24h+ vzame ostanek). */
export function minutesToHhmm(totalMin: number): string {
  const m = ((Math.round(totalMin) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Kakovost geo cilja (ista resnica kot StopGeo precision — preslikava §18). */
export function geoQualityOf(geo: StopGeo): DataQuality {
  if (geo.precision === "exact") return "VERIFIED";
  if (geo.precision === "approximate") return "ESTIMATED";
  return "MISSING"; // missing | invalid — vira (ali vrednote) ni
}

/** Kakvost žive fiksacije (§18 — STALE preko kanona STALE_POSITION_MS). */
export function positionQualityOf(
  position: { timestamp: number; accuracyM?: number } | null,
  nowMs: number,
  cfg: ReserveConfig = DEFAULT_RESERVE_CONFIG
): DataQuality {
  if (position == null) return "UNKNOWN";
  if (isPositionStale(position.timestamp, nowMs, cfg.staleMs)) return "STALE";
  return "ESTIMATED";
}

/** Kakvost znane noge (OSRM = preverjena; hevristika = ocena). */
export function routeQualityOf(
  leg: { source: "osrm" | "heuristic" } | null | undefined
): DataQuality {
  if (leg == null) return "MISSING";
  return leg.source === "osrm" ? "VERIFIED" : "ESTIMATED";
}

/** Kakvost rezervacijskega konteksta (vrstica = preverjena; brez = manjka). */
export function bookingQualityOf(
  row: { status: string } | null | undefined
): DataQuality {
  return row != null ? "VERIFIED" : "MISSING";
}

/** Legenda kakovosti (§18 — verified in estimated NISTA enake vizualne teže). */
export const QUALITY_LABELS: Record<DataQuality, { sl: string; en: string }> = {
  VERIFIED: { sl: "preverjeno", en: "verified" },
  ESTIMATED: { sl: "ocena", en: "estimated" },
  UNKNOWN: { sl: "neznano", en: "unknown" },
  STALE: { sl: "zastarelo", en: "stale" },
  MISSING: { sl: "manjka", en: "missing" },
} as const;

const LOW_ACCURACY_NOTE = {
  sl: "natančnost fiksacije je nizka — ocena je groba",
  en: "position accuracy is low — the estimate is rough",
} as const;

// ---------------------------------------------------------------------------
// VHOD
// ---------------------------------------------------------------------------

export interface TimeReserveInput {
  /** Naslednji postanek (strukturno TripEntry — brez krožnega uvoza). */
  next: {
    time?: { start: string; end?: string } | null;
    openingHours?: string;
  };
  /** Kanonska geo projekcija postanka (resolveStopGeo — #21 §4). */
  geo: StopGeo;
  /** Živi GPS položaj (null = GPS izklopljen/dostop zavrnjen). */
  position: { lat: number; lng: number; accuracyM?: number; timestamp: number } | null;
  /** Ali je uporabnik ŽE na lokaciji (arrival state iz #21 — ETA ~ zdaj). */
  arrived?: boolean;
  /** Ura izračuna (vedno parameter — determinizem). */
  now: Date;
  config?: ReserveConfig;
}

// ---------------------------------------------------------------------------
// GLAVNI IZRAČUN
// ---------------------------------------------------------------------------

/**
 * Izračuna časovno rezervo naslednjega postanka (ČISTO).
 *
 * Pravila (deterministična, iskrena):
 *  1. termin: time.start → fixed_start; sicer flexible (rezerve NI);
 *  2. brez GPS / brez veljavnega geo / stale fiksacija / natančnost
 *     > maxAccuracyM → status UNKNOWN z razlogom (ne izmišljujemo ETA);
 *  3. arrived → ETA = zdaj (0 min vožnje; rezerva = termin − zdaj);
 *  4. sicer ETA = hevristika (premica ×1,3 / 55 km/h — kanon Go Mode);
 *  5. rezerva = start − ETA; ≥ onTimeMin → ON_TIME; ≥ 0 → TIGHT; < 0 → LATE;
 *  6. quality = najšibkejši veljaven člen (stale/nizka natančnost → STALE).
 */
export function evaluateTimeReserve(input: TimeReserveInput): TimeReserve {
  const cfg = input.config ?? DEFAULT_RESERVE_CONFIG;
  const startHhmm = input.next.time?.start ?? null;

  // --- 1: časa NI — flexible termin (rezerva ne obstaja; ETA morebitno da)
  if (startHhmm == null) {
    const eta = etaOf(input, cfg);
    return {
      status: "UNKNOWN", // rezerva NI izračunljiva (ni termina)
      terminal: "flexible",
      quality: eta?.quality ?? "UNKNOWN",
      // RAZLOG je vedno povedan (zakaj rezerve ni) — tudi kadar ETA obstaja:
      // ETA brez termina je uporabna informacija, a rezerva je ločena resnica.
      reason: {
        sl: "Postanek nima fiksnega termina — časovna rezerva ne obstaja.",
        en: "The stop has no fixed time — there is no time reserve.",
      },
      ...(eta != null ? { eta } : {}),
    };
  }

  const startMin = hhmmToMinutes(startHhmm);
  if (startMin == null) {
    // Vir je podal neveljaven čas — iskreno: ne moremo računati.
    return {
      status: "UNKNOWN",
      terminal: "fixed_start",
      bookingStart: startHhmm,
      quality: "MISSING",
      reason: {
        sl: "Zapis termina vira ni veljaven — rezerve ni mogoče izračunati.",
        en: "The source time entry is invalid — the reserve cannot be computed.",
      },
    };
  }

  // --- 2: ETA (morda ga ni — fail-closed)
  const eta = etaOf(input, cfg);
  if (eta == null) {
    return {
      status: "UNKNOWN",
      terminal: "fixed_start",
      bookingStart: startHhmm,
      quality: etaQualityOf(input, cfg),
      reason: noEtaReason(input, cfg),
    };
  }

  // --- 3–5: rezerva
  const nowMin = input.now.getHours() * 60 + input.now.getMinutes();
  const etaMin = nowMin + eta.min;
  const reserve = startMin - etaMin;

  const status: TimeReserve["status"] =
    reserve >= cfg.onTimeMin
      ? "ON_TIME"
      : reserve >= cfg.tightMin
        ? "TIGHT"
        : "LATE";

  return {
    status,
    terminal: "fixed_start",
    eta,
    bookingStart: startHhmm,
    reserveMin: reserve,
    quality: eta.quality,
  };
}

// ---------------------------------------------------------------------------
// ZASEBNE POMOŽNE
// ---------------------------------------------------------------------------

function isNavigable(geo: StopGeo): boolean {
  return geo.precision === "exact" || geo.precision === "approximate";
}

/** Kakovost ETA (integer quality za izpis, kadar ETA pač ni mogoč). */
function etaQualityOf(input: TimeReserveInput, cfg: ReserveConfig): DataQuality {
  if (input.position == null) return "UNKNOWN";
  if (!isNavigable(input.geo)) return "MISSING";
  if (isPositionStale(input.position.timestamp, input.now.getTime(), cfg.staleMs)) {
    return "STALE";
  }
  const acc = input.position.accuracyM;
  if (typeof acc === "number" && Number.isFinite(acc) && acc > cfg.maxAccuracyM) {
    return "STALE"; // preveč negotovo — isto iskreno ravnanje kot stale
  }
  return "ESTIMATED";
}

/** ETA iz hevristike (null kadar vhodi ne zadoščajo — fail-closed). */
function etaOf(input: TimeReserveInput, cfg: ReserveConfig): EtaEstimate | null {
  if (input.position == null) return null;
  if (!isNavigable(input.geo) || input.geo.lat == null || input.geo.lng == null) {
    return null;
  }
  if (isPositionStale(input.position.timestamp, input.now.getTime(), cfg.staleMs)) {
    return null; // stale fiksacija — ocene NE izrekamo (#21 §18-5 kanon)
  }
  const acc = input.position.accuracyM;
  if (typeof acc === "number" && Number.isFinite(acc) && acc > cfg.maxAccuracyM) {
    return null;
  }

  // Prisotnost: ETA je zdaj (uporabnik ŽE stoji tam — #21 arrival state).
  const nowMin = input.now.getHours() * 60 + input.now.getMinutes();
  if (input.arrived) {
    return { hhmm: minutesToHhmm(nowMin), min: 0, km: 0, quality: "VERIFIED" };
  }

  const leg = heuristicLeg(
    { lat: input.position.lat, lng: input.position.lng },
    { lat: input.geo.lat, lng: input.geo.lng }
  );
  const accClass: AccuracyClass | null = accuracyClassOf(acc);
  return {
    hhmm: minutesToHhmm(nowMin + leg.min),
    min: leg.min,
    km: leg.km,
    // Hevristika je vedno ESTIMATED (prometa ni) — nikoli VERIFIED.
    quality: "ESTIMATED",
    ...(accClass === "low" ? { note: LOW_ACCURACY_NOTE } : {}),
  };
}

/** Iskren razlog odsotnosti ETA (bilingvalen — za UNKNOWN izpis). */
function noEtaReason(
  input: TimeReserveInput,
  cfg: ReserveConfig
): { sl: string; en: string } {
  if (input.position == null) {
    return {
      sl: "Brez GPS lokacije predvidenega prihoda ni mogoče izračunati.",
      en: "Without a GPS position the estimated arrival cannot be computed.",
    };
  }
  if (!isNavigable(input.geo)) {
    return {
      sl: "Lokacija postanka ni znana — predviden prihod ni mogoč.",
      en: "The stop's location is unknown — no estimated arrival is possible.",
    };
  }
  if (isPositionStale(input.position.timestamp, input.now.getTime(), cfg.staleMs)) {
    return {
      sl: "Zadnja GPS fiksacija je zastarela — predvidenega prihoda ne izrekamo.",
      en: "The last GPS fix is stale — we do not state an estimated arrival.",
    };
  }
  return {
    sl: "Podatkov ni dovolj za oceno prihoda.",
    en: "There is not enough data to estimate the arrival.",
  };
}

// ---------------------------------------------------------------------------
// UI OZNAKE (L vzorec — dvojezične, ISKRENE)
// ---------------------------------------------------------------------------

export const RESERVE_LABELS = {
  onTime: { sl: "Vse teče po načrtu", en: "Everything on schedule" },
  tight: { sl: "Ozek, a izvedljiv prihod", en: "Tight but feasible arrival" },
  late: { sl: "Zamujal bi", en: "You would be late" },
  unknown: { sl: "Ni mogoče oceniti", en: "Cannot be estimated" },
  /** Glavni izpis vrstice rezerve (samo z DEJANSKIMA številama). */
  line: {
    sl: (o: { start: string; eta: string; reserve: number }) =>
      `Naslednja rezervacija ob ${o.start}. Predviden prihod ~${o.eta}. ${
        o.reserve >= 0
          ? `Rezerva ${o.reserve} min.`
          : `Zamuda ${Math.abs(o.reserve)} min.`
      }`,
    en: (o: { start: string; eta: string; reserve: number }) =>
      `Next booking at ${o.start}. Estimated arrival ~${o.eta}. ${
        o.reserve >= 0
          ? `${o.reserve} min to spare.`
          : `${Math.abs(o.reserve)} min late.`
      }`,
  },
} as const;
