/**
 * ingest-kiwitaxi.ts — uredniški ingest KiwiTaxi CSV → data/kiwitaxi-routes.json
 *
 * TASK 43 (FIRST REAL PROVIDER, 1.49.0): tanek ovoj nad skupnim ingest
 * modulom (src/lib/supply/providers/kiwitaxi/ingest.ts — isti koda teče v
 * cron reingestu). Prenese 4 CSV množice (places/routes/transfer_types/
 * transfers — SEKVENCIALNO z vljudnimi pavzami, vir ima rate limit),
 * normalizira v dataset z obsegom „dotik Slovenije" in zapiše VERZIONIRAN
 * git baseline (diff pokaže spremembe cen/rut — uredniška kontrola).
 *
 * Zagon (ročno / ob raportu odmika iz /api/cron/kiwitaxi-reingest):
 *   bun run scripts/ingest-kiwitaxi.ts
 *   bun run scripts/ingest-kiwitaxi.ts --cache=/tmp/kt   (lokalne CSV kopije,
 *                                                        če smo jih pravkar
 *                                                        prenesli ročno)
 *
 * Etika/ licence: javni partner CSV (dokumentiran security_token), cene so
 * objavljene (ne živi citat), deep link vedno prek /go z pap parametrom.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { ingestKiwiTaxi } from "../src/lib/supply/providers/kiwitaxi/ingest";

async function main() {
  const cacheArg = process.argv.find((a) => a.startsWith("--cache="));
  const cacheDir = cacheArg ? cacheArg.slice("--cache=".length) : undefined;

  console.log(
    cacheDir
      ? `[ingest-kiwitaxi] zagon iz LOKALNEGA PREDPOMNILNIKA ${cacheDir} …`
      : "[ingest-kiwitaxi] zagon prenosa CSV množic (sekvencialno, ~2–5 min) …"
  );

  const result = await ingestKiwiTaxi({
    ...(cacheDir
      ? { cacheDir, readFile: (p: string) => Promise.resolve(readFileSync(p, "utf-8")) }
      : {}),
  });

  if (!result.ok || !result.dataset) {
    console.error(
      `[ingest-kiwitaxi] NEUSPEH (${result.reason}) v ${result.ms ?? "?"} ms — ` +
        "baseline NI pisan. Delnih prenosov ne nameščamo (sanity filozofija)."
    );
    process.exit(1);
  }

  const ds = result.dataset;
  const sk = result.skipped ?? { places: 0, routes: 0, transfers: 0 };

  console.log(`[ingest-kiwitaxi] prenos+normalizacija OK v ${result.ms} ms`);
  console.log(
    `  ↳ krajev: ${ds.counts.places} (zavrnjenih: ${sk.places}) · ` +
      `rut: ${ds.counts.routes} (zavrnjenih: ${sk.routes}) · ` +
      `transferjev: ${ds.counts.transfers} (zavrnjenih: ${sk.transfers})`
  );
  console.log(
    `  ↳ rut s pinom (prevzemno območje ima poligon): ${ds.counts.pinnedRoutes}/${ds.counts.routes}`
  );

  const outPath = resolve(process.cwd(), "data/kiwitaxi-routes.json");
  await mkdir(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(ds, null, 2) + "\n", "utf-8");

  console.log(`[ingest-kiwitaxi] zapisano: ${outPath}`);
  console.log(
    "[ingest-kiwitaxi] naslednji korak: git diff data/kiwitaxi-routes.json → pregled → commit"
  );
}

main();
