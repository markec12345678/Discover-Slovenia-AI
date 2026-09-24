// ============================================================================
// ODPIRALNI ČASI — STATUS OPEN/CLOSED/UNKNOWN (Issue #4 §9, implementacijski
// val 1, 2026-09-24)
// ============================================================================
// NAMEN: iz SUROVEGA niza odpiralnih ur (OSM `opening_hours`, FSQ `hours`,
// Listing.openingHours) izračunati POŠTEN status ob trenutku "zdaj":
//
//   OPEN    — zapis se da pošteno razbrati in vir je (po zapisu) odprt
//   CLOSED  — zapis se da pošteno razbrati in vir je (po zapisu) zaprt
//   UNKNOWN — znamo povedati le, da NE VEMO:
//               · vir ur sploh ne objavi (manjkajoč niz)
//               · zapis uporablja sintakso, ki je NE podpiramo pošteno
//                 (PH/prazniki, sunrise/sunset, mesečna obdobja, [pogoji],
//                 odprti konci "08:00+" …) — DELNO razbiranje bi lahko
//                 izreklo NAPAČEN CLOSED, zato fail-closed v UNKNOWN.
//
// ČISTA funkcija (client + server). OSM sintaksa je po specifikaciji
// "zlogovno zapletena" (go-view.ts:12) — ta parser pokriva SAMO preprosto
// podmnožico, ki pokriva večino realnih nizov v Sloveniji:
//   "Mo-Fr 08:00-17:00; Sa 09:00-13:00; Su off"
//   "Mo,Tu,We 08:00-12:00,14:00-18:00"
//   "Mo-Fr 10:00-02:00"            ← čez noč (konec < začetek)
//   "08:00-17:00"                  ← brez dni = vsak dan
//   "24/7"
//   "Su off" / "Su closed"
// VSE ostalo (PH, SH, Jan–Mar, "Sa[1]", "08:00+", sunrise …) → UNKNOWN.
//
// ČASOVNI PAS: pravila odpiralnih ur so PO DEFINICIJI stenska ura kraja
// (Slovenija = Europe/Ljubljana). Primerjava STENSKE ure "zdaj" proti
// STENSKIM pravilom je DST-varna PO SEMANTIKI (ob preklopu DST se primerna
// stenska ura premakne skupaj s pravili) — nobenega datumskega računanja
// čez cone ne potrebujemo. `nowInSlovenia()` dobi stensko uro iz
// Intl.DateTimeFormat (deluje na clientu in serverju, brez date-fns-tz).
// ============================================================================

/** Dan v tednu po JS konvenciji: 0 = nedelja … 6 = sobota. */
export interface OpeningMoment {
  weekday: number;
  /** Minute od polnoči (0–1439), stenska ura. */
  minutes: number;
}

export type OpeningStatus = "OPEN" | "CLOSED" | "UNKNOWN";

export interface OpeningStatusResult {
  status: OpeningStatus;
  /**
   * Podrobnost statusa (dvojezično SL/EN):
   *  OPEN    → "odprto do 17:00" / "24/7"
   *  CLOSED  → "zaprto · odpre pon 08:00"
   *  UNKNOWN → razlog neznanja (ni objavljeno / zapleten zapis)
   */
  detail: { sl: string; en: string };
  /** Surov niz vira (echo — za prikaz poleg statusa, nič ne izgubimo). */
  raw?: string;
}

// ── Preslikava OSM kod dneva → JS dan (0 = nedelja) ───────────────────────

const WEEKDAY_CODES: Record<string, number> = {
  su: 0,
  mo: 1,
  tu: 2,
  we: 3,
  th: 4,
  fr: 5,
  sa: 6,
};

/** Kratek dan za podrobnost (SL/EN), indeks = JS dan (0 = nedelja). */
const DAY_SHORT: { sl: string; en: string }[] = [
  { sl: "ned", en: "Sun" },
  { sl: "pon", en: "Mon" },
  { sl: "tor", en: "Tue" },
  { sl: "sre", en: "Wed" },
  { sl: "čet", en: "Thu" },
  { sl: "pet", en: "Fri" },
  { sl: "sob", en: "Sat" },
];

// ── Notranji model parsanega zapisa ───────────────────────────────────────

interface ParsedRange {
  /** Začetek v minutah (vključno). */
  start: number;
  /** Konec v minutih (izključno; 1440 = 24:00). */
  end: number;
  /** Konec < začetek → obseg čez polnoč (odprt še naslednji dan). */
  overnight: boolean;
}

interface ParsedRule {
  days: number[];
  /** true = "off"/"closed" za te dne (cel dan zaprto). */
  closed?: boolean;
  ranges: ParsedRange[];
}

interface ParsedHours {
  alwaysOpen: boolean;
  rules: ParsedRule[];
}

// ── Parser (samo preprosta podmnožica; vse ostalo → null = UNKNOWN) ───────

const TIME_RE = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/;

function parseTimeRange(token: string): ParsedRange | null {
  const m = TIME_RE.exec(token);
  if (!m) return null;
  const sh = parseInt(m[1], 10);
  const sm = parseInt(m[2], 10);
  const eh = parseInt(m[3], 10);
  const em = parseInt(m[4], 10);
  // Ure: začetek 0–23; konec dovoljujemo tudi 24:00 (= 1440, "do polnoči").
  // Minute 0–59. Vse ostalo (vključno "24:01") je neveljavno → UNKNOWN.
  if (sh > 23 || eh > 24 || sm > 59 || em > 59) return null;
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  // "08:00-08:00" ni smiseln zapis → ne razbiramo (država rangea = 0 ali
  // 24 h glede na interpretacijo) — honest UNKNOWN namesto ugibanja.
  if (start === end) return null;
  const overnight = end < start;
  return { start, end, overnight };
}

/** "mo" | "mo-fr" → niz dni (razpon se zavrti čez nedeljo, npr. "sa-su"). */
function parseDayPart(part: string): number[] | null {
  const range = /^([a-z]{2})-([a-z]{2})$/i.exec(part);
  if (range) {
    const from = WEEKDAY_CODES[range[1].toLowerCase()];
    const to = WEEKDAY_CODES[range[2].toLowerCase()];
    if (from == null || to == null) return null;
    const days: number[] = [];
    let d = from;
    for (let i = 0; i < 7; i += 1) {
      days.push(d);
      if (d === to) break;
      d = (d + 1) % 7;
    }
    // Razpon, ki ne doseže konca v 7 korakih, ne obstaja (defenzivno).
    if (days[days.length - 1] !== to) return null;
    return days;
  }
  const single = WEEKDAY_CODES[part.toLowerCase()];
  return single == null ? null : [single];
}

/** Določnik dni na začetku pravila ("mo-fr", "mo,tu", "sa") ali null,
 *  če prvi žeton NI določnik dni (potem je to časovni del). */
function parseDaySpec(token: string): number[] | null {
  if (!/^[a-z]{2}(-[a-z]{2})?(,[a-z]{2}(-[a-z]{2})?)*$/i.test(token)) {
    return null;
  }
  const days = new Set<number>();
  for (const part of token.split(",")) {
    const parsed = parseDayPart(part);
    if (!parsed) return null;
    parsed.forEach((d) => days.add(d));
  }
  return [...days];
}

/**
 * Parsira niz odpiralnih ur. Vrne null, ko zapis NE pripada preprosti
 * podmnožici (→ klicalec izreče UNKNOWN — nikoli delne resnice).
 */
export function parseOpeningHours(raw: string): ParsedHours | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^24\/7$/i.test(trimmed)) return { alwaysOpen: true, rules: [] };

  const rules: ParsedRule[] = [];
  for (const chunk of trimmed.split(";")) {
    const rule = chunk.trim();
    if (!rule) continue;
    // Presledkovni žetoni (OSM dovoljuje tudi več presledkov).
    const tokens = rule.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;

    // Prvi žeton: določnik dni ali "off"/"closed" ali čas.
    let days: number[] | null = null;
    let timeTokens = tokens;
    if (/^(off|closed)$/i.test(tokens[0])) {
      // Gol "off" kot CELO pravilo = zaprto vsak dan (redko, a pošteno).
      if (tokens.length === 1) {
        rules.push({ days: [0, 1, 2, 3, 4, 5, 6], closed: true, ranges: [] });
        continue;
      }
      return null;
    }
    if (!TIME_RE.test(tokens[0])) {
      // Prvi žeton ni čas → mora biti veljaven določnik dni.
      days = parseDaySpec(tokens[0]);
      if (!days) return null;
      timeTokens = tokens.slice(1);
      if (timeTokens.length === 0) return null; // dnevi brez časa → neveljavno
    }

    // Preostali žetoni: EN sam časovni izraz ("off" ali ","-ločeni range-i).
    // Več besednih žetonov (npr. "Jan-Feb 10:00-17:00") tu ne pripada
    // podmnožici → null (UNKNOWN).
    if (timeTokens.length !== 1) return null;
    const timeExpr = timeTokens[0];

    if (/^(off|closed)$/i.test(timeExpr)) {
      rules.push({ days: days ?? ALL_DAYS, closed: true, ranges: [] });
      continue;
    }

    const ranges: ParsedRange[] = [];
    for (const part of timeExpr.split(",")) {
      const range = parseTimeRange(part.trim());
      if (!range) return null;
      ranges.push(range);
    }
    rules.push({ days: days ?? ALL_DAYS, ranges });
  }

  if (rules.length === 0) return null;
  return { alwaysOpen: false, rules };
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

// ── Status ob danem trenutku ──────────────────────────────────────────────

function minutesLabel(minutes: number): string {
  const clamped = Math.min(1440, Math.max(0, minutes));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Ali je dan `weekday` ob `minutes` odprt po pravilih (vljučno čez-noč). */
function isOpenAt(parsed: ParsedHours, at: OpeningMoment): boolean {
  if (parsed.alwaysOpen) return true;
  for (const rule of parsed.rules) {
    if (rule.closed) continue;
    if (rule.days.includes(at.weekday)) {
      for (const r of rule.ranges) {
        if (!r.overnight && at.minutes >= r.start && at.minutes < r.end) {
          return true;
        }
        if (r.overnight && at.minutes >= r.start) return true;
      }
    }
    // Čez-nočni razpon prejšnjega dne se razliva v ta dan.
    const prevDay = (at.weekday + 6) % 7;
    if (!rule.closed && rule.days.includes(prevDay)) {
      for (const r of rule.ranges) {
        if (r.overnight && at.minutes < r.end) return true;
      }
    }
  }
  return false;
}

/** Naslednja otvoritev po trenutku (v 7 dneh) ali null, če je zapis brez
 *  odprtij (npr. samo "off"). Primerjava po absolutni razdalji v minutah
 *  od "zdaj" — pošteno čez mejo tedna. */
function nextOpening(
  parsed: ParsedHours,
  at: OpeningMoment
): { day: number; minutes: number } | null {
  if (parsed.alwaysOpen) return null;
  let best: { day: number; minutes: number; abs: number } | null = null;
  for (let offset = 0; offset < 8; offset += 1) {
    const day = (at.weekday + offset) % 7;
    for (const rule of parsed.rules) {
      if (rule.closed || !rule.days.includes(day)) continue;
      for (const r of rule.ranges) {
        // Danes štejejo samo začetki V PRIHODNOSTI; pozneje dnevi vsi.
        if (offset === 0 && r.start <= at.minutes) continue;
        const abs = offset * 1440 + r.start;
        if (best == null || abs < best.abs) {
          best = { day, minutes: r.start, abs };
        }
      }
    }
  }
  return best ? { day: best.day, minutes: best.minutes } : null;
}

// ── Javni API ─────────────────────────────────────────────────────────────

/** Trenutna stenska ura v Sloveniji (Europe/Ljubljana) — DST-varna. */
export function nowInSlovenia(): OpeningMoment {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Ljubljana",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const weekday = weekdayMap[map.weekday] ?? 1;
  let hour = parseInt(map.hour ?? "0", 10);
  if (Number.isNaN(hour)) hour = 0;
  // Nekatera okolja izpišejo "24" za polnoč (hourCycle h24) → 0.
  if (hour === 24) hour = 0;
  const minute = parseInt(map.minute ?? "0", 10) || 0;
  return { weekday, minutes: hour * 60 + minute };
}

const LABELS = {
  openUntil: {
    sl: (t: string) => `odprto do ${t}`,
    en: (t: string) => `open until ${t}`,
  },
  open247: { sl: "odprto 24/7", en: "open 24/7" },
  closedOpens: {
    sl: (d: string, t: string) => `zaprto · odpre ${d} ${t}`,
    en: (d: string, t: string) => `closed · opens ${d} ${t}`,
  },
  closedNoReopen: { sl: "zaprto", en: "closed" },
  missing: {
    sl: "odpiralni časi niso objavljeni v viru",
    en: "opening hours not published by the source",
  },
  complex: {
    sl: "zapleten zapis ur — preveri pri ponudniku",
    en: "complex hours notation — check with the provider",
  },
} as const;

/**
 * Status odpiralnih ur ob danem trenutku (stenska ura).
 * `raw` manjka/prazen → UNKNOWN(missing); neparsabilno → UNKNOWN(complex).
 */
export function openingStatusAt(
  raw: string | null | undefined,
  at: OpeningMoment
): OpeningStatusResult {
  if (!raw || !raw.trim()) {
    return { status: "UNKNOWN", detail: LABELS.missing };
  }
  const parsed = parseOpeningHours(raw);
  if (!parsed) {
    return { status: "UNKNOWN", detail: LABELS.complex, raw };
  }
  if (parsed.alwaysOpen) {
    return { status: "OPEN", detail: LABELS.open247, raw };
  }
  if (isOpenAt(parsed, at)) {
    // "odprto do HH:MM" — najbližji konec TRENUTNO tekočega odpiranja.
    // Kandidati (vsi so v prihodnosti po konstrukciji):
    //  · današnje pravilo, navadni razpon (minuta < konec) → konec danes;
    //  · današnje pravilo, čez-nočni razpon (minuta ≥ začetek) → konec
    //    naslednje jutro (nalijemo samo HH:MM);
    //  · razliva prejšnjega dne (čez-noč, minuta < konec) → konec danes.
    const ends: number[] = [];
    for (const rule of parsed.rules) {
      if (rule.closed) continue;
      if (rule.days.includes(at.weekday)) {
        for (const r of rule.ranges) {
          if (!r.overnight && at.minutes < r.end) ends.push(r.end);
          if (r.overnight && at.minutes >= r.start) ends.push(r.end);
        }
      }
      const prevDay = (at.weekday + 6) % 7;
      if (rule.days.includes(prevDay)) {
        for (const r of rule.ranges) {
          if (r.overnight && at.minutes < r.end) ends.push(r.end);
        }
      }
    }
    const endLabel = ends.length ? minutesLabel(Math.min(...ends)) : null;
    const detail = endLabel
      ? {
          sl: LABELS.openUntil.sl(endLabel),
          en: LABELS.openUntil.en(endLabel),
        }
      : LABELS.open247;
    return { status: "OPEN", detail, raw };
  }
  // CLOSED — pošteno s naslednjo otvoritvijo, če jo zapis pove.
  const next = nextOpening(parsed, at);
  const detail = next
    ? {
        sl: LABELS.closedOpens.sl(
          DAY_SHORT[next.day].sl,
          minutesLabel(next.minutes)
        ),
        en: LABELS.closedOpens.en(
          DAY_SHORT[next.day].en,
          minutesLabel(next.minutes)
        ),
      }
    : LABELS.closedNoReopen;
  return { status: "CLOSED", detail, raw };
}

/** Status ob TRENUTKU v Sloveniji (namesto nowInSlovenia() v klicu). */
export function openingStatusNow(
  raw: string | null | undefined
): OpeningStatusResult {
  return openingStatusAt(raw, nowInSlovenia());
}
