import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/security";
import { getStoBaselineCache } from "@/lib/rag/retrieve";
import { forceRefreshStoIndex, stoFreshnessState } from "@/lib/rag/freshness";

/**
 * GET /api/cron/sto-reingest — TEDENSKA osvežitev T2 plasti "Uradni viri" (STO).
 *
 * 1.45.0 (DATA-LAYERS-RAG §7 — trojna svežina): to je tretja plast — cron
 * OGREJE runtime overlay PRED uporabniki (na Vercelu ogreje eno instanco;
 * ostale se pozdravijo lazy prek maybeRefreshStoIndex v klepetu) IN javi
 * ODMIK od git baseline-a. Raport odmika je uredniški signal:
 *
 *   - dodani/odstranjeni viri pri STO → poženi `bun run scripts/ingest-sto.ts`,
 *     pregledaj `git diff data/sto-sources.json`, commit (uredniška kontrola).
 *
 * Schedule: vercel.json "30 7 * * 2" (torek 07:30 UTC = 09:30 po Ljubljani —
 * po ponedeljkovskih weekly-alerts, razmaknjeno od dnevnih 06/07/9/10 cronov).
 *
 * Auth: enako kot vsi cron endpointi (CRON_SECRET Bearer / admin geslo,
 * timing-safe; v dev brez secreta dovoljeno — verifyCronAuth).
 *
 * Varnost/etika: SAMO metapodatki (naslov/opis/povezava), ki jih STO objavlja
 * za AI porabo — brez scrapanja strani. Overlay nikoli ne piše na disk.
 */
export async function GET(request: Request) {
  try {
    const unauthorized = verifyCronAuth(request);
    if (unauthorized) return unauthorized;

    const baseline = getStoBaselineCache();
    const outcome = await forceRefreshStoIndex();
    const state = stoFreshnessState();

    const summary = {
      success: outcome.ok,
      reason: outcome.reason,
      records: outcome.records ?? null,
      filesOk: outcome.filesOk ?? null,
      fetchedAt: outcome.fetchedAt ?? null,
      drift: outcome.drift ?? null,
      baseline: {
        records: baseline.records.length,
        fetchedAt: baseline.fetchedAt,
      },
      serving: state.serving,
      total: state.total,
      hint: "Ob nepraznem odmiku: bun run scripts/ingest-sto.ts → git diff → commit (uredniška kontrola).",
    };

    console.log(
      `[cron/sto-reingest] ${outcome.ok ? "OK" : "NEUSPEH"} (${outcome.reason}) — ` +
        `zapisi: ${outcome.records ?? "?"} (baseline ${baseline.records.length}), ` +
        `strežemo: ${state.serving}, fetchedAt: ${state.fetchedAt}` +
        (outcome.drift ? `, odmik: +${outcome.drift.added}/-${outcome.drift.removed}` : "")
    );

    return NextResponse.json(summary);
  } catch (error) {
    console.error("[cron/sto-reingest] napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri osveževanju virov STO" },
      { status: 500 }
    );
  }
}
