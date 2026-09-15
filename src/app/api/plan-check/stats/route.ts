import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import {
  aggregateValidatorStats,
  PLAN_CHECK_REPORTED_TYPE,
} from "@/lib/validator-stats";

// ============================================================================
// GET /api/plan-check/stats — JAVNA TELEMETRIJA VALIDATORJA (F17)
// ============================================================================
//
// "Koliko napak ujame naš preverjevalnik" — javne številke našega F13
// validatorja: koliko načrtov je bilo dokončano preverjenih, katera pravila
// se največkrat sprožijo, koliko cik-cak dni in duplikatov je bilo najdenih.
//
// NAČELO POŠTENOSTI:
// - Vir: SAMO strežniški dogodki PLAN_CHECK_REPORTED_TYPE ( zapisani ob
//   izračunu poročila, en na dokončano preverjanje) — klientski poskusi
//   ( plan_check_submitted) se NE mešajo v ta števec.
// - "since" = datum prvega dogodka — odkrito pokažemo, kdaj smo štetje
//   začeli ( 1.21.0); zgodovine NE domnevamo nazaj.
// - Brez PII: dogodki vsebujejo izključno števke — javni odgovor prav tako.
// - Predpomnilnik 60 s ( lokalni pomnilnik): javna stran ne tolče baze in
//   ima smešno majhen strošek; številke lahko zaostanijo za minuto ( na
//   strani odkrito zapisano).
// - Fail-open na bazo: napaka → 503 ( stran pokaže "trenutno ni na voljo",
//   javne študije ostanejo).
// ============================================================================

const CACHE_TTL_MS = 60_000;

/** Lokalni predpomnilnik ( ena instanca na proces — dovolj za javne številke). */
let cache: { at: number; body: { generatedAt: string; stats: unknown } } | null =
  null;

export async function GET(request: Request) {
  // Odprta javna pot → dosleden rate limit ( kot ostale javne poti)
  const limited = rateLimit(request, {
    limit: 30,
    windowMs: 60_000,
    key: "plan-check-stats",
  });
  if (limited) return limited;

  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return NextResponse.json(cache.body);
  }

  try {
    // Vsi dogodki tega tipa ( obseg: rate limit 10/min/IP na POST poti —
    // realna količina je majhna; orderBy asc = deterministični "since")
    const rows = await db.analyticsEvent.findMany({
      where: { type: PLAN_CHECK_REPORTED_TYPE },
      select: { metadata: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    const stats = aggregateValidatorStats(rows);
    const body = { generatedAt: new Date().toISOString(), stats };
    cache = { at: Date.now(), body };
    return NextResponse.json(body);
  } catch (e) {
    console.error("[plan-check-stats] napaka agregacije:", e);
    return NextResponse.json(
      { error: "Telemetrija trenutno ni na voljo." },
      { status: 503 }
    );
  }
}
