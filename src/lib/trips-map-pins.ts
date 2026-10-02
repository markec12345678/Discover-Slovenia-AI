// ============================================================================
// TRIPS MAP PINS (#24 Sklop 3 — P3 »Zemljevid mojih potovanj«, 1.165.0)
// ============================================================================
// Polarsteps vzorec »profilni globus« (benchmark Round 2, edini NEW FEATURE
// CANDIDATE): uporabnik vidi VSA svoja shranjena potovanja na enem
// zemljevidu — čustvena vez s zgodovino potovanj, ne samo seznam kartic.
//
// Ta modul je ČISTI delivec: iz (nezaupanja vrednega) itinerer JSON-a
// pridobi seznam pinov postankov {lat, lng, name, day}. Živi SAMO na
// strežniku (API /api/trips/map-pins) — klient dobi samo pin podatke,
// nikoli celotnega itinererja (vhodni podatki načrtovalnika so zasebni,
// isti kanon kot GET /api/itinerary/shared/[shareId]).
//
// ISKRENOST (isti kanon kot store.ts buildRouteData + coordsOfStop):
//  - koordinata postanka = T1 dataset (destination_id) ALI lastni lat/lng
//    (OSM kraji iz AI klepeta, 1.42);
//  - null island (0,0) NI veljavna koordinata (TASK 50 §14 GEO);
//  - postanek brez znane koordinate OSTANE brez pina (iskreno — ne izmišljava
//    si lokacije), a tudi NE sesuje ostalih pinov;
//  - geometrija po realnih cestah (routeGeometry/OSRM) SE NE prenaša —
//    klient riše ravne črtkane črte in to iskreno pove (hint pod mapo).
// ============================================================================

import { coordsOfStop } from "./geo-validation";
import type { LocationVisit } from "./types";

/** Pin postanka na zemljevidu mojih potovanj (javen podatek deljene povezave). */
export interface TripMapPin {
  lat: number;
  lng: number;
  /** Prikazno ime postanka (destination_name, cap — nikoli HTML). */
  name: string;
  /** Dan potovanja (1-based; iz dayPlan.day, obrambno index+1). */
  day: number;
}

/** Pin skupine ene poti, kakor jo vrne POST /api/trips/map-pins. */
export interface TripMapPins {
  shareId: string;
  stops: TripMapPin[];
}

/**
 * Obrambna zgornja meja pinov na pot — planner podpira največ 14 dni
 * (× ~8 postankov), 120 je radodaržna meja pred nesramnimi shranjenimi
 * JSON-i (pin list se pošteno odreže, nikoli pa sesuje odgovora).
 */
export const TRIP_MAP_MAX_STOPS = 120;

/** Cap prikaznega imena postanka (pin payload ostane lahek). */
const PIN_NAME_MAX = 80;

/**
 * Izlušči pin iz ENEGA postanka (nezaupan JSON) — null, kadar koordinate
 * ni mogoče iskreno poznati ( isti kanon koordinat kot coordsOfStop).
 */
function pinOfStop(loc: unknown): { lat: number; lng: number; name: string } | null {
  if (typeof loc !== "object" || loc === null) return null;
  const l = loc as Record<string, unknown>;

  const destinationId = typeof l.destination_id === "string" ? l.destination_id : "";
  const lat = typeof l.lat === "number" ? l.lat : undefined;
  const lng = typeof l.lng === "number" ? l.lng : undefined;

  // coordsOfStop je IZVOŽENI kanon resolucije (T1 dataset → lastne koordinate
  // → null). Bere SAMO {destination_id, lat, lng} — ostale ključe LocationVisit
  // nikoli ne dotakne, zato je ozek cast tukaj varen in enovirčen.
  const resolved = coordsOfStop({
    destination_id: destinationId,
    lat,
    lng,
  } as LocationVisit);
  if (!resolved) return null;

  const rawName =
    typeof l.destination_name === "string" ? l.destination_name.trim() : "";
  const name = (rawName || destinationId || "?").slice(0, PIN_NAME_MAX);
  return { lat: resolved.lat, lng: resolved.lng, name };
}

/**
 * Izlušči vse pine poti iz itinererja (nezaupani JSON iz DB stolpca
 * SavedItinerary.itinerary). Oblika: days[].locations[] — vsaka neznana
 * oblika pošteno vrne [], posamezen neveljaven postanek se preskoči.
 */
export function pinsFromItinerary(itinerary: unknown): TripMapPin[] {
  if (typeof itinerary !== "object" || itinerary === null) return [];
  const days = (itinerary as Record<string, unknown>).days;
  if (!Array.isArray(days)) return [];

  const pins: TripMapPin[] = [];
  for (let d = 0; d < days.length && pins.length < TRIP_MAP_MAX_STOPS; d++) {
    const dayPlan = days[d];
    if (typeof dayPlan !== "object" || dayPlan === null) continue;
    const dp = dayPlan as Record<string, unknown>;

    // Dan: izrecen dayPlan.day (1-based), obrambno vrstni red + 1 —
    // napačnih/neznanih vrednosti NE zaupamo (pin ostane pošteno umestilen).
    let day = d + 1;
    if (typeof dp.day === "number" && Number.isInteger(dp.day) && dp.day >= 1 && dp.day <= 99) {
      day = dp.day;
    }

    const locations = dp.locations;
    if (!Array.isArray(locations)) continue;

    for (const loc of locations) {
      if (pins.length >= TRIP_MAP_MAX_STOPS) break;
      const pin = pinOfStop(loc);
      if (pin) pins.push({ ...pin, day });
    }
  }
  return pins;
}

/**
 * Varno razširi JSON itinererja (DB stolpec) in izlušči pine — napaka
  parsiranja pomeni prazen seznam (shranjena pot brez pinov je bolj iskrena
  kot sesut celotnega zemljevida).
 */
export function pinsFromItineraryJson(itineraryJson: string): TripMapPin[] {
  try {
    return pinsFromItinerary(JSON.parse(itineraryJson) as unknown);
  } catch {
    return [];
  }
}
