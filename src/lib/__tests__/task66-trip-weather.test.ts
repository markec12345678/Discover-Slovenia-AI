// ============================================================================
// TASK 66 — MY TRIP VREME PO DNEVIH (1.66.0)
// ============================================================================
// Pokriva: ČISTI parse plasti Open-Meteo dnevne napovedi za datumsko okno
// (fail-closed — neveljaven dan se izpusti, prazen vir → null, nikoli
// izmišljenih dni), clampForecastRange (poravnavo okna na realno — preteklost
// → danes, čez horizont → danes+15, prazen presek → null), URL graditelj,
// REFAKTOR fetchDailyForecast (zanka izvlečena v parseOpenMeteoDailyRange —
// vedenje zaklenjeno z mockanim global.fetch), striktno validacijo odgovora
// /api/weather na klientu, izpeljavo sidra/datumov/okna iz MY TRIP pogleda,
// oznake SL/EN in INTEGRACIJO route handlerja z mockanim global.fetch
// (0 živega omrežja — tudi „brez klica vira" za prazni presek).
// ============================================================================

import { afterEach, describe, expect, test } from "bun:test";

import {
  clampForecastRange,
  fetchDailyForecast,
  openMeteoDailyRangeUrl,
  parseOpenMeteoDailyRange,
  todayISOSI,
} from "@/lib/weather-utils";
import {
  parseTripWeatherResponse,
  tripWeatherAnchor,
  tripWeatherDates,
  tripWeatherRange,
  TRIP_WEATHER_LABELS,
} from "@/lib/journey/trip-weather";
import { buildMyTrip, type MyTripDay, type MyTripView, type TripEntry } from "@/lib/journey/trip-view";
import { planJourney } from "@/lib/journey/orchestrator";
import type { TravelJourney } from "@/lib/journey/types";
import type { SupplyAdapter } from "@/lib/supply/adapter";
import type { ProviderProduct } from "@/lib/supply/types";
import { getProvider } from "@/lib/supply/registry";
import { getKiwitaxiBaseline } from "@/lib/supply/providers/kiwitaxi/dataset";
import { GET as weatherGET } from "@/app/api/weather/route";

const baseline = getKiwitaxiBaseline();
const hasKt = Boolean(baseline);

// ---------------------------------------------------------------------------
// Pomožne (datumski račun — UTC, brez DST presenečenj)
// ---------------------------------------------------------------------------

/** danes v pasu Europe/Ljubljana (ISTI izvor kot route — todayISOSI). */
const TODAY = todayISOSI();

function isoPlus(iso: string, days: number): string {
  return new Date(
    Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000
  ).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Fixture (MY TRIP pogled — isti kanon kot TASK 65 test)
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
    confirmation: { confirmedCount: 0, note: { sl: "ni", en: "none" } },
    generatedAt: new Date().toISOString(),
  };
}

/** Minimalen TravelJourney (samo destinacija z geo — ostalo prazno). */
function mkJourney(
  dest: { label: string; lat?: number; lng?: number },
  startDate?: string
): TravelJourney {
  const emptyCat = (key: TravelJourney["categories"][keyof TravelJourney["categories"]]["key"]) => ({
    key,
    products: [],
    providers: [],
  });
  return {
    id: "test",
    lang: "sl",
    origin: { label: "Brnik", source: "transfer-inventory" },
    destination: {
      label: dest.label,
      ...(dest.lat != null ? { lat: dest.lat } : {}),
      ...(dest.lng != null ? { lng: dest.lng } : {}),
      source: "destinations",
    },
    travelers: 2,
    ...(startDate ? { startDate } : {}),
    categories: {
      transfer: emptyCat("transfer"),
      accommodation: emptyCat("accommodation"),
      attractions: emptyCat("attractions"),
      events: emptyCat("events"),
      restaurants: emptyCat("restaurants"),
      petrol: emptyCat("petrol"),
      rental: emptyCat("rental"),
    },
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

/** Realna oblika Open-Meteo odgovora (samo daily blok za okno).
 * temps dovoljuje tudi niz — testi namerno podajajo NEVELJAVNE vnose. */
function omRange(
  dates: string[],
  codes: number[],
  temps: (number | string)[],
  precips: (number | null)[]
) {
  return {
    latitude: 46.4,
    longitude: 14.1,
    timezone: "Europe/Ljubljana",
    daily: {
      time: dates,
      weather_code: codes,
      temperature_2m_max: temps,
      precipitation_probability_max: precips,
    },
  };
}

// ---------------------------------------------------------------------------
// 1 — PARSE OPEN-METEO DAILY RANGE (fail-closed)
// ---------------------------------------------------------------------------

describe("TASK 66: parseOpenMeteoDailyRange (fail-closed)", () => {
  test("① veljaven 3-dnevni blok: datumi/kode/temperature/padavine preneseni", () => {
    const d = parseOpenMeteoDailyRange(
      omRange(
        [TODAY, isoPlus(TODAY, 1), isoPlus(TODAY, 2)],
        [0, 61, 3],
        [21.4, 18.9, 25.0],
        [null, 80, 10]
      )
    );
    expect(d).not.toBeNull();
    expect(d!.length).toBe(3);
    expect(d![0].date).toBe(TODAY);
    expect(d![0].weatherCode).toBe(0);
    expect(d![0].tempMax).toBe(21.4); // surova vrednost (zaokroži route)
    expect(d![0].precipitationProbabilityMax).toBeNull(); // NEZNANO ≠ 0 %
    expect(d![1].precipitationProbabilityMax).toBe(80);
  });

  test("② en dan z neštevilsko temperaturo → IZPUŠČEN, ostali ostanejo", () => {
    const d = parseOpenMeteoDailyRange(
      omRange([TODAY, isoPlus(TODAY, 1)], [0, 1], [21, "22"], [10, 10])
    );
    expect(d).not.toBeNull();
    expect(d!.length).toBe(1);
    expect(d![0].date).toBe(TODAY);
  });

  test("③ vsi dnevi neveljavni → null (vir ni vrnil nič uporabnega)", () => {
    expect(
      parseOpenMeteoDailyRange(omRange([TODAY], [0], ["x"], [10]))
    ).toBeNull();
  });

  test("④ manjka daily / prazen time / ne-objekt → null", () => {
    expect(parseOpenMeteoDailyRange({})).toBeNull();
    expect(parseOpenMeteoDailyRange(null)).toBeNull();
    expect(parseOpenMeteoDailyRange("napaka")).toBeNull();
    expect(
      parseOpenMeteoDailyRange({ daily: { time: [] } })
    ).toBeNull();
    expect(parseOpenMeteoDailyRange({ daily: {} })).toBeNull();
  });

  test("⑤ manjka tabela temperatur → vsi dnevi preskočeni → null", () => {
    const raw = {
      daily: { time: [TODAY], weather_code: [0] },
    };
    expect(parseOpenMeteoDailyRange(raw)).toBeNull();
  });

  test("⑥ padavine manjkajo (tabela ni podana) → null po dnevu (NEZNANO)", () => {
    const d = parseOpenMeteoDailyRange({
      daily: { time: [TODAY], weather_code: [0], temperature_2m_max: [20] },
    });
    expect(d).not.toBeNull();
    expect(d![0].precipitationProbabilityMax).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2 — CLAMP FORECAST RANGE (poravnava okna na realno — ČISTO, today je parameter)
// ---------------------------------------------------------------------------

describe("TASK 66: clampForecastRange (iskreno okno)", () => {
  test("① start v preteklosti → poravnan na danes (napoved za preteklost ne obstaja)", () => {
    const c = clampForecastRange(isoPlus(TODAY, -5), isoPlus(TODAY, 2), TODAY);
    expect(c).toEqual({ start: TODAY, end: isoPlus(TODAY, 2) });
  });

  test("② end čez horizont → porezan na danes+15 (vir ne objavi več)", () => {
    const c = clampForecastRange(TODAY, isoPlus(TODAY, 40), TODAY);
    expect(c).toEqual({ start: TODAY, end: isoPlus(TODAY, 15) });
  });

  test("③ obe poravnavi hkrati (preteklost + čez horizont)", () => {
    const c = clampForecastRange(
      isoPlus(TODAY, -10),
      isoPlus(TODAY, 30),
      TODAY
    );
    expect(c).toEqual({ start: TODAY, end: isoPlus(TODAY, 15) });
  });

  test("④ enodnevno okno danes → nespremenjeno", () => {
    expect(clampForecastRange(TODAY, TODAY, TODAY)).toEqual({
      start: TODAY,
      end: TODAY,
    });
  });

  test("⑤ točna meja horizonta: start = danes+15 → VELJAVEN (zadnji objavljeni dan)", () => {
    const c = clampForecastRange(
      isoPlus(TODAY, 15),
      isoPlus(TODAY, 15),
      TODAY
    );
    expect(c).toEqual({ start: isoPlus(TODAY, 15), end: isoPlus(TODAY, 15) });
  });

  test("⑥ start = danes+16 (čezenj horizont) → null (prazen presek)", () => {
    expect(
      clampForecastRange(isoPlus(TODAY, 16), isoPlus(TODAY, 20), TODAY)
    ).toBeNull();
  });

  test("⑦ vse v preteklosti → null (prazen presek — iskrena prazna napoved)", () => {
    expect(
      clampForecastRange(isoPlus(TODAY, -10), isoPlus(TODAY, -5), TODAY)
    ).toBeNull();
  });

  test("⑧ neveljavni datumi → null (varovalka tipov)", () => {
    expect(clampForecastRange("abc", TODAY, TODAY)).toBeNull();
    expect(clampForecastRange(TODAY, "2026-13-99", TODAY)).toBeNull();
    expect(clampForecastRange(TODAY, isoPlus(TODAY, 2), "ni-datum")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3 — URL GRADITELJ (datumsko okno)
// ---------------------------------------------------------------------------

describe("TASK 66: openMeteoDailyRangeUrl", () => {
  test("① oblika: daily blok + start_date/end_date + timezone (brez current)", () => {
    const url = openMeteoDailyRangeUrl("46.38", "14.11", "2026-09-25", "2026-09-27");
    expect(url).toBe(
      "https://api.open-meteo.com/v1/forecast?latitude=46.38&longitude=14.11&daily=weather_code,temperature_2m_max,precipitation_probability_max&start_date=2026-09-25&end_date=2026-09-27&timezone=Europe/Ljubljana"
    );
    expect(url).not.toContain("current="); // način B ne potrebuje trenutnega vremena
  });

  test("② negativne koordinate (južna Albanija) ostanejo cele", () => {
    const url = openMeteoDailyRangeUrl("-19.5", "20.1", "2026-10-01", "2026-10-01");
    expect(url).toContain("latitude=-19.5");
    expect(url).toContain("longitude=20.1");
    expect(url).toContain("start_date=2026-10-01");
  });
});

// ---------------------------------------------------------------------------
// 4 — REFAKTOR fetchDailyForecast (zanka izvlečena — vedenje zaklenjeno)
// ---------------------------------------------------------------------------

const realFetch = globalThis.fetch;
let lastUrl: string | null = null;
let fetchCalls = 0;

function mockFetchCapture(payload: unknown, status = 200): void {
  fetchCalls = 0;
  lastUrl = null;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    fetchCalls += 1;
    lastUrl = String(input);
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

function mockFetchNever(): void {
  fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("TASK 66: fetchDailyForecast (refaktor — enako vedenje)", () => {
  test("① brez startDate: forecast_days=N + surove vrednosti DailyForecast", async () => {
    mockFetchCapture(
      omRange([TODAY, isoPlus(TODAY, 1)], [0, 61], [21.4, 18.9], [null, 80])
    );
    const d = await fetchDailyForecast(46.38, 14.11, 2);
    expect(d).not.toBeNull();
    expect(d!.length).toBe(2);
    expect(d![0].weatherCode).toBe(0);
    expect(d![0].tempMax).toBe(21.4);
    expect(lastUrl).toContain("forecast_days=2");
    expect(lastUrl).not.toContain("start_date=");
  });

  test("② s prihodnjim startDate: okno poravnano (start_date/end_date)", async () => {
    mockFetchCapture(omRange([isoPlus(TODAY, 2)], [3], [20], [10]));
    const d = await fetchDailyForecast(
      46.38,
      14.11,
      3,
      isoPlus(TODAY, 2)
    );
    expect(d).not.toBeNull();
    expect(lastUrl).toContain(`start_date=${isoPlus(TODAY, 2)}`);
    expect(lastUrl).toContain(`end_date=${isoPlus(TODAY, 4)}`); // n=min(3, 16-2)=3
  });

  test("③ odhod čez horizont → null BREZ klica vira (realne napovedi ni)", async () => {
    mockFetchNever();
    const d = await fetchDailyForecast(
      46.38,
      14.11,
      3,
      isoPlus(TODAY, 20)
    );
    expect(d).toBeNull();
    expect(fetchCalls).toBe(0); // izogib klica, ko napoved ne obstaja
  });

  test("④ neveljaven odgovor vira → null (fail-closed)", async () => {
    mockFetchCapture({ daily: { time: [] } });
    const d = await fetchDailyForecast(46.38, 14.11, 2);
    expect(d).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5 — KLIENT ČISTA PLAST (sidro, datumi, okno, striktna validacija)
// ---------------------------------------------------------------------------

describe("TASK 66: tripWeatherAnchor (geo destinacije — iskrena odsotnost)", () => {
  test("① destinacija z geo → točne koordinate (Bled)", () => {
    const j = mkJourney({ label: "Bled", lat: 46.379, lng: 14.114 });
    expect(tripWeatherAnchor(j)).toEqual({ lat: 46.379, lng: 14.114 });
  });

  test("② destinacija brez geo → null (vreme se NE izmisli)", () => {
    expect(tripWeatherAnchor(mkJourney({ label: "Nepoznano" }))).toBeNull();
  });

  test("③ neveljavna geo (NaN) → null (varovalka tipov)", () => {
    const j = mkJourney({ label: "X", lat: Number.NaN, lng: 14.1 });
    expect(tripWeatherAnchor(j)).toBeNull();
  });
});

describe("TASK 66: tripWeatherDates (samo realni datumi dni)", () => {
  test("① dan prihoda + dnevi dogodkov → unikatni naraščajoči datumi", () => {
    const trip = mkTrip([
      mkDay("2026-10-05", [mkEntry("a")]),
      mkDay(undefined, [mkEntry("b")]), // dan brez datuma — brez napovedi
      mkDay("2026-10-02", [mkEntry("e1")]),
      mkDay("2026-10-05", [mkEntry("e2")]), // duplikat
    ]);
    expect(tripWeatherDates(trip)).toEqual(["2026-10-02", "2026-10-05"]);
  });

  test("② neveljaven format datuma dneva → preskočen", () => {
    const trip = mkTrip([
      mkDay("5.10.2026", [mkEntry("a")]),
      mkDay("2026-10-02", [mkEntry("b")]),
    ]);
    expect(tripWeatherDates(trip)).toEqual(["2026-10-02"]);
  });

  test("③ brez datumov → null (klica vremena ni)", () => {
    expect(tripWeatherDates(mkTrip([mkDay(undefined, [])]))).toBeNull();
  });
});

describe("TASK 66: tripWeatherRange (okno zahteve)", () => {
  test("① min … max iz datumov", () => {
    expect(
      tripWeatherRange(["2026-10-05", "2026-10-02", "2026-10-08"])
    ).toEqual({ start: "2026-10-02", end: "2026-10-08" });
  });

  test("② en datum → start == end", () => {
    expect(tripWeatherRange(["2026-10-02"])).toEqual({
      start: "2026-10-02",
      end: "2026-10-02",
    });
  });

  test("③ prazen seznam → null", () => {
    expect(tripWeatherRange([])).toBeNull();
  });
});

describe("TASK 66: parseTripWeatherResponse (klient, striktna)", () => {
  test("① poljaven forecast → vsi dnevi preneseni", () => {
    const json = {
      forecast: [
        {
          date: TODAY,
          condition: "jasno",
          icon: "☀️",
          tempMax: 26,
          precipitationProbabilityMax: 10,
        },
        {
          date: isoPlus(TODAY, 1),
          condition: "dež",
          icon: "🌧️",
          tempMax: 18,
          precipitationProbabilityMax: null,
        },
      ],
    };
    const w = parseTripWeatherResponse(json);
    expect(w).not.toBeNull();
    expect(w!.length).toBe(2);
    expect(w![1].precipitationProbabilityMax).toBeNull();
  });

  test("② neveljaven dan (tempMax niz / slab datum) → IZPUŠČEN, ostali ostanejo", () => {
    const w = parseTripWeatherResponse({
      forecast: [
        { date: TODAY, condition: "jasno", icon: "☀️", tempMax: "26" },
        { date: "5.10.2026", condition: "dež", icon: "🌧️", tempMax: 18 },
        { date: isoPlus(TODAY, 1), condition: "megla", icon: "🌫️", tempMax: 15, precipitationProbabilityMax: 30 },
      ],
    });
    expect(w).not.toBeNull();
    expect(w!.length).toBe(1);
    expect(w![0].date).toBe(isoPlus(TODAY, 1));
  });

  test("③ PRAZNA tabela → [] (VELJAVNO: vir še ni objavil — ne napaka)", () => {
    const w = parseTripWeatherResponse({ forecast: [] });
    expect(w).not.toBeNull();
    expect(w!.length).toBe(0);
  });

  test("④ manjka forecast / ni tabela / ne-objekt → null", () => {
    expect(parseTripWeatherResponse({})).toBeNull();
    expect(parseTripWeatherResponse({ forecast: "x" })).toBeNull();
    expect(parseTripWeatherResponse(null)).toBeNull();
    expect(parseTripWeatherResponse([1, 2])).toBeNull();
  });

  test("⑤ padavine napačnega tipa (niz) → dan izpuščen (NEZNANO ≠ niz)", () => {
    const w = parseTripWeatherResponse({
      forecast: [
        { date: TODAY, condition: "jasno", icon: "☀️", tempMax: 26, precipitationProbabilityMax: "10" },
      ],
    });
    expect(w).not.toBeNull();
    expect(w!.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 6 — OZNAKE (SL/EN — iskrene formulacije)
// ---------------------------------------------------------------------------

describe("TASK 66: TRIP_WEATHER_LABELS (SL/EN)", () => {
  test("① čip dneva: „do X °C · padavine Y %\" / brez padavin samo temperatura", () => {
    const withRain = { date: TODAY, condition: "dež", icon: "🌧️", tempMax: 18, precipitationProbabilityMax: 40 };
    const noRain = { date: TODAY, condition: "jasno", icon: "☀️", tempMax: 26, precipitationProbabilityMax: null };
    expect(TRIP_WEATHER_LABELS.day.sl(withRain)).toBe("do 18 °C · padavine 40 %");
    expect(TRIP_WEATHER_LABELS.day.en(withRain)).toBe("up to 18 °C · rain 40 %");
    expect(TRIP_WEATHER_LABELS.day.sl(noRain)).toBe("do 26 °C");
    expect(TRIP_WEATHER_LABELS.day.en(noRain)).toBe("up to 26 °C");
  });

  test("② vir je izrecen (Open-Meteo) v obeh jezikih", () => {
    expect(TRIP_WEATHER_LABELS.source.sl).toContain("Open-Meteo");
    expect(TRIP_WEATHER_LABELS.source.en).toContain("Open-Meteo");
  });

  test("③ opombi: izpad vira NE sesuje načrta; „ni na voljo\" pove zakaj", () => {
    expect(TRIP_WEATHER_LABELS.unavailable.sl).toContain("deluje");
    expect(TRIP_WEATHER_LABELS.unavailable.en).toContain("keeps working");
    expect(TRIP_WEATHER_LABELS.notPublished.sl).toContain("16 dni");
    expect(TRIP_WEATHER_LABELS.notPublished.en).toContain("future days");
  });
});

// ---------------------------------------------------------------------------
// 7 — ROUTE INTEGRACIJA NAČIN B (/api/weather?start&end z mockanim fetch)
// ---------------------------------------------------------------------------

describe("TASK 66: GET /api/weather — način B (mock vir)", () => {
  test("① veljavno okno → 200 { forecast } (SL besedilo, zaokrožene vrednosti)", async () => {
    mockFetchCapture(
      omRange(
        [TODAY, isoPlus(TODAY, 1)],
        [0, 61],
        [21.4, 18.9],
        [null, 80]
      )
    );
    const res = await weatherGET(
      new Request(
        `http://localhost/api/weather?lat=46.38&lng=14.11&start=${TODAY}&end=${isoPlus(TODAY, 1)}`
      )
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      forecast: {
        date: string;
        condition: string;
        icon: string;
        tempMax: number;
        precipitationProbabilityMax: number | null;
      }[];
    };
    expect(body.forecast.length).toBe(2);
    expect(body.forecast[0].date).toBe(TODAY);
    expect(body.forecast[0].condition).toBe("jasno"); // koda 0
    expect(body.forecast[0].icon).toBe("☀️");
    expect(body.forecast[0].tempMax).toBe(21); // 21.4 → round
    expect(body.forecast[0].precipitationProbabilityMax).toBeNull(); // NEZNANO ≠ 0 %
    expect(body.forecast[1].condition).toBe("dež"); // koda 61
    expect(body.forecast[1].tempMax).toBe(19);
    expect(body.forecast[1].precipitationProbabilityMax).toBe(80);
  });

  test("② lang=en → angleško besedilo pogojev", async () => {
    mockFetchCapture(omRange([TODAY], [61], [18], [80]));
    const res = await weatherGET(
      new Request(
        `http://localhost/api/weather?lat=46.38&lng=14.11&lang=en&start=${TODAY}&end=${TODAY}`
      )
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { forecast: { condition: string }[] };
    expect(body.forecast[0].condition).toBe("rain");
  });

  test("③ clamp: start v preteklosti → klic vira z start_date=danes (iskreno okno)", async () => {
    mockFetchCapture(omRange([TODAY], [0], [20], [10]));
    const res = await weatherGET(
      new Request(
        `http://localhost/api/weather?lat=46.38&lng=14.11&start=${isoPlus(TODAY, -5)}&end=${isoPlus(TODAY, 1)}`
      )
    );
    expect(res.status).toBe(200);
    expect(lastUrl).toContain(`start_date=${TODAY}`); // poravnano na danes
    expect(lastUrl).toContain(`end_date=${isoPlus(TODAY, 1)}`);
  });

  test("④ clamp: end čez horizont → klic vira z end_date=danes+15", async () => {
    mockFetchCapture(omRange([TODAY], [0], [20], [10]));
    const res = await weatherGET(
      new Request(
        `http://localhost/api/weather?lat=46.38&lng=14.11&start=${TODAY}&end=${isoPlus(TODAY, 40)}`
      )
    );
    expect(res.status).toBe(200);
    expect(lastUrl).toContain(`end_date=${isoPlus(TODAY, 15)}`);
  });

  test("⑤ vse čez horizont → 200 { forecast: [] } BREZ klica vira", async () => {
    mockFetchNever();
    const res = await weatherGET(
      new Request(
        `http://localhost/api/weather?lat=46.38&lng=14.11&start=${isoPlus(TODAY, 20)}&end=${isoPlus(TODAY, 25)}`
      )
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { forecast: unknown[] };
    expect(body.forecast.length).toBe(0); // iskrena PRAZNA napoved
    expect(fetchCalls).toBe(0); // vir ni klican (napoved ne obstaja)
  });

  test("⑥ vse v preteklosti → 200 { forecast: [] } BREZ klica vira", async () => {
    mockFetchNever();
    const res = await weatherGET(
      new Request(
        `http://localhost/api/weather?lat=46.38&lng=14.11&start=${isoPlus(TODAY, -10)}&end=${isoPlus(TODAY, -5)}`
      )
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { forecast: unknown[] };
    expect(body.forecast.length).toBe(0);
    expect(fetchCalls).toBe(0);
  });

  test("⑦ samo start ali samo end → 400 (oba skupaj)", async () => {
    const r1 = await weatherGET(
      new Request(`http://localhost/api/weather?lat=46.38&lng=14.11&start=${TODAY}`)
    );
    expect(r1.status).toBe(400);
    const r2 = await weatherGET(
      new Request(`http://localhost/api/weather?lat=46.38&lng=14.11&end=${TODAY}`)
    );
    expect(r2.status).toBe(400);
  });

  test("⑧ neveljaven format datuma → 400", async () => {
    const res = await weatherGET(
      new Request(
        "http://localhost/api/weather?lat=46.38&lng=14.11&start=5.10.2026&end=2026-10-02"
      )
    );
    expect(res.status).toBe(400);
  });

  test("⑨ start za end → 400", async () => {
    const res = await weatherGET(
      new Request(
        `http://localhost/api/weather?lat=46.38&lng=14.11&start=${isoPlus(TODAY, 2)}&end=${TODAY}`
      )
    );
    expect(res.status).toBe(400);
  });

  test("⑩ injection poskus (P7-B): datum z & → 400 (strog ISO regex)", async () => {
    const res = await weatherGET(
      new Request(
        `http://localhost/api/weather?lat=46.38&lng=14.11&start=2026-09-21%26x%3DInjector&end=2026-09-25`
      )
    );
    expect(res.status).toBe(400);
    expect(fetchCalls).toBe(0);
  });

  test("⑪ vir neveljaven (prazen daily) → 502 (fail-closed, ne izmišljenih dni)", async () => {
    mockFetchCapture({ daily: { time: [] } });
    const res = await weatherGET(
      new Request(
        `http://localhost/api/weather?lat=46.38&lng=14.11&start=${TODAY}&end=${TODAY}`
      )
    );
    expect(res.status).toBe(502);
  });

  test("⑫ vir 500 → 502 z iskrenim sporočilom", async () => {
    mockFetchCapture({ error: "upstream" }, 500);
    const res = await weatherGET(
      new Request(
        `http://localhost/api/weather?lat=46.38&lng=14.11&start=${TODAY}&end=${TODAY}`
      )
    );
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("ni na voljo");
  });

  test("⑬ daily=1 skupaj s start/end → način B ima prednost (forecast, ne today)", async () => {
    mockFetchCapture(omRange([TODAY], [0], [20], [10]));
    const res = await weatherGET(
      new Request(
        `http://localhost/api/weather?lat=46.38&lng=14.11&daily=1&start=${TODAY}&end=${TODAY}`
      )
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Array.isArray(body.forecast)).toBe(true);
    expect("today" in body).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 8 — CELA VERIGA: journey → MY TRIP → sidro/datumi/okno (DI adapter)
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

describe("TASK 66: cela veriga journey → MY TRIP → vremensko okno (DI, Bled)", () => {
  test.skipIf(!hasKt)(
    "① startDate + izbira → sidro = geo Bled, datumi = [startDate], okno = isti dan",
    async () => {
      const START = isoPlus(TODAY, 2); // prihod v 2 dneh (znotraj horizonta)
      const j = await planJourney(
        {
          origin: "Brnik",
          destination: "bled",
          startDate: START,
          arrivalTime: "14:00",
          travelers: 2,
          lang: "sl",
        },
        { adapters: [fakeFsqAdapter()] }
      );
      if ("error" in j) throw new Error(j.error);
      const trip = buildMyTrip(j, new Set(["fsq:a1"]));
      const anchor = tripWeatherAnchor(j);
      expect(anchor).not.toBeNull();
      expect(anchor!.lat).toBeCloseTo(46.38, 1); // Bled (DESTINATIONS)
      const dates = tripWeatherDates(trip);
      expect(dates).toEqual([START]); // dan 1 = datum prihoda (vpis uporabnika)
      expect(tripWeatherRange(dates!)).toEqual({ start: START, end: START });
    }
  );

  test.skipIf(!hasKt)(
    "② brez startDate → datumi = null (datum prihoda ni vnesen — klica vremena ni)",
    async () => {
      const j = await planJourney(
        {
          origin: "Brnik",
          destination: "bled",
          travelers: 2,
          lang: "sl",
        },
        { adapters: [fakeFsqAdapter()] }
      );
      if ("error" in j) throw new Error(j.error);
      const trip = buildMyTrip(j, new Set(["fsq:a1"]));
      expect(tripWeatherDates(trip)).toBeNull();
    }
  );
});
