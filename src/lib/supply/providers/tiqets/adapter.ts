// ============================================================================
// TRAVEL SUPPLY MAP — TIQETS ADAPTER (Task 53)
// ============================================================================
// ČETRTI realni SupplyAdapter (vrstni red: OSM → KiwiTaxi → Viator →
// GetYourGuide → TIQETS). Ni „Tiqets UI sistema" — provider je adapter
// v enotnem toku: ProviderRegistry → SupplyAdapter → ProviderProduct →
// /api/supply/search → Map → ProductModal → Add to my plan → AI → /go.
//
// CAPABILITY GATE (iskren — živo preverjeno v Task 53-1):
//  - POGODBA: vrata so ŽIVA (api.tiqets.com/v2/products brez ključa →
//    HTTP 401 + napakovna ovojnica {success:false, api_version 2.7}).
//    Uspešna ovojnica po konvenciji {success:true, data:[…]}.
//  - DOSTOP:  TIQETS_API_KEY NI nastavljen. Ključ Distributor API izda
//    Tiqets po odobritvi affiliate prijave (portals.tiqets.com — portal
//    zahteva prijavo; IME GLAVE "Api-Key" je DOCUMENTED-ASSUMPTION —
//    preveri ob aktivaciji, glej client.ts).
//  ⇒ BREZ KLJUČA: adapter vrne PRAZEN sloj z iskreno opombo
//    „not-configured" (NIČ ne izmišljujemo, NE simuliramo živega API-ja,
//    lažno zelenih vrat NI). Ko ključ pride v env, plast oživi BREZ
//    spremembe kode (ista pot, isti kanonski model).
//
// GEO SEMANTIKA (iskreno, po vzorcu viator/kiwitaxi destinacijske izbire):
//  Vir iče PRODUKTE PO MESTU (city parameter — živa sonda: city=amsterdam).
//  Adapter:
//   1. iz bbox izbere 1–3 KANONSKE destinacije (DESTINATIONS iz
//      slovenia-data.ts), katerih koordinate ležijo V viewportu; če jih
//      je več, vzame najbližje središču viewporta (deterministično);
//   2. sekvencialna iskanja po mestih (vljudnost do vira — vzorec Viator,
//      ≤ 3 klicev; registrovni maxCallsPerMin ščiti NAD tem);
//   3. pin produkta = SAMO venue koordinate iz surovega zapisa
//      (geoPrecision "exact"); produkti brez venue koordinat ostanejo
//      BREZ pina (iskreno — NE pinamo po mestu).
//  Viewport brez kanonske destinacije → „no-destination-in-view"
//  (iskreno prazno — vir ne pozna koordinatnega iskanja, mi pa ne
//  ugibamo mest). Zoom gating je v runnerju (minZoom v registru).
//
// PREDPOMNILNIK (pogodba vira — portal-gated, zato KONZERVATIVNO):
//  - rezultati: TTL iz registra (cacheTtlMs). 0 = BREZ predpomnilnika
//    rezultatov (iskrena odločitev: svežost vira ni dokumentirana →
//    NE shranjujemo izpisa); > 0 → pozitivni predpomnilnik s tem TTL;
//  - negativni predpomnilnik okvar: 60 s na ključ (vzorec Task 44-b —
//    vir z 401/429/5xx NE dobi zaporednih klicev; Tiqets NE dokumentira
//    trajanja blokade → enotnih 60 s, NE ugibamo);
//  - sočasne identične poizvedbe delijo ENO izvedbo (coalescing).
// ============================================================================

import type { ProviderProduct, SupplyQuery } from "../../types";
import type { ProviderRegistryEntry } from "../../registry";
import type { SupplyAdapter } from "../../adapter";
import { DESTINATIONS } from "@/lib/slovenia-data";
import { TiqetsClient, tiqetsApiKeyFromEnv } from "./client";
import {
  filterValidTiqetsProducts,
  tiqetsProductId,
  type TiqetsRawProduct,
} from "./types";
import { mapTiqetsProducts, TIQETS_MAX_RESULTS } from "./mapper";

/** Naše kanonske destinacije (slovenia-data — en sam vir resnice). */
const CANONICAL_DESTS = DESTINATIONS.map((d) => ({
  slug: d.slug,
  name: d.name,
  lat: d.coords.lat,
  lng: d.coords.lng,
}));

/** Največ destinacijskih iskanj na poizvedbo (1–3 mest; vljudnost vira). */
const MAX_DESTINATION_SEARCHES = 3;

/** Okvaro vira zapomnimo 60 s (vljudnost + odpornost — Task 44-b vzorec). */
const FAILURE_TTL_MS = 60_000;

/** Zgornja meja predpomnjenih rezultatov (FIFO evict). */
const RESULT_CACHE_MAX = 200;

// ---------------------------------------------------------------------------
// IZBIRA DESTINACIJ (bbox → 1–3 kanonskih mest; vzorec viator/kiwitaxi)
// ---------------------------------------------------------------------------

/**
 * Kanonske destinacije, katerih koordinate ležijo V bbox (1–3); če jih je
 * več, najbližje središču bboxa (kvadratna razdalja v stopinjah — dovolj
 * za rangiranje; vez na istem naboru kot GYG radius). Deterministično
 * (razvrstitev po razdalji, nato po slug).
 */
export function selectCanonicalDestinations(
  bbox: [number, number, number, number],
  max = MAX_DESTINATION_SEARCHES
): { slug: string; name: string; lat: number; lng: number }[] {
  const [s, w, n, e] = bbox;
  const inside = CANONICAL_DESTS.filter(
    (d) => d.lat >= s && d.lat <= n && d.lng >= w && d.lng <= e
  );
  if (inside.length <= max) return inside;
  const cLat = (s + n) / 2;
  const cLng = (w + e) / 2;
  return inside
    .map((d) => ({
      d,
      dist: (d.lat - cLat) ** 2 + (d.lng - cLng) ** 2,
    }))
    .sort((a, b) => a.dist - b.dist || a.d.slug.localeCompare(b.d.slug))
    .slice(0, max)
    .map((x) => x.d);
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
export function resetTiqetsAdapterCaches(): void {
  resultCache.clear();
  failureUntil.clear();
  inflight.clear();
  lastCachedFlag = false;
  lastSkippedCount = 0;
  lastNote = undefined;
}

/** Diagnostika (testi/admin): zadnja opomba izvedbe adapterja. */
export function tiqetsLastNote(): string | undefined {
  return lastNote;
}

/** Diagnostika (testi/admin): št. zavrnjenih zapisov ZADNJE izvedbe. */
export function tiqetsLastSkipped(): number {
  return lastSkippedCount;
}

/**
 * Ključ poizvedbe: bbox zaokrožen na ~0,02° (≈2 km zrnato — majhna
 * gibanja viewporta NE raztresajo predpomnilnika) + locale (naše opombe
 * so dvojezične). Datum NAMERNO NI del ključa: iskanje po mestu ga NE
 * uporablja (živo preverjena oblika — city parameter) → isti odgovor za
 * vse datume (datum v ključu bi samo razpršil coalescing/predpomnilnik).
 */
function queryKey(q: SupplyQuery): string {
  const b = q.bbox ?? [0, 0, 0, 0];
  const r = (n: number) => Math.round(n * 50) / 50;
  return [r(b[0]), r(b[1]), r(b[2]), r(b[3]), q.locale].join("|");
}

// ---------------------------------------------------------------------------
// IZVEDBA POIZVEDBE (z veljavnim ključem)
// ---------------------------------------------------------------------------

async function executeQuery(
  client: TiqetsClient,
  q: SupplyQuery
): Promise<QueryOutcome> {
  if (!q.bbox) return { products: [], skipped: 0, note: "no-bbox" };

  const dests = selectCanonicalDestinations(q.bbox);
  if (dests.length === 0) {
    // Viewport brez kanonske destinacije — vir ne pozna koordinatnega
    // iskanja; NE ugibamo mest (iskreno prazno z opombo).
    return { products: [], skipped: 0, note: "no-destination-in-view" };
  }

  // SEKVENCIALNA iskanja po mestih (vljudnost do vira — vzorec Viator:
  // sočasen trojni udar bi bil nepotreben tvegano; ≤ 3 klicev).
  const valid: TiqetsRawProduct[] = [];
  let skippedInvalid = 0;
  for (const d of dests) {
    // Živo opažena oblika parametra: city=amsterdam (male črke) → ime
    // kanonske destinacije v malih črkah (DOCUMENTED-ASSUMPTION: semantika
    // ujemanja je portal-gated; če vir mesta ne pozna, vrne prazen
    // odgovor — to je iskreno prazno, NE napaka).
    const data = await client.searchProducts(
      { city: d.name.toLowerCase() },
      { signal: q.signal }
    );
    const filtered = filterValidTiqetsProducts(data);
    valid.push(...filtered.valid);
    skippedInvalid += filtered.skipped;
  }

  // Dedupe po providerProductId + kap TIQETS_MAX_RESULTS (gostota pod
  // nadzorom; isti produkt se lahko pojavi v prekrivajočih mestih).
  const byId = new Map<string, TiqetsRawProduct>();
  let capped = false;
  for (const item of valid) {
    const id = tiqetsProductId(item.id);
    if (id == null || byId.has(id)) continue;
    if (byId.size >= TIQETS_MAX_RESULTS) {
      capped = true;
      break;
    }
    byId.set(id, item);
  }

  const fetchedAt = new Date().toISOString();
  const { products, skipped: mappedSkipped } = mapTiqetsProducts(
    [...byId.values()],
    { locale: q.locale, fetchedAt }
  );

  const notes: string[] = [];
  if (capped) notes.push("capped");
  if (products.length === 0) notes.push("no-match");

  return {
    products,
    skipped: skippedInvalid + mappedSkipped,
    note: notes.length > 0 ? notes.join("+") : undefined,
  };
}

// ---------------------------------------------------------------------------
// ADAPTER
// ---------------------------------------------------------------------------

export function createTiqetsAdapter(
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
      const apiKey = tiqetsApiKeyFromEnv();
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
      // TTL iz registra: 0 = BREZ predpomnilnika rezultatov (svežost vira
      // portal-gated → iskreno NE shranjujemo izpisa; samo coalescing +
      // negativni predpomnilnik okvar).
      const ttl = entry.cacheTtlMs;

      // 1) Pozitivni predpomnilnik (SAMO ob ttl > 0).
      if (ttl > 0) {
        const hit = resultCache.get(key);
        if (hit && Date.now() - hit.at < ttl) {
          lastCachedFlag = true;
          lastSkippedCount = hit.outcome.skipped;
          lastNote = hit.outcome.note;
          return hit.outcome.products;
        }
        if (hit) resultCache.delete(key);
      }

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

      const client = new TiqetsClient({
        apiKey,
        ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
      });
      const task = executeQuery(client, q).finally(() => {
        inflight.delete(key);
      });
      inflight.set(key, task);
      try {
        const outcome = await task;
        lastSkippedCount = outcome.skipped;
        lastNote = outcome.note;

        // Predpomni pozitiven izid SAMO ob ttl > 0 (tudi prazen — izvid
        // je izvid) + FIFO evict.
        if (ttl > 0) {
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
        }
        return outcome.products;
      } catch (e) {
        // Okvara vira → negativni predpomnilnik (60 s) + runner zapiše
        // degraded (adapterji so izolirani — OSM/KiwiTaxi/Viator/GYG
        // ostanejo).
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
