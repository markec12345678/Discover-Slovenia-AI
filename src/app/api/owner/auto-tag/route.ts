import { NextResponse } from "next/server";
import { generateCompletion } from "@/lib/ai-client";

// POST /api/owner/auto-tag — AI predlaga kategorijo + atribute iz opisa
//
// Lastnik vnese opis svojega lokala/izdelka/izkušnje, AI pa predlaga:
// - category (ena izmed veljavnih kategorij)
// - attributes (organic, handmade, local, vegan, familyFriendly, itd.)
// - tags (prosti tagi za iskanje)
//
// Lastnik samo potrdi predloge — prihrani čas pri onboarding-u.

interface AutoTagRequest {
  type: "listing" | "product" | "experience";
  name: string;
  description: string;
  destinationName?: string;
}

interface AutoTagResult {
  category: string;
  attributes: Record<string, boolean>;
  tags: string[];
  confidence: "high" | "medium" | "low";
  source: "ai" | "fallback";
}

// Veljavne kategorije po tipu
const VALID_CATEGORIES: Record<string, string[]> = {
  listing: ["hotel", "restaurant", "activity", "shop", "wellness", "transport"],
  product: ["food", "wine", "honey", "oil", "craft", "souvenir", "other"],
  experience: ["tour", "workshop", "tasting", "outdoor", "cultural", "adventure", "wellness"],
};

// Veljavni atributi po tipu
const VALID_ATTRIBUTES: Record<string, string[]> = {
  listing: ["featured", "verified", "familyFriendly", "petFriendly", "parking", "cardPayment", "wifi"],
  product: ["organic", "handmade", "local", "vegan", "glutenFree", "shippingFree"],
  experience: ["familyFriendly", "petFriendly", "indoor", "outdoor", "beginnerFriendly", "equipment"],
};

export async function POST(request: Request) {
  let body: AutoTagRequest;
  try {
    body = (await request.json()) as AutoTagRequest;
  } catch {
    return NextResponse.json({ error: "Neveljaven JSON" }, { status: 400 });
  }

  if (!body?.name?.trim() || !body?.description?.trim()) {
    return NextResponse.json(
      { error: "Manjkajo name in description" },
      { status: 400 }
    );
  }

  if (!body.type || !["listing", "product", "experience"].includes(body.type)) {
    return NextResponse.json(
      { error: "Neveljaven type (listing | product | experience)" },
      { status: 400 }
    );
  }

  const validCats = VALID_CATEGORIES[body.type];
  const validAttrs = VALID_ATTRIBUTES[body.type];

  const systemPrompt = `Si asistent za kategorizacijo slovenskih turističnih ponudnikov. Glede na opis predlagaš kategorijo in atribute.

VRNI SAMO JSON (brez markdown, brez pojasnil):
{"category":"","attributes":{},"tags":[],"confidence":""}

Pravila:
- category: ena izmed [${validCats.join(", ")}]
- attributes: samo veljavne iz [${validAttrs.join(", ")}], vrednosti true/false
- tags: 3-5 prostih tagov (brez presledkov, lowercase) za iskanje
- confidence: "high" | "medium" | "low" glede na jasnost opisa
- Vsi tagi v slovenščini`;

  const userPrompt = `Tip: ${body.type}
Ime: ${body.name}
Opis: ${body.description}
${body.destinationName ? `Lokacija: ${body.destinationName}` : ""}

Predlagaj kategorijo, atribute in tagi.`;

  try {
    const result = await generateCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.3, jsonMode: true }
    );

    const content = result?.content;
    if (!content) {
      throw new Error("Prazen odgovor AI");
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);

    // Validiraj kategorijo
    const category = validCats.includes(parsed.category) ? parsed.category : validCats[0];

    // Validiraj atribute (samo veljavni)
    const attributes: Record<string, boolean> = {};
    for (const attr of validAttrs) {
      if (parsed.attributes && typeof parsed.attributes[attr] === "boolean") {
        attributes[attr] = parsed.attributes[attr];
      } else {
        attributes[attr] = false;
      }
    }

    // Validiraj tagi
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags
          .filter((t: unknown) => typeof t === "string" && t.length > 0)
          .slice(0, 5)
      : [];

    const confidence = ["high", "medium", "low"].includes(parsed.confidence)
      ? parsed.confidence
      : "medium";

    const tagResult: AutoTagResult = {
      category,
      attributes,
      tags,
      confidence,
      source: "ai",
    };

    console.log(`[auto-tag] AI predlog za "${body.name}" (${body.type}): category=${category}, ${Object.entries(attributes).filter(([, v]) => v).length} attrs, ${tags.length} tags`);

    return NextResponse.json(tagResult);
  } catch (error) {
    console.error("[auto-tag] AI napaka:", error);

    // Fallback: preprosto iskanje ključnih besed
    const fallback = fallbackTag(body, validCats, validAttrs);
    return NextResponse.json(fallback);
  }
}

// Fallback: keyword matching
function fallbackTag(
  body: AutoTagRequest,
  validCats: string[],
  validAttrs: string[]
): AutoTagResult {
  const text = `${body.name} ${body.description}`.toLowerCase();

  // Kategorija glede na ključne besede
  let category = validCats[0];
  const catKeywords: Record<string, string[]> = {
    hotel: ["hotel", "pension", "apartma", "soba", "namestitev"],
    restaurant: ["restavrac", "gostiln", "okrevn", "hrana", "kuhinj"],
    activity: ["aktivnost", "tura", "ogled", "pohod", "kolesar"],
    food: [" hrana", "čokolada", "med", "olje", "vino", "pivo", "klobasa"],
    wine: ["vino", "vinograd", "vinska"],
    honey: ["med", "čebela", "panj"],
    oil: ["olje", "oljčn"],
    tour: ["tura", "ogled", "voden"],
    tasting: ["degustac", "okuša"],
    outdoor: ["zunaj", "narava", "pohod", "kolesar"],
    adventure: ["avantura", "adrenalin", "rafting", "plezan"],
    wellness: ["wellness", "sauna", "masaža", "term"],
  };

  for (const [cat, keywords] of Object.entries(catKeywords)) {
    if (validCats.includes(cat) && keywords.some((kw) => text.includes(kw))) {
      category = cat;
      break;
    }
  }

  // Atributi
  const attributes: Record<string, boolean> = {};
  const attrKeywords: Record<string, string[]> = {
    organic: ["bio", "ekološk", "organik"],
    handmade: ["ročno", "handmade", "pleten"],
    local: ["lokaln", "domač"],
    vegan: ["vegansk", "vegan"],
    familyFriendly: ["družin", "otrok", "family"],
    petFriendly: ["pes", "ljubljen", "pet"],
    parking: ["parkir"],
    wifi: ["wifi", "internet"],
    indoor: ["notranj", "znotraj"],
    outdoor: ["zunaj", "na prostem"],
  };

  for (const attr of validAttrs) {
    const keywords = attrKeywords[attr] || [];
    attributes[attr] = keywords.some((kw) => text.includes(kw));
  }

  // Tags iz opisa
  const words = text.split(/\s+/).filter((w) => w.length > 4);
  const tags = Array.from(new Set(words)).slice(0, 5);

  return {
    category,
    attributes,
    tags,
    confidence: "low",
    source: "fallback",
  };
}
