// ============================================================================
// TASK 88 — ŽIVO VREME V DNEVNIH KARTICAH ITINERARJA: čisti sloj (1.79.0)
// ============================================================================
//
// TripTimeline (rezultati načrtovalnika) in SharedTrip (/pot/[shareId]) do
// zdaj prikazujeta SAMO statični posnetek `day.weather` iz časa GENERIRANJA
// ( lahno zastarel za več dni/ tednov). Ta sloj pripravi tiste čiste
// vhode, iz katerih komponenta zahteva ŽIVO dnevno napoved prek obstoječega
// /api/weather?start=..&end=.. (NAČIN B, TASK 66 — Open-Meteo, brez ključa,
// 15-min strežniški cache). Enak kanon kot src/lib/journey/trip-weather.ts
// ( MY TRIP), prilagojen itinerarju:
//
//   MY TRIP  : 1 sidro (destinacija potovanja) × datumov dogodkov.
//   ITINERAR : sidro PO DNEVU — prvi postanek dneva določi vreme tega dne
//              ( Ljubljana dan 1, Bled dan 2, Piran dan 3 → 3 različni
//              napovedi). Enaka sidra se združijo v ENO zahtevo (dedupe);
//              več kot MAX sidler → zloži na PRVO sidro (glavna regija).
//
// ISKRENOST (isti kanon kot trip-weather §TASK 66):
//  - Dan BREZ realnega datuma (ni tripStartDate) nima napovedi — vreme se
//    ne zahteva NITI prikaže (iskrena odsotnost).
//  - Dan BREZ rešljivih koordinat (postanki brez geo) nima čipa (vreme ni
//    „povsod enako" — ne izmišljujemo regionalne napovedi iz nič).
//  - Neveljavne koordinate (NaN/neskončnost/izven Zemlje) se zavrnejo.
//  - Datumsko okno [start..end] je min..max datumov skupine — preklop na
//    zimski čas je varen (dayISOForDayNumber je koledarski, TASK 79).
//
// ČISTO — 0 omrežja, 0 db, 0 localStorage (fetch živi v komponenti) —
// testirljivo brez brskalnika.
// ============================================================================

import { DESTINATIONS } from "./slovenia-data";
import {
  dayISOForDayNumber,
  formatDayLabelSI,
  parseISODateLocal,
} from "./trip-dates";
import type { TripWeatherDay } from "./journey/trip-weather";
import type { DayPlan, LocationVisit } from "./types";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Koliko RAZLIČNIH dnevnih sider naj komponenta največ zahteva
 *  ( vsako svoj klic /api/weather). Prek — zloži na prvo sidro
 *  (glavna regija potovanja). Slovenija je majhna: redki itinerarji
 *  imajo več regijskih jeder kot to. */
export const ITINERARY_WEATHER_MAX_ANCHORS = 4;

// ---------------------------------------------------------------------------
// SIDRO DNEVA (kje se ta dan potovanje dogaja?)
// ---------------------------------------------------------------------------

/** Veljavne koordinate (končni števili znotraj Zemlje) ali null. */
function finiteCoords(
  lat: unknown,
  lng: unknown
): { lat: number; lng: number } | null {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  // Null island (0,0) — isto vrata kot glob-povezava/supply: podatek, ne
  // lokacija (Open-Meteo bi vrnil oceansko napoved sredi Gvinejskega zaliva).
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

/**
 * Koordinate postanka: NAJPREJ lastne (visit.lat/lng — npr. AI obogatitev
 * ali zemljevid), sicer po destination_id iz DESTINATIONS (statični vir
 * resnice, validiran enako — fail-closed). Brez obeh → null.
 */
export function resolveVisitCoords(
  visit: LocationVisit
): { lat: number; lng: number } | null {
  const own = finiteCoords(visit.lat, visit.lng);
  if (own) return own;
  const destination = DESTINATIONS.find((d) => d.id === visit.destination_id);
  if (!destination) return null;
  return finiteCoords(destination.coords?.lat, destination.coords?.lng);
}

/** Sidro dneva = koordinate PRVEGA postanka z rešljivimi koordinatami. */
function dayAnchor(
  day: DayPlan
): { lat: number; lng: number; key: string } | null {
  for (const visit of day.locations) {
    const coords = resolveVisitCoords(visit);
    if (coords) {
      return {
        ...coords,
        // Ključ dedupe: 3 decimalke ≈ 100 m — isti kraj tudi ob rahlo
        // drugačnih koordinatah vira (AI izpis vs. statični podatki).
        key: `${coords.lat.toFixed(3)},${coords.lng.toFixed(3)}`,
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// NAČRT ZAHTEV (katere klice /api/weather naj komponenta izvede?)
// ---------------------------------------------------------------------------

/** Ena zahteva /api/weather: eno geo sidro + datumsko okno min..max. */
export interface ItineraryWeatherGroup {
  lat: number;
  lng: number;
  /** ISO datum (YYYY-MM-DD) — prvi dan skupine v napovedi. */
  start: string;
  /** ISO datum (YYYY-MM-DD) — zadnji dan skupine v napovedi. */
  end: string;
  /** Številke dni (naraščajoče), ki pripadajo temu sidru. */
  dayNumbers: number[];
}

export interface ItineraryWeatherPlan {
  /** Dan (številka) → ISO datum; SAMO dnevi z realnim datumom. */
  dayDates: Map<number, string>;
  /** Skupine zahtev (dedupe po sidru, cap ITINERARY_WEATHER_MAX_ANCHORS). */
  groups: ItineraryWeatherGroup[];
}

/**
 * Iz dni itinerarja in datuma odhoda zgradi načrt zahtev žive napovede:
 * dan → (datum, sidro prvega geo-postanka) → skupine po sidru. Klic :
 *  - brez veljavnega tripStartDate → null (vreme se NE zahteva);
 *  - brez ENEGA samega rešljivega sidra → null (iskrena odsotnost);
 *  - več unikatnih sider kot MAX → vsi dnevi na PRVO sidro (glavna regija).
 */
export function itineraryWeatherPlan(
  days: ReadonlyArray<DayPlan>,
  tripStartDate: string | null | undefined
): ItineraryWeatherPlan | null {
  if (typeof tripStartDate !== "string" || !ISO_DATE_RE.test(tripStartDate)) {
    return null;
  }

  const dayDates = new Map<number, string>();
  const dayAnchors = new Map<
    number,
    { lat: number; lng: number; key: string }
  >();
  let primary: { lat: number; lng: number; key: string } | null = null;

  for (const day of days) {
    const iso = dayISOForDayNumber(tripStartDate, day.day);
    if (!iso) continue;
    dayDates.set(day.day, iso);
    const anchor = dayAnchor(day);
    if (!anchor) continue;
    if (primary === null) primary = anchor;
    dayAnchors.set(day.day, anchor);
  }

  if (dayDates.size === 0) return null;
  if (primary === null) return null;

  // Cap: preveč regijskih jeder → enotno prvo sidro (glavna regija).
  if (new Set([...dayAnchors.values()].map((a) => a.key)).size > ITINERARY_WEATHER_MAX_ANCHORS) {
    for (const dayNumber of dayDates.keys()) {
      dayAnchors.set(dayNumber, primary);
    }
  }

  const grouped = new Map<
    string,
    { lat: number; lng: number; dates: Set<string>; dayNumbers: number[] }
  >();
  for (const [dayNumber, anchor] of dayAnchors) {
    let group = grouped.get(anchor.key);
    if (!group) {
      group = { lat: anchor.lat, lng: anchor.lng, dates: new Set(), dayNumbers: [] };
      grouped.set(anchor.key, group);
    }
    group.dates.add(dayDates.get(dayNumber)!);
    group.dayNumbers.push(dayNumber);
  }

  return {
    dayDates,
    groups: [...grouped.values()].map((g) => {
      const sorted = [...g.dates].sort();
      return {
        lat: g.lat,
        lng: g.lng,
        start: sorted[0],
        end: sorted[sorted.length - 1],
        dayNumbers: [...g.dayNumbers].sort((a, b) => a - b),
      };
    }),
  };
}

/**
 * Ključ trenutne zahteve (za varovalko zastarelosti v komponenti):
 * drugačen načrt ali jezik → odgovor NI več aktualen → brez čipov.
 * Brez načrta → null.
 */
export function itineraryWeatherRequestKey(
  plan: ItineraryWeatherPlan | null,
  lang: "sl" | "en"
): string | null {
  if (!plan) return null;
  return `${lang}|${plan.groups
    .map(
      (g) =>
        `${g.lat.toFixed(4)},${g.lng.toFixed(4)},${g.start},${g.end}`
    )
    .join(";")}`;
}

// ---------------------------------------------------------------------------
// PRESLIKAVA ODGOVOROV NA DNEVE (čisto — srce komponente, testirljivo)
// ---------------------------------------------------------------------------

/**
 * Rezultate zahtev (po VRSTNEM REDU plan.groups — null = odpadla skupina)
 * preslika v čipe po dnevih: dan → napoved, KIJOČA se z datumom dneva v
 * napovedi te skupine. Odpadla skupina / dan brez ujemanja → dan ostane
 * brez čipa (iskrena odsotnost — nikoli izmišljene vrednosti).
 */
export function applyForecastToDays(
  plan: ItineraryWeatherPlan,
  forecasts: ReadonlyArray<ReadonlyArray<TripWeatherDay> | null>
): Map<number, TripWeatherDay> {
  const byDay = new Map<number, TripWeatherDay>();
  forecasts.forEach((forecast, i) => {
    if (!forecast) return;
    const group = plan.groups[i];
    if (!group) return;
    const byDate = new Map(forecast.map((f) => [f.date, f] as const));
    for (const dayNumber of group.dayNumbers) {
      const date = plan.dayDates.get(dayNumber);
      const entry = date ? byDate.get(date) : undefined;
      if (entry) byDay.set(dayNumber, entry);
    }
  });
  return byDay;
}

// ---------------------------------------------------------------------------
// OZNAKA DNEVA (lokalizirana — brez i18n fragmentov, čisto + testirljivo)
// ---------------------------------------------------------------------------

const EN_WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const EN_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Oznaka dneva za glavo kartice dneva: sl → „torek, 14. septembra"
 * (formatDayLabelSI), en → „Tuesday, 14 September". Neveljaven datum →
 * surova vrednost (defenzivno, isti kanon kot trip-dates).
 */
export function formatDayLabel(isoDate: string, lang: "sl" | "en"): string {
  if (lang === "sl") return formatDayLabelSI(isoDate);
  const ms = parseISODateLocal(isoDate);
  if (ms === null) return isoDate;
  const dt = new Date(ms);
  return `${EN_WEEKDAYS[dt.getDay()]}, ${dt.getDate()} ${EN_MONTHS[dt.getMonth()]}`;
}
