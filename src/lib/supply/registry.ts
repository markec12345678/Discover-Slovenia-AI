// ============================================================================
// TRAVEL SUPPLY MAP — PROVIDER CAPABILITY REGISTRY (F1, 1.49.0)
// ============================================================================
// ENOTI register ponudnikov (konec 4 vzporednih registrov iz audita:
// AffiliateProvider union + buildPartnerUrl switch + ALLOWED_HOSTS +
// admin oznake). Ta datoteka je CLIENT-VARNA: vsebuje samo IMENA env
// spremenljivk in statične zmožnosti — NIKOLI vrednosti (skrivnosti
// ostanejo strežniške).
//
// STATUSI SO DEJANSKO STANJE (september 2026, docs/TRAVEL-SUPPLY-MAP-AUDIT.md
// + docs/PROVIDER-APPLICATIONS.md):
//  - AKTIVNA adapterja: osm (lokalni vir) in kiwitaxi (Task 43: prvi realni
//    komercialni — objavljeni CSV inventar, status "static").
//  - Ostali komercialni providerji: status "affiliate" (globoka povezava
//    prek /go/[provider]) — DOKLER partner dostop ni dejansko odobren.
//    NIKOLI ne predstavljamo affiliate URL-ja kot inventarja.
//  - fsq: odprti podatki (Apache-2.0), adapter pripravljen po ingestu
//    — podatek NI nameščen → neaktiven.
// ============================================================================

import type {
  InventoryAccess,
  ProductType,
  ProviderSlug,
  SupplyStatus,
} from "./types";
import type { AffiliateProvider } from "@/lib/affiliate";

/** Podprte zmožnosti (razlikovanje po naročniku). */
export interface ProviderCapabilityFlags {
  /** Vrača geo koordinate produktov (lat/lng). */
  geo: boolean;
  /** Vrača cene. */
  price: boolean;
  /** Vrača razpoložljivost (živo ali statično). */
  availability: boolean;
  /** Vrača slike. */
  images: boolean;
  /** Vrača ocene/recenzije. */
  reviews: boolean;
  /** Primeren za prikaz na zemljevidu (lastni geo). */
  map: boolean;
  /** Rezervacija mogoča (API ali redirect). */
  booking: boolean;
  /** Affiliate program z globokimi povezavami (/go). */
  affiliate: boolean;
}

/**
 * /go/[provider] ruta obstoječega affiliate sistema (affiliate.ts).
 * AUDIT 42 (42-b YELLOW #3): prej je bil to NEODVISEN duplikat union-a —
 * tip je zdaj IZPELJAN iz AFFILIATE_PROVIDERS (affiliate.ts), tako da TS
 * preverja enakost obeh besednjakov ob vsakem prevodu (drift nemogoč).
 * `import type` se izbriše pri prevodu → client-varen (brez runtime uvoza).
 */
export type GoRoute = AffiliateProvider;

export interface ProviderRegistryEntry {
  slug: ProviderSlug;
  /** Prikazno ime (SL/EN). */
  labels: { sl: string; en: string };
  /** local = odprti podatki (OSM/FSQ/STO); own = lastna tržnica;
   *  commercial = partnerji. LOČEVANJE JE ARHITEKTURNO (naročnik). */
  group: "local" | "own" | "commercial";
  /** DEJANSKE vrste dostopa, ki jih IMAMO (ne načrtujemo!). */
  inventoryAccess: InventoryAccess[];
  /** Uporabniku prijazen status ponudbe danes. */
  status: SupplyStatus;
  /** Ali je adapter dejansko priklopljen na /api/supply/search. */
  active: boolean;
  /** Tipi produktov, ki jih bo adapter polnil (ko bo aktiven). */
  types: ProductType[];
  goRoute?: GoRoute;
  capabilities: ProviderCapabilityFlags;
  /** IMENA env spremenljivk (affiliate ID-ji danes; API ključi bodoči). */
  envKeys: { affiliate?: string[]; api?: string[] };
  /** Zoom prag plasti (max(tipov iz taksonomije, ta prag)). */
  minZoom: number;
  /** TTL predpomnilnika v ms (0 = živi vir brez smisla cachati —
   *  npr. real-time razpoložljivost; prav tako vpliva na Cache-Control
   *  odgovora /api/supply/search: vsak AKTIVEN adapter s 0 → no-store). */
  cacheTtlMs: number;
  /** Zgornja meja izvedbe ENEGA adapterja (ms) — runner (adapter.ts) jo
   *  uveljavlja s timeout diro, tudi če adapter obljublja notranji budget
   *  (obrnjena pogodba: obesek NIKOLI ne odloži celotnega /api/supply/search).
   *  OSM: 50 s (notranji proračun 45 s + primarni poskusi). */
  timeoutMs: number;
  /** Strežniška omejitev klicev adapterja na minuto (0 = neomejeno) —
   *  v memorieskem drsnem oknu; ščiti naš odhodni promet do vira, ko bo
   *  več uporabnikov hkrati (per-IP limit je 30/min, to je GLOBALNA meja
   *  instance). Zavrnjen klic NI napaka vira: note "rate-limited". */
  maxCallsPerMin: number;
  /** Uradna dokumentacija (vir trditev — veže vsako trditev na vir). */
  docsUrl?: string;
  /** Iskrena opomba o dostopu (SL/EN) za UI. */
  accessNote?: { sl: string; en: string };
}

const NO_INVENTORY_CAPS: ProviderCapabilityFlags = {
  geo: false,
  price: false,
  availability: false,
  images: false,
  reviews: false,
  map: false,
  booking: false,
  affiliate: true,
};

export const PROVIDER_REGISTRY: ProviderRegistryEntry[] = [
  // ======================= LOKALNI VIRI (odprti) ==========================
  {
    slug: "osm",
    labels: { sl: "OpenStreetMap", en: "OpenStreetMap" },
    group: "local",
    inventoryAccess: ["open_data"],
    status: "local",
    active: true, // EDINI aktiven adapter v F1
    types: [
      "attraction",
      "museum",
      "viewpoint",
      "natural",
      "religious",
      "restaurant",
      "accommodation",
      "shop",
    ],
    capabilities: {
      geo: true,
      price: false,
      availability: false,
      images: false,
      reviews: false,
      map: true,
      booking: false,
      affiliate: false,
    },
    envKeys: {},
    minZoom: 10, // usklajeno s SUPPLY_MIN_ZOOM (zoom.ts) — z<10 je državni pogled
    cacheTtlMs: 10 * 60 * 1000,
    timeoutMs: 50_000, // notranji proračun 45 s + primarni poskusi
    maxCallsPerMin: 60, // globalna meja instance (2× per-IP limit)
    docsUrl: "https://wiki.openstreetmap.org/wiki/Overpass_API",
    accessNote: {
      sl: "Odprti podatki (ODbL) · žive poizvedbe po viewportu",
      en: "Open data (ODbL) · live viewport queries",
    },
  },
  {
    slug: "fsq",
    labels: { sl: "Foursquare Open Places", en: "Foursquare Open Places" },
    group: "local",
    inventoryAccess: ["open_data"],
    status: "local",
    active: false, // podatkovna množica še NI nameščena (F2 ingest)
    types: ["restaurant", "accommodation", "attraction", "poi"],
    capabilities: {
      geo: true,
      price: false,
      availability: false,
      images: false,
      reviews: false,
      map: true,
      booking: false,
      affiliate: false,
    },
    envKeys: { api: ["FSQ_PLACES_DIR"] },
    minZoom: 12,
    cacheTtlMs: 24 * 60 * 60 * 1000,
    timeoutMs: 30_000,
    maxCallsPerMin: 60,
    docsUrl: "https://opensource.foursquare.com/os-places",
    accessNote: {
      sl: "Odprti PODATKI (Apache-2.0 z atribucijo) · slovenska podmnožica še ni ingestirana",
      en: "Open DATA (Apache-2.0 with attribution) · Slovenian subset not yet ingested",
    },
  },
  {
    slug: "sto",
    labels: { sl: "slovenia.info (STO)", en: "slovenia.info (STO)" },
    group: "local",
    inventoryAccess: ["static_content"],
    status: "local",
    active: false, // besedilni vir (RAG T2) — NI sloj zemljevida
    types: [],
    capabilities: {
      geo: false,
      price: false,
      availability: false,
      images: false,
      reviews: false,
      map: false,
      booking: false,
      affiliate: false,
    },
    envKeys: {},
    minZoom: 22,
    cacheTtlMs: 0,
    timeoutMs: 15_000,
    maxCallsPerMin: 0,
    docsUrl: "https://www.slovenia.info/llms.txt",
    accessNote: {
      sl: "Uradna vsebina (llms.txt) — opisi za AI, brez geo feeeda",
      en: "Official content (llms.txt) — AI descriptions, no geo feed",
    },
  },

  // ======================= LASTNA TRŽNICA ==================================
  {
    slug: "own",
    labels: { sl: "Lokalni ponudniki (naša tržnica)", en: "Local providers (our marketplace)" },
    group: "own",
    inventoryAccess: ["search_api"],
    status: "search",
    active: false, // Listing/Experience/Product ŠE nimajo koordinat → ni sloja
    types: ["activity", "accommodation", "restaurant", "poi"],
    capabilities: {
      geo: false,
      price: true,
      availability: false,
      images: true,
      reviews: true,
      map: false,
      booking: true,
      affiliate: false,
    },
    envKeys: {},
    minZoom: 22,
    cacheTtlMs: 0,
    timeoutMs: 10_000,
    maxCallsPerMin: 0,
    accessNote: {
      sl: "Lastni Listingi/izkušnje/izdelki v DB — geo polja še manjkajo (bodoča faza)",
      en: "Own listings/experiences/products in DB — geo fields still missing (future phase)",
    },
  },

  // ======================= KOMERČNI PONUDNIKI ==============================
  {
    slug: "booking",
    labels: { sl: "Booking.com", en: "Booking.com" },
    group: "commercial",
    inventoryAccess: ["affiliate_deep_link"],
    status: "affiliate",
    active: false,
    types: ["accommodation"],
    goRoute: "hotels",
    capabilities: { ...NO_INVENTORY_CAPS },
    envKeys: { affiliate: ["BOOKING_AFFILIATE_ID"], api: [] },
    minZoom: 12,
    cacheTtlMs: 0,
    timeoutMs: 15_000,
    maxCallsPerMin: 0,
    docsUrl: "https://developers.booking.com/demand/docs",
    accessNote: {
      sl: "Demand API zahteva status Managed Affiliate Partner (pogodba) — danes samo affiliate povezava",
      en: "Demand API requires Managed Affiliate Partner status (contract) — today affiliate link only",
    },
  },
  {
    slug: "viator",
    labels: { sl: "Viator", en: "Viator" },
    group: "commercial",
    // TASK 45 (1.50.0): DRUGI realni adapter. Pogodba Viator Partner API
    // v2.0 je ŽIVO preverjena (docs.viator.com + Golden Path, 18. 9. 2026)
    // in implementirana v src/lib/supply/providers/viator/**. DOSTOP:
    // VIATOR_API_KEY še NI izdan (živi dokaz: sandbox brez ključa =
    // HTTP 401) → adapter je PRIKLJUČEN v iskreno PRAZNEM stanju (vrne []
    // + „not-configured"; NIČ izmišljenih podatkov, NE simuliramo živega
    // API-ja). Ko ključ (self-serve: partnerski račun → Tools → Affiliate
    // API) pride v env, živi podatki stečejo BREZ spremembe kode.
    // inventoryAccess ostaja DEJANSKO stanje: danes samo affiliate
    // globoka povezava (/go/viator).
    inventoryAccess: ["affiliate_deep_link"],
    status: "affiliate",
    active: true, // priklopljen na /api/supply/search (runtime capability gate v adapterju)
    types: ["activity", "tour"],
    goRoute: "viator",
    capabilities: {
      geo: true, // centri destinacij (geoPrecision: destination_center)
      price: true, // pricing.summary.fromPrice („od"-cena)
      availability: false, // Basic Access NIMA /availability/check (iskreno)
      images: true, // naslovnne slike vira (imageCredit: © Viator)
      reviews: true, // combinedAverageRating + totalReviews (samo pri recenzijah)
      map: true,
      booking: true, // affiliate_redirect (/go/viator?product={code})
      affiliate: true,
    },
    envKeys: {
      affiliate: ["VIATOR_AFFILIATE_URL"],
      api: ["VIATOR_API_KEY", "VIATOR_API_BASE"],
    },
    minZoom: 10,
    // Žive iskalne cene → konservativnih 10 min (dokumentacija vira
    // dovoljuje 15–30 min polling vsebinskih delt; negativni predpomnilnik
    // okvar 60 s je v adapterju — Task 44-b vzorec).
    cacheTtlMs: 10 * 60 * 1000,
    // Najslabši primer: taksonomija + ≤ 3 sekvencialna iskanja × 8 s
    // klientove dirе = 32 s (tipično < 1 s/klic).
    timeoutMs: 35_000,
    // Naša globalna meja instance: 20 izvedb adapterja/min (≤ 60 klicev
    // vira — dovoljena meja vira je ~150/10 s na endpoint).
    maxCallsPerMin: 20,
    docsUrl: "https://docs.viator.com/partner-api/technical/",
    accessNote: {
      sl: "Partner API (Basic Access) — pogodba živo preverjena; API ključ še ni izdan (self-serve po registraciji). Danes samo affiliate povezava, sloj je pripravljen in iskreno prazen.",
      en: "Partner API (Basic Access) — contract verified live; API key not yet issued (self-serve after sign-up). Today affiliate link only, layer is ready and honestly empty.",
    },
  },
  {
    slug: "getyourguide",
    labels: { sl: "GetYourGuide", en: "GetYourGuide" },
    group: "commercial",
    inventoryAccess: ["affiliate_deep_link"],
    status: "affiliate",
    active: false,
    types: ["activity", "tour", "ticket"],
    goRoute: "activities",
    capabilities: { ...NO_INVENTORY_CAPS },
    envKeys: { affiliate: ["GETYOURGUIDE_PARTNER_ID"], api: [] },
    minZoom: 10,
    cacheTtlMs: 0,
    timeoutMs: 15_000,
    maxCallsPerMin: 0,
    docsUrl: "https://github.com/getyourguide/partner-api-spec",
    accessNote: {
      sl: "Partner API zahteva odobritev (portal) — danes samo affiliate povezava",
      en: "Partner API requires approval (portal) — today affiliate link only",
    },
  },
  {
    slug: "tiqets",
    labels: { sl: "Tiqets", en: "Tiqets" },
    group: "commercial",
    inventoryAccess: ["affiliate_deep_link"],
    status: "affiliate",
    active: false,
    types: ["ticket", "activity"],
    goRoute: "tickets",
    capabilities: { ...NO_INVENTORY_CAPS },
    envKeys: { affiliate: ["TIQETS_AFFILIATE_URL"], api: [] },
    minZoom: 11,
    cacheTtlMs: 0,
    timeoutMs: 15_000,
    maxCallsPerMin: 0,
    docsUrl: "https://developers.tiqets.dev",
    accessNote: {
      sl: "Distributor API po affiliate prijavi — danes samo affiliate povezava",
      en: "Distributor API after affiliate application — today affiliate link only",
    },
  },
  {
    slug: "kiwitaxi",
    labels: { sl: "KiwiTaxi", en: "KiwiTaxi" },
    group: "commercial",
    // TASK 43 (1.49.0): PRVI REALNI komercialni adapter — objavljeni CSV
    // inventar po strežniškem ingestu (data/kiwitaxi-routes.json) + globoka
    // povezava (/go/transfers). Statika: cene so objavljene, NE živi citat.
    inventoryAccess: ["static_content", "affiliate_deep_link"],
    status: "static",
    active: true,
    types: ["transfer"],
    goRoute: "transfers",
    capabilities: {
      geo: true,
      price: true,
      availability: false, // CSV nima koncepta razpoložljivosti
      images: false, // ruta nima slike (razredi jo imajo — ne predstavlja produkta)
      reviews: false,
      map: true,
      booking: true,
      affiliate: true,
    },
    envKeys: { affiliate: ["KIWITAXI_PAP_ID"], api: [] },
    minZoom: 10,
    cacheTtlMs: 24 * 60 * 60 * 1000, // statičen dataset — dolg TTL je pošten
    timeoutMs: 2_000, // čisti v-pomnilniku filter (brez omrežja)
    maxCallsPerMin: 0, // brez odhodnega prometa ob poizvedbi
    docsUrl: "https://kiwitaxi.com/en/partner/webmaster/instructions/api",
    accessNote: {
      sl: "Objavljeni podatki partnerja (CSV ingest): realne cene transferjev, niso živi citat. Razpoložljivost se pri ponudniku preveri ob rezervaciji.",
      en: "Partner published data (CSV ingest): real transfer prices, not live quotes. Availability is confirmed with the provider at booking.",
    },
  },
  {
    slug: "discovercars",
    labels: { sl: "DiscoverCars", en: "DiscoverCars" },
    group: "commercial",
    inventoryAccess: ["affiliate_deep_link"],
    status: "affiliate",
    active: false,
    types: ["car_rental"],
    goRoute: "cars",
    capabilities: { ...NO_INVENTORY_CAPS },
    envKeys: { affiliate: ["DISCOVERCARS_AFFILIATE_CODE"], api: [] },
    minZoom: 11,
    cacheTtlMs: 0,
    timeoutMs: 15_000,
    maxCallsPerMin: 0,
    docsUrl: "https://www.discovercars.com/affiliate",
    accessNote: {
      sl: "Search API le prek B4B pogodbe — danes samo affiliate povezava",
      en: "Search API only via B4B agreement — today affiliate link only",
    },
  },
  {
    slug: "skyscanner",
    labels: { sl: "Skyscanner", en: "Skyscanner" },
    group: "commercial",
    inventoryAccess: ["affiliate_deep_link"],
    status: "affiliate",
    active: false,
    types: ["flight"],
    goRoute: "flights",
    capabilities: { ...NO_INVENTORY_CAPS },
    envKeys: { affiliate: ["SKYSCANNER_MEDIA_PARTNER_ID"], api: [] },
    minZoom: 7,
    cacheTtlMs: 0,
    timeoutMs: 15_000,
    maxCallsPerMin: 0,
    docsUrl: "https://developers.skyscanner.net",
    accessNote: {
      sl: "Travel API za uveljavljena podjetja — danes samo affiliate povezava",
      en: "Travel API for established businesses — today affiliate link only",
    },
  },
  {
    slug: "omio",
    labels: { sl: "Omio", en: "Omio" },
    group: "commercial",
    inventoryAccess: ["affiliate_deep_link"],
    status: "affiliate",
    active: false,
    types: ["transport"],
    goRoute: "transport",
    capabilities: { ...NO_INVENTORY_CAPS },
    envKeys: { affiliate: ["OMIO_AFFILIATE_URL"], api: [] },
    minZoom: 9,
    cacheTtlMs: 0,
    timeoutMs: 15_000,
    maxCallsPerMin: 0,
    docsUrl: "https://www.omio.com/affiliate",
    accessNote: {
      sl: "Search API del affiliate programa (po prijavi) — brez lat/lng; danes samo affiliate povezava",
      en: "Search API part of affiliate program (post-application) — no lat/lng; today affiliate link only",
    },
  },
  {
    slug: "airalo",
    labels: { sl: "Airalo", en: "Airalo" },
    group: "commercial",
    inventoryAccess: ["affiliate_deep_link"],
    status: "affiliate",
    active: false,
    types: ["esim"],
    goRoute: "esim",
    capabilities: { ...NO_INVENTORY_CAPS },
    envKeys: { affiliate: ["AIRALO_AFFILIATE_URL"], api: [] },
    minZoom: 5,
    cacheTtlMs: 0,
    timeoutMs: 15_000,
    maxCallsPerMin: 0,
    docsUrl: "https://developers.partners.airalo.com",
    accessNote: {
      sl: "Partner API (odobritev) vrača cene na ravni države — danes samo affiliate povezava",
      en: "Partner API (approval) returns country-level prices — today affiliate link only",
    },
  },
  {
    slug: "worldnomads",
    labels: { sl: "World Nomads", en: "World Nomads" },
    group: "commercial",
    inventoryAccess: ["affiliate_deep_link"],
    status: "affiliate",
    active: false,
    types: ["insurance"],
    goRoute: "insurance",
    capabilities: { ...NO_INVENTORY_CAPS },
    envKeys: { affiliate: ["WORLDNOMADS_AFFILIATE_URL"], api: [] },
    minZoom: 5,
    cacheTtlMs: 0,
    timeoutMs: 15_000,
    maxCallsPerMin: 0,
    docsUrl: "https://partner.worldnomads.com",
    accessNote: {
      sl: "Brez API-ja (affiliate-only, plačilo po ponudbi) — samo povezava",
      en: "No API (affiliate-only, pay-per-quote) — link only",
    },
  },
  {
    slug: "safetywing",
    labels: { sl: "SafetyWing", en: "SafetyWing" },
    group: "commercial",
    inventoryAccess: ["affiliate_deep_link"],
    status: "affiliate",
    active: false,
    types: ["insurance"],
    goRoute: "insurance",
    capabilities: { ...NO_INVENTORY_CAPS },
    envKeys: { affiliate: ["SAFETYWING_AMBASSADOR_ID"], api: [] },
    minZoom: 5,
    cacheTtlMs: 0,
    timeoutMs: 15_000,
    maxCallsPerMin: 0,
    docsUrl: "https://safetywing.com/ambassador",
    accessNote: {
      sl: "Brez javnega API-ja (ambassador program) — samo povezava",
      en: "No public API (ambassador program) — link only",
    },
  },
  {
    slug: "travelpayouts",
    labels: { sl: "Travelpayouts", en: "Travelpayouts" },
    group: "commercial",
    // AUDIT 42 (42-b): prej status "affiliate" + inventoryAccess
    // ["affiliate_deep_link"] — a ZA ta vir NIMAMO niti povezave (brez
    // goRoute, prazni envKeys) niti API dostopa. Iskren status = "planned":
    // self-serve API vir, preverjen v auditu, priključitev po pregledu
    // pogojev v F2. NIKOLI ne prikažemo kot obstoječo partner povezavo.
    inventoryAccess: [],
    status: "planned",
    active: false,
    types: ["flight", "accommodation"],
    capabilities: { ...NO_INVENTORY_CAPS },
    envKeys: { affiliate: [], api: [] },
    minZoom: 7,
    cacheTtlMs: 0,
    timeoutMs: 15_000,
    maxCallsPerMin: 0,
    docsUrl: "https://support.travelpayouts.com/hc/en-us/categories/200358578-API-and-data",
    accessNote: {
      sl: "Self-serve API (predpomnjene cene letov/hotelov) — priključitev načrtovana po preverbi pogojev v F2",
      en: "Self-serve API (cached flight/hotel prices) — integration planned pending terms review in F2",
    },
  },
];

// ---------------------------------------------------------------------------
// IZPELJANI INDEKSI (enkraten vir resnice)
// ---------------------------------------------------------------------------

const REGISTRY_BY_SLUG = new Map(PROVIDER_REGISTRY.map((p) => [p.slug, p]));

export function getProvider(slug: string): ProviderRegistryEntry | undefined {
  return REGISTRY_BY_SLUG.get(slug as ProviderSlug);
}

export function isProviderSlug(v: unknown): v is ProviderSlug {
  return typeof v === "string" && REGISTRY_BY_SLUG.has(v as ProviderSlug);
}

/** Aktivni adapterji (priklopljeni na /api/supply/search). */
export function activeProviders(): ProviderRegistryEntry[] {
  return PROVIDER_REGISTRY.filter((p) => p.active);
}

/** Komercialni z affiliate globoko povezavo (kartice v supply panelu). */
export function affiliateCardProviders(): ProviderRegistryEntry[] {
  return PROVIDER_REGISTRY.filter(
    (p) =>
      p.group === "commercial" &&
      p.goRoute !== undefined &&
      p.inventoryAccess.includes("affiliate_deep_link")
  );
}

/** Lokalni viri (OSM/FSQ/STO) — vedno ločena skupina v UI. */
export function localProviders(): ProviderRegistryEntry[] {
  return PROVIDER_REGISTRY.filter((p) => p.group === "local");
}

/**
 * Uporabniku prijazen status (badge): local | live | static | search |
 * affiliate | planned. Izpeljano IZKLJUČNO iz registra — UI nikoli ne barva
 * po svoje.
 */
export function statusLabel(status: SupplyStatus): { sl: string; en: string } {
  switch (status) {
    case "local":
      return { sl: "Lokalni vir", en: "Local source" };
    case "live":
      return { sl: "Živa ponudba", en: "Live inventory" };
    case "static":
      return { sl: "Objavljeni podatki", en: "Published data" };
    case "search":
      return { sl: "Iskanje", en: "Search" };
    case "affiliate":
      return { sl: "Povezava partnerja", en: "Partner link" };
    case "planned":
      return { sl: "Načrtovano", en: "Planned" };
  }
}
