// ============================================================================
// TASK 49 — SUPPLY INTEGRITY: TESTI OVERNITVE IZBIRE/NAČRTA (1.54.0)
// ============================================================================
// P0 regresijski testi: klientov payload (selectedProviderProducts +
// trenutni načrt) je NEZAUPAN vnos — strežniška resnica (KT dataset) zmaga,
// brez dokaza → unknown, fabrikantrt id → zavrnjen.
//
// Živi dokazi pred popravilom (audit §4/§7):
//   - kiwitaxi:411 s klientovo ceno €1 → finalni načrt €1, budget "within"
//     (dataset resnica: €77, per_transfer, fromPrice)
//   - osm izdelek s fabrikirano ceno €5 → finalni načrt €5 (info_only vir
//     cene nikoli nima)
//   - viator:98765 s klientovo ceno €79 → kanonska avtoriteta (provider
//     ni priključen — ni strežne resnice)
//   - refine: klientov "current" načrt s KT €1 → avtoriteta €1
//
// Testi berejo KANONIKE dinamično iz produkcijskega baseline dataseta
// (data/kiwitaxi-routes.json — route 411 = "Bled → Ljubljana Airport"),
// da ne vzdržujemo dvojnikov fixture-a.
// ============================================================================

import { describe, expect, test, beforeEach } from "bun:test";
import {
  verifySelectedProducts,
  verifyCurrentStopsAuthority,
  hasVerifyChanges,
} from "@/lib/supply/selection-verify";
import {
  getKiwitaxiBaseline,
  resetKiwitaxiDataset,
  disableKiwitaxiBaselineForTests,
} from "@/lib/supply/providers/kiwitaxi/dataset";
import { sanitizeSelectedProviderProducts } from "@/lib/supply/sanitize";
import type { SelectedProviderProduct } from "@/lib/supply/types";
import type { Itinerary, LocationVisit } from "@/lib/types";
import type { KiwiRoute } from "@/lib/supply/providers/kiwitaxi/types";

// ---------------------------------------------------------------------------
// Kanoniki iz PRODUKCIJSKEGA baseline-a (dinamično — brez fixture dvojnikov)
// ---------------------------------------------------------------------------

const BASELINE = getKiwitaxiBaseline();

/** Kanonska KT ruta iz baseline-a; skip ce ni (sveze okolje brez ingesta). */
const KT_411: KiwiRoute | undefined = BASELINE?.routes.find(
  (r) => r.id === 411
);

/** Bledo preskoči celo datoteko, ce baseline ni nameščen (CI brez data/). */
const hasKt = KT_411 != null;

/** Kanonska cena rute 411 (per_transfer, fromPrice). */
const KT_411_PRICE = KT_411?.minPriceEur ?? 77;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Klientova izbira, kot jo pošlje browser (z vero v strežniško resnico). */
function clientSelection(
  overrides: Partial<SelectedProviderProduct> = {}
): SelectedProviderProduct[] {
  const raw = [
    {
      provider: "kiwitaxi",
      providerProductId: "411",
      type: "transfer",
      title: KT_411 ? `${KT_411.fromName} → ${KT_411.toName}` : "Bled → Ljubljana Airport",
      ...(KT_411?.fromLat != null && KT_411?.fromLng != null
        ? { lat: KT_411.fromLat, lng: KT_411.fromLng }
        : {}),
      price: {
        amount: KT_411_PRICE,
        currency: "EUR",
        unit: "per_transfer",
        fromPrice: true,
      },
      source: "KiwiTaxi",
      selectionState: "fixed",
      ...overrides,
    },
  ];
  return sanitizeSelectedProviderProducts(raw);
}

function stop(overrides: Partial<LocationVisit> = {}): LocationVisit {
  return {
    destination_id: "kiwitaxi:411",
    destination_name: KT_411 ? `${KT_411.fromName} → ${KT_411.toName}` : "Bled → Ljubljana Airport",
    time_slot: "18:00-19:00",
    duration: 1,
    estimated_cost: KT_411_PRICE,
    notes: "",
    ...(KT_411?.fromLat != null && KT_411?.fromLng != null
      ? { lat: KT_411.fromLat, lng: KT_411.fromLng }
      : {}),
    ...overrides,
  } as LocationVisit;
}

beforeEach(() => {
  resetKiwitaxiDataset(); // current=null, baselineEnabled → lazy baseline
});

// ---------------------------------------------------------------------------
// verifySelectedProducts — KIWITAXI (strežni dataset = resnica)
// ---------------------------------------------------------------------------

describe("TASK 49 §4: overnitev izbire — KIWITAXI kanon zmaga", () => {
  test.skipIf(!hasKt)("① klientova cena 1 € → POPRAVLJENA na kanoniko (per_transfer, fromPrice)", () => {
    const { products, report } = verifySelectedProducts(
      clientSelection({
        price: { amount: 1, currency: "EUR", unit: "per_transfer" },
      })
    );
    expect(products).toHaveLength(1);
    expect(products[0]?.price?.amount).toBe(KT_411_PRICE);
    expect(products[0]?.price?.unit).toBe("per_transfer");
    expect(products[0]?.price?.fromPrice).toBe(true);
    expect(report.priceOverrides).toBe(1);
  });

  test.skipIf(!hasKt)("② klientova NAPAČNA enota (per_person) → popravljen tudi unit", () => {
    const { products, report } = verifySelectedProducts(
      clientSelection({
        price: { amount: KT_411_PRICE, currency: "EUR", unit: "per_person" },
      })
    );
    expect(products[0]?.price?.unit).toBe("per_transfer");
    expect(report.priceOverrides).toBe(1);
  });

  test.skipIf(!hasKt)("③ CENA BREZ fromPrice → fromPrice: true (kanon KT je 'od' cena)", () => {
    const { products } = verifySelectedProducts(
      clientSelection({
        price: { amount: KT_411_PRICE, currency: "EUR", unit: "per_transfer" },
      })
    );
    expect(products[0]?.price?.fromPrice).toBe(true);
  });

  test.skipIf(!hasKt || KT_411?.fromLat == null)(
    "④ klientov geo drift (0,0) → RESTAVRIRAN iz dataset pina",
    () => {
      const { products, report } = verifySelectedProducts(
        clientSelection({ lat: 0, lng: 0 })
      );
      expect(products[0]?.lat).toBe(KT_411!.fromLat);
      expect(products[0]?.lng).toBe(KT_411!.fromLng);
      expect(report.geoRestored).toBe(1);
    }
  );

  test.skipIf(!hasKt)("⑤ klientov preimenovan naslov → KANONSKI 'from → to'", () => {
    const { products, report } = verifySelectedProducts(
      clientSelection({ title: "Transfer v Ljubljano (zasebni)" })
    );
    expect(products[0]?.title).toBe(`${KT_411!.fromName} → ${KT_411!.toName}`);
    expect(report.titlesRestored).toBe(1);
  });

  test.skipIf(!hasKt)("⑥ type 'accommodation' (FIXED bypass!) → ponastavljen na 'transfer'", () => {
    const { products, report } = verifySelectedProducts(
      clientSelection({ type: "accommodation" })
    );
    expect(products[0]?.type).toBe("transfer");
    expect(report.typesRestored).toBe(1);
  });

  test.skipIf(!hasKt)("⑦ fabrikantrt KT id (999999 ni v inventarju) → ZAVRŽEN (fail-closed)", () => {
    const { products, report } = verifySelectedProducts(
      clientSelection({ providerProductId: "999999" })
    );
    expect(products).toHaveLength(0);
    expect(report.rejectedFake).toBe(1);
  });

  test.skipIf(!hasKt)(
    "⑧ KT brez podatka o razpoložljivosti: klientova trditev 'live_available' → ODSTRANJENA",
    () => {
      const { products, report } = verifySelectedProducts(
        clientSelection({
          availability: { status: "live_available" },
        })
      );
      expect(products[0]?.availability).toBeUndefined();
      expect(report.availabilityStripped).toBe(1);
    }
  );

  test.skipIf(!hasKt)("⑨ KT dataset MANJKA → izdelek ostane, cena/razpoložljivost odstranjeni (unknown)", () => {
    // Simuliraj odsotnost baznega dataseta (isti hak kot KT testi).
    // POZOR: resetKiwitaxiDataset() ponastavi TUDI baselineDisabled —
    // zato najprej reset, nato disable.
    resetKiwitaxiDataset();
    disableKiwitaxiBaselineForTests(true);
    const { products, report } = verifySelectedProducts(clientSelection());
    expect(products).toHaveLength(1);
    expect(products[0]?.price).toBeUndefined();
    expect(products[0]?.availability).toBeUndefined();
    expect(report.pricesStripped).toBe(1);
    expect(report.rejectedFake).toBe(0);
  });

  test.skipIf(!hasKt)("⑩ neštevilčni KT id ('abc') → zavrnjen kot fabrikantrt", () => {
    const { products, report } = verifySelectedProducts(
      clientSelection({ providerProductId: "abc" })
    );
    expect(products).toHaveLength(0);
    expect(report.rejectedFake).toBe(1);
  });

  test.skipIf(!hasKt || KT_411?.fromLat == null)(
    "⑪ PRAVILNA izbira (kot jo pošlje UI) → 0 sprememb (hasVerifyChanges false)",
    () => {
      const { report } = verifySelectedProducts(clientSelection());
      expect(hasVerifyChanges(report)).toBe(false);
      expect(report.priceOverrides).toBe(0);
      expect(report.rejectedFake).toBe(0);
    }
  );
});

// ---------------------------------------------------------------------------
// verifySelectedProducts — OSM (info_only vir brez cen)
// ---------------------------------------------------------------------------

describe("TASK 49 §4: overnitev izbire — OSM info_only", () => {
  test("① fabrikirana OSM cena 5 € → ODSTRANJENA (vir cene nikoli nima)", () => {
    const { products, report } = verifySelectedProducts(
      sanitizeSelectedProviderProducts([
        {
          provider: "osm",
          providerProductId: "node-3591726079",
          type: "attraction",
          title: "Mala Osojnica",
          lat: 46.3622,
          lng: 14.0936,
          price: { amount: 5, currency: "EUR", unit: "total" },
          source: "OpenStreetMap",
          selectionState: "fixed",
        },
      ])
    );
    expect(products).toHaveLength(1);
    expect(products[0]?.price).toBeUndefined();
    expect(report.pricesStripped).toBe(1);
  });

  test("② OSM brez cene (kot UI pošlje) → nedotaknjena izbira, 0 sprememb", () => {
    const { products, report } = verifySelectedProducts(
      sanitizeSelectedProviderProducts([
        {
          provider: "osm",
          providerProductId: "node-1",
          type: "attraction",
          title: "Točka",
          lat: 46,
          lng: 14,
          source: "OpenStreetMap",
          selectionState: "fixed",
        },
      ])
    );
    expect(products).toHaveLength(1);
    expect(hasVerifyChanges(report)).toBe(false);
  });

  test("③ OSM 'live_available' trditev → odstranjena", () => {
    const { products, report } = verifySelectedProducts(
      sanitizeSelectedProviderProducts([
        {
          provider: "osm",
          providerProductId: "node-1",
          type: "attraction",
          title: "Točka",
          lat: 46,
          lng: 14,
          availability: { status: "live_available" },
          source: "OpenStreetMap",
          selectionState: "fixed",
        },
      ])
    );
    expect(products[0]?.availability).toBeUndefined();
    expect(report.availabilityStripped).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// verifySelectedProducts — viator/gyg (BREZ strežne resnice danes)
// ---------------------------------------------------------------------------

describe("TASK 49 §4: overnitev izbire — nepriključen komercialni vir", () => {
  test("① viator:98765 s klientovo ceno 79 € (brez strežne resnice) → cena ODSTRANJENA", () => {
    const { products, report } = verifySelectedProducts(
      sanitizeSelectedProviderProducts([
        {
          provider: "viator",
          providerProductId: "98765",
          type: "tour",
          title: "Lake Bled Day Trip",
          lat: 46.3487,
          lng: 14.3922,
          price: { amount: 79, currency: "EUR", unit: "per_person" },
          source: "Viator",
          selectionState: "fixed",
        },
      ])
    );
    // Izdelek OSTANE kot uporabnikova izbira (obstoj se ne zavrača) …
    expect(products).toHaveLength(1);
    // … a cena je klientova trditev brez dokaza → unknown.
    expect(products[0]?.price).toBeUndefined();
    expect(report.pricesStripped).toBe(1);
    expect(report.rejectedFake).toBe(0);
  });

  test("② viator z razpoložljivostjo → odstranjena (ni strežne poti za dokaz)", () => {
    const { products, report } = verifySelectedProducts(
      sanitizeSelectedProviderProducts([
        {
          provider: "getyourguide",
          providerProductId: "12345",
          type: "tour",
          title: "Old Town Tour",
          availability: { status: "live_available" },
          source: "GetYourGuide",
          selectionState: "fixed",
        },
      ])
    );
    expect(products[0]?.availability).toBeUndefined();
    expect(report.availabilityStripped).toBe(1);
  });

  test("③ Z strežnim supply kontekstom (priključen vir) → strežna cena zmaga", () => {
    const { products, report } = verifySelectedProducts(
      sanitizeSelectedProviderProducts([
        {
          provider: "viator",
          providerProductId: "98765",
          type: "tour",
          title: "Lake Bled Day Trip",
          lat: 46.3487,
          lng: 14.3922,
          price: { amount: 1, currency: "EUR", unit: "per_person" },
          source: "Viator",
          selectionState: "fixed",
        },
      ]),
      [
        {
          provider: "viator",
          providerProductId: "98765",
          type: "tour",
          title: "Lake Bled Day Trip",
          location: { lat: 46.3487, lng: 14.3922 },
          price: { amount: 79, currency: "EUR", unit: "per_person" },
          bookingMode: "affiliate_redirect",
          selectionState: "suggested",
        },
      ]
    );
    expect(products[0]?.price?.amount).toBe(79);
    expect(report.priceOverrides).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// verifyCurrentStopsAuthority — refine pot (klientov "current" načrt)
// ---------------------------------------------------------------------------

describe("TASK 49 §8: overnitev currentStops avtoritete (refine)", () => {
  test.skipIf(!hasKt)("① KT postanek s klientovo ceno 1 € → avtoriteta kanonik (dataset)", () => {
    const stops = new Map([["kiwitaxi:411", stop({ estimated_cost: 1 })]]);
    const { stops: out, report } = verifyCurrentStopsAuthority(stops);
    expect(out.get("kiwitaxi:411")?.estimated_cost).toBe(KT_411_PRICE);
    expect(report.priceOverrides).toBe(1);
  });

  test.skipIf(!hasKt)("② fabrikant KT ref v 'current' načrtu → IZVZET (Task 48 ga zavrže)", () => {
    const stops = new Map([
      ["kiwitaxi:999999", stop({ destination_id: "kiwitaxi:999999" })],
    ]);
    const { stops: out, report } = verifyCurrentStopsAuthority(stops);
    expect(out.has("kiwitaxi:999999")).toBe(false);
    expect(report.rejectedFake).toBe(1);
  });

  test.skipIf(!hasKt)("③ KT dataset manjka → cena avtoritete NaN (unknown — ne klientova)", () => {
    resetKiwitaxiDataset();
    disableKiwitaxiBaselineForTests(true);
    const stops = new Map([["kiwitaxi:411", stop({ estimated_cost: 123 })]]);
    const { stops: out } = verifyCurrentStopsAuthority(stops);
    const v = out.get("kiwitaxi:411")?.estimated_cost;
    expect(Number.isNaN(v)).toBe(true); // Number.isFinite → false → unknown
  });

  test("④ OSM postanek €0 → ostane 0 (pošteno — brezplačna točka)", () => {
    const stops = new Map([
      ["osm:node-1", stop({ destination_id: "osm:node-1", estimated_cost: 0 })],
    ]);
    const { stops: out } = verifyCurrentStopsAuthority(stops);
    expect(out.get("osm:node-1")?.estimated_cost).toBe(0);
  });

  test("⑤ OSM postanek €5 (fabrikantrt) → NaN (unknown)", () => {
    const stops = new Map([
      ["osm:node-1", stop({ destination_id: "osm:node-1", estimated_cost: 5 })],
    ]);
    const { stops: out, report } = verifyCurrentStopsAuthority(stops);
    expect(Number.isNaN(out.get("osm:node-1")?.estimated_cost)).toBe(true);
    expect(report.pricesStripped).toBe(1);
  });

  test("⑥ viator postanek (ni strežne resnice na refinu) → cena VEDNO NaN", () => {
    const stops = new Map([
      ["viator:98765", stop({ destination_id: "viator:98765", estimated_cost: 79 })],
    ]);
    const { stops: out } = verifyCurrentStopsAuthority(stops);
    expect(Number.isNaN(out.get("viator:98765")?.estimated_cost)).toBe(true);
  });

  test.skipIf(!hasKt || KT_411?.fromLat == null)(
    "⑦ KT naslov/geo v 'current' načrtu → kanon iz dataseta",
    () => {
      const stops = new Map([
        [
          "kiwitaxi:411",
          stop({
            destination_name: "Transfer Bled → Letališče (najcenejši)",
            lat: 0,
            lng: 0,
          }),
        ],
      ]);
      const { stops: out, report } = verifyCurrentStopsAuthority(stops);
      const s = out.get("kiwitaxi:411");
      expect(s?.destination_name).toBe(`${KT_411!.fromName} → ${KT_411!.toName}`);
      expect(s?.lat).toBe(KT_411!.fromLat);
      expect(report.titlesRestored).toBe(1);
      expect(report.geoRestored).toBe(1);
    }
  );
});

// ---------------------------------------------------------------------------
// Kombinacija z TASK 48 plastjo (isti vektor kot živi E2E dokaz)
// ---------------------------------------------------------------------------

describe("TASK 49 §4+§7: kombinacija — tamper ne doseže finalnega načrta", () => {
  test.skipIf(!hasKt)("① KT €1 v izbiri → validateItinerarySupply izda kanonik (NE 1)", async () => {
    const { validateItinerarySupply, computeBudgetValidation } = await import(
      "@/lib/supply/itinerary-validation"
    );

    const { products } = verifySelectedProducts(
      clientSelection({
        price: { amount: 1, currency: "EUR", unit: "per_transfer" },
      })
    );

    const it: Itinerary = {
      days: [
        {
          day: 1,
          title: "Dan 1",
          locations: [
            {
              destination_id: "bled",
              destination_name: "Bled",
              time_slot: "09:00-13:00",
              duration: 4,
              estimated_cost: 50,
              notes: "",
            },
          ],
          weather: { condition: "sončno", temp: 22 },
        },
      ],
      total_budget: 0,
    } as unknown as Itinerary;

    const result = validateItinerarySupply(it, { selection: products }, {
      lang: "sl",
      groupSize: 2,
    });
    const ktStop = result.itinerary.days[0]?.locations.find(
      (l) => l.destination_id === "kiwitaxi:411"
    );
    expect(ktStop?.estimated_cost).toBe(KT_411_PRICE); // NE 1
    // Budget iz kanonskih: per_transfer fromPrice → uncertain, ne "within"
    const budget = computeBudgetValidation(result.itinerary, {
      budget: 500,
      groupSize: 2,
      canonicalCosts: result.report.canonicalCosts,
    });
    expect(budget.status).toBe("uncertain");
    expect(budget.fromPriceCount).toBe(1);
  });
});
