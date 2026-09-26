import { DESTINATIONS } from "@/lib/slovenia-data";
import type { Destination } from "@/lib/types";

/**
 * DETERMINISTIČNI FAQ graditelj za SEO landing strani (Issue #9 ZERO-AI).
 *
 * Server component lahko direktno kliče getFaqForPage() — vrne FAQ,
 * ZGRADENJEN iz realnih strukturiranih podatkov DESTINATIONS
 * (dejavnosti, znamenitosti, tagline, trajanje). Nič AI, nič omrežja,
 * nič predpomnilnika datotek — enak odgovor za enak vhod, takojšnji
 * (prejšnja različica je ob cache miss BLOKIRALA SSR z AI klicem in
 * pisala 90-dnevni strup v data/seo-faq-cache.json — oboje odstranjeno).
 *
 * Uporablja se za Google rich snippets (FAQPage JSON-LD).
 *
 * Vsa vsebina je IZKLJUČNO iz realnih podatkov — NIČ izmišljanja.
 */

interface FaqItem {
  question: string;
  answer: string;
}

/** Omejitve (nespremenjene): vprašanje ≤ 150, odgovor ≤ 300 znakov. */
function capQuestion(q: string): string {
  return q.substring(0, 150);
}

function capAnswer(a: string): string {
  return a.substring(0, 300);
}

/** Sloveniško spoji seznam ("a", "b" in "c"). */
function joinSl(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} in ${items[items.length - 1]}`;
}

// ============================================================================
// TAKSONOMIJA AKTIVNOSTI — klasifikacija REALNIH aktivnosti destinacije v
// tipe doživetij (deterministična pravila, 0 izmišljanja)
// ============================================================================

const ACTIVITY_TYPE_KEYWORDS: Array<{ label: string; keywords: string[] }> = [
  { label: "pohodniške", keywords: ["pohod", "sprehod", "hiking", "trail", "planina", "gora", "trek"] },
  { label: "vodne", keywords: ["plavanje", "vožnja", "čoln", "pletna", "kajak", "rafting", "sup", "splav"] },
  { label: "kolesarske", keywords: ["kolo", "kolesar"] },
  { label: "kulturne in zgodovinske", keywords: ["grad", "muzej", "galerija", "cerkev", "ogled", "znamenitost", "tura", "kultura", "zgodovina"] },
  { label: "zimske", keywords: ["smuč", "sankanje", "zim"] },
  { label: "kulinarčne", keywords: ["degust", "okuš", "okus", "hrana", "kulinarič", "vino", "kava", "brunch"] },
  { label: "relaksacijske", keywords: ["wellness", "masaža", "vrelci", "term", "spa", "kopel"] },
  { label: "adrenalinske", keywords: ["adrenalin", "plezanje", "zip", "padalo", "paragliding", "spust"] },
];

/** Razvrsti realne aktivnosti destinacije v tipe doživetij (stabilni vrstni red). */
function classifyActivityTypes(dest: Destination): string[] {
  const found: string[] = [];
  for (const { label, keywords } of ACTIVITY_TYPE_KEYWORDS) {
    const matches = dest.activities.some((a) => {
      const lower = a.toLowerCase();
      return keywords.some((kw) => lower.includes(kw));
    });
    if (matches) found.push(label);
  }
  return found;
}

// ============================================================================
// GLAVNI GRADITELJ — FAQ iz realnih podatkov destinacije
// ============================================================================

/**
 * Vrne DETERMINISTIČNE FAQ za landing page — takojšnje (async ostaja zaradi
 * kompatibilnosti klicalnika: src/app/destinacija/[slug]/things-to-do).
 *
 * Znana destinacija + "things-to-do": 4 FAQ iz dejavnosti, znamenitosti,
 * tagline-ja in trajanja iz slovenia-data. Neznana destinacija ali drug tip
 * strani: obstoječe generične predloge (generateFallbackFaqs).
 */
export async function getFaqForPage(
  slug: string,
  destinationName: string,
  pageType: "things-to-do" | "best-time-to-visit" | "itinerary" | "guide",
  context?: string
): Promise<{ faqs: FaqItem[]; source: "deterministic" }> {
  // context je ohranjen v podpisu zaradi kompatibilnosti; deterministični
  // graditelj ne potrebuje dodatnega konteksta (podatki so struktuirani).
  void context;

  const dest =
    DESTINATIONS.find((d) => d.slug === slug) ??
    DESTINATIONS.find((d) => d.name === destinationName) ??
    null;

  if (pageType === "things-to-do" && dest) {
    return { faqs: buildThingsToDoFaqs(dest), source: "deterministic" };
  }

  return {
    faqs: generateFallbackFaqs(destinationName, pageType),
    source: "deterministic",
  };
}

/** 4 FAQ za "things-to-do" — izključno iz realnih polj destinacije. */
function buildThingsToDoFaqs(dest: Destination): FaqItem[] {
  // 1. Dejavnosti — top 4–6 realnih aktivnosti
  const acts = dest.activities.slice(0, 6);
  const actAnswer =
    acts.length > 0
      ? `V ${dest.name} med najbolj priljubljene aktivnosti spadajo: ${joinSl(acts)}. ${dest.tagline}`
      : `${dest.name} — ${dest.tagline}.`;
  const actQuestion =
    acts.length > 0
      ? `Kaj lahko počnem v ${dest.name}?`
      : `Kaj lahko počnem v ${dest.name}?`;

  // 2. Posebnosti — iz znamenitosti in tagline-a
  const hl = dest.highlights.slice(0, 4);
  const specialAnswer =
    hl.length > 0
      ? `${dest.name} je znan po: ${joinSl(hl)}. ${dest.tagline}`
      : `${dest.name} — ${dest.tagline}.`;
  const specialQuestion = `Kaj je posebnega ${dest.name}?`;

  // 3. Trajanje — iz hinta o trajanju (ali poštena generična)
  const durationAnswer = dest.duration
    ? `Za obisk ${dest.name} priporočamo ${dest.duration}.`
    : `Priporočamo vsaj 1–2 dni za osnovni obisk ${dest.name}.`;
  const durationQuestion = `Koliko časa potrebujem za ${dest.name}?`;

  // 4. Tipi doživetij — klasifikacija realnih aktivnosti
  const types = classifyActivityTypes(dest);
  const typeAnswer =
    types.length > 0
      ? `Na voljo so predvsem ${joinSl(types)} aktivnosti — med drugim ${joinSl(dest.activities.slice(0, 3))}.`
      : `Na voljo so aktivnosti, kot so ${joinSl(dest.activities.slice(0, 4))}.`;
  const typeQuestion = `Kateri tipi doživetij so na voljo?`;

  return [
    { question: capQuestion(actQuestion), answer: capAnswer(actAnswer) },
    { question: capQuestion(specialQuestion), answer: capAnswer(specialAnswer) },
    { question: capQuestion(durationQuestion), answer: capAnswer(durationAnswer) },
    { question: capQuestion(typeQuestion), answer: capAnswer(typeAnswer) },
  ];
}

/** Generične predloge (osnova nespremenjena) — neznana destinacija / drug tip strani. */
function generateFallbackFaqs(destinationName: string, pageType: string): FaqItem[] {
  if (pageType === "things-to-do") {
    return [
      { question: `Kaj početi v ${destinationName}?`, answer: `${destinationName} ponuja raznolike aktivnosti — od pohodov in ogledov znamenitosti do lokalnih kulinaričnih izkušenj.` },
      { question: `Kako priti do ${destinationName}?`, answer: `${destinationName} je dostopen z avtomobilom ali javnim prevozom. Preverite povezave na spletni strani.` },
      { question: `Koliko časa nameniti za obisk?`, answer: `Priporočamo vsaj 1-2 dni za osnovni obisk ${destinationName}.` },
      { question: `Katere so glavne znamenitosti?`, answer: `Glavne znamenitosti ${destinationName} vključujejo naravne in kulturne atrakcije.` },
    ];
  }
  return [
    { question: `Kaj moram vedeti pred obiskom ${destinationName}?`, answer: `Preverite vreme, delovni čas in rezervirajte nastanitev vnaprej.` },
    { question: `Ali je ${destinationName} primeren za družine?`, answer: `${destinationName} ponuja družinsko prijazne aktivnosti za vse starosti.` },
  ];
}
