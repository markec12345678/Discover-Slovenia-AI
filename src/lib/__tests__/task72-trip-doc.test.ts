import { describe, expect, test } from "bun:test";
import { buildMyTrip, type TripEntry } from "@/lib/journey/trip-view";
import { computeJourneyTotals, describeTotals } from "@/lib/journey/totals";
import type { JourneyProduct, TravelJourney } from "@/lib/journey/types";
import { bookingCapabilityOf } from "@/lib/journey/booking";

// ============================================================================
// TASK 72 — SKUPNA CENA POTRDITVENEGA DOKUMENTA (§16 kanon po dnevnih vrsticah)
//
// computeJourneyTotals podpis je STRUKTURNO razširjen ( ReadonlyArray<
// Pick<JourneyProduct, "price">>) — dokument sešteva SVOJE vrstice z ISTO
// ločbo kot načrtovalnik: od-cene → estimatedTotal (spodnja meja), točne →
// knownTotal, brez cene → unknownCount (NE ≠ 0). Ni duplikata logike —
// ta test dokazuje, da kanon drži tudi za TripEntry vhod.
// ============================================================================

const P = (amount: number, fromPrice?: boolean) => ({
  amount,
  currency: "EUR" as const,
  unit: "per_person" as const,
  ...(fromPrice ? { fromPrice: true } : {}),
});

/** TripEntry minimalen fixture (samo polja, ki ja kanon §16 bere + obvezna). */
function mkEntry(key: string, price?: TripEntry["price"]): TripEntry {
  return {
    key,
    category: "attractions",
    icon: "🏛️",
    title: `Postanek ${key}`,
    providerLabel: { sl: "FSQ OS Places", en: "FSQ OS Places" },
    ...(price ? { price } : {}),
    status: "INFO",
    statusLabel: { sl: "info", en: "info" },
    cancellation: { sl: "ni", en: "none" },
    bookingId: null,
  };
}

describe("TASK 72: computeJourneyTotals nad TripEntry (struktur tip)", () => {
  test("① mešane vrstice: od-cena → ocena, točna → znano, brez cene → šteto", () => {
    const t = computeJourneyTotals([
      mkEntry("a", P(162, true)),
      mkEntry("b", P(45)),
      mkEntry("c"), // brez cene
      mkEntry("d", P(38, true)),
    ]);
    expect(t.estimatedTotal).toBe(200);
    expect(t.knownTotal).toBe(45);
    expect(t.fromPriceCount).toBe(2);
    expect(t.unknownCount).toBe(1);
    expect(t.confirmedTotal).toBe(0); // danes 0 — isti kanon kot potovanje
    expect(t.currency).toBe("EUR");
  });

  test("② neveljavna količina je unknown, ne NaN (fail-closed)", () => {
    const t = computeJourneyTotals([
      mkEntry("nan", { ...P(30), amount: Number.NaN }),
    ]);
    expect(t.unknownCount).toBe(1);
    expect(t.knownTotal).toBe(0);
  });

  test("③ zaokrožitev na 2 decimalki (isti izrek kot §16)", () => {
    const t = computeJourneyTotals([mkEntry("a", P(10.105)), mkEntry("b", P(20.204))]);
    expect(t.knownTotal).toBe(30.31);
  });

  test("④ prazen dokument → vse nič, describeTotals prazen (brez bloka)", () => {
    const t = computeJourneyTotals([]);
    expect(t.estimatedTotal).toBe(0);
    expect(t.knownTotal).toBe(0);
    expect(t.unknownCount).toBe(0);
    expect(describeTotals(t, "sl")).toBe("");
    expect(describeTotals(t, "en")).toBe("");
  });

  test("⑤ unknown-only → ni številke, samo poštena opomba (NE €0)", () => {
    const t = computeJourneyTotals([mkEntry("a"), mkEntry("b")]);
    const sl = describeTotals(t, "sl");
    const en = describeTotals(t, "en");
    expect(sl).toContain("2 produktov z neznano ceno");
    expect(sl).not.toContain("€0");
    expect(en).toContain("2 products with unknown price");
    expect(en).not.toContain("€0");
  });

  test("⑥ describeTotals sestavi oba dela + unknown (SL/EN)", () => {
    const t = computeJourneyTotals([
      mkEntry("a", P(100, true)),
      mkEntry("b", P(50)),
      mkEntry("c"),
    ]);
    const sl = describeTotals(t, "sl");
    expect(sl).toContain("€100");
    expect(sl).toContain("1 objavljenih");
    expect(sl).toContain("od");
    expect(sl).toContain("znane kanonske cene €50");
    expect(sl).toContain("1 produktov z neznano ceno");
    const en = describeTotals(t, "en");
    expect(en).toContain("€100");
    expect(en).toContain("known canonical prices €50");
    expect(en).toContain("1 products with unknown price");
  });
});

// ---------------------------------------------------------------------------
// INTEGRACIJA: buildMyTrip → vrstice dokumenta ( dnevi + zunanje kartice)
// se seštejejo v pričakovano skupno ceno
// ---------------------------------------------------------------------------

const jp = (over: Partial<JourneyProduct>): JourneyProduct => ({
  id: "kiwitaxi:412",
  provider: "kiwitaxi",
  providerProductId: "412",
  type: "transfer",
  title: "Letališče → Bled",
  bookingMode: "affiliate_redirect",
  category: "transfer",
  mapStatus: "recommended",
  booking: bookingCapabilityOf("affiliate_redirect"),
  ...over,
});

function mkJourney(products: {
  transfer?: JourneyProduct[];
  events?: JourneyProduct[];
  rental?: { provider: string; label: { sl: string; en: string }; url?: string }[];
}): TravelJourney {
  const cat = (key: string, prods: JourneyProduct[], providers: unknown[] = []) => ({
    key,
    products: prods,
    providers,
  });
  return {
    id: "j1",
    lang: "sl",
    origin: { label: "Brnik", lat: 46.224, lng: 14.458, source: "transfer-inventory" },
    destination: { label: "Bled", lat: 46.379, lng: 14.114, source: "destinations" },
    travelers: 2,
    startDate: "2026-10-05",
    arrivalTime: "14:30",
    categories: {
      arrival: cat("arrival", []),
      transfer: cat("transfer", products.transfer ?? []),
      accommodation: cat("accommodation", []),
      restaurants: cat("restaurants", []),
      petrol: cat("petrol", []),
      events: cat("events", products.events ?? []),
      attractions: cat("attractions", []),
      rental: {
        key: "rental",
        products: [],
        providers: (products.rental ?? []).map((r) => ({
          provider: r.provider,
          label: r.label,
          url: r.url ?? "https://example.com",
          booking: bookingCapabilityOf("affiliate_redirect"),
          status: "affiliate" as const,
        })),
      },
    } as unknown as TravelJourney["categories"],
    totals: computeJourneyTotals([]),
    validation: { issues: [] },
    supplyHealth: { degradedProviders: [] },
    generatedAt: "2026-09-21T12:00:00.000Z",
  };
}

describe("TASK 72: integracija buildMyTrip → skupna cena dokumenta", () => {
  test("⑦ transfer (od) + dogodek (točen) → ocena 162 + znano 30; prihod brez cene NI štet kot 0", () => {
    const j = mkJourney({
      transfer: [jp({ price: { amount: 162, currency: "EUR", unit: "per_transfer", fromPrice: true } })],
      events: [
        jp({
          id: "events:e1",
          provider: "events",
          type: "event",
          category: "events",
          title: "Koncert",
          bookingMode: "info_only",
          eventDate: { start: "2026-10-06", end: "2026-10-06" },
          price: { amount: 30, currency: "EUR", unit: "per_person" },
        }),
      ],
    });
    const trip = buildMyTrip(j, new Set(["kiwitaxi:412", "events:e1"]));
    const entries = trip.days.flatMap((d) => d.entries).concat(trip.externalCards);
    const t = computeJourneyTotals(entries);

    // Dan 1: prihod (brez cene) + transfer 162 od; Dan 2: dogodek 30 točen
    expect(t.estimatedTotal).toBe(162);
    expect(t.knownTotal).toBe(30);
    // prihod = traveler input, brez cene → unknown (iskreno štet, ≠ 0)
    expect(t.unknownCount).toBe(1);
    // dni: dan prihoda + dogodkovni dan
    expect(trip.days.length).toBe(2);
    expect(trip.days[0].entries.length).toBe(2); // prihod + transfer
    expect(trip.days[1].entries.length).toBe(1); // dogodek
  });

  test("⑧ zunanja kartica najema brez cene → unknown štet (affiliate kartica NI brezplačna)", () => {
    const j = mkJourney({
      rental: [{ provider: "rentalcars", label: { sl: "Rentalcars", en: "Rentalcars" } }],
    });
    const trip = buildMyTrip(j, new Set());
    const entries = trip.days.flatMap((d) => d.entries).concat(trip.externalCards);
    const t = computeJourneyTotals(entries);
    // prihod (brez cene) + zunanja kartica (brez cene) = 2 unknown
    expect(t.unknownCount).toBe(2);
    expect(t.estimatedTotal).toBe(0);
    expect(t.knownTotal).toBe(0);
    expect(trip.externalCards.length).toBe(1);
  });

  test("⑨ vrstni red dokumenta = dnevi KRONOLOŠKO (vir jih daje po pomembnosti)", () => {
    const j = mkJourney({
      events: [
        jp({
          id: "events:e2",
          provider: "events",
          type: "event",
          category: "events",
          title: "Dogodek B",
          bookingMode: "info_only",
          eventDate: { start: "2026-10-07", end: "2026-10-07" },
        }),
        jp({
          id: "events:e1",
          provider: "events",
          type: "event",
          category: "events",
          title: "Dogodek A",
          bookingMode: "info_only",
          eventDate: { start: "2026-10-06", end: "2026-10-06" },
        }),
      ],
    });
    const trip = buildMyTrip(j, new Set(["events:e1", "events:e2"]));
    expect(trip.days.map((d) => d.date)).toEqual([
      "2026-10-05", // dan prihoda
      "2026-10-06", // dogodek A (vstavljen prvi)
      "2026-10-07", // dogodek B
    ]);
  });

  test("⑩ že obstoječi klic z JourneyProduct[] še vedno tipka (nazaj kompatibilno)", () => {
    const products: JourneyProduct[] = [
      jp({ price: { amount: 20, currency: "EUR", unit: "per_transfer" } }),
    ];
    const t = computeJourneyTotals(products);
    expect(t.knownTotal).toBe(20);
    // ReadonlyArray vhod (npr. [...entries]) deluje
    const readonly = [mkEntry("x", P(10))] as const;
    const t2 = computeJourneyTotals(readonly);
    expect(t2.knownTotal).toBe(10);
  });

  test("⑪ dogodek PRED prihodom se uredi pred dan 1 (iskrena kronologija, ne narrativna)", () => {
    const j = mkJourney({
      events: [
        jp({
          id: "events:early",
          provider: "events",
          type: "event",
          category: "events",
          title: "Zgodnji koncert",
          bookingMode: "info_only",
          eventDate: { start: "2026-10-03", end: "2026-10-03" },
        }),
      ],
    });
    const trip = buildMyTrip(j, new Set(["events:early"]));
    // prihod 2026-10-05 → dogodek 2026-10-03 je kronološko PRVI
    expect(trip.days.map((d) => d.date)).toEqual(["2026-10-03", "2026-10-05"]);
    expect(trip.days[0].entries[0].key).toBe("events:early");
    expect(trip.days[1].entries[0].key).toBe("arrival");
  });

  test("⑫ dan brez datuma prihoda ostane PRVI (sidro časovnice, ne moremo ga urediti)", () => {
    const j = mkJourney({}); // startDate je odstranjen spodaj
    const jNoDate = { ...j, startDate: undefined };
    const trip = buildMyTrip(jNoDate, new Set());
    expect(trip.days.length).toBe(1);
    expect(trip.days[0].date).toBeUndefined();
    expect(trip.days[0].dateLabel.sl).toBe("Datum prihoda ni vnesen");
  });
});
