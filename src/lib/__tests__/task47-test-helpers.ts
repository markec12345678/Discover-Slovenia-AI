// ============================================================================
// TASK 47 — SKUPNI TESTNI GRADNIKI (fixture-i SAMO za teste, nikoli produkcija)
// ============================================================================

import { toAiSupplyProduct, type AiSupplyProduct } from "@/lib/supply/ai-context";
import type { ProviderProduct } from "@/lib/supply/types";

/** Kanonski KiwiTaxi produkt (oblika realnega adapterja — per_transfer + od). */
export function kiwitaxiFixture(over: Partial<ProviderProduct> = {}): ProviderProduct {
  return {
    id: "kiwitaxi:49540",
    provider: "kiwitaxi",
    providerProductId: "49540",
    type: "transfer",
    title: "Ljubljana Train Station → Bled",
    description: "Zasebni transfer: 55 km, približno 60 min.",
    lat: 46.05845,
    lng: 14.51269,
    geoPrecision: "city",
    address: "Ljubljana Train Station",
    price: {
      amount: 51,
      currency: "EUR",
      unit: "per_transfer",
      fromPrice: true,
      note: "objavljena cena, ni živi citat",
    },
    availability: { status: "not_supported" },
    bookingMode: "affiliate_redirect",
    bookingUrl: "/go/transfers?product=49540",
    sourceUrl: "https://kiwitaxi.com/en/transfers/49540",
    lastUpdated: "2026-09-18T00:00:00Z",
    license: { source: "KiwiTaxi Partner Data API (CSV)", attribution: "© KiwiTaxi" },
    ...over,
  };
}

/** Varne AI projekcije fixture-a (privzeto suggested). */
export function toAiSupplyContextSafe(
  products: ProviderProduct[] = [kiwitaxiFixture()]
): AiSupplyProduct[] {
  return products.map((p) => toAiSupplyProduct(p, "suggested"));
}
