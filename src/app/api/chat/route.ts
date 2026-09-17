import { NextResponse } from "next/server";
import { DESTINATIONS } from "@/lib/slovenia-data";
import { db } from "@/lib/db";
import { generateCompletion } from "@/lib/ai-client";
import { rateLimit } from "@/lib/rate-limit";
import { wrapProviderData, SYSTEM_DATA_GUARD } from "@/lib/ai-context";
import { buildStoGrounding } from "@/lib/rag/ground";
import type { StoCitation } from "@/lib/rag/types";
import {
  detectGeoIntent,
  matchDestinationsInText,
  stoHitToPlace,
  type ChatPlace,
} from "@/lib/geo-intent";
import { fetchOverpassNearby } from "@/lib/overpass";

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
//
// DATA-LAYERS-RAG (Task 27): T2 plast "Uradni viri" — ob vsakem vprašanju
// se po leksičnem iskanju po slovenia.info llms.txt indeksu (664 zapisov)
// v sistemski prompt vpletejo do 5 relevantnih uradnih virov STO z
// navodilom za citiranje [n]; odgovor klientu prinese `sources` (citate)
// za značke virov + geopovezavo na našo destinacijo (zemljevid/dejanje).

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

  // 19c-1 (revizija 1.36.0, P2): currentPage je client niz, ki gre v
  // SYSTEM prompt — prej surov in neomejen (obšel je SYSTEM_DATA_GUARD,
  // ki pokriva samo <podatek> vsebino; bil je tudi token-bomb vektor).
  // Zdaj: typeof preverka + 200 znakov + ovito v <podatek>.
  const currentPage =
    typeof body.currentPage === "string" ? body.currentPage.slice(0, 200) : "";
  const pageContext = currentPage
    ? lang === "en"
      ? `\nYOU ARE CURRENTLY ON THE PAGE: ${wrapProviderData("stran", currentPage, 200)} (adapt your answer to the page context)`
      : `\nUPORABNIK JE TRENUTNO NA STRANI: ${wrapProviderData("stran", currentPage, 200)} (prilagodi odgovor kontekstu strani)`
    : "";

  // DATA-LAYERS-RAG: T2 uzemljenje — uradni viri STO (slovenia.info),
  // poiskani po zadnjem uporabnikovem vprašanju. Vsebina je ovita v
  // <podatek> (wrapProviderData znotraj ground.ts) — isti varnostni
  // model kot ponudniška vsebina (prompt injection obramba).
  const stoGrounding = buildStoGrounding(lastUserMessage, lang, 5);

  // GEO-ODGOVORI (Task 29, 1.41.0): če uporabnik išče KRAJ (hrana,
  // pijača, tržnica, nastanitev, storitve) okoli prepoznane destinacije,
  // poiščemo realne kraje po OpenStreetMap (T3 — splet v živo) in jih
  // (a) vpletemo v sistemski prompt, da AI priporoča PRAVE gostilne,
  // (b) pošljemo klientu kot `places` → mini zemljevid v klepetu.
  // Overpass klic zgolj ob lokaciji + kategoriji (varuje javni API), s
  // 6 s timeoutom — počasen OSM ne zadrži klepeta (graceful degradation).
  const geoIntent = detectGeoIntent(lastUserMessage);
  const osmPlaces: ChatPlace[] =
    geoIntent.location && geoIntent.categories.length > 0
      ? await fetchOverpassNearby(
          { lat: geoIntent.location.lat, lng: geoIntent.location.lng },
          geoIntent.categories
        )
      : [];

  // Kontekst OSM krajev za AI (SL/EN) — ovit v <podatek> kot vsa zunanja
  // vsebina; izrecno označeno kot skupnostni vir, ne uradni podatek.
  const osmContext =
    osmPlaces.length > 0 && geoIntent.location
      ? lang === "en"
        ? `\n\nPLACES NEAR ${geoIntent.location.name.toUpperCase()} (OpenStreetMap — community data, NOT officially verified; do not present as official):
${wrapProviderData(
  "osm-kraji",
  osmPlaces
    .map(
      (p) =>
        `- ${p.name}${p.detail ? ` (${p.detail})` : ""}${p.openingHours ? ` — open: ${p.openingHours}` : ""}`
    )
    .join("\n")
)}
These places answer the user's WHERE question — recommend 2–4 most suitable ones BY NAME from this list (never invent names).
`
        : `\n\nKRAJI V BLIŽINI ${geoIntent.location.name.toUpperCase()} (OpenStreetMap — skupnostni vir, NI uradno preverjeno; ne predstavljaj kot uradno):
${wrapProviderData(
  "osm-kraji",
  osmPlaces
    .map(
      (p) =>
        `- ${p.name}${p.detail ? ` (${p.detail})` : ""}${p.openingHours ? ` — odprto: ${p.openingHours}` : ""}`
    )
    .join("\n")
)}
Ti kraji so odgovor na uporabnikovo vprašanje KJE — priporočaj 2–4 najbolj smiselne PO IMENU iz tega seznama (nikoli ne izmišljuj imen).
`
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
${experiencesContext}${pageContext}${stoGrounding.context}${osmContext}

RULES:
1. Reply in English (unless the user writes in another language)
2. Be friendly but concise (no more than 3-4 paragraphs)
3. Recommend concrete destinations/listings/products from the list above
4. If the user asks about something that is not in the database, be honest and suggest an alternative
5. If they ask about an itinerary, point them to the "AI planner" (/nacrtuj)
6. If they ask about bookings, explain that these happen directly with the provider (redirect model)
7. Never make up data — if you don't know, say so
8. Use emoji for friendliness (🏔️ 🍷 🚴‍♂️ 🏛️) but don't overdo it
9. When a fact comes from an OFFICIAL SOURCE above, cite it like [1] or [2] — never invent citation numbers

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
${experiencesContext}${pageContext}${stoGrounding.context}${osmContext}

PRAVILA:
1. Odgovarjaj v slovenščini (razen če uporabnik piše v drugem jeziku)
2. Bodisi prijazen, a jedrnat (ne več kot 3-4 odstavke)
3. Priporočaj konkretne destinacije/lokale/izdelke iz zgornjega seznama
4. Če uporabnik sprašuje o nečem kar ni v bazi, bodisi iskren in predlagaj alternativo
5. Če sprašuje o itinererju, usmeri ga na "AI načrtovalec" (/načrtuj)
6. Če sprašuje o rezervacijah, pojasni da poteka direktno pri ponudniku (redirect model)
7. Nikoli ne izmišljaj podatkov — če ne veš, reci
8. Uporabljaj emoji za prijaznost (🏔️ 🍷 🚴‍♂️ 🏛️) a ne pretiravaj
9. Kadar dejstvo izhaja iz URADNIH VIROV zgoraj, ga citiraj kot [1] ali [2] — nikoli ne izmisli številk citatov

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
    // CAP-FIX (revizija 1.33.0, 16-b P2): sporočila so client-supplied —
    // 2000 znakov na sporočilo (zadostuje za povpraševanje; prej neomejeno).
    // 19c-2 (revizija 1.36.0, P2): role je bil samo TS cast — klient je
    // lahko poslal role:"system" in prepisal pravila ZA SVOJO SEJO. Zdaj:
    // whitelist (neznani vlogi postanejo "user").
    ...recentMessages.map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: String(m.content ?? "").slice(0, 2000),
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

    // DATA-LAYERS-RAG: citati T2 (samo kadar je bilo uzemljenje aktivno —
    // prazen seznam pomeni "AI ni dobil uradnih virov za to vprašanje").
    const sources: StoCitation[] = stoGrounding.active ? stoGrounding.citations : [];

    // T2 → PIN (1.44): zemljevid odseva ODGOVOR — na mini zemljevid se kot
    // turkizen pin izriše SAMO uradni vir, ki ga je AI DEJANSKO CITIRAL
    // (»… [2]« v besedilu). Parsiranje je deterministično (0 AI žetonov):
    //   1. izlušči oštevilčene reference [n] iz odgovora,
    //   2. preslikaj na zadetke groundinga (isto zaporedje kot [1]…[n]),
    //   3. obdrži samo tiste z geopovezavo (33/664 zapisov ima destinacijo),
    //   4. izposoji koordinate destinacije + determinističen odmik 180–350 m
    //      (pošteno: članek je O kraju — pin sedi ob njem, ne na njem).
    // Ni citatov v odgovoru → ni T2 pinov (fallback pot citatov nikoli ne
    // napiše — zemljevid ne laže o tem, kaj je AI dejal).
    const citedIdx = new Set(
      [...content.matchAll(/\[(\d{1,2})\]/g)]
        .map((m) => parseInt(m[1], 10))
        .filter((n) => n >= 1 && n <= stoGrounding.hits.length)
    );
    const t2Places: ChatPlace[] = (
      stoGrounding.active
        ? stoGrounding.hits
            .map((h, i) => (citedIdx.has(i + 1) ? stoHitToPlace(h) : null))
            .filter((p): p is ChatPlace => p !== null)
        : []
    ).slice(0, 3);

    // GEO-ODGOVORI: poleg OSM krajev (odgovor na "kje") na zemljevid
    // dodamo še T1 destinacije, omenjene v AI odgovoru — odgovor se
    // dobesedno izriše prostorsko (zeleni pini = naši preverjeni podatki).
    // Lokacija iz vprašanja je VEDNO prvi zeleni pin (sidro iskanja) —
    // povezava na stran destinacije iz zemljevida.
    const t1Places: ChatPlace[] = matchDestinationsInText(content);
    const queryLocationPlace = geoIntent.location
      ? matchDestinationsInText(geoIntent.location.name).find(
          (p) => `t1-${geoIntent.location!.id}` === p.id
        ) ?? null
      : null;
    // OSM budget: kadar so prisotni T2 pini (redki, visoke vrednosti —
    // uradni viri), OSM popusti s 14 na 12, da turkizni pini ne izpadejo
    // zgolj zaradi .slice(0, 16) gostote (živa hrana ostane jedro odgovora).
    const osmBudget = t2Places.length > 0 ? 12 : 16;
    const places: ChatPlace[] = [
      ...(queryLocationPlace ? [queryLocationPlace] : []),
      ...osmPlaces.slice(0, osmBudget),
      ...t1Places.filter((p) => p.id !== queryLocationPlace?.id),
      ...t2Places,
    ].slice(0, 16);

    console.log(`[chat] AI odgovor (source: ${result.source}) — vprašanje: "${lastUserMessage.substring(0, 60)}..."${stoGrounding.active ? ` [T2 uzemljenje: ${stoGrounding.citations.length} uradnih virov STO${t2Places.length > 0 ? `, ${t2Places.length} citiranih na zemljevidu` : ""}]` : ""}${osmPlaces.length > 0 ? ` [GEO: ${geoIntent.location?.name} · ${osmPlaces.length} OSM krajev]` : ""}`);

    return NextResponse.json({
      message: content,
      source: result.source,
      sources,
      places,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[chat] AI napaka:", error);

    // Fallback — preprost deterministični odgovor (v jeziku pogovora)
    const fallback = generateFallbackResponse(lastUserMessage, lang);
    return NextResponse.json({
      message: fallback,
      source: "fallback",
      sources: [] as StoCitation[],
      places: [] as ChatPlace[],
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
