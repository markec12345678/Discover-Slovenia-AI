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
}

export interface LocationVisit {
  destination_id: string;
  destination_name: string;
  time_slot: string;
  duration: number;
  estimated_cost: number;
  notes: string;
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
