/**
 * Priporočila za tržnico (izdelki + izkušnje) — DETERMINISTIČNA
 *
 * ISSUE #9 (ZERO-AI / deterministic-first): GLM izbira (4 od 10) je
 * ODSTRANJENA. Izbor je zdaj transparentno uteženo točkovanje nad ISTIM
 * SQL kandidatskim naborom (ista kategorija ALI ista destinacija,
 * featured desc → rating desc → reviewCount desc, 10 kandidatov) —
 * 0 AI žetonov, 0 omrežja, reproducibilno.
 *
 * Strategija:
 * 1. Preveri filesystem cache (data/ai-rec-cache.json) — 24-urni TTL
 * 2. Če cache veljaven → vrni cached rezultat (0 izračuna)
 * 3. Sicer: SQL kandidati → DETERMINISTIČNO točkovanje → top 4
 *
 * Cache key: `product:{id}` ali `experience:{id}`
 *
 * ISSUE #4 §20 (VAL 5 sklop B, 1.97.0) — RAZLOŽLJIVA PRIPOROČILA:
 * priporočilo NI črni ranking — vsak priporočen item nosi `why`
 * (eno vrstico razloga) + `whySource` ("ai" | "deterministic";
 * po ISSUE #9 so NOVE vrstice VEDNO "deterministic" — "ai" ostaja
 * samo za branje legacy cache zapisov, MLADIČI 24 h). UI izriše
 * "Zakaj: {why}" oziroma "Why: {why}" (+ "(iz podatkov)" kadar
 * vrstica ni AI-curirana).
 *
 * ZAKON WHY VRSTICE: razlog sme navajati SAMO podatke, ki jih kandidat
 * RESNIČNO ima (kategorija, regija, cena, ocena, trajanje, značilnosti).
 * Deterministična vrstica (buildDeterministicWhy) sestavljena IZKLJUČNO
 * iz prisotnih polj — manjkajoče polje se preskoči (nikoli se ne izumi),
 * jezikovno zavestna (sl/en).
 *
 * SCORING MODEL — DOKUMENTACIJA (§20: "Če ni enotnega scoring modela, ga
 * dokumentiraj"; ISSUE #9 §14: transparentno uteženo točkovanje):
 *   relevance = kategorija (ista: +3)
 *             + regija/destinacija (ista: +2,5)
 *             + ocena (rating × 0,4 — realni signal kvalitete)
 *             + bližina cene (±30 %: +1; ±60 %: +0,5)
 *             + značke izdelka (vsaka DELJENA značka s trenutnim
 *               izdelkom: +0,4, kap 1,2 — bio/ročno/lokalno/vegansko)
 *               oziroma pri izkušnjah: familyFriendly ujemanje (+0,5)
 *               + bližina trajanja (±1,5×: +0,5)
 * Vrstni red: score desc → rating desc → ime asc (POPOPOLNOMA
 * deterministično — isti vhod vedno da isti izhod). Kandidatov polja
 * (distance/opening/weather) v izbor tržnice NE vstopajo — kandidat teh
 * polj ne nosi in jih zato why vrstica odkrito NE omenja (samo dejstva
 * iz kandidata). Za transparentnost RANGIRANJA supply seznamov skrbi
 * ločen modul src/lib/ranking-engine.ts — a ta je ADMIN/OWNER površina
 * (vrstni red ponudb), NI potnikov UI tržnice in tu NI priklopljen.
 */

import { promises as fs } from "fs";
import path from "path";
import { db } from "@/lib/db";
import { logCacheUsage } from "@/lib/ai-usage";

// ============================================================================
// TIPI
// ============================================================================

export type RecommendationType = "product" | "experience";

/** §20: izvor why vrstice — iskrenostna oznaka (kanon itinerary source). */
export type WhySource = "ai" | "deterministic";

/**
 * §20: razložljiva why vrstica enega priporočenega itema.
 *
 * Cache je jezikovno-agnostičen (24 h, en zapis na item) → hranimo OBE
 * jezikovni različici + LOČEN izvor za vsako (AI lahko poda SL brez EN —
 * potem je EN vrstica iskreno deterministična, ne lažno "ai").
 */
export interface RecommendationWhy {
  /** ID itema (ujema se z vrstnim redom itemIds). */
  id: string;
  /** Slovenska vrstica (AI why ali deterministična). */
  sl: string;
  /** Angleška vrstica (AI whyEn ali deterministična). */
  en: string;
  /** Iskrenost označba SL vrstice. */
  sourceSl: WhySource;
  /** Iskrenost označba EN vrstice. */
  sourceEn: WhySource;
}

/** §20: cache zapis — whys so dodani (starejši zapisi ≤1.96 jih nimajo).
 * ISSUE #9: novi zapisi nosijo source "deterministic"; "ai"/"fallback"
 * ostajata v unionu SAMO za branje legacy zapisov (TTL 24 jih splakne). */
export interface CacheEntry {
  cachedAt: number; // epoch ms
  itemIds: string[]; // IDs priporočenih itemov (v vrstnem redu)
  source: "deterministic" | "ai" | "fallback";
  /** §20: why vrstice (aligned s itemIds po vrstnem redu). Manjka v
   *  legacy zapisih → cacheEntryHasValidWhy() razglasi neveljavnost. */
  whys?: RecommendationWhy[];
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
// P7-C2 (F5.3): in-memory plast (per-instanca). Na Vercelu je FS read-only —
// writeCache tiho odpove in readCache vedno miss-a → vsak javni GET bi pomenil
// pravi AI klic. Memory plast deluje povsod; FS ostaja best-effort za
// lokalni dev/Docker (persistentnost med restarti).
const memoryStore: CacheStore = {};

async function readCache(): Promise<CacheStore> {
  let fromFs: CacheStore = {};
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) fromFs = parsed as CacheStore;
  } catch {
    // datoteka ne obstaja / neberljiva —FS sloj preskočen (Vercel)
  }
  // memory ima prednost (novejši zapisi v isti instanci)
  return { ...fromFs, ...memoryStore };
}

async function writeCache(store: CacheStore): Promise<void> {
  // store je VEDNO celotno želeno stanje (klicatelji: get/invalidate/clearAll)
  // → memory plast zamenjamo v celoti.
  for (const k of Object.keys(memoryStore)) delete memoryStore[k];
  Object.assign(memoryStore, store);
  // FS — best-effort (lokalni dev/Docker; na Vercelu tiho odpove)
  try {
    await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(store, null, 2), "utf-8");
  } catch {
    // pričakovano na read-only FS — memory plast je avtoriteta
  }
}

/**
 * §20: veljavnost why plasti cache zapisa. Zapis brez whys (legacy, ≤1.96)
 * ali z neskladno obliko (dolžina ≠ itemIds, prazne vrstice, neveljavni
 * izvori) NE sme biti servirani kot zadetek — velja za ZASTARELO in se
 * gradi znova (rebuild). Čista preverljiva funkcija (brez IO).
 */
export function cacheEntryHasValidWhy(entry: unknown): boolean {
  if (typeof entry !== "object" || entry === null) return false;
  const e = entry as { itemIds?: unknown; whys?: unknown };
  if (!Array.isArray(e.itemIds) || !Array.isArray(e.whys)) return false;
  // Lokalni konstanti — ozkost tipov preživi closure v every() spodaj.
  const itemIds: unknown[] = e.itemIds;
  const whys: unknown[] = e.whys;
  if (whys.length !== itemIds.length) return false;
  return whys.every((w, k) => {
    if (typeof w !== "object" || w === null) return false;
    const why = w as Record<string, unknown>;
    return (
      why.id === itemIds[k] &&
      typeof why.sl === "string" &&
      why.sl.trim().length > 0 &&
      typeof why.en === "string" &&
      why.en.trim().length > 0 &&
      (why.sourceSl === "ai" || why.sourceSl === "deterministic") &&
      (why.sourceEn === "ai" || why.sourceEn === "deterministic")
    );
  });
}

/**
 * §20: ali se zapis lahko servira iz cache-a (svež + veljavna why oblika).
 * Čista funkcija — uro injicira klicatelj (vzorec data-freshness.ts),
 * zato je preskušljiva brez file IO.
 */
export function shouldServeFromCache(
  entry: CacheEntry | undefined,
  now: number
): boolean {
  if (!entry) return false;
  if (now - entry.cachedAt >= CACHE_TTL_MS) return false;
  // Legacy zapis (brez whys) → shape mismatch → zastarelo → rebuild.
  return cacheEntryHasValidWhy(entry);
}

// ============================================================================
// KANDIDATI IZ BAZE
// ============================================================================

export interface ProductCandidate {
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

export interface ExperienceCandidate {
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
// §20 — DETERMINISTIČNA WHY VRSTICA (kanon buildStopReasons: samo dejstva)
// ============================================================================

/** Format ocene: SL decimalna vejica ("4,8"), EN pika ("4.8"). */
function formatRating(r: number, locale: "sl" | "en"): string {
  const s = r.toFixed(1);
  return locale === "sl" ? s.replace(".", ",") : s;
}

/** Format cene brez valute: celi del brez decimalk, sicer 2 decimalki. */
function formatPricePlain(p: number, locale: "sl" | "en"): string {
  const s = Number.isInteger(p) ? String(p) : p.toFixed(2);
  return locale === "sl" ? s.replace(".", ",") : s;
}

/** Format trajanja: "3 h" / "2,5 h" (SL) oziroma "3 h" / "2.5 h" (EN). */
function formatDurationHours(h: number, locale: "sl" | "en"): string {
  const s = Number.isInteger(h) ? String(h) : h.toFixed(1);
  return `${locale === "sl" ? s.replace(".", ",") : s} h`;
}

/** Značke izdelka, ki so DEJANSKO prisotne (samo resnične vrednosti). */
function productTagParts(c: ProductCandidate, locale: "sl" | "en"): string[] {
  const tags: string[] = [];
  if (c.organic) tags.push(locale === "sl" ? "bio" : "organic");
  if (c.handmade) tags.push(locale === "sl" ? "ročno izdelano" : "handmade");
  if (c.local) tags.push(locale === "sl" ? "lokalno" : "local");
  if (c.vegan) tags.push(locale === "sl" ? "vegansko" : "vegan");
  return tags;
}

/**
 * §20: sestavi DETERMINISTIČNO why vrstico iz SAMO prisotnih polj
 * kandidata (kanon stop-insights: dejstva, nikoli marketing, nikoli
 * izumljeno). Manjkajoče/prazno/ničelno polje se preskoči — vrstica
 * NIKOLI ne omeni podatka, ki ga kandidat nima (npr. brez ocene → brez
 * "ocena X"; brez regije → brez regije).
 *
 * Zadnja obramba: tudi če VSA ostala polja manjkajo, vrne ime (ime je
 * dejstvo iz kandidata; hkrati cache veljavnost zahteva neprazno vrstico).
 */
export function buildDeterministicWhy(
  candidate: ProductCandidate | ExperienceCandidate,
  kind: RecommendationType,
  locale: "sl" | "en"
): string {
  const isEn = locale === "en";
  const parts: string[] = [];

  // 1) Kategorija — vedno dejstvo iz kandidata (preskoči prazno)
  if (typeof candidate.category === "string" && candidate.category.trim()) {
    parts.push(candidate.category.trim());
  }

  // 2) Regija — destinationName je nullable → preskoči, ne ugibamo
  if (candidate.destinationName) {
    parts.push(candidate.destinationName);
  }

  // 3) Ocena — samo če je dejansko > 0 (0 v tej tržnici pomeni "ni ocene")
  if (typeof candidate.rating === "number" && candidate.rating > 0) {
    parts.push(
      isEn
        ? `rating ${formatRating(candidate.rating, locale)}`
        : `ocena ${formatRating(candidate.rating, locale)}`
    );
  }

  // 4) Cena — price (izdelek) / pricePerPerson (izkušnja), samo če > 0
  const price =
    kind === "product"
      ? (candidate as ProductCandidate).price
      : (candidate as ExperienceCandidate).pricePerPerson;
  if (typeof price === "number" && price > 0) {
    parts.push(
      isEn
        ? `from €${formatPricePlain(price, locale)}`
        : `od €${formatPricePlain(price, locale)}`
    );
  }

  // 5) Vrsto-specifična dejstva — SAMO kadar so prisotna
  if (kind === "experience") {
    const exp = candidate as ExperienceCandidate;
    if (typeof exp.durationHours === "number" && exp.durationHours > 0) {
      parts.push(
        isEn
          ? `duration ${formatDurationHours(exp.durationHours, locale)}`
          : `trajanje ${formatDurationHours(exp.durationHours, locale)}`
      );
    }
    if (exp.familyFriendly) {
      parts.push(isEn ? "family-friendly" : "primerno za družine");
    }
  } else {
    const tags = productTagParts(candidate as ProductCandidate, locale);
    if (tags.length > 0) parts.push(tags.join(", "));
  }

  if (parts.length === 0) {
    // Iskrena zadnja obramba — ime je vedno prisotno dejstvo kandidata.
    return candidate.name ?? "";
  }
  return parts.join(" · ");
}

// ============================================================================
// ISSUE #9 §14 — DETERMINISTIČNO TOČKOVANJE (transparentno, realni signali)
// ============================================================================

/** Bližina cene: ±30 % → 1 točka, ±60 % → 0,5 točke (0/neznano → 0). */
function priceProximity(a: number, b: number): number {
  if (!a || !b || a <= 0 || b <= 0) return 0;
  const ratio = Math.max(a, b) / Math.min(a, b);
  if (ratio <= 1.3) return 1;
  if (ratio <= 1.6) return 0.5;
  return 0;
}

/**
 * Ocena relevantnosti kandidata-izdelka glede na trenutni izdelek.
 * Signali (dokumentirani v glavi modula): ista kategorija, ista regija,
 * ocena, bližina cene, deljene značke (bio/ročno/lokalno/vegansko).
 * Čista funkcija — 0 omrežja, 0 ure, reproducibilna.
 */
export function scoreProduct(
  current: ProductCandidate,
  candidate: ProductCandidate
): number {
  let score = 0;
  if (current.category && candidate.category === current.category) score += 3;
  if (
    current.destinationName &&
    candidate.destinationName === current.destinationName
  ) {
    score += 2.5;
  }
  if (candidate.rating > 0) score += candidate.rating * 0.4;
  score += priceProximity(current.price, candidate.price);
  let sharedTags = 0;
  if (current.organic && candidate.organic) sharedTags += 1;
  if (current.handmade && candidate.handmade) sharedTags += 1;
  if (current.local && candidate.local) sharedTags += 1;
  if (current.vegan && candidate.vegan) sharedTags += 1;
  score += Math.min(sharedTags * 0.4, 1.2);
  return score;
}

/**
 * Ocena relevantnosti kandidata-izkušnje glede na trenutno izkušnjo.
 * Signali: ista kategorija, ista regija, ocena, bližina cene/osebo,
 * familyFriendly ujemanje, bližina trajanja (±1,5×).
 * Čista funkcija — 0 omrežja, 0 ure, reproducibilna.
 */
export function scoreExperience(
  current: ExperienceCandidate,
  candidate: ExperienceCandidate
): number {
  let score = 0;
  if (current.category && candidate.category === current.category) score += 3;
  if (
    current.destinationName &&
    candidate.destinationName === current.destinationName
  ) {
    score += 2.5;
  }
  if (candidate.rating > 0) score += candidate.rating * 0.4;
  score += priceProximity(current.pricePerPerson, candidate.pricePerPerson);
  if (current.familyFriendly === candidate.familyFriendly) score += 0.5;
  if (
    current.durationHours > 0 &&
    candidate.durationHours > 0
  ) {
    const ratio =
      Math.max(current.durationHours, candidate.durationHours) /
      Math.min(current.durationHours, candidate.durationHours);
    if (ratio <= 1.5) score += 0.5;
  }
  return score;
}

/**
 * Popolnoma determinističen vrstni red kandidatov-izdelkov:
 * score desc → rating desc → ime asc. Izvozreno za teste (fixturei).
 */
export function rankProductCandidates(
  current: ProductCandidate,
  candidates: ProductCandidate[]
): ProductCandidate[] {
  return [...candidates].sort(
    (a, b) =>
      scoreProduct(current, b) - scoreProduct(current, a) ||
      b.rating - a.rating ||
      a.name.localeCompare(b.name)
  );
}

/**
 * Popolnoma determinističen vrstni red kandidatov-izkušenj:
 * score desc → rating desc → ime asc. Izvozreno za teste (fixturei).
 */
export function rankExperienceCandidates(
  current: ExperienceCandidate,
  candidates: ExperienceCandidate[]
): ExperienceCandidate[] {
  return [...candidates].sort(
    (a, b) =>
      scoreExperience(current, b) - scoreExperience(current, a) ||
      b.rating - a.rating ||
      a.name.localeCompare(b.name)
  );
}

// ============================================================================

/** §20: popolnoma deterministična why (obe jezikovni različici) za
 *  fallback poti (SQL top-4, nabor ≤4, prazen nabor). */
function deterministicWhy(
  candidate: ProductCandidate | ExperienceCandidate,
  kind: RecommendationType
): RecommendationWhy {
  return {
    id: candidate.id,
    sl: buildDeterministicWhy(candidate, kind, "sl"),
    en: buildDeterministicWhy(candidate, kind, "en"),
    sourceSl: "deterministic",
    sourceEn: "deterministic",
  };
}

/**
 * ISSUE #9 (ZERO-AI): DETERMINISTIČNA izbira priporočil — uteženo
 * točkovanje (scoreProduct/scoreExperience) nad SQL kandidati, top 4,
 * why vrstice vedno deterministične (buildDeterministicWhy — samo
 * dejstva iz kandidata). 0 AI žetonov, 0 omrežja, reproducibilno.
 * Nabor ≤ 4 → vsi (isto kot prej); prazen nabor → prazna izbira
 * (iskrena praznina, ne izumi).
 */
async function selectDeterministic(
  type: RecommendationType,
  currentId: string
): Promise<{
  itemIds: string[];
  whys: RecommendationWhy[];
  source: "deterministic";
}> {
  if (type === "product") {
    const { current, candidates } = await fetchProductCandidates(currentId);
    if (!current || candidates.length === 0) {
      // §20: tudi prazna izbira nosi prazno why množico (oblika ostane)
      return { itemIds: [], whys: [], source: "deterministic" };
    }
    const top = rankProductCandidates(current, candidates).slice(0, DEFAULT_LIMIT);
    return {
      itemIds: top.map((c) => c.id),
      whys: top.map((c) => deterministicWhy(c, "product")),
      source: "deterministic",
    };
  }
  const { current, candidates } = await fetchExperienceCandidates(currentId);
  if (!current || candidates.length === 0) {
    // §20: tudi prazna izbira nosi prazno why množico (oblika ostaja)
    return { itemIds: [], whys: [], source: "deterministic" };
  }
  const top = rankExperienceCandidates(current, candidates).slice(0, DEFAULT_LIMIT);
  return {
    itemIds: top.map((c) => c.id),
    whys: top.map((c) => deterministicWhy(c, "experience")),
    source: "deterministic",
  };
}

// ============================================================================
// GLAVNA FUNKCIJA
// ============================================================================

/**
 * ISSUE #9 (ZERO-AI): vrne DETERMINISTIČNO priporočene IDs za podan item
 * (+ §20 why vrstice — vedno iz realnih polj kandidata). Najprej cache
 * (24 h TTL — čisti izračun se ne ponavlja), sicer točkovanje nad SQL
 * kandidati. 0 AI klicev.
 */
export async function getRecommendedIds(
  type: RecommendationType,
  itemId: string
): Promise<{
  itemIds: string[];
  /** §20: why vrstice — aligned s itemIds (isti vrstni red). */
  whys: RecommendationWhy[];
  source: "deterministic" | "cache";
}> {
  const cacheKey = `${type}:${itemId}`;
  const store = await readCache();

  // 1. Preveri cache — ISSUE #4 §11: zadetek je VIDEN v meteringu
  //    (0 stroškov, a del odgovornosti stroškov).
  //    §20: zadetek se servira SAMO z veljavno why obliko — legacy zapisi
  //    (≤1.96, brez whys) se štejejo za zastarele → rebuild (ne sesutje).
  const cached = store[cacheKey];
  if (cached && shouldServeFromCache(cached, Date.now())) {
    logCacheUsage("recommend", 0, { metadata: { kind: type } });
    return {
      itemIds: cached.itemIds,
      whys: cached.whys ?? [],
      source: "cache",
    };
  }

  // 2. Deterministična izbira (uteženo točkovanje — 0 AI)
  const result = await selectDeterministic(type, itemId);

  // 3. Shrani v cache (da čisti izračun ne teče ob vsakem odpiranju modalov)
  store[cacheKey] = {
    cachedAt: Date.now(),
    itemIds: result.itemIds,
    source: result.source,
    whys: result.whys,
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
