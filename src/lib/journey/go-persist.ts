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

const GO_TRIP_KEY = "dai:go-trip";
const GO_PROGRESS_KEY = "dai:go-progress";
const MAX_PROGRESS_KEYS = 200; // varovalka pred napihnjenim zapisi

/** Persistiran zapis Go Mode potovanja (v1 — selektivna migracija po potrebi). */
export interface GoTripRecord {
  version: 1;
  savedAt: string; // ISO
  journey: TravelJourney;
  selectedIds: string[];
}

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
  return (
    r.version === 1 &&
    typeof r.savedAt === "string" &&
    isValidJourney(r.journey) &&
    Array.isArray(r.selectedIds) &&
    r.selectedIds.every((id) => typeof id === "string")
  );
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
    const record: GoTripRecord = {
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
