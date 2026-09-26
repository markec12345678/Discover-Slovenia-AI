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
  // M7 (Issue #5 / T5-D): ročno prestavljanje + strukturno urejanje dni
  // (deterministično, 0 AI) — meri uporabo novih kontrol (drag/puščice,
  // dodaj/odstrani dan).
  | "stop_reordered"
  | "day_added"
  | "day_removed"
  // D6-B (Issue #6, M7+): postanek prestavljen v PREJŠNJI/NASLEDNJI dan
  // (props: from_day, to_day) — komplement stop_reordered (znotraj dneva);
  // meri uporabo strelic med dnevi na kartici postanka.
  | "stop_moved_to_day"
  | "itinerary_saved"
  // TASK 28 (Tier 1 #1, live-sync): polling je zaznal NOVEJŠO strežniško
  // različico povezane pote (props: server_version, locale) → banner
  // „posodobljeno drugje"; uporabnik jo je naložil (plan_update_loaded)
  // ali nalaganje ni uspelo (plan_update_load_failed). Meri, ali
  // sodelovanje brez CRDT (prisotnost po polling) dejansko pride v
  // uporabo — komplement 409 konfliktom na pisalni strani (CAS).
  | "plan_update_detected"
  | "plan_update_loaded"
  | "plan_update_load_failed"
  | "map_opened"
  | "provider_detail_opened"
  | "affiliate_clicked"
  | "booking_cta_clicked"
  // ISSUE #11 (D1): klik čipa »Na tržnici od €X« na kartici postanka
  // (props: destination, count, from_price) — meri, ali realne cene
  // tržnice premaknejo uporabnika z načrta proti rezervaciji (D1 vpliv
  // na 12 % provizijski kanal). Komplement booking_cta_clicked (zunanji
  // handoff) — ta dogodek je NOTRANJI prehod na tržnico.
  | "marketplace_stop_cta"
  // GEO-ODGOVORI (Task 29): AI klepet odgovori s kraji na zemljevidu
  // (OSM v bližini + T1 destinacije iz odgovora) — doseg funkcije
  | "chat_geo_answered"
  // 1.46 (kategorija čipi): uporabnik je preklopil kategorijo v filtru
  // geo odgovora (props: category, enabled 0|1, surface chat|overlay)
  // — meri, ali filtri pomagajo pri mešanih odgovorih (hrana+pijača+…)
  | "chat_geo_filtered"
  // 1.47 (zemljevid čipi): preklop kategorije POI filtra na /zemljevid
  // (props: category, enabled 0|1, surface "map") — komplement
  // chat_geo_filtered: meri, ali multi-select čipi pomagajo tudi na
  // brskalnem zemljevidu, in katere kategorije uporabniki iščejo
  // (hrana/nastanitve so bile prej skrite pred uporabniki)
  | "map_poi_filtered"
  // ISSUE #12 (F12-1): iskanje na zemljevidu oddano (props: locale, total,
  // query_len — BREZ besedila poizvedbe, PII disciplina) — meri doseg
  // map-first iskanja („Kaj iščeš?“ nad zemljevidom); skupaj z
  // map_search_result_selected → stopnja uspešnosti zadetkov.
  | "map_search_submitted"
  // ISSUE #12 (F12-1): klik zadetka v rezultatih iskanja na zemljevidu
  // (props: kind destination|listing|experience|product, has_geo 0|1) —
  // meri prehod iskanje → zemljevid (fly-to); has_geo=0 pove, koliko
  // zadetkov je iskreno brez lokacije (izdelki brez geo).
  | "map_search_result_selected"
  // F1 (Supply Map, 1.49.0): viewport poizvedba supply sloja (props: zoom,
  // cats, products, degraded, ms) — strežniški dvojnik: supply_query
  | "supply_map_query"
  // F1: odprt modal produkta s zemljevida ponudbe (props: provider, type,
  // has_price, has_geo)
  | "supply_product_viewed"
  // F1: "Dodaj v moj načrt" iz supply modal/kartice (props: provider, type,
  // has_geo, has_price, stashed)
  | "supply_add_to_plan"
  // 1.42 (GEO → NAČRT): kraj iz AI klepeta dodan v načrt (provenance
  // t1|osm; day; stashed=1, če je čakal v sessionStorage na prvi načrt)
  | "chat_place_added"
  // 1.43: postanek, dodan iz klepeta, odstranjen z enim klikom s kartice
  // postanka (provenance t1|osm; day) — komplement chat_place_added:
  // razmerje doda/odstrani pove, kako dobro AI priporoča kraje
  | "chat_place_removed"
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
  // D3 (nabor #2, Mindtrip "Start Anywhere" s PDF): besedilna plast PDF-ja
  // (unpdf/pdf.js, 0 AI) → isto deterministično ujemanje kot ostali viri
  | "ingest_pdf_attempted"
  | "ingest_pdf_success"
  // TASK 8 / F3-C (issue #8 §25, audit §3 rec 6): atribucija vnosa po
  // NAČINU — "imports per session by entry point". Uspešno zaključen uvoz
  // (povezava/slika/PDF/točke) izstreli EN dogodek z mode propom (dopolnilo
  // obstoječim ingest_*_success dogodkom — enoten prop za primerjavo
  // vstopov; števec na sejo v sessionStorage).
  | "ingest_completed"
  // D2 (nabor #2, Mindtrip audio): zvočni povzetek načrta (TTS; skript je
  // sestavljen deterministično iz podatkov načrta, 0 AI žetonov)
  | "itinerary_audio_requested"
  | "itinerary_audio_ready"
  | "itinerary_audio_failed"
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
  // "computed" = deterministični odgovor — ISSUE #9: EDINA pot, AI fraziranje
  // je odstranjeno; "fallback" = iskren zavrnitev ugibanja)
  | "plan_qa_asked"
  // F13 "Preveri svoj načrt": oddano besedilo TUJEGA načrta v validator
  // (brez AI žetonov; worst = najhujša raven poročila)
  | "plan_check_submitted"
  | "plan_check_completed"
  // F16 "Optimalno zaporedje dneva": uporabnik preuredi postanke dneva z
  // 2-opt/izčrpnim optimizatorjem (deterministično, 0 AI; saved_km = ocena)
  | "day_optimized"
  // Backlog #5 "Postanki na poti": predlogi med postanki dneva s POŠTENIM
  // ovinkom (detour km iz OSRM plasti; count = št. prikazanih predlogov)
  | "leg_suggestions_expanded"
  | "leg_suggestion_added"
  // ISSUE #4 §22 (val 5): razveljavljen zadnji DESTRUKTIVEN prehod (props:
  // label refine|regeneracija, count ostanka) — "AI refinement ne sme
  // nepreklicno prepisati tripa"; meri, ali undo dejansko rešuje.
  | "itinerary_undo"
  // §22: posodobitev NA MESU (PATCH) ni uspela (409/napaka) — iskren padec
  // v klasično pot (POST → nova povezava); meri pogostost konfliktov.
  | "save_inplace_fallback"
  // Backlog #6 "Kosilo na dolgi etapi": svetovalni predlog kosila (kind =
  // arrive | depart | enroute | honest; leg_min/day_drive_min = kontekst
  // sprožilca ≥ 75 min etapa ali ≥ 120 min dan)
  | "meal_suggestion_shown"
  | "meal_suggestion_dismissed"
  // Neuspehi
  | "planner_error"
  | "planner_validation_failed"
  | "empty_result"
  | "invalid_location"
  | "unrealistic_day"
  | "save_failed"
  | "refine_failed"
  // TASK 4 / K-4 (UX FIX PASS): preklic dolgega refine klica (props: via,
  // action, placement, elapsed_seconds) — NAMERNA izbira, ne napaka
  | "refine_cancelled"
  // TASK 4 / K-4: 90 s klient varovalka refine klica (isti pomen kot
  // planner_error stage=timeout, ločeno ime za ločbo od generacije)
  | "refine_timeout"
  // TASK 4 / K-7: AI itinerer zagnan v Go Mode (props: via, days,
  // persisted) — most PLAN → GO, ki ga revizija ni imela
  | "go_mode_started"
  // TASK 77: uporabnik je kliknil Prekliči med generiranjem (props: elapsed
  // v s) — NAMERNA izbira, ne napaka; meri, kako pogosto so čakalne dobe
  // nedopustne in ali gumb rešuje ujetost v skeletu
  | "planner_cancelled"
  // TASK 89: uspešen začetek predvajanja zvočnega povzetka dneva (props:
  // day, lang, surface planner|shared|mytrip — TASK 91 razširi na MY TRIP,
  // bytes) — doseg TTS zmožnosti
  | "itinerary_audio_play"
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

/** TASK 99 — javni anonimni ID seje (isti vir kot analitika; brez PII).
 *  Uporablja ga JourneyBooking prekrivka (efemerne EXTERNAL vrstice). */
export function plannerSessionId(): string {
  return getSessionId();
}

// ---------------------------------------------------------------------------
// TASK 8 / F3-C (issue #8 §25, audit §3 rec 6): atribucija vnosa po načinu.
// Minimalen DODATNI števec na sejo (sessionStorage, brez PII): vsak uspešen
// uvoz vira poveča števcem za ta način in izstreli en `ingest_completed`
// dogodek z { mode, session_count } — "imports per session by entry point"
// je tako merljiv brez prestrukturiranja obstoječe analitike.
// ---------------------------------------------------------------------------

/** Način vnosa vira (zavihki bloka #start-kjerkoli). */
export type IngestMode = "link" | "image" | "pdf" | "pins";

const INGEST_COUNT_KEY = "dsa_planner_ingest_count";

function bumpIngestCount(mode: IngestMode): number {
  try {
    const raw = sessionStorage.getItem(INGEST_COUNT_KEY);
    const counts = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const current =
      typeof counts[mode] === "number" && Number.isFinite(counts[mode])
        ? (counts[mode] as number)
        : 0;
    const next = current + 1;
    counts[mode] = next;
    sessionStorage.setItem(INGEST_COUNT_KEY, JSON.stringify(counts));
    return next;
  } catch {
    // Zasebni način / poln sessionStorage — dogodek izstreli vseeno
    // (števcem te seje pa ne moremo povečati).
    return 1;
  }
}

/**
 * Uspešno zaključen uvoz vira (katerikoli vhodni način). DODATNO obstoječim
 * `ingest_*_success` dogodkom (ti ostanejo nespremenjeni) — ta dogodek nosi
 * ENOTEN `mode` prop, da se uspešni uvozi po vstopih (povezava/slika/PDF/
 * točke) neposredno primerjajo v analitiki.
 */
export function trackIngestCompleted(mode: IngestMode): void {
  trackPlannerEvent("ingest_completed", {
    mode,
    session_count: bumpIngestCount(mode),
  });
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
