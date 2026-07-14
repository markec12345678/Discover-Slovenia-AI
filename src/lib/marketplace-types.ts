// Tipi za tržnico (Products + Experiences) — Discover Slovenia AI

export type ProductCategory =
  | "food"
  | "wine"
  | "honey"
  | "oil"
  | "craft"
  | "souvenir"
  | "other";

export type ExperienceCategory =
  | "tour"
  | "workshop"
  | "tasting"
  | "outdoor"
  | "cultural"
  | "adventure"
  | "wellness";

export type MarketplacePlan = "free" | "premium" | "enterprise";

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  longDescription?: string | null;
  category: ProductCategory;
  destinationId?: string | null;
  destinationName?: string | null;
  price: number;
  compareAtPrice?: number | null;
  currency: string;
  images: string[];
  stock: number;
  weight?: number | null;
  organic: boolean;
  handmade: boolean;
  local: boolean;
  vegan: boolean;
  plan: string;
  featured: boolean;
  verified: boolean;
  rating: number;
  reviewCount: number;
  shippingFree: boolean;
  shipsEurope: boolean;
  shipsWorldwide: boolean;
  sellerName: string;
  sellerEmail?: string | null;
  sellerPhone?: string | null;
  sellerWebsite?: string | null;
  viewCount: number;
  saleCount: number;
}

export interface Experience {
  id: string;
  name: string;
  slug: string;
  description: string;
  longDescription?: string | null;
  category: ExperienceCategory;
  destinationId?: string | null;
  destinationName?: string | null;
  pricePerPerson: number;
  currency: string;
  durationHours: number;
  minGroupSize: number;
  maxGroupSize: number;
  languages: string[];
  meetingPoint?: string | null;
  address: string;
  images: string[];
  providerName: string;
  providerEmail?: string | null;
  providerPhone?: string | null;
  providerWebsite?: string | null;
  plan: string;
  featured: boolean;
  verified: boolean;
  rating: number;
  reviewCount: number;
  familyFriendly: boolean;
  accessibility: boolean;
  viewCount: number;
  bookingCount: number;
}

// Slovenske oznake kategorij izdelkov
export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  food: "Hrana",
  wine: "Vino",
  honey: "Med",
  oil: "Olje",
  craft: "Obrt",
  souvenir: "Suvenir",
  other: "Drugo",
};

// Emoji ikone za kategorije izdelkov
export const PRODUCT_CATEGORY_ICONS: Record<ProductCategory, string> = {
  food: "🧀",
  wine: "🍷",
  honey: "🍯",
  oil: "🫒",
  craft: "🧶",
  souvenir: "🎁",
  other: "📦",
};

// Slovenske oznake kategorij izkušenj
export const EXPERIENCE_CATEGORY_LABELS: Record<ExperienceCategory, string> = {
  tour: "Voden ogled",
  workshop: "Delavnica",
  tasting: "Degustacija",
  outdoor: "Narava",
  cultural: "Kultura",
  adventure: "Avantura",
  wellness: "Wellness",
};

// Emoji ikone za kategorije izkušenj
export const EXPERIENCE_CATEGORY_ICONS: Record<ExperienceCategory, string> = {
  tour: "🗺️",
  workshop: "🎨",
  tasting: "🍽️",
  outdoor: "🌲",
  cultural: "🏛️",
  adventure: "🧗",
  wellness: "💆",
};

// Pretvori ISO jezikovne kode v slovenska imena (prikaz v modalu)
export const LANGUAGE_LABELS: Record<string, string> = {
  sl: "Slovenščina",
  en: "Angleščina",
  de: "Nemščina",
  it: "Italijanščina",
  hr: "Hrvaščina",
  fr: "Francoščina",
  es: "Španščina",
  ru: "Ruščina",
  nl: "Nizozemščina",
};

// Formatiranje trajanja izkušnje (ura/dnevi)
export function formatDuration(hours: number): string {
  if (hours < 1) {
    const mins = Math.round(hours * 60);
    return `${mins} min`;
  }
  if (hours < 24) {
    const h = Number.isInteger(hours)
      ? hours.toString()
      : hours.toFixed(1).replace(".0", "");
    return `${h} h`;
  }
  const days = hours / 24;
  const d = Number.isInteger(days)
    ? days.toString()
    : days.toFixed(1).replace(".0", "");
  return `${d} dni`;
}

// Formatiranje cene v EUR
export function formatPrice(value: number, currency = "EUR"): string {
  try {
    return new Intl.NumberFormat("sl-SI", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} €`;
  }
}
