// ============================================================================
// TASK 64 — GO MODE PERSISTENCA: „dai:go-trip" + „dai:go-progress" (1.64.0)
// ============================================================================
// TravelJourney je živ v React stanju na /potovanje (reload ga izgubi).
// Go Mode persistira NAČRT NA NAPRAVI (localStorage — isti vzorec kot
// dai:my-trips / dai:supply-selection): izbrano potovanje + izbrani ID-ji +
// opravljeni postanki. 0 omrežja, 0 db — zasebno na tej napravi.
//
// ZASEBNOST: shranjujemo SAMO javne podatke virov (naslovi/geo/cene virov)
// in uporabnikove izbire — NE shranjujemo GPS sledi (položaj živi samo v
// pomnilniku komponente med sejo).
//
// Varnost: pokvarjen/poln localStorage NIKOLI ne sesuje aplikacije
// (try/catch + validacija oblike — vzorec my-trips-storage.ts).
// ============================================================================

import type { TravelJourney } from "./types";
import type { MyTripView } from "./trip-view";

const GO_TRIP_KEY = "dai:go-trip";
const GO_PROGRESS_KEY = "dai:go-progress";
const MAX_PROGRESS_KEYS = 200; // varovalka pred napihnjenim zapisi

/** Persistiran zapis Go Mode potovanja (v1 — selektivna migracija po potrebi). */
export interface GoTripRecordV1 {
  version: 1;
  savedAt: string; // ISO
  journey: TravelJourney;
  selectedIds: string[];
}

/**
 * TASK 4 / K-7 (UX FIX PASS, 1.91.0): Go Mode zapis, zgrajen iz AI ITINERERJA
 * (nacrtuj/pot/[shareId] → „Zaženi Na poti"). namesto iz /potovanje
 * TravelJourney strukture. `view` je MyTripView — ISTA oblika, ki jo GoMode
 * izrisuje prek buildGoView, zato 0 novih render konceptov. V1 zapisi
 * (journey) ostanejo podprti — nazaj kompatibilno.
 */
export interface GoTripRecordV2 {
  version: 2;
  kind: "itinerary";
  savedAt: string; // ISO
  view: MyTripView;
}

export type GoTripRecord = GoTripRecordV1 | GoTripRecordV2;

// ---------------------------------------------------------------------------
// Validacija oblike (NE zaupamo poljubnemu JSON-u v storage)
// ---------------------------------------------------------------------------

function isValidJourney(v: unknown): v is TravelJourney {
  if (typeof v !== "object" || v === null) return false;
  const j = v as Record<string, unknown>;
  return (
    typeof j.id === "string" &&
    (j.lang === "sl" || j.lang === "en") &&
    typeof j.origin === "object" &&
    j.origin !== null &&
    typeof j.destination === "object" &&
    j.destination !== null &&
    typeof j.categories === "object" &&
    j.categories !== null &&
    typeof j.totals === "object" &&
    j.totals !== null
  );
}

function isValidRecord(v: unknown): v is GoTripRecord {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  if (r.version === 1) {
    return (
      typeof r.savedAt === "string" &&
      isValidJourney(r.journey) &&
      Array.isArray(r.selectedIds) &&
      r.selectedIds.every((id) => typeof id === "string")
    );
  }
  if (r.version === 2) {
    // K-7: lahkotna oblikovna validacija MyTripView (globoka bi podvajala
    // tip; pokvarjen zapis se tretira kot da ga ni — GoMode prazen stav).
    if (r.kind !== "itinerary" || typeof r.savedAt !== "string") return false;
    const view = r.view as { days?: unknown } | null | undefined;
    if (typeof view !== "object" || view === null) return false;
    if (!Array.isArray(view.days)) return false;
    return view.days.every(
      (d) =>
        typeof d === "object" &&
        d !== null &&
        Array.isArray((d as { entries?: unknown }).entries) &&
        (d as { entries: unknown[] }).entries.every(
          (e) =>
            typeof e === "object" &&
            e !== null &&
            typeof (e as { key?: unknown }).key === "string" &&
            typeof (e as { title?: unknown }).title === "string"
        )
    );
  }
  return false;
}

// ---------------------------------------------------------------------------
// GO TRIP (načrt potovanja na tej napravi)
// ---------------------------------------------------------------------------

/**
 * Shrani trenutno potovanje + izbrane izdelke kot aktivni Go Mode načrt.
 * Vrne true, če je zapis uspel (false: SSR / poljen/zasebni localStorage).
 */
export function saveGoTrip(
  journey: TravelJourney,
  selectedIds: ReadonlyArray<string>
): boolean {
  if (typeof window === "undefined") return false;
  try {
    const record: GoTripRecordV1 = {
      version: 1,
      savedAt: new Date().toISOString(),
      journey,
      selectedIds: [...selectedIds],
    };
    window.localStorage.setItem(GO_TRIP_KEY, JSON.stringify(record));
    return true;
  } catch {
    // Poln ali zasebni localStorage (Safari private mode) — mirno preskoči.
    return false;
  }
}

/**
 * TASK 4 / K-7: shrani AI ITINERER kot aktivni Go Mode načrt (različica 2 —
 * MyTripView iz buildItineraryGoView). Vrne true ob uspehu (false: SSR /
 * poljen/zasebni localStorage). PREPIŠE morebitni obstoječi zapis — Go Mode
 * ima ENO aktivno potovanje (ista semantika kot saveGoTrip v1).
 */
export function saveItineraryGoTrip(view: MyTripView): boolean {
  if (typeof window === "undefined") return false;
  try {
    const record: GoTripRecordV2 = {
      version: 2,
      kind: "itinerary",
      savedAt: new Date().toISOString(),
      view,
    };
    window.localStorage.setItem(GO_TRIP_KEY, JSON.stringify(record));
    return true;
  } catch {
    // Poln ali zasebni localStorage — mirno preskoči.
    return false;
  }
}

/** Preberi aktivni Go Mode načrt (null: ni ga / pokvarjen / SSR). */
export function loadGoTrip(): GoTripRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(GO_TRIP_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidRecord(parsed) ? parsed : null;
  } catch {
    // Pokvarjen JSON — tretiramo kot da ga ni (načrt se na /potovanje
    // zgradi znova; iskreno, ne rešujemo napol podatkov).
    return null;
  }
}

/** Počisti Go Mode načrt (+ progres — skupaj sta eno potovanje). */
export function clearGoTrip(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(GO_TRIP_KEY);
    window.localStorage.removeItem(GO_PROGRESS_KEY);
  } catch {
    // neblokirajoče
  }
}

// ---------------------------------------------------------------------------
// GO PROGRESS (opravljeni postanki — uporabnikovi kliki na tej napravi)
// ---------------------------------------------------------------------------

/** Preberi opravljene postanke (ključ vnosa → ISO čas opravitve). */
export function loadGoProgress(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(GO_PROGRESS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, string> = {};
    let count = 0;
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string" && count < MAX_PROGRESS_KEYS) {
        out[k] = v;
        count++;
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** Zapiši opravljene postanke (celotni map — atomarno). */
export function saveGoProgress(progress: Record<string, string>): void {
  if (typeof window === "undefined") return;
  try {
    const keys = Object.keys(progress);
    if (keys.length === 0) {
      window.localStorage.removeItem(GO_PROGRESS_KEY);
      return;
    }
    // Zadnjih MAX ključev (varovalka pred rastjo).
    const trimmed: Record<string, string> = {};
    for (const k of keys.slice(-MAX_PROGRESS_KEYS)) trimmed[k] = progress[k];
    window.localStorage.setItem(GO_PROGRESS_KEY, JSON.stringify(trimmed));
  } catch {
    // neblokirajoče
  }
}
