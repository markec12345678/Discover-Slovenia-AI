import { NextResponse } from "next/server";
import { checkAIHealth } from "@/lib/ai-client";

// GET /api/ai-health — preveri ali AI (Puter) deluje
export async function GET() {
  const health = await checkAIHealth();
  return NextResponse.json({
    status: health.puter ? "ok" : "fallback",
    provider: health.puter ? "puter" : "z-ai-sdk",
    model: health.model,
    timestamp: new Date().toISOString(),
  });
}
