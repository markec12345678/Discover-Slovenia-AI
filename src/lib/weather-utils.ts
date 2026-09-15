/**
 * Skupni helperji za Open-Meteo vreme.
 *
 * Uporabniki:
 * - /api/weather (current vreme za vreme widget)
 * - /api/itinerary (DAILY prognoza — PRAVO vreme v AI itinererju)
 *
 * Open-Meteo je brezplačen in brez API ključa; uporablja WMO weather kode.
 */

/** WMO weather code → slovensko besedilo. */
export function weatherCodeToText(code: number): string {
  if (code === 0) return "jasno";
  if (code <= 3) return "delno oblačno";
  if (code <= 48) return "megla";
  if (code <= 67) return "dež";
  if (code <= 77) return "sneg";
  if (code <= 82) return "plohe";
  if (code <= 86) return "snežne plohe";
  if (code <= 99) return "nevihta";
  return "spremenljivo";
}

/**
 * WMO weather code → angleško besedilo (WEATHER-CONTEXT).
 *
 * EN itinererji prej niso imeli ločenega prevoda — vreme v promptu in
 * izpisu je bilo slovensko tudi za locale "en". Ta funkcija pokriva
 * EN kontekst (prompt briefing + enrich izpis).
 */
export function weatherCodeToTextEn(code: number): string {
  if (code === 0) return "clear";
  if (code <= 3) return "partly cloudy";
  if (code <= 48) return "fog";
  if (code <= 67) return "rain";
  if (code <= 77) return "snow";
  if (code <= 82) return "showers";
  if (code <= 86) return "snow showers";
  if (code <= 99) return "thunderstorm";
  return "variable";
}

/** WMO weather code → emoji ikona. */
export function weatherCodeToIcon(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 3) return "⛅";
  if (code <= 48) return "🌫️";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "❄️";
  if (code <= 82) return "🌦️";
  if (code <= 99) return "⛈️";
  return "🌤️";
}

export interface DailyForecast {
  /** ISO datum (YYYY-MM-DD) */
  date: string;
  /** WMO weather code */
  weatherCode: number;
  /** Max dnevna temperatura (°C) */
  tempMax: number;
  /** Max verjetnost padavin (%) — null če Open-Meteo ne vrne vrednosti */
  precipitationProbabilityMax: number | null;
}

/**
 * Današnji ISO datum (YYYY-MM-DD) v časovnem pasu Europe/Ljubljana.
 *
 * Prognozni horizont Open-Meteo (~16 dni) se meri od "danes" — na
 * serverju (UTC) bi ob robnih urah dobili napačen dan, zato računamo
 * v Ljubljanskem pasu (enako kot timezone param API klica).
 */
function todayISOSI(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Ljubljana",
  }).format(new Date());
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Pridobi DAILY prognozo za naslednjih `days` dni (max 16, Open-Meteo limit).
 *
 * WEATHER-CONTEXT: če je podan `startDate` (ISO datum odhoda), se napoved
 * PORAVNA z oknom potovanja (start_date/end_date namesto forecast_days) —
 * prej je bil dan i dobil vreme "i-ti dan od danes", kar je za potovanje
 * čez teden napačno. Če je odhod čez prognozni horizont (~16 dni), vrne
 * null — realna napoved ne obstaja in klic se graceful izogne.
 *
 * Cache: 15 min (revalidate 900) — dovolj sveže za načrtovanje, prihranek klicev.
 * Timeout: 4 s (itinerer ne sme čakati na vreme).
 *
 * Vrne `null` ob napaki/timeoutu — klic naj se graceful izogne (fallback na
 * obstoječe vreme v objektu).
 */
export async function fetchDailyForecast(
  lat: number,
  lng: number,
  days: number,
  startDate?: string
): Promise<DailyForecast[] | null> {
  let n = Math.min(Math.max(days, 1), 16);

  // WEATHER-CONTEXT: poravnaj s datumom odhoda, če je podan in veljaven
  let dateParams = `forecast_days=${n}`;
  if (startDate && ISO_DATE_RE.test(startDate)) {
    const startMs = Date.parse(`${startDate}T00:00:00Z`);
    const todayMs = Date.parse(`${todayISOSI()}T00:00:00Z`);
    if (Number.isFinite(startMs) && Number.isFinite(todayMs)) {
      const offsetDays = Math.round((startMs - todayMs) / 86_400_000);
      if (offsetDays > 0) {
        // koliko dni prognoze je še na voljo do horizonta (16 dni od danes)
        const available = 16 - offsetDays;
        if (available <= 0) return null; // odhod preseg -- horizont: realne napovedi ni
        n = Math.min(n, available);
        const endMs = startMs + (n - 1) * 86_400_000;
        const endDate = new Date(endMs).toISOString().slice(0, 10);
        dateParams = `start_date=${startDate}&end_date=${endDate}`;
      }
      // offsetDays <= 0: datum je danes/v preteklosti — danes-način
      // (veljavnost preteklosti že pokriva isValidStartDate na ruti)
    }
  }

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weather_code,temperature_2m_max,precipitation_probability_max&timezone=Europe/Ljubljana&${dateParams}`;

  try {
    const res = await fetch(url, {
      next: { revalidate: 900 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      throw new Error(`Open-Meteo: ${res.status}`);
    }

    const data = (await res.json()) as {
      daily?: {
        time?: string[];
        weather_code?: number[];
        temperature_2m_max?: number[];
        precipitation_probability_max?: (number | null)[];
      };
    };

    const d = data.daily;
    if (!d?.time?.length) return null;

    const out: DailyForecast[] = [];
    for (let i = 0; i < d.time.length; i++) {
      const tempMax = d.temperature_2m_max?.[i];
      const code = d.weather_code?.[i];
      // Manjkajoče temperature/kode preskočimo — raje manj dni kot napačni
      if (typeof tempMax !== "number" || typeof code !== "number") continue;
      out.push({
        date: d.time[i],
        weatherCode: code,
        tempMax,
        precipitationProbabilityMax:
          d.precipitation_probability_max?.[i] ?? null,
      });
    }
    return out.length > 0 ? out : null;
  } catch (error) {
    console.error("[weather] daily forecast napaka:", error);
    return null;
  }
}
