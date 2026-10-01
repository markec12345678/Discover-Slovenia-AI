// ============================================================================
// ISSUE #23 — GUIDED PLATFORM EXPERIENCE: klientni snapshot bralca
// ============================================================================
// Sestavi GuidanceInput IZKLJUČNO iz obstoječih kanoničnih virov
// (0 novih virov resnice, 0 podvajanj — issue §2/§8):
//   dai:my-trip-items  → getMyTripItems()      (src/lib/my-trip.ts)
//   dai:my-trips       → getSavedTrips()       (src/lib/my-trips-storage.ts)
//   dai:go-trip        → loadGoTrip()          (src/lib/journey/go-persist.ts)
//   dai:go-progress    → loadGoProgress()      (zgoraj)
//   dai:go-skipped     → loadGoSkipped()       (zgoraj)
//   projekcija         → buildGoView()         (src/lib/journey/go-view.ts)
//
// ZASEBNOST (§16/§30): NE bere GPS pozicije (trak nikoli ne ve, kje si),
// ne bere koordinat v izpis — samo števci + javno ime naslednjega postanka.
// Živi kontekst (arrival/health) obstaja samo znotraj /na-poti seje in ga
// poda klicatelj (go-mode), nikoli localStorage.
// ============================================================================

import { getMyTripItems } from "@/lib/my-trip";
import { getSavedTrips } from "@/lib/my-trips-storage";
import { loadGoProgress, loadGoSkipped, loadGoTrip } from "@/lib/journey/go-persist";
import { buildGoView } from "@/lib/journey/go-view";
import { buildMyTrip } from "@/lib/journey/trip-view";
import type {
  GuidanceGoFacts,
  GuidanceInput,
  GuidanceLiveContext,
  GuidanceSurface,
} from "./types";

export interface ReadGuidanceOptions {
  firstSession: boolean;
  returningUser: boolean;
  /** Živi kontekst (/na-poti seja) — izven njega izpusti. */
  live?: GuidanceLiveContext | null;
}

/**
 * Preberi trenutni snapshot stanja (samo klient — SSR vrne null).
 * Namerno BREZ naročnine/pollinga (§36): klicatelj (hook) osvežuje ob
 * mountu + dogodku `dai:my-trip-changed` + focus.
 */
export function readGuidanceInput(
  surface: GuidanceSurface,
  opts: ReadGuidanceOptions,
): GuidanceInput | null {
  if (typeof window === "undefined") return null;

  const myTripCount = getMyTripItems().length;
  const savedTripsCount = getSavedTrips().length;

  let go: GuidanceGoFacts | null = null;
  const record = loadGoTrip();
  if (record) {
    try {
      const trip =
        record.version === 2
          ? record.view
          : buildMyTrip(record.journey, new Set(record.selectedIds));
      const goView = buildGoView(trip, new Date(), null, loadGoProgress(), {
        skipped: loadGoSkipped(),
      });
      go = {
        active: true,
        remainingToday: goView.remaining.length,
        doneToday: goView.done.length,
        skippedToday: goView.skipped.length,
        laterDayStops: goView.laterDays.reduce((sum, d) => sum + d.count, 0),
        nextStopTitle: goView.next?.entry.title ?? null,
        nextStopGeoKnown: goView.next
          ? goView.next.geo.precision === "exact" ||
            goView.next.geo.precision === "approximate"
          : null,
      };
    } catch {
      // Pokvarjen go zapis se tretira kot da ga ni (isti obrambni vzorec
      // kot loadGoTrip) — iskerno vodimo po prej-pot stanju.
      go = null;
    }
  }

  return {
    surface,
    firstSession: opts.firstSession,
    returningUser: opts.returningUser,
    myTripCount,
    savedTripsCount,
    go,
    live: opts.live ?? null,
  };
}

// ---------------------------------------------------------------------------
// Persistenca vodenega načina (tour) + first-run zastavica — minimalno,
// po vzorcu go-persist.ts (obrambni try/catch, brez sesutja ob polnem
// ali zasebnem localStorage).
// ---------------------------------------------------------------------------

const GUIDED_TOUR_KEY = "dai:guided-tour";
const FIRST_RUN_SEEN_KEY = "dsa_first_run_seen";

/** Ali je "Ne vem — pokaži mi" voden način dejavno (localStorage). */
export function isGuidedTourActive(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(GUIDED_TOUR_KEY) === "1";
  } catch {
    return false;
  }
}

/** Vklopi ("1") oz. izklopi (null) vodeni način. */
export function setGuidedTour(active: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (active) window.localStorage.setItem(GUIDED_TOUR_KEY, "1");
    else window.localStorage.removeItem(GUIDED_TOUR_KEY);
  } catch {
    // zasebni način — vodeni način se izgubi ob refreshu (iskrena meja)
  }
}

/** Ali je uporabnik že videl/potrjeval first-run kartico (trajno). */
export function hasSeenFirstRun(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(FIRST_RUN_SEEN_KEY) === "1";
  } catch {
    return true; // brez localStorage NE prikazujemo (nikoli nadležno)
  }
}

/** Trajno označi first-run kot viden (klik namere ali zaprtje). */
export function markFirstRunSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FIRST_RUN_SEEN_KEY, "1");
  } catch {
    // neblokirajoče
  }
}
