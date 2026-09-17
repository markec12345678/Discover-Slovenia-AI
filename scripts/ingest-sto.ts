/**
 * ingest-sto.ts — uredniška ekstrakcija uradnih virov STO → data/sto-sources.json
 *
 * DATA-LAYERS-RAG (Task 27, T2 plast "Uradni viri"; 1.45.0 refactor):
 * - Razčlenjevanje živi v src/lib/rag/sto-llms.ts (SKUPNI parser za uredniški
 *   ingest IN runtime overlay — 1.45.0 freshness) ; ta skripta je tanek ovoj:
 *   prenesi → varovala → zapiši verzioniran git snapshot.
 * - Zapiše data/sto-sources.json — VERZIONIRAN v git (diff pokaže, kaj se
 *   je pri STO spremenilo; uredniška kontrola namesto slepe avtomatike).
 *   Runtime overlay (freshness.ts) leži NAD tem baseline-om in ga nikoli
 *   ne ogroža — snapshot ostaja resnica, ki jo pregleda človek.
 *
 * Zagon (ročno / ob raportu odmika iz /api/cron/sto-reingest):
 *   bun run scripts/ingest-sto.ts
 *
 * Etika: indeksiramo SAMO metapodatke (naslov/opis/povezava), ki jih STO
 * objavlja za AI porabo — brez scrapanja strani, brez zrcaljenja vsebin.
 */

import { writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { fetchStoSources } from "../src/lib/rag/sto-llms";

async function main() {
  console.log("[ingest-sto] zagon ekstrakcije uradnih virov STO …");
  // 30 s na datoteko — uredniški zagon ni na vroči poti (runtime ima 10 s).
  const fetched = await fetchStoSources({ timeoutMs: 30_000 });

  const byLang = fetched.records.reduce<Record<string, number>>((acc, r) => {
    acc[r.lang] = (acc[r.lang] ?? 0) + 1;
    return acc;
  }, {});
  const byCollection = fetched.records.reduce<Record<string, number>>((acc, r) => {
    acc[r.collection] = (acc[r.collection] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`[ingest-sto] datoteke: ${fetched.filesOk}/${3} uspešno`);
  for (const f of fetched.files) console.log(`  ↳ ${f.url} … ${f.records} zapisov`);

  if (!fetched.complete) {
    console.error(
      `[ingest-sto] DELEN PRENOS (${fetched.filesOk}/3 datotek) — snapshot NI pisan. ` +
        "Ponovi zagon, ko bo povezljivost vzpostavljena."
    );
    process.exit(1);
  }
  if (fetched.records.length === 0) {
    console.error("[ingest-sto] NOV CACHE JE PRAZEN — ohraniti starega (preveri povezljivost)");
    process.exit(1);
  }

  const outPath = resolve(process.cwd(), "data/sto-sources.json");
  await mkdir(dirname(outPath), { recursive: true });
  writeFileSync(
    outPath,
    JSON.stringify(
      { fetchedAt: fetched.fetchedAt, files: fetched.files, records: fetched.records },
      null,
      2
    ) + "\n",
    "utf-8"
  );

  console.log(
    `[ingest-sto] skupaj ${fetched.records.length} zapisov (jeziki: ${JSON.stringify(byLang)}, zbirke: ${JSON.stringify(byCollection)})`
  );
  console.log(`[ingest-sto] zapisano: ${outPath}`);
  console.log("[ingest-sto] naslednji korak: git diff data/sto-sources.json → pregled → commit");
}

main();
