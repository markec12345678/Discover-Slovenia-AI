import { NextResponse } from "next/server";
import { generateCompletion } from "@/lib/ai-client";
import { rateLimit } from "@/lib/rate-limit";

// POST /api/ai-story — generira AI zgodbo za lokalca
// Body: { name, category, destinationName?, description?, longDescription?, specialties? }
export async function POST(request: Request) {
    // Rate limit AI zgodb
    const limited = rateLimit(request, { limit: 10, windowMs: 600000, key: "ai-story" });
    if (limited) return limited;

  try {
    const body = await request.json();
    const { name, category, destinationName, description, longDescription, specialties } = body;

    if (!name || !category) {
      return NextResponse.json({ error: "Manjkata name in category" }, { status: 400 });
    }

    // CAP-FIX (revizija 1.33.0, 16-b P2): vsa polja so client-supplied in
    // grejo v AI prompt — kapirana (prej je bil neomejen le longDescription).
    const safeName = String(name).slice(0, 80);
    const safeCategory = String(category).slice(0, 60);
    const safeDest = destinationName ? ` ${String(destinationName).slice(0, 80)}` : "";
    const safeDesc = description ? String(description).slice(0, 300) : "";
    const safeLong = longDescription ? String(longDescription).slice(0, 200) : "";
    const safeSpec = Array.isArray(specialties)
      ? specialties.slice(0, 10).map((sp: unknown) => String(sp ?? "").slice(0, 60))
      : [];
    const context = [
      `Ime: ${safeName}`,
      `Kategorija: ${safeCategory}`,
      destinationName ? `Lokacija:${safeDest}` : "",
      description ? `Opis: ${safeDesc}` : "",
      longDescription ? `Podrobnosti: ${safeLong}` : "",
      safeSpec.length ? `Specialitete: ${safeSpec.join(", ")}` : "",
    ].filter(Boolean).join("\n");

    const prompt = `Si Slovenian Storyteller — pripovedovalec zgodovin slovenskih lokalcev. Napiši kratko, čustveno zgodbo o tem lokalcu.

VRNI SAMO JSON:
{
  "title": "zgodben naslov (npr. 'Med iz gozdov Bele krajine')",
  "story": "zgodba v 2-3 stavkih (čustvena, osebna, ne marketinška)",
  "highlights": ["zanimivost 1", "zanimivost 2", "zanimivost 3"]
}

Kontekst:
${context}

Pravila:
- Zgodba naj bo v slovenščini
- Naj bo čustvena in osebna (ne marketinška)
- Omeni tradicijo, lokalno kulturo ali naravo
- 2-3 stavki (ne več)`;

    const result = await generateCompletion(
      [
        { role: "system", content: "Si slovenski pripovedovalec. Pišeš čustvene, avtentične zgodbe o lokalnih ponudnikih. Vedno odgovoriš z JSON." },
        { role: "user", content: prompt },
      ],
      { temperature: 0.8, jsonMode: true, usageLog: { feature: "story" } }
    );

    if (result?.content) {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return NextResponse.json({
          title: String(parsed.title || "").substring(0, 80),
          story: String(parsed.story || "").substring(0, 300),
          highlights: Array.isArray(parsed.highlights)
            ? parsed.highlights.slice(0, 3).map((h: unknown) => String(h).substring(0, 100))
            : [],
        });
      }
    }

    // Fallback
    return NextResponse.json({
      title: name,
      story: longDescription || description || "Lokalni ponudnik z avtentično slovensko izkušnjo.",
      highlights: specialties?.slice(0, 3) || [],
    });
  } catch (error) {
    console.error("[ai-story] napaka:", error);
    return NextResponse.json({ error: "Napaka pri generiranju zgodbe" }, { status: 500 });
  }
}
