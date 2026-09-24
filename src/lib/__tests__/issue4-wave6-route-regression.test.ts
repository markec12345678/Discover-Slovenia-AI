import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  bestOrder,
  optimizeDayOrder,
  pathKm,
} from "@/lib/route-order";
import {
  markIntentLocked,
  markItineraryIntentLocked,
  preserveIntentLocked,
  refineIntentLocked,
} from "@/lib/route-intent";
import {
  DESTINATION_COORDS,
  HEURISTIC_ROAD_FACTOR,
  HEURISTIC_AVG_SPEED_KMH,
  heuristicLeg,
  round5,
} from "@/lib/road-routing";
import { checkZigzag, type ParsedDay } from "@/lib/plan-check";
import type { Itinerary, LocationVisit } from "@/lib/types";

// ============================================================================
// ISSUE #4 VAL 6 §21 — REGRESIJSKA SUITA ZA OPTIMIZACIJO ZAPOREDJA DNEVA
// ============================================================================
//
// Zahteva Issue #4 §21 (§21 ROUTE OPTIMIZATION): "Naredi regression suite
// za 1/2/14 dni, duplicate location, closed POI, missing coordinates,
// impossible route, border crossing, ferry, walking, driving in mixed
// transport." + "**Posebej preveri, da optimizacija ne uniči uporabnikovega
// namernega vrstnega reda.**"
//
// Pokrit modul: src/lib/route-order.ts (optimizeDayOrder v2 — segmentna
// optimizacija z ZAMRZNJENIMI postanki intentLocked; pathKm/bestOrder
// ostajata JAVNI pogodbi za plan-check.ts F13) + src/lib/route-intent.ts
// (strežniško označevanje namernosti + ohranjanje na refinu).
//
// ISKRENOST (vir razdalj): optimizator je 100 % hevristika — haversine ×
// HEURISTIC_ROAD_FACTOR (1,3) ÷ HEURISTIC_AVG_SPEED_KMH (55 km/h) — VOZNA
// (driving) osnova, razkrita prek source "heuristic". NE trdi: trajektov,
// hoje, meja, prometa. Realne OSRM noge so druga plast (road-routing-server,
// generacija) — ta optimizator je čist/determinističen (0 omrežja).
//
//   §1  1/2/14 dni — neodvisnost dni, determinizem, dnevi < 3 postankov
//   §2  duplicate location — isti destination_id dvakrat v dnevu
//   §3  closed POI — optimizator je namerno agnostičen do odpiralnih časov
//   §4  missing coordinates — null / novi vir (lastni lat/lng)
//   §5  impossible route — nekončne koordinate; identične točke so VELJAVNE
//   §6  border crossing — tuji OSM postanek deluje (hevristika, ne meja)
//   §7  ferry — sistem NE trdi trajektov (vedno cestna ocena)
//   §8  walking/driving/mixed — osnova je vožnja; bestOrder pogodba (F13)
//   §9  NAMERNI VRSTNI RED — ZAMRZNJENI postanki (KRITIČNA §21 zahteva)
//   §10 markIntentLocked — enota (FIXED id + supply + booking_provider)
//   §11 refine ohranjanje — preserveIntentLocked/refineIntentLocked
//   §12 plan-check pogodba — checkZigzag še deluje (tuji načrt, F13)
//   §13 čistost modulov — brez omrežja/baze/ure (codeOnly vzorec wave5 §5)
//   §14 i18n — planner.optimizeLockedHint pariteta SL/EN
// ============================================================================

// ---------------------------------------------------------------------------
// Pomočniki
// ---------------------------------------------------------------------------

/** Izvorna koda BREZ komentarjev (čistost preverjamo na KODI). */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "") // blok komentarji
    .replace(/^\s*\/\/.*$/gm, ""); // vrstični komentarji
}

function source(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

/** Postanek T1 destinacije (koordinate pridejo iz dataseta). */
function v(id: string, over: Partial<LocationVisit> = {}): LocationVisit {
  return {
    destination_id: id,
    destination_name: id,
    time_slot: "09:00-11:00",
    duration: 2,
    estimated_cost: 0,
    notes: "",
    ...over,
  };
}

function ids(locs: LocationVisit[]): string[] {
  return locs.map((l) => l.destination_id);
}

function slotsOf(locs: LocationVisit[]): string[] {
  return locs.map((l) => l.time_slot ?? "");
}

/** Multiset primerjava (sortirani seznama). */
function multiset(arr: string[]): string[] {
  return [...arr].sort();
}

const coords = (id: string) => DESTINATION_COORDS.get(id);
const legKm = (a: string, b: string) =>
  heuristicLeg(coords(a)!, coords(b)!).km;

/** Haversine v km — NEODVISEN izračun v testu (isti R kot formula). */
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

/** Sintetični načrt: n dni × 4 znani postanki z razpoznavnimi termini. */
function syntheticPlan(dayCount: number): LocationVisit[][] {
  const DAY_POOLS: string[][] = [
    ["ljubljana", "triglav", "piran", "bled"],
    ["postojna", "piran", "portoroz", "kobarid"],
    ["maribor", "ptuj", "celje", "rogaska"],
    ["soca", "kobarid", "bohinj", "vintgar"],
    ["zagreb", "plitvicka-jezera", "ljubljana", "celje"],
  ];
  const daySlots = ["08:30-10:30", "11:00-13:00", "14:00-16:00", "17:00-19:00"];
  const days: LocationVisit[][] = [];
  for (let d = 0; d < dayCount; d++) {
    const pool = DAY_POOLS[d % DAY_POOLS.length];
    days.push(
      pool.map((id, i) =>
        v(id, { time_slot: `${daySlots[i % daySlots.length]}` })
      )
    );
  }
  return days;
}

// ---------------------------------------------------------------------------
// §1 — 1/2/14 DNI: neodvisnost, determinizem, dnevi < 3 postankov
// ---------------------------------------------------------------------------

describe("ISSUE #4 §21/§1: 1/2/14 dni — optimizacija po dnevih", () => {
  for (const dayCount of [1, 2, 14]) {
    test(`${dayCount}-dnevni načrt: vsi dnevi obdelani, množice postankov/terminov ohranjene, determinizem`, () => {
      const plan = syntheticPlan(dayCount);
      const snapshot = JSON.stringify(plan);

      // Dvakrat zapovrstjo — ISTI izhod (determinizem, 0 naključja)
      const runA = plan.map((day) => optimizeDayOrder(day));
      const runB = plan.map((day) => optimizeDayOrder(day));
      expect(JSON.stringify(runA)).toBe(JSON.stringify(runB));

      for (let d = 0; d < plan.length; d++) {
        const res = runA[d];
        // 4 znani postanki, brez zamrznjenih → veljaven rezultat
        expect(res).not.toBeNull();
        expect(res!.locations).toHaveLength(plan[d].length);
        // MNOŽICA postankov dneva ohranjena (optimizacija = PERMUTACIJA)
        expect(multiset(ids(res!.locations))).toEqual(multiset(ids(plan[d])));
        // MNOŽICA terminov dneva ohranjena (termini = PERMUTACIJA nizov)
        expect(multiset(slotsOf(res!.locations))).toEqual(
          multiset(slotsOf(plan[d]))
        );
        // Iskrene km: prihranek nikoli negativen
        expect(res!.savedKm).toBeGreaterThanOrEqual(0);
        expect(res!.beforeKm).toBeGreaterThanOrEqual(res!.afterKm);
        // Brez zamrznjenih: termini so po novih pozicijah UREJENI
        // (stara F16 invarianta — vrstni red terminov 08:30 → 17:00)
        const starts = slotsOf(res!.locations).map((s) =>
          Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5))
        );
        for (let i = 1; i < starts.length; i++) {
          expect(starts[i]).toBeGreaterThanOrEqual(starts[i - 1]);
        }
      }

      // NEODVISNOST dni: rezultat dneva i je ENAK, neodvisno od vseh ostalih
      for (let d = 0; d < plan.length; d++) {
        const isolated = optimizeDayOrder(syntheticPlan(dayCount)[d]);
        expect(JSON.stringify(isolated)).toBe(JSON.stringify(runA[d]));
      }

      // Čistost: vhodni načrt NI mutiran
      expect(JSON.stringify(plan)).toBe(snapshot);
    });
  }

  test("dan z < 3 postanki → null (preureditev nima smisla)", () => {
    expect(optimizeDayOrder([])).toBeNull();
    expect(optimizeDayOrder([v("ljubljana")])).toBeNull();
    expect(optimizeDayOrder([v("ljubljana"), v("bled")])).toBeNull();
  });

  test("ne-array vhod → null (defenzivna varovalka)", () => {
    expect(optimizeDayOrder(null as unknown as LocationVisit[])).toBeNull();
    expect(optimizeDayOrder(undefined as unknown as LocationVisit[])).toBeNull();
  });

  test("8 postankov (nad izčrpno mejo) — 2-opt veja: množica ohranjena, km ne slabša", () => {
    const day = [
      "maribor",
      "murska-sobota",
      "lendava",
      "celje",
      "ptuj",
      "rogaska",
      "slovenj-gradec",
      "dravograd",
    ].map((id, i) => v(id, { time_slot: `0${8 + i}:00-1${(i % 2) + 0}:00` }));
    const res = optimizeDayOrder(day);
    expect(res).not.toBeNull();
    expect(multiset(ids(res!.locations))).toEqual(multiset(ids(day)));
    expect(res!.afterKm).toBeLessThanOrEqual(res!.beforeKm);
    // Determinizem tudi na 2-opt veji
    expect(JSON.stringify(optimizeDayOrder(day))).toBe(JSON.stringify(res));
  });

  test("brez zamrznjenih: v2 izhod je IDENTIČEN javni bestOrder poti (nazaj kompatibilno)", () => {
    const dayIds = ["ljubljana", "triglav", "piran", "bled"];
    const day = dayIds.map((id, i) =>
      v(id, { time_slot: `${9 + i}:00-${11 + i}:00` })
    );
    const res = optimizeDayOrder(day);
    const { order } = bestOrder(dayIds, legKm);
    expect(res).not.toBeNull();
    expect(ids(res!.locations)).toEqual(order);
  });
});

// ---------------------------------------------------------------------------
// §2 — DUPLICATE LOCATION: isti destination_id dvakrat v dnevu
// ---------------------------------------------------------------------------

describe("ISSUE #4 §21/§2: duplicate location v dnevu", () => {
  test("podvojen postanek: veljaven rezultat, OBE kopiji ohranjeni, savedKm ≥ 0", () => {
    const day = [
      v("ljubljana", { time_slot: "09:00-11:00" }),
      v("bled", { time_slot: "11:00-13:00" }),
      v("ljubljana", { time_slot: "13:00-15:00" }), // duplikat — legitimen
      v("piran", { time_slot: "15:00-17:00" }),
    ];
    const res = optimizeDayOrder(day);
    expect(res).not.toBeNull();
    expect(res!.locations).toHaveLength(4);
    expect(multiset(ids(res!.locations))).toEqual(
      multiset(["ljubljana", "bled", "ljubljana", "piran"])
    );
    expect(res!.savedKm).toBeGreaterThanOrEqual(0);
    expect(res!.beforeKm).toBeGreaterThanOrEqual(res!.afterKm);
    // Termini: množica ohranjena (vključno z duplikati)
    expect(multiset(slotsOf(res!.locations))).toEqual(multiset(slotsOf(day)));
    // NE crasha niti pri duplikatu z lastnimi koordinatami (OSM stil)
    const osmDup = [
      v("osm:node-7", { lat: 46.05, lng: 14.5, time_slot: "09:00-10:00" }),
      v("osm:node-7", { lat: 46.05, lng: 14.5, time_slot: "10:00-11:00" }),
      v("osm:node-8", { lat: 46.3, lng: 14.1, time_slot: "11:00-12:00" }),
    ];
    const resDup = optimizeDayOrder(osmDup);
    expect(resDup).not.toBeNull();
    expect(multiset(ids(resDup!.locations))).toEqual(
      multiset(["osm:node-7", "osm:node-7", "osm:node-8"])
    );
  });
});

// ---------------------------------------------------------------------------
// §3 — CLOSED POI: optimizator je NAMERNO agnostičen do odpiralnih časov
// ---------------------------------------------------------------------------

describe("ISSUE #4 §21/§3: zaprt POI (odpiralni časi)", () => {
  test("ptuj (Ptujski grad zaprt ob ponedeljkih) se preuredi eno kot vsi ostali", () => {
    // ISKRENO NAČELO: optimizator zaporedja optimizeza SAMO cestne km —
    // odpiralni časi so RESNICA druge plasti (selection/trust: geo-validacija
    // closed_weekday/closed_month pravili nad DestinationOpening). Tukaj
    // dokumentiramo: zaprt POI se NE izloči in NE označi v optimizatorju —
    // njegova zaprtost se uporabniku pokaže tam, kjer je preverjena.
    const ptujDest = [...DESTINATION_COORDS.keys()].includes("ptuj");
    expect(ptujDest).toBe(true); // dataset resnica: ptuj je znan postanek
    const day = [
      v("ptuj", { time_slot: "09:00-11:00" }),
      v("maribor", { time_slot: "11:00-13:00" }),
      v("celje", { time_slot: "13:00-15:00" }),
      v("ljubljana", { time_slot: "15:00-17:00" }),
    ];
    const res = optimizeDayOrder(day);
    expect(res).not.toBeNull();
    expect(multiset(ids(res!.locations))).toEqual(multiset(ids(day)));
    expect(res!.savedKm).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// §4 — MISSING COORDINATES: odklonitev / novi vir (lastni lat/lng)
// ---------------------------------------------------------------------------

describe("ISSUE #4 §21/§4: manjkajoče koordinate", () => {
  test("neznan destination_id BREZ lat/lng → null (ne ugibamo razdalj)", () => {
    const day = [
      v("ljubljana"),
      v("osm:node-brezz-koordinat"), // noben vir koordinat
      v("bled"),
    ];
    expect(optimizeDayOrder(day)).toBeNull();
  });

  test("neznan id S KONČNIMA lat/lng → DELA (nova zmožnost §21 — OSM/tuji kraji)", () => {
    const day = [
      v("ljubljana", { time_slot: "09:00-10:30" }),
      v("osm:node-123", { lat: 46.24, lng: 14.35, time_slot: "11:00-12:30" }),
      v("bled", { time_slot: "13:00-14:30" }),
    ];
    const res = optimizeDayOrder(day);
    expect(res).not.toBeNull();
    expect(multiset(ids(res!.locations))).toEqual(multiset(ids(day)));
    expect(res!.beforeKm).toBeGreaterThan(0);
    expect(res!.savedKm).toBeGreaterThanOrEqual(0);
  });

  test("NaN / Infinity lat/lng → null (iskrena odklonitev — nemogoča ruta)", () => {
    const dayNaN = [
      v("ljubljana"),
      v("osm:node-bad", { lat: Number.NaN, lng: 14.5 }),
      v("bled"),
    ];
    expect(optimizeDayOrder(dayNaN)).toBeNull();
    const dayInf = [
      v("ljubljana"),
      v("osm:node-bad", { lat: Number.POSITIVE_INFINITY, lng: 14.5 }),
      v("bled"),
    ];
    expect(optimizeDayOrder(dayInf)).toBeNull();
    // Le ENA od koordinat nekončna → prav tako null
    const dayHalf = [
      v("ljubljana"),
      v("osm:node-bad", { lat: 46.1, lng: Number.NaN }),
      v("bled"),
    ];
    expect(optimizeDayOrder(dayHalf)).toBeNull();
  });

  test("samo lat brez lng → null (delne koordinate niso vir)", () => {
    const day = [
      v("ljubljana"),
      v("osm:node-half", { lat: 46.1 }),
      v("bled"),
    ];
    expect(optimizeDayOrder(day)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §5 — IMPOSSIBLE ROUTE: nekončne koordinate; identične točke so VELJAVNE
// ---------------------------------------------------------------------------

describe("ISSUE #4 §21/§5: nemogoča ruta", () => {
  test("nekončne koordinate → null (zgoraj §4) — tu: identične točke so veljavne", () => {
    // Dva RAZLIČNA postanka na ISTIT koordinati (npr. dva objekta istega
    // dvorišča): noga z 0 km je VELJAVNA cestna noga (ocena), ne napaka.
    const day = [
      v("osm:node-a", { lat: 46.0, lng: 14.0, time_slot: "09:00-10:00" }),
      v("osm:node-b", { lat: 46.0, lng: 14.0, time_slot: "10:00-11:00" }),
      v("osm:node-c", { lat: 46.5, lng: 14.5, time_slot: "11:00-12:00" }),
    ];
    const res = optimizeDayOrder(day);
    expect(res).not.toBeNull();
    expect(multiset(ids(res!.locations))).toEqual(multiset(ids(day)));
    expect(res!.savedKm).toBeGreaterThanOrEqual(0);
  });

  test("vse točke identične: 0-km pot — rezultat VELJAVEN, vrstni red ohranjen (izenačitve)", () => {
    const day = [
      v("osm:node-a", { lat: 46.0, lng: 14.0, time_slot: "09:00-10:00" }),
      v("osm:node-b", { lat: 46.0, lng: 14.0, time_slot: "10:00-11:00" }),
      v("osm:node-c", { lat: 46.0, lng: 14.0, time_slot: "11:00-12:00" }),
    ];
    const res = optimizeDayOrder(day);
    expect(res).not.toBeNull();
    expect(ids(res!.locations)).toEqual(ids(day)); // izenačitve → izvirni red
    expect(res!.beforeKm).toBe(0);
    expect(res!.afterKm).toBe(0);
    expect(res!.savedKm).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// §6 — BORDER CROSSING: mešan SI destinacij + tuji OSM kraj
// ---------------------------------------------------------------------------

describe("ISSUE #4 §21/§6: prehod meje (mešani domači/tuji postanki)", () => {
  test("Zagreb prek lastnih lat/lng v dnevu s SI destinacijami: dela, km > 0, cestna ocena", () => {
    // ISKRENOST: hevristika NE pozna meje (border-awareness se NE trdi) —
    // ocena je haversine × 1,3 ÷ 55 km/h, enako za SI/HR/ME/AL para. Realne
    // ceste čez mejo bi lahko imele čakalne čase, ki jih ta ocena NE vsebuje
    // (razkrito v UI z "~" in virom "heuristic").
    const day = [
      v("ljubljana", { time_slot: "09:00-11:00" }),
      v("osm:node-999", { lat: 45.81, lng: 15.98, time_slot: "11:00-13:00" }), // Zagreb (HR)
      v("bled", { time_slot: "13:00-15:00" }),
    ];
    const res = optimizeDayOrder(day);
    expect(res).not.toBeNull();
    expect(res!.beforeKm).toBeGreaterThan(0);
    expect(res!.afterKm).toBeGreaterThan(0);
    expect(res!.savedKm).toBeGreaterThanOrEqual(0);
    expect(multiset(ids(res!.locations))).toEqual(multiset(ids(day)));
    // Noga LJ→ZG je iz hevristike (vir resnice: road-routing.ts)
    const leg = heuristicLeg(coords("ljubljana")!, { lat: 45.81, lng: 15.98 });
    expect(leg.km).toBe(150);
    expect(leg.source).toBe("heuristic");
  });

  test("tuji KATALOGIZIRAN kraj (zagreb je v datasetu TASK 62) — isti kanon", () => {
    const day = [
      v("zagreb", { time_slot: "09:00-11:00" }),
      v("ljubljana", { time_slot: "11:00-13:00" }),
      v("celje", { time_slot: "13:00-15:00" }),
    ];
    const res = optimizeDayOrder(day);
    expect(res).not.toBeNull();
    expect(multiset(ids(res!.locations))).toEqual(multiset(ids(day)));
  });
});

// ---------------------------------------------------------------------------
// §7 — FERRY: sistem NE trdi trajektov (vedno cestna ocena)
// ---------------------------------------------------------------------------

describe("ISSUE #4 §21/§7: trajekt (iskrena odsotnost)", () => {
  test("obalni par čez vodo (Piran → točka čez Tržaški zaliv) — vir je 'heuristic', NIKOLI 'ferry'", () => {
    // ISKRENOST: optimizator NE pozna plovbenih linij — za par čez vodo
    // (kjer bi v resnici vozil trajekt/katamaran) izračuna CESTNO oceno
    // (haversine × 1,3). Ta ocena je ZAVAJAJOČA za čez-vodo pare, a je
    // vsaj odkrita: source "heuristic" (nikoli izmišljen "ferry" vir).
    // Kanon: LegSource = "osrm" | "heuristic" — trajekt NI del taksonomije.
    const piran = coords("piran")!;
    const acrossWater = { lat: 45.081, lng: 13.635 }; // Rovinj (HR) — čez zaliv
    const leg = heuristicLeg(piran, acrossWater);
    expect(leg.source).toBe("heuristic");
    expect(leg.km).toBe(round5(haversineKm(45.5233, 13.5676, 45.081, 13.635) * HEURISTIC_ROAD_FACTOR));
    // Optimizator nad takim parom: enako pošten (cestna ocena, delujoč izid)
    const day = [
      v("piran", { time_slot: "09:00-10:30" }),
      v("osm:node-rovinj", { lat: 45.081, lng: 13.635, time_slot: "11:00-12:30" }),
      v("portoroz", { time_slot: "13:00-14:30" }),
    ];
    const res = optimizeDayOrder(day);
    expect(res).not.toBeNull();
    expect(res!.beforeKm).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// §8 — WALKING/DRIVING/MIXED: osnova je VOŽNJA; bestOrder pogodba (F13)
// ---------------------------------------------------------------------------

describe("ISSUE #4 §21/§8: hoja/vožnja/mešani transport", () => {
  test("hevristika je VOZNA osnova: km = haversine × 1,3; min = km ÷ 55 km/h", () => {
    const bled = coords("bled")!;
    const bohinj = coords("bohinj")!;
    const leg = heuristicLeg(bled, bohinj);
    const hav = haversineKm(bled.lat, bled.lng, bohinj.lat, bohinj.lng);
    expect(leg.km).toBe(round5(hav * HEURISTIC_ROAD_FACTOR));
    expect(leg.min).toBe(
      round5(((hav * HEURISTIC_ROAD_FACTOR) / HEURISTIC_AVG_SPEED_KMH) * 60)
    );
    expect(HEURISTIC_ROAD_FACTOR).toBe(1.3);
    expect(HEURISTIC_AVG_SPEED_KMH).toBe(55);
    expect(leg.source).toBe("heuristic");
  });

  test("optimizator NIKOLI ne trdi hoje: DayOrderResult nima polja 'mode' (Go Mode je zunanji handoff)", () => {
    // Hoja/pedaliranje je koncept Go Mode navigacije (externa predaja —
    // /go/… handoff), NE optimizatorja zaporedja. Struktura izhoda je
    // namenjeno revna: samo zaporedje + km ocene (vsi ključi):
    const day = ["ljubljana", "triglav", "piran", "bled"].map((id, i) =>
      v(id, { time_slot: `${9 + i}:00-${11 + i}:00` })
    );
    const res = optimizeDayOrder(day);
    expect(res).not.toBeNull();
    expect(Object.keys(res!).sort()).toEqual([
      "afterKm",
      "beforeKm",
      "locations",
      "savedKm",
    ]);
    // km optimizatorja = vsota hevrističnih nog (ISTA enota/vir)
    expect(res!.beforeKm).toBe(
      round5(pathKm(ids(day), (a, b) => legKm(a, b)))
    );
  });

  test("bestOrder pogodba (plan-check F13): odprta pot, množica ohranjena, km ≤ izvirnik", () => {
    const dayIds = ["maribor", "piran", "ljubljana", "triglav", "celje"];
    const { order, km } = bestOrder(dayIds, legKm);
    expect(order).toHaveLength(5);
    expect(multiset(order)).toEqual(multiset(dayIds));
    expect(km).toBe(pathKm(order, legKm));
    expect(km).toBeLessThanOrEqual(pathKm(dayIds, legKm));
    expect(km).toBe(345); // dejanski optimum (izčrpno 5! = 120 permutacij)
  });
});

// ---------------------------------------------------------------------------
// §9 — NAMERNI VRSTNI RED (KRITIČNA §21 ZAHTEVA): ZAMRZNJENI postanki
// ---------------------------------------------------------------------------

describe("ISSUE #4 §21/§9: namerni vrstni red — intentLocked zamrznitev", () => {
  const lockedDay = (): LocationVisit[] => [
    v("ljubljana", { time_slot: "14:00-16:00", intentLocked: true }), // pozicija 0 (FIXED)
    v("triglav", { time_slot: "09:00-11:00" }), // prost
    v("piran", { time_slot: "10:00-12:00", intentLocked: true }), // pozicija 2 (FIXED)
    v("bled", { time_slot: "11:30-13:30" }), // prost
    v("bohinj", { time_slot: "13:00-15:00" }), // prost
  ];

  test("zamrznjeni na TOČNO istih pozicijah z LASTNIM terminom; premaknejo se SAMO prosti", () => {
    const day = lockedDay();
    const res = optimizeDayOrder(day);
    expect(res).not.toBeNull();

    // Zamrznjeni ostajajo na TOČNO istih položajih (0 in 2) — ista vrednost
    // (tudi termin, tudi vse ostalo polje)
    expect(res!.locations[0]).toEqual(day[0]);
    expect(res!.locations[2]).toEqual(day[2]);

    // Prosti segment [3,4] se preuredi: [bled, bohinj] → [bohinj, bled]
    // (piran→bohinj 115 + bohinj→bled 25 = 140 < piran→bled 135 + 25 = 160)
    expect(res!.locations[3].destination_id).toBe("bohinj");
    expect(res!.locations[4].destination_id).toBe("bled");
    // Posamezni prosti položaj (1) med dvema zamrznjenima: segment velikosti 1
    expect(res!.locations[1].destination_id).toBe("triglav");

    // Množica postankov/terminov ohranjena
    expect(multiset(ids(res!.locations))).toEqual(multiset(ids(day)));
    expect(multiset(slotsOf(res!.locations))).toEqual(multiset(slotsOf(day)));

    // km: pošten prihranek — pred ≥ po (355 → 335: 80+125+135+25 → 80+125+115+25)
    expect(res!.beforeKm).toBe(365);
    expect(res!.afterKm).toBe(345);
    expect(res!.savedKm).toBe(20);
    expect(res!.beforeKm).toBeGreaterThanOrEqual(res!.afterKm);
  });

  test("zamrznjeni obdrži SVOJ termin; prosti položaji dobijo UREJENE termine prostih položajev", () => {
    const day = lockedDay();
    const res = optimizeDayOrder(day)!;
    // Zamrznjeni: izvirni termini (tudi inverzija 14:00 na mestu 0 ostane
    // pošteno vidna — optimizator je NE popravlja; geo-validacija javi)
    expect(res.locations[0].time_slot).toBe("14:00-16:00");
    expect(res.locations[2].time_slot).toBe("10:00-12:00");
    // Prosti položaji (1, 3, 4) v novi razporeditvi: UREJENI med seboj
    const freeSlots = [res.locations[1], res.locations[3], res.locations[4]].map(
      (l) => l.time_slot
    );
    const freeStarts = freeSlots.map(
      (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5))
    );
    expect(freeStarts).toEqual([...freeStarts].sort((a, b) => a - b));
    // Množica terminov PROSTIH položajev je permucirana, ne nova
    expect(multiset(freeSlots)).toEqual(
      multiset(["09:00-11:00", "11:30-13:30", "13:00-15:00"])
    );
  });

  test("nerazpoznaven termin → vsak postanek obdrži SVOJEGA (iskrena varovalka, tudi z zamrznjenimi)", () => {
    const day = lockedDay();
    day[1] = v("triglav", { time_slot: "celodnevni obisk" }); // neparsable
    const res = optimizeDayOrder(day);
    expect(res).not.toBeNull();
    // Neparsable katerikoli → nobenemu postanku se termin NE spremeni
    // (vsak obdrži SVOJEGA — termin potuje S postankom, ne s pozicijo)
    const slotById = new Map(ids(day).map((id, i) => [id, day[i].time_slot]));
    for (const l of res!.locations) {
      expect(l.time_slot).toBe(slotById.get(l.destination_id) ?? "");
    }
    // Zamrznjeni na svojih mestih tudi v tej veji
    expect(res!.locations[0]).toEqual(day[0]);
    expect(res!.locations[2]).toEqual(day[2]);
  });

  test("VSI zamrznjeni → null (ničesar za optimizirati)", () => {
    const day = [
      v("ljubljana", { intentLocked: true }),
      v("bled", { intentLocked: true }),
      v("piran", { intentLocked: true }),
    ];
    expect(optimizeDayOrder(day)).toBeNull();
  });

  test("zamrznjeni + 1 prost → null (eno samega ni mogoče preurediti)", () => {
    const day = [
      v("ljubljana", { intentLocked: true }),
      v("triglav"),
      v("piran", { intentLocked: true }),
    ];
    expect(optimizeDayOrder(day)).toBeNull();
  });

  test("stari načrti brez oznak: vsi postanki PROSTI (nazaj kompatibilno obnašanje)", () => {
    const day = lockedDay().map((l) => {
      const { intentLocked: _flag, ...rest } = l;
      return rest;
    });
    const res = optimizeDayOrder(day);
    expect(res).not.toBeNull();
    // Brez zamrznjenih: cel dan je EN segment → klasična optimizacija
    const { order } = bestOrder(ids(day), legKm);
    expect(ids(res!.locations)).toEqual(order);
  });

  test("zamrznjen OSM/supply postanek z lastnimi koordinatami se prav tako zamrzne", () => {
    const day = [
      v("osm:node-kt", {
        lat: 46.3,
        lng: 14.1,
        time_slot: "12:00-13:00",
        intentLocked: true,
        category: "supply",
      }),
      v("ljubljana", { time_slot: "09:00-11:00" }),
      v("bled", { time_slot: "14:00-16:00" }),
      v("bohinj", { time_slot: "16:00-18:00" }),
    ];
    const res = optimizeDayOrder(day);
    expect(res).not.toBeNull();
    expect(res!.locations[0]).toEqual(day[0]); // FIXED supply na mestu 0
    expect(multiset(ids(res!.locations))).toEqual(multiset(ids(day)));
    expect(res!.savedKm).toBeGreaterThanOrEqual(0);
  });

  test("zamrznjeni na 8-postankovnem dnevu (2-opt veja): invariante držijo", () => {
    const base = [
      "maribor",
      "murska-sobota",
      "lendava",
      "celje",
      "ptuj",
      "rogaska",
      "slovenj-gradec",
      "dravograd",
    ];
    const day = base.map((id, i) =>
      v(id, {
        time_slot: `0${8 + i}:00-1${i % 2}:00`,
        // zamrzni 2 (poziciji 1 in 4): ostalih 6 prostih → segmenti 4+2... dejansko 1,2
        intentLocked: i === 1 || i === 4,
      })
    );
    const res = optimizeDayOrder(day);
    expect(res).not.toBeNull();
    expect(res!.locations[1]).toEqual(day[1]);
    expect(res!.locations[4]).toEqual(day[4]);
    expect(multiset(ids(res!.locations))).toEqual(multiset(ids(day)));
    expect(res!.afterKm).toBeLessThanOrEqual(res!.beforeKm);
  });
});

// ---------------------------------------------------------------------------
// §10 — markIntentLocked (strežniško označevanje namernosti)
// ---------------------------------------------------------------------------

describe("ISSUE #4 §21/§10: markIntentLocked — enota", () => {
  const organic = v("bled");
  const fixedStop = v("osm:node-1", { lat: 46.1, lng: 14.1 });
  const supplyStop = v("osm:node-2", {
    lat: 46.2,
    lng: 14.2,
    category: "supply",
  });
  const bookingStop = v("viator:123", {
    lat: 46.3,
    lng: 14.3,
    booking_provider: "viator",
  });

  test("označi FIXED id + supply + booking_provider; organiki ostanejo NEoznačeni", () => {
    const marked = markIntentLocked({
      days: [{ locations: [organic, fixedStop, supplyStop, bookingStop] }],
      fixedDestinationIds: ["osm:node-1"],
    });
    expect(marked).toHaveLength(1);
    expect(marked[0][0].intentLocked).toBeUndefined(); // organik → NE
    expect(marked[0][1].intentLocked).toBe(true); // FIXED id → DA
    expect(marked[0][2].intentLocked).toBe(true); // category supply → DA
    expect(marked[0][3].intentLocked).toBe(true); // booking_provider → DA
  });

  test("ČISTO: vhodi se NE mutirajo; neoznačeni ostanejo referenčno enaki", () => {
    const days = [{ locations: [organic, fixedStop] }];
    const snapshot = JSON.stringify(days);
    const marked = markIntentLocked({
      days,
      fixedDestinationIds: ["osm:node-1"],
    });
    expect(JSON.stringify(days)).toBe(snapshot); // ni mutacije
    expect(marked[0][0]).toBe(days[0].locations[0]); // ista referenca
    expect(marked[0][1]).not.toBe(days[0].locations[1]); // nov objekt
    expect(days[0].locations[1].intentLocked).toBeUndefined();
  });

  test("stari načrti brez oznak/z fixedov/prazne evidence → NIČ ni označeno", () => {
    const marked = markIntentLocked({
      days: [{ locations: [organic, v("ljubljana")] }],
      fixedDestinationIds: [],
    });
    expect(marked[0].every((l) => l.intentLocked === undefined)).toBe(true);
    // prazen supply-kanal (brez category/booking) → tudi nič
    const bare = markIntentLocked({
      days: [{ locations: [v("triglav"), v("piran")] }],
      fixedDestinationIds: [],
    });
    expect(bare[0].every((l) => l.intentLocked === undefined)).toBe(true);
  });

  test("markItineraryIntentLocked: dnevi se preslikajo, ostala polja dneva ohranjena", () => {
    const it: Itinerary = {
      days: [
        {
          day: 1,
          locations: [fixedStop, organic],
          weather: { condition: "sončno", temp: 22 },
        },
      ],
      total_budget: 100,
      recommendations: [],
      tips: [],
      source: "ai",
    };
    const marked = markItineraryIntentLocked(it, ["osm:node-1"]);
    expect(marked.days[0].weather).toEqual({ condition: "sončno", temp: 22 });
    expect(marked.days[0].locations[0].intentLocked).toBe(true);
    expect(marked.days[0].locations[1].intentLocked).toBeUndefined();
    // vhod NI mutiran
    expect(it.days[0].locations[0].intentLocked).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// §11 — REFINE OHRANJANJE (preserveIntentLocked / refineIntentLocked)
// ---------------------------------------------------------------------------

describe("ISSUE #4 §21/§11: refine ohranjanje namernosti", () => {
  const mkIt = (days: LocationVisit[][]): Itinerary => ({
    days: days.map((locations, i) => ({
      day: i + 1,
      locations,
      weather: { condition: "", temp: 0 },
    })),
    total_budget: 0,
    recommendations: [],
    tips: [],
    source: "ai",
  });

  test("preserveIntentLocked: oznaka po destination_id; NOV postanek ostane prost", () => {
    const incoming = mkIt([
      [
        v("bled", { intentLocked: true }),
        v("ljubljana"),
        v("osm:node-1", { lat: 46.1, lng: 14.1, intentLocked: true }),
      ],
    ]);
    const next = mkIt([
      [
        v("osm:node-1", { lat: 46.1, lng: 14.1 }), // obstoječa izbira (sanitize je odstranil oznako)
        v("piran"), // NOV AI predlog → prost
        v("ljubljana"), // obstoječi, a NI bil nameren → prost
        v("bled"), // obstoječa izbira → oznaka se vrne
      ],
    ]);
    const preserved = preserveIntentLocked(next, incoming);
    expect(preserved.days[0].locations[0].intentLocked).toBe(true);
    expect(preserved.days[0].locations[1].intentLocked).toBeUndefined();
    expect(preserved.days[0].locations[2].intentLocked).toBeUndefined();
    expect(preserved.days[0].locations[3].intentLocked).toBe(true);
  });

  test("preserveIntentLocked: vhod brez oznak → izhod referenčno nespremenjen", () => {
    const incoming = mkIt([[v("bled"), v("ljubljana")]]);
    const next = mkIt([[v("ljubljana"), v("bled"), v("piran")]]);
    expect(preserveIntentLocked(next, incoming)).toBe(next);
  });

  test("refineIntentLocked: vhodne oznake + sveži FIXED; izmisljeni AI flag ODSTRANJEN", () => {
    const incoming = mkIt([
      [v("osm:node-1", { lat: 46.1, lng: 14.1, intentLocked: true }), v("bled")],
    ]);
    const next = mkIt([
      [
        v("osm:node-1", { lat: 46.1, lng: 14.1 }),
        v("viator:77", {
          lat: 46.4,
          lng: 14.2,
        }), // sveža FIXED izbira s refina
        v("celje", { intentLocked: true }), // AI odmev si je oznako IZMISLIL
        v("piran"), // nov predlog
      ],
    ]);
    const refined = refineIntentLocked(next, incoming, ["viator:77"]);
    expect(refined.days[0].locations[0].intentLocked).toBe(true); // ohranjeno iz vhoda
    expect(refined.days[0].locations[1].intentLocked).toBe(true); // sveži FIXED
    expect(refined.days[0].locations[2].intentLocked).toBeUndefined(); // izmisljeno → PROST
    expect(refined.days[0].locations[3].intentLocked).toBeUndefined(); // predlog
    // vhoda NISTA mutirana
    expect(next.days[0].locations[2].intentLocked).toBe(true);
    expect(incoming.days[0].locations[0].intentLocked).toBe(true);
  });

  test("refineIntentLocked: fail-open — prazen vhod ne sesuje izhoda", () => {
    const next = mkIt([[v("bled"), v("piran")]]);
    const empty: Itinerary = {
      ...next,
      days: [],
    };
    expect(() => refineIntentLocked(next, empty, [])).not.toThrow();
    const refined = refineIntentLocked(next, empty, []);
    expect(multiset(ids(refined.days[0].locations))).toEqual(["bled", "piran"]);
  });
});

// ---------------------------------------------------------------------------
// §12 — PLAN-CHECK POGODBA (checkZigzag nad tujim načrtom, F13)
// ---------------------------------------------------------------------------

describe("ISSUE #4 §21/§12: plan-check checkZigzag pogodba (nespremenjena)", () => {
  test("majhen sintetični tuji načrt: ne vrže; cik-cak zaznan, dobro oblikovan", () => {
    // Tuji načrt (uporabnik prilepi besedilo ChatGPTja): vzhod→obala→
    // center→alpe→vzhod = klasichen cik-cak; checkZigzag predlaga preureditev.
    const days: ParsedDay[] = [
      {
        day: 1,
        locations: [
          v("maribor"),
          v("piran"),
          v("ljubljana"),
          v("triglav"),
          v("celje"),
        ],
      },
    ];
    const zig = checkZigzag(days);
    expect(Array.isArray(zig)).toBe(true);
    expect(zig.length).toBe(1);
    expect(zig[0].day).toBe(1);
    expect(zig[0].savedKm).toBeGreaterThanOrEqual(20); // prag ZIGZAG_MIN_KM
    expect(zig[0].currentKm - zig[0].optimizedKm).toBe(zig[0].savedKm);
    expect(zig[0].order).toHaveLength(5); // imena v optimalnem zaporedju
    expect(zig[0].order.every((n) => typeof n === "string" && n.length > 0)).toBe(
      true
    );
  });

  test("tuji dan s HR postanki (zagreb/plitvice): enaka čista pogodba, ne vrže", () => {
    const days: ParsedDay[] = [
      {
        day: 2,
        locations: [
          v("zagreb"),
          v("plitvicka-jezera"),
          v("ljubljana"),
          v("bled"),
        ],
      },
    ];
    const zig = checkZigzag(days);
    expect(Array.isArray(zig)).toBe(true);
    for (const z of zig) {
      expect(z.day).toBe(2);
      expect(z.currentKm).toBeGreaterThan(0);
      expect(z.optimizedKm).toBeLessThanOrEqual(z.currentKm);
      expect(z.order.length).toBe(4);
    }
  });
});

// ---------------------------------------------------------------------------
// §13 — ČISTOST MODULOV (codeOnly vzorec wave5 §5)
// ---------------------------------------------------------------------------

describe("ISSUE #4 §21/§13: čistost route-order.ts / route-intent.ts (listna modula)", () => {
  test("route-order.ts: BREZ omrežja/baze/LLM/ure (isto na serverju in clientu)", () => {
    const code = codeOnly(source("src/lib/route-order.ts"));
    expect(code).not.toContain("fetch(");
    expect(code).not.toContain("prisma");
    expect(code).not.toContain("@/lib/db");
    expect(code).not.toContain("ai-client");
    expect(code).not.toContain("z-ai");
    expect(code).not.toContain("Date.now");
    expect(code).not.toContain("new Date(");
  });

  test("route-intent.ts: BREZ omrežja/baze/LLM/ure (čista preslikava postankov)", () => {
    const code = codeOnly(source("src/lib/route-intent.ts"));
    expect(code).not.toContain("fetch(");
    expect(code).not.toContain("prisma");
    expect(code).not.toContain("@/lib/db");
    expect(code).not.toContain("ai-client");
    expect(code).not.toContain("z-ai");
    expect(code).not.toContain("Date.now");
    expect(code).not.toContain("new Date(");
  });
});

// ---------------------------------------------------------------------------
// §14 — i18n PARITETA (planner.optimizeLockedHint)
// ---------------------------------------------------------------------------

describe("ISSUE #4 §21/§14: i18n — planner.optimizeLockedHint (SL/EN)", () => {
  function plannerMessages(locale: "sl" | "en"): Record<string, unknown> {
    const raw = JSON.parse(
      source(`src/i18n/messages/${locale}.json`)
    ) as { planner: Record<string, unknown> };
    return raw.planner;
  }

  test("obstaja v OBEH jezikih, neprazna, brez placeholderjev (pariteta EXACT)", () => {
    const sl = plannerMessages("sl");
    const en = plannerMessages("en");
    expect(typeof sl.optimizeLockedHint).toBe("string");
    expect((sl.optimizeLockedHint as string).length).toBeGreaterThan(0);
    expect(typeof en.optimizeLockedHint).toBe("string");
    expect((en.optimizeLockedHint as string).length).toBeGreaterThan(0);
    // Brez placeholderjev v obeh (enostaven niz — nobena {x} varianta)
    expect(sl.optimizeLockedHint).not.toContain("{");
    expect(en.optimizeLockedHint).not.toContain("{");
  });

  test("besedila sta po vsebini SL/EN prevod istega zagotovila", () => {
    const sl = plannerMessages("sl").optimizeLockedHint as string;
    const en = plannerMessages("en").optimizeLockedHint as string;
    expect(sl).toBe("Fiksni postanki (tvoje izbire) ostanejo na svojih mestih");
    expect(en).toBe("Fixed stops (your picks) stay in place");
  });
});
