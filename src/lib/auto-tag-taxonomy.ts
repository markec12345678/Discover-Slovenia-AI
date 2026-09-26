// ============================================================================
// AUTO-TAG TAKSONOMIJA (Issue #9 §16 — DETERMINISTIČNA klasifikacija)
// ============================================================================
//
// Predlogi kategorij/atributov/tagov za lastnikove vnose so IZRAČUNANI
// iz slovarjev ključnih besed (SL+EN: kuhinja, aktivnosti, namestitve,
// wellness …) — 0 AI, 0 omrežja, reproducibilno. Izvoženo iz rute v lib
// (ena resnica, Issue #9 §25/§27; route handlerji v Next.js smejo izvažati
// SAMO HTTP metode).
//
// Zaupanje iz moči ujemanja: 0 zadetkov → "low" (+ poštena privzeta
// kategorija), 1–2 → "medium", ≥3 → "high". Uporabnik vseeno POTRDI
// predlog (human-in-the-loop, nespremenjeno).
// ============================================================================

export interface AutoTagRequest {
  type: "listing" | "product" | "experience";
  name: string;
  description: string;
  destinationName?: string;
}

export interface AutoTagResult {
  category: string;
  attributes: Record<string, boolean>;
  tags: string[];
  confidence: "high" | "medium" | "low";
  source: "deterministic";
}

// Veljavne kategorije po tipu (enum — nespremenjen)
const VALID_CATEGORIES: Record<string, string[]> = {
  listing: ["hotel", "restaurant", "activity", "shop", "wellness", "transport"],
  product: ["food", "wine", "honey", "oil", "craft", "souvenir", "other"],
  experience: ["tour", "workshop", "tasting", "outdoor", "cultural", "adventure", "wellness"],
};

// Veljavni atributi po tipu (enum — nespremenjen)
const VALID_ATTRIBUTES: Record<string, string[]> = {
  listing: ["featured", "verified", "familyFriendly", "petFriendly", "parking", "cardPayment", "wifi"],
  product: ["organic", "handmade", "local", "vegan", "glutenFree", "shippingFree"],
  experience: ["familyFriendly", "petFriendly", "indoor", "outdoor", "beginnerFriendly", "equipment"],
};

// ============================================================================
// SLOVAR TAKSONOMIJE — SL + EN ključne besede za VSE veljavne kategorije.
// Ujemanje: podniz (malene črke) nad "name + description".
// ============================================================================

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  // --- listing ---
  hotel: [
    "hotel", "hoteli", "pension", "apartma", "apartm", "soba", "sobe", "namestitev",
    "nočitev", "nočitve", "hostel", "bed & breakfast", "prenočišče",
    "apartment", "room", "rooms", "accommodation", "stay", "overnight", "zimmer",
  ],
  restaurant: [
    "restavrac", "gostiln", "okrevn", "hrana", "kuhinj", "kavarna", "kava",
    "bistro", "pizzeria", "piczerija", "pizza", "burger", "brunch", "kosilo",
    "večerja", "meni", "jed", "specialitete", "restaurant", "food", "kitchen",
    "cafe", "coffee", "dining", "lunch", "dinner", "menu", "tavern", "bistro",
  ],
  activity: [
    "aktivnost", "aktivnosti", "tura", "ture", "ogled", "ogledi", "pohod",
    "pohodi", "kolesar", "izlet", "izleti", "adrenalin", "smuči", "smučanje",
    "kajak", "rafting", "sup", "plezanje", "jama", "soteska", "zip line",
    "activity", "activities", "tour", "tours", "sightseeing", "hike", "hiking",
    "trail", "bike", "cycling", "trip", "excursion", "adventure",
  ],
  shop: [
    "trgovin", "prodajaln", "butik", "boutique", "shop", "store", "market",
    "tržnica", "stalls", "kiosk", "prodaja na domu", "farmer's market",
  ],
  wellness: [
    "wellness", "sauna", "savna", "masaža", "masaže", "term", "vrelci",
    "spa", "zdravil", "kopeli", "massage", "thermal", "baths", "beauty",
    "kozmeti",
  ],
  transport: [
    "prevoz", "prenosi", "transfer", "taxi", "taksi", "shuttle", "najem",
    "rent a car", "rent", "avtobus", "bus", "voznik", "driver", "transport",
    "transferji", "limuzin",
  ],
  // --- product ---
  food: [
    "hrana", "jed", "jedil", "čokolada", "prigrizek", "prigrizki", "moka",
    "kruh", "piškot", "piškoti", "dzem", "džem", "marmelada", "testenine",
    "pravi tartufi", "tartuf", "klobasa", "sir", "sirek", "food", "snack",
    "snacks", "chocolate", "bread", "cookie", "cookies", "jam", "pasta",
    "cheese", "delicacy", "delikates",
  ],
  wine: [
    "vino", "vina", "vinograd", "vinska", "vinski", "cviček", "rebula",
    "refosk", "penina", "šampus", "wine", "wines", "vineyard", "winery",
    "sparkling",
  ],
  honey: [
    "med", "čebel", "čebela", "panj", "panji", "propolis", "cvetni prah",
    "honey", "bee", "bees", "hive", "apiary", "honeycomb",
  ],
  oil: [
    "olje", "olja", "oljčn", "olivno", "bučno olje", "oil", "olive oil",
    "pumpkin seed oil",
  ],
  craft: [
    "ročno", "handmade", "craft", "obdelava lesa", "les", "lesena", "keramika",
    "lončar", "lončeni", "pleten", "vezenin", "vezenine", "tekstil", "steklo",
    "piščal", "filerca", "woodwork", "wooden", "ceramics", "pottery",
    "weaving", "embroidery", "textile", "glass",
  ],
  souvenir: [
    "spominek", "spominki", "spominsko", "darilo", "darila", "razglednica",
    "razglednice", "magnet", "izdelek z motiv", "souvenir", "souvenirs",
    "gift", "gifts", "postcard", "postcards", "keepsake",
  ],
  other: [],
  // --- experience ---
  tour: [
    "tura", "ture", "ogled", "ogledi", "voden", "vodeni", "exkurzija",
    "sprehod", "sprehodi", "tour", "tours", "guided", "sightseeing",
    "excursion", "walk", "walking", "day trip",
  ],
  workshop: [
    "delavnica", "delavnice", "tečaj", "tečaji", "učenje", "izdelava lastne",
    "izdelaj sam", "workshop", "workshops", "course", "class", "classes",
    "learn", "make your own",
  ],
  tasting: [
    "degustac", "degusta", "okuša", "okus", "kulinarična izkušnja", "branje",
    "vina na kozarce", "vino", "vinska", "vinski", "wine", "winery",
    "klet", "cellar", "tasting", "tastings", "taste", "sample", "sampl",
    "food pairing",
  ],
  outdoor: [
    "zunaj", "zunanj", "na prostem", "narava", "pohod", "pohodi", "gorsko",
    "planina", "gozd", "jezero", "reka", "outdoor", "nature", "hike",
    "hiking", "mountain", "alpine", "forest", "lake", "river",
  ],
  cultural: [
    "kulturn", "kultura", "muzej", "galerija", "zgodovin", "dediščin",
    "tradicijsk", "tradicion", "grad", "cerkev", "samostan", "etno",
    "cultural", "culture", "museum", "gallery", "history", "historical",
    "heritage", "traditional", "castle", "church", "monastery",
  ],
  adventure: [
    "avantura", "avanture", "adrenalin", "rafting", "kajak", "kayak", "kanu",
    "plezanje", "smučanje", "sankanje", "tubing", "zip line", "padalo",
    "paragliding", "spust", "downhill", "mtb", "canyoning", "adventure",
    "extreme",
  ],
  // wellness iz listinga velja tudi za izkušnje (isti slovar zgoraj)
};

// Atributi — SL + EN ključne besede
const ATTRIBUTE_KEYWORDS: Record<string, string[]> = {
  organic: ["bio", "biološko", "ekološk", "organik", "organic", "eko "],
  handmade: ["ročno", "ročna", "handmade", "hand-made", "pleten", "izdelano doma"],
  local: ["lokaln", "domač", "local", "domestic", "krajevn"],
  vegan: ["vegansk", "vegan", "rastlinski"],
  glutenFree: ["brez glutena", "gluten-free", "gluten free", "brezglutensk"],
  shippingFree: ["brezplačna dostava", "brezplačen prevoz", "free shipping", "dostava vključena"],
  familyFriendly: ["družin", "otrok", "otroci", "family", "kids", "children", "za družine"],
  petFriendly: ["pes", "psi", "ljubljenčk", "pet", "pets", "dog", "dogs", "psom prijazn"],
  parking: ["parkir", "parking", "parkirišče"],
  cardPayment: ["kartic", "kartice", "card payment", "plačilo s kartico", "kartično plačilo"],
  wifi: ["wifi", "wi-fi", "internet", "brezžičn"],
  indoor: ["notranj", "znotraj", "indoor", "v zaprtem"],
  outdoor: ["zunaj", "zunanj", "na prostem", "outdoor", "open air"],
  beginnerFriendly: ["začetn", "beginner", "enostavn", "ni treba izkušenj", "brez izkušenj"],
  equipment: ["oprema", "equipment", "plesar", "vreča", "čelada", "oglj", "smuči so vključene", "gear"],
};

// ============================================================================
// KUHINJSKA TAKSONOMIJA — ključne besede → kanonski SL žeton (tag)
// ============================================================================

const CUISINE_TAXONOMY: Array<{ token: string; keywords: string[] }> = [
  {
    token: "vino",
    keywords: ["vino", "vinograd", "vinska", "vinski", "winery", "wine", "penina", "cviček", "rebula", "refosk"],
  },
  {
    token: "pizza",
    keywords: ["pizza", "pizzeria", "piczerija", "margherita", "napolitana", "pica"],
  },
  {
    token: "italijanska-kuhinja",
    keywords: ["italijansk", "italijanska kuhinja", "italian", "trattoria", "pasta", "spageti", "ravioli"],
  },
  {
    token: "lokalna-kuhinja",
    keywords: ["lokalna kuhinja", "domača kuhinja", "tradicionaln", "slovenska kuhinja", "traditional", "local cuisine", "homemade food"],
  },
  {
    token: "veganska",
    keywords: ["vegan", "vegansk", "rastlinska"],
  },
  {
    token: "ribski-specialiteti",
    keywords: ["ribe", "ribu", "fish", "morski sadeži", "seafood"],
  },
  {
    token: "mesni-specialiteti",
    keywords: ["meso", "mesn", "žar", "grill", "steak", "zrezek", "burger"],
  },
  {
    token: "slaščice",
    keywords: ["slaščic", "desert", "torta", "kremšnita", "palačinke", "dessert", "pastry", "cake"],
  },
  {
    token: "sirevi",
    keywords: ["sir ", "sirek", "sirni", "cheese", "sirni vzorci", "tolminc"],
  },
];

// ============================================================================
// TAKSONOMIJA AKTIVNOSTI — ključne besede → kanonski SL žeton (tag)
// ============================================================================

const ACTIVITY_TAXONOMY: Array<{ token: string; keywords: string[] }> = [
  {
    token: "pohodnistvo",
    keywords: ["pohod", "pohodi", "pohodništvo", "hiking", "hike", "trail", "planina", "gora", "trek", "sprehod", "walk", "walking"],
  },
  {
    token: "smucanje",
    keywords: ["smuči", "smuča", "smučanje", "ski", "skiing", "sankanje", "snowboard", "zimske"],
  },
  {
    token: "kajak",
    keywords: ["kajak", "kayak", "kanu", "canoe", "sup", "vesl"],
  },
  {
    token: "rafting",
    keywords: ["rafting", "raft", "hidro speed", "hidrospeed"],
  },
  {
    token: "kolesarstvo",
    keywords: ["kolo", "kolesar", "kolesa", "bike", "cycling", "biking", "mtb", "bicikl"],
  },
  {
    token: "plezanje",
    keywords: ["plezanje", "plezal", "climbing", "climb", "via ferrata", "zip line", "adrenalin park"],
  },
  {
    token: "degustacija",
    keywords: ["degustac", "tasting", "okuša", "okus", "branje vin"],
  },
  {
    token: "vodne-aktivnosti",
    keywords: ["plavanje", "swimming", "vožnja s čolnom", "pletna", "boat", "ladja", "splavarjenje"],
  },
  {
    token: "wellness",
    keywords: ["wellness", "sauna", "savna", "masaža", "massage", "spa", "vrelci", "thermal"],
  },
  {
    token: "kulturni-ogledi",
    keywords: ["muzej", "museum", "galerija", "gallery", "grad", "castle", "cerkev", "church", "zgodovin", "history", "ogled znamenitosti"],
  },
];

/** Prešteje zadetke ključnih besed v besedilu (malene črke). */
function countKeywordHits(text: string, keywords: string[]): number {
  return keywords.reduce((n, kw) => n + (kw.length > 0 && text.includes(kw) ? 1 : 0), 0);
}

/**
 * DETERMINISTIČNI MOTOR — klasifikacija iz slovarjev taksonomije.
 * Izvožen za teste (source-contract + fixture dokazi Issue #9).
 *
 * Zaupanje iz moči ujemanja:
 *  - 0 zadetkov kategorije → "low" (+ poštena privzeta kategorija = 1. iz enuma)
 *  - 1–2 zadetki            → "medium"
 *  - ≥3 zadetki             → "high"
 */
export function suggestTags(body: AutoTagRequest): AutoTagResult {
  const validCats = VALID_CATEGORIES[body.type] ?? [];
  const validAttrs = VALID_ATTRIBUTES[body.type] ?? [];
  const text = `${body.name} ${body.description}`.toLowerCase();

  // --- 1. Kategorija: točkovno po slovarju (zmagovalna = največ zadetkov) ---
  let bestCat = validCats[0];
  let bestCatHits = 0;
  for (const cat of validCats) {
    const hits = countKeywordHits(text, CATEGORY_KEYWORDS[cat] ?? []);
    if (hits > bestCatHits) {
      bestCat = cat;
      bestCatHits = hits;
    }
  }
  // izenačeni zmagovalci → prvi v enum vrstnem redu (deterministično)
  const category = bestCat;

  // --- 2. Atributi: samo iz veljavnega enuma ---
  const attributes: Record<string, boolean> = {};
  let attrHits = 0;
  for (const attr of validAttrs) {
    const hit = countKeywordHits(text, ATTRIBUTE_KEYWORDS[attr] ?? []) > 0;
    attributes[attr] = hit;
    if (hit) attrHits += 1;
  }

  // --- 3. Tagi: kanonski žetoni taksonomije (kuhinja + aktivnosti) +
  //     značilne besede lastnikovega besedila ---
  const taxonomyTokens: string[] = [];
  for (const { token, keywords } of [...CUISINE_TAXONOMY, ...ACTIVITY_TAXONOMY]) {
    if (countKeywordHits(text, keywords) > 0 && !taxonomyTokens.includes(token)) {
      taxonomyTokens.push(token);
    }
  }

  const words = text
    .split(/[^a-zčšž0-9]+/i)
    .map((w) => w.trim())
    .filter((w) => w.length > 4);
  const distinctive = Array.from(new Set(words));

  const tags = Array.from(new Set([...taxonomyTokens, ...distinctive])).slice(0, 5);

  // --- 4. Zaupanje iz moči ujemanja (kategorija + atributi + taksonomija) ---
  const strongHits = bestCatHits + attrHits + taxonomyTokens.length;
  const confidence: AutoTagResult["confidence"] =
    bestCatHits === 0
      ? "low" // ni ujemanja → poštena privzeta kategorija, nizko zaupanje
      : strongHits >= 3
        ? "high"
        : "medium";

  return {
    category,
    attributes,
    tags,
    confidence,
    source: "deterministic",
  };
}

