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
//     save_failed, refine_failed, result_session_ended_without_action
//
// Dogodki gredo v AnalyticsEvent (type = "planner_<ime>"), sessionId je
// anonimni UUID v localStorageju (brez PII). Fire-and-forget — nikoli ne
// blokira UI; keepalive pokrije dogodke ob zapiranju strani.
//
// P1-2 (recenzija): vsak dogodek nosi eid (clientEventId — UUID generiran
// OB izstrelu). Strežnik ga zapiše v metadata in z njim DEDUPLICIRA
// (podvojeni poskusi ob počasnem omrežju / keepalive retry ne ustvarijo
// dvojne vrstice).
//
// P1-3 (recenzija): result_session_ended_without_action (prej
// user_abandoned_after_result) je PROXY signal, NE dokaz nezadovoljstva:
//   "Rezultat je bil prikazan, vendar v merjenem oknu (~45 s) ni bil zaznan
//    naslednji sledeni dogodek (refine/shrani)."
// Znano podcenjevanje: mobilni brskalniki lahko izpustijo pagehide, odprtje
// zemljevida v novem zavihku se ne sledi, izguba povezave izgleda kot konec.
// Docs: docs/ANALYTICS-EVENTS.md.
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
  // F5.4 "Začni s povezavo" ( url ingest — MindTrip "Start Anywhere")
  | "ingest_url_attempted"
  | "ingest_url_success"
  // F8 "Začni s sliko" ( image ingest — MindTrip "Start Anywhere" s slikami;
  // VLM prebere imena, ujemanje je deterministično)
  | "ingest_image_attempted"
  | "ingest_image_success"
  // F14 "Uvozi shranjene točke" ( pins ingest — Mindtrip "Google Pins";
  // 0 AI žetonov, ujemanje po imenu/koordinatah)
  | "ingest_pins_attempted"
  | "ingest_pins_success"
  // F5.2: izvoz načrta v koledar (.ics)
  | "ics_download"
  // F5.7 (PWA): namestitev aplikacije (gumb v navigaciji)
  | "pwa_install_prompted"
  | "pwa_install_accepted"
  // F6.1: odkljuk predmeta na pametnem pakirnem seznamu
  | "packing_item_checked"
  // F6.2: nastavitev osebnega proračunskega cilja v primerjavo z načrtom
  | "budget_goal_set"
  // F7: shranjen/urejen skupnostni vodnik na deljeni poti (avtor = lastnik)
  | "guide_saved"
  // F9 "Pogovor z načrtom": zastavljeno vprašanje o načrtu (source
  // "computed" = deterministični odgovor; "puter"/"z-ai-sdk" = AI fraziranje
  // dejstev; "fallback" = iskren zavrnitev ugibanja)
  | "plan_qa_asked"
  // F13 "Preveri svoj načrt": oddano besedilo TUJEGA načrta v validator
  // (brez AI žetonov; worst = najhujša raven poročila)
  | "plan_check_submitted"
  | "plan_check_completed"
  // Neuspehi
  | "planner_error"
  | "empty_result"
  | "invalid_location"
  | "unrealistic_day"
  | "save_failed"
  | "refine_failed"
  // P1-3: proxy signal — rezultat prikazan, sledeni dogodek ni bil zaznan
  // v merjenem oknu (NE pomeni "uporabnik ni bil zadovoljen")
  | "result_session_ended_without_action";

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

/** Fire-and-forget dogodek — POST /api/analytics/event (nikoli ne vrže).
 *  P1-2: eid (clientEventId) omogoča strežniško deduplikacijo. */
export function trackPlannerEvent(
  name: PlannerEventName,
  props: PlannerEventProps = {}
): void {
  try {
    const eid =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `e-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const body = JSON.stringify({
      name,
      props,
      eid,
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
// result_session_ended_without_action — PROXY signal (P1-3, prej
// user_abandoned_after_result). Rezultat prikazan, sledeni dogodek (refine /
// shranjevanje) ni bil zaznan v merjenem oknu. Dokumentirana definicija:
//   - ob prikazu rezultata se zapiše {at, engaged:false} (sessionStorage)
//   - refine/shrani označi engaged:true
//   - ob pagehide/unmount (po ≥ 45 s od prikaza) neangažiran rezultat → dogodek
//   - NE pomeni nezadovoljstvo: lahko je branje, zavihek z zemljevidom,
//     izguba povezave ali mobilni brskalnik brez pagehide (podcenjevanje)
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
 * Ali naj se izstreli result_session_ended_without_action? (eno-shot — pobriše
 * stanje, da se nešteje dvakrat). Pokliče se ob pagehide/unmount/ponovnem mountu.
 */
export function fireAbandonedIfUnengaged(): void {
  const state = readResultState();
  if (!state || state.engaged) {
    if (state) sessionStorage.removeItem(RESULT_STATE_KEY);
    return;
  }
  const age = Date.now() - state.at;
  if (age >= ABANDON_AFTER_MS) {
    trackPlannerEvent("result_session_ended_without_action", {
      seconds_viewed: Math.round(age / 1000),
      days: state.days,
      source: state.source,
    });
    sessionStorage.removeItem(RESULT_STATE_KEY);
  }
}
