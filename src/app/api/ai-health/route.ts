import { NextResponse } from "next/server";
import { checkAIHealth } from "@/lib/ai-client";
import { rateLimit } from "@/lib/rate-limit";
import { verifyCronAuth } from "@/lib/security";

// GET /api/ai-health — ISSUE #9 (ZERO-AI): zdravje OPCIJSKE vision plasti
// (edini ostanek AI: Gemini vision + z-ai VLM za razumevanje slik —
// /api/itinerary/ingest-image + rezervacijski screenshot). Tekstovna
// veriga (OpenRouter→Gemini→Puter→z-ai) ne obstaja več. Odgovor je
// POŠTEN po providerjih: konfiguriranost, živ klic, model, odzivni čas
// in opis napake (brez skrivnosti). Brez ključev je poročilo iskreno
// (configured: false) — vizija je OPCIJA, jedro deluje brez nje.
//
// REVIZIJA #8 (P2): avtorizacija CRON_SECRET (Bearer) ali admin geslo
// (x-admin-password) — enaka kot cron rute. Rate limit (12/10 min)
// ostane kot drugi sloj za pooblaščene klicatelje.
export async function GET(request: Request) {
  const unauthorized = verifyCronAuth(request);
  if (unauthorized) return unauthorized;

  const limited = rateLimit(request, {
    limit: 12,
    windowMs: 10 * 60_000,
    key: "ai-health",
  });
  if (limited) return limited;

  const report = await checkAIHealth();
  return NextResponse.json({
    status: report.active === "none" ? "down" : report.active === "z-ai-sdk" ? "fallback" : "ok",
    provider: report.active,
    providers: {
      gemini: report.gemini,
      zai: report.zai,
    },
    timestamp: new Date().toISOString(),
  });
}
