import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { searchStoSources, stoIndexStats } from "@/lib/rag/retrieve";
import { maybeRefreshStoIndex } from "@/lib/rag/freshness";
import type { StoLang } from "@/lib/rag/types";

/**
 * GET /api/ai/sources — javno, LEKSIČNO iskanje po T2 plasti "Uradni viri"
 * (STO / slovenia.info llms.txt indeks).
 *
 * DATA-LAYERS-RAG §5.3: transparentnost kot blagovna znamka — kdor želi
 * preveriti, KATERI uradni viri živijo v našem AI kontekstu, lahko to
 * stori neposredno (enaka logika kot buildStoGrounding, brez AI klica,
 * brez stroškov). Podatki so javno objavljeni s strani STO za AI porabo.
 *
 * Parametri:
 *   ?q=<poizvedba>   — iskalni niz (brez q → samo metadata indeksa)
 *   ?lang=sl|en      — jezikovna prednost (default: brez)
 *   ?limit=1..10     — število zadetkov (default 5)
 *
 * Odgovor: { total, fetchedAt, source, byLang, query?, results[] } — results
 * vsebujejo naslov, URL, sekcijo, opis in morebitno geopovezavo na našo
 * destinacijo (slug). Brez skrivnosti: vse je javna STO vsebina.
 *
 * 1.45.0: `source` razkriva, katera generacija streže — "baseline"
 * (git verzioniran snapshot, uredniška kontrola) ali "overlay" (svež
 * runtime prenos STO, nameščen po sanity gate-u; glej rag/freshness.ts).
 * Klic tudi proži fire-and-forget osvežitev (7-dnevni TTL) — naslednji
 * klic lahko že streže svežo generacijo.
 */
export async function GET(request: Request) {
  const limited = rateLimit(request, {
    limit: 30,
    windowMs: 60_000,
    key: "ai-sources",
  });
  if (limited) return limited;

  // 1.45.0: transparentnost + svežina v enem — strežemo kar imimo, v ozadju
  // se indeks (če je starejši od 7 dni) osveži za naslednji klic.
  maybeRefreshStoIndex();

  const stats = stoIndexStats();
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").slice(0, 300).trim();
  const langParam = url.searchParams.get("lang");
  const lang: StoLang | undefined =
    langParam === "sl" || langParam === "en" ? langParam : undefined;
  const limitRaw = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.trunc(limitRaw), 1), 10)
    : 5;

  if (!q) {
    return NextResponse.json({
      ...stats,
      hint: "Dodaj ?q=<poizvedba> za iskanje po uradnih virih STO (slovenia.info).",
    });
  }

  const results = searchStoSources(q, { lang, limit }).map((h) => ({
    title: h.record.title,
    url: h.record.url,
    section: h.record.section,
    description: h.record.description,
    lang: h.record.lang,
    collection: h.record.collection,
    score: h.score,
    destination: h.destination ?? null,
  }));

  return NextResponse.json({
    ...stats,
    query: q,
    lang: lang ?? null,
    results,
  });
}
