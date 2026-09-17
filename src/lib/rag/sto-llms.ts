/**
 * sto-llms.ts — SKUPNI razčlenjevalnik STO llms.txt (T2 plast "Uradni viri").
 *
 * DATA-LAYERS-RAG §3.1 (1.45.0): ena implementacija razčlenjevanja za OBA
 * potoka svežine — uredniški ingest (scripts/ingest-sto.ts → git verzioniran
 * data/sto-sources.json) IN runtime overlay (src/lib/rag/freshness.ts →
 * pomnilniška plast nad baseline). Brez tega bi se parserja lahko razšla.
 *
 * Namenoma BREZ `@/` uvozov — ta modul uvaža tudi goli bun skript
 * (scripts/ingest-sto.ts), ki ne pozna tsconfig poti.
 *
 * Etika (nespremenjena od Taska 27): indeksiramo SAMO metapodatke
 * (naslov/opis/povezavo), ki jih STO objavlja z izrecnim namenom
 * "for AI assistants, search engines, and large language models"
 * (https://www.slovenia.info/llms.txt) — brez scrapanja strani.
 */

import type { StoCollection, StoLang, StoSourceRecord, StoSourcesCache } from "./types";

/** Viri, ki jih prenesemo (jeziki, ki jih podpiramo javno: sl + en). */
export const STO_FILES = [
  {
    url: "https://www.slovenia.info/sto-llms-sl.txt",
    lang: "sl" as const,
    collection: "guide" as const,
  },
  {
    url: "https://www.slovenia.info/sto-llms-en.txt",
    lang: "en" as const,
    collection: "guide" as const,
  },
  {
    url: "https://www.slovenia.info/sto-llms-stories-en.txt",
    lang: "en" as const,
    collection: "stories" as const,
  },
] as const;

/** Stabilen id iz URL-ja (determinističen, brez kriptografskih odvisnosti). */
function idFromUrl(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i++) {
    h = (Math.imul(31, h) + url.charCodeAt(i)) | 0;
  }
  return `sto-${(h >>> 0).toString(36)}`;
}

/** Odstrani nosilno blagovno znamko iz naslova zgodb ("| I feel Slovenia"). */
function cleanTitle(t: string): string {
  return t.replace(/\s*\|\s*I feel Slovenia\s*$/i, "").trim();
}

/** Razčleni eno llms.txt datoteko v zapise. */
export function parseLlms(
  text: string,
  lang: StoLang,
  collection: StoCollection
): StoSourceRecord[] {
  const out: StoSourceRecord[] = [];
  const seen = new Set<string>();
  let section = "";
  const BOM = "\uFEFF";

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(BOM, "");
    const sec = line.match(/^##\s+(.+)$/);
    if (sec) {
      section = sec[1].trim();
      continue;
    }
    const link = line.match(/^-\s+\[([^\]]+)\]\((https?:\/\/[^)]+)\):\s*(.+)$/);
    if (link) {
      const url = link[2].trim();
      if (seen.has(url)) continue; // dedupe (isti URL v več sekcijah)
      seen.add(url);
      out.push({
        id: idFromUrl(url),
        provider: "slovenia-info",
        lang,
        collection,
        section: section || (collection === "stories" ? "Stories" : "Splošno"),
        title: cleanTitle(link[1].trim()),
        url,
        description: link[3].trim(),
      });
    }
  }
  return out;
}

export interface FetchStoOptions {
  /** Časovna omejitev posamezne datoteke (default 10 s — runtime友好). */
  timeoutMs?: number;
}

/** Izid enega prenosa za raport. */
export interface StoFetchResult extends StoSourcesCache {
  /** Koliko od STO_FILES se je uspešno preneslo (0..3). */
  filesOk: number;
  /** True, če so VSE datoteke uspešno prenesene. */
  complete: boolean;
}

/**
 * Prenese in razčleni VSE llms.txt datoteke STO (vzporedno).
 *
 * NE meče napake ob delnem neuspehu — vrne rezultat z `complete: false`,
 * odločitev o sprejemu prepusti klicatelju (overlay sanity gate / uredniška
 * kontrola). Praznega niza NE obravnavamo kot uspešen prazen prenos: datoteka,
 * ki se prenese kot 0 zapisov ali prazno telo, šteje kot NEUSPEH (STO vedno
 * objavi >100 zapisov na datoteko — prazno pomeni napako CDN/HTML namesto txt).
 */
export async function fetchStoSources(opts: FetchStoOptions = {}): Promise<StoFetchResult> {
  const timeoutMs = opts.timeoutMs ?? 10_000;

  const settled = await Promise.allSettled(
    STO_FILES.map(async (f) => {
      const res = await fetch(f.url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "user-agent": "DiscoverSloveniaAI/1.45 (+https://discoverslovenia.ai)" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} — ${f.url}`);
      const text = await res.text();
      const records = parseLlms(text, f.lang, f.collection);
      if (records.length === 0) throw new Error(`prazna datoteka (0 zapisov) — ${f.url}`);
      return { file: f, records };
    })
  );

  const files: StoSourcesCache["files"] = [];
  const records: StoSourceRecord[] = [];
  const seenGlobal = new Set<string>();
  let filesOk = 0;

  for (const s of settled) {
    if (s.status !== "fulfilled") {
      console.warn(`[sto-llms] preskočena datoteka: ${s.reason instanceof Error ? s.reason.message : s.reason}`);
      continue;
    }
    filesOk++;
    files.push({ url: s.value.file.url, records: s.value.records.length });
    for (const r of s.value.records) {
      if (seenGlobal.has(r.url)) continue; // guide EN + stories EN se lahko prekrivata
      seenGlobal.add(r.url);
      records.push(r);
    }
  }

  return {
    fetchedAt: new Date().toISOString(),
    files,
    records,
    filesOk,
    complete: filesOk === STO_FILES.length,
  };
}
