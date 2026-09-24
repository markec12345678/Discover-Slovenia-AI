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
//  - POSLOVNA ODLOČITEV (audit 42, točka 1): NIMA escape-hatch polja za
//    provider-specifične atribute (providerMeta …). Splošna polja
//    (subcategory) pokrijejo klasifikacijo; (provider, providerProductId)
//    JE ključ za nazaj obratni klic pri ponudniku — vse ostalo ostaja
//    ZNOTRAJ adapterja. Model ostane provider-agnostic tudi pri 10+ virih.
// ============================================================================

/** Vsi ponudniki/viri, ki jih sistem pozna (register: supply/registry.ts). */
export type ProviderSlug =
  // Lokalni (odprti) viri — place data, nikoli komercialni inventar
  | "osm"
  | "fsq"
  | "sto"
  // Lastna tržnica (Listing + Experience z geo v lastni DB; Product še
  // brez geo — TASK 87)
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
  | "travelpayouts"
  // ISSUE #4 §4 (val 3): ročni vnos/uvožena rezervacija NEZnanEGA
  // ponudnika — izrecen slug za JourneyBooking.source USER/IMPORTED
  // zapise (nikoli lažen kanonski; ni supply adapter).
  | "manual";

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
  | "petrol"
  | "event"
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

/** Uporabniku prijazen status ponudbe (izpeljan iz InventoryAccess).
 *  "planned": vir/API je preverjen v auditu, a dostop ŠE NI priključen
 *  (niti inventar niti affiliate povezava) — iskrena oznaka brez obljub.
 *  "static" (Task 43): objavljeni statični inventar po ingestu (npr.
 *  KiwiTaxi CSV — realne cene, ki NISO živi citat) — iskrena ločitev od
 *  „live“ (živi API) in „affiliate“ (samo povezava). */
export type SupplyStatus = "live" | "search" | "static" | "affiliate" | "local" | "planned";

/** Natančnost geo podatka (iskrenost pina na zemljevidu). */
export type GeoPrecision =
  | "exact" // točna lokacija objekta (OSM node, Booking property)
  | "city" // center mesta (Omio, Airalo)
  | "destination_center" // center destinacije (Viator destId)
  | "country" // državni nivo (Airalo eSIM)
  | "route"; // linija/pot (transfer rute — ne pin)

/**
 * Cena z enoto in valuto (vedno EUR prikazno pri nas — adapter konvertira
 * + razkrije v `note`, če je vir v drugi valuti).
 *
 * SEMANTIKA ENOTE (audit 42, točka 10 — €79 / €79 from / €79/night /
 * €79/person / €79/transfer / €79/day se NIKOLI ne sme mešati):
 *  - total        → skupna cena izdelka (vstopnica, eSIM paket)
 *  - per_person   → na osebo (Viator/GYG ture, Tiqets vstopnice, leti)
 *  - per_night    → na nočitev (Booking/nastanitve)
 *  - per_day      → na dan (najem avta — DiscoverCars)
 *  - per_vehicle  → na vozilo (transfer s celotnim vozilom)
 *  - per_transfer → na prevoz (KiwiTaxi transfer, ne glede na zasedenost)
 * `fromPrice: true` → objavljena JE "od" cena (spodnja meja, ne točen
 * citat) — UI izpiše "od €79", AI razume kot proračunsko spodnjo mejo.
 */
export type PriceUnit =
  | "total"
  | "per_person"
  | "per_night"
  | "per_day"
  | "per_vehicle"
  | "per_transfer";

export interface PriceInfo {
  amount: number;
  currency: "EUR";
  unit: PriceUnit;
  /** Ali je cena "od" (spodnja meja) — struktuirano, ne le besedilo. */
  fromPrice?: boolean;
  /** Iskrenost: npr. "živa cena" / "objavljena cena (ne živi citat)" /
  *  "konvertirano iz USD". */
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
  /** Samo http(s) URL (adapter validira — OSM tagi so javno ureljivi!);
   *  hotlink z atribucijo, NIKOLI kopija v naš storage (licenčna čistost). */
  image?: string;
  /** Vir/pravica prikaza slike (audit 42, točka 12): npr.
   *  "Wikimedia Commons", "© Viator", "OpenStreetMap contributor". */
  imageCredit?: string;
  /** Ocena 0–5 IZKLJUČNO iz vira ponudnika (nikoli lastna ocena). */
  rating?: number;
  reviewCount?: number;
  price?: PriceInfo;
  /**
   * RAZPOLOŽLJIVOST (audit 42, točka 11) — NIKOLI „true/false", ker smo
   * dejansko preverili le pri živih virih:
   *  - live_available   → provider JOŽ preveril (živi API klic) → na voljo
   *  - live_unavailable → provider JOŽ preveril → ni na voljo za datum
   *  - unknown          → provider ima koncept, a tega klica nismo naredili
   *                       (npr. content-only tier: cena je, dostopnost ni)
   *  - not_supported    → vir koncepta sploh nima (OSM, statični CSV)
   * ODSOTNO polje pomeni not_supported (dokumentirana semantika) — adapter,
   * ki zna preverjati, MORA nastaviti izrecno.
   */
  availability?: {
    status: AvailabilityStatus;
    /** ISO 8601 trenutka preverbe (samo pri live_*). */
    checkedAt?: string;
    note?: string;
  };
  bookingMode: BookingMode;
  /** Rezervacija: /go/[provider]?product=… (strežniško; komercialni) ali
   *  null pri info_only (lokalni vir ima sourceUrl/phone). */
  bookingUrl?: string;
  /** Primarni vir (website pri OSM; productUrl pri partnerjih). */
  sourceUrl?: string;
  /** ISO 8601 — čas ZADNJEGA uspešnega pridobivanja od vira (cache poli
   *  obdrži izvorni čas; ni „data timestamp" vira samoga — dokumentirano). */
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

/** Status razpoložljivosti (semantika glej ProviderProduct.availability). */
export type AvailabilityStatus =
  | "live_available"
  | "live_unavailable"
  | "unknown"
  | "not_supported";

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
  /** Preklic odjemalca (request signal) — adapter ga spoštuje, kjer
   *  podpira (OSM: prekinitev nodo-https + prenehanje retry zanke). */
  signal?: AbortSignal;
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
  /** Delni rezultat: št. elementov vira, ki jih normalizacija ZAVRLA
   *  (brez imena/koordinat/tipa) — iskrenost „partial result". */
  skipped?: number;
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
  /** Razpoložljivost (samo status — AI kontekst ne potrebuje checkedAt). */
  availability?: { status: AvailabilityStatus };
  /** Ime vira ("OpenStreetMap", "Viator" …). */
  source: string;
  /** Rezervacijska povezava (samo prek /go — nikoli direktno iz klienta
   *  pri komercialnih; sanitize jo validira/odstrani). */
  bookingUrl?: string;
  selectionState: SelectionState;
}
