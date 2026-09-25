import { DESTINATIONS } from "@/lib/slovenia-data";
import type { Itinerary, RoutingMethod } from "@/lib/types";

// ============================================================================
// ROAD ROUTING (F5.6 / roadmap item 2 iz analize MindTrip) — realne cestne
// razdalje in vozni časi iz OSRM (OpenStreetMap Routing Machine)
// ============================================================================
//
// PROBLEM, ki ga ta plast rešuje: do F5.6 so VSE plasti (kvaliteta,
// geo-validacija, stroški, vpogledi postankov) razdalje ocenjevale z
// haversine × 1,3 ÷ 55 km/h. Za prvotnih 22 znanih točk v Sloveniji (danes
// 38 destinacij nabora, ISSUE #4 §18) je ta hevristika
// SYSTEMATIČNO ZAVAJA v OBEH smerih hkrati (izmerjeno na realnih poteh
// sandboxa, L2 test):
//   - ČAS na avtocestnih povezavah PRETIRAVA (LJ→Piran: hevristika ~131 min;
//     realna cesta ~85 min — avtocesta) → lažni ERROR dnevi v validaciji
//   - KILOMETRI v goratih regijah PODCENJUJEjo (Bled→Bohinj: hevristika
//     ~25 km; realna cesta ~30 km — vijugasta cesta okoli jezera)
//
// REŠITEV (poštena, po načelu znamke):
//   - Razdalje/časi pridejo iz javnega OSRM demo strežnika
//     (router.project-osrm.org — OpenStreetMap podatki, profil "driving").
//   - EN par točk = EN zahtevek, rezultat se PRED pomnilnikom (TTL 24 h) —
//     slovenska matrika 22×21 ≈ 462 parov, torej se predpomnilnik POčasi
//     napolni in OSRMja praktično ne obremenjujemo več.
//   - ob napaki/timeoutu (2,5 s) ALI izklopu (stikalni varovalki) se
//     BREZ izjeme uporabi stara haversine hevristika — in METODA je
//     razkrita v odgovoru (geoValidation.method / quality.routingMethod),
//     tako da UI pove, kaj prikazuje. NIč se ne pretvarja, da je ocena
//     realna cesta.
//   - geometrija (poenostavljena polyline po realnih cestah) za zemljevid
//     poti na /nacrtuj — dane na dan (DayPlan.routeGeometry).
//
// TA DATOTEKA je ČISTA in CLIENT-VARNA (brez node:/omrežnih uvozov) —
// omogoča, da geo-validation/itinerary-quality ostanejo uporabne tudi na
// clientu (stari shranjeni načrti). Strežniški del (OSRM klient s
// predpomnilnikom in varovalko) živi v src/lib/road-routing-server.ts
// (uvoženo SAMO iz API poti).
// ============================================================================

/** Cestni faktor za hevristiko — enak kot v vseh čistih plasteh (nazaj
 *  kompatibilen fallback, kadar OSRM ni na voljo). */
export const HEURISTIC_ROAD_FACTOR = 1.3;
/** Povprečna hitrost za hevristiko (km/h). */
export const HEURISTIC_AVG_SPEED_KMH = 55;

/** Vir podatka za eno "nogo" (par zaporednih postankov). */
export type LegSource = "osrm" | "heuristic";

export interface LegRoute {
  /** Realna (ali hevristična) cestna razdalja v km (zaokroženo na 5). */
  km: number;
  /** Vožnja v minutah (zaokroženo na 5). */
  min: number;
  /** Od kod je ta številka — razkrito v UI. */
  source: LegSource;
  /**
   * Poenostavljena geometrija poti [lat, lng] (samo OSRM noge) — za
   * zemljevid. Manjka pri hevristiki (client potem ravno črto, kot doslej).
   */
  geometry?: [number, number][];
}

/** Indeks nog po ključu `"idA|idB"` (urejen par zaporednih postankov). */
export type LegRouteIndex = Map<string, LegRoute>;

/** Ključ noge (urejen par destinacijskih ID-jev). */
export function legKey(a: string, b: string): string {
  return `${a}|${b}`;
}

/** Zaokroži na 5 (km ali minute) — brez lažne natančnosti "137 km". */
export function round5(n: number): number {
  return Math.round(n / 5) * 5;
}

/** Haversine razdalja v km (ista formula kot v čistih plastih). */
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

/** Koordinate destinacij (client-varno — isti vir kot čisti plasti). */
export const DESTINATION_COORDS = new Map(
  DESTINATIONS.map((d) => [d.id, d.coords])
);

/** Hevristična noga (haversine × 1,3 ÷ 55 km/h) — čista, za fallback in teste. */
export function heuristicLeg(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): LegRoute {
  const straight = haversineKm(a.lat, a.lng, b.lat, b.lng);
  const roadKm = straight * HEURISTIC_ROAD_FACTOR;
  return {
    km: round5(roadKm),
    min: round5((roadKm / HEURISTIC_AVG_SPEED_KMH) * 60),
    source: "heuristic",
  };
}

/**
 * Skupna metoda indeksa: "osrm", če so VSE noge realne; "heuristic", če
 * NIČ ni; sicer "mixed". (Razkritje v geoValidation.method / quality.)
 */
export function legIndexMethod(index: LegRouteIndex): RoutingMethod {
  if (index.size === 0) return "heuristic";
  let osrm = 0;
  let heuristic = 0;
  for (const leg of index.values()) {
    if (leg.source === "osrm") osrm++;
    else heuristic++;
  }
  if (heuristic === 0) return "osrm";
  if (osrm === 0) return "heuristic";
  return "mixed";
}

/**
 * UI sprint (točka D smeri): indeks nog → plain objekt (brez geometrije) za
 * serializacijo v itinerer (Itinerary.legs). Client uporabi km/min za
 * povezovalnike med postanki; hevristika ostaja odkrita prek "source".
 */
export function serializeLegs(
  index: LegRouteIndex
): Record<string, { km: number; min: number; source: LegSource }> {
  const out: Record<string, { km: number; min: number; source: LegSource }> =
    {};
  for (const [key, leg] of index) {
    out[key] = { km: leg.km, min: leg.min, source: leg.source };
  }
  return out;
}

/**
 * Sestavi geometrijo poti enega dneva iz geometrij nog indeksa
 * (zaporedje postankov dneva). Vrne null, če katera noga nima geometrije
 * (hevristika) ali dan nima vsaj 2 znanih postankov — client potem
 * izriše ravne črte, kot doslej (nazaj kompatibilno).
 */
export function dayRouteGeometry(
  dayLocations: { destination_id: string }[],
  index: LegRouteIndex
): [number, number][] | null {
  const ids = dayLocations
    .map((l) => (typeof l.destination_id === "string" ? l.destination_id : ""))
    .filter((id) => DESTINATION_COORDS.has(id));
  if (ids.length < 2) return null;

  const path: [number, number][] = [];
  for (let i = 1; i < ids.length; i++) {
    const leg = index.get(legKey(ids[i - 1], ids[i]));
    const geom = leg?.geometry;
    if (!geom || geom.length < 2) return null; // kakršna koli luknja → ni realne črte
    if (i === 1) path.push(...geom);
    else path.push(...geom.slice(1)); // skupno vozlišče se ne podvoji
  }
  return path.length >= 2 ? path : null;
}
