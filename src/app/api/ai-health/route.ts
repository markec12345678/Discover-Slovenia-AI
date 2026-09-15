import { NextResponse } from "next/server";
import { checkAIHealth } from "@/lib/ai-client";
import { rateLimit } from "@/lib/rate-limit";

// GET /api/ai-health — zdravje AI providerjev (1.14.0: veriga
// OpenRouter → Gemini → Puter → z-ai). Odgovor je POŠTEN po providerjih:
// konfiguriranost, živ klic, model, odzivni čas in opis napake (brez
// skrivnosti). OpenRouter/Gemini circuit breakerja health BEZ obvoza
// resetira (detektor okrevanja). Rate limit: 12 klicev / 10 min na IP.
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
      openrouter: report.openrouter,
      gemini: report.gemini,
      puter: report.puter,
      zai: report.zai,
    },
    timestamp: new Date().toISOString(),
  });
}
