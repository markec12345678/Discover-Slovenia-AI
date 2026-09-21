/**
 * Skupni helperji za Open-Meteo vreme.
 *
 * Uporabniki:
 * - /api/weather (current vreme za vreme widget + TASK 65: Go Mode daily)
 * - /api/itinerary (DAILY prognoza — PRAVO vreme v AI itinererju)
 *
 * Open-Meteo je brezplačen in brez API ključa; uporablja WMO weather kode.
 *
 * TASK 65: parse plasti so ČISTE in FAIL-CLOSED — manjkajoče/napačno tipizirane
 * vrednosti → null (nikoli izmišljenih 0 °C / 0 %). Vir je živ API, zato
 * odgovoru NE zaupamo (vsako polje preverjeno po tipu).
 */

/** Jeznik (Stanje) — vpliva samo na besedilo condition. */
export type WeatherLang = "sl" | "en";

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
 *
 * TASK 66: izvoženo — isti "danes" potrebujeta clampForecastRange in
 * /api/weather (način start/end), da sta klient in vir usklajena.
 */
export function todayISOSI(): string {
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

    // TASK 66: parse zanka IZVLEČENA v čisto parseOpenMeteoDailyRange
    // (isto vedenje — zdaj jo deli fetchDailyForecast in /api/weather).
    return parseOpenMeteoDailyRange(await res.json());
  } catch (error) {
    console.error("[weather] daily forecast napaka:", error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// TASK 65 — ČISTI PARSE PLASTI ZA /api/weather (Go Mode „Na poti", 1.65.0)
// ---------------------------------------------------------------------------
// Odgovor Open-Meteo preverjamo POLJE PO POLJU (vir je zunanja živa storitev):
// napačen tip / manjkajoče polje → null (fail-closed), NIKOLI nadomestna
// vrednost. „precipitation_probability_max" je lahko null v viru — prenesemo
// null (NEZNANO), nikoli 0 %.
// ---------------------------------------------------------------------------

/** Trenutno vreme (odgovor /api/weather — osnovna oblika). */
export interface CurrentWeatherPayload {
  /** Besedilo po WMO kodi v izbranem jeziku. */
  condition: string;
  /** °C (zaokroženo). */
  temp: number;
  /** % (zaokroženo). */
  humidity: number;
  /** km/h (zaokroženo). */
  windSpeed: number;
  /** Emoji ikona po WMO kodi. */
  icon: string;
  /** ISO lokalni čas meritve (current.time) — kdaj je VIR izmeril. */
  observedAt?: string;
}

/** Današnja dnevna napoved (daily[0]) — SAMO realna polja vira. */
export interface TodayOutlookPayload {
  condition: string;
  icon: string;
  /** °C max (zaokroženo). */
  tempMax: number;
  /** % — null, če vir ne vrne vrednosti (NEZNANO ≠ 0 %). */
  precipitationProbabilityMax: number | null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/**
 * Izlušči TRENUTNO vreme iz surovega Open-Meteo odgovora (fail-closed).
 *
 * Preverja: current.{temperature_2m, relative_humidity_2m, wind_speed_10m,
 * weather_code} so števila; current.time (neobvezno) je niz.
 */
export function parseOpenMeteoCurrent(
  raw: unknown,
  lang: WeatherLang
): CurrentWeatherPayload | null {
  if (!isRecord(raw)) return null;
  const current = raw.current;
  if (!isRecord(current)) return null;

  const temp = current.temperature_2m;
  const humidity = current.relative_humidity_2m;
  const windSpeed = current.wind_speed_10m;
  const code = current.weather_code;
  if (
    typeof temp !== "number" ||
    !Number.isFinite(temp) ||
    typeof humidity !== "number" ||
    !Number.isFinite(humidity) ||
    typeof windSpeed !== "number" ||
    !Number.isFinite(windSpeed) ||
    typeof code !== "number" ||
    !Number.isFinite(code)
  ) {
    return null;
  }

  const payload: CurrentWeatherPayload = {
    condition:
      lang === "en" ? weatherCodeToTextEn(code) : weatherCodeToText(code),
    temp: Math.round(temp),
    humidity: Math.round(humidity),
    windSpeed: Math.round(windSpeed),
    icon: weatherCodeToIcon(code),
  };
  const time = current.time;
  if (typeof time === "string" && time.length > 0) {
    payload.observedAt = time;
  }
  return payload;
}

/**
 * Izlušči DANAŠNJO dnevno napoved (daily[0]) iz surovega Open-Meteo
 * odgovora (fail-closed). Zahteva daily.time[0] (datum) — index 0 je DANES
 * (forecast_days=1 / start_date=danes pri klicu iz /api/weather).
 */
export function parseOpenMeteoToday(
  raw: unknown,
  lang: WeatherLang
): TodayOutlookPayload | null {
  if (!isRecord(raw)) return null;
  const daily = raw.daily;
  if (!isRecord(daily)) return null;

  const time = daily.time;
  if (!Array.isArray(time) || time.length === 0) return null;

  const tempMax = daily.temperature_2m_max;
  const code = daily.weather_code;
  if (
    !Array.isArray(tempMax) ||
    typeof tempMax[0] !== "number" ||
    !Number.isFinite(tempMax[0]) ||
    !Array.isArray(code) ||
    typeof code[0] !== "number" ||
    !Number.isFinite(code[0])
  ) {
    return null;
  }

  // Vir lahko vrne null (neznano) — prenesemo null, NIKOLI 0 %.
  const precipArr = daily.precipitation_probability_max;
  const precipRaw = Array.isArray(precipArr) ? precipArr[0] : undefined;
  const precipitationProbabilityMax =
    typeof precipRaw === "number" && Number.isFinite(precipRaw)
      ? Math.round(precipRaw)
      : null;

  return {
    condition:
      lang === "en" ? weatherCodeToTextEn(code[0]) : weatherCodeToText(code[0]),
    icon: weatherCodeToIcon(code[0]),
    tempMax: Math.round(tempMax[0]),
    precipitationProbabilityMax,
  };
}

/**
 * Zgradi URL Open-Meteo forecast klica za /api/weather (ČIST — testirljiv).
 *
 * lat/lng sta ŽE validirana niza (COORD_RE v routes) — neposredno
 * interpolirana (brez encodeURIComponent, ki bi pokvaril minus/decimalno
 * piko — ne-obdelan niz ne more vsebovati ločil URL, ker je prešel COORD_RE).
 *
 * `withDaily`: doda daily blok (weather_code, temperature_2m_max,
 * precipitation_probability_max) + forecast_days=1 (danas) — Go Mode
 * „danes pri naslednji postanki" pogled.
 */
export function openMeteoCurrentUrl(
  lat: string,
  lng: string,
  withDaily: boolean
): string {
  const base = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code`;
  if (!withDaily) return `${base}&timezone=Europe/Ljubljana`;
  return `${base}&daily=weather_code,temperature_2m_max,precipitation_probability_max&forecast_days=1&timezone=Europe/Ljubljana`;
}

// ---------------------------------------------------------------------------
// TASK 66 — DNEVNA NAPOVED PO DNEVIH POTI (MY TRIP, 1.66.0)
// ---------------------------------------------------------------------------
// MY TRIP časovnica potrebuje napoved ZA KONKRETNE DATUME dni potovanja
// (dan prihoda + datumi dogodkov) — ne „i-ti dan od danes". Nova čista plast:
//  - parseOpenMeteoDailyRange: surov odgovor → DailyForecast[] (fail-closed,
//    ENAKA zanka kot prej v fetchDailyForecast — zdaj deljena, en vir resnice)
//  - clampForecastRange: datumsko okno zahteve → realno okno (danes … danes+15)
//  - openMeteoDailyRangeUrl: URL graditelj za klic z start_date/end_date
// ISKRENOST: napoved obstaja SAMO za realno objavljene prihodnje dneve —
// pretekli dnevi in dnevi čez horizont (~16 dni) se ISKRENO izpustijo
// (prazni presek → null → prazna napoved, NIKOLI izmišljenih dni).
// ---------------------------------------------------------------------------

/**
 * Izlušči DNEVNO napoved (celoten daily blok) iz surovega Open-Meteo
 * odgovora (fail-closed). Zanka je SEMANTIČNO IDENTIČNA prejšnji inline
 * logiki fetchDailyForecast (izvlečena v TASK 66 — en vir resnice):
 * manjkajoča temperatura/koda dneva → dan se preskoči (raje manj dni kot
 * napačni); prazen rezultat → null (vir ni vrnil NIČ uporabnega).
 */
export function parseOpenMeteoDailyRange(raw: unknown): DailyForecast[] | null {
  if (!isRecord(raw)) return null;
  const daily = raw.daily;
  if (!isRecord(daily)) return null;

  const time = daily.time;
  if (!Array.isArray(time) || time.length === 0) return null;

  const tempMax = daily.temperature_2m_max;
  const code = daily.weather_code;
  const precip = daily.precipitation_probability_max;

  const out: DailyForecast[] = [];
  for (let i = 0; i < time.length; i++) {
    const t = Array.isArray(tempMax) ? tempMax[i] : undefined;
    const c = Array.isArray(code) ? code[i] : undefined;
    // Manjkajoče temperature/kode preskočimo — raje manj dni kot napačni
    if (typeof t !== "number" || typeof c !== "number") continue;
    out.push({
      date: time[i],
      weatherCode: c,
      tempMax: t,
      precipitationProbabilityMax:
        (Array.isArray(precip) ? precip[i] : undefined) ?? null,
    });
  }
  return out.length > 0 ? out : null;
}

/** Zadnji realno prognozni dan = danes + 15 (horizont vira ~16 dni vključno). */
export const FORECAST_HORIZON_OFFSET_DAYS = 15;

function isoOfMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Zahtevano datumsko okno [start, end] → realno okno napovedi (ČISTO —
 * „danes" je parameter, ne ura sistema → testirljivo brez časa).
 *
 * - start < danes → start se poravna na DANES (napoved za preteklost ne
 *   obstaja — arhiv je drugačen produkt vira);
 * - end > danes+15 → end se poreže na horizont (vir ne objavi več);
 * - prazen presek (vse preteklo ali vse čez horizont) → null → iskrena
 *   PRAZNA napoved (dnevi obstajajo, njihova realna napoved pa NE).
 */
export function clampForecastRange(
  start: string,
  end: string,
  today: string
): { start: string; end: string } | null {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    !Number.isFinite(todayMs)
  ) {
    return null;
  }
  const effStartMs = Math.max(startMs, todayMs);
  const effEndMs = Math.min(
    endMs,
    todayMs + FORECAST_HORIZON_OFFSET_DAYS * 86_400_000
  );
  if (effStartMs > effEndMs) return null;
  return { start: isoOfMs(effStartMs), end: isoOfMs(effEndMs) };
}

/**
 * Zgradi URL Open-Meteo DNEVNE napovedi za datumsko okno (ČIST — testirljiv).
 *
 * lat/lng sta ŽE validirana niza (COORD_RE v routes) — interpolirana
 * neposredno (enak kanon kot openMeteoCurrentUrl). start/end sta ŽE
 * validirana ISO datuma (ISO_DATE_RE v routes) — brez ločil URL možnih.
 * timezone=Europe/Ljubljana: datume vira dobimo v SI pasu (enako kot
 * todayISOSI merjenje horizonta).
 */
export function openMeteoDailyRangeUrl(
  lat: string,
  lng: string,
  startDate: string,
  endDate: string
): string {
  return `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weather_code,temperature_2m_max,precipitation_probability_max&start_date=${startDate}&end_date=${endDate}&timezone=Europe/Ljubljana`;
}
