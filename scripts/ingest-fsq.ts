/**
 * ingest-fsq.ts — uredniški ingest Foursquare OS Places → data/fsq-places/*.jsonl
 *
 * TASK 61 (1.61.0): DESETI aktivni sloj — LOKALNA odprta množica (Apache-2.0
 * z atribucijo). Dvostopenjska cev (poslovna logika SAMO tu, v TS — isti
 * moduli kot adapter, ni dvojnega vira resnice):
 *   1. scripts/ingest-fsq.py (python3 + duckdb httpfs) — „dumb pipe“:
 *      odkrije datoteke posnetka, ki se sekajo z regijo (parquet metapodatki
 *      — range-pushdown), izlušči vrstice v union bbox-u v vmesni JSONL (/tmp).
 *   2. TA skripta — filtri + preslikava v FsqPlace JSONL obliko:
 *      - regija: SUPPORTED_COUNTRY_BBOXES (SI+HR+ME+AL, kanonski približki);
 *      - obseg: fsqPlaceInScope (potovalno-relevantne kategorije — editorial);
 *      - zaprti kraji (date_closed) izločeni;
 *      - naslov sestavljen v formatted_address; kategorije → [{label}] (≤4);
 *      - izhod PO DRŽAVAH: data/fsq-places/{si,hr,me,al}.jsonl (git baseline
 *        — diff pokaže spremembe, uredniška kontrola, KT vzorec).
 *
 * Zagon:
 *   bun run fsq:ingest                       (privzeti posnetek 2025-02-06)
 *   bun run fsq:ingest -- --snapshot=2025-02-06 --keep-raw=/tmp/fsq-raw.jsonl
 *
 * Etika/licenca: Apache-2.0 z atribucijo (izpisuje mapper na vsakem
 * produktu); NE komercialni vir (info_only) — brez cen/razpoložljivosti.
 */

import { spawnSync } from "node:child_process";
import { createReadStream, existsSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, rename } from "node:fs/promises";
import * as readline from "node:readline";
import path from "node:path";

import {
  SUPPORTED_COUNTRY_BBOXES,
  supportedCountryOf,
  fsqPlaceInScope,
  type SupportedCountryCode,
} from "../src/lib/supply/providers/fsq/dataset";
import { isFsqPlace, type FsqPlace } from "../src/lib/supply/providers/fsq/types";

const DEFAULT_SNAPSHOT = "2025-02-06";
const HERE = path.dirname(new URL(import.meta.url).pathname);
const PROJECT = path.resolve(HERE, "..");
const OUT_DIR = path.join(PROJECT, "data", "fsq-places");

/** Vmesna (surova) vrstica ekstraktorja — oblika distribucije fused.io. */
interface RawRow {
  fsq_id?: string;
  name?: string;
  latitude?: number;
  longitude?: number;
  address?: string | null;
  locality?: string | null;
  region?: string | null;
  postcode?: string | null;
  country?: string | null;
  tel?: string | null;
  website?: string | null;
  email?: string | null;
  date_refreshed?: string | null;
  date_closed?: string | null;
  categories?: string[] | null;
}

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;

/** Dodelitev države: PRIMARNO lastno polje `country` vira (ISO koda —
 *  avtoriteta vira, pravilno za Zagreb/Kotor/Tirano kljub prekrivanju
 *  pravokotnikov); NADOMESTNO kanonski bbox, kadar vir kode nima. */
function countryOfRaw(
  r: RawRow,
  lat: number,
  lng: number
): SupportedCountryCode | null {
  const raw = str(r.country);
  if (raw != null) {
    const cc = raw.toUpperCase();
    if (cc === "SI" || cc === "HR" || cc === "ME" || cc === "AL") {
      return cc as SupportedCountryCode;
    }
    return null; // vir prijavlja TUJO državo — izven regije (bbox NE povozí)
  }
  // vir NE prijavlja države (~11 od 1,17 M) → kanonska bbox rezerva.
  return supportedCountryOf(lat, lng);
}

/** Sestavi formatted_address IZKLJUČNO iz delov vira (NE izmišljujemo). */
function formattedAddress(r: RawRow): string | undefined {
  const street = str(r.address);
  const locality = str(r.locality);
  const country = str(r.country);
  const parts = [street, locality, country].filter((p): p is string => p != null);
  return parts.length > 0 ? parts.join(", ").slice(0, 300) : undefined;
}

/** Preslikava surove vrstice v FsqPlace (polja, ki jih mapper dejansko bere). */
function toPlace(r: RawRow): FsqPlace | null {
  const fsqId = str(r.fsq_id);
  const name = str(r.name);
  if (
    fsqId == null ||
    name == null ||
    typeof r.latitude !== "number" ||
    !Number.isFinite(r.latitude) ||
    typeof r.longitude !== "number" ||
    !Number.isFinite(r.longitude)
  ) {
    return null;
  }
  const cats = Array.isArray(r.categories)
    ? r.categories
        .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
        .slice(0, 4)
        .map((label) => ({ label: label.slice(0, 160) }))
    : [];
  const place: FsqPlace = {
    fsq_id: fsqId,
    name,
    latitude: r.latitude,
    longitude: r.longitude,
    ...(cats.length > 0 ? { categories: cats } : {}),
    ...(formattedAddress(r) ? { address: { formatted_address: formattedAddress(r)! } } : {}),
    ...(str(r.tel) ? { tel: str(r.tel)!.slice(0, 60) } : {}),
    ...(str(r.website) ? { website: str(r.website)!.slice(0, 500) } : {}),
    ...(str(r.date_refreshed) ? { date_refreshed: str(r.date_refreshed) } : {}),
  };
  return isFsqPlace(place) ? place : null;
}

async function main() {
  const argSnapshot = process.argv.find((a) => a.startsWith("--snapshot="));
  const snapshot = argSnapshot ? argSnapshot.slice("--snapshot=".length) : DEFAULT_SNAPSHOT;
  const argKeep = process.argv.find((a) => a.startsWith("--keep-raw="));
  const argFromRaw = process.argv.find((a) => a.startsWith("--from-raw="));
  const rawPath =
    argFromRaw?.slice("--from-raw=".length) ??
    argKeep?.slice("--keep-raw=".length) ??
    path.join("/tmp", `fsq-raw-${Date.now()}.jsonl`);

  // Union bbox IZ kanonskih državnih bbox-ov (edini vir: TS modul).
  const boxes = Object.values(SUPPORTED_COUNTRY_BBOXES);
  const latMin = Math.min(...boxes.map((b) => b.latMin));
  const latMax = Math.max(...boxes.map((b) => b.latMax));
  const lngMin = Math.min(...boxes.map((b) => b.lngMin));
  const lngMax = Math.max(...boxes.map((b) => b.lngMax));
  console.log(
    `[fsq] regija: ${Object.keys(SUPPORTED_COUNTRY_BBOXES).join("+")} ` +
      `(lat ${latMin}–${latMax}, lng ${lngMin}–${lngMax}), posnetek ${snapshot}`
  );

  // 1) EKSTRAKCIJA (python3 + duckdb; dumb pipe) — razen če že imamo surovo
  //    množico (--from-raw: nadaljevanje/debug brez ponovnega prenosa).
  if (argFromRaw) {
    if (!existsSync(rawPath)) {
      console.error(`[fsq] --from-raw=${rawPath} NE OBSTOJA.`);
      process.exit(1);
    }
    console.log(`[fsq] 1/2 PRESKOČENA ekstrakcija (--from-raw=${rawPath}) …`);
  } else {
    console.log("[fsq] 1/2 ekstrakcija (python3 scripts/ingest-fsq.py — DuckDB httpfs pushdown) …");
    const py = spawnSync(
      "python3",
      [
        path.join(HERE, "ingest-fsq.py"),
        "--bbox",
        `${latMin},${latMax},${lngMin},${lngMax}`,
        "--snapshot",
        snapshot,
        "--out",
        rawPath,
      ],
      { stdio: "inherit", cwd: PROJECT }
    );
    if (py.status !== 0 || !existsSync(rawPath)) {
      console.error(`[fsq] NEUSPEH ekstrakcije (status ${py.status}) — nič NI nameščeno.`);
      process.exit(1);
    }
  }

  // 2) FILTRI + ZAPIS PO DRŽAVAH (TS poslovna logika).
  console.log("[fsq] 2/2 filtri (države + obseg + zaprti) in zapis po državah …");
  const byCountry = new Map<string, string[]>(); // vrstice JSONL
  let raw = 0;
  let skippedInvalid = 0;
  let skippedOutOfRegion = 0;
  let skippedClosed = 0;
  let skippedOutOfScope = 0;

  const rl = readline.createInterface({
    input: createReadStream(rawPath, "utf-8"),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const t = line.trim();
    if (t.length === 0) continue;
    raw++;
    let parsed: unknown;
    try {
      parsed = JSON.parse(t);
    } catch {
      skippedInvalid++;
      continue;
    }
    const r = parsed as RawRow;
    // zaprti kraji (distribucija nosi date_closed namesto bool)
    if (str(r.date_closed) != null) {
      skippedClosed++;
      continue;
    }
    const place = toPlace(r);
    if (place == null) {
      skippedInvalid++;
      continue;
    }
    // DRŽAVA: lastna koda vira primarno, bbox rezerva (Zagreb → HR kljub
    // prekrivanju s SI pravokotnikom; Dunaj/Beograd/Trst → izven).
    const country = countryOfRaw(r, place.latitude, place.longitude);
    if (country == null) {
      skippedOutOfRegion++;
      continue;
    }
    if (!fsqPlaceInScope(place)) {
      skippedOutOfScope++;
      continue;
    }
    const lines = byCountry.get(country) ?? [];
    lines.push(JSON.stringify(place, undefined, 0));
    byCountry.set(country, lines);
  }

  // Atomarna namestitev: .tmp → rename (nalagalnik vidi celo datoteko).
  await mkdir(OUT_DIR, { recursive: true });
  const order = ["SI", "HR", "ME", "AL"] as const;
  let total = 0;
  let bytes = 0;
  for (const code of order) {
    const lines = byCountry.get(code) ?? [];
    const file = path.join(OUT_DIR, `${code.toLowerCase()}.jsonl`);
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, lines.length > 0 ? lines.join("\n") + "\n" : "", "utf-8");
    await rename(tmp, file);
    total += lines.length;
    bytes += lines.reduce((a, l) => a + l.length + 1, 0);
    console.log(`[fsq]   ${path.relative(PROJECT, file)}: ${lines.length.toLocaleString()} krajev`);
  }
  if (!argKeep) rmSync(rawPath, { force: true });

  console.log(
    `[fsq] MNOŽICA NAMEŠČENA: ${total.toLocaleString()} krajev ` +
      `(${(bytes / 1e6).toFixed(1)} MB) iz ${raw.toLocaleString()} surovih — ` +
      `zavrnjenih: ${skippedOutOfScope.toLocaleString()} izven obsega (editorial), ` +
      `${skippedClosed.toLocaleString()} zaprtih, ${skippedOutOfRegion.toLocaleString()} izven regije, ` +
      `${skippedInvalid.toLocaleString()} neveljavnih.`
  );
}

main().catch((e) => {
  console.error("[fsq] NAPAKA:", e);
  process.exit(1);
});
