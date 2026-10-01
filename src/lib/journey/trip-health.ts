// ============================================================================
// ISSUE #22 — TRAVEL GUARDIAN: TRIP HEALTH + sestavni koren (čista plast, §4)
// ============================================================================
// Strojni izpeljan status AKTIVNEGA dneva: ON_TRACK | NEEDS_ATTENTION |
// BLOCKED | UNKNOWN. Status NI mnenje — izpelje se IZKLJUČNO iz dejstev
// (konflikti + rezerva + izvedljivost), po pravilih, ki jih testi zaklenejo.
//
// NAČELO (§4): »Ne uporabljaj pozitivnega statusa samo zato, ker ni zaznan
// problem.« ON_TRACK zahteva DEJANSKO podprto oceno (izračunljiva rezerva
// ali izvedljiv flexible postanek); nezanesljivi vhodi → UNKNOWN.
//
// buildGuardian() je SESTAVNI KOREN (edina točka, ki jo kliče Go Mode):
//   reserve (time-reserve) → conflicts (conflict-detect) → health.
// ČISTO: 0 omrežja, 0 db, 0 localStorage, 0 AI; `now` je parameter.
// ============================================================================

import type { GoPosition, GoView } from "./go-view";
import {
  evaluateTimeReserve,
  RESERVE_LABELS,
  type TimeReserve,
} from "./time-reserve";
import {
  detectConflicts,
  type ConflictConfig,
  type GuardianConflict,
} from "./conflict-detect";
import type { ReserveConfig } from "./time-reserve";

// ---------------------------------------------------------------------------
// TIP
// ---------------------------------------------------------------------------

/** Strojni status poti/dneva (§4 — štiri stanja, strogo izpeljana). */
export type TripHealth = "ON_TRACK" | "NEEDS_ATTENTION" | "BLOCKED" | "UNKNOWN";

/** Celoten Guardian pogled na aktivni dan (projekcija — nič se ne persistira). */
export interface GuardianSnapshot {
  health: TripHealth;
  /** Naslov stanja (🟢/🟠/🔴/⚪ + uporabniško ime — §30.E, brez tehniških izrazov). */
  headline: { sl: string; en: string };
  /** Ena vrstica dejstev pod naslovom (samo realni podatki). */
  detail: { sl: string; en: string };
  reserve: TimeReserve;
  conflicts: GuardianConflict[];
  /** Prvi attention konflikt (ta ga UX izpiše kot glavno kartico). */
  topConflict: GuardianConflict | null;
}

// ---------------------------------------------------------------------------
// VHOD
// ---------------------------------------------------------------------------

export interface GuardianInput {
  view: GoView;
  now: Date;
  /** Živi GPS položaj (null = izklopljen). */
  position: GoPosition | null;
  /** Dejavne JourneyBooking vrstice (ključ "provider:productId" → status). */
  bookingRows?: readonly { key: string; status: string }[];
  reserveConfig?: ReserveConfig;
  conflictConfig?: ConflictConfig;
}

// ---------------------------------------------------------------------------
// GLAVNA FUNKCIJA (sestavni koren — ena točka za Go Mode)
// ---------------------------------------------------------------------------

/**
 * Zgradi celoten Travel Guardian pogled na aktivni dan (ČISTO).
 *
 * Vrne null, kadar dneva ni kaj ocenjevati (ni odprtih postankov) —
 * Go Mode potem guardian sekcije preprosto ne izriše (iskrena odsotnost).
 */
export function buildGuardian(input: GuardianInput): GuardianSnapshot | null {
  const next = input.view.next;
  if (next == null) return null;

  const arrived = next.travel?.status === "arrived";
  const reserve = evaluateTimeReserve({
    next: {
      time: next.entry.time ?? null,
      openingHours: next.entry.openingHours,
    },
    geo: next.geo,
    position: input.position,
    arrived,
    now: input.now,
    config: input.reserveConfig,
  });

  const conflicts = detectConflicts({
    view: input.view,
    now: input.now,
    reserve,
    bookingRows: input.bookingRows,
    config: input.conflictConfig,
  });

  const { health, headline, detail } = assessTripHealth({
    view: input.view,
    reserve,
    conflicts,
    arrived,
  });

  const topConflict = conflicts.find((c) => c.severity === "attention") ?? null;

  return { health, headline, detail, reserve, conflicts, topConflict };
}

// ---------------------------------------------------------------------------
// OCENA STANJA (§4 — strojno izpeljana)
// ---------------------------------------------------------------------------

export interface HealthInput {
  view: GoView;
  reserve: TimeReserve;
  conflicts: GuardianConflict[];
  arrived: boolean;
}

/**
 * Oceni stanje dneva IZ dejstev (ČISTO):
 *  1. preklicana rezervacija NA naslednjem postanku → BLOCKED (zunanji
 *     pogoj: ponudnikov poseg — brez njega nadaljevanje ni izvedljivo);
 *  2. katerikoli attention konflikt → NEEDS_ATTENTION;
 *  3. fixed termin: ON_TIME/TIGHT → ON_TRACK; UNKNOWN → UNKNOWN
 *     (razen arrived: prisoten si — na pravem mestu);
 *  4. flexible postanek: navigabilen geo → ON_TRACK (izvedljiv, brez
 *     časovnega pritiska); sicer UNKNOWN (izvedljivosti ne moremo oceniti).
 */
export function assessTripHealth(input: HealthInput): {
  health: TripHealth;
  headline: { sl: string; en: string };
  detail: { sl: string; en: string };
} {
  const next = input.view.next!;
  const nextKey = next.entry.key;

  // 1 — BLOCKED: naslednji postanek ima preklicano rezervacijo (zunanji pogoj).
  const cancelledOnNext = input.conflicts.find(
    (c) => c.kind === "CANCELLED_BOOKING" && c.stopKey === nextKey
  );
  if (cancelledOnNext != null) {
    return {
      health: "BLOCKED",
      headline: HEALTH_LABELS.BLOCKED,
      detail: cancelledOnNext.facts,
    };
  }

  // 2 — NEEDS_ATTENTION: prvi attention konflikt določa izpis.
  const attention = input.conflicts.find((c) => c.severity === "attention");
  if (attention != null) {
    return {
      health: "NEEDS_ATTENTION",
      headline: HEALTH_LABELS.NEEDS_ATTENTION,
      detail: attention.facts,
    };
  }

  // 3 — fixed termin: rezerva je odločitveno dejstvo.
  if (input.reserve.terminal === "fixed_start") {
    if (input.reserve.status === "ON_TIME" || input.reserve.status === "TIGHT") {
      return {
        health: "ON_TRACK",
        headline: HEALTH_LABELS.ON_TRACK,
        detail:
          input.reserve.eta != null &&
          input.reserve.bookingStart != null &&
          input.reserve.reserveMin != null
            ? {
                sl: RESERVE_LABELS.line.sl({
                  start: input.reserve.bookingStart,
                  eta: input.reserve.eta.hhmm,
                  reserve: input.reserve.reserveMin,
                }),
                en: RESERVE_LABELS.line.en({
                  start: input.reserve.bookingStart,
                  eta: input.reserve.eta.hhmm,
                  reserve: input.reserve.reserveMin,
                }),
              }
            : HEALTH_LABELS.noNumbers,
      };
    }
    if (input.arrived) {
      // Prisoten si na lokaciji — termin še ni ogrožen (drugače bi bil konflikt).
      return {
        health: "ON_TRACK",
        headline: HEALTH_LABELS.ON_TRACK,
        detail: bilingualOf(HEALTH_LABELS.arrivedBeforeStart, next.entry.title),
      };
    }
    return {
      health: "UNKNOWN",
      headline: HEALTH_LABELS.UNKNOWN,
      detail: input.reserve.reason ?? HEALTH_LABELS.noNumbers,
    };
  }

  // 4 — flexible postanek: izvedljivost = navigabilen geo.
  const navigable =
    next.geo.precision === "exact" || next.geo.precision === "approximate";
  if (navigable) {
    return {
      health: "ON_TRACK",
      headline: HEALTH_LABELS.ON_TRACK,
      detail: bilingualOf(HEALTH_LABELS.flexibleOk, next.entry.title),
    };
  }
  return {
    health: "UNKNOWN",
    headline: HEALTH_LABELS.UNKNOWN,
    detail: bilingualOf(HEALTH_LABELS.flexibleNoGeo, next.entry.title),
  };
}

// ---------------------------------------------------------------------------
// UI OZNAKE (L vzorec — UPORABNIŠKA imena, ne tehniški izrazi §30.E)
// ---------------------------------------------------------------------------

/** Preslikava funkcijske oznake (sl/en) + argument → dvojezični objekt. */
function bilingualOf(
  f: { sl: (a: string) => string; en: (a: string) => string },
  arg: string
): { sl: string; en: string } {
  return { sl: f.sl(arg), en: f.en(arg) };
}

export const HEALTH_LABELS = {
  ON_TRACK: { sl: "🟢 VSE TEČE PO NAČRTU", en: "🟢 EVERYTHING ON SCHEDULE" },
  NEEDS_ATTENTION: {
    sl: "🟠 POTREBUJE TVOJO POZORNOST",
    en: "🟠 NEEDS YOUR ATTENTION",
  },
  BLOCKED: {
    sl: "🔴 ZA NADALJEVANJE JE POTREBEN POSEG",
    en: "🔴 ACTION NEEDED TO CONTINUE",
  },
  UNKNOWN: {
    sl: "⚪ PODATKOV NI DOVOLJ ZA ZANESLJIVO OCENO",
    en: "⚪ NOT ENOUGH DATA FOR A RELIABLE ASSESSMENT",
  },
  arrivedBeforeStart: {
    sl: (title: string) =>
      `✓ Na lokaciji ${title} si — termin se še ni začel, na pravem si mestu.`,
    en: (title: string) =>
      `✓ You are at ${title} — the booking has not started yet; you are in the right place.`,
  },
  flexibleOk: {
    sl: (title: string) =>
      `Naslednji postanek: ${title} — brez fiksnega termina, čas je v tvojih rokah.`,
    en: (title: string) =>
      `Next stop: ${title} — no fixed time; the timing is up to you.`,
  },
  flexibleNoGeo: {
    sl: (title: string) =>
      `Naslednji postanek ${title} nima znane lokacije — izvedljivosti ne moremo oceniti.`,
    en: (title: string) =>
      `The next stop ${title} has no known location — we cannot assess feasibility.`,
  },
  noNumbers: {
    sl: "Rezerve ni mogoče izračunati — vklopi GPS za oceno prihoda.",
    en: "The reserve cannot be computed — turn on GPS for an arrival estimate.",
  },
} as const;
