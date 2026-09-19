// ============================================================================
// TRAVEL SUPPLY MAP — BOOKING.COM: POGODBENE VRSTE (Task 53)
// ============================================================================
// VRSTE ZA BOOKING.COM DEMAND API v3 (demand.booking.com).
//
// KAJ JE DOKUMENTIRANO JAVNO (developers.booking.com/demand/docs — JS
// renderani portal; Task 52 je preveril portal 200; Task 53-1 je
// dokumentiral endpoint obliki iz javne dokumentacije):
//  - GET /v3/accommodations/search?bbox=<west,south,east,north>&checkin=
//    YYYY-MM-DD&checkout=YYYY-MM-DD&adults=<pax>&room_quantity=1&currency=
//    EUR&locale=en-us → {"data": [{…"accommodation": {id, name,
//    "location": {latitude, longitude, address: […strings]}}, …}], …}
//    POZOR: bbox vrstni red vira je WEST,SOUTH,EAST,NORTH — naš SupplyQuery
//    bbox je [south, west, north, east] → adapter PREVIDNO pretvarja
//    (bookingBboxFromSupply v adapter.ts).
//  - POST /v3/accommodations/rates {"accommodations_ids": […], "checkin":
//    …, "checkout": …, "adults": …, "currency": "EUR"} → bloki cen po
//    nastanitvi (nočne cene).
//  - DOSTOP: status „Managed Affiliate Partner" (pogodba) — ključ izda
//    Booking po odobritvi.
//
// KAJ JE DOCUMENTED-ASSUMPTION (portal je JS-renderan; natančne pod-oblike
// so bile pred odobritvijo dostopa nepreverljive — tudi sandbox je iz
// našega peskovnika DNS-blokiran, kar je OMEJITEV PESKOVNIKA, ne pogodbe):
//  - IME GLAVE: "Booking-API-Key" (javno znano iz dokumentacije; ob
//    aktivaciji PONOVNO preveri — glej client.ts);
//  - OBLIKA POSTAVKA cene v rates odgovoru (blocks[].price …) — mapper
//    sprejema DEFENZIVNO več plavžnih oblik (price.amount,
//    price.per_night, nightly_price) in VSAKO STROGO preverja;
//  - slike: dokumentirana oblika iskanja ima id/name/location; slike so
//    DOMNEVLJENE (photo_url / photos[]) — ob aktivaciji potrdi polje.
//
// NE preslikamo ocen/recenzij in opisa: dokumentirana oblika iskanja jih
// NE navaja → ODSOTNI (iskrena odločitev — ne ugibamo imen polj).
// ============================================================================

/** Lokacija nastanitve (dokumentirano: latitude/longitude/address[]). */
export interface BookingLocation {
  latitude?: number;
  longitude?: number;
  /** Naslovni deli (dokumentirano: tabela nizov). */
  address?: string[];
}

/**
 * Nastanitev — polja iz dokumentirane oblike iskanja (id, name, location)
 * + DEFENZIVNE domnevne slike. Vsa ostala polja vira ignoriramo.
 */
export interface BookingAccommodation {
  /** ID nastanitve pri viru (niz — npr. števka; obrambno tudi številka). */
  id?: number | string;
  name?: string;
  /** DEFENZIVNO: title kot alternativa za name (neznana oblika). */
  title?: string;
  location?: BookingLocation;
  /** DEFENZIVNA DOMNEVA: kvadratna slika (photo_url niz). */
  photo_url?: string;
  /** DEFENZIVNA DOMNEVA: slike (tabela objektov/nizov). */
  photos?: ({ url?: string } | string)[];
}

/**
 * Element data[] iz iskanja. Dokumentirana oblika ovija nastanitev v
 * "accommodation"; DEFENZIVNO sprejemamo tudi ravno nastanitev (flat)
 * — izbira se zgodi v extractBookingAccommodation().
 */
export interface BookingSearchItem {
  accommodation?: BookingAccommodation;
}

/**
 * POSTAVEK cene iz rates odgovora (DOCUMENTED-ASSUMPTION oblika):
 * price {amount, currency, per_night?} + DEFENZIVNA alternativa
 * nightly_price. Valuta: zahtevamo EUR (request currency=EUR) →
 * odsotna valuta pomeni zahtevano valuto (isti vzorec kot Viator).
 */
export interface BookingRateBlock {
  price?: {
    amount?: number;
    currency?: string;
    per_night?: number;
  };
  nightly_price?: number;
}

/** Nastanitveni sklop iz rates odgovora (po accommodation_id). */
export interface BookingRateAccommodation {
  accommodation_id?: number | string;
  blocks?: BookingRateBlock[];
}

// ---------------------------------------------------------------------------
// FAIL-SAFE VARNOSTNI VZORCI (isti vzorec kot viator/gyg/tiqets types.ts —
// en slab zapis NE sme podreti celotne plasti)
// ---------------------------------------------------------------------------

/**
 * ID nastanitve vira — meja zaupanja: pozitivna končna števka ALI niz
 * 1–64 znakov iz varnega nabora [A-Za-z0-9_-] (brez ločil/URL metaznakov;
 * ID NE gre v bookingUrl (/go/hotels?dest= …), gre pa v AI kontekst/izbire
 * — čist vzorec je obrambna meja). DOCUMENTED-ASSUMPTION: format ID-jev
 * ( dokumentacija jih kaže kot nize).
 */
export const BOOKING_ACCOMMODATION_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Veljaven ID nastanitve vira (številka > 0 ali varen niz). */
export function isBookingAccommodationId(v: unknown): v is number | string {
  if (typeof v === "number") {
    return Number.isFinite(v) && v > 0;
  }
  if (typeof v === "string") {
    return BOOKING_ACCOMMODATION_ID_RE.test(v);
  }
  return false;
}

/** ID kot kanonski NIZ ali null, če neveljaven. */
export function bookingAccommodationId(v: unknown): string | null {
  if (!isBookingAccommodationId(v)) return null;
  return String(v);
}

/**
 * Iz elementa iskanja izlušči nastanitev (dokumentirana ovijajoča oblika
 * "accommodation" ALI DEFENZIVNO ravni element — ob aktivaciji potrdi).
 */
export function extractBookingAccommodation(
  item: unknown
): BookingAccommodation | null {
  if (!item || typeof item !== "object") return null;
  const inner = (item as Partial<BookingSearchItem>).accommodation;
  if (inner != null && typeof inner === "object") {
    return inner as BookingAccommodation;
  }
  return item as BookingAccommodation;
}

/**
 * Minimalna veljavnost nastanitve (STROGO fail-closed): veljaven id +
 * ne-prazen naslov (name ALI title — defenzivno). Vse ostalo je opcijsko
 * — manjkajoče polje pomeni ODSOTNO polje, NIKOLI izmišljeno.
 */
export function isBookingAccommodation(
  v: unknown
): v is BookingAccommodation {
  if (!v || typeof v !== "object") return false;
  const a = v as Partial<BookingAccommodation>;
  if (!isBookingAccommodationId(a.id)) return false;
  const name =
    typeof a.name === "string" && a.name.trim().length > 0
      ? a.name
      : typeof a.title === "string" && a.title.trim().length > 0
        ? a.title
        : null;
  return name != null;
}

/** Obrambno preverjanje seznama elementov iskanja (slabi odpadejo). */
export function filterValidAccommodations(
  raw: unknown
): { valid: BookingAccommodation[]; skipped: number } {
  if (!Array.isArray(raw)) return { valid: [], skipped: 0 };
  const valid: BookingAccommodation[] = [];
  let skipped = 0;
  for (const item of raw) {
    const acc = extractBookingAccommodation(item);
    if (isBookingAccommodation(acc)) valid.push(acc);
    else skipped++;
  }
  return { valid, skipped };
}

/**
 * Veljavne koordinate lokacije (meje ISO 6709; dokumentirana polja
 * latitude/longitude). Ni koordinat → NI pina (iskreno).
 */
export function bookingLocationCoords(
  location: BookingLocation | undefined
): { lat: number; lng: number } | null {
  if (location == null) return null;
  const lat = location.latitude;
  const lng = location.longitude;
  if (
    typeof lat !== "number" ||
    !Number.isFinite(lat) ||
    typeof lng !== "number" ||
    !Number.isFinite(lng)
  ) {
    return null;
  }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}
