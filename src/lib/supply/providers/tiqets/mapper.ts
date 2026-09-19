// ============================================================================
// TRAVEL SUPPLY MAP — TIQETS: KANONSKA PRESLIKAVA (Task 53)
// ============================================================================
// TiqetsRawProduct → ProviderProduct. KANONSKI MODEL SE NE SPREMENJA
// (glavni gate naročnika): nobeno tiqets* polje ne pride v ProviderProduct
// — vse Tiqets specifike ostanejo v tej mapi (izjema po arhitekturi:
// (provider, providerProductId) JE ključ nazaj pri ponudniku).
//
// PRESLIKAVA (vsaka odločitev dokumentirana; vir = Distributor API v2,
// oblika produktov DOCUMENTED-ASSUMPTION — portal-gated, glej types.ts):
//  - type:            VEDNO "ticket" (Tiqets = vstopniški vir; iskren
//                     kanonski tip — vstopniška ikona 🎟️ v plasti)
//  - title/opis:      NASLOV/OPIS VIRA (title ALI name — defenzivno);
//                     jezik vira ni pogodbeno znan (portal-gated) → NE
//                     zahtevamo lokalizacije, lastne oznake so naše
//  - geo:             pin SAMO iz koordinat OBJEKTA (venue) v surovem
//                     zapisu → geoPrecision "exact" (objekt vstopnice).
//                     BREZ venue koordinat → BREZ pina (ISKRENO: NE
//                     pinamo po mestu — mestni center bi bila izmišljena
//                     lokacija). Naslov = sestavljen iz venue.address/city.
//  - cena:            SAMO če ima surov zapis NUMERIČNO ceno > 0 IN
//                     IZRECNO valuto "EUR" (parametra valute na iskanju
//                     NE pošiljamo — portal-gated; brez izrecne valute
//                     cene NE preslikamo, ker je ne poznamo; izrecna
//                     ne-EUR valuta → cene NE preslikamo: nimamo vira
//                     tečaja, pretvorba bi bila IZMIŠLJENA — fail-closed,
//                     odločitev dokumentirana; ob aktivaciji preveri
//                     parameter valute pri viru in ga takrat dodaj).
//                     unit "per_person" (vstopnica = 1 oseba) +
//                     fromPrice: true (OBJAVLJENA lista, ni živi citat —
//                     razpoložljivost/cena se potrdi pri ponudniku).
//                     NIKOLI ne vstavimo 0 kot cene.
//  - razpoložljivost: "unknown" (vir ima koncept razpolažljivosti,
//                     a je NE preverjamo v iskanju — cena ≠ dostopnost)
//  - ocena:           ODSOTNA (imena polj portal-gated — ne ugibamo;
//                     dokumentirana iskrena odločitev)
//  - slika:           prva veljavna slika vira (defenzivno: objekt z
//                     url/secure_url ALI niz), https + host tiqets.com
//                     (družina; DOCUMENTED-ASSUMPTION allowlist — ob
//                     aktivaciji potrdi CDN domeno) → imageCredit "© Tiqets"
//  - bookingMode:     affiliate_redirect; bookingUrl = "/go/tickets"
//                     (NAŠA konstrukcija — KATEGORIJSKA affiliate
//                     preusmeritev BREZ product parametra: globoka
//                     povezava produkta NI pogodbeno znana (portal-gated)
//                     in /go/tickets produkt parametra NE podpira — nobenega
//                     vbrizgavanja ne delamo)
//  - sourceUrl:       url vira SAMO kadar je https na tiqets.com družini
//                     (validirano; render sloj: safeExternalHref)
//  - license:         {source: "Tiqets Distributor API", attribution: "© Tiqets"}
// ============================================================================

import type { ProviderProduct } from "../../types";
import type { TiqetsRawProduct, TiqetsVenue } from "./types";
import { isTiqetsRawProduct, tiqetsProductId, tiqetsVenueCoords } from "./types";

/** Kapika rezultatov adapterja (gostota pod nadzorom). */
export const TIQETS_MAX_RESULTS = 48;

/** Opomba cene (limit sanitize MAX_NOTE=60). */
const PRICE_NOTE = {
  sl: "objavljena od-cena na osebo (ni živi citat)",
  en: "published from price per person (not a live quote)",
} as const;

const AVAILABILITY_NOTE = {
  sl: "razpoložljivost se preveri pri ponudniku",
  en: "availability confirmed with the provider",
} as const;

// ---------------------------------------------------------------------------
// ČIŠČENJE BESEDILA NEZaupANEGA VIRA (isti vzorec kot viator cleanViatorText
// / gyg cleanGygText: React escaping je DRUGA plast, adapter meja je PRVA —
// namerno OBA). Naslov in opis sta prosti besedili komercialnega API-ja,
// ki ga ne nadzorujemo: kontrolni znaki + HTML/JS injekcijski znaki stran,
// presledki zložijo, kap dolžine.
// ---------------------------------------------------------------------------

const TITLE_MAX_LEN = 200;
const DESCRIPTION_MAX_LEN = 1200;

/** Očisti prosti tekst vira (kontrolni znaki + injekcijski znakovni nabor). */
function cleanTiqetsText(raw: string, maxLen: number): string {
  return raw
    // kontrolni znaki (vključno DEL) — lomijo izris/notes/dnevnike
    .replace(/[\u0000-\u001f\u007f]/g, "")
    // HTML/js injekcijski znaki (enak nabor kot kiwitaxi/viator/gyg meja)
    .replace(/[<>"'`{}$\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

// ---------------------------------------------------------------------------
// GEO (SAMO iz venue koordinat — sicer BREZ pina)
// ---------------------------------------------------------------------------

/** Naslov iz venue (sestavljen iz veljavnih delov vira; kap 200). */
function venueAddress(venue: TiqetsVenue): string | undefined {
  const parts: string[] = [];
  if (typeof venue.address === "string" && venue.address.trim().length > 0) {
    parts.push(cleanTiqetsText(venue.address, 120));
  }
  if (typeof venue.city === "string" && venue.city.trim().length > 0) {
    parts.push(cleanTiqetsText(venue.city, 80));
  }
  if (parts.length === 0) return undefined;
  return parts.join(", ").slice(0, 200);
}

// ---------------------------------------------------------------------------
// CENA (STROGO: numerična > 0 + IZRECNO EUR; sicer BREZ cene)
// ---------------------------------------------------------------------------

/**
 * Numerična cena vira (number > 0) — DEFENZIVNO: objekt {value | amount}
 * ALI golo število. Vrača null, če cena ni numerična ali je 0/negativna
 * (0 NI cena — nikoli je ne vstavimo kot lažno ceno).
 */
function numericPrice(raw: TiqetsRawProduct["price"]): number | null {
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }
  if (raw != null && typeof raw === "object") {
    const v = raw.value;
    const a = raw.amount;
    const num =
      typeof v === "number" && Number.isFinite(v)
        ? v
        : typeof a === "number" && Number.isFinite(a)
          ? a
          : null;
    return num != null && num > 0 ? num : null;
  }
  return null;
}

/**
 * Valuta cene vira (IZRECNA, case-insensitive) ali null, če ni podana.
 * DOCUMENTED-ASSUMPTION polje: currency na objektu cene.
 */
function priceCurrency(raw: TiqetsRawProduct["price"]): string | null {
  if (raw != null && typeof raw === "object" && typeof raw.currency === "string") {
    return raw.currency.trim().toUpperCase();
  }
  return null;
}

/**
 * Cena za preslikavo: SAMO numerična > 0 + IZRECNO "EUR".
 *  - valuta ODSOTNA → NE preslikamo (ne poznamo valute; iskanje nima
 *    parametra valute — portal-gated; NE trdimo, da je EUR);
 *  - izrecna ne-EUR → NE preslikamo (nimamo vira tečaja; pretvorba bi
 *    bila izmišljena — fail-closed, dokumentirana odločitev zgoraj).
 */
function tiqetsPrice(
  raw: TiqetsRawProduct["price"]
): { amount: number } | null {
  const amount = numericPrice(raw);
  if (amount == null) return null;
  if (priceCurrency(raw) !== "EUR") return null;
  return { amount };
}

// ---------------------------------------------------------------------------
// SLIKA (prva veljavna; https; host tiqets.com družina)
// ---------------------------------------------------------------------------

/**
 * Meja zaupanja za sliko NEZAUPANEGA vira: https + host tiqets.com /
 * *.tiqets.com (DOCUMENTED-ASSUMPTION allowlist — CDN domena vira je
 * portal-gated; tujo domeno NE hotlinkamo). Vse ostalo → undefined
 * (slika ODSOTNA — iskreno, brez nadomestka).
 */
export function tiqetsImageUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const url = raw.trim();
  if (url.length === 0 || url.length > 500) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return undefined;
    const h = parsed.hostname;
    if (h !== "tiqets.com" && !h.endsWith(".tiqets.com")) return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function pickImageUrl(
  images: TiqetsRawProduct["images"]
): string | undefined {
  if (!Array.isArray(images)) return undefined;
  for (const item of images) {
    // DEFENZIVNO: niz ALI objekt {url | secure_url} (portal-gated oblika).
    const raw =
      typeof item === "string"
        ? item
        : item != null && typeof item === "object"
          ? (typeof item.secure_url === "string" ? item.secure_url : item.url)
          : undefined;
    const url = tiqetsImageUrl(raw);
    if (url) return url;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// SOURCEURL (javna stran vstopnice — SAMO validiran https)
// ---------------------------------------------------------------------------

/**
 * Meja zaupanja za url NEZAUPANEGA vira: https + host tiqets.com /
 * *.tiqets.com (javne strani vstopnic vira). Vse ostalo (http,
 * javascript:, data:, tuj https host) → undefined (ODSOTNO — ne
 * izmišljujemo, NE pošiljamo uporabnika na tuj host).
 */
export function tiqetsSourceUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const url = raw.trim();
  if (url.length === 0 || url.length > 500) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return undefined;
    const h = parsed.hostname;
    if (h !== "tiqets.com" && !h.endsWith(".tiqets.com")) return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// GLAVNA PRESLIKAVA
// ---------------------------------------------------------------------------

export interface TiqetsMapperContext {
  locale: "sl" | "en";
  /** ISO čas uspešnega pridobitve od vira (semantika lastUpdated). */
  fetchedAt: string;
}

export function tiqetsProductToProduct(
  item: TiqetsRawProduct,
  ctx: TiqetsMapperContext
): ProviderProduct | null {
  const { locale, fetchedAt } = ctx;

  // Identiteta (STROGO: mapper meja velja za VSAGEGA klicatelja — tudi
  // tukaj preverimo id, ne zaupamo vhodu tipom).
  const productId = tiqetsProductId(item.id);
  if (productId == null) return null;

  // Naslov (DEFENZIVNO: title ALI name — portal-gated oblika).
  const rawTitle =
    typeof item.title === "string" && item.title.trim().length > 0
      ? item.title
      : typeof item.name === "string" && item.name.trim().length > 0
        ? item.name
        : null;
  if (rawTitle == null) return null;
  const title = cleanTiqetsText(rawTitle, TITLE_MAX_LEN);
  if (title.length === 0) return null;

  // === Geo: SAMO venue koordinate (sicer BREZ pina — iskreno). ===
  const coords = tiqetsVenueCoords(item.venue);
  const address = item.venue != null ? venueAddress(item.venue) : undefined;

  // === Cena (numerčna > 0 + IZRECNO EUR; sicer ODSOTNA). ===
  const price = tiqetsPrice(item.price);

  // === Opis: IZKLJUČNO iz podatkov vira. ===
  const description =
    typeof item.description === "string" && item.description.trim().length > 0
      ? cleanTiqetsText(item.description, DESCRIPTION_MAX_LEN)
      : undefined;

  // === Slika + sourceUrl (validirani https, tiqets.com družina). ===
  const image = pickImageUrl(item.images);
  const sourceUrl = tiqetsSourceUrl(item.url);

  const product: ProviderProduct = {
    id: `tiqets:${productId}`,
    provider: "tiqets",
    providerProductId: productId,
    type: "ticket",
    title,
    ...(description ? { description } : {}),
    // geo: točna lokacija OBJEKTA vstopnice (geoPrecision exact — NE
    // mestni center, ne izmišljena lokacija; brez venue = brez pina)
    ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
    ...(coords ? { geoPrecision: "exact" as const } : {}),
    ...(coords && address ? { address } : {}),
    ...(image ? { image, imageCredit: "© Tiqets" } : {}),
    ...(price
      ? {
          price: {
            amount: Math.round(price.amount * 100) / 100,
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
    // NAŠA konstrukcija (ne provider URL): KATEGORIJSKA affiliate
    // preusmeritev /go/tickets BREZ product parametra (globoka povezava
    // produkta ni pogodbeno znana — portal-gated; /go vrata ne podpirajo
    // product parametra za tickets → NIČ ne vbrizgavamo).
    bookingUrl: "/go/tickets",
    ...(sourceUrl ? { sourceUrl } : {}),
    lastUpdated: fetchedAt,
    license: {
      source: "Tiqets Distributor API",
      attribution: "© Tiqets",
    },
  };

  return product;
}

/**
 * Preslikaj seznam produktov (fail-safe: slab zapis odpade, NE sesuje —
 * isti vzorec kot viator/gyg: vsak VHOD preverimo tudi tu; meja adapterja
 * velja za VSAKEGA klicatelja, ne samo za adapterjevo pot).
 */
export function mapTiqetsProducts(
  items: TiqetsRawProduct[],
  ctx: TiqetsMapperContext
): { products: ProviderProduct[]; skipped: number } {
  const products: ProviderProduct[] = [];
  let skipped = 0;
  for (const item of items) {
    if (!isTiqetsRawProduct(item)) {
      skipped++;
      continue;
    }
    const p = tiqetsProductToProduct(item, ctx);
    if (p) products.push(p);
    else skipped++;
  }
  return { products, skipped };
}
