// ============================================================================
// PLANNER ANALYTICS (Faza 4) — merjenje pilotne zlate poti
// ============================================================================
//
// Najpomembnejša metrika NI število ustvarjenih itinererjev, ampak delež
// uporabnikov, ki načrt DOBIJO, ga RAZUMEJO, ga SPREMENIJO ali SHRANIJO in
// bi ga bili pripravljeni dejansko uporabiti. Zato sledimo celemu toku:
//
//   planner_started → planner_submitted → planner_result_rendered
//       → (day_adjusted / planner_refined / map_opened / weather_alternative_used)
//       → itinerary_saved
//   + odpovedi: planner_error, empty_result, invalid_location, unrealistic_day,
//     save_failed, refine_failed, user_abandoned_after_result
//
// Dogodki gredo v AnalyticsEvent (type = "planner_<ime>"), sessionId je
// anonimni UUID v localStorageju (brez PII). Fire-and-forget — nikoli ne
// blokira UI; keepalive pokrije dogodke ob zapiranju strani.
// ============================================================================

export type PlannerEventName =
  // Uspešna pot
  | "planner_started"
  | "planner_submitted"
  | "planner_result_rendered"
  | "planner_refined"
  | "day_adjusted"
  | "stop_replaced"
  | "stop_removed"
  | "itinerary_saved"
  | "map_opened"
  | "provider_detail_opened"
  | "affiliate_clicked"
  | "weather_alternative_used"
  // Neuspehi
  | "planner_error"
  | "empty_result"
  | "invalid_location"
  | "unrealistic_day"
  | "save_failed"
  | "refine_failed"
  | "user_abandoned_after_result";

export type PlannerEventProps = Record<
  string,
  string | number | boolean | null | undefined
>;

const SESSION_ID_KEY = "dsa_planner_sid";

/** Anonimni ID seje (localStorage) — brez PII, regenerira se le počistitev. */
function getSessionId(): string {
  try {
    const existing = localStorage.getItem(SESSION_ID_KEY);
    if (existing) return existing;
    const sid =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(SESSION_ID_KEY, sid);
    return sid;
  } catch {
    return "anon";
  }
}

/** Fire-and-forget dogodek — POST /api/analytics/event (nikoli ne vrže). */
export function trackPlannerEvent(
  name: PlannerEventName,
  props: PlannerEventProps = {}
): void {
  try {
    const body = JSON.stringify({
      name,
      props,
      path:
        typeof window !== "undefined" ? window.location.pathname : undefined,
      sid: getSessionId(),
    });
    fetch("/api/analytics/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Zasebni način / blokiran fetch — tiho
  }
}

// ---------------------------------------------------------------------------
// user_abandoned_after_result — rezultat prikazan, uporabnik ni ne prilagodil
// ne shranil, zapustil je stran. Dokumentirana definicija:
//   - ob prikazu rezultata se zapiše {at, engaged:false} (sessionStorage)
//   - refine/shrani označi engaged:true
//   - ob pagehide/unmount (po ≥ 45 s od prikaza) neangažiran rezultat → dogodek
// ---------------------------------------------------------------------------

const RESULT_STATE_KEY = "dsa_planner_result_state";
/** Koliko časa mora uporabnik videti rezultat, da odhod šteje kot opustitev. */
const ABANDON_AFTER_MS = 45_000;

interface ResultState {
  at: number;
  engaged: boolean;
  days?: number;
  source?: string;
}

function readResultState(): ResultState | null {
  try {
    const raw = sessionStorage.getItem(RESULT_STATE_KEY);
    return raw ? (JSON.parse(raw) as ResultState) : null;
  } catch {
    return null;
  }
}

function writeResultState(state: ResultState): void {
  try {
    sessionStorage.setItem(RESULT_STATE_KEY, JSON.stringify(state));
  } catch {
    // tiho
  }
}

/** Ob uspešnem prikazu rezultata (nov načrt prepiše prejšnje stanje). */
export function markResultRendered(meta: {
  days: number;
  source: string;
}): void {
  writeResultState({ at: Date.now(), engaged: false, ...meta });
}

/** Ob katerikoli aktivni navezavi na rezultat (refine ali shranjevanje). */
export function markResultEngaged(): void {
  const state = readResultState();
  if (state && !state.engaged) {
    writeResultState({ ...state, engaged: true });
  }
}

/**
 * Ali naj se izstreli user_abandoned_after_result? (eno-shot — pobriše stanje,
 * da se nešteje dvakrat). Pokliče se ob pagehide/unmount/ponovnem mountu.
 */
export function fireAbandonedIfUnengaged(): void {
  const state = readResultState();
  if (!state || state.engaged) {
    if (state) sessionStorage.removeItem(RESULT_STATE_KEY);
    return;
  }
  const age = Date.now() - state.at;
  if (age >= ABANDON_AFTER_MS) {
    trackPlannerEvent("user_abandoned_after_result", {
      seconds_viewed: Math.round(age / 1000),
      days: state.days,
      source: state.source,
    });
    sessionStorage.removeItem(RESULT_STATE_KEY);
  }
}
