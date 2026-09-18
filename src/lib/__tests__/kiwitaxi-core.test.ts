// ============================================================================
// TASK 43 — KIWITAXI CORE TESTI (WKT parser, TSV parsing, mapper/
// normalizacija, sanity vrata, varnostne meje)
// ============================================================================
// Pokrivajo naročnikove zahteve §4 (WKT → geo, brez route centroida),
// §6 (cena per_transfer), §16 (varnost raw podatkov: URL-ji, imena, cene,
// koordinate, kapike) in §10 (ingestion brez brskalnika).
// ============================================================================

import { describe, expect, test } from "bun:test";

import {
  bboxIntersects,
  isWktPolygon,
  parseWktPolygon,
  MAX_POLYGON_POINTS,
} from "@/lib/supply/providers/kiwitaxi/wkt";
import {
  mapKiwiTaxiDataset,
  passesKiwiSanityGate,
} from "@/lib/supply/providers/kiwitaxi/mapper";
import { parseTsv } from "@/lib/supply/providers/kiwitaxi/ingest";
import type {
  KiwiRawPlace,
  KiwiRawRoute,
  KiwiRawTransfer,
  KiwiRawTransferType,
} from "@/lib/supply/providers/kiwitaxi/types";

// ---------------------------------------------------------------------------
// WKT PARSER (§4 + §16)
// ---------------------------------------------------------------------------

describe("kiwitaxi WKT parser", () => {
  // Dejanski WKT iz vira (Ljubljana Airport, živo prenesen 18. 9. 2026).
  const LJU_WKT =
    "POLYGON((14.435176849365234 46.23602143702813,14.462556838989258 46.23216237052866,14.484186172485352 46.21458534374546,14.433374404907227 46.23412162281811,14.435176849365234 46.23602143702813))";

  test("parsira veljaven POLYGON v centroid + bbox (lng-first!)", () => {
    const g = parseWktPolygon(LJU_WKT);
    expect(g).not.toBeNull();
    // lng-first: prva koordinata je longitude (14.x), druga latitude (46.x)
    expect(g!.bbox[0]).toBeGreaterThan(46.2); // s (lat)
    expect(g!.bbox[2]).toBeLessThan(46.25); // n (lat)
    expect(g!.bbox[1]).toBeGreaterThan(14.4); // w (lng)
    expect(g!.bbox[3]).toBeLessThan(14.5); // e (lng)
    expect(g!.centroid.lat).toBeGreaterThan(46.2);
    expect(g!.centroid.lat).toBeLessThan(46.25);
    expect(g!.centroid.lng).toBeGreaterThan(14.4);
    expect(g!.centroid.lng).toBeLessThan(14.5);
    expect(g!.pointCount).toBe(4); // zaklepna točka se ne šteje dvakrat
  });

  test("centroid je centroid PREVZEMNEGA območja (ne route)", () => {
    // Naročniška zahteva §4: pin = predstavniška točka območja kraja.
    // Kvadrat 1°×1° okrog Ljubljane → centroid ≈ center kvadrata.
    const wkt = "POLYGON((14.0 46.0,15.0 46.0,15.0 47.0,14.0 47.0,14.0 46.0))";
    const g = parseWktPolygon(wkt)!;
    expect(g.centroid.lat).toBeCloseTo(46.5, 5);
    expect(g.centroid.lng).toBeCloseTo(14.5, 5);
  });

  test("zavrne: NaN / ne-številske koordinate", () => {
    expect(parseWktPolygon("POLYGON((abc def,1 2,3 4,abc def))")).toBeNull();
    expect(parseWktPolygon("POLYGON((NaN 1,1 2,2 3,NaN 1))")).toBeNull();
    expect(parseWktPolygon("POLYGON((Infinity 1,1 2,2 3,Infinity 1))")).toBeNull();
  });

  test("zavrne: koordinate izven meja (|lat|>90, |lng|>180)", () => {
    expect(parseWktPolygon("POLYGON((14 91,15 91,15 92,14 91))")).toBeNull();
    expect(parseWktPolygon("POLYGON((181 46,182 46,182 47,181 46))")).toBeNull();
    // lng-first zamenjava: 46 kot lng je OK, 91 kot lat pa ne — obrat tudi:
    expect(parseWktPolygon("POLYGON((46 14,47 14,47 15,46 14))")).not.toBeNull();
  });

  test("zavrne: ne-POLYGON geometrije (MULTI/POINT/linija/prazno)", () => {
    expect(parseWktPolygon("MULTIPOLYGON(((1 1,2 2,3 3,1 1)))")).toBeNull();
    expect(parseWktPolygon("POINT(14.5 46.1)")).toBeNull();
    expect(parseWktPolygon("LINESTRING(1 1,2 2)")).toBeNull();
    expect(parseWktPolygon("")).toBeNull();
    expect(parseWktPolygon("POLYGON(())")).toBeNull();
    // degenerirana geometrija (ena točka)
    expect(parseWktPolygon("POLYGON((14.5 46.1,14.5 46.1,14.5 46.1))")).toBeNull();
  });

  test("zavrne: oversized zapise (kapika točk)", () => {
    const points = Array.from(
      { length: MAX_POLYGON_POINTS + 1 },
      (_, i) => `${(14 + i * 0.0001).toFixed(6)} ${(46 + i * 0.00001).toFixed(6)}`
    ).join(",");
    expect(parseWktPolygon(`POLYGON((${points}))`)).toBeNull();
  });

  test("zavrne: hex/eksponentne igre z obliko števk", () => {
    // Number() bi sprejel 0x10 — regex ga zavrne (meja zaupanja)
    expect(parseWktPolygon("POLYGON((0x10 46,15 46,15 47,0x10 46))")).toBeNull();
  });

  test("isWktPolygon hitra predpreverba", () => {
    expect(isWktPolygon(LJU_WKT)).toBe(true);
    expect(isWktPolygon("POINT(1 2)")).toBe(false);
    expect(isWktPolygon("")).toBe(false);
  });

  test("bboxIntersects: presek viewporta z območjem (± toleranca)", () => {
    const placeBbox: [number, number, number, number] = [46.2, 14.4, 46.24, 14.49];
    const view: [number, number, number, number] = [46.0, 14.0, 46.3, 14.5];
    const far: [number, number, number, number] = [45.0, 13.0, 45.1, 13.1];
    expect(bboxIntersects(placeBbox, view)).toBe(true);
    expect(bboxIntersects(placeBbox, far)).toBe(false);
    expect(bboxIntersects(undefined, view)).toBe(false); // brez geo NI pina
    expect(bboxIntersects(placeBbox, undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TSV PARSING (format vira: \n / \t / \N / glava)
// ---------------------------------------------------------------------------

describe("kiwitaxi parseTsv (format CSV vira)", () => {
  test("glavna vrstica → polja; \N → prazno; CRLF očiščen", () => {
    const tsv = "id\tname\tvalue\r\n1\tBled\t\\N\r\n2\tKranj\t42\r\n";
    const rows = parseTsv<{ id: string; name: string; value: string }>(tsv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ id: "1", name: "Bled", value: "" });
    expect(rows[1]).toEqual({ id: "2", name: "Kranj", value: "42" });
  });

  test("prazne vrstice se odpuste; manjkajoči stolpci → prazno", () => {
    const tsv = "a\tb\n\n1\n2\tok\n";
    const rows = parseTsv<{ a: string; b: string }>(tsv);
    expect(rows).toHaveLength(2);
    expect(rows[0].b).toBe("");
    expect(rows[1]).toEqual({ a: "2", b: "ok" });
  });

  test("samo glava / prazno besedilo → nič vrstic", () => {
    expect(parseTsv("a\tb")).toHaveLength(0);
    expect(parseTsv("")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// MAPPER / NORMALIZACIJA (§2 + §3 + §6 + §16)
// ---------------------------------------------------------------------------

/** Graditelj raw množic za teste (defaulti SOBAJO med seboj: ruta 500 +
 *  razred 10 + transfer 9000 — tako testi brez eksplicitnih transferjev
 *  dobijo smiselno minimalno ponudbo). */
function rawInput(opts: {
  places?: Partial<KiwiRawPlace>[];
  routes?: Partial<KiwiRawRoute>[];
  transferTypes?: Partial<KiwiRawTransferType>[];
  transfers?: Partial<KiwiRawTransfer>[];
}) {
  const places: KiwiRawPlace[] = (opts.places ?? []).map((p, i) => ({
    id: p.id ?? String(100 + i),
    country_id: p.country_id ?? "3",
    region_id: p.region_id ?? "",
    type_id: p.type_id ?? "1",
    name_en: p.name_en ?? `Place ${i}`,
    name_ru: "",
    name_de: "",
    name_fr: "",
    name_es: "",
    iata: p.iata ?? "",
    place_polygon: p.place_polygon ?? "",
  }));
  const routes: KiwiRawRoute[] = (opts.routes ?? []).map((r, i) => ({
    id: r.id ?? String(500 + i),
    country_id: r.country_id ?? "3",
    place_from_id: r.place_from_id ?? "100",
    place_to_id: r.place_to_id ?? "101",
    distance: r.distance ?? "35",
    timeinway: r.timeinway ?? "30",
    weight: r.weight ?? "1.5",
    url: r.url ?? "/slovenia/a-%3Eb",
  }));
  const transferTypes: KiwiRawTransferType[] = (
    opts.transferTypes ?? [{ id: "10", name_en: "Economy", pax: "4" }]
  ).map((t, i) => ({
      id: t.id ?? String(10 + i),
      name_en: t.name_en ?? "Economy",
      name_ru: "",
      pax: t.pax ?? "4",
      baggage: "3",
      description_en: "",
      description_ru: "",
      car_examples_en: "",
      car_examples_ru: "",
      photo: "",
      sortno: "1",
      photo2: "",
    })
  );
  const transfers: KiwiRawTransfer[] = (
    opts.transfers ?? [
      { id: "9000", route_id: "500", type_id: "10", price_eur: "77", url: "/transfers/9000" },
    ]
  ).map((t, i) => ({
    id: t.id ?? String(9000 + i),
    route_id: t.route_id ?? "500",
    type_id: t.type_id ?? "10",
    price_rub: "0",
    price_eur: t.price_eur ?? "77",
    price_usd: "0",
    url: t.url ?? "/transfers/9000",
  }));
  return { places, routes, transferTypes, transfers };
}

const LJU_POLY =
  "POLYGON((14.435176849365234 46.23602143702813,14.462556838989258 46.23216237052866,14.484186172485352 46.21458534374546,14.433374404907227 46.23412162281811,14.435176849365234 46.23602143702813))";
const BLED_POLY =
  "POLYGON((13.99 46.33,14.05 46.33,14.05 46.38,13.99 46.38,13.99 46.33))";

describe("kiwitaxi mapper — normalizacija", () => {
  test("ruta → izdelek: pin iz prevzemnega poligona, cena min, classes sortirane", () => {
    const raw = rawInput({
      places: [
        { id: "103", name_en: "Ljubljana Airport", type_id: "2", iata: "LJU", place_polygon: LJU_POLY },
        { id: "109", name_en: "Bled", type_id: "1", place_polygon: BLED_POLY },
      ],
      routes: [{ id: "410", place_from_id: "103", place_to_id: "109", distance: "35", timeinway: "30", url: "/slovenia/ljubljana+airport-%3Ebled" }],
      transferTypes: [
        { id: "1", name_en: "Economy", pax: "4" },
        { id: "2", name_en: "Comfort", pax: "4" },
      ],
      transfers: [
        { id: "1440", route_id: "410", type_id: "1", price_eur: "77", url: "/transfers/1440" },
        { id: "1199", route_id: "410", type_id: "2", price_eur: "106", url: "/transfers/1199" },
      ],
    });
    const { dataset, skipped } = mapKiwiTaxiDataset(raw, "2026-09-18T00:00:00Z");
    expect(dataset.routes).toHaveLength(1);
    expect(skipped.routes).toBe(0);

    const r = dataset.routes[0];
    expect(r.fromName).toBe("Ljubljana Airport");
    expect(r.toName).toBe("Bled");
    // Pin = centroid LJU poligona (prevzemni kraj!)
    expect(r.fromLat).toBeGreaterThan(46.2);
    expect(r.fromLat).toBeLessThan(46.25);
    expect(r.fromLng).toBeGreaterThan(14.4);
    expect(r.fromLng).toBeLessThan(14.5);
    expect(r.fromBbox).toBeTruthy();
    expect(r.distanceKm).toBe(35);
    expect(r.durationMin).toBe(30);
    expect(r.minPriceEur).toBe(77);
    expect(r.cheapestTransferId).toBe(1440);
    expect(r.classes).toHaveLength(2);
    expect(r.classes[0].name).toBe("Economy"); // naraščajoče po ceni
    expect(r.fromType).toBe("airport");
    expect(r.toType).toBe("city");
    expect(dataset.counts.pinnedRoutes).toBe(1);
  });

  test("kraj BREZ poligona → ruta brez pina (ostane v datasetu, ni geo)", () => {
    const raw = rawInput({
      places: [
        { id: "100", name_en: "Ankaran", place_polygon: "" },
        { id: "101", name_en: "Bled", place_polygon: BLED_POLY },
      ],
      routes: [{ place_from_id: "100", place_to_id: "101" }],
    });
    const { dataset } = mapKiwiTaxiDataset(raw, "2026-09-18T00:00:00Z");
    expect(dataset.routes).toHaveLength(1);
    expect(dataset.routes[0].fromLat).toBeUndefined();
    expect(dataset.routes[0].fromBbox).toBeUndefined();
    expect(dataset.counts.pinnedRoutes).toBe(0);
  });

  test("obseg: izven-SI rute (odhod tuja → cilj tuja) NISO vključene", () => {
    const raw = rawInput({
      places: [
        { id: "100", country_id: "3", name_en: "Bled" },
        { id: "101", country_id: "191", name_en: "Rim" },
        { id: "102", country_id: "191", name_en: "Milano" },
      ],
      routes: [
        // odhod iz SI → vključena
        { id: "1", country_id: "3", place_from_id: "100", place_to_id: "101" },
        // prihod V SI → vključena
        { id: "2", country_id: "191", place_from_id: "102", place_to_id: "100" },
        // IT → IT → IZVEN obsega
        { id: "3", country_id: "191", place_from_id: "101", place_to_id: "102" },
      ],
      transfers: [
        { id: "1", route_id: "1", price_eur: "50", url: "/transfers/1" },
        { id: "2", route_id: "2", price_eur: "60", url: "/transfers/2" },
        { id: "3", route_id: "3", price_eur: "70", url: "/transfers/3" },
      ],
    });
    const { dataset } = mapKiwiTaxiDataset(raw, "2026-09-18T00:00:00Z");
    expect(dataset.routes.map((r) => r.id).sort()).toEqual([1, 2]);
  });

  test("ruta brez cenovnih vrstic (transferjev) se ZAVRNE (ni cene = ni produkta)", () => {
    const raw = rawInput({
      places: [
        { id: "100", name_en: "A" },
        { id: "101", name_en: "B" },
      ],
      routes: [
        { id: "1", place_from_id: "100", place_to_id: "101" },
        { id: "2", place_from_id: "101", place_to_id: "100" },
      ],
      transfers: [{ route_id: "1", price_eur: "50", url: "/transfers/1" }],
    });
    const { dataset, skipped } = mapKiwiTaxiDataset(raw, "2026-09-18T00:00:00Z");
    expect(dataset.routes.map((r) => r.id)).toEqual([1]);
    expect(skipped.routes).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// MAPPER — VARNOSTNE MEJE (§16: URL-ji, imena, cene, kapike)
// ---------------------------------------------------------------------------

describe("kiwitaxi mapper — zavrnitev zlonamernih/neveljavnih podatkov", () => {
  function mapWithRoute(url: string) {
    const raw = rawInput({
      places: [
        { id: "100", name_en: "A", place_polygon: BLED_POLY },
        { id: "101", name_en: "B", place_polygon: BLED_POLY },
      ],
      routes: [{ id: "1", place_from_id: "100", place_to_id: "101", url }],
      transfers: [{ route_id: "1", price_eur: "77", url: "/transfers/1" }],
    });
    return mapKiwiTaxiDataset(raw, "2026-09-18T00:00:00Z");
  }

  test("route URL: zavrne absolutne/scheme/protocol-relative/query/hash/..", () => {
    for (const bad of [
      "https://evil.com/slovenia/a-%3Eb",
      "//evil.com/a-%3Eb",
      "http://kiwitaxi.com/a",
      "/slovenia/a-%3Eb?x=1",
      "/slovenia/a-%3Eb#frag",
      "/slovenia/../../evil",
      "javascript:alert(1)",
      "/slovenia/a-%3Eb@evil",
      "/slovenia/a\\b",
      "slovenia/a-%3Eb", // brez začetne /
    ]) {
      const { dataset, skipped } = mapWithRoute(bad);
      expect(dataset.routes).toHaveLength(0);
      expect(skipped.routes).toBe(1);
    }
  });

  test("route URL: sprejme kanonične oblike vira", () => {
    for (const good of [
      "/slovenia/ljubljana+airport-%3Ebled",
      "/croatia/zagreb-%3Eljubljana",
      "/slovenia/bled",
    ]) {
      const { dataset } = mapWithRoute(good);
      expect(dataset.routes).toHaveLength(1);
      expect(dataset.routes[0].urlPath).toBe(good);
    }
  });

  test("transfer URL: SAMO /transfers/{števke} (drugo = zavrnjeno)", () => {
    const raw = rawInput({
      places: [
        { id: "100", name_en: "A", place_polygon: BLED_POLY },
        { id: "101", name_en: "B", place_polygon: BLED_POLY },
      ],
      routes: [{ id: "1", place_from_id: "100", place_to_id: "101" }],
      transfers: [
        { id: "1", route_id: "1", price_eur: "50", url: "/transfers/1234" },
        { id: "2", route_id: "1", price_eur: "60", url: "/transfers/abc" },
        { id: "3", route_id: "1", price_eur: "70", url: "https://evil.com/transfers/1" },
        { id: "4", route_id: "1", price_eur: "80", url: "/transfers/12/evil" },
      ],
    });
    const { dataset, skipped } = mapKiwiTaxiDataset(raw, "2026-09-18T00:00:00Z");
    expect(dataset.routes).toHaveLength(1);
    expect(dataset.routes[0].classes).toHaveLength(1);
    expect(dataset.routes[0].classes[0].transferId).toBe(1234);
    expect(skipped.transfers).toBe(3);
  });

  test("imena: kontrolni znaki + HTML/JS znaki se odstranijo (XSS meja)", () => {
    const raw = rawInput({
      places: [
        {
          id: "100",
          name_en: 'Bled<script>alert("x")</script>\u0007',
          place_polygon: BLED_POLY,
        },
        { id: "101", name_en: "Kranj", place_polygon: BLED_POLY },
      ],
      routes: [{ id: "1", place_from_id: "100", place_to_id: "101" }],
      transfers: [{ route_id: "1", price_eur: "77", url: "/transfers/1" }],
    });
    const { dataset } = mapKiwiTaxiDataset(raw, "2026-09-18T00:00:00Z");
    expect(dataset.routes).toHaveLength(1);
    expect(dataset.routes[0].fromName).toBe("Bledscriptalert(x)/script");
    expect(dataset.routes[0].fromName).not.toContain("<");
    expect(dataset.routes[0].fromName).not.toContain(">");
  });

  test("cene: 0 / negativne / NaN / Infinity / čez 10k so zavrnjene", () => {
    const raw = rawInput({
      places: [
        { id: "100", name_en: "A", place_polygon: BLED_POLY },
        { id: "101", name_en: "B", place_polygon: BLED_POLY },
      ],
      routes: [{ id: "1", place_from_id: "100", place_to_id: "101" }],
      transfers: [
        { id: "1", route_id: "1", price_eur: "0", url: "/transfers/1" },
        { id: "2", route_id: "1", price_eur: "-5", url: "/transfers/2" },
        { id: "3", route_id: "1", price_eur: "NaN", url: "/transfers/3" },
        { id: "4", route_id: "1", price_eur: "Infinity", url: "/transfers/4" },
        { id: "5", route_id: "1", price_eur: "99999", url: "/transfers/5" },
        { id: "6", route_id: "1", price_eur: "0x10", url: "/transfers/6" },
      ],
    });
    const { dataset, skipped } = mapKiwiTaxiDataset(raw, "2026-09-18T00:00:00Z");
    expect(dataset.routes).toHaveLength(0); // vse cene odpadle → ruta brez cen
    expect(skipped.transfers).toBe(6);
    expect(skipped.routes).toBe(1);
  });

  test("razredi vozil: pax/ime validirani; max 12 razredov na ruto", () => {
    const types = Array.from({ length: 20 }, (_, i) => ({
      id: String(30 + i),
      name_en: `Class ${i}`,
      pax: "4",
    }));
    const transfers = Array.from({ length: 20 }, (_, i) => ({
      id: String(7000 + i),
      route_id: "1",
      type_id: String(30 + i),
      price_eur: String(50 + i),
      url: `/transfers/${7000 + i}`,
    }));
    const raw = rawInput({
      places: [
        { id: "100", name_en: "A", place_polygon: BLED_POLY },
        { id: "101", name_en: "B", place_polygon: BLED_POLY },
      ],
      routes: [{ id: "1", place_from_id: "100", place_to_id: "101" }],
      transferTypes: types,
      transfers,
    });
    const { dataset } = mapKiwiTaxiDataset(raw, "2026-09-18T00:00:00Z");
    expect(dataset.routes[0].classes.length).toBeLessThanOrEqual(12);
  });
});

// ---------------------------------------------------------------------------
// SANITY VRATA (overlay politika — delni prenos NE gre skozi)
// ---------------------------------------------------------------------------

describe("kiwitaxi sanity vrata", () => {
  function ds(routes: number, places: number, transfers: number) {
    return {
      version: 1 as const,
      fetchedAt: "2026-09-18T00:00:00Z",
      source: "KiwiTaxi Partner Data API (CSV)",
      paymentType: "partial" as const,
      counts: { places, routes, transfers, pinnedRoutes: routes },
      places: Array.from({ length: places }, (_, i) => ({ id: i + 1, name: `P${i}`, type: "city" as const })),
      routes: Array.from({ length: routes }, (_, i) => ({
        id: i + 1, fromId: 1, fromName: "A", toId: 2, toName: "B",
        distanceKm: 10, durationMin: 10, weight: 0,
        minPriceEur: 50, cheapestTransferId: i + 1,
        classes: [{ transferId: i + 1, name: "Economy", pax: 4, eur: 50 }],
        urlPath: "/slovenia/a-%3Eb", fromType: "city" as const, toType: "city" as const,
      })),
    };
  }

  test("brez baseline: minimalne absolutne meje", () => {
    expect(passesKiwiSanityGate(ds(400, 100, 2000), null)).toBe(true);
    expect(passesKiwiSanityGate(ds(299, 100, 2000), null)).toBe(false);
    expect(passesKiwiSanityGate(ds(400, 49, 2000), null)).toBe(false);
    expect(passesKiwiSanityGate(ds(400, 100, 999), null)).toBe(false);
    expect(passesKiwiSanityGate(ds(0, 0, 0), null)).toBe(false);
  });

  test("z baseline: < 50 % baseline (ali absolutni minimum) = zavrnjeno", () => {
    const baseline = ds(1494, 308, 9614);
    expect(passesKiwiSanityGate(ds(1490, 300, 9500), baseline)).toBe(true);
    expect(passesKiwiSanityGate(ds(700, 300, 9500), baseline)).toBe(false); // < 50 % rut
    expect(passesKiwiSanityGate(ds(1490, 100, 9500), baseline)).toBe(false); // < 50 % krajev
    expect(passesKiwiSanityGate(ds(1490, 300, 4000), baseline)).toBe(false); // < 50 % transferjev
  });
});
