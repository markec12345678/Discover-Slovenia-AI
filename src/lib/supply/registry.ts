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
// + docs/PROVIDER-APPLICATIONS.md — master matrika produkcijske aktivacije):
//  - AKTIVNA adapterja: osm (lokalni vir) in kiwitaxi (Task 43: prvi realni
//    komercialni — objavljeni CSV inventar, status "static").
//  - Ostali komercialni providerji: status "affiliate" (globoka povezava
//    prek /go/[provider]) — DOKLER partner dostop ni dejansko odobren.
//    NIKOLI ne predstavljamo affiliate URL-ja kot inventarja.
//  - fsq: odprti podatki (Apache-2.0), adapter pripravljen po ingestu
//    — podatek NI nameščen → neaktiven.
//
// PRODUKCIJSKA MATRIKA (Task 52, 1.57.0): življenjski cikel vsakega
// providerja (DISCOVERED → … → PRODUCTION ACTIVE) + env dostop
// (PRESENT/MISSING, brez vrednosti) je v production-matrix.ts —
// strojno berljiva, testovno varovana proti driftu s tem registrom.
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
    // TASK 53 (1.58.0): DEVETI adapter (lokalni POI sloj). ODPRTI PODATKI
    // (Apache-2.0 z atribucijo) — množica OS Places je danes GATED na
    // HuggingFace (sprejem pogojev + prenos) → FSQ_PLACES_DIR MANJKA.
    // Adapter je LOKALEN (brez omrežja): bere pripravljene JSONL datoteke
    // iz FSQ_PLACES_DIR (runbook pretvorbe je v glavi fsq/dataset.ts).
    // Brez množice adapter vrne [] z opombo „no-dataset" — ko je
    // množica postavljena, sloj oživi BREZ spremembe kode.
    inventoryAccess: ["open_data"],
    status: "local",
    active: true, // priklopljen na /api/supply/search (runtime dataset gate v adapterju)
    types: [
      "restaurant",
      "accommodation",
      "museum",
      "viewpoint",
      "natural",
      "religious",
      "shop",
      "attraction",
      "poi",
    ],
    capabilities: {
      geo: true, // latitude/longitude iz množice (geoPrecision: exact)
      price: false, // odprti podatki — cen NI (info_only)
      availability: false,
      images: false, // množica NE vsebuje slik
      reviews: true, // stats.rating + rating_count (samo kadar obstajajo)
      map: true,
      booking: false,
      affiliate: false,
    },
    envKeys: { api: ["FSQ_PLACES_DIR"] },
    minZoom: 12,
    // Statična množica → dolg TTL je pošten (mtime osvežitev nasproti).
    cacheTtlMs: 24 * 60 * 60 * 1000,
    timeoutMs: 30_000,
    maxCallsPerMin: 0, // brez odhodnega prometa (lokalna množica)
    docsUrl: "https://opensource.foursquare.com/os-places",
    accessNote: {
      sl: "Odprti PODATKI (Apache-2.0 z atribucijo) · adapter pripravljen; množica še ni nameščena (FSQ_PLACES_DIR)",
      en: "Open DATA (Apache-2.0 with attribution) · adapter ready; dataset not yet installed (FSQ_PLACES_DIR)",
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
    // TASK 53 (1.58.0): PETI adapter (nastanitve). Pogodba: Demand API v3
    // je JAVNO dokumentirana (developers.booking.com/demand/docs — portal
    // 200, TASK 52); iskanje PO BBOX + rates blok. Host demand.booking.com
    // je iz razvojnega peskovnika DNS-blokiran (dokumentirana omejitev
    // okolja, ne pogodbe). DOSTOP: BOOKING_API_KEY MANJKA — Demand API
    // zahteva status Managed Affiliate Partner → adapter PRIKLJUČEN v
    // iskreno PRAZNEM stanju. Ko ključ + status pridejo, žive sobe/cene
    // stečejo BREZ spremembe kode.
    inventoryAccess: ["affiliate_deep_link"],
    status: "affiliate",
    active: true, // priklopljen na /api/supply/search (runtime capability gate v adapterju)
    types: ["accommodation"],
    goRoute: "hotels",
    capabilities: {
      geo: true, // location.latitude/longitude (geoPrecision: exact)
      price: true, // per_night iz rates bloka (ko bo API aktiven)
      availability: false, // blok-dostopnost nad našim tierjem — ne preverjamo (unknown)
      images: true, // photo URLs vira (imageCredit: © Booking.com)
      reviews: false, // review polja v iskanju niso dokumentirana za naš tier — iskreno NE mapiramo
      map: true,
      booking: true, // affiliate_redirect (/go/hotels — kategorija)
      affiliate: true,
    },
    envKeys: {
      affiliate: ["BOOKING_AFFILIATE_ID"],
      api: ["BOOKING_API_KEY", "BOOKING_API_BASE"],
    },
    minZoom: 12,
    // Rates so živi citati ob poizvedbi → konservativnih 10 min (ista
    // disciplina kot Viator iskalne cene).
    cacheTtlMs: 10 * 60 * 1000,
    timeoutMs: 20_000, // iskanje + EN rates blok klic
    maxCallsPerMin: 20,
    docsUrl: "https://developers.booking.com/demand/docs",
    accessNote: {
      sl: "Demand API zahteva status Managed Affiliate Partner (pogodba) — danes samo affiliate povezava, sloj je pripravljen in iskreno prazen.",
      en: "Demand API requires Managed Affiliate Partner status (contract) — today affiliate link only, layer is ready and honestly empty.",
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
    // TASK 46 (1.51.0): TRETJI realni adapter. Pogodba GetYourGuide Partner
    // API (OpenAPI spec + uradni wiki) je ŽIVO preverjena 18. 9. 2026 in
    // implementirana v src/lib/supply/providers/getyourguide/**. DOSTOP:
    // GETYOURGUIDE_API_TOKEN še NI izdan (živi dokaz: klic z neveljavnim
    // žetonom = HTTP 401 errorCode 2420; žeton izda partner manager po
    // odobritvi — NI self-serve) → adapter je PRIKLJUČEN v iskreno
    // PRAZNEM stanju (vrne [] + „not-configured"; NIČ izmišljenih
    // podatkov, NE simuliramo živega API-ja). Ko žeton pride v env, živi
    // podatki stečejo BREZ spremembe kode.
    // GEO: vir isče PO KROGU (coordinates[]=[lat,lng,radius]) — enota
    // radija v specifikaciji NI dokumentirana (adapter domneva km +
    // post-filter pinov na bbox). cacheTtlMs 0: vir IZRECNO odvrača od
    // predpomnjenja izpisa iskanj (»access the API in real-time«) —
    // vpliv: odgovor /api/supply/search postane no-store (dizajn: vsak
    // aktivni adapter s TTL 0 → no-store).
    inventoryAccess: ["affiliate_deep_link"],
    status: "affiliate",
    active: true, // priklopljen na /api/supply/search (runtime capability gate v adapterju)
    types: ["activity", "tour"], // sloji, ki SPROŽIJO adapter; tipi produktov so iskreni (tudi ticket/transfer)
    goRoute: "activities", // kartica affiliate povezave (obstoječe); produkt deep-link = /go/getyourguide
    capabilities: {
      geo: true, // tour.coordinates — predstavitvena lokacija (geoPrecision: city)
      price: true, // StartingPrice (values.amount + description enote vira)
      availability: false, // iskanje NE vrača razpoložljivosti (endpoint je nad BASIC tierjem)
      images: true, // pictures[0] + [format_id] 132 (imageCredit: copyright vira)
      reviews: true, // overall_rating + number_of_ratings (samo pri recenzijah)
      map: true,
      booking: true, // affiliate_redirect (/go/getyourguide?product={tour_id})
      affiliate: true,
    },
    envKeys: {
      affiliate: ["GETYOURGUIDE_PARTNER_ID"],
      api: ["GETYOURGUIDE_API_TOKEN", "GETYOURGUIDE_API_BASE"],
    },
    minZoom: 10,
    // Vir: »please do not scrape the API in an attempt to cache its
    // output« → živi vir BREZ predpomnilnika rezultatov (0; sočasni
    // klici delijo izvedbo — coalescing, ne cache).
    cacheTtlMs: 0,
    // En klic /1/tours × 8 s klientova dira + margin.
    timeoutMs: 10_000,
    // Vir: privzeto 130 klicev/min (ob presegu 5-minutna blokada!) — naša
    // globalna meja instance 60/min je konservativno pod limitom vira.
    maxCallsPerMin: 60,
    docsUrl: "https://github.com/getyourguide/partner-api-spec",
    accessNote: {
      sl: "Partner API (OpenAPI, odobritev prek partner portala) — pogodba živo preverjena; API žeton še ni izdan. Danes samo affiliate povezava, sloj je pripravljen in iskreno prazen.",
      en: "Partner API (OpenAPI, approval via partner portal) — contract verified live; API token not yet issued. Today affiliate link only, layer is ready and honestly empty.",
    },
  },
  {
    slug: "tiqets",
    labels: { sl: "Tiqets", en: "Tiqets" },
    group: "commercial",
    // TASK 53 (1.58.0): ČETRTI adapter (kartice+vstopnice). Pogodba:
    // vrata ŽIVO preverjena (api.tiqets.com/v2/products → 401 JSON,
    // api_version 2.7 — „The key is incorrect or the user is not
    // authorized…"). CELA API referenca je ZA portal prijavo (portals.
    // tiqets.com) → mapper je STRICT fail-closed (polja označena
    // DOCUMENTED-ASSUMPTION; manjkajoči id/naslov → preskočen + štet).
    // DOSTOP: TIQETS_API_KEY MANJKA (Distributor API zahteva odobritev
    // affiliate prijave prek Awin) → adapter PRIKLJUČEN v iskreno PRAZNEM
    // stanju (vrne [] + „not-configured"). Ko ključ pride v env, živi
    // produkti stečejo BREZ spremembe kode (ista pot, isti kanonski model).
    inventoryAccess: ["affiliate_deep_link"],
    status: "affiliate",
    active: true, // priklopljen na /api/supply/search (runtime capability gate v adapterju)
    types: ["ticket", "activity"],
    goRoute: "tickets",
    capabilities: {
      geo: true, // venue koordinate (geoPrecision: exact — samo iz vira)
      price: true, // objavljene cene vstopnic (ko bo API aktiven; EUR only)
      availability: false, // Distributor tier — ne preverjamo (unknown)
      images: true, // naslovne slike vira (imageCredit: © Tiqets)
      reviews: false, // polja ocen portalno zaprta — iskreno NE mapiramo
      map: true,
      booking: true, // affiliate_redirect (/go/tickets — kategorija, brez produktnega parametra)
      affiliate: true,
    },
    envKeys: {
      affiliate: ["TIQETS_AFFILIATE_URL"],
      api: ["TIQETS_API_KEY"],
    },
    minZoom: 11,
    // Svežina kataloga NI dokumentirana javno (portal) → 0 = iskreni
    // no-store (vsak klic vira je živ, brez predpomnilnika izpisa).
    cacheTtlMs: 0,
    timeoutMs: 15_000,
    maxCallsPerMin: 20,
    docsUrl: "https://developers.tiqets.dev",
    accessNote: {
      sl: "Distributor API (odobritev affiliate prijave prek Awin) — vrata živo preverjena; API ključ še ni izdan. Danes samo affiliate povezava, sloj je pripravljen in iskreno prazen.",
      en: "Distributor API (approval via Awin affiliate application) — gate verified live; API key not yet issued. Today affiliate link only, layer is ready and honestly empty.",
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
    // TASK 53 (1.58.0): ŠESTI adapter (leti). Pogodba: Travel API v3 je
    // JAVNO dokumentirana (developers.skyscanner.net/docs; Flights Live
    // Prices: create → poll). Vrata ŽIVO preverjena (POST /flights/live/
    // search/create brez ključa → Request Forbidden). DOSTOP:
    // SKYSCANNER_API_KEY MANJKA — Travel API se izda po prijavi prek
    // partners.skyscanner.net (Apply for our Flights API).
    // PRODUCT GAP (iskreno): SupplyQuery NIMA izvornega letališča — leta
    // so iskanja IZHODIŠČE→CILJ. Ob prisotnem ključu adapter vrne [] z
    // opombo „origin-required" (arhitektura pripravljena prek
    // deps.originPlaceId resolverja — prihodnja produktna odločitev).
    inventoryAccess: ["affiliate_deep_link"],
    status: "affiliate",
    active: true, // priklopljen na /api/supply/search (runtime capability gate + origin gate)
    types: ["flight"],
    goRoute: "flights",
    capabilities: {
      geo: true, // places[] vira (geoPrecision: city — letališče cilja)
      price: true, // pricing_options[0] (per_person, od-cena)
      availability: false, // Live Prices cenitveni citat ne potrjuje sedežev — unknown
      images: false, // vir ne vrača slik produktov
      reviews: false,
      map: true, // pin ciljnega letališča (samo iz places[] vira)
      booking: true, // affiliate_redirect (/go/flights) + deep_link vira kot sourceUrl
      affiliate: true,
    },
    envKeys: {
      affiliate: ["SKYSCANNER_MEDIA_PARTNER_ID"],
      api: ["SKYSCANNER_API_KEY", "SKYSCANNER_API_BASE"],
    },
    minZoom: 7,
    // Živi citati iskanj → 0 = no-store (ista disciplina kot GYG).
    cacheTtlMs: 0,
    timeoutMs: 20_000, // create + do 5 poll poskusov
    maxCallsPerMin: 10, // dvostopen async tok — konservativna meja instance
    docsUrl: "https://developers.skyscanner.net/docs/intro",
    accessNote: {
      sl: "Travel API (prijava prek partners.skyscanner.net) — pogodba javno dokumentirana; API ključ še ni izdan. Danes samo affiliate povezava, sloj je pripravljen in iskreno prazen.",
      en: "Travel API (application via partners.skyscanner.net) — contract publicly documented; API key not yet issued. Today affiliate link only, layer is ready and honestly empty.",
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
    // TASK 53 (1.58.0): SEDMI adapter (eSIM). Pogodba: Partner API v2 —
    // /api/v2/countries je ŽIVO preverjena NA PESKOVNIKU (sandbox.airalo.com
    // → 200, pravi JSON: Slovenia id=210, package_count=4; /api/v2/packages
    // brez žetona = route not found → auth-gated). Produkcija api.airalo.com
    // je iz peskovnika DNS-blokirana (omejitev okolja, ne pogodbe).
    // DOSTOP: AIRALO_CLIENT_ID/SECRET MANJKATA (OAuth2 client credentials,
    // odobritev prek partners.airalo.com) → adapter iskreno prazen.
    // GEO: državni nivo — pin = kanonski center SI (geoPrecision: country).
    // CENA: SAMO ob izrecnem EUR v viru (USD → cena izpuščena + opomba;
    // NIKOLI lažna konverzija).
    inventoryAccess: ["affiliate_deep_link"],
    status: "affiliate",
    active: true, // priklopljen na /api/supply/search (runtime capability gate v adapterju)
    types: ["esim"],
    goRoute: "esim",
    capabilities: {
      geo: true, // državni center SI (geoPrecision: country — kanonski)
      price: true, // package cene (SAMO EUR iz vira — sicer izpuščeno)
      availability: false, // koncept paketov brez preverjanja — unknown
      images: true, // image URL vira
      reviews: false,
      map: true,
      booking: true, // affiliate_redirect (/go/esim)
      affiliate: true,
    },
    envKeys: {
      affiliate: ["AIRALO_AFFILIATE_URL"],
      api: ["AIRALO_CLIENT_ID", "AIRALO_CLIENT_SECRET", "AIRALO_API_BASE"],
    },
    minZoom: 5,
    // Paketni katalog (državni nivo) → 1 h (katalog se redko spreminja,
    // cene so objavljene, ne živi citat).
    cacheTtlMs: 60 * 60 * 1000,
    timeoutMs: 20_000, // token + countries + packages
    maxCallsPerMin: 20,
    docsUrl: "https://developers.partners.airalo.com",
    accessNote: {
      sl: "Partner API (OAuth2, odobritev) — vrata peskovnika živo preverjena; poverilnici še nista izdani. Danes samo affiliate povezava, sloj je pripravljen in iskreno prazen.",
      en: "Partner API (OAuth2, approval) — sandbox gate verified live; credentials not yet issued. Today affiliate link only, layer is ready and honestly empty.",
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
    // TASK 53 (1.58.0): OSMI adapter (Data API — predpomnjene cene letov).
    // Pogodba: JAVNO dokumentirana (support.travelpayouts.com + ogledala);
    // vrata ŽIVO preverjena (api.travelpayouts.com/aviasales/v3/
    // prices_for_dates → 401 Unauthorized brez žetona). SELF-SERVE vir
    // (račun → travelpayouts.com/developers/api → token) → iskren
    // blockedReason: NOT_CONFIGURED (ne partner approval).
    // PRODUCT GAP (iskreno): Data API je IZHODIŠČE→CILJ — izhodišče določa
    // TRAVELPAYOUTS_ORIGIN (IATA, operaterska odločitev); brez njega
    // adapter ob prisotnem žetonu vrne [] z opombo „origin-required".
    // Cene so PREDPOMNJENE najnižje (ni živi citat) → fromPrice: true.
    inventoryAccess: [],
    status: "search", // iskalni API s predpomnjenimi cenami (adapter priključen, iskreno prazen)
    active: true, // priklopljen na /api/supply/search (runtime capability + origin gate)
    types: ["flight"],
    capabilities: {
      geo: false, // letna povezava IZHODIŠČE→CILJ — BREZ pina (iskreno, dokumentirano)
      price: true, // predpomnjene cene letov (per_person, fromPrice)
      availability: false, // predpomnjene cene ne potrjujejo sedežev — unknown
      images: false,
      reviews: false,
      map: false, // NIMAMO pina — sloj NE nastopa na zemljevidu (iskreno)
      booking: true, // affiliate_redirect (/go/flights?dest=…)
      affiliate: true,
    },
    envKeys: {
      affiliate: [],
      api: ["TRAVELPAYOUTS_TOKEN", "TRAVELPAYOUTS_API_BASE", "TRAVELPAYOUTS_ORIGIN"],
    },
    minZoom: 7,
    // Predpomnjene cene vira → 10 min (iskren kompromis med svežino
    // in vljudnostjo do vira).
    cacheTtlMs: 10 * 60 * 1000,
    timeoutMs: 10_000,
    maxCallsPerMin: 30,
    docsUrl: "https://support.travelpayouts.com/hc/en-us/categories/200358578-API-and-data",
    accessNote: {
      sl: "Data API (self-serve žeton po registraciji računa) — vrata živo preverjena; žeton še ni nastavljen. Sloj je pripravljen in iskreno prazen.",
      en: "Data API (self-serve token after account sign-up) — gate verified live; token not yet set. Layer is ready and honestly empty.",
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
