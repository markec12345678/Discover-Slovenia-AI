import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { maybeRefreshStoIndex } from "@/lib/rag/freshness";
import type { ChatLang } from "@/lib/chat-domain-fallback";
// W2 (Issue #15, 1.131.0): jedro odgovora je zdaj deljena knjižnica
// src/lib/chat-engine.ts — isto deterministično telo uporabljata
// /api/chat in /api/trip-comments/ai-reply (skupinski klepet z @AI).
import { answerChatQuestion } from "@/lib/chat-engine";

// POST /api/chat — klepetalnik z dostopom do vsebine platforme
//
// ISSUE #9 / ZERO-AI (skupina A): domenska plast (buildDomainAnswer) je
// sedaj PRIMARNA in EDINA pot — 0 runtime LLM klicev, 0 tekov z AI verigo,
// 0 odvisnosti od zunanjih AI ponudnikov. Chatbot pozna:
// - 38 destinacij (Bled, Ljubljana, Piran, … — SI+HR+ME+AL)
// - lokale (hoteli, restavracije, aktivnosti) iz baze
// - izdelke (kulinarika, obrt, spominki) iz baze
// - izkušnje (turi, degustacije, avanture) iz baze
//
// Kontekst se gradi iz baze (+ STO uzemljenje + OSM enrichment) in neposredno
// nahrani deterministični odgovor. Vsak odgovor je pošteno označen
// source: "database" — nikoli "ai".
//
// DATA-LAYERS-RAG (Task 27): T2 plast "Uradni viri" — ob vsakem vprašanju
// po leksičnem iskanju po slovenia.info llms.txt indeksu (664 zapisov)
// odgovor prinese `sources` (citate uradnih virov STO) za značke virov
// + geopovezavo na našo destinacijo (zemljevid/dejanje).
//
// GEO-ODGOVORI (Task 29): če uporabnik išče KRAJ (hrana, pijača, tržnica,
// nastanitev, storitve) okoli prepoznane destinacije, poiščemo realne kraje
// po OpenStreetMap (T3 — splet v živo) in jih pošljemo klientu kot `places`
// → mini zemljevid v klepetu. Overpass klic zgolj ob lokaciji + kategoriji
// (varuje javni API), s 6 s timeoutom — počasen OSM ne zadrži klepeta.
//
// 1.45.0 (§7 trojna svežina): indeks, po katerem išče buildStoGrounding,
// je baseline (git) ali sveži overlay — fire-and-forget osvežitev spodaj
// NIKOLI ne blokira odgovora (strežamo kar imamo, svežina od naslednje
// zahteve); tedensko pa jo predgreje /api/cron/sto-reingest.

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  currentPage?: string; // npr. "homepage", "destinations", "marketplace"
  /** FW4.3-2 + W1 (Issue #15): jezik odgovora — 4 javni jeziki ("en"/"it"/"de" →
   * domenski odgovor v tem jeziku; default "sl").
   * W12 (smer 2, faza 1): +"fr"/"es" — klient ju pošlje na FR/ES straneh;
   * strežnik ju preslika na EN (referenčni jezik domenske plast). */
  language?: "sl" | "en" | "it" | "de" | "fr" | "es";
}

export async function POST(request: Request) {
    // Rate limit klepetalnika
    const limited = rateLimit(request, { limit: 20, windowMs: 600000, key: "ai-chat" });
    if (limited) return limited;

    // 1.45.0: fire-and-forget osvežitev T2 virov STO (7-dnevni TTL, ne blokira —
    // glej komentar zgoraj). Ob 429/napaki strežemo baseline; nov poskus po 6 h.
    maybeRefreshStoIndex();

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

  // Vzami samo zadnjih 6 sporočil (kontekst pogovora) — zadnje uporabnikovo
  // vprašanje poganja uzemljenje, geo namig in domenski odgovor.
  const recentMessages = body.messages.slice(-6);
  const lastUserMessage = [...recentMessages].reverse().find((m) => m.role === "user")?.content || "";

  // FW4.3-2 + W1: jezik izpisa — client pošlje locale (enak vzorec kot
  // /api/itinerary). W1 doda it/de (domenska plast je 4-jezična); neznan
  ///neveljaven jezik → slovensko (default, izvirnik).
  // W12 (smer 2, faza 1): fr/es → EN — domenska plast klepeta je (še)
  // 4-jezična; EN je referenčni mednarodni jezik platforme (isti kanon kot
  // mt-notice in odpiralni note v modalu). Francoski/španski uporabnik
  // tako NE dobi slovenskih (zanj nerazumljivih) odgovorov.
  const requested = body.language ?? "";
  const lang: ChatLang = (["sl", "en", "it", "de"] as const).includes(
    requested as "sl" | "en" | "it" | "de"
  )
    ? (requested as ChatLang)
    : requested === "fr" || requested === "es"
      ? "en"
      : "sl";

  // W2: jedro (baza + STO + OSM + domenska plast) — src/lib/chat-engine.ts.
  const answer = await answerChatQuestion(lastUserMessage, lang);

  console.log(`[chat] deterministični odgovor (source: database) — vprašanje: "${lastUserMessage.substring(0, 60)}..."${answer.sources.length > 0 ? ` [T2 uzemljenje: ${answer.sources.length} uradnih virov STO]` : ""}${answer.places.length > 0 ? ` [GEO: ${answer.places.length} krajev]` : ""}`);

  return NextResponse.json({
    message: answer.message,
    source: "database",
    sources: answer.sources,
    places: answer.places,
    timestamp: new Date().toISOString(),
  });
}

// generateFallbackResponse (trdo kodirani 7-vzorcni odgovor) je z 1.89.0
// ZAMENJAN z buildDomainAnswer (src/lib/chat-domain-fallback.ts) — Issue #2
// §5: deterministična domenska plast, ki odgovarja iz realnih Discover
// podatkov. Issue #9 ZERO-AI: plast je sedaj primarna — AI klica ni več.
