// Centralni tipi za Discover Slovenia AI platformo
// Single source of truth - brez duplikacij kot v originalnem repu

import type { SelectedProviderProduct } from "./supply/types";

export type Region =
  | "gorenjska"
  | "primorska"
  | "osrednja"
  | "kras"
  | "stajerska"
  | "koroska"
  | "prekmurje"
  | "dolenjska"
  | "bela-krajina"
  // TASK 62: regionalne pokritost — regije sosednjih držav (HR/ME/AL)
  | "kontinentalna-hrvaska"
  | "istra"
  | "kvartner"
  | "lika"
  | "dalmacija"
  | "boka-kotorska"
  | "crnogorsko-primorje"
  | "osrednja-crna-gora"
  | "severna-crna-gora"
  | "osrednja-albanija"
  | "juana-albanija";

/**
 * TASK 62: država destinacije — pokritost SI+HR+ME+AL (zahodni Balkan).
 * Obstaja v vsaki destinaciji (izrecno, NE po privzetku — iskrenost:
 * država ni ugibanje iz koordinat, je editorialno določena lastnost
 * registra, testno preverjena proti FSQ SUPPORTED_COUNTRY_BBOXES).
 */
export type CountryCode = "SI" | "HR" | "ME" | "AL";
export type DestinationType = "lake" | "city" | "mountain" | "cave" | "coast" | "river" | "spa" | "gorge" | "castle";
export type Budget = "€" | "€€" | "€€€";
export type Season = "spring" | "summer" | "autumn" | "winter";

/**
 * F5.5 ( odpiralni časi): preverjeni podatki o obratovalnem času destinacije.
 * Obstaja SAMO za destinacije, kjer so bili urnik/dnevi zaprtja preverjeni
 * na uradnih virih ( data honesty — prazno ≠ izmišljeno). Vir je prikazan
 * uporabniku; geo-validacija iz njega izpelje opozorila (samo z znanim
 * datumom odhoda).
 */
export interface DestinationOpening {
  /** Kratko zabeleženo obdobje/urnik ( SL) — prikazano uporabniku. */
  note: string;
  /** EN različica opombe. */
  noteEn: string;
  /** Meseci ( 1–12), ko je ZAPRTO ( npr. Vintgar pozimi). */
  closedMonths?: number[];
  /** Dnevi v tednu po JS getDay() ( 0=ned, 1=pon … 6=sob), ko je zaprto. */
  closedWeekdays?: number[];
  /** destination = celoten kraj zaprt (ERROR); mainAttraction = zaprta glavna
   *  znamenitost, kraj sam je dostopen (WARN). */
  closureLevel: "destination" | "mainAttraction";
  /** Vir ( prikazan uporabniku — uradna domena). */
  source: string;
  /** URL vira ( opcijsko, za dokumentacijo). */
  sourceUrl?: string;
}

export interface Destination {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  region: Region;
  /** TASK 62: država (SI/HR/ME/AL) — skupaj z regijo določa filtriranje
   *  po državah; koherence regija↔država preverjajo testi. */
  country: CountryCode;
  type: DestinationType;
  description: string;
  highlights: string[];
  activities: string[];
  bestFor: string[];
  bestSeason: Season[];
  image: string;
  coords: { lat: number; lng: number };
  rating: number;
  budget: Budget;
  duration: string;
  costPerPerson: number;
  featured: boolean;
  /** F5.5: preverjeni odpiralni časi ( SAMO kjer vir obstaja — opcijsko). */
  opening?: DestinationOpening;
}

export interface PlannerInput {
  budget: number;
  days: number;
  interests: string[];
  season: Season;
  groupSize: number;
  // NOVO (FW4.2): datum odhoda (ISO YYYY-MM-DD) — opcijsko (nazaj
  // kompatibilno s starejšimi načrti); poganja datumski events match,
  // AI kontekst in prikaz datumov na dnevih
  startDate?: string;
  // NOVO (FW4.3): jezik AI izpisa — "sl" (privzeto) ali "en". Client
  // (itinerary-planner) pošlje locale; itinerer se generira v tem jeziku.
  language?: "sl" | "en";
  // NOVO (WEATHER-CONTEXT / t11): tip potne skupine — opcijsko; oblikuje
  // ritem in izbor načrta (družina → krajši prevozi in otrokom prijazne
  // lokacije, par → mirnejši tempo ...). Nazaj kompatibilno.
  partyType?: "couple" | "family" | "friends" | "solo";
  // NOVO (F15 / backlog #3): tempo potovanja — opcijsko; oblikuje GOSTOTO
  // načrta (slow → manj postankov, več časa na mestu; fast → več postankov
  // na dan). Vir: forumi (Reddit ×2 — "plannerji ne vprašajo za tempo").
  // Nazaj kompatibilno: brez polja = "balanced" (dosedanji izpis).
  pace?: "slow" | "balanced" | "fast";
  // NOVO (F5.4 "Začni s povezavo" / url-ingest): destinacije, ki jih je
  // uporabnik izrecno prepoznal na prilepljeni povezavi (YouTube/blog).
  // Opcijsko — fallback ocenjevalnik jih premakne na vrh izbora, AI prompt
  // pa dobi izrecno navodilo, da jih upošteva. Nazaj kompatibilno.
  preferredDestinations?: string[];
  // NOVO (F1 Supply Map, 1.49.0): produkti, izbrani na zemljevidu ponudbe
  // (structured — provider, id, tip, geo, cena, selectionState
  // FIXED/PREFERRED/SUGGESTED). AI jih prejme KOT STRUKTURIRAN objekt;
  // FIXED izbire so obvezne (AI ne zamenja izbranega hotela z drugim).
  // Sanitizacija na strežniku: src/lib/supply/sanitize.ts. Nazaj
  // kompatibilno: brez polja = dosedanje vedenje.
  selectedProviderProducts?: SelectedProviderProduct[];
}

export interface LocationVisit {
  destination_id: string;
  destination_name: string;
  time_slot: string;
  duration: number;
  estimated_cost: number;
  notes: string;
  // Dodatni (optional) podatki, ki jih AI/ranking lahko priloži lokaciji
  // (npr. transparency partner badge, affiliate tip, kategorija aktivnosti)
  recommendationType?: string;
  affiliateType?: string;
  category?: string;
  // FAZA 4-1 ("Zakaj je to priporočeno?"): kratka, podatkovno utemeljena
  // razlaga izbire postanka — sestavljena IZKLJUČNO iz dejstev (ugemanje
  // interesov, tip skupine, razdalja do sosednjega postanka, vremenska
  // ustreznost, sezona). Brez marketinških fraz. Glej src/lib/stop-insights.ts
  reason?: string;
  // 1.42 (GEO → NAČRT): koordinate OSM kraja, dodanega iz AI klepeta —
  // kadar destination_id NI v T1 datasetu (osm-node-…), zemljevid poti in
  // povezovalniki uporabijo te koordinate namesto dataseta
  lat?: number;
  lng?: number;
}

export interface DayPlan {
  day: number;
  locations: LocationVisit[];
  weather: { condition: string; temp: number };
  // F5.6 (road routing): poenostavljena geometrija poti dneva PO REALNIH
  // CESTAH ([lat, lng] točke, OSRM/OpenStreetMap) — za zemljevid poti na
  // /nacrtuj. Opcijsko: stari načrti in hevristični izračuni (OSRM ni
  // dosegljiv) ga nimajo → zemljevid izriše ravne črte (kot doslej).
  routeGeometry?: [number, number][];
}

export interface Itinerary {
  days: DayPlan[];
  total_budget: number;
  recommendations: string[];
  tips: string[];
  source: "ai" | "fallback";
  // NOVO: dogodki, ki se zgodijo na obiskanih destinacijah (matched iz
  // events-data.ts ob generiranju / ob ogledu deljenega potovanja)
  events?: ItineraryEvent[];
  // NOVO: AI pakirni seznam (AI predlog ali deterministična hevristika)
  packingList?: string[];
  // NOVO (FW4.1): strukturne metrike kakovosti — deterministično izračunane
  // ob generiranju; starejši shranjeni načrti jih nimajo (kartica jih
  // izračuna na mestu uporabe iz iste čiste funkcije)
  quality?: ItineraryQuality;
  // NOVO (FW4.1): AI utemeljitev "Zakaj ta pot?" (1–2 povedi, sanitizirana;
  // fallback = deterministična sestava iz vnosnih želja)
  rationale?: string;
  // NOVO (FW4.2): okvir potovanja (ISO datumi, dan 1 = tripStartDate) —
  // omogoča svež datumski events match na /pot/[shareId] in prikaz datumov
  // na dnevih; shranjuje se skupaj z načrtom (share/email/localStorage)
  tripStartDate?: string;
  tripEndDate?: string;
  // NOVO (FW4.2): dogodki, ki si jih uporabnik dodal v svojo pot (izbira
  // iz events sekcije) — preslikajo se na konkretne dneve potovanja
  addedEvents?: ItineraryEvent[];
  // NOVO (CROWD-ALTERNATIVES): poštene opombe o gneči — uredniška trditev o
  // vzorcu obiskanosti (vrhunski vikend julijske/avgustovske sezone na
  // javno dokumentiranih točkah) + alternative izračunane iz resničnih
  // podatkov destinacij (bližina/sezona/interesi); prazno brez datuma odhoda
  crowdNotices?: CrowdNotice[];
  // NOVO (P0.2 GEO-VALIDACIJA): geografska/časovna izvedljivost poti —
  // deterministično preverjena plast NAD generiranim načrtom (km na dan,
  // zaporedne razdalje, obseg dneva, časovna združljivost urnika, duplikati,
  // manjkajoče koordinate). Izračun: src/lib/geo-validation.ts (čista funkcija
  // — isto na serverju in clientu; stari shranjeni načrti brez tega polja
  // ga panel izračuna na mestu uporabe).
  geoValidation?: GeoValidation;
  // NOVO (UI sprint, točka D smeri): cestne noge med zaporednimi postanki,
  // serializirane iz strežniškega indeksa (ključ "idA|idB" → km/min/vir).
  // Za povezovalnike "🚗 ~X km · ~Y min" na dnevni časovni liniji — isti vir
  // številk kot značke ~km dni (geo-validacija uporablja isti indeks).
  // Opcijsko: stari shranjeni/deljeni načrti brez polja → client hevristika
  // (ista formula kot fallback geo-validacije, pošteno razkrito z "~").
  legs?: Record<string, LegSummary>;
  // NOVO (TASK 48, 1.53.0): supply-doslednost + status proračuna —
  // deterministično preverjena plast NAD AI izhodom (generacija + refine +
  // fallback): vsak supply ref proti kanonski izbiri (izmišljen → odstranjen),
  // dedupe po (provider, id), cene po unit semantiki, koordinate iz vira,
  // FIXED izbire neničljive. Izračun: src/lib/supply/itinerary-validation.ts.
  // Opcijsko: stari shranjeni načrti polja nimajo.
  supplyValidation?: SupplyValidationInfo;
  // NOVO (TASK 48, 1.53.0): status proračuna iz ZNANIH (dokazljivih) stroškov
  // — "within" ZAHTEVA, da so vse cene znane in da ni "od" cen (§12: nikoli
  // "znotraj proračuna", česar ne moremo dokazati). Prikaz: BudgetPanel.
  budgetValidation?: BudgetValidationInfo;
}

/** TASK 48: povzetek supply validacije (serializabilen podcene poročila —
 *  brez Map struktur, ki nosijo kanonske cene). */
export interface SupplyValidationInfo {
  /** Vseh supply postankov (kolon-format "provider:id") v načrtu. */
  supplyStops: number;
  /** Ref-ov, uspešno rešenih proti kanonski avtoriteti. */
  validated: number;
  /** Izmišljenih ref-ov, ODSTRANJENIH (fail-closed). */
  rejected: number;
  /** Podvojenih ref-ov, odstranjenih (isti provider+id). */
  deduped: number;
  /** Popravljenih cen na kanonsko vrednost (unit semantika). */
  priceCorrections: number;
  /** Obnovljenih koordinat iz kanonske izbire. */
  geoRestored: number;
  /** Popravljenih obrnjenih smeri prevozov (§5 kanonska smer). */
  directionsFixed: number;
  /** Ponovno vstavljenih FIXED izbir (AI jih je izpustil). */
  reinserted: number;
}

/** TASK 48: status proračuna iz znanih stroškov (§12 — iskren do dokazov). */
export interface BudgetValidationInfo {
  status: "within" | "exceeded" | "uncertain";
  /** Uporabnikov proračun (EUR), če je znan. */
  budget: number | null;
  /** Seštevek postankov z dokazljivo (kanonsko) ceno. */
  knownTotal: number;
  /** Seštevek estimated_cost vseh postankov (prikazna številka). */
  stopsTotal: number;
  /** Št. postankov z "od" ceno (spodnja meja, ne končni znesek). */
  fromPriceCount: number;
  /** Št. postankov brez dokazljive cene. */
  unknownCostStops: number;
}

/** UI sprint: povzetek cestne noge (km/min/vir, brez geometrije) — serializacijska
 *  podoblika LegRoute iz src/lib/road-routing.ts. */
export interface LegSummary {
  km: number;
  min: number;
  source: "osrm" | "heuristic";
}

// Dogodek, povezan z destinacijo v itinererju (subset EventItem iz events-data)
export interface ItineraryEvent {
  id: string;
  name: string;
  date: string;
  endDate?: string;
  location: string;
  category: string;
  priceRange: string;
  description: string;
  website?: string;
}

// CROWD-ALTERNATIVES: mirnejša alternativa v bližini vrhunske točke —
// razdalja iz coords, ujemani interesi iz bestFor ∩ interesi potnika
export interface CrowdAlternative {
  destination_id: string;
  destination_name: string;
  slug: string;
  distanceKm: number;
  matchedInterests: string[];
}

// CROWD-ALTERNATIVES: opomba o gneči na določenem dnevu itinererja —
// reason je uredniška trditev o vzorcu (NE status v realnem času)
export interface CrowdNotice {
  day: number;
  destination_id: string;
  destination_name: string;
  reason: string;
  alternatives: CrowdAlternative[];
}

// ============================================================================
// P0.2 — GEO-VALIDACIJA: geografska/časovna izvedljivost itinererja
// ============================================================================
//
// Deterministična plast NAD generacijo (AI ali fallback): metrike po dnevih
// (km, vožnja, aktivnosti, obseg) + opozorila po uporabnikovih pravilih iz
// pilot validacije. Brez lažne natančnosti (zaokrožitve na 5, "~" ocene).
// Glej src/lib/geo-validation.ts.

export type GeoIssueLevel = "warn" | "error";

export type GeoRuleId =
  | "day_km"
  | "day_stops"
  | "leg_distance"
  | "day_overload"
  | "schedule_gap"
  | "schedule_overlap"
  | "duplicate_stop"
  | "missing_coords"
  // TASK 48 (§4 časovne invariante): obrnjen termin (start ≥ end) in
  // nepozitivno trajanje postanka — prej tiho preskočeno.
  | "time_slot_invalid"
  | "duration_invalid"
  // F5.5: odpiralni časi ( samo z znanim datumom; vir v sporočilu)
  | "closed_month"
  | "closed_weekday";

export interface DayGeoMetrics {
  day: number;
  stops: number;
  km: number;
  drivingMinutes: number;
  activityMinutes: number;
  loadMinutes: number;
}

export interface GeoValidationIssue {
  day: number;
  level: GeoIssueLevel;
  rule: GeoRuleId;
  message: string;
}

export interface GeoValidation {
  days: DayGeoMetrics[];
  issues: GeoValidationIssue[];
  tripKm: number;
  worst: "ok" | "warn" | "error";
  /**
   * F5.6 (road routing): od kod so razdalje/časi — "osrm" (realne ceste),
   * "heuristic" (haversine × 1,3 ÷ 55 km/h) ali "mixed". Opcijsko: stari
   * shranjeni načrti brez OSRM obogatitve ga nimajo → panel izpiše
   * hevristiko (nazaj kompatibilno, pošteno razkrito).
   */
  method?: RoutingMethod;
}

export interface WeatherData {
  condition: string;
  temp: number;
  humidity: number;
  windSpeed: number;
  icon: string;
}

// ============================================================================
// FW4.1 — strukturne metrike kakovosti itinererja (deterministične)
// ============================================================================
//
// NAČELO: VSA metrika je izračunana iz REALNIH podatkov (koordinate, cene,
// tipi destinacij, struktura dni) — NI AI-uganjena. AI prispeva samo
// `rationale` ("Zakaj ta pot?"), ki je vizualno/logično ločen od meritev.
// Izračun: src/lib/itinerary-quality.ts (čista funkcija, isto na serverju
// in clientu — stare shranjene načrte kartica izračuna na mestu uporabe).

export type TempoLabel = "Miren" | "Umirjen" | "Poln";

export interface ItineraryQuality {
  /** Skupni čas vožnje v minutah (realne ceste prek OSRM, kadar je bil indeks nog podan; sicer haversine × 1.3 ÷ 55 km/h — glej routingMethod) */
  drivingMinutes: number;
  /** Seštevek estimated_cost vseh lokacij (EUR) */
  estimatedCost: number;
  /** € / €€ / €€€ — glede na strošek na osebo na dan */
  budgetTier: Budget;
  /** Povprečno število lokacij na dan: ≤2 Miren, 3 Umirjen, ≥4 Poln */
  tempo: TempoLabel;
  /** 1–5 — delež naravnih destinacij (lake/mountain/gorge/cave/river/coast) */
  natureScore: 1 | 2 | 3 | 4 | 5;
  /** 1–5 — iz interesov potnika + omemb hrane v notes/recommendations */
  foodScore: 1 | 2 | 3 | 4 | 5;
  /** Število dni (za prikaz v kartici) */
  days: number;
  /** Velikost skupine (za prikaz v kartici) */
  groupSize: number;
  /**
   * NOVO (F5.3): stroški vožnje — gorivo + e-vinjeta (ocene, ne rezervacija).
   * Opcijsko polje: starejši shranjeni načrti ga nimajo → kartica ga izračuna
   * na mestu uporabe iz ISTE čiste funkcije (computeTripDriveCosts).
   * Strukturirano (vignetteDays številka) — oznake se lokalizira v UI.
   */
  driveCosts?: DriveCosts;
  /**
   * F5.6 (road routing): metoda izračuna vožnje/kilometrov — "osrm"
   * (realne ceste), "heuristic" ali "mixed". Opcijsko: stari načrti brez
   * tega polja so izračunani hevristično (kartica izpiše staro razlago).
   */
  routingMethod?: RoutingMethod;
}

/** F5.6 (road routing): vir razdalj/časov — razkrit v UI. */
export type RoutingMethod = "osrm" | "heuristic" | "mixed";

/**
 * F5.3 — ocena stroškov vožnje (deterministično, iz km poti):
 * gorivo (km × poraba × cena/l) + slovenska e-vinjeta (izbrana po dolžini
 * potovanja). Vse predpostavke so razkrite v UI ("Kako smo izračunali")
 * z viri (AMZS/DARS, regulirana cena goriva) — skladno z načelom: ocena,
 * ki pove svoje meje. Vinjeta je pogojna (samo ob uporabi avtocest).
 */
export interface DriveCosts {
  /** Skupni kilometri poti (realne ceste prek OSRM, kadar je bil indeks nog podan; sicer haversine × 1.3 — zaokroženo na 5) */
  km: number;
  /** Ocenjena poraba goriva v litrih (zaokroženo na 1) */
  fuelLiters: number;
  /** Ocenjeni strošek goriva v EUR (zaokroženo) */
  fuelEur: number;
  /** Veljavnost vinjete v dnevih: 1, 10, 62 (dvomesečna) ali 365 (letna) */
  vignetteDays: 1 | 10 | 62 | 365;
  /** Cena izbrane vinjete v EUR (vozila do 3,5 t) */
  vignetteEur: number;
  /** Skupaj gorivo + vinjeta (EUR) */
  totalEur: number;
}

// ============================================================================
// FAZA 4-2 — "Prilagodi ta dan": hitre akcije prek obstoječega refine mehanizma
// ============================================================================
//
// Šest kanoničnih akcij (Manj vožnje / Primerno za dež / Počasnejši tempo /
// Več narave / Več hrane / Za družino). AI pot jih obdela kot naravnojezični
// ukaz; fallback pot (deterministično, brez novega AI sistema) jih obdela z
// čistimi transformacijami nad istim datasetom destinacij — glej
// src/lib/refine-actions.ts.

export type QuickActionId =
  | "less_driving"
  | "rain_suitable"
  | "slower_pace"
  | "more_nature"
  | "more_food"
  | "family_friendly";

/** Elemenarna sprememba, ki jo je prinesla hitra akcija (za prikaz + analitiko). */
export interface RefineChange {
  kind:
    | "stop_removed"
    | "stop_replaced"
    | "day_reordered"
    | "day_simplified"
    | "unchanged"
    /** P0.3 (recenzija): akcija se NI izvedla — za varen popravek manjkajo
     * preverljivi podatki (neznan destination_id, ni geo-ustrezne alternative).
     * Itinerer ostane nespremenjen; reason pove zakaj (pošteno, brez ugibanj). */
    | "cannot_transform";
  day: number;
  destination_id?: string;
  destination_name?: string;
  replacement_id?: string;
  replacement_name?: string;
  km?: number;
  /** Samo pri cannot_transform: strojno berljiv razlog (missing_destination_data |
   * no_nearby_alternative) — za analitiko in prikaz. */
  reason?: string;
}

// ============================================================================
// P0.1 (recenzija) — validacijski dokaz po vsaki spremembi
// ============================================================================
//
// Recenzentova zahteva: "deterministični fallback, ki spremeni dan, še ni isto
// kot validator, ki dokaže, da je novi dan izvedljiv." Zato vsak refine
// odgovor (AI in deterministična pot) vsebuje struktuirani dokaz:
//   before → mutation (changes) → after, s statusom pass | warn | still_failing
// in opombo, če dan po spremembi ostaja geografsko obremenjen.

/** Stanje enega dneva (ali celega potovanja) v geo-validaciji. */
export interface GeoValidationSnapshot {
  km: number;
  /** "ok" (0 opozoril) | "warn" | "error" — enake ravni kot GeoValidation. */
  worst: "ok" | "warn" | "error";
  /** Število opozoril (warn + error). */
  issues: number;
  /** Število ERROR opozoril (ni realno izvedljivo). */
  errors: number;
}

/** Struktuirani validacijski dokaz refine odgovora (P0.1). */
export interface RefineValidation {
  /** Obseg dokaza: "day" (hitra akcija na določen dan) | "trip" (prosti ukaz). */
  scope: "day" | "trip";
  /** Pri hitri akciji: številka dneva (pri trip: izpuščeno). */
  day?: number;
  before: GeoValidationSnapshot;
  after: GeoValidationSnapshot;
  /** "pass" = po spremembi 0 opozoril; "warn" = ostajajo opozorila (a izvedljivo);
   * "still_failing" = po spremembi še vedno ≥1 ERROR (ni realno izvedljivo). */
  status: "pass" | "warn" | "still_failing";
  /** Lokalizirana opomba, kadar status ≠ "pass" (prikaže se v toastu). */
  statusNote?: string;
}
