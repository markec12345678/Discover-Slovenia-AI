// ============================================================================
// TASK 88 — ŽIVO VREME V DNEVNIH KARTICAH ITINERARJA (1.79.0)
// ============================================================================
// Pokriva ČISTI sloj src/lib/itinerary-weather.ts:
//  - resolveVisitCoords (lastne koordinate NAD lookupom, fail-closed vrata),
//  - itineraryWeatherPlan (sidro PO DNEVU = prvi geo-postanek; dedupe po
//    sidru; cap ITINERARY_WEATHER_MAX_ANCHORS → zloži na prvo sidro;
//    datumsko okno min..max skupine; brez datuma/sidra → null — iskrena
//    odsotnost, isti kanon kot trip-weather §TASK 66),
//  - itineraryWeatherRequestKey (varovalka zastarelosti),
//  - applyForecastToDays (dan → napoved PO DATUMU; odpadla skupina pusti
//    svoje dneve brez čipa),
//  - formatDayLabel (sl delegira na formatDayLabelSI, en lastni obliki).
//
// SOURCE-CONTRACT (readFileSync dejanskih datotek): TripTimeline in
// SharedTrip prikazujeta ŽIVI čip (fallback statika), planner podaja
// tripStartDate, journey-trip deli izvožen WeatherChip, hook ima
// prekinitve/varovalko zastarelosti/iskrene opombe.
// ============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  applyForecastToDays,
  formatDayLabel,
  itineraryWeatherPlan,
  itineraryWeatherRequestKey,
  ITINERARY_WEATHER_MAX_ANCHORS,
  resolveVisitCoords,
  type ItineraryWeatherPlan,
} from "@/lib/itinerary-weather";
import type { DayPlan, LocationVisit } from "@/lib/types";
import type { TripWeatherDay } from "@/lib/journey/trip-weather";

const ROOT = join(import.meta.dir, "../../..");

function source(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

// ---------------------------------------------------------------------------
// Fixture (isti kanon kot task66 test — čisto, brez omrežja)
// ---------------------------------------------------------------------------

function mkVisit(
  id: string,
  over: Partial<LocationVisit> = {}
): LocationVisit {
  return {
    destination_id: id,
    destination_name: id.toUpperCase(),
    time_slot: "09:00",
    duration: 2,
    estimated_cost: 10,
    notes: "",
    ...over,
  };
}

function mkDay(n: number, visits: LocationVisit[]): DayPlan {
  return {
    day: n,
    locations: visits,
    weather: { condition: "Sončno", temp: 21 },
  };
}

function mkForecast(date: string, tempMax = 20): TripWeatherDay {
  return {
    date,
    condition: "Sončno",
    icon: "☀️",
    tempMax,
    precipitationProbabilityMax: 10,
  };
}

/** bled/bohinj sta ~8 km narazen — RAZLIČNI sidri (3 decimalke ≈ 100 m). */
const BLED = { lat: 46.3683, lng: 14.0944 };
const LJU = { lat: 46.0569, lng: 14.5058 };

// ---------------------------------------------------------------------------
// resolveVisitCoords
// ---------------------------------------------------------------------------

describe("TASK 88: resolveVisitCoords", () => {
  test("lastne koordinate prevladačjo nad lookupom (AI/geo obogatitev)", () => {
    const coords = resolveVisitCoords(
      mkVisit("bled", { lat: 46.1, lng: 14.1 })
    );
    expect(coords).toEqual({ lat: 46.1, lng: 14.1 });
  });

  test("lookup po destination_id (bled iz DESTINATIONS)", () => {
    const coords = resolveVisitCoords(mkVisit("bled"));
    expect(coords).toEqual(BLED);
  });

  test("neveljavne lastne (NaN/neskončnost/izven Zemlje) → lookup", () => {
    expect(resolveVisitCoords(mkVisit("ljubljana", { lat: NaN, lng: 14.5 }))).toEqual(LJU);
    expect(resolveVisitCoords(mkVisit("ljubljana", { lat: 91, lng: 14.5 }))).toEqual(LJU);
    expect(resolveVisitCoords(mkVisit("ljubljana", { lat: 46, lng: Infinity }))).toEqual(LJU);
    expect(resolveVisitCoords(mkVisit("ljubljana", { lat: 46, lng: 200 }))).toEqual(LJU);
  });

  test("neznan destination_id brez koordinat → null (fail-closed)", () => {
    expect(resolveVisitCoords(mkVisit("ne-obstaja"))).toBeNull();
    expect(resolveVisitCoords(mkVisit("ne-obstaja", { lat: 0, lng: 0 }))).toBeNull();
  });

  test("samo ena koordinata → null (obe ali nobena)", () => {
    expect(resolveVisitCoords(mkVisit("ne-obstaja", { lat: 46.1 }))).toBeNull();
    expect(resolveVisitCoords(mkVisit("ne-obstaja", { lng: 14.1 }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// itineraryWeatherPlan
// ---------------------------------------------------------------------------

describe("TASK 88: itineraryWeatherPlan — iskrena odsotnost", () => {
  test("brez tripStartDate → null (dnevi brez realnega datuma)", () => {
    expect(itineraryWeatherPlan([mkDay(1, [mkVisit("bled")])], null)).toBeNull();
    expect(itineraryWeatherPlan([mkDay(1, [mkVisit("bled")])], undefined)).toBeNull();
  });

  test("neveljaven tripStartDate (format) → null", () => {
    expect(itineraryWeatherPlan([mkDay(1, [mkVisit("bled")])], "2026-9-24")).toBeNull();
    expect(itineraryWeatherPlan([mkDay(1, [mkVisit("bled")])], "abc")).toBeNull();
  });

  test("brez dni / brez ENEGA geo sidra → null", () => {
    expect(itineraryWeatherPlan([], "2026-10-06")).toBeNull();
    // dnevi obstajajo, a brez rešljivih koordinat (vreme NI — ne izmišljujemo)
    expect(
      itineraryWeatherPlan([mkDay(1, [mkVisit("ne-obstaja")])], "2026-10-06")
    ).toBeNull();
  });

  test("dan brez geo sidra pade iz načrta, ostali dnevi živijo (pogojni null)", () => {
    const plan = itineraryWeatherPlan(
      [
        mkDay(1, [mkVisit("bled")]),
        mkDay(2, [mkVisit("ne-obstaja")]),
        mkDay(3, [mkVisit("ljubljana")]),
      ],
      "2026-10-06"
    );
    expect(plan).not.toBeNull();
    expect(plan!.dayDates.size).toBe(3);
    // 2 skupini (bled + ljubljana); dan 2 NI v nobeni skupini
    expect(plan!.groups.length).toBe(2);
    const grouped = plan!.groups.flatMap((g) => g.dayNumbers);
    expect(grouped).not.toContain(2);
  });
});

describe("TASK 88: itineraryWeatherPlan — skupine sider", () => {
  test("en dan → ena skupina, start = end = datum dneva 1", () => {
    const plan = itineraryWeatherPlan(
      [mkDay(1, [mkVisit("bled")])],
      "2026-10-06"
    );
    expect(plan!.groups.length).toBe(1);
    const g = plan!.groups[0];
    expect(g.lat).toBe(BLED.lat);
    expect(g.lng).toBe(BLED.lng);
    expect(g.start).toBe("2026-10-06");
    expect(g.end).toBe("2026-10-06");
    expect(g.dayNumbers).toEqual([1]);
  });

  test("3 regije → 3 skupine, vsaka z svojim datumom (dan1=start, dan3=+2)", () => {
    const plan = itineraryWeatherPlan(
      [
        mkDay(1, [mkVisit("ljubljana")]),
        mkDay(2, [mkVisit("bled")]),
        mkDay(3, [mkVisit("piran")]),
      ],
      "2026-10-06"
    );
    expect(plan!.groups.length).toBe(3);
    expect(plan!.dayDates.get(1)).toBe("2026-10-06");
    expect(plan!.dayDates.get(2)).toBe("2026-10-07");
    expect(plan!.dayDates.get(3)).toBe("2026-10-08");
    // skupine v vrstnem redu dni (prvi postanek dneva = sidro)
    expect(plan!.groups[0].dayNumbers).toEqual([1]);
    expect(plan!.groups[1].dayNumbers).toEqual([2]);
    expect(plan!.groups[2].dayNumbers).toEqual([3]);
  });

  test("dedupe: isti kraj v dveh dneh → ENA skupina z oknom min..max", () => {
    const plan = itineraryWeatherPlan(
      [mkDay(1, [mkVisit("bled")]), mkDay(2, [mkVisit("bled")])],
      "2026-10-06"
    );
    expect(plan!.groups.length).toBe(1);
    const g = plan!.groups[0];
    expect(g.start).toBe("2026-10-06");
    expect(g.end).toBe("2026-10-07");
    expect(g.dayNumbers).toEqual([1, 2]);
  });

  test("cap: več unikatnih sider kot MAX → zloži na PRVO sidro (glavna regija)", () => {
    const uniqueIds = ["ljubljana", "bled", "bohinj", "postojna", "piran", "soca"];
    expect(uniqueIds.length).toBeGreaterThan(ITINERARY_WEATHER_MAX_ANCHORS);
    const days = uniqueIds.map((id, i) => mkDay(i + 1, [mkVisit(id)]));
    const plan = itineraryWeatherPlan(days, "2026-10-06");
    // ENA skupina = prvo sidro (ljubljana), VSI dnevi na njej
    expect(plan!.groups.length).toBe(1);
    expect(plan!.groups[0].lat).toBe(LJU.lat);
    expect(plan!.groups[0].dayNumbers).toEqual([1, 2, 3, 4, 5, 6]);
    expect(plan!.groups[0].start).toBe("2026-10-06");
    expect(plan!.groups[0].end).toBe("2026-10-11");
  });

  test("točno MAX sider → NE zloži (ena zahteva na sidro)", () => {
    const days = ["ljubljana", "bled", "postojna", "piran"].map((id, i) =>
      mkDay(i + 1, [mkVisit(id)])
    );
    expect(days.length).toBe(ITINERARY_WEATHER_MAX_ANCHORS);
    const plan = itineraryWeatherPlan(days, "2026-10-06");
    expect(plan!.groups.length).toBe(ITINERARY_WEATHER_MAX_ANCHORS);
  });

  test("sidro dneva = PRVI postanek z geo (ne zadnji)", () => {
    const plan = itineraryWeatherPlan(
      [mkDay(1, [mkVisit("ne-obstaja"), mkVisit("bled")])],
      "2026-10-06"
    );
    expect(plan!.groups.length).toBe(1);
    expect(plan!.groups[0].lat).toBe(BLED.lat);
  });
});

// ---------------------------------------------------------------------------
// itineraryWeatherRequestKey
// ---------------------------------------------------------------------------

describe("TASK 88: itineraryWeatherRequestKey — varovalka zastarelosti", () => {
  const plan = itineraryWeatherPlan(
    [mkDay(1, [mkVisit("bled")])],
    "2026-10-06"
  )!;

  test("brez načrta → null", () => {
    expect(itineraryWeatherRequestKey(null, "sl")).toBeNull();
  });

  test("drug jezik → drug ključ (drugačen pogoj v odgovoru)", () => {
    const sl = itineraryWeatherRequestKey(plan, "sl");
    const en = itineraryWeatherRequestKey(plan, "en");
    expect(sl).not.toBe(en);
  });

  test("ključ vsebuje koordinate in okno skupine (berljiv determinizem)", () => {
    const key = itineraryWeatherRequestKey(plan, "sl")!;
    expect(key).toContain("46.3683");
    expect(key).toContain("14.0944");
    expect(key).toContain("2026-10-06");
    expect(key.startsWith("sl|")).toBe(true);
  });

  test("deterministično: isti načrt → isti ključ", () => {
    const again = itineraryWeatherPlan(
      [mkDay(1, [mkVisit("bled")])],
      "2026-10-06"
    )!;
    expect(itineraryWeatherRequestKey(plan, "en")).toBe(
      itineraryWeatherRequestKey(again, "en")
    );
  });
});

// ---------------------------------------------------------------------------
// applyForecastToDays
// ---------------------------------------------------------------------------

describe("TASK 88: applyForecastToDays — preslikava po datumu", () => {
  const plan = itineraryWeatherPlan(
    [
      mkDay(1, [mkVisit("bled")]),
      mkDay(2, [mkVisit("bled")]),
      mkDay(3, [mkVisit("ljubljana")]),
    ],
    "2026-10-06"
  )!;
  // skupini: [bled: dneva 1,2 (10-06..10-07)], [ljubljana: dan 3 (10-08)]

  test("dan dobi napoved, ki se ujema z NJEGOVIM datumom v NJEGOVI skupini", () => {
    const byDay = applyForecastToDays(plan, [
      [mkForecast("2026-10-06", 18), mkForecast("2026-10-07", 19)],
      [mkForecast("2026-10-08", 22)],
    ]);
    expect(byDay.size).toBe(3);
    expect(byDay.get(1)!.tempMax).toBe(18);
    expect(byDay.get(2)!.tempMax).toBe(19);
    expect(byDay.get(3)!.tempMax).toBe(22);
  });

  test("odpadla skupina (null) pusti svoje dneve BREZ čipa — ostali živijo", () => {
    const byDay = applyForecastToDays(plan, [
      [mkForecast("2026-10-06", 18), mkForecast("2026-10-07", 19)],
      null,
    ]);
    expect(byDay.has(3)).toBe(false);
    expect(byDay.get(1)!.tempMax).toBe(18);
    expect(byDay.get(2)!.tempMax).toBe(19);
  });

  test("dan brez ujemajočega datuma v napovedi (horizont) → brez čipa", () => {
    // vir je objavil samo prvi dan — dan 2/3 ostajeta brez čipa (iskreno)
    const byDay = applyForecastToDays(plan, [
      [mkForecast("2026-10-06", 18)],
      [mkForecast("2026-10-08", 22)],
    ]);
    expect(byDay.has(1)).toBe(true);
    expect(byDay.has(2)).toBe(false);
    expect(byDay.has(3)).toBe(true);
  });

  test("prazna napoved (prazni presek) → vsi brez čipa, brez napake", () => {
    const byDay = applyForecastToDays(plan, [[], []]);
    expect(byDay.size).toBe(0);
  });

  test("več rezultatov kot skupin → odvečni se ignorirajo (defenzivno)", () => {
    const byDay = applyForecastToDays(plan, [
      [mkForecast("2026-10-06", 18), mkForecast("2026-10-07", 19)],
      [mkForecast("2026-10-08", 22)],
      [mkForecast("2026-10-09", 25)],
    ]);
    expect(byDay.size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// formatDayLabel
// ---------------------------------------------------------------------------

describe("TASK 88: formatDayLabel (lokalizirana oznaka dneva)", () => {
  // 2026-09-22 = torek; 2026-03-08 = nedelja (preverjeno koledarsko)
  test("sl delegira na formatDayLabelSI (torek, 22. septembra)", () => {
    expect(formatDayLabel("2026-09-22", "sl")).toBe("torek, 22. septembra");
    expect(formatDayLabel("2026-03-08", "sl")).toBe("nedelja, 8. marca");
  });

  test("en → Tuesday, 22 September / Sunday, 8 March", () => {
    expect(formatDayLabel("2026-09-22", "en")).toBe("Tuesday, 22 September");
    expect(formatDayLabel("2026-03-08", "en")).toBe("Sunday, 8 March");
  });

  test("neveljaven datum → surova vrednost (defenzivno, enako kot trip-dates)", () => {
    expect(formatDayLabel("ne-veljavno", "sl")).toBe("ne-veljavno");
    expect(formatDayLabel("ne-veljavno", "en")).toBe("ne-veljavno");
  });
});

// ---------------------------------------------------------------------------
// SOURCE-CONTRACT — komponente
// ---------------------------------------------------------------------------

describe("TASK 88: source-contract — TripTimeline (rezultati načrtovalnika)", () => {
  const src = source("src/components/trip-timeline.tsx");

  test("živa napoved prek hooka, odvisna od tripStartDate", () => {
    expect(src).toContain("useItineraryForecast(days, tripStartDate, lang)");
    expect(src).toContain("tripStartDate?: string");
  });

  test("ŽIVI čip premošča statični posnetek day.weather (fallback ostane)", () => {
    expect(src).toContain("{liveWeather ?");
    expect(src).toContain("<WeatherChip w={liveWeather} lang={lang} />");
    expect(src).toContain("day.weather &&");
  });

  test("datum dneva ob znanem odhodu (formatDayLabel po jeziku)", () => {
    expect(src).toContain("dayISOForDayNumber(tripStartDate, day.day)");
    expect(src).toContain("formatDayLabel(dayISO, lang)");
  });

  test("iskrene opombe o vremenu (časovnica dela naprej)", () => {
    expect(src).toContain("<ItineraryWeatherNotes");
    expect(src).toContain("hasWindow &&");
  });
});

describe("TASK 88: source-contract — planner podaja tripStartDate", () => {
  const src = source("src/components/sections/itinerary-planner.tsx");

  test("TripTimeline prejme itinerary.tripStartDate", () => {
    expect(src).toContain("tripStartDate={itinerary.tripStartDate}");
  });
});

describe("TASK 88: source-contract — SharedTrip (/pot/[shareId], sl-only)", () => {
  const src = source("src/components/shared-trip.tsx");

  test("hook s SL jezikom na površini deljenega načrta", () => {
    expect(src).toContain(
      'useItineraryForecast(itinerary.days, itinerary.tripStartDate, "sl")'
    );
  });

  test("živi čip v glavi dneva + fallback statika", () => {
    expect(src).toContain('<WeatherChip w={liveWeather} lang="sl" />');
    expect(src).toContain("day.weather &&");
  });

  test("iskrene opombe po dnevih (načrt dela naprej)", () => {
    expect(src).toContain("<ItineraryWeatherNotes");
  });
});

describe("TASK 88: source-contract — deljen WeatherChip (journey-trip)", () => {
  const tripSrc = source("src/components/journey-trip.tsx");
  const chipSrc = source("src/components/itinerary-weather.tsx");

  test("MY TRIP uvaža IZVOZEN čip (nič lokalne duplikacije)", () => {
    expect(tripSrc).toContain(
      'import { WeatherChip } from "@/components/itinerary-weather"'
    );
    expect(tripSrc).not.toContain("function WeatherChip(");
  });

  test("čip je print:hidden (dokument ostane dejstva o rezervacijah)", () => {
    expect(chipSrc).toContain("print:hidden");
  });

  test("čip ima aria-label + vir v title (dostopnost + izrecnost)", () => {
    expect(chipSrc).toContain("aria-label={`${w.condition}, ${dayText}`}");
    expect(chipSrc).toContain("title={TRIP_WEATHER_LABELS.source[lang]}");
  });
});

describe("TASK 88: source-contract — hook (varovalke)", () => {
  const src = source("src/components/itinerary-weather.tsx");

  test("prekinitev ob spremembi okna (AbortController + active)", () => {
    expect(src).toContain("new AbortController()");
    expect(src).toContain("controller.abort()");
    expect(src).toContain("let active = true");
  });

  test("ENA zahteva na unikatno sidro, odpadla skupina → null (ne sesuje ostalih)", () => {
    expect(src).toMatch(/\.catch\(\(\) => null\)/);
    expect(src).toContain("healthyGroups === 0");
  });

  test("zastarel odgovor → brez čipov (requestKey === loadedFor)", () => {
    expect(src).toContain("requestKey === loadedFor");
  });

  test("iskreni statusi: unavailable (izpad) + notPublished (horizont)", () => {
    expect(src).toContain("unavailable: current && failedAll");
    expect(src).toContain("notPublished:");
    expect(src).toContain("matchedDays === 0");
  });

  test("NAČIN B /api/weather klic s start/end (isti kanon TASK 66)", () => {
    expect(src).toContain("`/api/weather?lat=${g.lat}&lng=${g.lng}&lang=${lang}&start=${g.start}&end=${g.end}`");
  });
});

describe("TASK 88: source-contract — čisti sloj (kanon iskrenosti)", () => {
  const src = source("src/lib/itinerary-weather.ts");

  test("cap sider izvožen kot konstanta (dokumentiran trade-off)", () => {
    expect(src).toContain("export const ITINERARY_WEATHER_MAX_ANCHORS");
  });

  test("vrata koordinat: obe-ali-nobena, končni, ±90/±180", () => {
    expect(src).toContain("lat < -90 || lat > 90 || lng < -180 || lng > 180");
  });
});
