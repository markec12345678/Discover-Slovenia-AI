// ============================================================================
// TRAVEL SUPPLY MAP — AIRALO ADAPTER (Task 53, 1.58.0)
// ============================================================================
// PETI realni SupplyAdapter (eSIM). Ni „Airalo UI sistema" — provider je
// adapter v enotnem toku: ProviderRegistry → SupplyAdapter →
// ProviderProduct → /api/supply/search → Map → ProductModal → AI → /go.
//
// CAPABILITY GATE (naročnik §2/§3 — živo preverjeno 19. 9. 2026):
//  - POGODBA: sandbox /api/v2/countries ŽIVO preverjen (200 PRAVI seznam
//    — goli array; Slovenija id=210, slug, package_count=4). Produkcija
//    api.airalo.com je DNS-blokirana s peskovnika (dokumentirana omejitev
//    OKOLJA, ne pogodbe). Paketi + žeton: DOCUMENTED-ASSUMPTION (sandbox
//    brez žetona = 404) → STRICT fail-closed mapper + negativni cache.
//  - DOSTOP:  AIRALO_CLIENT_ID + AIRALO_CLIENT_SECRET ŠE NISTA izdana
//    (OAuth poverilnice izda partnerski portal po odobritvi prijave).
//    Manjka KATERIKOLI → iskrena opomba „not-configured".
//  ⇒ BREZ POVERILNIC: adapter vrne PRAZEN sloj (NIČ ne izmišljujemo,
//    NE simuliramo živega API-ja, lažno zelenih vrat NI). Ko poverilnice
//    prideta v env, plast oživi BREZ spremembe kode (ista pot, isti
//    kanonski model).
//
// GEO SEMANTIKA (državni produkt — iskren nivo):
//  eSIM paket pokriva DRŽAVO. Pin = kanonski center Slovenije
//  {46.15, 14.47}, geoPrecision "country" (isti center kot viator
//  fallback). Adapter se pokliče SAMO, ko viewport SEKAM Slovenijo
//  (dokumentirana približna meja SI — sicer iskreno „no-country-in-view")
//  in zoom ≥ minZoom (5 — runner gating).
//
// PREDPOMNILNIK (pogodba vira):
//  - seznam držav: 24 h (državni katalog — počasen spremenljiv vir);
//  - rezultati poizvedb (paketi): TTL iz registra (entry.cacheTtlMs —
//    katalog paketov, ne živi citat);
//  - žeton: v-pomnilniško z maržo 60 s + single-flight (client.ts);
//  - sočasne identične poizvedbe delijo ENO izvedbo (coalescing);
//  - negativni predpomnilnik okvar: 60 s (vzorec Task 44-b).
// ============================================================================

import type { ProviderProduct, SupplyQuery } from "../../types";
import type { ProviderRegistryEntry } from "../../registry";
import type { SupplyAdapter } from "../../adapter";
import {
  AiraloClient,
  airaloCredentialsFromEnv,
  airaloBaseUrlFromEnv,
  resetAiraloTokenCache,
} from "./client";
import { isAiraloCountry } from "./types";
import { mapAiraloPackages } from "./mapper";

/** Slug države, ki jo naš produkt pokriva (kanonska Slovenija). */
const SI_COUNTRY_SLUG = "slovenia";

/**
 * Približna geografska meja Slovenije [s, w, n, e] (dokumentirana
 * aproksimacija za gating državnega produkta — NE natančna meja).
 */
const SI_BOUNDS: [number, number, number, number] = [45.4, 13.3, 46.9, 16.7];

/** Seznam držav predpomnimo 24 h (katalog — počasen spremenljiv). */
const COUNTRIES_TTL_MS = 24 * 60 * 60 * 1000;

/** Okvaro vira zapomnimo 60 s (vljudnost + odpornost — Task 44-b vzorec). */
const FAILURE_TTL_MS = 60_000;

/** Privzeti TTL rezultatov, če register ne daje veljavnega (katalog). */
const DEFAULT_RESULT_TTL_MS = 60 * 60 * 1000;

/** Zgornja meja predpomnjenih rezultatov (FIFO evict). */
const RESULT_CACHE_MAX = 100;

// ---------------------------------------------------------------------------
// STANJE ADAPTERJA (rezultati + države + coalescing + negativni cache)
// ---------------------------------------------------------------------------

interface QueryOutcome {
  products: ProviderProduct[];
  skipped: number;
  note?: string;
}

const resultCache = new Map<string, { outcome: QueryOutcome; at: number }>();
const countriesCache: { list: unknown[]; at: number } = { list: [], at: 0 };
const failureUntil = new Map<string, number>();
const inflight = new Map<string, Promise<QueryOutcome>>();

let lastCachedFlag = false;
let lastSkippedCount = 0;
let lastNote: string | undefined = undefined;

/** Testni hak: počisti vsa stanja adapterja (+ žetonski predpomnilnik). */
export function resetAiraloAdapterCaches(): void {
  resultCache.clear();
  countriesCache.list = [];
  countriesCache.at = 0;
  failureUntil.clear();
  inflight.clear();
  resetAiraloTokenCache();
  lastCachedFlag = false;
  lastSkippedCount = 0;
  lastNote = undefined;
}

/** Diagnostika (testi/admin): zadnja opomba izvedbe adapterja. */
export function airaloLastNote(): string | undefined {
  return lastNote;
}

/**
 * Ključ poizvedbe: bbox zaokrožen na ~0,02° + locale. Datum je namerno
 * IZPUŠČEN — eSIM paketi so datumsko neodvisni (katalog, ne okupanost).
 */
function queryKey(q: SupplyQuery): string {
  const b = q.bbox ?? [0, 0, 0, 0];
  const r = (n: number) => Math.round(n * 50) / 50;
  return [r(b[0]), r(b[1]), r(b[2]), r(b[3]), q.locale].join("|");
}

/** Ali viewport seka Slovenijo (gating državnega produkta — AABB presek). */
function bboxIntersectsSlovenia(
  bbox: [number, number, number, number]
): boolean {
  const [s, w, n, e] = bbox;
  const [ss, sw, sn, se] = SI_BOUNDS;
  return s <= sn && n >= ss && w <= se && e >= sw;
}

// ---------------------------------------------------------------------------
// SEZNAM DRŽAV (24 h predpomnilnik — en zapis ne glede na poizvedbo)
// ---------------------------------------------------------------------------

interface AiraloCountryLike {
  id: number;
  slug: string;
  title: string;
  package_count?: number;
  is_banned?: boolean | null;
}

async function getSloveniaCountry(
  client: AiraloClient,
  signal?: AbortSignal
): Promise<
  | { ok: true; country: AiraloCountryLike }
  | { ok: false; note: "no-country" | "country-banned" | "no-packages" }
> {
  let list: unknown[];
  if (
    countriesCache.list.length > 0 &&
    Date.now() - countriesCache.at < COUNTRIES_TTL_MS
  ) {
    list = countriesCache.list;
  } else {
    const raw = await client.getCountries({ signal });
    list = Array.isArray(raw) ? raw : [];
    countriesCache.list = list;
    countriesCache.at = Date.now();
  }

  // Slovenia v katalogu vira (LIVE-VERIFIED oblika — goli array).
  const found = list.find(
    (c) => isAiraloCountry(c) && c.slug === SI_COUNTRY_SLUG
  );
  if (!found) return { ok: false, note: "no-country" };
  const country = found as AiraloCountryLike;
  if (country.is_banned === true) {
    // Vir je državo suspendiral — iskreno prazno.
    return { ok: false, note: "country-banned" };
  }
  if (
    typeof country.package_count === "number" &&
    country.package_count === 0
  ) {
    // Katalog vira priča 0 paketov — klic po pakete je odveč (iskreno).
    return { ok: false, note: "no-packages" };
  }
  return { ok: true, country };
}

// ---------------------------------------------------------------------------
// IZVEDBA POIZVEDBE (z veljavnima poverilnicama)
// ---------------------------------------------------------------------------

async function executeQuery(
  client: AiraloClient,
  q: SupplyQuery,
  key: string
): Promise<QueryOutcome> {
  if (!q.bbox) return { products: [], skipped: 0, note: "no-bbox" };

  const country = await getSloveniaCountry(client, q.signal);
  if (!country.ok) {
    // Predpomni TUDI negativne katalogne izvide (izvid je izvid) — sicer
    // bi vsak drsenje viewporta tolklo katalog držav vira.
    const outcome: QueryOutcome = {
      products: [],
      skipped: 0,
      note: country.note,
    };
    resultCache.set(key, { outcome, at: Date.now() });
    return outcome;
  }

  const res = await client.getPackages(country.country.slug, {
    signal: q.signal,
  });

  const fetchedAt = new Date().toISOString();
  const { products, skipped, note } = mapAiraloPackages(res, {
    locale: q.locale,
    fetchedAt,
  });

  const outcome: QueryOutcome = {
    products,
    skipped,
    ...(note ? { note } : {}),
  };

  // Predpomni pozitiven izid (tudi prazen — izvid je izvid) + FIFO evict.
  resultCache.set(key, { outcome, at: Date.now() });
  if (resultCache.size > RESULT_CACHE_MAX) {
    let oldestKey: string | null = null;
    let oldestAt = Number.POSITIVE_INFINITY;
    for (const [k, v] of resultCache) {
      if (v.at < oldestAt) {
        oldestAt = v.at;
        oldestKey = k;
      }
    }
    if (oldestKey) resultCache.delete(oldestKey);
  }
  return outcome;
}

// ---------------------------------------------------------------------------
// ADAPTER
// ---------------------------------------------------------------------------

export function createAiraloAdapter(
  entry: ProviderRegistryEntry,
  deps: { fetchImpl?: typeof fetch } = {}
): SupplyAdapter {
  return {
    entry,

    async search(q: SupplyQuery): Promise<ProviderProduct[]> {
      lastCachedFlag = false;
      lastSkippedCount = 0;
      lastNote = undefined;

      // === CAPABILITY GATE (iskren; OBE poverilnici sta OBVEZNI) ===
      const creds = airaloCredentialsFromEnv();
      if (!creds) {
        // NE kličemo vira, NE simuliramo, NE izmišljujemo — plast je
        // iskreno prazna z opombo (telemetrija + provider panel).
        lastNote = "not-configured";
        return [];
      }

      if (!q.bbox) {
        lastNote = "no-bbox";
        return [];
      }

      // Državni produkt: viewport MORA sekati Slovenijo (sicer iskreno
      // prazno — NE ponujamo eSIM za pogled na tujino).
      if (!bboxIntersectsSlovenia(q.bbox)) {
        lastNote = "no-country-in-view";
        return [];
      }

      const key = queryKey(q);
      const ttl = Math.max(1_000, entry.cacheTtlMs || DEFAULT_RESULT_TTL_MS);

      // 1) Pozitivni predpomnilnik (TTL iz registra — katalog paketov).
      const hit = resultCache.get(key);
      if (hit && Date.now() - hit.at < ttl) {
        lastCachedFlag = true;
        lastSkippedCount = hit.outcome.skipped;
        lastNote = hit.outcome.note;
        return hit.outcome.products;
      }
      if (hit) resultCache.delete(key);

      // 2) Negativni predpomnilnik (okvara vira v zadnjih 60 s — NE
      //    tolčemo vira, ki je ravno odklonil 401/429/5xx).
      const failAt = failureUntil.get(key);
      if (failAt != null && Date.now() < failAt) {
        lastNote = "recently-failed";
        return [];
      }
      if (failAt != null) failureUntil.delete(key);

      // 3) Coalescing: sočasne enake poizvedbe delijo ENO izvedbo
      //    (preklic prvega odjemalca prekine skupni poskus — naslednja
      //    poizvedba poskusi znova; vzorec Task 44-b).
      const existing = inflight.get(key);
      if (existing) {
        const outcome = await existing;
        lastCachedFlag = true; // deljena izvedba = ni mojega mrežnega klica
        lastSkippedCount = outcome.skipped;
        lastNote = outcome.note;
        return outcome.products;
      }

      const client = new AiraloClient({
        clientId: creds.clientId,
        clientSecret: creds.clientSecret,
        baseUrl: airaloBaseUrlFromEnv(),
        ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
      });
      const task = executeQuery(client, q, key).finally(() => {
        inflight.delete(key);
      });
      inflight.set(key, task);
      try {
        const outcome = await task;
        lastSkippedCount = outcome.skipped;
        lastNote = outcome.note;
        return outcome.products;
      } catch (e) {
        // Okvara vira → negativni predpomnilnik (60 s) + runner zapiše
        // degraded (adapterji so izolirani — OSM/KiwiTaxi/Viator ostanejo).
        failureUntil.set(key, Date.now() + FAILURE_TTL_MS);
        throw e;
      }
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
