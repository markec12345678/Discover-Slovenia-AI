// ============================================================================
// TASK 51 (§15/§16/§21/§22/§25) — ROUTING FAILURE, PIPELINE, GEO DATA
// INTEGRITY, HUMAN-REALISTIC METRICS, NO-N+1.
//
// Dopolnilo k task51-geo-coherence.test.ts (isti commit 1.56.0 — pokriva
// §3–§14: repro, geo-order, metrike M1–M5, matrike G3/G5/G7/F/G-A/R).
// Ta datoteka zapre PREOSTALE vrzeli specifikacije:
//
//   §15 ROUTING FAILURE — simulacija VSEH štirih načinov odpovedi OSRM:
//        network failure | timeout | HTTP 500 | malformed response
//     (a) nivo PRAVEGA pridobivalca (podproces + lokalni TLS strežnik —
//         fixtures/task51-osrm-failure-server.ts; NODE_EXTRA_CA_CERTS se
//         prebere ob zagonu, zato otrok-proces);
//     (b) nivo fetchOsrmLeg/buildLegRouteIndex (injektiran fetchJson —
//         pogodba meje je „URL → parsed JSON ali null": vsi načini se
//         združijo v ENO obnašanje: poštena hevristika, vir OZNAČEN);
//     (c) nivo rute (mrtvi OSRM_BASE_URL — omrežna odpoved, enaka pot
//         kot v task50/task51-geo datotekah: fallback iskren, koherenten).
//     Veriga dokaza: (a) vsak način → null/JSON na ISTI meji; (b) null →
//     hevristika z virom; (c) ruta s hevrističnimi nogami ostane 200,
//     koherentna, urnik izvedljiv. HEVISTIKA NIKOLI "osrm".
//
//   §16 SCHEDULE INTEGRATION — pipeline: izbora → geo urejanje → OSRM
//     noge → sloti (drive-aware) → repair → validacija. Dokaz na odzivu:
//     vrzeli med zaporednima terminoma ≥ vožnji iz NOG (ne izmišljene),
//     0 prekrivanj, 0 schedule_gap/time_slot_invalid (izvedljiv urnik).
//
//   §21 GEO DATA INTEGRITY — null island / manjkajoče / neveljavne /
//     zamenjane / lažne / Infinity koordinate → KANON obnovljen (restore)
//     ali izbira ZAVRŽENA (fake id — fail-closed). NIKOLI tiho sprejeto.
//
//   §22 HUMAN-REALISTIC OUTPUT — tabela merljivih metrik odziva (veljavne
//     koordinate, vir rutanja zabeležen, skupne km, najdaljša noga,
//     backtracking, overlap 0, nemogoči prehodi 0, FIXED premaknjen 0,
//     fake supply 0, fake cena 0). BREZ „AI quality score" — quality
//     struktura je deterministična (routingMethod razkrito).
//
//   §25 PERFORMANCE — brez N+1: točno EN klic na EDINSTVEN par (dedupe),
//     predpomnilnik prepreči ponovne klice, varovalka ustavi nevihto,
//     sočasnost ≤ 4 (vljudnost do javnega OSRM).
//
//   §18 (AI 429/malformed/omrežje → fallback) JE ŽE POKRIT v
//   task51-geo-coherence.test.ts (G-A8, G-A8b) + task50-scenario-automation
//   (S11 echo tamper pri repliciranem 429) — NE podvajamo (§24 pravilo).
//
// DETERMINIZEM: isti vzorec kot ostale TASK 50/51 datoteke — globalThis.fetch
// zavrnjen (AI odpoved → fallback), OSRM_BASE_URL preusmerjen na mrtev
// naslov PRED uvozom (node:https, ECONNREFUSED takojšen), KT dataset
// lokalna datoteka. Bun test poganja datoteke SEKVENČNO v enem procesu
// (dokazano s sono) — stanje modula (cache/varovalka) je med testi varno,
// vsak test pa stanje RESETIRA (resetRoadRoutingState).
// ============================================================================

import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import {
  getKiwitaxiBaseline,
  resetKiwitaxiDataset,
} from "@/lib/supply/providers/kiwitaxi/dataset";
import { DESTINATIONS } from "@/lib/slovenia-data";
import type { Itinerary, LocationVisit } from "@/lib/types";
import { clearProviderRateLimits } from "@/lib/supply/search";
import { legKey, heuristicLeg } from "@/lib/road-routing";
import { computeGeoCoherence, coherenceHaversineKm } from "@/lib/geo-coherence";
import type { CoherenceStop } from "@/lib/geo-coherence";
import type { OsrmJsonFetcher } from "@/lib/road-routing-server";

// OSRM prek node:https — mrtev naslov PRED uvozom (omrežna odpoved, §15c).
process.env.OSRM_BASE_URL = "https://127.0.0.1:9";

const { POST } = await import("@/app/api/itinerary/route");
const {
  buildLegRouteIndex,
  resetRoadRoutingState,
  defaultOsrmJsonFetcher,
} = await import("@/lib/road-routing-server");

// ---------------------------------------------------------------------------
// Kanoniki (dinamično iz produkcijskega baseline-a — brez fixture dvojnikov)
// ---------------------------------------------------------------------------
const BASELINE = getKiwitaxiBaseline();
const hasKt = BASELINE != null;
const KT_411 = BASELINE?.routes.find((r) => r.id === 411)?.minPriceEur ?? 77;
const KT_411_COORDS = (() => {
  const r = BASELINE?.routes.find((x) => x.id === 411);
  return r?.fromLat != null && r?.fromLng != null
    ? { lat: r.fromLat, lng: r.fromLng }
    : { lat: 46.3, lng: 14.1 };
})();

// ---------------------------------------------------------------------------
// Deterministično omrežje: AI/vreme/Overpass odpovedo (fetch zavrnjen)
// ---------------------------------------------------------------------------
const realFetch = globalThis.fetch;
let ipCounter = 0;

beforeEach(() => {
  globalThis.fetch = (() =>
    Promise.reject(
      new Error("task51-rf: omrežje izklopljeno (deterministični test)")
    )) as unknown as typeof fetch;
  resetKiwitaxiDataset();
  resetRoadRoutingState();
  // TASK 76: ta datoteka je glavni viator-žeton puščala (13× prek
  // /api/itinerary → fetchAiSupplyContext → searchSupply(defaultAdapters)).
  clearProviderRateLimits();
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

// ---------------------------------------------------------------------------
// Pomočniki
// ---------------------------------------------------------------------------
function jsonPost(url: string, body: unknown): Request {
  ipCounter += 1;
  return new Request(`http://localhost${url}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-real-ip": `10.51.21.${(ipCounter % 250) + 1}`,
    },
    body: JSON.stringify(body),
  });
}

/** Surovo telo (JSON brez JSON.stringify) — za 1e999 (Infinity) koordinate. */
function rawPost(url: string, body: string): Request {
  ipCounter += 1;
  return new Request(`http://localhost${url}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-real-ip": `10.51.21.${(ipCounter % 250) + 1}`,
    },
    body,
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

/** KT izbira — koordinate so NEZAUPAN klientov vnos (testni koruptiv). */
function ktSel(
  id: string,
  priceEur: number,
  coords?: { lat: number | null; lng: number | null }
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

function coherenceOf(it: Itinerary) {
  return computeGeoCoherence(coherenceStopsOf(it), (a, b) => {
    const leg = (it.legs ?? {})[`${a.id}|${b.id}`];
    return leg ? { km: leg.km, source: leg.source } : null;
  });
}

async function generate(over: Record<string, unknown> = {}): Promise<Itinerary> {
  const res = await POST(jsonPost("/api/itinerary", genPayload(over)));
  expect(res.status).toBe(200);
  const it = (await res.json()) as Itinerary;
  expect(it?.days?.length).toBeGreaterThan(0);
  return it;
}

const destCoords = (id: string): { lat: number; lng: number } => {
  const d = DESTINATIONS.find((x) => x.id === id);
  if (!d) throw new Error(`neznan T1 id ${id}`);
  return d.coords;
};

/** Minimalen itinerer za noge — collectLegPairs bere samo destination_id. */
function miniItin(ids: string[]): Itinerary {
  return {
    trip_title: "test",
    summary: "test",
    days: [
      {
        day: 1,
        weather: { condition: "sončno", temp: 22 },
        locations: ids.map((id) => ({
          destination_id: id,
          destination_name: id,
          time_slot: "09:00-13:00",
          duration: 4,
          estimated_cost: 10,
          notes: "",
        })),
      },
    ],
  } as unknown as Itinerary;
}

/** Šteči klic pridobivalca + vrh sočasnosti (dokaz §25: ≤ 4). */
function countingFetcher(
  inner: (url: string) => Promise<unknown>
): { fn: OsrmJsonFetcher; calls: () => number; peak: () => number } {
  let n = 0;
  let peak = 0;
  let live = 0;
  const fn: OsrmJsonFetcher = async (url) => {
    n += 1;
    live += 1;
    peak = Math.max(peak, live);
    try {
      return await inner(url);
    } finally {
      live -= 1;
    }
  };
  return { fn, calls: () => n, peak: () => peak };
}

/** Veljaven OSRM odgovor (42 km, ~41,67 min — kot fixtures strežnik). */
const osrmOk = () => ({
  code: "Ok",
  routes: [
    {
      distance: 42000,
      duration: 2500,
      geometry: { coordinates: [[14.0, 46.05], [14.1, 46.06]] },
    },
  ],
});

const BOHINJ_POSTOJNA_HAV = coherenceHaversineKm(
  destCoords("bohinj"),
  destCoords("postojna")
);

// ===========================================================================
// §15 — ROUTING FAILURE MATRIX
// ===========================================================================

describe("TASK 51 §15: OSRM odpovedi — nivo nog (injektiran pridobivalec, PRAVA logika fetchOsrmLeg/buildLegRouteIndex)", () => {
  // Vsi načini odpovedi se na meji OsrmJsonFetcher združijo v „null ali
  // slab JSON" — nad njo je ENO obnašanje: poštena hevristika, vir
  // OZNAČEN. Vsak test = en način (dokaz matrike, ne naključnega testka).
  const failureModes: { name: string; fetchJson: OsrmJsonFetcher }[] = [
    {
      name: "network failure (pridobivalec vrže)",
      fetchJson: () => Promise.reject(new Error("ECONNRESET")),
    },
    {
      name: "timeout (pridobivalec odgovori null — pogodba meje)",
      fetchJson: () => Promise.resolve(null),
    },
    {
      name: "HTTP 500 (pridobivalec preslika status → null)",
      fetchJson: () => Promise.resolve(null),
    },
    {
      name: "malformed body (neveljaven JSON → null)",
      fetchJson: () => Promise.resolve(null),
    },
    {
      name: "OSRM code:NoRoute (200, a poti ni)",
      fetchJson: () => Promise.resolve({ code: "NoRoute", routes: [] }),
    },
    {
      name: "OSRM code:Ok, a routes manjka",
      fetchJson: () => Promise.resolve({ code: "Ok" }),
    },
    {
      name: "OSRM distance NaN (ne-število)",
      fetchJson: () =>
        Promise.resolve({
          code: "Ok",
          routes: [{ distance: Number.NaN, duration: 2500 }],
        }),
    },
    {
      name: "OSRM distance Infinity (1e400 razred)",
      fetchJson: () =>
        Promise.resolve({
          code: "Ok",
          routes: [{ distance: Number.POSITIVE_INFINITY, duration: 2500 }],
        }),
    },
    {
      name: "OSRM negativna razdalja (nemogoča)",
      fetchJson: () =>
        Promise.resolve({
          code: "Ok",
          routes: [{ distance: -42000, duration: 2500 }],
        }),
    },
    {
      name: 'OSRM distance kot niz "42000"',
      fetchJson: () =>
        Promise.resolve({
          code: "Ok",
          routes: [{ distance: "42000", duration: 2500 }],
        }),
    },
  ];

  for (const mode of failureModes) {
    test(`RF ${mode.name} → noga je POŠTENA hevristika (vir "heuristic", km > ravna črta)`, async () => {
      const idx = await buildLegRouteIndex(miniItin(["bohinj", "postojna"]), {
        fetchJson: mode.fetchJson,
      });
      const leg = idx.get(legKey("bohinj", "postojna"));
      expect(leg).not.toBeNull();
      expect(leg!.source).toBe("heuristic"); // NIKOLI "osrm" ob odpovedi
      expect(leg!.km).toBeGreaterThan(BOHINJ_POSTOJNA_HAV); // ×1,3 faktor — jasno drugačno od ravne črte (§5)
      expect(leg!.min).toBeGreaterThan(0);
      // enaka vrednost kot čista funkcija hevristike (en sam vir resnice)
      const pure = heuristicLeg(destCoords("bohinj"), destCoords("postojna"));
      expect(leg!.km).toBe(pure.km);
      expect(leg!.min).toBe(pure.min);
    });
  }

  test("RF KONTRAST — veljaven OSRM odgovor → vir \"osrm\", km/min iz odgovora, NIKOLI hevristika", async () => {
    const idx = await buildLegRouteIndex(miniItin(["bohinj", "postojna"]), {
      fetchJson: async () => osrmOk(),
    });
    const leg = idx.get(legKey("bohinj", "postojna"));
    expect(leg).not.toBeNull();
    expect(leg!.source).toBe("osrm");
    expect(leg!.km).toBe(40); // round5(42) — zaokroženo na 5 (brez lažne natančnosti)
    expect(leg!.min).toBe(40); // round5(2500/60 = 41,67)
    // geometrija preslikana [lng,lat] → [lat,lng]
    expect(leg!.geometry?.[0]).toEqual([46.05, 14.0]);
    // §15 "heuristic se jasno razlikuje od verified routing": obe vrednosti
    // obstajata in sta MERLJIVO drugačni (42 ≠ ~62 km hevristike)
    const pure = heuristicLeg(destCoords("bohinj"), destCoords("postojna"));
    expect(Math.abs(leg!.km - pure.km)).toBeGreaterThan(5);
  });

  test("RF mešan indeks — ena noga OSRM, ena odpoved → viri odkrito MEŠANI (ne lažno enotni)", async () => {
    let first = true;
    const idx = await buildLegRouteIndex(
      miniItin(["bohinj", "postojna", "bled"]),
      {
        fetchJson: async () => {
          if (first) {
            first = false;
            return osrmOk();
          }
          return Promise.reject(new Error("fail"));
        },
      }
    );
    const a = idx.get(legKey("bohinj", "postojna"));
    const b = idx.get(legKey("postojna", "bled"));
    expect(a!.source).toBe("osrm");
    expect(b!.source).toBe("heuristic"); // odpoved NI predstavljena kot osrm
  });
});

describe("TASK 51 §15: PRAVI defaultOsrmJsonFetcher — podproces nad lokalnim TLS strežnikom (500/timeout/malformed/omrežje/ok)", () => {
  test("RF10 vsi načini na PRAVI (ne-mockani) plasti pridobivalca", async () => {
    const fixture =
      "src/lib/__tests__/fixtures/task51-osrm-failure-server.ts";
    const cert =
      "src/lib/__tests__/fixtures/task51-osrm-test-cert.pem";
    const proc = Bun.spawn(["bun", "run", fixture], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_EXTRA_CA_CERTS: cert },
      stdout: "pipe",
      stderr: "pipe",
    });
    const out = await new Response(proc.stdout).text();
    const code = await proc.exited;
    expect(code).toBe(0);
    const line = out.trim().split("\n").pop() ?? "";
    const report = JSON.parse(line) as {
      cert: string;
      totalMs: number;
      outcomes: { mode: string; result: unknown }[];
    };

    if (report.cert === "missing-openssl") {
      // openssl ni na voljo v okolju — pošteno preskoči (peskovnik ga ima)
      console.warn("[task51-rf] openssl manjka — RF10 preskočen");
      return;
    }
    expect(report.cert).toBe("ok");
    // odpovednik NE sme obesiti testa (vsak klic časovno ograničen)
    expect(report.totalMs).toBeLessThan(10000);

    const byMode = new Map(report.outcomes.map((o) => [o.mode, o.result]));
    // PRAVA plast: HTTP 500 → null (statusCode veja)
    expect(byMode.get("http-500")).toBeNull();
    // PRAVA plast: malformed body → null (JSON.parse catch veja)
    expect(byMode.get("malformed-body")).toBeNull();
    // PRAVA plast: timeout (strežnik ne odgovarja) → null (destroy veja)
    expect(byMode.get("timeout-hang")).toBeNull();
    // PRAVA plast: mrtva vrata → null (omrežna napaka)
    expect(byMode.get("network-dead-port")).toBeNull();
    // veljaven odgovor → parsed JSON (nad plastjo ga fetchOsrmLeg sprejme)
    const okJson = byMode.get("ok-json") as { code: string } | null;
    expect(okJson?.code).toBe("Ok");
    // NoRoute je veljaven JSON — zavrne ga šele fetchOsrmLeg (plast NAD)
    const notRoute = byMode.get("json-notroute") as { code: string } | null;
    expect(notRoute?.code).toBe("NoRoute");
  });

  test("RF10b enaka pogodba — defaultOsrmJsonFetcher je izvožen kot PRODUKCIJSKA funkcija (ne dvojnik)", async () => {
    // mrtva vrata: PRAVA funkcija, ki jo uporablja ruta (isti identiteti)
    expect(typeof defaultOsrmJsonFetcher).toBe("function");
    // klic na mrtev naslov → null (nikoli throw, nikoli lažni JSON)
    const out = await defaultOsrmJsonFetcher(
      "https://127.0.0.1:9/route/v1/driving/14.0,46.0;14.1,46.1",
      1500
    );
    expect(out).toBeNull();
  });
});

// ===========================================================================
// §16 — SCHEDULE INTEGRATION (pipeline: izbora → geo red → noge → sloti →
// repair → validacija → budget/geo → končni načrt)
// ===========================================================================

describe.skipIf(!hasKt)("TASK 51 §16: pipeline integracija nad odzivom (mrtvi OSRM — hevristika pošteno)", () => {
  test("P1 5-dnevni fallback: vrzeli ≥ vožnjam iz nog, 0 prekrivanj, 0 schedule_gap/time_slot_invalid, koherenca, viri odkriti", async () => {
    const it = await generate({
      days: 5,
      budget: 300,
      interests: ["narava", "mesta"],
      selectedProviderProducts: [ktSel("411", 77)],
    });
    expect(it.source).toBe("deterministic") // ISSUE #9: AI pot odstranjena — vedno deterministično;

    // (1) GEO UREJANJE — koherenca tudi pod hevristiko (offline urejanje)
    const rep = coherenceOf(it);
    expect(rep.backtrackingEvents.length).toBe(0);
    expect(rep.totalDistanceKm).toBeGreaterThan(0);

    // (2) OSRM NOGE (tukaj: odpoved) — vir POŠTENO zabeležen na vsaki nogi
    const legs = it.legs ?? {};
    expect(Object.keys(legs).length).toBeGreaterThan(0);
    for (const leg of Object.values(legs)) {
      expect(leg.source).toBe("heuristic"); // mrtvi OSRM → NIKOLI "osrm"
      expect(leg.km).toBeGreaterThan(0);
    }

    // (3) SCHEDULE SLOTI + (4) REPAIR — urnik izvedljiv iz NOG:
    //     vrzel med zaporednima terminoma ≥ vožnji noge (ne izmišljene 0)
    for (const day of it.days) {
      const locs = day.locations ?? [];
      const parsed = locs.map((l) => parseSlot(l.time_slot));
      for (const s of parsed) expect(s).not.toBeNull();
      const ps = parsed as { start: number; end: number }[];
      for (let i = 1; i < ps.length; i++) {
        // 0 prekrivanj (§27 schedule overlap = 0)
        expect(ps[i].start).toBeGreaterThanOrEqual(ps[i - 1].end);
        const leg = legs[`${locs[i - 1].destination_id}|${locs[i].destination_id}`];
        const gap = ps[i].start - ps[i - 1].end;
        if (leg) {
          // vrzel pokriva REALNO oceno vožnje (+ rezerva) — urnik ne
          // izmišljuje hitrejše vožnje, ker je OSRM odpovedal (§15:
          // "schedule ne uporablja fake travel time")
          expect(gap).toBeGreaterThanOrEqual(leg.min - 1);
        } else {
          // pari brez noge (supply postanki): repair vsaj poravna buffer
          expect(gap).toBeGreaterThanOrEqual(25);
        }
      }
    }

    // (5) ČASOVNA VALIDACIJA — 0 schedule_gap, 0 time_slot_invalid
    //     (nemogoči prehod = 0; §22/§27)
    const issues = it.geoValidation?.issues ?? [];
    expect(issues.filter((x) => x.rule === "schedule_gap")).toHaveLength(0);
    expect(issues.filter((x) => x.rule === "time_slot_invalid")).toHaveLength(0);
    expect(issues.filter((x) => x.rule === "duration_invalid")).toHaveLength(0);
    // razkritje metode (uporabnik NE vidi hevristike kot verified — §15)
    expect(it.geoValidation?.method).toBe("heuristic");
    expect(it.quality?.routingMethod).toBe("heuristic");

    // (6) BUDGET/GEO VALIDACIJA — obe plasti prisotni
    expect(it.budgetValidation).toBeDefined();
    expect(it.supplyValidation).toBeDefined();
    // FIXED: točno 1× s kanonsko ceno (izbira → verify → insert)
    const fixed = allStops(it).filter(
      (s) => s.destination_id === "kiwitaxi:411"
    );
    expect(fixed).toHaveLength(1);
    expect(fixed[0].estimated_cost).toBe(KT_411);
  });
});

// ===========================================================================
// §21 — GEO DATA INTEGRITY (baterija koruptivov koordinat)
// ===========================================================================

describe.skipIf(!hasKt)("TASK 51 §21: geo data integrity — koruptiv koordinat → KANON obnovljen (nikoli tiho sprejeto)", () => {
  const corruptions: {
    name: string;
    lat: number | null;
    lng: number | null;
  }[] = [
    { name: "null island (0,0)", lat: 0, lng: 0 },
    { name: "lat manjka (null)", lat: null, lng: 14.1 },
    { name: "lng manjka (null)", lat: 46.3, lng: null },
    { name: "neveljaven lat 999", lat: 999, lng: 14.1 },
    { name: "neveljaven lng -999", lat: 46.3, lng: -999 },
    { name: "zamenjana lat/lng", lat: 14.0944, lng: 46.3683 },
    { name: "lažna koordinata (Mongolija)", lat: 46.8, lng: 103.8 },
    { name: "obe manjkajoči", lat: null, lng: null },
  ];

  for (const c of corruptions) {
    test(`GI "${c.name}" → restore na kanon Bleda (KT 411)`, async () => {
      const it = await generate({
        days: 3,
        interests: ["narava"],
        selectedProviderProducts: [
          ktSel("411", 77, { lat: c.lat, lng: c.lng }),
        ],
      });
      const fixed = allStops(it).filter(
        (s) => s.destination_id === "kiwitaxi:411"
      );
      expect(fixed).toHaveLength(1); // izbira preživi (restored, ne zavrnjena)
      expect(fixed[0].estimated_cost).toBe(KT_411);
      // KANONSKA lokacija iz dataseta — NE klientova koruptiv
      expect(Math.abs((fixed[0].lat ?? 0) - KT_411_COORDS.lat)).toBeLessThan(0.01);
      expect(Math.abs((fixed[0].lng ?? 0) - KT_411_COORDS.lng)).toBeLessThan(0.01);
    });
  }

  test("GI Infinity koordinati (1e999 prek surovega JSON) → restore na kanon", async () => {
    // JSON nima NaN/Infinity — 1e999 se parsira v Infinity; sanitize plast
    // (Number.isFinite) ju odbije → verify obnovi KANON.
    const sel =
      `{"provider":"kiwitaxi","providerProductId":"411","type":"transfer",` +
      `"title":"Transfer (klientova trditev)","lat":1e999,"lng":1e999,` +
      `"price":{"amount":77,"currency":"EUR","unit":"per_transfer"},` +
      `"source":"supply-map","selectionState":"fixed"}`;
    const body =
      `{"budget":500,"days":3,"interests":["narava"],"season":"summer",` +
      `"groupSize":2,"language":"sl","selectedProviderProducts":[${sel}]}`;
    const res = await POST(rawPost("/api/itinerary", body));
    expect(res.status).toBe(200);
    const it = (await res.json()) as Itinerary;
    const fixed = allStops(it).filter(
      (s) => s.destination_id === "kiwitaxi:411"
    );
    expect(fixed).toHaveLength(1);
    expect(fixed[0].estimated_cost).toBe(KT_411);
    expect(Math.abs((fixed[0].lat ?? 0) - KT_411_COORDS.lat)).toBeLessThan(0.01);
    expect(Math.abs((fixed[0].lng ?? 0) - KT_411_COORDS.lng)).toBeLessThan(0.01);
  });

  test("GI fake id (ni v inventarju) → izbira ZAVRŽENA (fail-closed, ne 0 €) + zavrnitev JE zabeležena (ne tiho)", async () => {
    // zajem strežniških dnevnikov — zavrnitev izbire mora biti opažena
    // (verify vrstica je console.warn — glej route.ts)
    const logs: string[] = [];
    const realLog = console.log;
    const realWarn = console.warn;
    const capture = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };
    console.log = capture;
    console.warn = capture;
    try {
      const it = await generate({
        days: 3,
        interests: ["narava"],
        selectedProviderProducts: [ktSel("987654", 1)],
      });
      expect(it.days.length).toBe(3); // načrt živi dalje
      // fabrikantrt ref NE obstaja v izhodu (in ne kot €1 postanek)
      expect(
        allStops(it).filter((s) => s.destination_id === "kiwitaxi:987654")
      ).toHaveLength(0);
      // zavrnitev je opažena v observability (§21: nikoli tiho sprejeto)
      expect(
        logs.some((l) => l.includes("TASK 49 supply verify (izbira)") && /1 zavrnjen/.test(l))
      ).toBe(true);
      // v načrt NI prišla nobena supply noga → nič za validirat/zavrnit
      expect(it.supplyValidation?.supplyStops ?? 0).toBe(0);
    } finally {
      console.log = realLog;
      console.warn = realWarn;
    }
  });

  test("GI T1 postanki odziva — VSE koordinate veljavne in znotraj Slovenije", async () => {
    const it = await generate({ days: 5, budget: 300, interests: ["narava", "mesta"] });
    const t1Stops = allStops(it).filter(
      (s) => !s.destination_id.includes(":")
    );
    expect(t1Stops.length).toBeGreaterThan(0);
    for (const s of t1Stops) {
      const c = stopCoords(s);
      expect(Number.isFinite(c.lat)).toBe(true);
      expect(Number.isFinite(c.lng)).toBe(true);
      // bbox Slovenije (ne izmišljene točke na drugi strani planeta)
      expect(c.lat).toBeGreaterThanOrEqual(45.2);
      expect(c.lat).toBeLessThanOrEqual(47.0);
      expect(c.lng).toBeGreaterThanOrEqual(13.3);
      expect(c.lng).toBeLessThanOrEqual(16.8);
    }
  });
});

// ===========================================================================
// §22 — HUMAN-REALISTIC OUTPUT (tabela merljivih metrik; brez AI score)
// ===========================================================================

describe.skipIf(!hasKt)("TASK 51 §22: human-realistic metrike odziva (samo preverljive vrednosti)", () => {
  test("H1 tabela §22 nad 5-dnevnim fallback odzivom", async () => {
    const it = await generate({
      days: 5,
      budget: 300,
      interests: ["narava", "mesta"],
      selectedProviderProducts: [ktSel("411", 77)],
    });
    const rep = coherenceOf(it);
    const legs = it.legs ?? {};

    // valid coordinates: YES (T1 v bboxu, supply na kanonu)
    for (const s of allStops(it)) {
      const c = stopCoords(s);
      expect(Number.isFinite(c.lat) && Number.isFinite(c.lng)).toBe(true);
    }
    // OSRM route available: recorded (vir vsake noge zabeležen)
    expect(Object.keys(legs).length).toBeGreaterThan(0);
    for (const leg of Object.values(legs)) {
      expect(leg.source === "osrm" || leg.source === "heuristic").toBe(true);
    }
    // total travel distance: recorded
    expect(rep.totalDistanceKm).toBeGreaterThan(0);
    // longest leg: recorded (≡ max noga, ± zaokrožitev)
    const maxKm = Math.max(...Object.values(legs).map((l) => l.km));
    expect(Math.abs(rep.longestLegKm - maxKm)).toBeLessThanOrEqual(1);
    expect(rep.longestLegSource).toBe("heuristic");
    expect(rep.longestLegPair).toContain("→");
    // backtracking detected: recorded (0 dogodkov)
    expect(Array.isArray(rep.backtrackingEvents)).toBe(true);
    expect(rep.backtrackingEvents).toHaveLength(0);
    // schedule overlap: 0
    for (const day of it.days) {
      const ps = (day.locations ?? [])
        .map((l) => parseSlot(l.time_slot))
        .filter(Boolean) as { start: number; end: number }[];
      const sorted = [...ps].sort((a, b) => a.start - b.start);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].start).toBeGreaterThanOrEqual(sorted[i - 1].end);
      }
    }
    // impossible transition: 0 (invalid termini/trajanja)
    const issues = it.geoValidation?.issues ?? [];
    expect(issues.filter((x) => x.rule === "time_slot_invalid")).toHaveLength(0);
    expect(issues.filter((x) => x.rule === "schedule_gap")).toHaveLength(0);
    // FIXED moved: 0 (kanonska lokacija nespremenjena)
    const fixed = allStops(it).filter(
      (s) => s.destination_id === "kiwitaxi:411"
    );
    expect(fixed).toHaveLength(1);
    expect(Math.abs((fixed[0].lat ?? 0) - KT_411_COORDS.lat)).toBeLessThan(0.01);
    expect(Math.abs((fixed[0].lng ?? 0) - KT_411_COORDS.lng)).toBeLessThan(0.01);
    // fake supply: 0 (vsaka supply noga validirana, ni zavrnjenih)
    expect(it.supplyValidation?.rejected ?? 0).toBe(0);
    expect(it.supplyValidation?.validated ?? 0).toBe(
      it.supplyValidation?.supplyStops ?? 0
    );
    // fake price: 0 (FIXED cena = kanon; T1 cene iz dataseta × skupina)
    expect(fixed[0].estimated_cost).toBe(KT_411);
    const t1Stops = allStops(it).filter(
      (s) => !s.destination_id.includes(":")
    );
    for (const s of t1Stops) {
      const d = DESTINATIONS.find((x) => x.id === s.destination_id);
      expect(d).toBeDefined();
      expect(s.estimated_cost).toBe((d!.costPerPerson ?? 0) * 2);
    }
    // BREZ „AI quality score": quality je determinističen (routingMethod
    // razkrito; drivingMinutes iz nog; natureScore iz realnih tipov)
    expect(it.quality?.routingMethod).toBe("heuristic");
    expect(Number.isFinite(it.quality?.drivingMinutes ?? NaN)).toBe(true);
    expect([1, 2, 3, 4, 5]).toContain(it.quality?.natureScore ?? 0);
  });
});

// ===========================================================================
// §25 — PERFORMANCE: brez N+1 (dedupe parov, predpomnilnik, varovalka)
// ===========================================================================

describe("TASK 51 §25: OSRM klici — brez N+1 (dedupe, cache, varovalka, sočasnost)", () => {
  test("N1 točno EN klic na EDINSTVEN par + sočasnost ≤ 4 (4 postanki = 3 pari)", async () => {
    resetRoadRoutingState();
    const counter = countingFetcher(async () => osrmOk());
    const idx = await buildLegRouteIndex(
      miniItin(["bohinj", "postojna", "bled", "ljubljana"]),
      { fetchJson: counter.fn }
    );
    expect(counter.calls()).toBe(3); // 3 edinstveni pari — NE 4!3!2!1 N+1
    expect(counter.peak()).toBeLessThanOrEqual(4); // vljudnost do javnega OSRM
    expect(idx.get(legKey("bohinj", "postojna"))!.source).toBe("osrm");
    expect(idx.get(legKey("postojna", "bled"))!.source).toBe("osrm");
    expect(idx.get(legKey("bled", "ljubljana"))!.source).toBe("osrm");
  });

  test("N2 ponovljen klic nad istim načrtom → 0 novih omrežnih klicov (predpomnilnik)", async () => {
    resetRoadRoutingState();
    const counter = countingFetcher(async () => osrmOk());
    const itin = miniItin(["bohinj", "postojna", "bled"]);
    await buildLegRouteIndex(itin, { fetchJson: counter.fn });
    expect(counter.calls()).toBe(2);
    const idx2 = await buildLegRouteIndex(itin, { fetchJson: counter.fn });
    expect(counter.calls()).toBe(2); // 0 novih — noge iz predpomnilnika
    expect(idx2.get(legKey("bohinj", "postojna"))!.source).toBe("osrm");
  });

  test("N3 varovalka: 4 zaporedne odpovedi → OSRM izklopljen (0 klicov, hevristika) — nevihta se ne razvnese", async () => {
    resetRoadRoutingState();
    const failing = countingFetcher(async () =>
      Promise.reject(new Error("down"))
    );
    // 5 postankov = 4 pari → 4 odpovedi → prag varovalke
    const idxA = await buildLegRouteIndex(
      miniItin(["bohinj", "postojna", "bled", "ljubljana", "piran"]),
      { fetchJson: failing.fn }
    );
    expect(idxA.get(legKey("bohinj", "postojna"))!.source).toBe("heuristic");
    expect(failing.calls()).toBe(4);
    // po odpovedi strežnika NOVI pari NE udarijo omrežja (varovalka odprta)
    const probe = countingFetcher(async () => osrmOk());
    const idxB = await buildLegRouteIndex(
      miniItin(["kobarid", "maribor"]),
      { fetchJson: probe.fn }
    );
    expect(probe.calls()).toBe(0);
    expect(idxB.get(legKey("kobarid", "maribor"))!.source).toBe("heuristic");
  });

  test("N4 resetRoadRoutingState obnovi omrežje (klici se nadaljujejo)", async () => {
    resetRoadRoutingState();
    const failing = countingFetcher(async () =>
      Promise.reject(new Error("down"))
    );
    await buildLegRouteIndex(miniItin(["bohinj", "postojna", "bled", "ljubljana"]), {
      fetchJson: failing.fn,
    });
    resetRoadRoutingState(); // testna/CLI pomoč — stanje modula počiščeno
    const probe = countingFetcher(async () => osrmOk());
    const idx = await buildLegRouteIndex(miniItin(["kobarid", "maribor"]), {
      fetchJson: probe.fn,
    });
    expect(probe.calls()).toBe(1);
    expect(idx.get(legKey("kobarid", "maribor"))!.source).toBe("osrm");
  });
});
