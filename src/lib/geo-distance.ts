// ============================================================================
// GEO-DISTANCE (T5-b1 / H2, Issue #5 fix val 1) — EN VIR RESNICE za
// geometrijske primitive deterministične plasti
// ============================================================================
//
// Revizija T5-a3 (docs/audit/t5-a3-…-sdk.md, F.3 tabela D1–D3) je odkrila,
// da je haversine formula podvojena v 11 datotekah, ROAD_FACTOR = 1,3 v 5 in
// AVG_SPEED_KMH = 55 v 3 — tveganje drifta (ena sprememba faktorja → 5
// datotek). Ta modul je KONSOLIDACIJA: ENA formula, ENE konstante.
//
// TA DATOTEKA je ČIST LIST (vzorec route-order.ts, a še strožja):
//   - NIČ uvozov (niti tipov) — ni odvisnosti, hidracijsko varna,
//     uporabna na serverju in clientu, v skriptah in testih;
//   - NO Date.now, NO fetch, NO prisma — čista funkcija časa in omrežja.
//
// EKVIVALENČNA POGODBA (hard requirement): vrednosti so BIT-ENAKE
// dosedanjim lokalnim implementacijam. Formula je kopirana DOSEDOŽNO
// (isti vrstni red operacij, isti R = 6371, isti cestni faktor 1,3 in
// hitrost 55 km/h) z 10 od 11 mest, ki so IZVAJALA IDENTIČNO:
//   geo-corridor.ts:9, stop-insights.ts:46, road-routing.ts:78,
//   itinerary-quality.ts:73, geo-validation.ts:143, trip-costs.ts:34,
//   crowd-alternatives.ts:82, schedule-slots.ts:58, supply/stop-insert.ts:26,
//   chat-add-place.ts:110.
//
// IZRECNO IZVZETOČE mesti (NAMERNO, NE smeta biti poenotena tiho):
//   · journey/orchestrator.ts:65 — haversine z varovalko
//     Math.min(1, sqrt(h)) (anti-NaN clamp za antipodalne robne primere);
//     vrednost je enaka za VSE realne vhode, a formalno ODSTOPA od te
//     formule → ostaja lokalna (poročano v T5-b1).
//   · schedule-slots.ts:31/33 — NAMERNO konzervativnejši konstanti
//     (1,5 / 50 km/h) za terminski repair (dokumentirano v T5-a3 F.3 D2);
//     njegov haversine JE identičen tej formuli (samo konstante so
//     lokalne).
// ============================================================================

/** Polmer Zemlje za haversine (km) — vrednost, ki so jo doslej uporabljala
 *  vsa (identična) mesta v src/lib. */
export const EARTH_RADIUS_KM = 6371;

/** Cestni faktor za hevristiko — dejanske ceste so ~1,3× daljše od ravne
 *  črte (Slovenija: doline/prelazi). Enaka vrednost kot prej v
 *  stop-insights / road-routing / itinerary-quality / geo-validation /
 *  trip-costs. */
export const ROAD_FACTOR = 1.3;

/** Povprečna hitrost za hevristiko (km/h) — vključuje gorske ceste, kraje
 *  in parkiranje. Enaka vrednost kot prej v road-routing /
 *  itinerary-quality / geo-validation. */
export const AVG_SPEED_KMH = 55;

/** Haversine razdalja med dvema točkama v km — IZVIRNA formula (R = 6371,
 *  2 · R · asin(√h)), isti vrstni red operacij kot vsa dosedanja mesta. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = EARTH_RADIUS_KM;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la = (a.lat * Math.PI) / 180;
  const lb = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la) * Math.cos(lb) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Hevristična CESTNA razdalja noge (km), NEzaokrožena:
 * haversine × ROAD_FACTOR — ista semantika (in vrstni red operacij) kot
 * road-routing.heuristicLeg PRED zaokroževanjem round5. Prikaz/kanon vedno
 * zaokroži klicatelja (round5) — brez lažne natančnosti "137 km".
 */
export function heuristicLegKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  return haversineKm(a, b) * ROAD_FACTOR;
}

/**
 * Hevristični VOZNI ČAS noge (minute), NEzaokrožen:
 * (km ÷ AVG_SPEED_KMH) × 60 — ista semantika (in vrstni red operacij) kot
 * road-routing.heuristicLeg PRED round5. Opomba: itinerary-quality sešteva
 * minute v DRUGAČNEM vrstnem redu ((hav × 1,3 × 60) ÷ 55) — tam izraz
 * OSTANE v modulu (bit-enakost nad konsolidacijo izrazov).
 */
export function heuristicLegMinutes(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  return (heuristicLegKm(a, b) / AVG_SPEED_KMH) * 60;
}
