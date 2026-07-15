import { NextResponse } from "next/server";
import { DESTINATIONS } from "@/lib/slovenia-data";
import { db } from "@/lib/db";
import { generateCompletion } from "@/lib/ai-client";

// POST /api/smart-search — naravno-jezikovno iskanje po platformi
//
// Uporabnik napiše naravni jezik, npr.:
// - "miren vikend ob reki"
// - "kam z otroki če dežuje"
// - "romantična večerja blizu Bleda"
// - "avantura v gorah z družino"
//
// AI (GLM) razume namen in vrne matching:
// - destinacije
// - lokale (listings)
// - izdelke (products)
// - izkušnje (experiences)
//
// Rezultat je strukturiran z razlago (zakaj je AI izbral te iteme).

interface SmartSearchRequest {
  query: string;
  limit?: number; // default 3 per kategorijo
}

interface SearchResults {
  destinations: Array<{ id: string; name: string; tagline: string; reason: string }>;
  listings: Array<{ id: string; name: string; category: string; reason: string }>;
  products: Array<{ id: string; name: string; category: string; reason: string }>;
  experiences: Array<{ id: string; name: string; category: string; reason: string }>;
  summary: string;
  source: "ai" | "fallback";
}

export async function POST(request: Request) {
  let body: SmartSearchRequest;
  try {
    body = (await request.json()) as SmartSearchRequest;
  } catch {
    return NextResponse.json({ error: "Neveljaven JSON" }, { status: 400 });
  }

  const query = body?.query?.trim();
  if (!query) {
    return NextResponse.json(
      { error: "Manjka iskalni niz (query)" },
      { status: 400 }
    );
  }

  const limit = Math.min(Math.max(body.limit ?? 3, 1), 5);

  // === PRIDOBI VSE ITEME IZ BAZE ===
  const [allListings, allProducts, allExperiences] = await Promise.all([
    db.listing.findMany({
      select: {
        id: true, name: true, category: true, destinationName: true,
        description: true, rating: true, priceRange: true,
      },
      orderBy: [{ featured: "desc" }, { rating: "desc" }],
      take: 50,
    }).catch(() => []),
    db.product.findMany({
      select: {
        id: true, name: true, category: true, destinationName: true,
        description: true, price: true, rating: true,
        organic: true, handmade: true, vegan: true,
      },
      orderBy: [{ featured: "desc" }, { rating: "desc" }],
      take: 50,
    }).catch(() => []),
    db.experience.findMany({
      select: {
        id: true, name: true, category: true, destinationName: true,
        description: true, pricePerPerson: true, rating: true,
        familyFriendly: true, durationHours: true,
      },
      orderBy: [{ featured: "desc" }, { rating: "desc" }],
      take: 50,
    }).catch(() => []),
  ]);

  // === AI RAZUME NAMEN ===
  // Omejimo kontekst na top 15 per kategorijo (da AI ne generira predolgega JSON)
  const destContext = DESTINATIONS.slice(0, 22).map((d) =>
    `${d.id}|${d.name}|${d.tagline}|${d.bestFor.slice(0, 2).join(",")}`
  ).join("\n");

  const listingsContext = allListings.slice(0, 15).map((l) =>
    `${l.id}|${l.name}|${l.category}|${l.destinationName || ""}|${l.description.substring(0, 60)}`
  ).join("\n");

  const productsContext = allProducts.slice(0, 15).map((p) =>
    `${p.id}|${p.name}|${p.category}|${p.destinationName || ""}|${p.description.substring(0, 60)}`
  ).join("\n");

  const experiencesContext = allExperiences.slice(0, 15).map((e) =>
    `${e.id}|${e.name}|${e.category}|${e.destinationName || ""}|${e.description.substring(0, 60)}|${e.familyFriendly ? "family" : "no"}`
  ).join("\n");

  const systemPrompt = `Si iskalni asistent za slovensko turistično platformo. Razumeš naravnojezikovne poizvedbe in vrneš najbolj relevantne rezultate.

VRNI SAMO JSON (brez markdown, brez pojasnil):
{"destinations":[{"id":"","name":"","tagline":"","reason":""}],"listings":[{"id":"","name":"","category":"","reason":""}],"products":[{"id":"","name":"","category":"","reason":""}],"experiences":[{"id":"","name":"","category":"","reason":""}],"summary":""}

Pravila:
- Do ${limit} rezultatov na kategorijo, prazen [] če ni ujemanja
- reason: do 60 znakov, zakaj je relevantno
- summary: 1 stavek v slovenščini
- Samo ID-ji iz spodnje baze

DESTINACIJE:
${destContext}

LOKALCI:
${listingsContext}

IZDELKI:
${productsContext}

IZKUŠNJE:
${experiencesContext}`;

  const userPrompt = `Poizvedba: "${query}"

Vrni JSON z najbolj ujemajočimi se rezultati.`;

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

    // Validiraj in filtriraj rezultate (samo veljavni ID-ji)
    const validDestIds = new Set(DESTINATIONS.map((d) => d.id));
    const validListingIds = new Set(allListings.map((l) => l.id));
    const validProductIds = new Set(allProducts.map((p) => p.id));
    const validExperienceIds = new Set(allExperiences.map((e) => e.id));

    const results: SearchResults = {
      destinations: (parsed.destinations || [])
        .filter((d: { id: string }) => validDestIds.has(d.id))
        .slice(0, limit),
      listings: (parsed.listings || [])
        .filter((l: { id: string }) => validListingIds.has(l.id))
        .slice(0, limit),
      products: (parsed.products || [])
        .filter((p: { id: string }) => validProductIds.has(p.id))
        .slice(0, limit),
      experiences: (parsed.experiences || [])
        .filter((e: { id: string }) => validExperienceIds.has(e.id))
        .slice(0, limit),
      summary: parsed.summary || `Rezultati za: "${query}"`,
      source: "ai",
    };

    console.log(`[smart-search] AI uspešno (source: ${result.source}) — query: "${query}" — najdeno: ${results.destinations.length}d ${results.listings.length}l ${results.products.length}p ${results.experiences.length}e`);

    return NextResponse.json(results);
  } catch (error) {
    console.error("[smart-search] AI napaka:", error);

    // Fallback: preprosto iskanje po keyword
    const fallbackResults = fallbackSearch(query, allListings, allProducts, allExperiences, limit);
    return NextResponse.json(fallbackResults);
  }
}

// Preprosto keyword iskanje (fallback)
function fallbackSearch(
  query: string,
  listings: Array<{ id: string; name: string; category: string; description: string }>,
  products: Array<{ id: string; name: string; category: string; description: string }>,
  experiences: Array<{ id: string; name: string; category: string; description: string }>,
  limit: number
): SearchResults {
  const q = query.toLowerCase();
  const words = q.split(/\s+/).filter((w) => w.length > 2);

  const matchScore = (text: string) => {
    const lower = text.toLowerCase();
    return words.reduce((score, word) => score + (lower.includes(word) ? 1 : 0), 0);
  };

  const matchedListings = listings
    .map((l) => ({ ...l, score: matchScore(`${l.name} ${l.description}`) }))
    .filter((l) => l.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ id, name, category }) => ({ id, name, category, reason: "Ujema se z iskalnim nizom" }));

  const matchedProducts = products
    .map((p) => ({ ...p, score: matchScore(`${p.name} ${p.description}`) }))
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ id, name, category }) => ({ id, name, category, reason: "Ujema se z iskalnim nizom" }));

  const matchedExperiences = experiences
    .map((e) => ({ ...e, score: matchScore(`${e.name} ${e.description}`) }))
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ id, name, category }) => ({ id, name, category, reason: "Ujema se z iskalnim nizom" }));

  // Destinacije
  const matchedDests = DESTINATIONS
    .map((d) => ({ ...d, score: matchScore(`${d.name} ${d.tagline} ${d.activities.join(" ")} ${d.bestFor.join(" ")}`) }))
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ id, name, tagline }) => ({ id, name, tagline, reason: "Ujema se z iskalnim nizom" }));

  return {
    destinations: matchedDests,
    listings: matchedListings,
    products: matchedProducts,
    experiences: matchedExperiences,
    summary: `Rezultati za: "${query}"`,
    source: "fallback",
  };
}
