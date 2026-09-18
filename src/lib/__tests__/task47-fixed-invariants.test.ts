// ============================================================================
// TASK 47 — TESTI: FIXED INVARIANT (§11 + §18-A)
// ============================================================================
// FIXED supply produkt → NATANČNO ENA itinerary predstavitev.
// applyFixedSelectedProducts (ekstrahiran iz route — vedenje identično) +
// insertProductStop (source of truth dedupe) + sanitizeSelectedProviderProducts
// (meja klienta) skupaj zagotavljajo invariant na VSEH treh plasteh.
// ============================================================================

import { describe, expect, test } from "bun:test";
import { applyFixedSelectedProducts } from "@/lib/supply/apply-fixed";
import { sanitizeSelectedProviderProducts } from "@/lib/supply/sanitize";
import { insertProductStop } from "@/lib/supply/stop-insert";
import type { Itinerary } from "@/lib/types";
import type { SelectedProviderProduct } from "@/lib/supply/types";

// ---------------------------------------------------------------------------
// Gradnice
// ---------------------------------------------------------------------------

const destinationCoords = new Map([
  ["bled", { lat: 46.37, lng: 14.11 }],
  ["ljubljana", { lat: 46.05, lng: 14.51 }],
  ["piran", { lat: 45.52, lng: 13.57 }],
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
    source: "ai",
  };
}

const selection = (over: Partial<SelectedProviderProduct> = {}): SelectedProviderProduct => ({
  provider: "kiwitaxi",
  providerProductId: "49540",
  type: "transfer",
  title: "Ljubljana Train Station → Bled",
  lat: 46.05845,
  lng: 14.51269,
  price: { amount: 51, currency: "EUR", unit: "per_transfer", fromPrice: true },
  availability: { status: "not_supported" },
  source: "KiwiTaxi Partner Data API (CSV)",
  selectionState: "fixed",
  ...over,
});

const supplyStops = (it: Itinerary) =>
  it.days.flatMap((d) => d.locations.filter((l) => l.category === "supply"));

const countStop = (it: Itinerary, id: string) =>
  it.days.flatMap((d) => d.locations).filter((l) => l.destination_id === id).length;

// ---------------------------------------------------------------------------
// §11 / §18-A — FIXED Matrika
// ---------------------------------------------------------------------------

describe("TASK 47 §11/§18-A: FIXED invariant matrika", () => {
  test("A1: 1 FIXED → NATANČNO 1 postanek", () => {
    const it = applyFixedSelectedProducts(baseItinerary(), [selection()], "sl");
    expect(supplyStops(it).length).toBe(1);
    expect(countStop(it, "kiwitaxi:49540")).toBe(1);
  });

  test("A1b: FIXED postanek nosi ISKRENO oznako razpoložljivosti (§6/§13 — not_supported)", () => {
    const it = applyFixedSelectedProducts(baseItinerary(), [selection()], "sl");
    const stop = supplyStops(it)[0];
    expect(stop.notes).toContain("razpoložljivost: preveri pri ponudniku");
    expect(stop.notes).toContain("cena: od 51 € (per transfer)");
    expect(stop.notes).toContain("vir: KiwiTaxi Partner Data API (CSV)");
    // NIKOLI izmišljena razpoložljivost:
    expect(stop.notes).not.toContain("na voljo za tvoj datum");
    expect(stop.notes).not.toContain("živo");
  });

  test("A1c: FIXED z unknown razpoložljivostjo → „ni preverjena“ (negotovost ohranjena)", () => {
    const it = applyFixedSelectedProducts(
      baseItinerary(),
      [selection({ provider: "viator", providerProductId: "227717P1", availability: { status: "unknown" } })],
      "sl"
    );
    expect(supplyStops(it)[0].notes).toContain("razpoložljivost: ni preverjena");
  });

  test("A1d: LOKALNI FIXED (OSM, info_only) brez razpoložljivosti → brez vrstice", () => {
    const it = applyFixedSelectedProducts(
      baseItinerary(),
      [selection({ provider: "osm", providerProductId: "node-77", type: "museum", title: "Muzej na Bledu", price: undefined, availability: undefined, source: "OpenStreetMap" })],
      "sl"
    );
    expect(supplyStops(it)[0].notes).not.toContain("razpoložljivost");
  });

  test("A1d-b: KOMERCIALNI FIXED brez razpoložljivosti (po sanitize) → izpeljana „preveri pri ponudniku“", () => {
    // Kanonska semantika: odsotno = not_supported → komercialni vir izpiše
    // iskreno vrstico (ist vzorec kot revalidacija).
    const it = applyFixedSelectedProducts(
      baseItinerary(),
      [selection({ availability: undefined })],
      "sl"
    );
    expect(supplyStops(it)[0].notes).toContain("razpoložljivost: preveri pri ponudniku");
  });

  test("A1e: EN FIXED → honest availability line v angleščini", () => {
    const it = applyFixedSelectedProducts(baseItinerary(), [selection()], "en");
    expect(supplyStops(it)[0].notes).toContain(
      "availability: confirm with the provider"
    );
  });

  test("A2: isti FIXED dvakrat v vhodnem seznamu → 1 postanek (dedupe po destination_id)", () => {
    const it = applyFixedSelectedProducts(baseItinerary(), [selection(), selection()], "sl");
    expect(countStop(it, "kiwitaxi:49540")).toBe(1);
  });

  test("A2b: applyFixed dvakrat zapored (re-run na že obdelanem načrtu) → še vedno 1", () => {
    const first = applyFixedSelectedProducts(baseItinerary(), [selection()], "sl");
    const second = applyFixedSelectedProducts(first, [selection()], "sl");
    expect(countStop(second, "kiwitaxi:49540")).toBe(1);
  });

  test("A3: isti provider + isti ID → 1 postanek (tudi če pride dvakrat skozi izbiro)", () => {
    const dup = [selection(), selection({ title: "Drugačen prikaz istega produkta" })];
    const it = applyFixedSelectedProducts(baseItinerary(), dup, "sl");
    expect(countStop(it, "kiwitaxi:49540")).toBe(1);
  });

  test("A4: isti ID z RAZLIČNIM naslovom → 1 (ključ je provider:id, ne naslov)", () => {
    const it = applyFixedSelectedProducts(
      baseItinerary(),
      [selection({ title: "Star naslov" }), selection({ title: "Nov naslov" })],
      "sl"
    );
    expect(countStop(it, "kiwitaxi:49540")).toBe(1);
  });

  test("A5: DVA providerja z ISTIM naslovom → 2 postanka (različna produkta)", () => {
    const a = selection({ title: "Isti naslov produkta" });
    const b = selection({
      provider: "viator",
      providerProductId: "227717P1",
      title: "Isti naslov produkta",
      price: { amount: 500, currency: "EUR", unit: "per_person", fromPrice: true },
      availability: { status: "unknown" },
      source: "Viator Partner API",
    });
    const it = applyFixedSelectedProducts(baseItinerary(), [a, b], "sl");
    expect(countStop(it, "kiwitaxi:49540")).toBe(1);
    expect(countStop(it, "viator:227717P1")).toBe(1);
    expect(supplyStops(it).length).toBe(2);
  });

  test("A6: DVA providerja z ISTIMI koordinatami → 2 postanka (geo ne združuje FIXED)", () => {
    const a = selection();
    const b = selection({
      provider: "getyourguide",
      providerProductId: "66985",
      title: "Ljubljana: Castle Ticket",
      price: { amount: 29, currency: "EUR", unit: "per_person", fromPrice: true },
      availability: { status: "unknown" },
      source: "GetYourGuide Partner API",
    });
    const it = applyFixedSelectedProducts(baseItinerary(), [a, b], "sl");
    expect(supplyStops(it).length).toBe(2);
    expect(countStop(it, "kiwitaxi:49540")).toBe(1);
    expect(countStop(it, "getyourguide:66985")).toBe(1);
  });

  test("A7: DVA providerja (KT + Viator) → 2 postanka, ceni/id/objavi se ne mešata", () => {
    const kt = selection();
    const vt = selection({
      provider: "viator",
      providerProductId: "227717P1",
      type: "tour",
      title: "Lake Bled Day Trip",
      lat: 46.36,
      lng: 14.11,
      price: { amount: 500, currency: "EUR", unit: "per_person", fromPrice: true },
      availability: { status: "unknown" },
      source: "Viator Partner API",
    });
    const it = applyFixedSelectedProducts(baseItinerary(), [kt, vt], "sl");
    const ktStop = it.days.flatMap((d) => d.locations).find((l) => l.destination_id === "kiwitaxi:49540")!;
    const vtStop = it.days.flatMap((d) => d.locations).find((l) => l.destination_id === "viator:227717P1")!;
    expect(ktStop.estimated_cost).toBe(51);
    expect(ktStop.notes).toContain("(per transfer)");
    expect(vtStop.estimated_cost).toBe(500);
    expect(vtStop.notes).toContain("(per person)");
    expect(vtStop.notes).toContain("od 500");
  });

  test("A8: TRIje providerji (KT + Viator + GYG) → 3 postanki, vsi nedotaknjeni", () => {
    const kt = selection();
    const vt = selection({
      provider: "viator",
      providerProductId: "227717P1",
      type: "tour",
      title: "Lake Bled Day Trip",
      lat: 46.36,
      lng: 14.11,
      price: { amount: 500, currency: "EUR", unit: "per_person", fromPrice: true },
      availability: { status: "unknown" },
      source: "Viator Partner API",
    });
    const gyg = selection({
      provider: "getyourguide",
      providerProductId: "66985",
      type: "activity",
      title: "Ljubljana: Castle Ticket",
      price: { amount: 29, currency: "EUR", unit: "per_person", fromPrice: true },
      availability: { status: "unknown" },
      source: "GetYourGuide Partner API",
    });
    const it = applyFixedSelectedProducts(baseItinerary(), [kt, vt, gyg], "sl");
    expect(supplyStops(it).length).toBe(3);
    expect(countStop(it, "kiwitaxi:49540")).toBe(1);
    expect(countStop(it, "viator:227717P1")).toBe(1);
    expect(countStop(it, "getyourguide:66985")).toBe(1);
  });

  test("A9: AI JE že vključil FIXED produkt → applyFixed NE podvoji (dedupe insertProductStop)", () => {
    const withEcho = baseItinerary();
    withEcho.days[1].locations.push({
      destination_id: "kiwitaxi:49540",
      destination_name: "Ljubljana Train Station → Bled",
      time_slot: "19:00-20:00",
      duration: 1,
      estimated_cost: 51,
      notes: "cena: od 51 € (per transfer) · Dodano z zemljevida ponudbe · vir: KiwiTaxi Partner Data API (CSV)",
      category: "supply",
      lat: 46.05845,
      lng: 14.51269,
    });
    const it = applyFixedSelectedProducts(withEcho, [selection()], "sl");
    expect(countStop(it, "kiwitaxi:49540")).toBe(1);
  });

  test("A10: nastanitev FIXED → NI postanek (nočitvena baza — obstoječa semantika)", () => {
    const it = applyFixedSelectedProducts(
      baseItinerary(),
      [selection({ type: "accommodation", title: "Hotel Ljubljana" })],
      "sl"
    );
    expect(supplyStops(it).length).toBe(0);
  });

  test("A11: FIXED brez geo → NI postanek (samo izbira/AI kontekst)", () => {
    const it = applyFixedSelectedProducts(
      baseItinerary(),
      [selection({ lat: undefined, lng: undefined })],
      "sl"
    );
    expect(supplyStops(it).length).toBe(0);
  });

  test("A12: PREFERRED/SUGGESTED izbire NE silijo postanka (samo FIXED utrjuje)", () => {
    const it = applyFixedSelectedProducts(
      baseItinerary(),
      [
        selection({ selectionState: "preferred" }),
        selection({ selectionState: "suggested", provider: "viator", providerProductId: "227717P1" }),
      ],
      "sl"
    );
    expect(supplyStops(it).length).toBe(0);
  });

  test("A13: insertProductStop dedupe (source of truth) — isti produkt dvakrat → duplicate", () => {
    const product = {
      id: "kiwitaxi:49540",
      provider: "kiwitaxi" as const,
      providerProductId: "49540",
      type: "transfer" as const,
      title: "Ljubljana Train Station → Bled",
      lat: 46.05845,
      lng: 14.51269,
      bookingMode: "affiliate_redirect" as const,
      lastUpdated: "2026-09-18T00:00:00Z",
      license: { source: "KiwiTaxi Partner Data API (CSV)" },
    };
    const first = insertProductStop(baseItinerary(), product, { locale: "sl", destinationCoords });
    expect(first.ok).toBe(true);
    const second = insertProductStop(
      first.ok && first.kind === "stop" ? first.itinerary : baseItinerary(),
      product,
      { locale: "sl", destinationCoords }
    );
    expect(second.ok).toBe(false);
    expect((second as { reason: string }).reason).toBe("duplicate");
  });

  test("A14: sanitize meja klienta — duplikat provider:id v vhodu → 1 izbira", () => {
    const out = sanitizeSelectedProviderProducts([
      selection(),
      selection({ title: "Duplikat istega produkta" }),
    ]);
    expect(out.length).toBe(1);
  });

  test("A15: prazna izbira → itinerer NEspremenjen (identiteta objekta)", () => {
    const base = baseItinerary();
    const it = applyFixedSelectedProducts(base, [], "sl");
    expect(it).toBe(base);
  });

  test("A16: trije providerji + OSM izbira — 4 FIXED postanki soobstajajo brez podvajanj", () => {
    const kt = selection();
    const vt = selection({
      provider: "viator",
      providerProductId: "227717P1",
      type: "tour",
      title: "Lake Bled Day Trip",
      lat: 46.36,
      lng: 14.11,
      price: { amount: 500, currency: "EUR", unit: "per_person", fromPrice: true },
      availability: { status: "unknown" },
      source: "Viator Partner API",
    });
    const gyg = selection({
      provider: "getyourguide",
      providerProductId: "66985",
      type: "activity",
      title: "Ljubljana: Castle Ticket",
      price: { amount: 29, currency: "EUR", unit: "per_person", fromPrice: true },
      availability: { status: "unknown" },
      source: "GetYourGuide Partner API",
    });
    const osm = selection({
      provider: "osm",
      providerProductId: "node-77",
      type: "museum",
      title: "Muzej na Bledu",
      lat: 46.37,
      lng: 14.12,
      price: undefined,
      availability: undefined,
      source: "OpenStreetMap",
    });
    const it = applyFixedSelectedProducts(baseItinerary(), [kt, vt, gyg, osm], "sl");
    expect(supplyStops(it).length).toBe(4);
    const ids = supplyStops(it).map((s) => s.destination_id).sort();
    expect(ids).toEqual([
      "getyourguide:66985",
      "kiwitaxi:49540",
      "osm:node-77",
      "viator:227717P1",
    ]);
  });
});
