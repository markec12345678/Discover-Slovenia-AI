// ============================================================================
// TRAVEL SUPPLY MAP — KIWITAXI: INGESTION (Task 43, 1.49.0)
// ============================================================================
// Prenos + parsing CSV množic KiwiTaxi (server-side, NIKOLI browser —
// naročnikova zahteva §10: cron/server ingestion → validated dataset →
// server cache → viewport query; NE „browser ↓ giant CSV").
//
// Uporabniki:
//  1. scripts/ingest-kiwitaxi.ts (uredniška skripta → git baseline)
//  2. /api/cron/kiwitaxi-reingest (tedenska osvežitev → v pomnilniku
//     overlay po sanity vratih — STO vzorec: overlay NIKOLI ne piše na disk)
//
// VARNOST OB PRENOSU:
//  - fetch SLOMO na https://kiwitaxi.com/services/data/csv/* (fiksni host);
//  - security_token je JAVNI dokumentiran parameter (uradna dokumentacija:
//    „Currently, it's the same for everyone" — ni skrivnost);
//  - timeout (AbortSignal) + retry z EXPONENCIALNO pavzo (vir ima rate
//    limit — živo ugotovljen HTTP 429);
//  - kapika velikosti odgovora (150 MB — places.csv je ~63 MB, transfers
//    ~41 MB, routes ~12 MB; vse nad kapiko = neuspeh prenosa);
//  - TSV parsing: \n vrstice, \t polja, „\N" = NULL, glavna vrstica.
//
// Čist modul brez @/ uvozov (buni skripta IN Next pot uporabljata isti).
// ============================================================================

import { mapKiwiTaxiDataset, type KiwiMapperResult } from "./mapper";
import type {
  KiwiIngestResult,
  KiwiRawPlace,
  KiwiRawRoute,
  KiwiRawTransfer,
  KiwiRawTransferType,
} from "./types";

/** Javni varnostni žeton iz uradne dokumentacije (ni skrivnost). */
const SECURITY_TOKEN = "24e8a1c890fb0d16ecdce4926dc4b2d6";

const CSV_BASE = "https://kiwitaxi.com/services/data/csv";
/** Uradni bot-friendly UA z kontaktom (bonton do vira z rate limitom). */
const USER_AGENT =
  "Mozilla/5.0 (compatible; DiscoverSlovenia/1.0; +https://discoverslovenia.si)";

/** Kapika posameznega CSV odgovora (bytes). */
const MAX_CSV_BYTES = 150 * 1024 * 1024;
/** Timeout posameznega poskusa prenosa. */
const FETCH_TIMEOUT_MS = 120_000;
/** Največ poskusov na datoteko (429/5xx/omrežje) z naraščajočo pavzo. */
const MAX_ATTEMPTS = 4;
/** Pavza MED datotekami (vljudnost do vira z rate limitom). */
const INTER_FILE_DELAY_MS = 4_000;

export type KiwiCsvName =
  | "places"
  | "routes"
  | "transfer_types"
  | "transfers";

/** Prenese en CSV (retry + pavze + timeout + kapika velikosti). */
export async function fetchKiwiCsv(
  name: KiwiCsvName,
  opts: { signal?: AbortSignal } = {}
): Promise<string> {
  // payment_type je dokumentiran SAMO za transfers (privzeta vrednost
  // "partial") — drugim endpointom parametra ne pošiljamo.
  const url =
    name === "transfers"
      ? `${CSV_BASE}/transfers?security_token=${SECURITY_TOKEN}&payment_type=partial`
      : `${CSV_BASE}/${name}?security_token=${SECURITY_TOKEN}`;

  let lastError = "unknown";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (opts.signal?.aborted) throw new Error("aborted");
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      // Preklic od zunaj (request signal) prekine tudi posamezni poskus.
      const onOuterAbort = () => controller.abort();
      opts.signal?.addEventListener("abort", onOuterAbort, { once: true });
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": USER_AGENT, Accept: "text/csv,*/*" },
          signal: controller.signal,
          cache: "no-store",
        });
        if (res.status === 429 || res.status >= 500) {
          lastError = `HTTP ${res.status}`;
          throw new Error(lastError);
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (text.length === 0) throw new Error("empty-body");
        if (text.length > MAX_CSV_BYTES) throw new Error("oversized");
        return text;
      } finally {
        clearTimeout(timer);
        opts.signal?.removeEventListener("abort", onOuterAbort);
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : "fetch-error";
      if (attempt < MAX_ATTEMPTS) {
        // Eksponentna pavza: 8 s → 16 s → 32 s (vljudno do rate limita).
        await new Promise((r) => setTimeout(r, 8_000 * 2 ** (attempt - 1)));
      }
    }
  }
  throw new Error(`csv-download-failed:${name}:${lastError}`);
}

// ---------------------------------------------------------------------------
// TSV PARSING
// ---------------------------------------------------------------------------

/** Pretvori TSV besedilo v vrstice objektov (glavna vrstica = polja). */
export function parseTsv<T>(csvText: string): T[] {
  const lines = csvText.split("\n");
  // Zadnja (prazna) vrstica se odpusti; Windows CRLF se očisti.
  const rows: string[][] = [];
  for (const line of lines) {
    const cleaned = line.replace(/\r$/, "");
    if (cleaned.length === 0) continue;
    rows.push(cleaned.split("\t"));
  }
  if (rows.length < 2) return [];
  const header = rows[0];
  const out: T[] = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    const obj: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) {
      const v = cells[c] ?? "";
      obj[header[c]] = v === "\\N" ? "" : v;
    }
    out.push(obj as unknown as T);
  }
  return out;
}

// ---------------------------------------------------------------------------
// CELOTNI INGEST
// ---------------------------------------------------------------------------

export interface IngestOptions {
  signal?: AbortSignal;
  /** Preskoči prenose in prebere CSV-je iz lokalne mape (dev/testi). */
  cacheDir?: string;
  /** FS implementacija (Node fs za skripto; testi vbrizgajo lažnivo). */
  readFile?: (path: string) => Promise<string>;
}

/**
 * Prenese vse 4 CSV množice (places/routes/transfer_types/transfers) in
 * normalizira v dataset. Katakoli odpade → { ok:false, reason } — delnih
 * baz NE nameščamo (STO sanity filozofija).
 */
export async function ingestKiwiTaxi(opts: IngestOptions = {}): Promise<KiwiIngestResult> {
  const started = Date.now();
  try {
    const names: KiwiCsvName[] = ["places", "routes", "transfer_types", "transfers"];
    const texts = new Map<KiwiCsvName, string>();

    if (opts.cacheDir && opts.readFile) {
      // Lokalna predpomnilnica (dev skripta --cache; testi vbrizgajo fs).
      for (const n of names) {
        texts.set(n, await opts.readFile(`${opts.cacheDir}/${n}.csv`));
      }
    } else {
      // SEKVENCIALNI prenosi z vljudnimi pavzami (vir ima rate limit —
      // živo ugotovljen HTTP 429; vzporedni udar bi bil nevljuden in krhak).
      for (const n of names) {
        texts.set(n, await fetchKiwiCsv(n, { signal: opts.signal }));
        await new Promise((r) => setTimeout(r, INTER_FILE_DELAY_MS));
      }
    }

    const places = parseTsv<KiwiRawPlace>(texts.get("places")!);
    const routes = parseTsv<KiwiRawRoute>(texts.get("routes")!);
    const transferTypes = parseTsv<KiwiRawTransferType>(texts.get("transfer_types")!);
    const transfers = parseTsv<KiwiRawTransfer>(texts.get("transfers")!);

    if (places.length === 0 || routes.length === 0 || transfers.length === 0) {
      return { ok: false, reason: "empty-source", ms: Date.now() - started };
    }

    const { dataset, skipped }: KiwiMapperResult = mapKiwiTaxiDataset(
      { places, routes, transferTypes, transfers },
      new Date().toISOString()
    );

    if (dataset.routes.length === 0) {
      return { ok: false, reason: "no-routes-normalized", ms: Date.now() - started };
    }
    return { ok: true, reason: "ok", dataset, skipped, ms: Date.now() - started };
  } catch (e) {
    const reason = e instanceof Error ? e.message : "ingest-error";
    return { ok: false, reason, ms: Date.now() - started };
  }
}
