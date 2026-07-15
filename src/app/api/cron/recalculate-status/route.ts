import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recalculatePartnerStatus } from "@/lib/quality-score";

// GET /api/cron/recalculate-status — dnevno preračuna Quality Score in partner statuse
// Auth: CRON_SECRET ali ADMIN_PASSWORD
//
// Kaj dela:
// 1. Za vsak published lokal izračuna Quality Score
// 2. Posodobi partnerStatus (standard/verified/premium/featured)
// 3. Auto-qualify za Featured (Premium + Q>90 + Verified)
// 4. Če Featured pogoj odpade → degradira na premium
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    const adminPassword = process.env.ADMIN_PASSWORD;

    const authorized =
      (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
      (adminPassword && request.headers.get("x-admin-password") === adminPassword);

    if (!authorized) {
      return NextResponse.json({ error: "Neavtorizirano" }, { status: 401 });
    }

    console.log("[cron/recalculate-status] Začenjam preračun...");

    const listings = await db.listing.findMany({
      where: { status: "published" },
      select: { id: true, name: true },
    });

    let promoted = 0;
    let demoted = 0;
    let unchanged = 0;

    for (const listing of listings) {
      try {
        const result = await recalculatePartnerStatus(listing.id);

        if (result.changed) {
          // Preveri ali je promocija ali degradacija
          const order = ["standard", "verified", "premium", "featured"];
          const oldIdx = order.indexOf(result.oldStatus);
          const newIdx = order.indexOf(result.newStatus);

          if (newIdx > oldIdx) {
            promoted++;
            console.log(`  ⬆️  ${listing.name}: ${result.oldStatus} → ${result.newStatus} (Q:${result.qualityScore})`);
          } else {
            demoted++;
            console.log(`  ⬇️  ${listing.name}: ${result.oldStatus} → ${result.newStatus} (Q:${result.qualityScore})`);
          }
        } else {
          unchanged++;
        }
      } catch (e) {
        console.error(`  ❌ ${listing.name}:`, e);
      }
    }

    const summary = {
      total: listings.length,
      promoted,
      demoted,
      unchanged,
      timestamp: new Date().toISOString(),
    };

    console.log("[cron/recalculate-status] Končano:", summary);

    return NextResponse.json(summary);
  } catch (error) {
    console.error("[cron/recalculate-status] napaka:", error);
    return NextResponse.json({ error: "Napaka" }, { status: 500 });
  }
}
