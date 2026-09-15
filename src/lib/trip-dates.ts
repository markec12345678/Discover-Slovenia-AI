// ============================================================================
// FW4.2 — TRIP DATES: datumski vidik potovanja (čiste funkcije)
// ============================================================================
//
// Datum odhoda v plannerju poganja:
//   - datumski okvir events match (events-match.ts — dogodki, ki se zgodijo
//     MED tvojim obiskom, pridejo prvi)
//   - AI prompt kontekst ("Datum potovanja: 12.–14. septembra 2026")
//   - prikaz datumskega obsega v glavi rezultata + datum na vsakem dnevu
//   - "Dodaj v mojo pot" dogodki se preslikajo na konkretne dneve poti
//
// NAČELO (isto kot itinerary-quality.ts): VSE funkcije so čiste in
// deterministične — isto obnašanje na serverju (API) in clientu (UI).
// Datumi se parsajo kot LOKALNA polnoč (ne UTC) — "dan" je koledarski dan.
//
// Slovenske oblike mesecev: rodilnik (genitiv — "14. septembra") in
// orodnik (instrumental — "med 12. in 14. septembrom").

const DAY_MS = 86_400_000;
/** Koliko dni v prihodnost sme biti datum odhoda (prognoza + dogodki ~1 leto). */
export const MAX_START_AHEAD_DAYS = 400;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Meseci v rodilniku (genitiv): "14. septembra 2026"
const MONTHS_GENITIVE = [
  "januarja",
  "februarja",
  "marca",
  "aprilija",
  "maja",
  "junija",
  "julija",
  "avgusta",
  "septembra",
  "oktobra",
  "novembra",
  "decembra",
];

// Meseci v orodniku (instrumental): "med 12. in 14. septembrom"
const MONTHS_INSTRUMENTAL = [
  "januarjem",
  "februarjem",
  "marcem",
  "aprilom",
  "majem",
  "junijem",
  "julijem",
  "avgustom",
  "septembrom",
  "oktobrom",
  "novembrom",
  "decembrom",
];

// Dnevi v tednu (getDay(): nedelja = 0)
const WEEKDAYS = [
  "nedelja",
  "ponedeljek",
  "torek",
  "sreda",
  "četrtek",
  "petek",
  "sobota",
];

/** Današnji dan ob 00:00 lokalnega časa (ms). */
function startOfToday(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

/** ISO datum (YYYY-MM-DD) → ms lokalne polnoči; null za neveljavno. */
export function parseISODateLocal(value: unknown): number | null {
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  // Mesec/dan 1-based; Date tolance za npr. 2026-02-31 (roll-over) zavrnemo
  const dt = new Date(y, m - 1, d);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== m - 1 ||
    dt.getDate() !== d
  ) {
    return null;
  }
  return dt.getTime();
}

/** ms lokalne polnoči → ISO datum (YYYY-MM-DD); null za neveljavno. */
function toISODate(ms: number): string | null {
  if (!Number.isFinite(ms)) return null;
  const dt = new Date(ms);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

/**
 * Veljaven datum odhoda: ISO format, ni v preteklosti (danes OK),
 * največ MAX_START_AHEAD_Dni naprej.
 */
export function isValidStartDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) return false;
  const ms = parseISODateLocal(value);
  if (ms === null) return false;
  const today = startOfToday();
  return ms >= today && ms <= today + MAX_START_AHEAD_DAYS * DAY_MS;
}

/** Datum ZADNJEGA dneva potovanja (dan 1 = startDate). */
export function tripEndDateISO(
  startDate: string,
  days: number
): string | null {
  const startMs = parseISODateLocal(startDate);
  if (startMs === null || !Number.isFinite(days) || days < 1) return null;
  return toISODate(startMs + (days - 1) * DAY_MS);
}

/** Okvir potovanja v ms (za events match); null, če start ni veljaven ISO. */
export function tripWindowMs(
  startDate: string | null | undefined,
  days: number
): { startMs: number; endMs: number } | null {
  const startMs = parseISODateLocal(startDate);
  if (startMs === null || !Number.isFinite(days) || days < 1) return null;
  return { startMs, endMs: startMs + (days - 1) * DAY_MS };
}

/** ISO datum N-tega dneva potovanja (dan 1 = startDate); null če neveljavno. */
export function dayISOForDayNumber(
  startDate: string,
  dayNumber: number
): string | null {
  const startMs = parseISODateLocal(startDate);
  if (startMs === null || !Number.isFinite(dayNumber) || dayNumber < 1) {
    return null;
  }
  return toISODate(startMs + (dayNumber - 1) * DAY_MS);
}

/** Ali se dogodek (start–end) prekriva z okvirom potovanja. */
export function eventOverlapsTrip(
  eventDate: string,
  eventEndDate: string | undefined,
  tripStartDate: string,
  tripEndDate: string
): boolean {
  const evStart = parseISODateLocal(eventDate);
  if (evStart === null) return false;
  const evEnd = parseISODateLocal(eventEndDate) ?? evStart;
  const tStart = parseISODateLocal(tripStartDate);
  if (tStart === null) return false;
  const tEnd = parseISODateLocal(tripEndDate) ?? tStart;
  return evStart <= tEnd && evEnd >= tStart;
}

// ---------------------------------------------------------------------------
// Slovensko formatiranje (rodilnik + orodnik)
// ---------------------------------------------------------------------------

interface DateParts {
  day: number;
  month: number; // 1-12
  year: number;
}

function parts(ms: number): DateParts {
  const dt = new Date(ms);
  return { day: dt.getDate(), month: dt.getMonth() + 1, year: dt.getFullYear() };
}

/**
 * Datumska obsega v rodilniku: "12.–14. septembra 2026",
 * "28. septembra – 2. oktobra 2026", "12. septembra 2026" (en dan).
 */
export function formatDateRangeSI(
  startDate: string,
  endDate?: string
): string {
  const s = parseISODateLocal(startDate);
  const e = endDate ? parseISODateLocal(endDate) : null;
  if (s === null) return startDate; // defenzivno — vrši surovo vrednost
  const sp = parts(s);

  if (e === null || e === s) {
    return `${sp.day}. ${MONTHS_GENITIVE[sp.month - 1]} ${sp.year}`;
  }
  const ep = parts(e);

  if (sp.year === ep.year && sp.month === ep.month) {
    return `${sp.day}.–${ep.day}. ${MONTHS_GENITIVE[sp.month - 1]} ${sp.year}`;
  }
  if (sp.year === ep.year) {
    return `${sp.day}. ${MONTHS_GENITIVE[sp.month - 1]} – ${ep.day}. ${MONTHS_GENITIVE[ep.month - 1]} ${sp.year}`;
  }
  return `${sp.day}. ${MONTHS_GENITIVE[sp.month - 1]} ${sp.year} – ${ep.day}. ${MONTHS_GENITIVE[ep.month - 1]} ${ep.year}`;
}

/**
 * Obsega v orodniku za "med X in Y": "med 12. in 14. septembrom 2026",
 * "med 28. septembrom in 2. oktobrom 2026"; en dan → "12. septembra 2026".
 */
export function tripDuringPhraseSI(
  startDate: string,
  endDate?: string
): string {
  const s = parseISODateLocal(startDate);
  const e = endDate ? parseISODateLocal(endDate) : null;
  if (s === null) return startDate;
  const sp = parts(s);

  if (e === null || e === s) {
    return `${sp.day}. ${MONTHS_GENITIVE[sp.month - 1]} ${sp.year}`;
  }
  const ep = parts(e);

  if (sp.year === ep.year && sp.month === ep.month) {
    return `med ${sp.day}. in ${ep.day}. ${MONTHS_INSTRUMENTAL[sp.month - 1]} ${sp.year}`;
  }
  if (sp.year === ep.year) {
    return `med ${sp.day}. ${MONTHS_INSTRUMENTAL[sp.month - 1]} in ${ep.day}. ${MONTHS_INSTRUMENTAL[ep.month - 1]} ${sp.year}`;
  }
  return `med ${sp.day}. ${MONTHS_INSTRUMENTAL[sp.month - 1]} ${sp.year} in ${ep.day}. ${MONTHS_INSTRUMENTAL[ep.month - 1]} ${ep.year}`;
}

/** Oznaka dneva za kartico dneva: "torek, 14. septembra". */
export function formatDayLabelSI(isoDate: string): string {
  const ms = parseISODateLocal(isoDate);
  if (ms === null) return isoDate;
  const dt = new Date(ms);
  const p = parts(ms);
  return `${WEEKDAYS[dt.getDay()]}, ${p.day}. ${MONTHS_GENITIVE[p.month - 1]}`;
}
