// ============================================================================
// TRAVEL SUPPLY MAP — KANONSKI MODEL (F1 fundacija, 1.49.0)
// ============================================================================
// Provider-agnostic supply engine: EN kanonski model produkta, v katerega
// vsak adapter (OSM, FSQ, Booking, Viator, GetYourGuide, Tiqets, KiwiTaxi,
// …) normalizira svojo ponudbo. Glej docs/TRAVEL-SUPPLY-MAP-AUDIT.md.
//
// NAČELA:
//  - NIKOLI ne predstavljamo affiliate URL-ja kot inventarja: če provider
//    nima API/feed dostopa, njegov vstop v registru nosi status
//    "affiliate" in NE ustvarja ProviderProduct vrstic (samo kartice
//    z globokimi povezavami prek obstoječega /go/[provider]).
//  - OSM/FSQ/STO = LOKALNI viri (odprti podatki) — VEDNO ločeni od
//    komercialnega inventarja (skupina "local" v registru).
//  - Vsa cena/razpoložljivost/ocena polja so OPCIJSKA: vir, ki jih nima,
//    jih preprosto ne izpolni (nikoli ne izmišljujemo vrednosti).
// ============================================================================

/** Vsi ponudniki/viri, ki jih sistem pozna (register: supply/registry.ts). */
export type ProviderSlug =
  // Lokalni (odprti) viri — place data, nikoli komercialni inventar
  | "osm"
  | "fsq"
  | "sto"
  // Lastna tržnica (Listing/Experience/Product v lastni DB)
  | "own"
  // Komercialni providerji (dokler nimajo potrjenega API dostopa: samo
  // affiliate globoka povezava prek /go — NIKOLI ProviderProduct)
  | "booking"
  | "viator"
  | "getyourguide"
  | "tiqets"
  | "kiwitaxi"
  | "discovercars"
  | "skyscanner"
  | "omio"
  | "airalo"
  | "worldnomads"
  | "safetywing"
  | "travelpayouts";

/**
 * Kanonska taksonomija tipov produktov (provider-agnostic).
 * Mapiranje: OSM tagi → tip (osm-adapter), Viator/GYG → activity|tour,
 * Tiqets → ticket, Booking → accommodation, KiwiTaxi → transfer itd.
 * 'poi' je zajemalni tip za lokalne točke brez specifičnejšega tipa.
 */
export type ProductType =
  | "accommodation"
  | "restaurant"
  | "shop"
  | "attraction"
  | "museum"
  | "viewpoint"
  | "natural"
  | "religious"
  | "activity"
  | "tour"
  | "ticket"
  | "transfer"
  | "car_rental"
  | "transport"
  | "flight"
  | "esim"
  | "insurance"
  | "poi";

/** Kako se produkt rezervira (iz kanonskega registra zmožnosti). */
export type BookingMode =
  | "affiliate_redirect" // prek /go/[provider] (strežniško izgrajena povezava)
  | "api_bookable" // prihodnje: rezervacija prek partnerskega API-ja
  | "info_only" // lokalni vir (OSM): brez rezervacije, kontakt/website
  | "own_marketplace"; // lastna tržnica (Stripe checkout)

/**
 * Vrsta dostopa do inventarja (UPORABNIŠKO sporočilo iz registra mora biti
 * izpeljano iz DEJANSKEGA stanja, ne iz želja):
 *  - live_inventory  → živi inventar/cene iz partnerskega API-ja (odobreno)
 *  - search_api      → iskalni API z živimi rezultati (odobreno)
 *  - static_content  → statični feed/dump (npr. KiwiTaxi CSV — po ingestu)
 *  - affiliate_deep_link → SAMO globoka povezava (ni inventarja!)
 *  - api_booking     → rezervacija prek API-ja (najvišja raven)
 *  - open_data       → odprti podatki (OSM/FSQ — lokalna skupina)
 *
 * AFFILIATE_DEEP_LINK NIKOLI ne sme biti predstavljen kot inventory.
 */
export type InventoryAccess =
  | "live_inventory"
  | "search_api"
  | "static_content"
  | "affiliate_deep_link"
  | "api_booking"
  | "open_data";

/** Uporabniku prijazen status ponudbe (izpeljan iz InventoryAccess). */
export type SupplyStatus = "live" | "search" | "affiliate" | "local";

/** Natančnost geo podatka (iskrenost pina na zemljevidu). */
export type GeoPrecision =
  | "exact" // točna lokacija objekta (OSM node, Booking property)
  | "city" // center mesta (Omio, Airalo)
  | "destination_center" // center destinacije (Viator destId)
  | "country" // državni nivo (Airalo eSIM)
  | "route"; // linija/pot (transfer rute — ne pin)

/** Cena z enoto in valuto (vedno EUR prikazno pri nas). */
export interface PriceInfo {
  amount: number;
  currency: "EUR";
  unit: "total" | "per_person" | "per_day" | "per_vehicle";
  /** Iskrenost: npr. "živa cena" / "objavljena cena (ne živi citat)". */
  note?: string;
}

/**
 * KANONSKI PRODUKT — enoten vstop za vse adapterje.
 * (Spec naročnika: provider, providerProductId, type/category, title,
 * description, lat/lng, address, image, rating/reviews, price,
 * availability, bookingMode, bookingUrl, sourceUrl, lastUpdated.)
 */
export interface ProviderProduct {
  /** `${provider}:${providerProductId}` — stabilen ID med sejami. */
  id: string;
  provider: ProviderSlug;
  /** ID pri ponudniku (OSM: "node-123"; Viator: productCode; …). */
  providerProductId: string;
  type: ProductType;
  /** Podtip iz vira (OSM tourism=hotel → "hotel"; Viator kategorija …). */
  subcategory?: string;
  title: string;
  description?: string;
  lat?: number;
  lng?: number;
  geoPrecision?: GeoPrecision;
  address?: string;
  image?: string;
  /** Ocena 0–5 IZKLJUČNO iz vira ponudnika (nikoli lastna ocena). */
  rating?: number;
  reviewCount?: number;
  price?: PriceInfo;
  availability?: { live: boolean; note?: string };
  bookingMode: BookingMode;
  /** Rezervacija: /go/[provider]?product=… (strežniško; komercialni) ali
   *  null pri info_only (lokalni vir ima sourceUrl/phone). */
  bookingUrl?: string;
  /** Primarni vir (website pri OSM; productUrl pri partnerjih). */
  sourceUrl?: string;
  /** ISO 8601 — čas ZADNJEGA uspešnega pridobivanja od vira. */
  lastUpdated: string;
  /** Licenca/atribucija (OSM: "© OpenStreetMap"; FSQ: Apache-2.0 …). */
  license?: { source: string; attribution?: string };
  /** Kontakt za lokalne vire (OSM phone) — izven kanonske spec minimalno. */
  phone?: string;
  /** Odpiralni časi (OSM opening_hours) — prikaz v modalu. */
  openingHours?: string;
  /** Enrichment reference za lokalne vire (Wikipedia/AI opis). */
  wikidata?: string;
  wikipedia?: string;
  cuisine?: string;
  /** IZPELJANO ob iskanju (dedupe): alternativni viri istega objekta
   *  (npr. OSM hotel + FSQ hotel na istem pinu). NI del izvornih
   *  podatkov adapterjev — ne shranjuje se. */
  altSources?: ProviderSlug[];
}

/** ---------------------------------------------------------------------------
 *  SUPPLY QUERY — viewport → bbox → supply query (požrešnost pod nadzorom)
 *  ------------------------------------------------------------------------ */
export interface SupplyQuery {
  /** [south, west, north, east] — trenutni viewport zemljevida. */
  bbox?: [number, number, number, number];
  /** Celega števila 3–19 (floor Leaflet zoom). Gating: zoom.ts. */
  zoom: number;
  /** Kanonske kategorije (prazno = privzete vidne za zoom). */
  cats: ProductType[];
  /** ISO datum (check-in / datum aktivnosti) — OSM ga ignorira (iskreno). */
  date?: string;
  /** Št. potnikov (1–20). */
  pax?: number;
  locale: "sl" | "en";
}

/** Rezultat enega adapterja (telemetrija/UX stanje plasti). */
export interface AdapterRunInfo {
  slug: ProviderSlug;
  status: SupplyStatus;
  ok: boolean;
  ms: number;
  count: number;
  cached: boolean;
  note?: string;
}

/** Odgovor /api/supply/search. */
export interface SupplySearchResponse {
  products: ProviderProduct[];
  counts: {
    byType: Partial<Record<ProductType, number>>;
    byProvider: Partial<Record<ProviderSlug, number>>;
  };
  adapters: AdapterRunInfo[];
  /** Adapterji, ki so padli/niso na voljo — OSM lokalna plast OSTANE. */
  degraded: ProviderSlug[];
  /** Št. podvojenih zapisov, ki jih je dedupe združil (iskrenost). */
  duplicates: number;
  query: {
    bbox?: [number, number, number, number];
    zoom: number;
    cats: ProductType[];
    date?: string;
    pax?: number;
  };
  generatedAt: string;
}

/** ---------------------------------------------------------------------------
 *  AI SELEKCIJA — produkti, ki jih je uporabnik izbral na zemljevidu
 *  ( strukturiran objekt, ne samo tekst — zahteva naročnika )
 *  ------------------------------------------------------------------------ */

/**
 * FIXED   → AI MORA izdelek vključiti TAKO KAKOR JE (ne zamenja ga s
 *           podobnim! izbrana hotelska soba ostane TA hotelska soba)
 * PREFERRED → močno prednostno
 * SUGGESTED → upoštevaj, če ustreza
 */
export type SelectionState = "fixed" | "preferred" | "suggested";

/** Strukturirana izbira, ki gre v PlannerInput → AI kontekst. */
export interface SelectedProviderProduct {
  provider: ProviderSlug;
  providerProductId: string;
  type: ProductType;
  title: string;
  lat?: number;
  lng?: number;
  /** Ime mesta/destinacije, kadar geoPrecision ni exact. */
  locationName?: string;
  price?: PriceInfo;
  dates?: { start?: string; end?: string };
  /** Ime vira ("OpenStreetMap", "Viator" …). */
  source: string;
  /** Rezervacijska povezava (samo prek /go — nikoli direktno iz klienta
   *  pri komercialnih; sanitize jo validira/odstrani). */
  bookingUrl?: string;
  selectionState: SelectionState;
}
