import { describe, expect, test } from "bun:test";
import {
  mapPinsCellDeg,
  parseMapPinsQuery,
  computeMapPins,
  MAP_PINS_GRID_MAX_ZOOM,
  MAP_PINS_MAX_INDIVIDUAL,
  MAP_PINS_SOURCE,
} from "@/lib/map-pins";
import type { FsqPlace } from "@/lib/supply/providers/fsq/types";

// ============================================================================
// MAP PINS (1.95.1) — statični FSQ sloj zemljevida: resnica s testi.
// Čisto jedro (computeMapPins) nad SINTETIČNIMI kraji — brez datotečnega
// sistema (dataset most testiramo posredno prek istih funkcij kot adapter).
// ============================================================================

const DATASET = { installed: true, places: 4, lastUpdated: null };

/** Sintetični kraj (helper). */
function place(
  id: string,
  name: string,
  lat: number,
  lng: number,
  opts: {
    label?: string;
    rating?: number;
    ratingCount?: number;
  } = {}
): FsqPlace {
  return {
    fsq_id: id,
    name,
    latitude: lat,
    longitude: lng,
    categories: opts.label
      ? [{ label: opts.label }]
      : [{ label: "Dining and Drinking > Restaurant" }],
    ...(opts.rating != null || opts.ratingCount != null
      ? {
          stats: {
            ...(opts.rating != null ? { rating: opts.rating } : {}),
            ...(opts.ratingCount != null ? { rating_count: opts.ratingCount } : {}),
          },
        }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Tabela velikosti celic
// ---------------------------------------------------------------------------

describe("mapPinsCellDeg — tabela grid celic", () => {
  test("z≤6 → 1°, stopnjevanje do z10 (1/16°)", () => {
    expect(mapPinsCellDeg(4)).toBe(1);
    expect(mapPinsCellDeg(6)).toBe(1);
    expect(mapPinsCellDeg(7)).toBe(0.5);
    expect(mapPinsCellDeg(8)).toBe(0.25);
    expect(mapPinsCellDeg(9)).toBe(0.125);
    expect(mapPinsCellDeg(10)).toBe(0.0625);
  });

  test("z ≥ 11 → 0 (posamezni pini)", () => {
    expect(mapPinsCellDeg(11)).toBe(0);
    expect(mapPinsCellDeg(19)).toBe(0);
  });

  test("necelo število / neveljavno → floor / varna rezerva", () => {
    expect(mapPinsCellDeg(7.9)).toBe(0.5);
    expect(mapPinsCellDeg(Number.NaN)).toBe(1); // floor(NaN)=NaN → tabela vrstica z≤6
  });
});

// ---------------------------------------------------------------------------
// Parse poizvedbe (strežniška vrata)
// ---------------------------------------------------------------------------

describe("parseMapPinsQuery — validacija", () => {
  test("veljavna poizvedba", () => {
    const r = parseMapPinsQuery({
      bbox: "45.0,13.5,46.5,16.0",
      zoom: "8",
      cats: "petrol,restaurant",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.query.bbox).toEqual([45, 13.5, 46.5, 16]);
      expect(r.query.zoom).toBe(8);
      expect(r.query.cats).toEqual(["petrol", "restaurant"]);
    }
  });

  test("manjkajoč bbox → napaka", () => {
    expect(parseMapPinsQuery({ bbox: null, zoom: "8", cats: null }).ok).toBe(false);
    expect(parseMapPinsQuery({ bbox: "", zoom: "8", cats: null }).ok).toBe(false);
  });

  test("pokvarjen bbox (napačen vrstni red / meje) → napaka", () => {
    expect(
      parseMapPinsQuery({ bbox: "46.5,13.5,45.0,16.0", zoom: "8", cats: null }).ok
    ).toBe(false); // south > north
    expect(
      parseMapPinsQuery({ bbox: "45.0,16.0,46.5,13.5", zoom: "8", cats: null }).ok
    ).toBe(false); // west > east
    expect(
      parseMapPinsQuery({ bbox: "-91,13,46,16", zoom: "8", cats: null }).ok
    ).toBe(false); // izven zemljepisnih meja
    expect(
      parseMapPinsQuery({ bbox: "45,13,46,abc", zoom: "8", cats: null }).ok
    ).toBe(false); // ne-številka
  });

  test("pretirano velik bbox (površina) → napaka", () => {
    expect(
      parseMapPinsQuery({ bbox: "0,0,25,25", zoom: "8", cats: null }).ok
    ).toBe(false); // 625°² > 400°²
  });

  test("zoom clamp + neveljaven → varna vrednost", () => {
    const r = parseMapPinsQuery({ bbox: "45,13,46,14", zoom: "99", cats: null });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.query.zoom).toBe(19);
    const r2 = parseMapPinsQuery({ bbox: "45,13,46,14", zoom: "abc", cats: null });
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.query.zoom).toBe(6);
  });

  test("cats: dedupe + neznani odpadejo + prazno = brez filtra", () => {
    const r = parseMapPinsQuery({
      bbox: "45,13,46,14",
      zoom: "8",
      cats: "petrol,petrol,restaurant,neznani-tip,,shop",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.query.cats).toEqual(["petrol", "restaurant", "shop"]);

    const r2 = parseMapPinsQuery({ bbox: "45,13,46,14", zoom: "8", cats: null });
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.query.cats).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// GRID agregacija (z ≤ 10)
// ---------------------------------------------------------------------------

describe("computeMapPins — grid način (z≤10)", () => {
  const places = [
    place("a", "Restavracija A", 46.05, 14.5, { label: "Dining and Drinking > Restaurant" }),
    place("b", "Bencinska B", 46.06, 14.51, { label: "Travel and Transportation > Fuel Station" }),
    place("c", "Hotel C", 46.1, 14.6, { label: "Travel and Transportation > Lodging > Hotel" }),
    // Izven bbox-a:
    place("d", "Daleč D", 30.0, 10.0),
  ];

  test("celice združijo kraje, top-3 kategorije, težišče, deterministični vrstni red", () => {
    const r = computeMapPins(places, {
      bbox: [45.9, 14.4, 46.2, 14.7],
      zoom: 8, // celica 0.25° → vsi trije v isti celici
      cats: [],
    }, DATASET);

    expect(r.mode).toBe("grid");
    expect(r.cells.length).toBe(1);
    const c = r.cells[0];
    expect(c.count).toBe(3);
    expect(c.lat).toBeCloseTo((46.05 + 46.06 + 46.1) / 3, 5);
    expect(c.lng).toBeCloseTo((14.5 + 14.51 + 14.6) / 3, 5);
    // Top-3 kategorije — izenačenost 1:1:1 → abecedno (deterministično):
    // accommodation, petrol, restaurant
    expect(c.cats).toEqual([
      { type: "accommodation", count: 1 },
      { type: "petrol", count: 1 },
      { type: "restaurant", count: 1 },
    ]);
    expect(r.total).toBe(3);
    expect(r.capped).toBe(false);
  });

  test("filter kategorij: samo bencinske", () => {
    const r = computeMapPins(places, {
      bbox: [45.9, 14.4, 46.2, 14.7],
      zoom: 8,
      cats: ["petrol"],
    }, DATASET);
    expect(r.cells.length).toBe(1);
    expect(r.cells[0].count).toBe(1);
    expect(r.cells[0].cats[0].type).toBe("petrol");
  });

  test("manjša celica pri višjem zoomu loči oddaljene kraje", () => {
    // 46.05 in 46.30 sta v ISTI 0.5° celici (92), a RAZLIČNIH 0.25° celicah
    // (184 vs 185) — meja pri 46.25.
    const far = [place("a", "A", 46.05, 14.5), place("b", "B", 46.3, 14.51)];
    const z7 = computeMapPins(far, {
      bbox: [46.0, 14.4, 46.6, 15.0],
      zoom: 7,
      cats: [],
    }, DATASET);
    expect(z7.cells.length).toBe(1); // 0.5° celica — skupaj

    const z8 = computeMapPins(far, {
      bbox: [46.0, 14.4, 46.6, 15.0],
      zoom: 8,
      cats: [],
    }, DATASET);
    expect(z8.cells.length).toBe(2); // 0.25° celica — ločeno
  });

  test("izenačenost kategorij → abecedno (deterministično)", () => {
    const tie = [
      place("a", "A", 46.05, 14.5, { label: "Travel and Transportation > Fuel Station" }),
      place("b", "B", 46.05, 14.5, { label: "Dining and Drinking > Restaurant" }),
    ];
    const r = computeMapPins(tie, {
      bbox: [46.0, 14.4, 46.1, 14.6],
      zoom: 8,
      cats: [],
    }, DATASET);
    // petrol < restaurant (abecedno pri 1:1)
    expect(r.cells[0].cats[0].type).toBe("petrol");
    expect(r.cells[0].cats[1].type).toBe("restaurant");
  });
});

// ---------------------------------------------------------------------------
// Posamezni pini (z ≥ 11)
// ---------------------------------------------------------------------------

describe("computeMapPins — pins način (z≥11)", () => {
  test("rangiranje po rating_count desc, fsq_id asc", () => {
    const places = [
      place("a", "Nizko", 46.05, 14.5, { ratingCount: 2 }),
      place("b", "Visoko", 46.06, 14.51, { ratingCount: 50 }),
      place("c", "Srednje", 46.07, 14.52, { ratingCount: 10 }),
      place("d", "Enako kot c", 46.08, 14.53, { ratingCount: 10 }),
    ];
    const r = computeMapPins(places, {
      bbox: [46.0, 14.4, 46.1, 14.6],
      zoom: 12,
      cats: [],
    }, DATASET);
    expect(r.mode).toBe("pins");
    expect(r.pins.map((p) => p.id)).toEqual(["b", "c", "d", "a"]);
    expect(r.total).toBe(4);
  });

  test("kap 800 + iskren capped dogodek", () => {
    const places = Array.from({ length: 900 }, (_, i) =>
      place(`p${String(i).padStart(4, "0")}`, `Kraj ${i}`, 46.0 + (i % 10) * 0.001, 14.5)
    );
    const r = computeMapPins(places, {
      bbox: [45.9, 14.4, 46.2, 14.6],
      zoom: 12,
      cats: [],
    }, DATASET);
    expect(r.pins.length).toBe(MAP_PINS_MAX_INDIVIDUAL);
    expect(r.capped).toBe(true);
    expect(r.total).toBe(900);
  });

  test("ocena samo iz stats.rating (0–5), zaokrožena na 1 decimalo", () => {
    const places = [
      place("a", "A", 46.05, 14.5, { rating: 4.56, ratingCount: 7 }),
      place("b", "B", 46.06, 14.51, { rating: 9.9 }), // izven 0–5 → brez ocene
    ];
    const r = computeMapPins(places, {
      bbox: [46.0, 14.4, 46.1, 14.6],
      zoom: 12,
      cats: [],
    }, DATASET);
    const a = r.pins.find((p) => p.id === "a");
    const b = r.pins.find((p) => p.id === "b");
    expect(a?.rating).toBe(4.6);
    expect(a?.ratingCount).toBe(7);
    expect(b?.rating).toBeUndefined();
  });

  test("subcategory = terminal segment hierarhične oznake", () => {
    const places = [
      place("a", "Hotel A", 46.05, 14.5, { label: "Travel and Transportation > Lodging > Hotel" }),
    ];
    const r = computeMapPins(places, {
      bbox: [46.0, 14.4, 46.1, 14.6],
      zoom: 12,
      cats: [],
    }, DATASET);
    expect(r.pins[0].type).toBe("accommodation");
    expect(r.pins[0].sub).toBe("Hotel");
  });

  test("filter kategorij deluje tudi v pins načinu", () => {
    const places = [
      place("a", "Bencinska", 46.05, 14.5, { label: "Travel and Transportation > Fuel Station" }),
      place("b", "Restavracija", 46.06, 14.51),
    ];
    const r = computeMapPins(places, {
      bbox: [46.0, 14.4, 46.1, 14.6],
      zoom: 12,
      cats: ["petrol"],
    }, DATASET);
    expect(r.pins.length).toBe(1);
    expect(r.pins[0].type).toBe("petrol");
  });
});

// ---------------------------------------------------------------------------
// Iskrenost + meje
// ---------------------------------------------------------------------------

describe("computeMapPins — iskrenost", () => {
  test("prazen seznam krajev → prazen grid (nikoli napaka)", () => {
    const r = computeMapPins([], { bbox: [45, 13, 46, 16], zoom: 8, cats: [] }, {
      installed: false,
      places: 0,
      lastUpdated: null,
    });
    expect(r.mode).toBe("grid");
    expect(r.cells).toEqual([]);
    expect(r.total).toBe(0);
    expect(r.dataset.installed).toBe(false);
  });

  test("dataset ni nameščen → odgovor vsebuje installed: false", () => {
    const r = computeMapPins([place("a", "A", 46, 14)], {
      bbox: [45, 13, 46, 16],
      zoom: 12,
      cats: [],
    }, { installed: false, places: 0, lastUpdated: null });
    expect(r.dataset.installed).toBe(false);
    // Kraji so vseeno obdelani (jedro je nad danim seznamom — gate je v
    // queryMapPins mostu, ki prazen indeks prevede v prazen seznam).
  });
});

describe("konstante + atribucija", () => {
  test("pragi: grid ≤ 10, kap posameznih 800", () => {
    expect(MAP_PINS_GRID_MAX_ZOOM).toBe(10);
    expect(MAP_PINS_MAX_INDIVIDUAL).toBe(800);
  });

  test("atribucija vira (Apache-2.0) je del odgovora/API", () => {
    expect(MAP_PINS_SOURCE.label).toBe("Foursquare Open Places");
    expect(MAP_PINS_SOURCE.license).toBe("Apache-2.0");
    expect(MAP_PINS_SOURCE.slug).toBe("fsq");
  });
});
