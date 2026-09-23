// ============================================================================
// HARDENING MASTER TASK — I4/P-3: CENA UNKNOWN JE UNKNOWN (OBE POTI)
// ============================================================================
// P-3 (P2): deterministična pot je za komercialni FIXED produkt brez
//   dokazljive cene zapisala €0 ( izmišljena vrednost za PLAČLJIVO turo),
//   AI pot pa NaN + „Cena ni preverjena". Ista vnosa → različni resnici.
// I4-razširitev (generacijska vrzel): na AI GENERACIJSKI poti (brez
//   currentStop) je AI-jeva izmišljena cena za neverificirano izbiro
//   preživela v izhodu (price_unverified veja je zahtevala currentStop).
// PRAVILO: komercialni vir brez strežno dokazljive cene → NaN + opomba;
//   odprti viri (osm/fsq/sto/events) → €0 pošteno, izumljena neničelna
//   vrednost → NaN.
// ============================================================================
import { describe, expect, test } from "bun:test";
import { validateItinerarySupply } from "@/lib/supply/itinerary-validation";
import type { Itinerary, LocationVisit } from "@/lib/types";
import type { SelectedProviderProduct } from "@/lib/supply/types";

function stop(overrides: Partial<LocationVisit> = {}): LocationVisit {
  return {
    destination_id: "viator:98765",
    destination_name: "AI Tour",
    time_slot: "",
    duration: 2,
    estimated_cost: 79,
    notes: "",
    category: "supply",
    lat: 46.05,
    lng: 14.5,
    ...overrides,
  };
}

function itinerary(stops: LocationVisit[]): Itinerary {
  return {
    days: [{ day: 1, locations: stops, weather: { condition: "", temp: 0 } }],
    total_budget: 500,
    recommendations: [],
    tips: [],
    source: "ai",
  } as unknown as Itinerary;
}

function selection(
  overrides: Partial<SelectedProviderProduct> = {}
): SelectedProviderProduct {
  return {
    provider: "viator",
    providerProductId: "98765",
    title: "AI Tour",
    type: "activity",
    selectionState: "fixed",
    lat: 46.05,
    lng: 14.5,
    // price NEDOKAZLJIV (verifySelectedProducts jo je odstranil)
    ...overrides,
  } as SelectedProviderProduct;
}

describe("HARDENING I4: generacija — komercialna izbira brez dokazljive cene", () => {
  test("AI-jeva izmišljena cena (€79) → NaN + „Cena ni preverjena“ opomba + issue", () => {
    const { itinerary: it, report } = validateItinerarySupply(
      itinerary([stop({ estimated_cost: 79 })]),
      { selection: [selection()] },
      { lang: "sl", groupSize: 2 }
    );
    const s = it.days[0].locations[0];
    expect(Number.isNaN(s.estimated_cost)).toBe(true);
    expect(s.notes).toContain("Cena ni preverjena");
    expect(
      report.issues.some(
        (i) => i.rule === "price_unverified" && i.ref === "viator:98765"
      )
    ).toBe(true);
  });

  test("deterministična vstavitev (reinsertFixed) komercialnega brez cene → NaN (ne €0)", () => {
    // FIXED izbira NI v načrtu → reinsertFixed jo vstavi; prej je dobila €0
    const { itinerary: it, report } = validateItinerarySupply(
      itinerary([]),
      { selection: [selection()] },
      { lang: "sl", groupSize: 2 }
    );
    expect(report.reinserted).toBe(1);
    const s = it.days[0].locations.find(
      (l) => l.destination_id === "viator:98765"
    );
    expect(s).toBeTruthy();
    expect(Number.isNaN(s!.estimated_cost)).toBe(true);
    expect(s!.notes).toContain("Cena ni preverjena");
  });

  test("KT izbira S kanonsko ceno → rebind ( obstoječa semantika nespremenjena)", () => {
    const { itinerary: it } = validateItinerarySupply(
      itinerary([
        stop({
          destination_id: "kiwitaxi:411",
          destination_name: "Prevoz",
          estimated_cost: 999,
        }),
      ]),
      {
        selection: [
          selection({
            provider: "kiwitaxi",
            providerProductId: "411",
            type: "transfer",
            price: {
              amount: 77,
              currency: "EUR",
              unit: "per_transfer",
              fromPrice: true,
            },
          }),
        ],
      },
      { lang: "sl", groupSize: 2 }
    );
    const s = it.days[0].locations[0];
    expect(s.estimated_cost).toBe(77); // kanon iz selection (per_transfer)
  });
});

describe("HARDENING P-3: odprti viri — €0 pošteno, izumljena cena → NaN", () => {
  test("osm €0 postanek ostane €0 (brezplačna točka)", () => {
    const { itinerary: it, report } = validateItinerarySupply(
      itinerary([
        stop({ destination_id: "osm:node-1", estimated_cost: 0 }),
      ]),
      {
        selection: [
          selection({
            provider: "osm",
            providerProductId: "node-1",
            type: "attraction",
          }),
        ],
      },
      { lang: "sl", groupSize: 2 }
    );
    expect(it.days[0].locations[0].estimated_cost).toBe(0);
    expect(
      report.issues.some((i) => i.rule === "price_unverified")
    ).toBe(false);
  });

  test("osm €5 (AI izum) → NaN", () => {
    const { itinerary: it } = validateItinerarySupply(
      itinerary([
        stop({ destination_id: "osm:node-1", estimated_cost: 5 }),
      ]),
      {
        selection: [
          selection({
            provider: "osm",
            providerProductId: "node-1",
            type: "attraction",
          }),
        ],
      },
      { lang: "sl", groupSize: 2 }
    );
    expect(Number.isNaN(it.days[0].locations[0].estimated_cost)).toBe(true);
  });
});
