// ============================================================================
// MAP PINS — STATIČNI FSQ SLOJ ZEMLJEVIDA (Slovenija + zahodni Balkan)
// ============================================================================
// NAMEN (1.95.1): osnovni pogled zemljevida "VSA mesta" — bencinske,
// restavracije, nastanitve, trgovine … — iz POMNILNIŠKEGA FSQ indeksa
// (125.445 krajev SI+HR+ME+AL; filter celega območja ~8 ms, izmerjeno).
//
// ZAKAJ LOČENA PLAST (ne /api/supply/search): supply pipeline poganja ŽIVE
// OSM Overpass poizvedbe (15–30 s) + komercialne adapterje z gates —
// odlična za poglobljen "POI" sloj (rezervacije/izbira), prepočasena in
// predraga za osnovni pogled. Ta plast je ČISTO LOKALNA (nikoli omrežja):
//      dataset.ts → getFsqDatasetIndex() → isti indeks kot fsq adapter
// (en vir resnice, isti mtime refresh, isti kategoriji preslikavi).
//
// ZOOM-AWARE GOSTOTA (iskrenost + zmogljivost):
//   zoom ≤ 10 (regionalni pogled): GRID AGREGACIJA — velikost celice po
//     tabeli (z≤6: 1° … z10: 1/16°); vsaka NEPRAZNA celica = mehurček s
//     težiščem, številom in top-3 kategorijami (~50–350 celic na viewport,
//     vaznost ~30–60 KB). Približanje razkrije posamezne pina.
//   zoom ≥ 11 (lokalni pogled): posamezni pini, rangirani po dokazanih
//     recenzijah (stats.rating_count desc, fsq_id asc — ISTO rangiranje
//     kot fsq adapter), kap MAP_PINS_MAX_INDIVIDUAL (800) + iskren
//     "capped" (UI pove: prikazanih najboljše ocenjenih N od skupaj M).
//
// ISKRENOST (isti vzorec kot fsq adapter):
//   - množica manjka → mode "pins" s PRAZNIM seznamom + dataset: false
//     (NIČ izmišljenih mest, NIKOLI throw);
//   - ocena SAMO iz stats.rating (dokazano povezan par z rating_count);
//   - atribucija Apache-2.0 (Foursquare Open Places) v vsakem odgovoru —
//     klient jo izpiše (licenčna obveza).
// ============================================================================

import type { ProductType } from "@/lib/supply/types";
import { isProductType } from "@/lib/supply/taxonomy";
import {
  getFsqDatasetIndex,
  fsqCategoryType,
} from "@/lib/supply/providers/fsq/dataset";
import type { FsqPlace, FsqResolvedType } from "@/lib/supply/providers/fsq/types";
// ISSUE #4 §17 (VAL 5 sklop A): datum FSQ POSNETKA (konstanta) — svežina
// plasti se klasificira po njem (posnetek ≠ živo stanje), ločeno od
// lastUpdated (max date_refreshed/mtime = čas OSVEŽITVE namestitve).
import { FSQ_SNAPSHOT_DATE } from "@/lib/data-freshness";

// ---------------------------------------------------------------------------
// KONSTANTE
// ---------------------------------------------------------------------------

/** Nad tem zoomom strežemo POSAMEZNE pine; pri tem in nižje — grid celice. */
export const MAP_PINS_GRID_MAX_ZOOM = 10;

/** Kap posameznih pinov na odgovor (gostota pod nadzorom; grid nima kapa —
 *  število nepraznih celic je naravno omejeno z velikostjo viewporta). */
export const MAP_PINS_MAX_INDIVIDUAL = 800;

/** Tabela velikosti celic po zoomu (stopnjevanje ~2× na nivo). */
const CELL_DEG_TABLE: ReadonlyArray<{ maxZoom: number; deg: number }> = [
  { maxZoom: 6, deg: 1 },
  { maxZoom: 7, deg: 0.5 },
  { maxZoom: 8, deg: 0.25 },
  { maxZoom: 9, deg: 0.125 },
  { maxZoom: 10, deg: 0.0625 },
];

/** Velikost grid celice za dani zoom (čista funkcija — testabilna).
 *  Vrača 0 za zoom ≥ MAP_PINS_GRID_MAX_ZOOM + 1 (posamezni pini). */
export function mapPinsCellDeg(zoom: number): number {
  const z = Math.floor(
    typeof zoom === "number" && Number.isFinite(zoom) ? zoom : 6
  );
  for (const row of CELL_DEG_TABLE) {
    if (z <= row.maxZoom) return row.deg;
  }
  return 0;
}

/** Meja bbox površine (stopnjev °²) — zloraba varovalka (izjemno velik
 *  viewport pri visokem zoomu nima smisla; grid pri nizkem zoomu je
 *  površinsko neobčutljiv). */
const MAX_BBOX_AREA_DEG = 400;

// ---------------------------------------------------------------------------
// VRSTE (odgovor)
// ---------------------------------------------------------------------------

/** Grid celica — agregat krajev na območju celice. */
export interface MapPinCell {
  /** Težišče krajev v celici (povprečje — mehurček sedi "na mestih"). */
  lat: number;
  lng: number;
  /** Število krajev v celici (PO filtru kategorij). */
  count: number;
  /** Top-3 kategorije po številu (ikona/barva iz taksonomije klienta). */
  cats: { type: ProductType; count: number }[];
}

/** Posamezen pin (zoom ≥ 11). */
export interface MapPin {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** Kanonski tip (taksonomija). */
  type: ProductType;
  /** Podtip iz vira (npr. "Hotel" iz "Lodging > Hotel"). */
  sub?: string;
  /** Ocena 0–5 IZKLJUČNO iz stats.rating (samo kadar obstaja). */
  rating?: number;
  /** Število dokazanih recenzij (stats.rating_count). */
  ratingCount?: number;
}

export interface MapPinsDatasetInfo {
  /** Ali je množica fizično nameščena (iskreno). */
  installed: boolean;
  /** Skupno število krajev v množici (0 kadar ni nameščena). */
  places: number;
  /** Najnovejši date_refreshed v množici (ISO) ali null. */
  lastUpdated: string | null;
  /**
   * ISSUE #4 §17 (VAL 5 sklop A): datum FSQ POSNETKA ("2025-02-06",
   * konstanta FSQ_SNAPSHOT_DATE — en vir resnice v data-freshness.ts).
   * NAMERNO ločeno od lastUpdated: lastUpdated meri osvežitev NAŠE
   * namestitve (date_refreshed/mtime datotek), snapshotDate pa starost
   * VIRA samoga — posnetek je statičen in to odkrito povemo (klasificira
   * se kot "stale" po §17). Null kadar množica ni nameščena.
   */
  snapshotDate?: string | null;
}

export interface MapPinsResult {
  mode: "grid" | "pins";
  /** Grid celice (samo mode=grid). */
  cells: MapPinCell[];
  /** Posamezni pini (samo mode=pins). */
  pins: MapPin[];
  /** Vseh ujemajočih krajev v viewportu (PO filtru, PRED kapom). */
  total: number;
  /** Dejansko vrnjenih (celic ali pinov). */
  returned: number;
  /** Ali je bil individualni rezultat kap-an (iskrenost za UI). */
  capped: boolean;
  dataset: MapPinsDatasetInfo;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// PARSE POIZVEDBE (strežniška vrata — isti vzorec kot parseSupplyQuery)
// ---------------------------------------------------------------------------

export interface MapPinsQuery {
  bbox: [number, number, number, number];
  zoom: number;
  cats: ProductType[];
}

export type ParseMapPinsResult =
  | { ok: true; query: MapPinsQuery }
  | { ok: false; error: string };

/** Omejitev števila kategorij (enako kot supply search — kap 32). */
const MAX_CATS = 32;

export function parseMapPinsQuery(params: {
  bbox: string | null;
  zoom: string | null;
  cats: string | null;
}): ParseMapPinsResult {
  // bbox: "south,west,north,east" — obvezen, številen, smiseln.
  const rawBbox = (params.bbox ?? "").trim();
  if (!rawBbox) return { ok: false, error: "bbox required (south,west,north,east)" };
  const parts = rawBbox.split(",").map((s) => Number(s.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    return { ok: false, error: "bbox must be 4 finite numbers" };
  }
  const [s, w, n, e] = parts;
  if (s >= n || w >= e) {
    return { ok: false, error: "bbox must satisfy south<north and west<east" };
  }
  if (Math.abs(s) > 90 || Math.abs(n) > 90 || Math.abs(w) > 180 || Math.abs(e) > 180) {
    return { ok: false, error: "bbox out of geographic bounds" };
  }
  if ((n - s) * (e - w) > MAX_BBOX_AREA_DEG) {
    return { ok: false, error: "bbox area too large" };
  }

  // zoom: celo število 3–19 (isti razpon kot clampZoom v supply zoom.ts).
  const rawZoom = Number((params.zoom ?? "").trim());
  const zoom =
    Number.isFinite(rawZoom) ? Math.min(19, Math.max(3, Math.floor(rawZoom))) : 6;

  // cats: csv kanonskih tipov — dedupe, neznani ODPADNEJO (ne ugibamo);
  // prazen seznam po poizvedbi = VSE preslikane kategorije (klient pošlje
  // izbiro čipov; prazno pomeni "brez filtra" — enako kot supply search).
  const seen = new Set<ProductType>();
  const cats: ProductType[] = [];
  for (const token of (params.cats ?? "").split(",")) {
    const t = token.trim();
    if (!t) continue;
    if (!isProductType(t)) continue; // neznani tiho odpadejo (kap varovalka)
    if (seen.has(t)) continue;
    seen.add(t);
    cats.push(t);
    if (cats.length >= MAX_CATS) break;
  }

  return { ok: true, query: { bbox: [s, w, n, e], zoom, cats } };
}

// ---------------------------------------------------------------------------
// ČISTO JEDRO (sintetični kraji v teste — brez datotečnega sistema)
// ---------------------------------------------------------------------------

/** Ali točka leži v bbox (isti pogoj kot fsq adapter pointInBbox). */
function pointInBbox(
  lat: number,
  lng: number,
  bbox: [number, number, number, number]
): boolean {
  const [s, w, n, e] = bbox;
  return lat >= s && lat <= n && lng >= w && lng <= e;
}

/** Kanonski tip kraja (preslikava je v dataset.ts — en vir resnice). */
function typeOfPlace(p: FsqPlace): FsqResolvedType {
  return fsqCategoryType(p);
}

/** Ali kraj ustreza izboru kategorij (prazen cats = vsi). */
function catMatch(type: ProductType, cats: ProductType[]): boolean {
  return cats.length === 0 || cats.includes(type);
}

/**
 * Izračunaj pine za viewport nad DANIM seznamom krajev (čista funkcija).
 * Klient množice prihaja iz getFsqDatasetIndex() — isti kot fsq adapter.
 */
export function computeMapPins(
  places: ReadonlyArray<FsqPlace>,
  q: MapPinsQuery,
  dataset: MapPinsDatasetInfo
): MapPinsResult {
  const useGrid = q.zoom <= MAP_PINS_GRID_MAX_ZOOM;
  const now = new Date().toISOString();

  // Viewport + kategorije filter (enočasno — en prehod).
  const inView: Array<{ place: FsqPlace; type: ProductType; sub?: string }> = [];
  for (const p of places) {
    if (!pointInBbox(p.latitude, p.longitude, q.bbox)) continue;
    const { type, subcategory } = typeOfPlace(p);
    if (!catMatch(type, q.cats)) continue;
    inView.push({ place: p, type, sub: subcategory });
  }

  if (useGrid) {
    // === GRID AGREGACIJA ===
    const deg = mapPinsCellDeg(q.zoom);
    interface CellAcc {
      cellY: number;
      cellX: number;
      sumLat: number;
      sumLng: number;
      count: number;
      byCat: Map<ProductType, number>;
    }
    const cells = new Map<string, CellAcc>();
    for (const item of inView) {
      const cellY = Math.floor(item.place.latitude / deg);
      const cellX = Math.floor(item.place.longitude / deg);
      const key = `${cellY}:${cellX}`;
      let acc = cells.get(key);
      if (!acc) {
        acc = {
          cellY,
          cellX,
          sumLat: 0,
          sumLng: 0,
          count: 0,
          byCat: new Map(),
        };
        cells.set(key, acc);
      }
      acc.sumLat += item.place.latitude;
      acc.sumLng += item.place.longitude;
      acc.count += 1;
      acc.byCat.set(item.type, (acc.byCat.get(item.type) ?? 0) + 1);
    }

    // Deterministični vrstni red (celice po vrstah, nato stolpcih).
    const sortedCells = [...cells.values()].sort(
      (a, b) => a.cellY - b.cellY || a.cellX - b.cellX
    );

    const out: MapPinCell[] = sortedCells.map((acc) => {
      // Top-3 kategorije po številu (izenačenost: abecedno — deterministično).
      const cats = [...acc.byCat.entries()]
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
        .slice(0, 3)
        .map(([type, count]) => ({ type, count }));
      return {
        lat: acc.sumLat / acc.count,
        lng: acc.sumLng / acc.count,
        count: acc.count,
        cats,
      };
    });

    return {
      mode: "grid",
      cells: out,
      pins: [],
      total: inView.length,
      returned: out.length,
      capped: false,
      dataset,
      generatedAt: now,
    };
  }

  // === POSAMEZNI PINI ===
  // Rangiranje: dokazane recenzije desc, fsq_id asc (ISTO kot fsq adapter).
  const ranked = [...inView].sort((a, b) => {
    const ra = a.place.stats?.rating_count ?? 0;
    const rb = b.place.stats?.rating_count ?? 0;
    if (rb !== ra) return rb - ra;
    return a.place.fsq_id < b.place.fsq_id ? -1 : a.place.fsq_id > b.place.fsq_id ? 1 : 0;
  });
  const capped = ranked.length > MAP_PINS_MAX_INDIVIDUAL;
  const selected = capped ? ranked.slice(0, MAP_PINS_MAX_INDIVIDUAL) : ranked;

  const pins: MapPin[] = selected.map((item) => {
    const stats = item.place.stats;
    const rating =
      typeof stats?.rating === "number" &&
      Number.isFinite(stats.rating) &&
      stats.rating >= 0 &&
      stats.rating <= 5
        ? Math.round(stats.rating * 10) / 10
        : undefined;
    const ratingCount =
      typeof stats?.rating_count === "number" && Number.isFinite(stats.rating_count)
        ? Math.max(0, Math.floor(stats.rating_count))
        : undefined;
    return {
      id: item.place.fsq_id,
      name: item.place.name,
      lat: item.place.latitude,
      lng: item.place.longitude,
      type: item.type,
      ...(item.sub ? { sub: item.sub } : {}),
      ...(rating !== undefined ? { rating } : {}),
      ...(ratingCount !== undefined ? { ratingCount } : {}),
    };
  });

  return {
    mode: "pins",
    cells: [],
    pins,
    total: inView.length,
    returned: pins.length,
    capped,
    dataset,
    generatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// DATASET MOST (nalagalna plast — en vir resnice z fsq adapterjem)
// ---------------------------------------------------------------------------

/** Zadnje znano stanje množice (diagnostika; null kadar še ni bilo dostopa). */
function datasetInfoOf(idx: Awaited<ReturnType<typeof getFsqDatasetIndex>>): MapPinsDatasetInfo {
  if (!idx || idx.places.length === 0) {
    return {
      installed: false,
      places: idx?.places.length ?? 0,
      lastUpdated: null,
      snapshotDate: null,
    };
  }
  let lastMs: number | null = null;
  for (const p of idx.places) {
    if (typeof p.date_refreshed === "string" && p.date_refreshed.trim().length >= 10) {
      const t = Date.parse(p.date_refreshed.trim());
      if (Number.isFinite(t)) lastMs = Math.max(lastMs ?? -Infinity, t);
    }
  }
  return {
    installed: true,
    places: idx.places.length,
    lastUpdated: lastMs == null ? null : new Date(lastMs).toISOString(),
    // §17: posnetek VIRA (konstanta) — ne odvisen od naših mtimes.
    snapshotDate: FSQ_SNAPSHOT_DATE,
  };
}

/**
 * Poizvedba nad DEJANSKO množico (lenobno naloženo, mtime osveževanje —
 * enako kot fsq adapter). Množica manjka → iskren PRAZEN pins odgovor
 * (installed: false; NIKOLI throw, NIKOLI izmišljeni kraji).
 */
export async function queryMapPins(q: MapPinsQuery): Promise<MapPinsResult> {
  const idx = await getFsqDatasetIndex();
  const dataset = datasetInfoOf(idx);
  if (!idx || idx.places.length === 0) {
    return {
      mode: "pins",
      cells: [],
      pins: [],
      total: 0,
      returned: 0,
      capped: false,
      dataset,
      generatedAt: new Date().toISOString(),
    };
  }
  return computeMapPins(idx.places, q, dataset);
}

/** Atribucija vira (licenca Apache-2.0 — klient jo izpiše). */
export const MAP_PINS_SOURCE = {
  slug: "fsq",
  label: "Foursquare Open Places",
  license: "Apache-2.0",
} as const;
