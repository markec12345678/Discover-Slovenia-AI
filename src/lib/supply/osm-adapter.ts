// ============================================================================
// TRAVEL SUPPLY MAP — OSM ADAPTER (F1, 1.49.0)
// ============================================================================
// LOKALNI vir (skupina "local") — NIKOLI komercialni inventar.
//
// KLJUČNI POPRAVEK F1 (audit + naročnik): /api/pois je pošiljal FIKSNI
// bbox cele Slovenije ne glede na viewport. Ta adapter poizvedba Overpass
// ZGOLJ po trenutnem viewportu (bbox), s cache ključem na zaokroženem
// bbox-u (navzven! — robovi viewporta nikoli ne odrežejo pinov) in
// izbranimi kategorijami.
//
// Infrastruktura: overpassFetch (retry ×3 + kumi mirror failover +
// časovni budget) — enako kot klepet/POI plast, le z bbox telesom.
// Cache: TTL 10 min (register), LRU 60 vnosov, NE cachamo praznine po
// napakah (vzorec overpass.ts).
// ============================================================================

import { overpassFetch } from "@/lib/overpass";
import { TAXONOMY } from "./taxonomy";
import type { ProductType, ProviderProduct, SupplyQuery } from "./types";
import { getProvider } from "./registry";
import type { SupplyAdapter } from "./adapter";
import type { ProviderRegistryEntry } from "./registry";

/** Predpomnilnik vnosov. */
interface OsmCacheEntry {
  expires: number;
  products: ProviderProduct[];
}
const CACHE_MAX = 60;

const cache = new Map<string, OsmCacheEntry>();
let lastCached = false;

/** Zaokroži bbox NAVZVEN na 0.02° (~1.5 km) — sosednje pan/skok ploščice
 *  zadene isti cache ključ, robovi nikoli ne odrežejo pinov. */
export function roundBboxOutward(
  bbox: [number, number, number, number]
): [number, number, number, number] {
  const [s, w, n, e] = bbox;
  return [
    Math.floor(s * 50) / 50,
    Math.floor(w * 50) / 50,
    Math.ceil(n * 50) / 50,
    Math.ceil(e * 50) / 50,
  ];
}

/** Cache ključ: zaokrožen bbox + razvrščene kategorije. */
export function osmCacheKey(
  bbox: [number, number, number, number],
  cats: string[]
): string {
  const [s, w, n, e] = roundBboxOutward(bbox);
  return `${s.toFixed(2)},${w.toFixed(2)},${n.toFixed(2)},${e.toFixed(2)}:${[...cats]
    .sort()
    .join(",")}`;
}

/**
 * Zgradi Overpass QL poizvedbo za bbox + kanonske kategorije.
 * Vrača null, če nobena od kategorij nima OSM filtrov.
 */
export function buildSupplyOverpassQuery(
  bbox: [number, number, number, number],
  cats: ProductType[],
  limit: number
): string | null {
  const filters = new Set<string>();
  for (const cat of cats) {
    for (const f of TAXONOMY[cat]?.osmFilters ?? []) filters.add(f);
  }
  if (filters.size === 0) return null;

  const [s, w, n, e] = roundBboxOutward(bbox);
  const bboxStr = `${s},${w},${n},${e}`;
  const body = [...filters].map((f) => `${f}(${bboxStr});`).join("\n    ");
  return `[out:json][timeout:25];
(
    ${body}
);
out center tags ${Math.min(limit, 800)};`;
}

/** Preslikava OSM tagov → kanonski ProductType + podtip. */
export function osmTagsToProductType(
  tags: Record<string, string>
): { type: ProductType; subcategory: string } | null {
  if (
    tags.tourism === "attraction" ||
    tags.tourism === "artwork" ||
    tags.historic === "monument" ||
    tags.historic === "castle"
  ) {
    return {
      type: "attraction",
      subcategory: tags.tourism || tags.historic || "attraction",
    };
  }
  if (tags.tourism === "museum") return { type: "museum", subcategory: "museum" };
  if (
    tags.amenity === "restaurant" ||
    tags.amenity === "cafe" ||
    tags.amenity === "bar" ||
    tags.amenity === "fast_food"
  ) {
    return { type: "restaurant", subcategory: tags.amenity };
  }
  if (
    tags.tourism === "hotel" ||
    tags.tourism === "hostel" ||
    tags.tourism === "guest_house" ||
    tags.tourism === "apartment" ||
    tags.tourism === "motel"
  ) {
    return { type: "accommodation", subcategory: tags.tourism };
  }
  if (tags.tourism === "viewpoint" || tags.tourism === "picnic_site") {
    return { type: "viewpoint", subcategory: tags.tourism };
  }
  if (
    tags.natural === "peak" ||
    tags.natural === "waterfall" ||
    tags.natural === "cave_entrance" ||
    tags.natural === "spring" ||
    tags.natural === "water" ||
    tags.natural === "beach"
  ) {
    return { type: "natural", subcategory: tags.natural };
  }
  if (tags.amenity === "place_of_worship" || tags.historic === "church") {
    return {
      type: "religious",
      subcategory: tags.amenity || tags.historic,
    };
  }
  if (tags.shop) return { type: "shop", subcategory: tags.shop };
  return null;
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/**
 * Normalizacija ENEGA Overpass elementa → ProviderProduct (ali null).
 * Preslikava je poštena: polja, ki jih OSM nima (cena, ocena,
 * razpoložljivost), OSTANEJO NEIZPOLNJENA — nikoli ne izmišljujemo.
 */
export function normalizeOsmElement(
  el: OverpassElement,
  lastUpdated: string
): ProviderProduct | null {
  const tags = el.tags ?? {};
  if (!tags.name) return null; // brez imena ni uporabno
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  const mapped = osmTagsToProductType(tags);
  if (!mapped) return null;

  const address = [
    tags["addr:street"],
    tags["addr:housenumber"],
    tags["addr:city"],
  ]
    .filter(Boolean)
    .join(" ");

  return {
    id: `osm:${el.type}-${el.id}`,
    provider: "osm",
    providerProductId: `${el.type}-${el.id}`,
    type: mapped.type,
    subcategory: mapped.subcategory,
    title: tags.name,
    description: tags.description || tags["description:sl"] || undefined,
    lat,
    lng,
    geoPrecision: "exact",
    address: address || undefined,
    image: tags.image || tags.wikimedia_commons || undefined,
    bookingMode: "info_only", // lokalni vir: kontakt/website, ne rezervacija
    sourceUrl: tags.website || tags["contact:website"] || undefined,
    lastUpdated,
    license: { source: "OpenStreetMap", attribution: "© OpenStreetMap" },
    phone: tags.phone || tags["contact:phone"] || undefined,
    openingHours: tags.opening_hours || undefined,
    wikidata: tags.wikidata || undefined,
    wikipedia: tags.wikipedia || undefined,
    cuisine: tags.cuisine || undefined,
  };
}

/** Počisti predpomnilnik (testi / admin). */
export function clearOsmCache(): void {
  cache.clear();
  lastCached = false;
}

// ---------------------------------------------------------------------------
// ADAPTER — edini AKTIVEN v F1 (register: osm.active === true)
// ---------------------------------------------------------------------------

export function createOsmAdapter(entry?: ProviderRegistryEntry): SupplyAdapter {
  const registryEntry = entry ?? getProvider("osm")!;
  const ttlMs = registryEntry.cacheTtlMs;

  return {
    entry: registryEntry,
    lastRunCached: () => lastCached,

    async search(q: SupplyQuery): Promise<ProviderProduct[]> {
      lastCached = false;
      if (!q.bbox) return []; // brez viewporta ni lokalne poizvedbe

      // Samo kategorije z OSM filtri; zoom prag kategorij je že
      // apliciran v search.ts (typesVisibleAtZoom) — tu je še en varovalni
      // prag adapterja (register.minZoom).
      const z = Math.floor(q.zoom);
      if (z < registryEntry.minZoom) return [];

      const cats = q.cats.filter((c) => (TAXONOMY[c]?.osmFilters?.length ?? 0) > 0);
      if (cats.length === 0) return [];

      const key = osmCacheKey(q.bbox, cats);
      const hit = cache.get(key);
      if (hit && Date.now() < hit.expires) {
        lastCached = true;
        return hit.products;
      }

      // Omejitev markerjev za zoom (zoom gating) + 20 % buffer za
      // dedupe/normalizacijo — Overpass `out ... N` limite elemente.
      const limit = Math.min(
        Math.round(
          Math.max(40, Math.min(800, (z - 6) * 90)) * 1.2
        ),
        800
      );
      const query = buildSupplyOverpassQuery(q.bbox, cats, limit);
      if (!query) return [];

      // Požrešnost pod nadzorom: supply nwr poizvedbe (bbox + več
      // kategorij) so živo izmerjeno ~10 s na overpass-api.de — poskusna
      // meja 12 s, skupni proračun 45 s. Peskovniško omrežje do Overpass
      // PLAHAJE (ECONNREFUSED v sekundnih oknih) — 5 glavnih poskusov s
      // premorom 1 s razširi okno prek slabih intervalov (klepetovi
      // around-poizvedbe ostanejo na 3 × 400 ms).
      const data = await overpassFetch(query, {
        budgetMs: 45_000,
        attemptTimeoutMs: 12_000,
        retryDelayMs: 1_000,
        maxMainAttempts: 5,
      });
      if (!data) {
        // Overpass nedosegljiv (vsi konektorji) — MEHKA NAPAKA: runner jo
        // zabeleži v degraded[], zemljevid pa ostane funkcionalen
        // (destinacije iz dataseta + iskren badge). NE cachamo praznine.
        throw new Error("overpass-unreachable");
      }

      const now = new Date().toISOString();
      const products: ProviderProduct[] = [];
      for (const el of (data.elements ?? []) as OverpassElement[]) {
        const product = normalizeOsmElement(el, now);
        if (product) products.push(product);
      }

      // Predpomnilnik (uspešni zadetki samo — ne napak/praznin po napaki).
      if (products.length > 0) {
        if (cache.size >= CACHE_MAX) {
          const toDelete = [...cache.keys()].slice(0, 10);
          for (const k of toDelete) cache.delete(k);
        }
        cache.set(key, { expires: Date.now() + ttlMs, products });
      }
      return products;
    },
  };
}
