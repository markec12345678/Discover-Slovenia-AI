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
 *
 * ISSUE #4 §20 (VAL 5 sklop B, 1.97.0) — RAZLOŽLJIVA PRIPOROČILA:
 * priporočilo NI VEČ črni AI ranking — vsak priporočen item nosi `why`
 * (eno vrstico razloga) + `whySource` ("ai" | "deterministic"; isti kanon
 * iskrenosti kot itinerary `source: "fallback"`). UI nato izriše
 * "Zakaj: {why}" oziroma "Why: {why}" (+ "(iz podatkov)" kadar vrstica
 * ni AI-curirana).
 *
 * ZAKON WHY VRSTICE: razlog sme navajati SAMO podatke, ki so bili poslani
 * v prompt (kategorija, regija, cena, ocena, opis, trajanje, značilnosti).
 * Dvojna obramba:
 *   1. prompt AI izrecno prepoveduje izmišljanje podatkov (recenzij,
 *      dostopnosti, sezon …), ki jih kandidat nima;
 *   2. containsInventedClaims() — preverljiv filter na AI odgovoru: why,
 *      ki omenja polja, ki jih v prompt NI, se ZAVRNE in zamenja z
 *      deterministično vrstico (buildDeterministicWhy).
 *
 * DETERMINISTIČNA VRSTICA (isti kanon kot buildStopReasons v
 * stop-insights.ts): sestavljena IZKLJUČNO iz prisotnih polj kandidata,
 * manjkajoče polje se preskoči (nikoli se ne izumi), jezikovno zavestna
 * (sl/en). Uporablja se: (a) kadar AI ne vrne why, (b) kadar AI why omenja
 * izmišljene podatke, (c) ob SQL fallbacku (top-4 po ratingu) — takrat
 * whySource pošteno pove "deterministic".
 *
 * SCORING MODEL — DOKUMENTACIJA (§20: "Če ni enotnega scoring modela, ga
 * dokumentiraj"): priporočila tržnice NIMAJO enotnega utežnega scoring
 * modela. Izbor je dvostopen: (1) SQL kandidatski nabor (featured desc →
 * rating desc → reviewCount desc; filter ista kategorija ALI ista
 * destinacija), (2) GLM kontekstualna izbira 4 od 10 po pravilih v
 * promptu (podobna kategorija, complementary uporaba, ista regija,
 * podobna cena). Preference/rating/price/category/region so torej upoštevane
 * (kot SQL vrstni red + prompt pravila); distance/opening/weather/
 * popularity/route fit v izbor tržnice NE vstopajo — kandidat teh polj ne
 * nosi in jih zato tudi why vrstica odkrito NE omenja (samo dejstva iz
 * kandidata). Za transparentnost RANGIRANJA supply seznamov skrbi ločen
 * modul src/lib/ranking-engine.ts — a ta je ADMIN/OWNER površina (vrstni
 * red ponudb), NI potnikov UI tržnice in tu NI priklopljen.
 */

import { promises as fs } from "fs";
import path from "path";
import { db } from "@/lib/db";
import { generateCompletion } from "@/lib/ai-client";
import { logFallbackUsage, logCacheUsage } from "@/lib/ai-usage";
import { wrapProviderData, SYSTEM_DATA_GUARD } from "@/lib/ai-context";
import { extractJsonObject } from "@/lib/imported-reservation";

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

/** §20: cache zapis — whys so dodani (starejši zapisi ≤1.96 jih nimajo). */
export interface CacheEntry {
  cachedAt: number; // epoch ms
  itemIds: string[]; // IDs priporočenih itemov (v vrstnem redu)
  source: "ai" | "fallback";
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
// §20 — FILTER IZMIŠLJENIH TRDITEV (preverljiva obramba nad AI odgovorom)
// ============================================================================
//
// Oznake polj, ki jih v prompt NE pošiljamo. Kdor jih omenja v why, jih ni
// mogel prebrati iz kandidata → izmišljena trditev → vrstico ZAVRNEMO in
// iskreno zamenjamo z deterministično. (Prompt prepoveduje isto — to je
// druga, preskušljiva plast; primarno obrambo piše prompt, sekundarno
// preverja koda.)
const INVENTED_CLAIM_MARKERS: string[] = [
  "recenz", // recenzija/recenzij/recenziami — reviewCount NI v kandidatu
  "mnenj", // mnenja obiskovalcev — ni v kandidatu
  "review", // reviews/reviewed — ni v kandidatu
  "sezon", // sezona/sezonsko — bestSeason NI v kandidatu
  "season", // season/seasonal — ni v kandidatu
  "dostopn", // dostopnost — Experience.accessibility NI v selectu kandidata
  "accessible", // accessibility — ni v kandidatu
  "odpiral", // odpiralni čas — NI v kandidatu
  "opening", // opening hours — NI v kandidatu
  "vreme", // vreme — NI v kandidatu
  "weather", // weather — NI v kandidatu
  "priljubljen", // popularnost — NI v kandidatu
  "popular", // popular/popularity — NI v kandidatu
  "bestseller", // prodajna uspešnost — NI v kandidatu
  "stock", // zaloga — NI v kandidatu
  "zalog", // zaloga/zalogi — NI v kandidatu
];

/**
 * §20: ali why omenja podatke, ki jih kandidat (in prompt) NIMA.
 * true → vrstica ni sestavljena iz kandidatovih polj → zavrni (iskrena
 * zamenjava z deterministično vrstico, whySource "deterministic").
 */
export function containsInventedClaims(why: string): boolean {
  const s = why.toLowerCase();
  return INVENTED_CLAIM_MARKERS.some((m) => s.includes(m));
}

// ============================================================================
// AI PROMPT BUILDER
// ============================================================================

function buildProductPrompt(current: ProductCandidate, candidates: ProductCandidate[]): string {
  // P3c-4: ponudniška vsebina (naslov, opis) vstopa v prompt OVITA v
  // <podatek> oznake (wrapProviderData) — system sporočilu je prilepljen
  // SYSTEM_DATA_GUARD, ki oznako razglaša za podatek, ne navodilo.
  const currentDesc = `TRENUTNI IZDELEK:
- Naslov: ${wrapProviderData("naziv", current.name)}
- Opis: ${wrapProviderData("opis", current.description)}
- Kategorija: ${current.category}
- Regija: ${current.destinationName ?? "ni znana"}
- Cena: €${current.price}
- Atributi: ${[current.organic && "bio", current.handmade && "ročno izdelano", current.local && "lokalno", current.vegan && "vegansko"].filter(Boolean).join(", ") || "brez"}
- Ocena: ${current.rating}/5`;

  const candidatesDesc = candidates
    .map((c, i) =>
      wrapProviderData(
        "kandidat-izdelek",
        `[${i}] ${c.name} — ${c.description.substring(0, 100)} (kategorija: ${c.category}, regija: ${c.destinationName ?? "neznana"}, cena: €${c.price}, ocena: ${c.rating})`
      )
    )
    .join("\n");

  return `Si strokovnjak za slovenske lokalne izdelke in kulinariko. Uporabnik gleda izdelek in mu želimo priporočiti 4 NAJBOLJ PODOBNE ali COMPLEMENTARY izdelke iz spodnjega seznama.

${currentDesc}

KANDIDATI (izberi 4):
${candidatesDesc}

Pravila:
1. Izberi 4 izdelke ki so najbolj smiselni za uporabnika ki gleda trenutni izdelek
2. Prioritiziraj: podobna kategorija, complementary uporaba (npr. vino + olje), ista regija, podobna cena
3. Izogibaj se duplikatom (vsak indeks izberi največ enkrat)
4. Za vsako izbiro napiši "why" — ENA vrstica razloga v slovenščini (do 90 znakov) in "whyEn" — isto vrstico v angleščini
5. why sme navajati SAMO podatke iz kandidata (kategorija, regija, cena, ocena, opis, značilnosti) — NIKOLI ne izmisli podatkov (npr. recenzij, dostopnosti, sezon), ki niso v kandidatu.

Odgovor (SAMO JSON objekt, brez dodatnega besedila):
{"selection":[{"i":3,"why":"ista regija in podobna cena, ocena 4,8","whyEn":"same region and similar price, rating 4.8"},{"i":1,"why":"…","whyEn":"…"},{"i":7,"why":"…","whyEn":"…"},{"i":5,"why":"…","whyEn":"…"}]}`;
}

function buildExperiencePrompt(current: ExperienceCandidate, candidates: ExperienceCandidate[]): string {
  // P3c-4: enaka ovijanja kot pri izdelkih (glej buildProductPrompt)
  const currentDesc = `TRENUTNA IZKUŠNJA:
- Naslov: ${wrapProviderData("naziv", current.name)}
- Opis: ${wrapProviderData("opis", current.description)}
- Kategorija: ${current.category}
- Regija: ${current.destinationName ?? "ni znana"}
- Cena: €${current.pricePerPerson}/osebo
- Trajanje: ${current.durationHours}h
- Za družine: ${current.familyFriendly ? "da" : "ne"}
- Ocena: ${current.rating}/5`;

  const candidatesDesc = candidates
    .map((c, i) =>
      wrapProviderData(
        "kandidat-izkušnja",
        `[${i}] ${c.name} — ${c.description.substring(0, 100)} (kategorija: ${c.category}, regija: ${c.destinationName ?? "neznana"}, cena: €${c.pricePerPerson}, trajanje: ${c.durationHours}h, ocena: ${c.rating})`
      )
    )
    .join("\n");

  return `Si strokovnjak za turizem in aktivnosti v Sloveniji. Uporabnik gleda izkušnjo in mu želimo priporočiti 4 NAJBOLJ PODOBNE ali COMPLEMENTARY izkušnje iz spodnjega seznama.

${currentDesc}

KANDIDATI (izberi 4):
${candidatesDesc}

Pravila:
1. Izberi 4 izkušnje ki so najbolj smiselne za uporabnika ki gleda trenutno izkušnjo
2. Prioritiziraj: podobna kategorija, complementary aktivnosti (npr. rafting + pohod), ista regija, podobna težavnost
3. Izogibaj se duplikatom (vsak indeks izberi največ enkrat)
4. Za vsako izbiro napiši "why" — ENA vrstica razloga v slovenščini (do 90 znakov) in "whyEn" — isto vrstico v angleščini
5. why sme navajati SAMO podatke iz kandidata (kategorija, regija, cena, ocena, opis, trajanje, značilnosti) — NIKOLI ne izmisli podatkov (npr. recenzij, dostopnosti, sezon), ki niso v kandidatu.

Odgovor (SAMO JSON objekt, brez dodatnega besedila):
{"selection":[{"i":2,"why":"complementary aktivnost v isti regiji, ocena 4,9","whyEn":"complementary activity in the same region, rating 4.9"},{"i":5,"why":"…","whyEn":"…"},{"i":0,"why":"…","whyEn":"…"},{"i":8,"why":"…","whyEn":"…"}]}`;
}

// ============================================================================
// AI KLIC + PARSING + §20 PRESIKAVA (mapper)
// ============================================================================

/** Surova izbira GLM (i + neobvezna why/whyEn — validacija v preslikavi). */
export interface AiSelectionEntry {
  i: unknown;
  why?: unknown;
  whyEn?: unknown;
}

/**
 * §20: izlušči selection iz AI odgovora. Podpira:
 *  1. nov obrazec: {"selection":[{"i":3,"why":"…","whyEn":"…"},…]}
 *     (ograje/```json okoli njega odpadejo — extractJsonObject);
 *  2. dedni obrazec: [3,1,7,5] (GLM občasno ignorira obrazec — izbira se
 *     ohrani, why pa zaradi odsotnosti izda deterministično — iskreno).
 * Vrne null, če nič smiselnega (klicalec pade na SQL fallback).
 */
export function parseSelection(content: string): AiSelectionEntry[] | null {
  if (!content) return null;

  // 1) Nov obrazec — JSON objekt s "selection"
  const obj = extractJsonObject(content);
  if (obj && Array.isArray(obj.selection)) {
    const entries: AiSelectionEntry[] = [];
    for (const raw of obj.selection) {
      if (typeof raw === "object" && raw !== null) {
        const e = raw as Record<string, unknown>;
        entries.push({ i: e.i, why: e.why, whyEn: e.whyEn });
      }
    }
    if (entries.length > 0) return entries;
  }

  // 2) Dedni obrazec — go JSON array indeksov
  const match = content.match(/\[[\s\S]*?\]/);
  if (match) {
    try {
      const arr = JSON.parse(match[0]);
      if (Array.isArray(arr)) {
        const entries = arr
          .filter((n) => typeof n === "number" && Number.isInteger(n))
          .map((n) => ({ i: n }) as AiSelectionEntry);
        if (entries.length > 0) return entries;
      }
    } catch {
      // neveljaven JSON → null (klicalec pade na SQL fallback)
    }
  }
  return null;
}

/**
 * §20: reši ENO jezikovno različico why za enega kandidata.
 * AI besedilo sprejmemo SAMO, če je veljaven neprazen niz BREZ izmišljenih
 * trditev — sicer iskrena deterministična zamenjava + izvor.
 */
function resolveWhyVariant(
  raw: unknown,
  candidate: ProductCandidate | ExperienceCandidate,
  kind: RecommendationType,
  locale: "sl" | "en"
): { text: string; source: WhySource } {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s.length > 0 && !containsInventedClaims(s)) {
    return { text: s, source: "ai" };
  }
  return {
    text: buildDeterministicWhy(candidate, kind, locale),
    source: "deterministic",
  };
}

/**
 * §20 PRESIKAVA (mapper hardening): surovi AI selection → veljavne izbire
 * z why vrsticami. Pravila (vse zavrnitve so iskrene — manj priporočil je
 * pošteno, nadomeščanje z izmišljenimi pa ne):
 *  · i mora biti celo število znotraj [0, candidates.length) → sicer se
 *    vnos ZAVRNE (out-of-range);
 *  · podvojen i → drugi vnos se ZAVRNE;
 *  · why/whyEn ni veljaven niz (manjka/prazen/napačen tip) ALI omenja
 *    izmišljene podatke → TA jezik dobi deterministično vrstico
 *    (whySource "deterministic" — pošteno povedano, ne lažno "ai");
 *  · največ DEFAULT_LIMIT (4) vnosov (isti kap kot prejšnji parseIndices).
 */
export function mapSelectionToWhys(
  selection: AiSelectionEntry[],
  candidates: ProductCandidate[] | ExperienceCandidate[],
  kind: RecommendationType
): RecommendationWhy[] {
  const out: RecommendationWhy[] = [];
  const seen = new Set<number>();
  for (const entry of selection) {
    if (out.length >= DEFAULT_LIMIT) break;
    const i = entry.i;
    if (
      typeof i !== "number" ||
      !Number.isInteger(i) ||
      i < 0 ||
      i >= candidates.length
    ) {
      continue; // §20: out-of-range indeks → vnos zavrnjen
    }
    if (seen.has(i)) continue; // §20: podvojen indeks → vnos zavrnjen
    seen.add(i);
    const candidate = candidates[i];
    const sl = resolveWhyVariant(entry.why, candidate, kind, "sl");
    const en = resolveWhyVariant(entry.whyEn, candidate, kind, "en");
    out.push({
      id: candidate.id,
      sl: sl.text,
      en: en.text,
      sourceSl: sl.source,
      sourceEn: en.source,
    });
  }
  return out;
}

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

async function selectWithAI(
  type: RecommendationType,
  currentId: string
): Promise<{
  itemIds: string[];
  whys: RecommendationWhy[];
  source: "ai" | "fallback";
}> {
  if (type === "product") {
    const { current, candidates } = await fetchProductCandidates(currentId);
    if (!current || candidates.length === 0) {
      // §20: tudi prazna izbira nosi prazno why množico (oblika ostane)
      return { itemIds: [], whys: [], source: "fallback" };
    }

    // Če imamo manj kot 4 kandidate, vrni kar vse
    if (candidates.length <= 4) {
      // §20: ni AI izbire → whySource iskreno "deterministic"
      return {
        itemIds: candidates.map((c) => c.id),
        whys: candidates.map((c) => deterministicWhy(c, "product")),
        source: "fallback",
      };
    }

    try {
      const prompt = buildProductPrompt(current, candidates);
      const result = await generateCompletion(
        [
          {
            role: "system",
            // P3c-4: varnostna stavba za <podatek> ovito ponudniško vsebino;
            // §20: obrazec odgovora je JSON objekt s selection (i/why/whyEn).
            content: `Si pomočnik za priporočanje slovenskih izdelkov. Vedno odgovoriš SAMO z veljavnim JSON objektom oblike {"selection":[{"i":<indeks>,"why":"<vrstica>","whyEn":"<vrstica>"}]}.\n\n${SYSTEM_DATA_GUARD}`,
          },
          { role: "user", content: prompt },
        ],
        { temperature: 0.3, usageLog: { feature: "recommend" } }
      );

      const selection = result?.content ? parseSelection(result.content) : null;

      if (selection) {
        const whys = mapSelectionToWhys(selection, candidates, "product");
        if (whys.length > 0) {
          const itemIds = whys.map((w) => w.id);
          console.log(`[ai-rec] Product ${currentId} — AI izbral ${itemIds.length} (source: ${result?.source})`);
          return { itemIds, whys, source: "ai" };
        }
      }
    } catch (error) {
      console.error("[ai-rec] Product AI napaka:", error);
    }

    // Fallback: top 4 po ratingu — ISSUE #4 §11: zapis (SQL je služil).
    // §20: fallback nosi DETERMINISTIČNE why vrstice (iskrenost: ni AI
    // izbire — UI pokaže "(iz podatkov)").
    logFallbackUsage("recommend", 0, { metadata: { kind: type, path: "product-top-rating" } });
    const top = candidates.slice(0, 4);
    return {
      itemIds: top.map((c) => c.id),
      whys: top.map((c) => deterministicWhy(c, "product")),
      source: "fallback",
    };
  } else {
    const { current, candidates } = await fetchExperienceCandidates(currentId);
    if (!current || candidates.length === 0) {
      // §20: tudi prazna izbira nosi prazno why množico (oblika ostane)
      return { itemIds: [], whys: [], source: "fallback" };
    }

    if (candidates.length <= 4) {
      // §20: ni AI izbire → whySource iskreno "deterministic"
      return {
        itemIds: candidates.map((c) => c.id),
        whys: candidates.map((c) => deterministicWhy(c, "experience")),
        source: "fallback",
      };
    }

    try {
      const prompt = buildExperiencePrompt(current, candidates);
      const result = await generateCompletion(
        [
          {
            role: "system",
            // P3c-4: varnostna stavba za <podatek> ovito ponudniško vsebino;
            // §20: obrazec odgovora je JSON objekt s selection (i/why/whyEn).
            content: `Si pomočnik za priporočanje turističnih izkušenj v Sloveniji. Vedno odgovoriš SAMO z veljavnim JSON objektom oblike {"selection":[{"i":<indeks>,"why":"<vrstica>","whyEn":"<vrstica>"}]}.\n\n${SYSTEM_DATA_GUARD}`,
          },
          { role: "user", content: prompt },
        ],
        { temperature: 0.3, usageLog: { feature: "recommend" } }
      );

      const selection = result?.content ? parseSelection(result.content) : null;

      if (selection) {
        const whys = mapSelectionToWhys(selection, candidates, "experience");
        if (whys.length > 0) {
          const itemIds = whys.map((w) => w.id);
          console.log(`[ai-rec] Experience ${currentId} — AI izbral ${itemIds.length} (source: ${result?.source})`);
          return { itemIds, whys, source: "ai" };
        }
      }
    } catch (error) {
      console.error("[ai-rec] Experience AI napaka:", error);
    }

    // ISSUE #4 §11: zapis fallbacka (SQL je služil).
    // §20: fallback nosi DETERMINISTIČNE why vrstice (iskrenost: ni AI
    // izbire — UI pokaže "(iz podatkov)").
    logFallbackUsage("recommend", 0, { metadata: { kind: type, path: "experience-top-rating" } });
    const top = candidates.slice(0, 4);
    return {
      itemIds: top.map((c) => c.id),
      whys: top.map((c) => deterministicWhy(c, "experience")),
      source: "fallback",
    };
  }
}

// ============================================================================
// GLAVNA FUNKCIJA
// ============================================================================

/**
 * Vrne AI-priporočene IDs za podan item (+ §20 why vrstice).
 * Najprej preveri cache (24h TTL), nato po potrebi pokliče AI.
 */
export async function getRecommendedIds(
  type: RecommendationType,
  itemId: string
): Promise<{
  itemIds: string[];
  /** §20: why vrstice — aligned s itemIds (isti vrstni red). */
  whys: RecommendationWhy[];
  source: "ai" | "fallback" | "cache";
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

  // 2. Generiraj z AI (z fallback)
  const result = await selectWithAI(type, itemId);

  // 3. Shrani v cache (tudi fallback — da ne kličemo AI vsakič ko odpove)
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
