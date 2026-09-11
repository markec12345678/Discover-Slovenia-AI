import { NextResponse } from "next/server";
import { checkAIHealth } from "@/lib/ai-client";
import { rateLimit } from "@/lib/rate-limit";

// GET /api/ai-health — preveri ali AI (Puter) deluje.
// P7-C2 (F5.1): prej BREZ rate limita — vsak javni GET je izvedel pravi AI
// completion (neomejen strošek). Zdaj 12 klicev / 10 min na IP.
export async function GET(request: Request) {
  const limited = rateLimit(request, {
    limit: 12,
    windowMs: 10 * 60_000,
    key: "ai-health",
  });
  if (limited) return limited;

  const health = await checkAIHealth();
  return NextResponse.json({
    status: health.puter ? "ok" : "fallback",
    provider: health.puter ? "puter" : "z-ai-sdk",
    model: health.model,
    timestamp: new Date().toISOString(),
  });
}
