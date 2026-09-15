import { NextResponse } from "next/server";
import { checkAIHealth } from "@/lib/ai-client";
import { rateLimit } from "@/lib/rate-limit";

// GET /api/ai-health — zdravje AI providerjev (F10: Gemini → Puter → z-ai).
// P7-C2 (F5.1): prej BREZ rate limita — vsak javni GET je izvedel pravi AI
// completion (neomejen strošek). Zdaj 12 klicev / 10 min na IP.
//
// Odgovor je POŠTEN po providerjih: konfiguriranost, živ klic, model,
// odzivni čas in kratek opis napake (brez skrivnosti). Gemini ima sicer
// circuit breaker v generacijski verigi, a health preizkus BEZ breakerja
// teče — uspeh ga pošteno resetira (detektor okrevanja).
export async function GET(request: Request) {
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
      puter: report.puter,
      zai: report.zai,
    },
    timestamp: new Date().toISOString(),
  });
}
