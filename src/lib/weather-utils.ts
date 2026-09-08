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
 * Pridobi DAILY prognozo za naslednjih `days` dni (max 16, Open-Meteo limit).
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
  days: number
): Promise<DailyForecast[] | null> {
  const n = Math.min(Math.max(days, 1), 16);
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weather_code,temperature_2m_max,precipitation_probability_max&timezone=Europe/Ljubljana&forecast_days=${n}`;

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
