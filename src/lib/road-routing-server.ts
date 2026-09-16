import https from "node:https";
import type { Itinerary } from "@/lib/types";
import {
  DESTINATION_COORDS,
  heuristicLeg,
  legKey,
  round5,
  type LegRoute,
  type LegRouteIndex,
} from "@/lib/road-routing";

// ============================================================================
// ROAD ROUTING — STREŽNIŠKI DEL (F5.6)
// ============================================================================
//
// OSRM klient + predpomnilnik + stikalna varovalka. Uvožen SAMO iz API poti
// (src/app/api/itinerary/**) — nikoli iz client komponent (node:https uvoz
// razbije client bundle; čiste dele plasti glej src/lib/road-routing.ts).
//
// OMREŽNA NIANSA (sandbox forenzika, 2026-09-15): globalni fetch (undici)
// s privzetim Happy-Eyeballs (autoSelectFamily) v tem okolju ETIMEDOUT-a na
// router.project-osrm.org — medtem ko curl/wget/python/openssl in Nodeov
// klasični https modul z EXPLICITNO family:4 povežejo v redu. Zato OSRM
// zahtevek izvede node:https z family:4 (deluje v Node in Bun; na Vercelu
// Node runtime prav tako).
//
// Varnost/vljudnost: timeout 2,5 s na zahtevek, sočasnost 4, varovalka
// (4 zaporedne napake → 10 minut brez omrežja), predpomnilnik 24 h / 600
// vnosov. VEDNO fail-open na hevristiko — nikoli izjema, nikoli zamuda čez
// proračun.
// ============================================================================

// ---------------------------------------------------------------------------
// PREDPOMNILNIK + STIKALNA VAROVALKA (circuit breaker)
// ---------------------------------------------------------------------------

interface CacheEntry {
  route: LegRoute;
  expiresAt: number;
}

/** Predpomnilnik parov → noge. Modul-scope (preživi znotraj procesa;
 *  na Vercelu živi na topli instanci lambda). */
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 600;

function cacheGet(key: string): LegRoute | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(key);
    return null;
  }
  return hit.route;
}

function cacheSet(key: string, route: LegRoute): void {
  if (cache.size >= CACHE_MAX) {
    // Očisti potekle vnose; če je še vedno polno, odstrani najstarejšega.
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now > v.expiresAt) cache.delete(k);
    }
    if (cache.size >= CACHE_MAX) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
  }
  cache.set(key, { route, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Stikalna varovalka: 4 zaporedne napake → 10 minut izključen OSRM
 *  (prevencija: nezavedno podaljševanje odzivnega časa, ko je strežnik padel). */
const breaker = { failures: 0, openUntil: 0 };
const BREAKER_THRESHOLD = 4;
const BREAKER_COOLDOWN_MS = 10 * 60 * 1000;

function breakerOpen(): boolean {
  return Date.now() < breaker.openUntil;
}

function noteFailure(): void {
  breaker.failures += 1;
  if (breaker.failures >= BREAKER_THRESHOLD) {
    breaker.openUntil = Date.now() + BREAKER_COOLDOWN_MS;
  }
}

function noteSuccess(): void {
  breaker.failures = 0;
  breaker.openUntil = 0;
}

/** Testna/CLI pomoč: počisti stanje modula (predpomnilnik + varovalka). */
export function resetRoadRoutingState(): void {
  cache.clear();
  breaker.failures = 0;
  breaker.openUntil = 0;
}

// ---------------------------------------------------------------------------
// OSRM KLIČNIŠKA PLAST (injektirljiva za teste)
// ---------------------------------------------------------------------------

/** Javni OSRM demo strežnik (OpenStreetMap; profil driving). */
const OSRM_BASE =
  process.env.OSRM_BASE_URL?.replace(/\/$/, "") ||
  "https://router.project-osrm.org";

const OSRM_TIMEOUT_MS = 2500;
/** Sočasnost — vljudnost do javnega demo strežnika. */
const OSRM_CONCURRENCY = 4;

/**
 * Injektirljiv pridobivalec: URL → PARSED JSON (ali null ob napaki).
 * Privzeto node:https + family:4 (glej komentar zgoraj); testi vbrizgajo
 * svojega.
 */
export type OsrmJsonFetcher = (
  url: string,
  timeoutMs: number
) => Promise<unknown>;

interface OsrmRouteResponse {
  code?: string;
  routes?: {
    distance?: number; // metri
    duration?: number; // sekunde
    geometry?: { coordinates?: [number, number][] }; // geojson: [lng, lat]
  }[];
}

/**
 * Privzeti pridobivalec: node:https z family:4 + timeout. Vrne parsed JSON
 * ali null (timeout/napaka/HTTP ≠ 200). NIKOLI ne vrže.
 */
const defaultOsrmJsonFetcher: OsrmJsonFetcher = (url, timeoutMs) =>
  new Promise((resolve) => {
    const req = https.get(
      url,
      {
        family: 4, // glej komentar na vrhu datoteke (sandbox forenzika)
        timeout: timeoutMs,
        headers: {
          "User-Agent": "Discover-Slovenia-AI/1.0 (road routing)",
          Accept: "application/json",
        },
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume(); // izprazni socket
          resolve(null);
          return;
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          body += chunk;
          if (body.length > 2_000_000) req.destroy(); // varovalka velikosti
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.on("error", () => resolve(null));
  });

/**
 * EN zahtevek OSRM za en par točk. Vrne null ob kateri koli napaki
 * (timeout, HTTP ≠ 200, neveljaven JSON, code ≠ "Ok", manjkajoči poteki) —
 * klicnik potem uporabi hevristiko. NIKOLI ne vrže.
 */
async function fetchOsrmLeg(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  fetchJson: OsrmJsonFetcher
): Promise<LegRoute | null> {
  const url =
    `${OSRM_BASE}/route/v1/driving/` +
    `${a.lng.toFixed(6)},${a.lat.toFixed(6)};${b.lng.toFixed(6)},${b.lat.toFixed(6)}` +
    `?overview=simplified&geometries=geojson`;

  try {
    const data = (await fetchJson(url, OSRM_TIMEOUT_MS)) as
      | OsrmRouteResponse
      | null;
    if (!data || data.code !== "Ok" || !data.routes?.[0]) return null;
    const route = data.routes[0];
    if (
      typeof route.distance !== "number" ||
      typeof route.duration !== "number"
    ) {
      return null;
    }

    const geometry = route.geometry?.coordinates;
    const geometryLatlng: [number, number][] | undefined =
      Array.isArray(geometry) && geometry.length >= 2
        ? geometry.map(([lng, lat]) => [lat, lng] as [number, number])
        : undefined;

    return {
      km: round5(route.distance / 1000),
      min: round5(route.duration / 60),
      source: "osrm",
      geometry: geometryLatlng,
    };
  } catch {
    return null; // omrežje/JSON — vse enakovredno: hevristika
  }
}

// ---------------------------------------------------------------------------
// GRADNJA INDEKSA NOG ZA ITINERER
// ---------------------------------------------------------------------------

/**
 * Vsi pari zaporednih postankov itinererja (znotraj dni IN prek noči —
 * kvaliteta/stroški štejejo tudi prehode med dnevi), deduplicirano,
 * samo z znanimi koordinatami.
 */
function collectLegPairs(itinerary: Itinerary): [string, string][] {
  const ids = (Array.isArray(itinerary.days) ? itinerary.days : []).flatMap(
    (d) =>
      (Array.isArray(d.locations) ? d.locations : [])
        .map((l) => (typeof l.destination_id === "string" ? l.destination_id : ""))
        .filter((id) => DESTINATION_COORDS.has(id))
  );
  const seen = new Set<string>();
  const pairs: [string, string][] = [];
  for (let i = 1; i < ids.length; i++) {
    const key = legKey(ids[i - 1], ids[i]);
    if (!seen.has(key)) {
      seen.add(key);
      pairs.push([ids[i - 1], ids[i]]);
    }
  }
  return pairs;
}

/** Zmogljiv pripomoček: izvede obljube z omejeno sočasnostjo. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

/**
 * ENA cestna noga za poljuben par destinacij (po ID-jih): predpomnilnik →
 * OSRM → null (klicnik uporabi hevristiko). Backlog #5 "Postanki na poti":
 * detour izračun (A→s + s→B − A→B) potrebuje realne cestne razdalje za
 * pare, ki niso (nujno) del itinererja — ta getter deli predpomnilnik in
 * varovalko z buildLegRouteIndex ( isti vir kot značke ~km dni).
 *
 * Vrne null, če kateri ID ni v datasetu ALI OSRM ni na voljo — NIKOLI ne
 * vrže, NIKOLI ne ugiba.
 */
export async function getRoadLeg(
  aId: string,
  bId: string
): Promise<LegRoute | null> {
  const a = DESTINATION_COORDS.get(aId);
  const b = DESTINATION_COORDS.get(bId);
  if (!a || !b) return null;

  const key = legKey(aId, bId);
  const cached = cacheGet(key);
  if (cached) return cached;
  if (breakerOpen()) return null;

  const leg = await fetchOsrmLeg(a, b, defaultOsrmJsonFetcher);
  if (leg) {
    cacheSet(key, leg);
    noteSuccess();
    return leg;
  }
  noteFailure();
  return null;
}

export interface BuildLegIndexOptions {
  /** Injektirano za teste (privzeto node:https family:4 pridobivalec). */
  fetchJson?: OsrmJsonFetcher;
  /** Izklopi OSRM (vedno hevristika) — npr. za deterministične teste. */
  disableOsrm?: boolean;
}

/**
 * Zgradi indeks nog za itinerer: za vsak par zaporednih postankov poskusi
 * OSRM (predpomnilnik → omrežje), ob napaki hevristika. NIKOLI ne vrže in
 * NIKOLI ne zavlačuje mimo proračunom (sočasnost 4 × timeout 2,5 s).
 */
export async function buildLegRouteIndex(
  itinerary: Itinerary,
  options: BuildLegIndexOptions = {}
): Promise<LegRouteIndex> {
  const index: LegRouteIndex = new Map();
  const pairs = collectLegPairs(itinerary);
  if (pairs.length === 0) return index;

  const fetchJson = options.fetchJson ?? defaultOsrmJsonFetcher;
  const useOsrm = !options.disableOsrm && !breakerOpen();

  // 1) predpomnilnik (hitro, brez omrežja)
  const missing: [string, string][] = [];
  for (const [a, b] of pairs) {
    const key = legKey(a, b);
    const cached = cacheGet(key);
    if (cached) index.set(key, cached);
    else missing.push([a, b]);
  }

  // 2) OSRM za manjkajoče (če varovalka ni izključena)
  if (useOsrm && missing.length > 0) {
    await mapLimit(missing, OSRM_CONCURRENCY, async ([a, b]) => {
      const leg = await fetchOsrmLeg(
        DESTINATION_COORDS.get(a)!,
        DESTINATION_COORDS.get(b)!,
        fetchJson
      );
      if (leg) {
        cacheSet(legKey(a, b), leg);
        noteSuccess();
      } else {
        noteFailure();
      }
    });

    // ponovno preberi predpomnilnik — uspešni klici so ga napolnili
    for (const [a, b] of missing) {
      const key = legKey(a, b);
      const cached = cacheGet(key);
      if (cached) index.set(key, cached);
    }
  }

  // 3) hevristika za vse, ki ostanejo brez realnih podatkov
  for (const [a, b] of pairs) {
    const key = legKey(a, b);
    if (!index.has(key)) {
      index.set(key, heuristicLeg(DESTINATION_COORDS.get(a)!, DESTINATION_COORDS.get(b)!));
    }
  }

  return index;
}
