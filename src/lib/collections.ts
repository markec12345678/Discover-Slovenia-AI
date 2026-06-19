// Zbirke (Collections) — kurirane kategorije za boljšo navigacijo in AI priporočila.
// Vsaka zbirka definira filtre (kategorije, atributi, destinacije, cena),
// ki jih API /api/collections/[slug] aplikacija na products + experiences.

export interface CollectionFilters {
  // Kategorije izkušenj (tour, workshop, tasting, outdoor, cultural, adventure, wellness).
  // Uporabi se tudi za izdelke, kadar ni podan `productCategories` (presek z veljavnimi
  // kategorijami izdelkov: food, wine, honey, oil, craft, souvenir, other).
  categories?: string[];
  // Izplicitne kategorije izdelkov (npr. za "Kulinarične izkušnje" zajemi wine/food/honey/oil).
  productCategories?: string[];
  // Atributi: organic, handmade, local, vegan (produktsko) ali familyFriendly, accessibility (izkušnje).
  attributes?: string[];
  // Seznam ID-jev destinacij (bled, bohinj, soca, ...) — OR pogoj.
  destinationIds?: string[];
  // Minimalna / maksimalna cena (EUR) — cena izdelka ali cene izkušnje na osebo.
  priceMin?: number;
  priceMax?: number;
}

export interface Collection {
  id: string;
  slug: string;
  title: string;
  description: string;
  icon: string; // emoji
  color: string; // tailwind class za badge/akcent
  filters: CollectionFilters;
}

export const COLLECTIONS: Collection[] = [
  {
    id: "winter",
    slug: "zimski-paketi",
    title: "Zimski paketi",
    description: "Smučanje, wellness in tople kulinarike za hladne dni",
    icon: "❄️",
    color: "bg-cyan-50 text-cyan-700",
    filters: {
      categories: ["wellness", "outdoor", "adventure"],
      destinationIds: [
        "bled",
        "bohinj",
        "kranjska-gora",
        "rogaska",
        "maribor",
      ],
    },
  },
  {
    id: "summer",
    slug: "poletni-paketi",
    title: "Poletni paketi",
    description: "Rafting, pohodi in osvežitev ob vodi",
    icon: "☀️",
    color: "bg-amber-50 text-amber-700",
    filters: {
      categories: ["adventure", "outdoor", "tasting"],
      destinationIds: ["soca", "bohinj", "vintgar", "piran", "crnomelj"],
    },
  },
  {
    id: "romantic",
    slug: "romanticni-pobegi",
    title: "Romantični pobegi",
    description: "Za pare — gradovi, jezero, vinogradi",
    icon: "❤️",
    color: "bg-rose-50 text-rose-700",
    filters: {
      categories: ["wellness", "tasting", "cultural"],
      destinationIds: ["bled", "otocec", "piran", "lendava"],
    },
  },
  {
    id: "family",
    slug: "druzinski",
    title: "Družinsko",
    description: "Otrokom prijazne aktivnosti in izdelki",
    icon: "👨‍👩‍👧",
    color: "bg-green-50 text-green-700",
    filters: {
      attributes: ["familyFriendly"],
      categories: ["outdoor", "workshop", "tour"],
    },
  },
  {
    id: "gourmet",
    slug: "kulinarika",
    title: "Kulinarične izkušnje",
    description: "Degustacije vin, sirarstvo, kuharske delavnice",
    icon: "🍷",
    color: "bg-purple-50 text-purple-700",
    filters: {
      categories: ["tasting", "workshop"],
      productCategories: ["wine", "food", "honey", "oil"],
    },
  },
  {
    id: "adventure",
    slug: "avantura",
    title: "Adrenalin",
    description: "Rafting, smučanje, plezanje, zip-line",
    icon: "🧗",
    color: "bg-orange-50 text-orange-700",
    filters: {
      categories: ["adventure", "outdoor"],
    },
  },
  {
    id: "eco",
    slug: "eko",
    title: "Eko in lokalno",
    description: "Ekološki izdelki in trajnostne izkušnje",
    icon: "🌿",
    color: "bg-emerald-50 text-emerald-700",
    filters: {
      attributes: ["organic", "handmade", "local"],
    },
  },
  {
    id: "luxury",
    slug: "luxury",
    title: "Luxury",
    description: "Visokokakovostne izkušnje in izdelki",
    icon: "👑",
    color: "bg-yellow-50 text-yellow-700",
    filters: {
      priceMin: 100,
    },
  },
];

// Hitro iskanje zbirk po slug-u (uporablja API in CollectionModal).
export function getCollectionBySlug(slug: string): Collection | undefined {
  return COLLECTIONS.find((c) => c.slug === slug);
}

// Veljavne kategorije izdelkov (za presek pri aplikaciji filtra `categories`).
export const PRODUCT_CATEGORY_VALUES = [
  "food",
  "wine",
  "honey",
  "oil",
  "craft",
  "souvenir",
  "other",
] as const;

// Veljavne kategorije izkušenj.
export const EXPERIENCE_CATEGORY_VALUES = [
  "tour",
  "workshop",
  "tasting",
  "outdoor",
  "cultural",
  "adventure",
  "wellness",
] as const;
