// ============================================================================
// F1 SUPPLY MAP — TESTI: registry, zoom, dedupe, taxonomy
// ============================================================================
import { describe, expect, test } from "bun:test";
import {
  PROVIDER_REGISTRY,
  getProvider,
  isProviderSlug,
  activeProviders,
  affiliateCardProviders,
} from "@/lib/supply/registry";
import { TAXONOMY, isProductType, DEFAULT_SUPPLY_TYPES } from "@/lib/supply/taxonomy";
import {
  clampZoom,
  maxProductsForZoom,
  typesVisibleAtZoom,
  SUPPLY_MIN_ZOOM,
} from "@/lib/supply/zoom";
import {
  dedupeProducts,
  geohash,
  normalizeTitle,
  dedupeKey,
} from "@/lib/supply/dedupe";

// ---------------------------------------------------------------------------
// REGISTRY — invarianti iskrenosti (affiliate NIKOLI kot inventar)
// ---------------------------------------------------------------------------

describe("supply registry — invarianti", () => {
  test("unikatni slugi", () => {
    const slugs = PROVIDER_REGISTRY.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  test("vsak vnos ima SL+EN oznaki", () => {
    for (const p of PROVIDER_REGISTRY) {
      expect(p.labels.sl.length).toBeGreaterThan(0);
      expect(p.labels.en.length).toBeGreaterThan(0);
    }
  });

  test("AFFILIATE-only providerji NIMAJMO inventarskih zmožnosti (izjema: adapter z runtime gate — Task 45)", () => {
    // Ključno pravilo naročnika: affiliate URL NI inventar. Provider, ki ima
    // SAMO affiliate_deep_link dostop, ne sme trditi geo/cene/razpoložljivosti
    // — RAZEN če ima IMPLEMENTIRAN adapter za živo preverjeno pogodbo, ki je
    // zaščiten z runtime capability gate (viator, Task 45: brez VIATOR_API_KEY
    // vrne iskreno PRAZEN sloj — zmožnosti opisujejo pogodbo, ne stanje).
    const RUNTIME_GATED_ADAPTERS = new Set(["viator"]); // Task 45
    for (const p of PROVIDER_REGISTRY) {
      const onlyAffiliate =
        p.inventoryAccess.length === 1 &&
        p.inventoryAccess[0] === "affiliate_deep_link";
      if (onlyAffiliate && !RUNTIME_GATED_ADAPTERS.has(p.slug)) {
        expect(p.capabilities.geo).toBe(false);
        expect(p.capabilities.price).toBe(false);
        expect(p.capabilities.availability).toBe(false);
        expect(p.capabilities.map).toBe(false);
        expect(p.active).toBe(false); // ni adapterja brez inventarja!
      }
    }
  });

  test("aktivni adapterji: lokalni vir + dokazano priklopljeni komercialni (Task 43+45)", () => {
    // F1: aktivni so izključno adapterji z DEJANSKO prisotnim podatkom
    // (nikoli "na silo"). Po Task 43: osm (lokalni) + kiwitaxi (prvi realni
    // komercialni — statičen CSV dataset, ki je verzioniran v gitu).
    // Po Task 45: + viator (drugi realni adapter — ŽIVO preverjena pogodba,
    // runtime capability gate: brez VIATOR_API_KEY plast iskreno PRAZNA).
    const active = activeProviders();
    expect(active.length).toBe(3);
    expect(active.map((p) => p.slug).sort()).toEqual(["kiwitaxi", "osm", "viator"]);

    const osm = active.find((p) => p.slug === "osm")!;
    expect(osm.group).toBe("local");
    expect(osm.status).toBe("local");

    // Task 43 invariante za kiwitaxi: statičen inventar (NE živ), cene,
    // geo, mapa — a BREZ razpoložljivosti (CSV je nima) in brez lažnega
    // „live" statusa.
    const kt = active.find((p) => p.slug === "kiwitaxi")!;
    expect(kt.group).toBe("commercial");
    expect(kt.status).toBe("static");
    expect(kt.inventoryAccess).toContain("static_content");
    expect(kt.inventoryAccess).toContain("affiliate_deep_link");
    expect(kt.capabilities.geo).toBe(true);
    expect(kt.capabilities.price).toBe(true);
    expect(kt.capabilities.availability).toBe(false);
    expect(kt.capabilities.map).toBe(true);
    expect(kt.types).toEqual(["transfer"]);

    // Task 45 invariante za viator: ŽIVO preverjena pogodba, status
    // iskreno „affiliate" (API ključ še ni izdan → NI lažnega „live"),
    // zmožnosti po pogodbi (cena/geo/slike/ocene), BREZ razpoložljivosti
    // (Basic Access nima /availability/check), env ključ + runtime gate.
    const vt = active.find((p) => p.slug === "viator")!;
    expect(vt.group).toBe("commercial");
    expect(vt.status).toBe("affiliate"); // iskren status DANEŠ
    expect(vt.inventoryAccess).toEqual(["affiliate_deep_link"]); // dejanski dostop
    expect(vt.capabilities.geo).toBe(true);
    expect(vt.capabilities.price).toBe(true);
    expect(vt.capabilities.availability).toBe(false); // Basic Access: NE
    expect(vt.capabilities.images).toBe(true);
    expect(vt.capabilities.reviews).toBe(true);
    expect(vt.capabilities.map).toBe(true);
    expect(vt.types).toEqual(["activity", "tour"]); // kanonska taksonomija
    expect(vt.envKeys.api).toContain("VIATOR_API_KEY");
    expect(vt.minZoom).toBeGreaterThanOrEqual(10); // viewport gating
    expect(vt.cacheTtlMs).toBeGreaterThan(0); // živi vir, a TTL (NE no-store regresija)

    // Vsi ostali komercialni providerji ostajajo NEAKTIVNI (dokler nimajo
    // dokazanega dostopa do inventarja — affiliate povezava NI inventar;
    // izjema viator: adapter z runtime gate, Task 45).
    for (const p of PROVIDER_REGISTRY) {
      if (
        p.group === "commercial" &&
        p.slug !== "kiwitaxi" &&
        p.slug !== "viator"
      ) {
        expect(p.active).toBe(false);
      }
    }
  });

  test("lokalni viri so ločena skupina od komercialnih", () => {
    for (const p of PROVIDER_REGISTRY) {
      if (p.group === "local" || p.group === "own") {
        expect(p.inventoryAccess).not.toContain("affiliate_deep_link");
      }
    }
  });

  test("kartični providerji imajo veljaven goRoute", () => {
    const valid = new Set([
      "hotels", "cars", "activities", "flights", "insurance",
      "esim", "transfers", "transport", "tickets", "viator",
    ]);
    for (const p of affiliateCardProviders()) {
      expect(valid.has(p.goRoute!)).toBe(true);
    }
  });

  test("isProviderSlug/getProvider delujeta", () => {
    expect(isProviderSlug("osm")).toBe(true);
    expect(isProviderSlug(" booking")).toBe(false);
    expect(isProviderSlug("fake-provider")).toBe(false);
    expect(getProvider("viator")?.group).toBe("commercial");
    expect(getProvider("ne-obstaja")).toBeUndefined();
  });

  test("restavracije ostanejo LOKALNI sloj (brez komercialnega vira)", () => {
    // Naročnik: komercialnega restaurant inventoryja NE izmišljujemo.
    const commercialFood = PROVIDER_REGISTRY.filter(
      (p) => p.group === "commercial" && p.types.includes("restaurant")
    );
    expect(commercialFood.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TAKSONOMIJA
// ---------------------------------------------------------------------------

describe("supply taxonomy", () => {
  test("vsi ProductType imajo vnos", () => {
    const types = [
      "accommodation", "restaurant", "shop", "attraction", "museum",
      "viewpoint", "natural", "religious", "activity", "tour", "ticket",
      "transfer", "car_rental", "transport", "flight", "esim", "insurance",
      "poi",
    ];
    for (const t of types) {
      expect(isProductType(t)).toBe(true);
      expect(TAXONOMY[t].icon.length).toBeGreaterThan(0);
      expect(TAXONOMY[t].label.sl.length).toBeGreaterThan(0);
      expect(TAXONOMY[t].label.en.length).toBeGreaterThan(0);
    }
    expect(isProductType("hotel")).toBe(false); // stara vrednost → kanonsko accommodation
    expect(isProductType("fake")).toBe(false);
  });

  test("privzeti tipi so lokalni z OSM filtri", () => {
    for (const t of DEFAULT_SUPPLY_TYPES) {
      expect((TAXONOMY[t].osmFilters?.length ?? 0)).toBeGreaterThan(0);
    }
  });

  test("goste kategorije imajo višji minZoom", () => {
    // Restavracije/trgovine so goste → prikaz šele poglobljeno.
    expect(TAXONOMY.restaurant.minZoom).toBeGreaterThanOrEqual(13);
    expect(TAXONOMY.shop.minZoom).toBeGreaterThanOrEqual(13);
    expect(TAXONOMY.attraction.minZoom).toBeLessThanOrEqual(8);
  });
});

// ---------------------------------------------------------------------------
// ZOOM GATING
// ---------------------------------------------------------------------------

describe("supply zoom gating", () => {
  test("nizki zoom → 0 produktov (ne 'celotna Slovenija')", () => {
    expect(maxProductsForZoom(5)).toBe(0);
    expect(maxProductsForZoom(7)).toBe(0);
    expect(maxProductsForZoom(7.9)).toBe(0);
  });

  test("kape naraščajo z zoomom", () => {
    const caps = [8, 10, 12, 14, 16].map((z) => maxProductsForZoom(z));
    for (let i = 1; i < caps.length; i++) {
      expect(caps[i]).toBeGreaterThanOrEqual(caps[i - 1]);
    }
    expect(maxProductsForZoom(16)).toBeLessThanOrEqual(500);
  });

  test("typesVisibleAtZoom filtrira po minZoom", () => {
    const all = ["attraction", "restaurant", "museum"] as const;
    expect(typesVisibleAtZoom(5, [...all])).toEqual([]);
    expect(typesVisibleAtZoom(9, [...all])).toEqual([]); // državna raven: ni pinov
    expect(typesVisibleAtZoom(10, [...all])).not.toContain("restaurant");
    expect(typesVisibleAtZoom(10, [...all])).toContain("attraction");
    expect(typesVisibleAtZoom(13, [...all])).toContain("restaurant");
  });

  test("clampZoom boundariji", () => {
    expect(clampZoom(3)).toBe(3);
    expect(clampZoom(25)).toBe(19);
    expect(clampZoom("x")).toBe(8); // fallback
    expect(clampZoom(12.7)).toBe(12);
  });

  test("SUPPLY_MIN_ZOOM je smiseln prag (regijska raven, ne državna)", () => {
    // z≤9 = državni pogled (pretežke poizvedbe) → prag 10.
    expect(SUPPLY_MIN_ZOOM).toBeGreaterThanOrEqual(10);
    expect(SUPPLY_MIN_ZOOM).toBeLessThanOrEqual(11);
  });
});

// ---------------------------------------------------------------------------
// DEDUPE
// ---------------------------------------------------------------------------

describe("supply dedupe", () => {
  const base = {
    provider: "osm" as const,
    providerProductId: "node-1",
    type: "attraction" as const,
    title: "Blejski grad",
    bookingMode: "info_only" as const,
    lastUpdated: "2026-09-18T00:00:00.000Z",
  };

  test("geohash: isti točki → isti ključ, oddaljeni → različen", () => {
    // 46.3,14.1 in 46.3003,14.1002 (~36 m narazen) sta PREVERJENO v isti
    // 7-mestni celici (u24p2ue) — meja celice ni med njima.
    expect(geohash(46.3, 14.1, 7)).toBe(geohash(46.3003, 14.1002, 7));
    expect(geohash(46.3, 14.1, 7)).not.toBe(geohash(45.5, 13.9, 7));
    // referenčna vrednost (geohash.org): 57.64911,10.40744 → u4pruyd
    expect(geohash(57.64911, 10.40744, 7)).toBe("u4pruyd");
    expect(geohash(57.64911, 10.40744, 11)).toBe("u4pruydqqvj");
  });

  test("normalizeTitle: čšž/diakritika/ločila", () => {
    expect(normalizeTitle("Šmartinski Dvorec")).toBe("smartinski dvorec");
    expect(normalizeTitle("Gostilna Pri' Jožu!")).toBe("gostilna pri jozu");
  });

  test("isti ID → drugi zapis odstranjen (dedupe po id)", () => {
    const a = { ...base, id: "osm:node-1", lat: 46.3, lng: 14.1 };
    const b = { ...base, id: "osm:node-1", lat: 46.3003, lng: 14.1002, rating: 4.5 };
    const r = dedupeProducts([a, b]);
    expect(r.products.length).toBe(1);
    expect(r.duplicates).toBe(1);
    expect(r.products[0].rating).toBeUndefined(); // b odstranjen po ID-ju
  });

  test("isti ključ (geo+ime), različna ID → bogatejši zapis prevlada", () => {
    const a = { ...base, id: "osm:node-1", providerProductId: "node-1", lat: 46.3, lng: 14.1 };
    const b = {
      ...base,
      id: "osm:way-2",
      providerProductId: "way-2",
      lat: 46.3003,
      lng: 14.1002,
      rating: 4.5,
      reviewCount: 20,
    };
    const r = dedupeProducts([a, b]);
    expect(r.products.length).toBe(1);
    expect(r.duplicates).toBe(1);
    expect(r.products[0].rating).toBe(4.5);
  });

  test("čez-vir: OSM + FSQ isto ime/lokacija → en pin z altSources", () => {
    const osm = { ...base, id: "osm:node-9", lat: 46.3, lng: 14.1 };
    const fsq = {
      ...base,
      id: "fsq:abc123",
      provider: "fsq" as const,
      providerProductId: "abc123",
      lat: 46.3003, // PREVERJENO ista celica kot osm (u24p2ue)
      lng: 14.1002,
      rating: 4.2,
      reviewCount: 30,
    };
    const r = dedupeProducts([osm, fsq]);
    expect(r.products.length).toBe(1);
    expect(r.duplicates).toBe(1);
    expect(r.products[0].altSources).toContain("osm");
    expect(r.products[0].provider).toBe("fsq"); // bogatejši (ocena+recenzije)
  });

  test("različni imeni na isti lokaciji → NE združi", () => {
    const a = { ...base, id: "osm:node-1", title: "Muzej A", lat: 46.3, lng: 14.1 };
    const b = { ...base, id: "osm:node-2", title: "Muzej B", lat: 46.3003, lng: 14.1002 };
    const r = dedupeProducts([a, b]);
    expect(r.products.length).toBe(2);
    expect(r.duplicates).toBe(0);
  });

  test("brez geo → dedupe po provider+ime", () => {
    const a = { ...base, id: "airalo:si-1", title: "eSIM Slovenija", provider: "airalo" as const, providerProductId: "si-1", type: "esim" as const, bookingMode: "affiliate_redirect" as const };
    const b = { ...a, id: "airalo:si-1", rating: undefined };
    const r = dedupeProducts([a, b]);
    expect(r.products.length).toBe(1);
    void b.rating;
  });

  test("dedupeKey stabilnost", () => {
    const p = { ...base, id: "osm:node-1", lat: 46.3558, lng: 14.1050 };
    expect(dedupeKey(p)).toBe(dedupeKey(p));
    expect(dedupeKey(p)).toContain(normalizeTitle(p.title));
  });
});
