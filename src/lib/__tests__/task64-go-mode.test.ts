// ============================================================================
// TASK 64 — GO MODE „NA POTI": NOW & NEXT (1.64.0)
// ============================================================================
// Pokriva: čisti gradilnik go-view (aktivni dan, naslednja postanka,
// opravljeni postanki, countdown SAMO iz realnih časov, razdalja/smer SAMO
// pri GPS+geo — premica, ne vozna), kompasno matematiko (azimut/kardinali
// SL+EN), persistenco dai:go-trip / dai:go-progress (varna proti pokvarjenim
// zapisom, SSR guard) in podajo geo/telefona/ur skozi buildMyTrip (isti DI
// kanon kot TASK 63 — 0 omrežja).
// ============================================================================

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { planJourney } from "@/lib/journey/orchestrator";
import { buildMyTrip, type MyTripDay, type MyTripView, type TripEntry } from "@/lib/journey/trip-view";
import {
  bearingDeg,
  buildGoView,
  cardinalLabel,
  GO_LABELS,
} from "@/lib/journey/go-view";
import {
  clearGoTrip,
  loadGoProgress,
  loadGoTrip,
  saveGoProgress,
  saveGoTrip,
} from "@/lib/journey/go-persist";
import { getProvider } from "@/lib/supply/registry";
import type { SupplyAdapter } from "@/lib/supply/adapter";
import type { ProviderProduct } from "@/lib/supply/types";
import { getKiwitaxiBaseline } from "@/lib/supply/providers/kiwitaxi/dataset";
import { clearProviderRateLimits } from "@/lib/supply/search";

const baseline = getKiwitaxiBaseline();
const hasKt = Boolean(baseline);

// TASK 76: planJourney poganja searchSupply — runner-jev omejevalnik je
// module state, deljen med datotekami suite-a (bun test = en proces).
beforeEach(() => {
  clearProviderRateLimits();
});

// ---------------------------------------------------------------------------
// Fixture gradniki (čisti — go-view testiramo BREZ celotnega journeyja)
// ---------------------------------------------------------------------------

function mkEntry(key: string, over: Partial<TripEntry> = {}): TripEntry {
  return {
    key,
    category: "attractions",
    icon: "🏛️",
    title: `Postanek ${key}`,
    providerLabel: { sl: "FSQ OS Places", en: "FSQ OS Places" },
    status: "INFO",
    statusLabel: {
      sl: "Samo informacija — brez rezervacije",
      en: "Information only — no booking",
    },
    cancellation: {
      sl: "Ni rezervacije — nič za preklicati.",
      en: "No booking — nothing to cancel.",
    },
    bookingId: null,
    ...over,
  };
}

function mkDay(date: string | undefined, entries: TripEntry[]): MyTripDay {
  return {
    ...(date ? { date } : {}),
    dateLabel: date
      ? { sl: `${date} (sl)`, en: `${date} (en)` }
      : { sl: "Datum prihoda ni vnesen", en: "Arrival date not entered" },
    entries,
  };
}

function mkTrip(days: MyTripDay[]): MyTripView {
  return {
    title: { sl: "MOJA POT — BLED", en: "MY TRIP — BLED" },
    days,
    externalCards: [],
    confirmation: {
      confirmedCount: 0,
      note: { sl: "ni", en: "none" },
    },
    generatedAt: new Date().toISOString(),
  };
}

/** 20. 9. 2026, 14:00 LOKALNO (isoOf uporablja lokalne komponente). */
const NOW = new Date(2026, 8, 20, 14, 0);
const TODAY = "2026-09-20";

// ---------------------------------------------------------------------------
// 1 — KOMPASNA MATEMATIKA (azimut + kardinali SL/EN)
// ---------------------------------------------------------------------------

describe("TASK 64: kompasna matematika", () => {
  test("① azimut: sever 0°, vzhod 90°, jug 180°, zahod 270°", () => {
    const equator = { lat: 0, lng: 0 };
    expect(Math.round(bearingDeg(equator, { lat: 1, lng: 0 }))).toBe(0);
    expect(Math.round(bearingDeg(equator, { lat: 0, lng: 1 }))).toBe(90);
    expect(Math.round(bearingDeg(equator, { lat: -1, lng: 0 }))).toBe(180);
    expect(Math.round(bearingDeg(equator, { lat: 0, lng: -1 }))).toBe(270);
  });

  test("② kardinali: 8 smeri, SL + EN", () => {
    expect(cardinalLabel(0).sl).toBe("sever");
    expect(cardinalLabel(0).en).toBe("north");
    expect(cardinalLabel(45).sl).toBe("severovzhod");
    expect(cardinalLabel(90).en).toBe("east");
    expect(cardinalLabel(135).sl).toBe("jugovzhod");
    expect(cardinalLabel(180).sl).toBe("jug");
    expect(cardinalLabel(225).en).toBe("southwest");
    expect(cardinalLabel(270).sl).toBe("zahod");
    expect(cardinalLabel(315).en).toBe("northwest");
    // Robni: 359.9° je še sever (sektor ±22,5°).
    expect(cardinalLabel(359.9).sl).toBe("sever");
    expect(cardinalLabel(22.4).sl).toBe("sever");
    expect(cardinalLabel(22.6).sl).toBe("severovzhod");
  });
});

// ---------------------------------------------------------------------------
// 2 — BUILD GO VIEW: AKTIVNI DAN + NASLEDNJE + OSTANEK + OPRABLJENO
// ---------------------------------------------------------------------------

describe("TASK 64: buildGoView — dnevna logika", () => {
  test("① dan z datumom == danes je aktiven (brez opombe)", () => {
    const trip = mkTrip([
      mkDay(TODAY, [mkEntry("a"), mkEntry("b")]),
      mkDay("2026-09-21", [mkEntry("c")]),
    ]);
    const v = buildGoView(trip, NOW, null, {});
    expect(v.activeDayLabel.sl).toContain(TODAY);
    expect(v.activeDayNote).toBeUndefined();
    expect(v.next?.entry.key).toBe("a");
    expect(v.remaining.map((c) => c.entry.key)).toEqual(["b"]);
    expect(v.laterDays.map((d) => d.count)).toEqual([1]);
  });

  test("② naslednje = prva NE-opravljena; opravljene gredo v done z doneAt", () => {
    const trip = mkTrip([
      mkDay(TODAY, [mkEntry("a"), mkEntry("b"), mkEntry("c")]),
    ]);
    const v = buildGoView(trip, NOW, null, { a: "2026-09-20T13:58:00.000Z" });
    expect(v.next?.entry.key).toBe("b");
    expect(v.remaining.map((c) => c.entry.key)).toEqual(["c"]);
    expect(v.done).toHaveLength(1);
    expect(v.done[0]?.entry.key).toBe("a");
    expect(v.done[0]?.doneAt).toBe("2026-09-20T13:58:00.000Z");
  });

  test("③ countdown SAMO iz realnega časa (14:30 pri 14:00 → 30 min)", () => {
    const trip = mkTrip([
      mkDay(TODAY, [mkEntry("a", { time: { start: "14:30" } })]),
    ]);
    const v = buildGoView(trip, NOW, null, {});
    expect(v.next?.countdownMin).toBe(30);
    expect(v.dayHasRealTime).toBe(true);
  });

  test("④ brez realnega časa → NI countdown-a; timeNote ostane iskren", () => {
    const trip = mkTrip([
      mkDay(TODAY, [
        mkEntry("a", {
          timeNote: {
            sl: "Odpiralni časi niso objavljeni v viru.",
            en: "Opening hours are not published by the source.",
          },
        }),
      ]),
    ]);
    const v = buildGoView(trip, NOW, null, {});
    expect(v.next?.countdownMin).toBeUndefined();
    expect(v.next?.entry.timeNote?.sl).toContain("niso objavljeni");
    expect(v.dayHasRealTime).toBe(false);
  });

  test("⑤ predhodni dan (datum v prihodnosti) → iskrena opomba 'še se ni začel'", () => {
    const trip = mkTrip([mkDay("2026-09-22", [mkEntry("a")])]);
    const v = buildGoView(trip, NOW, null, {});
    expect(v.activeDayLabel.sl).toContain("2026-09-22");
    expect(v.activeDayNote?.sl).toContain("še ni začel");
  });

  test("⑥ vsi datumi pretekli → iskrena opomba 'potovanje je za teboj'", () => {
    const trip = mkTrip([mkDay("2026-09-18", [mkEntry("a")])]);
    const v = buildGoView(trip, NOW, null, {});
    expect(v.activeDayNote?.sl).toContain("za teboj");
  });

  test("⑦ dan 1 brez datuma (datum prihoda ni vnesen) → iskrena opomba", () => {
    const trip = mkTrip([mkDay(undefined, [mkEntry("a")])]);
    const v = buildGoView(trip, NOW, null, {});
    expect(v.activeDayNote?.sl).toContain("Datum prihoda ni vnesen");
    expect(v.next?.entry.key).toBe("a");
  });

  test("⑧ prazen načrt → next undefined, laterDays prazni", () => {
    const v = buildGoView(mkTrip([]), NOW, null, {});
    expect(v.next).toBeUndefined();
    expect(v.remaining).toEqual([]);
    expect(v.laterDays).toEqual([]);
    expect(v.activeDayLabel.sl).toBe("Ni dni v načrtu");
  });

  test("⑨ naslov: MY TRIP — X → NA POTI — X (SL+EN)", () => {
    const v = buildGoView(mkTrip([mkDay(TODAY, [mkEntry("a")])]), NOW, null, {});
    expect(v.title.sl).toBe("NA POTI — BLED");
    expect(v.title.en).toBe("ON THE ROAD — BLED");
    expect(v.destinationLabel).toBe("BLED");
  });
});

// ---------------------------------------------------------------------------
// 3 — GEO ISKRENOST: razdalja/smer SAMO pri GPS + geo na postanku
// ---------------------------------------------------------------------------

describe("TASK 64: buildGoView — razdalje (premica, iskrenost)", () => {
  test("① GPS + geo → razdalja (0,1° lat ≈ 11,1 km) + smer sever", () => {
    const trip = mkTrip([
      mkDay(TODAY, [mkEntry("a", { lat: 46.1, lng: 14.0 })]),
    ]);
    const v = buildGoView(trip, NOW, { lat: 46.0, lng: 14.0, timestamp: 0 }, {});
    expect(v.next?.distanceKm).toBeCloseTo(11.1, 0);
    expect(v.next?.bearingLabel?.sl).toBe("sever");
    expect(v.next?.bearingLabel?.en).toBe("north");
    expect(v.positionAvailable).toBe(true);
  });

  test("② smer vzhod (0,2° lng na isti lat)", () => {
    const trip = mkTrip([
      mkDay(TODAY, [mkEntry("a", { lat: 46.0, lng: 14.2 })]),
    ]);
    const v = buildGoView(trip, NOW, { lat: 46.0, lng: 14.0, timestamp: 0 }, {});
    expect(v.next?.bearingLabel?.sl).toBe("vzhod");
    expect(v.next?.distanceKm).toBeGreaterThan(15); // ~17,6 km
    expect(v.next?.distanceKm).toBeLessThan(20);
  });

  test("③ postanek BREZ geo (dogodki) → razdalja NI, tudi če je GPS", () => {
    const trip = mkTrip([mkDay(TODAY, [mkEntry("a")])]); // brez lat/lng
    const v = buildGoView(trip, NOW, { lat: 46.0, lng: 14.0, timestamp: 0 }, {});
    expect(v.next?.distanceKm).toBeUndefined();
    expect(v.next?.bearingLabel).toBeUndefined();
    expect(v.positionAvailable).toBe(true); // GPS je, geo ni — iskrena ločba
  });

  test("④ brez GPS → vse razdalje undefined + positionAvailable false", () => {
    const trip = mkTrip([
      mkDay(TODAY, [mkEntry("a", { lat: 46.1, lng: 14.0 })]),
    ]);
    const v = buildGoView(trip, NOW, null, {});
    expect(v.next?.distanceKm).toBeUndefined();
    expect(v.positionAvailable).toBe(false);
  });

  test("⑤ countdown oznake SL/EN (pozitiv/nič/preteklo)", () => {
    expect(GO_LABELS.countdown.sl(30)).toBe("čez 30 min");
    expect(GO_LABELS.countdown.sl(0)).toBe("prav zdaj");
    expect(GO_LABELS.countdown.sl(-10)).toBe("pred 10 min se je začelo");
    expect(GO_LABELS.countdown.en(30)).toBe("in 30 min");
    expect(GO_LABELS.countdown.en(-10)).toBe("started 10 min ago");
  });
});

// ---------------------------------------------------------------------------
// 4 — PERSISTENCA (localStorage stub — vzorec varnosti my-trips-storage)
// ---------------------------------------------------------------------------

function withFakeWindow<T>(fn: () => T): T {
  const store = new Map<string, string>();
  const fakeWindow = {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => void store.clear(),
    },
  };
  const g = globalThis as Record<string, unknown>;
  const prev = g.window;
  g.window = fakeWindow;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete g.window;
    else g.window = prev;
  }
}

/** Minimalen veljaven TravelJourney za persistenco. */
function mkJourney(): Parameters<typeof saveGoTrip>[0] {
  return {
    id: "j1",
    lang: "sl",
    origin: { label: "Ljubljana Airport (Brnik)", lat: 46.22, lng: 14.47, source: "transfer-inventory" },
    destination: { label: "Bled", lat: 46.37, lng: 14.11, source: "destinations" },
    travelers: 2,
    categories: {} as never, // persistenca NE preverja globine (validira obliko)
    totals: {
      confirmedTotal: 0,
      knownTotal: 0,
      estimatedTotal: 0,
      unknownCount: 0,
      fromPriceCount: 0,
      currency: "EUR",
    },
    validation: { issues: [] },
    supplyHealth: { degradedProviders: [] },
    generatedAt: new Date().toISOString(),
  };
}

describe("TASK 64: go-persist — dai:go-trip", () => {
  afterEach(() => {
    clearGoTrip();
  });

  test("① save → load round-trip (enaki izbiri, isti journey id)", () => {
    withFakeWindow(() => {
      const ok = saveGoTrip(mkJourney(), ["fsq:a1", "fsq:a2"]);
      expect(ok).toBe(true);
      const rec = loadGoTrip();
      expect(rec).not.toBeNull();
      expect(rec?.version).toBe(1);
      // TASK 4 / K-7: GoTripRecord je zdaj unija (v1 journey | v2 itinerary)
      // — ozko vračanje po version, da TS ve, da je ta zapis v1.
      const v1 = rec?.version === 1 ? rec : null;
      expect(v1?.journey.id).toBe("j1");
      expect(v1?.selectedIds).toEqual(["fsq:a1", "fsq:a2"]);
      expect(typeof rec?.savedAt).toBe("string");
    });
  });

  test("② pokvarjen JSON → null (ne sesuje app)", () => {
    withFakeWindow(() => {
      window.localStorage.setItem("dai:go-trip", "{not json");
      expect(loadGoTrip()).toBeNull();
    });
  });

  test("③ napačna oblika zapisa → null (version/selectedIds validacija)", () => {
    withFakeWindow(() => {
      window.localStorage.setItem(
        "dai:go-trip",
        JSON.stringify({ version: 2, savedAt: "x", journey: {}, selectedIds: [] })
      );
      expect(loadGoTrip()).toBeNull();
      window.localStorage.setItem(
        "dai:go-trip",
        JSON.stringify({ version: 1, savedAt: "x", journey: mkJourney(), selectedIds: [1, 2] })
      );
      expect(loadGoTrip()).toBeNull();
    });
  });

  test("④ clear pobriše trip + progres skupaj", () => {
    withFakeWindow(() => {
      saveGoTrip(mkJourney(), ["fsq:a1"]);
      saveGoProgress({ a: "2026-09-20T14:00:00.000Z" });
      clearGoTrip();
      expect(loadGoTrip()).toBeNull();
      expect(loadGoProgress()).toEqual({});
    });
  });

  test("⑤ SSR guard (brez window): save false, load null, progres {}", () => {
    const g = globalThis as Record<string, unknown>;
    const prev = g.window;
    delete g.window;
    try {
      expect(saveGoTrip(mkJourney(), [])).toBe(false);
      expect(loadGoTrip()).toBeNull();
      expect(loadGoProgress()).toEqual({});
    } finally {
      if (prev !== undefined) g.window = prev;
    }
  });
});

describe("TASK 64: go-persist — dai:go-progress", () => {
  afterEach(() => {
    clearGoTrip();
  });

  test("① save/load progres round-trip", () => {
    withFakeWindow(() => {
      saveGoProgress({ a: "2026-09-20T14:00:00.000Z", b: "2026-09-20T15:00:00.000Z" });
      expect(loadGoProgress()).toEqual({
        a: "2026-09-20T14:00:00.000Z",
        b: "2026-09-20T15:00:00.000Z",
      });
    });
  });

  test("② prazen progres → ključ se odstrani (ne praznega JSON-a)", () => {
    withFakeWindow(() => {
      saveGoProgress({ a: "x" });
      saveGoProgress({});
      expect(window.localStorage.getItem("dai:go-progress")).toBeNull();
      expect(loadGoProgress()).toEqual({});
    });
  });

  test("③ pokvarjen progres → {} (ne sesuje app)", () => {
    withFakeWindow(() => {
      window.localStorage.setItem("dai:go-progress", "[1,2,3]");
      expect(loadGoProgress()).toEqual({});
      window.localStorage.setItem("dai:go-progress", "nismo json");
      expect(loadGoProgress()).toEqual({});
    });
  });
});

// ---------------------------------------------------------------------------
// 5 — PODAJA SKOZI MY TRIP (DI adapter — isti kanon kot TASK 63)
// ---------------------------------------------------------------------------

function fakeFsqAdapter(): SupplyAdapter {
  const entry = getProvider("fsq")!;
  const products: ProviderProduct[] = [
    {
      provider: "fsq",
      providerProductId: "a1",
      id: "fsq:a1",
      type: "attraction",
      subcategory: "Castle",
      title: "Grad Bled",
      lat: 46.371,
      lng: 14.107,
      geoPrecision: "exact",
      openingHours: "Mo-Su 09:00-18:00",
      phone: "+386 1 555 1234",
      bookingMode: "info_only",
      lastUpdated: new Date().toISOString(),
    } as unknown as ProviderProduct,
  ];
  return {
    entry,
    async search() {
      return products;
    },
    lastRunCached: () => false,
  };
}

describe("TASK 64: buildMyTrip podaja geo/ure/telefon (DI, Bled)", () => {
  test.skipIf(!hasKt)(
    "① izbrana znamenitost → lat/lng/openingHours/phone na vnosu",
    async () => {
      const j = await planJourney(
        {
          origin: "Brnik",
          destination: "bled",
          startDate: TODAY,
          arrivalTime: "14:00",
          travelers: 2,
          lang: "sl",
        },
        { adapters: [fakeFsqAdapter()] }
      );
      if ("error" in j) throw new Error(j.error);
      const trip = buildMyTrip(j, new Set(["fsq:a1"]));
      const entry = trip.days[0].entries.find((e) => e.key === "fsq:a1");
      expect(entry).toBeDefined();
      expect(entry?.lat).toBeCloseTo(46.371, 2);
      expect(entry?.lng).toBeCloseTo(14.107, 2);
      expect(entry?.openingHours).toBe("Mo-Su 09:00-18:00");
      expect(entry?.phone).toBe("+386 1 555 1234");
      // Prihod nosi geo izhodišča (Brnik — iz KT dataseta).
      const arrival = trip.days[0].entries.find((e) => e.key === "arrival");
      expect(arrival?.lat).toBeDefined();
      expect(arrival?.lng).toBeDefined();
    }
  );

  test.skipIf(!hasKt)(
    "② celotna Go Mode veriga: journey → MY TRIP → NA POTI (naslov + naslednje)",
    async () => {
      const j = await planJourney(
        {
          origin: "Brnik",
          destination: "bled",
          startDate: TODAY,
          arrivalTime: "14:00",
          travelers: 2,
          lang: "sl",
        },
        { adapters: [fakeFsqAdapter()] }
      );
      if ("error" in j) throw new Error(j.error);
      const trip = buildMyTrip(j, new Set(["fsq:a1"]));
      const v = buildGoView(trip, NOW, null, {});
      expect(v.title.sl).toBe("NA POTI — BLED");
      expect(v.next).toBeDefined();
      // Datum dneva 1 = startDate (formatiran: "20. september 2026").
      expect(v.activeDayLabel.sl).toBe("20. september 2026");
      // Prihod (14:00) + transfer sta REALNA časa dneva 1 → dayHasRealTime.
      expect(v.dayHasRealTime).toBe(true);
    }
  );
});
