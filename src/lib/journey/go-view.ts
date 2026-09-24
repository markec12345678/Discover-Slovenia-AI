// ============================================================================
// TASK 64 — GO MODE „NA POTI": NOW & NEXT SOPOTNIK (čista plast, 1.64.0)
// ============================================================================
// Iz obstoječe MY TRIP časovnice (buildMyTrip) izpelje pogled ZA MED
// POTOVANJEM: kaj je ZDAJ, kaj je NASLEDNJE, razdalja/smer do naslednjega
// postanka (GPS) in opravljene postanke. ČISTA, deterministična funkcija
// (0 omrežja, 0 db, 0 localStorage) — testirljiva.
//
// ISKRENOST (isti kanon kot trip-view §20/§23):
//  - NASLEDNJI postanek je prvi NE-opravljeni po VRSTNEM REDU načrta.
//    Časovne ocene (countdown) se izračunajo SAMO iz realnih časov vira
//    (uporabnikov vpis / trajanje transferja) — NIKOLI iz odpiralnih ur,
//    ker OSM opening_hours NE parsamo (zlogovno zapletena sintaksa).
//  - RAZDALJA je haversine PREMICA („v zraku"), izrecno NE vozna razdalja
//    (vozna bi zahtevala OSRM routing na klientu — lažje je iskren label).
//  - SMER je kompasni azimut → kardinalna smer (sever/severovzhod/…).
//  - Brez GPS ali brez geo na postanku → razdalja/smer PREPROSTO NI
//    (undefined), z iskreno opombo — NE izmišljujemo.
//  - doneKeys so uporabnikovi lastni kliki (naprava) — niso rezervacija.
// ============================================================================

import { haversineKm } from "@/lib/geo-corridor";
import type { DayRouteSummary, MyTripDay, MyTripView, TripEntry } from "./trip-view";

// ---------------------------------------------------------------------------
// VHODNE OBLIKE
// ---------------------------------------------------------------------------

/** Živi GPS položaj (iz navigator.geolocation — klient). */
export interface GoPosition {
  lat: number;
  lng: number;
  /** Natančnost v metrih (coords.accuracy) — lahko manjka. */
  accuracyM?: number;
  timestamp: number; // ms epoch
}

/** Opravljeni postanki: ključ vnosa → ISO čas opravitve (uporabnikov klik). */
export type GoDoneMap = Record<string, string>;

// ---------------------------------------------------------------------------
// IZHODNE OBLIKE
// ---------------------------------------------------------------------------

/** Ena kartica na časovnici Go Mode. */
export interface GoEntryCard {
  entry: TripEntry;
  /** Premica (haversine) od GPS do postanka — SAMO če obstajata obe geo. */
  distanceKm?: number;
  /** Kardinalna smer do postanka (sever/…) — SAMO če obstajata obe geo. */
  bearingLabel?: { sl: string; en: string };
  /** Minute do realnega začetka (SAMO pri realnem času dneva). */
  countdownMin?: number;
}

/** Pogled „na poti" za en aktiven dan. */
export interface GoView {
  title: { sl: string; en: string };
  destinationLabel: string;
  /** Aktiven dan (datum + zakaj JE ta dan aktiven — iskrenost). */
  activeDayLabel: { sl: string; en: string };
  activeDayNote?: { sl: string; en: string };
  /** ISSUE #4 §8 (val 2): pot dneva (vsota OSRM/hevrističnih nog) — SAMO
   * kjer jo načrt nosi (MyTripDay.route). */
  activeDayRoute?: DayRouteSummary;
  /** Naslednji ne-opravljeni postanek dneva. */
  next?: GoEntryCard;
  /** Ali aktiven dan sploh ima kakšen realen čas (za iskreno opombo). */
  dayHasRealTime: boolean;
  /** Ostali ne-opravljeni postanki dneva (po vrstnem redu načrta). */
  remaining: GoEntryCard[];
  /** Opravljeni postanki aktivnega dne. */
  done: (GoEntryCard & { doneAt: string })[];
  /** Povzetek kasnejših dni (datum + št. postankov). */
  laterDays: { dateLabel: { sl: string; en: string }; count: number }[];
  /** Ali je GPS položaj na voljo (prikaz razdalj). */
  positionAvailable: boolean;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// GEO MATEMATIKA (čista — enaka formula kot geo-corridor/orchestrator)
// ---------------------------------------------------------------------------

/**
 * Kompasni azimut od položaja A do točke B v stopinjah [0, 360).
 * 0 = sever, 90 = vzhod (standardna navigacijska konvencija).
 */
export function bearingDeg(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): number {
  const rad = Math.PI / 180;
  const φ1 = from.lat * rad;
  const φ2 = to.lat * rad;
  const Δλ = (to.lng - from.lng) * rad;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

const CARDINALS: { sl: string; en: string }[] = [
  { sl: "sever", en: "north" }, // 0°
  { sl: "severovzhod", en: "northeast" }, // 45°
  { sl: "vzhod", en: "east" }, // 90°
  { sl: "jugovzhod", en: "southeast" }, // 135°
  { sl: "jug", en: "south" }, // 180°
  { sl: "jugozahod", en: "southwest" }, // 225°
  { sl: "zahod", en: "west" }, // 270°
  { sl: "severozahod", en: "northwest" }, // 315°
];

/** Kardinalna smer azimuta (8 sektorjev po 45°). */
export function cardinalLabel(deg: number): { sl: string; en: string } {
  const d = ((deg % 360) + 360) % 360;
  return CARDINALS[Math.round(d / 45) % 8];
}

// ---------------------------------------------------------------------------
// ČAS (čist — SAMO iz realnih HH:MM virov)
// ---------------------------------------------------------------------------

/** Minute od poldneva za "HH:MM" (neveljaven → null — ne ugibamo). */
function hhmmToMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Minute do realnega začetka vnosa (danes); pretekli/neznan čas → null. */
export function minutesUntilStart(entry: TripEntry, now: Date): number | null {
  if (!entry.time?.start) return null;
  const target = hhmmToMinutes(entry.time.start);
  if (target == null) return null;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return target - nowMin; // negativno = že se je začel (vljudno pokažemo)
}

// ---------------------------------------------------------------------------
// DATUM DNEVA (ločba „danes" — iskrena tudi ko datumov ni)
// ---------------------------------------------------------------------------

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

interface ActiveDay {
  index: number;
  day: MyTripDay;
  note?: { sl: string; en: string };
}

/**
 * Izbere aktivni dan iz časovnice (ISKRENO — z opombo, zakaj):
 *  1. dan z datumom == danes → aktiven (brez opombe);
 *  2. sicer prvi dan z PRIHODNIM datumom → aktiven („še pred njim");
 *  3. sicer dan 1 z datumom v preteklosti → aktiven („po datumih konec");
 *  4. dan 1 brez datuma (datum prihoda ni vnesen) → aktiven (iskrena opomba).
 */
function pickActiveDay(days: MyTripDay[], now: Date): ActiveDay | null {
  if (days.length === 0) return null;
  const today = isoOf(now);

  for (let i = 0; i < days.length; i++) {
    if (days[i].date === today) return { index: i, day: days[i] };
  }

  const firstFuture = days.findIndex((d) => d.date != null && d.date > today);
  if (firstFuture >= 0) {
    return {
      index: firstFuture,
      day: days[firstFuture],
      note: {
        sl: "Ta dan se še ni začel — postanke kažemo po vrstnem redu načrta.",
        en: "This day has not started yet — stops are shown in plan order.",
      },
    };
  }

  const day1 = days[0];
  if (day1.date != null) {
    // Vsi datumi so v preteklosti (ali dan 1 pretečen) → pokaži zadnji dan
    // z vnosi in iskreno opombo.
    let lastDated = 0;
    for (let i = 0; i < days.length; i++) {
      if (days[i].date != null) lastDated = i;
    }
    return {
      index: lastDated,
      day: days[lastDated],
      note: {
        sl: "Po datumih načrta je potovanje za teboj — preveri, če je kaj ostalo.",
        en: "By the plan's dates the trip is behind you — check if anything is left.",
      },
    };
  }

  return {
    index: 0,
    day: day1,
    note: {
      sl: "Datum prihoda ni vnesen — prikazan je prvi dan načrta.",
      en: "Arrival date not entered — showing the first day of the plan.",
    },
  };
}

// ---------------------------------------------------------------------------
// GLAVNI GRADILNIK
// ---------------------------------------------------------------------------

function toCard(
  entry: TripEntry,
  position: GoPosition | null,
  isToday: boolean,
  now: Date
): GoEntryCard {
  const card: GoEntryCard = { entry };
  if (position && entry.lat != null && entry.lng != null) {
    const km = haversineKm(position.lat, position.lng, entry.lat, entry.lng);
    card.distanceKm = Math.round(km * 10) / 10;
    card.bearingLabel = cardinalLabel(
      bearingDeg(position, { lat: entry.lat, lng: entry.lng })
    );
  }
  if (isToday && entry.time?.start) {
    const cd = minutesUntilStart(entry, now);
    if (cd != null) card.countdownMin = cd;
  }
  return card;
}

/**
 * Zgradi NOW & NEXT pogled iz MY TRIP + živega časa (+ opcionalno GPS) +
 * uporabnikovih opravljenih postankov. ČISTO — brez stranskih učinkov.
 */
export function buildGoView(
  trip: MyTripView,
  now: Date,
  position: GoPosition | null,
  done: GoDoneMap
): GoView {
  const active = pickActiveDay(trip.days, now);
  const isToday = active?.day.date === isoOf(now);

  const entries = active?.day.entries ?? [];
  const notDone: TripEntry[] = [];
  const doneCards: (GoEntryCard & { doneAt: string })[] = [];
  for (const e of entries) {
    const doneAt = done[e.key];
    if (doneAt && typeof doneAt === "string") {
      doneCards.push({ ...toCard(e, position, isToday, now), doneAt });
    } else {
      notDone.push(e);
    }
  }

  const [nextEntry, ...restEntries] = notDone;
  const next =
    nextEntry != null ? toCard(nextEntry, position, isToday, now) : undefined;
  const remaining = restEntries.map((e) => toCard(e, position, isToday, now));

  const laterDays =
    active == null
      ? []
      : trip.days.slice(active.index + 1).map((d) => ({
          dateLabel: d.dateLabel,
          count: d.entries.length,
        }));

  const dayHasRealTime = entries.some((e) => e.time?.start != null);

  return {
    title: {
      sl: `NA POTI — ${trip.title.sl.replace(/^MOJA POT — /, "")}`,
      en: `ON THE ROAD — ${trip.title.en.replace(/^MY TRIP — /, "")}`,
    },
    destinationLabel: trip.title.en.replace(/^MY TRIP — /, ""),
    activeDayLabel: active?.day.dateLabel ?? {
      sl: "Ni dni v načrtu",
      en: "No days in the plan",
    },
    ...(active?.note ? { activeDayNote: active.note } : {}),
    ...(active?.day.route ? { activeDayRoute: active.day.route } : {}),
    ...(next != null ? { next } : {}),
    dayHasRealTime,
    remaining,
    done: doneCards,
    laterDays,
    positionAvailable: position != null,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// UI OZNAKE (L vzorec — dvojezične, ISKRENE)
// ---------------------------------------------------------------------------

export const GO_LABELS = {
  positionHint: {
    sl: "Razdalje so PREMICA (v zraku), ne vozne razdalje.",
    en: "Distances are STRAIGHT-LINE (as the crow flies), not driving distances.",
  },
  noPosition: {
    sl: "Vklopi GPS, da vidiš razdaljo in smer do naslednjega postanka.",
    en: "Turn on GPS to see distance and direction to your next stop.",
  },
  noTimesToday: {
    sl: "V načrtu za ta dan ni objavljenih realnih ur — vrstni red je po tvoji izbiri.",
    en: "No real published times for this day — the order is your own choice.",
  },
  noEntryLeft: {
    sl: "Za ta dan ni več odprtih postankov — pogledaj naslednji dan ali oddihni. 🌿",
    en: "No open stops left for this day — check the next day or take a rest. 🌿",
  },
  doneAt: {
    sl: (iso: string) => `opravljeno ob ${iso.slice(11, 16)}`,
    en: (iso: string) => `done at ${iso.slice(11, 16)}`,
  },
  countdown: {
    sl: (min: number) =>
      min > 0
        ? `čez ${min} min`
        : min === 0
          ? "prav zdaj"
          : `pred ${Math.abs(min)} min se je začelo`,
    en: (min: number) =>
      min > 0
        ? `in ${min} min`
        : min === 0
          ? "right now"
          : `started ${Math.abs(min)} min ago`,
  },
} as const;
