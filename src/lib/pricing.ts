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
}

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
  },
  {
    id: "premium",
    name: "Premium",
    monthlyPrice: 149,
    yearlyPrice: 1490,
    tagline: "Za lokale ki želijo izstopati",
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
    cta: "Naroči Premium",
    badge: "Najbolj priljubljen",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    monthlyPrice: 499,
    yearlyPrice: 4990,
    tagline: "Za verige in večje lokacije",
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
    cta: "Kontaktiraj nas",
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
