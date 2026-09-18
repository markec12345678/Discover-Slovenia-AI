// ============================================================================
// TRAVEL SUPPLY MAP — KIWITAXI: MAPPER / NORMALIZACIJA (Task 43, 1.49.0)
// ============================================================================
// KiwiTaxi raw CSV → validate → normalize → dataset (KiwiTaxiDataset),
// ki ga adapter preslika v kanonski ProviderProduct (adapter.ts).
//
// Tok (naročnik §2):  raw → validate → normalize → ProviderProduct.
// Ne spreminjamo kanonskega modela zaradi KiwiTaxi-ja — VSE preslikave
// so v tem mapperju + adapterju.
//
// OBSEG (dokumentirana odločitev): rute, ki se dotikajo Slovenije —
//  (a) odhod iz SI (country_id=3; 992 rut vključno čezmejnimi) in
//  (b) prihod V SI kraj iz tujine (611 rut: IT 239 / HR 177 / AT 139 / …).
// Obe smeri sta relevantni za načrtovanje potovanja PO Sloveniji.
//
// VARNOST (§16): vsa polja so NEZAUPANI vhod:
//  - ID-ji: striktno pozitivna cela števila;
//  - imena: strip kontrolnih znakov + <>"'`{} (HTML/JS injekcija), kap 80;
//  - cene: končno število, 0 < c < 10.000 (sanity);
//  - URL poti: DOVOLJEN je SAMO relativni tvar /država/iz-%3E-to
//    (charset [A-Za-z0-9+~._%-], brez „://", „..", „?", „#", „@"),
//    dolžina ≤ 200 — absolutiziramo IZKLJUČNO na https://kiwitaxi.com;
//  - transfer URL: natanko /transfers/\d+;
//  - WKT: parseWktPolygon (lastna meja zaupanja);
//  - kapike: mest ≤ 2.000, rut ≤ 5.000, razredov na ruto ≤ 12,
//    transferjev ≤ 30.000 (napihovanje pod nadzorom).
//
// Čista funkcija brez @/ uvozov (buni skripta IN Next pot).
// ============================================================================

import { parseWktPolygon } from "./wkt";
import type {
  KiwiIngestResult,
  KiwiPlace,
  KiwiPlaceType,
  KiwiRawPlace,
  KiwiRawRoute,
  KiwiRawTransfer,
  KiwiRawTransferType,
  KiwiRoute,
  KiwiRouteClass,
  KiwiTaxiDataset,
} from "./types";

// ---------------------------------------------------------------------------
// KAPIKI (obramba pred napihovanjem/oversized zapisi)
// ---------------------------------------------------------------------------
const MAX_PLACES = 2_000;
const MAX_ROUTES = 5_000;
const MAX_TRANSFERS = 30_000;
const MAX_CLASSES_PER_ROUTE = 12;
const MAX_NAME_LEN = 80;
const MAX_URLPATH_LEN = 200;
const MAX_PRICE_EUR = 10_000;
const MAX_DISTANCE_KM = 5_000;
const MAX_DURATION_MIN = 3_600;

/** ID-ji place tipov (preverjeno v živo iz place_types.csv). */
const PLACE_TYPE_BY_ID: Record<string, KiwiPlaceType> = {
  "1": "city",
  "2": "airport",
  "3": "train_station",
  "4": "port",
  "5": "bus_station",
};

/** Slovenija (country_id=3, preverjeno v živo iz countries.csv). */
const SI_COUNTRY_ID = "3";

// ---------------------------------------------------------------------------
// VALIDACIJSKA POMOČNIKA
// ---------------------------------------------------------------------------

/** Pozitivno celo število (ID) ali null. */
function parseInt10(raw: string): number | null {
  if (!/^\d{1,9}$/.test(raw)) return null;
  const n = Number(raw);
  return n > 0 ? n : null;
}

/** Ne-negativno (ali pozitivno) število z mejami ali null. */
function parseFloatBounded(raw: string, min: number, max: number): number | null {
  // Striktni decimalni format (zavrne hex/NaN/Infinity/eksponentne igre).
  if (!/^\d{1,7}(\.\d+)?$/.test(raw)) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

/**
 * Ime iz vira: brez kontrolnih znakov, brez HTML/JS nevarnih znakov,
 * brez vododnjih/sledečih presledkov, kap dolžine. Prazno → null
 * (kraj/ruta brez imena se ZAVRNE — ne more biti pošteno prikazan).
 */
function cleanName(raw: string): string | null {
  const cleaned = raw
    // kontrolni znaki + HTML/js injekcijski znaki stran (React escaping
    // je druga plast; ingest je prva — namerno OBA, vzorec OSM adapterja)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>"'`{}$\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME_LEN);
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Relativna URL pot rute (npr. /slovenia/ljubljana+airport-%3Ebled).
 * DOVOLJEN je SAMO konservativen charset BREZ sheme/hosta — absolutizacija
 * na https://kiwitaxi.com je varna po konstrukciji (ne more oditi na
// tuj host). Zavrne: absolutne URL-je, „//…", „..", „?", „#", „@", „:".
 *
 * TASK 44 §12 (1.49.4): KODIRANE oblike nevarnih znakov — po charset
 * preverbi ENKRAT dekodiramo (%XX) in znova pregledamo isti nabor
 * („..", „//", „:", „@", „\"). Sicer bi %2e%2e/%2F%2F/%40/%3A pretihotapili
 * prvi filter (host ostane kiwitaxi.com — nevarnost je nizka, a spec
 * zahteva fail-closed tudi za kodirane poskuse). Legitimni format vira
 * uporablja %3E („→") — dekodiranje ga spremeni v „>", ki v naboru ni
 * prepovedan; vseh 1494 realnih poti mineva (preverjeno). Dvojno
 * kodiranje (%252e) po enkratni dekodiravi ostane „%2e" brez surovega
 * „.." — strežniki dekodirajo enkrat, ne dvakrat (dokumentirana meja).
 * Neveljavna %ZZ sekvenca → decodeURIComponent vrže → zavrnjeno.
 */
function cleanRouteUrlPath(raw: string): string | null {
  const s = raw.trim();
  if (s.length === 0 || s.length > MAX_URLPATH_LEN) return null;
  if (!s.startsWith("/")) return null;
  if (s.includes("//") || s.includes("..") || s.includes("?") || s.includes("#")) return null;
  if (s.includes("@") || s.includes(":") || s.includes("\\")) return null;
  // /segment/segment — segmenti iz dovoljenega charseta (ne prazen).
  if (!/^\/[A-Za-z0-9+~._%-]+(\/[A-Za-z0-9+~._%-]+)*$/.test(s)) return null;
  // §12: dekodirana oblika mora obležati ISTEMU naboru nevarnih znakov.
  let decoded: string;
  try {
    decoded = decodeURIComponent(s);
  } catch {
    return null; // %ZZ / samoten % → fail-closed
  }
  if (
    decoded.includes("..") ||
    decoded.includes("//") ||
    decoded.includes(":") ||
    decoded.includes("@") ||
    decoded.includes("\\") ||
    decoded.includes("?") ||
    decoded.includes("#")
  ) {
    return null;
  }
  return s;
}

/** Transfer URL: NATANKO /transfers/{id} (dokumentiran format vira). */
function cleanTransferUrlId(raw: string): number | null {
  const m = raw.trim().match(/^\/transfers\/(\d{1,9})$/);
  if (!m) return null;
  const id = Number(m[1]);
  return id > 0 ? id : null;
}

// ---------------------------------------------------------------------------
// GLAVNI MAPPER
// ---------------------------------------------------------------------------

export interface KiwiRawInput {
  places: KiwiRawPlace[];
  routes: KiwiRawRoute[];
  transferTypes: KiwiRawTransferType[];
  transfers: KiwiRawTransfer[];
}

export interface KiwiMapperResult {
  dataset: KiwiTaxiDataset;
  skipped: { places: number; routes: number; transfers: number };
}

/**
 * Normalizacija raw CSV množic v dataset z obsegom „dotik Slovenije".
 * Ne meče napake ob posameznem slabem zapisu — šteje ga v skipped
 * (iskren „partial result"; vzorec OSM adapterja).
 */
export function mapKiwiTaxiDataset(
  raw: KiwiRawInput,
  fetchedAt: string
): KiwiMapperResult {
  const skipped = { places: 0, routes: 0, transfers: 0 };

  // 1) Razredi vozil (id → pax + ime; cene pridejo iz transfers).
  const classById = new Map<number, { name: string; pax: number }>();
  for (const t of raw.transferTypes) {
    const id = parseInt10(t.id);
    const name = cleanName(t.name_en);
    const pax = parseInt10(t.pax);
    if (id == null || !name || pax == null || pax < 1 || pax > 50) continue;
    if (classById.size >= 64) break; // kap razredov (svetovno jih je ~14)
    classById.set(id, { name, pax });
  }

  // 2) Kraji: najprej SLOVENSKI (obseg a), potem zunanji, ki jih obseg
  //    dejansko potrebuje (ciljni kraje odhodov + tuji prevzemni kraji
  //    prihodov) — dva prehoda: najprej določimo relevantne route ID-je.
  const siPlaceIds = new Set<number>();
  for (const p of raw.places) {
    if (p.country_id === SI_COUNTRY_ID) {
      const id = parseInt10(p.id);
      if (id != null) siPlaceIds.add(id);
    }
  }

  // Relevantne rute: odhod iz SI ALI prihod v SI kraj.
  const relevantRouteIds = new Set<number>();
  const routeById = new Map<number, KiwiRawRoute>();
  for (const r of raw.routes) {
    const id = parseInt10(r.id);
    if (id == null || routeById.has(id)) continue;
    const fromId = parseInt10(r.place_from_id);
    const toId = parseInt10(r.place_to_id);
    if (fromId == null || toId == null || fromId === toId) {
      skipped.routes++;
      continue;
    }
    const fromSi = r.country_id === SI_COUNTRY_ID;
    const intoSi = siPlaceIds.has(toId);
    if (!fromSi && !intoSi) continue; // izven obsega (ne šteje kot skipped)
    if (routeById.size >= MAX_ROUTES) break;
    relevantRouteIds.add(id);
    routeById.set(id, r);
  }

  // Kraji, ki jih obseg potrebuje: vsi SI + from/to relevantnih rut.
  const neededPlaceIds = new Set<number>(siPlaceIds);
  for (const r of routeById.values()) {
    const f = parseInt10(r.place_from_id);
    const t = parseInt10(r.place_to_id);
    if (f != null) neededPlaceIds.add(f);
    if (t != null) neededPlaceIds.add(t);
  }

  const places: KiwiPlace[] = [];
  const placeById = new Map<number, KiwiPlace>();
  for (const p of raw.places) {
    const id = parseInt10(p.id);
    if (id == null || !neededPlaceIds.has(id)) continue;
    const name = cleanName(p.name_en);
    if (!name) {
      skipped.places++;
      continue;
    }
    if (places.length >= MAX_PLACES) break;

    const type = PLACE_TYPE_BY_ID[p.type_id] ?? "other";
    const iata = /^[A-Z0-9]{3,4}$/.test(p.iata) ? p.iata : undefined;

    // Geo IZKLJUČNO iz place_polygon (WKT, lng-first) — brez poligona
    // kraj OSTANE v datasetu (imena so relevantna za opise), brez koordinat.
    const geo = p.place_polygon ? parseWktPolygon(p.place_polygon) : null;

    const place: KiwiPlace = {
      id,
      name,
      type,
      ...(iata ? { iata } : {}),
      ...(geo ? { lat: geo.centroid.lat, lng: geo.centroid.lng, bbox: geo.bbox } : {}),
    };
    places.push(place);
    placeById.set(id, place);
  }

  // 3) Transferji: (route × class) cene — grupiramo po ruti.
  //    Neveljavni zapisi (cena/razred/URL) se štejejo v skipped.
  const classPricesByRoute = new Map<number, KiwiRouteClass[]>();
  let transferCount = 0;
  for (const tr of raw.transfers) {
    const routeId = parseInt10(tr.route_id);
    if (routeId == null || !relevantRouteIds.has(routeId)) continue;
    const typeId = parseInt10(tr.type_id);
    const cls = typeId != null ? classById.get(typeId) : undefined;
    const eur = parseFloatBounded(tr.price_eur, 0.01, MAX_PRICE_EUR);
    const transferIdFromUrl = cleanTransferUrlId(tr.url);
    const transferId = transferIdFromUrl ?? parseInt10(tr.id);
    if (!cls || eur == null || transferId == null || transferIdFromUrl == null) {
      // URL ni kanonski /transfers/{id} ali cena ni sprejemljiva → cel
      // zapis odpade (deep link mora biti dokazljivo našteljiv).
      skipped.transfers++;
      continue;
    }
    if (transferCount >= MAX_TRANSFERS) break;
    transferCount++;
    const arr = classPricesByRoute.get(routeId) ?? [];
    if (arr.length < MAX_CLASSES_PER_ROUTE) {
      arr.push({ transferId, name: cls.name, pax: cls.pax, eur });
    }
    classPricesByRoute.set(routeId, arr);
  }

  // 4) Rute → izdelki (samo z vsaj eno veljavno ceno).
  const routes: KiwiRoute[] = [];
  let pinnedRoutes = 0;
  for (const [id, r] of routeById) {
    const classes = classPricesByRoute.get(id);
    if (!classes || classes.length === 0) {
      skipped.routes++;
      continue;
    }
    const fromId = parseInt10(r.place_from_id);
    const toId = parseInt10(r.place_to_id);
    const from = fromId != null ? placeById.get(fromId) : undefined;
    const to = toId != null ? placeById.get(toId) : undefined;
    if (!from || !to || fromId == null || toId == null) {
      // Prevezni ali ciljni kraj ni bil normaliziran (brez imena) → ruta
      // ni pošteno predstavljiva.
      skipped.routes++;
      continue;
    }
    const distanceKm = parseFloatBounded(r.distance, 0, MAX_DISTANCE_KM);
    const durationMin = parseFloatBounded(r.timeinway, 0, MAX_DURATION_MIN);
    const urlPath = cleanRouteUrlPath(r.url);
    if (distanceKm == null || durationMin == null || urlPath == null) {
      skipped.routes++;
      continue;
    }
    // Utež prodaje (delež v sezoni, 0–100): providerjev lastni gostotni
    // signal — uporabljen SAMO za kapiko rezultatov (ne za „popularnost"
    // trditve). Neveljavna → 0 (ni signala, ne izmišljujemo).
    const weightRaw = /^\d{1,3}(\.\d+)?$/.test(r.weight) ? Number(r.weight) : 0;
    const weight = Number.isFinite(weightRaw) && weightRaw >= 0 && weightRaw <= 100 ? weightRaw : 0;

    // Razredi naraščajoče po ceni; najcenejši je kanonični deep link.
    const sorted = [...classes].sort((a, b) => a.eur - b.eur || a.pax - b.pax);
    const minPriceEur = sorted[0].eur;
    const cheapestTransferId = sorted[0].transferId;

    if (from.lat != null && from.lng != null && from.bbox) {
      pinnedRoutes++;
    }

    routes.push({
      id,
      fromId,
      fromName: from.name,
      toId,
      toName: to.name,
      ...(from.lat != null && from.lng != null && from.bbox
        ? { fromLat: from.lat, fromLng: from.lng, fromBbox: from.bbox }
        : {}),
      distanceKm,
      durationMin,
      weight,
      minPriceEur,
      cheapestTransferId,
      classes: sorted,
      urlPath,
      fromType: from.type,
      toType: to.type,
    });
  }

  const dataset: KiwiTaxiDataset = {
    version: 1,
    fetchedAt,
    source: "KiwiTaxi Partner Data API (CSV)",
    paymentType: "partial",
    counts: {
      places: places.length,
      routes: routes.length,
      transfers: transferCount,
      pinnedRoutes,
    },
    places,
    routes,
  };
  return { dataset, skipped };
}

/** Sanity vrata za overlay/prenos (STO vzorec: delni prenos NE gre skozi). */
export function passesKiwiSanityGate(
  candidate: KiwiTaxiDataset,
  baseline: KiwiTaxiDataset | null
): boolean {
  if (candidate.routes.length === 0 || candidate.places.length === 0) return false;
  if (baseline) {
    // Manj kot 50 % baseline-a ali manj kot absolutni minimum = sumljiv
    // delni prenos — zavrnemo (iskrena degradacija na baseline).
    if (candidate.routes.length < Math.max(300, Math.floor(baseline.counts.routes / 2))) {
      return false;
    }
    if (candidate.places.length < Math.max(50, Math.floor(baseline.counts.places / 2))) {
      return false;
    }
    if (
      candidate.counts.transfers <
      Math.max(1_000, Math.floor(baseline.counts.transfers / 2))
    ) {
      return false;
    }
  } else {
    if (candidate.routes.length < 300 || candidate.places.length < 50) return false;
    if (candidate.counts.transfers < 1_000) return false;
  }
  return true;
}
