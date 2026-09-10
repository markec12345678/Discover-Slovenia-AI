// Tipi za B2B listings (hotelir, restavracije, aktivnosti) — Discover Slovenia AI

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
  partnerStatus?: "standard" | "verified" | "premium" | "featured";
  featured: boolean;
  verified: boolean;
  rating: number;
  reviewCount: number;
  priceRange: string;
  openingHours?: string | null;
  specialties: string[];
  viewCount: number;
  clickCount: number;
  // === STATUS SISTEM (P0-1): moderacijska zanka draft → pending → published ===
  status?: ListingStatus;
  rejectionReason?: string | null;
  submittedAt?: string | null;
}

// Statusi moderacijske zanke lokalov
export type ListingStatus =
  | "draft"
  | "pending"
  | "approved"
  | "published"
  | "rejected"
  | "expired"
  | "archived"
  | "deleted";

// Slovenske oznake statusov
export const STATUS_LABELS: Record<string, string> = {
  draft: "Osnutek",
  pending: "V pregledu",
  approved: "Odobren",
  published: "Objavljen",
  rejected: "Zavrnjen",
  expired: "Potekel",
  archived: "Arhiviran",
  deleted: "Izbrisan",
};

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
