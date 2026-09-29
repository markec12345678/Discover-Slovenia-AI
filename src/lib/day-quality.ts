// ============================================================================
// W11-B „DOKAZLJIVO UREJEN DAN" — odličnost engine-a VIDNA v UI.
//
// Kontekst (konkurenčni benchmark 29. 9. 2026, monkeytravel.app):
// MonkeyTravel o konkurentih: „neither reliably hands you a day you can
// actually walk". Naš engine TO že jamči — TASK 50 (urnik repair nad
// realnimi OSRM nogami) in TASK 51 (geo urejanje + M3 backtracking = 0)
// — a odličnost ni VIDNA uporabniku. Ta modul jo pokaže, brez da bi
// karkoli trdili, česar ne moremo deterministično dokazati.
//
// DVE ČISTI FUNKCIJI (0 omrežja, 0 AI, 0 stanja):
//   1) dayZigzagQuality — ALI je zaporedje postankov dneva brez vračanj
//      čez že obiskano območje. ISTI kanon kot engine: findBacktrackingEvents
//      (M3, pragova R_VISIT=30 km / D_LEFT=45 km — dokumentirana v
//      geo-coherence.ts). ISTA resolucija koordinat: coordsOfStop
//      (T1 dataset → lastne → null island preskočen).
//   2) mealStopWindow — ALI je postanek z obrokom V KANONSKEM razponu
//      (kosilo 12–14, večerja 18–21). Kanonske razpone diktira industrija
//      hotelierstva/gastronomije; naš urnik (TASK 50) obroke drži znotraj
//      njih, ker termini rastejo iz voženj — to je sad, ne slučaj.
//
// ISKRENOSTNA DISCIPLINA (§8 — enaka kot W11-A):
//   · <2 postanka z znanimi koordinatami → NI značke (ni dokaza, ni trditve);
//   · backtracking > 0 → značka IZOSTANE (ne lažemo z zelenim);
//   · postanek brez parsabilnega termina → brez obročnega žetona;
//   · ni telemetrije za pasivne žetone — meritve so dejanja uporabnika
//     (kliki/izvozi), ne impresije (dokumentirano v CHANGELOG 1.142.0).
// ============================================================================

import { findBacktrackingEvents, type CoherenceStop } from "./geo-coherence";
import { coordsOfStop } from "./geo-validation";
import type { DayPlan, LocationVisit } from "./types";

// ---------------------------------------------------------------------------
// 1) ZIGZAG KAKOVOST DNEVA (M3 — isti kanon kot engine)
// ---------------------------------------------------------------------------

export interface DayZigzagQuality {
  /** True SAMO, če smo dejansko preverili (≥2 znani koordinati) in je 0
   *  backtracking dogodkov. Trivialni dnevi (0–1 postanek) niso „dokazani"
   *  — nima smisla trditi koherenco za prazno pot. */
  zigzagFree: boolean;
  /** Ali preverba SPLOH možna (≥2 postanka z znanimi koordinatami). */
  verifiable: boolean;
  /** Št. postankov dneva. */
  stops: number;
  /** Št. postankov z znanimi koordinatami. */
  knownCoords: number;
  /** Št. M3 backtracking dogodkov (0 = zigzagFree … kadar verifiable). */
  backtrackingEvents: number;
}

/** Ali je dan geografsko koherenten — deterministično, isto kot engine. */
export function dayZigzagQuality(
  day: Pick<DayPlan, "locations">
): DayZigzagQuality {
  const locations = day.locations ?? [];
  const stops: CoherenceStop[] = [];
  let knownCoords = 0;

  for (const visit of locations) {
    const c = coordsOfStop(visit);
    if (c) {
      knownCoords += 1;
      stops.push({
        id: visit.destination_id,
        name: visit.destination_name,
        lat: c.lat,
        lng: c.lng,
      });
    }
  }

  // Če kateri postanek NIMA koordinat, ga M3 ne vidi — preverba bi bila
  // LAŽNO ZELENA (manjkajoči postanek bi lahko bil ravno vračanje).
  // Iskreno: verifiable = vsi postanki imajo koordinate IN ≥2 jih je.
  const allKnown = knownCoords === locations.length;
  const verifiable = allKnown && stops.length >= 2;

  if (!verifiable) {
    return {
      zigzagFree: false,
      verifiable: false,
      stops: locations.length,
      knownCoords,
      backtrackingEvents: 0,
    };
  }

  const events = findBacktrackingEvents(stops);
  return {
    zigzagFree: events.length === 0,
    verifiable: true,
    stops: locations.length,
    knownCoords,
    backtrackingEvents: events.length,
  };
}

// ---------------------------------------------------------------------------
// 2) OBROK V KANONSKEM RAZPONU (kosilo 12–14, večerja 18–21)
// ---------------------------------------------------------------------------

/** Kanonski razpon kosila [12:00, 14:00) — gostinska norma. */
export const LUNCH_WINDOW = { fromH: 12, toH: 14 } as const;
/** Kanonski razpon večerje [18:00, 21:00) — gostinska norma. */
export const DINNER_WINDOW = { fromH: 18, toH: 21 } as const;

export type MealKind = "lunch" | "dinner";

/**
 * Ali JE postanek z obrokom (ključne besede — isti kanon kot inferCategory
 * v trip-timeline + food matcher iz geo-intent, razširjen na IT/DE) IN se
 * njegov začetni termin znotraj kanonskega razpona. Vrne "lunch"/"dinner",
 * sicer null (ni obroka / ni parsabilnega termina / izven razpona —
 * VSENO ne trdimo ničesar).
 */
export function mealStopWindow(
  visit: Pick<LocationVisit, "destination_name" | "notes" | "time_slot">
): MealKind | null {
  if (!isMealStop(visit)) return null;
  const hour = startHourOfSlot(visit.time_slot);
  if (hour === null) return null;
  if (hour >= LUNCH_WINDOW.fromH && hour < LUNCH_WINDOW.toH) return "lunch";
  if (hour >= DINNER_WINDOW.fromH && hour < DINNER_WINDOW.toH) return "dinner";
  return null;
}

/** Klepet/predicate „je to postanek z obrokom?" — SL+EN+IT+DE kanon. */
function isMealStop(visit: {
  destination_name: string;
  notes?: string | null;
}): boolean {
  const text = `${visit.destination_name} ${visit.notes ?? ""}`.toLowerCase();
  return MEAL_STEMS.some((stem) => text.includes(stem));
}

/** Stemi obročnih ponudnikov/namenov (mala črka, substring match).
 *  SL: restavrac/gostiln/kosilo/večerja/hrana/gostisc/picerija
 *  EN: restaurant/lunch/dinner/food/dining/eatery/tavern
 *  IT: ristorant/trattoria/osteria/pranzo/cena
 *  DE: gasthaus/gasthof/wirtshaus/mittagessen/abendessen/küche */
const MEAL_STEMS: readonly string[] = [
  // SL
  "restavrac", "gostiln", "gostisc", "picerij", "kosilo", "večerja", "vecerja", "hrana",
  // EN
  "restaurant", "lunch", "dinner", "food", "dining", "eatery", "tavern",
  // IT
  "ristorant", "trattoria", "osteria", "pranzo", "cena",
  // DE
  "gasthaus", "gasthof", "wirtshaus", "mittagessen", "abendessen", "küche", "kuche",
];

/** Začetna ura termina „HH:MM-…" (isti regex kot segmentOfSlot) ali null. */
function startHourOfSlot(slot: string | null | undefined): number | null {
  if (!slot) return null;
  const m = slot.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  return Number.isFinite(h) && h >= 0 && h <= 24 ? h : null;
}
