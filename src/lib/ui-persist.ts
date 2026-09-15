// ============================================================================
// UI-PERSIST (F6) — majhna zunanja shramba za persistirane UI vrednosti
// ============================================================================
//
// Namen: stanje, ki živi v localStorage (odkljuki pakirnega seznama,
// proračunski cilj), povezati z Reactom prek useSyncExternalStore —
// uradni React 19 vzorec za zunanje (ne-React) shrambe:
//
//   - SSR/hidracija: getServerSnapshot vrne privzeto vrednost → strežnik in
//     prvi klient render sta usklajena (NI hydration mismatch), React nato
//     sam prebere klient snapshot in po potrebi re-rendera
//   - snapshot je referenčno STABILEN (cache po raw vrednosti + sig) —
//     sicer bi useSyncExternalStore zagreben neskončno re-render zanko
//   - spremembe gredo NAPREJ prek setter-jev (write + emit) — nikoli
//     "tiho" spreminjanje pod Reactom
//
// Namerno LOČENO od zustand app-store (src/lib/store.ts): to so per-device
// UI preference, ne aplikativno stanje. Brez PII — samo UI vrednosti.
// ============================================================================

// ---------------------------------------------------------------------------
// PAKIRNI SEZNAM — odkljuki (F6.1)
// ---------------------------------------------------------------------------

const PACKING_KEY = "dsa_packing_check";

const EMPTY_CHECKS: Record<string, boolean> = {};

let packingRaw: string | null = null;
let packingSig = "";
let packingSnapshot: Record<string, boolean> = EMPTY_CHECKS;
const packingListeners = new Set<() => void>();

/** Shrani {sig, checked} v localStorage (tiho ob napaki). */
function writePacking(sig: string, checked: Record<string, boolean>): void {
  const payload = JSON.stringify({ sig, checked });
  try {
    localStorage.setItem(PACKING_KEY, payload);
    packingRaw = payload;
  } catch {
    // Zasebni način / poln localStorage — stanje živi naprej v spominu
  }
}

function parsePacking(
  raw: string | null,
  sig: string
): Record<string, boolean> {
  if (!raw) return EMPTY_CHECKS;
  try {
    const parsed = JSON.parse(raw) as {
      sig?: unknown;
      checked?: unknown;
    } | null;
    if (
      parsed &&
      typeof parsed === "object" &&
      parsed.sig === sig &&
      parsed.checked &&
      typeof parsed.checked === "object" &&
      !Array.isArray(parsed.checked)
    ) {
      const clean: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(parsed.checked)) {
        if (typeof v === "boolean") clean[k] = v;
      }
      return clean;
    }
  } catch {
    // Pokvarjen zapis → prazen
  }
  return EMPTY_CHECKS;
}

/** useSyncExternalStore subscribe za pakirne odkljuke. */
export function subscribePacking(cb: () => void): () => void {
  packingListeners.add(cb);
  return () => {
    packingListeners.delete(cb);
  };
}

/** Klient snapshot — STABILEN (cache po raw+sig). */
export function getPackingSnapshot(
  sig: string
): Record<string, boolean> {
  if (typeof window === "undefined") return EMPTY_CHECKS;
  const raw = localStorage.getItem(PACKING_KEY);
  if (raw === packingRaw && sig === packingSig) return packingSnapshot;
  packingSnapshot = parsePacking(raw, sig);
  packingRaw = raw;
  packingSig = sig;
  return packingSnapshot;
}

/** Strežniški snapshot (SSR/hidracija) — vedno prazen. */
export function getServerPackingSnapshot(): Record<string, boolean> {
  return EMPTY_CHECKS;
}

/** Odkljuk/odkljukaj predmet (write + emit). */
export function setPackingChecked(
  sig: string,
  id: string,
  next: boolean
): void {
  const current = getPackingSnapshot(sig);
  const updated: Record<string, boolean> = { ...current, [id]: next };
  writePacking(sig, updated);
  packingSnapshot = updated;
  packingListeners.forEach((l) => l());
}

/** Počisti vse odkljuke za trenutni podpis (write + emit). */
export function resetPacking(sig: string): void {
  writePacking(sig, {});
  packingSnapshot = EMPTY_CHECKS;
  packingListeners.forEach((l) => l());
}

// ---------------------------------------------------------------------------
// PRORAČUNSKI CILJ (F6.2)
// ---------------------------------------------------------------------------

const GOAL_KEY = "dsa_budget_goal";

let goalRaw: string | null = null;
let goalSnapshot: number | null = null;
const goalListeners = new Set<() => void>();

/** useSyncExternalStore subscribe za proračunski cilj. */
export function subscribeBudgetGoal(cb: () => void): () => void {
  goalListeners.add(cb);
  return () => {
    goalListeners.delete(cb);
  };
}

/** Klient snapshot — številka (primitiv, vedno stabilna po vrednosti). */
export function getBudgetGoalSnapshot(): number | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(GOAL_KEY);
  if (raw === goalRaw) return goalSnapshot;
  const n = raw ? Number(raw) : NaN;
  goalSnapshot = Number.isFinite(n) && n > 0 ? n : null;
  goalRaw = raw;
  return goalSnapshot;
}

/** Strežniški snapshot (SSR/hidracija) — vedno brez cilja. */
export function getServerBudgetGoalSnapshot(): number | null {
  return null;
}

/** Nastavi (n > 0) ali počisti (null) proračunski cilj (write + emit). */
export function setBudgetGoal(n: number | null): void {
  if (n !== null && (!Number.isFinite(n) || n <= 0)) n = null;
  try {
    if (n === null) {
      localStorage.removeItem(GOAL_KEY);
      goalRaw = null;
    } else {
      localStorage.setItem(GOAL_KEY, String(n));
      goalRaw = String(n);
    }
  } catch {
    // Zasebni način — vrednost živi naprej v spominu
  }
  goalSnapshot = n;
  goalListeners.forEach((l) => l());
}
