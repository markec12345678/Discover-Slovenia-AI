// ============================================================================
// TRAVEL SUPPLY MAP — GETYOURGUIDE ADAPTER (Task 46, 1.51.0)
// ============================================================================
// TRETJI realni SupplyAdapter. Ni „GYG UI sistema" — provider je adapter
// v enotnem toku: ProviderRegistry → SupplyAdapter → ProviderProduct →
// /api/supply/search → Map → ProductModal → Add to my plan → AI → /go.
//
// CAPABILITY GATE (naročnik §2/§3 — živo preverjeno 18. 9. 2026):
//  - POGODBA: dokumentirana in preverjena (code.getyourguide.com
//    partner-api-spec OpenAPI + uradni GitHub wiki + živi 401 brez žetona).
//  - DOSTOP:  GETYOURGUIDE_API_TOKEN NI nastavljen (živi dokaz: klic z
//    neveljavnim žetonom = HTTP 401 errorCode 2420). Žeton izda partner
//    manager po odobritvi (partner.getyourguide.com) — NI self-serve
//    nad registracijo affiliate programa (razlika od Viatorja).
//  ⇒ BREZ ŽETONA: adapter vrne PRAZEN sloj z iskreno opombo
//    „not-configured" (NIČ ne izmišljujemo, NE simuliramo živega API-ja,
//    lažno zelenih vrat NI). Ko žeton pride v env, plast oživi BREZ
//    spremembe kode (ista pot, isti kanonski model).
//
// GEO SEMANTIKA (naročnik §9/§10 — dokumentirana, NE lažni bbox):
//  Vir isče PO KROGU: coordinates[] = [lat, lng, radius] (spec query.yaml,
//  medsebojno izključno s q). ENOTA RADIJA V SPECIFIKACIJI NI DOKUMENTIRANA
//  (UNKNOWN). Adapter:
//   1. center = središče viewporta (bbox);
//   2. radius = pol-diagonala bboxa v km × 1,25 (haversine približek,
//      min 5 km, max 150 km) — PRIVZETEK km (evropski/metrični vir),
//      IZRECNO dokumentiran kot domneva;
//   3. KRAJEVNI POST-FILTER: produkti S koordinatami morajo ležati v bbox
//      (varovalka: če je enota vira večja od km — npr. milje — krog
//      prekine ven pinov, ki jih post-filter ODSKRBNO odstrani; če manjša,
//      plast iskreno pod-fuelša). Produkti BREZ koordinat ostanejo (vir
//      jih je geografsko uvrstil v krog iskanja).
//  Zoom gating: runner pokliče adapter SAMO ko je activity/tour med
//  vidnimi kategorijami (sloj vklopljen) in zoom ≥ minZoom (10).
//
// PREDPOMNILNIK (pogodba vira — wiki Getting-started):
//  - rezultati poizvedb: BREZ predpomnilnika (vir: »We encourage to access
//    the API in real-time; please do not scrape the API in an attempt to
//    cache its output.«) → cacheTtlMs 0 v registru (odgovor supply je
//    zato no-store — iskren);
//  - sočasne identične poizvedbe delijo ENO izvedbo (coalescing — to je
//    dedup klicev, NE predpomnilnik izpisa);
//  - negativni predpomnilnik okvar: 60 s (vzorec Task 44-b) — RAZEN 429,
//    kjer vir dokumentira 5-minutno blokado → 310 s (vljudnost do vira).
// ============================================================================

import type { ProviderProduct, SupplyQuery } from "../../types";
import type { ProviderRegistryEntry } from "../../registry";
import type { SupplyAdapter } from "../../adapter";
import { GygClient, gygApiTokenFromEnv, gygBaseUrlFromEnv, GygApiError } from "./client";
import { filterValidTours } from "./types";
import { mapGygTours, GYG_MAX_RESULTS } from "./mapper";

/** Okvaro vira zapomnimo 60 s (vljudnost + odpornost — Task 44-b vzorec). */
const FAILURE_TTL_MS = 60_000;

/** 429: vir dokumentira 5-minutno blokado vseh nadaljnjih klicev. */
const RATE_LIMIT_TTL_MS = 310_000;

/** Približek: 1 stopinja latitude ≈ 111 km (haversine poenostavitev). */
const KM_PER_DEG = 111.32;

/** Radius: pol-diagonala bboxa × 1,25 (meja domneve km; min 5, max 150). */
const RADIUS_MARGIN = 1.25;
const RADIUS_MIN_KM = 5;
const RADIUS_MAX_KM = 150;

// ---------------------------------------------------------------------------
// STANJE ADAPTERJA (coalescing + negativni predpomnilnik — per proces)
// ---------------------------------------------------------------------------

interface QueryOutcome {
  products: ProviderProduct[];
  skipped: number;
  note?: string;
}

const failureUntil = new Map<string, number>();
const inflight = new Map<string, Promise<QueryOutcome>>();

let lastCachedFlag = false;
let lastSkippedCount = 0;
let lastNote: string | undefined = undefined;

/** Testni hak: počisti vsa stanja adapterja. */
export function resetGetYourGuideAdapterCaches(): void {
  failureUntil.clear();
  inflight.clear();
  lastCachedFlag = false;
  lastSkippedCount = 0;
  lastNote = undefined;
}

/** Diagnostika (testi/admin): zadnja opomba izvedbe adapterja. */
export function gygLastNote(): string | undefined {
  return lastNote;
}

/**
 * Ključ poizvedbe (identiteta za COALESCING in negativni predpomnilnik —
 * NE za predpomnilnik rezultatov): bbox zaokrožen na ~0,02° + locale +
 * datum. Datum je del identitete, ker datumski filter vira (date[]) spreminja
 * REZULTAT (tours »offered on date«) — dvakrat ista poizvedba istega dne
 * deli izvedbo zgolj znotraj sočasnega okna.
 */
function queryKey(q: SupplyQuery): string {
  const b = q.bbox ?? [0, 0, 0, 0];
  const r = (n: number) => Math.round(n * 50) / 50;
  return [r(b[0]), r(b[1]), r(b[2]), r(b[3]), q.locale, q.date ?? "-"].join("|");
}

/** Center bboxa. */
function bboxCenter(bbox: [number, number, number, number]): { lat: number; lng: number } {
  const [s, w, n, e] = bbox;
  return { lat: (s + n) / 2, lng: (w + e) / 2 };
}

/**
 * Radius iskanja (km — DOMNEVA, enota v specifikaciji NI dokumentirana):
 * pol-diagonala bboxa × 1,25, min 5 km, max 150 km. Post-filter pinov na
 * bbox je varovalka za prevelik krog (npr. če bi bila enota milje).
 */
export function searchRadiusKm(bbox: [number, number, number, number]): number {
  const [s, w, n, e] = bbox;
  const dLatKm = Math.abs(n - s) * KM_PER_DEG;
  const dLngKm = Math.abs(e - w) * KM_PER_DEG * Math.cos((((s + n) / 2) * Math.PI) / 180);
  const halfDiagonal = Math.sqrt(dLatKm * dLatKm + dLngKm * dLngKm) / 2;
  return Math.min(
    RADIUS_MAX_KM,
    Math.max(RADIUS_MIN_KM, Math.round(halfDiagonal * RADIUS_MARGIN))
  );
}

/** Ali točka leži v bbox (krajevni post-filter — varovalka radija). */
function pointInBbox(
  lat: number,
  lng: number,
  bbox: [number, number, number, number]
): boolean {
  const [s, w, n, e] = bbox;
  return lat >= s && lat <= n && lng >= w && lng <= e;
}

// ---------------------------------------------------------------------------
// IZVEDBA POIZVEDBE (z veljavnim žetonom)
// ---------------------------------------------------------------------------

async function executeQuery(
  client: GygClient,
  q: SupplyQuery,
  _key: string
): Promise<QueryOutcome> {
  if (!q.bbox) return { products: [], skipped: 0, note: "no-bbox" };

  const center = bboxCenter(q.bbox);
  const radius = searchRadiusKm(q.bbox);

  // EN klic na poizvedbo (vljudnost do vira; limit 1–500, default 10).
  const res = await client.searchTours(
    {
      coordinates: [center.lat, center.lng, radius],
      date: q.date ?? null,
      limit: GYG_MAX_RESULTS,
      sortfield: "popularity",
    },
    { signal: q.signal }
  );

  // Valuta: _metadata.exchange.currency ( kadar podan) mora biti EUR —
  // sicer cene NE preslikamo (ne pretvarjamo, NE lažemo o valuti).
  const exchangeCurrency = res._metadata?.exchange?.currency;
  const currencyConfirmedEur =
    exchangeCurrency == null || exchangeCurrency.toLowerCase() === "eur";

  const { valid, skipped } = filterValidTours(res.data?.tours);

  // Post-filter pinov na bbox (samo produkti S koordinatami — varovalka
  // domneve km; brez-geo produkti ostanejo, saj jih je vir geografsko
  // uvrstil v krog iskanja).
  const inView = valid.filter((t) => {
    if (!isValidCoords(t.coordinates)) return true;
    return pointInBbox(t.coordinates.lat, t.coordinates.long, q.bbox!);
  });
  const filteredOut = valid.length - inView.length;

  const fetchedAt = new Date().toISOString();
  const { products, skipped: mappedSkipped } = mapGygTours(inView, {
    locale: q.locale,
    fetchedAt,
    currencyConfirmedEur,
    dateFiltered: q.date != null,
  });

  const notes: string[] = [];
  const totalCount = res._metadata?.totalCount;
  if (typeof totalCount === "number" && totalCount > products.length) {
    notes.push("capped");
  }
  if (filteredOut > 0) {
    notes.push("bbox-filtered");
  }

  return {
    products,
    skipped: skipped + mappedSkipped,
    note: notes.length > 0 ? notes.join("+") : undefined,
  };
}

function isValidCoords(c: { lat?: number; long?: number } | undefined): c is { lat: number; long: number } {
  return (
    c != null &&
    typeof c.lat === "number" &&
    typeof c.long === "number" &&
    Number.isFinite(c.lat) &&
    Number.isFinite(c.long) &&
    Math.abs(c.lat) <= 90 &&
    Math.abs(c.long) <= 180
  );
}

// ---------------------------------------------------------------------------
// ADAPTER
// ---------------------------------------------------------------------------

export function createGetYourGuideAdapter(
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
      const apiToken = gygApiTokenFromEnv();
      if (!apiToken) {
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

      // 1) Negativni predpomnilnik (okvara vira — 60 s; 429 = 310 s po
      //    dokumentirani 5-minutni blokadi vira). NE tolčemo vira, ki je
      //    ravno odklonil 401/429/5xx.
      const failAt = failureUntil.get(key);
      if (failAt != null && Date.now() < failAt) {
        lastNote = "recently-failed";
        return [];
      }
      if (failAt != null) failureUntil.delete(key);

      // 2) Coalescing: sočasne enake poizvedbe delijo ENO izvedbo
      //    (preklic prvega odjemalca prekine skupni poskus — naslednja
      //    poizvedba poskusi znova; vzorec Task 44-b). TO JE dedup
      //    sočasnih klicev, NE predpomnilnik izpisa (vir slednjega
      //    prepoveduje — rezultatov NE hranimo).
      const existing = inflight.get(key);
      if (existing) {
        const outcome = await existing;
        lastCachedFlag = true; // deljena izvedba = ni mojega mrežnega klica
        lastSkippedCount = outcome.skipped;
        lastNote = outcome.note;
        return outcome.products;
      }

      const client = new GygClient({
        apiToken,
        baseUrl: gygBaseUrlFromEnv(),
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
        // Okvara vira → negativni predpomnilnik (429: 310 s — dokumentirana
        // blokada vira; ostalo 60 s) + runner zapiše degraded (adapterji so
        // izolirani — OSM/KiwiTaxi/Viator ostanejo).
        const ttl =
          e instanceof GygApiError && e.kind === "rate-limited"
            ? RATE_LIMIT_TTL_MS
            : FAILURE_TTL_MS;
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
