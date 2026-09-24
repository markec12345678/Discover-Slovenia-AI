// ============================================================================
// PRIKAZ CENE PRODUKTA — kdaj izreči "CENA NEZNANA" (Issue #4 §6, val 1)
// ============================================================================
// PRAVILO (preslikano iz PriceClassification v produkciji matriki):
//  · produkt NIMA cene in ponudnikova klasifikacija NI "NOT_SUPPORTED"
//    (OSM/FSQ/STO — vir cen nima) → kartica/modal ISKRENO izriše žeton
//    "Cena neznana · preveri pri ponudniku". TIHO skrivanje je NEPOŠTENO
//    (Issue #4 §6: UNKNOWN povsod). To je ISTO pravilo, ki ga journey-
//    planner (priceBadge) uporablja že od TASK 99 — supply kartica je bila
//    izjemka.
//  · NOT_SUPPORTED (odprti viri brez koncepta cen) → obstoječi pošteni
//    prikaz (ure/licenca/ponudnik) — tišina je TU iskrena.
//  · neznan slug → fail-closed na obstoječi prikaz (ni podatka → ne
//    izjavljamo).
//
// Čista funkcija — ena resnica za product-card, product-modal in teste.
// ============================================================================

import { getProductionMatrixEntry } from "./production-matrix";
import type { ProviderProduct } from "./types";

/**
 * Ali produkt brez cene zahteva ISKREN žeton "Cena neznana"
 * (ponudnik NIMA klasifikacije NOT_SUPPORTED → cene obstajajo, a jih ta
 * produkt ne nosi).
 */
export function showsUnknownPriceChip(
  product: Pick<ProviderProduct, "provider" | "price">
): boolean {
  if (product.price) return false;
  const entry = getProductionMatrixEntry(product.provider);
  if (!entry) return false;
  return entry.price !== "NOT_SUPPORTED";
}
