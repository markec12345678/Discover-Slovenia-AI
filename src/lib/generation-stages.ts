// ============================================================================
// GENERATION STAGES (TASK 77, 1.73.4) — povratna informacija med AI
// generiranjem načrta: čisti časovni račun BREZ Reacta, da ga testi pokrijejo
// deterministično.
// ============================================================================
//
// PROBLEM (odkrit v reviziji UX): generiranje traja 15–40 s; uporabnik je
// gledal NEHOTRE skelete brez števca, brez besedila faze in BREZ IZHODA —
// obešena zahtevka (polh strežnik, izguba omrežja) je pomenila ujetost do
// ročne osvežitve strani, ki bi izgubila obrazec.
//
// REŠITEV v dveh plasteh:
//   1. Ta modul (čista logika): meje faz + format števca + abort razločevalci.
//   2. itinerary-planner.tsx (React): AbortController + Prekliči gumb +
//      aria-live statusna vrstica nad skeleti.
//
// ISKRENOST (kanon nalog 71/74): števec je DEJANSKI pretečeni čas, ne ocena.
// Faze opisujejo DEJANSKI vrstni red dela na strežniku (api/itinerary/route.ts):
//   supply  — vreme (T11) + supply iskanje + ranking engine (vzporedno, hitro)
//   compose — AI sestavljanje (najdaljša faza; glavni porabnik časa)
//   verify  — supply rebound/validacija + geo preverjanje po AI odgovoru
// Meje so ZNAČILNI časi, NE trditev o živem napredku — klient od odgovora
// strežnika ne dobi faznih signalov, zato UI besedilo govori o DELU, ki ga
// strežnik počne, namig "navadno 15–40 s" pa drži obljubo skromno.
//
// PREKLIC vs TIMEOUT (različni semantiki):
//   - uporabnik klikne Prekliči   → abort(ABORT_REASON_CANCEL) → BREZ napake
//     (stanje se vrne na prejšnje; uporabnik je sam izbral konec)
//   - 90 s brez odgovora           → abort(ABORT_REASON_TIMEOUT) → ločena,
//     jasnejša napaka od generične omrežne ("trajalo je predolgo …")

/** Odmor predolge zahteve. Tipični odgovori so 15–40 s → 90 s = 2–3× zgib. */
export const GENERATION_TIMEOUT_SECONDS = 90;

export type GenerationStageKey = "supply" | "compose" | "verify";

export interface GenerationStage {
  key: GenerationStageKey;
  /** Značilen začetek faze v sekundah od odposlane zahteve. */
  typicalStartSeconds: number;
}

/** Faze po vrstnem redu strežniškega dela (glej komentar zgoraj). */
export const GENERATION_STAGES: readonly GenerationStage[] = [
  { key: "supply", typicalStartSeconds: 0 },
  { key: "compose", typicalStartSeconds: 8 },
  { key: "verify", typicalStartSeconds: 30 },
];

/**
 * Faza za danega DEJANSKEGA pretečenega časa (sekunde, floor, negativno → 0).
 * Vrača zadnjo fazo, katere značilen začetek je ≤ pretečeni čas — se pravi
 * 7 s → "supply", 8 s → "compose", 29 s → "compose", 30 s → "verify".
 */
export function generationStageFor(
  elapsedSeconds: number
): GenerationStage {
  const clamped = Number.isFinite(elapsedSeconds)
    ? Math.max(0, Math.floor(elapsedSeconds))
    : 0;
  let current = GENERATION_STAGES[0];
  for (const stage of GENERATION_STAGES) {
    if (stage.typicalStartSeconds <= clamped) {
      current = stage;
    }
  }
  return current;
}

/**
 * Števec "m:ss" (0:07, 1:05, 12:00) — DEJANSKI čas od poslane zahteve.
 * Neveljavni/negativni vnosi se kleščejo na 0:00 (fail-closed, brez izjem).
 */
export function formatGenerationElapsed(totalSeconds: number): string {
  const clamped = Number.isFinite(totalSeconds)
    ? Math.max(0, Math.floor(totalSeconds))
    : 0;
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// --- Abort razločevalci -----------------------------------------------------
// AbortSignal.reason je podprt v vseh ciljnih brskalnikih (Chrome 98+,
// Safari 16+, Firefox 97+); namesto trenutnega razloga prejmemo
// generični AbortError — zato razločujemo prek signala, ne prek izjeme.

export const ABORT_REASON_CANCEL = "dsa:generation-cancel";
export const ABORT_REASON_TIMEOUT = "dsa:generation-timeout";

/** Ali je bil signal prekinjen ZARADI UPORABNIKOVEGA preklica. */
export function isCancelledAbort(signal: AbortSignal): boolean {
  return signal.aborted && signal.reason === ABORT_REASON_CANCEL;
}

/** Ali je bil signal prekinjen ZARADI ODMORA (timeout). */
export function isTimeoutAbort(signal: AbortSignal): boolean {
  return signal.aborted && signal.reason === ABORT_REASON_TIMEOUT;
}
