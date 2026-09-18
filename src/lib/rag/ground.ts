/**
 * ground.ts — uzemljenje AI odgovorov s T2 plastjo "Uradni viri" (STO).
 *
 * DATA-LAYERS-RAG §3.3: buildStoGrounding(query, lang) vrne oštevilčen
 * kontekst vrhunskih uradnih virov + varnostno navodilo za citiranje.
 * Kontekst se vpleti v sistemsko sporočilo AI planerja/klepetalnika IN
 * gre skozi obstoječo prompt-injection obrambo (wrapProviderData iz
 * ai-context.ts) — STO vsebina je zunanja, torej nezaupana na enak način
 * kot ponudniška.
 *
 * Veriga (uporabnikova želja, DATA-LAYERS-RAG §2):
 *   T2 viri → AI odgovor s citati [n] → UI značke virov → geopovezava
 *   (slug destinacije) → "Odpri na zemljevidu" / "Dodaj v načrt".
 */

import { wrapProviderData } from "@/lib/ai-context";
import { searchStoSources } from "./retrieve";
import type { StoCitation, StoLang, StoSearchHit } from "./types";

export interface StoGrounding {
  /** True, če je bilo najdenih vsaj 1 relevanten vir (sicer kontekst ni smiseln). */
  active: boolean;
  /** Oštevilčen kontekst za sistemsko sporočilo (prazen niz, če neaktiven). */
  context: string;
  /** Citati za UI (isto zaporedje kot [1]…[n] v kontekstu). */
  citations: StoCitation[];
  /** Zadetki z ocenami (za razhroščevanje/telemetrijo). */
  hits: StoSearchHit[];
}

/** Zadetek → varni citat za klient (samo eksplicitno dovoljena polja). */
function toCitation(h: StoSearchHit): StoCitation {
  return {
    title: h.record.title,
    url: h.record.url,
    section: h.record.section,
    lang: h.record.lang,
    destinationSlug: h.destination?.slug,
    destinationName: h.destination?.name,
  };
}

/**
 * Zgradi uzemljenje za podano poizvedbo.
 *
 * @param query Prosta poizvedba uporabnika (klepet, načrtovalnik …)
 * @param lang  Jezik odgovora (dvojezično iskanje, rahla jezikovna prednost)
 * @param max   Največje število virov (default 5)
 */
export function buildStoGrounding(query: string, lang: StoLang, max = 5): StoGrounding {
  const hits = searchStoSources(query, { lang, limit: max });
  if (hits.length === 0) {
    return { active: false, context: "", citations: [], hits: [] };
  }

  const lines = hits.map(
    (h, i) =>
      `[${i + 1}] ${wrapProviderData(
        "uradni-vir",
        `${h.record.title} — sekcija: ${h.record.section}. ${h.record.description} (${h.record.url})`,
        400
      )}`
  );

  const context =
    lang === "en"
      ? `\nOFFICIAL SOURCES — I feel Slovenia (Slovenian Tourist Board, slovenia.info), retrieved for this user's question:\n${lines.join("\n")}\nUse these as AUTHORITATIVE background. When a fact in your answer comes from one of them, mark it with the citation number in square brackets, e.g. "… [2]". Do not invent facts not present in these sources or in the platform data.`
      : `\nURADNI VIRI — I feel Slovenia (Slovenska turistična organizacija, slovenia.info), pridobljeni za uporabnikovo vprašanje:\n${lines.join("\n")}\nUporabi jih kot AVTORITATIVNO ozadje. Kadar dejstvo v odgovoru izhaja iz katerega od njih, ga označi s številko citata v oglatih oklepajih, npr. "… [2]". Ne izmišljuj dejstev, ki jih ni v teh virih ali v podatkih platforme.`;

  return {
    active: true,
    context,
    citations: hits.map(toCitation),
    hits,
  };
}
