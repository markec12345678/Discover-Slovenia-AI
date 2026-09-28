import { db } from "@/lib/db";
import { buildStoGrounding } from "@/lib/rag/ground";
import { detectGeoIntent, type ChatPlace } from "@/lib/geo-intent";
import { fetchOverpassNearby } from "@/lib/overpass";
import {
  buildDomainAnswer,
  type ChatLang,
  type DomainListing,
  type DomainProduct,
  type DomainExperience,
} from "@/lib/chat-domain-fallback";
import type { StoCitation, StoLang } from "@/lib/rag/types";

// ============================================================================
// CHAT ENGINE — jedro determinističnega odgovora (enkraten vir resnice)
// ============================================================================
//
// W2 (Issue #15, 1.131.0): logika, ki je živela ZNOTRAJ /api/chat/route.ts,
// je zdaj deljena knjižnica, da jo uporabljata OBA vstopa:
//   1. POST /api/chat           — AI klepet (Chatbot komponenta, 12+ površin)
//   2. POST /api/trip-comments/ai-reply — skupinski klepet z @AI na /pot
//
// ISTA semantika kot prej (ZERO FEATURE LOSS): baza + STO uzemljenje (T2) +
// OSM geo kraji (T3) → deterministični domenski odgovor buildDomainAnswer.
// 0 runtime LLM klicev — vsak odgovor je pošteno označen source "database".
//
// Odgovor AI svetovalca v skupinskem klepetu je tako IZSTAVLJEN na
// strežniku (klient ne more ponarediti značke) in pošteno groundan na
// istih virih kot osebni klepet.
// ============================================================================

export interface ChatEngineAnswer {
  /** Besedilo odgovora (jezik = lang parameter). */
  message: string;
  /** Citati uradnih virov STO (T2) — prazno, kadar uzemljenje ni aktivno. */
  sources: StoCitation[];
  /** Geo kraji (OSM T3) za mini zemljevid / predloge "Dodaj v pot". */
  places: ChatPlace[];
}

/**
 * Deterministični domenski odgovor na uporabnikovo vprašanje.
 *
 * Isti tok kot prejšnja implementacija v /api/chat/route.ts:
 *   1. izpis featured vrstic iz baze (lokal/izdelek/izkušnja) — kontekst;
 *   2. T2 uzemljenje po STO indeksu (buildStoGrounding);
 *   3. geo intent + Overpass kraji v bližini (6 s timeout varuje javni API);
 *   4. buildDomainAnswer (domenska plast — 4-jezična).
 *
 * @param question zadnje uporabnikovo vprašanje (poganja uzemljenje/geo)
 * @param lang     jezik odgovora ("sl" | "en" | "it" | "de")
 */
export async function answerChatQuestion(
  question: string,
  lang: ChatLang
): Promise<ChatEngineAnswer> {
  // === GRADI KONTEKST IZ BAZE (featured vrstice — isti izbor kot prej) ===
  const [topListings, topProducts, topExperiences] = await Promise.all([
    db.listing
      .findMany({
        where: { status: "published", featured: true },
        take: 10,
        select: {
          name: true,
          category: true,
          destinationName: true,
          description: true,
          rating: true,
          priceRange: true,
        },
        orderBy: { rating: "desc" },
      })
      .catch(() => []),
    db.product
      .findMany({
        where: { status: "published", featured: true },
        take: 10,
        select: {
          name: true,
          category: true,
          destinationName: true,
          description: true,
          price: true,
          rating: true,
        },
        orderBy: { rating: "desc" },
      })
      .catch(() => []),
    db.experience
      .findMany({
        where: { status: "published", featured: true },
        take: 10,
        select: {
          name: true,
          category: true,
          destinationName: true,
          description: true,
          pricePerPerson: true,
          rating: true,
        },
        orderBy: { rating: "desc" },
      })
      .catch(() => []),
  ]);

  // T2 uzemljenje — uradni viri STO (slovenia.info). STO indeks je
  // dvojezičen (SL/EN) — za it/de iščemo po EN straneh STO.
  const stoLang: StoLang = lang === "sl" ? "sl" : "en";
  const stoGrounding = buildStoGrounding(question, stoLang, 5);

  // GEO-ODGOVORI: kraji v bližini prepoznane destinacije — realni OSM
  // podatki (T3) za mini zemljevid / predloge krajev.
  const geoIntent = detectGeoIntent(question);
  const osmPlaces: ChatPlace[] =
    geoIntent.location && geoIntent.categories.length > 0
      ? await fetchOverpassNearby(
          { lat: geoIntent.location.lat, lng: geoIntent.location.lng },
          geoIntent.categories
        )
      : [];

  // Deterministična domenska plast — PRIMARNA (in edina) pot. Enrichment:
  // za prepoznano destinacijo dodamo njene vrstice iz baze (featured top-10
  // namreč ni nujno ravno za ta kraj).
  const answer = await buildDomainAnswer(
    question,
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

  return {
    message: answer.message,
    // Citati samo kadar je bilo uzemljenje aktivno — prazen seznam pomeni
    // "ni uradnih virov za to vprašanje".
    sources: stoGrounding.active ? stoGrounding.citations : [],
    places: answer.places,
  };
}
