import { DESTINATIONS } from "@/lib/slovenia-data";
import { legKey, type LegRouteIndex } from "@/lib/road-routing";
import type { DriveCosts, Itinerary } from "@/lib/types";

// ============================================================================
// TRIP DRIVE COSTS (F5.3) — ocena stroškov vožnje: gorivo + e-vinjeta
// ============================================================================
//
// Namen (primerjalna analiza vs MindTrip): MindTrip za pot prikaže
// stroškovno razčlenitev vožnje (cestnine, gorivo) — mi smo do Faze 5
// prikazovali samo vnose atrakcij. Ta čista funkcija doda OCENO vožnje
// za slovenske razmere, pošteno in razkrito:
//
//   gorivo  = km × poraba(l/100 km) × cena(€/l)
//   vinjeta = veljavnost, izbrana po dolžini potovanja (vozila do 3,5 t)
//
// Načelo znamke: vsaka številka pove svoje predpostavke. Cene so "glede
// na objavljene cenike (AMZS/DARS, regulirana cena goriva) ob času
// implementacije" in so vidne v UI; vinjeta je POGOJNA (potrebna le ob
// vožnji po avtocestah — obcestne alternative so v Sloveniji običajno
// le nekaj minut počasnejše).
//
// Deterministična čista funkcija — teče na strežniku (ob generiranju,
// vključena v ItineraryQuality.driveCosts) in po potrebi na clientu
// (stari načrti brez quality polja). Brez stranskih učinkov.
// ============================================================================

/** Cestni faktor — isti kot v geo-validation/itinerary-quality (en vir
 *  formule: ravne črte so krajše od dejanskih cest). */
const ROAD_FACTOR = 1.3;

/** Haversine razdalja v km (ista formula kot drugje — lokalna kopija,
 *  ker je lib čisto brez odvisnosti). */
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// --- Predpostavke (razkrite v UI) — viri ob implementaciji ---------------

/** Regulirana maloprodajna cena NMB-95 v Sloveniji (€/l) — pas ~1,55–1,70
 *  (gov.si / AMZS). Ocenjujemo s 1,60; dejanska črpalka se razlikuje. */
export const FUEL_PRICE_EUR_PER_L = 1.6;

/** Tipična poraba osebnega vozila (l/100 km) — povprečen kombilimuzina. */
export const FUEL_CONSUMPTION_L_PER_100 = 6.5;

/** Cene e-vinjete za vozila do 3,5 t (DARS/AMZS cenik). */
export const VIGNETTE_PRICES: Record<
  DriveCosts["vignetteDays"],
  number
> = {
  1: 8.1, // 1-dnevna (uvrščena z reformo dec 2024)
  10: 12.8, // 10-dnevna
  62: 32.0, // dvomesečna
  365: 106.8, // letna
};

/** Izbor veljavnosti vinjete glede na število dni potovanja. */
export function pickVignetteDays(days: number): DriveCosts["vignetteDays"] {
  if (days <= 1) return 1;
  if (days <= 10) return 10;
  if (days <= 62) return 62;
  return 365;
}

// --- Čisti izračun ---------------------------------------------------------

/**
 * Skupni kilometri poti (zaporedni postanki: realne ceste prek indeksa nog
 * OSRM, kadar je podan; sicer haversine × cestni faktor; zaokroženo na 5 —
 * brez lažne natančnosti). Enaka logika kot geo-validation dnevni km, a čez
 * celo pot (tudi prehode med dnevi).
 */
export function computeDrivingKm(
  days: Itinerary["days"],
  legs?: LegRouteIndex
): number {
  const visits = days.flatMap((d) =>
    (d.locations ?? []).map((l) => ({
      id: typeof l.destination_id === "string" ? l.destination_id : "",
      coords: DESTINATIONS.find((x) => x.id === l.destination_id)?.coords,
    }))
  );
  const known = visits.filter(
    (v): v is { id: string; coords: { lat: number; lng: number } } => !!v.coords
  );
  if (known.length < 2) return 0;
  let km = 0;
  for (let i = 1; i < known.length; i++) {
    const leg = legs?.get(legKey(known[i - 1].id, known[i].id));
    if (leg) {
      km += leg.km; // realna cesta (OSRM) — faktor je že v merjeni poti
    } else {
      // hevristika (noga ni v indeksu) — enaka formula kot brez indeksa
      km +=
        haversineKm(
          known[i - 1].coords.lat,
          known[i - 1].coords.lng,
          known[i].coords.lat,
          known[i].coords.lng
        ) * ROAD_FACTOR;
    }
  }
  return Math.round(km / 5) * 5;
}

/**
 * Ocena stroškov vožnje za celo pot (gorivo + vinjeta).
 * Čista funkcija: Itinerary + število dni → DriveCosts.
 * F5.6: z indeksom nog (OSRM) km temeljijo na realnih cestah.
 */
export function computeTripDriveCosts(
  itinerary: Itinerary,
  legs?: LegRouteIndex
): DriveCosts | null {
  const days = Array.isArray(itinerary.days) ? itinerary.days : [];
  const km = computeDrivingKm(days, legs);
  if (km <= 0) return null; // brez znanih koordinat → brez ocene (ne izmišljujemo)

  const fuelLiters = Math.round((km / 100) * FUEL_CONSUMPTION_L_PER_100);
  const fuelEur = Math.round(fuelLiters * FUEL_PRICE_EUR_PER_L);
  const vignetteDays = pickVignetteDays(days.length);
  const vignetteEur = VIGNETTE_PRICES[vignetteDays];

  return {
    km,
    fuelLiters,
    fuelEur,
    vignetteDays,
    vignetteEur,
    totalEur: fuelEur + vignetteEur,
  };
}
