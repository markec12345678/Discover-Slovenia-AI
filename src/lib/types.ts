// Centralni tipi za Discover Slovenia AI platformo
// Single source of truth - brez duplikacij kot v originalnem repu

export type Region = "gorenjska" | "primorska" | "osrednja" | "kras" | "stajerska" | "koroska" | "prekmurje" | "dolenjska" | "bela-krajina";
export type DestinationType = "lake" | "city" | "mountain" | "cave" | "coast" | "river" | "spa" | "gorge" | "castle";
export type Budget = "€" | "€€" | "€€€";
export type Season = "spring" | "summer" | "autumn" | "winter";

export interface Destination {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  region: Region;
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
}

export interface DayPlan {
  day: number;
  locations: LocationVisit[];
  weather: { condition: string; temp: number };
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

export interface WeatherData {
  condition: string;
  temp: number;
  humidity: number;
  windSpeed: number;
  icon: string;
}

export interface AffiliateLinks {
  hotels: string;
  cars: string;
  activities: string;
  flights: string;
  insurance: string;
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
  /** Skupni čas vožnje v minutah (haversine med zaporednimi lokacijami × 1.3 cestni faktor ÷ 55 km/h) */
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
}
