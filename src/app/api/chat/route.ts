import { NextResponse } from "next/server";
import { DESTINATIONS } from "@/lib/slovenia-data";
import { db } from "@/lib/db";
import { generateCompletion } from "@/lib/ai-client";

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
}

export async function POST(request: Request) {
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

  const listingsContext = topListings.map((l) =>
    `- ${l.name} (${l.category})${l.destinationName ? ` v ${l.destinationName}` : ""}: ${l.description.substring(0, 80)}. ${l.priceRange ? `Cena: ${l.priceRange}.` : ""} Ocena: ${l.rating}/5.`
  ).join("\n");

  const productsContext = topProducts.map((p) =>
    `- ${p.name} (${p.category})${p.destinationName ? ` iz ${p.destinationName}` : ""}: ${p.description.substring(0, 80)}. Cena: €${p.price}. Ocena: ${p.rating}/5.`
  ).join("\n");

  const experiencesContext = topExperiences.map((e) =>
    `- ${e.name} (${e.category})${e.destinationName ? ` v ${e.destinationName}` : ""}: ${e.description.substring(0, 80)}. Cena: €${e.pricePerPerson}/osebo. Ocena: ${e.rating}/5.`
  ).join("\n");

  const pageContext = body.currentPage
    ? `\nUPORABNIK JE TRENUTNO NA STRANI: ${body.currentPage} (prilagodi odgovor kontekstu strani)`
    : "";

  const systemPrompt = `Si "Slovenija AI" — prijazen, strokovni asistent za turistično platformo "Discover Slovenia AI". Pomagaš uporabnikom načrtovati potovanje po Sloveniji.

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
${experiencesContext}
${pageContext}

PRAVILA:
1. Odgovarjaj v slovenščini (razen če uporabnik piše v drugem jeziku)
2. Bodisi prijazen, a jedrnat (ne več kot 3-4 odstavke)
3. Priporočaj konkretne destinacije/lokale/izdelke iz zgornjega seznama
4. Če uporabnik sprašuje o nečem kar ni v bazi, bodisi iskren in predlagaj alternativo
5. Če sprašuje o itinererju, usmeri ga na "AI načrtovalec" v sekciji #načrtuj
6. Če sprašuje o rezervacijah, pojasni da poteka direktno pri ponudniku (redirect model)
7. Nikoli ne izmišljaj podatkov — če ne veš, reci
8. Uporabljaj emoji za prijaznost (🏔️ 🍷 🚴‍♂️ 🏛️) a ne pretiravaj`;

  // Zgradi pogovor za AI
  const aiMessages = [
    { role: "system" as const, content: systemPrompt },
    // Dodaj assistant intro za prvo sporočilo
    ...(recentMessages.length === 1 && recentMessages[0].role === "user"
      ? [{
          role: "assistant" as const,
          content: "Pozdravljen! Sem Slovenija AI 🇸🇮 — vaš osebni vodič po Sloveniji. Kako vam lahko pomagam pri načrtovanju potovanja?",
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

    // Fallback — preprost deterministični odgovor
    const fallback = generateFallbackResponse(lastUserMessage);
    return NextResponse.json({
      message: fallback,
      source: "fallback",
      timestamp: new Date().toISOString(),
    });
  }
}

// Preprost fallback — brez AI, samo pattern matching
function generateFallbackResponse(userMessage: string): string {
  const msg = userMessage.toLowerCase();

  if (msg.includes("bled")) {
    return "Bled je najbolj prepoznavna slovenska razglednica 🏔️. Srednjeveški grad, otok s cerkvijo in kristalno čista voda. Priporočam obisk zgodaj zjutraj za manj ljudi. Za AI načrtovanje obiščite sekcijo #načrtuj.";
  }
  if (msg.includes("ljubljan")) {
    return "Ljubljana je naša prestolnica 🏛️ — mesto z gradom na hribu, Tromostovjem in živahnim starim mestnim jedrom. Za kulinarične dogodivščine preizkusite turo po Ljubljani v sekciji izkušenj.";
  }
  if (msg.includes("piran") || msg.includes("obal")) {
    return "Piran je venecijansko obalno mesto 🌊 s ozkimi uličicami in čudovitim Trgom Tartini. Idealno za romantični izlet. Za namestitev preverite lokalne hotele v naši bazi.";
  }
  if (msg.includes("itiner") || msg.includes("načrt")) {
    return "Za AI načrtovanje potovanja obiščite sekcijo #načrtuj. AI bo upošteval vaš proračun, interese in sezono ter sestavil popoln načrt.";
  }
  if (msg.includes("víno") || msg.includes("vino") || msg.includes("kulinar")) {
    return "Slovenska kulinarika je raznolika 🍷 — od primorskih vin do prekmurske gaze. Priporočam degustacije v Vipavski dolini ali Mariboru. Preverite našo tržnico za lokalne izdelke.";
  }
  if (msg.includes("zdravo") || msg.includes("pozdrav") || msg.includes("hi")) {
    return "Pozdravljen! 🇸🇮 Sem Slovenija AI. Kako vam lahko pomagam pri načrtovanju potovanja po Sloveniji?";
  }

  return "Sem Slovenija AI 🇸🇮. Lahko vam pomagam z informacijami o destinacijah, lokalcih, izdelkih in izkušnjah po Sloveniji. Za popoln načrt potovanja obiščite naš AI načrtovalec v sekciji #načrtuj.";
}
