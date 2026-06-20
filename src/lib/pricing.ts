export interface PricingPlan {
  id: "free" | "premium" | "enterprise";
  name: string;
  monthlyPrice: number; // 0, 149, 499
  yearlyPrice: number; // 0, 1490, 4990 (2 meseca brezplačno)
  tagline: string;
  features: string[];
  highlighted: boolean; // za premium (srednji)
  cta: string; // "Začni brezplačno" / "Naroči Premium" / "Kontakt"
  badge?: string; // "Najbolj priljubljen" za premium
  /** Ali je ta paket trenutno brezplačen (beta promo) */
  betaFree?: boolean;
  /** Originalna cena (prikazana prečrtana v beta-ju) */
  originalPrice?: number;
}

// Med beta obdobjem so VSI paketi brezplačni.
// Ko se beta konča (30+ lokalov), se cene aktivirajo.
export const PRICING_PLANS: PricingPlan[] = [
  {
    id: "free",
    name: "Osnovni",
    monthlyPrice: 0,
    yearlyPrice: 0,
    tagline: "Za začetek — brezplačno za vedno",
    features: [
      "Osnovni listing (ime, naslov, telefon)",
      "1 kategorija",
      "Prikaz na dnu seznama",
      "Brez spletne povezave",
    ],
    highlighted: false,
    cta: "Začni brezplačno",
    betaFree: true,
  },
  {
    id: "premium",
    name: "Premium",
    monthlyPrice: 0, // med beta = 0
    yearlyPrice: 0,
    originalPrice: 149, // prikaže se prečrtano
    tagline: "Za lokale ki želijo izstopati — BREZPLAČNO med beta",
    features: [
      "Vse iz Osnovnega +",
      "Featured na vrhu kategorije (zlat rob)",
      "Neomejeno slik + video",
      "Povezava z destinacijami",
      "AI vas vključi v itinererje!",
      "Polna statistika (kliki, kontakti)",
      "Zelen znak 'Overjen'",
      "Prioritetna podpora",
    ],
    highlighted: true,
    cta: "Naroči Premium (brezplačno)",
    badge: "BETA: BREZPLAČNO",
    betaFree: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    monthlyPrice: 0, // med beta = 0
    yearlyPrice: 0,
    originalPrice: 499,
    tagline: "Za verige in večje lokacije — BREZPLAČNO med beta",
    features: [
      "Vse iz Premium +",
      "Lastna mini-stran (poddomena)",
      "Večji marker na zemljevidu",
      "Vključitev v 'Featured ture'",
      "API dostop",
      "Dedicated account manager",
      "Custom integracije",
    ],
    highlighted: false,
    cta: "Kontaktiraj nas (brezplačno)",
    betaFree: true,
  },
];

export const BUSINESS_TYPES = [
  "Hotel",
  "Restavracija",
  "Bar",
  "Aktivnost",
  "Trgovina",
  "Transport",
  "Drugo",
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];
