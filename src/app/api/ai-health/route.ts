import { NextResponse } from "next/server";
import { checkAIHealth } from "@/lib/ai-client";
import { rateLimit } from "@/lib/rate-limit";
import { verifyCronAuth } from "@/lib/security";

// GET /api/ai-health — zdravje AI providerjev (1.14.0: veriga
// OpenRouter → Gemini → Puter → z-ai). Odgovor je POŠTEN po providerjih:
// konfiguriranost, živ klic, model, odzivni čas in opis napake (brez
// skrivnosti). OpenRouter/Gemini circuit breakerja health BEZ obvoza
// resetira (detektor okrevanja).
//
// REVIZIJA #8 (P2 — availability/cost abuse): health je prej bil JAVEN —
// ker uspešen health resetira circuit breaker, je lahko kateri koli
// obiskovalec "prebujal" mrtvega providerja (breaker OPEN → javni health
// → reset → naslednji AI klic spet čaka timeout mrtvega providerja).
// Zdaj: CRON_SECRET (Bearer) ali admin geslo (x-admin-password) — enaka
// avtorizacija kot cron rute; uporabniki imajo pri vrednosti statusa
// povsod drugje (chat, konzultacije, fallback). Rate limit (12/10 min)
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
      openrouter: report.openrouter,
      gemini: report.gemini,
      puter: report.puter,
      zai: report.zai,
    },
    timestamp: new Date().toISOString(),
  });
}
