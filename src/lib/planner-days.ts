// ============================================================================
// DODAJANJE / ODSTRANJEVANJE DNEVA — čisti deterministični operaciji
// (Issue #5 / T5-D / M7)
// ============================================================================
// NAMEN: število dni je bilo možno spremeniti SAMO prek regeneracije
// obrazca (vrzel M7: rg addDay|removeDay = 0). Ti operaciji omogočata
// strukturno urejanje SHRANJENEGA/v živo urejanega načrta (0 AI).
//
// SEMANTIKA (deterministično zapisana):
//  · addDay: doda PRAZEN dan na konec ({day: N+1, locations: [], vreme =
//    neznano, weatherEstimated}); tripEndDate se preračuna (dan 1 =
//    tripStartDate, koledarska aritmetika — trip-dates kanon);
//  · removeDay: odstrani dan s številko, preostale RENUMERIRA na 1..N
//    (id-ji `day-card-N`, PlannerDayNav, crowdNotices.day in dayISO… se
//    vezujejo na zaporedno številko — zato MORA biti zaporedje GOSTO);
//    crowdNotices za odstranjeni dan odpadejo, ostali se premaknejo;
//  · varovalki: MIN 1 dan (removeDay no-op), MAX 14 dni (addDay no-op —
//    isti limit kot obrazec + /api/itinerary validacija);
//  · invalidacija (kanon applyOptimalOrder): quality/geoValidation/legs →
//    undefined; crowdNotices se remapne (so vezani na strukturo dni).
//
// Čisti funkciji: enak vhod → enak izhod; 0 omrežja; bun-testabilni.
// ============================================================================

import { tripEndDateISO } from "./trip-dates";
import type { Itinerary, DayPlan } from "./types";

/** Isti limit kot obrazec (planner-field-validation) + API validacija. */
export const MAX_PLANNER_DAYS = 14;
export const MIN_PLANNER_DAYS = 1;

/** Vreme neznanega (praznega) dneva — UI ga varno prikrije (oblika veljavna). */
function unknownWeather(): DayPlan["weather"] {
  return { condition: "", temp: 0 };
}

/** Invalidacijski blok strukturnih metrik (kanon applyOptimalOrder). */
function invalidateStructural(it: Itinerary): Itinerary {
  return {
    ...it,
    quality: undefined,
    geoValidation: undefined,
    legs: undefined,
  };
}

/** Preračun tripEndDate iz tripStartDate + novim številom dni (canon). */
function withRecomputedEndDate(it: Itinerary, dayCount: number): Itinerary {
  if (!it.tripStartDate) return it;
  const end = tripEndDateISO(it.tripStartDate, dayCount);
  if (!end) return it;
  return { ...it, tripEndDate: end };
}

/**
 * Doda prazen dan na konec načrta. Varovalka: največ 14 dni (nad tem no-op,
// vhodna referenca nazaj — klicatelj lahko vedno zapiše izhod).
 */
export function addDay(it: Itinerary): Itinerary {
  if (!it || !Array.isArray(it.days)) return it;
  if (it.days.length >= MAX_PLANNER_DAYS) return it;

  const nextNumber =
    it.days.length === 0
      ? 1
      : Math.max(...it.days.map((d) => (typeof d?.day === "number" ? d.day : 0))) + 1;

  const newDay: DayPlan = {
    day: nextNumber,
    locations: [],
    weather: unknownWeather(),
    weatherEstimated: true,
  };

  const next = invalidateStructural({
    ...it,
    days: [...it.days, newDay],
  });
  return withRecomputedEndDate(next, next.days.length);
}

/**
 * Odstrani dan s podano številko in prenumerira preostale na 1..N.
 * Varovalki: najmanj 1 dan + dan mora obstajati (sicer no-op).
 * crowdNotices: tisti z odstranjenim dnem odpadejo, ostali se zamaknejo.
 */
export function removeDay(it: Itinerary, dayNumber: number): Itinerary {
  if (!it || !Array.isArray(it.days)) return it;
  if (it.days.length <= MIN_PLANNER_DAYS) return it;
  const dayIdx = it.days.findIndex((d) => d.day === dayNumber);
  if (dayIdx < 0) return it;

  const kept = it.days
    .filter((d) => d.day !== dayNumber)
    // RENUMERIRAJ na gostih 1..N (id-ji UI, dayISO, nav — vsi vezani na št.):
    .map((d, i) => (d.day === i + 1 ? d : { ...d, day: i + 1 }));

  // crowdNotices so vezani na številko dneva — zamakni/počisti:
  const notices = Array.isArray(it.crowdNotices) ? it.crowdNotices : null;
  const nextNotices = notices
    ? notices
        .filter((n) => n.day !== dayNumber)
        .map((n) => (n.day > dayNumber ? { ...n, day: n.day - 1 } : n))
    : it.crowdNotices;

  const next = invalidateStructural({
    ...it,
    days: kept,
    crowdNotices: nextNotices,
  });
  return withRecomputedEndDate(next, next.days.length);
}
