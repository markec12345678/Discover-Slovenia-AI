import { NextResponse } from "next/server";
import {
  clampForecastRange,
  openMeteoCurrentUrl,
  openMeteoDailyRangeUrl,
  parseOpenMeteoCurrent,
  parseOpenMeteoDailyRange,
  parseOpenMeteoToday,
  todayISOSI,
  weatherCodeToIcon,
  weatherCodeToText,
  weatherCodeToTextEn,
  type CurrentWeatherPayload,
  type TodayOutlookPayload,
} from "@/lib/weather-utils";

// GET /api/weather?lat=46.37&lng=14.09[&lang=sl|en][&daily=1]
//     /api/weather?lat=..&lng=..&start=YYYY-MM-DD&end=YYYY-MM-DD[&lang=..]
// Uporablja Open-Meteo (brez API ključa, brezplačno).
// Prevajanje WMO kod → besedilo/ikone je v skupnem @/lib/weather-utils
// (ČISTI parse sloji TASK 65 — fail-closed, testirljivi brez omrežja).
//
// TASK 65 (Go Mode „Na poti"): `lang` izbere jezik besedila pogoje
// (privzeto sl — obstoječi klici brez parametra se obnašajo ENAKO kot prej),
// `daily=1` doda današnjo dnevno napoved (tempMax + verjetnost padavin)
// iz ISTEGA klica Open-Meteo (0 dodatnih klicev na vir).
//
// TASK 66 (MY TRIP — vreme po dnevih): `start`+`end` (skupaj ali noben)
// preklopita v NAČIN B — dnevna napoved ZA KONKRETNE DATUME (datumsko
// okno se najprej poravna na realno (danes … danes+15 — clampForecastRange);
// prazen presek → iskrena PRAZNA napoved, brez klica vira). Odgovor:
// { forecast: [{ date, condition, icon, tempMax, precipitationProbabilityMax }] }.
// Način A (brez start/end) ostaja 100 % nespremenjen (backward compat).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  if (!lat || !lng) {
    return NextResponse.json(
      { error: "Manjkata lat in lng parametra" },
      { status: 400 }
    );
  }

  // P7-B (F5): validacija pred interpolacijo v zunanji URL — sprejmemo samo
  // decimalne številke (prej bi šel skozi poljuben npr. "1.0&x=Injector")
  const COORD_RE = /^-?\d{1,3}(\.\d+)?$/;
  if (!COORD_RE.test(lat) || !COORD_RE.test(lng)) {
    return NextResponse.json(
      { error: "Neveljavna koordinata" },
      { status: 400 }
    );
  }

  // TASK 65: jezik besedila (fail-closed na privzeti sl — samo "en" preklopi)
  const lang = searchParams.get("lang") === "en" ? "en" : "sl";

  // TASK 66: jezikovne preslikave WMO kode → besedilo/ikona (isti kanon kot
  // parse plasti — samo tukaj za mapiranje DailyForecast → odgovor).
  const codeText =
    lang === "en"
      ? (code: number) => weatherCodeToTextEn(code)
      : (code: number) => weatherCodeToText(code);

  // ---------------------------------------------------------------------
  // TASK 66 — NAČIN B: dnevna napoved za datumsko okno (MY TRIP)
  // ---------------------------------------------------------------------
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  // P7-B: ISO datum se prej preverja s STROGIM regexom (samo \d{4}-\d{2}-\d{2}) —
  // injekcija (npr. "2026-09-21&x=Injector") NE more skozi.
  const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  if (start != null || end != null) {
    // Oba parametra skupaj (samo eden → neveljavna zahteva)
    if (start == null || end == null) {
      return NextResponse.json(
        { error: "Parametra start in end sta obvezna skupaj" },
        { status: 400 }
      );
    }
    if (!ISO_DATE_RE.test(start) || !ISO_DATE_RE.test(end)) {
      return NextResponse.json(
        { error: "Neveljaven datum (pričakovan YYYY-MM-DD)" },
        { status: 400 }
      );
    }
    if (Date.parse(`${start}T00:00:00Z`) > Date.parse(`${end}T00:00Z`)) {
      return NextResponse.json(
        { error: "start mora biti pred end ali enak" },
        { status: 400 }
      );
    }

    // Poravnaj okno na realno (danes … danes+15). PRAZEN presek = dni,
    // za katere vir NIČ realnega ne objavi → iskrena prazna napoved
    // (200, brez klica vira — nikoli izmišljenih dni).
    const clamped = clampForecastRange(start, end, todayISOSI());
    if (!clamped) {
      return NextResponse.json({ forecast: [] });
    }

    try {
      const url = openMeteoDailyRangeUrl(lat, lng, clamped.start, clamped.end);
      const res = await fetch(url, {
        next: { revalidate: 900 }, // načrtovanje (ne "zdaj") — 15 min, kot fetchDailyForecast
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) {
        throw new Error(`Open-Meteo: ${res.status}`);
      }

      const daily = parseOpenMeteoDailyRange(await res.json());
      if (!daily) {
        // Fail-closed: vir je vrnil nekaj, kar ni veljavna dnevna napoved
        throw new Error("Open-Meteo: neveljaven odgovor (daily)");
      }

      // DailyForecast (surova koda) → lokaliziran odgovor (condition/icon).
      // tempMax zaokrožimo (isti kanon kot parseOpenMeteoToday); padavine
      // null ostanejo null (NEZNANO ≠ 0 %).
      return NextResponse.json({
        forecast: daily.map((d) => ({
          date: d.date,
          condition: codeText(d.weatherCode),
          icon: weatherCodeToIcon(d.weatherCode),
          tempMax: Math.round(d.tempMax),
          precipitationProbabilityMax:
            d.precipitationProbabilityMax == null
              ? null
              : Math.round(d.precipitationProbabilityMax),
        })),
      });
    } catch (error) {
      console.error("[weather] napaka (range):", error);
      return NextResponse.json(
        { error: "Vreme trenutno ni na voljo" },
        { status: 502 }
      );
    }
  }

  // ---------------------------------------------------------------------
  // NAČIN A (nespremenjen — TASK 65 backward compat)
  // ---------------------------------------------------------------------
  // TASK 65: današnja dnevna napoved (samo dobesedno "1" jo vklopi)
  const withDaily = searchParams.get("daily") === "1";

  try {
    const url = openMeteoCurrentUrl(lat, lng, withDaily);

    const res = await fetch(url, { next: { revalidate: 600 } }); // cache 10 min
    if (!res.ok) {
      throw new Error(`Open-Meteo: ${res.status}`);
    }

    const data: unknown = await res.json();

    // Fail-closed parse: neveljaven odgovor vira → 502 (nikoli izmišljenih
    // vrednosti). Prej se je .current dostopal neposredno (TypeError → 502)
    // — vedenje ob napaki ostaja enako, zdaj pa je logika testirana.
    const current = parseOpenMeteoCurrent(data, lang);
    if (!current) {
      throw new Error("Open-Meteo: neveljaven odgovor (current)");
    }

    // Daily: SAMO če je zahtevan IN veljaven — neveljaven daily blok NE sesuje
    // trenutnega vremena (iskrena odsotnost polja today, ne napaka).
    const today: TodayOutlookPayload | null = withDaily
      ? parseOpenMeteoToday(data, lang)
      : null;

    const payload: CurrentWeatherPayload & { today?: TodayOutlookPayload } =
      current;
    if (today) payload.today = today;

    return NextResponse.json(payload);
  } catch (error) {
    console.error("[weather] napaka:", error);
    return NextResponse.json(
      { error: "Vreme trenutno ni na voljo" },
      { status: 502 }
    );
  }
}
