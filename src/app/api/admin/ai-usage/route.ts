import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAdmin } from "@/lib/auth-guards";
import { rateLimit } from "@/lib/rate-limit";
import {
  aggregateAiUsage,
  usageFailureRows,
  type UsageRowInput,
} from "@/lib/ai-usage-aggregate";

// ============================================================================
// GET /api/admin/ai-usage — ISSUE #4 §11 (val 1): ADMIN BRALNIK METERINGA
// ============================================================================
// Zbirki AIUsageLog (feature/source/success/responseTime/costEur/metadata),
// ki jo od vala 1 naprej pišejo VSE AI površine (ai-client veriga, vizija,
// TTS, priporočila, fallback/cache). Ta ruta je observability bralnik za
// admina: agregati 7/30 dni po feature+source (klici, uspešnost, povprečni
// odzivni čas, žetoni, stroški) + zadnje odpovedi z vidnostjo poskusov
// verige (metadata.attempts — retry vidnost).
//
// Varnost: isti zid kot ostale admin rute (x-admin-password, timing-safe
// checkAdmin) + rate limit. Brez PII (userId se NE vrača — samo števci).
// Agregacijska logika živi v src/lib/ai-usage-aggregate.ts (čista, testirana).
// ============================================================================

export async function GET(request: Request) {
  try {
    const limited = rateLimit(request, {
      limit: 30,
      windowMs: 10 * 60_000,
      key: "admin-ai-usage",
    });
    if (limited) return limited;

    if (!checkAdmin(request)) {
      return NextResponse.json({ error: "Neavtorizirano" }, { status: 401 });
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Zadnjih 5000 vrstic na okno — admin bralnik, ne forenzika (indeksi
    // na createdAt/feature/source ščitijo poizvedbo).
    const [rows7, rows30, recentFailures, totalRows] = await Promise.all([
      db.aIUsageLog.findMany({
        where: { createdAt: { gte: sevenDaysAgo } },
        orderBy: { createdAt: "desc" },
        take: 5000,
      }),
      db.aIUsageLog.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        orderBy: { createdAt: "desc" },
        take: 5000,
      }),
      db.aIUsageLog.findMany({
        where: { success: false },
        orderBy: { createdAt: "desc" },
        take: 15,
      }),
      db.aIUsageLog.count(),
    ]);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      totalRows,
      last7Days: aggregateAiUsage(rows7 as UsageRowInput[]),
      last30Days: aggregateAiUsage(rows30 as UsageRowInput[]),
      recentFailures: usageFailureRows(recentFailures as UsageRowInput[]),
    });
  } catch (error) {
    console.error("[admin/ai-usage] napaka:", error);
    return NextResponse.json(
      { error: "Baza AI porabe trenutno ni dosegljiva" },
      { status: 503 }
    );
  }
}
