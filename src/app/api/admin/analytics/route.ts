import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/admin/analytics — globalne poslovne metrike za admin-a
// Header: x-admin-password
export async function GET(request: Request) {
  try {
    const adminPassword = request.headers.get("x-admin-password");
    if (adminPassword !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Neavtorizirano" }, { status: 401 });
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // === 1. OWNERS & SUBSCRIPTIONS ===
    const owners = await db.owner.findMany({
      select: {
        id: true, email: true, name: true, businessName: true,
        plan: true, subscriptionStatus: true, subscriptionEndsAt: true,
        createdAt: true,
      },
    });

    const totalOwners = owners.length;
    const premiumOwners = owners.filter((o) => o.plan === "premium").length;
    const enterpriseOwners = owners.filter((o) => o.plan === "enterprise").length;
    const freeOwners = owners.filter((o) => o.plan === "free").length;
    const activeSubscriptions = owners.filter((o) => o.subscriptionStatus === "active").length;
    const canceledSubscriptions = owners.filter((o) => o.subscriptionStatus === "canceled").length;

    // === 2. MRR / ARR ===
    const PLAN_PRICES: Record<string, number> = { premium: 149, enterprise: 499, free: 0 };
    const mrr = owners.reduce((sum, o) => sum + (PLAN_PRICES[o.plan] || 0), 0);
    const arr = mrr * 12;

    // === 3. CHURN RATE ===
    // Churn = canceled / (active + canceled) v zadnjih 30 dneh
    const churnRate = activeSubscriptions + canceledSubscriptions > 0
      ? (canceledSubscriptions / (activeSubscriptions + canceledSubscriptions)) * 100
      : 0;

    // === 4. LTV (Lifetime Value) ===
    // Povprečno trajanje naročnine = 1 / churn rate (če je churn > 0)
    const avgLifetimeMonths = churnRate > 0 ? 1 / (churnRate / 100) : 24; // fallback 24 mesecev
    const avgPlanPrice = totalOwners > 0 ? mrr / Math.max(1, premiumOwners + enterpriseOwners) : 0;
    const ltv = avgLifetimeMonths * avgPlanPrice;

    // === 5. LISTINGS ===
    const totalListings = await db.listing.count();
    const featuredListings = await db.listing.count({ where: { featured: true } });
    const sponsoredListings = await db.listing.count({ where: { sponsored: true } });
    const verifiedListings = await db.listing.count({ where: { verified: true } });

    // Listings po kategorijah
    const listingsByCategoryRaw = await db.listing.groupBy({
      by: ["category"],
      _count: { _all: true },
    });
    const listingsByCategory = listingsByCategoryRaw.map((c) => ({
      category: c.category,
      count: c._count._all,
    }));

    // === 6. PRODUCTS & EXPERIENCES ===
    const totalProducts = await db.product.count();
    const totalExperiences = await db.experience.count();

    // === 7. LEADS ===
    const totalLeads = await db.listingEvent.count({ where: { type: "lead" } });
    const leads30d = await db.listingEvent.count({ where: { type: "lead", createdAt: { gte: thirtyDaysAgo } } });
    const leads7d = await db.listingEvent.count({ where: { type: "lead", createdAt: { gte: sevenDaysAgo } } });

    // Leads iz data/leads.json (JoinUs forme)
    let joinUsLeads = 0;
    try {
      const fs = await import("fs/promises");
      const path = await import("path");
      const leadsFile = path.join(process.cwd(), "data", "leads.json");
      const data = await fs.readFile(leadsFile, "utf-8");
      joinUsLeads = JSON.parse(data).length;
    } catch {}

    // === 8. VIEWS & CLICKS ===
    const totalViews = await db.listingEvent.count({ where: { type: "impression" } });
    const totalClicks = await db.listingEvent.count({ where: { type: "click" } });
    const totalAIRecs = await db.listingEvent.count({ where: { type: "ai_recommendation" } });

    const views30d = await db.listingEvent.count({ where: { type: "impression", createdAt: { gte: thirtyDaysAgo } } });
    const clicks30d = await db.listingEvent.count({ where: { type: "click", createdAt: { gte: thirtyDaysAgo } } });
    const aiRecs30d = await db.listingEvent.count({ where: { type: "ai_recommendation", createdAt: { gte: thirtyDaysAgo } } });

    // === 9. TOP PERFORMERS (by ROI) ===
    const topListings = await db.listing.findMany({
      where: { aiRecommendations: { gt: 0 } },
      select: {
        id: true, name: true, slug: true, category: true, plan: true,
        viewCount: true, clickCount: true, aiRecommendations: true, leadCount: true,
        rating: true, destinationName: true,
        owner: { select: { businessName: true, email: true } },
      },
      orderBy: { aiRecommendations: "desc" },
      take: 10,
    });

    const topPerformers = topListings.map((l) => {
      const estimatedRevenue = l.leadCount * 150;
      const cost = PLAN_PRICES[l.plan] || 0;
      const roi = cost > 0 ? ((estimatedRevenue - cost) / cost) * 100 : 0;
      return {
        id: l.id, name: l.name, category: l.category, plan: l.plan,
        views: l.viewCount, clicks: l.clickCount, aiRecs: l.aiRecommendations, leads: l.leadCount,
        estimatedRevenue, roi: Math.round(roi), roiStatus: roi > 0 ? "positive" : "negative",
        owner: l.owner?.businessName || "—",
      };
    });

    // === 10. GROWTH (novi ownerji po mesecih) ===
    const growthData: { month: string; newOwners: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const count = owners.filter((o) => {
        const d = new Date(o.createdAt);
        return d >= monthStart && d < monthEnd;
      }).length;
      growthData.push({
        month: monthStart.toLocaleDateString("sl-SI", { month: "short", year: "numeric" }),
        newOwners: count,
      });
    }

    // === 11. REVENUE PROJECTION ===
    const betaThreshold = 30;
    const remainingToMonetization = Math.max(0, betaThreshold - totalListings);
    const projectedMrr = betaThreshold * 149; // če vsi premium
    const projectedArr = projectedMrr * 12;

    return NextResponse.json({
      // Subscriptions
      totalOwners,
      premiumOwners,
      enterpriseOwners,
      freeOwners,
      activeSubscriptions,
      canceledSubscriptions,
      // Revenue
      mrr,
      arr,
      churnRate: Math.round(churnRate * 10) / 10,
      ltv: Math.round(ltv),
      avgLifetimeMonths: Math.round(avgLifetimeMonths),
      // Listings
      totalListings,
      featuredListings,
      sponsoredListings,
      verifiedListings,
      listingsByCategory,
      // Products & Experiences
      totalProducts,
      totalExperiences,
      // Leads
      totalLeads,
      leads30d,
      leads7d,
      joinUsLeads,
      // Views & Clicks
      totalViews,
      totalClicks,
      totalAIRecs,
      views30d,
      clicks30d,
      aiRecs30d,
      // Top performers
      topPerformers,
      // Growth
      growthData,
      // Projections
      betaThreshold,
      remainingToMonetization,
      projectedMrr,
      projectedArr,
    });
  } catch (error) {
    console.error("[admin/analytics] napaka:", error);
    return NextResponse.json({ error: "Napaka pri pridobivanju analitike" }, { status: 500 });
  }
}
