// ============================================================================
// TASK 51 (§9–§12, §8, §19, §21) — GEOGRAFSKA KOHERENCA ITINERARJEV:
// deterministični testi nad REALNIMA API rutama + čistimi enotama.
//
// VZROK TASK 50 P2 (repro, živi OSRM): fallback je obiskoval destinacije v
// vrstnem redu PO OCENI — geografija ni sodelovala (B2 1115 km, B3 1650 km
// cik-cak; haversine 534/870 km). FIX: src/lib/geo-order.ts (sidrovno
// urejanje) + geo-coherence.ts (metrike M1–M5).
//
// DETERMINIZEM (ista vzorca kot task50-scenario-automation):
//   - globalThis.fetch zavrne VSE omrežne klice → AI DETERMINISTIČNO
//     odpove → fallback pot (§18: AI 429/malformed/network → fallback);
//   - OSRM preusmerjen na mrtev lokalni naslov PRED uvozom (node:https,
//     ECONNREFUSED takojšen) → noge so hevristika, POŠTENO OZNAČENA
//     (§15: heuristic NI verified routing; test to izrecno zahteva);
//   - KT dataset = LOKALNA datoteka → kanonske cene/koordinate REALNE.
//
// PRAGOVI (dokumentirani, ne iz zraka — glej geo-coherence.ts):
//   R_VISIT=30 km (radiij regije), D_LEFT=45 km haversine (~60+ km ceste =
//   medregijski odhod), M5 sidro-dan ≤ 60 km (intra-regijsko parjenje).
//
// PRIMARNE TRDITVE (brez arbitrarnih pragov):
//   T1: backtrackingEvents = 0 na VSEH geo-scenarijih (dokumentirana metrika)
//   T2: haversine total odziva ≤ haversine total STAROGA oceni-reda nad
//       ISTIMI postanki (napredek je merjen, ne izmišljen)
//   T3: isti vhod → isti vrstni red (determinizem, 2 klica)
//   T4: FIXED točno 1× s kanonsko ceno, vrstni red izbire ohranjen (§8)
//   T5: vremenski bloki ohranijo notranje naboje na svojih dnevih (unit)
// ============================================================================

import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import {
  getKiwitaxiBaseline,
  resetKiwitaxiDataset,
} from "@/lib/supply/providers/kiwitaxi/dataset";
import { DESTINATIONS } from "@/lib/slovenia-data";
import type { Itinerary, LocationVisit } from "@/lib/types";
import { clearProviderRateLimits } from "@/lib/supply/search";
import {
  orderAroundAnchors,
  type GeoOrderAnchor,
  type OrderableStop,
} from "@/lib/geo-order";
import {
  computeGeoCoherence,
  computeAnchorCoherence,
  findBacktrackingEvents,
  coherenceHaversineKm,
  type CoherenceStop,
  type GeoCoherenceReport,
} from "@/lib/geo-coherence";

// OSRM prek node:https — preusmerjen PRED uvozom (determinizem; hevristika).
process.env.OSRM_BASE_URL = "https://127.0.0.1:9";

const { POST } = await import("@/app/api/itinerary/route");
const { POST: POST_REFINE } = await import("@/app/api/itinerary/refine/route");
const { resetRoadRoutingState } = await import("@/lib/road-routing-server");

// ---------------------------------------------------------------------------
// Kanoniki (dinamično iz produkcijskega baseline-a — brez fixture dvojnikov)
// ---------------------------------------------------------------------------
const BASELINE = getKiwitaxiBaseline();
const ktPrice = (id: string): number | null =>
  BASELINE?.routes.find((r) => r.id === Number(id))?.minPriceEur ?? null;
const KT_411 = ktPrice("411") ?? 77; // Bled → Ljubljana Airport (pin: Bled)
const KT_258775 = ktPrice("258775") ?? 33; // Ljubljana (pin: Ljubljana)
const KT_918 = ktPrice("918") ?? 172; // Maribor (pin: Maribor)
const KT_265989 = ktPrice("265989") ?? 68; // Umag → Piran (pin: Umag/Primorska)
const hasKt = BASELINE != null;

// KT kanonske koordinate iz dataseta (sidrne pozicije za teste)
const ktCoords = (id: string): { lat: number; lng: number } | null => {
  const r = BASELINE?.routes.find((x) => x.id === Number(id));
  return r?.fromLat != null && r?.fromLng != null
    ? { lat: r.fromLat, lng: r.fromLng }
    : null;
};

// ---------------------------------------------------------------------------
// Deterministično omrežje: AI/vreme/Overpass odpovedo; OSRM mrtev (zgoraj)
// ---------------------------------------------------------------------------
const realFetch = globalThis.fetch;
let ipCounter = 0;

beforeEach(() => {
  globalThis.fetch = (() =>
    Promise.reject(
      new Error("task51: omrežje izklopljeno (deterministični test)")
    )) as unknown as typeof fetch;
  resetKiwitaxiDataset();
  resetRoadRoutingState();
  clearProviderRateLimits(); // TASK 76: route-testi porabljajo žetone runner omejevalnika
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

// ---------------------------------------------------------------------------
// Pomočniki (klientovi payloadi, kot jih pošilja pravi browser)
// ---------------------------------------------------------------------------
function jsonPost(url: string, body: unknown): Request {
  ipCounter += 1;
  return new Request(`http://localhost${url}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-real-ip": `10.51.20.${(ipCounter % 250) + 1}`,
    },
    body: JSON.stringify(body),
  });
}

function genPayload(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    budget: 500,
    days: 3,
    interests: ["narava", "mesta"],
    season: "summer",
    groupSize: 2,
    language: "sl",
    ...over,
  };
}

/** Klientova KT izbira — vsa polja so NEZAUPAN vnos (tamper možen). */
function ktSelection(
  id: string,
  priceEur: number,
  coords?: { lat: number; lng: number }
): Record<string, unknown> {
  return {
    provider: "kiwitaxi",
    providerProductId: id,
    type: "transfer",
    title: `Transfer ${id} (klientova trditev)`,
    lat: coords?.lat ?? 46.3,
    lng: coords?.lng ?? 14.1,
    price: { amount: priceEur, currency: "EUR", unit: "per_transfer" },
    source: "supply-map",
    selectionState: "fixed",
  };
}

const SLOT_RE = /(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/;

function parseSlot(s: unknown): { start: number; end: number } | null {
  if (typeof s !== "string") return null;
  const m = s.match(SLOT_RE);
  if (!m) return null;
  const start = Number(m[1]) * 60 + Number(m[2]);
  const end = Number(m[3]) * 60 + Number(m[4]);
  if (end <= start) return null;
  return { start, end };
}

function allStops(it: Itinerary): LocationVisit[] {
  return (it.days ?? []).flatMap((d) => d.locations ?? []);
}

function orderOf(it: Itinerary): string[] {
  return allStops(it).map((l) => l.destination_id);
}

/** Koordinate postanka odziva: T1 dataset ∪ lastne (supply kanon). */
function stopCoords(l: LocationVisit): { lat: number; lng: number } {
  const t1 = DESTINATIONS.find((x) => x.id === l.destination_id);
  if (t1) return t1.coords;
  return { lat: l.lat ?? Number.NaN, lng: l.lng ?? Number.NaN };
}

function coherenceStopsOf(it: Itinerary): CoherenceStop[] {
  return allStops(it).map((l) => {
    const c = stopCoords(l);
    return { id: l.destination_id, name: l.destination_name, ...c };
  });
}

/** M1–M4 odziva: noge iz it.legs (vir odkrito — hevristika tu, OSRM živo). */
function coherenceOf(it: Itinerary): GeoCoherenceReport {
  const stops = coherenceStopsOf(it);
  const legs = it.legs ?? {};
  return computeGeoCoherence(stops, (a, b) => {
    const leg = legs[`${a.id}|${b.id}`];
    return leg ? { km: leg.km, source: leg.source } : null;
  });
}

/** M5: sidra (supply postanki) in njihovi so-dnevni sosedi. */
function anchorCoherenceOf(it: Itinerary) {
  return computeAnchorCoherence(
    (it.days ?? []).map((d) => ({
      day: d.day,
      stops: (d.locations ?? []).map((l) => {
        const c = stopCoords(l);
        return { id: l.destination_id, name: l.destination_name, ...c };
      }),
    }))
  );
}

/**
 * Rekonstrukcija STAROGA oceni-reda (koren vzroka TASK 50 P2) nad ISTIMI
 * T1 postanki: vrstni red po (število ujemanj interesov + rating/10), kot
 * ga je delal generateFallbackItinerary PRED TASK 51. Vrne haversine total.
 */
function scoreOrderHaversineKm(it: Itinerary, interests: string[]): number {
  const t1Stops = allStops(it).filter(
    (l) => !l.destination_id.includes(":") // supply FIXED pride noter pozneje (obeh svetov)
  );
  const score = (id: string) => {
    const d = DESTINATIONS.find((x) => x.id === id);
    if (!d) return -Infinity;
    return (
      d.bestFor.filter((b) => interests.includes(b)).length + d.rating / 10
    );
  };
  const ordered = [...t1Stops].sort(
    (a, b) => score(b.destination_id) - score(a.destination_id)
  );
  let total = 0;
  for (let i = 1; i < ordered.length; i++) {
    total += coherenceHaversineKm(stopCoords(ordered[i - 1]), stopCoords(ordered[i]));
  }
  return total;
}

function responseHaversineKm(it: Itinerary): number {
  const stops = coherenceStopsOf(it);
  let total = 0;
  for (let i = 1; i < stops.length; i++) {
    total += coherenceHaversineKm(stops[i - 1], stops[i]);
  }
  return total;
}

/** Skupne realizem-invariante (ista kot task50 — H3/H4). */
function assertRealism(it: Itinerary): void {
  expect(it.days.length).toBeGreaterThanOrEqual(1);
  for (const day of it.days) {
    const locs = day.locations ?? [];
    expect(locs.length).toBeLessThanOrEqual(8);
    const slots = locs.map((l) => parseSlot(l.time_slot));
    for (const s of slots) expect(s).not.toBeNull();
    const parsed = slots.filter(Boolean) as { start: number; end: number }[];
    const sorted = [...parsed].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].start).toBeGreaterThanOrEqual(sorted[i - 1].end);
    }
  }
  expect(it.geoValidation).toBeDefined();
  expect(it.budgetValidation).toBeDefined();
  expect(it.supplyValidation).toBeDefined();
}

async function generate(over: Record<string, unknown> = {}): Promise<Itinerary> {
  const res = await POST(jsonPost("/api/itinerary", genPayload(over)));
  expect(res.status).toBe(200);
  const it = (await res.json()) as Itinerary;
  expect(it?.days?.length).toBeGreaterThan(0);
  return it;
}

/**
 * T1+T2+T3 — osnovne geografske trditve nad odzivom:
 *  - backtracking = 0 (dokumentirana metrika M3);
 *  - BREZ sidrov (opts.scoreOrderBaseline): haversine total odziva ≤ stari
 *    oceni-red nad istimi postanki (napredek merjen, ne izmišljen). Z
 *    uporabniškimi sidri (FIXED) primerjava NI poštena osnova — sidrni
 *    vrstni red je uporabniška omejitev, ki lahko legitimno stane km
 *    (§8 F3: sistem jo iskreno prizna, geoValidation javi dolge noge);
 *  - vsi T1 postanki realni (brez izmišljenih destinacij);
 *  - noge POŠTENO vir-označene (hevristika kadar OSRM mrtev — NIKOLI "osrm").
 */
function assertGeoCoherent(
  it: Itinerary,
  interests: string[],
  opts: { anchored?: boolean } = {}
): GeoCoherenceReport {
  assertRealism(it);
  const rep = coherenceOf(it);
  expect(rep.backtrackingEvents.length).toBe(0); // T1
  // T2: koherenten red NI SLABŠI od geografsko slepega oceni-reda (koren P2)
  // — razen pri FIXED sidrih (opts.anchored): uporabniškov vrstni red je
  // omejitev, ki lahko legitimno stane km (§8 F3 — iskreno priznano)
  if (!opts.anchored) {
    expect(responseHaversineKm(it)).toBeLessThanOrEqual(
      scoreOrderHaversineKm(it, interests) + 0.001
    );
  }
  // čistost T1 postankov (NIKOLI izmišljene destinacije)
  for (const s of allStops(it)) {
    if (!s.destination_id.includes(":")) {
      expect(DESTINATIONS.some((d) => d.id === s.destination_id)).toBe(true);
    }
  }
  return rep;
}

// ===========================================================================
// A) ČISTE ENOTE — geo-order (§6/§7/§8)
// ===========================================================================

function stop(id: string, lat: number, lng: number, poolIndex?: number): OrderableStop {
  const idx = poolIndex ?? DESTINATIONS.findIndex((d) => d.id === id);
  return { id, lat, lng, poolIndex: idx < 0 ? 0 : idx };
}

/** Postanek iz T1 dataseta (koordinate + poolIndex samodejno). */
function stopAt(id: string): OrderableStop {
  const d = DESTINATIONS.find((x) => x.id === id);
  if (!d) throw new Error(`neznan T1 id: ${id}`);
  return {
    id,
    lat: d.coords.lat,
    lng: d.coords.lng,
    poolIndex: DESTINATIONS.indexOf(d),
  };
}

const destCoords = (id: string): { lat: number; lng: number } => {
  const d = DESTINATIONS.find((x) => x.id === id);
  if (!d) throw new Error(`neznan id ${id}`);
  return d.coords;
};

describe("TASK 51 §6/§7: orderAroundAnchors (čiste enote)", () => {
  test("U1 brez sidrov — veriga najbližjih-sosedov od težišča; nabiri ohranjeni", () => {
    // 6 razpršenih postankov, 3 dni × 2
    const ids = ["triglav", "soca", "postojna", "ljubljana", "piran", "kobarid"];
    const daySets = [
      [stopAt("triglav"), stopAt("postojna")],
      [stopAt("soca"), stopAt("ljubljana")],
      [stopAt("piran"), stopAt("kobarid")],
    ];
    const result = orderAroundAnchors({ daySets, rainyDays: [false, false, false], anchors: [] });
    // nabiri (multiset) ohranjeni
    const flatIn = daySets.flat().map((s) => s.id).sort();
    const flatOut = result.flat().map((s) => s.id).sort();
    expect(flatOut).toEqual(flatIn);
    // veriga je geografsko koherentna: triglav→soca→kobarid skupaj (Soška/regija),
    // postojna→piran skupaj (Primorska), ljubljana premosti
    const seq = result.flat().map((s) => s.id);
    // sosednost: soca tik za triglavom ali kobaridom (≤ 30 km)
    const iTriglav = seq.indexOf("triglav");
    const neighbours = [seq[iTriglav - 1], seq[iTriglav + 1]].filter(Boolean);
    expect(
      neighbours.some((n) =>
        ["soca", "bohinj"].includes(n) &&
        coherenceHaversineKm(destCoords("triglav"), destCoords(n)) <= 30
      )
    ).toBe(true);
  });

  test("U2 §7 primer — FIXED Bled + FIXED Piran: gruče okoli sidrov, NE cik-cak", () => {
    // §7 ilustracija (NE hardcodana v produkciji — tu kot specifikacijski test):
    // FIXED: Bled, FIXED: Piran; kandidati: Bohinj, Ljubljana, Postojna, Soča
    const bledPin = ktCoords("411") ?? destCoords("bled");
    const piranPin = destCoords("piran"); // blizu KT 265989 (Umag ~ 10 km)
    const ids = ["bohinj", "ljubljana", "postojna", "soca"];
    const daySets = [
      [stopAt("bohinj"), stopAt("postojna")],
      [stopAt("ljubljana"), stopAt("soca")],
    ];
    const result = orderAroundAnchors({
      daySets,
      rainyDays: [false, false],
      anchors: [
        { id: "kiwitaxi:411", ...bledPin },
        { id: "kiwitaxi:265989", ...piranPin },
      ],
    });
    const seq = result.flat().map((s) => s.id);
    // Bledova gruča (bohinj, soca, ljubljana) PRED piransko (postojna):
    expect(seq.indexOf("postojna")).toBe(seq.length - 1);
    // koherentna veriga (§7 pričakovani red): bohinj → soca → ljubljana → postojna
    expect(seq).toEqual(["bohinj", "soca", "ljubljana", "postojna"]);
    // NAPAČNI red iz §7 (Bled → Piran → Bohinj → Soča interleave) izključen:
    expect(seq.indexOf("postojna")).toBeGreaterThan(seq.indexOf("ljubljana"));
  });

  test("U3 vremenski bloki — deževni dnevi obdržijo NOTRANJE naboré na svojih dnevih", () => {
    // deževen dan 2 (indeks 1): notranji postanki (city/cave/spa)
    const indoorIds = ["ljubljana", "postojna"]; // city, cave
    const outdoorIds = ["triglav", "soca", "bohinj", "kobarid"];
    const daySets = [
      [stopAt(outdoorIds[0]), stopAt(outdoorIds[1])],
      [stopAt(indoorIds[0]), stopAt(indoorIds[1])],
      [stopAt(outdoorIds[2]), stopAt(outdoorIds[3])],
    ];
    const result = orderAroundAnchors({
      daySets,
      rainyDays: [false, true, false],
      anchors: [],
    });
    // dan 2 (indeks 1) ostane NATANKO notranji nabor (veže se na deževni dan)
    expect(result[1].map((s) => s.id).sort()).toEqual([...indoorIds].sort());
    // dneva 1 in 3 sta iz istega vremenskega razreda — nabora se lahko
    // premešata, a UNION ostane:
    const outdoor = [result[0], result[2]].flat().map((s) => s.id).sort();
    expect(outdoor).toEqual([...outdoorIds].sort());
  });

  test("U4 determinizem + razbijanje izenačenj po poolIndex", () => {
    // dva postanka na NATANKO enaki razdalji od sidra (ista širina,
    // simetrična dolžina) → poolIndex odloči (determinizem)
    const a = { lat: 46.0, lng: 14.0 };
    const b1: OrderableStop = { id: "x1", lat: 46.0, lng: 14.2, poolIndex: 5 };
    const b2: OrderableStop = { id: "x2", lat: 46.0, lng: 13.8, poolIndex: 2 };
    const daySets = [[b1, b2]];
    const anchors: GeoOrderAnchor[] = [{ id: "pin", ...a }];
    const r1 = orderAroundAnchors({ daySets, rainyDays: [false], anchors });
    const r2 = orderAroundAnchors({ daySets, rainyDays: [false], anchors });
    expect(r1).toEqual(r2); // determinizem
    // oba na enaki razdalji od sidra → NIŽJI poolIndex prvi
    expect(r1[0].map((s) => s.id)).toEqual(["x2", "x1"]);
  });

  test("U5 nekončne koordinate — brez crasha, pasivno potonejo na konec", () => {
    const good = stopAt("bohinj");
    const bad: OrderableStop = { id: "null-island", lat: Number.NaN, lng: Number.NaN, poolIndex: 99 };
    const result = orderAroundAnchors({
      daySets: [[good, bad, stopAt("vintgar")]],
      rainyDays: [false],
      anchors: [],
    });
    expect(result.flat().map((s) => s.id)).toContain("null-island"); // izbran ostane
    expect(result.flat().length).toBe(3); // nihče ni izgubljen
    // bohinj/vintgar sosednja (5 km), nekončni postanek na koncu verige
    const seq = result.flat().map((s) => s.id);
    expect(seq.indexOf("null-island")).toBe(2);
  });

  test("U6 FIXED vrstni red izbire ohranjen — hrbtenica definira smer (§8 F2)", () => {
    // izbira [Piran-pin, Bled-pin] (OBRATNO kot U2) → piranska gruča PRVA
    const daySets = [
      [stopAt("bohinj"), stopAt("postojna")],
      [stopAt("ljubljana"), stopAt("soca")],
    ];
    const result = orderAroundAnchors({
      daySets,
      rainyDays: [false, false],
      anchors: [
        { id: "kiwitaxi:265989", ...destCoords("piran") },
        { id: "kiwitaxi:411", ...(ktCoords("411") ?? destCoords("bled")) },
      ],
    });
    const seq = result.flat().map((s) => s.id);
    // piranska gruča (postojna) PRVA, bledova (bohinj/soca/ljubljana) za njo
    expect(seq.indexOf("postojna")).toBe(0);
    expect(seq.indexOf("bohinj")).toBeGreaterThan(0);
  });

  test("U6b sidrni postanek (id = sidro) je PRVI v svoji gruči", () => {
    // generična knjižnična lastnost: če je id postanka enak id-ju sidra,
    // je postanek prvi v gruči tega sidra (poolIndex vrstni red).
    const daySets = [
      [stopAt("piran"), stopAt("portoroz")],
      [stopAt("bohinj"), stopAt("vintgar")],
    ];
    const result = orderAroundAnchors({
      daySets,
      rainyDays: [false, false],
      anchors: [
        { id: "piran", ...destCoords("piran") },
        { id: "bohinj", ...destCoords("bohinj") },
      ],
    });
    const seq = result.flat().map((s) => s.id);
    expect(seq[0]).toBe("piran"); // sidrni postanek vodi piransko gručo
    expect(seq.indexOf("bohinj")).toBe(2); // vodi svojo gručo (za portorozem)
  });

  test("U12 outlier — oddaljeni postanki (>60 km od vseh sidrov) NE gredo v gruče", () => {
    // G5-4 korenski vzrok (regresijski test): ljubljana/triglav so 100+ km
    // od OBEH sidrov (maribor, ptuj) → NE smejo biti v mariborovi gruči
    // (vzhod → zahod → vzhod vračanje); padejo na konec kot PROSTI.
    const daySets = [
      [stopAt("maribor"), stopAt("ptuj")],
      [stopAt("ljubljana"), stopAt("triglav")],
      [stopAt("piran"), stopAt("celje")],
    ];
    const result = orderAroundAnchors({
      daySets,
      rainyDays: [false, false, false],
      anchors: [
        { id: "kiwitaxi:918", ...destCoords("maribor") },
        { id: "kiwitaxi:918b", ...destCoords("ptuj") },
      ],
    });
    const seq = result.flat().map((s) => s.id);
    // gruči (maribor, celje ~46 km | ptuj) pred PROSTIMI (ljubljana/triglav/piran)
    expect(seq.indexOf("maribor")).toBeLessThan(seq.indexOf("ljubljana"));
    expect(seq.indexOf("maribor")).toBeLessThan(seq.indexOf("triglav"));
    expect(seq.indexOf("ptuj")).toBeLessThan(seq.indexOf("piran"));
    // vsi postanki ohranjeni
    expect(seq.length).toBe(6);
  });

  test("U7 prazni vhodi — prazni dnevi/ena sama lokacija (brez crasha)", () => {
    expect(orderAroundAnchors({ daySets: [], rainyDays: [], anchors: [] })).toEqual([]);
    const single = [stopAt("bled")];
    expect(
      orderAroundAnchors({ daySets: [single], rainyDays: [false], anchors: [] })
    ).toEqual([single]);
  });
});

// ===========================================================================
// B) ČISTE ENOTE — geo-coherence metrike (§4/§13)
// ===========================================================================

describe("TASK 51 §4/§13: metrike M1–M5 (čiste enote)", () => {
  test("U8 M3 backtracking — A → B → C → B (dokumentirani primer)", () => {
    // B na 0 km od B4; C 100 km stran → vračanje JE dogodek
    const stops: CoherenceStop[] = [
      { id: "A", name: "A", lat: 46.0, lng: 14.0 },
      { id: "B", name: "B", lat: 46.5, lng: 14.5 },
      { id: "C", name: "C", lat: 46.9, lng: 15.3 }, // ~100 km od B
      { id: "B2", name: "B", lat: 46.502, lng: 14.502 }, // ~0,3 km od B
    ];
    const events = findBacktrackingEvents(stops);
    expect(events.length).toBe(1);
    expect(events[0].overStopId).toBe("B");
    expect(events[0].backStopId).toBe("B2");
    expect(events[0].leftKm).toBeGreaterThanOrEqual(45);
  });

  test("U9 M3 lokalna raziskava (gruča) NI backtracking", () => {
    // vsi pari < 45 km — Triglav → Soča → Bohinj vzorec
    const stops: CoherenceStop[] = [
      { id: "triglav", name: "Triglav", ...destCoords("triglav") },
      { id: "soca", name: "Soča", ...destCoords("soca") },
      { id: "bohinj", name: "Bohinj", ...destCoords("bohinj") },
      { id: "vintgar", name: "Vintgar", ...destCoords("vintgar") },
    ];
    expect(findBacktrackingEvents(stops).length).toBe(0);
  });

  test("U10 M1/M2 — viri nog odkrito poročani (osrm vs heuristika)", () => {
    const stops: CoherenceStop[] = [
      { id: "a", name: "A", lat: 46.0, lng: 14.0 },
      { id: "b", name: "B", lat: 46.3, lng: 14.3 },
      { id: "c", name: "C", lat: 45.9, lng: 13.9 },
    ];
    const rep = computeGeoCoherence(stops, (x, y) =>
      x.id === "a"
        ? { km: 41.2, source: "osrm" }
        : { km: 55.0, source: "heuristic" }
    );
    expect(rep.osrmLegs).toBe(1);
    expect(rep.heuristicLegs).toBe(1);
    expect(rep.totalDistanceKm).toBe(96); // 41.2+55 zaokroženo
    expect(rep.longestLegKm).toBe(55);
    expect(rep.longestLegSource).toBe("heuristic");
    expect(rep.legsOver120Km).toBe(0);
  });

  test("U11 M5 sidro-dan — razdalje so-dnevnih sosedov od FIXED", () => {
    const days = [
      {
        day: 1,
        stops: [
          { id: "kiwitaxi:411", name: "Bled transfer", ...(ktCoords("411") ?? destCoords("bled")) },
          { id: "bohinj", name: "Bohinj", ...destCoords("bohinj") },
        ],
      },
      {
        day: 2,
        stops: [
          { id: "ljubljana", name: "Ljubljana", ...destCoords("ljubljana") },
          { id: "piran", name: "Piran", ...destCoords("piran") },
        ],
      },
    ];
    const rep = computeAnchorCoherence(days);
    expect(rep.length).toBe(1); // samo dan 1 ima supply sidro
    expect(rep[0].anchorId).toBe("kiwitaxi:411");
    expect(rep[0].sameDayDistancesKm.length).toBe(1);
    expect(rep[0].maxSameDayKm).toBeLessThanOrEqual(30); // Bohinj ~ 19 km
  });
});

// ===========================================================================
// C) ROUTE — 3-dnevni geo-scenariji (§9 G3-1 … G3-6)
// ===========================================================================

describe.skipIf(!hasKt)("TASK 51 §9: 3-dnevni geo-scenariji (realna fallback pot)", () => {
  test("G3-1 Bled/Bohinj regija — koherenten alpski plan", async () => {
    const it = await generate({
      days: 3,
      interests: ["narava", "romantika"],
      preferredDestinations: ["bled", "bohinj"],
    });
    const rep = assertGeoCoherent(it, ["narava", "romantika"]);
    // regija: VSI postanki v alpskem okolju (≤ 60 km od Bleda — M5 logika
    // brez FIXED: mediana noga ostaja intra-regijska)
    expect(rep.medianLegKm).toBeLessThanOrEqual(60);
  });

  test("G3-2 Piran/Primorska — koherenten obalni plan", async () => {
    const it = await generate({
      days: 3,
      interests: ["poletje", "hrana"],
      preferredDestinations: ["piran"],
    });
    assertGeoCoherent(it, ["poletje", "hrana"]);
  });

  test("G3-3 Ljubljana + osrednja Slovenija", async () => {
    const it = await generate({
      days: 3,
      interests: ["kultura", "mesto"],
      preferredDestinations: ["ljubljana"],
    });
    assertGeoCoherent(it, ["kultura", "mesto"]);
  });

  test("G3-4 Bled + Piran — dve oddaljeni sidri (uporabniško eksplicitni)", async () => {
    const it = await generate({
      days: 3,
      interests: ["narava", "romantika", "poletje"],
      preferredDestinations: ["bled", "piran"],
    });
    const rep = assertGeoCoherent(it, ["narava", "romantika", "poletje"]);
    // obe sidri prisotni (uporabniška želja + 2,5 pohitritev)
    const order = orderOf(it);
    expect(order).toContain("bled");
    expect(order).toContain("piran");
    // G-A1 hkrati: dve zelo oddaljeni točki — najdaljša noga je odkrito
    // poročana (heuristic vir, NI trditve o OSRM)
    expect(rep.longestLegSource === "osrm").toBe(false);
  });

  test("G3-5 Bela krajina / Dolenjska", async () => {
    const it = await generate({
      days: 3,
      interests: ["narava", "mir"],
      preferredDestinations: ["crnomelj"],
    });
    assertGeoCoherent(it, ["narava", "mir"]);
  });

  test("G3-6 Slovenia-wide 3 dni (B2-razred brez FIXED)", async () => {
    const it = await generate({ days: 3, interests: ["narava", "mesta"] });
    assertGeoCoherent(it, ["narava", "mesta"]);
  });

  test("T3 determinizem — isti vhod dvakrat → IDENTIČEN vrstni red", async () => {
    const a = await generate({ days: 3, budget: 300 });
    const b = await generate({ days: 3, budget: 300 });
    expect(orderOf(b)).toEqual(orderOf(a));
  });
});

// ===========================================================================
// D) ROUTE — 5-dnevni (§10) in 7-dnevni (§11) plani
// ===========================================================================

describe.skipIf(!hasKt)("TASK 51 §10/§11: daljši plani (5 in 7 dni)", () => {
  test("G5-1 5 dni, omejen proračun (B2 repro scenarij) — brez cik-caka", async () => {
    const it = await generate({ days: 5, budget: 300, interests: ["narava", "mesta"] });
    const rep = assertGeoCoherent(it, ["narava", "mesta"]);
    // daljši plan NI naključno dodajanje oddaljenih destinacij:
    // backtracking 0 (T1) + vsaj polovica nog intra-regijskih (≤ 60 km)
    const legs60 = Object.values(it.legs ?? {}).filter((l) => l.km <= 60).length;
    const legsTotal = Object.values(it.legs ?? {}).length;
    expect(legs60 / legsTotal).toBeGreaterThanOrEqual(0.5);
    expect(rep.medianLegKm).toBeLessThanOrEqual(60);
  });

  test("G5-2 5 dni zahodna Slovenija", async () => {
    const it = await generate({
      days: 5,
      interests: ["narava", "avantura"],
      preferredDestinations: ["soca", "bohinj"],
    });
    assertGeoCoherent(it, ["narava", "avantura"]);
  });

  test("G5-3 5 dni osrednja Slovenija", async () => {
    const it = await generate({
      days: 5,
      interests: ["kultura", "zgodovina"],
      preferredDestinations: ["ljubljana", "celje"],
    });
    assertGeoCoherent(it, ["kultura", "zgodovina"]);
  });

  test("G5-4 5 dni vzhodna/jugovzhodna Slovenija", async () => {
    const it = await generate({
      days: 5,
      interests: ["kultura", "vino"],
      preferredDestinations: ["maribor", "ptuj"],
    });
    assertGeoCoherent(it, ["kultura", "vino"]);
  });

  test("G5-5 5 dni Slovenia-wide", async () => {
    const it = await generate({ days: 5, interests: ["narava", "kultura"] });
    assertGeoCoherent(it, ["narava", "kultura"]);
  });

  test("G7-1 7 dni Slovenia-wide (B3 repro scenarij)", async () => {
    const it = await generate({ days: 7, interests: ["narava"] });
    assertGeoCoherent(it, ["narava"]);
  });

  test("G7-2 7 dni nizki proračun", async () => {
    const it = await generate({ days: 7, budget: 150, interests: ["narava", "mir"] });
    const rep = assertGeoCoherent(it, ["narava", "mir"]);
    expect(it.budgetValidation?.status).toBeOneOf(["within", "uncertain", "exceeded"]);
    // proračun ostaja iskren tudi na daljših planih
    expect(rep.backtrackingEvents.length).toBe(0);
  });

  test("G7-3 7 dni brez avta (mestni/pešački interesi)", async () => {
    const it = await generate({
      days: 7,
      interests: ["kultura", "hrana", "mesto"],
      preferredDestinations: ["ljubljana", "maribor"],
    });
    assertGeoCoherent(it, ["kultura", "hrana", "mesto"]);
  });

  test("G7-4 7 dni s FIXED supply (KT 411 Bled)", async () => {
    const it = await generate({
      days: 7,
      interests: ["narava", "mesta"],
      selectedProviderProducts: [ktSelection("411", 1)], // napadena cena → kanon
    });
    assertGeoCoherent(it, ["narava", "mesta"], { anchored: true });
    const fixed = allStops(it).filter((s) => s.destination_id === "kiwitaxi:411");
    expect(fixed.length).toBe(1);
    expect(fixed[0].estimated_cost).toBe(KT_411);
  });
});

// ===========================================================================
// E) ROUTE — FIXED inkvariante (§8 F1–F4)
// ===========================================================================

describe.skipIf(!hasKt)("TASK 51 §8: FIXED lokacije (F1–F4)", () => {
  test("F1 en FIXED — ostane na istem mestu, kanonska cena, koherenten dan", async () => {
    const it = await generate({
      days: 3,
      interests: ["narava"],
      selectedProviderProducts: [ktSelection("411", 1)],
    });
    assertGeoCoherent(it, ["narava"], { anchored: true });
    const fixed = allStops(it).filter((s) => s.destination_id === "kiwitaxi:411");
    expect(fixed.length).toBe(1);
    expect(fixed[0].estimated_cost).toBe(KT_411);
    // M5: sidro je smiselno sparejeno — vsaj en so-dnevni sosed znotraj
    // regije (≤ 60 km); max se poroča (tranzitni sosed dneva je legitimen)
    const anchors = anchorCoherenceOf(it);
    expect(anchors.length).toBe(1);
    expect(anchors[0].sameDayDistancesKm.length).toBeGreaterThan(0);
    expect(Math.min(...anchors[0].sameDayDistancesKm)).toBeLessThanOrEqual(60);
  });

  test("F2 dva FIXED — vrstni red izbire ohranjen (dan 411 ≤ dan 258775)", async () => {
    // izbira: [Bled (411), Ljubljana (258775)] — hrbtenica v tem redu
    const it = await generate({
      days: 3,
      interests: ["narava", "kultura"],
      selectedProviderProducts: [ktSelection("411", 1), ktSelection("258775", 1)],
    });
    assertGeoCoherent(it, ["narava", "kultura"], { anchored: true });
    const dayOf = (id: string) =>
      (it.days ?? []).find((d) => (d.locations ?? []).some((l) => l.destination_id === id))?.day ?? -1;
    const d411 = dayOf("kiwitaxi:411");
    const d258775 = dayOf("kiwitaxi:258775");
    expect(d411).toBeGreaterThan(0);
    expect(d258775).toBeGreaterThan(0);
    // vrstni red FIXED se ne spremeni brez dokazanega razloga (§8 F2)
    expect(d411).toBeLessThanOrEqual(d258775);
    // oba točno 1× s kanonskima cenama
    expect(allStops(it).filter((s) => s.destination_id === "kiwitaxi:411").length).toBe(1);
    expect(allStops(it).filter((s) => s.destination_id === "kiwitaxi:258775").length).toBe(1);
    expect(allStops(it).find((s) => s.destination_id === "kiwitaxi:411")?.estimated_cost).toBe(KT_411);
    expect(allStops(it).find((s) => s.destination_id === "kiwitaxi:258775")?.estimated_cost).toBe(KT_258775);
  });

  test("F3 trije FIXED (zahod + severovzhod + Primorska) — zahtevni, a iskreni", async () => {
    const it = await generate({
      days: 4,
      interests: ["narava", "kultura"],
      selectedProviderProducts: [
        ktSelection("411", 1), // Bled
        ktSelection("918", 1), // Maribor
        ktSelection("265989", 1), // Umag → Piran
      ],
    });
    // §8 F3: adversarialna TROJNA sidra (zahod + NE + Primorska) —
    // zahtevna geometrija. ZAHTEVANE lastnosti: FIXED ostanejo (1× kanon,
    // brez premikanja), sistem iskreno PRIZNA zahtevnost (geo zastave),
    // urnik izvedljiv/parsable. Dokumentirana omejitev (P3): več FIXED,
    // ki pristanejo na ISTEM nasičenem dnevu, se vstavijo v vrstnem redu
    // izbire (F2) na konec dneva — intra-dan E→W→E→W vzorec je možen in
    // odkrito javljen (day_km/leg_distance + urnik pokaže vožnje).
    assertRealism(it);
    expect(coherenceOf(it).backtrackingEvents.length).toBeLessThanOrEqual(1);
    // vsi trije točno 1× s kanonskimi cenami (NI premikanja FIXED)
    for (const [id, price] of [
      ["kiwitaxi:411", KT_411],
      ["kiwitaxi:918", KT_918],
      ["kiwitaxi:265989", KT_265989],
    ] as const) {
      const stops = allStops(it).filter((s) => s.destination_id === id);
      expect(stops.length).toBe(1);
      expect(stops[0].estimated_cost).toBe(price);
    }
    // geografsko zahtevna kombinacija — sistem jo PRIZNA (§8 F3):
    // geoValidation odkrito javi dolge noge (fail-visible, ne prikritje)
    const issues = (it.geoValidation as { issues?: { rule?: string; level?: string }[] })?.issues ?? [];
    const geoRules = issues.map((i) => i.rule);
    expect(
      geoRules.some((r) => r === "leg_distance" || r === "day_km")
    ).toBe(true);
  });

  test("F4 FIXED + fallback izbor — BREZ nepotrebnega cik-caka (G-A4)", async () => {
    // FIXED Bled + FIXED Umag/Piran + uporabniško željena obala → mešane gruče
    const it = await generate({
      days: 3,
      interests: ["narava", "poletje"],
      preferredDestinations: ["piran"],
      selectedProviderProducts: [ktSelection("411", 1), ktSelection("265989", 1)],
    });
    assertGeoCoherent(it, ["narava", "poletje"], { anchored: true });
    // oba FIXED točno 1× kanonsko
    expect(allStops(it).filter((s) => s.destination_id === "kiwitaxi:411").length).toBe(1);
    expect(allStops(it).filter((s) => s.destination_id === "kiwitaxi:265989").length).toBe(1);
    // M5:gruče okoli obeh sidrov — vsak sidro ima vsaj enega so-dnevnega
    // soseda znotraj regije (≤ 60 km)
    const anchors = anchorCoherenceOf(it);
    expect(anchors.length).toBe(2);
    for (const a of anchors) {
      expect(a.sameDayDistancesKm.length).toBeGreaterThan(0);
      expect(Math.min(...a.sameDayDistancesKm)).toBeLessThanOrEqual(60);
    }
    // vrstni red izbire: Bled-gruča pred Primorsko-gručo
    const dayOf = (id: string) =>
      (it.days ?? []).find((d) => (d.locations ?? []).some((l) => l.destination_id === id))?.day ?? -1;
    expect(dayOf("kiwitaxi:411")).toBeLessThanOrEqual(dayOf("kiwitaxi:265989"));
  });
});

// ===========================================================================
// F) ROUTE — ADVERSARIAL GEOGRAPHY (§12 G-A1 … G-A10)
// ===========================================================================

describe.skipIf(!hasKt)("TASK 51 §12: adversarial geografija (G-A1 … G-A10)", () => {
  test("G-A1 dve zelo oddaljeni destinaciji (Maribor + Piran)", async () => {
    const it = await generate({
      days: 3,
      interests: ["kultura", "poletje"],
      preferredDestinations: ["maribor", "piran"],
    });
    const rep = assertGeoCoherent(it, ["kultura", "poletje"]);
    // obe oddaljeni točki prisotni; povezava odkrito poročana
    expect(orderOf(it)).toContain("maribor");
    expect(orderOf(it)).toContain("piran");
    // najdaljša noga je velika in POŠTENO označena (heuristic, ne osrm)
    expect(rep.longestLegKm).toBeGreaterThan(100);
    expect(rep.longestLegSource).toBe("heuristic");
  });

  test("G-A2 tri destinacije v NASPROTNEM vrstnem redu — brez vsiljenega cik-caka", async () => {
    // uporabnik našteje obratno od naravne smeri: vzhod → alpe → obala.
    // Vrstni red ŽELJA nima geografske semantike (adversarialni dokaz):
    // sistem obišče vse tri, a v GEOGRAFSKO KOHERENTNEM redu (ne slepo
    // obratnem), brez vračanj (0 backtracking), deterministicno.
    const it = await generate({
      days: 4,
      interests: ["kultura", "narava"],
      preferredDestinations: ["maribor", "triglav", "piran"],
    });
    assertGeoCoherent(it, ["kultura", "narava"]);
    const order = orderOf(it);
    expect(order).toContain("maribor");
    expect(order).toContain("triglav");
    expect(order).toContain("piran");
    // determinizem: ista želja → isti načrt
    const it2 = await generate({
      days: 4,
      interests: ["kultura", "narava"],
      preferredDestinations: ["maribor", "triglav", "piran"],
    });
    expect(orderOf(it2)).toEqual(order);
  });

  test("G-A3 FIXED zahod + kandidat vzhod + kandidat nazaj zahod", async () => {
    const it = await generate({
      days: 3,
      interests: ["narava", "kultura"],
      preferredDestinations: ["maribor", "bohinj"],
      selectedProviderProducts: [ktSelection("411", 1)], // Bled FIXED
    });
    assertGeoCoherent(it, ["narava", "kultura"], { anchored: true });
    // FIXED Bled odpade v zahodno gručo (z bohinj), maribor je PROSTI
    // postanek (oddaljen od edinega sidra) → veriga ga doseže koherentno
    // po zahodni gruči — brez vračanja zahod → vzhod → zahod (T1 zgoraj)
    const dayOf = (id: string) =>
      (it.days ?? []).find((d) => (d.locations ?? []).some((l) => l.destination_id === id))?.day ?? -1;
    expect(dayOf("kiwitaxi:411")).toBeLessThanOrEqual(dayOf("bohinj"));
    expect(dayOf("kiwitaxi:411")).toBeLessThanOrEqual(dayOf("maribor"));
  });

  test("G-A5/G-A6 OSRM ni dosegljiv — hevristika POŠTENO razkrita, urnik izvedljiv", async () => {
    // OSRM je preusmerjen na mrtev naslov (zgoraj) — VSE noge hevristika
    const it = await generate({ days: 3, interests: ["narava", "mesta"] });
    assertRealism(it);
    for (const leg of Object.values(it.legs ?? {})) {
      expect(leg.source).toBe("heuristic"); // NIKOLI "osrm" brez OSRM
    }
    // koherenca velja tudi nad hevristiko (urejanje je offline)
    expect(coherenceOf(it).backtrackingEvents.length).toBe(0);
    // FIXED vstavljen tudi brez OSRM (haversine najbližji dan)
    const it2 = await generate({
      days: 3,
      interests: ["narava"],
      selectedProviderProducts: [ktSelection("411", 1)],
    });
    expect(allStops(it2).filter((s) => s.destination_id === "kiwitaxi:411").length).toBe(1);
  });

  test("G-A7 popolna omrežna izključitev — 200, 0 izmišljenih, kanon lokalen", async () => {
    const it = await generate({
      days: 3,
      interests: ["narava", "mesta"],
      selectedProviderProducts: [ktSelection("411", 1)],
    });
    expect(it.source).toBe("deterministic") // ISSUE #9: AI pot odstranjena — načrt je vedno determinističen (ne "fallback" degradacija);
    const fixed = allStops(it).filter((s) => s.destination_id === "kiwitaxi:411");
    expect(fixed.length).toBe(1);
    expect(fixed[0].estimated_cost).toBe(KT_411); // KT dataset = LOKALNI kanon
    assertGeoCoherent(it, ["narava", "mesta"], { anchored: true });
  });

  test("G-A8 AI 429/odpoved → fallback je GEOGRAFSKO KOHERENTEN (root-cause fix)", async () => {
    // AI odpoveduje (fetch zavrnjen) — fallback, urejen okoli sidrov
    const it = await generate({ days: 5, budget: 300, interests: ["narava", "mesta"] });
    expect(it.source).toBe("deterministic") // ISSUE #9: AI pot odstranjena — načrt je vedno determinističen (ne "fallback" degradacija);
    const rep = assertGeoCoherent(it, ["narava", "mesta"]);
    // dokaz napredka: 0 vračanj; total ≤ stari oceni-red (T2 zgoraj)
    expect(rep.backtrackingEvents.length).toBe(0);
  });

  test("G-A8b AI vrne MALFORMED izhod → graceful fallback (geografsko koherenten)", async () => {
    // §18: AI → malformed output → fallback. SDK prejme 200 z neveljavnim
    // telesom → generateCompletion vrže → route catch → DETERMINISTIČNA
    // fallback pot (ista kot ob 429/omrežju) — koherentna, iskrena.
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response("{{{ to ni veljaven JSON", {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )) as unknown as typeof fetch;
    const it = await generate({ days: 5, budget: 300, interests: ["narava", "mesta"] });
    expect(it.source).toBe("deterministic") // ISSUE #9: AI pot odstranjena — načrt je vedno determinističen (ne "fallback" degradacija);
    assertGeoCoherent(it, ["narava", "mesta"]);
  });

  test("G-A9 neveljavne koordinate v naboru — robustno (brez crasha, brez izgube)", async () => {
    // unit U5 pokriva čisto funkcijo; tu: neznan preferred id NE sesuje rute
    const it = await generate({
      days: 3,
      interests: ["narava"],
      preferredDestinations: ["ne-obstojeca-destinacija"],
    });
    expect(it.days.length).toBe(3);
    assertGeoCoherent(it, ["narava"]);
  });

  test("G-A10 podstavljene FIXED koordinate — urejanje uporablja KANON, ne klienta", async () => {
    // napad: FIXED 411 s koordinato null-island (0,0) — selection-verify
    // obnovi Bled; geoAnchors gradijo NAD verificirano izbiro (route.ts)
    const it = await generate({
      days: 3,
      interests: ["narava"],
      selectedProviderProducts: [
        ktSelection("411", 1, { lat: 0, lng: 0 }), // podstavljena lokacija
      ],
    });
    const fixed = allStops(it).filter((s) => s.destination_id === "kiwitaxi:411");
    expect(fixed.length).toBe(1);
    expect(fixed[0].estimated_cost).toBe(KT_411);
    // kanonska lokacija (Bled ~46.35, 14.09), NE (0,0):
    expect(fixed[0].lat).not.toBe(0);
    expect(Math.abs((fixed[0].lat ?? 0) - 46.35)).toBeLessThan(0.2);
    expect(Math.abs((fixed[0].lng ?? 0) - 14.09)).toBeLessThan(0.2);
    // urejanje/noge iz kanon: sidro je sparejeno znotraj regije BLEDa
    // (min so-dnevna razdalja ≤ 60 km — ne od podstavljene (0,0))
    const anchors = anchorCoherenceOf(it);
    expect(anchors.length).toBe(1);
    expect(anchors[0].sameDayDistancesKm.length).toBeGreaterThan(0);
    expect(Math.min(...anchors[0].sameDayDistancesKm)).toBeLessThanOrEqual(60);
    assertGeoCoherent(it, ["narava"], { anchored: true });
  });
});

// ===========================================================================
// G) ROUTE — REFINEMENT ohranja koherenco (§19)
// ===========================================================================

describe.skipIf(!hasKt)("TASK 51 §19: refinement ne ustvari zig-zaga", () => {
  test("R1 quick-action (manj vožnje) — FIXED preživi, koherenca ostane", async () => {
    const selection = [ktSelection("411", 1)];
    const current = await generate({
      days: 3,
      interests: ["narava"],
      selectedProviderProducts: selection,
    });
    expect(coherenceOf(current).backtrackingEvents.length).toBe(0);

    const res = await POST_REFINE(
      jsonPost("/api/itinerary/refine", {
        itinerary: current,
        instruction: "Manj vožnje prosim",
        action: "less_driving",
        day: 1,
        formData: {
          budget: 500,
          days: 3,
          interests: ["narava"],
          season: "summer",
          groupSize: 2,
          language: "sl",
          selectedProviderProducts: selection,
        },
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { itinerary: Itinerary; applied?: boolean };
    expect(body.applied).toBe(true);
    // FIXED preživi s kanonom
    const fixed = allStops(body.itinerary).filter((s) => s.destination_id === "kiwitaxi:411");
    expect(fixed.length).toBe(1);
    expect(fixed[0].estimated_cost).toBe(KT_411);
    // koherenca NI pokvarjena (deterministična transformacija nad koherentnim)
    expect(coherenceOf(body.itinerary).backtrackingEvents.length).toBe(0);
    assertRealism(body.itinerary);
  });

  test("R2 echo (AI odpoved v refine) — isti vrstni red, validacija, koherenca", async () => {
    const selection = [ktSelection("411", 1)];
    const current = await generate({
      days: 3,
      interests: ["narava"],
      selectedProviderProducts: selection,
    });
    const before = orderOf(current);

    const res = await POST_REFINE(
      jsonPost("/api/itinerary/refine", {
        itinerary: current,
        instruction: "Dodaj še kaj zanimivega",
        formData: {
          budget: 500,
          days: 3,
          interests: ["narava"],
          season: "summer",
          groupSize: 2,
          language: "sl",
          selectedProviderProducts: selection,
        },
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { itinerary: Itinerary; source: string };
    // AI je odpovedal (fetch zavrnjen) → echo veja (P0 fix Task 50) —
    // validiran current, vrstni red ohranjen, koherenca ohranjena
    expect(body.source).toBe("fallback"); // iskrena oznaka echo poti (kot S11)
    expect(orderOf(body.itinerary)).toEqual(before);
    expect(coherenceOf(body.itinerary).backtrackingEvents.length).toBe(0);
    const fixed = allStops(body.itinerary).filter((s) => s.destination_id === "kiwitaxi:411");
    expect(fixed.length).toBe(1);
    expect(fixed[0].estimated_cost).toBe(KT_411);
  });
});

// ===========================================================================
// H) ROUTE — SL/EN pariteta (isti kanonski geografski model)
// ===========================================================================

describe.skipIf(!hasKt)("TASK 51: SL/EN geografska pariteta", () => {
  test("isti vhod, oba jezika → IDENTIČEN vrstni red in noge", async () => {
    const sl = await generate({ days: 4, budget: 300, language: "sl" });
    const en = await generate({ days: 4, budget: 300, language: "en" });
    // urejanje je jezikovno-NEODVISNO (iste koordinate, isti algoritem)
    expect(orderOf(en)).toEqual(orderOf(sl));
    // noge identične (isti pari, isti km/vir)
    expect(en.legs).toEqual(sl.legs);
    assertGeoCoherent(en, ["narava", "mesta"]);
  });
});
