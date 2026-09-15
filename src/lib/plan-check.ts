import { PATTERNS, normalizeText } from "@/lib/url-ingest";
import { validateItineraryGeo, type GeoValidation } from "@/lib/geo-validation";
import { computeTripDriveCosts } from "@/lib/trip-costs";
import {
  DESTINATION_COORDS,
  heuristicLeg,
  legKey,
  round5,
  type LegRouteIndex,
} from "@/lib/road-routing";
import { DESTINATIONS } from "@/lib/slovenia-data";
import type { DriveCosts, Itinerary, LocationVisit } from "@/lib/types";

// ============================================================================
// F13 — "PREVERI SVOJ NAČRT": deterministični validator TUJIH načrtov
// ============================================================================
//
// Kontekst (raziskovalna runda, sekcije 18–22 COMPETITIVE-ANALYSIS):
// forumi (Reddit r/AI_travel_tips, HN) povedo, da uporabniki, ki so ŽE
// dobili načrt od ChatGPTja/Mindtripa/Layle, rabijo nekoga, ki ga
// PREVERI: vrstni red, datume, zaprtja. Bivši vodik na HN je zato zgradil
// CHECK orodje; MonkeyEatingMango je 81 checkov naredil marketing.
//
// Naš odgovor je ČISTA FUNKCIJA na isti debeli infrastrukturi, ki jo
// uporablja naš lastni generator ( geo-validacija P0.2, OSRM F5.6,
// stroški F5.3, vzorci url-ingest F5.4) — 0 AI žetonov, deluje vedno:
//
//   1. PARSER: besedilo → dnevi ("Dan 1" / "Day 2:" / "3. dan") + postanki
//      (ista baza vzorcev kot url-ingest; VRSTNI RED = vrstni red omembe)
//      + opcijski termini ob omembi ("9:00–11:00 Bled") + opcijski
//      začetni datum (ISO / 20.9.2026 / 20. september 2026 / Sep 20, 2026)
//   2. VALIDATOR: obstoječa geo-validacija ( km na dan, zaporedne noge,
//      obseg dneva, urnik, duplikati znotraj dneva, zaprtja v mesecu/dnevu
//      v tednu — slednje SAMO z znanim datumom, kot vedno)
//   3. DODATNA PREVERJANJA, ki jih naš generator še nima:
//      - duplikati PREK dnevov ( MEM: 5,1 % dni, večmestno 45,2 %)
//      - cik-cak dan: optimalna preureditev postankov ( do 7 = izčrpno,
//        sicer 2-opt) s prihrankom km ( MEM: 9,5 % dni, median +3,4 km)
//   4. STROŠKI vožnje ( F5.3: gorivo + e-vinjeta)
//
// NAČELO POŠTENOSTI: preverimo SAMO postanke, ki se padejo na naših 22
// destinacij. Če jih ne prepoznamo, tega REČEMO — ne izmišljujemo si
// "podobnih" krajev in ne ugibamo trajanj ( duration = 0 → pravilo
// obsega dneva šteje samo vožnjo).
// ============================================================================

// ---------------------------------------------------------------------------
// Tipi (poročilo gre na klient — vse kar UI rabi, je tu)
// ---------------------------------------------------------------------------

export type PlanCheckLang = "sl" | "en";

/** Parsed dan z multičenimi postanki ( ime + ID destinacije). */
export interface ParsedDay {
  day: number;
  locations: LocationVisit[];
}

/** Rezultat parserja ( brez validacije — izhodišče za OSRM noge v API). */
export interface ParsedPlan {
  dayHeadersFound: boolean;
  days: ParsedDay[];
  /** ISO "YYYY-MM-DD" ali null (brez datuma zaprtja NE trdimo ničesar). */
  tripStartDate: string | null;
  totalStops: number;
}

/** Cik-cak dan: preureditev lahko prihrani km ( MEM: 9,5 % dni). */
export interface PlanCheckZigzag {
  day: number;
  currentKm: number;
  optimizedKm: number;
  savedKm: number;
  /** Imena destinacij v OPTIMALNEM zaporedju. */
  order: string[];
}

/** Duplikat prek dnevov ( isti kraj v več dnevih). */
export interface PlanCheckDuplicate {
  id: string;
  name: string;
  days: number[];
}

/** Vir, ki ga poročilo citira ( žetoni virov — dokazljivost). */
export interface PlanCheckSource {
  label: string;
  url: string;
}

/** Celotno poročilo /api/plan-check odgovora. */
export interface PlanCheckReport {
  lang: PlanCheckLang;
  parsed: {
    dayHeadersFound: boolean;
    days: { day: number; stops: { id: string; name: string }[] }[];
    tripStartDate: string | null;
    totalStops: number;
  };
  validation: GeoValidation;
  duplicates: PlanCheckDuplicate[];
  zigzag: PlanCheckZigzag[];
  driveCosts: DriveCosts | null;
  sources: PlanCheckSource[];
}

// ---------------------------------------------------------------------------
// Skupni pripomočki
// ---------------------------------------------------------------------------

const DEST_BY_ID = new Map(DESTINATIONS.map((d) => [d.id, d]));

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** "9.30–11.15" / "9:00 - 11:00" / "od 9h do 11h" → "09:30-11:15" ali null. */
function extractTimeSlot(line: string): string | null {
  const m = line.match(
    /(\d{1,2})[.:](\d{2})\s*(?:-|–|—|do|to)\s*(\d{1,2})[.:](\d{2})/
  );
  if (!m) return null;
  const h1 = Number(m[1]);
  const mi1 = Number(m[2]);
  const h2 = Number(m[3]);
  const mi2 = Number(m[4]);
  if (h1 > 23 || h2 > 23 || mi1 > 59 || mi2 > 59) return null;
  if (h2 * 60 + mi2 <= h1 * 60 + mi1) return null; // čez noč — ne ugibamo
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h1)}:${pad(mi1)}-${pad(h2)}:${pad(mi2)}`;
}

// ---------------------------------------------------------------------------
// PARSER: besedilo → dnevi + postanki (+ termini, + začetni datum)
// ---------------------------------------------------------------------------

/** Glava dneva po očiščenju markdown okrasja: "Dan 1", "Day 2:", "3. dan". */
function dayNumberFromHeaderLine(rawLine: string): number | null {
  const stripped = rawLine
    .replace(/^[ \t]*(?:#{1,6}[ \t]+|[-*+>]+[ \t]+)*/, "")
    .trim();
  if (stripped.length === 0 || rawLine.length > 120) return null;
  const norm = normalizeText(stripped);
  // "dan 1", "day 2:", "dan 3 – piran"
  let m = norm.match(/^(?:dan|day)[ \t]*[-–—:.)]?[ \t]*(\d{1,2})\b/);
  if (m) return clampDay(+m[1]);
  // "1. dan", "2. day", "3. dni"
  m = norm.match(/^(\d{1,2})[.)][ \t]*(?:dan|day|dni)\b/);
  if (m) return clampDay(+m[1]);
  return null;
}

function clampDay(n: number): number | null {
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
}

/** Postanke v BLOKU poišče po vrstnem redu prve omembe ( po vrsticah). */
function matchStopsInOrder(block: string): LocationVisit[] {
  const lines = block.split(/\r?\n/);
  interface Hit {
    visit: LocationVisit;
    lineIdx: number;
    posInLine: number;
  }
  const hits: Hit[] = [];

  for (const [id, patterns] of Object.entries(PATTERNS)) {
    const regexes = patterns.map(patternRegex);
    let best: Hit | null = null;
    for (let li = 0; li < lines.length; li++) {
      const normLine = normalizeText(lines[li]);
      let pos = -1;
      for (const re of regexes) {
        const m = re.exec(normLine);
        if (m) {
          const p = m.index + m[0].search(/[a-z]/);
          if (pos === -1 || p < pos) pos = p;
        }
      }
      if (pos !== -1) {
        const dest = DEST_BY_ID.get(id);
        best = {
          visit: {
            destination_id: id,
            destination_name: dest?.name ?? id,
            time_slot: extractTimeSlot(lines[li]) ?? "",
            duration: 0, // neznano iz besedila — ne izmišljujemo
            estimated_cost: 0,
            notes: "",
          },
          lineIdx: li,
          posInLine: pos,
        };
        break; // prva vrstica s to destinacijo — kasnejše omembe ne štejejo
      }
    }
    if (best) hits.push(best);
  }

  hits.sort((a, b) =>
    a.lineIdx !== b.lineIdx ? a.lineIdx - b.lineIdx : a.posInLine - b.posInLine
  );
  return hits.map((h) => h.visit);
}

/**
 * Vzorec → regex, TOLERANTEN na slovenske končnice ( url-ingest šteje samo
 * točne oblike — tam je konservativnost željena; tu je priklic pomembnejši:
 * "v Ljubljani", "iz Bleda", "v Piranu", "Ptujskem gradu" …).
 * Dolge besede ( ≥5 znakov) prenesejo do 3 črke končnice, kratke 2 —
 * kompromis med priklicom in lažnimi zadetki ( "soca" ne sme ujeti "soccer").
 * Večbesedni vzorci dovoljujejo končnico na vsaki besedi posebej.
 */
function patternRegex(pattern: string): RegExp {
  const np = normalizeText(pattern);
  const words = np.split(/\s+/).map(wordMatcher);
  return new RegExp(`(?:^|[^a-z])${words.join("\\s+")}(?=[^a-z]|$)`);
}

/**
 * Ena beseda vzorca → alternacija "polna beseda | deblo brez končnega
 * samoglasnika | deblo brez -ec-" + do 3 črk končnice:
 *   "ljubljana" → tudi "ljubljano/ljubljani/ljubljanski" ( deblo ljubljan)
 *   "bovec"     → tudi "bovca/bovcu" ( deblo bovc)
 * Meja končnice po dolžini debla ( ≥5 → 3 črke, sicer 2) drži
 * laűne zadetke stran ( "soca" ne ujame "soccer").
 */
function wordMatcher(w: string): string {
  const variants = new Set<string>([w]);
  if (/[aeiou]$/.test(w)) variants.add(w.slice(0, -1));
  if (/ec$/.test(w)) variants.add(w.slice(0, -2) + w.slice(-1));
  const alts = [...variants]
    .filter((v) => v.length >= 3)
    .map((v) => {
      const cap = v.length >= 5 ? 3 : 2;
      return `${escapeRe(v)}[a-z]{0,${cap}}`;
    });
  return `(?:${alts.join("|")})`;
}

/** Meseci ( SL dolink + EN) → številka; word-boundary varno ("maj" ≠ "majhna"). */
const MONTH_RES: [RegExp, number][] = [
  [/\b(?:januar(?:ja)?|january)\b/, 1],
  [/\b(?:februar(?:ja)?|february)\b/, 2],
  [/\b(?:mar(?:ec|ca)|march)\b/, 3],
  [/\bapril(?:a|)\b/, 4],
  [/\b(?:maj|may)\b/, 5],
  [/\b(?:junij(?:a)?|june)\b/, 6],
  [/\b(?:julij(?:a)?|july)\b/, 7],
  [/\b(?:avgust(?:a)?|august)\b/, 8],
  [/\b(?:septemb(?:er|ra))\b/, 9],
  [/\b(?:oktob(?:er|ra)|october)\b/, 10],
  [/\b(?:novemb(?:er|ra)|november)\b/, 11],
  [/\b(?:decemb(?:er|ra)|december)\b/, 12],
];

function isoFromParts(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Začetni datum iz besedila ( ISO / piko / beseda meseca, SL+EN) — ali null. */
function extractStartDate(text: string): string | null {
  const norm = normalizeText(text);

  // ISO: 2026-09-20
  let m = norm.match(/\b(20[2-4]\d)-(\d{1,2})-(\d{1,2})\b/);
  if (m) return isoFromParts(+m[1], +m[2], +m[3]);

  // SL s pikami: 20.9.2026 / 20. 9. 2026
  m = norm.match(/\b(\d{1,2})\.\s*(\d{1,2})\.\s*(20[2-4]\d)\b/);
  if (m) return isoFromParts(+m[3], +m[2], +m[1]);

  // Mesec z besedo ( obeh vrstnih redov; leto obvezno — brez leta ne ugibamo)
  for (const [re, month] of MONTH_RES) {
    // "20. september 2026" / "20 september 2026"
    let mm = norm.match(new RegExp(`\\b(\\d{1,2})\\.?[ \\t]+${re.source}[ \\t]+(20[2-4]\\d)\\b`));
    if (mm) return isoFromParts(+mm[2], month, +mm[1]);
    // "september 20, 2026" / "september 20 2026"
    mm = norm.match(new RegExp(`\\b${re.source}[ \\t]+(\\d{1,2}),?[ \\t]+(20[2-4]\\d)\\b`));
    if (mm) return isoFromParts(+mm[2], month, +mm[1]);
  }
  return null;
}

/** Glavni parser: besedilo → ParsedPlan. Čista funkcija. */
export function parsePlanText(rawText: string): ParsedPlan {
  const text = typeof rawText === "string" ? rawText : "";
  const tripStartDate = extractStartDate(text);

  const lines = text.split(/\r?\n/);

  // PREDHODNI pregled: ali ima besedilo sploh glave dni?
  const headerOf: (number | null)[] = lines.map(dayNumberFromHeaderLine);
  const dayHeadersFound = headerOf.some((d) => d !== null);

  const blocks = new Map<number, string[]>();
  const orderSeen: number[] = [];
  const ensureBlock = (dayNo: number) => {
    if (!blocks.has(dayNo)) {
      blocks.set(dayNo, []);
      orderSeen.push(dayNo);
    }
  };

  if (dayHeadersFound) {
    // Glava dneva je DEL bloka ( "Dan 1 — Bled → Vintgar" nosi postanke),
    // besedilo PRED prvo glavo ( uvod/zahtevek) pa ni dan nikogaršnjega —
    // uvodne omembe ("5 dni po Sloveniji: Bled, Piran …") ne smemo šteti
    // kot postanke dneva 1.
    let currentDay: number | null = null;
    lines.forEach((line, i) => {
      const dayNo = headerOf[i];
      if (dayNo !== null) {
        currentDay = dayNo;
        ensureBlock(dayNo);
      }
      if (currentDay !== null) {
        blocks.get(currentDay)!.push(line);
      }
    });
  } else {
    // Brez glav: celo besedilo = "dan 1" ( poročilo to odkrito pokaže)
    ensureBlock(1);
    blocks.set(1, lines);
  }

  const days: ParsedDay[] = orderSeen
    .sort((a, b) => a - b)
    .map((dayNo) => ({
      day: dayNo,
      locations: matchStopsInOrder(blocks.get(dayNo)!.join("\n")),
    }))
    .filter((d) => d.locations.length > 0);

  const totalStops = days.reduce((s, d) => s + d.locations.length, 0);

  return { dayHeadersFound, days, tripStartDate, totalStops };
}

// ---------------------------------------------------------------------------
// DODATNA PREVERJANJA ( duplikati prek dnevov, cik-cak/preureditev)
// ---------------------------------------------------------------------------

/** Duplikati prek dnevov — isti kraj v ≥2 različnih dnevih ( MEM 5,1 %). */
export function findCrossDayDuplicates(
  days: ParsedDay[]
): PlanCheckDuplicate[] {
  const byDest = new Map<string, { name: string; days: number[] }>();
  for (const d of days) {
    for (const l of d.locations) {
      const entry = byDest.get(l.destination_id) ?? {
        name: l.destination_name,
        days: [],
      };
      if (!entry.days.includes(d.day)) entry.days.push(d.day);
      byDest.set(l.destination_id, entry);
    }
  }
  return [...byDest.entries()]
    .filter(([, v]) => v.days.length >= 2)
    .map(([id, v]) => ({ id, name: v.name, days: v.days.slice().sort((a, b) => a - b) }));
}

function pathKm(ids: string[], dist: (a: string, b: string) => number): number {
  let km = 0;
  for (let i = 1; i < ids.length; i++) km += dist(ids[i - 1], ids[i]);
  return km;
}

/** Optimalno zaporedje odprte poti: ≤7 točk izčrpno ( permutacije), sicer 2-opt. */
function bestOrder(
  ids: string[],
  dist: (a: string, b: string) => number
): { order: string[]; km: number } {
  const n = ids.length;
  if (n <= 7) {
    // Heapov algoritem po permutacijah — 7! = 5040, milisekunde
    let best = ids.slice();
    let bestKm = pathKm(ids, dist);
    const arr = ids.slice();
    const c = new Array<number>(n).fill(0);
    let i = 1;
    while (i < n) {
      if (c[i] < i) {
        const k = i % 2 === 0 ? 0 : c[i];
        [arr[i], arr[k]] = [arr[k], arr[i]];
        const km = pathKm(arr, dist);
        if (km < bestKm) {
          bestKm = km;
          best = arr.slice();
        }
        c[i] += 1;
        i = 1;
      } else {
        c[i] = 0;
        i += 1;
      }
    }
    return { order: best, km: bestKm };
  }
  // 2-opt na odprti poti ( do konvergence, max 60 potez)
  const order = ids.slice();
  let improved = true;
  let guard = 0;
  while (improved && guard < 60) {
    improved = false;
    guard += 1;
    for (let a = 0; a < n - 1 && !improved; a++) {
      for (let b = a + 1; b < n && !improved; b++) {
        const before = pathKm(order, dist);
        const candidate = order
          .slice(0, a)
          .concat(order.slice(a, b + 1).reverse(), order.slice(b + 1));
        const after = pathKm(candidate, dist);
        if (after < before - 0.01) {
          order.splice(0, n, ...candidate);
          improved = true;
        }
      }
    }
  }
  return { order, km: pathKm(order, dist) };
}

/** Meji za predlaganje preureditve: ≥ 20 km IN ≥ 12 % ( prek muh). */
const ZIGZAG_MIN_KM = 20;
const ZIGZAG_MIN_PCT = 0.12;

/** Cik-cak dnevi: preureditev postankov lahko očitno prihrani ( MEM 9,5 %). */
export function checkZigzag(
  days: ParsedDay[],
  legs?: LegRouteIndex
): PlanCheckZigzag[] {
  const out: PlanCheckZigzag[] = [];
  const dist = (a: string, b: string): number => {
    const leg = legs?.get(legKey(a, b));
    if (leg) return leg.km;
    const ca = DESTINATION_COORDS.get(a);
    const cb = DESTINATION_COORDS.get(b);
    if (!ca || !cb) return 0;
    return heuristicLeg(ca, cb).km;
  };

  for (const d of days) {
    const ids = d.locations
      .map((l) => l.destination_id)
      .filter((id) => DESTINATION_COORDS.has(id));
    if (ids.length < 4 || ids.length > 10) continue;
    const current = pathKm(ids, dist);
    if (current <= 0) continue;
    const { order, km: best } = bestOrder(ids, dist);
    const saved = round5(current - best);
    if (saved >= ZIGZAG_MIN_KM && saved / current >= ZIGZAG_MIN_PCT) {
      out.push({
        day: d.day,
        currentKm: round5(current),
        optimizedKm: round5(best),
        savedKm: saved,
        order: order.map(
          (id) => DEST_BY_ID.get(id)?.name ?? id
        ),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// VIRI ( žetoni v poročilu — dokazljivost, kot pri odpiralnih časih)
// ---------------------------------------------------------------------------

const SOURCES: Record<PlanCheckLang, PlanCheckSource[]> = {
  sl: [
    {
      label:
        "MonkeyEatingMango: 43,2 % AI-dnevnikov nosi napako ( študija 356 poti, 9/2026)",
      url: "https://monkeyeatingmango.com/research/ai-itinerary-errors-data-study/",
    },
    {
      label:
        "BBC: 37 % uporabnikov AI-načrtov manjka podatkov, ~33 % netočnosti ( 9/2025)",
      url: "https://www.bbc.com/travel/article/20250926-the-perils-of-letting-ai-plan-your-next-trip",
    },
    {
      label:
        "Tow Center ( prek Travel Anywhere): napake citiranja 37–94 % pri AI iskalnikih",
      url: "https://www.travelanywhere.blog/blog/ai-hotel-hallucination-rate-chatgpt-gemini-perplexity-2026-tested",
    },
    {
      label: "Naša metodologija: koordinate, odpiralni časi in razdalje",
      url: "/vir-podatkov",
    },
  ],
  en: [
    {
      label:
        "MonkeyEatingMango: 43.2% of AI-planned days carry a fault (356-trip study, 9/2026)",
      url: "https://monkeyeatingmango.com/research/ai-itinerary-errors-data-study/",
    },
    {
      label:
        "BBC: 37% of AI-plan users found too little information, ~33% inaccuracies (9/2025)",
      url: "https://www.bbc.com/travel/article/20250926-the-perils-of-letting-ai-plan-your-next-trip",
    },
    {
      label:
        "Tow Center (via Travel Anywhere): 37–94% citation error rates in AI search",
      url: "https://www.travelanywhere.blog/blog/ai-hotel-hallucination-rate-chatgpt-gemini-perplexity-2026-tested",
    },
    {
      label: "Our methodology: coordinates, opening hours and distances",
      url: "/vir-podatkov",
    },
  ],
};

// ---------------------------------------------------------------------------
// GLAVNA FUNKCIJA
// ---------------------------------------------------------------------------

/** ParsedPlan → minimalen Itinerary ( vtič v obstoječo geo-validacijo). */
export function toItinerary(parsed: ParsedPlan): Itinerary {
  return {
    days: parsed.days.map((d) => ({
      day: d.day,
      locations: d.locations,
      weather: { condition: "", temp: 0 },
    })),
    total_budget: 0,
    recommendations: [],
    tips: [],
    source: "fallback",
    ...(parsed.tripStartDate ? { tripStartDate: parsed.tripStartDate } : {}),
  };
}

/**
 * Preveri že parsan načrt ( API pot: parse → OSRM noge → tu).
 * Čista funkcija — nič omrežja ( noge prinese klicnik).
 */
export function checkParsedPlan(
  parsed: ParsedPlan,
  lang: PlanCheckLang = "sl",
  legs?: LegRouteIndex
): PlanCheckReport {
  const itinerary = toItinerary(parsed);
  const validation = validateItineraryGeo(itinerary, lang, legs);
  const driveCosts = computeTripDriveCosts(itinerary, legs);

  return {
    lang,
    parsed: {
      dayHeadersFound: parsed.dayHeadersFound,
      days: parsed.days.map((d) => ({
        day: d.day,
        stops: d.locations.map((l) => ({
          id: l.destination_id,
          name: l.destination_name,
        })),
      })),
      tripStartDate: parsed.tripStartDate,
      totalStops: parsed.totalStops,
    },
    validation,
    duplicates: findCrossDayDuplicates(parsed.days),
    zigzag: checkZigzag(parsed.days, legs),
    driveCosts,
    sources: SOURCES[lang],
  };
}

/** Pripomoček za teste/CLI: besedilo → poročilo v enem klicu. */
export function checkPlan(
  rawText: string,
  lang: PlanCheckLang = "sl",
  legs?: LegRouteIndex
): PlanCheckReport {
  return checkParsedPlan(parsePlanText(rawText), lang, legs);
}
