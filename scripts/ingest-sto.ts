/**
 * ingest-sto.ts — ekstrakcija uradnih virov STO (slovenia.info) → data/sto-sources.json
 *
 * DATA-LAYERS-RAG (Task 27, T2 plast "Uradni viri"):
 * - Pridobi JAVNE llms.txt datoteke, ki jih je STO objavil z izrecnim
 *   namenom "for AI assistants, search engines, and large language models"
 *   (https://www.slovenia.info/llms.txt).
 * - Razčleni markdown povezave (- [naslov](url): opis) v normalizirane
 *   zapise {provider, lang, collection, section, title, url, description}.
 * - Zapiše data/sto-sources.json — VERZIONIRAN v git (diff pokaže, kaj se
 *   je pri STO spremenilo; uredniška kontrola namesto slepe avtomatike).
 *
 * Zagon (ročno / tedensko):  bun run scripts/ingest-sto.ts
 *
 * Etika: indeksiramo SAMO metapodatke (naslov/opis/povezava), ki jih STO
 * objavlja za AI porabo — brez scrapanja strani, brez zrcaljenja vsebin.
 */

import { writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

/** Viri, ki jih prenesemo (jeziki, ki jih podpiramo javno: sl + en). */
const STO_FILES = [
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
];

interface StoSourceRecord {
  id: string;
  provider: "slovenia-info";
  lang: "sl" | "en";
  collection: "guide" | "stories";
  section: string;
  title: string;
  url: string;
  description: string;
}

interface StoSourcesCache {
  fetchedAt: string;
  files: { url: string; records: number }[];
  records: StoSourceRecord[];
}

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
function parseLlms(
  text: string,
  lang: "sl" | "en",
  collection: "guide" | "stories"
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

async function main() {
  console.log("[ingest-sto] zagon ekstrakcije uradnih virov STO …");
  const cache: StoSourcesCache = {
    fetchedAt: new Date().toISOString(),
    files: [],
    records: [],
  };
  const seenGlobal = new Set<string>();

  for (const f of STO_FILES) {
    process.stdout.write(`  ↳ ${f.url} … `);
    try {
      const res = await fetch(f.url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const records = parseLlms(text, f.lang, f.collection).filter((r) => {
        if (seenGlobal.has(r.url)) return false; // guide EN+stories EN se lahko prekrivata
        seenGlobal.add(r.url);
        return true;
      });
      cache.files.push({ url: f.url, records: records.length });
      cache.records.push(...records);
      console.log(`${records.length} zapisov`);
    } catch (err) {
      console.log(`NAPAKA (${err instanceof Error ? err.message : err}) — datoteka preskočena`);
    }
  }

  const byLang = cache.records.reduce<Record<string, number>>((acc, r) => {
    acc[r.lang] = (acc[r.lang] ?? 0) + 1;
    return acc;
  }, {});
  const byCollection = cache.records.reduce<Record<string, number>>((acc, r) => {
    acc[r.collection] = (acc[r.collection] ?? 0) + 1;
    return acc;
  }, {});

  const outPath = resolve(process.cwd(), "data/sto-sources.json");
  await mkdir(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(cache, null, 2) + "\n", "utf-8");

  console.log(`[ingest-sto] skupaj ${cache.records.length} zapisov (jeziki: ${JSON.stringify(byLang)}, zbirke: ${JSON.stringify(byCollection)})`);
  console.log(`[ingest-sto] zapisano: ${outPath}`);
  if (cache.records.length === 0) {
    console.error("[ingest-sto] NOV CACHE JE PRAZEN — ohraniti starega (preveri povezljivost)");
    process.exit(1);
  }
}

main();
