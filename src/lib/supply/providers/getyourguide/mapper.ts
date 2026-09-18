// ============================================================================
// TRAVEL SUPPLY MAP — GETYOURGUIDE: KANONSKA PRESLIKAVA (Task 46, 1.51.0)
// ============================================================================
// GygTour → ProviderProduct. KANONSKI MODEL SE NE SPREMENJA (glavni gate
// naročnika §4): nobeno gyg*/getyourguide* polje ne pride v ProviderProduct
// — vse GYG specifike ostanejo v tej mapi (izjema po arhitekturi:
// (provider, providerProductId) JE ključ nazaj pri ponudniku).
//
// PRESLIKAVA (vsaka odločitev dokumentirana iz vira):
//  - type:            activity_type (prost nabor vira) → KANONSKA taksonomija:
//                     guidedTour/privateTour/multiDayTrip/dayTrip/
//                     hopOnHopOff/bundle/neznan → "tour"; waterActivity/
//                     workshopOrClass → "activity"; entryTicket/hostedTicket/
//                     ticket/cityCard → "ticket" (ISKREN tip — vstopniški
//                     produkti dobijo vstopniško ikono 🎟️ v plasti
//                     Aktivnosti/Ture); transfer → "transfer" (iskren tip).
//                     REGISTERSKI types ["activity","tour"] = sloji, ki
//                     SPROŽIJO adapter (vrata v searchSupply) — tip
//                     PRODUKTA ostaja iskren glede na vir.
//  - subcategory:     snake_case(activity_type) — izpeljano IZ VIRA
//  - title/opis:      NASLOV/ABSTRACT VIRA (cnt_language=en — sl vir ne
//                     podpira; lastne oznake so naše, vsebina je vira).
//                     abstract (teaser) — full opis zahteva preformatted=
//                     full, ki ga BASIC tier NIMA (dokumentirano)
//  - geo:             tour.coordinates = PREDSTAVITVENA lokacija produkta
//                     (uradni primer dokumentacije: koordinate središča
//                     Pariza za katakombski vstopniški produkt) →
//                     geoPrecision "city" (KONZERVATIVNO iskreno; NIKOLI
//                     exact/destination_center — meeting point je razkrit
//                     šele na strani ponudnika ob rezervaciji)
//  - cena:            price.values.amount + price.description (prosto
//                     besedilo vira: 'individual'/'per person' → per_person;
//                     'per group…' → total + opomba z virom; odsotno/neznano
//                     → per_person + opomba, ki razkrije privzetek) +
//                     fromPrice:true (dokumentirano: »Should be read as e.g.
//                     'from XX.YY'«); valuta: zahtevamo EUR — če _metadata
//                     pove, da vir odgovarja v drugi valuti, cene NE
//                     preslikamo (NE pretvarjamo, NE lažemo)
//  - razpoložljivost: "unknown" — odgovor ISKANJA je brez razpoložljivosti
//                     (endpoint /tours/{id}/availability je ločen in nad
//                     BASIC tierjem); cena ≠ razpoložljivost
//  - ocena:           overall_rating SAMO če number_of_ratings > 0 (brez
//                     recenzij ni ocene); reviewCount = number_of_ratings
//  - slika:           pictures[0] (primarna), ssl_url (https) predno url,
//                     [format_id] zamenjan z 132 (480×320 px — uradna
//                     tabela formatov Image-Formats.md); copyright vira →
//                     imageCredit, sicer "© GetYourGuide"
//  - bookingMode:     affiliate_redirect; bookingUrl = /go/getyourguide?
//                     product={tour_id} (NAŠA konstrukcija; /go razreši
//                     globoko povezavo prek predpomnilnika url spodaj)
//  - sourceUrl:       tour.url vira (validiran https + host getyourguide
//                     — uradna Option 1 booking povezava z partner_id)
// ============================================================================

import type { ProviderProduct, PriceUnit } from "../../types";
import type { GygTour } from "./types";
import { isGygTour, isValidGygCoordinates } from "./types";

/** Kapika rezultatov adapterja (1 iskanje × limit — gostota pod nadzorom). */
export const GYG_MAX_RESULTS = 24;

/** Format ID slike (uradna tabela: 132 = 480×320 px, JPEG q80). */
export const GYG_IMAGE_FORMAT_ID = "132";

/** Opombe cen (limit sanitize MAX_NOTE=60). */
const PRICE_NOTE_PERSON = {
  sl: "od-cena (najnižja, na osebo)",
  en: "from price (lowest, per person)",
} as const;

const PRICE_NOTE_GROUP = {
  sl: "od-cena na skupino (vir)",
  en: "from price per group (source)",
} as const;

const PRICE_NOTE_DEFAULTED = {
  sl: "od-cena (enota po viru)",
  en: "from price (unit per source)",
} as const;

const AVAILABILITY_NOTE = {
  sl: "razpoložljivost se preveri pri ponudniku",
  en: "availability confirmed with the provider",
} as const;

// ---------------------------------------------------------------------------
// ČIŠČENJE BESEDILA NEZaupANEGA VIRA (§17 — isti vzorec kot kiwitaxi
// cleanName / viator cleanViatorText / Task 44 §12: React escaping je
// DRUGA plast, adapter meja je PRVA — namerno OBA). Naslov in opis sta
// prosti besedili komercialnega API-ja, ki ga ne nadzorujemo: kontrolni
// znaki + HTML/JS injekcijski znaki stran, presledki zložijo, kap dolžine.
// ---------------------------------------------------------------------------

const TITLE_MAX_LEN = 200;
const DESCRIPTION_MAX_LEN = 1200;

/** Očisti prosti tekst vira (kontrolni znaki + injekcijski znakovni nabor). */
function cleanGygText(raw: string, maxLen: number): string {
  return raw
    // kontrolni znaki (vključno DEL) — lomijo izris/notes/dnevnike
    .replace(/[\u0000-\u001f\u007f]/g, "")
    // HTML/js injekcijski znaki (enak nabor kot kiwitaxi/viator meja)
    .replace(/[<>"'`{}$\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

// ---------------------------------------------------------------------------
// TIP IZ ACTIVITY_TYPE (kanonska taksonomija — brez GYG kategorij!)
// ---------------------------------------------------------------------------

/** Vrednosti vira, ki so po naravi TURE (izključni nabor dokumentiran). */
const TOUR_TYPES = new Set([
  "guidedTour",
  "privateTour",
  "multiDayTrip",
  "dayTrip",
  "hopOnHopOff",
  "bundle",
]);

/** Vstopniški produkti (iskren kanonski tip "ticket" — ikona 🎟️). */
const TICKET_TYPES = new Set([
  "entryTicket",
  "hostedTicket",
  "ticket",
  "cityCard",
]);

export function canonicalType(
  activityType: string | undefined
): "activity" | "tour" | "ticket" | "transfer" {
  if (activityType === "transfer") return "transfer";
  if (TICKET_TYPES.has(activityType ?? "")) return "ticket";
  if (TOUR_TYPES.has(activityType ?? "")) return "tour";
  if (activityType === "waterActivity" || activityType === "workshopOrClass") {
    return "activity";
  }
  // Neznan/odsoten — večinski privzeti vira (ture; isti vzorec kot Viator).
  return "tour";
}

/** subcategory = snake_case(activity_type) — izpeljano IZ VIRA. */
function subcategoryOf(activityType: string | undefined): string | undefined {
  if (typeof activityType !== "string" || activityType.length === 0) return undefined;
  const snake = activityType
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9_]/g, "")
    .toLowerCase()
    .slice(0, 40);
  return snake.length > 0 ? snake : undefined;
}

// ---------------------------------------------------------------------------
// SEMANTIKA CENE (§12 — enota iz PROSTEGA BESEDILA vira)
// ---------------------------------------------------------------------------

/**
 * Enota cene iz description vira (prosto besedilo — uradni primeri:
 * 'individual', 'per person', 'per group', 'per Group up to 10 people').
 * Neznana/odsotna → per_person + RAZKRIVAJOČA opomba (privzetek
# dokumentiran; ne tiho ugibanje).
 */
function priceUnitOf(
  description: string | undefined
): { unit: PriceUnit; note: { sl: string; en: string } } {
  const d = (description ?? "").toLowerCase();
  if (/group/.test(d)) {
    return { unit: "total", note: PRICE_NOTE_GROUP };
  }
  if (/individual|per\s*person/.test(d)) {
    return { unit: "per_person", note: PRICE_NOTE_PERSON };
  }
  return { unit: "per_person", note: PRICE_NOTE_DEFAULTED };
}

// ---------------------------------------------------------------------------
// IZBIRA SLIKE (primarna, https, [format_id] zamenjan, dovoljen host)
// ---------------------------------------------------------------------------

/**
 * §17 meja zaupanja za sliko NEZAUPANEGA vira: https + host
 * cdn.getyourguide.com/getyourguide.com (produkcija) ali *.gygtest.net /
 * *.gygtest.com (uradni test domeni iz OpenAPI specifikacije). Vse
 * ostalo (http, javascript:, data:, tuj https host) → undefined (slika
 * ODSOTNA — ne izmišljujemo, ne prikažemo).
 */
export function gygImageUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  let url = raw.trim();
  if (url.length === 0 || url.length > 500) return undefined;
  // Pogodba: URL vsebuje [format_id] prostor (wiki Image-Formats) —
  // zamenjamo z URSADNIM formatom 132 (480×320).
  url = url.replace(/\[format_id\]/g, GYG_IMAGE_FORMAT_ID);
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return undefined;
    const h = parsed.hostname;
    const allowed =
      h === "cdn.getyourguide.com" ||
      h === "getyourguide.com" ||
      h.endsWith(".getyourguide.com") ||
      h.endsWith(".gygtest.net") ||
      h.endsWith(".gygtest.com");
    if (!allowed) return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function pickImageUrl(
  pictures: GygTour["pictures"]
): { url: string; credit: string } | undefined {
  if (!Array.isArray(pictures) || pictures.length === 0) return undefined;
  const primary = pictures[0];
  if (!primary || typeof primary !== "object") return undefined;
  // ssl_url (https) je PREDNO url (spec: obe obstajata, ssl je varna).
  const raw = primary.ssl_url ?? primary.url;
  const url = gygImageUrl(raw);
  if (!url) return undefined;
  // copyright vira (nullable) → atribucija; sicer © GetYourGuide.
  const credit =
    typeof primary.copyright === "string" && primary.copyright.trim().length > 0
      ? primary.copyright.trim().slice(0, 80)
      : "© GetYourGuide";
  return { url, credit };
}

// ---------------------------------------------------------------------------
// TOUR.URL PREDPOMNILNIK (za /go/getyourguide?product= razrešitev)
// ---------------------------------------------------------------------------
// tour.url je uradna Option 1 booking povezava (getyourguide.com z
// partner_id, ki ga vir samodejno priključi našemu žetonu). Predpomnimo
// jo strežniško (TTL 24 h — poti URL-jev so stabilne; to NI predpomnilnik
// inventarja ampak pot rezervacije; vir prepoveduje cachati IZPIS
// iskanj, URL produkta pa je del njihove lastne booking poti). /go
// najprej pogleda sem, nato pade na GETYOURGUIDE_PARTNER_ID povezavo
// ali čisto domačo stran (fail-closed).

const TOUR_URL_TTL_MS = 24 * 60 * 60 * 1000;
const TOUR_URL_MAX = 500;

/**
 * §17 meja zaupanja za tour.url NEZAUPANEGA vira: https + host
 * www.getyourguide.com/getyourguide.com (produkcija, uradna Option 1
 * povezava) ali *.gygtest.net/*.gygtest.com (test domeni specifikacije).
 * Vse ostalo → null (NE razrešimo, NE predpomnimo).
 */
export function gygSourceUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const url = raw.trim();
  if (url.length === 0 || url.length > 500) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return undefined;
    const h = parsed.hostname;
    const allowed =
      h === "www.getyourguide.com" ||
      h === "getyourguide.com" ||
      h.endsWith(".gygtest.net") ||
      h.endsWith(".gygtest.com");
    if (!allowed) return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

let tourUrls = new Map<string, { url: string; at: number }>();

export function rememberGygTourUrl(tourId: number, url: string): void {
  if (!Number.isInteger(tourId) || tourId <= 0) return;
  // §17: ISTA meja zaupanja kot gygSourceUrl (vhod te funkcije je lahko
  // test/admin — NE zaupamo nizu URL-ja).
  const safe = gygSourceUrl(url);
  if (!safe) return;
  if (tourUrls.size >= TOUR_URL_MAX) {
    // FIFO: odstrani najstarejši vnos.
    let oldestKey: string | null = null;
    let oldestAt = Number.POSITIVE_INFINITY;
    for (const [k, v] of tourUrls) {
      if (v.at < oldestAt) {
        oldestAt = v.at;
        oldestKey = k;
      }
    }
    if (oldestKey != null) tourUrls.delete(oldestKey);
  }
  tourUrls.set(String(tourId), { url: safe, at: Date.now() });
}

export function lookupGygTourUrl(tourId: string): string | null {
  const hit = tourUrls.get(tourId);
  if (!hit) return null;
  if (Date.now() - hit.at > TOUR_URL_TTL_MS) {
    tourUrls.delete(tourId);
    return null;
  }
  return hit.url;
}

/** Testni hak / administracija. */
export function clearGygTourUrls(): void {
  tourUrls = new Map();
}

// ---------------------------------------------------------------------------
// GlAVNA PRESLIKAVA
// ---------------------------------------------------------------------------

export interface GygMapperContext {
  locale: "sl" | "en";
  /** ISO čas uspešnega pridobitve od vira (semantika lastUpdated). */
  fetchedAt: string;
  /**
   * Ali vir POTRJUJE valuto EUR (iz _metadata.exchange.currency, kadar je
   * podan). false → cene NE preslikamo (ne pretvarjamo, ne lažemo).
   */
  currencyConfirmedEur: boolean;
  /** Ali je bil datumski filter poizvedbe uporabljen (iskrena opomba). */
  dateFiltered: boolean;
}

export function gygTourToProduct(
  tour: GygTour,
  ctx: GygMapperContext
): ProviderProduct | null {
  const { locale, fetchedAt } = ctx;

  const title = cleanGygText(tour.title, TITLE_MAX_LEN);
  if (title.length === 0) return null;

  // === Geo: PREDSTAVITVENA lokacija produkta (konzervativno "city"). ===
  const hasCoords = isValidGygCoordinates(tour.coordinates);
  const lat = hasCoords ? (tour.coordinates as { lat: number; long: number }).lat : undefined;
  const lng = hasCoords ? (tour.coordinates as { lat: number; long: number }).long : undefined;

  // === Lokacijski namig: prva city/poi lokacija (sicer locations[0]). ===
  const locations = Array.isArray(tour.locations) ? tour.locations : [];
  const specific =
    locations.find((l) => l?.type === "city" || l?.type === "poi") ??
    locations[0];
  const addressHint =
    specific && typeof specific.name === "string" && specific.name.trim().length > 0
      ? cleanGygText(specific.name, 80)
      : undefined;

  // === Cena (StartingPrice; valuta EUR potrjena; ne pretvarjamo) ===
  const amount = tour.price?.values?.amount;
  const hasPrice =
    ctx.currencyConfirmedEur &&
    typeof amount === "number" &&
    Number.isFinite(amount) &&
    amount > 0 &&
    amount <= 100_000;
  const { unit, note: priceNote } = priceUnitOf(tour.price?.description);

  // === Ocena (samo pri dokazanih recenzijah) ===
  const nRatings = tour.number_of_ratings;
  const rating = tour.overall_rating;
  const hasRating =
    typeof nRatings === "number" &&
    Number.isFinite(nRatings) &&
    nRatings > 0 &&
    typeof rating === "number" &&
    Number.isFinite(rating) &&
    rating > 0 &&
    rating <= 5;

  // === Opis: IZKLJUČNO iz podatkov vira (abstract + trajanje iz vira). ===
  const descParts: string[] = [];
  const abstract = tour.abstract ?? tour.description;
  if (typeof abstract === "string" && abstract.trim().length > 0) {
    descParts.push(cleanGygText(abstract, DESCRIPTION_MAX_LEN));
  }
  const d = Array.isArray(tour.durations) ? tour.durations[0] : undefined;
  if (
    d &&
    typeof d.duration === "number" &&
    Number.isFinite(d.duration) &&
    d.duration > 0 &&
    (d.unit === "minute" || d.unit === "hour" || d.unit === "day")
  ) {
    if (d.unit === "hour") {
      descParts.push(
        locale === "en"
          ? `Duration: ${Math.round(d.duration * 10) / 10} h`
          : `Trajanje: ${Math.round(d.duration * 10) / 10} h`
      );
    } else if (d.unit === "minute") {
      descParts.push(
        locale === "en"
          ? `Duration: ${Math.round(d.duration)} min`
          : `Trajanje: ${Math.round(d.duration)} min`
      );
    } else {
      descParts.push(
        locale === "en"
          ? `Duration: ${Math.round(d.duration * 10) / 10} days`
          : `Trajanje: ${Math.round(d.duration * 10) / 10} dni`
      );
    }
  }
  const description =
    descParts.length > 0 ? descParts.join("\n\n").slice(0, DESCRIPTION_MAX_LEN) : undefined;

  // === Slika (primarna; https; [format_id]; copyright vira) ===
  const image = pickImageUrl(tour.pictures);

  // === sourceUrl / bookingUrl ===
  // §17 meja zaupanja: tour.url NEZAUPANEGA vira mora biti https NA
  // getyourguide.com gostitelju (uradna Option 1 booking povezava z
  // partner_id) ali test domeni specifikacije. Tuj host NE razrešimo
  // NE predpomnimo — (/go host allowlist je zadnja varovalka, TA pa prva).
  const sourceUrl = gygSourceUrl(tour.url);
  // Predpomni booking povezavo za /go razrešitev (strežniško).
  if (sourceUrl) rememberGygTourUrl(tour.tour_id, sourceUrl);

  const product: ProviderProduct = {
    id: `getyourguide:${tour.tour_id}`,
    provider: "getyourguide",
    providerProductId: String(tour.tour_id),
    type: canonicalType(tour.activity_type),
    ...(subcategoryOf(tour.activity_type)
      ? { subcategory: subcategoryOf(tour.activity_type) }
      : {}),
    title,
    ...(description ? { description } : {}),
    // geo: predstavitvena lokacija produkta (geoPrecision "city" — NIKOLI
    // exact meeting point; uradni primer vira je mestni center)
    ...(hasCoords ? { lat: lat as number, lng: lng as number } : {}),
    ...(hasCoords ? { geoPrecision: "city" as const } : {}),
    ...(hasCoords && addressHint ? { address: addressHint } : {}),
    ...(image ? { image: image.url, imageCredit: image.credit } : {}),
    ...(hasRating
      ? {
          rating: Math.round((rating as number) * 100) / 100,
          reviewCount: nRatings as number,
        }
      : {}),
    ...(hasPrice
      ? {
          price: {
            amount: Math.round((amount as number) * 100) / 100,
            currency: "EUR" as const,
            unit,
            fromPrice: true,
            note: priceNote[locale],
          },
        }
      : {}),
    availability: {
      status: "unknown" as const,
      note: AVAILABILITY_NOTE[locale],
    },
    bookingMode: "affiliate_redirect" as const,
    // NAŠA konstrukcija (ne provider URL): /go validira tour_id in
    // razreši globoko povezavo (predpomnilnik → partner_id fallback).
    bookingUrl: `/go/getyourguide?product=${encodeURIComponent(String(tour.tour_id))}`,
    ...(sourceUrl ? { sourceUrl } : {}),
    lastUpdated: fetchedAt,
    license: {
      source: "GetYourGuide Partner API",
      attribution: "© GetYourGuide",
    },
  };

  return product;
}

/** Preslikaj seznam produktov (fail-safe: slab zapis odpade, NE sesuje —
 *  §17: vsak VHOD preverimo tudi tu (meja adapterja velja za VSAKEGA
 *  klicatelja, ne samo za adapterjevo pot). */
export function mapGygTours(
  tours: GygTour[],
  ctx: GygMapperContext
): { products: ProviderProduct[]; skipped: number } {
  const products: ProviderProduct[] = [];
  let skipped = 0;
  for (const t of tours) {
    if (!isGygTour(t)) {
      skipped++;
      continue;
    }
    const p = gygTourToProduct(t, ctx);
    if (p) products.push(p);
    else skipped++;
  }
  return { products, skipped };
}
