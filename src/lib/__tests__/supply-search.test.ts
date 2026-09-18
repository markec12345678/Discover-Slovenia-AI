// ============================================================================
// F1 SUPPLY MAP — TESTI: OSM adapter normalizacija + search runner
// (integration z vbrizganimi test adapterji — NI fake inventarja v
//  produkcijski kodi; mock adapterji živijo samo v testih)
// ============================================================================
import { describe, expect, test } from "bun:test";
import {
  normalizeOsmElement,
  buildSupplyOverpassQuery,
  osmCacheKey,
  roundBboxOutward,
} from "@/lib/supply/osm-adapter";
import { parseSupplyQuery, searchSupply } from "@/lib/supply/search";
import { getProvider } from "@/lib/supply/registry";
import type { SupplyAdapter } from "@/lib/supply/adapter";
import type { ProviderProduct, SupplyQuery } from "@/lib/supply/types";

// ---------------------------------------------------------------------------
// OSM NORMALIZACIJA (Overpass element → kanonski ProviderProduct)
// ---------------------------------------------------------------------------

describe("osm-adapter normalizacija", () => {
  const now = "2026-09-18T00:00:00.000Z";

  test("node z imenom → ProviderProduct z vsemi poštenimi polji", () => {
    const p = normalizeOsmElement(
      {
        type: "node",
        id: 123,
        lat: 46.05,
        lon: 14.5,
        tags: {
          name: "Gostilna Sokol",
          amenity: "restaurant",
          cuisine: "slovenian",
          opening_hours: "Mo-Su 10:00-22:00",
          phone: "+386 1 123 4567",
          website: "https://sokol.example",
          "addr:street": "Mestni trg",
          "addr:housenumber": "5",
          wikidata: "Q123",
        },
      },
      now
    );
    expect(p).not.toBeNull();
    expect(p!.id).toBe("osm:node-123");
    expect(p!.providerProductId).toBe("node-123");
    expect(p!.provider).toBe("osm");
    expect(p!.type).toBe("restaurant");
    expect(p!.bookingMode).toBe("info_only");
    expect(p!.lat).toBe(46.05);
    expect(p!.license?.attribution).toContain("OpenStreetMap");
    expect(p!.phone).toBe("+386 1 123 4567");
    expect(p!.wikidata).toBe("Q123");
    // OSM NIMA cene/ocene → polja OSTANEJO PRAZNA (nikoli izmišljena)
    expect(p!.price).toBeUndefined();
    expect(p!.rating).toBeUndefined();
    // AUDIT 42, točka 11: OSM koncepta razpoložljivosti NIMA → izrecno
    // not_supported (nikoli „available: true", ker nismo preverili nič)
    expect(p!.availability).toEqual({ status: "not_supported" });
    // URL meja (audit 42, točka 15): http(s) spletna stran preide
    expect(p!.sourceUrl).toBe("https://sokol.example");
  });

  test("AUDIT 42: javascript:/data: website → sourceUrl IZPUŠČEN (klik-XSS)", () => {
    const p = normalizeOsmElement(
      {
        type: "node",
        id: 7,
        lat: 46,
        lon: 14,
        tags: {
          name: "Zlobni POI",
          tourism: "museum",
          website: "javascript:alert(1)",
          "contact:website": "javascript:alert(2)",
        },
      },
      now
    );
    expect(p).not.toBeNull();
    expect(p!.sourceUrl).toBeUndefined();
  });

  test("AUDIT 42: http URL v contact:website nadomesti zlobni website tag", () => {
    const p = normalizeOsmElement(
      {
        type: "node",
        id: 8,
        lat: 46,
        lon: 14,
        tags: {
          name: "Mešani",
          tourism: "museum",
          website: "data:text/html,evil",
          "contact:website": "https://pravi.example",
        },
      },
      now
    );
    expect(p!.sourceUrl).toBe("https://pravi.example");
  });

  test("AUDIT 42: wikimedia_commons 'File:X.jpg' → Commons FilePath + kredit", () => {
    const p = normalizeOsmElement(
      {
        type: "node",
        id: 9,
        lat: 46,
        lon: 14,
        tags: {
          name: "Grad",
          historic: "castle",
          wikimedia_commons: "File:Bled Castle.jpg",
        },
      },
      now
    );
    expect(p!.image).toBe(
      "https://commons.wikimedia.org/wiki/Special:FilePath/Bled%20Castle.jpg?width=800"
    );
    expect(p!.imageCredit).toBe("Wikimedia Commons");
  });

  test("AUDIT 42: zlonameren image tag (javascript:/data:) → brez slike", () => {
    const p = normalizeOsmElement(
      {
        type: "node",
        id: 10,
        lat: 46,
        lon: 14,
        tags: { name: "X", tourism: "museum", image: "javascript:alert(1)" },
      },
      now
    );
    expect(p!.image).toBeUndefined();
    expect(p!.imageCredit).toBeUndefined();
  });

  test("AUDIT 42 (točka 1): kamp (tourism=camp_site) → accommodation", () => {
    const p = normalizeOsmElement(
      {
        type: "node",
        id: 11,
        lat: 46,
        lon: 14,
        tags: { name: "Kamp Bled", tourism: "camp_site" },
      },
      now
    );
    expect(p!.type).toBe("accommodation");
    expect(p!.subcategory).toBe("camp_site");
  });

  test("way z center → koordinate iz center", () => {
    const p = normalizeOsmElement(
      {
        type: "way",
        id: 456,
        center: { lat: 46.36, lon: 14.11 },
        tags: { name: "Blejski grad", historic: "castle" },
      },
      now
    );
    expect(p).not.toBeNull();
    expect(p!.type).toBe("attraction");
    expect(p!.lat).toBe(46.36);
    expect(p!.id).toBe("osm:way-456");
  });

  test("brez imena → null (brez uporabnosti)", () => {
    expect(
      normalizeOsmElement({ type: "node", id: 1, lat: 46, lon: 14, tags: { amenity: "cafe" } }, now)
    ).toBeNull();
  });

  test("brez koordinat → null", () => {
    expect(
      normalizeOsmElement({ type: "node", id: 1, tags: { name: "X", tourism: "museum" } }, now)
    ).toBeNull();
  });

  test("nepoznan tag nabor → null (ne ugamemo tipa)", () => {
    expect(
      normalizeOsmElement(
        { type: "node", id: 1, lat: 46, lon: 14, tags: { name: "X", man_made: "pier" } },
        now
      )
    ).toBeNull();
  });

  test("preslikave tipov: hotel/apartment/viewpoint/shop", () => {
    const mk = (tags: Record<string, string>) =>
      normalizeOsmElement({ type: "node", id: 9, lat: 46, lon: 14, tags: { name: "T", ...tags } }, now);
    expect(mk({ tourism: "hotel" })?.type).toBe("accommodation");
    expect(mk({ tourism: "apartment" })?.type).toBe("accommodation");
    expect(mk({ tourism: "viewpoint" })?.type).toBe("viewpoint");
    expect(mk({ shop: "wine" })?.type).toBe("shop");
    expect(mk({ natural: "waterfall" })?.type).toBe("natural");
    expect(mk({ tourism: "museum" })?.type).toBe("museum");
    expect(mk({ amenity: "place_of_worship" })?.type).toBe("religious");
  });
});

// ---------------------------------------------------------------------------
// OVERPASS QUERY — bbox se DEJANSKO upošteva (popravek audita!)
// ---------------------------------------------------------------------------

describe("supply overpass query", () => {
  test("bbox pride v VSAK filter izraz", () => {
    const q = buildSupplyOverpassQuery(
      [45.9, 13.9, 46.2, 14.3],
      ["attraction", "museum"],
      200
    );
    expect(q).not.toBeNull();
    expect(q!.match(/\(45\.9,13\.9,46\.2,14\.3\)/g)!.length).toBeGreaterThanOrEqual(2);
  });

  test("prazen nabor filtrov → null", () => {
    expect(buildSupplyOverpassQuery([45, 13, 46, 14], ["flight"], 100)).toBeNull();
  });

  test("roundBboxOutward zaokroži NAVZVEN (nikoli odreže pinov)", () => {
    const r = roundBboxOutward([46.123456, 14.123456, 46.223456, 14.223456]);
    expect(r[0]).toBeLessThanOrEqual(46.123456);
    expect(r[1]).toBeLessThanOrEqual(14.123456);
    expect(r[2]).toBeGreaterThanOrEqual(46.223456);
    expect(r[3]).toBeGreaterThanOrEqual(14.223456);
  });

  test("cache ključ: sosednja ploščica → isti ključ", () => {
    const a = osmCacheKey([46.10, 14.10, 46.14, 14.14], ["attraction"]);
    const b = osmCacheKey([46.11, 14.11, 46.13, 14.13], ["attraction"]);
    expect(a).toBe(b);
    const c = osmCacheKey([46.10, 14.10, 46.14, 14.14], ["museum"]);
    expect(a).not.toBe(c);
  });
});

// ---------------------------------------------------------------------------
// QUERY VALIDACIJA (parseSupplyQuery)
// ---------------------------------------------------------------------------

describe("parseSupplyQuery", () => {
  test("veljaven viewport", () => {
    const r = parseSupplyQuery({ bbox: "45.9,13.9,46.2,14.3", zoom: "12", cats: "attraction,museum", locale: "sl" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.query.bbox).toEqual([45.9, 13.9, 46.2, 14.3]);
      expect(r.query.zoom).toBe(12);
      expect(r.query.cats).toEqual(["attraction", "museum"]);
    }
  });

  test("neveljaven bbox: napačno št. vrednosti / presek / area", () => {
    expect(parseSupplyQuery({ bbox: "1,2,3" }).ok).toBe(false);
    expect(parseSupplyQuery({ bbox: "46,14,46,14" }).ok).toBe(false); // s >= n
    expect(parseSupplyQuery({ bbox: "0,0,50,50" }).ok).toBe(false); // area cap (zoom 8)
    expect(parseSupplyQuery({ bbox: "a,b,c,d" }).ok).toBe(false);
  });

  test("AUDIT 42 (42-e F5): meja površine PO ZOOM-u — državna POVZRAVČNA poizvedba pri zoom=14 zavrnjena", () => {
    // 6°×6° = 36 deg² je pri zoom<10 OK (državni pogled — gated vseeno),
    // pri zoom=14 pa meja 4 deg² zavrne drag ulični poizvedbi po pol države.
    expect(parseSupplyQuery({ bbox: "43,11,49,17", zoom: "9" }).ok).toBe(true);
    expect(parseSupplyQuery({ bbox: "43,11,49,17", zoom: "14" }).ok).toBe(false);
    const r = parseSupplyQuery({ bbox: "43,11,44,12", zoom: "14" });
    expect(r.ok).toBe(true); // 1 deg² — legitimni ulični viewport
  });

  test("AUDIT 42 (42-e F4): cats dedupe + kap", () => {
    const dup = parseSupplyQuery({ cats: "attraction,attraction,attraction" });
    expect(dup.ok).toBe(true);
    if (dup.ok) expect(dup.query.cats).toEqual(["attraction"]);

    const many = Array.from({ length: 40 }, (_, i) =>
      i % 2 === 0 ? "attraction" : "museum"
    ).join(",");
    const r = parseSupplyQuery({ cats: many });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.query.cats.length).toBeLessThanOrEqual(2); // tudi po dedupe
  });

  test("neveljavne kategorije → napaka; neznana kategorija se odstrani", () => {
    expect(parseSupplyQuery({ cats: "fake-cat" }).ok).toBe(false);
    const r = parseSupplyQuery({ cats: "attraction,fake-cat" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.query.cats).toEqual(["attraction"]);
  });

  test("zoom clamp + privzete vrednosti", () => {
    const r = parseSupplyQuery({ zoom: "99" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.query.zoom).toBe(19);
  });

  test("pax/date validacija", () => {
    expect(parseSupplyQuery({ pax: "21" }).ok).toBe(false);
    expect(parseSupplyQuery({ pax: "0" }).ok).toBe(false);
    expect(parseSupplyQuery({ date: "18-09-2026" }).ok).toBe(false);
    const r = parseSupplyQuery({ date: "2026-09-18", pax: "4" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.query.date).toBe("2026-09-18");
      expect(r.query.pax).toBe(4);
    }
  });
});

// ---------------------------------------------------------------------------
// SEARCH RUNNER — integration z vbrizganimi adapterji
// (mock adapterji so TEST-ONLY — produkcijska pot uporablja defaultAdapters)
// ---------------------------------------------------------------------------

function makeMockAdapter(
  slug: "osm" | "fsq" | "kiwitaxi",
  products: ProviderProduct[],
  opts: { fail?: boolean; entry?: SupplyAdapter["entry"] } = {}
): SupplyAdapter {
  const entry = opts.entry ?? getProvider(slug)!;
  return {
    entry,
    lastRunCached: () => false,
    async search(_q: SupplyQuery) {
      if (opts.fail) throw new Error("adapter down");
      return products;
    },
  };
}

const mkProduct = (over: Partial<ProviderProduct>): ProviderProduct => ({
  id: "osm:node-1",
  provider: "osm",
  providerProductId: "node-1",
  type: "attraction",
  title: "Test",
  bookingMode: "info_only",
  lastUpdated: "2026-09-18T00:00:00.000Z",
  lat: 46.1,
  lng: 14.1,
  ...over,
});

describe("searchSupply runner", () => {
  test("zoom gating: z5 → 0 produktov tudi če adapter vrne", async () => {
    const adapter = makeMockAdapter("osm", [mkProduct({})]);
    const r = await searchSupply(
      { zoom: 5, cats: ["attraction"], locale: "sl", bbox: [46, 14, 46.2, 14.2] },
      [adapter]
    );
    expect(r.products.length).toBe(0);
    expect(r.adapters[0].note).toBe("zoom-gated");
  });

  test("AUDIT 42 (OBVEZNO): nizek zoom → adapter se SPOH NE pokliče (ni drage poizvedbe)", async () => {
    let calls = 0;
    const adapter: SupplyAdapter = {
      entry: getProvider("osm")!,
      lastRunCached: () => false,
      async search() {
        calls++;
        return [mkProduct({})];
      },
    };
    await searchSupply(
      { zoom: 9, cats: ["attraction"], locale: "sl", bbox: [46, 14, 46.2, 14.2] },
      [adapter]
    );
    expect(calls).toBe(0); // z<10: vidnih kategorij ni → izvedba NIKOLI
  });

  test("AUDIT 42 (OBVEZNO): visok zoom → adapter se pokliče", async () => {
    let calls = 0;
    const adapter: SupplyAdapter = {
      entry: getProvider("osm")!,
      lastRunCached: () => false,
      async search() {
        calls++;
        return [mkProduct({})];
      },
    };
    const r = await searchSupply(
      { zoom: 13, cats: ["attraction"], locale: "sl", bbox: [46, 14, 46.2, 14.2] },
      [adapter]
    );
    expect(calls).toBe(1);
    expect(r.products.length).toBe(1);
  });

  test("AUDIT 42 (OBVEZNO): majhen bbox → adapter dobi NATANČEN viewport", async () => {
    let seen: SupplyQuery | null = null;
    const adapter: SupplyAdapter = {
      entry: getProvider("osm")!,
      lastRunCached: () => false,
      async search(q) {
        seen = q;
        return [];
      },
    };
    const small: [number, number, number, number] = [46.05, 14.48, 46.08, 14.53];
    await searchSupply({ zoom: 14, cats: ["museum"], locale: "sl", bbox: small }, [adapter]);
    expect(seen!.bbox).toEqual(small); // bbox pride NEPOSPREMEMNJEN do adapterja
    // Overpass QL niz nosi zaokrožen (navzven) mali viewport — ne Slovenije
    const q = buildSupplyOverpassQuery(small, ["museum"], 100);
    expect(q).not.toBeNull();
    expect(q!).toContain("46.04,14.48"); // roundBboxOutward(navzven) na 0.02°
    expect(q!).toContain("46.08,14.54");
    expect(q!).not.toContain("45.4"); // ni fiksnega SI bbox-a
  });

  test("graceful degradation: padli adapter → degraded[], drugi nadaljuje", async () => {
    const ok = makeMockAdapter("osm", [mkProduct({ id: "osm:node-1", title: "A" })]);
    const failing = makeMockAdapter("fsq", [], { fail: true });
    const r = await searchSupply(
      { zoom: 14, cats: ["attraction"], locale: "sl", bbox: [46, 14, 46.2, 14.2] },
      [ok, failing]
    );
    expect(r.degraded).toContain("fsq");
    expect(r.products.length).toBe(1);
    const fsqInfo = r.adapters.find((a) => a.slug === "fsq");
    expect(fsqInfo?.ok).toBe(false);
  });

  test("cap: več kot maxProductsForZoom → obrezano", async () => {
    const many = Array.from({ length: 500 }, (_, i) =>
      mkProduct({ id: `osm:node-${i}`, providerProductId: `node-${i}`, title: `P${i}`, lat: 46 + (i % 10) * 0.001, lng: 14 + (i % 10) * 0.001 })
    );
    const adapter = makeMockAdapter("osm", many);
    const r = await searchSupply(
      { zoom: 16, cats: ["attraction"], locale: "sl", bbox: [46, 14, 46.01, 14.01] },
      [adapter]
    );
    expect(r.products.length).toBeLessThanOrEqual(500);
    expect(r.products.length).toBeGreaterThan(0);
  });

  test("kategorija, ki je adapter ne podpira → adapter se NE kliče", async () => {
    // OSM adapter ne pokriva tipa "flight" → zoom-gated (ne izvedba).
    const adapter = makeMockAdapter("osm", [mkProduct({ type: "attraction" })]);
    const r = await searchSupply(
      { zoom: 14, cats: ["flight"], locale: "sl", bbox: [46, 14, 46.2, 14.2] },
      [adapter]
    );
    expect(r.products.length).toBe(0);
    expect(r.adapters[0].note).toBe("zoom-gated");
  });

  test("prazne kategorije → privzeti nabor (kompatibilnost)", async () => {
    const adapter = makeMockAdapter("osm", [mkProduct({ type: "museum", title: "M" })]);
    const r = await searchSupply(
      { zoom: 14, cats: [], locale: "sl", bbox: [46, 14, 46.2, 14.2] },
      [adapter]
    );
    expect(r.query.cats).toContain("museum");
  });

  test("counts + duplicates v odgovoru", async () => {
    const dup = [mkProduct({ title: "A" }), mkProduct({ title: "A", rating: 4 })];
    const r = await searchSupply(
      { zoom: 14, cats: ["attraction"], locale: "sl", bbox: [46, 14, 46.2, 14.2] },
      [makeMockAdapter("osm", dup)]
    );
    expect(r.duplicates).toBe(1);
    expect(r.counts.byType.attraction).toBe(1);
    expect(r.counts.byProvider.osm).toBe(1);
  });
});
