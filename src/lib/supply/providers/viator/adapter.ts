// ============================================================================
// TRAVEL SUPPLY MAP — VIATOR ADAPTER (Task 45, 1.50.0)
// ============================================================================
// DRUGI realni SupplyAdapter. Ni „Viator UI sistema" — provider je adapter
// v enotnem toku: ProviderRegistry → SupplyAdapter → ProviderProduct →
// /api/supply/search → Map → ProductModal → Add to my plan → AI → /go.
//
// CAPABILITY GATE (naročnik §2/§3 — živo preverjeno 18. 9. 2026):
//  - POGODBA: dokumentirana in preverjena (docs.viator.com, Golden Path).
//  - DOSTOP:  VIATOR_API_KEY NI nastavljen (živi dokaz: sandbox brez
//    ključa = HTTP 401 UNAUTHORIZED). Ključ je self-serve po registraciji
//    partnerskega računa (Tools → Affiliate API).
//  ⇒ BREZ KLJUČA: adapter vrne PRAZEN sloj z iskreno opombo
//    „not-configured" (NIČ ne izmišljujemo, NE simuliramo živega API-ja,
//    lažno zelenih vrat NI). Ko ključ pride v env, plast oživi BREZ
//    spremembe kode (ista pot, isti kanonski model).
//
// VIEWPORT (naročnik §9, dokumentirana omejitev vira): iskanje je PO
// DESTINACIJI (destinationId), NE po bbox → glej destinations.ts
// (1–3 mestne poizvedbe oz. 1 državna + krajevni post-filter pinov).
// ZOOM GATING: runner pokliče adapter SAMO ko je activity/tour med
// vidnimi kategorijami (uporabnik vklopi sloj) in zoom ≥ minZoom (10).
//
// PREDPOMNILNIK (pogodba vira):
//  - rezultati poizvedbe: TTL iz registra (10 min — žive iskalne cene;
//    dokumentacija dovoljuje 15–30 min polling za vsebinske deltе, mi smo
//    radodarne konzervativnejši);
//  - negativni predpomnilnik okvar (60 s na ključ — vzorec Task 44-b:
//    vir z 401/429/5xx NE dobi zaporednih klicev);
//  - sočasne identične poizvedbe delijo ENO izvedbo (coalescing);
//  - taksonomija destinacij: 7 dni (pogodba: „refreshed weekly").
// ============================================================================

import type { ProviderProduct, SupplyQuery } from "../../types";
import type { ProviderRegistryEntry } from "../../registry";
import type { SupplyAdapter } from "../../adapter";
import { DESTINATIONS } from "@/lib/slovenia-data";
import { ViatorClient, viatorApiKeyFromEnv, viatorBaseUrlFromEnv } from "./client";
import {
  getViatorDestIndex,
  selectViewportDestinations,
  resolveProductPin,
  pinInBbox,
  resetViatorDestinations,
  type CanonicalDestInput,
} from "./destinations";
import { mapViatorSummaries, VIATOR_MAX_RESULTS } from "./mapper";
import { filterValidSummaries, type ViatorProductSummary } from "./types";

/** Naše kanonske destinacije kot vhod za ujemanje s Viator taksonomijo. */
const CANONICAL_DESTS: CanonicalDestInput[] = DESTINATIONS.map((d) => ({
  slug: d.slug,
  name: d.name,
  lat: d.coords.lat,
  lng: d.coords.lng,
}));

/** Št. produktov na destinacijsko poizvedbo (paginacija vira). */
const PER_DESTINATION_COUNT = 24;

/** Okvaro vira zapomnimo 60 s (vljudnost + odpornost — Task 44-b vzorec). */
const FAILURE_TTL_MS = 60_000;

/** Zgornja meja predpomnjenih rezultatov (FIFO evict). */
const RESULT_CACHE_MAX = 200;

// ---------------------------------------------------------------------------
// STANJE ADAPTERJA (poizvedbeni predpomnilniki — per instanca procesa)
// ---------------------------------------------------------------------------

interface QueryOutcome {
  products: ProviderProduct[];
  skipped: number;
  note?: string;
}

const resultCache = new Map<string, { outcome: QueryOutcome; at: number }>();
const failureUntil = new Map<string, number>();
const inflight = new Map<string, Promise<QueryOutcome>>();

let lastCachedFlag = false;
let lastSkippedCount = 0;
let lastNote: string | undefined = undefined;

/** Testni hak: počisti vsa stanja adapterja (+ taksonomijo). */
export function resetViatorAdapterCaches(): void {
  resultCache.clear();
  failureUntil.clear();
  inflight.clear();
  resetViatorDestinations();
  lastCachedFlag = false;
  lastSkippedCount = 0;
  lastNote = undefined;
}

/** Diagnostika (testi/admin): zadnja opomba izvedbe adapterja. */
export function viatorLastNote(): string | undefined {
  return lastNote;
}

/**
 * Ključ poizvedbe: bbox zaokrožen na ~0,02° (≈2 km zrnato — majhna
 * gibanja viewporta NE raztresajo predpomnilnika) + locale (naše opombe
 * so dvojezične) + datum. Izbor destinacij je determinističen iz bbox-a
 * (taksonomija stabilna 7 dni) → ključ ne potrebuje destinacij.
 */
function queryKey(q: SupplyQuery): string {
  const b = q.bbox ?? [0, 0, 0, 0];
  const r = (n: number) => Math.round(n * 50) / 50;
  return [r(b[0]), r(b[1]), r(b[2]), r(b[3]), q.locale, q.date ?? "-"].join("|");
}

// ---------------------------------------------------------------------------
// IZVEDBA POIZVEDBE (z veljavnim ključem)
// ---------------------------------------------------------------------------

async function executeQuery(
  client: ViatorClient,
  q: SupplyQuery,
  key: string
): Promise<QueryOutcome> {
  if (!q.bbox) return { products: [], skipped: 0, note: "no-bbox" };

  const index = await getViatorDestIndex(client, CANONICAL_DESTS, {
    signal: q.signal,
  });

  const view = selectViewportDestinations(index, q.bbox);

  // Seznam destinacijskih iskanj — ≤ 3 klicev na poizvedbo (registrovna
  // maxCallsPerMin ščiti odhodni promet NAD tem).
  const searches: {
    destId: number;
    center: { lat: number; lng: number };
    name: string;
  }[] = [];
  if (view.country && view.cities.length === 0) {
    const lat = view.country.center?.latitude;
    const lng = view.country.center?.longitude;
    searches.push({
      destId: view.country.destinationId,
      center:
        typeof lat === "number" && typeof lng === "number"
          ? { lat, lng }
          : { lat: 46.15, lng: 14.47 }, // center SI (pin fallback)
      name: view.country.name,
    });
  } else {
    for (const c of view.cities) {
      searches.push({ destId: c.viatorId, center: c.center, name: c.viatorName });
    }
  }

  if (searches.length === 0) {
    return { products: [], skipped: 0, note: "no-destination-in-view" };
  }

  const isCountrySearch =
    view.country != null && view.cities.length === 0 && searches.length === 1;

  // SEKVENCIALNA iskanja (vljudnost do vira — okna 10 s na endpoint;
  // sočasen trojni udar bi bil nepotreven tvegano).
  const summaries: ViatorProductSummary[] = [];
  let skippedInvalid = 0;
  for (const s of searches) {
    const req = {
      filtering: {
        destination: String(s.destId),
        // Datum uporabnika → okno razpoložljivosti vira (dokumentirano
        // polje; št. potnikov na povzetku iskanja ne vpliva — končna
        // cena se izračuna pri ponudniku ob rezervaciji).
        ...(q.date ? { startDate: q.date, endDate: q.date } : {}),
      },
      // Razvrščanje VIRA (njihov traveler rating) — NE lastno rangiranje.
      sorting: { sort: "TRAVELER_RATING", order: "DESCENDING" },
      pagination: { start: 1, count: PER_DESTINATION_COUNT },
      currency: "EUR",
    };
    const res = await client.searchProducts(req, { signal: q.signal });
    const { valid, skipped } = filterValidSummaries(res.products);
    summaries.push(...valid);
    skippedInvalid += skipped;
  }

  // Dedupe po productCode + (državno iskanje) post-filter pinov na bbox.
  const fetchedAt = new Date().toISOString();
  const byCode = new Map<string, ViatorProductSummary>();
  const pins = new Map<string, ReturnType<typeof resolveProductPin>>();
  for (const s of summaries) {
    if (byCode.has(s.productCode)) continue;
    // Fallback pin = iskana destinacija (dokumentirano v destinations.ts).
    const searched = searches[0];
    const pin = resolveProductPin(s, index, {
      center: searched.center,
      name: searched.name,
    });
    if (isCountrySearch && (!pin || !pinInBbox(pin, q.bbox))) continue;
    byCode.set(s.productCode, s);
    if (pin) pins.set(s.productCode, pin);
    if (byCode.size >= VIATOR_MAX_RESULTS) break;
  }

  const capped = byCode.size < summaries.length;
  const { products, skipped: mappedSkipped } = mapViatorSummaries(
    [...byCode.values()],
    { locale: q.locale, fetchedAt },
    (s) => pins.get(s.productCode) ?? null
  );

  const outcome: QueryOutcome = {
    products,
    skipped: skippedInvalid + mappedSkipped,
    ...(capped ? { note: "capped" } : {}),
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

export function createViatorAdapter(
  entry: ProviderRegistryEntry,
  deps: { fetchImpl?: typeof fetch } = {}
): SupplyAdapter {
  return {
    entry,

    async search(q: SupplyQuery): Promise<ProviderProduct[]> {
      lastCachedFlag = false;
      lastSkippedCount = 0;
      lastNote = undefined;

      // === CAPABILITY GATE (iskren; brez ključa NI podatkov) ===
      const apiKey = viatorApiKeyFromEnv();
      if (!apiKey) {
        // NE kličemo vira, NE simuliramo, NE izmišljujemo — plast je
        // iskreno prazna z opombo (telemetrija + provider panel).
        lastNote = "not-configured";
        return [];
      }

      if (!q.bbox) {
        lastNote = "no-bbox";
        return [];
      }

      const key = queryKey(q);
      const ttl = Math.max(1_000, entry.cacheTtlMs || 10 * 60 * 1000);

      // 1) Pozitiven predpomnilnik (TTL iz registra).
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

      const client = new ViatorClient({
        apiKey,
        baseUrl: viatorBaseUrlFromEnv(),
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
        // degraded (adapterji so izolirani — OSM/KiwiTaxi ostanejo).
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
