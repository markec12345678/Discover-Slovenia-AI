/**
 * AI Priporočila za tržnico (izdelki + izkušnje)
 *
 * Uporablja GLM (preko Puter API / z-ai-web-dev-sdk) za kontekstualno
 * priporočanje podobnih izdelkov/izkušenj.
 *
 * Strategija:
 * 1. Preveri filesystem cache (data/ai-rec-cache.json) — 24-urni TTL
 * 2. Če cache veljaven → vrni cached rezultat (0 AI stroškov)
 * 3. Če cache manjka/ potekel → pridobi 10 SQL kandidatov, GLM izbere 4
 * 4. Če AI odpove → fallback na SQL top-4 (vedno vrne rezultat)
 *
 * Cache key: `product:{id}` ali `experience:{id}`
 */

import { promises as fs } from "fs";
import path from "path";
import { db } from "@/lib/db";
import { generateCompletion } from "@/lib/ai-client";

// ============================================================================
// TIPI
// ============================================================================

export type RecommendationType = "product" | "experience";

interface CacheEntry {
  cachedAt: number; // epoch ms
  itemIds: string[]; // IDs priporočenih itemov (v vrstnem redu)
  source: "ai" | "fallback";
}

type CacheStore = Record<string, CacheEntry>;

// ============================================================================
// KONFIGURACIJA
// ============================================================================

const CACHE_FILE = path.join(process.cwd(), "data", "ai-rec-cache.json");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 ur
const CANDIDATE_POOL = 10; // AI izbira iz 10 kandidatov
const DEFAULT_LIMIT = 4;

// ============================================================================
// CACHE HELPERS
// ============================================================================

async function readCache(): Promise<CacheStore> {
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

async function writeCache(store: CacheStore): Promise<void> {
  try {
    await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(store, null, 2), "utf-8");
  } catch (error) {
    console.error("[ai-rec] writeCache napaka:", error);
  }
}

function isFresh(entry: CacheEntry): boolean {
  return Date.now() - entry.cachedAt < CACHE_TTL_MS;
}

// ============================================================================
// KANDIDATI IZ BAZE
// ============================================================================

interface ProductCandidate {
  id: string;
  name: string;
  description: string;
  category: string;
  destinationName: string | null;
  price: number;
  organic: boolean;
  handmade: boolean;
  local: boolean;
  vegan: boolean;
  rating: number;
}

interface ExperienceCandidate {
  id: string;
  name: string;
  description: string;
  category: string;
  destinationName: string | null;
  pricePerPerson: number;
  durationHours: number;
  familyFriendly: boolean;
  rating: number;
}

async function fetchProductCandidates(currentId: string): Promise<{
  current: ProductCandidate | null;
  candidates: ProductCandidate[];
}> {
  const current = await db.product.findUnique({
    where: { id: currentId },
    select: {
      id: true, name: true, description: true, category: true,
      destinationName: true, price: true, organic: true, handmade: true,
      local: true, vegan: true, rating: true, destinationId: true,
    },
  });

  if (!current) return { current: null, candidates: [] };

  // Pridobi širši nabor kandidatov (ista kategorija ALI ista destinacija)
  const orClauses: Record<string, unknown>[] = [];
  if (current.category) orClauses.push({ category: current.category });
  if (current.destinationId) orClauses.push({ destinationId: current.destinationId });

  const rows = await db.product.findMany({
    where: {
      id: { not: current.id },
      status: "published",
      ...(orClauses.length > 0 ? { OR: orClauses } : {}),
    },
    orderBy: [{ featured: "desc" }, { rating: "desc" }, { reviewCount: "desc" }],
    take: CANDIDATE_POOL,
    select: {
      id: true, name: true, description: true, category: true,
      destinationName: true, price: true, organic: true, handmade: true,
      local: true, vegan: true, rating: true,
    },
  });

  return {
    current: {
      ...current,
      destinationName: current.destinationName ?? null,
    },
    candidates: rows.map((r) => ({ ...r, destinationName: r.destinationName ?? null })),
  };
}

async function fetchExperienceCandidates(currentId: string): Promise<{
  current: ExperienceCandidate | null;
  candidates: ExperienceCandidate[];
}> {
  const current = await db.experience.findUnique({
    where: { id: currentId },
    select: {
      id: true, name: true, description: true, category: true,
      destinationName: true, pricePerPerson: true, durationHours: true,
      familyFriendly: true, rating: true, destinationId: true,
    },
  });

  if (!current) return { current: null, candidates: [] };

  const orClauses: Record<string, unknown>[] = [];
  if (current.category) orClauses.push({ category: current.category });
  if (current.destinationId) orClauses.push({ destinationId: current.destinationId });

  const rows = await db.experience.findMany({
    where: {
      id: { not: current.id },
      status: "published",
      ...(orClauses.length > 0 ? { OR: orClauses } : {}),
    },
    orderBy: [{ featured: "desc" }, { rating: "desc" }, { reviewCount: "desc" }],
    take: CANDIDATE_POOL,
    select: {
      id: true, name: true, description: true, category: true,
      destinationName: true, pricePerPerson: true, durationHours: true,
      familyFriendly: true, rating: true,
    },
  });

  return {
    current: {
      ...current,
      destinationName: current.destinationName ?? null,
    },
    candidates: rows.map((r) => ({ ...r, destinationName: r.destinationName ?? null })),
  };
}

// ============================================================================
// AI PROMPT BUILDER
// ============================================================================

function buildProductPrompt(current: ProductCandidate, candidates: ProductCandidate[]): string {
  const currentDesc = `TRENUTNI IZDELEK:
- Naslov: ${current.name}
- Opis: ${current.description}
- Kategorija: ${current.category}
- Regija: ${current.destinationName ?? "ni znana"}
- Cena: €${current.price}
- Atributi: ${[current.organic && "bio", current.handmade && "ročno izdelano", current.local && "lokalno", current.vegan && "vegansko"].filter(Boolean).join(", ") || "brez"}
- Ocena: ${current.rating}/5`;

  const candidatesDesc = candidates
    .map((c, i) => `  [${i}] ${c.name} — ${c.description.substring(0, 100)} (kategorija: ${c.category}, regija: ${c.destinationName ?? "neznana"}, cena: €${c.price}, ocena: ${c.rating})`)
    .join("\n");

  return `Si strokovnjak za slovenske lokalne izdelke in kulinariko. Uporabnik gleda izdelek in mu želimo priporočiti 4 NAJBOLJ PODOBNE ali COMPLEMENTARY izdelke iz spodnjega seznama.

${currentDesc}

KANDIDATI (izberi 4):
${candidatesDesc}

Pravila:
1. Izberi 4 izdelke ki so najbolj smiselni za uporabnika ki gleda trenutni izdelek
2. Prioritiziraj: podobna kategorija, complementary uporaba (npr. vino + olje), ista regija, podobna cena
3. Izogibaj se duplikatom (ne izberi istega izdelka dvakrat)
4. Vrni SAMO JSON array z indeksi kandidatov v vrstnem redu pomembnosti, npr. [3, 1, 7, 5]

Odgovor (SAMO JSON array, brez dodatnega besedila):`;
}

function buildExperiencePrompt(current: ExperienceCandidate, candidates: ExperienceCandidate[]): string {
  const currentDesc = `TRENUTNA IZKUŠNJA:
- Naslov: ${current.name}
- Opis: ${current.description}
- Kategorija: ${current.category}
- Regija: ${current.destinationName ?? "ni znana"}
- Cena: €${current.pricePerPerson}/osebo
- Trajanje: ${current.durationHours}h
- Za družine: ${current.familyFriendly ? "da" : "ne"}
- Ocena: ${current.rating}/5`;

  const candidatesDesc = candidates
    .map((c, i) => `  [${i}] ${c.name} — ${c.description.substring(0, 100)} (kategorija: ${c.category}, regija: ${c.destinationName ?? "neznana"}, cena: €${c.pricePerPerson}, trajanje: ${c.durationHours}h, ocena: ${c.rating})`)
    .join("\n");

  return `Si strokovnjak za turizem in aktivnosti v Sloveniji. Uporabnik gleda izkušnjo in mu želimo priporočiti 4 NAJBOLJ PODOBNE ali COMPLEMENTARY izkušnje iz spodnjega seznama.

${currentDesc}

KANDIDATI (izberi 4):
${candidatesDesc}

Pravila:
1. Izberi 4 izkušnje ki so najbolj smiselne za uporabnika ki gleda trenutno izkušnjo
2. Prioritiziraj: podobna kategorija, complementary aktivnosti (npr. rafting + pohod), ista regija, podobna težavnost
3. Izogibaj se duplikatom
4. Vrni SAMO JSON array z indeksi kandidatov v vrstnem redu pomembnosti, npr. [2, 5, 0, 8]

Odgovor (SAMO JSON array, brez dodatnega besedila):`;
}

// ============================================================================
// AI KLIC + PARSING
// ============================================================================

function parseIndices(content: string, max: number): number[] | null {
  if (!content) return null;
  // Poišči JSON array v odgovoru
  const match = content.match(/\[[\s\S]*?\]/);
  if (!match) return null;
  try {
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr)) return null;
    const valid = arr
      .filter((n) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n < max)
      .slice(0, 4);
    return valid.length > 0 ? valid : null;
  } catch {
    return null;
  }
}

async function selectWithAI(
  type: RecommendationType,
  currentId: string
): Promise<{ itemIds: string[]; source: "ai" | "fallback" }> {
  if (type === "product") {
    const { current, candidates } = await fetchProductCandidates(currentId);
    if (!current || candidates.length === 0) return { itemIds: [], source: "fallback" };

    // Če imamo manj kot 4 kandidate, vrni kar vse
    if (candidates.length <= 4) {
      return { itemIds: candidates.map((c) => c.id), source: "fallback" };
    }

    try {
      const prompt = buildProductPrompt(current, candidates);
      const result = await generateCompletion(
        [
          {
            role: "system",
            content: "Si pomočnik za priporočanje slovenskih izdelkov. Vedno odgovoriš SAMO z veljavnim JSON array-om števil.",
          },
          { role: "user", content: prompt },
        ],
        { temperature: 0.3 }
      );

      const indices = result?.content ? parseIndices(result.content, candidates.length) : null;

      if (indices && indices.length > 0) {
        const itemIds = indices.map((i) => candidates[i].id);
        console.log(`[ai-rec] Product ${currentId} — AI izbral ${itemIds.length} (source: ${result?.source})`);
        return { itemIds, source: "ai" };
      }
    } catch (error) {
      console.error("[ai-rec] Product AI napaka:", error);
    }

    // Fallback: top 4 po ratingu
    return {
      itemIds: candidates.slice(0, 4).map((c) => c.id),
      source: "fallback",
    };
  } else {
    const { current, candidates } = await fetchExperienceCandidates(currentId);
    if (!current || candidates.length === 0) return { itemIds: [], source: "fallback" };

    if (candidates.length <= 4) {
      return { itemIds: candidates.map((c) => c.id), source: "fallback" };
    }

    try {
      const prompt = buildExperiencePrompt(current, candidates);
      const result = await generateCompletion(
        [
          {
            role: "system",
            content: "Si pomočnik za priporočanje turističnih izkušenj v Sloveniji. Vedno odgovoriš SAMO z veljavnim JSON array-om števil.",
          },
          { role: "user", content: prompt },
        ],
        { temperature: 0.3 }
      );

      const indices = result?.content ? parseIndices(result.content, candidates.length) : null;

      if (indices && indices.length > 0) {
        const itemIds = indices.map((i) => candidates[i].id);
        console.log(`[ai-rec] Experience ${currentId} — AI izbral ${itemIds.length} (source: ${result?.source})`);
        return { itemIds, source: "ai" };
      }
    } catch (error) {
      console.error("[ai-rec] Experience AI napaka:", error);
    }

    return {
      itemIds: candidates.slice(0, 4).map((c) => c.id),
      source: "fallback",
    };
  }
}

// ============================================================================
// GLAVNA FUNKCIJA
// ============================================================================

/**
 * Vrne AI-priporočene IDs za podan item.
 * Najprej preveri cache (24h TTL), nato po potrebi pokliče AI.
 */
export async function getRecommendedIds(
  type: RecommendationType,
  itemId: string
): Promise<{ itemIds: string[]; source: "ai" | "fallback" | "cache" }> {
  const cacheKey = `${type}:${itemId}`;
  const store = await readCache();

  // 1. Preveri cache
  const cached = store[cacheKey];
  if (cached && isFresh(cached)) {
    return { itemIds: cached.itemIds, source: "cache" };
  }

  // 2. Generiraj z AI (z fallback)
  const result = await selectWithAI(type, itemId);

  // 3. Shrani v cache (tudi fallback — da ne kličemo AI vsakič ko odpove)
  store[cacheKey] = {
    cachedAt: Date.now(),
    itemIds: result.itemIds,
    source: result.source,
  };
  await writeCache(store);

  return result;
}

/**
 * Počisti cache za specifičen item (ko se item posodobi).
 */
export async function invalidateRecommendationCache(
  type: RecommendationType,
  itemId: string
): Promise<void> {
  const store = await readCache();
  const key = `${type}:${itemId}`;
  if (store[key]) {
    delete store[key];
    await writeCache(store);
  }
}

/**
 * Počisti CEL cache (admin funkcija).
 */
export async function clearAllRecommendationCache(): Promise<{ cleared: number }> {
  const store = await readCache();
  const count = Object.keys(store).length;
  await writeCache({});
  return { cleared: count };
}
