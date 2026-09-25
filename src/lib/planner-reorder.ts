// ============================================================================
// PRESTAVLJANJE POSTANKA V DNEVU — čista deterministična operacija
// (Issue #5 / T5-D / M7 — drag/drop + puščice)
// ============================================================================
// NAMEN: planner je imel SAMO (a) optimalno zaporedje (optimizeDayOrder) in
// (b) NL "prestavi X na dan 2" (AI). ROČNEGA prestavljanja (drag/drop,
// puščice ↑/↓ — tipkovnica/dotik) ni bilo (vrzel M7, rg draggable = 0).
//
// SEMANTIKA (deterministično zapisana, ogledalo kanona route-order.ts):
//  · postanek se premakne z položaja FROM na položaj TO (array move);
//  · TERMINI so PERMUTACIJA položajev (isti kanon kot optimizeDayOrder):
//    vsi razpoznavni termini dneva se uredijo po začetku in razdelijo po
//    NOVIH položajih — zaporedje ostane kronološko koherentno; kadar
//    KATERIKOLI termin ni razpoznaven, vsak postanek obdrži SVOJEGA
//    (iskrena varovalka, ista kot v route-order.ts);
//  · intentLocked POTUJE s postankom — ročno prestavljanje je IZRECNA
//    uporabnikova namernost (§21: samo SAMODEJNI optimizatorji zamrznejo
//    zaklenjene postanke, uporabnikove roke ne);
//  · invalidacija (ista kot applyOptimalOrder): day.routeGeometry →
//    undefined (OSRM geometrija je vezana na staro zaporedje) +
//    itinerary.quality/geoValidation/legs → undefined (preračun na mestu
//    uporabe, hevristika, odkrito).
//
// Čista funkcija: enak vhod → enak izhod; 0 omrežja; 0 ure; bun-testabilna.
// ============================================================================

import type { Itinerary, DayPlan, LocationVisit } from "./types";

/** Začetni minute termina "HH:MM-HH:MM" (null, če nerazpoznaven). */
function slotStartMinutes(slot: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(slot.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Prestavi postanek z indeksa fromIdx na toIdx v določenem dnevu.
 * Če karkoli ne štima (dan ne obstaja / indeksi izven / from===to),
 * vrne VHODNEKO referenco (no-op — klicatelj lahko vedno zapiše izhod).
 */
export function reorderStopInItinerary(
  it: Itinerary,
  dayNumber: number,
  fromIdx: number,
  toIdx: number
): Itinerary {
  if (!it || !Array.isArray(it.days)) return it;
  const dayIdx = it.days.findIndex((d) => d.day === dayNumber);
  if (dayIdx < 0) return it;
  const day = it.days[dayIdx];
  const locations = Array.isArray(day.locations) ? day.locations : [];
  if (
    fromIdx === toIdx ||
    fromIdx < 0 ||
    toIdx < 0 ||
    fromIdx >= locations.length ||
    toIdx >= locations.length
  ) {
    return it;
  }

  // Array move (splice kanon — brez mutantiranja vhoda):
  const moved = locations.slice();
  const [stop] = moved.splice(fromIdx, 1);
  moved.splice(toIdx, 0, stop);

  // Termini = PERMUTACIJA položajev (kanon route-order.ts; tu brez zamrzo-
  // vanja — ROČNO prestavljanje je izrecna uporabnikova namernost):
  const slots = locations.map((l) => (l.time_slot ?? "").trim());
  const starts = slots.map((s) => slotStartMinutes(s));
  const allParsed = starts.every((s) => s !== null);
  let nextLocations: LocationVisit[];
  if (allParsed && slots.every((s) => s.length > 0)) {
    const sorted = slots
      .slice()
      .sort((a, b) => (slotStartMinutes(a) ?? 0) - (slotStartMinutes(b) ?? 0));
    nextLocations = moved.map((loc, i) => ({
      ...loc,
      time_slot: sorted[i] || loc.time_slot,
    }));
  } else {
    // Nerazpoznaven katerikoli termin → vsak obdrži svojega (varovalka).
    nextLocations = moved;
  }

  const nextDay: DayPlan = {
    ...day,
    locations: nextLocations,
    // OSRM geometrija je vezana na staro zaporedje — pošteno umaknjena
    // (zemljevid izriše premice; isto kot applyOptimalOrder).
    routeGeometry: undefined,
  };

  const nextDays = it.days.slice();
  nextDays[dayIdx] = nextDay;

  return {
    ...it,
    days: nextDays,
    // Strukturne metrike so bile izračunane za STARO zaporedje — umaknjene,
    // kartice jih preračunajo na mestu uporabe (hevristika, odkrito).
    quality: undefined,
    geoValidation: undefined,
    legs: undefined,
  };
}
