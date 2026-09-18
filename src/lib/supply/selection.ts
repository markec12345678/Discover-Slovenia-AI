// ============================================================================
// TRAVEL SUPPLY MAP — SELEKCIJA PRODUKTOV (client, F1, 1.49.0)
// ============================================================================
// Izbrani produkti (selectedProviderProducts[]) živijo v Zustand store
// (app-wide) + sessionStorage (preživi osvežitev strani — vzorec chat
// stash). Planner jih ob oddaji prilepi v PlannerInput → AI prejme
// STRUKTURIRAN objekt (FIXED/PREFERRED/SUGGESTED).
// ============================================================================

import { useAppStore } from "@/lib/store";
import { DESTINATIONS } from "@/lib/slovenia-data";
import { insertProductStop } from "./stop-insert";
import type { Itinerary } from "@/lib/types";
import type { ProviderProduct, SelectedProviderProduct } from "./types";
import { trackPlannerEvent } from "@/lib/planner-analytics";
import { persistSelection } from "./selection-persist";
import { MAX_SELECTED_PRODUCTS } from "./sanitize";

export { SUPPLY_SELECTION_KEY, readPersistedSelection } from "./selection-persist";

/** ProviderProduct → strukturirana izbira (default: FIXED — uporabnikova
 *  eksplicitna izbira je obvezna; AI je ne sme zamenjati). */
export function toSelectedProduct(
  p: ProviderProduct,
  selectionState: "fixed" | "preferred" | "suggested" = "fixed"
): SelectedProviderProduct {
  return {
    provider: p.provider,
    providerProductId: p.providerProductId,
    type: p.type,
    title: p.title,
    lat: p.lat,
    lng: p.lng,
    locationName: p.address,
    price: p.price,
    availability: p.availability
      ? { status: p.availability.status }
      : undefined,
    source: p.license?.source ?? p.provider,
    bookingUrl: p.bookingMode === "info_only" ? p.sourceUrl : undefined,
    selectionState,
  };
}

export interface AddSelectionResult {
  added: boolean;
  /** postanek vstavljen v obstoječi načrt? (false = samo izbira/stash) */
  insertedStop: boolean;
  reason?: "duplicate" | "accommodation" | "no-geo" | "no-plan" | "no-days" | "limit";
}

/**
 * DODAJ V MOJ NAČRT — ena točka za vse površine (modal, kartica, seznam).
 * Tok (ogledalo chat-add-place):
 *   1. izbira VEDNO zapisana (store + sessionStorage) → AI kontekst ob
 *      naslednji generaciji.
 *   2. če načrt ŽE obstaja: ne-nastanitveni produkt z geo dobi tudi
 *      deterministični postanek (najbližji dan, večernji slot).
 *   3. brez načrta: postopek čaka v izbiri (planner jo prevzame).
 */
export function addProductToSelection(
  product: ProviderProduct,
  opts: {
    locale: "sl" | "en";
    onItineraryChange?: (it: Itinerary) => void;
  }
): AddSelectionResult {
  const store = useAppStore.getState();
  const current = store.selectedProducts;
  const key = `${product.provider}:${product.providerProductId}`;
  if (current.some((p) => `${p.provider}:${p.providerProductId}` === key)) {
    return { added: false, insertedStop: false, reason: "duplicate" };
  }
  // AUDIT 42 (42-d YELLOW #5): strežnik kapira na MAX_SELECTED_PRODUCTS in
  // TIHO poreže — klient naj enako omeji, da čipi ne obljubijo več, kot bo
  // AI dejansko prejel.
  if (current.length >= MAX_SELECTED_PRODUCTS) {
    return { added: false, insertedStop: false, reason: "limit" };
  }

  const selected = toSelectedProduct(product);
  const next = [...current, selected];
  useAppStore.getState().setSelectedProducts(next);
  persistSelection(next);

  trackPlannerEvent("supply_add_to_plan", {
    provider: product.provider,
    type: product.type,
    has_geo: product.lat != null ? 1 : 0,
    has_price: product.price != null ? 1 : 0,
    stashed: store.itinerary ? 0 : 1,
  });

  // Postanek v obstoječi načrt (če obstaja in produkt je "stop-able").
  const it = store.itinerary;
  if (it) {
    const destCoords = new Map(DESTINATIONS.map((d) => [d.id, d.coords]));
    const result = insertProductStop(it, product, {
      locale: opts.locale,
      destinationCoords: destCoords,
    });
    if (result.ok && result.kind === "stop") {
      useAppStore.getState().setItinerary(result.itinerary);
      opts.onItineraryChange?.(result.itinerary);
      return { added: true, insertedStop: true };
    }
    return {
      added: true,
      insertedStop: false,
      reason: result.ok ? result.reason : result.reason,
    };
  }
  return { added: true, insertedStop: false, reason: "no-plan" };
}

/** Odstrani iz izbire (× na čipu v plannerju / modalu). */
export function removeSelectedProduct(
  provider: string,
  providerProductId: string
): void {
  const current = useAppStore.getState().selectedProducts;
  const next = current.filter(
    (p) => `${p.provider}:${p.providerProductId}` !== `${provider}:${providerProductId}`
  );
  useAppStore.getState().setSelectedProducts(next);
  persistSelection(next);
}
