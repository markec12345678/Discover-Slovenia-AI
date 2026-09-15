import { DESTINATIONS } from "@/lib/slovenia-data";

// ============================================================================
// URL INGEST — "Začni s povezavo" (F5.4, MindTrip "Start Anywhere")
// ============================================================================
//
// Konkurenčna referenca: MindTrip-ov unikatni feature — prilepi povezavo do
// YouTube/TikTok videa ali bloga → izlušči lokacije → sestavi načrt.
//
// Naša izvedba je DETERMINISTIČNA (nič AI žetonov — deluje povsod, tudi na
// produkciji brez AI ključev): strežnik pridobi HTML povezave, ga pretvori
// v besedilo in vanj poišče imena naših 22 destinacij (s sinónimi, SL + EN,
// neobčutljivo na diakritiko). Iz zadetkov izpelje tudi predlagane interese
// (iz bestFor zadetih destinacij — preslikane v kanonične INTERESTS) in
// število dni (regex).
//
// Načelo znamke: če ne prepoznamo ničesar, rečemo TO — ne izmišljujemo
// "podobnih" destinacij. Zadetki se izrišejo uporabniku PRED generiranjem
// (preverljivost), ocena zadetkov (število omemb) je vidna.
// ============================================================================

/** Normalizacija besedila: male črke + odstranjena slovenska diakritika
 *  (č→c, š→s, ž→z; tudi Đ/Ć za hrvaško-srbske vire). */
export function normalizeText(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/č/g, "c")
    .replace(/ć/g, "c")
    .replace(/š/g, "s")
    .replace(/ž/g, "z")
    .replace(/đ/g, "d");
}

/**
 * Sinónimi/imena destinacij za prepoznavo ( primerjajo se NORMALIZIRANA,
 * zato so tukaj vpisana v izvirniku). Vključujejo EN imena (Lake Bled,
// Isonzo …) in pogoste različice. Večbesedni vzorci imajo prednost pred
 * kratkimi ( npr. "postojnska jama" pred "postojna" — obe štejeta).
 *
 * F13 ("Preveri svoj načrt"): izvoženo tudi za plan-check parser, ki
 * isto bazo vzorcev uporablja za razpoznavo postankov PO DNEVIH in
 * V VRSTNEM REDU omembe ( url-ingest šteje omembe, plan-check pa
 * potrebuje pozicije — en sam vir resnice za vzorce).
 */
export const PATTERNS: Record<string, string[]> = {
  bled: ["bled", "lake bled", "bledsko jezero", "blejsko jezero", "blejski otok", "bled island", "blejski grad", "bled castle"],
  bohinj: ["bohinj", "lake bohinj", "bohinjsko jezero", "vogel"],
  ljubljana: ["ljubljana", "ljubljanski grad", "presernov trg", "triple bridge", "trojni most", "metelkova", "tivoli park ljubljana"],
  postojna: ["postojna", "postojnska jama", "postojna cave", "predjama", "predjamski grad", "predjama castle"],
  piran: ["piran", "pirano", "tartinijev trg", "tartini square", "piranski"],
  soca: ["soca", "reka soca", "soca river", "isonzo", "trenta", "bovec"],
  triglav: ["triglav", "mount triglav", "triglavski narodni park", "triglav national park", "kredarica"],
  kobarid: ["kobarid", "caporetto", "kobariski muzej", "soska fronta", "soski fronti"],
  maribor: ["maribor", "pohorje", "lent maribor", "najstarejša trta", "oldest vine"],
  portoroz: ["portorož", "portoroz", "portorose"],
  vintgar: ["vintgar", "vintgarska soteska", "vintgar gorge", "blejska vintgar", "šum waterfall"],
  rogaska: ["rogaška slatina", "rogaska slatina", "rogaška", "rogaska"],
  ptuj: ["ptuj", "ptujski grad", "poetovio", "kurentovanje", "kurenti"],
  celje: ["celje", "celjski grobovi", "stari grad celje", "celeia"],
  "nova-gorica": ["nova gorica", "solkan", "solkan bridge", "sabotin hill"],
  "slovenj-gradec": ["slovenj gradec", "slovenjgradec"],
  dravograd: ["dravograd"],
  "murska-sobota": ["murska sobota", "prekmurje"],
  lendava: ["lendava", "lendavske gorice"],
  "novo-mesto": ["novo mesto", "novomeški"],
  otocec: ["otočeč", "otocec", "grad otočeč", "otocec castle"],
  crnomelj: ["črnomelj", "crnomelj", "bela krajina"],
};

export interface IngestMatch {
  id: string;
  name: string;
  slug: string;
  /** Število neodvisnih omemb v besedilu ( za rangiranje/prikaz) */
  count: number;
}

export interface IngestSuggestion {
  /** Predlagani interesi ( kanonični INTERESTS) */
  interests: string[];
  /** Predlagano število dni ( iz besedila ali privzeto 3) */
  days: number;
  /** ID-ji prepoznanih destinacij ( vrstni red po številu omemb) */
  preferredDestinations: string[];
}

export interface IngestResult {
  pageTitle: string | null;
  textChars: number;
  matches: IngestMatch[];
  suggestion: IngestSuggestion;
}

/** Preslikava bestFor oznak → kanonični interesi ( INTERESTS).
 *  F14 ("Uvozi shranjene točke"): izvoženo tudi za pins-ingest — en vir
 *  resnice za preslikavo interesov iz zadetih destinacij. */
export const BESTFOR_TO_INTEREST: Record<string, string> = {
  narava: "narava",
  kultura: "kultura",
  hrana: "hrana",
  vino: "hrana",
  avantura: "avantura",
  adrenalin: "adrenalin",
  romantika: "romantika",
  "družina": "družina",
  wellness: "wellness",
  zgodovina: "kultura",
  mesto: "kultura",
  pohodništvo: "narava",
  zdravje: "wellness",
  sprostitev: "wellness",
  aktivnosti: "avantura",
  mir: "narava",
  fotografija: "narava",
  festival: "kultura",
  smučanje: "avantura",
  poletje: "narava",
};

/** Število dni iz besedila ( SL+EN vzorci). */
function extractDays(text: string): number | null {
  const dayMatch = text.match(/(\d{1,2})\s*(?:dan|dnev|dni|days?)/);
  if (dayMatch) {
    const n = parseInt(dayMatch[1], 10);
    if (n >= 1 && n <= 14) return n;
  }
  if (/\b(?:weekend|vikend|vikenda)\b/.test(text)) return 2;
  if (/\b(?:teden|week|tedenski|weekly)\b/.test(text)) return 7;
  return null;
}

/**
 * Poišči destinacije v ( izvirnem) besedilu + naslovu strani.
 * Čista funkcija — brez stranskih učinkov, uporabna v testih in API routi.
 * Naslov strani šteje dvojno ( YouTube naslov je močan signal vsebine).
 */
export function matchDestinationsInText(
  text: string,
  pageTitle: string | null
): IngestResult {
  const normalized = normalizeText(text);
  const title = pageTitle ? normalizeText(pageTitle) : "";

  const matches: IngestMatch[] = [];
  for (const [id, patterns] of Object.entries(PATTERNS)) {
    let count = 0;
    for (const pattern of patterns) {
      const normalizedPattern = normalizeText(pattern);
      // Meja besed na obeh straneh ( "soca" ne ujame "socca" ali "posoca";
      //  večbesedni vzorci se ujemajo kot celota)
      const escaped = normalizedPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, "g");
      count += (normalized.match(regex) ?? []).length;
      if (title && new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`).test(title)) {
        count += 2;
      }
    }
    if (count > 0) {
      const dest = DESTINATIONS.find((d) => d.id === id);
      if (dest) {
        matches.push({ id, name: dest.name, slug: dest.slug, count });
      }
    }
  }

  // Rangiraj po številu omemb ( najbolj omenjena destinacija = najverjetneje
  // glavna tema vira)
  matches.sort((a, b) => b.count - a.count);

  // Predlagani interesi: union bestFor zadetih ( največ 4, po vrstnem redu
  // rangiranja zadetkov)
  const interestSet: string[] = [];
  for (const m of matches) {
    const dest = DESTINATIONS.find((d) => d.id === m.id);
    if (!dest) continue;
    for (const bf of dest.bestFor) {
      const canonical = BESTFOR_TO_INTEREST[bf];
      if (canonical && !interestSet.includes(canonical)) {
        interestSet.push(canonical);
      }
    }
  }

  const days = extractDays(normalized) ?? 3;

  return {
    pageTitle,
    textChars: text.length,
    matches,
    suggestion: {
      interests: interestSet.slice(0, 4),
      days,
      preferredDestinations: matches.slice(0, 8).map((m) => m.id),
    },
  };
}
