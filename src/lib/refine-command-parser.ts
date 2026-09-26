// ============================================================================
// REFINA — DETERMINISTIČNI PARSERSKI UKAZOV (Issue #9 §7)
// ============================================================================
//
// NAMEN: prostojezikovno refiniranje ("ceneje", "dodaj Bled", "prestavi na
// soboto", "more nature on day 2" …) razčlenimo DETERMINISTIČNO v tipiziran
// ukaz — BREZ LLM. Arhitektura po Issue #9 §7:
//
//   vhod → normalizacija → slovar sinonimov/gramatika → TIPIZIRAN ukaz
//        → (v ruti) kanonična mutacija potovanja → validacijska plast
//
// PRAVILA (§47 FAILURE POLICY):
//   - NIKOLI ne ugibamo: neprepoznan ukaz → { kind: "unknown" } → ruta
//     vrne izvirni načrt + iskreno sporočilo s podprtimi ukazi.
//   - Prepoznan, a (še) nepodprt namen (npr. "prestavi na soboto",
//     "zamenjaj aktivnost") → { kind: "unsupported", matchedIntent } —
//     iskreno povedano, ne tiho ignorirano.
//   - Dan: ekspliciten ("dan 2", "sobota", "day 3") ali privzet po akciji
//     (pickDefaultDay — najbolj relevanten dan, čisto izračunljiv).
//
// ČIST MODUL: 0 omrežja, 0 baze, 0 ure (uro/datum primarnega kljuca
// potovanja injicira klicatelj), 0 AI. Reproducibilno + testirano.
// ============================================================================

import { DESTINATIONS } from "@/lib/slovenia-data";
import type { Itinerary, QuickActionId } from "@/lib/types";

// ---------------------------------------------------------------------------
// TIPI
// ---------------------------------------------------------------------------

export type RefineCommand =
  | {
      kind: "quick-action";
      action: QuickActionId;
      /** 1-based dan (če je bil eksplicitno naveden). */
      day?: number;
      /** Ujeto besedilo (za opombo/analitiko — brez PII). */
      matchedText: string;
    }
  | {
      kind: "add-place";
      placeId: string;
      placeName: string;
      day?: number;
      matchedText: string;
    }
  | {
      kind: "remove-place";
      placeId: string;
      placeName: string;
      day?: number;
      matchedText: string;
    }
  | {
      /** Namenski vzorec prepoznan, a deterministična izvedba (še) ne podpira. */
      kind: "unsupported";
      matchedIntent: string;
    }
  | { kind: "unknown" };

export interface ParseRefineContext {
  lang?: "sl" | "en";
  /** ISO datum začetka potovanja (za razrešitev "sobota"/"saturday"). */
  tripStartDate?: string | null;
  /** Število dni načrta (za njegove meje). */
  daysCount?: number;
}

// ---------------------------------------------------------------------------
// NORMALIZACIJA (ista diakritična zguba kot deterministic-search)
// ---------------------------------------------------------------------------

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replaceAll("č", "c")
    .replaceAll("š", "s")
    .replaceAll("ž", "z")
    .replaceAll("ć", "c")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// SLOVARJI SINONIMOV (SL+EN) — razširljiva gramatika (Issue #9 §7)
// ---------------------------------------------------------------------------

/** Akcija → vzorci (normalizirani, delne besede so OK). */
const ACTION_PATTERNS: ReadonlyArray<{
  action: QuickActionId;
  patterns: string[];
}> = [
  {
    action: "less_driving",
    patterns: [
      "manj voznje", "manj vozit", "krajse voznje", "krajse vozit",
      "kratje voznje", "manj kilometrov", "manj km",
      "less driving", "shorter drive", "less km", "fewer kilometers",
      "krajse", "krajs", "shorter day",
    ],
  },
  {
    action: "rain_suitable",
    patterns: [
      "dezev", "deze", "notranj", "v zaprtih", "v notranj",
      "slabo vreme", "ob dezu", "za dez",
      "indoor", "rainy", "rain suitable", "bad weather", "if it rains",
    ],
  },
  {
    action: "slower_pace",
    patterns: [
      "pocasnej", "pocasneje", "pocasni", "bolj mir", "mirneje",
      "bolj sproscen", "sprostitev", "manj hitro",
      "slower", "slower pace", "calm", "more relaxed", "relaxed",
    ],
  },
  {
    action: "more_nature",
    patterns: [
      "vec narave", "bolj naravno", "narava", "v naravo",
      "more nature", "nature", "outdoors", "vec naravn",
    ],
  },
  {
    action: "more_food",
    patterns: [
      "vec hrane", "dodaj kosilo", "kosilo", "vec kulinari", "kulinarika",
      "hrana", "gastro", "vecerja", "zajtrk",
      "more food", "lunch", "dinner", "breakfast", "more food stops",
      "gastronom",
    ],
  },
  {
    action: "family_friendly",
    patterns: [
      "druzin", "za otroke", "otroci", "otroc", "otrokom",
      "family", "kids", "with children", "child friendly", "kid friendly",
    ],
  },
  {
    action: "cheaper",
    patterns: [
      "ceneje", "cenejs", "poceni", "nizji proracun", "manj strosek",
      "manj stroskov", "prihrani", "varcevanje", "cheap", "cheaper",
      "less expensive", "budget friendly", "save money", "on a budget",
    ],
  },
  {
    action: "pricier",
    patterns: [
      "drazje", "drazj", "visji proracun", "premium", "luksuzno",
      "luxury", "more expensive", "higher end", " upscale",
    ],
  },
  {
    action: "more_active",
    patterns: [
      "bolj aktiv", "vec aktivnosti", "aktivneje", "vec gibanja",
      "adrenalin", "sportneje", "vec sporta",
      "more active", "more activities", "more activity", "adrenaline",
      "more sport", "more action",
    ],
  },
];

/** Dodajanje/odstranjevanje krajev (pred nazivom destinacije). */
const ADD_PREFIXES = ["dodaj", "vkljuci", "obiskaj", "zelim", "hocem", "add ", "include ", "visit ", "insert "];
const REMOVE_PREFIXES = ["odstrani", "brisi", "izpusti", "pocisti", "remove ", "drop ", "delete ", "without ", "brez "];

/** Prepoznani, a (še) nepodprti nameni (iskrena odklonitev, ne tiho). */
const UNSUPPORTED_INTENTS: ReadonlyArray<{ intent: string; patterns: string[] }> = [
  {
    intent: "move-day",
    patterns: ["prestavi", "premakni", "zamenjaj dan", "prestavljen", "move ", "reschedule", "shift to"],
  },
  {
    intent: "swap-activity",
    patterns: ["zamenjaj aktivnost", "zamenjaj postanek", "swap activity", "swap stop", "exchange "],
  },
  {
    intent: "duration",
    patterns: ["daljse", "dodaj noc", "dodaj eno noc", "daljsi", "longer", "extra day", "add a day", "add one day", "krajse potovanje", "shorter trip", "manj dni", "vec dni", "more days", "fewer days"],
  },
  {
    intent: "party-type",
    patterns: ["za par", "romanticno", "za dva", "solo", "sam", "za prijatelje", "s prijatelji", "couple", "solo trip", "friends trip", "with friends", "honeymoon"],
  },
  {
    intent: "outdoor-only",
    patterns: ["samo zunaj", "vec zunaj", "outdoor only", "more outdoor", "zunaj"],
  },
];

/** Dnevi tedna (SL+EN) — razrešijo se glede na tripStartDate.
 * SL uporablja DEBLJE (sodbene oblike se sklanjajo: sobota/soboto/sobote …). */
const WEEKDAYS_SL = ["ponedeljk", "torek", "sred", "cetrtk", "petk", "sobot", "nedelj"];
const WEEKDAYS_EN = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

// ---------------------------------------------------------------------------
// POMOŽNIKI
// ---------------------------------------------------------------------------

function findFirst(text: string, patterns: string[]): string | null {
  for (const p of patterns) {
    const needle = normalize(p);
    if (needle && text.includes(needle)) return p;
  }
  return null;
}

/** "dan 2" / "day 3" / "2. dan" → 2/3 (1-based, vezan na daysCount). */
function parseExplicitDay(text: string, daysCount?: number): number | undefined {
  const m = text.match(/(?:dan|day|dneva)\s+(\d{1,2})/) ?? text.match(/(\d{1,2})\s*\.\s*(?:dan|day)/);
  if (!m) return undefined;
  const n = parseInt(m[1], 10);
  if (!Number.isInteger(n) || n < 1 || n > 31) return undefined;
  if (daysCount && n > daysCount) return undefined;
  return n;
}

/** "prvi/zadnji dan", "sobota", "saturday" → dan glede na tripStartDate. */
function parseNamedDay(
  text: string,
  ctx: ParseRefineContext
): number | undefined {
  const days = Math.max(1, ctx.daysCount ?? 1);
  if (text.includes("prvi dan") || text.includes("first day")) return 1;
  if (text.includes("zadnji dan") || text.includes("last day")) return days;

  // Danes/t jutri nista smiselna za načrt — preskoči.
  for (let i = 0; i < 7; i++) {
    if (text.includes(WEEKDAYS_SL[i]) || text.includes(WEEKDAYS_EN[i])) {
      const start = ctx.tripStartDate;
      if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return undefined;
      const startDate = new Date(`${start}T00:00:00Z`);
      if (Number.isNaN(startDate.getTime())) return undefined;
      const startDow = startDate.getUTCDay(); // JS: 0=nedelja, 1=ponedeljek …
      // WEEKDAYS polje je PONEDELJEK-prvo (i=0 je ponedeljek) → JS dow:
      // ponedeljek(0)→1 … sobota(5)→6, nedelja(6)→0.
      const targetDow = (i + 1) % 7;
      // Prvi POJAVA tega dneva v [start, start+days) — "danes" ne šteje
      // (0 pomeni isti dan → naslednji teden, konsistentno z "na soboto").
      const offset = (targetDow - startDow + 7) % 7;
      const dayIdx = offset === 0 ? 7 : offset;
      const day = dayIdx + 1;
      return day <= days ? day : undefined;
    }
  }
  return undefined;
}

/** Ujemanje destinacije v besedilu (SL+EN imena, word-boundary). */
function matchDestination(
  text: string
): { id: string; name: string } | null {
  // Daljša imena prva (npr. "Blejsko jezero" pred "Bled").
  // Imena so kanonska (SL dataset) — pokrivajo tudi mednarodna imena
  // (Bled, Piran, Ljubljana …); EN specifični obliki ostanejo iskreno
  // neprepoznane (§47) do dodanih vzdevkov.
  const all = DESTINATIONS.map((d) => ({ id: d.id, name: d.name }))
    .filter((d) => d.name && d.name.length >= 3)
    .sort((a, b) => b.name.length - a.name.length);
  for (const d of all) {
    const n = normalize(d.name).replace(/[.,!?]/g, "");
    if (!n) continue;
    // Word-boundary iskanje (pregen za "jezero"/"gora" generike obdaja ime)
    const re = new RegExp(`(^|[^\\p{L}])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}]|$)`, "u");
    if (re.test(text)) return d;
  }
  return null;
}

// ---------------------------------------------------------------------------
// GLAVNI PARSER
// ---------------------------------------------------------------------------

/**
 * Razčleni prostojezikovni ukaz refinanja v TIPIZIRAN ukaz (SL+EN).
 * Čista funkcija — 0 omrežja/0 ure/0 AI. Nikoli ne vrže.
 */
export function parseRefineCommand(
  raw: string,
  ctx: ParseRefineContext = {}
): RefineCommand {
  const text = normalize(raw ?? "");
  if (text.length < 2) return { kind: "unknown" };

  const day = parseExplicitDay(text, ctx.daysCount) ?? parseNamedDay(text, ctx);

  // 1) DODAJ/ODSTRANI KRAJ — pred akcijami (natančnejša intencija)
  for (const prefix of REMOVE_PREFIXES) {
    if (text.includes(normalize(prefix))) {
      const place = matchDestination(text);
      if (place) {
        return {
          kind: "remove-place",
          placeId: place.id,
          placeName: place.name,
          day,
          matchedText: raw.slice(0, 120),
        };
      }
      // "odstrani" + nekaj, kar NI destinacija → ne ugibamo; nadaljuj
      // (morda je "odstrani eno aktivnost" → unsupported spodaj).
      break;
    }
  }
  for (const prefix of ADD_PREFIXES) {
    if (text.includes(normalize(prefix))) {
      const place = matchDestination(text);
      if (place) {
        return {
          kind: "add-place",
          placeId: place.id,
          placeName: place.name,
          day,
          matchedText: raw.slice(0, 120),
        };
      }
      break;
    }
  }

  // 2) HITRE AKCIJE (slovar sinonimov, SL+EN)
  for (const { action, patterns } of ACTION_PATTERNS) {
    const hit = findFirst(text, patterns);
    if (hit) {
      return { kind: "quick-action", action, day, matchedText: hit };
    }
  }

  // 3) NEPODPRTI (a prepoznani) nameni — iskrena odklonitev
  for (const { intent, patterns } of UNSUPPORTED_INTENTS) {
    if (findFirst(text, patterns)) {
      return { kind: "unsupported", matchedIntent: intent };
    }
  }

  return { kind: "unknown" };
}

// ---------------------------------------------------------------------------
// PRIVZETI DAN (deterministično iz načrta)
// ---------------------------------------------------------------------------

/**
 * Privzeti dan za ukaz brez eksplicitnega dneva — najbolj RELEVANTEN dan
 * za dano akcijo, čisto izračunljiv iz načrta:
 *   - less_driving → dan z največ vožnje (razdalja med zaporednima)
 *   - cheaper/pricier → dan z največ postanki (največja možna sprememba)
 *   - ostalo → dan z največ postanki (najbogatejša izhodišče za zamenjavo)
 * Nikoli ne vrže; dan 1, če načrt nima dni.
 */
export function pickDefaultDay(itinerary: Itinerary, action: QuickActionId): number {
  const days = itinerary?.days ?? [];
  if (days.length === 0) return 1;

  const mostStopsDay = () => {
    let best = 1;
    let bestN = -1;
    days.forEach((d, i) => {
      const n = (d?.locations ?? []).length;
      if (n > bestN) {
        bestN = n;
        best = i + 1;
      }
    });
    return best;
  };

  if (action === "less_driving") {
    let best = mostStopsDay();
    let bestSpan = -1;
    days.forEach((d, i) => {
      const locs = d?.locations ?? [];
      if (locs.length < 2) return;
      // Groba deterministična razdalja: haversine × ROAD_FACTOR med
      // sosednjima postankoma (ISTI podatki kot geo-validacija).
      let dayKm = 0;
      for (let k = 1; k < locs.length; k++) {
        const a = DESTINATIONS.find((x) => x.id === locs[k - 1].destination_id);
        const b = DESTINATIONS.find((x) => x.id === locs[k].destination_id);
        if (a?.coords && b?.coords) {
          const R = 6371;
          const dLat = ((b.coords.lat - a.coords.lat) * Math.PI) / 180;
          const dLng = ((b.coords.lng - a.coords.lng) * Math.PI) / 180;
          const la1 = (a.coords.lat * Math.PI) / 180;
          const la2 = (b.coords.lat * Math.PI) / 180;
          const h =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
          dayKm += 2 * R * Math.asin(Math.sqrt(h)) * 1.3;
        }
      }
      if (dayKm > bestSpan) {
        bestSpan = dayKm;
        best = i + 1;
      }
    });
    return best;
  }

  return mostStopsDay();
}
