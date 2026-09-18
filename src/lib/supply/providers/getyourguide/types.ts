// ============================================================================
// TRAVEL SUPPLY MAP — GETYOURGUIDE: POGODBENE VRSTE (Task 46, 1.51.0)
// ============================================================================
// VRSTE SO PRESLIKANE IZ URADNE OpenAPI SPECIFIKACIJE GetYourGuide Partner
// API (code.getyourguide.com/partner-api-spec/spec/api.yaml + delne datoteke
// paths/tours.yaml, components/commons/{query,fields,objects}.yaml,
// components/schema/{tour,picture,location}.yaml — prebrano ŽIVO 18. 9. 2026)
// ter uradnega GitHub wikija (Getting-started.md, Access-levels.md,
// Image-Formats.md, Making-a-booking.md — kloniran in prebran v polnosti).
// Polja, ki jih specifikacija ne definira za ta odgovor, so OPCIJSKA —
// nikoli jih ne izmišljujemo.
//
// POGODBA (živo preverjena):
//  - Base:      https://api.getyourguide.com/1/ (verzija v POTI — wiki
//               Getting-started: "currently only 1 is available");
//               test strežnik po specifikaciji: https://api.gygtest.net
//  - Auth:      glava X-ACCESS-TOKEN: <API access token> na VSAKEM klicu
//               + Accept: application/json (OBVEZNO, wiki Getting-started)
//               (živi dokaz brez žetona: HTTP 401, errorCode 2420
//               "The access token is invalid.")
//  - Query:     vsak GET zahteva vsaj currency + cnt_language (stateless,
//               wiki Getting-started)
//  - Jeziki:    sl NI podprt (podprti: ar, ca, cs, da, de, en, el, es, et,
//               fi, fr, he, hr, hu, id, it, ja, ko, lt, lv, nl, no, pl, pt,
//               ru, sk, ro, sv, tr, zh-hant) → adapter VEDNO zahteva "en"
//               (dokumentirana omejitev; lastne slovenske oznake dodamo sami,
//               vsebina vira ostane EN — isti vzorec kot Viator)
//  - Valuta:    EUR je podprta za prikaz (wiki Getting-started)
//  - Iskanje:   GET /1/tours — parameter coordinates[] = [lat, lng, radius]
//               (»Mutually exclusive with 'q' parameter! Search by latitude,
//               longitude and radius passed as URL array.«, spec query.yaml;
//               primer: [48.85693, 2.3412, 10]) — ENOTA RADIJA V SPECIFIKACIJI
//               NI DOKUMENTIRANA (UNKNOWN; adapter dokumentira privzetek km +
//               krajevni post-filter pinov na bbox kot varovalko)
//  - Tierji:    BASIC/LIMITED_READ (katalog: /tours, /tours/{id}, /categories;
//               preformatted SAMO teaser), READ (+availability, price-breakdown,
//               options, suppliers; teaser/full/home), BOOKING (+carts,
//               bookings, payments) — wiki Access-levels
//  - Rate limit: privzeto 130 klicev/min; ob presegu VSI nadaljnji klici
//               BLOKIRANI 5 MINUT (wiki Getting-started) — adapter ima za 429
//               negativni predpomnilnik 310 s (dokumentirana blokada)
//  - Predpomnilnik: vir IZRECNO odvrača od predpomnjenja izpisa (»We
//               encourage to access the API in real-time; please do not
//               scrape the API in an attempt to cache its output.«) →
//               adapter NE predpomni rezultatov (cacheTtlMs 0 v registru)
//  - ID produkta: tour_id — CELO ŠTEVILO (spec fields.yaml TourId)
//  - Url:       tour.url = globoka povezava na getyourguide.com Z partner_id
//               (uradni Making-a-booking: »automatically populated with your
//               partner_id … you will receive your commission« — Option 1
//               booking prek tržnice)
// ============================================================================

/** Slika vira (spec schema/picture.yaml) — URL vsebuje [format_id] prostor. */
export interface GygPicture {
  id?: number;
  url?: string;
  /** HTTPS varianta (ista pot — uporabimo PREDNO url). */
  ssl_url?: string;
  verified?: boolean;
  /** Informacija o avtorskih pravicah slike (nullable, lahko odsotna). */
  copyright?: string | null;
}

/** Koordinate vira (spec commons/objects.yaml) — {lat, long}. */
export interface GygCoordinates {
  lat?: number;
  long?: number;
}

/** Lokacija vira (spec schema/location.yaml) — vrstni red po pomembnosti. */
export interface GygLocation {
  location_id?: number;
  /** area | city | poi | subcontinent | country | neighborhood | continent. */
  type?: string;
  name?: string;
  city?: string | null;
  country?: string;
  coordinates?: GygCoordinates;
  parent_id?: number;
}

/** Kategorija produkta (spec TourCategoryMinimal). */
export interface GygTourCategory {
  category_id?: number;
  name?: string;
}

/** Trajanje (spec commons/objects.yaml Durations — day|hour|minute). */
export interface GygDuration {
  duration?: number;
  unit?: string;
}

/**
 * StartingPrice (spec commons/objects.yaml): »Should be read as e.g.
 * 'from XX.YY USD'« — description je PROSTO BESEDILO enote vira
 * (primeri uradne dokumentacije: 'individual', 'per group',
 * 'per Group up to 10 people', 'per person').
 */
export interface GygStartingPrice {
  values?: { amount?: number };
  description?: string;
}

/**
 * Tour — element data.tours[] iz GET /1/tours (spec schema/tour.yaml +
 * uradni primer iz Making-a-booking.md: Catacombs t66985).
 * tour_code je DEPRECATED ("does not contain any meaningful information")
 * — ga NAMERNO ne preslikamo.
 */
export interface GygTour {
  tour_id: number;
  title: string;
  abstract?: string;
  description?: string;
  cond_language?: string[];
  overall_rating?: number;
  number_of_ratings?: number;
  pictures?: GygPicture[];
  coordinates?: GygCoordinates;
  price?: GygStartingPrice;
  categories?: GygTourCategory[];
  locations?: GygLocation[];
  /** Glavni tip aktivnosti (prost nabor: entryTicket, guidedTour, …). */
  activity_type?: string;
  url?: string;
  durations?: GygDuration[];
  bestseller?: boolean;
  certified?: boolean;
  has_pick_up?: boolean;
  is_auto_translation?: boolean;
  free_sale?: boolean;
}

/** _metadata iz odgovora /1/tours (spec schema/metadata.yaml + primeri). */
export interface GygMetadata {
  totalCount?: number;
  limit?: number;
  offset?: number;
  /** Dejansko uporabljena valuta (primer: { rate: 1, currency: "eur" }). */
  exchange?: { rate?: number; currency?: string };
  status?: string;
}

/** Odgovor GET /1/tours. */
export interface GygToursResponse {
  _metadata?: GygMetadata;
  data?: { tours?: GygTour[] };
}

// ---------------------------------------------------------------------------
// FAIL-SAFE VARNOSTNI VZORCI (isti vzorec kot kiwitaxi/validate.ts in
// viator/types.ts — en slab zapis NE sme podreti celotne plasti)
// ---------------------------------------------------------------------------

/**
 * Veljaven tour_id (meja zaupanja za /go/getyourguide?product=): CELO
 * število > 0 kot niz, 1–10 števk (spec TourId: integer). Po konstrukciji
 * nemogoče vbrizgati pot/parametre; končni izhod /go vseeno gre skozi
 * host allowlist.
 */
export const GYG_TOUR_ID_RE = /^\d{1,10}$/;

export function isGygTourId(v: unknown): v is string {
  return typeof v === "string" && GYG_TOUR_ID_RE.test(v) && Number(v) > 0;
}

/** Minimalna veljavnost produkta vira: tour_id + naslov (drugo je opcijsko). */
export function isGygTour(v: unknown): v is GygTour {
  if (!v || typeof v !== "object") return false;
  const t = v as Partial<GygTour>;
  return (
    typeof t.tour_id === "number" &&
    Number.isInteger(t.tour_id) &&
    t.tour_id > 0 &&
    t.tour_id <= Number.MAX_SAFE_INTEGER &&
    typeof t.title === "string" &&
    t.title.trim().length > 0
  );
}

/** Obrambno preverjanje seznama produktov (slabi elementi odpadejo). */
export function filterValidTours(
  raw: unknown
): { valid: GygTour[]; skipped: number } {
  if (!Array.isArray(raw)) return { valid: [], skipped: 0 };
  const valid: GygTour[] = [];
  let skipped = 0;
  for (const item of raw) {
    if (isGygTour(item)) valid.push(item);
    else skipped++;
  }
  return { valid, skipped };
}

/** Veljavne koordinate vira (meje ISO 6709 iz spec fields.yaml). */
export function isValidGygCoordinates(
  c: GygCoordinates | undefined
): c is GygCoordinates & { lat: number; long: number } {
  return (
    c != null &&
    typeof c.lat === "number" &&
    typeof c.long === "number" &&
    Number.isFinite(c.lat) &&
    Number.isFinite(c.long) &&
    Math.abs(c.lat) <= 90 &&
    Math.abs(c.long) <= 180
  );
}
