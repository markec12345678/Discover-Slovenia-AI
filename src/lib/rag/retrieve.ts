/**
 * retrieve.ts — leksično iskanje po T2 plasti "Uradni viri" (STO).
 *
 * DATA-LAYERS-RAG §3.2: BM25-lite pristop BREZ vektorske baze — pri ~660
 * zapisih je deterministično leksično iskanje pošteno, testljivo, brez
 * stroškov in deluje povsod (sandbox / Vercel / Render). Vektorski
 * embeddingi so dokumentirani premik, če/-ko indeks zraste čez ~10k
 * zapisov (docs/DATA-LAYERS-RAG.md §6).
 *
 * Uteži: naslov ×3, sekcija ×2, opis ×1; jezikovna prednost ×1,4 (klient
 * prosi v "sl" → slovenski zapisi imajo rahlo prednost, a EN ne izpade —
 * iskanje je dvojezično, ker so tudi uporabniki).
 *
 * Geopovezava (T2 → T1 → zemljevid → dejanje): naslov zapisa STO se
 * ujema z imenom naše destinacije (normalizirano vsebovanje v obe smeri,
 * npr. STO "Piran" → naša destinacija Piran) → zadetek nosi slug za
 * "Odpri na zemljevidu" in "Dodaj v načrt".
 */

import cacheJson from "../../../data/sto-sources.json";
import { DESTINATIONS } from "@/lib/slovenia-data";
import type {
  StoLang,
  StoSearchHit,
  StoSourceRecord,
  StoSourcesCache,
} from "./types";

const CACHE = cacheJson as unknown as StoSourcesCache;

/** Stop-besede (SL + EN) — pogoste besede brez diskriminativne vrednosti. */
const STOPWORDS = new Set([
  // SL
  "in", "ali", "je", "so", "na", "v", "po", "za", "od", "do", "iz", "pri",
  "kaj", "kje", "kako", "kdaj", "bolj", "najbolj", "lep", "lepa", "lepo",
  "dobro", "dobra", "dobi", "rad", "rada", "hobi", "tudi", "samo", "vas",
  "nas", " jim", "bil", "bila", "bilo", "bi", "sem", "si", "jo", "me",
  "moj", "tvoj", "en", "ena", "eni", "dva", "tri", "dan", "dni",
  // EN
  "the", "a", "an", "and", "or", "is", "are", "was", "were", "be", "to",
  "of", "in", "on", "at", "for", "with", "from", "by", "about", "as",
  "what", "where", "how", "when", "which", "who", "whom", "this", "that",
  "these", "those", "it", "its", "i", "you", "we", "they", "my", "your",
  "our", "their", "best", "good", "great", "nice", "very", "more", "most",
  "some", "any", "can", "could", "would", "should", "will", "do", "does",
  "did", "have", "has", "had", "not", "no", "yes", "me", "us", "them",
  "day", "days", "trip", "travel", "visit", "see", "want", "like",
]);

/**
 * Normalizacija tokenv: lowercase, diakritiki (čšžć → cszc) in ločila ven.
 * Slovenščina brez diakritikih je pogosta v poizvedbah ("Pohorje" == "pohorje").
 */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replaceAll("č", "c")
    .replaceAll("š", "s")
    .replaceAll("ž", "z")
    .replaceAll("ć", "c")
    .replaceAll("đ", "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // preostali combining diacritics
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s: string): string[] {
  return normalizeText(s)
    .split(/[\s-]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/** Dolžina skupne predpone dveh nizov. */
function sharedPrefixLen(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/**
 * Ali se žeton pojavi v besedilu — ujemanje po skupni predponi:
 *   share(w, token) ≥ 4 znakov IN ≥ 2/3 krajšega niza.
 * Pokriva izpeljanke brez pravega stemmerja:
 *   "vino"→"vinograd" (4/4), "termalne"→"terme" (4/5),
 *   "otroki"→"otroci" (4/6), "pohodništvo"→"pohodniški" (celo).
 * Prag 2/3 loči sorodnice od naključij ("koper"⇏"kopal": 3 < 4).
 */
function tokenInText(token: string, normalizedText: string): boolean {
  if (!normalizedText) return false;
  for (const w of normalizedText.split(" ")) {
    if (w === token) return true;
    const shared = sharedPrefixLen(w, token);
    const minLen = Math.min(w.length, token.length);
    if (shared >= 4 && shared * 3 >= minLen * 2) return true;
  }
  return false;
}

/** Vnaprej pripravljeni normalizirani zapisi (enkrat na modul). */
interface IndexedRecord {
  record: StoSourceRecord;
  titleN: string;
  sectionN: string;
  descN: string;
}

const INDEX: IndexedRecord[] = CACHE.records.map((r) => ({
  record: r,
  titleN: normalizeText(`${r.title}`),
  sectionN: normalizeText(r.section),
  descN: normalizeText(r.description),
}));

/** Normalizirana imena destinacij za geopovezavo (T2 → T1). */
const DEST_INDEX = DESTINATIONS.map((d) => ({
  id: d.id,
  slug: d.slug,
  name: d.name,
  nameN: normalizeText(d.name),
}));

/**
 * Geopovezava: ime naše destinacije se pojavi v naslovu STO zapisa
 * (ali obratno — STO naslovi so daljši, npr. "Piran – mestna utripa").
 */
function geoMatch(titleN: string): StoSearchHit["destination"] | undefined {
  for (const d of DEST_INDEX) {
    if (!d.nameN || d.nameN.length < 3) continue;
    const words = titleN.split(" ");
    if (words.includes(d.nameN)) return { id: d.id, slug: d.slug, name: d.name };
  }
  return undefined;
}

export interface SearchOptions {
  /** Jezikovna prednost (×1,4) — ne izključuje drugega jezika. */
  lang?: StoLang;
  /** Število zadetkov (default 5). */
  limit?: number;
  /** Minimalna ocena (default 1). */
  minScore?: number;
}

/**
 * Iskanje po uradnih virih STO. Vrne zadetke, razvrščene po oceni padajoče.
 * Prazna/neznana poizvedba → prazen seznam (kličec odloči, kaj pomeni).
 */
export function searchStoSources(query: string, opts: SearchOptions = {}): StoSearchHit[] {
  const { lang, limit = 5, minScore = 1 } = opts;
  const tokens = tokenize(query ?? "");
  if (tokens.length === 0) return [];

  const hits: StoSearchHit[] = [];
  /** Dedupe po (normaliziran naslov + jezik): isti vir ima včasih več URL-jev
   *  (slovenia.info ima duplikate v llms.txt zbirkah) — obdržimo najboljši. */
  const bestByTitle = new Map<string, StoSearchHit>();

  for (const idx of INDEX) {
    let score = 0;
    for (const token of tokens) {
      if (tokenInText(token, idx.titleN)) score += 3;
      if (tokenInText(token, idx.sectionN)) score += 2;
      if (tokenInText(token, idx.descN)) score += 1;
    }
    if (score <= 0) continue;
    if (lang && idx.record.lang === lang) score *= 1.4;
    const hit: StoSearchHit = {
      record: idx.record,
      score: Math.round(score * 100) / 100,
      destination: geoMatch(idx.titleN),
    };
    const key = `${idx.record.lang}:${idx.titleN}`;
    const prev = bestByTitle.get(key);
    if (!prev || hit.score > prev.score) bestByTitle.set(key, hit);
  }

  for (const h of bestByTitle.values()) hits.push(h);

  return hits
    .filter((h) => h.score >= minScore)
    .sort((a, b) => b.score - a.score || a.record.title.localeCompare(b.record.title))
    .slice(0, limit);
}

/** Metadata indeksa (za javno transparentnost — /api/ai/sources). */
export function stoIndexStats(): { total: number; fetchedAt: string; byLang: Record<string, number> } {
  const byLang: Record<string, number> = {};
  for (const r of CACHE.records) byLang[r.lang] = (byLang[r.lang] ?? 0) + 1;
  return { total: CACHE.records.length, fetchedAt: CACHE.fetchedAt, byLang };
}
