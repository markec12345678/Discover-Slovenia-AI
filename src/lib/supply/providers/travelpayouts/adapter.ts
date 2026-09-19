// ============================================================================
// TRAVEL SUPPLY MAP — TRAVELPAYOUTS ADAPTER (TASK 53, 1.58.0)
// ============================================================================
// ČETRTI realni SupplyAdapter (po osm/kiwitaxi/viator/gyg). Ni „Travelpayouts UI sistema“ — provider je adapter v enotnem toku: ProviderRegistry →
// SupplyAdapter → ProviderProduct → /api/supply/search → Map → ProductModal
// → Add to my plan → AI → /go.
//
// CAPABILITY GATE (naročnik §2/§3 — živo preverjeno 19. 9. 2026):
//  - POGODBA: dokumentirana (support.travelpayouts.com API-and-data +
//    ogledala travelpayouts.github.io).
//  - DOSTOP:  TRAVELPAYOUTS_TOKEN NI nastavljen (živi dokaz: klic brez
//    žetona = HTTP 401 „Unauthorized“ — vrata so ŽIVA). Žeton je SELF-SERVE:
//    registracija računa → travelpayouts.com/developers/api (NI
//    partner-approval!) → provider je NOT_CONFIGURED, ne partner-blokiran.
//  ⇒ BREZ ŽETONA: adapter vrne PRAZEN sloj z iskreno opombo
//    „not-configured“ (NIČ ne izmišljujemo, NE simuliramo živega API-ja,
//    lažno zelenih vrat NI). Ko žeton pride v env, plast oživi BREZ
//    spremembe kode (ista pot, isti kanonski model).
//
// PRODUCT GAP — IZHODIŠČNO LETALIŠČE (ISKRENO DOKUMENTIRANO, enak vzorec
// kot skyscanner): naš SupplyQuery NIMA izvornega letališča (viewport pove
// KAM uporabnik pogleduje, ne ODKOD leti). Cene letov so izhodišče→cilj,
// zato brez izhodišča NI poštene cene: ko je žeton prisoten, izhodišče pa
// ni znano (TRAVELPAYOUTS_ORIGIN ni nastavljen) → adapter vrne [] z opombo
// „origin-required“. NE sklepamo privzetka (npr. tihi „LJU“ bi pomenilo
// izmišljanje trga uporabnikov); izhodišče je IZRECNA operaterska
// konfiguracija. (Prihodnja faza: polje origin v SupplyQuery ob iskanju
// letov — takrat env odstopi.)
//
// DESTINACIJA (view → IATA): kanonske destinacije v pogledu (točka-v-bbox,
// isti vir resnice kot viator/destinations.ts) se preslikajo v letališča
// LE kadar imamo lastno preslikavo — glej DESTINATION_IATA spodaj. Ostale
// iskreno preskočimo (NE tiho preusmerimo na LJU: poizvedba „let v Bled“
// z pristankom na Brniku bi bila geografska laž).
//
// GEO: leti so ROUTE (izhodišče→cilj) — adapter NE postavlja pinov
// (glej mapper.ts; sloj letov je sloj kartic/plast, ne pinov).
//
// ZOOM GATING: runner pokliče adapter SAMO ko je „flight“ med vidnimi
// kategorijami in zoom ≥ minZoom (7 — državni/regionalni pogled).
//
// PREDPOMNILNIK (pogodba vira):
//  - rezultati poizvedbe: TTL iz registra (10 min — Data API streže
//    PREDPOMNJENE cene vira, torej je kratek TTL iskren: naš sloj osvežimo
//    pogosteje kot vir sam svoj predpomnilnik);
//  - negativni predpomnilnik okvar: 60 s (vzorec Task 44-b); 429 → 310 s
//    (vljudnost do vira) oz. dlje, če Retry-After naroči dlje;
//  - sočasne identične poizvedbe delijo ENO izvedbo (coalescing).
// ============================================================================

import type { ProviderProduct, SupplyQuery } from "../../types";
import type { ProviderRegistryEntry } from "../../registry";
import type { SupplyAdapter } from "../../adapter";
import { DESTINATIONS } from "@/lib/slovenia-data";
import { TravelpayoutsClient, TravelpayoutsApiError } from "./client";
import {
  travelpayoutsTokenFromEnv,
  travelpayoutsOriginFromEnv,
  travelpayoutsBaseUrlFromEnv,
} from "./client";
import { filterValidPriceItems } from "./types";
import { mapTravelpayoutsPrices, TRAVELPAYOUTS_MAX_RESULTS } from "./mapper";

/** Št. predpomnjenih opcij na poizvedbo (default vira 30 — za sloj
 *  zemljevida je 12 najcenejših dovolj; manjši odgovor = vljudneje). */
const PER_QUERY_LIMIT = 12;

/** Okvaro vira zapomnimo 60 s (vljudnost + odpornost — Task 44-b vzorec). */
const FAILURE_TTL_MS = 60_000;

/** 429: negativni predpomnilnik 5 min + margina (310 s) — podaljšan, če
 *  Retry-After glava vira naroči dlje. */
const RATE_LIMIT_TTL_MS = 310_000;

/** Zgornja meja predpomnjenih rezultatov (FIFO evict). */
const RESULT_CACHE_MAX = 100;

/** Največ destinacijskih poizvedb na en zagon (vljudnost do vira; danes
 *  ima samo Ljubljana preslikavo, zato je realno 1). */
const MAX_DESTINATION_SEARCHES = 3;

/**
 * Kanonske destinacije z LASTNIM preslikanim letališčem (IATA). LE
 * Ljubljana (Brnik — edino redno mednarodno letališče države; dejstvo,
 * ki ga projekt uporablja tudi v affiliate.ts SKYSCANNER_IATA). Ostale
 * kanonske destinacije v naših kanonskih podatkih nimajo atributa
 * letališča → njihovo preslikavo na LJU bi bila TIHO domnevanje
 * („let v Bled“, pristanek Brnik) → iskreno preskočene.
 */
const DESTINATION_IATA: Record<string, string> = {
  ljubljana: "LJU",
};

/** Kanonske destinacije kot iskalni vhod (slug + koordinata točke). */
const CANONICAL_DESTS = DESTINATIONS.map((d) => ({
  slug: d.slug,
  lat: d.coords.lat,
  lng: d.coords.lng,
}));

interface FlightSearch {
  slug: string;
  iata: string;
}

/** Destinacije v pogledu s preslikanim letališčem (deterministično iz
 *  CANONICAL_DESTS vrstnega reda — stabilni ključi predpomnilnika). */
function resolveFlightDestinations(
  bbox: [number, number, number, number]
): FlightSearch[] {
  const [s, w, n, e] = bbox;
  const out: FlightSearch[] = [];
  for (const d of CANONICAL_DESTS) {
    const iata = DESTINATION_IATA[d.slug];
    if (!iata) continue; // iskreno: brez lastne preslikave letališča
    if (d.lat >= s && d.lat <= n && d.lng >= w && d.lng <= e) {
      out.push({ slug: d.slug, iata });
    }
    if (out.length >= MAX_DESTINATION_SEARCHES) break;
  }
  return out;
}

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

/** Testni hak: počisti vsa stanja adapterja. */
export function resetTravelpayoutsAdapterCaches(): void {
  resultCache.clear();
  failureUntil.clear();
  inflight.clear();
  lastCachedFlag = false;
  lastSkippedCount = 0;
  lastNote = undefined;
}

/** Diagnostika (testi/admin): zadnja opomba izvedbe adapterja. */
export function travelpayoutsLastNote(): string | undefined {
  return lastNote;
}

/**
 * Ključ poizvedbe: bbox zaokrožen na ~0,02° (≈2 km zrnato — majhna gibanja
 * viewporta NE raztresajo predpomnilnika) + locale + datum + IZHODIŠČE
 * (izhodišče je del identitete: sprememba TRAVELPAYOUTS_ORIGIN pomeni
 * DRUGO poizvedbo) + destinacije (deterministične iz bbox-a).
 */
function queryKey(q: SupplyQuery, origin: string, searches: FlightSearch[]): string {
  const b = q.bbox ?? [0, 0, 0, 0];
  const r = (n: number) => Math.round(n * 50) / 50;
  return [
    r(b[0]),
    r(b[1]),
    r(b[2]),
    r(b[3]),
    q.locale,
    q.date ?? "-",
    origin,
    searches.map((s) => s.iata).join("+"),
  ].join("|");
}

// ---------------------------------------------------------------------------
// IZVEDBA POIZVEDBE (z veljavnim žetonom + znanim izhodiščem)
// ---------------------------------------------------------------------------

async function executeQuery(
  client: TravelpayoutsClient,
  q: SupplyQuery,
  origin: string,
  searches: FlightSearch[],
  key: string
): Promise<QueryOutcome> {
  // Datum uporabnika → departure_at (dokumentiran parameter; YYYY-MM-DD).
  // Obrambno: preverimo obliko (klicatelj mimo parseSupplyQuery).
  const date = typeof q.date === "string" ? q.date.trim() : "";
  const departureAt = /^\d{4}-\d{2}(-\d{2})?$/.test(date) ? date : undefined;

  // SEKVENCIALNA iskanja po destinacijah (vljudnost do vira — en udarec na
  // endpoint naenkrat; maxCallsPerMin registra ščiti nad tem).
  const fetchedAt = new Date().toISOString();
  const byId = new Map<string, ProviderProduct>();
  let skipped = 0;
  for (const s of searches) {
    const res = await client.getPricesForDates(
      {
        origin,
        destination: s.iata,
        currency: "eur",
        one_way: true,
        sorting: "price",
        limit: PER_QUERY_LIMIT,
        ...(departureAt ? { departure_at: departureAt } : {}),
      },
      { signal: q.signal }
    );

    // Valuta: vir MORÁ potrditi eur (odgovor currency) — sicer cene NE
    // preslikamo (ne pretvarjamo, NE lažemo o valuti; vzorec gyg).
    const currencyConfirmedEur =
      res.currency == null || res.currency.toLowerCase() === "eur";

    const { valid, skipped: invalidSkipped } = filterValidPriceItems(res.data);
    skipped += invalidSkipped;

    const { products, skipped: mappedSkipped } = mapTravelpayoutsPrices(valid, {
      locale: q.locale,
      fetchedAt,
      currencyConfirmedEur,
      canonicalDest: s.slug,
    });
    skipped += mappedSkipped;

    // Dedupe po id (ista smer/datum iz več destinacijskih poizvedb ostane
    // enkrat; prvi zmagovalec po vrstnem redu destinacij).
    for (const p of products) {
      if (byId.has(p.id)) continue;
      if (byId.size >= TRAVELPAYOUTS_MAX_RESULTS) break;
      byId.set(p.id, p);
    }
  }

  const capped = byId.size >= TRAVELPAYOUTS_MAX_RESULTS;
  const outcome: QueryOutcome = {
    products: [...byId.values()],
    skipped,
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

export function createTravelpayoutsAdapter(
  entry: ProviderRegistryEntry,
  deps: { fetchImpl?: typeof fetch } = {}
): SupplyAdapter {
  return {
    entry,

    async search(q: SupplyQuery): Promise<ProviderProduct[]> {
      lastCachedFlag = false;
      lastSkippedCount = 0;
      lastNote = undefined;

      // === CAPABILITY GATE (iskren; brez žetona NI podatkov) ===
      const token = travelpayoutsTokenFromEnv();
      if (!token) {
        // NE kličemo vira, NE simuliramo, NE izmišljujemo — plast je
        // iskreno prazna z opombo (telemetrija + provider panel).
        lastNote = "not-configured";
        return [];
      }

      // === PRODUCT GAP: izhodišče (SupplyQuery ga NIMA — glej glavo) ===
      const origin = travelpayoutsOriginFromEnv();
      if (!origin) {
        // Žeton je, a brez izhodiščnega letališča NI poštene cene leta.
        // Iskreno prazno — enak vzorec kot skyscanner „origin-required“.
        lastNote = "origin-required";
        return [];
      }

      if (!q.bbox) {
        lastNote = "no-bbox";
        return [];
      }

      const searches = resolveFlightDestinations(q.bbox);
      if (searches.length === 0) {
        // Pogled ne vsebuje destinacije z lastnim letališčem (npr. ozek
        // pogled na Bled) — iskreno prazno, NE preusmerjamo na LJU.
        lastNote = "no-airport-destination";
        return [];
      }

      const key = queryKey(q, origin, searches);
      const ttl = Math.max(1_000, entry.cacheTtlMs || 10 * 60 * 1000);

      // 1) Pozitivni predpomnilnik (TTL iz registra — Data API cene so
      //    same predpomnjene pri viru, kratek TTL je iskren).
      const hit = resultCache.get(key);
      if (hit && Date.now() - hit.at < ttl) {
        lastCachedFlag = true;
        lastSkippedCount = hit.outcome.skipped;
        lastNote = hit.outcome.note;
        return hit.outcome.products;
      }
      if (hit) resultCache.delete(key);

      // 2) Negativni predpomnilnik (okvara vira v zadnjih 60 s / 429 310 s+
      //    — NE tolčemo vira, ki je ravno odklonil 401/429/5xx).
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

      const client = new TravelpayoutsClient({
        token,
        baseUrl: travelpayoutsBaseUrlFromEnv(),
        ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
      });
      const task = executeQuery(client, q, origin, searches, key).finally(() => {
        inflight.delete(key);
      });
      inflight.set(key, task);
      try {
        const outcome = await task;
        lastSkippedCount = outcome.skipped;
        lastNote = outcome.note;
        return outcome.products;
      } catch (e) {
        // Okvara vira → negativni predpomnilnik (429: 310 s oz. dlje če
        // Retry-After naroči; ostalo 60 s) + runner zapiše degraded
        // (adapterji so izolirani — OSM/KiwiTaxi/Viator/GYG ostanejo).
        let ttl = FAILURE_TTL_MS;
        if (e instanceof TravelpayoutsApiError && e.kind === "rate-limited") {
          ttl = RATE_LIMIT_TTL_MS;
          if (
            e.retryAfterSec != null &&
            e.retryAfterSec * 1000 > RATE_LIMIT_TTL_MS
          ) {
            ttl = e.retryAfterSec * 1000;
          }
        }
        failureUntil.set(key, Date.now() + ttl);
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
