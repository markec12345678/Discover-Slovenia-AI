// ============================================================================
// DETERMINISTIC SEARCH — iskalnik po ključnih besedah, vzdevkih, kategorijah
// in namenskih razširitvah (Issue #9 / ZERO-AI, skupina A)
// ============================================================================
// NAMEN: /api/smart-search ne potrebuje več LLM razumevanja namena — ta
// ČISTI modul (0 omrežja, 0 baze, 0 AI) ujema naravnojezikovne poizvedbe
// (SL + EN) proti ISTEM vrsticam, ki jih ruta že pridobi iz baze, plus
// statičnim DESTINATIONS. Vzorčene poizvedbe:
//   - "kaj pojesti na bledu"   → food kategorija + destinacija Bled
//   - "hiking near bohinj"     → hiking kategorija + destinacija Bohinj
//   - "ljubljna"               → tipkarska napaka → Ljubljana (Levenshtein ≤ 2)
//   - "vinska degustacija"     → wine kategorija (sinonimi/vzdevki)
//
// ČISTOST: modul NE uvaža db/ai-client in NE kliče omrežja — vsi podatki
// pridejo prek argumentov (destinacije iz statičnega slovenia-data), zato
// je popolnoma unit-testljiv in determinističen (isti vhod → isti izhod).
//
// IZHOD: isti per-kategorija izpis kot prejšnja pot rute (destinations z
// id/slug/name/tagline/reason, listings/products/experiences z
// id/name/category/reason) — ruta samo doda summary + source in prilepi
// kanonski slug (destSlugById).
// ============================================================================

import { DESTINATIONS } from "@/lib/slovenia-data";
import type { Destination } from "@/lib/types";

// ─── Vhodne vrstice (podmnožice polj, ki jih /api/smart-search pridobi) ────

export interface SearchListingRow {
  id: string;
  name: string;
  category: string | null;
  destinationName?: string | null;
  description?: string | null;
  rating?: number | null;
  priceRange?: string | null;
}

export interface SearchProductRow {
  id: string;
  name: string;
  category: string | null;
  destinationName?: string | null;
  description?: string | null;
  price?: number | null;
  rating?: number | null;
}

export interface SearchExperienceRow {
  id: string;
  name: string;
  category: string | null;
  destinationName?: string | null;
  description?: string | null;
  pricePerPerson?: number | null;
  rating?: number | null;
}

export interface DeterministicSearchDatasets {
  listings: SearchListingRow[];
  products: SearchProductRow[];
  experiences: SearchExperienceRow[];
}

// ─── Izhod (ista oblika kot prejšnji odgovor rute) ─────────────────────────

export interface SearchDestinationItem {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  reason: string;
}

export interface SearchRowItem {
  id: string;
  name: string;
  category: string;
  reason: string;
}

export interface DeterministicSearchResult {
  destinations: SearchDestinationItem[];
  listings: SearchRowItem[];
  products: SearchRowItem[];
  experiences: SearchRowItem[];
}

// ─── 1. NORMALIZACIJA — mala tiskana črka + slovensko diakritično zlaganje ─

/**
 * Lowercase + zlaganje diakritik (č→c, š→s, ž→z, ć→c, đ→d + vse
 * kombinirane ostre/grave/karon oznake) — "Črn Kal" in "crn kal" se
 * ujemata, "požrešno" išče enako kot "pozresno" (tipkarsko brez strešice).
 */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[čć]/g, "c")
    .replace(/š/g, "s")
    .replace(/ž/g, "z")
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// ─── 2. TOKENIZACIJA + SL/EN STOPBESEDE ────────────────────────────────────

const STOPWORDS = new Set([
  // SL (naloga #9: v, na, za, je, in, kaj, kje, kako, do, iz, pri, ob, z, s)
  "v", "na", "za", "je", "in", "kaj", "kje", "kako", "do", "iz", "pri", "ob", "z", "s",
  // EN (naloga #9: in, at, for, the, a, to, of, near, what, where)
  "at", "for", "the", "a", "to", "of", "near", "what", "where",
]);

/** Razbij niz na iskalne žetone (≥ 2 znaka, brez stopbesed). */
export function tokenize(query: string): string[] {
  return normalize(query)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

// ─── 3. SINONIMNI SLOVAR → kanonske kategorije (SL + EN) ───────────────────

/**
 * Vzdevki poizvedbe → kanonska kategorija. Ujemanje žetona z vzdevkom
 * (token ~ alias): enako, predpona v eno ali drugo smer (≥ 4 znaki),
 * vsebovanost (alias ≥ 5 znakov — pokriva sklanjatve tipa "pojesti" ⊃
 * "jesti", "restavracije" ⊃ "restavracija").
 */
const CATEGORY_ALIASES: Record<string, string[]> = {
  food: [
    "hrana", "jedi", "jesti", "kulinarika", "restavracija", "gostilna", "kuhinja",
    "večerja", "kosilo", "zajtrk", "pica", "burger",
    "food", "eat", "restaurant", "cuisine", "dinner", "lunch", "breakfast",
  ],
  wine: [
    "vino", "vina", "vinu", "vinska", "vinski", "vinske", "degustacija", "vinoteka",
    "wine", "tasting", "winery", "cellar",
  ],
  hiking: [
    "pohod", "pohodi", "pohodništvo", "tura", "ture", "izlet", "sprehod", "gora", "gore",
    "hiking", "hike", "walk", "mountain", "trekking", "trail",
  ],
  culture: [
    "muzej", "muzeji", "galerija", "kultura", "zgodovina", "spomenik", "grad", "cerkev",
    "umetnost", "dediscina",
    "museum", "gallery", "culture", "history", "monument", "castle", "church", "art", "heritage",
  ],
  wellness: [
    "wellness", "sauna", "savna", "terme", "kopališče", "masaža",
    "spa", "massage", "pool",
  ],
  water: [
    "kajak", "rafting", "sup", "kanu", "čoln", "splav", "jadranje", "veslanje",
    "kayak", "canoe", "boat", "sailing", "raft",
  ],
  ski: ["smuči", "smučanje", "sankanje", "ski", "smuci", "snowboard"],
  accommodation: [
    "nočitev", "nastanitev", "hotel", "hostel", "apartma", "sobe", "spanje",
    "bed", "sleep", "stay", "rooms",
  ],
  nature: [
    "narava", "jezero", "jezeru", "reka", "reki", "reke", "gora", "gori", "gozd",
    "slap", "jama", "park", "morje", "morju", "obala", "plaža",
    "nature", "lake", "river", "forest", "waterfall", "cave", "beach", "sea",
  ],
  family: [
    "družina", "družine", "otroci", "otrok", "otroško",
    "family", "kids", "children", "playground",
  ],
};

/**
 * Kanonska kategorija → ključne besede v POLJU "category" vrstice (baza) oz.
 * activities/bestFor/type destinacije. Besedno ujemanje (ne surova
 * vsebovanost — "sup" se ne pogne v "support"): žeton polja == ključna
 * beseda, ali predpona (ključna beseda ≥ 4 znake).
 */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  food: ["food", "restaurant", "gastro", "hrana", "jedi", "kulinarika", "gostilna", "picerija", "kava", "cafe", "bar", "kuhinja"],
  wine: ["wine", "vino", "degustacija", "tasting", "vinoteka", "cellar"],
  hiking: ["hiking", "pohod", "pohodnistvo", "mountain", "gorska", "trekking", "planina", "trail", "sprehod"],
  culture: ["museum", "muzej", "kultura", "culture", "history", "zgodovina", "galerija", "gallery", "heritage", "spomenik", "grad", "castle", "cerkev", "church", "umetnost", "art"],
  wellness: ["wellness", "spa", "terme", "sauna", "kopalisce", "massage", "masaza"],
  water: ["kajak", "rafting", "sup", "kanu", "canoe", "boat", "jadranje", "sailing", "veslanje"],
  ski: ["ski", "smuci", "smucanje", "snowboard", "sankanje", "zimski"],
  accommodation: ["hotel", "accommodation", "nastanitev", "hostel", "apartma", "stay", "rooms", "sobe", "bed"],
  nature: ["nature", "narava", "lake", "jezero", "river", "reka", "park", "gozd", "forest", "slap", "waterfall", "jama", "cave", "plaza", "beach", "morje", "sea"],
  family: ["family", "druzina", "kids", "otroci", "playground"],
};

/** Kanon kategorije za en žeton poizvedbe (null, če ni vzdevka). */
function canonicalCategoryOf(token: string): string | null {
  for (const [category, aliases] of Object.entries(CATEGORY_ALIASES)) {
    for (const alias of aliases) {
      const a = normalize(alias);
      if (token === a) return category;
      if (a.length >= 4 && token.startsWith(a)) return category;
      if (token.length >= 4 && a.startsWith(token)) return category;
      if (a.length >= 5 && token.includes(a)) return category;
    }
  }
  return null;
}

// ─── 4. FUZZY UJEMANJE ŽETONOV (predpona + Levenshtein) ────────────────────

/** Levenshteinova razdalja (klasična DP matrika, O(len·len)). */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = curr;
  }
  return prev[b.length];
}

type MatchKind = "exact" | "prefix" | "fuzzy";

/**
 * Ujemanje žetona poizvedbe z žetonom korpusa:
 *  - exact: enaka beseda (utež 1);
 *  - prefix: ena je predpona druge (≥ 3 znaki — pokriva sklanjatve
 *    "bledu"/"bled", "muzeji"/"muzej"; utež 0.8);
 *  - fuzzy: Levenshtein (utež 0.6) — ≥ 5 znakov, enaka prva črka,
 *    razlika dolžin ≤ 1 in razdalja ≤ 2 za žetone ≥ 8 znakov /
 *    ≤ 1 za krajše (5–7). Tri varovalke proti lažnim zadetkom:
 *    "ljubljna" → "ljubljana" (tipkarska napaka, dist 1) se ujame,
 *    "piran" ↛ "Tirana" (različna prva črka) in "pojesti" ↛ "poleti"
 *    (dist 2 na 6–7 znakih) pa NE.
 */
function tokenMatch(queryToken: string, corpusToken: string): MatchKind | null {
  if (queryToken === corpusToken) return "exact";
  const shorter = Math.min(queryToken.length, corpusToken.length);
  if (
    shorter >= 3 &&
    (queryToken.startsWith(corpusToken) || corpusToken.startsWith(queryToken))
  ) {
    return "prefix";
  }
  if (queryToken.length >= 5 && corpusToken.length >= 5) {
    const longer = Math.max(queryToken.length, corpusToken.length);
    const maxDistance = longer >= 8 ? 2 : 1;
    if (
      queryToken[0] === corpusToken[0] &&
      Math.abs(queryToken.length - corpusToken.length) <= 1 &&
      levenshtein(queryToken, corpusToken) <= maxDistance
    ) {
      return "fuzzy";
    }
  }
  return null;
}

const MATCH_WEIGHT: Record<MatchKind, number> = { exact: 1, prefix: 0.8, fuzzy: 0.6 };

/** Uteženi zadetek žetona poizvedbe v žetonih polja (najboljši zadetek). */
function bestTokenHit(queryToken: string, fieldTokens: string[]): MatchKind | null {
  let best: MatchKind | null = null;
  for (const t of fieldTokens) {
    const m = tokenMatch(queryToken, t);
    if (m === "exact") return "exact";
    if (m && (best === null || MATCH_WEIGHT[m] > MATCH_WEIGHT[best])) best = m;
  }
  return best;
}

// ─── 5. DESTINACIJSKI VZDEVKI (ob pridevnike + očitni alternativi) ─────────

/** Ročni vzdevki za nepravilne slovenske pridevnike (bled → blejski …). */
const DESTINATION_EXTRA_ALIASES: Record<string, string[]> = {
  bled: ["blejski", "blejska", "blejsko", "blejskega", "kremšnita"],
  ljubljana: ["ljubljanski", "ljubljanska", "ljubljansko", "ljubljanskih"],
  bohinj: ["bohinjski", "bohinjska", "bohinjsko", "vogel"],
  piran: ["piranski", "piranska", "piransko", "piranskih"],
  postojna: ["postojnska", "postojnski", "postojnsko"],
};

interface DestIndexEntry {
  dest: Destination;
  /** Žetoni imena + vzdevkov (za ujemanje destinacijskih omemba). */
  nameTokens: string[];
}

const DEST_INDEX: DestIndexEntry[] = DESTINATIONS.map((dest) => ({
  dest,
  nameTokens: [
    ...normalize(dest.name).split(/[^a-z0-9]+/).filter(Boolean),
    ...(DESTINATION_EXTRA_ALIASES[dest.id] ?? []).map(normalize),
  ],
}));

// ─── 6. TOČKOVANJE ─────────────────────────────────────────────────────────

/** Uteži polj (naloga #9: ime ×3, tagline ×2, opis ×1; kategorija ×2). */
const WEIGHTS = { name: 3, tagline: 2, description: 1, category: 2 } as const;

/** Točke + zadeti žetoni za ujemanje žetonov poizvedbe v polju z utežjo. */
function fieldMatch(
  queryTokens: string[],
  fieldText: string,
  weight: number
): { score: number; matched: string[] } {
  const fieldTokens = normalize(fieldText).split(/[^a-z0-9]+/).filter(Boolean);
  let score = 0;
  const matched: string[] = [];
  for (const qt of queryTokens) {
    const hit = bestTokenHit(qt, fieldTokens);
    if (hit) {
      score += weight * MATCH_WEIGHT[hit];
      matched.push(qt);
    }
  }
  return { score, matched };
}

/** Ali besedilo (kategorija/aktivnosti/bestFor/type) nosi kanon kategorije. */
function textHasCategory(text: string, category: string): boolean {
  const keywords = CATEGORY_KEYWORDS[category];
  if (!keywords) return false;
  const tokens = normalize(text).split(/[^a-z0-9]+/).filter(Boolean);
  return keywords.some((kw) =>
    tokens.some((t) => t === normalize(kw) || (kw.length >= 4 && t.startsWith(normalize(kw))))
  );
}

/** Kanoni kategorij poizvedbe (iz vsakega žetona največ en). */
function queryCategories(queryTokens: string[]): string[] {
  const cats: string[] = [];
  for (const qt of queryTokens) {
    const cat = canonicalCategoryOf(qt);
    if (cat && !cats.includes(cat)) cats.push(cat);
  }
  return cats;
}

/** Utežena ocena (0–5 zvezdic → 0–0.5 točke točkovanja; null = 0). */
function ratingScore(rating: number | null | undefined): number {
  return typeof rating === "number" && rating > 0 ? rating / 10 : 0;
}

interface ScoredDest {
  dest: Destination;
  score: number;
  matchedTokens: string[];
  matchedCategories: string[];
}

function scoreDestinations(queryTokens: string[], categories: string[]): ScoredDest[] {
  const out: ScoredDest[] = [];
  for (const { dest, nameTokens } of DEST_INDEX) {
    let score = 0;
    const matchedTokens: string[] = [];
    let exactNameBonus = 0;

    for (const qt of queryTokens) {
      // Ime (+ vzdevki) — utež ×3 + exact/prefix dodatek.
      const hit = bestTokenHit(qt, nameTokens);
      if (hit) {
        score += WEIGHTS.name * MATCH_WEIGHT[hit];
        matchedTokens.push(qt);
        if (hit === "exact") exactNameBonus += 2;
        else if (hit === "prefix") exactNameBonus += 1;
      }
    }

    // Besedilna polja (tagline ×2, opis ×1, activities/bestFor ×2).
    const fields: Array<[string, number]> = [
      [dest.tagline, WEIGHTS.tagline],
      [dest.description, WEIGHTS.description],
      [dest.activities.join(" "), WEIGHTS.tagline],
      [dest.bestFor.join(" "), WEIGHTS.tagline],
    ];
    for (const [text, weight] of fields) {
      const { score: s, matched } = fieldMatch(queryTokens, text, weight);
      score += s;
      for (const qt of matched) {
        if (!matchedTokens.includes(qt)) matchedTokens.push(qt);
      }
    }

    // Kategorija poizvedbe ×2 proti activities/bestFor/type.
    const matchedCategories: string[] = [];
    const categoryText = `${dest.activities.join(" ")} ${dest.bestFor.join(" ")} ${dest.type}`;
    for (const cat of categories) {
      if (textHasCategory(categoryText, cat)) {
        score += 2;
        matchedCategories.push(cat);
      }
    }

    score += exactNameBonus;
    if (score > 0) {
      out.push({ dest, score, matchedTokens, matchedCategories });
    }
  }
  return out;
}

interface ScoredRow {
  id: string;
  name: string;
  category: string;
  score: number;
  rating: number | null;
  matchedTokens: string[];
  matchedCategories: string[];
}

interface RowInput {
  id: string;
  name: string;
  category: string | null;
  destinationName?: string | null;
  description?: string | null;
  rating?: number | null;
}

function scoreRows(
  rows: RowInput[],
  queryTokens: string[],
  categories: string[]
): ScoredRow[] {
  const destTokensByPlace = (place: string | null | undefined): string[] =>
    place ? normalize(place).split(/[^a-z0-9]+/).filter(Boolean) : [];

  const out: ScoredRow[] = [];
  for (const row of rows) {
    let score = 0;
    const matchedTokens: string[] = [];
    const matchedCategories: string[] = [];

    for (const qt of queryTokens) {
      // Ime ×3.
      const nameHit = bestTokenHit(qt, normalize(row.name).split(/[^a-z0-9]+/).filter(Boolean));
      if (nameHit) {
        score += WEIGHTS.name * MATCH_WEIGHT[nameHit];
        matchedTokens.push(qt);
      }
      // Destinacija vrstice ×2 ("na bledu" dvigne blejske vrstice).
      const destHit = bestTokenHit(qt, destTokensByPlace(row.destinationName));
      if (destHit) {
        score += 2 * MATCH_WEIGHT[destHit];
        if (!matchedTokens.includes(qt)) matchedTokens.push(qt);
      }
      // Kategorija vrstice ×2 (neposredno polje).
      const catHit = bestTokenHit(
        qt,
        normalize(row.category ?? "").split(/[^a-z0-9]+/).filter(Boolean)
      );
      if (catHit) {
        score += WEIGHTS.category * MATCH_WEIGHT[catHit];
        if (!matchedTokens.includes(qt)) matchedTokens.push(qt);
      }
      // Opis ×1.
      const descHit = bestTokenHit(
        qt,
        normalize(row.description ?? "").split(/[^a-z0-9]+/).filter(Boolean)
      );
      if (descHit) {
        score += WEIGHTS.description * MATCH_WEIGHT[descHit];
        if (!matchedTokens.includes(qt)) matchedTokens.push(qt);
      }
    }

    // Kanonska kategorija poizvedbe ×2 proti polju category (npr. "muzeji"
    // → culture → vrstica s kategorijo "museum").
    const rowCategory = row.category ?? "";
    for (const cat of categories) {
      if (textHasCategory(rowCategory, cat)) {
        score += 2;
        matchedCategories.push(cat);
      }
    }

    if (score > 0) {
      out.push({
        id: row.id,
        name: row.name,
        category: rowCategory,
        score,
        rating: typeof row.rating === "number" ? row.rating : null,
        matchedTokens,
        matchedCategories,
      });
    }
  }
  return out;
}

// ─── 7. RAZVRŠČANJE (deterministično) + RAZLOG ─────────────────────────────

/** Score desc → rating desc → ime asc (popoln vrstni red = stabilen izhod). */
function deterministicSort<T extends { score: number; rating: number | null; name: string }>(
  items: T[]
): T[] {
  return [...items].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const rDiff = (b.rating ?? 0) - (a.rating ?? 0);
    if (rDiff !== 0) return rDiff;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
}

/** Pošten determinističen razlog zadetka (iz DEJANSKIH signalov ujemanja).
 *  ISSUE #12 (F12-3, §13): razlog je UPORABNIŠKI tekst → dvojezičen
 *  (prej seveda SL tudi na /en — kategorije v razlogu so kanonski
 *  identifikatorji (food/wine/hiking …) in ostanejo jezikovno nevtralni). */
function buildReason(
  matchedTokens: string[],
  matchedCategories: string[],
  locale: "sl" | "en" = "sl"
): string {
  const parts: string[] = [];
  if (matchedTokens.length > 0) {
    parts.push(
      `${locale === "en" ? "keywords" : "ključne besede"}: ${matchedTokens.slice(0, 4).join(", ")}`
    );
  }
  if (matchedCategories.length > 0) {
    parts.push(
      `${locale === "en" ? "category" : "kategorija"}: ${matchedCategories.slice(0, 3).join(", ")}`
    );
  }
  return parts.length > 0
    ? locale === "en"
      ? `Matches your search (${parts.join(" · ")})`
      : `Ujema se z iskalnim nizom (${parts.join(" · ")})`
    : locale === "en"
      ? "Matches your search"
      : "Ujema se z iskalnim nizom";
}

// ─── 8. GLAVNA FUNKCIJA ────────────────────────────────────────────────────

/**
 * Deterministično iskanje po naravnem jeziku (SL + EN).
 *
 * @param query    iskalni niz uporabnika (npr. "kaj pojesti na bledu")
 * @param datasets vrstice iz baze (iste, ki jih ruta pridobi) — listings,
 *                 products, experiences
 * @param limit    maksimalno število zadetkov na kategorijo (1–5)
 * @param locale   jezik razlogov (issue #12 F12-3: "en" → EN razlogi;
 *                 privzeto "sl" — nazaj kompatibilno s 3-arg klici)
 * @returns        per-kategorija seznami (destinacije vedno iz statičnih
 *                 DESTINATIONS; prazne mreže → prazni seznami)
 */
export function deterministicSearch(
  query: string,
  datasets: DeterministicSearchDatasets,
  limit: number,
  locale: "sl" | "en" = "sl"
): DeterministicSearchResult {
  const safeLimit = Math.min(Math.max(Math.floor(limit) || 3, 1), 5);
  const queryTokens = tokenize(query);

  // Prazna/kratka/samo-stopbesedna poizvedba → nič zadetkov (iskreno).
  if (queryTokens.length === 0) {
    return { destinations: [], listings: [], products: [], experiences: [] };
  }

  const categories = queryCategories(queryTokens);

  // Destinacije (statični kanonični podatki + vzdevki).
  const scoredDests = deterministicSort(
    scoreDestinations(queryTokens, categories).map((d) => ({
      ...d,
      rating: d.dest.rating,
      name: d.dest.name,
    }))
  );

  // Vrstice iz baze.
  const scoredListings = deterministicSort(
    scoreRows(datasets.listings, queryTokens, categories)
  );
  const scoredProducts = deterministicSort(
    scoreRows(datasets.products, queryTokens, categories)
  );
  const scoredExperiences = deterministicSort(
    scoreRows(datasets.experiences, queryTokens, categories)
  );

  return {
    destinations: scoredDests.slice(0, safeLimit).map((d) => ({
      id: d.dest.id,
      // Kanonski slug za navigacijo /destinacija/[slug] (ruta ga še enkrat
      // prilepi prek destSlugById — pogodba iz issue5-t5b ostaja).
      slug: d.dest.slug,
      name: d.dest.name,
      tagline: d.dest.tagline,
      reason: buildReason(d.matchedTokens, d.matchedCategories, locale),
    })),
    listings: scoredListings.slice(0, safeLimit).map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      reason: buildReason(r.matchedTokens, r.matchedCategories, locale),
    })),
    products: scoredProducts.slice(0, safeLimit).map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      reason: buildReason(r.matchedTokens, r.matchedCategories, locale),
    })),
    experiences: scoredExperiences.slice(0, safeLimit).map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      reason: buildReason(r.matchedTokens, r.matchedCategories, locale),
    })),
  };
}
