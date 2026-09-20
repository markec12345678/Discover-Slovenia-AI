// ============================================================================
// TASK 58 §5/§24 — PRENOS IZBIR POTOVANJA V NAČRTOVALNIK (čista plast)
// ============================================================================
// Izbrani produkti potovanja → SelectedProviderProduct[] s FIXED semantiko
// (AI izbranih izdelkov NE zamenja tiho — obstoječa veriga selection-verify →
// itinerary-validation → save revalidacija ostaja edina avtoriteta).
//
// PROVIDER-AGNOSTIC (§24): oznaka vira IZ registra (getProvider().labels) —
// brez if-provider verig. Dogodki (lokalni vsebinski vir) v prenos NE gredo
// (niso rezervabilni produkti — vstopnice niso podprte).
// ============================================================================

import { getProvider } from "@/lib/supply/registry";
import type { SelectedProviderProduct } from "@/lib/supply/types";
import type { JourneyProduct } from "./types";

/** Oznaka vira iz registra (dvojezično) — provider-agnostic. */
function sourceLabelOf(
  p: JourneyProduct,
  lang: "sl" | "en"
): string {
  const entry = getProvider(p.provider);
  return entry ? entry.labels[lang] : String(p.provider);
}

/**
 * Prenos izbranih produktov potovanja v izbiro načrtovalnika.
 * VSA polja so strežniško izpeljana iz kanonskih JourneyProduct-ov
 * (klientova izbira = SAMO izbor ID-jev — ceno/geo/ID nosi kanon).
 */
export function journeyProductsToSelection(
  products: readonly JourneyProduct[],
  lang: "sl" | "en"
): SelectedProviderProduct[] {
  const out: SelectedProviderProduct[] = [];
  const seen = new Set<string>();
  for (const p of products) {
    // Dogodki = informacijski vir brez rezervacije → niso produkt načrta.
    if (p.provider === "events") continue;
    // Dedupe po kanonskem ID-ju (exactly-once tudi pri podvojenem vhodu).
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push({
      provider: p.provider as SelectedProviderProduct["provider"],
      providerProductId: p.providerProductId,
      type: p.type,
      title: p.title,
      ...(p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : {}),
      ...(p.address ? { locationName: p.address } : {}),
      ...(p.price ? { price: p.price } : {}),
      ...(p.availability
        ? { availability: { status: p.availability.status } }
        : {}),
      source: sourceLabelOf(p, lang),
      ...(p.bookingUrl ? { bookingUrl: p.bookingUrl } : {}),
      // Uporabnikova IZBIRA = FIXED (§7/§14 — AI ne zamenja tiho).
      selectionState: "fixed" as const,
    });
  }
  return out;
}
