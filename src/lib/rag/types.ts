/**
 * RAG tipi — T2 plast "Uradni viri" (DATA-LAYERS-RAG).
 *
 * Podatkovni model je namenoma ravn in brez odvisnosti: preprosti zapisi,
 * ki jih proizvede scripts/ingest-sto.ts (data/sto-sources.json) in jih
 * bere src/lib/rag/retrieve.ts. Brez Prisma modela — cache je verzioniran
 * v git (uredniška kontrola, deluje povsod, tudi na Vercel read-only FS).
 */

export type StoLang = "sl" | "en";

export type StoCollection = "guide" | "stories";

/** En uradni zapis STO (en zaznamek iz llms.txt). */
export interface StoSourceRecord {
  /** Determinističen id iz URL-ja (stable med ingesti). */
  id: string;
  provider: "slovenia-info";
  lang: StoLang;
  collection: StoCollection;
  /** Sekcija iz llms.txt (npr. "Aktivne počitnice", "Stories"). */
  section: string;
  title: string;
  url: string;
  description: string;
}

/** Format data/sto-sources.json (celoten indeks T2). */
export interface StoSourcesCache {
  fetchedAt: string;
  files: { url: string; records: number }[];
  records: StoSourceRecord[];
}

/** Zadetek iskanja z oceno relevantnosti in geopovezavo. */
export interface StoSearchHit {
  record: StoSourceRecord;
  /** Leksična ocena (title×3 + section×2 + description×1, jezikovna prednost ×1.4). */
  score: number;
  /** Geopovezava na našo destinacijo (T1), če se naslov ujema. */
  destination?: {
    id: string;
    slug: string;
    name: string;
  };
}

/** Citat, ki ga AI odgovor priloži UI-ju (podmnožica zapisa — varna za klient). */
export interface StoCitation {
  title: string;
  url: string;
  section: string;
  lang: StoLang;
  /** Interna povezava na našo stran destinacije (zemljevid), če obstaja zadetek. */
  destinationSlug?: string;
  destinationName?: string;
}
