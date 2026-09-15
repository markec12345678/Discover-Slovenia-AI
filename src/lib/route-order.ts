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

/**
 * Izračuna optimalno zaporedje postankov dneva (deterministično, 0 AI).
 *
 * Vrne null, kadar pošteno ne moremo:
 *  - manj kot 3 postanki (preureditev nima smisla),
 *  - KATERIKOLI postanek nima znanega ID-ja/koordinat (naših 22) — ne
 *    ugibamo razdalj za tuje ID-je.
 *
 * Termini: PERMUTACIJA izvirnih nizov — urejeni termini dneva ostanejo na
 * ISTIH urah (jutro/kosilo/večer + vmiki za vožnjo med njimi), postanki se
 * preuredijo MEDNJH. Struktura časa ostane točno taka, kot jo je sestavil
 * načrt: BREZ novih prekrivanj in brez novih vrzeli. (Test F16 je pokazal,
 * da izračun konca iz trajanj postanka naredi prekrivanja — trajanja so
 * ocene AI in se z zaporedjem ne smejo mešati.) Če kateri termin ni
 * razpoznaven, vsak postanek obdrži SVOJ izvirni termin (iskreno).
 */
export function optimizeDayOrder(
  locations: LocationVisit[]
): DayOrderResult | null {
  const stops = Array.isArray(locations) ? locations : [];
  if (stops.length < 3) return null;

  // Vsi postanki morajo imeti znane koordinate (naših 22) — sicer null
  const coords = stops.map((l) => DESTINATION_COORDS.get(l.destination_id));
  if (coords.some((c) => !c)) return null;

  const dist = (a: number, b: number): number => {
    // indeksna razdalja prek hevristike (ista formula kot geo-validacija)
    const ca = coords[a];
    const cb = coords[b];
    if (!ca || !cb) return 0;
    return heuristicLeg(ca, cb).km;
  };

  const indices = stops.map((_, i) => i);
  const before = pathKm(indices, dist);
  const { order, km: after } = bestOrder(indices, dist);

  // Termini kot PERMUTACIJA: urejeni izvirni termini po novih pozicijah
  // (isti nizi — urejenost začetkov zagotavlja, da ne nastanejo prekrivanja,
  // ki jih prej ni bilo). Nerazpoznaven katerikoli → vsak obdrži svojega.
  const slots = stops.map((l) => (l.time_slot ?? "").trim());
  const starts = slots.map((s) => slotStartMinutes(s));
  const allParsed = starts.every((s) => s !== null);
  const sortedSlots = allParsed
    ? slots
        .slice()
        .sort((a, b) => (slotStartMinutes(a) ?? 0) - (slotStartMinutes(b) ?? 0))
    : null;

  const newLocations: LocationVisit[] = order.map((origIdx, newPos) => {
    const stop = stops[origIdx];
    if (sortedSlots === null) return stop; // nerazpoznan termin → svoj ostane
    return {
      ...stop,
      time_slot: sortedSlots[newPos] || stop.time_slot,
    };
  });

  return {
    locations: newLocations,
    beforeKm: round5(before),
    afterKm: round5(after),
    savedKm: round5(before - after),
  };
}
