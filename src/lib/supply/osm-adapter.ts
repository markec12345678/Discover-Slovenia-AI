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
import { isSafeHttpUrl } from "@/lib/external-url";
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
let lastSkipped = 0;

/** AUDIT 42, točka 15 (SSRF/XSS): OSM tagi so JAVNO URE LJIVI — vsak
 *  `website`/`image` tag lahko hrani javascript:/data: URI ali zloben
 *  gostitelj. Meja zaupanja na NORMALIZACIJI (ista plast kot render
 *  safeExternalHref v ProductModalu — namerno OBA meji):
 *  - sourceUrl: samo http(s) (isSafeHttpUrl) — sicer izpustimo.
 *  - image: samo http(s) URL; wikimedia_commons „File:X.jpg“ je ime
 *    datoteke, NE URL — prevedemo v Commons Special:FilePath (s kreditom
 *    „Wikimedia Commons“); tags.image sprejmemo le z http(s) in kreditom
 *    „OpenStreetMap contributor“ (hotlink + atribucija, NIKOLI kopija). */
function safeOsmUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  return isSafeHttpUrl(trimmed) ? trimmed : undefined;
}

function osmImage(
  tags: Record<string, string>
): { url?: string; credit?: string } {
  const raw = tags.image?.trim();
  if (raw && isSafeHttpUrl(raw)) {
    return { url: raw, credit: "OpenStreetMap contributor" };
  }
  const commons = tags.wikimedia_commons?.trim();
  if (commons) {
    // Konvencija OSM: „File:Ime.jpg“ (ali „Category:…“ — slednjo izpustimo,
    // kategorija ni slika). Special:FilePath streži datoteko neposredno.
    const m = commons.match(/^File:(.+\.(?:jpe?g|png|gif|webp|svg|tiff?))$/i);
    if (m) {
      return {
        url: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(
          m[1]
        )}?width=800`,
        credit: "Wikimedia Commons",
      };
    }
  }
  return {};
}

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
    tags.tourism === "motel" ||
    tags.tourism === "camp_site" || // AUDIT 42, točka 1 — kampi
    tags.tourism === "chalet"
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
  // TASK 58 (potovanja): bencinske postaje — discovery/informacija (fuel).
  if (tags.amenity === "fuel") return { type: "petrol", subcategory: "fuel" };
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
 * Preslikava je poštena: polja, ki jih OSM nima (cena, ocena), OSTANEJO
 * NEIZPOLNJENA — nikoli ne izmišljujemo. Razpoložljivost je izrecno
 * not_supported (ODSM koncepta „dostopnost“ nima — audit 42, točka 11).
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

  const image = osmImage(tags);

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
    image: image.url,
    imageCredit: image.credit,
    availability: { status: "not_supported" },
    bookingMode: "info_only", // lokalni vir: kontakt/website, ne rezervacija
    sourceUrl: safeOsmUrl(tags.website) ?? safeOsmUrl(tags["contact:website"]),
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
  failureUntil.clear();
  inflight.clear();
  lastCached = false;
  lastSkipped = 0;
}

// ---------------------------------------------------------------------------
// TASK 44 dopolnitev (1.49.3): NEGATIVNI predpomnilnik okvar + združevanje
// sočasnih poizvedb (živa forenzika dev strežnika, 18. 9. 2026).
//
// Ugotovitev: overpass-api.de ECONNREFUSED (~300 ms × 5 glavnih poskusov)
// + kumi mirror "črna luknja" (TCP poveže, ne odgovori → 12 s timeout)
// ≈ 18,8 s do okvare — in ker okvara NI bila predpomnjena, je VSAKA supply
// poizvedba plačala celoten vzorec znova (tudi 2 vzporedni identična
// zahtevka brskalnika sta se NEODVISNO obesila). Izolacija je sicer držala
// (degraded: ["osm"], KiwiTaxi nemoten, odgovor iskren), a je zamuda
// plasti znašala ~19 s namesto ~5 ms.
//
// Utrditev (brez spremembe kanonskega modela ali budget uglaševanja):
//  1) FAILURE CACHE (per ključ): okvara zapomni ključ za 60 s → ponovljene
//     poizvedbe v oknu TAKOJ degradirajo (0 ms) in ne tolčejo javnega
//     Overpassa znova; po preteku okna naslednja poizvedba ponovno
//     poskusi (samoizterjava). Podatkov NE predpomnimo — samo stanje okvare
//     (prazna plast ostane iskreno "degraded", ne "prazno na novo").
//     Ključ = isti kot pozitivni cache (zaokrožen bbox + kategorije) —
//     drug viewport = svež poskus; globalni vezilni odklopnik NAMENOMA
//     ni uveden (429/504 na ENI poizvedbi ne sme blokirati vseh viewportov).
//  2) IN-FLIGHT COALESCING: sočasne poizvedbe z istim ključem se pridružijo
//     obstoječi obljubi — EN kos Overpass dela, ne N. Preklic prvega
//     odjemalca prekine skupni poskus (pritrujeni odjemalec vidi okvaro →
//     degraded; naslednja poizvedba poskusi znova) — dokumentirana meja.
// ---------------------------------------------------------------------------

/** Okno negativnega predpomnilnika (ms). */
const OSM_FAILURE_TTL_MS = 60_000;

/** Kdaj (epoha ms) sme ključ znova poskusiti Overpass. */
const failureUntil = new Map<string, number>();

/** Trenutno izvajajoče se poizvedbe po ključu (coalescing). */
const inflight = new Map<string, Promise<ProviderProduct[]>>();

// ---------------------------------------------------------------------------
// ADAPTER — edini AKTIVEN v F1 (register: osm.active === true)
// ---------------------------------------------------------------------------

/** Odvisnosti adapterja (testi vbrizgajo lažni fetch + kratek TTL okvar —
 *  produkcijska pot uporablja overpassFetch iz @/lib/overpass). */
export interface OsmAdapterDeps {
  fetch?: typeof overpassFetch;
  /** TTL negativnega predpomnilnika (ms); privzeto 60 s. */
  failureTtlMs?: number;
}

export function createOsmAdapter(
  entry?: ProviderRegistryEntry,
  deps?: OsmAdapterDeps
): SupplyAdapter {
  const registryEntry = entry ?? getProvider("osm")!;
  const ttlMs = registryEntry.cacheTtlMs;
  const fetchImpl = deps?.fetch ?? overpassFetch;
  const failureTtlMs = deps?.failureTtlMs ?? OSM_FAILURE_TTL_MS;

  return {
    entry: registryEntry,
    lastRunCached: () => lastCached,
    lastRunSkipped: () => lastSkipped,

    async search(q: SupplyQuery): Promise<ProviderProduct[]> {
      lastCached = false;
      lastSkipped = 0;
      if (!q.bbox) return []; // brez viewporta ni lokalne poizvedbe
      const bbox = q.bbox; // const veza: ozkočen tip preživi v execute zaprtju

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

      // TASK 44 (1.49.3): negativno okno — okvara tega ključa je še SVEŽA
      // → takojšnja degradacija (0 ms), brez novega zaporedja poskusov.
      const blockedUntil = failureUntil.get(key);
      if (blockedUntil != null) {
        if (Date.now() < blockedUntil) throw new Error("overpass-unreachable");
        failureUntil.delete(key); // okno je preteklo → svež poskus
      }

      // TASK 44 (1.49.3): sočasna identična poizvedba že teče → pridruži se
      // (en kos Overpass dela; oba klicalca delita uspeh ALI okvaro).
      const running = inflight.get(key);
      if (running) return running;

      const execute = async (): Promise<ProviderProduct[]> => {
        // Omejitev markerjev za zoom (zoom gating) + 20 % buffer za
        // dedupe/normalizacijo — Overpass `out ... N` limite elemente.
        const limit = Math.min(
          Math.round(
            Math.max(40, Math.min(800, (z - 6) * 90)) * 1.2
          ),
          800
        );
        const query = buildSupplyOverpassQuery(bbox, cats, limit);
        if (!query) return [];

        // Požrešnost pod nadzorom: supply nwr poizvedbe (bbox + več
        // kategorij) so živo izmerjeno ~10 s na overpass-api.de — poskusna
        // meja 12 s, skupni proračun 45 s. Peskovniško omrežje do Overpass
        // PLAHAJE (ECONNREFUSED v sekundnih oknih) — 5 glavnih poskusov s
        // premorom 1 s razširi okno prek slabih intervalov (klepetovi
        // around-poizvedbe ostanejo na 3 × 400 ms).
        const data = await fetchImpl(query, {
          budgetMs: 45_000,
          attemptTimeoutMs: 12_000,
          retryDelayMs: 1_000,
          maxMainAttempts: 5,
          signal: q.signal, // AUDIT 42: preklic odjemalca prekine poskuse
        });
        if (!data) {
          // Overpass nedosegljiv (vsi konektorji) — MEHKA NAPAKA: runner jo
          // zabeleži v degraded[], zemljevid pa ostane funkcionalen
          // (destinacije iz dataseta + iskren badge). NE cachamo praznine.
          // TASK 44 (1.49.3): zapomni okvaro za failureTtlMs —
          // ponovljena poizvedba v oknu degradira TAKOJ (brez 18,8 s
          // ponovljenega zaporedja poskusov na mrtvem viru).
          failureUntil.set(key, Date.now() + failureTtlMs);
          throw new Error("overpass-unreachable");
        }

        const now = new Date().toISOString();
        const products: ProviderProduct[] = [];
        for (const el of (data.elements ?? []) as OverpassElement[]) {
          const product = normalizeOsmElement(el, now);
          if (product) products.push(product);
          else lastSkipped++; // partial result — iskrena telemetrija
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
      };

      // Coalescing: registriraj obljubo, sprosti ključ ob zaključku.
      const run = execute();
      inflight.set(key, run);
      try {
        return await run;
      } finally {
        inflight.delete(key);
      }
    },
  };
}
