// ============================================================================
// TRAVEL SUPPLY MAP — VIATOR: KANONSKA PRESLIKAVA (Task 45, 1.50.0)
// ============================================================================
// ViatorProductSummary → ProviderProduct. KANONSKI MODEL SE NE SPREMENJA
// (glavni gate naročnika §4): nobeno viator* polje ne pride v ProviderProduct
// — vse Viator specifike ostanejo v tej mapi (izjema po arhitekturi:
// (provider, providerProductId) JE ključ nazaj pri ponudniku).
//
// PRESLIKAVA (vsaka odločitev dokumentirana iz vira):
//  - type:            itineraryType: ACTIVITY→activity; STANDARD/
//                     MULTI_DAY_TOUR/HOP_ON_HOP_OFF→tour; UNSTRUCTURED/
//                     neznan→tour (večinski privzeti; vir: 5 tipov itinererja)
//  - subcategory:     PRIVATE_TOUR iz flags → "private_tour" (izpeljano iz
//                     vira; ostale zastavice so politike, ne kategorije)
//  - title/desc:      NASLOV/OPIS VIRA (Accept-Language en-US — sl vir ne
//                     podpira; lastne oznake so naše, vsebina je vira)
//  - geo:             pin = center PRIMARNE destinacije produkta
//                     (destinations[].ref) → geoPrecision "destination_center"
//                     (NIKOLI točen meeting point — naročnik §8)
//  - cena:            pricing.summary.fromPrice = „od"-cena (uradni spec:
//                     najnižja možna cena, po navadi na odraslo osebo) →
//                     unit "per_person" + fromPrice:true + opomba, ki
//                     odkrije izjemo (produkti z UNIT ceno — kategorija
//                     PER_PERSON/UNIT je v produktu DETAIL, ne v povzetku);
//                     valuta: zahtevamo EUR — če vir odgovori v drugi valuti,
//                     ceno NE preslikamo (NE pretvarjamo, NE lažemo)
//  - razpoložljivost: "unknown" (Basic Access NIMA /availability/check —
//                     vir ima koncept; cena NI dokaz razpoložljivosti)
//  - ocena:           combinedAverageRating SAMO če totalReviews > 0 (brez
//                     recenzij ni ocene); reviewCount = totalReviews
//  - slika:           naslovnna slika vira (isCover), https varianta ≤ 674px,
//                     imageCredit "© Viator" (atribucija)
//  - bookingMode:     affiliate_redirect; bookingUrl = /go/viator?product=
//                     {productCode} (NAŠA konstrukcija; /go razreši globoko
//                     povezavo prek predpomnilnika productUrl spodaj)
//  - sourceUrl:       productUrl vira (validiran https — affiliate povezava
//                     z njihovim pid/mcid, render: safeExternalHref)
// ============================================================================

import type { ProviderProduct } from "../../types";
import type { ViatorProductSummary, ViatorImage } from "./types";
import type { ResolvedPin } from "./destinations";

/** Kapika rezultatov adapterja (gostota pod nadzorom). */
export const VIATOR_MAX_RESULTS = 48;

/** Opomba cene (limit sanitize MAX_NOTE=60). */
const PRICE_NOTE = {
  sl: "od-cena (najnižja, navadno na osebo)",
  en: "from price (lowest, usually per person)",
} as const;

const AVAILABILITY_NOTE = {
  sl: "razpoložljivost se preveri pri ponudniku",
  en: "availability confirmed with the provider",
} as const;

// ---------------------------------------------------------------------------
// IZBIRA SLIKE (naslovnna, https, razumna velikost)
// ---------------------------------------------------------------------------

const MAX_IMAGE_DIM = 674;

function pickImageUrl(images: ViatorImage[] | undefined): string | undefined {
  if (!Array.isArray(images) || images.length === 0) return undefined;
  const cover = images.find((i) => i?.isCover === true) ?? images[0];
  const variants = (cover?.variants ?? []).filter(
    (v) =>
      v &&
      typeof v.url === "string" &&
      v.url.startsWith("https://") &&
      typeof v.width === "number" &&
      typeof v.height === "number" &&
      v.width > 0 &&
      v.height > 0 &&
      v.width <= MAX_IMAGE_DIM
  );
  if (variants.length === 0) return undefined;
  // Največja dovoljena varianta (ostrina pri modalu, varčnost pri prenosu).
  const best = variants.reduce((a, b) => (b.width > a.width ? b : a));
  return best.url;
}

// ---------------------------------------------------------------------------
// TIP IZ ITINERERJA (kanonska taksonomija — brez Viator kategorij!)
// ---------------------------------------------------------------------------

export function canonicalType(itineraryType: string | undefined): "activity" | "tour" {
  switch (itineraryType) {
    case "ACTIVITY":
      return "activity";
    case "STANDARD":
    case "MULTI_DAY_TOUR":
    case "HOP_ON_HOP_OFF":
      return "tour";
    default:
      // UNSTRUCTURED / neznan — večinski privzeti (ture).
      return "tour";
  }
}

// ---------------------------------------------------------------------------
// PRODUCTURL PREDPOMNILNIK (za /go/viator?product= razrešitev)
// ---------------------------------------------------------------------------
// productUrl iz iskanja je affiliate globoka povezava vira (pid/mcid).
// Predpomnimo jo strežniško (TTL 24 h — poti URL-jev so stabilne; cene se
// osvežujejo prek novih iskanj). /go najprej pogleda sem, nato pade na
// VIATOR_AFFILIATE_URL ali čisto povezavo (fail-closed).

const PRODUCT_URL_TTL_MS = 24 * 60 * 60 * 1000;
const PRODUCT_URL_MAX = 500;

let productUrls = new Map<string, { url: string; at: number }>();

export function rememberViatorProductUrl(productCode: string, url: string): void {
  if (!/^[A-Za-z0-9]{3,20}$/.test(productCode)) return;
  if (!/^https:\/\//i.test(url)) return;
  if (productUrls.size >= PRODUCT_URL_MAX) {
    // FIFO: odstrani najstarejši vnos.
    let oldestKey: string | null = null;
    let oldestAt = Number.POSITIVE_INFINITY;
    for (const [k, v] of productUrls) {
      if (v.at < oldestAt) {
        oldestAt = v.at;
        oldestKey = k;
      }
    }
    if (oldestKey) productUrls.delete(oldestKey);
  }
  productUrls.set(productCode, { url, at: Date.now() });
}

export function lookupViatorProductUrl(productCode: string): string | null {
  const hit = productUrls.get(productCode);
  if (!hit) return null;
  if (Date.now() - hit.at > PRODUCT_URL_TTL_MS) {
    productUrls.delete(productCode);
    return null;
  }
  return hit.url;
}

/** Testni hak / administracija. */
export function clearViatorProductUrls(): void {
  productUrls = new Map();
}

// ---------------------------------------------------------------------------
// GLAVNA PRESLIKAVA
// ---------------------------------------------------------------------------

export interface ViatorMapperContext {
  locale: "sl" | "en";
  /** ISO čas uspešnega pridobitve od vira (semantika lastUpdated). */
  fetchedAt: string;
  /** Razrešen pin (center primarne destinacije produkta). */
  pin: ResolvedPin | null;
}

export function viatorSummaryToProduct(
  summary: ViatorProductSummary,
  ctx: ViatorMapperContext
): ProviderProduct | null {
  const { locale, fetchedAt } = ctx;

  const title = summary.title.trim().slice(0, 200);
  if (title.length === 0) return null;

  // === Cena (od-cena; valuta EUR po zahtevi; ne pretvarjamo) ===
  const fromPrice = summary.pricing?.summary?.fromPrice;
  const currency = summary.pricing?.currency;
  const hasPrice =
    typeof fromPrice === "number" &&
    Number.isFinite(fromPrice) &&
    fromPrice > 0 &&
    (currency === undefined || currency === "EUR");

  // === Ocena (samo pri dokazanih recenzijah) ===
  const totalReviews = summary.reviews?.totalReviews;
  const combined = summary.reviews?.combinedAverageRating;
  const hasRating =
    typeof totalReviews === "number" &&
    totalReviews > 0 &&
    typeof combined === "number" &&
    Number.isFinite(combined) &&
    combined > 0 &&
    combined <= 5;

  // === Opis: IZKLJUČNO iz podatkov vira (dodamo le trajanje iz vira). ===
  const durationMin = summary.duration?.fixedDurationInMinutes;
  const descParts: string[] = [];
  if (typeof summary.description === "string" && summary.description.trim().length > 0) {
    descParts.push(summary.description.trim());
  }
  if (typeof durationMin === "number" && Number.isFinite(durationMin) && durationMin > 0) {
    descParts.push(
      locale === "en"
        ? `Duration: ${Math.round(durationMin / 60 * 10) / 10} h`
        : `Trajanje: ${Math.round(durationMin / 60 * 10) / 10} h`
    );
  }
  const description =
    descParts.length > 0 ? descParts.join("\n\n").slice(0, 1200) : undefined;

  // === Slika ===
  const image = pickImageUrl(summary.images);

  // === subcategory (iz flags vira) ===
  const flags = Array.isArray(summary.flags) ? summary.flags : [];
  const subcategory = flags.includes("PRIVATE_TOUR") ? "private_tour" : undefined;

  // === sourceUrl / bookingUrl ===
  const productUrl =
    typeof summary.productUrl === "string" &&
    /^https:\/\/[^\s]+$/i.test(summary.productUrl.trim())
      ? summary.productUrl.trim()
      : undefined;
  // Predpomni affiliate globoko povezavo za /go razrešitev (strežniško).
  if (productUrl) rememberViatorProductUrl(summary.productCode, productUrl);

  const product: ProviderProduct = {
    id: `viator:${summary.productCode}`,
    provider: "viator",
    providerProductId: summary.productCode,
    type: canonicalType(summary.itineraryType),
    ...(subcategory ? { subcategory } : {}),
    title,
    ...(description ? { description } : {}),
    // geo: center destinacije (geoPrecision destination_center — NIKOLI exact)
    ...(ctx.pin
      ? { lat: ctx.pin.lat, lng: ctx.pin.lng }
      : {}),
    ...(ctx.pin ? { geoPrecision: "destination_center" as const } : {}),
    ...(ctx.pin ? { address: ctx.pin.name } : {}),
    ...(image ? { image, imageCredit: "© Viator" } : {}),
    ...(hasRating
      ? {
          rating: Math.round((combined as number) * 100) / 100,
          reviewCount: totalReviews as number,
        }
      : {}),
    ...(hasPrice
      ? {
          price: {
            amount: Math.round((fromPrice as number) * 100) / 100,
            currency: "EUR" as const,
            unit: "per_person" as const,
            fromPrice: true,
            note: PRICE_NOTE[locale],
          },
        }
      : {}),
    availability: {
      status: "unknown" as const,
      note: AVAILABILITY_NOTE[locale],
    },
    bookingMode: "affiliate_redirect" as const,
    // NAŠA konstrukcija (ne provider URL): /go validira productCode in
    // razreši globoko povezavo (predpomnilnik → affiliate fallback).
    bookingUrl: `/go/viator?product=${encodeURIComponent(summary.productCode)}`,
    ...(productUrl ? { sourceUrl: productUrl } : {}),
    lastUpdated: fetchedAt,
    license: {
      source: "Viator Partner API",
      attribution: "© Viator",
    },
  };

  return product;
}

/** Preslikaj seznama povzetkov (fail-safe: slab zapis odpade, ne sesuje). */
export function mapViatorSummaries(
  summaries: ViatorProductSummary[],
  ctx: { locale: "sl" | "en"; fetchedAt: string },
  pinOf: (s: ViatorProductSummary) => ResolvedPin | null
): { products: ProviderProduct[]; skipped: number } {
  const products: ProviderProduct[] = [];
  let skipped = 0;
  for (const s of summaries) {
    const p = viatorSummaryToProduct(s, { ...ctx, pin: pinOf(s) });
    if (p) products.push(p);
    else skipped++;
  }
  return { products, skipped };
}
