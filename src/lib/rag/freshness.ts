/**
 * freshness.ts — runtime svežina T2 plasti "Uradni viri" (STO) — 1.45.0.
 *
 * Arhitektura trojne svežine (docs/DATA-LAYERS-RAG.md §7):
 *
 *   1. BASELINE  — git verzioniran data/sto-sources.json (uredniška
 *                  kontrola). Vedno prisoten, offline-varen, nikoli izgubljen.
 *   2. OVERLAY   — ta modul: pomnilniška plast SVEŽIH zapisov STO nad
 *                  baseline-om, nameščena po sanity gate-u. Živi v procesu
 *                  (Vercel: instanca; Render/sandbox: strežnik). NIKOLI ne
 *                  piše na disk in nikoli ne ogroža baseline-a.
 *   3. CRON      — /api/cron/sto-reingest (vercel.json, torek 07:30 UTC):
 *                  prisili osvežitev + javi ODMIK od baseline-a (dodani/
 *                  odstranjeni viri) — uredniški signal za ingest + commit.
 *
 * Ključne poštene lastnosti:
 *   - NE BLOKIRA: maybeRefreshStoIndex() je fire-and-forget — vroča pot
 *     (klepet, /api/ai/sources) streže baseline, dokler overlay ni nameščen;
 *     prva zahteva po TTL sproži osvežitev v ozadju, svežina velja od naslednje.
 *   - NEHA OB NAPAKI: padel STO pomeni baseline (starejši vsebinski odgovor
 *     je boljši kot noben); ponovni poskus najprej po 6 h (ne bombardiramo).
 *   - SANITY GATE: overlay sprejmemo SAMO če so vse 3 llms.txt datoteke OK in
 *     število zapisov ≥ max(100, 50 % baseline) — delni prenos ali
 *     patološko skrčenje STO ne more tiho pokvariti iskanja.
 *   - SINGLE-FLIGHT: vzporedni klici delijo en obljubo (ena sprožitev).
 */

import { fetchStoSources, STO_FILES } from "./sto-llms";
import { getStoBaselineCache, installStoOverlay, stoIndexStats } from "./retrieve";
import type { StoSourcesCache } from "./types";

/** Zapiski o zadnjem ciklu (za telemetrijo/raport). */
export interface RefreshOutcome {
  ok: boolean;
  /** "installed" | "rejected-sanity" | "failed" | "inflight" */
  reason: string;
  /** Skupno število zapisov novounameščene plasti (samo ob ok:true). */
  records?: number;
  filesOk?: number;
  fetchedAt?: string;
  /** Odmik od baseline (samo ob uspešni namestitvi — uredniški signal). */
  drift?: StoDrift;
}

/** Odmik overlay ↔ baseline — uredniški signal (kaj se je pri STO spremenilo). */
export interface StoDrift {
  added: number;
  removed: number;
  addedExamples: string[];
  removedExamples: string[];
}

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // uspešna osvežitev velja 7 dni
const RETRY_MS = 6 * 60 * 60 * 1000; // ob neuspehu nov poskus šele po 6 h
const MAX_EXAMPLES = 5;

let lastSuccessAt = 0;
let lastAttemptAt = 0;
let inflight: Promise<RefreshOutcome> | null = null;

/** Ali je sploh smiselno poskusiti (TTL / throttle / single-flight). */
function shouldAttempt(force: boolean): "fresh" | "recent-attempt" | "inflight" | "go" {
  if (inflight) return "inflight";
  if (!force && Date.now() - lastSuccessAt < TTL_MS) return "fresh";
  if (!force && Date.now() - lastAttemptAt < RETRY_MS) return "recent-attempt";
  return "go";
}

/** Sanity gate: sprejmi SAMO popoln, zdrav prenos. */
function passesSanityGate(records: number, filesOk: number, baselineTotal: number): boolean {
  if (filesOk < STO_FILES.length) return false;
  return records >= Math.max(100, Math.floor(baselineTotal / 2));
}

/** Odmik po URL-jih (id je izpeljan iz URL — enakovredna identiteta). */
export function diffStoDrift(overlay: StoSourcesCache, baseline: StoSourcesCache): StoDrift {
  const baseUrls = new Set(baseline.records.map((r) => r.url));
  const overUrls = new Map(overlay.records.map((r) => [r.url, r.title] as const));

  const addedExamples: string[] = [];
  let added = 0;
  for (const [url, title] of overUrls) {
    if (!baseUrls.has(url)) {
      added++;
      if (addedExamples.length < MAX_EXAMPLES) addedExamples.push(title || url);
    }
  }

  const overSet = new Set(overUrls.keys());
  const removedExamples: string[] = [];
  let removed = 0;
  for (const r of baseline.records) {
    if (!overSet.has(r.url)) {
      removed++;
      if (removedExamples.length < MAX_EXAMPLES) removedExamples.push(r.title || r.url);
    }
  }

  return { added, removed, addedExamples, removedExamples };
}

/**
 * Izvedi osvežitev (internal). Nikoli ne meče — napaka je del izida.
 */
async function doRefresh(): Promise<RefreshOutcome> {
  lastAttemptAt = Date.now();
  const baseline = getStoBaselineCache();

  try {
    const fetched = await fetchStoSources({ timeoutMs: 10_000 });

    if (!passesSanityGate(fetched.records.length, fetched.filesOk, baseline.records.length)) {
      // Poščeno razlikovanje vzroka: filesOk=0 → omrežje (failed); sicer
      // delni/boleč prenos, ki gate zavrne (rejected-sanity).
      const reason: RefreshOutcome["reason"] =
        fetched.filesOk === 0 ? "failed" : "rejected-sanity";
      console.warn(
        `[sto-freshness] overlay ZAVRNJEN (${reason}): ${fetched.records.length} zapisov / ` +
          `${fetched.filesOk}/${STO_FILES.length} datotek (baseline ${baseline.records.length}) — strežemo prejšnjo generacijo`
      );
      return {
        ok: false,
        reason,
        records: fetched.records.length,
        filesOk: fetched.filesOk,
      };
    }

    // Namestitev: citati/iskanje takoj vidijo sveže zapise v TEM procesu.
    const overlay: StoSourcesCache = {
      fetchedAt: fetched.fetchedAt,
      files: fetched.files,
      records: fetched.records,
    };
    installStoOverlay(overlay);
    lastSuccessAt = Date.now();

    const drift = diffStoDrift(overlay, baseline);
    console.log(
      `[sto-freshness] overlay nameščen: ${fetched.records.length} zapisov (baseline ` +
        `${baseline.records.length}; odmik +${drift.added}/-${drift.removed}) — fetchedAt ${fetched.fetchedAt}`
    );
    return {
      ok: true,
      reason: "installed",
      records: fetched.records.length,
      filesOk: fetched.filesOk,
      fetchedAt: fetched.fetchedAt,
      drift,
    };
  } catch (err) {
    // fetchStoSources sam ločuje partialne izide; sem pridemo le ob sistemski
    // napaki (npr. AbortSignal) — strežemo dalje prejšnjo generacijo, pošteno zapišimo.
    console.warn(
      `[sto-freshness] osvežitev NEUSPEŠNA (${err instanceof Error ? err.message : err}) — strežemo prejšnjo generacijo`
    );
    return { ok: false, reason: "failed" };
  }
}

/**
 * FIRE-AND-FORGET osvežitev za vroče poti (klepet, /api/ai/sources).
 *
 * Nikoli ne blokira, nikoli ne meče, nikoli ne podvojuje dela. Na Vercelu
 * se izvede v življenjski dobi instance (background po odgovoru je lahko
 * zrezan — zato klic RAZEN čakanja na AI generiranje, ki traja sekunde,
 * običajno dokonča še znotraj zahteve); na Render/sandbox strežniku živi
 * proces in cron (/api/cron/sto-reingest) plast ogreje PRED uporabniki.
 */
export function maybeRefreshStoIndex(): void {
  const verdict = shouldAttempt(false);
  if (verdict !== "go") return;
  inflight = doRefresh().finally(() => {
    inflight = null;
  });
}

/**
 * PRISILJENA osvežitev za cron — ČAKA na izid in vrne raport (z odmikom).
 * Uporabnik: /api/cron/sto-reingest (verifyCronAuth na strani rute).
 */
export async function forceRefreshStoIndex(): Promise<RefreshOutcome> {
  if (inflight) return inflight;

  inflight = doRefresh().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Trenutno stanje plasti (debug/transparentnost — vir + starost). */
export function stoFreshnessState(): {
  serving: "baseline" | "overlay";
  fetchedAt: string;
  total: number;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
} {
  const stats = stoIndexStats();
  return {
    serving: stats.source,
    fetchedAt: stats.fetchedAt,
    total: stats.total,
    lastSuccessAt: lastSuccessAt > 0 ? new Date(lastSuccessAt).toISOString() : null,
    lastAttemptAt: lastAttemptAt > 0 ? new Date(lastAttemptAt).toISOString() : null,
  };
}

/** Samo za teste/enote: ponastavi notranje stanje cikla. */
export function __resetFreshnessForTests(): void {
  lastSuccessAt = 0;
  lastAttemptAt = 0;
  inflight = null;
}
