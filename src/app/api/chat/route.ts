import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { buildStoGrounding } from "@/lib/rag/ground";
import { maybeRefreshStoIndex } from "@/lib/rag/freshness";
import type { StoCitation } from "@/lib/rag/types";
import {
  detectGeoIntent,
  type ChatPlace,
} from "@/lib/geo-intent";
import { fetchOverpassNearby } from "@/lib/overpass";
import {
  buildDomainAnswer,
  type DomainListing,
  type DomainProduct,
  type DomainExperience,
} from "@/lib/chat-domain-fallback";

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
// NIKOLI ne blokira odgovora (strežemo kar imamo, svežina od naslednje
// zahteve); tedensko pa jo predgreje /api/cron/sto-reingest.

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  currentPage?: string; // npr. "homepage", "destinations", "marketplace"
  /** FW4.3-2: jezik odgovora ("en" → angleški domenski odgovor; default "sl") */
  language?: "sl" | "en";
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

  // FW4.3-2: jezik izpisa — client pošlje locale (enak vzorec kot
  // /api/itinerary): "en" → angleški odgovori, vse ostalo slovensko.
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

  // DATA-LAYERS-RAG: T2 uzemljenje — uradni viri STO (slovenia.info),
  // poiskani po zadnjem uporabnikovem vprašanju. Citati gredo klientu kot
  // `sources` (značke virov pod odgovorom).
  const stoGrounding = buildStoGrounding(lastUserMessage, lang, 5);

  // GEO-ODGOVORI (Task 29): kraji v bližini prepoznane destinacije —
  // realni OSM podatki za mini zemljevid in domenski odgovor.
  const geoIntent = detectGeoIntent(lastUserMessage);
  const osmPlaces: ChatPlace[] =
    geoIntent.location && geoIntent.categories.length > 0
      ? await fetchOverpassNearby(
          { lat: geoIntent.location.lat, lng: geoIntent.location.lng },
          geoIntent.categories
        )
      : [];

  // Issue #2 §5 → Issue #9: DETERMINISTIČNA DOMENSKA PLAST — PRIMARNA (in
  // edina) pot. Odgovor je sestavljen IZ REALNIH podatkov (baza + statika +
  // OSM + Open-Meteo), pošteno označen z source "database". NIKOLI ne
  // simulira LLM-ja in ne izmišljuje podatkov.
  //
  // Enrichment: za prepoznano destinacijo dodamo še njene vrstice iz baze
  // (isti vzorec kot ask-local) — featured top-10 namreč ni nujno ravno za
  // ta kraj. Poizvedba je PODPRTA s .catch(() => []) — baza ne sme podreti
  // odgovora.
  const answer = await buildDomainAnswer(
    lastUserMessage,
    lang,
    {
      listings: topListings as DomainListing[],
      products: topProducts as DomainProduct[],
      experiences: topExperiences as DomainExperience[],
      osmPlaces,
    },
    {
      enrich: async (destinationName) => {
        const [ls, ps, es] = await Promise.all([
          db.listing
            .findMany({
              where: { status: "published", destinationName },
              take: 3,
              select: {
                name: true,
                category: true,
                destinationName: true,
                description: true,
                rating: true,
                priceRange: true,
              },
            })
            .catch(() => []),
          db.product
            .findMany({
              where: { status: "published", destinationName },
              take: 3,
              select: {
                name: true,
                category: true,
                destinationName: true,
                price: true,
                rating: true,
              },
            })
            .catch(() => []),
          db.experience
            .findMany({
              where: { status: "published", destinationName },
              take: 3,
              select: {
                name: true,
                category: true,
                destinationName: true,
                pricePerPerson: true,
                rating: true,
              },
            })
            .catch(() => []),
        ]);
        return {
          listings: ls as DomainListing[],
          products: ps as DomainProduct[],
          experiences: es as DomainExperience[],
        };
      },
    }
  );

  // DATA-LAYERS-RAG: citati T2 (samo kadar je bilo uzemljenje aktivno —
  // prazen seznam pomeni "ni uradnih virov za to vprašanje").
  const sources: StoCitation[] = stoGrounding.active ? stoGrounding.citations : [];

  console.log(`[chat] deterministični odgovor (source: database) — vprašanje: "${lastUserMessage.substring(0, 60)}..."${stoGrounding.active ? ` [T2 uzemljenje: ${stoGrounding.citations.length} uradnih virov STO]` : ""}${osmPlaces.length > 0 ? ` [GEO: ${geoIntent.location?.name} · ${osmPlaces.length} OSM krajev]` : ""}`);

  return NextResponse.json({
    message: answer.message,
    source: "database",
    sources,
    places: answer.places,
    timestamp: new Date().toISOString(),
  });
}

// generateFallbackResponse (trdo kodirani 7-vzorcni odgovor) je z 1.89.0
// ZAMENJAN z buildDomainAnswer (src/lib/chat-domain-fallback.ts) — Issue #2
// §5: deterministična domenska plast, ki odgovarja iz realnih Discover
// podatkov. Issue #9 ZERO-AI: plast je sedaj primarna — AI klica ni več.
