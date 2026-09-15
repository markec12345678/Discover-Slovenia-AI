// ============================================================================
// ROAD ROUTING TEST (F5.6) — čisti testi z INJEKTIRANIM mock fetchem
// + živa OSRM verifikacija (samo z --live)
// ============================================================================
//
// Preverja (vzorec phase4-verify / pilot-* orodij — ni unit test framework,
// je produkcijska validacija čistih plasti):
//
//   ČISTO (brez omrežja — injektiran mock fetch):
//   T1  heuristicLeg: Ljubljana→Piran ≈ 135 km / ~2h28 (stara formula)
//   T2  buildLegRouteIndex z disableOsrm → vse noge "heuristic",
//       geoValidation.method === "heuristic"
//   T3  buildLegRouteIndex z mock OSRM (107 km / 73 min) → noga "osrm",
//       km/min prenesena v kvaliteto + geo + stroške; method "osrm"
//   T4  mešani indeks (ena noga osrm, druga manjka) → method "mixed"
//   T5  dan z enim postankom → dayRouteGeometry null; dan z 2 postankoma
//       in geometrijama nog → konatenirana geometrija (skupna točka 1×)
//   T6  validateItineraryGeo BREZ indeksa (client pot, stari načrti) →
//       method polje MANJKA (nazaj kompatibilno)
//   T7  circuit breaker: 4 zaporedne napake → naslednji klic NE poskusi
//       omrežja (fetch števec se ne poveča)
//   T8  predpomnilnik: drugi klic istega para NE stresa omrežja
//
//   ŽIVO (samo z --live, poganja se v peskovniku):
//   L1  router.project-osrm.org dosegljiv: Ljubljana→Piran ≈ 100–115 km,
//       60–90 min (realna avtocestna povezava)
//   L2  buildLegRouteIndex na sintetičnem 2-dnevnem itinerarju → vse noge
//       osrm, method "osrm", geometrija dneva ≥ 2 točki, Bled→Bohinj
//       krajši od hevristike (lokalna cesta, ne avtocesta ×1,3)
//
// Uporaba:
//   bun scripts/road-routing-test.ts          (čisti testi)
//   bun scripts/road-routing-test.ts --live   (+ živi OSRM strežnik)
// ============================================================================

import {
  buildLegRouteIndex,
  resetRoadRoutingState,
  type OsrmJsonFetcher,
} from "../src/lib/road-routing-server";
import {
  dayRouteGeometry,
  heuristicLeg,
  legIndexMethod,
  legKey,
} from "../src/lib/road-routing";
import { validateItineraryGeo } from "../src/lib/geo-validation";
import { computeItineraryQuality } from "../src/lib/itinerary-quality";
import { computeTripDriveCosts } from "../src/lib/trip-costs";
import { DESTINATIONS } from "../src/lib/slovenia-data";
import type { Itinerary, PlannerInput } from "../src/lib/types";

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const LJ = DESTINATIONS.find((d) => d.id === "ljubljana")!;
const PIRAN = DESTINATIONS.find((d) => d.id === "piran")!;
const BLED = DESTINATIONS.find((d) => d.id === "bled")!;
const BOHINJ = DESTINATIONS.find((d) => d.id === "bohinj")!;

if (!LJ || !PIRAN || !BLED || !BOHINJ) {
  console.error("Ni vseh destinacij v datasetu — preveri id-je.");
  process.exit(1);
}

/** Sintetični 2-dnevni itinerer: LJ→Piran (dan 1), Bled→Bohinj (dan 2). */
function syntheticItinerary(): Itinerary {
  return {
    days: [
      {
        day: 1,
        locations: [
          {
            destination_id: "ljubljana",
            destination_name: "Ljubljana",
            time_slot: "09:00-13:00",
            duration: 4,
            estimated_cost: 20,
            notes: "",
          },
          {
            destination_id: "piran",
            destination_name: "Piran",
            time_slot: "15:00-18:00",
            duration: 3,
            estimated_cost: 15,
            notes: "",
          },
        ],
        weather: { condition: "sončno", temp: 24 },
      },
      {
        day: 2,
        locations: [
          {
            destination_id: "bled",
            destination_name: "Bled",
            time_slot: "09:00-12:00",
            duration: 3,
            estimated_cost: 10,
            notes: "",
          },
          {
            destination_id: "bohinj",
            destination_name: "Bohinj",
            time_slot: "13:00-17:00",
            duration: 4,
            estimated_cost: 5,
            notes: "",
          },
        ],
        weather: { condition: "sončno", temp: 22 },
      },
    ],
    total_budget: 50,
    recommendations: [],
    tips: [],
    source: "fallback",
  };
}

const INPUT: PlannerInput = {
  budget: 500,
  days: 2,
  interests: ["narava"],
  season: "summer",
  groupSize: 2,
};

/** Mock pridobivalec: samo LJ→Piran par uspešno (107 km / 73 min),
 *  ostalo null (napaka). Podpis OsrmJsonFetcher (url, timeout) → JSON. */
function makeMockOsrmFetcher(counter: { calls: number }): OsrmJsonFetcher {
  return async (url: string) => {
    counter.calls++;
    const hasLjPiran =
      url.includes(`${LJ.coords.lng.toFixed(6)},${LJ.coords.lat.toFixed(6)}`) &&
      url.includes(`${PIRAN.coords.lng.toFixed(6)},${PIRAN.coords.lat.toFixed(6)}`);
    if (hasLjPiran && url.includes("router.project-osrm.org")) {
      return {
        code: "Ok",
        routes: [
          {
            distance: 107000,
            duration: 4380,
            geometry: {
              coordinates: [
                [LJ.coords.lng, LJ.coords.lat],
                [14.2, 45.8],
                [PIRAN.coords.lng, PIRAN.coords.lat],
              ],
            },
          },
        ],
      };
    }
    return null;
  };
}

console.log("== ČISTI TESTI (brez omrežja) ==");

// T1 — hevristična noga (stara formula)
{
  const leg = heuristicLeg(LJ.coords, PIRAN.coords);
  // haversine LJ→Piran ≈ 92 km × 1,3 ≈ 120 km; /55 km/h ≈ 131 min → round5
  check(
    "T1 heuristicLeg LJ→Piran ~120 km (±10)",
    leg.km >= 110 && leg.km <= 130,
    `km=${leg.km}`
  );
  check(
    "T1 heuristicLeg LJ→Piran ~130 min (±10)",
    leg.min >= 120 && leg.min <= 140,
    `min=${leg.min}`
  );
  check("T1 vir = heuristic", leg.source === "heuristic");
}

// T2 — disableOsrm → vse hevristike, method "heuristic"
{
  resetRoadRoutingState();
  const it = syntheticItinerary();
  const legs = await buildLegRouteIndex(it, { disableOsrm: true });
  check(
    "T2 vse noge heuristic (3 noge: 2 v dnevu + 1 mejna)",
    legs.size === 3 && [...legs.values()].every((l) => l.source === "heuristic"),
    `size=${legs.size}`
  );
  const geo = validateItineraryGeo(it, "sl", legs);
  check("T2 geoValidation.method = heuristic", geo.method === "heuristic");
  const q = computeItineraryQuality(it, INPUT, legs);
  check("T2 quality.routingMethod = heuristic", q.routingMethod === "heuristic");
}

// T3 — mock OSRM uspeh za LJ→Piran
{
  resetRoadRoutingState();
  const counter = { calls: 0 };
  const it = syntheticItinerary();
  const legs = await buildLegRouteIndex(it, {
    fetchJson: makeMockOsrmFetcher(counter),
  });
  const ljPiran = legs.get(legKey("ljubljana", "piran"))!;
  check(
    "T3 LJ→Piran noga osrm: 107 km / 73 min",
    ljPiran?.source === "osrm" && ljPiran.km === 105 && ljPiran.min === 75,
    `source=${ljPiran?.source} km=${ljPiran?.km} min=${ljPiran?.min}`
  );
  check(
    "T3 geometrija noge [lat,lng] ≥ 2 točki",
    Array.isArray(ljPiran?.geometry) && ljPiran.geometry!.length === 3 &&
      Math.abs(ljPiran.geometry![0][0] - LJ.coords.lat) < 1e-9,
    `geom[0]=${JSON.stringify(ljPiran?.geometry?.[0])}`
  );

  const geo = validateItineraryGeo(it, "sl", legs);
  // LJ→Piran hevristika bi dala ~135 km (ERROR nad 150 ne, WARN nad 80 DA);
  // realna 105 km — še vedno WARN nad 80, a pošteno manj
  check(
    "T3 geo dan 1 km = 105 (realna, ne 135 hevristika)",
    geo.days.find((d) => d.day === 1)?.km === 105,
    `km=${geo.days.find((d) => d.day === 1)?.km}`
  );
  check("T3 geoValidation.method = mixed", geo.method === "mixed");

  const q = computeItineraryQuality(it, INPUT, legs);
  check(
    "T3 quality.routingMethod = mixed",
    q.routingMethod === "mixed"
  );

  const costs = computeTripDriveCosts(it, legs);
  // 105 (osrm) + ~135 (piran→bled hev.) + ~20 (bled→bohinj hev.) = ~260
  check(
    "T3 stroški: km ≈ 260 (105 osrm + hevristične prehode)",
    costs !== null && costs.km >= 245 && costs.km <= 275,
    `km=${costs?.km}`
  );
}

// T4 — vse noge uspešne → method "osrm" (injektiran univerzalni uspeh)
{
  resetRoadRoutingState();
  const okFetch: OsrmJsonFetcher = async () => ({
    code: "Ok",
    routes: [{ distance: 50000, duration: 3000 }],
  });
  const it = syntheticItinerary();
  const legs = await buildLegRouteIndex(it, { fetchJson: okFetch });
  check(
    "T4 vse noge osrm → method osrm",
    [...legs.values()].every((l) => l.source === "osrm") &&
      legIndexMethod(legs) === "osrm"
  );
}

// T5 — dayRouteGeometry: konatenacija nog
{
  resetRoadRoutingState();
  const counter = { calls: 0 };
  const it = syntheticItinerary();
  const legs = await buildLegRouteIndex(it, {
    fetchJson: makeMockOsrmFetcher(counter),
  });
  const day2Geom = dayRouteGeometry(it.days[1].locations, legs);
  check(
    "T5 dan 2 geometrija null (bled→bohinj noga nima geometrije — mock 500)",
    day2Geom === null
  );
  const day1Geom = dayRouteGeometry(it.days[0].locations, legs);
  check(
    "T5 dan 1 geometrija: 3 točke (noga LJ→Piran ima 3 točke)",
    Array.isArray(day1Geom) && day1Geom.length === 3,
    `len=${day1Geom?.length}`
  );
  check(
    "T5 en postanek → geometrija null",
    dayRouteGeometry(it.days[0].locations.slice(0, 1), legs) === null
  );
}

// T6 — client pot (brez indeksa): method polje MANJKA
{
  resetRoadRoutingState();
  const it = syntheticItinerary();
  const geo = validateItineraryGeo(it, "sl");
  check("T6 brez indeksa → method ni definiran", geo.method === undefined);
  const q = computeItineraryQuality(it, INPUT);
  check("T6 brez indeksa → routingMethod ni definiran", q.routingMethod === undefined);
}

// T7 — circuit breaker: 4 zaporedne napake → brez omrežja
{
  resetRoadRoutingState();
  const counter = { calls: 0 };
  const failing = makeMockOsrmFetcher(counter); // vedno null (razen LJ→Piran)
  // 4 klici, ki VSI padejo (samo bled→bohinj pari — mock vrača 500 zanje)
  for (let i = 0; i < 4; i++) {
    await buildLegRouteIndex(
      {
        ...syntheticItinerary(),
        days: [
          {
            day: 1,
            locations: [
              {
                destination_id: "bled",
                destination_name: "Bled",
                time_slot: "09:00-12:00",
                duration: 3,
                estimated_cost: 0,
                notes: "",
              },
              {
                destination_id: "bohinj",
                destination_name: "Bohinj",
                time_slot: "13:00-17:00",
                duration: 4,
                estimated_cost: 0,
                notes: "",
              },
            ],
            weather: { condition: "", temp: 20 },
          },
        ],
      },
      { fetchJson: failing }
    );
  }
  const before = counter.calls;
  await buildLegRouteIndex(syntheticItinerary(), { fetchJson: failing });
  check(
    "T7 po 4 zaporednih napakah varovalka NE strese več (0 novih klicev)",
    counter.calls === before,
    `calls before=${before} after=${counter.calls}`
  );
}

// T8 — predpomnilnik: uspešni pari se NE stresejo več; neuspešni se
// (smiselno — obnovitveni poskus, če se OSRM pobere nazaj)
{
  resetRoadRoutingState();
  const counter = { calls: 0 };
  const okFetch = makeMockOsrmFetcher(counter);
  const it = syntheticItinerary();
  await buildLegRouteIndex(it, { fetchJson: okFetch });
  const calls1 = counter.calls;
  await buildLegRouteIndex(it, { fetchJson: okFetch });
  check(
    "T8 predpomnilnik: uspešna noga (LJ→Piran) iz predpomnilnika = samo 2 nova klica",
    counter.calls - calls1 === 2,
    `calls1=${calls1} total=${counter.calls}`
  );
  // vendar ključne VREDNOSTI ostanejo stabilne med klici
  const legs2 = await buildLegRouteIndex(it, { fetchJson: okFetch });
  check(
    "T8 osrm noga še vedno osrm po več klicih",
    legs2.get(legKey("ljubljana", "piran"))?.source === "osrm"
  );
}

// ---------------------------------------------------------------------------
// ŽIVI testi (samo --live)
// ---------------------------------------------------------------------------
if (process.argv.includes("--live")) {
  console.log("\n== ŽIVI TESTI (router.project-osrm.org) ==");
  resetRoadRoutingState();

  // L1 — neposreden klic
  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${LJ.coords.lng},${LJ.coords.lat};${PIRAN.coords.lng},${PIRAN.coords.lat}?overview=false`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = (await res.json()) as {
      code: string;
      routes?: { distance: number; duration: number }[];
    };
    const km = (data.routes?.[0]?.distance ?? 0) / 1000;
    const min = (data.routes?.[0]?.duration ?? 0) / 60;
    check("L1 OSRM dosegljiv (code Ok)", data.code === "Ok");
    check(
      "L1 LJ→Piran realno 95–125 km",
      km >= 95 && km <= 125,
      `km=${km.toFixed(1)}`
    );
    check(
      "L1 LJ→Piran realno 60–90 min",
      min >= 60 && min <= 90,
      `min=${min.toFixed(0)}`
    );
  } catch (e) {
    check("L1 OSRM dosegljiv", false, String(e));
  }

  // L2 — celoten indeks na sintetičnem itinerarju
  {
    resetRoadRoutingState();
    const it = syntheticItinerary();
    const legs = await buildLegRouteIndex(it);
    const osrmCount = [...legs.values()].filter((l) => l.source === "osrm").length;
    check(
      "L2 vse 3 noge osrm",
      osrmCount === 3,
      `osrm=${osrmCount}/${legs.size}`
    );
    const geo = validateItineraryGeo(it, "sl", legs);
    check("L2 geoValidation.method = osrm", geo.method === "osrm");
    const geom = dayRouteGeometry(it.days[1].locations, legs);
    check(
      "L2 geometrija dneva 2 (Bled→Bohinj po realni cesti) ≥ 5 točk",
      Array.isArray(geom) && geom.length >= 5,
      `len=${geom?.length}`
    );
    const bohLeg = legs.get(legKey("bohinj", "bled")) ?? legs.get(legKey("bled", "bohinj"));
    check(
      "L2 Bled↔Bohinj: realna noga 25–35 km (krajska cesta okoli jezera)",
      bohLeg !== undefined && bohLeg.source === "osrm" && bohLeg.km >= 25 && bohLeg.km <= 35,
      `osrm=${bohLeg?.km}`
    );
    const q = computeItineraryQuality(it, INPUT, legs);
    check(
      "L2 quality.routingMethod = osrm",
      q.routingMethod === "osrm"
    );
    // heuristic quality for comparison
    const qHeur = computeItineraryQuality(it, INPUT);
    console.log(
      `  ℹ️  vožnja: hevristika ${qHeur.drivingMinutes} min → realne ceste ${q.drivingMinutes} min (razlika ${qHeur.drivingMinutes - q.drivingMinutes} min)`
    );
    console.log(
      `  ℹ️  km stroški: hevristika ${qHeur.driveCosts?.km} km → realne ceste ${q.driveCosts?.km} km`
    );
  }
}

console.log(`\n${pass} ✓ / ${fail} ✗`);
process.exit(fail === 0 ? 0 : 1);
