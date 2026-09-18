// ============================================================================
// F1 SUPPLY MAP — TESTI: sanitize izbranih produktov (AI meja zaupanja)
// + buildSelectedProductsContext (FIXED/PREFERRED/SUGGESTED)
// + insertProductStop (deterministično vstavljanje)
// ============================================================================
import { describe, expect, test } from "bun:test";
import {
  sanitizeSelectedProviderProducts,
  buildSelectedProductsContext,
  MAX_SELECTED_PRODUCTS,
} from "@/lib/supply/sanitize";
import { insertProductStop, removeProductStop } from "@/lib/supply/stop-insert";
import type { Itinerary } from "@/lib/types";
import type { ProviderProduct, SelectedProviderProduct } from "@/lib/supply/types";

// ---------------------------------------------------------------------------
// SANITIZE — meja zaupanja klient → AI
// ---------------------------------------------------------------------------

describe("sanitizeSelectedProviderProducts", () => {
  test("veljaven vnos preide celo", () => {
    const out = sanitizeSelectedProviderProducts([
      {
        provider: "osm",
        providerProductId: "node-123",
        type: "attraction",
        title: "Blejski grad",
        lat: 46.36,
        lng: 14.11,
        price: { amount: 12, currency: "EUR", unit: "per_person" },
        source: "OpenStreetMap",
        selectionState: "fixed",
        bookingUrl: "https://evil.example/should-be-dropped",
      },
    ]);
    expect(out.length).toBe(1);
    expect(out[0].title).toBe("Blejski grad");
    expect(out[0].price?.amount).toBe(12);
    // bookingUrl se NAMENOMA odstrani — rezervacija teče prek /go
    expect(out[0].bookingUrl).toBeUndefined();
  });

  test("neznan provider / neveljaven tip / prazen naslov → odstranjeno", () => {
    const out = sanitizeSelectedProviderProducts([
      { provider: "fake-provider", providerProductId: "x", type: "tour", title: "T", source: "S", selectionState: "fixed" },
      { provider: "viator", providerProductId: "", type: "tour", title: "T", source: "S", selectionState: "fixed" },
      { provider: "viator", providerProductId: "1", type: "not-a-type", title: "T", source: "S", selectionState: "fixed" },
      { provider: "viator", providerProductId: "2", type: "tour", title: "  ", source: "S", selectionState: "fixed" },
    ]);
    expect(out.length).toBe(0);
  });

  test("injection poskusi: predolgi nizi, ludilne cene, lažni datumi", () => {
    const long = "A".repeat(1000);
    const out = sanitizeSelectedProviderProducts([
      {
        provider: "viator",
        providerProductId: "d5257-ttd",
        type: "tour",
        title: long,
        source: long,
        locationName: long,
        selectionState: "fixed",
        price: { amount: 999999, currency: "EUR", unit: "total" },
        dates: { start: "13-13-9999" },
      },
    ]);
    expect(out.length).toBe(1);
    expect(out[0].title.length).toBeLessThanOrEqual(120);
    expect(out[0].source.length).toBeLessThanOrEqual(60);
    expect(out[0].locationName!.length).toBeLessThanOrEqual(80);
    expect(out[0].price).toBeUndefined(); // 999999 > cap
    expect(out[0].dates).toBeUndefined();
  });

  test("neveljaven selectionState → privzeto FIXED (uporabnikova izbira je obvezna)", () => {
    const out = sanitizeSelectedProviderProducts([
      { provider: "osm", providerProductId: "n1", type: "museum", title: "M", source: "S", selectionState: "whatever" as SelectedProviderProduct["selectionState"] },
    ]);
    expect(out[0].selectionState).toBe("fixed");
  });

  test("cap števila izbir + dedupe po provider:id", () => {
    const many = Array.from({ length: MAX_SELECTED_PRODUCTS + 10 }, (_, i) => ({
      provider: "osm",
      providerProductId: `node-${i}`,
      type: "attraction",
      title: `P${i}`,
      source: "S",
      selectionState: "fixed" as const,
    }));
    const withDup = [...many, many[0]];
    const out = sanitizeSelectedProviderProducts(withDup);
    expect(out.length).toBe(MAX_SELECTED_PRODUCTS);
  });

  test("ne-array / smeti → prazno (nikoli ne vrže)", () => {
    expect(sanitizeSelectedProviderProducts(null)).toEqual([]);
    expect(sanitizeSelectedProviderProducts("x")).toEqual([]);
    expect(sanitizeSelectedProviderProducts([null, 42, "x"])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// AI KONTEKST — strukturiran blok s FIXED semantiko
// ---------------------------------------------------------------------------

describe("buildSelectedProductsContext", () => {
  const sel = (state: "fixed" | "preferred" | "suggested"): SelectedProviderProduct => ({
    provider: "viator",
    providerProductId: "d5257-ttd",
    type: "tour",
    title: "Lake Bled Day Trip",
    lat: 46.36,
    lng: 14.11,
    price: { amount: 45, currency: "EUR", unit: "per_person" },
    source: "Viator",
    selectionState: state,
  });

  test("FIXED: izrecno pravilo, da AI NE SME zamenjati izdelka", () => {
    const block = buildSelectedProductsContext([sel("fixed")], "en");
    expect(block).toContain("[FIXED]");
    expect(block).toContain("Do NOT replace a FIXED product");
    expect(block).toContain("d5257-ttd");
    expect(block).toContain("lat=46.36000");
  });

  test("SL blok ima slovenska pravila", () => {
    const block = buildSelectedProductsContext([sel("preferred")], "sl");
    expect(block).toContain("[PREFERRED]");
    expect(block).toContain("NE zamenjuj FIXED produkta");
  });

  test("prazna izbira → prazen blok (ni spremembe obnašanja)", () => {
    expect(buildSelectedProductsContext([], "sl")).toBe("");
    expect(buildSelectedProductsContext([], "en")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// INSERT PRODUCT STOP — deterministično vstavljanje v načrt
// ---------------------------------------------------------------------------

const destinationCoords = new Map([
  ["bled", { lat: 46.37, lng: 14.11 }],
  ["ljubljana", { lat: 46.05, lng: 14.51 }],
]);

function baseItinerary(): Itinerary {
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
            estimated_cost: 50,
            notes: "",
          },
        ],
        weather: { condition: "sunny", temp: 22 },
      },
      {
        day: 2,
        locations: [
          {
            destination_id: "bled",
            destination_name: "Bled",
            time_slot: "09:00-13:00",
            duration: 4,
            estimated_cost: 60,
            notes: "",
          },
        ],
        weather: { condition: "sunny", temp: 20 },
      },
    ],
    total_budget: 200,
    recommendations: [],
    tips: [],
    source: "fallback",
  };
}

const product = (over: Partial<ProviderProduct> = {}): ProviderProduct => ({
  id: "osm:node-77",
  provider: "osm",
  providerProductId: "node-77",
  type: "museum",
  title: "Muzej na Bledu",
  lat: 46.37,
  lng: 14.12,
  bookingMode: "info_only",
  lastUpdated: "2026-09-18T00:00:00.000Z",
  license: { source: "OpenStreetMap", attribution: "© OpenStreetMap" },
  ...over,
});

describe("insertProductStop", () => {
  test("produkt blizu Bleda → dan 2 (najbližji dan), večernji slot brez prekrivanja", () => {
    const r = insertProductStop(baseItinerary(), product(), { locale: "sl", destinationCoords });
    expect(r.ok).toBe(true);
    if (r.ok && r.kind === "stop") {
      expect(r.day).toBe(2);
      const stop = r.itinerary.days[1].locations.at(-1)!;
      expect(stop.destination_id).toBe("osm:node-77");
      expect(stop.category).toBe("supply");
      expect(stop.lat).toBe(46.37);
      expect(stop.time_slot).toMatch(/^\d{2}:\d{2}-\d{2}:\d{2}$/);
      expect(stop.notes).toContain("OpenStreetMap");
      // strežniške metrike pošteno ponižane (preračunajo se na klientu)
      expect(r.itinerary.quality).toBeUndefined();
      expect(r.itinerary.geoValidation).toBeUndefined();
    }
  });

  test("nastanitev NI postanek obiska (samo izbira)", () => {
    const r = insertProductStop(
      baseItinerary(),
      product({ type: "accommodation", id: "osm:node-88", providerProductId: "node-88" }),
      { locale: "sl", destinationCoords }
    );
    if (!(r.ok && r.kind === "selection-only")) throw new Error("pričakovan selection-only");
    expect(r.reason).toBe("accommodation");
  });

  test("brez geo → selection-only", () => {
    const r = insertProductStop(baseItinerary(), product({ lat: undefined, lng: undefined }), {
      locale: "sl",
      destinationCoords,
    });
    if (!(r.ok && r.kind === "selection-only")) throw new Error("pričakovan selection-only");
    expect(r.reason).toBe("no-geo");
  });

  test("duplikat (isti id) → zavrnjeno", () => {
    const it = baseItinerary();
    const first = insertProductStop(it, product(), { locale: "sl", destinationCoords });
    if (!(first.ok && first.kind === "stop")) throw new Error("prvi vnos mora uspeti");
    const second = insertProductStop(first.itinerary, product(), {
      locale: "sl",
      destinationCoords,
    });
    expect(second.ok).toBe(false);
    expect((second as { reason: string }).reason).toBe("duplicate");
  });

  test("EN locale: opombe v angleščini", () => {
    const r = insertProductStop(baseItinerary(), product(), { locale: "en", destinationCoords });
    expect(r.ok).toBe(true);
    if (r.ok && r.kind === "stop") {
      const stop = r.itinerary.days[1].locations.at(-1)!;
      expect(stop.notes).toContain("Added from the supply map");
    }
  });

  test("proračun: cena produkta v estimated_cost, brez cene → 0 (ne izmišljujemo)", () => {
    const withPrice = insertProductStop(
      baseItinerary(),
      product({ price: { amount: 15, currency: "EUR", unit: "per_person" } }),
      { locale: "sl", destinationCoords }
    );
    const noPrice = insertProductStop(baseItinerary(), product(), {
      locale: "sl",
      destinationCoords,
    });
    if (withPrice.ok && withPrice.kind === "stop") {
      expect(withPrice.itinerary.days[1].locations.at(-1)!.estimated_cost).toBe(15);
    }
    if (noPrice.ok && noPrice.kind === "stop") {
      expect(noPrice.itinerary.days[1].locations.at(-1)!.estimated_cost).toBe(0);
    }
  });
});

describe("removeProductStop", () => {
  test("odstrani supply postanek z enim klikom", () => {
    const inserted = insertProductStop(baseItinerary(), product(), {
      locale: "sl",
      destinationCoords,
    });
    if (!(inserted.ok && inserted.kind === "stop")) throw new Error("vnos mora uspeti");
    const r = removeProductStop(inserted.itinerary, "osm:node-77");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.name).toBe("Muzej na Bledu");
      const supplyStops = r.itinerary.days
        .flatMap((d) => d.locations)
        .filter((l) => l.category === "supply");
      expect(supplyStops.length).toBe(0);
    }
  });

  test("neznan produkt → not found", () => {
    expect(removeProductStop(baseItinerary(), "osm:ne-obstaja").ok).toBe(false);
  });
});
