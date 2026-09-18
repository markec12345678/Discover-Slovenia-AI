// ============================================================================
// TRAVEL SUPPLY MAP — KIWITAXI PROVIDER: TIPI (Task 43, 1.49.0)
// ============================================================================
// Prvi REALEN komercialni provider, priklopljen skozi obstoječo F1
// abstrakcijo (SupplyAdapter → ProviderProduct → /api/supply/search).
//
// VIR (živo preverjen 18. 9. 2026, kiwitaxi.com/en/partner/webmaster/
// instructions/api — dokumentacija je source of truth):
//  - CSV endpointi:  https://kiwitaxi.com/services/data/csv/{places,routes,
//                    transfer_types,transfers,countries,place_types,url_domains}
//  - Auth:           parameter security_token (javni, dokumentiran — trenutno
//                    skupen vsem: 24e8a1c890fb0d16ecdce4926dc4b2d6)
//  - Format:         TSV (\n vrstice, \t polja, "\N" = NULL, 1. vrstica = glava)
//  - Krajevi:        place_polygon = WKT POLYGON((lng lat, …)) — lng-first!
//  - Cene:           price_eur/price_rub/price_usd na (route × razred vozila)
//                    — OBJAVLJENE cene (payment_type=partial privzeto), NISO
//                    živi citat → availability = not_supported, fromPrice.
//  - Deep link:      /transfers/{transferId} (+ pap=affiliate ID) — preizkušen
//                    v živo (301 → /en/transfers/{id}).
//  - Rate limit:     da (HTTP 429 ob gostih zaporednih klicih — ingest mora
//                    delati s razmiki in retry).
//
// NAČELA (naročnik, Task 43 spec):
//  - Ne izmišljujemo ničesar: kar vir nima, ostane unknown/undefined.
//  - Produkt = RUTA (from → to); razredi vozil so CENOVNE različice iste
//    route (ena kartica: „Ljubljana Airport → Bled · od €77 / prevoz").
//  - Pin = centroid geo-cone PREVZEMNEGA kraja (NI centroid route!),
//    geoPrecision "city" (predstavniška točka območja — nikoli „exact").
//  - Kraj brez poligona → brez koordinat (izdelek ostane v datasetu, ni pina).
//  - Imena: vir ima name_en (in ru/de/fr/es) — SLOVENŠČINE NI; uporabimo
//    name_en v obeh locale (lastna imena so večinoma identična; NE prevajamo).
// ============================================================================

/** Raw TSV vrstica: kraji (places.csv). Polja po uradni dokumentaciji. */
export interface KiwiRawPlace {
  id: string;
  country_id: string;
  region_id: string;
  type_id: string;
  name_en: string;
  name_ru: string;
  name_de: string;
  name_fr: string;
  name_es: string;
  iata: string;
  place_polygon: string;
}

/** Raw TSV vrstica: rute (routes.csv). */
export interface KiwiRawRoute {
  id: string;
  country_id: string;
  place_from_id: string;
  place_to_id: string;
  distance: string;
  timeinway: string;
  weight: string;
  url: string;
}

/** Raw TSV vrstica: razredi vozil (transfer_types.csv). */
export interface KiwiRawTransferType {
  id: string;
  name_en: string;
  name_ru: string;
  pax: string;
  baggage: string;
  description_en: string;
  description_ru: string;
  car_examples_en: string;
  car_examples_ru: string;
  photo: string;
  sortno: string;
  photo2: string;
}

/** Raw TSV vrstica: transferji = (ruta × razred) cena (transfers.csv). */
export interface KiwiRawTransfer {
  id: string;
  route_id: string;
  type_id: string;
  price_rub: string;
  price_eur: string;
  price_usd: string;
  url: string;
}

/** Raw TSV vrstica: države (countries.csv). */
export interface KiwiRawCountry {
  id: string;
  iata: string;
  published: string;
  name_en: string;
  name_ru: string;
  currency_id: string;
  time_zone: string;
}

/** Tip geo-območja kraja (place_types.csv, preverjeno v živo). */
export type KiwiPlaceType =
  | "city"
  | "airport"
  | "train_station"
  | "port"
  | "bus_station"
  | "other";

/**
 * Normaliziran kraj (samo tisti, ki jih obseg potrebuje):
 *  - lat/lng/bbox IZKLJUČNO iz place_polygon (centroid + meja območja);
 *    brez poligona so koordinate odsotne (iskrenost).
 */
export interface KiwiPlace {
  id: number;
  /** name_en iz vira (SL locale ga uporablja neprevedenega — pošteno). */
  name: string;
  type: KiwiPlaceType;
  iata?: string;
  /** Centroid WKT poligona (representativna točka območja). */
  lat?: number;
  lng?: number;
  /** [s, w, n, e] meje poligona (viewport filtriranje). */
  bbox?: [number, number, number, number];
}

/** Cenovna različica (razred vozila) na ruti. */
export interface KiwiRouteClass {
  /** ID transferja pri ponudniku (= deep link /transfers/{id}). */
  transferId: number;
  /** name_en razreda (npr. „Economy"). */
  name: string;
  /** Max potnikov (pax iz vira). */
  pax: number;
  /** Objavljena EUR cena (payment_type=partial). */
  eur: number;
}

/** Normalizirana ruta — EN produkt (transfer). */
export interface KiwiRoute {
  id: number;
  fromId: number;
  fromName: string;
  toId: number;
  toName: string;
  /** Pin = centroid prevzemnega območja (odstoten ⇔ from-place brez poligona). */
  fromLat?: number;
  fromLng?: number;
  /** Meje prevzemnega območja (viewport presek). */
  fromBbox?: [number, number, number, number];
  distanceKm: number;
  durationMin: number;
  /** Utež prodaje iz vira (delež prodaj transferjev po ruti v sezoni —
   *  providerjev lastni gostotni signal za kapiko; 0 = ni signala). */
  weight: number;
  /** Najnižja objavljena cena med razredi (EUR, per_transfer, „od"). */
  minPriceEur: number;
  /** ID transferja z najnižjo ceno (kanonični deep link). */
  cheapestTransferId: number;
  /** Razredi naraščajoče po ceni (max 12 — kap proti napihovanju). */
  classes: KiwiRouteClass[];
  /** Relativna URL pot na kiwitaxi.com (validirana: /država/iz-to). */
  urlPath: string;
  /** Tip prevzemnega kraja (airport/city/…) — izpeljan iz vira. */
  fromType: KiwiPlaceType;
  toType: KiwiPlaceType;
}

/** Generacija dataseta (baseline ali overlay) — atomarna menjava. */
export interface KiwiTaxiDataset {
  version: 1;
  /** ISO 8601 uspešnega prenosa CSV-jev od vira. */
  fetchedAt: string;
  source: string;
  /** payment_type parameter prenosa transfers.csv (dokumentiran). */
  paymentType: "partial";
  counts: {
    places: number;
    routes: number;
    transfers: number;
    /** Rute s pinom (prevzemno območje ima poligon). */
    pinnedRoutes: number;
  };
  places: KiwiPlace[];
  routes: KiwiRoute[];
}

/** Izid ingesta (skripta + cron poročilo). */
export interface KiwiIngestResult {
  ok: boolean;
  reason: string;
  dataset?: KiwiTaxiDataset;
  /** Koliko elementov vira je normalizacija ZAVRLA (iskrenost). */
  skipped?: {
    places: number;
    routes: number;
    transfers: number;
  };
  ms?: number;
}
