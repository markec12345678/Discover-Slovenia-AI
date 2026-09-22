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
  // TASK 87: geo koordinati pin-a (neobvezno — null = izkušnja brez pina
  // na supply zemljevidu; own adapter jo iskreno izpusti)
  lat?: number | null;
  lng?: number | null;
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

// ============================================================================
// TASK 99 (issue #1 §10) — ŽIVLJENJSKI CIKLUS REZERVACIJE TRŽNICE:
// payout state + customer state (tehnična struktura, fail-closed).
// ============================================================================

/** Payout state — izplačilo partnerju (Booking.payoutStatus).
 *  "not_due" — plačilo še NI bilo prisvojeno (demo/unpaid = VEDNO not_due);
 *  "due" — plačano in opravljeno, izplačilo zapade;
 *  "processing" — izplačilo v teku; "paid" — izplačano; "failed" — spodletelo.
 *  Zapisuje IZKLJUČNO izplačilna plast (cron/admin) — NIKOLI demo pot. */
export type BookingPayoutStatus =
  | "not_due"
  | "due"
  | "processing"
  | "paid"
  | "failed";

export const BOOKING_PAYOUT_STATUSES: readonly BookingPayoutStatus[] = [
  "not_due",
  "due",
  "processing",
  "paid",
  "failed",
];

/** Customer state — stanje gostove rezervacije (Booking.customerStatus).
 *  "none" — brez odprtega zahtevka; "cancellation_requested" — gost je
 *  zahteval preklic (zahtevek, NE preklic — izvede lastnik prek owner PATCH). */
export type BookingCustomerStatus = "none" | "cancellation_requested";

export const BOOKING_CUSTOMER_STATUSES: readonly BookingCustomerStatus[] = [
  "none",
  "cancellation_requested",
];

/** Dvojezične oznake payout stanja (iskrene: not_due NI "napaka"). */
export const BOOKING_PAYOUT_LABELS: Record<
  BookingPayoutStatus,
  { sl: string; en: string }
> = {
  not_due: { sl: "Izplačilo še ne zapada", en: "Payout not due yet" },
  due: { sl: "Za izplačilo", en: "Due for payout" },
  processing: { sl: "Izplačilo v teku", en: "Payout processing" },
  paid: { sl: "Izplačano", en: "Payout paid" },
  failed: { sl: "Izplačilo spodletelo", en: "Payout failed" },
};

/** Dvojezične oznake customer stanja. */
export const BOOKING_CUSTOMER_LABELS: Record<
  BookingCustomerStatus,
  { sl: string; en: string }
> = {
  none: { sl: "Brez zahtevka", en: "No request" },
  cancellation_requested: {
    sl: "Gost zahteva preklic",
    en: "Guest requested cancellation",
  },
};

/**
 * ISKRENA izpeljava trenutnega payout stanja iz dejanskih polj rezervacije:
 * brez prisvojenega plačila (paymentStatus ≠ "paid") izplačilo NIKOLI ne
 * zapada — demo/unpaid rezervacije so trajno "not_due" (shranjeno stanje
 * ostaja not_due; "due" bi nastavila izključno izplačilna plast, ko bo
 * plačilo dejansko prisvojeno prek Stripe produkcijskega toka).
 */
export function derivePayoutStatus(booking: {
  paymentStatus: string;
  status: string;
  payoutStatus: string;
}): BookingPayoutStatus {
  if (booking.payoutStatus === "paid") return "paid";
  if (booking.payoutStatus === "processing") return "processing";
  if (booking.payoutStatus === "failed") return "failed";
  // Izplačilo zapade SAMO za DEJANSKO plačano in opravljeno rezervacijo —
  // preklicana/refundirana plačila se vračajo kupcu, ne partnerju.
  if (
    booking.paymentStatus === "paid" &&
    booking.status === "completed" &&
    booking.payoutStatus === "due"
  ) {
    return "due";
  }
  return "not_due";
}
