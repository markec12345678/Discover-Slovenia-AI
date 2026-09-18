// ============================================================================
// TRAVEL SUPPLY MAP — DETERMINISTIČNA UTRDITEV FIXED IZBIR (F1, 1.49.0;
// TASK 47: ekstrahirano iz /api/itinerary route v lib — VEDENJE IDENTIČNO,
// lokacija spremenjena SAMO za testnost §11 invariantne matrike)
// ============================================================================
// FIXED izdelki (izbrani na zemljevidu ponudbe) morajo ostati v načrtu
// NEGLEDE na AI (nepredvidljivost :free modelov) — če jih AI ni vključil,
// jih vstavimo z isto mehaniko kot chat-add-place (najbližji dan po
// haversine, večernji slot, poštena opomba vira). Nastanitve in produkti
// brez geo ostanejo v recommendations (AI jih omeni — prompt pravila).
//
// SOURCE OF TRUTH za vstavljanje ostaja insertProductStop() (dedupe po
// destination_id === "{provider}:{providerProductId}").
// ============================================================================

import { DESTINATIONS } from "@/lib/slovenia-data";
import { insertProductStop } from "./stop-insert";
import type { Itinerary } from "@/lib/types";
import type { ProviderProduct, SelectedProviderProduct } from "./types";

export function applyFixedSelectedProducts(
  it: Itinerary,
  products: SelectedProviderProduct[],
  lang: "sl" | "en"
): Itinerary {
  const fixed = products.filter(
    (p) =>
      p.selectionState === "fixed" &&
      p.type !== "accommodation" &&
      typeof p.lat === "number" &&
      typeof p.lng === "number" &&
      Number.isFinite(p.lat) &&
      Number.isFinite(p.lng)
  );
  if (fixed.length === 0 || it.days.length === 0) return it;

  const destCoords = new Map(DESTINATIONS.map((d) => [d.id, d.coords]));
  let current = it;
  for (const p of fixed) {
    const product: ProviderProduct = {
      id: `${p.provider}:${p.providerProductId}`,
      provider: p.provider,
      providerProductId: p.providerProductId,
      type: p.type,
      title: p.title,
      lat: p.lat,
      lng: p.lng,
      price: p.price,
      // TASK 47 (§6/§13): razpoložljivost potuje z izbiro — insertProductStop
      // izpiše ISKRENO oznako (negotovost ostane negotovost).
      ...(p.availability ? { availability: p.availability } : {}),
      bookingMode: p.provider === "osm" ? "info_only" : "affiliate_redirect",
      lastUpdated: new Date().toISOString(),
      license: { source: p.source },
    };
    const result = insertProductStop(current, product, {
      locale: lang,
      destinationCoords: destCoords,
    });
    if (result.ok && result.kind === "stop") current = result.itinerary;
  }
  return current;
}
