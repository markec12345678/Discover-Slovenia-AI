// ============================================================================
// ISSUE #22 — TRAVEL GUARDIAN: MORNING / DAY START (čista plast, §13)
// ============================================================================
// ZAČNI DAN povzetek: ob začetku dneva Discover povzame dan iz DEJANSKIH
// podatkov (§13): število postankov, rezervacije (fiksni termini), prvi cilj,
// skupna znana/ocenjena pot (activeDayRoute — OSRM/hecistika z razkritim
// virom), morebitna opozorila (attention konflikti) in manjkajoče podatke
// (postanki brez geo / brez ure). Po kliku uporabnik preide v Live Trip —
// to izvede Go Mode UX (ta modul je SAMO projekcija).
//
// Iskrenost: manjkajoči podatki so IZRECNO navedeni (prvi cilj brez znane
// lokacije itd.) — ne skrivamo lukenj vira.
//
// DETERMINIZEM: 0 omrežja, 0 db, 0 localStorage; `now` je parameter.
// ============================================================================

import type { GoView } from "./go-view";
import type { GuardianConflict } from "./conflict-detect";

// ---------------------------------------------------------------------------
// TIPI
// ---------------------------------------------------------------------------

/** Jutranji povzetek dneva (projekcija GoView + konfliktov). */
export interface DayStartSummary {
  /** Ali je jutranji povzetek sploh primeren (dan se še ni začel / nič opravljenega). */
  applicable: boolean;
  /** Zakaj NI primeren (samo kadar applicable === false — iskreno). */
  notApplicableReason?: { sl: string; en: string };
  /** Skupno število postankov dneva (odprti + opravljeni + preskočeni). */
  stopCount: number;
  /** Število fiksnih terminov (time.start) med ODPRTIMI postanki. */
  fixedCount: number;
  /** Prvi cilj dneva (naslednji odprti postanek). */
  firstStop: { key: string; title: string; timeStart?: string } | null;
  /** Skupna znana pot dneva (SAMO kjer jo načrt nosi — legsKnown/legsTotal). */
  route?: {
    km: number;
    min: number;
    method: "osrm" | "heuristic" | "mixed";
    legsKnown: number;
    legsTotal: number;
  };
  /** Opozorila (attention/warning konflikti — štetje po vrsti). */
  warnings: { kind: GuardianConflict["kind"]; count: number }[];
  /** Manjkajoči podatki: odprti postanki brez navigabilnega geo. */
  missingGeoCount: number;
  /** Manjkajoči podatki: odprti postanki brez kakršnega koli časa. */
  missingTimeCount: number;
}

// ---------------------------------------------------------------------------
// VHOD
// ---------------------------------------------------------------------------

export interface DayStartInput {
  view: GoView;
  now: Date;
  conflicts?: readonly GuardianConflict[];
  /** Ali ima uporabnik GPS že vklopljen (jugran povzetek: dan se je začel). */
  gpsActive: boolean;
}

// ---------------------------------------------------------------------------
// GLAVNA FUNKCIJA
// ---------------------------------------------------------------------------

/**
 * Zgradi jutranji povzetek dneva (ČISTO).
 *
 * applicable = današnji dan + jutro (do 11:00) + nič opravljenih + nič
 * GPS (dan se še ni začel — sicer je uporabnik že "na poti").
 * Kompleksnejše izpeljave namenoma NE obstajajo: povzetek je projekcija,
 * odločitev o prikazu pa je Go Mode UX (en pogoj, nikoli skrito stanje).
 */
export function buildDayStartSummary(input: DayStartInput): DayStartSummary {
  const view = input.view;
  const open = [view.next, ...view.remaining].filter((c): c is NonNullable<typeof c> => c != null);
  const allCount = open.length + view.done.length + view.skipped.length;

  const fixedCount = open.filter((c) => c.entry.time?.start != null).length;
  const first = open[0] ?? null;

  const warningsMap = new Map<GuardianConflict["kind"], number>();
  for (const c of input.conflicts ?? []) {
    if (c.severity === "info") continue; // opozorila, ne opombe
    warningsMap.set(c.kind, (warningsMap.get(c.kind) ?? 0) + 1);
  }

  const missingGeoCount = open.filter(
    (c) => c.geo.precision !== "exact" && c.geo.precision !== "approximate"
  ).length;
  const missingTimeCount = open.filter((c) => c.entry.time?.start == null).length;

  const hour = input.now.getHours();
  const isToday = view.activeDayNote == null && view.line.length > 0; // brez opombe = danes (po #21 pravilih)
  const applicable =
    isToday && hour < 11 && view.done.length === 0 && !input.gpsActive && open.length > 0;

  return {
    applicable,
    ...(applicable
      ? {}
      : {
          notApplicableReason: {
            sl: "Dan se je že začel ali ni današnji — jutranji povzetek ni primeren.",
            en: "The day has already started or is not today — the morning summary does not apply.",
          },
        }),
    stopCount: allCount,
    fixedCount,
    firstStop: first
      ? {
          key: first.entry.key,
          title: first.entry.title,
          ...(first.entry.time?.start != null
            ? { timeStart: first.entry.time.start }
            : {}),
        }
      : null,
    ...(view.activeDayRoute
      ? {
          route: {
            km: view.activeDayRoute.km,
            min: view.activeDayRoute.min,
            method: view.activeDayRoute.method,
            legsKnown: view.activeDayRoute.legsKnown,
            legsTotal: view.activeDayRoute.legsTotal,
          },
        }
      : {}),
    warnings: [...warningsMap.entries()].map(([kind, count]) => ({ kind, count })),
    missingGeoCount,
    missingTimeCount,
  };
}

// ---------------------------------------------------------------------------
// UI OZNAKE (§13 primer + §30 uporabniška imena)
// ---------------------------------------------------------------------------

export const DAY_START_LABELS = {
  title: { sl: "ZAČNI DAN", en: "START THE DAY" },
  greeting: {
    /** (stops, bookings) → pozdrav z dejanskimi številkami. */
    sl: (stops: number, bookings: number) =>
      `Danes imaš ${stops} ${stops === 1 ? "postanek" : "postankov"}${
        bookings > 0
          ? ` · ${bookings} ${bookings === 1 ? "rezervacijo" : "rezervacije"}`
          : ""
      }.`,
    en: (stops: number, bookings: number) =>
      `Today you have ${stops} ${stops === 1 ? "stop" : "stops"}${
        bookings > 0 ? ` · ${bookings} ${bookings === 1 ? "booking" : "bookings"}` : ""
      }.`,
  },
  firstGoal: {
    sl: (title: string) => `Prvi cilj: ${title}`,
    en: (title: string) => `First stop: ${title}`,
  },
  route: {
    sl: (km: number, min: number) => `Znana pot: ~${km} km · ~${min} min.`,
    en: (km: number, min: number) => `Known route: ~${km} km · ~${min} min.`,
  },
  warnings: { sl: "Opozorila za danes", en: "Warnings for today" },
  missing: {
    sl: (noGeo: number, noTime: number) => {
      const parts: string[] = [];
      if (noGeo > 0) parts.push(`${noGeo} brez znane lokacije`);
      if (noTime > 0) parts.push(`${noTime} brez objavljenega časa`);
      return parts.length > 0 ? `Manjka: ${parts.join(" · ")}.` : "";
    },
    en: (noGeo: number, noTime: number) => {
      const parts: string[] = [];
      if (noGeo > 0) parts.push(`${noGeo} without a known location`);
      if (noTime > 0) parts.push(`${noTime} without published times`);
      return parts.length > 0 ? `Missing: ${parts.join(" · ")}.` : "";
    },
  },
  gpsHint: {
    sl: "GPS bo med potjo pokazal tvojo lokacijo, naslednji cilj in navigacijo.",
    en: "During the trip GPS will show your location, the next stop and navigation.",
  },
} as const;
