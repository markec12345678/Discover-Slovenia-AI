// ============================================================================
// TRAVEL SUPPLY MAP — BOOKING ADAPTER (Task 53)
// ============================================================================
// ŠESTI realni SupplyAdapter (vrstni red: OSM → KiwiTaxi → Viator →
// GetYourGuide → Tiqets → BOOKING). Ni „Booking UI sistema" — provider je
// adapter v enotnem toku: ProviderRegistry → SupplyAdapter →
// ProviderProduct → /api/supply/search → Map → ProductModal → Add to my
// plan → AI → /go.
//
// CAPABILITY GATE (iskren — Task 53-1):
//  - POGODBA: Demand API v3 je javno dokumentirana
//    (developers.booking.com/demand/docs — portal 200 preverjen v T52;
//    endpoint obliki search/rates dokumentirane v T53-1).
//  - DOSTOP:  BOOKING_API_KEY NI nastavljen. Ključ zahteva status
//    „Managed Affiliate Partner" (pogodba z Booking.com). Živi sondo iz
//    peskovnika je onemogočil DNS (omejitev PESKOVNIKA — ne pogodbe).
//    IME GLAVE "Booking-API-Key" je DOCUMENTED-ASSUMPTION — ponovno
//    preveri ob aktivaciji (glej client.ts).
//  ⇒ BREZ KLJUČA: adapter vrne PRAZEN sloj z iskreno opombo
//    „not-configured" (NIČ ne izmišljujemo, NE simuliramo živega API-ja).
//    Ko ključ pride v env, plast oživi BREZ spremembe kode.
//
// GEO SEMANTIKA (POZOR — pretvorba bbox):
//  Vir iče po bbox v vrstnem redu WEST,SOUTH,EAST,NORTH; naš SupplyQuery
//  bbox je [south, west, north, east] → bookingBboxFromSupply PREVIDNO
//  pretvarja (regresijsko testirano). Pin produkta = točna lokacija
//  nepremičnine (location.latitude/longitude, geoPrecision "exact");
//  brez koordinat → brez pina (NE pinamo po mestu).
//
// DATUMI (dokumentirana oblika endpointa ZAHTEVA checkin/checkout):
//  q.date → checkin, checkout = NASLEDNJI dan (1-nočno okno — iz tega
//  izhaja tudi semantika cene bloka kot NOČNE cene, glej mapper.ts).
//  Brez q.date → privzeto okno +7/+8 dni od danes (dokumentirana
//  produktna odločitev — iskren, determinističen izbor).
//
// CENE (dve stopnji, iskreno):
//  1. GET /v3/accommodations/search (bbox + okno) → nastanitve;
//  2. EN POST /v3/accommodations/rates batch klic za najdene ID-je →
//     najnižja nočna cena po nastanitvi (fromPrice, unit per_night).
//  Če rates klic odpove → nastanitve BREZ cene + opomba
//  „rates-unavailable" (iskanje JE uspelo — plast NE pade; samo preklic
//  odjemalca se širi naprej). Nastanitev brez cene ostane BREZ cene
//  (nikoli 0 kot lažna cena).
//
// PREDPOMNILNIK: rezultati s TTL iz registra (10 min — standardna
// svežost cen nastanitev); negativni predpomnilnik okvar 60 s (Task 44-b
// vzorec; 429 brez dokumentirane blokade → enotnih 60 s, ne ugibamo);
// coalescing sočasnih identičnih poizvedb.
// ============================================================================

import type { ProviderProduct, SupplyQuery } from "../../types";
import type { ProviderRegistryEntry } from "../../registry";
import type { SupplyAdapter } from "../../adapter";
import { DESTINATIONS } from "@/lib/slovenia-data";
import {
  BookingClient,
  BookingApiError,
  bookingApiKeyFromEnv,
  bookingBaseUrlFromEnv,
} from "./client";
import { filterValidAccommodations, bookingAccommodationId, type BookingAccommodation } from "./types";
import {
  mapBookingAccommodations,
  extractNightlyPrices,
  BOOKING_MAX_RESULTS,
} from "./mapper";

/** Okvaro vira zapomnimo 60 s (vljudnost + odpornost — Task 44-b vzorec). */
const FAILURE_TTL_MS = 60_000;

/** Zgornja meja predpomnjenih rezultatov (FIFO evict). */
const RESULT_CACHE_MAX = 200;

/** Dan v ms (UTC — datumski račun je vedno nad UTC polnočmi). */
const DAY_MS = 86_400_000;

/** Privzeto št. odraslih, kadar poizvedba ne poda potnikov (1–20). */
const DEFAULT_ADULTS = 2;

/** Privzeti zamik checkina od danes, kadar poizvedba nima datuma. */
const DEFAULT_CHECKIN_OFFSET_DAYS = 7;

/** Naše kanonske destinacije (slovenia-data — en sam vir resnice). */
const CANONICAL_DESTS = DESTINATIONS.map((d) => ({
  slug: d.slug,
  name: d.name,
  lat: d.coords.lat,
  lng: d.coords.lng,
}));

// ---------------------------------------------------------------------------
// BBOX PRETVORBA ( SupplyQuery [south,west,north,east] → vir
// [west,south,east,north] — POZOR, regresijsko testirano)
// ---------------------------------------------------------------------------

/**
 * Pretvorba našega bbox [south, west, north, east] v POGODBENI vrstni red
 * vira [west, south, east, north]. NAPAČNA pretvorba bi tiho iskala
 * povsem drug geografski pravokotnik — zato JE izrecna, izvozna in
 * testirana funkcija.
 */
export function bookingBboxFromSupply(
  bbox: [number, number, number, number]
): [number, number, number, number] {
  const [south, west, north, east] = bbox;
  return [west, south, east, north];
}

// ---------------------------------------------------------------------------
// DATUMI (checkin/checkout — 1-nočno okno)
// ---------------------------------------------------------------------------

/** ISO YYYY-MM-DD → UTC Date (neveljavna oblika → null). */
function parseIsoDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date → ISO YYYY-MM-DD (UTC). */
function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Okno bivanja iz poizvedbe: q.date → checkin + NASLEDNJI dan; brez
 * datuma → privzeto +7/+8 dni od danes (dokumentirana produktna odločitev
 * — iskren determinističen izbor, NE „danes": današnje cene bi bile že
 * ob prvem prikazu zastarele). Neveljaven datumski niz → privzeto okno
 * (zgornje plasti validirajo; garbage-in obramba). VEDNO 1 noč — iz tega
 * izhaja semantika cene bloka kot NOČNE cene (mapper.ts).
 */
export function stayDates(
  date: string | undefined,
  now: Date = new Date()
): { checkin: string; checkout: string } {
  const parsed = date != null ? parseIsoDate(date) : null;
  const base =
    parsed ??
    new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) +
        DEFAULT_CHECKIN_OFFSET_DAYS * DAY_MS
    );
  return {
    checkin: toIsoDate(base),
    checkout: toIsoDate(new Date(base.getTime() + DAY_MS)),
  };
}

// ---------------------------------------------------------------------------
// IZBIRA DESTINACIJE ZA /go/hotels?dest= (najbližja kanonska)
// ---------------------------------------------------------------------------

/** Središče bbox. */
function bboxCenter(bbox: [number, number, number, number]): {
  lat: number;
  lng: number;
} {
  const [s, w, n, e] = bbox;
  return { lat: (s + n) / 2, lng: (w + e) / 2 };
}

/**
 * Najbližja kanonska destinacija referenčni točki (približek haversine s
 * cos popravkom — isti vzorec kot GYG radius rangiranje; dovolj za izbor
 * affiliate destinacije, ne za geo trditev). Deterministično (razdalja,
 * nato slug).
 */
function nearestCanonicalDest(ref: {
  lat: number;
  lng: number;
}): { slug: string; name: string; lat: number; lng: number } {
  const KM_PER_DEG = 111.32;
  const cosLat = Math.cos((ref.lat * Math.PI) / 180);
  let best = CANONICAL_DESTS[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const d of CANONICAL_DESTS) {
    const dLatKm = (d.lat - ref.lat) * KM_PER_DEG;
    const dLngKm = (d.lng - ref.lng) * KM_PER_DEG * cosLat;
    const dist = dLatKm * dLatKm + dLngKm * dLngKm;
    if (dist < bestDist || (dist === bestDist && d.slug < best.slug)) {
      best = d;
      bestDist = dist;
    }
  }
  return best;
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
export function resetBookingAdapterCaches(): void {
  resultCache.clear();
  failureUntil.clear();
  inflight.clear();
  lastCachedFlag = false;
  lastSkippedCount = 0;
  lastNote = undefined;
}

/** Diagnostika (testi/admin): zadnja opomba izvedbe adapterja. */
export function bookingLastNote(): string | undefined {
  return lastNote;
}

/** Diagnostika (testi/admin): št. zavrnjenih zapisov ZADNJE izvedbe. */
export function bookingLastSkipped(): number {
  return lastSkippedCount;
}

/**
 * Ključ poizvedbe: bbox zaokrožen na ~0,02° + locale + datum + potniki.
 * Datum IN potniki sta DEL identitete: oba NAMENJNO vplivata na zahtevo
 * (okno checkin/checkout + adults) → drugačen odgovor vira (drugačen
 * rezultat je ČIST dogovor, ne razprševanje).
 */
function queryKey(q: SupplyQuery): string {
  const b = q.bbox ?? [0, 0, 0, 0];
  const r = (n: number) => Math.round(n * 50) / 50;
  return [
    r(b[0]),
    r(b[1]),
    r(b[2]),
    r(b[3]),
    q.locale,
    q.date ?? "-",
    q.pax ?? "-",
  ].join("|");
}

/** Št. odraslih iz poizvedbe (1–20; garbage-in obramba). */
function adultsOf(q: SupplyQuery): number {
  const raw =
    typeof q.pax === "number" && Number.isFinite(q.pax)
      ? Math.floor(q.pax)
      : DEFAULT_ADULTS;
  return Math.min(20, Math.max(1, raw));
}

// ---------------------------------------------------------------------------
// IZVEDBA POIZVEDBE (z veljavnim ključem)
// ---------------------------------------------------------------------------

async function executeQuery(
  client: BookingClient,
  q: SupplyQuery
): Promise<QueryOutcome> {
  if (!q.bbox) return { products: [], skipped: 0, note: "no-bbox" };

  // PRETVORBA bbox: naš [s,w,n,e] → POGODBENI [w,s,e,n] vira.
  const searchBbox = bookingBboxFromSupply(q.bbox);
  const { checkin, checkout } = stayDates(q.date);
  const adults = adultsOf(q);

  // 1) ISKANJE po bbox + oknu (dokumentirana oblika zahteve).
  const rawItems = await client.searchAccommodations(
    { bbox: searchBbox, checkin, checkout, adults },
    { signal: q.signal }
  );
  const { valid, skipped } = filterValidAccommodations(rawItems);

  // Kap (gostota pod nadzorom) — cene sprašujemo SAMO za ohranjene.
  const capped = valid.length > BOOKING_MAX_RESULTS;
  const kept = capped ? valid.slice(0, BOOKING_MAX_RESULTS) : valid;

  // 2) EN batch rates klic za najdene ID-je (dokumentirano telo zahteve).
  //    Odpoved → nastanitve BREZ cene + opomba (iskanje JE uspelo);
  //    preklic odjemalca se širi (NI mehka napaka vira).
  const nightlyById = new Map<string, number>();
  const notes: string[] = [];
  if (kept.length > 0) {
    const ids = kept
      .map((a) => bookingAccommodationId(a.id))
      .filter((id): id is string => id != null);
    try {
      const ratesRaw = await client.requestRates(
        { accommodationIds: ids, checkin, checkout, adults },
        { signal: q.signal }
      );
      for (const [id, amount] of extractNightlyPrices(ratesRaw)) {
        nightlyById.set(id, amount);
      }
    } catch (e) {
      if (e instanceof BookingApiError && e.kind === "aborted") throw e;
      // Iskreno: nastanitve ostanejo BREZ cene + opomba (plast NE pade).
      notes.push("rates-unavailable");
    }
  }

  // Destinacija za /go/hotels?dest= (najbližja kanonska — nastanitvi,
  // če ima koordinate, sicer središču viewporta).
  const center = bboxCenter(q.bbox);
  const destFor = (acc: BookingAccommodation): string => {
    const loc = acc.location;
    const ref =
      loc != null &&
      typeof loc.latitude === "number" &&
      Number.isFinite(loc.latitude) &&
      Math.abs(loc.latitude) <= 90 &&
      typeof loc.longitude === "number" &&
      Number.isFinite(loc.longitude) &&
      Math.abs(loc.longitude) <= 180
        ? { lat: loc.latitude, lng: loc.longitude }
        : center;
    return nearestCanonicalDest(ref).name;
  };

  const fetchedAt = new Date().toISOString();
  const { products, skipped: mappedSkipped } = mapBookingAccommodations(
    kept,
    { locale: q.locale, fetchedAt, nightlyById, destFor }
  );

  if (capped) notes.push("capped");
  if (products.length === 0) notes.push("no-match");

  return {
    products,
    skipped: skipped + mappedSkipped,
    note: notes.length > 0 ? notes.join("+") : undefined,
  };
}

// ---------------------------------------------------------------------------
// ADAPTER
// ---------------------------------------------------------------------------

export function createBookingAdapter(
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
      const apiKey = bookingApiKeyFromEnv();
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
      // TTL iz registra (10 min — standardna svežost cen nastanitev).
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

      const client = new BookingClient({
        apiKey,
        baseUrl: bookingBaseUrlFromEnv(),
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
        // Okvara vira (iskanje/cene so padle trdo — 401/429/5xx/oblika)
        // → negativni predpomnilnik (60 s) + runner zapiše degraded
        // (adapterji so izolirani — OSM/KiwiTaxi/Viator/GYG/Tiqets
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
