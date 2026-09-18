import type { ChatPlace, PlaceCategory } from "@/lib/geo-intent";

// ============================================================================
// OVERPASS (T3 — splet v živo) — "Geo odgovori" (Task 29, 1.41.0)
// ============================================================================
// Strežniški klient za OpenStreetMap Overpass API, ki poišče KRAJE v
// bližini destinacije (hrana, pijača, tržnice, nastanitev, storitve).
//
// Nadgradnja Mindtrip vzorca: njihov chat prikaže gostilne na zemljevidu
// prek Google Maps plačljivega API-ja; mi uporabimo OSM (brezplačno,
// zasebnostno prijazno) + naš lastni pomnilniški cache.
//
// VAROVALA:
//  - Pokliče se SAMO kadar geo-intent prepozna lokacijo IN kategorijo
//    (chat API pravilo) — javni Overpass ne trpi nepotrebnih klicov.
//  - In-memory cache (TTL 10 min, max 50 vnosov) — ponovljena vprašanja
//    ("kje hrana v Ljubljani" od več uporabnikov) so takojšnja.
//  - Timeout 6 s (AbortController) — počasen Overpass ne zadrži klepeta:
//    AI odgovori brez krajev (graceful degradation).
//  - Rate limit že obstaja na /api/chat (20 klicev / 10 min / IP).
// ============================================================================

/** Okolica iskanja okoli centra destinacije (metri). */
const AROUND_RADIUS_M = 2500;

/** Koliko krajev največ vrnemo (berljivost mini zemljevida). */
const MAX_PLACES = 14;

/** Timeout posameznega poskusa (ms) — skupna latanca klepeta ostane < 7 s. */
const ATTEMPT_TIMEOUT_MS = 5000;

/**
 * Overpass konektorji po vrsti — glavni API + javni mirror (kumi).
 * Mirror je rezerva ob izpadih glavnega (Overpass je javna infrastruktura
 * z znanimi okni nedosegljivosti); vrstni red je tudi failover vrstni red.
 */
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

/** Kolikokrat poskusimo GLAVNI konektor (sandbox omrežje je včasih
 *  pihajoče — TCP ConnectionRefused se preprosto retry-a; prometna
 *  gorljivost ostane nizka ker so odbiti poskusi hitri ~300 ms). */
const MAIN_ATTEMPTS = 3;
/** Premor med poskusi (ms). */
const RETRY_DELAY_MS = 400;

const USER_AGENT = "DiscoverSlovenia-AI/1.41 (travel planner chat; contact: admin)";

interface OverpassJSON {
  elements?: Array<{
    type: string;
    id: number;
    lat?: number;
    lon?: number;
    center?: { lat: number; lon: number };
    tags?: Record<string, string>;
  }>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Overpass POST z retry + mirror failoverjem. Vrne parsan JSON ali null
 * (klicnik nadaljuje brez krajev — klepet nikoli ne crkne zaradi zemljevida).
 *
 * Poskusi: glavni konektor ×3 (premori 400 ms), nato mirror ×1.
 * Časovni proračun (`budgetMs`, default 8 s za klepet / 15 s za POI plasti):
 * pred vsakim poskusom preverimo, ali je za smiseln poskus (≥ 1,5 s)
 * še ostalo časa — počasen Overpass tako ne zadržuje odgovora klepeta.
 */
export async function overpassFetch(
  query: string,
  opts: { budgetMs?: number } = {}
): Promise<OverpassJSON | null> {
  const deadline = Date.now() + (opts.budgetMs ?? 8000);
  const attempts: Array<{ url: string }> = [];
  for (let i = 0; i < MAIN_ATTEMPTS; i++) {
    attempts.push({ url: OVERPASS_ENDPOINTS[0] });
  }
  attempts.push({ url: OVERPASS_ENDPOINTS[1] });

  for (let i = 0; i < attempts.length; i++) {
    const { url } = attempts[i];
    // Časovni proračun: za smiseln poskus mora ostati ≥ 1,5 s
    const remaining = deadline - Date.now();
    if (remaining < 1500) return null;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
        body: "data=" + encodeURIComponent(query),
        cache: "no-store",
        signal: AbortSignal.timeout(Math.min(ATTEMPT_TIMEOUT_MS, remaining)),
      });

      // 429 = rate limit / 5xx = preobremenjen strežnik — počakaj in
      // poskusi naslednji konektor (mirror); ostali 4xx brez retry-a
      // (napaka v poizvedbi)
      if (res.status === 429 || res.status >= 500) {
        if (i < attempts.length - 1) {
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        return null;
      }
      if (!res.ok) return null;

      return (await res.json()) as OverpassJSON;
    } catch {
      // Timeout / TCP refused / DNS — naslednji poskus (zadnji → null)
      if (i < attempts.length - 1) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      return null;
    }
  }
  return null;
}

/** OSM filter izrazi po naši kategoriji (nwr = node+way+relation). */
const CATEGORY_OSM_FILTERS: Record<PlaceCategory, string[]> = {
  food: [
    "nwr[amenity=restaurant]",
    "nwr[amenity=fast_food]",
    "nwr[amenity=food_court]",
    "nwr[amenity=cafe]",
  ],
  drinks: [
    "nwr[amenity=bar]",
    "nwr[amenity=pub]",
    "nwr[amenity=biergarten]",
    "nwr[amenity=cafe]", // kavarna je tudi "kje dobit pijačo"
  ],
  market: [
    "nwr[amenity=marketplace]",
    "nwr[shop=supermarket]",
    "nwr[shop=convenience]",
    "nwr[shop=greengrocer]",
    "nwr[shop=bakery]",
    "nwr[shop=wine]",
  ],
  stay: [
    "nwr[tourism=hotel]",
    "nwr[tourism=guest_house]",
    "nwr[tourism=hostel]",
    "nwr[tourism=motel]",
    "nwr[tourism=apartment]",
  ],
  service: [
    "nwr[amenity=fuel]",
    "nwr[amenity=pharmacy]",
    "nwr[amenity=atm]",
    "nwr[amenity=post_office]",
    "nwr[amenity=toilets]",
    "nwr[amenity=parking]",
  ],
  // 1.44: "source" (T2 uradni članek STO) se NE isče po OSM — nikoli ne
  // nastane iz uporabnikovega besedila (CATEGORY_MATCHERS) in nikoli ni
  // kandidat za Overpass; prazen seznam drži Record izčrpan (TypeScript).
  source: [],
  // 1.46: "destination" (T1 destinacija) prav tako NI Overpass kategorija —
  // nastane samo iz destinationToPlace (naša baza, ne OSM).
  destination: [],
};

/** Preslikava OSM tagov v našo kategorijo + podatek za "detail". */
function osmTagsToPlace(
  tags: Record<string, string>,
  lat: number,
  lng: number
): Pick<ChatPlace, "category" | "detail"> | null {
  if (tags.amenity === "restaurant" || tags.amenity === "fast_food" || tags.amenity === "food_court") {
    return {
      category: "food",
      detail: tags.cuisine?.split(";")[0]?.replace(/_/g, " ") || tags.amenity,
    };
  }
  if (tags.amenity === "cafe") return { category: "drinks", detail: tags.cuisine || "kavarna" };
  if (tags.amenity === "bar" || tags.amenity === "pub" || tags.amenity === "biergarten") {
    return { category: "drinks", detail: tags.cuisine || tags.amenity };
  }
  if (tags.amenity === "marketplace") return { category: "market", detail: "tržnica" };
  if (tags.shop) {
    const shopLabels: Record<string, string> = {
      supermarket: "supermarket",
      convenience: "trgovina",
      greengrocer: "sadjarna",
      bakery: "pekarna",
      wine: "vinoteka",
    };
    return { category: "market", detail: shopLabels[tags.shop] || tags.shop };
  }
  if (tags.tourism) {
    const stayLabels: Record<string, string> = {
      hotel: "hotel",
      guest_house: "gostišče",
      hostel: "hostel",
      motel: "motel",
      apartment: "apartma",
    };
    return { category: "stay", detail: stayLabels[tags.tourism] || tags.tourism };
  }
  if (tags.amenity) {
    const serviceLabels: Record<string, string> = {
      fuel: "bencinska",
      pharmacy: "lekarna",
      atm: "bankomat",
      post_office: "pošta",
      toilets: "WC",
      parking: "parkirišče",
    };
    return { category: "service", detail: serviceLabels[tags.amenity] || tags.amenity };
  }
  return null;
}

// ---------------------------------------------------------------------------
// IN-MEMORY CACHE — Map vstavlja po vrsti; pri prekoračitvi meje pobrišemo
// najstarejše (preprosti LRU). Po pomnilniški sliki: 50 vnosov × ~14 krajev
// ≈ zanemarljivo. Na Vercelu preživi toliko kot lambda.
// ---------------------------------------------------------------------------
interface CacheEntry {
  expires: number;
  places: ChatPlace[];
}
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 50;
const cache = new Map<string, CacheEntry>();

function cacheGet(key: string): ChatPlace[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.places;
}

function cacheSet(key: string, places: ChatPlace[]): void {
  if (cache.size >= CACHE_MAX) {
    // Pobriši najstarejša 10 vnosov (Map ohranja vrstni red vstavljanja)
    const toDelete = [...cache.keys()].slice(0, 10);
    for (const k of toDelete) cache.delete(k);
  }
  cache.set(key, { expires: Date.now() + CACHE_TTL_MS, places });
}

/** Ključ cache: zaokrožene koordinate (±~100 m) + razvrščene kategorije. */
function cacheKey(
  lat: number,
  lng: number,
  categories: PlaceCategory[]
): string {
  const rLat = lat.toFixed(2);
  const rLng = lng.toFixed(2);
  const cats = [...categories].sort().join(",");
  return `${rLat},${rLng}:${cats}`;
}

/**
 * Poišči kraje dane kategorije v okolici centra (Overpass, T3 plast).
 *
 * @param center   {lat, lng} destinacije iz geo-intenta (T1 dataset)
 * @param categories kategorije iz geo-intenta (hrana, pijača, …)
 * @returns        do 14 krajev, razvrščenih po "bogatosti" podatkov
 *                 (ime + odpiralni časi + naslov) — ali [] ob napaki
 *                 (klepet se nadaljuje brez zemljevida).
 */
export async function fetchOverpassNearby(
  center: { lat: number; lng: number },
  categories: PlaceCategory[]
): Promise<ChatPlace[]> {
  if (categories.length === 0) return [];

  const key = cacheKey(center.lat, center.lng, categories);
  const cached = cacheGet(key);
  if (cached) return cached;

  // Združi filtre vseh kategorij (dedupe — cafe je v food in drinks)
  const filters = new Set<string>();
  for (const cat of categories) {
    for (const f of CATEGORY_OSM_FILTERS[cat]) filters.add(f);
  }
  const around = `(around:${AROUND_RADIUS_M},${center.lat},${center.lng})`;
  const body = Array.from(filters)
    .map((f) => `${f}${around};`)
    .join("\n    ");

  const query = `[out:json][timeout:20];
(
    ${body}
);
out center tags 80;`;

  try {
    const data = await overpassFetch(query, { budgetMs: 8000 });
    if (!data) return [];

    const places: ChatPlace[] = [];
    const seen = new Set<string>();

    for (const el of data.elements ?? []) {
      const tags = el.tags ?? {};
      if (!tags.name) continue; // brez imena ni uporabno za priporočilo
      const lat = el.lat ?? el.center?.lat;
      const lng = el.lon ?? el.center?.lon;
      if (lat == null || lng == null) continue;

      const mapped = osmTagsToPlace(tags, lat, lng);
      if (!mapped) continue;

      const id = `osm-${el.type}-${el.id}`;
      if (seen.has(id)) continue;
      seen.add(id);

      const address = [tags["addr:street"], tags["addr:housenumber"]]
        .filter(Boolean)
        .join(" ");

      places.push({
        id,
        name: tags.name,
        lat,
        lng,
        category: mapped.category,
        provenance: "osm",
        detail: mapped.detail,
        openingHours: tags.opening_hours || undefined,
        address: address || undefined,
      });
    }

    // Rangiraj po bogatosti: odpiralni čas + naslov + kuhinja = bolj uporaben
    // kraj za popotnika (goli pin z imenom je slabša izkušnja)
    places.sort((a, b) => {
      const score = (p: ChatPlace) =>
        (p.openingHours ? 2 : 0) + (p.address ? 1 : 0) + (p.detail ? 1 : 0);
      return score(b) - score(a);
    });

    const limited = places.slice(0, MAX_PLACES);
    cacheSet(key, limited);
    return limited;
  } catch {
    // Timeout / napaka / rate limit Overpassa — klepet nadaljuje brez
    // zemljevida (AI ima še vedno T1 + T2 kontekst). NE cachamo praznine
    // za napake — drugi poskus lahko uspe.
    return [];
  }
}
