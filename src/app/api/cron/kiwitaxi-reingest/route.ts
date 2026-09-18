import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/security";
import {
  getKiwitaxiBaseline,
  installKiwitaxiDataset,
  kiwitaxiDatasetStats,
} from "@/lib/supply/providers/kiwitaxi/dataset";
import { ingestKiwiTaxi } from "@/lib/supply/providers/kiwitaxi/ingest";
import { passesKiwiSanityGate } from "@/lib/supply/providers/kiwitaxi/mapper";

/**
 * GET /api/cron/kiwitaxi-reingest — TEDENSKA osvežitev KiwiTaxi transfer
 * sloja (TASK 43, 1.49.0 — prvi realni komercialni provider).
 *
 * Tok (STO trojna svežina, 1.45.0 vzorec):
 *   1. prenesi 4 CSV množice (places/routes/transfer_types/transfers —
 *      sekvencialno z vljudnimi pavzami; vir ima rate limit),
 *   2. normaliziraj v dataset z obsegom „dotik Slovenije",
 *   3. SANITY VRATA: rute ≥ max(300, 50 % baseline) + kraji ≥ max(50, 50 %)
 *      + transferji ≥ max(1000, 50 %) — delni prenos NE gre skozi,
 *   4. atomarno namesti V POMNILNIK (overlay NIKOLI ne piše na disk —
 *      baseline ostaja resnica, ki jo pregleda človek),
 *   5. raport ODMIKA (dodane/odstranjene rute) — uredniški signal za
 *      ponovni ingest skripto + git commit.
 *
 * Schedule: vercel.json "30 7 * * 3" (sreda 07:30 UTC = 09:30 Ljubljana —
 * razmaknjeno od STO reingesta ob toorkih 07:30 in dnevnih cronov).
 *
 * OPOMBA (iskrenost): prenos je ~115 MB CSV-jev (svetovne množice) in traja
 * 2–5 minut. maxDuration=300 pokrije Render (živ proces, primarna
 * produkcija) in Vercel Pro; na omejenih funkcijah lahko cron preseže čas —
 * odpoved je FAIL-CLOSED (baseline iz gita ostane, nič se ne pokvari).
 *
 * Auth: enako kot vsi cron endpointi (CRON_SECRET Bearer / admin geslo,
 * timing-safe; v dev brez secreta dovoljeno — verifyCronAuth).
 */

// Prenos 4 velikih CSV-jev (~115 MB) s pavzami + retry → potrebuje svoj
// proračun (default 10 s bi vedno padel).
export const maxDuration = 300;

export async function GET(request: Request) {
  try {
    const unauthorized = verifyCronAuth(request);
    if (unauthorized) return unauthorized;

    const baseline = getKiwitaxiBaseline();
    const outcome = await ingestKiwiTaxi({ signal: request.signal });

    if (!outcome.ok || !outcome.dataset) {
      // FAIL-CLOSED: strežemo prejšnjo generacijo (baseline/overlay).
      const state = kiwitaxiDatasetStats();
      console.error(
        `[cron/kiwitaxi-reingest] NEUSPEH (${outcome.reason}) v ${outcome.ms ?? "?"} ms — ` +
          `strežemo: ${state.serving} (${state.routes} rut, fetchedAt ${state.fetchedAt})`
      );
      return NextResponse.json({
        success: false,
        reason: outcome.reason,
        ms: outcome.ms ?? null,
        serving: state.serving,
        baseline: baseline
          ? { routes: baseline.counts.routes, fetchedAt: baseline.fetchedAt }
          : null,
        hint: "Vir ima rate limit (429) — prenos se samodejno ponovi z eksponentno pavzo; ob vztrajni napaki preveri dokumentacijo vira.",
      });
    }

    const candidate = outcome.dataset;
    if (!passesKiwiSanityGate(candidate, baseline)) {
      const state = kiwitaxiDatasetStats();
      console.error(
        `[cron/kiwitaxi-reingest] SANITY VRATA ZAVRNILA kandidata ` +
          `(rut ${candidate.counts.routes} / baseline ${baseline?.counts.routes ?? "?"}, ` +
          `krajev ${candidate.counts.places}, transferjev ${candidate.counts.transfers}) — ` +
          `delni prenos NE gre skozi; strežemo: ${state.serving}`
      );
      return NextResponse.json({
        success: false,
        reason: "sanity-gate-rejected",
        candidate: {
          routes: candidate.counts.routes,
          places: candidate.counts.places,
          transfers: candidate.counts.transfers,
        },
        baseline: baseline
          ? {
              routes: baseline.counts.routes,
              places: baseline.counts.places,
              transfers: baseline.counts.transfers,
            }
          : null,
        serving: state.serving,
      });
    }

    // Odmik (uredniški signal): dodane/odstranjene rute glede na baseline.
    const drift = baseline ? diffRoutes(baseline, candidate) : null;

    // Atomarna namestitev (bralci nikoli ne vidijo polovične sestave).
    installKiwitaxiDataset(candidate);
    const state = kiwitaxiDatasetStats();

    const summary = {
      success: true,
      reason: outcome.reason,
      ms: outcome.ms ?? null,
      fetchedAt: candidate.fetchedAt,
      counts: candidate.counts,
      skipped: outcome.skipped ?? null,
      drift,
      serving: state.serving,
      hint: "Ob nepraznem odmiku: bun run kiwitaxi:ingest → git diff data/kiwitaxi-routes.json → pregled → commit (uredniška kontrola).",
    };

    console.log(
      `[cron/kiwitaxi-reingest] OK v ${outcome.ms ?? "?"} ms — rut: ${candidate.counts.routes}, ` +
        `pinov: ${candidate.counts.pinnedRoutes}, transferjev: ${candidate.counts.transfers}, ` +
        `strežemo: ${state.serving}` +
        (drift ? `, odmik: +${drift.added}/-${drift.removed}` : "")
    );

    return NextResponse.json(summary);
  } catch (error) {
    console.error("[cron/kiwitaxi-reingest] napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri osveževanju KiwiTaxi dataseta" },
      { status: 500 }
    );
  }
}

/** Odmik rut med generacijama (po ID-ju; vzorec diffStoDrift). */
function diffRoutes(
  a: { routes: Array<{ id: number; fromName: string; toName: string }> },
  b: { routes: Array<{ id: number; fromName: string; toName: string }> }
): {
  added: number;
  removed: number;
  addedSample: string[];
  removedSample: string[];
} {
  const aIds = new Set(a.routes.map((r) => r.id));
  const bIds = new Set(b.routes.map((r) => r.id));
  const added = b.routes.filter((r) => !aIds.has(r.id));
  const removed = a.routes.filter((r) => !bIds.has(r.id));
  return {
    added: added.length,
    removed: removed.length,
    addedSample: added.slice(0, 5).map((r) => `${r.fromName} → ${r.toName}`),
    removedSample: removed.slice(0, 5).map((r) => `${r.fromName} → ${r.toName}`),
  };
}
