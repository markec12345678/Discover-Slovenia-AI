import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/auth-guards";

// GET /api/analytics/provider-roi — ROI za posameznega ownerja
// Vrne: koliko prometa je dobil, koliko stane paket, kakšen je ROI
export async function GET(request: Request) {
  try {
    const { error, ownerId } = await requireOwner();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") || "30", 10);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Pridobi vse lastnikove lokale
    const listings = await db.listing.findMany({
      where: { ownerId },
      select: { id: true, name: true, plan: true, partnerStatus: true, sponsored: true },
    });

    const listingIds = listings.map((l) => l.id);

    if (listingIds.length === 0) {
      return NextResponse.json({
        listings: [],
        totals: { impressions: 0, clicks: 0, contacts: 0, aiRecs: 0, cost: 0, estimatedValue: 0, roi: 0 },
      });
    }

    // Statistika za vsak lokal
    const listingStats = await Promise.all(
      listings.map(async (listing) => {
        const [impressions, clicks, contacts, aiRecs] = await Promise.all([
          db.listingEvent.count({
            where: { listingId: listing.id, type: "impression", createdAt: { gte: since } },
          }),
          db.listingEvent.count({
            where: { listingId: listing.id, type: "click", createdAt: { gte: since } },
          }),
          db.listingEvent.count({
            where: { listingId: listing.id, type: "lead", createdAt: { gte: since } },
          }),
          db.listingEvent.count({
            where: { listingId: listing.id, type: "ai_recommendation", createdAt: { gte: since } },
          }),
        ]);

        // Ocenjena vrednost (vsak kontakt = ~€50 povprečna rezervacija, vsak klik = ~€5)
        const estimatedValue = contacts * 50 + clicks * 5;

        return {
          id: listing.id,
          name: listing.name,
          plan: listing.plan,
          partnerStatus: listing.partnerStatus,
          sponsored: listing.sponsored,
          impressions,
          clicks,
          contacts,
          aiRecs,
          ctr: impressions > 0 ? `${((clicks / impressions) * 100).toFixed(1)}%` : "0%",
          contactRate: clicks > 0 ? `${((contacts / clicks) * 100).toFixed(1)}%` : "0%",
          estimatedValue,
        };
      })
    );

    // Skupni ROI
    const totals = listingStats.reduce(
      (acc, l) => ({
        impressions: acc.impressions + l.impressions,
        clicks: acc.clicks + l.clicks,
        contacts: acc.contacts + l.contacts,
        aiRecs: acc.aiRecs + l.aiRecs,
        estimatedValue: acc.estimatedValue + l.estimatedValue,
      }),
      { impressions: 0, clicks: 0, contacts: 0, aiRecs: 0, estimatedValue: 0 }
    );

    // Strošek paketa
    const PLAN_PRICES: Record<string, number> = { free: 0, premium: 149, enterprise: 499 };
    const owner = await db.owner.findUnique({
      where: { id: ownerId },
      select: { plan: true },
    });
    const monthlyCost = PLAN_PRICES[owner?.plan || "free"] || 0;
    const periodCost = (monthlyCost / 30) * days;

    const roi = periodCost > 0 ? ((totals.estimatedValue - periodCost) / periodCost) * 100 : 0;

    return NextResponse.json({
      listings: listingStats,
      totals: {
        ...totals,
        monthlyCost,
        periodCost: Math.round(periodCost),
        estimatedValue: Math.round(totals.estimatedValue),
        roi: Math.round(roi),
        roiLabel: roi > 0 ? `+${Math.round(roi)}%` : `${Math.round(roi)}%`,
      },
      period: { days, since: since.toISOString() },
    });
  } catch (error) {
    console.error("[analytics/provider-roi] napaka:", error);
    return NextResponse.json({ error: "Napaka" }, { status: 500 });
  }
}
