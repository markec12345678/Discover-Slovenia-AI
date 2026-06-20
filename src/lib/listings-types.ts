// Tipi za B2B listings (hotelir, restavracije, aktivnosti) — I Feel Slovenia

export type ListingCategory =
  | "hotel"
  | "restaurant"
  | "bar"
  | "activity"
  | "shop"
  | "transport"
  | "other";

export type ListingPlan = "free" | "premium" | "enterprise";

export interface Listing {
  id: string;
  name: string;
  slug: string;
  description: string;
  longDescription?: string | null;
  category: ListingCategory;
  destinationId?: string | null;
  destinationName?: string | null;
  address: string;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  images: string[];
  plan: ListingPlan;
  featured: boolean;
  verified: boolean;
  rating: number;
  reviewCount: number;
  priceRange: string;
  openingHours?: string | null;
  specialties: string[];
  viewCount: number;
  clickCount: number;
}

// Slovenske oznake kategorij
export const CATEGORY_LABELS: Record<ListingCategory, string> = {
  hotel: "Hotel",
  restaurant: "Restavracija",
  bar: "Bar",
  activity: "Aktivnost",
  shop: "Trgovina",
  transport: "Transport",
  other: "Drugo",
};

// Emoji ikone za kategorije (uporabljamo v badge + modal)
export const CATEGORY_ICONS: Record<ListingCategory, string> = {
  hotel: "🏨",
  restaurant: "🍽️",
  bar: "🍸",
  activity: "🎯",
  shop: "🛍️",
  transport: "🚗",
  other: "📍",
};

// Slovenske oznake paketov (B2B monetizacija)
export const PLAN_LABELS: Record<ListingPlan, string> = {
  free: "Osnovni",
  premium: "Premium",
  enterprise: "Enterprise",
};
