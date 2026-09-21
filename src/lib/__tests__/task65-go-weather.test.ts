// ============================================================================
// TASK 65 — GO MODE VREME „NA POTI" (1.65.0)
// ============================================================================
// Pokriva: ČISTE parse plasti Open-Meteo odgovora (current + daily, fail-closed
// — neveljaven tip → null, nikoli izmišljenih vrednosti; null padavine ≠ 0 %),
// URL graditelj (dnevni blok SAMO na zahtevo — ista osnovna oblika kot prej),
// cilj vremena iz Go Mode pogleda (geo naslednjega postanka; brez geo → null),
// striktno validacijo odgovora /api/weather na klientu, oznake SL/EN in
// INTEGRACIJO route handlerja z mockanim global.fetch (0 živega omrežja).
// ============================================================================

import { afterEach, describe, expect, test } from "bun:test";

import {
  openMeteoCurrentUrl,
  parseOpenMeteoCurrent,
  parseOpenMeteoToday,
} from "@/lib/weather-utils";
import {
  GO_WEATHER_LABELS,
  goWeatherTarget,
  observedTimeLabel,
  parseGoWeatherResponse,
} from "@/lib/journey/go-weather";
import { planJourney } from "@/lib/journey/orchestrator";
import { buildMyTrip, type MyTripDay, type MyTripView, type TripEntry } from "@/lib/journey/trip-view";
import { buildGoView } from "@/lib/journey/go-view";
import type { SupplyAdapter } from "@/lib/supply/adapter";
import type { ProviderProduct } from "@/lib/supply/types";
import { getProvider } from "@/lib/supply/registry";
import { getKiwitaxiBaseline } from "@/lib/supply/providers/kiwitaxi/dataset";
import { clearProviderRateLimits } from "@/lib/supply/search";
import { GET as weatherGET } from "@/app/api/weather/route";

const baseline = getKiwitaxiBaseline();
const hasKt = Boolean(baseline);

// ---------------------------------------------------------------------------
// Fixture (go-view testiramo BREZ celotnega journeyja — isti kanon kot TASK 64)
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
    title: { sl: "MOJA POT — KOTOR", en: "MY TRIP — KOTOR" },
    days,
    externalCards: [],
    confirmation: { confirmedCount: 0, note: { sl: "ni", en: "none" } },
    generatedAt: new Date().toISOString(),
  };
}

/** 20. 9. 2026, 14:00 lokalno (Kotor — 42.42°N 18.77°E). */
const NOW = new Date(2026, 8, 20, 14, 0);
const TODAY = "2026-09-20";
const KOTOR = { lat: 42.4246, lng: 18.7704 };

/** Realna oblika Open-Meteo odgovora (current + daily[0]). */
const OM_OK = {
  latitude: 42.4375,
  longitude: 18.75,
  timezone: "Europe/Ljubljana",
  current: {
    time: "2026-09-21T08:15",
    temperature_2m: 23.8,
    relative_humidity_2m: 61,
    wind_speed_10m: 3.2,
    weather_code: 1,
  },
  daily: {
    time: ["2026-09-21"],
    weather_code: [3],
    temperature_2m_max: [26.4],
    precipitation_probability_max: [10],
  },
};

// ---------------------------------------------------------------------------
// 1 — PARSE OPEN-METEO (fail-closed, SL+EN)
// ---------------------------------------------------------------------------

describe("TASK 65: parseOpenMeteoCurrent (fail-closed)", () => {
  test("① veljaven odgovor (SL): zaokrožene vrednosti + besedilo/ikona po kodi + observedAt", () => {
    const p = parseOpenMeteoCurrent(OM_OK, "sl");
    expect(p).not.toBeNull();
    expect(p!.temp).toBe(24); // 23.8 → round
    expect(p!.humidity).toBe(61);
    expect(p!.windSpeed).toBe(3); // 3.2 → round
    expect(p!.condition).toBe("delno oblačno"); // koda 1
    expect(p!.icon).toBe("⛅");
    expect(p!.observedAt).toBe("2026-09-21T08:15");
  });

  test("② veljaven odgovor (EN): angleško besedilo (koda 61 → rain)", () => {
    const raw = { current: { ...OM_OK.current, weather_code: 61 } };
    const p = parseOpenMeteoCurrent(raw, "en");
    expect(p!.condition).toBe("rain");
    expect(p!.icon).toBe("🌧️");
  });

  test("③ manjka current → null (NE izmišljujemo)", () => {
    expect(parseOpenMeteoCurrent({}, "sl")).toBeNull();
    expect(parseOpenMeteoCurrent(null, "sl")).toBeNull();
    expect(parseOpenMeteoCurrent("napaka", "sl")).toBeNull();
  });

  test("④ temperature ni število → null (fail-closed, ne 0 °C)", () => {
    const raw = { current: { ...OM_OK.current, temperature_2m: "24" } };
    expect(parseOpenMeteoCurrent(raw, "sl")).toBeNull();
  });

  test("⑤ NaN temperatura → null", () => {
    const raw = { current: { ...OM_OK.current, temperature_2m: Number.NaN } };
    expect(parseOpenMeteoCurrent(raw, "sl")).toBeNull();
  });

  test("⑥ current.time manjka → observedAt NI (neobvezno polje)", () => {
    const { time, ...noTime } = OM_OK.current;
    const p = parseOpenMeteoCurrent({ current: noTime }, "sl");
    expect(p).not.toBeNull();
    expect(p!.observedAt).toBeUndefined();
  });
});

describe("TASK 65: parseOpenMeteoToday (fail-closed)", () => {
  test("① veljaven daily[0] (SL): koda 3 → oblačno, padavine 10 %", () => {
    const t = parseOpenMeteoToday(OM_OK, "sl");
    expect(t).not.toBeNull();
    expect(t!.tempMax).toBe(26); // 26.4 → round
    expect(t!.condition).toBe("delno oblačno");
    expect(t!.icon).toBe("⛅");
    expect(t!.precipitationProbabilityMax).toBe(10);
  });

  test("② veljaven daily[0] (EN): angleško besedilo", () => {
    const t = parseOpenMeteoToday(OM_OK, "en");
    expect(t!.condition).toBe("partly cloudy");
  });

  test("③ manjka daily → null", () => {
    const { daily, ...noDaily } = OM_OK;
    expect(parseOpenMeteoToday(noDaily, "sl")).toBeNull();
  });

  test("④ prazen daily.time → null", () => {
    expect(parseOpenMeteoToday({ daily: { time: [] } }, "sl")).toBeNull();
  });

  test("⑤ padavine null v viru → null (NEZNANO ≠ 0 %)", () => {
    const raw = {
      daily: {
        ...OM_OK.daily,
        precipitation_probability_max: [null],
      },
    };
    const t = parseOpenMeteoToday(raw, "sl");
    expect(t).not.toBeNull();
    expect(t!.precipitationProbabilityMax).toBeNull();
  });

  test("⑥ tempMax ni število → null", () => {
    const raw = {
      daily: { ...OM_OK.daily, temperature_2m_max: ["26"] },
    };
    expect(parseOpenMeteoToday(raw, "sl")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2 — URL GRADITELJ (daily SAMO na zahtevo — osnovna oblika NESPREMENJENA)
// ---------------------------------------------------------------------------

describe("TASK 65: openMeteoCurrentUrl", () => {
  test("① brez daily: ENAKA oblika kot pred TASK 65 (backward compat)", () => {
    expect(openMeteoCurrentUrl("46.37", "14.09", false)).toBe(
      "https://api.open-meteo.com/v1/forecast?latitude=46.37&longitude=14.09&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=Europe/Ljubljana"
    );
  });

  test("② z daily: daily blok + forecast_days=1 (danas)", () => {
    const url = openMeteoCurrentUrl("42.42", "18.77", true);
    expect(url).toContain("daily=weather_code,temperature_2m_max,precipitation_probability_max");
    expect(url).toContain("forecast_days=1");
    expect(url).toContain("latitude=42.42");
    expect(url).toContain("longitude=18.77");
    // current blok ostaja (vreme zdaj + danes iz ENEGA klica)
    expect(url).toContain("current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code");
  });

  test("③ negativne koordinate (Črna gora / južna Albanija) ostanejo cele", () => {
    const url = openMeteoCurrentUrl("-19.5", "20.1", false);
    expect(url).toContain("latitude=-19.5");
    expect(url).toContain("longitude=20.1");
  });
});

// ---------------------------------------------------------------------------
// 3 — CILJ VREMENA (geo naslednjega postanka — iskrena odsotnost)
// ---------------------------------------------------------------------------

describe("TASK 65: goWeatherTarget (iz Go Mode pogleda)", () => {
  test("① naslednji postanek z geo → točne koordinate (Kotor)", () => {
    const trip = mkTrip([
      mkDay(TODAY, [
        mkEntry("a1", { lat: KOTOR.lat, lng: KOTOR.lng, title: "Srđ" }),
      ]),
    ]);
    const view = buildGoView(trip, NOW, null, {});
    expect(view.next).toBeDefined();
    const target = goWeatherTarget(view);
    expect(target).toEqual({ lat: KOTOR.lat, lng: KOTOR.lng });
  });

  test("② naslednji postanek BREZ geo → null (vreme se NE izmisli)", () => {
    const trip = mkTrip([mkDay(TODAY, [mkEntry("a1")])]);
    const view = buildGoView(trip, NOW, null, {});
    expect(goWeatherTarget(view)).toBeNull();
  });

  test("③ ni naslednjega postanka (vse opravljeno) → null", () => {
    const trip = mkTrip([mkDay(TODAY, [mkEntry("a1")])]);
    const view = buildGoView(trip, NOW, null, { a1: "2026-09-20T14:30:00.000Z" });
    expect(view.next).toBeUndefined();
    expect(goWeatherTarget(view)).toBeNull();
  });

  test("④ neveljavna geo (NaN) → null (varovalka tipov)", () => {
    const trip = mkTrip([
      mkDay(TODAY, [mkEntry("a1", { lat: Number.NaN, lng: KOTOR.lng })]),
    ]);
    const view = buildGoView(trip, NOW, null, {});
    expect(goWeatherTarget(view)).toBeNull();
  });

  test("⑤ naslednji je prihod (z geo izhodišča) → vreme pri izhodišču (iskreno)", () => {
    const trip = mkTrip([
      mkDay(TODAY, [
        mkEntry("arrival", {
          category: "arrival",
          icon: "✈️",
          title: "Prihod: Brnik",
          lat: 46.2244,
          lng: 14.4544,
        }),
        mkEntry("a1", { lat: KOTOR.lat, lng: KOTOR.lng }),
      ]),
    ]);
    const view = buildGoView(trip, NOW, null, {});
    expect(view.next?.entry.key).toBe("arrival");
    expect(goWeatherTarget(view)).toEqual({ lat: 46.2244, lng: 14.4544 });
  });
});

// ---------------------------------------------------------------------------
// 4 — VALIDACIJA ODGOVORA /api/weather NA KLIENTU (striktna)
// ---------------------------------------------------------------------------

describe("TASK 65: parseGoWeatherResponse (klient, striktna)", () => {
  test("① poln odgovor s today → vse preneseno", () => {
    const json = {
      condition: "delno oblačno",
      temp: 24,
      humidity: 61,
      windSpeed: 3,
      icon: "⛅",
      observedAt: "2026-09-21T08:15",
      today: {
        condition: "delno oblačno",
        icon: "⛅",
        tempMax: 26,
        precipitationProbabilityMax: 10,
      },
    };
    const w = parseGoWeatherResponse(json);
    expect(w).not.toBeNull();
    expect(w!.temp).toBe(24);
    expect(w!.today).toBeDefined();
    expect(w!.today!.tempMax).toBe(26);
    expect(w!.today!.precipitationProbabilityMax).toBe(10);
    expect(w!.observedAt).toBe("2026-09-21T08:15");
  });

  test("② odgovor brez today (daily ni zahtevan / neveljaven pri viru) → veljavno brez today", () => {
    const w = parseGoWeatherResponse({
      condition: "jasno",
      temp: 20,
      humidity: 50,
      windSpeed: 5,
      icon: "☀️",
    });
    expect(w).not.toBeNull();
    expect(w!.today).toBeUndefined();
  });

  test("③ manjka temp → null (nikoli praznega vremena)", () => {
    expect(
      parseGoWeatherResponse({ condition: "jasno", humidity: 50, windSpeed: 5, icon: "☀️" })
    ).toBeNull();
  });

  test("④ temp kot niz → null", () => {
    expect(
      parseGoWeatherResponse({
        condition: "jasno",
        temp: "20",
        humidity: 50,
        windSpeed: 5,
        icon: "☀️",
      })
    ).toBeNull();
  });

  test("⑤ neveljaven today (tempMax niz) → today IZPUŠČEN, trenutno ostane", () => {
    const w = parseGoWeatherResponse({
      condition: "jasno",
      temp: 20,
      humidity: 50,
      windSpeed: 5,
      icon: "☀️",
      today: { condition: "jasno", icon: "☀️", tempMax: "26" },
    });
    expect(w).not.toBeNull();
    expect(w!.temp).toBe(20);
    expect(w!.today).toBeUndefined();
  });

  test("⑥ today s padavinami null → preneseno null (NEZNANO ≠ 0)", () => {
    const w = parseGoWeatherResponse({
      condition: "jasno",
      temp: 20,
      humidity: 50,
      windSpeed: 5,
      icon: "☀️",
      today: { condition: "jasno", icon: "☀️", tempMax: 26, precipitationProbabilityMax: null },
    });
    expect(w!.today!.precipitationProbabilityMax).toBeNull();
  });

  test("⑦ observedAt napačnega tipa → izpuščen, ostalo velja", () => {
    const w = parseGoWeatherResponse({
      condition: "jasno",
      temp: 20,
      humidity: 50,
      windSpeed: 5,
      icon: "☀️",
      observedAt: 123,
    });
    expect(w!.observedAt).toBeUndefined();
  });

  test("⑧ null / ne-objekt → null", () => {
    expect(parseGoWeatherResponse(null)).toBeNull();
    expect(parseGoWeatherResponse("x")).toBeNull();
    expect(parseGoWeatherResponse([1, 2])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5 — OZNAKE (SL/EN) + ČAS MERITVE
// ---------------------------------------------------------------------------

describe("TASK 65: oznake in čas meritve", () => {
  test("① observedTimeLabel: ISO → HH:MM; brez T → null", () => {
    expect(observedTimeLabel("2026-09-21T08:15")).toBe("08:15");
    expect(observedTimeLabel("2026-09-21")).toBeNull();
    expect(observedTimeLabel("")).toBeNull();
  });

  test("② today oznaka SL s padavinami / EN brez", () => {
    expect(
      GO_WEATHER_LABELS.today.sl({
        condition: "delno oblačno",
        icon: "⛅",
        tempMax: 26,
        precipitationProbabilityMax: 10,
      })
    ).toBe("danes do 26 °C · padavine 10 %");
    expect(
      GO_WEATHER_LABELS.today.en({
        condition: "partly cloudy",
        icon: "⛅",
        tempMax: 26,
        precipitationProbabilityMax: null,
      })
    ).toBe("today up to 26 °C");
  });

  test("③ naslov/opomba/vir obstajajo dvojezično (iskrene formulacije)", () => {
    expect(GO_WEATHER_LABELS.title.sl).toContain("naslednji postanki");
    expect(GO_WEATHER_LABELS.title.en).toContain("next stop");
    expect(GO_WEATHER_LABELS.unavailable.sl).toContain("načrt");
    expect(GO_WEATHER_LABELS.unavailable.en).toContain("plan");
    expect(GO_WEATHER_LABELS.source.sl).toContain("Open-Meteo");
    expect(GO_WEATHER_LABELS.observed.sl("08:15")).toBe("meritev ob 08:15");
    expect(GO_WEATHER_LABELS.observed.en("08:15")).toBe("measured at 08:15");
  });
});

// ---------------------------------------------------------------------------
// 6 — ROUTE INTEGRACIJA (/api/weather z mockanim global.fetch — 0 živega omrežja)
// ---------------------------------------------------------------------------

const realFetch = globalThis.fetch;

function mockFetchOnce(payload: unknown, status = 200): void {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  clearProviderRateLimits(); // TASK 76: ne puščaj runner žetonov naslednjim datotekam
});

describe("TASK 65: GET /api/weather — route integracija (mock vir)", () => {
  test("① brez parametrov: obnašanje kot PREJ (SL besedilo, brez today) — backward compat", async () => {
    mockFetchOnce(OM_OK);
    const res = await weatherGET(
      new Request("http://localhost/api/weather?lat=42.42&lng=18.77")
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.condition).toBe("delno oblačno");
    expect(body.temp).toBe(24);
    expect(body.humidity).toBe(61);
    expect(body.windSpeed).toBe(3);
    expect(body.icon).toBe("⛅");
    expect(body.observedAt).toBe("2026-09-21T08:15");
    expect("today" in body).toBe(false);
  });

  test("② lang=en&daily=1: angleško besedilo + today", async () => {
    mockFetchOnce(OM_OK);
    const res = await weatherGET(
      new Request("http://localhost/api/weather?lat=42.42&lng=18.77&lang=en&daily=1")
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      condition: string;
      today?: { tempMax: number; precipitationProbabilityMax: number | null };
    };
    expect(body.condition).toBe("partly cloudy");
    expect(body.today).toBeDefined();
    expect(body.today!.tempMax).toBe(26);
    expect(body.today!.precipitationProbabilityMax).toBe(10);
  });

  test("③ daily=1, vir brez daily bloka → 200 brez today (iskrena odsotnost, NE napaka)", async () => {
    const { daily, ...noDaily } = OM_OK;
    mockFetchOnce(noDaily);
    const res = await weatherGET(
      new Request("http://localhost/api/weather?lat=42.42&lng=18.77&daily=1")
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.condition).toBe("delno oblačno");
    expect("today" in body).toBe(false);
  });

  test("④ neveljaven odgovor vira (current brez števil) → 502 (fail-closed)", async () => {
    mockFetchOnce({ current: { temperature_2m: "x" } });
    const res = await weatherGET(
      new Request("http://localhost/api/weather?lat=42.42&lng=18.77")
    );
    expect(res.status).toBe(502);
  });

  test("⑤ vir 500 → 502 z iskrenim sporočilom", async () => {
    mockFetchOnce({ error: "upstream" }, 500);
    const res = await weatherGET(
      new Request("http://localhost/api/weather?lat=42.42&lng=18.77")
    );
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("ni na voljo");
  });

  test("⑥ injection poskus (P7-B): koordinata z & → 400 (guard nespremenjen)", async () => {
    const res = await weatherGET(
      new Request("http://localhost/api/weather?lat=1.0%26x%3DInjector&lng=18.77")
    );
    expect(res.status).toBe(400);
  });

  test("⑦ manjkata lat/lng → 400 (nespremenjeno)", async () => {
    const res = await weatherGET(new Request("http://localhost/api/weather"));
    expect(res.status).toBe(400);
  });

  test("⑧ napačen lang (ne-sl/ne-en) → fail-closed na privzeti SL", async () => {
    mockFetchOnce(OM_OK);
    const res = await weatherGET(
      new Request("http://localhost/api/weather?lat=42.42&lng=18.77&lang=de")
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { condition: string };
    expect(body.condition).toBe("delno oblačno"); // slovenščina, ne izjema
  });
});

// ---------------------------------------------------------------------------
// 7 — CELA VERIGA: journey → MY TRIP → NA POTI → cilj vremena (DI adapter)
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

describe("TASK 65: cela veriga journey → NA POTI → vreme (DI, Bled)", () => {
  test.skipIf(!hasKt)(
    "① naslednji = prihod (z geo Brnik) → cilj vremena = izhodišče",
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
      const view = buildGoView(trip, NOW, null, {});
      const target = goWeatherTarget(view);
      expect(target).not.toBeNull();
      expect(target!.lat).toBeCloseTo(46.22, 1); // Brnik (KT dataset)
    }
  );

  test.skipIf(!hasKt)(
    "② prihod opravljen → naslednji = znamenitost → cilj vremena = njen geo",
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
      const view = buildGoView(trip, NOW, null, {
        arrival: "2026-09-20T14:05:00.000Z",
      });
      expect(view.next?.entry.key).toBe("fsq:a1");
      const target = goWeatherTarget(view);
      expect(target).toEqual({ lat: 46.371, lng: 14.107 });
    }
  );
});
