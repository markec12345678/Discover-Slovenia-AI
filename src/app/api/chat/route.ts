import { NextResponse } from "next/server";
import { DESTINATIONS } from "@/lib/slovenia-data";
import { db } from "@/lib/db";
import { generateCompletion } from "@/lib/ai-client";
import { rateLimit } from "@/lib/rate-limit";
import { wrapProviderData, SYSTEM_DATA_GUARD } from "@/lib/ai-context";

// POST /api/chat — AI chatbot z dostopom do vsebine platforme
//
// Chatbot pozna:
// - 22 slovenskih destinacij (Bled, Ljubljana, Piran, ...)
// - 26 lokalov (hoteli, restavracije, aktivnosti)
// - 28 izdelkov (kulinarika, obrt, spominki)
// - 28 izkušenj (turi, degustacije, avanture)
// - 30 dogodkov (festivalji, šport, kultura)
// - AI itinerer (lahko svetuje pri načrtovanju)
//
// Kontekst se gradi iz baze in pošlje GLM-ju.
// Omejitev: samo 10 najboljših listings/products/experiences (da token limit ne pade).

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  currentPage?: string; // npr. "homepage", "destinations", "marketplace"
  /** FW4.3-2: jezik AI odgovora ("en" → angleški systemPrompt; default "sl") */
  language?: "sl" | "en";
}

export async function POST(request: Request) {
    // Rate limit AI klepetalnika (stroškovna zaščita)
    const limited = rateLimit(request, { limit: 20, windowMs: 600000, key: "ai-chat" });
    if (limited) return limited;

  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return NextResponse.json({ error: "Neveljaven JSON" }, { status: 400 });
  }

  if (!body?.messages?.length) {
    return NextResponse.json(
      { error: "Manjkajo sporočila (messages)" },
      { status: 400 }
    );
  }

  // Vzami samo zadnjih 6 sporočil (da ohranimo kontekst a ne presežemo token limit)
  const recentMessages = body.messages.slice(-6);
  const lastUserMessage = [...recentMessages].reverse().find((m) => m.role === "user")?.content || "";

  // FW4.3-2: jezik AI izpisa — client pošlje locale (enak vzorec kot
  // /api/itinerary): "en" → angleški asistent, vse ostalo ostaja slovensko.
  const lang = body.language === "en" ? "en" : "sl";

  // === GRADI KONTEKST IZ BAZE ===
  const [topListings, topProducts, topExperiences] = await Promise.all([
    db.listing.findMany({
      where: { status: "published", featured: true },
      take: 10,
      select: {
        name: true, category: true, destinationName: true,
        description: true, rating: true, priceRange: true,
      },
      orderBy: { rating: "desc" },
    }).catch(() => []),
    db.product.findMany({
      where: { status: "published", featured: true },
      take: 10,
      select: {
        name: true, category: true, destinationName: true,
        description: true, price: true, rating: true,
      },
      orderBy: { rating: "desc" },
    }).catch(() => []),
    db.experience.findMany({
      where: { status: "published", featured: true },
      take: 10,
      select: {
        name: true, category: true, destinationName: true,
        description: true, pricePerPerson: true, rating: true,
      },
      orderBy: { rating: "desc" },
    }).catch(() => []),
  ]);

  // Destinacije (vse 22)
  const destContext = DESTINATIONS.slice(0, 22).map((d) =>
    `- ${d.name} (${d.region}): ${d.tagline}. Aktivnosti: ${d.activities.slice(0, 4).join(", ")}. Najboljše za: ${d.bestFor.slice(0, 3).join(", ")}.`
  ).join("\n");

  // P3c-4: vsaka vrstica ponudniške vsebine (ime + opis + meta lokalov /
  // izdelkov / izkušenj) je OVITA v <podatek> oznako — system sporočilo
  // spodaj vsebuje SYSTEM_DATA_GUARD, ki modelu naloži, da je to IZKLJUČNO
  // podatek, ne navodilo (prompt injection obramba).
  const listingsContext = topListings.map((l) =>
    wrapProviderData(
      "lokal",
      `- ${l.name} (${l.category})${l.destinationName ? ` v ${l.destinationName}` : ""}: ${l.description.substring(0, 80)}. ${l.priceRange ? `Cena: ${l.priceRange}.` : ""} Ocena: ${l.rating}/5.`
    )
  ).join("\n");

  const productsContext = topProducts.map((p) =>
    wrapProviderData(
      "izdelek",
      `- ${p.name} (${p.category})${p.destinationName ? ` iz ${p.destinationName}` : ""}: ${p.description.substring(0, 80)}. Cena: €${p.price}. Ocena: ${p.rating}/5.`
    )
  ).join("\n");

  const experiencesContext = topExperiences.map((e) =>
    wrapProviderData(
      "izkušnja",
      `- ${e.name} (${e.category})${e.destinationName ? ` v ${e.destinationName}` : ""}: ${e.description.substring(0, 80)}. Cena: €${e.pricePerPerson}/osebo. Ocena: ${e.rating}/5.`
    )
  ).join("\n");

  const pageContext = body.currentPage
    ? lang === "en"
      ? `\nYOU ARE CURRENTLY ON THE PAGE: ${body.currentPage} (adapt your answer to the page context)`
      : `\nUPORABNIK JE TRENUTNO NA STRANI: ${body.currentPage} (prilagodi odgovor kontekstu strani)`
    : "";

  // FW4.3-2: ogledje sistemsko sporočilo glede na jezik — enaka struktura,
  // enaka varnostna pravila (SYSTEM_DATA_GUARD, <podatek> ovijanje ostane).
  const systemPrompt =
    lang === "en"
      ? `You are "Slovenia AI" — a friendly, expert assistant for the travel platform "Discover Slovenia AI". You help users plan trips around Slovenia.

YOU KNOW ALL ABOUT SLOVENIA:
- 22 destinations from Bled to Piran
- Local providers (hotels, restaurants, activities)
- Products (food, crafts, souvenirs)
- Experiences (tours, tastings, adventures)
- AI itinerary (you can advise on planning)

AVAILABLE DESTINATIONS:
${destContext}

TOP LISTINGS (featured):
${listingsContext}

TOP PRODUCTS (featured):
${productsContext}

TOP EXPERIENCES (featured):
${experiencesContext}${pageContext}

RULES:
1. Reply in English (unless the user writes in another language)
2. Be friendly but concise (no more than 3-4 paragraphs)
3. Recommend concrete destinations/listings/products from the list above
4. If the user asks about something that is not in the database, be honest and suggest an alternative
5. If they ask about an itinerary, point them to the "AI planner" (/nacrtuj)
6. If they ask about bookings, explain that these happen directly with the provider (redirect model)
7. Never make up data — if you don't know, say so
8. Use emoji for friendliness (🏔️ 🍷 🚴‍♂️ 🏛️) but don't overdo it

${SYSTEM_DATA_GUARD}`
      : `Si "Slovenija AI" — prijazen, strokovni asistent za turistično platformo "Discover Slovenia AI". Pomagaš uporabnikom načrtovati potovanje po Sloveniji.

VEŠ VSE O SLOVENIJI:
- 22 destinacij od Bleda do Pirana
- Lokalni ponudniki (hoteli, restavracije, aktivnosti)
- Izdelki (kulinarika, obrt, spominki)
- Izkušnje (turi, degustacije, avanture)
- AI itinerer (lahko svetuješ pri načrtovanju)

RAZPOLOŽLJIVE DESTINACIJE:
${destContext}

TOP LOKALCI (featured):
${listingsContext}

TOP IZDELKI (featured):
${productsContext}

TOP IZKUŠNJE (featured):
${experiencesContext}${pageContext}

PRAVILA:
1. Odgovarjaj v slovenščini (razen če uporabnik piše v drugem jeziku)
2. Bodisi prijazen, a jedrnat (ne več kot 3-4 odstavke)
3. Priporočaj konkretne destinacije/lokale/izdelke iz zgornjega seznama
4. Če uporabnik sprašuje o nečem kar ni v bazi, bodisi iskren in predlagaj alternativo
5. Če sprašuje o itinererju, usmeri ga na "AI načrtovalec" (/načrtuj)
6. Če sprašuje o rezervacijah, pojasni da poteka direktno pri ponudniku (redirect model)
7. Nikoli ne izmišljaj podatkov — če ne veš, reci
8. Uporabljaj emoji za prijaznost (🏔️ 🍷 🚴‍♂️ 🏛️) a ne pretiravaj

${SYSTEM_DATA_GUARD}`;

  // Zgradi pogovor za AI
  const aiMessages = [
    { role: "system" as const, content: systemPrompt },
    // Dodaj assistant intro za prvo sporočilo (v jeziku uporabnika)
    ...(recentMessages.length === 1 && recentMessages[0].role === "user"
      ? [{
          role: "assistant" as const,
          content:
            lang === "en"
              ? "Hello! I'm Slovenia AI 🇸🇮 — your personal guide to Slovenia. How can I help you plan your trip?"
              : "Pozdravljen! Sem Slovenija AI 🇸🇮 — vaš osebni vodič po Sloveniji. Kako vam lahko pomagam pri načrtovanju potovanja?",
        }]
      : []),
    ...recentMessages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  try {
    const result = await generateCompletion(aiMessages, {
      temperature: 0.7,
    });

    const content = result?.content;
    if (!content) {
      throw new Error("Prazen odgovor AI");
    }

    console.log(`[chat] AI odgovor (source: ${result.source}) — vprašanje: "${lastUserMessage.substring(0, 60)}..."`);

    return NextResponse.json({
      message: content,
      source: result.source,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[chat] AI napaka:", error);

    // Fallback — preprost deterministični odgovor (v jeziku pogovora)
    const fallback = generateFallbackResponse(lastUserMessage, lang);
    return NextResponse.json({
      message: fallback,
      source: "fallback",
      timestamp: new Date().toISOString(),
    });
  }
}

// Preprost fallback — brez AI, samo pattern matching (dvojezično)
function generateFallbackResponse(userMessage: string, lang: "sl" | "en"): string {
  const msg = userMessage.toLowerCase();

  if (lang === "en") {
    if (msg.includes("bled")) {
      return "Bled is Slovenia's most recognisable postcard view 🏔️ — a medieval castle, an island with a church and crystal-clear water. I recommend visiting early in the morning to avoid the crowds. For AI planning, visit the Plan page.";
    }
    if (msg.includes("ljubljan")) {
      return "Ljubljana is our capital 🏛️ — a city with a castle on the hill, the Triple Bridge and a lively old town. For culinary adventures try the Ljubljana food tour in the experiences section.";
    }
    if (msg.includes("piran") || msg.includes("coast")) {
      return "Piran is a Venetian coastal town 🌊 with narrow alleys and the lovely Tartini Square. Ideal for a romantic trip. For accommodation, check the local hotels in our database.";
    }
    if (msg.includes("itiner") || msg.includes("plan")) {
      return "For AI trip planning, visit the Plan page. The AI will consider your budget, interests and season and put together the perfect plan.";
    }
    if (msg.includes("wine") || msg.includes("food") || msg.includes("culinary")) {
      return "Slovenian cuisine is wonderfully diverse 🍷 — from coastal wines to Prekmurje classics. I recommend tastings in the Vipava Valley or Maribor. Check our marketplace for local products.";
    }
    if (msg.includes("hello") || msg.includes("hi") || msg.includes("hey")) {
      return "Hello! 🇸🇮 I'm Slovenia AI. How can I help you plan your trip around Slovenia?";
    }

    return "I'm Slovenia AI 🇸🇮. I can help with information about destinations, listings, products and experiences across Slovenia. For a complete travel plan, visit our AI planner on the Plan page.";
  }

  if (msg.includes("bled")) {
    return "Bled je najbolj prepoznavna slovenska razglednica 🏔️. Srednjeveški grad, otok s cerkvijo in kristalno čista voda. Priporočam obisk zgodaj zjutraj za manj ljudi. Za AI načrtovanje obiščite strani Načrtuj.";
  }
  if (msg.includes("ljubljan")) {
    return "Ljubljana je naša prestolnica 🏛️ — mesto z gradom na hribu, Tromostovjem in živahnim starim mestnim jedrom. Za kulinarične dogodivščine preizkusite turo po Ljubljani v sekciji izkušenj.";
  }
  if (msg.includes("piran") || msg.includes("obal")) {
    return "Piran je venecijansko obalno mesto 🌊 s ozkimi uličicami in čudovitim Trgom Tartini. Idealno za romantični izlet. Za namestitev preverite lokalne hotele v naši bazi.";
  }
  if (msg.includes("itiner") || msg.includes("načrt")) {
    return "Za AI načrtovanje potovanja obiščite strani Načrtuj. AI bo upošteval vaš proračun, interese in sezono ter sestavil popoln načrt.";
  }
  if (msg.includes("víno") || msg.includes("vino") || msg.includes("kulinar")) {
    return "Slovenska kulinarika je raznolika 🍷 — od primorskih vin do prekmurske gaze. Priporočam degustacije v Vipavski dolini ali Mariboru. Preverite našo tržnico za lokalne izdelke.";
  }
  if (msg.includes("zdravo") || msg.includes("pozdrav") || msg.includes("hi")) {
    return "Pozdravljen! 🇸🇮 Sem Slovenija AI. Kako vam lahko pomagam pri načrtovanju potovanja po Sloveniji?";
  }

  return "Sem Slovenija AI 🇸🇮. Lahko vam pomagam z informacijami o destinacijah, lokalcih, izdelkih in izkušnjah po Sloveniji. Za popoln načrt potovanja obiščite naš AI načrtovalec na strani Načrtuj.";
}
