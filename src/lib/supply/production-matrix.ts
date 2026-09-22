// ============================================================================
// TRAVEL SUPPLY MAP — PRODUCTION LIFECYCLE MATRIX (TASK 52, 1.57.0)
// ============================================================================
// STROJNO BERLJIVA matrika produkcijske aktivacije vseh providerjev (ena
// resnica skupaj z registrom; človeška različica z viri in runbooki je v
// docs/PROVIDER-APPLICATIONS.md).
//
// VERIGA ŽIVLJENJSKEGA CIKLA (naročnik §0 — vsak provider napreduje SAMO
// po dokazanih, ne po željenih stopnjah):
//
//   DISCOVERED → CONTRACT VERIFIED → ACCESS AVAILABLE → CODE READY →
//   PRODUCTION CONFIGURED → LIVE DATA VERIFIED → PRICE VERIFIED →
//   AVAILABILITY STATUS VERIFIED → CTA/BOOKING VERIFIED →
//   AI INTEGRATION VERIFIED → PRODUCTION ACTIVE
//
// PRAVILA (ISKRENOST, fail-closed):
//  - Provider BREZ legitimnega dostopa NIKOLI ne preseže stopnje, ki jo
//    dokazuje. Če dostop manjka: BLOCKED / ACCESS NOT AVAILABLE /
//    PARTNER APPROVAL REQUIRED / NOT CONFIGURED — NIKOLI izmišljeni
//    podatki, NIKOLI affiliate povezava predstavljena kot inventar.
//  - ENV DOSTOP: ta modul bere STREŽNIŠKI env SAMO za Boolean odgovor
//    PRESENT/MISSING — vrednosti NIKOLI ne zapustijo modula (niso v
//    tipih, niso v izpisu, niso v testih).
//  - Matrika JE izpeljana iz registra (registry.ts): vsak vnos registra
//    MORA imeti vnos tudi tu (testovno varovano — drift nemogoč) in
//    obratno (produkti zunaj registra ne obstajajo).
// ============================================================================
//
// ŽIVI DOKAZI (2026-09-19, TASK 52 §5 — uradni viri dosegljivi prek curl):
//  - Viator: docs 200 + api.viator.com brez/neveljaven ključ → INVALID_HEADER_VALUE/
//    401 (overitvena vrata ŽIVA; brez ključa ni podatkov)
//  - GetYourGuide: api.getyourguide.com/1/tours → „The X-ACCESS-TOKEN
//    header is missing" (vrata živa; žeton izda partner manager)
//  - Booking/Tiqets/Skyscanner/Airalo/WN/SW/DiscoverCars portali: 200
//    (pogoji dostopa po TASK 45/46 živih preverb 2026-09-18)
// ============================================================================

import { PROVIDER_REGISTRY, type ProviderRegistryEntry } from "./registry";
import type { ProviderSlug } from "./types";

// ---------------------------------------------------------------------------
// TIPI (javni — brez skrivnosti)
// ---------------------------------------------------------------------------

/** Stopnje življenjskega cikla po naročnikovi verigi (§0, urejene). */
export const LIFECYCLE_STAGES = [
  "DISCOVERED",
  "CONTRACT_VERIFIED",
  "ACCESS_AVAILABLE",
  "CODE_READY",
  "PRODUCTION_CONFIGURED",
  "LIVE_DATA_VERIFIED",
  "PRICE_VERIFIED",
  "AVAILABILITY_STATUS_VERIFIED",
  "CTA_BOOKING_VERIFIED",
  "AI_INTEGRATION_VERIFIED",
  "PRODUCTION_ACTIVE",
] as const;
export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

/** Razlog, zakaj provider NAPREJ ne more (iskreno blokirno stanje). */
export type BlockReason =
  | "PARTNER_APPROVAL_REQUIRED" // odobritev partner programa v teku/nujna
  | "ACCESS_NOT_AVAILABLE" // dostop (ključ/feed/dataset) ni na voljo
  | "NOT_CONFIGURED" // ID/ključ obstaja self-serve, a NI v env
  | "BLOCKED" // vir zahteva pogodbo/B4B — danes nemogoče
  | "NO_LIVE_DATA" // TASK 84: sloj je priklopljen, živi podatki še niso
  // prispevali (npr. own: partnerjevi listingi s koordinatami)
  | "NOT_APPLICABLE"; // vir sploh nima take vrste dostopa (npr. brez API)

/** Klasifikacija VRSTE DOSTOPA (§4 — nikoli pomešana z inventarjem). */
export type ProviderAccessKind =
  | "LIVE_INVENTORY_API"
  | "SEARCH_API"
  | "STATIC_CONTENT"
  | "PARTNER_FEED"
  | "AFFILIATE_DEEP_LINK"
  | "API_BOOKING"
  | "DIRECT_BOOKING"
  | "OPEN_DATA";

/** Klasifikacija CENE (§16 — iz cene NE sledi zalogi). */
export type PriceClassification =
  | "LIVE_PRICE" // živi citat iz API-ja ob poizvedbi
  | "FROM_PRICE" // objavljena „od"-cena (spodnja meja)
  | "UNKNOWN" // vir ima cene, a jih (še) ne prejemamo
  | "NOT_SUPPORTED"; // vir ne ponuja cen (open data / affiliate-only)

/** Klasifikacija RAZPOLOŽLJIVOSTI (§17 — nikoli „available" brez dokaza). */
export type AvailabilityClassification =
  | "LIVE" // živo preverjena ob poizvedbi
  | "UNKNOWN" // vir ima koncept, mi ne preverjamo
  | "NOT_SUPPORTED"; // vir koncepta nima (open data / staticni CSV)

/** Prioritetna kategorija aktivacije (§7–§11). */
export type ActivationCategory =
  | "LOCAL_OPEN_DATA" // OSM (§12 — ne-komercialni, ločeno)
  | "A_ACTIVITIES" // Viator/GYG/Tiqets (§7)
  | "B_ACCOMMODATION" // Booking (§8)
  | "C_TRANSPORT" // KiwiTaxi/DiscoverCars/Omio (§9)
  | "D_FLIGHTS" // Skyscanner/Omio (§10)
  | "E_INSURANCE_CONNECTIVITY" // WN/SW/Airalo (§11)
  | "OWN_MARKETPLACE" // lastna tržnica
  | "INFRASTRUCTURE"; // omrežja (CJ/Impact/Awin/TP) — gostujejo redirect

/** Strežniški odgovor o env spremenljivki (SAMO Boolean — vrednost ne
 *  zapusti strežnika; testi varujejo tip). */
export interface EnvAccessCheck {
  envVar: string;
  present: boolean;
}

/** ENV dostop enega providerja (§6 — izključno PRESENT/MISSING). */
export interface ProviderEnvAccess {
  affiliate: EnvAccessCheck[];
  api: EnvAccessCheck[];
  /** Strežniška proizvodnja: ali je vsaj EN ključni API/affiliate vnos
   *  dejansko prisoten (današnje stanje instance). */
  productionConfigured: boolean;
}

/** En vnos MASTER matrike (§2). */
export interface ProductionMatrixEntry {
  slug: ProviderSlug;
  category: ActivationCategory;
  /** Dejanska vrsta dostopa, ki jo IMAMO (§4). */
  accessKind: ProviderAccessKind;
  /** Najvišja DOKAZANA stopnja življenjskega cikla (§0). */
  stage: LifecycleStage;
  /** Blokirno stanje (samo kadar stage < PRODUCTION_ACTIVE). */
  blockedReason?: BlockReason;
  /** Cene (§16) in razpoložljivost (§17) — ločeno od dostopa. */
  price: PriceClassification;
  availability: AvailabilityClassification;
  /** Rezervacija/CTA: prek /go affiliate redirecta (fail-closed) ali
   *  lastne tržnice; info_only = brez rezervacije. */
  cta: "affiliate_redirect" | "own_checkout" | "info_only";
  /** Ali produkti tega vira sodelujejo v AI načrtovalcu (kanonski
   *  ProviderProduct → supply search → AI kontekst). */
  aiIntegrated: boolean;
  /** Uradni vir trditev (portal/dokumentacija). */
  docsUrl: string;
  /** Opomba (SL) — iskreno stanje za administracijo/dokumentacijo. */
  note: string;
}

// ---------------------------------------------------------------------------
// ENV DOSTOP (§6) — Boolean bralci PO IMENU (nikoli vrednosti ven)
// ---------------------------------------------------------------------------
// Imena so IZPELJANA iz registra (envKeys) — en sam vir resnice. Bralci
// so namerno ločeni od affiliate.ts: tam se vrednost UPORABI za URL, tu
// se zanjo izrazi SAMO prisotnost (matrika/admin/dokumentacija).

function envPresent(name: string | undefined): EnvAccessCheck | null {
  if (!name) return null;
  const v = process.env[name];
  if (typeof v !== "string") return { envVar: name, present: false };
  // URL spremenljivke: „prisoten“ pomeni VELJAVEN https URL (ista
  // semantika kot affiliate.ts isValidHttpsUrl — http/smét = neveljaven
  // vnos NI konfiguracija). ID/ključ spremenljivke: ne-prazno po trimu.
  if (name.endsWith("_URL")) {
    return { envVar: name, present: isValidHttpsEnvUrl(v.trim()) };
  }
  return { envVar: name, present: v.trim().length > 0 };
}

/** Lokalna kopija https validacije (brez uvoza affiliate.ts — modul ostane
 *  lahek; vrednost NE zapusti funkcije, ven gre samo Boolean). */
function isValidHttpsEnvUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.hostname.includes(".");
  } catch {
    return false;
  }
}

/** ENV dostop providerja (AFFILIATE + API ločeno, §6). */
export function providerEnvAccess(slug: ProviderSlug): ProviderEnvAccess {
  const entry = PROVIDER_REGISTRY.find((p) => p.slug === slug);
  if (!entry) {
    return { affiliate: [], api: [], productionConfigured: false };
  }
  const affiliate = (entry.envKeys.affiliate ?? [])
    .map(envPresent)
    .filter((c): c is EnvAccessCheck => c != null);
  const api = (entry.envKeys.api ?? [])
    .map(envPresent)
    .filter((c): c is EnvAccessCheck => c != null);
  // „Ključni" vnos = CREDENTIAL-LIKE spremenljivka (ID/ključ/žeton/URL
  // sledenja). NAMERNO IZKLJUČENI: _BASE (preklop produkcija/sandbox brez
  // ključa ne pomeni konfiguracije), _DIR (pot do lokalnega dataseta) in
  // _ORIGIN (TASK 53: operaterska konfiguracija izhodišča letov — IATA
  // koda brez žetona NI konfiguracija vira).
  // Vir brez obeh skupin (OSM/STO/own) → konfiguriranost oceni MATRIKA
  // (PRODUCTION_ACTIVE pomeni: ta vrsta supply-a DEJANSKO teče — npr. STO
  // kot RAG vir teče, čeprav NI sloj zemljevida; own še ne).
  const needsEnv = affiliate.length > 0 || api.length > 0;
  const credentialLike = (name: string) =>
    !name.endsWith("_BASE") && !name.endsWith("_DIR") && !name.endsWith("_ORIGIN");
  // API poverilnice: VSE credential-like vnosе api skupine morajo biti
  // prisotne (TASK 53 §21: airalo OAuth2 zahteva OBE — CLIENT_ID +
  // CLIENT_SECRET; DELNA konfiguracija = NE konfigurirano, iskreno
  // fail-closed). Eno-ključni viri (viator/tiqets/…) imajo en sam vnos
  // → every() je tam ekvivalenten some().
  const apiCreds = api.filter((c) => credentialLike(c.envVar));
  const apiConfigured = apiCreds.length > 0 && apiCreds.every((c) => c.present);
  // Affiliate poverilnica: ENA zadostuje (monetizacijska plast je
  // samostojen produkcijski dosežek — affiliate CTA teče brez API ključa).
  const affiliateConfigured = affiliate.some(
    (c) => c.present && credentialLike(c.envVar)
  );
  const productionConfigured = needsEnv
    ? apiConfigured || affiliateConfigured
    : MATRIX[entry.slug as ProviderSlug]?.stage === "PRODUCTION_ACTIVE";
  return { affiliate, api, productionConfigured };
}

/** Celotna ACCESS MATRIX (admin/dokumentacija — samo Boolean). */
export function accessMatrix(): Record<ProviderSlug, ProviderEnvAccess> {
  const out = {} as Record<ProviderSlug, ProviderEnvAccess>;
  for (const p of PROVIDER_REGISTRY) out[p.slug] = providerEnvAccess(p.slug);
  return out;
}

// ---------------------------------------------------------------------------
// MASTER MATRIX (§2) — DEJANSKO stanje instance (2026-09-19)
// ---------------------------------------------------------------------------
// Vsak vnos VSAJ iz registra mora imeti vrstico (testovno varovano).

const MATRIX: Record<ProviderSlug, Omit<ProductionMatrixEntry, "slug">> = {
  // === LOKALNI ODPRTI VIRI (§12 — nikoli affiliate) =====================
  osm: {
    category: "LOCAL_OPEN_DATA",
    accessKind: "OPEN_DATA",
    stage: "PRODUCTION_ACTIVE",
    price: "NOT_SUPPORTED",
    availability: "NOT_SUPPORTED",
    cta: "info_only",
    aiIntegrated: true,
    docsUrl: "https://wiki.openstreetmap.org/wiki/Overpass_API",
    note: "ODbL odprti podatki: žive Overpass poizvedbe po viewportu, retry+mirror, cache 10 min, atribucija © OpenStreetMap. Cene/razpoložljivost NISO podprte (info_only) — nikoli ne-komercialen vir ne postane affiliate.",
  },
  fsq: {
    category: "LOCAL_OPEN_DATA",
    accessKind: "OPEN_DATA",
    // TASK 61 (1.61.0): MNOŽICA NAMEŠČENA in živo strežena — lokalni
    // JSONL sloj (SI+HR+ME+AL, snapshot 2025-02-06 fused.io/source.coop,
    // ingest 2026-09-20, bun run fsq:ingest). Živi podatki so preverjeni
    // (supply poizvedbe vračajo FSQ produkte) → PRODUCTION_ACTIVE (ista
    // logika kot kiwitaxi: objavljeni statični feed, lokalno strežanje).
    stage: "PRODUCTION_ACTIVE",
    price: "NOT_SUPPORTED",
    availability: "NOT_SUPPORTED",
    cta: "info_only",
    aiIntegrated: true,
    docsUrl: "https://opensource.foursquare.com/os-places",
    note: "ODbL→Apache-2.0 odprta množica (z atribucijo): LOCALNO strežen POI sloj za SI+HR+ME+AL (snapshot 2025-02-06, kategorije: potovalno-relevanten nabor). Cene/razpoložljivost NISO podprte (info_only) — nikoli ne-komercialen vir ne postane affiliate. Osvežitev: bun run fsq:ingest (novi snapshotji na source.coop).",
  },
  sto: {
    category: "LOCAL_OPEN_DATA",
    accessKind: "STATIC_CONTENT",
    stage: "PRODUCTION_ACTIVE",
    price: "NOT_SUPPORTED",
    availability: "NOT_SUPPORTED",
    cta: "info_only",
    aiIntegrated: true,
    docsUrl: "https://www.slovenia.info/llms.txt",
    note: "Uradna vsebina slovenia.info (llms.txt ingest + RAG T2). NI geo feed/plast zemljevida — iskreno NE nastopa kot map layer.",
  },
  own: {
    category: "OWN_MARKETPLACE",
    accessKind: "DIRECT_BOOKING",
    // TASK 84 (1.75.0): geo stolpca Listing (lat/lng) + own adapter
    // (providers/own/adapter.ts) + register active → sloj priklopljen na
    // /api/supply/search. Pipeline je E2E preverjen na testnem listingu v
    // dev instanci (koordinate → pin → supply odgovor); PRODUKCIJSKI živi
    // podatki čakajo prve partnerjeve listinge s koordinatami (stopnja
    // iskreno ostaja PRODUCTION_CONFIGURED, NE PRODUCTION_ACTIVE).
    stage: "PRODUCTION_CONFIGURED",
    blockedReason: "NO_LIVE_DATA",
    price: "NOT_SUPPORTED", // priceRange €|€€|€€€ je obseg, ne številčna cena
    availability: "NOT_SUPPORTED", // Stripe checkout, ne koledar
    cta: "own_checkout",
    aiIntegrated: true, // priklopljen na supply search → AI kontekst izbire
    docsUrl: "",
    note: "Lastna tržnica: Listingi z geo stolpcema (lat/lng, TASK 84) na supply zemljevidu — rezervacija prek lastnega Stripe toka. Listing BREZ koordinat je iskreno izpuščen; prazna tržnica = „no-listings“. Experience/Product še brez geo (bodoča faza).",
  },

  // === A — ACTIVITIES / EXPERIENCES (§7) ================================
  viator: {
    category: "A_ACTIVITIES",
    // DANAŠNJA vrsta dostopa: SAMO affiliate globoka povezava. Adapter
    // je CODE_READY, a živi podatki obstajajo ŠELE s ključem (§4: affiliate
    // deep link NIKOLI != live inventory).
    accessKind: "AFFILIATE_DEEP_LINK",
    stage: "CODE_READY",
    blockedReason: "NOT_CONFIGURED",
    price: "FROM_PRICE", // pricing.summary.fromPrice, kadar bo API aktiven
    availability: "UNKNOWN", // Basic Access NIMA /availability/check
    cta: "affiliate_redirect",
    aiIntegrated: true, // priklopljen na supply search (iskreno prazen)
    docsUrl: "https://docs.viator.com/partner-api/technical/",
    note: "Pogodba živo preverjena (2026-09-18+19: portal 200, API vrata 401 brez ključa). VIATOR_API_KEY MISSING → adapter priklopljen v iskreno PRAZNEM stanju ([] + not-configured). Ko self-serve ključ pride v env: živi produkti BREZ spremembe kode.",
  },
  getyourguide: {
    category: "A_ACTIVITIES",
    accessKind: "AFFILIATE_DEEP_LINK",
    stage: "CODE_READY",
    blockedReason: "PARTNER_APPROVAL_REQUIRED",
    price: "FROM_PRICE", // StartingPrice, kadar bo API aktiven
    availability: "UNKNOWN", // search endpoint ne vrača razpoložljivosti
    cta: "affiliate_redirect",
    aiIntegrated: true, // priklopljen na supply search (iskreno prazen)
    docsUrl: "https://github.com/getyourguide/partner-api-spec",
    note: "Pogodba živo preverjena (2026-09-19: API vrata \u201eX-ACCESS-TOKEN missing\"). GETYOURGUIDE_API_TOKEN MISSING — žeton NI self-serve (izda partner manager po odobritvi). Adapter iskreno prazen do žetona.",
  },
  tiqets: {
    category: "A_ACTIVITIES",
    accessKind: "AFFILIATE_DEEP_LINK",
    // TASK 53: adapter + kanonsko mapiranje KODIRANO pripravljena (strict
    // fail-closed mapper — polja so portalno zaprta, DOCUMENTED-ASSUMPTION).
    stage: "CODE_READY",
    blockedReason: "PARTNER_APPROVAL_REQUIRED",
    price: "FROM_PRICE", // objavljene cene vstopnic, kadar bo API aktiven (EUR only)
    availability: "UNKNOWN", // Distributor tier ne vrača potrjene dostopnosti
    cta: "affiliate_redirect",
    aiIntegrated: true, // priklopljen na supply search (iskreno prazen)
    docsUrl: "https://developers.tiqets.dev",
    note: "Vrata API ŽIVO preverjena (401 JSON, api_version 2.7 — \u201eThe key is incorrect\u201c); CELA referenca je za portal prijavo (portals.tiqets.com). TIQETS_API_KEY MISSING (Distributor API zahteva odobritev affiliate prijave prek Awin) → adapter priključen v iskreno PRAZNEM stanju. Ko ključ pride v env: živi produkti BREZ spremembe kode.",
  },

  // === B — ACCOMMODATION (§8) ===========================================
  booking: {
    category: "B_ACCOMMODATION",
    accessKind: "AFFILIATE_DEEP_LINK",
    // TASK 53: adapter (iskanje po bbox + rates blok) KODIRANO pripravljen.
    stage: "CODE_READY",
    blockedReason: "PARTNER_APPROVAL_REQUIRED",
    price: "FROM_PRICE", // per_night iz rates bloka, kadar bo API aktiven
    availability: "UNKNOWN", // blok-dostopnost nad našim tierjem
    cta: "affiliate_redirect",
    aiIntegrated: true, // priklopljen na supply search (iskreno prazen)
    docsUrl: "https://developers.booking.com/demand/docs",
    note: "Demand API v3 javno dokumentirana (portal 200); host iz peskovnika DNS-blokiran (omejitev okolja). BOOKING_API_KEY MISSING — zahteva status Managed Affiliate Partner (pogodba) → adapter priključen v iskreno PRAZNEM stanju. Affiliate povezava NI hotelski inventar (§8); NE ustvarjamo fake sob.",
  },

  // === C — TRANSPORT (§9) ===============================================
  kiwitaxi: {
    category: "C_TRANSPORT",
    // Dejanski dostop: objavljeni CSV statični feed (partner data) +
    // affiliate globoka povezava za rezervacijo.
    accessKind: "STATIC_CONTENT",
    stage: "PRODUCTION_ACTIVE",
    price: "FROM_PRICE", // objavljene realne cene — NISO živi citat
    availability: "NOT_SUPPORTED", // CSV nima koncepta razpoložljivosti
    cta: "affiliate_redirect",
    aiIntegrated: true,
    docsUrl: "https://kiwitaxi.com/en/partner/webmaster/instructions/api",
    note: "PRODUKCIJSKO AKTIVEN: objavljeni CSV inventar (9614 transferjev, ingest 2026-09-18 + tedenski cron), 48 SI rut na zemljevidu, cene per_transfer v proračunu AI. Rezervacija prek /go/transfers (pap ID MISSING → čista povezava, monetized:false).",
  },
  discovercars: {
    category: "C_TRANSPORT",
    accessKind: "AFFILIATE_DEEP_LINK",
    stage: "CONTRACT_VERIFIED",
    blockedReason: "BLOCKED",
    price: "NOT_SUPPORTED", // Search API le prek B4B pogodbe
    availability: "NOT_SUPPORTED",
    cta: "affiliate_redirect",
    aiIntegrated: false,
    docsUrl: "https://www.discovercars.com/affiliate",
    note: "Search API zahteva B4B pogodbo — danes nemogoče. Affiliate globoka povezava (/go/cars) NI najemni inventar; NE izmišljujemo avtov/cen.",
  },
  omio: {
    category: "C_TRANSPORT",
    accessKind: "AFFILIATE_DEEP_LINK",
    stage: "CONTRACT_VERIFIED",
    blockedReason: "PARTNER_APPROVAL_REQUIRED",
    price: "NOT_SUPPORTED", // iskalni API po prijavi; brez lat/lng
    availability: "NOT_SUPPORTED",
    cta: "affiliate_redirect",
    aiIntegrated: false,
    docsUrl: "https://www.omio.com/affiliate",
    note: "Direktni program obstaja (format povezave ni javno dokumentiran — izda se po odobritvi). Dostop ni odobren → affiliate iskanje NI javnoprometni inventar.",
  },

  // === D — FLIGHTS / TRAVEL (§10) =======================================
  skyscanner: {
    category: "D_FLIGHTS",
    accessKind: "AFFILIATE_DEEP_LINK",
    // TASK 53: adapter (Flights Live Prices create→poll) KODIRANO pripravljen.
    stage: "CODE_READY",
    blockedReason: "PARTNER_APPROVAL_REQUIRED",
    price: "FROM_PRICE", // najnižje cene itinererjev (od-cena za datum/turo)
    availability: "UNKNOWN", // citat cene NE potrjuje sedežev
    cta: "affiliate_redirect",
    aiIntegrated: true, // priklopljen na supply search (iskreno prazen)
    docsUrl: "https://developers.skyscanner.net/docs/intro",
    note: "Travel API v3 javno dokumentirana (x-api-key; vrata živo preverjena: Request Forbidden brez ključa). SKYSCANNER_API_KEY MISSING — izda se po prijavi prek partners.skyscanner.net. PRODUCT GAP: SupplyQuery nima izvornega letališča → ob prisotnem ključu iskrena opomba „origin-required“ (prihodnja aktivacija prek deps.originPlaceId). Affiliate iskanje letov NI letalski inventar (§10).",
  },

  // === E — INSURANCE / CONNECTIVITY (§11) ===============================
  airalo: {
    category: "E_INSURANCE_CONNECTIVITY",
    accessKind: "AFFILIATE_DEEP_LINK",
    // TASK 53: adapter (OAuth2 + countries/packages) KODIRANO pripravljen.
    stage: "CODE_READY",
    blockedReason: "PARTNER_APPROVAL_REQUIRED",
    price: "FROM_PRICE", // objavljene cene paketov (SAMO EUR iz vira — USD izpuščen)
    availability: "UNKNOWN", // koncept paketov brez preverjanja
    cta: "affiliate_redirect",
    aiIntegrated: true, // priklopljen na supply search (iskreno prazen)
    docsUrl: "https://developers.partners.airalo.com",
    note: "Partner API v2 (OAuth2 client credentials). Vrata PESKOVNIKA živo preverjena (/api/v2/countries → 200 pravi JSON: Slovenia id=210; /api/v2/packages brez žetona = route not found). AIRALO_CLIENT_ID/SECRET MISSING (odobritev prek partners.airalo.com) → adapter priključen v iskreno PRAZNEM stanju. GEO: državni nivo (geoPrecision: country). Affiliate ponudba NI katalog eSIM-ov (§11).",
  },
  worldnomads: {
    category: "E_INSURANCE_CONNECTIVITY",
    accessKind: "AFFILIATE_DEEP_LINK",
    stage: "CONTRACT_VERIFIED",
    blockedReason: "NOT_APPLICABLE",
    price: "NOT_SUPPORTED", // affiliate-only vir (plačilo po quote) — brez API
    availability: "NOT_SUPPORTED",
    cta: "affiliate_redirect",
    aiIntegrated: false,
    docsUrl: "https://partner.worldnomads.com",
    note: "Brez API-ja (program na CJ, plačilo po ponudbi) → NI živi quote/availability. SAMO affiliate ponudba — pošteno „preveri pri ponudniku“.",
  },
  safetywing: {
    category: "E_INSURANCE_CONNECTIVITY",
    accessKind: "AFFILIATE_DEEP_LINK",
    stage: "CONTRACT_VERIFIED",
    blockedReason: "NOT_APPLICABLE",
    price: "NOT_SUPPORTED", // ambassador program — brez javnega API
    availability: "NOT_SUPPORTED",
    cta: "affiliate_redirect",
    aiIntegrated: false,
    docsUrl: "https://safetywing.com/ambassador",
    note: "Brez javnega API-ja (Ambassador program, referenceID tracking). NI live quote — SAMO affiliate ponudba.",
  },

  // === INFRASTRUKTURA (načrtovan, brez računa) ==========================
  travelpayouts: {
    category: "INFRASTRUCTURE",
    // TASK 53: Data API adapter KODIRANO pripravljen (self-serve token).
    accessKind: "SEARCH_API", // self-serve API (predpomnjene cene) — bodoče
    stage: "CODE_READY",
    blockedReason: "NOT_CONFIGURED",
    price: "FROM_PRICE", // predpomnjene najnižje cene (ni živi citat)
    availability: "UNKNOWN",
    cta: "affiliate_redirect",
    aiIntegrated: true, // priklopljen na supply search (iskreno prazen)
    docsUrl:
      "https://support.travelpayouts.com/hc/en-us/categories/200358578-API-and-data",
    note: "Data API javno dokumentirana (žeton v X-Access-Token; vrata živo preverjena: 401 brez žetona). SELF-SERVE vir (račun → travelpayouts.com/developers/api → token). TRAVELPAYOUTS_TOKEN MISSING → adapter priključen v iskreno PRAZNEM stanju. PRODUCT GAP: izhodišče letov določa TRAVELPAYOUTS_ORIGIN (IATA) — brez njega iskrena opomba „origin-required“. Povezava/hosti so že dovoljeni v /go omrežju.",
  },
};

/** Celotna MASTER matrika (skupaj z env dostopom instance). */
export function productionMatrix(): ProductionMatrixEntry[] {
  return PROVIDER_REGISTRY.map((p) => ({
    slug: p.slug,
    ...MATRIX[p.slug],
  }));
}

/** Posamezen vnos matrike ( ali undefined). */
export function getProductionMatrixEntry(
  slug: string
): ProductionMatrixEntry | undefined {
  const entry = PROVIDER_REGISTRY.find((p) => p.slug === slug);
  if (!entry) return undefined;
  const m = MATRIX[entry.slug as ProviderSlug];
  return m ? { slug: entry.slug, ...m } : undefined;
}

/**
 * Stopnje, ki jih je provider DEJANSKO prešel (za prikaz verige §0).
 * Vrne urejen seznam vseh stopenj DO (vključno) trenutne — npr.
 * kiwitaxi → vseh 11; viator → 4 (DISCOVERED..CODE_READY).
 */
export function reachedStages(stage: LifecycleStage): LifecycleStage[] {
  const idx = LIFECYCLE_STAGES.indexOf(stage);
  return LIFECYCLE_STAGES.slice(0, idx + 1);
}

/**
 * Sklepna ocena „production readiness“ celotnega sistema: števci po
 * stopnji + števci blokirnih razlogov (administrativni povzetek).
 */
export function productionSummary(): {
  total: number;
  byStage: Partial<Record<LifecycleStage, number>>;
  byBlockReason: Partial<Record<BlockReason, number>>;
  productionActive: ProviderSlug[];
} {
  const byStage: Partial<Record<LifecycleStage, number>> = {};
  const byBlockReason: Partial<Record<BlockReason, number>> = {};
  const productionActive: ProviderSlug[] = [];
  for (const e of productionMatrix()) {
    byStage[e.stage] = (byStage[e.stage] ?? 0) + 1;
    if (e.blockedReason) {
      byBlockReason[e.blockedReason] = (byBlockReason[e.blockedReason] ?? 0) + 1;
    }
    if (e.stage === "PRODUCTION_ACTIVE") productionActive.push(e.slug);
  }
  return {
    total: PROVIDER_REGISTRY.length,
    byStage,
    byBlockReason,
    productionActive,
  };
}

// ---------------------------------------------------------------------------
// NOTRANJI TIPI za administrative izpise — namerno brez env vrednosti.
// ---------------------------------------------------------------------------

/** Referenca na register (konsistentnost tipov). */
export type { ProviderRegistryEntry };
