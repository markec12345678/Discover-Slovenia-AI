import { NextResponse } from "next/server";
import { generateCompletion } from "@/lib/ai-client";

// POST /api/translate — AI prevajalni pomočnik za developerje
//
// Ko developer doda nov UI string v slovenščini, ta endpoint vrne
// prevode v en, de, it. Uporablja se med razvojem za dodajanje
// novih prevodov v messages/*.json datoteke.
//
// Cache: ne (prevodi so za developerje, ne za production uporabo)

interface TranslateRequest {
  text: string;
  source?: string; // default "sl"
  targets?: string[]; // default ["en", "de", "it"]
  context?: string; // npr. "navigation", "footer", "CTA button"
}

interface TranslateResult {
  translations: Record<string, string>;
  source: "ai" | "fallback";
}

const LANGUAGE_LABELS: Record<string, string> = {
  sl: "slovenščina",
  en: "English",
  de: "Deutsch",
  it: "Italiano",
};

export async function POST(request: Request) {
  let body: TranslateRequest;
  try {
    body = (await request.json()) as TranslateRequest;
  } catch {
    return NextResponse.json({ error: "Neveljaven JSON" }, { status: 400 });
  }

  const text = body?.text?.trim();
  if (!text) {
    return NextResponse.json(
      { error: "Manjka text za prevod" },
      { status: 400 }
    );
  }

  const sourceLang = body.source || "sl";
  const targets = body.targets || ["en", "de", "it"];
  const context = body.context || "UI element turistične platforme";

  const sourceLabel = LANGUAGE_LABELS[sourceLang] || sourceLang;
  const targetLabels = targets.map((t) => `${t} (${LANGUAGE_LABELS[t] || t})`).join(", ");

  const systemPrompt = `Si profesionalni prevajalec za slovensko turistično platformo "I Feel Slovenia". Prevajaš UI nize (gumbi, naslovi, opisi).

VRNI SAMO JSON:
{"en":"","de":"","it":""}

Pravila:
- Naravni, tekoči prevodi (ne dobesedni)
- Kontekst: ${context}
- Ohrani ton (prijazen, profesionalen)
- UI kratki nizi naj ostanejo kratki
- Brez pojasnil, samo JSON`;

  const userPrompt = `Izvirnik (${sourceLabel}): "${text}"

Prevedi v: ${targetLabels}`;

  try {
    const result = await generateCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.3, jsonMode: true }
    );

    const content = result?.content;
    if (!content) throw new Error("Prazen odgovor");

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);

    const translations: Record<string, string> = {};
    for (const target of targets) {
      if (parsed[target] && typeof parsed[target] === "string") {
        translations[target] = parsed[target].trim();
      }
    }

    if (Object.keys(translations).length === 0) {
      throw new Error("AI ni vrnil veljavnih prevodov");
    }

    console.log(`[translate] "${text.substring(0, 40)}..." → ${Object.keys(translations).length} prevodov (source: ${result.source})`);

    const translateResult: TranslateResult = {
      translations,
      source: result.source === "fallback" ? "fallback" : "ai",
    };

    return NextResponse.json(translateResult);
  } catch (error) {
    console.error("[translate] AI napaka:", error);

    // Fallback: preprost slovar pogostih besed
    const fallbackTranslations: Record<string, string> = {};
    for (const target of targets) {
      fallbackTranslations[target] = text; // vrni original kot fallback
    }

    return NextResponse.json({
      translations: fallbackTranslations,
      source: "fallback",
    });
  }
}

// GET — dokumentacija endpointa
export async function GET() {
  return NextResponse.json({
    endpoint: "/api/translate",
    description: "AI prevajalni pomočnik za developerje",
    usage: {
      method: "POST",
      body: {
        text: "string (obvezno) — besedilo za prevod",
        source: "string (default: 'sl') — izvirni jezik",
        targets: "string[] (default: ['en', 'de', 'it']) — ciljni jeziki",
        context: "string (optional) — kontekst (npr. 'navigation', 'CTA')",
      },
      response: {
        translations: "Record<string, string> — prevodi po jezikih",
        source: "'ai' | 'fallback'",
      },
    },
    supportedLanguages: Object.keys(LANGUAGE_LABELS),
    example: {
      request: {
        text: "Načrtuj potovanje",
        source: "sl",
        targets: ["en", "de", "it"],
        context: "CTA button v navigaciji",
      },
      response: {
        translations: {
          en: "Plan your trip",
          de: "Reise planen",
          it: "Pianifica il viaggio",
        },
        source: "ai",
      },
    },
  });
}
