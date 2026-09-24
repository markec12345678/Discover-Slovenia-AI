import {
  DESTINATION_COORDS,
  heuristicLeg,
  round5,
} from "@/lib/road-routing";
import type { LocationVisit } from "@/lib/types";

// ============================================================================
// F16 (backlog #4, sekcija 22) — OPTIMALNO ZAPOREDJE DNEVA
// ============================================================================
//
// "En gumb na dnevu: 2-opt preureditev postankov (deterministično, prikaz
// prihranka km pred/po)." Vir: MEM študija — cik-cak je 8–10 dni na 100
// NEODVISNO od dolžine potovanja; "3 točke v napačnem redu" so najmanjša
// napaka, ki obstaja (median +3,4 km). Forumi (Reddit): "Mindtrip ni
// nikoli podvomil o vrstnem redu."
//
// Ta datoteka je SKUPNI VIR za optimizator zaporedja:
//   - plan-check.ts (F13) ga uporablja za predloge preureditve v
//     poročilih tujih načrtov (checkZigzag),
//   - itinerary-planner (F16) ga uporablja za gumb "Optimalno zaporedje"
//     na kartici dneva lastnega načrta.
//
// Algoritem: odprta pot (brez povratka) — ≤ 7 točk IZČRPNO (7! = 5040
// permutacij, milisekunde), sicer 2-opt do konvergence (max 60 potez).
// Razdalje: hevristika (haversine × 1,3 ÷ 55 km/h) — ISTA kot
// geo-validacija brez OSRM nog; km so zato vedno "ocena" in tako tudi
// prikazane ("~"). 0 AI žetonov, 0 omrežnih klicev, čista funkcija
// (isto na serverju in clientu).
// ============================================================================

/** Skupna dolžina odprte poti (brez povratka) v enotah dist. */
export function pathKm<T>(items: T[], dist: (a: T, b: T) => number): number {
  let km = 0;
  for (let i = 1; i < items.length; i++) km += dist(items[i - 1], items[i]);
  return km;
}

/**
 * Optimalno zaporedje odprte poti: ≤7 točk izčrpno (permutacije — Heapov
 * algoritem), sicer 2-opt na odprti poti (do konvergence, max 60 potez).
 * Vrne Novejše zaporedje + njegovo skupno dolžino (iste enote kot dist).
 */
export function bestOrder<T>(
  items: T[],
  dist: (a: T, b: T) => number
): { order: T[]; km: number } {
  const n = items.length;
  if (n <= 7) {
    // Heapov algoritem po permutacijah — 7! = 5040, milisekunde
    let best = items.slice();
    let bestKm = pathKm(items, dist);
    const arr = items.slice();
    const c = new Array<number>(n).fill(0);
    let i = 1;
    while (i < n) {
      if (c[i] < i) {
        const k = i % 2 === 0 ? 0 : c[i];
        [arr[i], arr[k]] = [arr[k], arr[i]];
        const km = pathKm(arr, dist);
        if (km < bestKm) {
          bestKm = km;
          best = arr.slice();
        }
        c[i] += 1;
        i = 1;
      } else {
        c[i] = 0;
        i += 1;
      }
    }
    return { order: best, km: bestKm };
  }
  // 2-opt na odprti poti (do konvergence, max 60 potez)
  const order = items.slice();
  let improved = true;
  let guard = 0;
  while (improved && guard < 60) {
    improved = false;
    guard += 1;
    for (let a = 0; a < n - 1 && !improved; a++) {
      for (let b = a + 1; b < n && !improved; b++) {
        const before = pathKm(order, dist);
        const candidate = order
          .slice(0, a)
          .concat(order.slice(a, b + 1).reverse(), order.slice(b + 1));
        const after = pathKm(candidate, dist);
        if (after < before - 0.01) {
          order.splice(0, n, ...candidate);
          improved = true;
        }
      }
    }
  }
  return { order, km: pathKm(order, dist) };
}

// ---------------------------------------------------------------------------
// F16: preureditev postankov ENEGA dneva lastnega načrta
// ---------------------------------------------------------------------------

/** Rezultat optimalne preureditve dneva (km so hevristične ocene). */
export interface DayOrderResult {
  /** Postanki v NOVEM zaporedju (termini ostanejo na izvirnih urah — glej spodaj). */
  locations: LocationVisit[];
  /** Skupni km dneva PRED preureditvijo (ocena, zaokroženo na 5). */
  beforeKm: number;
  /** Skupni km dneva PO preureditvi (ocena, zaokroženo na 5). */
  afterKm: number;
  /** Prihranek (before − after; ocena, zaokroženo na 5). */
  savedKm: number;
}

/** Prvih številk termina ("9:00-13:00" | "09:00–13:00" …) → minute od polnoči. */
const SLOT_START_RE = /^(\d{1,2})[:.](\d{2})/;

function slotStartMinutes(slot: string): number | null {
  const m = SLOT_START_RE.exec((slot ?? "").trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) {
    return null;
  }
  return h * 60 + min;
}

// ---------------------------------------------------------------------------
// ISSUE #4 §21 (VAL 6) — SEGMENTNA OPTIMIZACIJA Z ZAMRZNJENIMI POSTANKI
// ---------------------------------------------------------------------------
//
// KRITIČNA zahteva §21: "posebej preveri, da optimizacija NE UNIČI
// uporabnikovega NAMERNEGA vrstnega reda." Do 1.97.0 je gumb "Optimalno
// zaporedje" preuredil VSE postanke dneva — tudi tiste, ki jih je uporabnik
// IZRECNO izbral (FIXED izbire zemljevida ponudbe, §8 F2) oz. sam dodal
// (supply/klepet postanki). Pogodba "vrstni red FIXED se NE spremeni" je
// veljala pri GENERIRANJU (geo-order sidra) — klientna optimizacija pa jo
// je tiho prelomila.
//
// v2 (ISTA čista, deterministična mehanika, 0 omrežja):
//   · postanki z intentLocked === true so ZAMRZNJENI: pozicija V zaporedju
//     in LASTNI termin ostanejo točno takšni, kot so;
//   · PROSTI postanki se optimizirajo po SEGMENTIH med zamrznjenimi
//     sosedami: strošek segmenta = dist(prejšnji zamrznjeni, prvi) +
//     pathKm(segment) + dist(zadnji, naslednji zamrznjeni) (dan-brez-soseda
//     = brez povezovalnika). Segmenti so NEODVISNI (vsaka noge poti pripada
//     natanko enemu segmentu) → vsota lokalnih optimumov JE optimalna celota
//     med zamrznjenimi oglišči;
//   · zmnožek terminov: zamrznjeni obdržijo SVOJ termin, prosti POLOŽAJI
//     (ne postanki) dobijo urejene termine izvirnih terminov prostih
//     položajev — med prostimi položaji NI novih časovnih inverzij,
//     obstoječe inverzije z zamrznjenimi postanki pa ostanejo pošteno
//     vidne (geo-validacija jih javi — ne prikrivamo).
//
// Koordinatorji: dataset (DESTINATION_COORDS) najprej, nato KONČNI lat/lng
// na SAMEM postanku (OSM/klepet/tuji kraji — destination_id "osm:node-…").
// Postanek brez razrešljivih koordinat → null (iskrena odklonitev, kot prej).
// ---------------------------------------------------------------------------

/**
 * Optimalno zaporedje ENEGA SEGMENTA prostih postankov (odprta pot z
 * povezovalnikoma do zamrznjenih sosedov). ≤7 točk IZČRPNO (Heap — isti
 * algoritem kot bestOrder), sicer 2-opt do konvergence (max 60 potez).
 * Strošek je poljuben (klicalnik vloži povezovalnike); izenačitve ohranijo
 * IZVIRNI vrstni red (strogo <) — deterministično.
 */
function bestSegmentOrder<T>(items: T[], cost: (order: T[]) => number): T[] {
  const n = items.length;
  if (n < 2) return items.slice();
  if (n <= 7) {
    // Heapov algoritem po permutacijah — 7! = 5040, milisekunde
    let best = items.slice();
    let bestCost = cost(items);
    const arr = items.slice();
    const c = new Array<number>(n).fill(0);
    let i = 1;
    while (i < n) {
      if (c[i] < i) {
        const k = i % 2 === 0 ? 0 : c[i];
        [arr[i], arr[k]] = [arr[k], arr[i]];
        const cst = cost(arr);
        if (cst < bestCost) {
          bestCost = cst;
          best = arr.slice();
        }
        c[i] += 1;
        i = 1;
      } else {
        c[i] = 0;
        i += 1;
      }
    }
    return best;
  }
  // 2-opt (ista konvergenčna varovalka kot bestOrder — max 60 potez)
  const order = items.slice();
  let improved = true;
  let guard = 0;
  while (improved && guard < 60) {
    improved = false;
    guard += 1;
    for (let a = 0; a < n - 1 && !improved; a++) {
      for (let b = a + 1; b < n && !improved; b++) {
        const before = cost(order);
        const candidate = order
          .slice(0, a)
          .concat(order.slice(a, b + 1).reverse(), order.slice(b + 1));
        const after = cost(candidate);
        if (after < before - 0.01) {
          order.splice(0, n, ...candidate);
          improved = true;
        }
      }
    }
  }
  return order;
}

/**
 * Izračuna optimalno zaporedje postankov dneva (deterministično, 0 AI).
 *
 * Vrne null, kadar pošteno ne moremo:
 *  - manj kot 3 postanki (preureditev nima smisla),
 *  - KATERIKOLI postanek nima razrešljivih koordinat (dataset ali lastni
 *    končni lat/lng) — ne ugibamo razdalj,
 *  - manj kot 2 PROSTA postanka (ničesar ni za optimizirati — vsi
 *    zamrznjeni ali zamrznjeni + 1 prost; §21: odklonitev, ne delni poskus).
 *
 * Termini: PERMUTACIJA izvirnih nizov — urejeni termini ostanejo na ISTIH
 * urah, postanki se preuredijo MED NJIH. Zamrznjeni (intentLocked) obdržijo
 * SVOJ izvirni termin; prosti položaji dobijo urejene termine prostih
 * položajev (glej §21 zgoraj). Če kateri termin ni razpoznaven, vsak
 * postanek obdrži SVOJ izvirni termin (iskreno — isto kot prej).
 */
export function optimizeDayOrder(
  locations: LocationVisit[]
): DayOrderResult | null {
  const stops = Array.isArray(locations) ? locations : [];
  if (stops.length < 3) return null;

  // Koordinatorji: dataset najprej, nato končni lat/lng na postanku (OSM/
  // klepet/tuji). Nerazrešljivo (tudi NaN/±Infinity) → null (iskrena odklonitev).
  const coords = stops.map((l) => {
    const c = DESTINATION_COORDS.get(l.destination_id);
    if (c) return c;
    if (
      typeof l.lat === "number" &&
      typeof l.lng === "number" &&
      Number.isFinite(l.lat) &&
      Number.isFinite(l.lng)
    ) {
      return { lat: l.lat, lng: l.lng };
    }
    return null;
  });
  if (coords.some((c) => !c)) return null;

  const dist = (a: number, b: number): number => {
    // indeksna razdalja prek hevristike (ista formula kot geo-validacija)
    const ca = coords[a];
    const cb = coords[b];
    if (!ca || !cb) return 0;
    return heuristicLeg(ca, cb).km;
  };

  // §21: zamrznjeni postanki (izrecno true — stari načrti brez oznake so
  // VSI prosti, nazaj kompatibilno)
  const locked = stops.map((l) => l.intentLocked === true);
  const freeIdx = stops.map((_, i) => i).filter((i) => !locked[i]);
  if (freeIdx.length < 2) return null;

  // Segmenti PROSTIH položajev med zamrznjenimi (dan-brez-soseda = brez
  // povezovalnika). Zamrznjeni položaji ostanejo na mestu; vsak segment
  // optimiziramo NEODVISNO (noge poti se ne prekrivajo → vsota lokalnih
  // optimumov je optimalna celota med oglišči).
  const newOrder: number[] = stops.map((_, i) => i);
  let segStart = 0;
  for (let pos = 0; pos <= stops.length; pos++) {
    const isBoundary = pos === stops.length || locked[pos];
    if (!isBoundary) continue;
    if (pos > segStart) {
      const segOrig = newOrder.slice(segStart, pos);
      if (segOrig.length >= 2) {
        const prevIdx = segStart > 0 ? newOrder[segStart - 1] : null;
        const nextIdx = pos < stops.length ? newOrder[pos] : null;
        const cost = (seg: number[]): number => {
          let km = pathKm(seg, dist);
          if (prevIdx !== null) km += dist(prevIdx, seg[0]);
          if (nextIdx !== null) km += dist(seg[seg.length - 1], nextIdx);
          return km;
        };
        const optimized = bestSegmentOrder(segOrig, cost);
        for (let k = 0; k < optimized.length; k++) {
          newOrder[segStart + k] = optimized[k];
        }
      }
    }
    segStart = pos + 1;
  }

  const before = pathKm(
    stops.map((_, i) => i),
    dist
  );
  const after = pathKm(newOrder, dist);

  // Termini kot PERMUTACIJA: zamrznjeni obdržijo SVOJEGA; prosti položaji
  // dobijo urejene termine izvirnih terminov PROSTIH položajev (isti nizi —
  // urejenost začetkov zagotavlja, da med prostimi položaji ne nastanejo
  // prekrivanja, ki jih prej ni bilo). Nerazpoznaven katerikoli → vsak
  // obdrži svojega (iskrena varovalka, kot prej).
  const slots = stops.map((l) => (l.time_slot ?? "").trim());
  const starts = slots.map((s) => slotStartMinutes(s));
  const allParsed = starts.every((s) => s !== null);
  const freeSlotSorted = allParsed
    ? stops
        .map((_, i) => i)
        .filter((i) => !locked[i])
        .map((i) => slots[i])
        .sort(
          (a, b) =>
            (slotStartMinutes(a) ?? 0) - (slotStartMinutes(b) ?? 0)
        )
    : null;

  let freePtr = 0;
  const newLocations: LocationVisit[] = newOrder.map((origIdx) => {
    const stop = stops[origIdx];
    if (locked[origIdx]) return stop; // ZAMRZNJEN: lastni termin, ista referenca
    if (freeSlotSorted === null) return stop; // nerazpoznan termin → svoj ostane
    const slot = freeSlotSorted[freePtr++];
    return {
      ...stop,
      time_slot: slot || stop.time_slot,
    };
  });

  return {
    locations: newLocations,
    beforeKm: round5(before),
    afterKm: round5(after),
    savedKm: round5(before - after),
  };
}
