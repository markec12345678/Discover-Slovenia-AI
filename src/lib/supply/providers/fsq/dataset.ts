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
//  1. Vir: Foursquare OS Places (Apache-2.0 z atribucijo) — primarna
//     distribucija fused.io na source.coop (S3, BREZ prijave):
//     https://data.source.coop/fused/fsq-os-places/<snapshot>/places/*.parquet
//     (HuggingFace zrcalo do-me/foursquare_places_100M je ISTA shema;
//     uradni HF foursquare/fsq-os-places je gated — ni potreben).
//  2. Ingest: `bun run fsq:ingest` (scripts/ingest-fsq.py ekstrakcija z
//     DuckDB httpfs range-pushdown + scripts/ingest-fsq.ts filtri).
//     KATEGORIJSKI OBSEG (editorial): ingest obdrži SAMO kraje z vsaj eno
//     preslikano kategorijo (nastanitve/jed in pijača/muzeji/žape/plaže/
//     bencin/…) — poslovne stavbe, frizerski saloni, tovarne ipd. NISO
//     potovalna ponudba (števci zavrnjenih se izpišejo ob ingestu).
//  3. Namestitev: .jsonl datoteke (po državah: si/hr/me/al) se položijo v
//     FSQ_PLACES_DIR (privzeto ./data/fsq-places, relativno na process.cwd()
//     — enak vzorec kot data/kiwitaxi-routes.json; dataset je git baseline).
//  4. Življenje: adapter množico naloži LENOBNO ob prvem dostopu, nato
//     streže IZ POMNILNIKA; ob vsakem klicu preveri mtimes/datotečni žig
//     (dodana/prepisana .jsonl datoteka sproži ponovni nalagalni prehod —
//     namestitev nove kopije BREZ restarta procesa).
//
// NAINSTALIRANA MNOŽICA (2026-09-20): snapshot 2025-02-06, štiri države
// (SI+HR+ME+AL, kanonski bbox približki spodaj), kategorije omejene na
// potovalno-relevanten nabor (glej FSQ_CATEGORY_MAP + fsqPlaceInScope).
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
//  - kraj IZVEN podprtih držav (SI+HR+ME+AL bbox približki) → štet v
//    skippedOutOfCountry (nalagalni filter regije — kanonski približki
//    meja, ne pravne meje);
//  - kraj s closed === true → izločen (trajno zaprtega kraja NE ponujamo)
//    + ločen števec;
//  - podvojen fsq_id → prvi zmaga, nadaljnji šteti kot neveljavni.
// ============================================================================

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { ProductType } from "../../types";
import type { FsqPlace } from "./types";
import { isFsqPlace } from "./types";
// TASK 85 (1.76.0): SI_BBOX živi v client-safe modulu (slovenia-bbox.ts),
// ker ga listing-geo-validation.ts uvaža v client bundle. Tukaj re-export,
// da vsi dosedanji uvozi ostanejo veljavni.
import { SI_BBOX } from "@/lib/slovenia-bbox";

export { SI_BBOX };

// ---------------------------------------------------------------------------
// PODPORTE DRŽAVE (nalagalni filter regije — dokumentirane meje)
// ---------------------------------------------------------------------------
// TASK 61 (1.61.0): regija razširjena iz SI na SI+HR+ME+AL (zahodni Balkan
// + Jadransko morje). To so KANONSKI BBOX PRIBLIŽKI (pravokotniki, ki
// pokrijejo ozemlje države ± robni presežki v sosednjih državah) — isti
// vzorec poštenosti kot prvotni SI_BBOX. Kraji znotraj SI bbox-a a zunaj
// Slovenije (npr. Trst/Videm/Dunaj pravokotnikovo) so možni in znani.

/** Podprte države FSQ plasti (nalagalni filter + razvrščanje po državi). */
export const SUPPORTED_COUNTRY_BBOXES = {
  SI: SI_BBOX,
  HR: { latMin: 42.3, latMax: 46.6, lngMin: 13.5, lngMax: 19.5 }, // Hrvaška
  ME: { latMin: 41.8, latMax: 43.6, lngMin: 18.3, lngMax: 20.5 }, // Črna gora
  AL: { latMin: 39.6, latMax: 42.7, lngMin: 19.2, lngMax: 21.1 }, // Albanija
} as const;

export type SupportedCountryCode = keyof typeof SUPPORTED_COUNTRY_BBOXES;

/** Država, v katere bbox pade točka (prvi zadetek po vrsti SI→HR→ME→AL),
 *  ali null, če točka ni v nobeni podprti državi. */
export function supportedCountryOf(
  lat: number,
  lng: number
): SupportedCountryCode | null {
  for (const [code, b] of Object.entries(SUPPORTED_COUNTRY_BBOXES)) {
    if (
      lat >= b.latMin &&
      lat <= b.latMax &&
      lng >= b.lngMin &&
      lng <= b.lngMax
    ) {
      return code as SupportedCountryCode;
    }
  }
  return null;
}

/** Ali točka leži v kanonskem SI bbox-u (ingest filter države). */
export function inSloveniaBbox(lat: number, lng: number): boolean {
  return (
    lat >= SI_BBOX.latMin &&
    lat <= SI_BBOX.latMax &&
    lng >= SI_BBOX.lngMin &&
    lng <= SI_BBOX.lngMax
  );
}

/** Ali točka leži v KATERI KOLI podprti državi (nalagalni filter regije). */
export function inSupportedCountryBbox(lat: number, lng: number): boolean {
  return supportedCountryOf(lat, lng) != null;
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
//
// TASK 61 (1.61.0): vir (fused distribucija) pošilja labela kot HIERARHIČNE
// POTI („Travel and Transportation > Lodging > Hotel“). fsqCategoryType
// zato ujema SEGMENTE poti (vsak segment ločeno, lowercase); ključi spodaj
// so za preproste labele ENAKO kot prej (zadompatibilno) + novi
// SEgment-ključi (starševski nivoji „lodging“/„dining and drinking“ in
// specifični terminali). Evidence števci (aktivni kraji regije SI+HR+ME+AL,
// snapshot 2025-02-06) v komentarjih.
// ---------------------------------------------------------------------------

export const FSQ_CATEGORY_MAP: Record<string, ProductType> = {
  // --- starševski nivoji hierarhije (TASK 61: pokrijejo VSE podtipe) ---
  lodging: "accommodation", // ~61k v regiji (hotel/hostel/B&B/vacation rental/resort/motel)
  "dining and drinking": "restaurant", // ~119k (restavracije/picerije/café/bari/pekarne…)

  // --- hrana in pijača → restaurant ---
  restaurant: "restaurant",
  café: "restaurant",
  cafe: "restaurant",
  "coffee shop": "restaurant",
  bar: "restaurant", // ~29k (vključno pub)
  pub: "restaurant",
  bakery: "restaurant", // ~5k
  "dessert shop": "restaurant", // ~4,4k
  "ice cream shop": "restaurant",

  // --- nastanitve → accommodation ---
  hotel: "accommodation",
  hostel: "accommodation",
  "bed & breakfast": "accommodation",
  "bed and breakfast": "accommodation",
  "vacation rental": "accommodation", // ~21k
  resort: "accommodation", // ~2,1k
  motel: "accommodation", // ~0,6k

  // --- muzeji → museum ---
  museum: "museum", // pokrije tudi art/history/science podtipe prek segmenta
  "art museum": "museum",
  "history museum": "museum",

  // --- narava → natural ---
  park: "natural", // ~4,4k
  "nature preserve": "natural",
  lake: "natural", // ~1,1k
  beach: "natural", // ~5,4k (Jadranska obala — Dubrovnik/Kotor!)
  mountain: "natural", // ~1,7k
  forest: "natural",
  garden: "natural", // ~0,7k
  river: "natural",
  "other great outdoors": "natural", // ~3,7k (izvorni zunanj-naravni žep)

  // --- religiozno → religious ---
  church: "religious", // ~3,6k
  cathedral: "religious",
  monastery: "religious",
  mosque: "religious", // ~0,4k (regija)
  synagogue: "religious",

  // --- razgledišča → viewpoint ---
  viewpoint: "viewpoint",
  "scenic lookout": "viewpoint", // ~1,5k

  // --- atrakcije → attraction (TASK 61) ---
  castle: "attraction", // ~0,6k
  monument: "attraction", // ~0,6k
  plaza: "attraction", // ~1,4k (evropska stara-mestna trgovje)
  theater: "attraction", // ~0,5k
  "opera house": "attraction",
  "concert hall": "attraction", // ~0,5k
  aquarium: "attraction",
  zoo: "attraction",

  // --- bencin → petrol (TASK 61; tip iz TASK 58) ---
  "fuel station": "petrol", // ~4,3k (regija; OSM sloj je v peskovniku mrtev)

  // --- trgovine → shop (POTROŠNIŠKO-relevantne; gradbene/modne NE) ---
  shop: "shop",
  store: "shop",
  boutique: "shop",
  supermarket: "shop", // ~2k
  "grocery store": "shop", // ~6,1k
  "shopping mall": "shop",
  "convenience store": "shop", // ~1,2k
  "book store": "shop",
  "gift shop": "shop",
  pharmacy: "shop", // ~2,1k
  drugstore: "shop", // ~2,2k
};

/** Zajemalni tip za kategorije brez preslikave (NE ugibamo). */
export const FSQ_FALLBACK_TYPE: ProductType = "poi";

/**
 * Segmenti hierarhične oznake vira („A > B > C“ → [a, b, c], lowercase,
 * očiščeno). Preprosta oznaka („Restaurant“) → en element — združljivo
 * s prejšnjimi snapshoti, ki so pošiljali preproste labele.
 */
function labelSegments(label: string): string[] {
  return label
    .split(">")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

/** Terminal (najbolj specifični) segment oznake, originalna velikost črk. */
function labelTerminal(label: string): string | undefined {
  const parts = label.split(">").map((s) => s.trim());
  const last = parts[parts.length - 1];
  return last && last.length > 0 ? last : undefined;
}

/**
 * Preslikava kategorij kraja v kanonski tip: PRVA kategorija z znanim
 * SEGMENTOM zmaga (hierarhična pot „… > Lodging > Hotel“ ujame „lodging“;
 * subcategory = TERMINAL segment („Hotel“) — najbolj specifična od vira).
 * Preproste oznake se obnašajo ENAKO kot prej (subcategory = oznaka).
 * Kategorije-kot-ID-ji (številke brez labela) niso klasificabilne — pošteno
 * preskočene. Brez zadetka → zajemalni „poi“ brez podtipa.
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
    for (const seg of labelSegments(label)) {
      const mapped = FSQ_CATEGORY_MAP[seg];
      if (mapped) {
        const terminal = labelTerminal(label);
        return {
          type: mapped,
          ...(terminal ? { subcategory: terminal.slice(0, 80) } : {}),
        };
      }
    }
  }
  return { type: FSQ_FALLBACK_TYPE };
}

/**
 * POTOVALNO-RELEVANTEN OBSEG (ingest filter, TASK 61): kraj je v obsegu,
 * če ima vsaj eno kategorijo, katerega KATERI KOLI segment je preslikan v
 * FSQ_CATEGORY_MAP. Uporablja ga scripts/ingest-fsq.ts (editorial odločitev:
 * poslovne stavbe/frizerski saloni/tovarne/modne trgovine NISO potovalna
 * ponudba — ne obremenjujejo pomnilnika niti zemljevida). Nalagalna plast
 * adapterja obsega NE preverja (živi v ingestu; adapter streže množico, ki
 * je na disku).
 */
export function fsqPlaceInScope(place: FsqPlace): boolean {
  const cats = Array.isArray(place.categories) ? place.categories : [];
  for (const c of cats) {
    if (typeof c !== "object" || c === null) continue;
    const label = typeof c.label === "string" ? c.label : undefined;
    if (!label || label.trim().length === 0) continue;
    if (labelSegments(label).some((seg) => FSQ_CATEGORY_MAP[seg] != null)) {
      return true;
    }
  }
  return false;
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
      // FILTER PODPRTIH DRŽAV (nalagalna meja regije SI+HR+ME+AL — ingest
      // runbook dopušča širše množice, sami izločimo izven-regijske kraje,
      // da zemljevid NE pina tujih točk).
      if (!inSupportedCountryBbox(place.latitude, place.longitude)) {
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
