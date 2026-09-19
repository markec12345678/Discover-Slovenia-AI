// ============================================================================
// TRAVEL SUPPLY MAP — FSQ: DATASET LOADER + KATEGORIJSKA PRESLIKAVA
// (TASK 53, 1.58.0)
// ============================================================================
// Foursquare Open Places (OS Places) — APACHE-2.0 odprti podatki (z
// atribucijo). NIKOLI omrežje: čisto LOKALNA množica (najbližji vzorec:
// kiwitaxi/dataset.ts, a asinhrono z fs/promises).
//
// INGEST RUNBOOK (dokumentirana projektna konvencija — pretvorba je IZVEN
// adapterja, adapter NE odpira parquet datotek in NIMA odvisnosti za to):
//  1. Prenos: HuggingFace snapshot OS Places je GATED — dostop šele po
//     sprejetju pogojev uporabe pri Foursquare/OS Places (izrecno
//     strinjanje; shema je javna na docs.foursquare.com).
//  2. Pretvorba: slovenska podmnožica (filter kanonskega SI bbox-a) se
//     pretvori iz parquet V JSONL — EN kraj na vrstico, UTF-8, polja po
//     javni shemi „Places OS Data Schemas“ (fsq_id, name, latitude,
//     longitude, address, categories, tel, website, hours, stats, closed,
//     date_refreshed …).
//  3. Namestitev: .jsonl datoteke se položijo v FSQ_PLACES_DIR (privzeto
//     ./data/fsq-places, relativno na process.cwd() — enak vzorec kot
//     data/kiwitaxi-routes.json).
//  4. Življenje: adapter množico naloži LENOBNO ob prvem dostopu, nato
//     streže IZ POMNILNIKA; ob vsakem klicu preveri mtimes/datotečni žig
//     (dodana/prepisana .jsonl datoteka sproži ponovni nalagalni prehod —
//     namestitev nove kopije BREZ restarta procesa).
//
// KONFIGURACIJA (strežniški env):
//   FSQ_PLACES_DIR — mapa s .jsonl datotekami (absolutna ali relativna na
//                    cwd). Privzeto ./data/fsq-places. V TESTIH vedno
//                    prepišemo na začasno mapo (nikoli ne smemo dotakniti
//                    produkcijske poti repozitorija).
//
// ISKRENOST:
//  - mapa manjka / ni .jsonl / nič veljavnih krajev → „no-dataset“ (prazna
//    plast, NIKOLI napaka — zero throw);
//  - NEBERLIVA datoteka (EACCES/EBADF…) → datoteka preskočena + števec
//    (izolacija: dobra datoteka v isti mapi OSTANE strežena);
//  - neveljavna VRSTICA (ne-JSON / brez kritičnih polj) → preskočena +
//    števec; prazne vrstice (zaključni newline) tiho ignoriramo;
//  - kraj IZVEN kanonskega SI bbox-a → štet v skippedOutOfCountry (filter
//    SI: lat 45.4–46.9, lng 13.3–16.6 — kanonski približek meja Slovenije);
//  - kraj s closed === true → izločen (trajno zaprtega kraja NE ponujamo)
//    + ločen števec;
//  - podvojen fsq_id → prvi zmaga, nadaljnji šteti kot neveljavni.
// ============================================================================

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { ProductType } from "../../types";
import type { FsqPlace } from "./types";
import { isFsqPlace } from "./types";

// ---------------------------------------------------------------------------
// KANONSKI SI BBOX (filter države ob nalaganju — dokumentirana meja)
// ---------------------------------------------------------------------------

/** Kanonski približek meja Slovenije (deg): lat 45.4–46.9, lng 13.3–16.6. */
export const SI_BBOX = {
  latMin: 45.4,
  latMax: 46.9,
  lngMin: 13.3,
  lngMax: 16.6,
} as const;

/** Ali točka leži v kanonskem SI bbox-u (ingest filter države). */
export function inSloveniaBbox(lat: number, lng: number): boolean {
  return (
    lat >= SI_BBOX.latMin &&
    lat <= SI_BBOX.latMax &&
    lng >= SI_BBOX.lngMin &&
    lng <= SI_BBOX.lngMax
  );
}

// ---------------------------------------------------------------------------
// KATEGORIJSKA PRESLIKAVA: fsq label → kanonska taksonomija ProductType
// ---------------------------------------------------------------------------
// Javna shema kategorij (docs.foursquare.com „Places OS Data Schemas“ +
// uradni kategoriji nabor) — preslikamo POGOSTE oznake; VSE ostalo pošteno
// pade v zajemalni tip „poi“ (NE ugibamo). Ključi so MALE ČRKE natanko tako,
// kot jih pošilja vir (lowercase besedila label); akutirane različice
// („café“) dopolnjujemo z ASCII vzporednico („cafe“) — obrambno, ker se
// labeli med snapshoti razlikujejo v transkripciji.
// ---------------------------------------------------------------------------

export const FSQ_CATEGORY_MAP: Record<string, ProductType> = {
  // --- hrana in pijača → restaurant ---
  restaurant: "restaurant",
  café: "restaurant",
  cafe: "restaurant",
  "coffee shop": "restaurant",
  // --- nastanitve → accommodation ---
  hotel: "accommodation",
  hostel: "accommodation",
  "bed & breakfast": "accommodation",
  "bed and breakfast": "accommodation",
  // --- muzeji → museum ---
  museum: "museum",
  "art museum": "museum",
  "history museum": "museum",
  // --- narava → natural ---
  park: "natural",
  "nature preserve": "natural",
  lake: "natural",
  // --- religiozno → religious ---
  church: "religious",
  cathedral: "religious",
  monastery: "religious",
  // --- razgledišča → viewpoint ---
  viewpoint: "viewpoint",
  "scenic lookout": "viewpoint",
  // --- trgovine → shop („Shop|Store variants“) ---
  shop: "shop",
  store: "shop",
  boutique: "shop",
  supermarket: "shop",
  "grocery store": "shop",
  "shopping mall": "shop",
  "convenience store": "shop",
  "book store": "shop",
  "gift shop": "shop",
};

/** Zajemalni tip za kategorije brez preslikave (NE ugibamo). */
export const FSQ_FALLBACK_TYPE: ProductType = "poi";

/**
 * Preslikava kategorij kraja v kanonski tip: PRVA kategorija z znano
 * oznako zmaga (subcategory = njen label, očiščen); brez zadetka →
 * zajemalni „poi“ brez podtipa. Kategorije-kot-ID-ji (številke brez
 * labela) niso klasificabilne — pošteno preskočene.
 */
export function fsqCategoryType(place: FsqPlace): {
  type: ProductType;
  subcategory?: string;
} {
  const cats = Array.isArray(place.categories) ? place.categories : [];
  for (const c of cats) {
    if (typeof c !== "object" || c === null) continue; // goli ID brez labela
    const label = typeof c.label === "string" ? c.label : undefined;
    if (!label || label.trim().length === 0) continue;
    const mapped = FSQ_CATEGORY_MAP[label.trim().toLowerCase()];
    if (mapped) {
      return { type: mapped, subcategory: label.trim().slice(0, 80) };
    }
  }
  return { type: FSQ_FALLBACK_TYPE };
}

// ---------------------------------------------------------------------------
// NALAGANJE MNOŽICE (lenobno + sočasno-stisnjeno + mtime osveževanje)
// ---------------------------------------------------------------------------

/** Žig ene .jsonl datoteke (mtime + velikost — dir mtime NE zajame
 *  prepisa vsebine obstoječe datoteke, zato žigamo DATOTEKE). */
interface FsqFileStamp {
  name: string;
  mtimeMs: number;
  size: number;
}

/** Naložen indeks množice (strežemo IZ POMNILNIKA). */
export interface FsqDatasetIndex {
  /** Mapa, iz katere je bila množica naložena (env resolving). */
  dir: string;
  /** Žigovnik ob naložitvi (primerjava za osvežitev). */
  stamps: FsqFileStamp[];
  /** Kraji v vrstnem redu nalaganja (deterministično). */
  places: FsqPlace[];
  /** Indeks po fsq_id (identiteta vira). */
  byId: Map<string, FsqPlace>;
  /** mtime datoteke, iz katere prihaja posamezni kraj (lastUpdated pad). */
  fileMtimeMs: Map<string, number>;
  skippedInvalidLines: number;
  skippedOutOfCountry: number;
  skippedClosed: number;
  skippedUnreadableFiles: number;
  /** Date.now() ob naložitvi (diagnostika). */
  loadedAt: number;
}

/** Trenutno naložena generacija (null = še ni bilo uspešnega nalaganja). */
let index: FsqDatasetIndex | null = null;

/** Sočasna nalaganja delijo ENO izvedbo (coalescing — vzorec 44-b). */
let inflight: Promise<FsqDatasetIndex | null> | null = null;

/**
 * Pot do mape z množico: env FSQ_PLACES_DIR (absolutna ali relativna na
 * cwd) ali privzeta produkcijska pot ./data/fsq-places (RELATIVNO NA
 * process.cwd() — dev: projekt root; standalone bundle: vključena prek
 * outputFileTracingIncludes). V TESTIH vedno prepišemo na temp mapo!
 */
export function fsqDatasetDir(): string {
  const fromEnv = process.env.FSQ_PLACES_DIR?.trim();
  const raw = fromEnv && fromEnv.length > 0 ? fromEnv : path.join("data", "fsq-places");
  return path.resolve(process.cwd(), raw);
}

/** Zbira žige vseh .jsonl datotek v mapi (sortirano po imenu —
 *  deterministična primerjava). null = mapa manjka/ni berljiva. */
async function currentStamps(dir: string): Promise<FsqFileStamp[] | null> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    // manjkajoča mapa (svež klon brez ingesta) / napaka branja — ni
    // množice (iskren „no-dataset“, nikoli throw).
    return null;
  }
  const stamps: FsqFileStamp[] = [];
  for (const name of names.filter((n) => n.endsWith(".jsonl")).sort()) {
    try {
      const st = await stat(path.join(dir, name));
      // Žig vzamemo za VSE vnose s končnico .jsonl (stat sledi tudi
      // symlinkom — pri namestitvi kopij pravilno). Mapa z imenom
      // „*.jsonl“ bo pri branju padla v izolacijo (unreadable file).
      stamps.push({ name, mtimeMs: st.mtimeMs, size: st.size });
    } catch {
      // Datoteka je izginila med readdir in stat — naslednji prehod jo
      // pobere; ta prehod jo preprosto ne vidi.
    }
  }
  return stamps;
}

function stampsEqual(a: FsqFileStamp[], b: FsqFileStamp[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].name !== b[i].name ||
      a[i].mtimeMs !== b[i].mtimeMs ||
      a[i].size !== b[i].size
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Naloži množico iz mape (STROGA vrstična parse + SI filter + izločitev
 * zaprtih + dedupe po fsq_id). IZOLACIJA: napake posamezne datoteke/vrstice
 * NE podrejo nalaganja — štejejo se v števceh (iskrena telemetrija).
 */
async function loadIndex(dir: string, stamps: FsqFileStamp[]): Promise<FsqDatasetIndex> {
  const byId = new Map<string, FsqPlace>();
  const fileMtimeMs = new Map<string, number>();
  const places: FsqPlace[] = [];
  let skippedInvalidLines = 0;
  let skippedOutOfCountry = 0;
  let skippedClosed = 0;
  let skippedUnreadableFiles = 0;

  for (const s of stamps) {
    let content: string;
    try {
      content = await readFile(path.join(dir, s.name), "utf-8");
    } catch {
      // NEBERLIVA datoteka (EACCES/EBADF…): preskočena + šteta — dobra
      // datoteka v isti mapi OSTANE strežena (izolacija).
      skippedUnreadableFiles++;
      continue;
    }
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue; // prazna vrstica (zaključni
      // newline) ni napaka — standardna JSONL konvencija.
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        skippedInvalidLines++; // stroga parse — smeti odpadejo + števec
        continue;
      }
      if (!isFsqPlace(parsed)) {
        skippedInvalidLines++; // veljaven JSON, a ni kraj (kritična polja)
        continue;
      }
      const place = parsed as FsqPlace;
      // KANONSKI SI FILTER (ingest runbook dopušča širše množice — sami
      // izločimo izven-državne kraje, da zemljevid NE pina tujih točk).
      if (!inSloveniaBbox(place.latitude, place.longitude)) {
        skippedOutOfCountry++;
        continue;
      }
      if (place.closed === true) {
        skippedClosed++; // trajno zaprto — NE ponujamo
        continue;
      }
      if (byId.has(place.fsq_id.trim())) {
        skippedInvalidLines++; // podvojen identifikator vira
        continue;
      }
      byId.set(place.fsq_id.trim(), place);
      fileMtimeMs.set(place.fsq_id.trim(), s.mtimeMs);
      places.push(place);
    }
  }

  return {
    dir,
    stamps,
    places,
    byId,
    fileMtimeMs,
    skippedInvalidLines,
    skippedOutOfCountry,
    skippedClosed,
    skippedUnreadableFiles,
    loadedAt: Date.now(),
  };
}

/**
 * Trenutna množica (lenobno naložena; ob vsakem klicu žig-check mtimes —
 * sprememba datotek sproži ponovno nalaganje, sicer strežemo iz
 * pomnilnika). Vrne null kadar mapa ne obstaja (iskren „no-dataset“).
 * PRAZNA množica (0 krajev) je veljavna generacija — adapter po njej
 * prav tako poroča „no-dataset“ (ni veljavnih krajev).
 */
export async function getFsqDatasetIndex(): Promise<FsqDatasetIndex | null> {
  if (inflight) return inflight;
  const dir = fsqDatasetDir();
  const task = (async (): Promise<FsqDatasetIndex | null> => {
    const stamps = await currentStamps(dir);
    if (stamps == null) return null;
    if (index && index.dir === dir && stampsEqual(index.stamps, stamps)) {
      return index;
    }
    // Nova generacija (novo namestitev/mtimes) se ATOMARNO namesti kot
    // trenutni indeks — bralci nikoli ne vidijo polovične sestave.
    const loaded = await loadIndex(dir, stamps);
    index = loaded;
    return loaded;
  })();
  inflight = task;
  try {
    return await task;
  } finally {
    inflight = null;
  }
}

/** Telemetrija/UX stanje plasti (iskrenost: kaj strežemo + koliko zavrnjenih). */
export interface FsqDatasetStats {
  serving: "dataset" | "missing";
  dir: string;
  places: number;
  skippedInvalidLines: number;
  skippedOutOfCountry: number;
  skippedClosed: number;
  skippedUnreadableFiles: number;
  /** Najnovejši date_refreshed/mtime v množici (ISO) ali null. */
  lastUpdated: string | null;
}

/** Stanje množice brez nalaganja (kar je trenutno v pomnilniku). */
export function fsqDatasetStats(): FsqDatasetStats {
  const dir = fsqDatasetDir();
  if (!index || index.dir !== dir) {
    return {
      serving: "missing",
      dir,
      places: 0,
      skippedInvalidLines: 0,
      skippedOutOfCountry: 0,
      skippedClosed: 0,
      skippedUnreadableFiles: 0,
      lastUpdated: null,
    };
  }
  let lastMs: number | null = null;
  for (const p of index.places) {
    if (typeof p.date_refreshed === "string" && p.date_refreshed.trim().length >= 10) {
      const t = Date.parse(p.date_refreshed.trim());
      if (Number.isFinite(t)) lastMs = Math.max(lastMs ?? -Infinity, t);
    }
    const fm = index.fileMtimeMs.get(p.fsq_id.trim());
    if (typeof fm === "number") lastMs = Math.max(lastMs ?? -Infinity, fm);
  }
  return {
    serving: "dataset",
    dir: index.dir,
    places: index.places.length,
    skippedInvalidLines: index.skippedInvalidLines,
    skippedOutOfCountry: index.skippedOutOfCountry,
    skippedClosed: index.skippedClosed,
    skippedUnreadableFiles: index.skippedUnreadableFiles,
    lastUpdated: lastMs == null ? null : new Date(lastMs).toISOString(),
  };
}

/**
 * Testni hak / administracija: počisti indeks (naslednji dostop prisili
 * ponovno nalaganje z diska). Adapterjev resetFsqAdapterCaches() kliče to.
 */
export function resetFsqDataset(): void {
  index = null;
  inflight = null;
}
