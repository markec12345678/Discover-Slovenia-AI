// ============================================================================
// SUPPLY SELECTION — persistenca (sessionStorage) — ločena od store-a,
// da ni cirkularnega uvoza store ↔ selection. (F1, 1.49.0)
// ============================================================================

import type { SelectedProviderProduct } from "./types";

/** sessionStorage ključ izbire (dai: predpona — isti imenski prostor). */
export const SUPPLY_SELECTION_KEY = "dai:supply-selection";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof sessionStorage !== "undefined";
}

/** Prebere (NE čisti) izbiro iz sessionStorage — osnovno validirana. */
export function readPersistedSelection(): SelectedProviderProduct[] {
  if (!isBrowser()) return [];
  try {
    const raw = sessionStorage.getItem(SUPPLY_SELECTION_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is SelectedProviderProduct =>
        !!p &&
        typeof p === "object" &&
        typeof (p as SelectedProviderProduct).provider === "string" &&
        typeof (p as SelectedProviderProduct).providerProductId === "string" &&
        typeof (p as SelectedProviderProduct).title === "string"
    );
  } catch {
    return [];
  }
}

/** Zapiše izbiro (tiho preskoči ob polnem/zasebnem sessionStorage). */
export function persistSelection(items: SelectedProviderProduct[]): void {
  if (!isBrowser()) return;
  try {
    sessionStorage.setItem(SUPPLY_SELECTION_KEY, JSON.stringify(items));
  } catch {
    // izbira živi samo v pomnilniku
  }
}
