import { promises as fs } from "fs";
import path from "path";
import { generateCompletion } from "@/lib/ai-client";

/**
 * AI-generirane FAQ za SEO landing pages.
 *
 * Server component lahko direktno kliče getFaqForPage() — vrne AI FAQ
 * z permanentnim cache-om (data/seo-faq-cache.json).
 *
 * Uporablja se za Google rich snippets (FAQPage JSON-LD).
 */

interface FaqItem {
  question: string;
  answer: string;
}

interface CacheEntry {
  faqs: FaqItem[];
  generatedAt: number;
  source: "ai" | "fallback";
}

type CacheStore = Record<string, CacheEntry>;

const CACHE_FILE = path.join(process.cwd(), "data", "seo-faq-cache.json");
const CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 dni (FAQ je stabilen)

async function readCache(): Promise<CacheStore> {
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

async function writeCache(store: CacheStore): Promise<void> {
  try {
    await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(store, null, 2), "utf-8");
  } catch (error) {
    console.error("[seo-faq] writeCache napaka:", error);
  }
}

const PAGE_TYPE_LABELS: Record<string, string> = {
  "things-to-do": "kaj početi in aktivnosti",
  "best-time-to-visit": "najboljši čas za obisk",
  "itinerary": "itinerer in načrt potovanja",
  "guide": "vodnik in nasvete",
};

/**
 * Vrne AI-generirane FAQ za landing page.
 * Najprej preveri cache (90 dni TTL), nato generira z AI.
 * Fallback na generične FAQ če AI odpove.
 */
export async function getFaqForPage(
  slug: string,
  destinationName: string,
  pageType: "things-to-do" | "best-time-to-visit" | "itinerary" | "guide",
  context?: string
): Promise<{ faqs: FaqItem[]; source: "ai" | "fallback" | "cache" }> {
  const cacheKey = `${slug}:${pageType}`;

  // 1. Preveri cache
  const store = await readCache();
  const cached = store[cacheKey];
  if (cached && Date.now() - cached.generatedAt < CACHE_TTL_MS) {
    return { faqs: cached.faqs, source: "cache" };
  }

  // 2. Generiraj AI FAQ
  const pageLabel = PAGE_TYPE_LABELS[pageType] || "splošne informacije";
  const contextStr = context ? ` Kontekst: ${context}.` : "";

  const systemPrompt = `Si SEO strokovnjak za slovensko turistično platformo. Generiraš FAQ (pogosta vprašanja) z odgovori za landing page.${contextStr}

VRNI SAMO JSON:
{"faqs":[{"question":"","answer":""}]}

Pravila:
- 4 vprašanja v slovenščini
- question: naravno vprašanje uporabnika (npr. "Kdaj je najboljši čas za obisk Bleda?")
- answer: 1-2 stavka, informativen, do 200 znakov
- Vprašanja naj pokrivajo: čas, ceno, aktivnosti, dostopnost, nasvete
- Brez marketinškega govora — iskreni, koristni odgovori`;

  const userPrompt = `Destinacija: ${destinationName}
Tip strani: ${pageLabel}

Generiraj FAQ za to destinacijo in tip strani.`;

  try {
    const result = await generateCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.4, jsonMode: true }
    );

    const content = result?.content;
    if (!content) throw new Error("Prazen odgovor");

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);

    const faqs: FaqItem[] = (parsed.faqs || [])
      .filter((f: FaqItem) => f.question && f.answer)
      .slice(0, 4)
      .map((f: FaqItem) => ({
        question: String(f.question).substring(0, 150),
        answer: String(f.answer).substring(0, 300),
      }));

    if (faqs.length === 0) {
      throw new Error("AI ni vrnil veljavnih FAQ-ov");
    }

    // 3. Shrani v cache
    store[cacheKey] = {
      faqs,
      generatedAt: Date.now(),
      source: "ai",
    };
    await writeCache(store);

    console.log(`[seo-faq] AI generiral ${faqs.length} FAQ za "${cacheKey}"`);

    return { faqs, source: "ai" };
  } catch (error) {
    console.error("[seo-faq] AI napaka:", error);

    // Fallback
    const fallbackFaqs = generateFallbackFaqs(destinationName, pageType);
    store[cacheKey] = {
      faqs: fallbackFaqs,
      generatedAt: Date.now(),
      source: "fallback",
    };
    await writeCache(store);

    return { faqs: fallbackFaqs, source: "fallback" };
  }
}

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
