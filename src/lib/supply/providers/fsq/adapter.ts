// ============================================================================
// TRAVEL SUPPLY MAP — FSQ ADAPTER (TASK 53, 1.58.0)
// ============================================================================
// Peti realni SupplyAdapter (po osm/kiwataxi/viator/gyg). ČISTO LOKALEN
// vir — NIKOLI omrežja (najbližji vzorec: kiwitaxi/dataset.ts): Foursquare
// Open Places (OS Places, Apache-2.0) množica, nameščena kot .jsonl
// datoteke v FSQ_PLACES_DIR (glej dataset.ts za ingest runbook).
//
// CAPABILITY GATE (naročnik §2/§3):
//  - LICENCA: čista (Apache-2.0 z atribucijo — atribucijo izpisujemo na
//    VSAKEM produktu).
//  - DOSTOP:  podatkovna množica je GATED na HuggingFace (sprejetje
//    pogojev) in ŠE NI nameščena → adapter vrne PRAZEN sloj z iskreno
//    opombo „no-dataset“ (NIČ izmišljenih mest, NE simuliramo množice,
//    ZERO throw). Ko operater položi .jsonl datoteke v FSQ_PLACES_DIR,
//    plast oživi BREZ spremembe kode in BREZ restarta (mtime osveževanje).
//
// VIEWPORT: množica je v pomnilniku → poizvedba = čisti filter po bbox-u
// + vidnost tipov (q.cats — runner pošlje zoom-gateane kategorije; isti
// vzorec kot osm-adapter). BREZ bbox ni pina (iskreno „no-bbox“).
//
// ZOOM GATING: runner pokliče adapter SAMO ko je vsaj en FSQ tip med
// vidnimi kategorijami in zoom ≥ minZoom (12 — gostota POI-jev).
// ============================================================================

import type { ProviderProduct, SupplyQuery } from "../../types";
import type { ProviderRegistryEntry } from "../../registry";
import type { SupplyAdapter } from "../../adapter";
import type { FsqPlace } from "./types";
import { getFsqDatasetIndex, resetFsqDataset, fsqCategoryType } from "./dataset";
import { mapFsqPlaces } from "./mapper";

/** Kapika rezultatov adapterja (gostota pod nadzorom — POI vir je gost;
 *  globalni kap po zoomu doda search.ts). */
export const FSQ_MAX_RESULTS = 100;

// ---------------------------------------------------------------------------
// STANJE ADAPTERJA (telemetrija zadnjega zagona — per instanca procesa)
// ---------------------------------------------------------------------------

let lastCachedFlag = false;
let lastSkippedCount = 0;
let lastNote: string | undefined = undefined;

/**
 * Testni hak: počisti stanje adapterja + indeks množice (naslednji dostop
 * prisili ponovno nalaganje z diska).
 */
export function resetFsqAdapterCaches(): void {
  resetFsqDataset();
  lastCachedFlag = false;
  lastSkippedCount = 0;
  lastNote = undefined;
}

/** Diagnostika (testi/admin): zadnja opomba izvedbe adapterja. */
export function fsqLastNote(): string | undefined {
  return lastNote;
}

/** Ali točka leži v bbox poizvedbe (viewport filter). */
function pointInBbox(
  lat: number,
  lng: number,
  bbox: [number, number, number, number]
): boolean {
  const [s, w, n, e] = bbox;
  return lat >= s && lat <= n && lng >= w && lng <= e;
}

/**
 * lastUpdated posameznega kraja: date_refreshed (ISO iz vira) ALI mtime
 * datoteke množice (ISO) — pade na mtime tudi kadar je date_refreshed
 * neveljaven (smeti v odprtih podatkih NE smejo lomiti izpisa).
 */
function lastUpdatedOf(p: FsqPlace, fileMtimeMs: Map<string, number>, loadedAt: number): string {
  const dr = typeof p.date_refreshed === "string" ? p.date_refreshed.trim() : "";
  if (dr.length >= 10 && Number.isFinite(Date.parse(dr))) {
    return dr.length === 10 ? `${dr}T00:00:00.000Z` : dr;
  }
  const fm = fileMtimeMs.get(p.fsq_id.trim());
  return new Date(typeof fm === "number" ? fm : loadedAt).toISOString();
}

// ---------------------------------------------------------------------------
// ADAPTER
// ---------------------------------------------------------------------------

export function createFsqAdapter(entry: ProviderRegistryEntry): SupplyAdapter {
  return {
    entry,

    async search(q: SupplyQuery): Promise<ProviderProduct[]> {
      lastCachedFlag = false;
      lastSkippedCount = 0;
      lastNote = undefined;

      // === CAPABILITY GATE: množica mora FIZIČNO obstajati (brez nje NI
      //     podatkov — iskreno prazno, NIKOLI napaka / ZERO throw). ===
      const idx = await getFsqDatasetIndex();
      if (!idx || idx.places.length === 0) {
        // Mapa manjka / ni .jsonl / nič veljavnih krajev (ali so vsi
        // padli na SI filter/validacijo) — plast iskreno prazna.
        lastNote = "no-dataset";
        return [];
      }

      // Od tu naprej strežemo IZ POMNILNIŠKEGA INDEKSA (dataset JE
      // predpomnilnik te plasti — telemetrija cached=true).
      lastCachedFlag = true;

      // Viewport model: brez bbox ne moremo pošteno filtrirati.
      if (!q.bbox) {
        lastCachedFlag = false;
        lastNote = "no-bbox";
        return [];
      }

      // === VIEWPORT FILTER (točke v bbox-u — koordinate so TOČNE iz vira) ===
      const inView = idx.places.filter((p) =>
        pointInBbox(p.latitude, p.longitude, q.bbox!)
      );
      if (inView.length === 0) {
        lastNote = "no-match";
        return [];
      }

      // === VIDNOST TIPOV (q.cats — runner pošlje zoom-gateane kategorije;
      //     isti vzorec kot osm-adapter: produkti IZVEN vidnih tipov NE
      //     pridejo v odgovor). ===
      let visible = inView;
      let catFiltered = 0;
      if (q.cats.length > 0) {
        const cats = q.cats;
        visible = inView.filter((p) => cats.includes(fsqCategoryType(p).type));
        catFiltered = inView.length - visible.length;
        if (visible.length === 0) {
          lastNote = "cat-filtered";
          return [];
        }
      }

      // === VRSTNI RED: lastni signal vira (stats.rating_count — koliko
      //     dokazanih recenzij) desc, nato fsq_id asc (deterministično) —
      //     NE lastnega rangiranja. ===
      const sorted = [...visible].sort((a, b) => {
        const ra = a.stats?.rating_count ?? 0;
        const rb = b.stats?.rating_count ?? 0;
        if (rb !== ra) return rb - ra;
        return a.fsq_id < b.fsq_id ? -1 : a.fsq_id > b.fsq_id ? 1 : 0;
      });
      const capped = sorted.length > FSQ_MAX_RESULTS;
      const selected = capped ? sorted.slice(0, FSQ_MAX_RESULTS) : sorted;

      // === KANONSKA PRESLIKAVA (fail-closed per kraj) ===
      const { products, skipped: mappedSkipped } = mapFsqPlaces(selected, (p) => ({
        lastUpdated: lastUpdatedOf(p, idx.fileMtimeMs, idx.loadedAt),
      }));

      // Telemetrija zavrnjenih elementov vira: neveljavne vrstice +
      // izven-SI kraji + trajno zaprti + neberljive datoteke (nalagalna
      // plast jih je že preštela — poročamo jih vsak zagon, ker so del
      // iskrenosti „partial result“ te generacije množice) + preslikave,
      // ki so padle v mapperju (prazno ime po čiščenju …).
      lastSkippedCount =
        idx.skippedInvalidLines +
        idx.skippedOutOfCountry +
        idx.skippedClosed +
        idx.skippedUnreadableFiles +
        mappedSkipped;

      const notes: string[] = [];
      if (catFiltered > 0) notes.push("cat-filtered");
      if (capped) notes.push("capped");
      lastNote = notes.length > 0 ? notes.join("+") : undefined;

      return products;
    },

    lastRunCached(): boolean {
      return lastCachedFlag;
    },

    lastRunNote(): string | undefined {
      return lastNote;
    },

    lastRunSkipped(): number {
      return lastSkippedCount;
    },
  };
}
