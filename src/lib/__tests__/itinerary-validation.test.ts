import { describe, test, expect } from "bun:test";
import {
  canonicalStopCost,
  computeBudgetValidation,
  extractSupplyStops,
  isDirectionReversed,
  parseSupplyRef,
  supplyRefKey,
  validateItinerarySupply,
} from "@/lib/supply/itinerary-validation";
import type { SelectedProviderProduct } from "@/lib/supply/types";
import type { Itinerary, LocationVisit } from "@/lib/types";

// ============================================================================
// TASK 48 (1.53.0) — TEST MATRICA §16: supply-doslednost itinererja.
//
// Validacijska plast je ČISTA deterministična funkcija (isto na serverju in
// clientu). Testi kodirajo invariante specifikacije TASK 48:
//   §4 čas (v geo-validation.test.ts — nova pravila tam)
//   §5 smer prevoza — kanonski naslov je avtoriteta
//   §7 cena — unit semantika (per_transfer ≠ ×osebe; per_person × groupSize)
//   §8 unknown is unknown (per_night/per_day → ne ugibamo)
//   §9 FIXED neničljiv (točno enkrat, tudi ob podvojeni izbiri)
//   §10 dedupe SAMO po (provider, id) — nikoli po naslovu
//   §12 proračun — exceeded/within/uncertain iz ZNANIH stroškov
//   §14 refine bypass — obstoječi postanki so avtoriteta drugega reda
// ============================================================================

// ---------------------------------------------------------------------------
// Fixtures — realne koordinate iz slovenia-data (bled/piran/ljubljana)
// ---------------------------------------------------------------------------

/** KiwiTaxi prevoz Ljubljana → Bled: €51 PER TRANSFER (ne × osebe). */
function kiwitaxiTransfer(overrides: Partial<SelectedProviderProduct> = {}): SelectedProviderProduct {
  return {
    provider: "kiwitaxi",
    providerProductId: "123",
    type: "transfer",
    title: "Private transfer Ljubljana → Bled",
    lat: 46.0569,
    lng: 14.5058,
    price: { amount: 51, currency: "EUR", unit: "per_transfer" },
    source: "KiwiTaxi",
    selectionState: "fixed",
    ...overrides,
  };
}

/** Viator tura po Bledu: €79 NA OSEBO. */
function viatorTour(overrides: Partial<SelectedProviderProduct> = {}): SelectedProviderProduct {
  return {
    provider: "viator",
    providerProductId: "456",
    type: "tour",
    title: "Bled lake tour",
    lat: 46.3683,
    lng: 14.0944,
    price: { amount: 79, currency: "EUR", unit: "per_person" },
    source: "Viator",
    selectionState: "preferred",
    ...overrides,
  };
}

function stop(
  id: string,
  name: string,
  slot = "09:00-12:00",
  cost = 0,
  extra: Partial<LocationVisit> = {}
): LocationVisit {
  return {
    destination_id: id,
    destination_name: name,
    time_slot: slot,
    duration: 3,
    estimated_cost: cost,
    notes: "",
    ...extra,
  };
}

function itineraryOf(days: { day: number; stops: LocationVisit[] }[]): Itinerary {
  return {
    days: days.map((d) => ({
      day: d.day,
      locations: d.stops,
      weather: { condition: "sončno", temp: 22 },
    })),
    total_budget: 0,
    recommendations: [],
    tips: [],
    source: "ai",
  };
}

const LANG = { lang: "sl" as const };

// ---------------------------------------------------------------------------
// SUPPLY REF — kolon-format diskriminator
// ---------------------------------------------------------------------------

describe("TASK 48 — parseSupplyRef (kolon-format)", () => {
  test("supply ref: provider:id → {provider, id}", () => {
    expect(parseSupplyRef("kiwitaxi:123")).toEqual({
      provider: "kiwitaxi",
      providerProductId: "123",
    });
    expect(parseSupplyRef("osm:node-98765")).toEqual({
      provider: "osm",
      providerProductId: "node-98765",
    });
  });

  test("T1 id (bled) in klepet id (osm-node-123) NISTA supply refa (brez dvopičja)", () => {
    expect(parseSupplyRef("bled")).toBeNull();
    expect(parseSupplyRef("osm-node-123")).toBeNull();
    expect(parseSupplyRef(undefined)).toBeNull();
    expect(parseSupplyRef(42)).toBeNull();
  });

  test("neznan ponudnik (fake:123) NI supply ref — fail-closed na registru", () => {
    expect(parseSupplyRef("fake:123")).toBeNull();
    expect(parseSupplyRef("viatorr:1")).toBeNull();
  });

  test("supplyRefKey: različna ponudnika z istim id-jem sta RAZLIČNA ključa (§10)", () => {
    expect(supplyRefKey({ provider: "kiwitaxi", providerProductId: "123" })).toBe("kiwitaxi:123");
    expect(supplyRefKey({ provider: "viator", providerProductId: "123" })).toBe("viator:123");
    expect(supplyRefKey({ provider: "kiwitaxi", providerProductId: "123" })).not.toBe(
      supplyRefKey({ provider: "viator", providerProductId: "123" })
    );
  });
});

// ---------------------------------------------------------------------------
// §7 CENA — unit semantika
// ---------------------------------------------------------------------------

describe("TASK 48 — canonicalStopCost (unit semantika §7)", () => {
  test("per_transfer → znesek, NIKOLI × osebe (€51 za 2 osebi ostane €51)", () => {
    expect(
      canonicalStopCost({ amount: 51, currency: "EUR", unit: "per_transfer" }, 2)
    ).toBe(51);
  });

  test("per_vehicle / total → znesek (neodvisno od skupine)", () => {
    expect(
      canonicalStopCost({ amount: 80, currency: "EUR", unit: "per_vehicle" }, 4)
    ).toBe(80);
    expect(
      canonicalStopCost({ amount: 12, currency: "EUR", unit: "total" }, 3)
    ).toBe(12);
  });

  test("per_person → znesek × groupSize (€79 × 2 = €158)", () => {
    expect(
      canonicalStopCost({ amount: 79, currency: "EUR", unit: "per_person" }, 2)
    ).toBe(158);
  });

  test("per_person BREZ groupSize → null (ne ugibamo, §8)", () => {
    expect(
      canonicalStopCost({ amount: 79, currency: "EUR", unit: "per_person" })
    ).toBeNull();
    expect(
      canonicalStopCost({ amount: 79, currency: "EUR", unit: "per_person" }, NaN)
    ).toBeNull();
  });

  test("per_night / per_day → null (št. nočitev/dni ne poznamo — unknown is unknown)", () => {
    expect(
      canonicalStopCost({ amount: 120, currency: "EUR", unit: "per_night" }, 2)
    ).toBeNull();
    expect(
      canonicalStopCost({ amount: 45, currency: "EUR", unit: "per_day" }, 2)
    ).toBeNull();
  });

  test("brez cene / nekončna cena → null", () => {
    expect(canonicalStopCost(undefined, 2)).toBeNull();
    expect(
      canonicalStopCost({ amount: Infinity, currency: "EUR", unit: "total" }, 2)
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §5 SMER PREVOZA — ozko pravilo obrata
// ---------------------------------------------------------------------------

describe("TASK 48 — isDirectionReversed (§5)", () => {
  test("odmev obrne puščico → true", () => {
    expect(isDirectionReversed("Private transfer Ljubljana → Bled", "Transfer Bled → Ljubljana")).toBe(true);
    expect(isDirectionReversed("Ljubljana -> Bled", "Bled -> Ljubljana")).toBe(true);
  });

  test("ista smer (kvalifikatorji so dovoljeni) → false", () => {
    expect(
      isDirectionReversed("Private transfer Ljubljana → Bled", "Transfer Ljubljana → Bled (zjutraj)")
    ).toBe(false);
  });

  test('kvalifikatorji ("Airport") se ignorirajo — obrat je dokazljiv → true', () => {
    // "Ljubljana Airport" se po odstranitvi kvalifikatorja reducirajo na {ljubljana}
    // — zamenjani končni točki sta dokazljivi tudi ob dodatnih besedah.
    expect(
      isDirectionReversed("Ljubljana Airport → Bled", "Bled → Ljubljana")
    ).toBe(true);
  });

  test("različni kraji brez skupnih žetonov → nezmožno dokazati → false (brez false positive)", () => {
    expect(isDirectionReversed("Soča Valley → Bled", "Bohinj → Bled")).toBe(false);
    expect(isDirectionReversed("Piran → Koper", "Koper → Piran (zvečer)")).toBe(true);
  });

  test("brez puščice / prazen naslov → false (ne trdimo ničesar)", () => {
    expect(isDirectionReversed("Bled Castle", "Bled Castle")).toBe(false);
    expect(isDirectionReversed("", "Bled")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GLAVNA PLAST — validateItinerarySupply
// ---------------------------------------------------------------------------

describe("TASK 48 — validateItinerarySupply: SUPPLY REF (§17 matrika)", () => {
  test("veljaven ref (v izbiri) ostane; izmišljen ref je ODSTRANJEN (fail-closed)", () => {
    const it = itineraryOf([
      {
        day: 1,
        stops: [
          stop("bled", "Bled"),
          stop("kiwitaxi:123", "Private transfer Ljubljana → Bled", "17:00-18:00", 51),
          stop("viator:999", "Izmišljena tura", "19:00-20:00", 999), // NI v izbiri
        ],
      },
    ]);
    const { itinerary, report } = validateItinerarySupply(
      it,
      { selection: [kiwitaxiTransfer()] },
      { ...LANG, groupSize: 2 }
    );

    expect(report.supplyStops).toBe(2);
    expect(report.validated).toBe(1);
    expect(report.rejected).toBe(1);
    expect(report.issues).toContainEqual({
      day: 1,
      level: "error",
      rule: "fake_supply_ref",
      ref: "viator:999",
    });
    const ids = itinerary.days[0].locations.map((s) => s.destination_id);
    expect(ids).toEqual(["bled", "kiwitaxi:123"]); // izmišljen GONE
  });

  test("T1/klepet postanki gredo NESPREMENJENI skozi plast", () => {
    const it = itineraryOf([
      {
        day: 1,
        stops: [
          stop("bled", "Bled", "09:00-12:00", 50),
          stop("osm-node-777", "Klepet kraj", "13:00-14:00", 0),
        ],
      },
    ]);
    const { itinerary, report } = validateItinerarySupply(
      it,
      { selection: [] },
      { ...LANG }
    );
    expect(report.supplyStops).toBe(0);
    expect(itinerary.days[0].locations.length).toBe(2);
    expect(itinerary.days[0].locations[0].estimated_cost).toBe(50);
  });
});

describe("TASK 48 — validateItinerarySupply: DUPLICATE (§10)", () => {
  test("isti provider+id dvakrat → dedupe (drugi primerek odstranjen)", () => {
    const it = itineraryOf([
      {
        day: 1,
        stops: [
          stop("kiwitaxi:123", "Transfer 1", "09:00-10:00", 51),
          stop("kiwitaxi:123", "Transfer 1 (ponovno)", "11:00-12:00", 51),
        ],
      },
    ]);
    const { itinerary, report } = validateItinerarySupply(
      it,
      { selection: [kiwitaxiTransfer()] },
      { ...LANG, groupSize: 2 }
    );
    expect(report.deduped).toBe(1);
    expect(report.validated).toBe(1);
    expect(itinerary.days[0].locations.length).toBe(1);
    expect(report.issues).toContainEqual({
      day: 1,
      level: "error",
      rule: "duplicate_supply",
      ref: "kiwitaxi:123",
    });
  });

  test("ISTI id pri RAZLIČNIH ponudnikih = 2 RAZLIČNA produkta (oba ostanejo)", () => {
    const it = itineraryOf([
      {
        day: 1,
        stops: [
          stop("kiwitaxi:123", "KiwiTaxi 123", "09:00-10:00", 51),
          stop("viator:123", "Viator 123", "11:00-12:00", 79),
        ],
      },
    ]);
    const { itinerary, report } = validateItinerarySupply(
      it,
      {
        selection: [
          kiwitaxiTransfer(),
          viatorTour({ providerProductId: "123" }),
        ],
      },
      { ...LANG, groupSize: 2 }
    );
    expect(report.deduped).toBe(0);
    expect(report.validated).toBe(2);
    expect(itinerary.days[0].locations.length).toBe(2);
  });

  test("isti naslov pri različnih ponudnikih NE deduplicira (dedupe SAMO po provider+id)", () => {
    const it = itineraryOf([
      {
        day: 1,
        stops: [
          stop("kiwitaxi:123", "Bled Castle", "09:00-10:00", 51),
          stop("viator:777", "Bled Castle", "11:00-12:00", 79),
        ],
      },
    ]);
    const { itinerary, report } = validateItinerarySupply(
      it,
      {
        selection: [
          kiwitaxiTransfer({ title: "Bled Castle" }),
          viatorTour({ providerProductId: "777", title: "Bled Castle" }),
        ],
      },
      { ...LANG, groupSize: 2 }
    );
    expect(report.deduped).toBe(0);
    expect(itinerary.days[0].locations.length).toBe(2);
  });
});

describe("TASK 48 — validateItinerarySupply: CENA + GEO + SMER", () => {
  test("per_transfer odmev z ×osebe (€102) → popravljen na kanonskih €51", () => {
    const it = itineraryOf([
      {
        day: 1,
        stops: [stop("kiwitaxi:123", "Transfer", "09:00-10:00", 102)], // AI pomnožil z 2
      },
    ]);
    const { itinerary, report } = validateItinerarySupply(
      it,
      { selection: [kiwitaxiTransfer()] },
      { ...LANG, groupSize: 2 }
    );
    expect(report.priceCorrections).toBe(1);
    expect(itinerary.days[0].locations[0].estimated_cost).toBe(51);
    expect(report.canonicalCosts.get("kiwitaxi:123")).toEqual({
      cost: 51,
      fromPrice: false,
    });
  });

  test("per_person odmev z golim zneskom (€79) → popravljen na €79×2=€158", () => {
    const it = itineraryOf([
      {
        day: 1,
        stops: [stop("viator:456", "Bled lake tour", "09:00-12:00", 79)],
      },
    ]);
    const { itinerary, report } = validateItinerarySupply(
      it,
      { selection: [viatorTour()] },
      { ...LANG, groupSize: 2 }
    );
    expect(report.priceCorrections).toBe(1);
    expect(itinerary.days[0].locations[0].estimated_cost).toBe(158);
  });

  test("kanonska cena neznan (per_night) → estimated_cost ostane KOT JE (unknown is unknown)", () => {
    const it = itineraryOf([
      {
        day: 1,
        stops: [stop("booking:N1", "Hotel Park", "09:00-10:00", 0)],
      },
    ]);
    const { itinerary, report } = validateItinerarySupply(
      it,
      {
        selection: [
          {
            provider: "booking",
            providerProductId: "N1",
            type: "accommodation",
            title: "Hotel Park",
            lat: 46.3683,
            lng: 14.0944,
            price: { amount: 120, currency: "EUR", unit: "per_night" },
            source: "Booking",
            selectionState: "fixed",
          },
        ],
      },
      { ...LANG, groupSize: 2 }
    );
    // nastanitev ni postanek — ref gre skozi (je v izbiri) ampak cena ostane
    expect(report.priceCorrections).toBe(0);
    expect(itinerary.days[0].locations[0].estimated_cost).toBe(0);
  });

  test("koordinate odmeva (drift) → obnovljene iz kanonske izbire (§6)", () => {
    const it = itineraryOf([
      {
        day: 1,
        stops: [
          stop("viator:456", "Bled lake tour", "09:00-12:00", 158, {
            lat: 45.5233, // AI premaknil pin na Piran
            lng: 13.5676,
          }),
        ],
      },
    ]);
    const { itinerary, report } = validateItinerarySupply(
      it,
      { selection: [viatorTour()] },
      { ...LANG, groupSize: 2 }
    );
    expect(report.geoRestored).toBe(1);
    expect(itinerary.days[0].locations[0].lat).toBe(46.3683);
    expect(itinerary.days[0].locations[0].lng).toBe(14.0944);
  });

  test("obrnjena smer prevoza v odmevu → naslov obnovljen iz kanona (§5)", () => {
    const it = itineraryOf([
      {
        day: 1,
        stops: [
          stop("kiwitaxi:123", "Transfer Bled → Ljubljana", "17:00-18:00", 51),
        ],
      },
    ]);
    const { itinerary, report } = validateItinerarySupply(
      it,
      { selection: [kiwitaxiTransfer()] },
      { ...LANG, groupSize: 2 }
    );
    expect(report.directionsFixed).toBe(1);
    expect(itinerary.days[0].locations[0].destination_name).toBe(
      "Private transfer Ljubljana → Bled"
    );
  });

  test("fromPrice: kanonska cena JE spodnja meja — cost zapisan, fromPrice:true", () => {
    const it = itineraryOf([
      {
        day: 1,
        stops: [stop("viator:456", "Bled lake tour", "09:00-12:00", 79)],
      },
    ]);
    const { report } = validateItinerarySupply(
      it,
      {
        selection: [
          viatorTour({
            price: { amount: 79, currency: "EUR", unit: "per_person", fromPrice: true },
          }),
        ],
      },
      { ...LANG, groupSize: 2 }
    );
    expect(report.canonicalCosts.get("viator:456")).toEqual({
      cost: 158,
      fromPrice: true,
    });
  });
});

// ---------------------------------------------------------------------------
// §9 FIXED INVARIANT — točno enkrat
// ---------------------------------------------------------------------------

describe("TASK 48 — validateItinerarySupply: FIXED (§9)", () => {
  test("AI izpusti FIXED → vnese točno ENKRAT (najbližji dan po haversinu)", () => {
    const it = itineraryOf([
      { day: 1, stops: [stop("ljubljana", "Ljubljana")] },
      { day: 2, stops: [stop("piran", "Piran")] },
    ]);
    const { itinerary, report } = validateItinerarySupply(
      it,
      { selection: [kiwitaxiTransfer()] }, // geo ~ Ljubljana → dan 1
      { ...LANG, groupSize: 2 }
    );
    expect(report.reinserted).toBe(1);
    const allStops = itinerary.days.flatMap((d) => d.locations);
    const inserted = allStops.filter((s) => s.destination_id === "kiwitaxi:123");
    expect(inserted.length).toBe(1); // exactly once
    expect(inserted[0].estimated_cost).toBe(51); // kanonska cena per_transfer
    // vstavljen na dan 1 (najbližji Ljubljani)
    expect(itinerary.days[0].locations.some((s) => s.destination_id === "kiwitaxi:123")).toBe(true);
  });

  test("FIXED že prisoten v odmevu → NE podvoji (exactly once garant)", () => {
    const it = itineraryOf([
      {
        day: 1,
        stops: [
          stop("ljubljana", "Ljubljana"),
          stop("kiwitaxi:123", "Private transfer Ljubljana → Bled", "17:00-18:00", 51),
        ],
      },
    ]);
    const { itinerary, report } = validateItinerarySupply(
      it,
      { selection: [kiwitaxiTransfer()] },
      { ...LANG, groupSize: 2 }
    );
    expect(report.reinserted).toBe(0);
    const inserted = itinerary.days[0].locations.filter(
      (s) => s.destination_id === "kiwitaxi:123"
    );
    expect(inserted.length).toBe(1);
  });

  test("FIXED nastanitev NI postanek (nočitvena baza ostane v izbiri)", () => {
    const it = itineraryOf([{ day: 1, stops: [stop("bled", "Bled")] }]);
    const { itinerary, report } = validateItinerarySupply(
      it,
      {
        selection: [
          {
            provider: "booking",
            providerProductId: "H1",
            type: "accommodation",
            title: "Hotel Park",
            lat: 46.3683,
            lng: 14.0944,
            price: { amount: 120, currency: "EUR", unit: "per_night" },
            source: "Booking",
            selectionState: "fixed",
          },
        ],
      },
      { ...LANG, groupSize: 2 }
    );
    expect(report.reinserted).toBe(0);
    expect(itinerary.days[0].locations.length).toBe(1);
  });

  test("FIXED brez geo → NI vstavljen (pošteno: ne moremo izbrati dneva)", () => {
    const it = itineraryOf([{ day: 1, stops: [stop("bled", "Bled")] }]);
    const { report } = validateItinerarySupply(
      it,
      { selection: [kiwitaxiTransfer({ lat: undefined, lng: undefined })] },
      { ...LANG, groupSize: 2 }
    );
    expect(report.reinserted).toBe(0);
  });

  test("dva FIXED produkta → oba vstavljena (vsak enkrat)", () => {
    const it = itineraryOf([{ day: 1, stops: [stop("ljubljana", "Ljubljana")] }]);
    const { itinerary, report } = validateItinerarySupply(
      it,
      {
        selection: [
          kiwitaxiTransfer(),
          viatorTour({ selectionState: "fixed", lat: 46.3683, lng: 14.0944 }),
        ],
      },
      { ...LANG, groupSize: 2 }
    );
    expect(report.reinserted).toBe(2);
    const allStops = itinerary.days.flatMap((d) => d.locations);
    expect(allStops.filter((s) => s.destination_id === "kiwitaxi:123").length).toBe(1);
    expect(allStops.filter((s) => s.destination_id === "viator:456").length).toBe(1);
  });

  test("reinsertFixed: false (hitre akcije) → izpust FIXED ostane izpuščen (eksplicitna intencija)", () => {
    const it = itineraryOf([{ day: 1, stops: [stop("bled", "Bled")] }]);
    const { report } = validateItinerarySupply(
      it,
      { selection: [kiwitaxiTransfer()] },
      { ...LANG, groupSize: 2, reinsertFixed: false }
    );
    expect(report.reinserted).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// §14 REFINEMENT — obstoječi postanki kot avtoriteta drugega reda
// ---------------------------------------------------------------------------

describe("TASK 48 — validateItinerarySupply: REFINEMENT (§14)", () => {
  /** Načrt PRED refine: transfer + tura, že prikazana uporabniku (z
   *  koordinatami, kot jih pusti generacija/insertProductStop). */
  function currentPlan(): Itinerary {
    return itineraryOf([
      {
        day: 1,
        stops: [
          stop("ljubljana", "Ljubljana", "09:00-12:00", 40),
          stop("kiwitaxi:123", "Private transfer Ljubljana → Bled", "17:00-18:00", 51, {
            lat: 46.0569,
            lng: 14.5058,
          }),
          stop("viator:456", "Bled lake tour", "19:00-21:00", 158, {
            lat: 46.3683,
            lng: 14.0944,
          }),
        ],
      },
    ]);
  }

  test("UNCHANGED supply v odmevu → 0 sprememb (refine bypass fix je nemoten)", () => {
    const current = currentPlan();
    const echo = currentPlan(); // AI vrne isto
    const { itinerary, report } = validateItinerarySupply(
      echo,
      {
        selection: [kiwitaxiTransfer(), viatorTour()],
        currentStops: extractSupplyStops(current),
      },
      { ...LANG, groupSize: 2, reinsertFixedFrom: "current" }
    );
    expect(report.validated).toBe(2);
    expect(report.rejected).toBe(0);
    expect(report.priceCorrections).toBe(0);
    expect(report.geoRestored).toBe(0);
    expect(report.reinserted).toBe(0);
    expect(itinerary.days[0].locations.length).toBe(3);
  });

  test("CHANGED cena obstoječega postanka → obnovljena iz načrta pred spremembo", () => {
    const current = currentPlan();
    const echo = itineraryOf([
      {
        day: 1,
        stops: [
          stop("ljubljana", "Ljubljana", "09:00-12:00", 40),
          stop("kiwitaxi:123", "Private transfer Ljubljana → Bled", "17:00-18:00", 999), // AI laž
          stop("viator:456", "Bled lake tour", "19:00-21:00", 158),
        ],
      },
    ]);
    const { itinerary, report } = validateItinerarySupply(
      echo,
      {
        selection: [kiwitaxiTransfer(), viatorTour()],
        currentStops: extractSupplyStops(current),
      },
      { ...LANG, groupSize: 2, reinsertFixedFrom: "current" }
    );
    // Izbira (selection) ima prednost: kanon = €51 (per_transfer)
    expect(report.priceCorrections).toBe(1);
    expect(itinerary.days[0].locations.find((s) => s.destination_id === "kiwitaxi:123")?.estimated_cost).toBe(51);
  });

  test("REMOVED FIXED (bil v current) → PONOVNO VNEŠEN (AI ga ne more tiho zbrisati)", () => {
    const current = currentPlan();
    const echo = itineraryOf([
      {
        day: 1,
        stops: [
          stop("ljubljana", "Ljubljana", "09:00-12:00", 40),
          // kiwitaxi:123 MANJKA — AI ga je zbrisal
          stop("viator:456", "Bled lake tour", "19:00-21:00", 158),
        ],
      },
    ]);
    const { itinerary, report } = validateItinerarySupply(
      echo,
      {
        selection: [kiwitaxiTransfer(), viatorTour()],
        currentStops: extractSupplyStops(current),
      },
      { ...LANG, groupSize: 2, reinsertFixedFrom: "current" }
    );
    expect(report.reinserted).toBe(1);
    expect(
      itinerary.days.some((d) =>
        d.locations.some((s) => s.destination_id === "kiwitaxi:123")
      )
    ).toBe(true);
    expect(report.issues).toContainEqual({
      day: 1,
      level: "warn",
      rule: "fixed_reinserted",
      ref: "kiwitaxi:123",
    });
  });

  test("REMOVED PREFERRED (bil v current, ni FIXED) → ostanе odstranjen (ni prisiljen)", () => {
    const current = currentPlan();
    const echo = itineraryOf([
      {
        day: 1,
        stops: [
          stop("ljubljana", "Ljubljana", "09:00-12:00", 40),
          stop("kiwitaxi:123", "Private transfer Ljubljana → Bled", "17:00-18:00", 51),
          // viator:456 (PREFERRED) manjka — AI ga je zbrisal
        ],
      },
    ]);
    const { itinerary, report } = validateItinerarySupply(
      echo,
      {
        selection: [kiwitaxiTransfer(), viatorTour()], // viator = preferred
        currentStops: extractSupplyStops(current),
      },
      { ...LANG, groupSize: 2, reinsertFixedFrom: "current" }
    );
    expect(report.reinserted).toBe(0); // preferred se NE vsiljuje nazaj
    expect(
      itinerary.days.some((d) =>
        d.locations.some((s) => s.destination_id === "viator:456")
      )
    ).toBe(false);
  });

  test("NOV kolon-ref, ki ga NI niti v izbiri niti v current → ODDSTRANJEN (fabricate guard)", () => {
    const current = currentPlan();
    const echo = itineraryOf([
      {
        day: 1,
        stops: [
          stop("ljubljana", "Ljubljana", "09:00-12:00", 40),
          stop("viator:31337", "Izmišljena tura", "13:00-14:00", 5),
        ],
      },
    ]);
    const { itinerary, report } = validateItinerarySupply(
      echo,
      {
        selection: [kiwitaxiTransfer(), viatorTour()],
        currentStops: extractSupplyStops(current),
      },
      { ...LANG, groupSize: 2, reinsertFixedFrom: "current" }
    );
    expect(report.rejected).toBe(1);
    expect(
      itinerary.days.some((d) =>
        d.locations.some((s) => s.destination_id === "viator:31337")
      )
    ).toBe(false);
  });

  test("FIXED v izbiri, ki NI bil v current → refine ga NE vsili (to je pot generacije)", () => {
    const current = itineraryOf([
      { day: 1, stops: [stop("ljubljana", "Ljubljana", "09:00-12:00", 40)] },
    ]);
    const echo = itineraryOf([
      { day: 1, stops: [stop("ljubljana", "Ljubljana", "09:00-12:00", 40)] },
    ]);
    const { report } = validateItinerarySupply(
      echo,
      {
        selection: [kiwitaxiTransfer()],
        currentStops: extractSupplyStops(current),
      },
      { ...LANG, groupSize: 2, reinsertFixedFrom: "current" }
    );
    expect(report.reinserted).toBe(0);
  });

  test("currentStops kot edina avtoriteta (stari klient brez izbire) — cena ostane stabilna", () => {
    const current = currentPlan();
    const echo = itineraryOf([
      {
        day: 1,
        stops: [
          stop("ljubljana", "Ljubljana", "09:00-12:00", 40),
          stop("kiwitaxi:123", "Private transfer Ljubljana → Bled", "17:00-18:00", 77), // AI spremenil
          stop("viator:456", "Bled lake tour", "19:00-21:00", 158),
        ],
      },
    ]);
    const { itinerary, report } = validateItinerarySupply(
      echo,
      { selection: [], currentStops: extractSupplyStops(current) }, // NO selection
      { ...LANG, groupSize: 2, reinsertFixedFrom: "current" }
    );
    // avtoriteta drugega reda: vrednost iz current (51)
    expect(report.priceCorrections).toBe(1);
    expect(
      itinerary.days[0].locations.find((s) => s.destination_id === "kiwitaxi:123")?.estimated_cost
    ).toBe(51);
  });
});

// ---------------------------------------------------------------------------
// §12 BUDGET — status iz ZNANIH stroškov
// ---------------------------------------------------------------------------

describe("TASK 48 — computeBudgetValidation (§12)", () => {
  /** 2 postanka T1 (bled €25 + piran €35 na osebo) × 2 osebi = €120 znanih. */
  function t1Plan(): Itinerary {
    return itineraryOf([
      {
        day: 1,
        stops: [
          stop("bled", "Bled", "09:00-12:00", 50),
          stop("piran", "Piran", "14:00-17:00", 70),
        ],
      },
    ]);
  }

  test("vsi stroški znani (T1 kanon) + znotraj proračuna → within", () => {
    const bv = computeBudgetValidation(t1Plan(), {
      budget: 500,
      groupSize: 2,
    });
    expect(bv.status).toBe("within");
    expect(bv.knownTotal).toBe(120); // (25+35)×2
    expect(bv.stopsTotal).toBe(120);
    expect(bv.unknownCostStops).toBe(0);
    expect(bv.fromPriceCount).toBe(0);
  });

  test("znani kanonski stroški NAD proračunom → exceeded (tudi če prikaz manjši)", () => {
    const bv = computeBudgetValidation(t1Plan(), {
      budget: 100,
      groupSize: 2,
    });
    expect(bv.status).toBe("exceeded");
    expect(bv.knownTotal).toBe(120);
  });

  test("prikazani seštevek NAD proračunom → uncertain (ne moremo trditi within)", () => {
    const it = itineraryOf([
      {
        day: 1,
        stops: [
          stop("bled", "Bled", "09:00-12:00", 300), // AI odmev napihnjen
          stop("piran", "Piran", "14:00-17:00", 300),
        ],
      },
    ]);
    const bv = computeBudgetValidation(it, { budget: 500, groupSize: 2 });
    expect(bv.knownTotal).toBe(120);
    expect(bv.stopsTotal).toBe(600);
    expect(bv.status).toBe("uncertain"); // kanon spravi, prikaz pa ne
  });

  test("neznan strošek (klepet kraj) → uncertain (nikoli within brez dokaza)", () => {
    const it = itineraryOf([
      {
        day: 1,
        stops: [
          stop("bled", "Bled", "09:00-12:00", 50),
          stop("osm-node-777", "Klepet kraj", "14:00-15:00", 0), // neznan strošek
        ],
      },
    ]);
    const bv = computeBudgetValidation(it, { budget: 500, groupSize: 2 });
    expect(bv.unknownCostStops).toBe(1);
    expect(bv.status).toBe("uncertain");
  });

  test("fromPrice cena → uncertain (spodnja meja ne dokaže končnega zneska)", () => {
    const it = itineraryOf([
      { day: 1, stops: [stop("viator:456", "Tura", "09:00-12:00", 158)] },
    ]);
    const canonicalCosts = new Map([
      ["viator:456", { cost: 158, fromPrice: true }],
    ]);
    const bv = computeBudgetValidation(it, {
      budget: 500,
      groupSize: 2,
      canonicalCosts,
    });
    expect(bv.fromPriceCount).toBe(1);
    expect(bv.knownTotal).toBe(158);
    expect(bv.status).toBe("uncertain");
  });

  test("supply postanki z znanimi kanonskimi cenami → within (dokazljivo)", () => {
    const it = itineraryOf([
      {
        day: 1,
        stops: [
          stop("kiwitaxi:123", "Transfer", "09:00-10:00", 51),
          stop("viator:456", "Tura", "11:00-14:00", 158),
        ],
      },
    ]);
    const canonicalCosts = new Map([
      ["kiwitaxi:123", { cost: 51, fromPrice: false }],
      ["viator:456", { cost: 158, fromPrice: false }],
    ]);
    const bv = computeBudgetValidation(it, {
      budget: 500,
      groupSize: 2,
      canonicalCosts,
    });
    expect(bv.status).toBe("within");
    expect(bv.knownTotal).toBe(209);
  });

  test("supply postanek BREZ kanonske cene (per_night) → uncertain", () => {
    const it = itineraryOf([
      { day: 1, stops: [stop("booking:N1", "Hotel", "09:00-10:00", 0)] },
    ]);
    const bv = computeBudgetValidation(it, {
      budget: 500,
      groupSize: 2,
      canonicalCosts: new Map(), // per_night → ni v mapi
    });
    expect(bv.unknownCostStops).toBe(1);
    expect(bv.status).toBe("uncertain");
  });

  test("brez uporabniškega proračuna → uncertain (ni primerjave)", () => {
    const bv = computeBudgetValidation(t1Plan(), { groupSize: 2 });
    expect(bv.status).toBe("uncertain");
    expect(bv.budget).toBeNull();
  });

  test("T1 brez groupSize → unknown (costPerPerson na osebo ni skupinski dokaz)", () => {
    const bv = computeBudgetValidation(t1Plan(), { budget: 500 });
    expect(bv.unknownCostStops).toBe(2);
    expect(bv.status).toBe("uncertain");
  });

  test("500 € proračun + 480 € znanih + 100 € nov izdelek → exceeded (§12 scenarij)", () => {
    // znanih 480 (12 × T1 €40/osebo × 1 oseba) + kanonskih 100 = 580 > 500
    const stops: LocationVisit[] = Array.from({ length: 12 }, (_, i) =>
      stop(`dest-${i}`, `Dest ${i}`, "09:00-10:00", 40)
    );
    // uporabimo pravi T1 (soca €40) — 12× enako
    const it = itineraryOf([
      { day: 1, stops: stops.map((s) => ({ ...s, destination_id: "soca", destination_name: "Soča" })) },
    ]);
    const canonicalCosts = new Map([["kiwitaxi:123", { cost: 100, fromPrice: false }]]);
    const withTransfer = itineraryOf([
      {
        day: 1,
        stops: [
          ...it.days[0].locations,
          stop("kiwitaxi:123", "Transfer", "18:00-19:00", 100),
        ],
      },
    ]);
    const bv = computeBudgetValidation(withTransfer, {
      budget: 500,
      groupSize: 1,
      canonicalCosts,
    });
    expect(bv.knownTotal).toBe(580); // 480 + 100
    expect(bv.status).toBe("exceeded");
  });
});

// ---------------------------------------------------------------------------
// extractSupplyStops — pomožnik refine poti
// ---------------------------------------------------------------------------

describe("TASK 48 — extractSupplyStops", () => {
  test("izlušči SAMO kolon-format ref (prvi primerek)", () => {
    const it = itineraryOf([
      {
        day: 1,
        stops: [
          stop("bled", "Bled"),
          stop("kiwitaxi:123", "Transfer", "09:00-10:00", 51),
        ],
      },
      {
        day: 2,
        stops: [
          stop("kiwitaxi:123", "Transfer (drugi dan)", "09:00-10:00", 51),
          stop("viator:456", "Tura", "11:00-14:00", 158),
        ],
      },
    ]);
    const map = extractSupplyStops(it);
    expect(map.size).toBe(2);
    expect(map.has("kiwitaxi:123")).toBe(true);
    expect(map.has("viator:456")).toBe(true);
    expect(map.get("kiwitaxi:123")?.destination_name).toBe("Transfer"); // prvi primerek
  });
});

// ============================================================================
// TASK 50 (1.55.0) — §10/§11: klientova cena NI kanonska, kadar vira ni mogoče
// strežniško verificirati (currentStops authority z NaN ceno iz
// verifyCurrentStopsAuthority). Prikaz in proračun morata biti USKLAJENA:
// unknown je unknown (NaN), nikoli klientova cifra.
// ============================================================================

describe("TASK 50 — price_unverified (§10: unknown ≠ klientova cifra)", () => {
  test("viator postanek v currentStops z NaN ceno → izhod estimated_cost NaN + poštena opomba (SL)", () => {
    // currentStops simulira verifyCurrentStopsAuthority izhod: viator brez
    // priključitve → cena NaN (unknown). AI/echo odmev pa nosi klientovih 500.
    const currentStops = new Map<string, LocationVisit>([
      ["viator:99999", stop("viator:99999", "Fake Luxury Tour", "19:00-21:00", Number.NaN)],
    ]);
    const it = itineraryOf([
      { day: 1, stops: [stop("viator:99999", "Fake Luxury Tour", "19:00-21:00", 500, { notes: "cena: 500 € · vir: viator" })] },
    ]);
    const res = validateItinerarySupply(it, { selection: [], currentStops }, LANG);
    const out = res.itinerary.days[0].locations[0];
    expect(Number.isNaN(out.estimated_cost)).toBe(true);
    expect(out.notes).toContain("Cena ni preverjena");
    expect(out.notes).not.toContain("500");
    expect(res.report.issues.some((i) => i.rule === "price_unverified")).toBe(true);
  });

  test("EN variant: poštena opomba v angleščini", () => {
    const currentStops = new Map<string, LocationVisit>([
      ["viator:99999", stop("viator:99999", "Fake Tour", "19:00-21:00", Number.NaN)],
    ]);
    const it = itineraryOf([
      { day: 1, stops: [stop("viator:99999", "Fake Tour", "19:00-21:00", 999)] },
    ]);
    const res = validateItinerarySupply(it, { selection: [], currentStops }, { lang: "en" });
    expect(res.itinerary.days[0].locations[0].notes).toContain("Price not verified");
  });

  test("KT postanek z NaN currentStop (dataset manjka) → tudi NaN, ne klientova cifra", () => {
    const currentStops = new Map<string, LocationVisit>([
      ["kiwitaxi:411", stop("kiwitaxi:411", "Transfer", "18:00-19:00", Number.NaN)],
    ]);
    const it = itineraryOf([
      { day: 1, stops: [stop("kiwitaxi:411", "Transfer", "18:00-19:00", 1234)] },
    ]);
    const res = validateItinerarySupply(it, { selection: [], currentStops }, LANG);
    expect(Number.isNaN(res.itinerary.days[0].locations[0].estimated_cost)).toBe(true);
  });

  test("FINITE currentStop (KT €51) ostane kanon — regresija 1.54 vedenja", () => {
    const currentStops = new Map<string, LocationVisit>([
      ["kiwitaxi:123", stop("kiwitaxi:123", "Private transfer Ljubljana → Bled", "09:00-10:00", 51)],
    ]);
    const it = itineraryOf([
      { day: 1, stops: [stop("kiwitaxi:123", "Transfer", "09:00-10:00", 1)] },
    ]);
    const res = validateItinerarySupply(it, { selection: [], currentStops }, LANG);
    expect(res.itinerary.days[0].locations[0].estimated_cost).toBe(51);
    expect(res.report.priceCorrections).toBe(1);
  });

  test("budget sloj: NaN cena se NE šteje v stopsTotal/knownTotal (computeBudgetValidation)", () => {
    const it = itineraryOf([
      {
        day: 1,
        stops: [
          stop("bled", "Bled", "09:00-13:00", 50),
          stop("viator:99999", "Fake", "14:00-16:00", Number.NaN),
        ],
      },
    ]);
    const bv = computeBudgetValidation(it, { budget: 500, groupSize: 2 });
    expect(bv.unknownCostStops).toBe(1); // viator:99999 brez kanona
    expect(bv.stopsTotal).toBe(50); // NaN prispeva 0
    expect(bv.knownTotal).toBe(50); // T1 bled 25×2
  });
});
