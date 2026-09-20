// ============================================================================
// TRAVEL SUPPLY MAP — KIWITAXI: DATASET LOADER (Task 43, 1.49.0)
// ============================================================================
// Trojna svežina (ISTI vzorec kot T2/STO plast, 1.45.0):
//  1. BASELINE: data/kiwitaxi-routes.json — git verzioniran, nastane z
//     uredniško skripto `bun run scripts/ingest-kiwitaxi.ts` (diff pregled
//     + commit = uredniška kontrola). Naložen LENOBNO ob prvem dostopu prek
//     fs (NE statični import!): 2,18 MB JSON v webpack grafu je pognal
//     pomnilnik dev prevajanja čez 2,5 GB → OOM kill (dokazano 18. 9. 2026,
//     svež start po praznem .next). fs dostop + outputFileTracingIncludes
//     (./data/**) je ISTI vzorec kot db/demo-seed.db (instrumentation.ts).
//  2. OVERLAY (runtime): /api/cron/kiwitaxi-reingest prenese CSV-je, jih
//     normalizira, prestavi skozi sanity vrata in ATOMARNO zamenja
//     dataset V POMNILNIKU. Overlay NIKOLI ne piše na disk (isti etični
//     vzorec kot STO): na Renderu (živ proces) ogreje vse uporabnike, na
//     Vercelu pa instača crona prejme le svoj primer — ostale strežejo
//     baseline (dokumentirana kompromis — je pošten, ker je baseline
//     tedensko osvežen z gitom).
//  3. NAPAKA VIRA: ingest odpove (429/timeout/delni prenos) → sanity
//     vrata NE pustijo nič skozi → strežemo prejšnjo generacijo (fail
//     STAREJŠE, nikoli prazne).
//
// Nalaganje baseline-a je izključno STREŽNIŠKO (route handlerji / cron /
// uredniška skripta) — noben odjemalski paket ne uvaža tega modula.
// ============================================================================

import { readFileSync } from "node:fs";
import path from "node:path";
import type { KiwiTaxiDataset } from "./types";
import { isKiwiTaxiDataset } from "./validate";

/**
 * Pot do baseline datoteke. dev: process.cwd() = projekt root; standalone
 * Docker/Vercel: datoteko v bundle vključi outputFileTracingIncludes
 * (next.config.ts „./data/**"). Vrne null, če datoteka manjka ali ni
 * berljiva/parsabilja — plast se iskreno izprazni („no-dataset" note).
 */
function loadBaseline(): KiwiTaxiDataset | null {
  try {
    const raw = readFileSync(
      path.join(process.cwd(), "data", "kiwitaxi-routes.json"),
      "utf-8"
    );
    const candidate = JSON.parse(raw) as unknown as KiwiTaxiDataset;
    return isKiwiTaxiDataset(candidate) ? candidate : null;
  } catch {
    // manjkajoča datoteka (svež klon brez ingesta) / napaka branja —
    // NAPAKA BRANJA se NE cachza kot „dataset obstaja, a je slab":
    // klicalci vidijo null (enako kot prej s statičnim uvozom).
    return null;
  }
}

/** Bazna generacija (izključno read-once pomnilniški cache). */
let baselineCache: KiwiTaxiDataset | null | undefined = undefined;

export function getKiwitaxiBaseline(): KiwiTaxiDataset | null {
  if (baselineCache === undefined) baselineCache = loadBaseline();
  return baselineCache;
}

/** Trenutno nameščena generacija (atomarna menjava — bralci nikoli ne
 *  vidijo polovične sestave; vzorec installStoOverlay). */
let current: KiwiTaxiDataset | null = null;

/** Testni hak: onemogoči baseline (simulacija „svež klon brez dataseta").
 *  Samo za teste — produkcijska koda tega nikoli ne kliče. */
let baselineDisabled = false;

/** Trenutno strežena generacija (overlay če je nameščen, sicer baseline). */
export function getKiwitaxiDataset(): KiwiTaxiDataset | null {
  if (current) return current;
  if (baselineDisabled) return null;
  return getKiwitaxiBaseline();
}

/**
 * Atomarna namestitev nove generacije (klicalci: cron ruta PO sanity
 * vratih). Obrambna validacija: pokvarjen kandidat se TIHO zavrne (isti
 * fail-safe kot bralna plast) — prejšnja generacija ostane.
 */
export function installKiwitaxiDataset(next: KiwiTaxiDataset): boolean {
  if (!isKiwiTaxiDataset(next)) return false;
  current = next;
  return true;
}

/** Telemetrija/UX stanje plasti (iskrenost: kaj strežemo + kako sveže). */
export function kiwitaxiDatasetStats(): {
  serving: "overlay" | "baseline" | "missing";
  fetchedAt: string | null;
  routes: number;
  pinnedRoutes: number;
} {
  const ds = current ?? (baselineDisabled ? null : getKiwitaxiBaseline());
  if (!ds) {
    return { serving: "missing", fetchedAt: null, routes: 0, pinnedRoutes: 0 };
  }
  return {
    serving: current ? "overlay" : "baseline",
    fetchedAt: ds.fetchedAt,
    routes: ds.counts.routes,
    pinnedRoutes: ds.counts.pinnedRoutes,
  };
}

/** Odpovej overlay + testni hak (testi). */
export function resetKiwitaxiDataset(): void {
  current = null;
  baselineDisabled = false;
}

/**
 * TASK 56 (P2-1) — MEMBERSHIP transferja v trenutno streženi generaciji.
 *
 * ID prostor: TRANSFER id-ji (razredi vozil — deep link /transfers/{id},
 * ki ga gradi cheapestTransferId/classes[].transferId), NE id-ji rut
 * (ktRouteById v selection-verify je DRUGI prostor: r.id).
 *
 * Meja zaupanja za /go/transfers?product={id}: veljaven FORMAT (števke)
 * še ni članstvo — fabricated ID (živi dokaz: 999999999 → prej 302 na
 * neobstoječ produkt) se danes dokaže NEodvisno od klienta proti
 * strežniškemu kanonu (lokalni dataset, 0 omrežnih klicev).
 *
 * Vrača:
 *  - true  → transfer obstaja v trenutni generaciji (baseline/overlay);
 *  - false → dataset je na voljo, transfer pa NE obstaja (fabricated);
 *  - null  → dataset NI na voljo (svež klon brez ingesta / testni hak) —
 *            članstva ni mogoče dokazati; klicalec NE sme kaznovati
 *            (isti duh kot ktRouteById undefined veja v selection-verify).
 */
export function kiwitaxiTransferExists(transferId: number): boolean | null {
  if (!Number.isInteger(transferId) || transferId <= 0) return false;
  const ds = getKiwitaxiDataset();
  if (!ds) return null;
  return ds.routes.some((r) =>
    r.classes.some((c) => c.transferId === transferId)
  );
}

/** Testni hak: simuliraj odsotnost baznega dataseta (samo testi!). */
export function disableKiwitaxiBaselineForTests(disabled: boolean): void {
  baselineDisabled = disabled;
}
