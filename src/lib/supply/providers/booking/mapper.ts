// ============================================================================
// TRAVEL SUPPLY MAP — BOOKING: KANONSKA PRESLIKAVA (Task 53)
// ============================================================================
// BookingAccommodation (+ cene iz rates klica) → ProviderProduct.
// KANONSKI MODEL SE NE SPREMENJA: nobeno booking* polje ne pride v
// ProviderProduct — vse Booking specifike ostanejo v tej mapi (izjema
// po arhitekturi: (provider, providerProductId) JE ključ nazaj pri
// ponudniku).
//
// PRESLIKAVA (vsaka odločitev dokumentirana; vir = Demand API v3):
//  - type:            VEDNO "accommodation" (kanonska kategorija)
//  - title:           name nastanitve (DEFENZIVNO: name ALI title)
//  - geo:             pin = location.latitude/longitude nastanitve →
//                     geoPrecision "exact" (objekt/podatki nepremičnine —
//                     točna lokacija). BREZ koordinat → BREZ pina
//                     (iskreno — NE pinamo po mestu). address = deli iz
//                     location.address (dokumentirana tabela nizov).
//  - cena:            IZKLJUČNO iz rates klica (POST /v3/accommodations/
//                     rates): NAJNIŽJA nočna cena med bloki nastanitve →
//                     unit "per_night" + fromPrice: true (spodnja meja
//                     po blokih, ne zagobljen citat) + opomba iskrenosti.
//                     Nastanitev brez (veljavne) cene → BREZ cene (0 NI
//                     cena — nikoli je ne vstavimo). Valuta: request ima
//                     currency=EUR → odsotna valuta v odgovoru pomeni
//                     ZAHTEVANO valuto (isti vzorec kot Viator);
//                     IZRECNA ne-EUR valuta → ceno NE preslikamo (nimamo
//                     vira tečaja, pretvorba bi bila IZMIŠLJENA).
//  - razpoložljivost: "unknown" (rates bloki implicirajo bookabilnost,
//                     a je NE preverjamo izrecno — cena ≠ dostopnost)
//  - ocena/opis:      ODSOTNA (dokumentirana oblika iskanja ju NE navaja
//                     — ne ugibamo imen polj; iskrena odločitev)
//  - slika:           DEFENZIVNA DOMNEVA (photo_url / photos[]) — https +
//                     host booking.com/bstatic.com družine (CDN vira;
//                     DOCUMENTED-ASSUMPTION allowlist — ob aktivaciji
//                     potrdi) → imageCredit "© Booking.com". Slika
//                     ODSOTNA, kadar je ni ali ni na dovoljenem hostu.
//  - bookingMode:     affiliate_redirect; bookingUrl = "/go/hotels?dest=
//                     {kanonična najbližja destinacija}" (NAŠA konstrukcija
//                     po obstoječi affiliate ruti /go/hotels — iskalna
//                     stran Booking.com za destinacijo; /go vrata sama
//                     whitelistajo dest vrednost)
//  - sourceUrl:       ODSOTNO (pogodba iskanja NE vrača javnega produktnega
//                     URL-ja — dokumentirano)
//  - license:         {source: "Booking.com Demand API",
//                      attribution: "© Booking.com"}
// ============================================================================

import type { ProviderProduct } from "../../types";
import type {
  BookingAccommodation,
  BookingRateAccommodation,
  BookingRateBlock,
} from "./types";
import {
  bookingAccommodationId,
  isBookingAccommodation,
} from "./types";

/** Kapika rezultatov adapterja (gostota pod nadzorom). */
export const BOOKING_MAX_RESULTS = 48;

/** Opomba cene (limit sanitize MAX_NOTE=60). */
const PRICE_NOTE = {
  sl: "od-cena na noč (najnižji blok)",
  en: "from price per night (lowest block)",
} as const;

const AVAILABILITY_NOTE = {
  sl: "razpoložljivost se preveri pri ponudniku",
  en: "availability confirmed with the provider",
} as const;

// ---------------------------------------------------------------------------
// ČIŠČENJE BESEDILA NEZaupANEGA VIRA (isti vzorec kot viator/gyg/tiqets:
// React escaping je DRUGA plast, adapter meja je PRVA — namerno OBA).
// ---------------------------------------------------------------------------

const TITLE_MAX_LEN = 200;
const ADDRESS_MAX_LEN = 200;

/** Očisti prosti tekst vira (kontrolni znaki + injekcijski znakovni nabor). */
function cleanBookingText(raw: string, maxLen: number): string {
  return raw
    // kontrolni znaki (vključno DEL) — lomijo izris/notes/dnevnike
    .replace(/[\u0000-\u001f\u007f]/g, "")
    // HTML/js injekcijski znaki (enak nabor kot ostali adapterji)
    .replace(/[<>"'`{}$\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

// ---------------------------------------------------------------------------
// CENE IZ RATES ODGOVORA (najnižja NOČNA cena po nastanitvi)
// ---------------------------------------------------------------------------

/**
 * Numerična nočna cena enega bloka (number > 0) — DEFENZIVNO po plavžnih
 * oblikah (DOCUMENTED-ASSUMPTION, ob aktivaciji potrdi):
 *  1. price.per_night — IZRECNA nočna cena;
 *  2. nightly_price — IZRECNA nočna cena;
 *  3. price.amount — cena bloka; NAŠA OKNO JE VEDNO NATANČNO 1 NOČ
 *     (checkout = checkin + 1 dan — glej adapter.ts stayDates) ⇒ cena
 *     bloka za to okno POSEBNO pomeni nočno ceno (dokumentirana domneva).
 * Valuta: EUR izrecno ALI odsotna (request currency=EUR — vzorec Viator);
 * izrecna ne-EUR → null (NE pretvarjamo, NE lažemo o valuti).
 */
function blockNightlyAmount(block: BookingRateBlock): number | null {
  const price = block.price;
  if (price != null && typeof price === "object") {
    const currency =
      typeof price.currency === "string"
        ? price.currency.trim().toUpperCase()
        : null;
    if (currency != null && currency !== "EUR") return null;
    for (const candidate of [price.per_night, price.amount]) {
      if (
        typeof candidate === "number" &&
        Number.isFinite(candidate) &&
        candidate > 0
      ) {
        return candidate;
      }
    }
    return null;
  }
  const nightly = block.nightly_price;
  if (typeof nightly === "number" && Number.isFinite(nightly) && nightly > 0) {
    return nightly;
  }
  return null;
}

/**
 * Izlušči NAJNIŽJO veljavno nočno ceno po nastanitvi iz rates odgovora.
 * Fail-safe: slab vnos (neveljaven id/brez blokov/blok brez cene) NE sesuje
 * izluščenih cen ostalih — nastanitev preprosto ostane BREZ cene.
 */
export function extractNightlyPrices(
  rawRateAccommodations: unknown
): Map<string, number> {
  const nightly = new Map<string, number>();
  if (!Array.isArray(rawRateAccommodations)) return nightly;
  for (const entry of rawRateAccommodations) {
    if (!entry || typeof entry !== "object") continue;
    const r = entry as Partial<BookingRateAccommodation>;
    const id = bookingAccommodationId(r.accommodation_id);
    if (id == null) continue;
    const blocks = Array.isArray(r.blocks) ? r.blocks : [];
    let best: number | null = null;
    for (const block of blocks) {
      if (!block || typeof block !== "object") continue;
      const amount = blockNightlyAmount(block as BookingRateBlock);
      if (amount != null && (best == null || amount < best)) {
        best = amount;
      }
    }
    if (best != null) {
      // Nastanitev se lahko ponovi (batch) — obdržimo NIŽJO ceno.
      const prev = nightly.get(id);
      if (prev == null || best < prev) nightly.set(id, best);
    }
  }
  return nightly;
}

// ---------------------------------------------------------------------------
// SLIKA (defenzivna domneva; https; host booking.com/bstatic.com)
// ---------------------------------------------------------------------------

/**
 * Meja zaupanja za sliko NEZAUPANEGA vira: https + host booking.com /
 * *.booking.com / *.bstatic.com (CDN družina vira — DOCUMENTED-ASSUMPTION
 * allowlist, ob aktivaciji potrdi). Vse ostalo → undefined (slika
 * ODSOTNA — iskreno, brez nadomestka).
 */
export function bookingImageUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const url = raw.trim();
  if (url.length === 0 || url.length > 500) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return undefined;
    const h = parsed.hostname;
    const allowed =
      h === "booking.com" ||
      h.endsWith(".booking.com") ||
      h === "bstatic.com" ||
      h.endsWith(".bstatic.com");
    if (!allowed) return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function pickImageUrl(
  acc: BookingAccommodation
): string | undefined {
  // DEFENZIVNO: photo_url (niz) ALI photos (tabela objektov/nizov).
  const direct = bookingImageUrl(acc.photo_url);
  if (direct) return direct;
  if (!Array.isArray(acc.photos)) return undefined;
  for (const item of acc.photos) {
    const raw =
      typeof item === "string"
        ? item
        : item != null && typeof item === "object" && typeof item.url === "string"
          ? item.url
          : undefined;
    const url = bookingImageUrl(raw);
    if (url) return url;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// NASLOV (deli iz location.address — dokumentirana tabela nizov)
// ---------------------------------------------------------------------------

function locationAddress(
  acc: BookingAccommodation
): string | undefined {
  const loc = acc.location;
  if (loc == null || !Array.isArray(loc.address)) return undefined;
  const parts = loc.address
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .map((p) => cleanBookingText(p, 80))
    .filter((p) => p.length > 0);
  if (parts.length === 0) return undefined;
  return parts.join(", ").slice(0, ADDRESS_MAX_LEN);
}

// ---------------------------------------------------------------------------
// GLAVNA PRESLIKAVA
// ---------------------------------------------------------------------------

export interface BookingMapperContext {
  locale: "sl" | "en";
  /** ISO čas uspešnega pridobitve od vira (semantika lastUpdated). */
  fetchedAt: string;
  /**
   * Najnižja nočna cena EUR po ID-ju nastanitve (iz rates klica).
   * Nastanitev brez vnosa → BREZ cene (iskreno).
   */
  nightlyById: Map<string, number>;
  /**
   * Kanonična destinacija (ime) za bookingUrl /go/hotels?dest= — najbližja
   * nastanitvi oz. središču viewporta (izračun v adapter.ts).
   */
  destFor: (acc: BookingAccommodation) => string;
}

export function bookingAccommodationToProduct(
  acc: BookingAccommodation,
  ctx: BookingMapperContext
): ProviderProduct | null {
  const { locale, fetchedAt } = ctx;

  // Identiteta (STROGO: mapper meja velja za VSAGEGA klicatelja).
  const id = bookingAccommodationId(acc.id);
  if (id == null) return null;

  // Naslov (DEFENZIVNO: name ALI title).
  const rawName =
    typeof acc.name === "string" && acc.name.trim().length > 0
      ? acc.name
      : typeof acc.title === "string" && acc.title.trim().length > 0
        ? acc.title
        : null;
  if (rawName == null) return null;
  const title = cleanBookingText(rawName, TITLE_MAX_LEN);
  if (title.length === 0) return null;

  // === Geo: točna lokacija nepremičnine (sicer BREZ pina — iskreno). ===
  const loc = acc.location;
  const lat =
    loc != null &&
    typeof loc.latitude === "number" &&
    Number.isFinite(loc.latitude) &&
    Math.abs(loc.latitude) <= 90
      ? loc.latitude
      : null;
  const lng =
    loc != null &&
    typeof loc.longitude === "number" &&
    Number.isFinite(loc.longitude) &&
    Math.abs(loc.longitude) <= 180
      ? loc.longitude
      : null;
  const hasCoords = lat != null && lng != null;
  const address = locationAddress(acc);

  // === Cena: SAMO veljavna nočna cena iz rates klica (sicer ODSOTNA). ===
  const nightly = ctx.nightlyById.get(id);
  const hasPrice = nightly != null && nightly > 0;

  // === Slika (defenzivna domneva; validiran https + dovoljen host). ===
  const image = pickImageUrl(acc);

  // === Destinacija za /go/hotels affiliate povezavo. ===
  const dest = ctx.destFor(acc);

  const product: ProviderProduct = {
    id: `booking:${id}`,
    provider: "booking",
    providerProductId: id,
    type: "accommodation",
    title,
    // geo: točna lokacija nastanitve (geoPrecision exact — dokumentirana
    // polja location.latitude/longitude; brez njih = brez pina)
    ...(hasCoords ? { lat: lat as number, lng: lng as number } : {}),
    ...(hasCoords ? { geoPrecision: "exact" as const } : {}),
    ...(address ? { address } : {}),
    ...(image ? { image, imageCredit: "© Booking.com" } : {}),
    ...(hasPrice
      ? {
          price: {
            amount: Math.round((nightly as number) * 100) / 100,
            currency: "EUR" as const,
            unit: "per_night" as const,
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
    // NAŠA konstrukcija (ne provider URL): obstoječa affiliate ruta
    // /go/hotels — iskalna stran Booking.com za KANONSKO destinacijo
    // (/go vrata sama whitelistajo dest vrednost prek canonicalDest).
    // Pogodba iskanja NE vrača javnega produktnega URL-ja → NE delamo
    // globoke povezave na produkt (iskrena kategorijaška preusmeritev).
    bookingUrl: `/go/hotels?dest=${encodeURIComponent(dest)}`,
    // sourceUrl NAMERNO ODSOTEN: dokumentirana oblika iskanja ne vrača
    // javnega produktnega URL-ja (ne izmišljujemo).
    lastUpdated: fetchedAt,
    license: {
      source: "Booking.com Demand API",
      attribution: "© Booking.com",
    },
  };

  return product;
}

/**
 * Preslikaj seznam nastanitev (fail-safe: slab zapis odpade, NE sesuje —
 * isti vzorec kot viator/gyg/tiqets: vsak VHOD preverimo tudi tu).
 */
export function mapBookingAccommodations(
  accommodations: BookingAccommodation[],
  ctx: BookingMapperContext
): { products: ProviderProduct[]; skipped: number } {
  const products: ProviderProduct[] = [];
  let skipped = 0;
  for (const acc of accommodations) {
    if (!isBookingAccommodation(acc)) {
      skipped++;
      continue;
    }
    const p = bookingAccommodationToProduct(acc, ctx);
    if (p) products.push(p);
    else skipped++;
  }
  return { products, skipped };
}
