// ============================================================================
// TRAVEL SUPPLY MAP — SKYSCANNER ADAPTER (Task 53, 1.58.0)
// ============================================================================
// ČETRTI realni SupplyAdapter (leti). Ni „Skyscanner UI sistema" — provider
// je adapter v enotnem toku: ProviderRegistry → SupplyAdapter →
// ProviderProduct → /api/supply/search → Map → ProductModal → AI → /go.
//
// CAPABILITY GATE (naročnik §2/§3 — živo preverjeno 19. 9. 2026):
//  - POGODBA: javno dokumentirana (developers.skyscanner.net — Flights
//    Live Prices v3, dvostopna asinhrona: create → poll).
//  - DOSTOP:  SKYSCANNER_API_KEY NI nastavljen (živi dokaz: klic brez
//    ključa = HTTP 403 "Request Forbidden" — vrata ŽIVA). Ključ izda
//    partners.skyscanner.net PO oddaji partnerske prijave (PARTNER
//    APPROVAL — NI self-serve).
//  ⇒ BREZ KLJUČA: adapter vrne PRAZEN sloj z iskreno opombo
//    „not-configured" (NIČ ne izmišljujemo, NE simuliramo živega API-ja,
//    lažno zelenih vrat NI). Ko ključ pride v env, plast oživi BREZ
//    spremembe kode (ista pot, isti kanonski model).
//
// ⚠ PRODUCT GAP — IZVOR LETA (PROMINENTNO, ISKRENO):
//  Flights Live Prices ZAHTEVA outbound_leg.origin_place_id — naša
//  SupplyQuery (viewport/bbox/zoom/cats/date/pax/locale) IZVORA NIMA.
//  Ko je SKYSCANNER_API_KEY nastavljen, a izvor NI znan, search() vrne
//  PRAZEN sloj z opombo „origin-required" (iskreno — NE izmišljujemo
//  privzetega izvora!). KLIENT IN CELA POT STA VSEENO IMPLEMENTIRANA
//  (arhitekturno pripravljeni): prihodnja produktna faza oskrbuje izvor
//  prek deps.originPlaceId resolverja (uporabniški profil / iskalni UI)
//  — takrat plast oživi BREZ spremembe kode.
//
//  DESTINACIJA: kanonska destinacija iz viewporta (slovenia-data);
//  destination_place_id = "lju-sky" [DOCUMENTED-ASSUMPTION: IATA-sky
//  format place id-jev v3 + LJU je edino mednarodno letališče v SI —
//  PONOVNO PREVERI prek autosuggest endpointa ob aktivaciji ključa].
//
// PREDPOMNILNIK (pogodba vira — žive cene):
//  - rezultati: BREZ predpomnilnika (cacheTtlMs 0 v registru — živi
//    citati cen letov; iskren no-store, enako kot GetYourGuide);
//  - sočasne identične poizvedbe delijo ENO izvedbo (coalescing —
//    dedup klicev, NE predpomnilnik izpisa);
//  - negativni predpomnilnik okvar: 60 s (vzorec Task 44-b — vir z
//    401/403/429/5xx NE dobi zaporednih klicev);
//  - POLLING: pogodbeno dvostopen (create → poll do RESULT_STATUS_
//    COMPLETE); ZGORNJA MEJA poll poskusov = 5 (400 ms presledki) —
//    neskončnega pollinga NI (runner timeout 20 s je dodatna varovalka).
// ============================================================================

import type { ProviderProduct, SupplyQuery } from "../../types";
import type { ProviderRegistryEntry } from "../../registry";
import type { SupplyAdapter } from "../../adapter";
import { DESTINATIONS } from "@/lib/slovenia-data";
import {
  SkyscannerClient,
  SkyscannerApiError,
  skyscannerApiKeyFromEnv,
  skyscannerBaseUrlFromEnv,
} from "./client";
import {
  SKYSCANNER_RESULT_COMPLETE,
  isSkyscannerPlaceId,
  type SkyscannerPollResponse,
} from "./types";
import { mapSkyscannerItineraries } from "./mapper";

/**
 * Iskani destination place id (LJU — edino mednarodno letališče v SI).
 * DOCUMENTED-ASSUMPTION: format "{IATA}-sky" po javnih primerih v3
 * dokumentacije; ob aktivaciji ključa PONOVNO PREVERI prek
 * autosuggest/places endpointa vira.
 */
const SKYSCANNER_SI_DESTINATION_PLACE_ID = "lju-sky";

/** Okvaro vira zapomnimo 60 s (vljudnost + odpornost — Task 44-b vzorec). */
const FAILURE_TTL_MS = 60_000;

/** Zgornja meja poll poskusov (pogodbeni asinhroni vir ne dokonča → odpoved). */
const SKYSCANNER_MAX_POLLS = 5;

/** Presledek med poll poskusi (vljudnost do vira — dokumentirani vzorec). */
const SKYSCANNER_POLL_INTERVAL_MS = 400;

// ---------------------------------------------------------------------------
// STANJE ADAPTERJA (coalescing + negativni predpomnilnik — per proces;
// predpomnilnika REZULTATOV NI — žive cene, cacheTtlMs 0)
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
export function resetSkyscannerAdapterCaches(): void {
  failureUntil.clear();
  inflight.clear();
  lastCachedFlag = false;
  lastSkippedCount = 0;
  lastNote = undefined;
}

/** Diagnostika (testi/admin): zadnja opomba izvedbe adapterja. */
export function skyscannerLastNote(): string | undefined {
  return lastNote;
}

/** Odvisnosti tovarne (DI za teste + PRIHODNJA aktivacijska točka izvora). */
export interface SkyscannerAdapterDeps {
  /** DI (testi); privzeto globalni fetch. */
  fetchImpl?: typeof fetch;
  /**
   * PRIHODNJA AKTIVACIJA (PRODUCT GAP izvora): resolver izvornega
   * letališča (place id vira, npr. "lhr-sky"). DANES ga NIKDO ne oskrbuje
   * (SupplyQuery nima izvora) → adapter iskreno vrne „origin-required".
   * Validiran z isSkyscannerPlaceId (neveljaven ≡ neznan).
   */
  originPlaceId?: () => string | null;
}

/**
 * Ključ poizvedbe (identiteta za COALESCING in negativni predpomnilnik —
 * NE za predpomnilnik rezultatov): bbox zaokrožen na ~0,02° + locale +
 * datum + izvor + destinacijski place id (oba vplivata na rezultat vira).
 */
function queryKey(
  q: SupplyQuery,
  originPlaceId: string
): string {
  const b = q.bbox ?? [0, 0, 0, 0];
  const r = (n: number) => Math.round(n * 50) / 50;
  return [
    r(b[0]),
    r(b[1]),
    r(b[2]),
    r(b[3]),
    q.locale,
    q.date ?? "-",
    originPlaceId,
    SKYSCANNER_SI_DESTINATION_PLACE_ID,
  ].join("|");
}

/** Center bboxa. */
function bboxCenter(bbox: [number, number, number, number]): {
  lat: number;
  lng: number;
} {
  const [s, w, n, e] = bbox;
  return { lat: (s + n) / 2, lng: (w + e) / 2 };
}

/** Ali točka leži v bbox. */
function pointInBbox(
  lat: number,
  lng: number,
  bbox: [number, number, number, number]
): boolean {
  const [s, w, n, e] = bbox;
  return lat >= s && lat <= n && lng >= w && lng <= e;
}

/**
 * Kanonska destinacija iz viewporta (slovenia-data): center destinacije
 * mora ležati v bbox; ob več kandidatih izberemo NAJBLIŽJO središču
 * pogleda (deterministično). Brez kandidata → null (iskrena opomba).
 */
function resolveCanonicalDestination(
  bbox: [number, number, number, number]
): { slug: string; name: string } | null {
  const center = bboxCenter(bbox);
  let best: { slug: string; name: string; d: number } | null = null;
  for (const d of DESTINATIONS) {
    if (!d.coords) continue;
    if (!pointInBbox(d.coords.lat, d.coords.lng, bbox)) continue;
    const dLat = d.coords.lat - center.lat;
    const dLng = d.coords.lng - center.lng;
    const dist = dLat * dLat + dLng * dLng;
    if (!best || dist < best.d) {
      best = { slug: d.slug, name: d.name, d: dist };
    }
  }
  return best ? { slug: best.slug, name: best.name } : null;
}

/** Presledek med poll poskusi (preklic odjemalca ga skrajša). */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(), ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true }
    );
  });
}

// ---------------------------------------------------------------------------
// IZVEDBA POIZVEDBE (z veljavnim ključem IN znanim izvorom — prihodnja
// aktivacija; današnja produkcijska pot se ustavi pri „origin-required")
// ---------------------------------------------------------------------------

async function executeQuery(
  client: SkyscannerClient,
  q: SupplyQuery,
  originPlaceId: string
): Promise<QueryOutcome> {
  if (!q.bbox) return { products: [], skipped: 0, note: "no-bbox" };
  if (!q.date) return { products: [], skipped: 0, note: "date-required" };

  const canonical = resolveCanonicalDestination(q.bbox);
  if (!canonical) {
    return { products: [], skipped: 0, note: "no-destination-in-view" };
  }

  // Pogodbeno telo (javna dokumentacija v3 — Flights Live Prices):
  // market/locale/currency so STALI (SI država, en-GB dokumentirani
  // locale, EUR valuta cen — pogodbeno zahtevana).
  // HONESTY (adults=1): iskanje za ENO odraslo osebo, da je enota cene
  // „per_person" poštena (cena vira za skupino bi bila SKUPNA — q.pax
  // namerno NE pošiljamo; skupna cena se izračuna pri ponudniku).
  const req = {
    query: {
      market: "SI",
      locale: "en-GB",
      currency: "EUR",
      outbound_leg: {
        origin_place_id: originPlaceId,
        destination_place_id: SKYSCANNER_SI_DESTINATION_PLACE_ID,
        date: q.date,
      },
      adults: 1,
      cabin_class: "CABIN_CLASS_ECONOMY",
    },
  };

  // KORAK 1: ustvari živo iskanje → session token.
  const sessionToken = await client.createLiveSearch(req, {
    signal: q.signal,
  });

  // KORAK 2: poll do RESULT_STATUS_COMPLETE (zgornja meja poskusov —
  // vir, ki ne dokonča, je odpoved: NE preslikamo delnega odgovora).
  let raw: SkyscannerPollResponse | null = null;
  for (let attempt = 0; attempt < SKYSCANNER_MAX_POLLS; attempt++) {
    const res = await client.pollLiveSearch(sessionToken, {
      signal: q.signal,
    });
    if (res.status === SKYSCANNER_RESULT_COMPLETE) {
      raw = res;
      break;
    }
    if (attempt < SKYSCANNER_MAX_POLLS - 1) {
      await sleep(SKYSCANNER_POLL_INTERVAL_MS, q.signal);
    }
  }
  if (!raw) {
    // Iskreno: delnega (nedokončanega) odgovora NE preslikamo v inventar.
    throw new SkyscannerApiError("timeout", "poll-incomplete");
  }

  const fetchedAt = new Date().toISOString();
  const { products, skipped, note } = mapSkyscannerItineraries(raw, {
    locale: q.locale,
    fetchedAt,
    canonical,
    destinationPlaceId: SKYSCANNER_SI_DESTINATION_PLACE_ID,
  });

  return { products, skipped, ...(note ? { note } : {}) };
}

// ---------------------------------------------------------------------------
// ADAPTER
// ---------------------------------------------------------------------------

export function createSkyscannerAdapter(
  entry: ProviderRegistryEntry,
  deps: SkyscannerAdapterDeps = {}
): SupplyAdapter {
  return {
    entry,

    async search(q: SupplyQuery): Promise<ProviderProduct[]> {
      lastCachedFlag = false;
      lastSkippedCount = 0;
      lastNote = undefined;

      // === CAPABILITY GATE (iskren; brez ključa NI podatkov) ===
      const apiKey = skyscannerApiKeyFromEnv();
      if (!apiKey) {
        // NE kličemo vira, NE simuliramo, NE izmišljujemo — plast je
        // iskreno prazna z opombo (telemetrija + provider panel).
        lastNote = "not-configured";
        return [];
      }

      // === PRODUCT GAP GATE: izvor leta (PROMINENTNA vrzel — glej
      //     glavo datoteke). Iskreno prazno BREZ klica vira. ===
      const rawOrigin = deps.originPlaceId?.() ?? null;
      const originPlaceId =
        typeof rawOrigin === "string" && isSkyscannerPlaceId(rawOrigin)
          ? rawOrigin
          : null;
      if (!originPlaceId) {
        lastNote = "origin-required";
        return [];
      }

      if (!q.bbox) {
        lastNote = "no-bbox";
        return [];
      }
      // Pogodba ZAHTEVA datum outbound etape (brez datuma NI iskanja —
      // NE izmišljujemo „privzetega" datuma).
      if (!q.date) {
        lastNote = "date-required";
        return [];
      }

      const key = queryKey(q, originPlaceId);

      // 1) Negativni predpomnilnik (okvara vira v zadnjih 60 s — NE
      //    tolčemo vira, ki je ravno odklonil 401/403/429/5xx).
      const failAt = failureUntil.get(key);
      if (failAt != null && Date.now() < failAt) {
        lastNote = "recently-failed";
        return [];
      }
      if (failAt != null) failureUntil.delete(key);

      // 2) Coalescing: sočasne enake poizvedbe delijo ENO izvedbo
      //    (preklic prvega odjemalca prekine skupni poskus — naslednja
      //    poizvedba poskusi znova; vzorec Task 44-b). TO JE dedup
      //    sočasnih klicev, NE predpomnilnik izpisa (žive cene).
      const existing = inflight.get(key);
      if (existing) {
        const outcome = await existing;
        lastCachedFlag = true; // deljena izvedba = ni mojega mrežnega klica
        lastSkippedCount = outcome.skipped;
        lastNote = outcome.note;
        return outcome.products;
      }

      const client = new SkyscannerClient({
        apiKey,
        baseUrl: skyscannerBaseUrlFromEnv(),
        ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
      });
      const task = executeQuery(client, q, originPlaceId).finally(() => {
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
