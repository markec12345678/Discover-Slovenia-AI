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
import type { GoDayLineItem } from "./day-line";
import { resolveStopGeo, type StopGeo } from "./resolve-stop-geo";
import {
  accuracyClassOf,
  classifyArrival,
  isPositionStale,
  resolveTravelStatus,
  type AccuracyClass,
  type ArrivalContext,
  type TravelStatus,
} from "./travel-state";

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
  /** ISSUE #21 §4 (1.161.0) — KANONSKA geo projekcija postanka (ena
   *  resnica o lokaciji: precision exact/approximate/missing/invalid +
   *  vir + naslov; vse odločitve o navigaciji/labelah gredo čeznjo). */
  geo: StopGeo;
  /** Premica (haversine) od GPS do postanka — SAMO če obstajata obe geo. */
  distanceKm?: number;
  /** Kardinalna smer do postanka (sever/…) — SAMO če obstajata obe geo. */
  bearingLabel?: { sl: string; en: string };
  /** Minute do realnega začetka (SAMO pri realnem času dneva). */
  countdownMin?: number;
  /** ISSUE #21 — TRAVEL state (LOČEN od rezervacijskega statusa; samo
   * naslednji postanek ima živi kontekst bližine/prihoda). */
  travel?: {
    status: TravelStatus;
    /** Razdalja do cilja v metrih (SAMO iz dejanske fiksacije). */
    arrivalM?: number;
    /** Ali je prihod STABILEN (geofence + hystereza + min. čas). */
    stable?: boolean;
  };
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
  /** TASK 102 — ISSUE #21 §10/§12: postanek PO trenutnem (»NASLEDNJE PO
   *  TEM«) — prvi iz remaining, SAMO če obstaja (iskrena odsotnost sicer). */
  nextAfter?: GoEntryCard;
  /** TASK 102 — ISSUE #21 §10: SHEMA DNEVA — celoten dan po vrstnem redu
   *  načrta z živimi stanji (opravljen/preskočen/trenutni/prihodnji).
   *  Projekcija ISTIH podatkov (0 novih virov resnice), deluje offline. */
  line: GoDayLineItem[];
  /** Ali aktiven dan sploh ima kakšen realen čas (za iskreno opombo). */
  dayHasRealTime: boolean;
  /** Ostali ne-opravljeni postanki dneva (po vrstnem redu načrta). */
  remaining: GoEntryCard[];
  /** Opravljeni postanki aktivnega dne. */
  done: (GoEntryCard & { doneAt: string })[];
  /** ISSUE #21: uporabniško PRESKOČENI postanki dneva (ročni nadzor §5). */
  skipped: (GoEntryCard & { skippedAt: string })[];
  /** Povzetek kasnejših dni (datum + št. postankov). */
  laterDays: { dateLabel: { sl: string; en: string }; count: number }[];
  /** Ali je GPS položaj na voljo (prikaz razdalj). */
  positionAvailable: boolean;
  /** ISSUE #21: ali je fiksacija ZASTARELA (ne izrekamo svežine — §6). */
  positionStale: boolean;
  /** ISSUE #21 §6 (1.161.0) — razred natančnosti fiksacije (high/medium/
   *  low; null = vir natančnosti ni podal — ne izmišljujemo razreda). */
  positionAccuracyClass: AccuracyClass | null;
  /** ISSUE #21: kontekst prihoda naslednjega postanka (klicnik ga drži v
   * seji — ref; NI persistiran: po refreshu klasifikacija začne na novo). */
  arrivalContext: ArrivalContext | null;
  generatedAt: string;
  /** ISSUE #4 §16 (val 4): DNEVNA NAVIGACIJA — celoten seznam dni za
   * preklapljanje (ročna izbira dneva + povratek na današnjega). Prazno,
   * če je samo en dan. */
  daySwitcher: { index: number; label: { sl: string; en: string }; isToday: boolean }[];
  /** §16: ali je aktiven dan ROČNO izbran (0 = samodejno po datumu). */
  dayManuallySelected: boolean;
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
  const card: GoEntryCard = { entry, geo: resolveStopGeo(entry) };
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
 *
 * ISSUE #4 §16 (val 4): `opts.dayOverride` — ROČNA izbira dneva (dnevna
 * navigacija v Go Mode). Kadar je podan veljaven indeks, se pokaže TA dan
 * (iskrena opomba: ročna izbora, ne današnji datum); `laterDays` sledijo
 * izbranemu dnevu. Brez opts (obstoječi klici) — samodejna izbira po
 * datumu, obnašanje BITNO-IDENTIČNO prejšnjemu.
 *
 * ISSUE #21 — LIVE TRIP NAVIGATOR (1.159.0):
 *  - `opts.skipped` — uporabniško preskočeni postanki (ročni nadzor §5,
 *    ločeno od done: preskočen ≠ opravljen);
 *  - `opts.arrivalContext` — prejšnji kontekst prihoda naslednjega postanka
 *    (hystereza + stabilnost čez fiksacije); buildGoView vrne NOV kontekst
 *    v `view.arrivalContext` (klicnik ga drži v seji — ref);
 *  - naslednji postanek dobi `travel` (navigating / near_destination /
 *    arrived — STABILEN prihod zahteva geofence + hysterezo + min. čas §7).
 *    TRAVEL state je VESLOJ LOČEN od rezervacijskega statusa (§3) — GPS
 *    prihod NIKOLI ne potrdi rezervacije.
 */
export function buildGoView(
  trip: MyTripView,
  now: Date,
  position: GoPosition | null,
  done: GoDoneMap,
  opts?: {
    dayOverride?: number | null;
    /** ISSUE #21: preskočeni postanki (ključ → ISO čas preskoka). */
    skipped?: GoDoneMap;
    /** ISSUE #21: prejšnji kontekst prihoda (za hysterezo/stabilnost). */
    arrivalContext?: ArrivalContext | null;
  }
): GoView {
  const today = isoOf(now);
  const auto = pickActiveDay(trip.days, now);
  const overrideIndex =
    opts?.dayOverride != null &&
    Number.isInteger(opts.dayOverride) &&
    opts.dayOverride >= 0 &&
    opts.dayOverride < trip.days.length
      ? opts.dayOverride
      : null;

  const active =
    overrideIndex != null
      ? {
          index: overrideIndex,
          day: trip.days[overrideIndex],
          note: {
            sl: "Dan ročno izbran — prikaz po načrtu, ne po današnjem datumu.",
            en: "Day selected manually — shown by the plan, not by today's date.",
          },
        }
      : auto;

  const isToday = active?.day.date === today;

  const entries = active?.day.entries ?? [];
  const skippedMap = opts?.skipped ?? {};
  const notDone: TripEntry[] = [];
  const doneCards: (GoEntryCard & { doneAt: string })[] = [];
  const skippedCards: (GoEntryCard & { skippedAt: string })[] = [];
  for (const e of entries) {
    const doneAt = done[e.key];
    const skippedAt = skippedMap[e.key];
    if (doneAt && typeof doneAt === "string") {
      doneCards.push({ ...toCard(e, position, isToday, now), doneAt });
    } else if (skippedAt && typeof skippedAt === "string") {
      // ISSUE #21 §5: preskok je uporabnikova izrecna izbira — postanek
      // IZPADA iz "naslednji" tok (a ostaja danes, Obnovi ga vrne).
      skippedCards.push({ ...toCard(e, position, isToday, now), skippedAt });
    } else {
      notDone.push(e);
    }
  }

  const [nextEntry, ...restEntries] = notDone;

  // ISSUE #21 §18-5 (1.161.0) — STALE-ARRIVAL GUARD: zastarela fiksacija
  // (> STALE_POSITION_MS) NE sme sprožiti near/arrived — uporabnik bi lahko
  // šel 2 km naprej, mi pa bi še vedno trdili „prišel si“. Razdalja/smer na
  // karticah ostanejo (kontekst je uporaben, OZNAČEN kot zastarel), a
  // klasifikacija prihoda prejme null → travel iskreno pade na active.
  const positionStale =
    position != null && isPositionStale(position.timestamp, now.getTime());
  const arrivalPosition = positionStale ? null : position;

  // ISSUE #21 — ARRIVAL DETECTION za naslednji postanek (deterministično:
  // GPS fiksacija + geo postanka + prejšnji kontekst; brez para → unknown,
  // fail-closed — razdalje/prihod preprosto NI, kanon DistanceChip).
  const arrival =
    nextEntry != null
      ? classifyArrival(
          nextEntry.key,
          { position: arrivalPosition, stop: nextEntry },
          opts?.arrivalContext ?? null,
          now.getTime()
        )
      : null;

  const next: GoEntryCard | undefined =
    nextEntry != null
      ? (() => {
          const card = toCard(nextEntry, position, isToday, now);
          // TRAVEL state (LOČEN od rezervacij §3): completed/skipped tu ne
          // moreta nastopiti (naslednji je po definiciji ne-opravljen in
          // ne-preskočen) — izpeljava je poštena in deterministicna.
          const status = resolveTravelStatus({
            isNext: true,
            arrival: arrival
              ? { state: arrival.state, stable: arrival.stable }
              : null,
          });
          return {
            ...card,
            travel: {
              status,
              ...(arrival?.distanceM != null
                ? { arrivalM: arrival.distanceM }
                : {}),
              ...(status === "arrived" ? { stable: true } : {}),
            },
          };
        })()
      : undefined;
  const remaining = restEntries.map((e) => toCard(e, position, isToday, now));

  // TASK 102 — ISSUE #21 §10/§12: »NASLEDNJE PO TEM« — prvi postanek po
  // trenutnem (iskrena odsotnost, ko ga ni — zadnji postanek dneva).
  const nextAfter: GoEntryCard | undefined =
    restEntries.length > 0
      ? toCard(restEntries[0], position, isToday, now)
      : undefined;

  // TASK 102 — ISSUE #21 §10: SHEMA DNEVA — cel dan po VRSTNEM REDU NAČRTA
  // (stanja so projekcija done/skipped/next: done in skipped ohranita svoje
  // mesto v zaporedju; trenutni cilj dobi živi state (arrived SAMO stabilen
  // §7) + razdaljo, kadar je GPS para znana; prihodnji so brez razdalje).
  const line: GoDayLineItem[] = entries.map((e) => {
    const doneAt = done[e.key];
    const skippedAt = skippedMap[e.key];
    const geo =
      typeof e.lat === "number" && typeof e.lng === "number"
        ? { lat: e.lat, lng: e.lng }
        : {};
    if (doneAt && typeof doneAt === "string") {
      return { key: e.key, icon: e.icon, title: e.title, ...geo, state: "done" as const };
    }
    if (skippedAt && typeof skippedAt === "string") {
      return { key: e.key, icon: e.icon, title: e.title, ...geo, state: "skipped" as const };
    }
    if (e.key === nextEntry?.key) {
      return {
        key: e.key,
        icon: e.icon,
        title: e.title,
        ...geo,
        ...(e.time?.start ? { timeStart: e.time.start } : {}),
        state:
          next?.travel?.status === "arrived" ? ("arrived" as const) : ("current" as const),
        ...(arrival?.distanceM != null ? { distanceM: arrival.distanceM } : {}),
      };
    }
    return {
      key: e.key,
      icon: e.icon,
      title: e.title,
      ...geo,
      ...(e.time?.start ? { timeStart: e.time.start } : {}),
      state: "upcoming" as const,
    };
  });

  const laterDays =
    active == null
      ? []
      : trip.days.slice(active.index + 1).map((d) => ({
          dateLabel: d.dateLabel,
          count: d.entries.length,
        }));

  const dayHasRealTime = entries.some((e) => e.time?.start != null);

  // ISSUE #4 §16 (val 4): DNEVNA NAVIGACIJA — celoten seznam dni za
  // preklapljanje (ročna izbira); isToday označi današnji dan (tudi kadar
  // je izbran drug). Prazno pri enodnevnem načrtu (switcher bi bil šum).
  const daySwitcher =
    trip.days.length > 1
      ? trip.days.map((d, i) => ({
          index: i,
          label: d.dateLabel,
          isToday: d.date === today,
        }))
      : [];

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
    ...(nextAfter != null ? { nextAfter } : {}),
    line,
    dayHasRealTime,
    remaining,
    done: doneCards,
    skipped: skippedCards,
    laterDays,
    positionAvailable: position != null,
    positionStale,
    positionAccuracyClass:
      position?.accuracyM != null ? accuracyClassOf(position.accuracyM) : null,
    arrivalContext: arrival?.context ?? null,
    generatedAt: new Date().toISOString(),
    daySwitcher,
    dayManuallySelected: overrideIndex != null,
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
