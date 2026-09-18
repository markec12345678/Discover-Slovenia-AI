// ============================================================================
// TASK 44 (§10–§15, §19, §20) — PRODUCTION HARDENING: POGODBE
// ============================================================================
// Naročnikov spec (nadaljevanje 1.49.4):
//  §10 AVAILABILITY CONTRACT — cena NI razpoložljivost (price→available
//     mora biti NEMOGOČ brez dejanske validacije)
//  §11 GEO SEMANTICS — WKT (Point/LineString/Polygon/MultiPolygon, invalid,
//     reversed, out-of-range, NaN, Infinity), geoPrecision ≠ exact, SI sanity
//  §12 SECURITY ADVERSARIAL — malicious booking URL, javascript:, data:,
//     encoded URL, HTML/script injection, dolgi ID/URL, malformed WKT,
//     oversized row → fail-closed
//  §13 REDIRECT CONTRACT — /go/transfers product valid/invalid/missing/
//     malicious; monetizacija NE sme biti pogoj za prikaz podatkov
//  §14 ADD-TO-PLAN/AI — FIXED transfer nemutabilen skozi cel chain
//  §15 DUPLICATE TRANSFER — izbrani transfer + AI = brez drugega izmišljenega
//  §19 REGRESIJA — živo odkrita vrzel: ingest brez sanity vrat (34 rut proti
//     1494 baseline-a je ŠEL SKOZI uredniško skripto)
//  §20 REGISTRY — EN centralni registry (brez vzporednih seznamov)
// ============================================================================

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseWktPolygon } from "@/lib/supply/providers/kiwitaxi/wkt";
import { mapKiwiTaxiDataset, passesKiwiSanityGate } from "@/lib/supply/providers/kiwitaxi/mapper";
import { kiwiRouteToProduct } from "@/lib/supply/providers/kiwitaxi/adapter";
import { getKiwitaxiBaseline } from "@/lib/supply/providers/kiwitaxi/dataset";
import type { KiwiRoute, KiwiRawPlace, KiwiRawRoute, KiwiRawTransfer, KiwiRawTransferType } from "@/lib/supply/providers/kiwitaxi/types";
import {
  buildSelectedProductsContext,
  sanitizeSelectedProviderProducts,
} from "@/lib/supply/sanitize";
import { insertProductStop } from "@/lib/supply/stop-insert";
import { getKiwitaxiUrl } from "@/lib/affiliate";
import { PROVIDER_REGISTRY } from "@/lib/supply/registry";
import type { ProviderProduct } from "@/lib/supply/types";
import type { Itinerary } from "@/lib/types";

// ---------------------------------------------------------------------------
// Pomožniki (isti vzorec kot kiwitaxi-core/adapter testi)
// ---------------------------------------------------------------------------

const REPO = join(import.meta.dir, "../../..");

function readSource(rel: string): string {
  return readFileSync(join(REPO, rel), "utf-8");
}

const KT_FILES = [
  "src/lib/supply/providers/kiwitaxi/adapter.ts",
  "src/lib/supply/providers/kiwitaxi/mapper.ts",
  "src/lib/supply/providers/kiwitaxi/wkt.ts",
  "src/lib/supply/providers/kiwitaxi/validate.ts",
  "src/lib/supply/providers/kiwitaxi/dataset.ts",
  "src/lib/supply/providers/kiwitaxi/ingest.ts",
];

function fixtureRoute(partial: Partial<KiwiRoute>): KiwiRoute {
  return {
    id: 410,
    fromId: 103,
    fromName: "Ljubljana Airport",
    toId: 109,
    toName: "Bled",
    fromLat: 46.2254,
    fromLng: 14.4623,
    fromBbox: [46.209, 14.433, 46.236, 14.485],
    distanceKm: 35,
    durationMin: 30,
    weight: 3.1,
    minPriceEur: 77,
    cheapestTransferId: 1440,
    classes: [
      { transferId: 1440, name: "Economy", pax: 4, eur: 77 },
      { transferId: 1199, name: "Comfort", pax: 4, eur: 106 },
    ],
    urlPath: "/slovenia/ljubljana+airport-%3Ebled",
    fromType: "airport",
    toType: "city",
    ...partial,
  };
}

/** Minimalen surov TSV vhod (za mapper adversarial teste). */
function rawRows(opts: {
  places?: Partial<KiwiRawPlace>[];
  routes?: Partial<KiwiRawRoute>[];
  transfers?: Partial<KiwiRawTransfer>[];
  transferTypes?: Partial<KiwiRawTransferType>[];
}) {
  const places: KiwiRawPlace[] = (opts.places ?? []).map((p, i) => ({
    id: p.id ?? String(100 + i),
    country_id: p.country_id ?? "3",
    region_id: "",
    type_id: p.type_id ?? "1",
    name_en: p.name_en ?? `Place ${i}`,
    name_ru: "", name_de: "", name_fr: "", name_es: "",
    iata: "",
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
  const transferTypes: KiwiRawTransferType[] = (opts.transferTypes ?? [
    { id: "10", name_en: "Economy", pax: "4" },
  ]).map((t, i) => ({
    id: t.id ?? String(10 + i),
    name_en: t.name_en ?? "Economy",
    name_ru: "",
    pax: t.pax ?? "4",
    baggage: "3", description_en: "", description_ru: "",
    car_examples_en: "", car_examples_ru: "",
    photo: "", sortno: "1", photo2: "",
  }));
  const transfers: KiwiRawTransfer[] = (opts.transfers ?? [
    { id: "9000", route_id: "500", type_id: "10", price_eur: "77", url: "/transfers/9000" },
  ]).map((t, i) => ({
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

/** Prazen itinerer z N dnevi (za vstavljanje). */
function emptyItinerary(days: number): Itinerary {
  return {
    id: "test",
    title: "Test",
    days: Array.from({ length: days }, (_, i) => ({
      day: i + 1,
      title: `Dan ${i + 1}`,
      locations: [],
      overnight: "Ljubljana",
    })),
  } as unknown as Itinerary;
}

// ---------------------------------------------------------------------------
// §10 AVAILABILITY CONTRACT — cena NI razpoložljivost
// ---------------------------------------------------------------------------

describe("TASK 44 §10: availability contract (cena ≠ razpoložljivost)", () => {
  test("① SOURCE CONTRACT: nič v kiwitaxi provider kodi NE more nastaviti live_available", () => {
    // Edini status, ki ga kiwitaxi plast kdaj izda, je not_supported
    // (CSV vir koncepta nima). live_available smeta izreči SAMO živa
    // adapterja z dejansko validacijo — če bi kdaj kdo dodal takšno
    // dodelitev v kiwitaxi poti, bi ta test padel.
    for (const f of KT_FILES) {
      const src = readSource(f);
      expect(src.includes("live_available")).toBe(false);
    }
  });

  test("② DATASET-WIDE: VSAH 1494 realnih rut → availability not_supported (nikoli live)", () => {
    const baseline = getKiwitaxiBaseline()!;
    expect(baseline.counts.routes).toBeGreaterThan(1000);
    for (const r of baseline.routes) {
      const p = kiwiRouteToProduct(r, "sl", baseline.fetchedAt);
      expect(p.availability?.status).toBe("not_supported");
      expect(p.availability?.status).not.toBe("live_available");
      expect(p.availability?.status).not.toBe("live_unavailable");
    }
  });

  test("③ INVARIANT »price exists → available=true« je NEMOGOČ: vsak produkt s ceno ima ne-živi status", () => {
    const baseline = getKiwitaxiBaseline()!;
    const withPrice = baseline.routes.filter((r) => r.minPriceEur > 0);
    expect(withPrice.length).toBe(baseline.routes.length); // vse imajo ceno
    for (const r of withPrice) {
      const p = kiwiRouteToProduct(r, "sl", baseline.fetchedAt);
      expect(p.price).toBeDefined(); // cena OBSTOJI
      expect(p.availability?.status).toBe("not_supported"); // a NE trdi razpoložljivosti
    }
  });

  test("④ SANITIZE: cena sama NE ustvari razpoložljivosti (input brez availability → izhod brez)", () => {
    const out = sanitizeSelectedProviderProducts([
      {
        provider: "kiwitaxi",
        providerProductId: "410",
        type: "transfer",
        title: "Ljubljana Airport → Bled",
        price: { amount: 77, currency: "EUR", unit: "per_transfer" },
        // NAMENNO brez availability — cena ga NE sme izmisliti
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].price?.amount).toBe(77);
    expect(out[0].availability).toBeUndefined();
  });

  test("⑤ SANITIZE: not_supported se v AI kontekst NE prenaša kot trditev (odsoten = pošteno)", () => {
    const out = sanitizeSelectedProviderProducts([
      {
        provider: "kiwitaxi",
        providerProductId: "410",
        type: "transfer",
        title: "A → B",
        price: { amount: 77, currency: "EUR", unit: "per_transfer" },
        availability: { status: "not_supported" },
      },
    ]);
    expect(out[0].availability).toBeUndefined();
  });

  test("⑥ AI kontekst nikoli ne izpiše žive razpoložljivosti za CSV produkt", () => {
    const ctx = buildSelectedProductsContext(
      sanitizeSelectedProviderProducts([
        {
          provider: "kiwitaxi",
          providerProductId: "410",
          type: "transfer",
          title: "A → B",
          price: { amount: 77, currency: "EUR", unit: "per_transfer" },
          lat: 46.2,
          lng: 14.4,
        },
      ]),
      "sl"
    );
    expect(ctx).not.toContain("ŽIVO na voljo");
    expect(ctx).not.toContain("LIVE available");
  });
});

// ---------------------------------------------------------------------------
// §11 GEO SEMANTICS
// ---------------------------------------------------------------------------

describe("TASK 44 §11: geo semantike (WKT, geoPrecision, SI sanity)", () => {
  test("① WKT: MultiPolygon / Point / LineString / GeometryCollection → ZAVRNJENO (v viru so SAMO POLYGON)", () => {
    expect(parseWktPolygon("MULTIPOLYGON(((14 46,15 46,15 47,14 46)))")).toBeNull();
    expect(parseWktPolygon("MULTIPOLYGON(((14 46,15 46,15 47,14 46),(14.2 46.2,14.3 46.2,14.3 46.3,14.2 46.2)))")).toBeNull();
    expect(parseWktPolygon("POINT(14.5 46.1)")).toBeNull();
    expect(parseWktPolygon("LINESTRING(14 46,15 47)")).toBeNull();
    expect(parseWktPolygon("GEOMETRYCOLLECTION(POINT(1 2))")).toBeNull();
    expect(parseWktPolygon("POLYGON ((14 46,15 46,15 47,14 46))")).not.toBeNull(); // presledek OK
  });

  test("② WKT: invalid sintaksa (neobdelani oklepaji, manjkajoče točke, sumljive ločila) → NULL", () => {
    expect(parseWktPolygon("POLYGON((14 46,15 46")).toBeNull();
    expect(parseWktPolygon("POLYGON((14 46,15 46,15 47))")).not.toBeNull(); // 3 unikatne = validen trikotnik (meja je 3)
    expect(parseWktPolygon("POLYGON((14 46,15 46))")).toBeNull(); // 2 točki = črta, ni območje
    expect(parseWktPolygon("POLYGON(())")).toBeNull();
    expect(parseWktPolygon("POLYGON((14 46 47,15 46,15 47,14 46))")).toBeNull(); // trojna vrednost
    expect(parseWktPolygon("POLYGON((14;46,15 46,15 47,14 46))")).toBeNull();
  });

  test("③ WKT: NaN / Infinity / -Infinity / eksponent / hex → NULL (ves nabor iz enega testa)", () => {
    for (const bad of [
      "POLYGON((NaN 46,15 46,15 47,NaN 46))",
      "POLYGON((Infinity 46,15 46,15 47,Infinity 46))",
      "POLYGON((-Infinity 46,15 46,15 47,-Infinity 46))",
      "POLYGON((1e999 46,15 46,15 47,1e999 46))", // Infinity prek eksponenta
      "POLYGON((0x10 46,15 46,15 47,0x10 46))",
      "POLYGON((+14 46,15 46,15 47,+14 46))", // + predznak dovoljen — NE sme padati
    ]) {
      if (bad.includes("+14")) {
        expect(parseWktPolygon(bad)).not.toBeNull(); // legitimna oblika
      } else {
        expect(parseWktPolygon(bad)).toBeNull();
      }
    }
  });

  test("④ WKT: out-of-range (|lat|>90, |lng|>180) → NULL; reversed (lat-first) ostane DOKUMENTIRANA meja", () => {
    expect(parseWktPolygon("POLYGON((14 91,15 91,15 92,14 91))")).toBeNull();
    expect(parseWktPolygon("POLYGON((200 46,201 46,201 47,200 46))")).toBeNull();
    // Obrnjene koordinate (lat-first) so V obsegu → parser jih sprejme kot
    // lng-first (nespodoben kraj, ne sesujevost). Struktorna detekcija ni
    // mogoča (obe vrednosti legitimen razpon); vir je DOKUMENTIRAN in živo
    // preverjen lng-first (14.x 46.x = Evropa). Meja je zabeležena v
    // docs/TASK-44-AUDIT.md (§11 YELLOW: struktura ne more ločiti).
    const swapped = parseWktPolygon("POLYGON((46.1 14.1,46.2 14.1,46.2 14.2,46.1 14.1))");
    expect(swapped).not.toBeNull(); // sprejme (obseg OK) — nadaljnja SI sanity ga ulovi
  });

  test("⑤ DATASET-WIDE: vsak pin leži ZNOTRAJ svojega fromBbox (centroid območja)", () => {
    const baseline = getKiwitaxiBaseline()!;
    const pinned = baseline.routes.filter((r) => r.fromLat != null);
    expect(pinned.length).toBeGreaterThan(1000);
    for (const r of pinned) {
      const [s, w, n, e] = r.fromBbox!;
      expect(r.fromLat!).toBeGreaterThanOrEqual(s - 1e-9);
      expect(r.fromLat!).toBeLessThanOrEqual(n + 1e-9);
      expect(r.fromLng!).toBeGreaterThanOrEqual(w - 1e-9);
      expect(r.fromLng!).toBeLessThanOrEqual(e + 1e-9);
    }
  });

  test("⑥ DATASET-WIDE: geografska SI/EU sanity — vsi pini v evropskem okviru (zamaknjene/swapped koordinate bi padle ven)", () => {
    const baseline = getKiwitaxiBaseline()!;
    // Evropa široko (transferji segajo do Dunaja/Zagreba/Trsta/Budimpešte):
    const EU_LAT = [40, 52];
    const EU_LNG = [8, 24];
    for (const r of baseline.routes) {
      if (r.fromLat == null) continue;
      expect(r.fromLat).toBeGreaterThanOrEqual(EU_LAT[0]);
      expect(r.fromLat).toBeLessThanOrEqual(EU_LAT[1]);
      expect(r.fromLng).toBeGreaterThanOrEqual(EU_LNG[0]);
      expect(r.fromLng).toBeLessThanOrEqual(EU_LNG[1]);
    }
  });

  test("⑦ DATASET-WIDE: slovenske prevzeme (SI bbox) so znotraj razširjene Slovenije", () => {
    const baseline = getKiwitaxiBaseline()!;
    // SI: lat 45.4–46.9, lng 13.4–16.6 (+ meja za čezmejna letališče,
    // ki se SEKATA s SI bbox — npr. Klagenfurt/Trst/Zagreb airport)
    const SI_LAT = [45.0, 47.3];
    const SI_LNG = [13.0, 17.0];
    // Kraji znotraj SI bbox → pin mora biti v razširjenem SI okviru.
    let siPins = 0;
    for (const p of baseline.places) {
      if (p.lat == null || p.bbox == null) continue;
      const [s, w, n, e] = p.bbox;
      const inSiView = s >= SI_LAT[0] && n <= SI_LAT[1] && w >= SI_LNG[0] && e <= SI_LNG[1];
      if (!inSiView) continue;
      siPins++;
      expect(p.lat).toBeGreaterThanOrEqual(SI_LAT[0] - 0.5);
      expect(p.lat).toBeLessThanOrEqual(SI_LAT[1] + 0.5);
      expect(p.lng).toBeGreaterThanOrEqual(SI_LNG[0] - 0.5);
      expect(p.lng).toBeLessThanOrEqual(SI_LNG[1] + 0.5);
    }
    expect(siPins).toBeGreaterThan(80); // vsaj slovenski jedro krajev
  });

  test("⑧ geoPrecision: KIWITAXI pin je NIKOLI »exact« (centroid območja = city)", () => {
    const baseline = getKiwitaxiBaseline()!;
    for (const r of baseline.routes.slice(0, 200)) {
      const p = kiwiRouteToProduct(r, "en", baseline.fetchedAt);
      if (p.lat == null) continue; // brez pina ni geoPrecision trditve
      expect(p.geoPrecision).toBe("city");
      expect(p.geoPrecision).not.toBe("exact");
    }
    // Eksplicitna preslikava fixture:
    const p = kiwiRouteToProduct(fixtureRoute({}), "sl", "2026-09-18T00:00:00Z");
    expect(p.geoPrecision).toBe("city");
  });

  test("⑨ lat/lng meje: |lat| ≤ 90, |lng| ≤ 180 na VSEH pinih dataseta", () => {
    const baseline = getKiwitaxiBaseline()!;
    for (const r of baseline.routes) {
      if (r.fromLat == null || r.fromLng == null) continue;
      expect(Math.abs(r.fromLat)).toBeLessThanOrEqual(90);
      expect(Math.abs(r.fromLng)).toBeLessThanOrEqual(180);
      expect(Number.isFinite(r.fromLat)).toBe(true);
      expect(Number.isFinite(r.fromLng)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// §12 SECURITY ADVERSARIAL — fail closed
// ---------------------------------------------------------------------------

describe("TASK 44 §12: security adversarial (URL, injection, dolgi vnosi, oversized)", () => {
  test("① DATASET-WIDE: bookingUrl je VEDNO naša /go konstrukcija (nikoli raw provider URL)", () => {
    const baseline = getKiwitaxiBaseline()!;
    for (const r of baseline.routes) {
      const p = kiwiRouteToProduct(r, "sl", baseline.fetchedAt);
      expect(p.bookingUrl).toMatch(/^\/go\/transfers\?product=\d{1,10}&from=[^&]+&dest=[^&]+$/);
      expect(p.bookingUrl!.startsWith("http")).toBe(false); // NI absoluten
      expect(p.bookingUrl!.includes("javascript:")).toBe(false);
      expect(p.bookingUrl!.includes("data:")).toBe(false);
    }
  });

  test("② DATASET-WIDE: sourceUrl je VEDNO https://kiwitaxi.com/en/... (fiksni host, čista pot)", () => {
    const baseline = getKiwitaxiBaseline()!;
    for (const r of baseline.routes) {
      const p = kiwiRouteToProduct(r, "sl", baseline.fetchedAt);
      expect(p.sourceUrl).toMatch(/^https:\/\/kiwitaxi\.com\/en\/[A-Za-z0-9+~._%/-]+$/);
      const u = new URL(p.sourceUrl!);
      expect(u.protocol).toBe("https:");
      expect(u.hostname).toBe("kiwitaxi.com");
      expect(u.search).toBe(""); // brez queryja iz vira
      expect(u.hash).toBe("");
    }
  });

  test("③ KODIRANI malicious URL: %2e%2e / %2F%2F / %40 / %3A / %252e / neveljavni %ZZ → ZAVRNJENO", () => {
    const cases = [
      "/slovenia/%2e%2e/evil",
      "/slovenia/%2E%2E%2Fevil",
      "/x/%2F%2Fevil.com",
      "/x/%2fevil",
      "/x/%40evil.com",
      "/x/%40%40evil",
      "/x/%3A//evil",
      "/x/%3aevil",
      "/x/%252e%252e", // dvojno kodiran (enkrat dekodirano ostane %2e — varovalka vseeno)
      "/x/%", // samoten odstotek
      "/x/%ZZ", // neveljavna hex sekvenca
      "/x/%G1",
    ];
    for (const url of cases) {
      const { dataset } = mapKiwiTaxiDataset(
        rawRows({ routes: [{ id: "500", url }] }),
        "2026-09-18T00:00:00Z"
      );
      // Ruta z zavrnjeno potjo NIMA veljavnega URL-a → se zavrne celota
      // (distanceKm/timeinway OK, a urlPath null → skipped).
      expect(dataset.routes.find((r) => r.urlPath === url)).toBeUndefined();
      expect(dataset.counts.routes).toBe(0);
    }
  });

  test("④ KODIRANI legitimni format vira (%3E puščica) ŠE VEDNO gre skozi", () => {
    const { dataset } = mapKiwiTaxiDataset(
      rawRows({
        places: [{ id: "100", name_en: "Zagreb Airport", country_id: "1" }, { id: "101", name_en: "Ljubljana" }],
        routes: [{ id: "500", country_id: "1", url: "/croatia/zagreb+airport-%3Eljubljana" }],
      }),
      "2026-09-18T00:00:00Z"
    );
    expect(dataset.counts.routes).toBe(1);
    expect(dataset.routes[0].urlPath).toBe("/croatia/zagreb+airport-%3Eljubljana");
    // sourceUrl absolutiziran na fiksni host:
    const p = kiwiRouteToProduct(dataset.routes[0], "sl", "2026-09-18T00:00:00Z");
    expect(p.sourceUrl).toBe("https://kiwitaxi.com/en/croatia/zagreb+airport-%3Eljubljana");
  });

  test("⑤ HTML/script-like imena: <script>/<img onerror>/javascript: v name_en se OČISTI", () => {
    const { dataset } = mapKiwiTaxiDataset(
      rawRows({
        places: [
          { id: "100", name_en: "<script>alert(1)</script> Bled" },
          { id: "101", name_en: 'Ljubljana"><img src=x onerror=alert(2)>' },
        ],
        routes: [{ id: "500", place_from_id: "100", place_to_id: "101" }],
      }),
      "2026-09-18T00:00:00Z"
    );
    expect(dataset.counts.routes).toBe(1);
    // Kot območja stačena: imena so očiščena vseh HTML/JS znakov
    const from = dataset.places.find((p) => p.id === 100)!;
    const to = dataset.places.find((p) => p.id === 101)!;
    // Meja zaupanja (mapper cleanName): injekcijski znaki odstranjeni
    // (< > " ' ` { } $ \\). Preostalo besedilo (=, onerror kot go tekst) je
    // inertno — React escaping ob renderu je DRUGA plast (globinska
    // obramba, isti vzorec kot OSM adapter).
    for (const name of [from.name, to.name]) {
      for (const ch of ["<", ">", '"', "'", "`", "{", "}", "$"]) {
        expect(name.includes(ch)).toBe(false);
      }
    }
    // Izdelek: naslov/opis nimata tag sintakse:
    const p = kiwiRouteToProduct(dataset.routes[0], "sl", "2026-09-18T00:00:00Z");
    expect(p.title).not.toMatch(/<[^>]*>/);
    expect(p.description ?? "").not.toMatch(/<[^>]*>/);
    expect((p.description ?? "").includes("<script")).toBe(false);
  });

  test("⑥ IZJEMNO dolg providerProductId (10.000 znakov) → sanitize ZAVRNE", () => {
    const out = sanitizeSelectedProviderProducts([
      {
        provider: "kiwitaxi",
        providerProductId: "4".repeat(10_000),
        type: "transfer",
        title: "A → B",
      },
    ]);
    expect(out).toHaveLength(0);
  });

  test("⑦ IZJEMNO dolg URL (10.000 znakov) in ime (10.000 znakov) → mapper ZAVRNE", () => {
    const { dataset } = mapKiwiTaxiDataset(
      rawRows({
        places: [{ id: "100", name_en: "x".repeat(10_000) }, { id: "101" }],
        routes: [{ id: "500", url: "/" + "a".repeat(10_000) }],
      }),
      "2026-09-18T00:00:00Z"
    );
    // Preveč dolgo ime → KRAJ ostane s KAPIKANIM imenom (≤ 80), ne sesuje;
    // preveč dolg URL pot → RUTA se zavrne (URL je obvezen, kap 200).
    expect(dataset.counts.places).toBe(2);
    const longNamed = dataset.places.find((p) => p.id === 100)!;
    expect(longNamed.name.length).toBeLessThanOrEqual(80);
    expect(dataset.counts.routes).toBe(0);
  });

  test("⑧ OVERSIZED WKT (>100.000 znakov IN >2.000 točk) → NULL (kraj brez geo, ne sesuje)", () => {
    // 5.600 točk ≈ 112.000 znakov — PREK OBEH kapik (točke 2.000, dolžina 100k).
    const huge = "POLYGON((" +
      Array.from(
        { length: 5_600 },
        (_, i) => `${(14 + (i % 100) * 0.001).toFixed(6)} ${(46 + (i % 90) * 0.001).toFixed(6)}`
      ).join(",") +
      "))";
    expect(huge.length).toBeGreaterThan(100_000);
    expect(parseWktPolygon(huge)).toBeNull();
    // Kraj z oversized poligonom OSTANE v datasetu (brez geo) — fail-safe:
    const { dataset } = mapKiwiTaxiDataset(
      rawRows({
        places: [{ id: "100", place_polygon: huge }, { id: "101" }],
        routes: [{ id: "500" }],
      }),
      "2026-09-18T00:00:00Z"
    );
    const place = dataset.places.find((p) => p.id === 100)!;
    expect(place.lat).toBeUndefined();
    expect(place.bbox).toBeUndefined();
  });

  test("⑨ MALFORMED WKT v surovem vhodu → kraj brez geo (brez sesutja normalizacije)", () => {
    const { dataset } = mapKiwiTaxiDataset(
      rawRows({
        places: [{ id: "100", place_polygon: "POLYGON((14 46,15 46,15 47" }, { id: "101" }],
        routes: [{ id: "500" }],
      }),
      "2026-09-18T00:00:00Z"
    );
    expect(dataset.counts.places).toBe(2);
    expect(dataset.places.find((p) => p.id === 100)!.lat).toBeUndefined();
  });

  test("⑩ javascript:/data: v bookingUrl poziciji: adapter NIKOLI ne izda takega URL-ja (konstrukcija)", () => {
    // bookingUrl vedno gradimo SAMI iz validiranega cheapestTransferId
    // (števke) — raw provider URL nima poti do telega polja.
    const p = kiwiRouteToProduct(
      fixtureRoute({ cheapestTransferId: 999999999 }),
      "sl",
      "2026-09-18T00:00:00Z"
    );
    expect(p.bookingUrl).toBe(
      "/go/transfers?product=999999999&from=Ljubljana%20Airport&dest=Bled"
    );
  });
});

// ---------------------------------------------------------------------------
// §13 REDIRECT CONTRACT — /go/transfers (route-level)
// ---------------------------------------------------------------------------

describe("TASK 44 §13: redirect contract (/go/transfers)", () => {
  // UVOZ route handlerja NEPOSREDNO (isti vzorec kot supply-route-hardening).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GET } = require("../../app/go/[provider]/route") as {
    GET: (req: Request, ctx: { params: Promise<{ provider: string }> }) => Promise<Response>;
  };

  afterEach(() => {
    delete process.env.KIWITAXI_PAP_ID;
  });

  const call = (qs: string) =>
    GET(new Request(`http://localhost/go/transfers${qs}`), {
      params: Promise.resolve({ provider: "transfers" }),
    });

  test("① VALID product → 302 na https://kiwitaxi.com/en/transfers/{id} (brez pap — NEKONFIGURIRANA monetizacija)", async () => {
    const res = await call("?product=1441&from=Ljubljana%20Airport&dest=Bled");
    expect(res.status).toBe(302);
    const loc = res.headers.get("location")!;
    expect(loc).toMatch(/^https:\/\/kiwitaxi\.com\/en\/transfers\/1441$/);
    expect(loc).not.toContain("pap="); // fail-closed monetizacija
  });

  test("② VALID product + KONFIGURIRAN pap → 302 s pap (monetizacija je LOČENA plast nad enakimi podatki)", async () => {
    process.env.KIWITAXI_PAP_ID = "59942b21df77e";
    const res = await call("?product=1441&from=Ljubljana%20Airport&dest=Bled");
    expect(res.status).toBe(302);
    const loc = res.headers.get("location")!;
    expect(loc).toMatch(/^https:\/\/kiwitaxi\.com\/en\/transfers\/1441\?pap=59942b21df77e$/);
  });

  test("③ INVALID product (javascript:, ../, URL vrednost, presledki) → 400 (fail-closed)", async () => {
    for (const bad of [
      "?product=javascript:alert(1)",
      "?product=../../evil",
      "?product=https://evil.com/x",
      "?product=data:text/html,<script>",
      "?product=1441%20OR%201=1",
      "?product=abc",
      "?product=1441.5",
      "?product=-5",
      "?product=0",
      "?product=99999999999", // 11 števk → čez mejo
      "?product=" + "1".repeat(11),
    ]) {
      const res = await call(bad);
      expect(res.status).toBe(400);
      expect(res.headers.get("location")).toBeNull(); // NIKAMOR ne preusmeri
    }
  });

  test("④ MISSING product → 302 na čisto destinacijsko obliko (kontrolirano, ne 500)", async () => {
    // from ZNAN (Ljubljana) + dest znan (Bled) → iskalni deep-link:
    const res = await call("?from=Ljubljana&dest=Bled");
    expect(res.status).toBe(302);
    const loc = res.headers.get("location")!;
    expect(loc).toMatch(/^https:\/\/kiwitaxi\.com\/en\/search\?from=[^&]+&to=[^&]+$/);
    // from NEPOZNAN (Ljubljana Airport ni v whitelist) → državna stran destinacije:
    const res2 = await call("?from=Ljubljana%20Airport&dest=Bled");
    expect(res2.status).toBe(302);
    expect(res2.headers.get("location")!).toMatch(/^https:\/\/kiwitaxi\.com\/en\/slovenia\/[a-z-]+$/);
  });

  test("⑤ MISSING vsega → 302 na /en/slovenia (fallback, NIKOLI odjemalečev vnos v URL)", async () => {
    const res = await call("");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://kiwitaxi.com/en/slovenia");
  });

  test("⑥ NEZNAN provider (/go/kiwitaxi-product / /go/evil) → 404 (allowlist)", async () => {
    for (const provider of ["kiwitaxi", "evil", "OSM", "transfers2"]) {
      const res = await GET(new Request(`http://localhost/go/${provider}?x=1`), {
        params: Promise.resolve({ provider }),
      });
      expect(res.status).toBe(404);
    }
  });

  test("⑦ OPEN REDIRECT invariant: izhod je VEDNO https + allowlistan host (nikoli odjemalčev URL)", async () => {
    // Napadalni dest/from poskusi prebiti kanonično whitelist:
    for (const qs of [
      "?product=1441&dest=https://evil.com&from=x",
      "?product=1441&dest=javascript:alert(1)&from=x",
      "?dest=<script>&from=<img>",
      "?product=1441&dest=" + "e".repeat(300),
    ]) {
      const res = await call(qs);
      expect([302, 400]).toContain(res.status);
      const loc = res.headers.get("location");
      if (loc) {
        const u = new URL(loc);
        expect(u.protocol).toBe("https:");
        expect(u.hostname).toMatch(/^kiwitaxi\.com$|^www\.kiwitaxi\.com$/);
      }
    }
  });

  test("⑧ MONETIZACIJA NI POGOJ ZA PODATKE: getKiwitaxiUrl brez pap → isti product path, monetized=false", () => {
    delete process.env.KIWITAXI_PAP_ID;
    const { url, monetized } = getKiwitaxiUrl("Bled", "Ljubljana Airport", "1441");
    expect(monetized).toBe(false);
    expect(url).toBe("https://kiwitaxi.com/en/transfers/1441");
    // Podatkovna plast (dataset/adapter/map/modal) deluje BREZ pap —
    // razlikovanje DATA LIVE ≠ MONETIZED ostaja (Task 43 §18).
  });
});

// ---------------------------------------------------------------------------
// §14 + §15 AI FIXED INVARIANT + DUPLICATE TRANSFER
// ---------------------------------------------------------------------------

describe("TASK 44 §14/§15: FIXED transfer skozi chain (imutabilnost + brez dvojnikov)", () => {
  const DEST_COORDS = new Map<string, { lat: number; lng: number }>([
    ["ljubljana", { lat: 46.05, lng: 14.51 }],
    ["bled", { lat: 46.37, lng: 14.11 }],
  ]);

  const KT_PRODUCT: ProviderProduct = {
    id: "kiwitaxi:410",
    provider: "kiwitaxi",
    providerProductId: "410",
    type: "transfer",
    subcategory: "airport_transfer",
    title: "Ljubljana Airport → Bled",
    lat: 46.2254,
    lng: 14.4623,
    geoPrecision: "city",
    address: "Ljubljana Airport",
    price: { amount: 77, currency: "EUR", unit: "per_transfer", fromPrice: true },
    availability: { status: "not_supported" },
    bookingMode: "affiliate_redirect",
    bookingUrl: "/go/transfers?product=1440",
    sourceUrl: "https://kiwitaxi.com/en/slovenia/ljubljana+airport-%3Ebled",
    lastUpdated: "2026-09-18T00:00:00Z",
    license: { source: "KiwiTaxi Partner Data API (CSV)", attribution: "© KiwiTaxi" },
  };

  test("① IMUTABILNOST: vstavljen postanek ohrani ID/naslov/ceno/geo NATANČNO (nič ne mutira)", () => {
    const it = emptyItinerary(3);
    const res = insertProductStop(it, KT_PRODUCT, { locale: "sl", destinationCoords: DEST_COORDS });
    expect(res.ok).toBe(true);
    if (!res.ok || res.kind !== "stop") return;
    const stop = res.itinerary.days.flatMap((d) => d.locations).find(
      (l) => l.destination_id === "kiwitaxi:410"
    )!;
    // Identiteta (AI NE sme zamenjati providerja/ID-ja):
    expect(stop.destination_id).toBe("kiwitaxi:410"); // {provider}:{providerProductId}
    // Naslov točen (nikoli podoben drug produkt):
    expect(stop.destination_name).toBe("Ljubljana Airport → Bled");
    // Cena točna (od 77 € per transfer — ne zaobljená, ne spremenjena):
    expect(stop.estimated_cost).toBe(77);
    expect(stop.notes).toContain("od 77");
    expect(stop.notes).toContain("per transfer");
    // Geo točna:
    expect(stop.lat).toBe(46.2254);
    expect(stop.lng).toBe(14.4623);
    // Vir izrecen:
    expect(stop.notes).toContain("KiwiTaxi");
    expect(stop.category).toBe("supply");
  });

  test("② ISTI produkt dvakrat → drugi vstavek ZAVRNJEN (duplicate) — ni dvojnika", () => {
    const it = emptyItinerary(3);
    const first = insertProductStop(it, KT_PRODUCT, { locale: "sl", destinationCoords: DEST_COORDS });
    expect(first.ok && first.kind === "stop").toBe(true);
    const second = insertProductStop(
      (first.ok && first.kind === "stop" ? first.itinerary : it),
      KT_PRODUCT,
      { locale: "sl", destinationCoords: DEST_COORDS }
    );
    expect(second).toEqual({ ok: false, reason: "duplicate" });
    // Štetje po vseh dnevih: NATANČNO en pojavek.
    const all = (first.ok && first.kind === "stop" ? first.itinerary : it).days
      .flatMap((d) => d.locations)
      .filter((l) => l.destination_id === "kiwitaxi:410");
    expect(all).toHaveLength(1);
  });

  test("③ VEČ izbranih transferjev: vsak se vstavi NATANČNO enkrat (različni dnevi so legitimni)", () => {
    const it = emptyItinerary(3);
    const kt1 = KT_PRODUCT;
    const kt2: ProviderProduct = {
      ...KT_PRODUCT,
      id: "kiwitaxi:411",
      providerProductId: "411",
      title: "Ljubljana Airport → Ljubljana",
      lat: 46.2254,
      lng: 14.4623,
      price: { amount: 48, currency: "EUR", unit: "per_transfer", fromPrice: true },
    };
    let current = it;
    for (const p of [kt1, kt2]) {
      const r = insertProductStop(current, p, { locale: "sl", destinationCoords: DEST_COORDS });
      expect(r.ok).toBe(true);
      if (r.ok && r.kind === "stop") current = r.itinerary;
    }
    const stops = current.days.flatMap((d) => d.locations).filter((l) => l.category === "supply");
    expect(stops).toHaveLength(2);
    expect(stops.filter((s) => s.destination_id === "kiwitaxi:410")).toHaveLength(1);
    expect(stops.filter((s) => s.destination_id === "kiwitaxi:411")).toHaveLength(1);
    // Ceni se NE mešata:
    const s410 = stops.find((s) => s.destination_id === "kiwitaxi:410")!;
    const s411 = stops.find((s) => s.destination_id === "kiwitaxi:411")!;
    expect(s410.estimated_cost).toBe(77);
    expect(s411.estimated_cost).toBe(48);
  });

  test("④ TRANSFER + OSM POI: oba v načrtu (komercialni ne izrine lokalnega in obratno)", () => {
    const it = emptyItinerary(2);
    const osm: ProviderProduct = {
      ...KT_PRODUCT,
      id: "osm:node-42",
      provider: "osm",
      providerProductId: "node-42",
      type: "attraction",
      title: "Blejski grad",
      lat: 46.36,
      lng: 14.11,
      price: undefined,
      bookingMode: "info_only",
    };
    let current = it;
    for (const p of [KT_PRODUCT, osm]) {
      const r = insertProductStop(current, p, { locale: "sl", destinationCoords: DEST_COORDS });
      expect(r.ok).toBe(true);
      if (r.ok && r.kind === "stop") current = r.itinerary;
    }
    const ids = current.days.flatMap((d) => d.locations).map((l) => l.destination_id);
    expect(ids).toContain("kiwitaxi:410");
    expect(ids).toContain("osm:node-42");
  });

  test("⑤ AI KONTEKST: FIXED identiteta izrecna + prepoved izmišljanja prevoza za POKRITO pot", () => {
    const ctx = buildSelectedProductsContext(
      sanitizeSelectedProviderProducts([
        {
          provider: "kiwitaxi",
          providerProductId: "410",
          type: "transfer",
          title: "Ljubljana Airport → Bled",
          lat: 46.2254,
          lng: 14.4623,
          price: { amount: 77, currency: "EUR", unit: "per_transfer", fromPrice: true },
          source: "KiwiTaxi Partner Data API (CSV)",
        },
      ]),
      "sl"
    );
    // Identiteta točna v AI kontekstu:
    expect(ctx).toContain("provider: kiwitaxi");
    expect(ctx).toContain("id: 410");
    expect(ctx).toContain("[FIXED]");
    // §15: prepoved ODVEČNEGA prevoza za isto pot (izbrani transfer JE pokrit):
    expect(ctx).toContain("prevoz je ŽE POKRIT");
    expect(ctx).toContain("NE dodajaj odvečnih");
    // FIXED pravilo (§14):
    expect(ctx).toContain("NE zamenjuj FIXED produkta");
  });

  test("⑥ SANITIZE imutabilnost: provider/productId/type/cena grejo skozi MEJO ZAUPANJA nespremenjeni", () => {
    const input = [
      {
        provider: "kiwitaxi",
        providerProductId: "410",
        type: "transfer",
        title: "Ljubljana Airport → Bled",
        lat: 46.2254,
        lng: 14.4623,
        price: { amount: 77, currency: "EUR", unit: "per_transfer", fromPrice: true },
        source: "KiwiTaxi Partner Data API (CSV)",
      },
    ];
    const out = sanitizeSelectedProviderProducts(input);
    expect(out[0].provider).toBe("kiwitaxi");
    expect(out[0].providerProductId).toBe("410"); // NIč spremembe
    expect(out[0].type).toBe("transfer");
    expect(out[0].price?.amount).toBe(77);
    expect(out[0].price?.unit).toBe("per_transfer");
    expect(out[0].selectionState).toBe("fixed"); // privzeto FIXED
  });

  test("⑦ LAŽNI provider v izbiri (izmišljeni) → sanitize ZAVRNE (AI ne vidi lažnega vira)", () => {
    const out = sanitizeSelectedProviderProducts([
      {
        provider: "viator", // Ni aktivni adapter — vseeno veljaven SLUG registra;
        // za TEST: uporabimo NE-obstoječ slug:
        providerProductId: "1",
        type: "transfer",
        title: "Fake",
      },
      {
        provider: "kiwitaxi-fake",
        providerProductId: "1",
        type: "transfer",
        title: "Fake 2",
      },
    ]);
    expect(out).toHaveLength(1); // samo veljaven slug (viator je v registru)
    expect(out[0].provider).toBe("viator");
    // Neveljaven slug (kiwitaxi-fake) je ODSTRANJEN — AI ne more prejeti
    // izmišljenega providerja; izdelek brez aktivnega adapterja je lahko
    // samo izbira, ne inventar (register je source of truth).
  });

  test("⑧ §15 multi-dan: transfer pride v NAJBLIŽJI dan, ne v vse dni (ni razmnoževanja)", () => {
    const it = emptyItinerary(5);
    const res = insertProductStop(it, KT_PRODUCT, { locale: "sl", destinationCoords: DEST_COORDS });
    expect(res.ok && res.kind === "stop").toBe(true);
    if (!res.ok || res.kind !== "stop") return;
    const daysWith = res.itinerary.days.filter((d) =>
      d.locations.some((l) => l.destination_id === "kiwitaxi:410")
    );
    expect(daysWith).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// §19 REGRESIJA: sanity vrata uredniške skripte (živo odkrita vrzel)
// ---------------------------------------------------------------------------

describe("TASK 44 §19: ingest sanity vrata (regresija žive vrzeli)", () => {
  test("① ŽIVI SCENARIJ: 34-rutni kandidat proti 1494-rutnemu baseline-u → ZAVRNJEN", () => {
    // Točno stanje odkrito 18. 9. 2026: pretrgani CSV prenosi so dali
    // 34 rut / 128 krajev / 240 transferjev — 97 % padec. Vrata morajo
    // zavrniti (cron jih JE imel, uredniška skripta NE — popravljeno).
    const baseline = getKiwitaxiBaseline()!;
    const tiny = {
      ...baseline,
      counts: { places: 128, routes: 34, transfers: 240, pinnedRoutes: 34 },
      places: baseline.places.slice(0, 128),
      routes: baseline.routes.slice(0, 34),
    };
    expect(passesKiwiSanityGate(tiny, baseline)).toBe(false);
  });

  test("② ZDRAV kandidat (~baseline) → gre skozi (vrata ne blokirajo legitimne osvežitve)", () => {
    const baseline = getKiwitaxiBaseline()!;
    expect(passesKiwiSanityGate(baseline, baseline)).toBe(true);
  });

  test("③ SOURCE CONTRACT: uredniška skripta ZDAJ poklical passesKiwiSanityGate PRED zapisom", () => {
    const src = readSource("scripts/ingest-kiwitaxi.ts");
    expect(src.includes("passesKiwiSanityGate(ds, baseline)")).toBe(true);
    // Zapis na disk je ZA vrati (vrstni red v datoteki):
    const gateIdx = src.indexOf("passesKiwiSanityGate(ds, baseline)");
    const writeIdx = src.indexOf("writeFileSync(outPath");
    expect(gateIdx).toBeGreaterThan(-1);
    expect(writeIdx).toBeGreaterThan(gateIdx);
  });
});

// ---------------------------------------------------------------------------
// §20 PROVIDER REGISTRY — EN centralni vir resnice
// ---------------------------------------------------------------------------

describe("TASK 44 §20: provider registry (EN centralni, brez vzporednih seznamov)", () => {
  test("① kiwitaxi je IZKLJUČNO v PROVIDER_REGISTRY (source-scan: ni hardcodedh seznamov)", () => {
    // Datoteke, ki smejo omenjati kiwitaxi (adapter + factory + affiliate
    // semantika + cron + register) — preverimo da NI dodatnega seznama
    // providerjev z "kiwitaxi" kot elementom izven registra.
    const allowed = new Set([
      "src/lib/supply/registry.ts",
      "src/lib/supply/search.ts", // ADAPTER_FACTORIES (dokumentirana razširitvena točka)
      "src/lib/affiliate.ts", // affiliate semantika (drugačen pomen — drift-guard test)
      "src/app/go/[provider]/route.ts", // affiliate redirect allowlist
      "src/app/api/cron/kiwitaxi-reingest/route.ts",
      ...KT_FILES,
    ]);
    const forbidden = [
      "src/components/sections/map-view.tsx",
      "src/components/supply/product-modal.tsx",
      "src/components/supply/product-card.tsx",
      "src/components/supply/provider-panel.tsx",
      "src/lib/supply/sanitize.ts",
      "src/lib/supply/selection.ts",
      "src/lib/supply/stop-insert.ts",
    ];
    // UI/selection plasti ne smejo hardcodirati providerjev — vse gre
    // skozi getProvider/registry.
    for (const f of forbidden) {
      const src = readSource(f);
      expect(src.includes('"kiwitaxi"')).toBe(false);
    }
    // Registry vsebuje EN sam vnos kiwitaxi:
    const kt = PROVIDER_REGISTRY.filter((p) => p.slug === "kiwitaxi");
    expect(kt).toHaveLength(1);
    expect(kt[0].active).toBe(true);
    // search.ts factory se sklicuje SAMO na registrske slug-e:
    const searchSrc = readSource("src/lib/supply/search.ts");
    expect(searchSrc.includes("kiwitaxi: createKiwiTaxiAdapter")).toBe(true);
  });

  test("② factory podpis ustreza registru (goRoute/capabilities iz centra, ne lokalno)", () => {
    const kt = PROVIDER_REGISTRY.find((p) => p.slug === "kiwitaxi")!;
    expect(kt.goRoute).toBe("transfers"); // affiliate ↔ supply usklajen
    expect(kt.capabilities.price).toBe(true);
    expect(kt.capabilities.availability).toBe(false); // §10: koncepta ni
    expect(kt.capabilities.geo).toBe(true);
    expect(kt.status).toBe("static");
  });
});
