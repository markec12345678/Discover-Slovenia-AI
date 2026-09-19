// ============================================================================
// TRAVEL SUPPLY MAP — TIQETS: POGODBENE VRSTE (Task 53)
// ============================================================================
// VRSTE ZA TIQETS DISTRIBUTOR API v2 (api.tiqets.com).
//
// KAJ JE ŽIVO PREVERJENO (curl, danes — Task 53-1):
//  - Host in vrata: https://api.tiqets.com, API v2 (napakovni ovojnica je
//    povedala api_version {major: 2, minor: 7}).
//  - GET /v2/products?city=amsterdam brez/ slabim ključem → HTTP 401 JSON:
//    {"success": false, "api_version": {…}, "error": "unauthorized",
//     "message": "The key is incorrect or the user is not authorized to
//     access this resource."}
//    ⇒ IZ OVOJNICE JE DOKUMENTIRANA KONVENCIJA USPEŠNEGA ODGOVORA:
//    {"success": true, "data": […]} (success flag + data tabela).
//
// KAJ JE DOCUMENTED-ASSUMPTION (celoten API referenca je ZA partner
// portalom portals.tiqets.com, ki zahteva prijavo — Task 53-1):
//  - IMENA POLJ produkta (id/name/title/description/venue/price/images/url)
//    so DEFENZIVNE DOMNEVE po javno znani obliki Tiqets vstopniških
//    produktov. Mapper zato sprejema več plavžnih oblik (title ALI name,
//    latitude/longitude ALI lat/lng, cena kot objekt {value|amount,
//    currency} ALI število) in VSAKO polje STROGO preverja pred preslikavo.
//    Ob aktivaciji (ko partner portal odpre) se oblika POTRDI in po potrebi
//    pooštri — preslikovalne odločitve so dokumentirane v mapper.ts.
//  - NE preslikamo ocen/recenzij: imena polj so portal-gated → ocena
//    ODSOTNA (iskrena odločitev — ne ugibamo imen polj).
//  - Datum/število potnikov NE vplivata na iskanje po mestu (dokumentirana
//    oblika iz žive sonde pozna samo `city` parameter).
// ============================================================================

/** Lokacija/objekt vstopnice (DEFENZIVNO: lat/lng ALI latitude/longitude). */
export interface TiqetsVenue {
  name?: string;
  /** DOMNEVA: latitude/longitude (primarna oblika evropskih API-jev). */
  latitude?: number;
  longitude?: number;
  /** Obrambna alternativa (GYG uporablja lat/long). */
  lat?: number;
  lng?: number;
  address?: string;
  city?: string;
  country?: string;
}

/** Cena vstopnice (DEFENZIVNO: value ALI amount; valuta obvezna za EUR). */
export interface TiqetsPriceObject {
  value?: number;
  amount?: number;
  currency?: string;
}

/** Slika vstopnice (DEFENZIVNO: objekt z url ALI niz URL-ja). */
export interface TiqetsImageObject {
  url?: string;
  secure_url?: string;
}

/**
 * Produkt (vstopnica) — element data[] iz GET /v2/products.
 * VSA polja razen ovojnice so DOCUMENTED-ASSUMPTION (portal-gated).
 */
export interface TiqetsRawProduct {
  /** ID pri viru (številka ali niz — obrambno oboje). */
  id?: number | string;
  /** Naslov (DEFENZIVNO: title ALI name). */
  title?: string;
  name?: string;
  description?: string;
  venue?: TiqetsVenue;
  /** Cena (objekt {value|amount, currency} ALI golo število). */
  price?: TiqetsPriceObject | number;
  images?: (TiqetsImageObject | string)[];
  /** Javna stran vstopnice pri viru (https). */
  url?: string;
}

/**
 * Ovojnica uspešnega odgovora (konvencija IZPELJANA IZ živo preverjene
 * napakovne ovojnice: success flag + data tabela).
 */
export interface TiqetsProductsResponse {
  success?: boolean;
  data?: TiqetsRawProduct[];
}

// ---------------------------------------------------------------------------
// FAIL-SAFE VARNOSTNI VZORCI (isti vzorec kot viator/types.ts in
// getyourguide/types.ts — en slab zapis NE sme podreti celotne plasti)
// ---------------------------------------------------------------------------

/**
 * ID produkta vira — meja zaupanja: pozitivna končna števka ALI niz
 * 1–64 znakov iz varnega nabora [A-Za-z0-9_-] (brez ločil/URL metaznakov;
 * ID NE gre v bookingUrl, gre pa v AI kontekst/izbire — čist vzorec je
 * obrambna meja). DOCUMENTED-ASSUMPTION: natančen format ID-jev je
 * portal-gated.
 */
export const TIQETS_PRODUCT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Veljaven ID produkta vira (številka > 0 ali varen niz). */
export function isTiqetsProductId(v: unknown): v is number | string {
  if (typeof v === "number") {
    return Number.isFinite(v) && v > 0;
  }
  if (typeof v === "string") {
    return TIQETS_PRODUCT_ID_RE.test(v);
  }
  return false;
}

/** ID kot kanonski NIZ (providerProductId) ali null, če neveljaven. */
export function tiqetsProductId(v: unknown): string | null {
  if (!isTiqetsProductId(v)) return null;
  return String(v);
}

/**
 * Minimalna veljavnost produkta vira (STROGO fail-closed):
 * veljaven id + ne-prazen naslov (title ALI name). Vse ostalo je opcijsko
 * — manjkajoče polje pomeni ODSOTNO polje na kanonskem produktu, NIKOLI
 * izmišljeno dopolnilo.
 */
export function isTiqetsRawProduct(v: unknown): v is TiqetsRawProduct {
  if (!v || typeof v !== "object") return false;
  const p = v as Partial<TiqetsRawProduct>;
  if (!isTiqetsProductId(p.id)) return false;
  const title =
    typeof p.title === "string" && p.title.trim().length > 0
      ? p.title
      : typeof p.name === "string" && p.name.trim().length > 0
        ? p.name
        : null;
  return title != null;
}

/** Obrambno preverjanje seznama produktov (slabi elementi odpadejo). */
export function filterValidTiqetsProducts(
  raw: unknown
): { valid: TiqetsRawProduct[]; skipped: number } {
  if (!Array.isArray(raw)) return { valid: [], skipped: 0 };
  const valid: TiqetsRawProduct[] = [];
  let skipped = 0;
  for (const item of raw) {
    if (isTiqetsRawProduct(item)) valid.push(item);
    else skipped++;
  }
  return { valid, skipped };
}

/**
 * Veljavne koordinate objekta (meje ISO 6709; DEFENZIVNO: latitude/
 * longitude ALI lat/lng). Ni koordinat → NI pina (iskreno — NE pinamo
 * po mestu, glej mapper.ts).
 */
export function tiqetsVenueCoords(
  venue: TiqetsVenue | undefined
): { lat: number; lng: number } | null {
  if (venue == null) return null;
  const lat =
    typeof venue.latitude === "number" && Number.isFinite(venue.latitude)
      ? venue.latitude
      : typeof venue.lat === "number" && Number.isFinite(venue.lat)
        ? venue.lat
        : null;
  const lng =
    typeof venue.longitude === "number" && Number.isFinite(venue.longitude)
      ? venue.longitude
      : typeof venue.lng === "number" && Number.isFinite(venue.lng)
        ? venue.lng
        : null;
  if (lat == null || lng == null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}
