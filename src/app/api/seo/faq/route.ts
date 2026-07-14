import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { generateCompletion } from "@/lib/ai-client";

// POST /api/seo/faq — generira AI FAQ Q&A pare za landing page
//
// Google rich snippets zahtevajo FAQ strukturo. AI generira 3-5 relevantnih
// Q&A parov glede na destinacijo in tip strani (things-to-do, best-time, itinerar).
//
// Cache: permanenten (data/seo-faq-cache.json) — FAQ se ne spreminja pogosto.

interface FaqRequest {
  slug: string; // npr. "bled" ali "bled/things-to-do"
  destinationName: string;
  pageType: "things-to-do" | "best-time-to-visit" | "itinerary" | "guide";
  context?: string; // dodatni kontekst (npr. "poletje" za best-time)
}

interface FaqItem {
  question: string;
  answer: string;
}

interface FaqResponse {
  faqs: FaqItem[];
  source: "ai" | "fallback" | "cache";
  cached: boolean;
}

interface CacheEntry {
  faqs: FaqItem[];
  generatedAt: number;
  source: "ai" | "fallback";
}

type CacheStore = Record<string, CacheEntry>;

const CACHE_FILE = path.join(process.cwd(), "data", "seo-faq-cache.json");

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
    console.error("[seo/faq] writeCache napaka:", error);
  }
}

const PAGE_TYPE_LABELS: Record<string, string> = {
  "things-to-do": "kaj početi in aktivnosti",
  "best-time-to-visit": "najboljši čas za obisk",
  "itinerary": "itinerer in načrt potovanja",
  "guide": "vodnik in nasvete",
};

export async function POST(request: Request) {
  let body: FaqRequest;
  try {
    body = (await request.json()) as FaqRequest;
  } catch {
    return NextResponse.json({ error: "Neveljaven JSON" }, { status: 400 });
  }

  if (!body?.slug || !body?.destinationName || !body?.pageType) {
    return NextResponse.json(
      { error: "Manjkajo slug, destinationName, pageType" },
      { status: 400 }
    );
  }

  const cacheKey = `${body.slug}:${body.pageType}`;

  // 1. Preveri cache
  const store = await readCache();
  const cached = store[cacheKey];
  if (cached) {
    return NextResponse.json({
      faqs: cached.faqs,
      source: "cache",
      cached: true,
    });
  }

  // 2. Generiraj AI FAQ
  const pageLabel = PAGE_TYPE_LABELS[body.pageType] || "splošne informacije";
  const contextStr = body.context ? ` Kontekst: ${body.context}.` : "";

  const systemPrompt = `Si SEO strokovnjak za slovensko turistično platformo. Generiraš FAQ (pogosta vprašanja) z odgovori za landing page.${contextStr}

VRNI SAMO JSON:
{"faqs":[{"question":"","answer":""}]}

Pravila:
- 4-5 vprašanj v slovenščini
- question: naravno vprašanje uporabnika (npr. "Kdaj je najboljši čas za obisk Bleda?")
- answer: 1-2 stavka, informativen, do 200 znakov
- Vprašanja naj pokrivajo: čas, ceno, aktivnosti, dostopnost, nasvete
- Brez marketinškega govora — iskreni, koristni odgovori`;

  const userPrompt = `Destinacija: ${body.destinationName}
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
      .slice(0, 5)
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

    console.log(`[seo/faq] AI generiral ${faqs.length} FAQ za "${cacheKey}" (source: ${result.source})`);

    return NextResponse.json({
      faqs,
      source: result.source === "fallback" ? "fallback" : "ai",
      cached: false,
    });
  } catch (error) {
    console.error("[seo/faq] AI napaka:", error);

    // Fallback: generični FAQ
    const fallbackFaqs = generateFallbackFaqs(body.destinationName, body.pageType);
    store[cacheKey] = {
      faqs: fallbackFaqs,
      generatedAt: Date.now(),
      source: "fallback",
    };
    await writeCache(store);

    return NextResponse.json({
      faqs: fallbackFaqs,
      source: "fallback",
      cached: false,
    });
  }
}

function generateFallbackFaqs(destinationName: string, pageType: string): FaqItem[] {
  const faqs: FaqItem[] = [];

  if (pageType === "things-to-do") {
    faqs.push(
      { question: `Kaj početi v ${destinationName}?`, answer: `${destinationName} ponuja raznolike aktivnosti — od pohodov in ogledov znamenitosti do lokalnih kulinaričnih izkušenj. Preverite naš vodnik za top priporočila.` },
      { question: `Kako priti do ${destinationName}?`, answer: `${destinationName} je dostopen z avtomobilom, javnim prevozom ali organizirano turo. Preverite povezave na spletni strani.` },
      { question: `Koliko časa nameniti za obisk ${destinationName}?`, answer: `Priporočamo vsaj 1-2 dni za osnovni obisk ${destinationName}, ali več če želite raziskati tudi okolico.` },
      { question: `Katere so glavne znamenitosti v ${destinationName}?`, answer: `Glavne znamenitosti ${destinationName} vključujejo naravne in kulturne atrakcije. Preverite naš seznam za podrobnosti.` },
    );
  } else if (pageType === "best-time-to-visit") {
    faqs.push(
      { question: `Kdaj je najboljši čas za obisk ${destinationName}?`, answer: `Najboljši čas za obisk ${destinationName} je od maja do oktobra, ko so temperature prijetne in vreme stabilno.` },
      { question: `Ali je ${destinationName} vredno obiskati pozimi?`, answer: `${destinationName} je privlačen tudi pozimi, še posebej za zimski turizem in praznično vzdušje.` },
      { question: `Kakšno je vreme v ${destinationName} poleti?`, answer: `Poletne temperature v ${destinationName} so običajno med 20-30°C, idealne za aktivnosti na prostem.` },
    );
  } else {
    faqs.push(
      { question: `Kaj moram vedeti pred obiskom ${destinationName}?`, answer: `Pred obiskom ${destinationName} preverite vreme, delovni čas znamenitosti in rezervirajte nastanitev vnaprej.` },
      { question: `Ali je ${destinationName} primeren za družine?`, answer: `${destinationName} ponuja številne družinsko prijazne aktivnosti za vse starosti.` },
    );
  }

  return faqs;
}

// GET — admin statistika cache-a
export async function GET() {
  const store = await readCache();
  const entries = Object.values(store);
  return NextResponse.json({
    total: entries.length,
    aiGenerated: entries.filter((e) => e.source === "ai").length,
    fallback: entries.filter((e) => e.source === "fallback").length,
  });
}
