// ============================================================================
// TRAVEL SUPPLY MAP — VIATOR: POGODBENE VRSTE (Task 45, 1.50.0)
// ============================================================================
// VRSTE SO PRESLIKANE IZ URADNE DOKUMENTACIJE Viator Partner API v2.0
// (docs.viator.com/partner-api/technical — prebrano ŽIVO 18. 9. 2026;
// enako shemo potrjuje uradni Golden Path vodnik za Basic Access affiliate
// partnerje, partnerresources.viator.com). Polja, ki jih dokumentacija ne
// definira za ta odgovor, so OPCIJSKA — nikoli jih ne izmišljujemo.
//
// POGODBA (živo preverjena):
//  - Base:      https://api.viator.com/partner (produkcija) oz.
//               https://api.sandbox.viator.com/partner (sandbox — vsa
//               testiranja MORAJO teči tam po pogodbi vira)
//  - Auth:      glava exp-api-key: <ključ organizacije> na VSAKEM klicu
//               (živi dokaz brez ključa: HTTP 401 UNAUTHORIZED)
//  - Headers:   Accept: application/json;version=2.0 (OBVEZNO — sicer 400
//               INVALID_HEADER_VALUE), Accept-Language (lokalizacija po
//               klicu), Content-Type: application/json
//  - Jeziki:    sl-SI NI podprt (podprti: en, da, nl, no, es, sv, fr, it,
//               de, pt, ja; kitajščina/korejščina samo merchant) → adapter
//               VEDNO zahteva "en-US" (dokumentirana omejitev; lastne
//               slovenske oznake dodamo sami, vsebina vira ostane EN)
//  - Basic Access (privzeti affiliate tier): /products/search,
//    /products/{product-code}, /products/tags, /attractions/*,
//    /availability/schedules/{product-code}, /search/freetext,
//    /destinations, /locations/bulk, /exchange-rates
//  - Rate limit: okno 10 s PO ENDPOINTU na partnerski račun + skupni
//    prometni kap po IP; 429 s RateLimit-* + Retry-After (endpoint) ali
//    brez glav (skupni kap → eksponentna pavza)
// ============================================================================

/** Slika (isključno https variantne URL-je iz vira). */
export interface ViatorImageVariant {
  height: number;
  width: number;
  url: string;
}

/** Slika produkta (isCover = naslovnna; imageSource npr. SUPPLIER_PROVIDED). */
export interface ViatorImage {
  imageSource?: string;
  caption?: string;
  isCover?: boolean;
  variants?: ViatorImageVariant[];
}

/** Ocena/recenzije — kombinirane čez vire (VIATOR + TRIPADVISOR). */
export interface ViatorReviewSource {
  provider?: string;
  totalCount?: number;
  averageRating?: number;
}

export interface ViatorReviews {
  sources?: ViatorReviewSource[];
  totalReviews?: number;
  combinedAverageRating?: number;
}

/** Cena iskanega povzetka: summary.fromPrice = „od"-cena. */
export interface ViatorPricing {
  summary?: {
    fromPrice?: number;
    fromPriceBeforeDiscount?: number;
  };
  currency?: string;
}

/** Referenca na destinacijo (ref = destinationId kot niz). */
export interface ViatorDestinationRef {
  ref?: string;
  primary?: boolean;
}

/**
 * ProductSummary — povzetek produkta iz POST /products/search.
 * (Uradi primer: productCode, title, description, images, reviews,
 * duration, confirmationType, itineraryType, pricing, productUrl,
 * destinations, tags, flags, translationInfo.)
 */
export interface ViatorProductSummary {
  productCode: string;
  title: string;
  description?: string;
  images?: ViatorImage[];
  reviews?: ViatorReviews;
  duration?: {
    fixedDurationInMinutes?: number;
    variableDurationFromMinutes?: number;
    variableDurationToMinutes?: number;
  };
  confirmationType?: string;
  itineraryType?: string;
  pricing?: ViatorPricing;
  /** Affiliate globoka povezava (vsebuje pid/mcid, ko je ključ affiliate). */
  productUrl?: string;
  destinations?: ViatorDestinationRef[];
  tags?: number[];
  flags?: string[];
  translationInfo?: { containsMachineTranslatedText?: boolean };
}

/** DestinationDetails — element iz GET /destinations. */
export interface ViatorDestination {
  destinationId: number;
  name: string;
  /** CITY | COUNTRY | REGION | AREA | TOWN | … (dokumentirani tipi). */
  type?: string;
  parentDestinationId?: number;
  lookupId?: string;
  defaultCurrencyCode?: string;
  timeZone?: string;
  center?: { latitude?: number; longitude?: number };
  destinationUrl?: string;
  iataCode?: string;
}

/** GET /destinations odgovor. */
export interface ViatorDestinationsResponse {
  destinations?: ViatorDestination[];
  totalCount?: number;
}

/** ProductSearchFiltering — telo zahteve /products/search. */
export interface ViatorSearchFiltering {
  /** destinationId kot NIZ (uradi primer: "732"). */
  destination?: string;
  tags?: number[];
  flags?: string[];
  lowestPrice?: number;
  highestPrice?: number;
  startDate?: string;
  endDate?: string;
  includeAutomaticTranslations?: boolean;
  confirmationType?: string;
  durationInMinutes?: { from?: number; to?: number };
  rating?: { from?: number; to?: number };
}

export interface ViatorSearchSorting {
  sort?: string;
  order?: string;
}

export interface ViatorSearchPagination {
  start?: number;
  count?: number;
}

export interface ViatorSearchRequest {
  filtering: ViatorSearchFiltering;
  sorting?: ViatorSearchSorting;
  pagination?: ViatorSearchPagination;
  /** Valuta cen v odgovoru (mi vedno zahtevamo EUR). */
  currency: string;
}

/** POST /products/search odgovor. */
export interface ViatorSearchResponse {
  products?: ViatorProductSummary[];
  totalCount?: number;
}

// ---------------------------------------------------------------------------
// FAIL-SAFE VARNOSTNI VZORCI (isti vzorec kot kiwitaxi/validate.ts — Task 44
// §4: en slab zapis NE sme podreti celotne plasti)
// ---------------------------------------------------------------------------

/** Minimalna veljavnost povzetka: productCode + naslov (drugo je opcijsko). */
export function isViatorProductSummary(v: unknown): v is ViatorProductSummary {
  if (!v || typeof v !== "object") return false;
  const p = v as Partial<ViatorProductSummary>;
  return (
    typeof p.productCode === "string" &&
    p.productCode.length > 0 &&
    p.productCode.length <= 40 &&
    typeof p.title === "string" &&
    p.title.trim().length > 0
  );
}

/** Obrambno preverjanje seznama povzetkov (slabi elementi odpadejo). */
export function filterValidSummaries(
  raw: unknown
): { valid: ViatorProductSummary[]; skipped: number } {
  if (!Array.isArray(raw)) return { valid: [], skipped: 0 };
  const valid: ViatorProductSummary[] = [];
  let skipped = 0;
  for (const item of raw) {
    if (isViatorProductSummary(item)) valid.push(item);
    else skipped++;
  }
  return { valid, skipped };
}

/** Veljavna destinacija iz taksonomije (id + ime; center opcijsko). */
export function isViatorDestination(v: unknown): v is ViatorDestination {
  if (!v || typeof v !== "object") return false;
  const d = v as Partial<ViatorDestination>;
  return (
    typeof d.destinationId === "number" &&
    Number.isFinite(d.destinationId) &&
    d.destinationId > 0 &&
    typeof d.name === "string" &&
    d.name.trim().length > 0
  );
}

/**
 * ProductCode — meja zaupanja za /go/viator?product=. Uradni primeri:
 * "227717P1", "62330P2", "7908P9", "14876P5" (števke + P + števke).
 * Dovolimo alfanumerične 3–20 (brez ločil/URL metaznakov — po konstrukciji
 * nemogoče vbrizgati pot/parametre); končni izhod /go vseeno gre skozi
 * host allowlist.
 */
export const VIATOR_PRODUCT_CODE_RE = /^[A-Za-z0-9]{3,20}$/;

/** Veljaven productCode (meja zaupanja, ne polni uradni format). */
export function isViatorProductCode(v: unknown): v is string {
  return typeof v === "string" && VIATOR_PRODUCT_CODE_RE.test(v);
}
