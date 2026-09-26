// TASK 8 / D8-D (§3.3 write-through): preslikava supply produkta (zemljevid
// + /potovanje) v predmet zbirke "Moja pot".
//
// ENA točka resnice za obliko vnosa — product-modal, product-card in
// journey-planner delijo isto preslikavo, ker identiteta `kind:refId` mora
// biti enaka na VSEH površinah (sicer bi isti produkt obstal dvakrat v
// zbirki). Vzorčena po src/lib/search-result-nav.ts (0 odvisnosti od Reacta,
// unit-testabilna).
//
// ISKRENOST (ista meja kot površine):
//  - vrsta produkte preslikamo v semantično skupino zbirke (aktivnost/tura/
//    vstopnica → doživetje; dogodek → dogodek; ostalo → izdelek);
//  - href je SAMO notranja pot: geo glob-povezava na /zemljevid (zlati
//    poudarni marker, TASK 86), brez geo pa iskrena površina izvora;
//  - slika samo ob http(s) meji (AUDIT 42 — OSM tagi so javno ureljivi).

import { taxonomyOf } from "@/lib/supply/taxonomy";
import { isSafeHttpUrl } from "@/lib/external-url";
import type { MyTripInput, MyTripKind } from "@/lib/my-trip";
import type { ProductType } from "@/lib/supply/types";

/** Vrste supply taksonomije, ki v zbirki NISO "izdelki". */
const KIND_BY_TYPE: Partial<Record<ProductType, MyTripKind>> = {
  activity: "experience",
  tour: "experience",
  ticket: "experience",
  event: "event",
};

/** Minimalna oblika produkta, ki jo preslikava potrebuje — ProviderProduct
 *  (zemljevid) in JourneyProduct (/potovanje) jo oba izpolnjujeta. */
export interface SupplyTripProductLike {
  /** `${provider}:${providerProductId}` — stabilen ID med sejami. */
  id: string;
  type: ProductType;
  title: string;
  address?: string;
  lat?: number;
  lng?: number;
  image?: string;
}

/** Semantična skupina zbirke za vrsto supply produkta. */
export function supplyTripKind(type: ProductType): MyTripKind {
  return KIND_BY_TYPE[type] ?? "product";
}

/**
 * Predmet zbirke "Moja pot" za supply produkt (source: 'zemljevid' ali
 * 'potovanje' — pove, kje je bil dodan). Geo glob-povezava sledi TASK 86
 * vzorcu (/zemljevid?lat&lng&zoom&label); brez koordinat je fallback
 * površina, kjer produkt živi (privzeto /zemljevid).
 */
export function supplyTripItem(
  product: SupplyTripProductLike,
  lang: "sl" | "en",
  source: string,
  fallbackHref = "/zemljevid"
): MyTripInput {
  const tax = taxonomyOf(product.type);
  const subtitle = [tax.label[lang], product.address]
    .filter(Boolean)
    .join(" · ");
  const href =
    product.lat != null && product.lng != null
      ? `/zemljevid?lat=${product.lat}&lng=${product.lng}&zoom=13&label=${encodeURIComponent(product.title)}`
      : fallbackHref;
  return {
    kind: supplyTripKind(product.type),
    refId: product.id,
    title: product.title,
    subtitle: subtitle || undefined,
    href,
    // AUDIT 42: http(s) meja na sliki (adapter že validira; render plast NE)
    image: product.image && isSafeHttpUrl(product.image) ? product.image : undefined,
    source,
  };
}
