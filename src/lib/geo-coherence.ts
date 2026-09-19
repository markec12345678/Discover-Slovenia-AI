// ============================================================================
// TASK 51 (§4/§13) — GEOGRAFSKA KOHERENCA: deterministične metrike M1–M5.
//
// Namen: merljiv, reproducibilen dokaz, da itinerer NE vsebuje očitnih
// geografskih skokov ali vračanja čez že obiskano območje. NI cilj
// matematični optimum poti — koherenca, ne popolna optimizacija.
//
// M1 — totalDistanceKm: vsota NOG po zaporedju postankov. Vir vsake noge
//       je OZNAČEN ("osrm" = realna cesta, "heuristic" = haversine ×1,4
//       ocena, kadar OSRM ni dosegljiv). Haversine SE NE predstavlja kot
//       realni čas vožnje (§5 TASK 51): hevristične noge se štejejo
//       posebej, poročilo odkrito razkriva delež.
// M2 — longestLegKm: najdaljša posamezna noga (z virom in parom postankov).
// M3 — backtrackingEvents: deterministična detekcija "vračanja čez že
//       obiskano območje" (spodaj natančna definicija s pragovoma).
// M4 — medianLegKm / legsOver120Km: opisna koherenca zaporednih postankov.
//       Noga > 120 km NI prepovedana (celo-državni načrti jo legitimno
//       potrebujejo), a se šteje — trend mora biti merljiv.
// M5 — anchorCoherence: za vsak FIXED sidro — razdalje ostalih postankov
//       ISTEGA dneva od sidra (sidro je canonical, nikoli premaknjeno).
//
// DETERMINIZEM: vse metrike so čiste funkcije nad (postanki, noge).
// Brez omrežja, brez naključnosti, brez stanja. Enaki vhodi → isto
// poročilo (testno preverljivo v task51-geo-coherence.test.ts).
// ============================================================================

/** Postanek z znanima koordinatama (T1 dataset ali supply kanon). */
export interface CoherenceStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

/** Noga z odkritim virom (nikoli ne predstavi hevristike kot OSRM). */
export interface LegFact {
  km: number;
  source: "osrm" | "heuristic";
}

/** En backtracking dogodek (M3) — glej BACKTRACK definition spodaj. */
export interface BacktrackingEvent {
  /** Postanek, čez katerega območje se vračamo (indeks v zaporedju). */
  overIndex: number;
  /** Postanek, ki se vrača (indeks v zaporedju). */
  backIndex: number;
  overStopId: string;
  backStopId: string;
  /** Kako daleč je pot med njima odšla od območja (km, haversine). */
  leftKm: number;
}

export interface GeoCoherenceReport {
  stops: number;
  legs: number;
  /** M1 — vsota nog (km); odkrito razdelano po viru. */
  totalDistanceKm: number;
  osrmLegs: number;
  heuristicLegs: number;
  /** M2 */
  longestLegKm: number;
  longestLegSource: "osrm" | "heuristic" | null;
  longestLegPair: string | null;
  /** M3 — deterministično izračunano nad haversine (brez omrežja). */
  backtrackingEvents: BacktrackingEvent[];
  /** M4 — opisna statistika nog. */
  medianLegKm: number;
  legsOver120Km: number;
  /** M5 — glej anchorCoherenceReport. */
  anchors: AnchorCoherence[];
}

/** M5: koherenca enega FIXED sidra z dnevom, na katerega je pristalo. */
export interface AnchorCoherence {
  anchorId: string;
  anchorName: string;
  day: number;
  /** Razdalje ostalih postankov istega dne od sidra (haversine km). */
  sameDayDistancesKm: number[];
  maxSameDayKm: number;
  meanSameDayKm: number;
}

// ---------------------------------------------------------------------------
// M3 — DEFINICIJA BACKTRACKINGA (dokumentirana, brez subjektivne ocene)
// ---------------------------------------------------------------------------
// Zaporedje postankov s[0..n-1]. Postanek s[k] "backtracka" čez s[i]
// (i <= k-2) natanko tedaj, ko OBA pogoja držita (haversine):
//
//   (1) dist(s[i], s[k]) <= R_VISIT_KM      — s[k] se VRAČA v območje s[i]
//   (2) obstaja m, i < m < k, z
//       dist(s[i], s[m]) >= D_LEFT_KM       — pot je vmes OBSTNO odšla
//                                             iz območja s[i]
//
// Utemeljitev pragov (Slovenija, ne izmišljena iz zraka):
//   R_VISIT = 30 km ≈ radiij ene regije (Bled–Bohinj ~12 km, Bled–Vintgar
//     ~5 km, Ljubljana–Vintgar ~40 km — intra-regijski pari so NOTRI,
//     medregijski (Ljubljana–Piran ~50 ravno črta) so IZVEN);
//   D_LEFT = 45 km haversine ≈ 60+ km ceste — nedvoumen medregijski
//     odhod (primer iz repro: Bohinj → Postojna ~48 km ravno črte).
// Lokalno raziskovanje (Triglav → Soča → Bohinj, vsi pari < 45 km) se
// NE šteje kot backtracking — to je legitimna gruča.
// ---------------------------------------------------------------------------

export const R_VISIT_KM = 30;
export const D_LEFT_KM = 45;

/** Haversine (km) — varna: nekončne/NaN koordinate → +Infinity. */
export function coherenceHaversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  if (
    !Number.isFinite(a.lat) || !Number.isFinite(a.lng) ||
    !Number.isFinite(b.lat) || !Number.isFinite(b.lng)
  ) {
    return Number.POSITIVE_INFINITY;
  }
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** M3 — deterministična detekcija vračanj (glej definicijo zgoraj). */
export function findBacktrackingEvents(
  stops: CoherenceStop[]
): BacktrackingEvent[] {
  const events: BacktrackingEvent[] = [];
  for (let k = 2; k < stops.length; k++) {
    for (let i = k - 2; i >= 0; i--) {
      if (coherenceHaversineKm(stops[i], stops[k]) > R_VISIT_KM) continue;
      let leftKm = 0;
      for (let m = i + 1; m < k; m++) {
        const d = coherenceHaversineKm(stops[i], stops[m]);
        if (d > leftKm) leftKm = d;
      }
      if (leftKm >= D_LEFT_KM) {
        events.push({
          overIndex: i,
          backIndex: k,
          overStopId: stops[i].id,
          backStopId: stops[k].id,
          leftKm: Math.round(leftKm),
        });
        break; // en dogodek na s[k] (dokaz o prvem prekrito s[i])
      }
    }
  }
  return events;
}

/**
 * M1–M4 nad zaporedjem postankov. `legFact` vrne nogo za par zaporednih
 * postankov (ali null, če je ni — npr. brez koordinat); klicec DOSEGUJE
 * isto odkritost vira kot UI (LegSummary.source).
 */
export function computeGeoCoherence(
  stops: CoherenceStop[],
  legFact: (a: CoherenceStop, b: CoherenceStop) => LegFact | null
): GeoCoherenceReport {
  const legKms: number[] = [];
  let totalDistanceKm = 0;
  let osrmLegs = 0;
  let heuristicLegs = 0;
  let longestLegKm = 0;
  let longestLegSource: "osrm" | "heuristic" | null = null;
  let longestLegPair: string | null = null;

  for (let i = 1; i < stops.length; i++) {
    const fact = legFact(stops[i - 1], stops[i]);
    if (!fact || !Number.isFinite(fact.km)) continue;
    totalDistanceKm += fact.km;
    legKms.push(fact.km);
    if (fact.source === "osrm") osrmLegs += 1;
    else heuristicLegs += 1;
    if (fact.km > longestLegKm) {
      longestLegKm = fact.km;
      longestLegSource = fact.source;
      longestLegPair = `${stops[i - 1].name} → ${stops[i].name}`;
    }
  }

  const sortedKms = [...legKms].sort((a, b) => a - b);
  const medianLegKm =
    sortedKms.length === 0
      ? 0
      : sortedKms.length % 2 === 1
        ? sortedKms[(sortedKms.length - 1) / 2]
        : (sortedKms[sortedKms.length / 2 - 1] +
            sortedKms[sortedKms.length / 2]) / 2;

  return {
    stops: stops.length,
    legs: legKms.length,
    totalDistanceKm: Math.round(totalDistanceKm),
    osrmLegs,
    heuristicLegs,
    longestLegKm: Math.round(longestLegKm),
    longestLegSource,
    longestLegPair,
    backtrackingEvents: findBacktrackingEvents(stops),
    medianLegKm: Math.round(medianLegKm),
    legsOver120Km: legKms.filter((km) => km > 120).length,
    anchors: [],
  };
}

/**
 * M5 — koherenca sidrov: za vsak FIXED postanek (id s dvopičjem — supply
 * kanon) razdalje ostalih postankov ISTEGA dneva od sidra. Sidro je
 * canonical (Task 48/49 geoRestored) — ta metrika meri, ali so ostali
 * postanki dneva smiselno OKOLI njega (§8 F1–F4).
 */
export function computeAnchorCoherence(
  days: { day: number; stops: CoherenceStop[] }[]
): AnchorCoherence[] {
  const out: AnchorCoherence[] = [];
  for (const d of days) {
    const anchors = d.stops.filter((s) => s.id.includes(":"));
    for (const anchor of anchors) {
      const others = d.stops.filter((s) => s !== anchor);
      const dists = others
        .map((o) => coherenceHaversineKm(anchor, o))
        .filter((x) => Number.isFinite(x));
      out.push({
        anchorId: anchor.id,
        anchorName: anchor.name,
        day: d.day,
        sameDayDistancesKm: dists.map((x) => Math.round(x)),
        maxSameDayKm: dists.length
          ? Math.round(Math.max(...dists))
          : 0,
        meanSameDayKm: dists.length
          ? Math.round(dists.reduce((a, b) => a + b, 0) / dists.length)
          : 0,
      });
    }
  }
  return out;
}
