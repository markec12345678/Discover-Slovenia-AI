// ============================================================================
// TASK 66 — MY TRIP VREME PO DNEVIH: čista klient plast (1.66.0)
// ============================================================================
// Iz potovanja in MY TRIP pogleda izpelje (1) GEO SIDRO vremena (koordinate
// destinacije — tam potovanje POTEKA), (2) DATUME dni z realnim datumom in
// (3) datumsko okno zahtevane napovede; striktno validira odgovor
// /api/weather?start=..&end=.. (NAČIN B, TASK 66). ČISTO — 0 omrežja, 0 db,
// 0 localStorage (fetch živi v komponenti) — testirljivo brez brskalnika.
//
// ISKRENOST (isti kanon kot go-weather §TASK 65):
//  - Vreme prikažemo SAMO za dneve Z realnim datumom (datum prihoda /
//    datumi dogodkov IZ virov) — dan brez datuma nima napovedi.
//  - Sidro je GEO DESTINACIJE (središče potovanja), ne GPS uporabnika —
//    MY TRIP je načrtovalni pogled, ne živa navigacija (to je Go Mode).
//    Destinacija brez geo → vreme preprosto NI (iskrena odsotnost).
//  - Odgovor API-ja validiramo POLJE PO POLJU — neveljaven vnos dneva se
//    IZPUSTI (raje manj dni kot napačni); manjkajoč forecast → null →
//    iskrena opomba (nikoli praznih števil).
//  - Dan brez vnosa v napovedi (pretekli ali čez ~16-dnevni horizont vira)
//    → BREZ čipa — NE izmišljujemo niti „vreme neznano" dneva.
//  - Padavine null v viru → del čipa se izpusti (NEZNANO ≠ 0 %).
//  - Vir je izrecno naveden (Open-Meteo).
// ============================================================================

import type { TravelJourney } from "./types";
import type { MyTripView } from "./trip-view";

// ---------------------------------------------------------------------------
// GEO SIDRO (kje se potovanje dogaja?)
// ---------------------------------------------------------------------------

/** Geo sidro vremena — koordinate DESTINACIJE potovanja. */
export interface TripWeatherAnchor {
  lat: number;
  lng: number;
}

/**
 * Iz potovanja izpelje geo sidro vremena: koordinate destinacije (vir:
 * „destinations" — orkestrator jih vedno izpelje iz DESTINATIONS).
 * Brez geo na destinaciji ali neveljavni števili → null (vreme se NE
 * prikaže — iskrena odsotnost, isti kanon kot goWeatherTarget).
 */
export function tripWeatherAnchor(
  journey: TravelJourney
): TripWeatherAnchor | null {
  const lat = journey.destination.lat;
  const lng = journey.destination.lng;
  if (lat == null || lng == null) return null;
  if (
    typeof lat !== "number" ||
    !Number.isFinite(lat) ||
    typeof lng !== "number" ||
    !Number.isFinite(lng)
  ) {
    return null;
  }
  return { lat, lng };
}

// ---------------------------------------------------------------------------
// DATUMI DNI (kdaj se potovanje dogaja?)
// ---------------------------------------------------------------------------

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Iz MY TRIP pogleda izlušči VSE unikatne ISO datume dni (naraščajoče).
 * Upošteva SAMO dneve z realnim datumom (dan prihoda iz vpisa uporabnika,
 * dogodki IZ virov) — dan brez datuma („Datum prihoda ni vnesen") nima
 * napovedi. Brez datuma / vsi neveljavni → null (vreme se NE zahteva).
 */
export function tripWeatherDates(trip: MyTripView): string[] | null {
  const dates: string[] = [];
  for (const day of trip.days) {
    if (!day.date || !ISO_DATE_RE.test(day.date)) continue;
    if (!dates.includes(day.date)) dates.push(day.date);
  }
  if (dates.length === 0) return null;
  dates.sort();
  return dates;
}

/**
 * Iz datumov dni zgradi datumsko okno zahteve [start, end] (min … max).
 * Datumi so že validirani ISO (tripWeatherDates); vrstni red vhoda je
 * poljuben — okno se izračuna po VREDNOSTIH (sortirana kopija, vhod se
 * ne mutira). Prazen seznam → null (klica ni — komponenta ne išče vremena).
 */
export function tripWeatherRange(
  dates: ReadonlyArray<string>
): { start: string; end: string } | null {
  if (dates.length === 0) return null;
  const sorted = [...dates].sort();
  return { start: sorted[0], end: sorted[sorted.length - 1] };
}

// ---------------------------------------------------------------------------
// VALIDACIJA ODGOVORA /api/weather?start&end (striktna — fail-closed)
// ---------------------------------------------------------------------------

/** Napoved enega dneva (odgovor /api/weather način B — forecast[]). */
export interface TripWeatherDay {
  /** ISO datum (YYYY-MM-DD). */
  date: string;
  /** Besedilo po WMO kodi v izbranem jeziku. */
  condition: string;
  /** Emoji ikona po WMO kodi. */
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
 * Striktna validacija JSON odgovora /api/weather?…&start=..&end=..
 * (NAČIN B — { forecast: [...] }).
 *
 * - `forecast` manjka ali ni tabela → null (odgovor NEVELJAVEN — klient
 *   pokaže „vreme trenutno ni na voljo");
 * - posamezen vnos dneva neveljaven (datum/koda/število/tip) → vnos se
 *   IZPUSTI (raje manj dni kot napačni — isti kanon kot parse plasti);
 * - PRAZNA tabela → [] (VELJAVEN odgovor: vir za te datume še ni objavil
 *   napovedi — iskrena odsotnost, NE napaka).
 */
export function parseTripWeatherResponse(json: unknown): TripWeatherDay[] | null {
  if (!isRecord(json)) return null;
  const forecast = json.forecast;
  if (!Array.isArray(forecast)) return null;

  const out: TripWeatherDay[] = [];
  for (const item of forecast) {
    if (!isRecord(item)) continue;
    const date = item.date;
    const condition = item.condition;
    const icon = item.icon;
    const tempMax = item.tempMax;
    const precip = item.precipitationProbabilityMax;
    if (
      typeof date !== "string" ||
      !ISO_DATE_RE.test(date) ||
      typeof condition !== "string" ||
      condition.length === 0 ||
      typeof icon !== "string" ||
      icon.length === 0 ||
      typeof tempMax !== "number" ||
      !Number.isFinite(tempMax) ||
      !(precip === null || (typeof precip === "number" && Number.isFinite(precip)))
    ) {
      continue; // neveljaven dan → izpuščen
    }
    out.push({
      date,
      condition,
      icon,
      tempMax,
      precipitationProbabilityMax: precip,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// UI OZNAKE (L vzorec — dvojezične, ISKRENE)
// ---------------------------------------------------------------------------

export const TRIP_WEATHER_LABELS = {
  /** Čip dneva — „do 26 °C · padavine 10 %". */
  day: {
    sl: (d: TripWeatherDay) =>
      d.precipitationProbabilityMax != null
        ? `do ${d.tempMax} °C · padavine ${d.precipitationProbabilityMax} %`
        : `do ${d.tempMax} °C`,
    en: (d: TripWeatherDay) =>
      d.precipitationProbabilityMax != null
        ? `up to ${d.tempMax} °C · rain ${d.precipitationProbabilityMax} %`
        : `up to ${d.tempMax} °C`,
  },
  /** Vir (label izrecno — isti kanon kot Go Mode / zemljevid). */
  source: { sl: "vir: Open-Meteo", en: "source: Open-Meteo" },
  /** Izpad vira — časovnica poti dela naprej (iskrena opomba). */
  unavailable: {
    sl: "Vreme trenutno ni na voljo — načrt potovanja deluje nespremenjeno.",
    en: "Weather is not available right now — the trip plan keeps working.",
  },
  /** Dnevi obstajajo, njihova realna napoved pa NE (preteklost/čez horizont). */
  notPublished: {
    sl: "Vreme za dneve tega potovanja ni na voljo — Open-Meteo objavlja napoved le za prihodnje dneve (do ~16 dni vnaprej).",
    en: "Weather for this trip's days is not available — Open-Meteo publishes forecasts for future days only (up to ~16 days ahead).",
  },
} as const;
