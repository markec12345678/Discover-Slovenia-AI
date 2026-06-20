import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// GET /api/owner/analytics — AI priporočila, leads, ROI za ownerja
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Niste prijavljeni" }, { status: 401 });
    }

    const owner = await db.owner.findUnique({
      where: { email: session.user.email },
      select: { id: true, plan: true, businessName: true },
    });
    if (!owner) {
      return NextResponse.json({ error: "Lastnik ni najden" }, { status: 404 });
    }

    // Pridobi vse lokale tega ownerja
    const listings = await db.listing.findMany({
      where: { ownerId: owner.id },
      select: {
        id: true, name: true, slug: true, category: true, plan: true,
        viewCount: true, clickCount: true, aiRecommendations: true, leadCount: true,
        featured: true, rating: true, destinationName: true,
      },
    });

    // Pridobi evente zadnjih 30 dni
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const listingIds = listings.map((l) => l.id);

    const [impressions30d, clicks30d, aiRecs30d, leads30d, impressions7d, clicks7d, aiRecs7d, leads7d] = await Promise.all([
      db.listingEvent.count({ where: { listingId: { in: listingIds }, type: "impression", createdAt: { gte: thirtyDaysAgo } } }),
      db.listingEvent.count({ where: { listingId: { in: listingIds }, type: "click", createdAt: { gte: thirtyDaysAgo } } }),
      db.listingEvent.count({ where: { listingId: { in: listingIds }, type: "ai_recommendation", createdAt: { gte: thirtyDaysAgo } } }),
      db.listingEvent.count({ where: { listingId: { in: listingIds }, type: "lead", createdAt: { gte: thirtyDaysAgo } } }),
      db.listingEvent.count({ where: { listingId: { in: listingIds }, type: "impression", createdAt: { gte: sevenDaysAgo } } }),
      db.listingEvent.count({ where: { listingId: { in: listingIds }, type: "click", createdAt: { gte: sevenDaysAgo } } }),
      db.listingEvent.count({ where: { listingId: { in: listingIds }, type: "ai_recommendation", createdAt: { gte: sevenDaysAgo } } }),
      db.listingEvent.count({ where: { listingId: { in: listingIds }, type: "lead", createdAt: { gte: sevenDaysAgo } } }),
    ]);

    // Izračunaj ROI
    const totalLeads30d = leads30d;
    const avgLeadValue = 150; // Povprečna vrednost rezervacije v EUR
    const estimatedRevenue = totalLeads30d * avgLeadValue;
    const monthlyCost = owner.plan === "premium" ? 149 : owner.plan === "enterprise" ? 499 : 0;
    const roi = monthlyCost > 0 ? ((estimatedRevenue - monthlyCost) / monthlyCost) * 100 : 0;
    const roiStatus = roi > 0 ? "positive" : "negative";

    // Konverzija
    const conversionRate = aiRecs30d > 0 ? (totalLeads30d / aiRecs30d) * 100 : 0;

    // Top 5 lokalov po ogledih
    const topListings = [...listings].sort((a, b) => b.viewCount - a.viewCount).slice(0, 5);

    // 30-dnevni trend (po dnevih)
    const trendData: { date: string; impressions: number; clicks: number; aiRecs: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const dayStart = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const [imp, clk, ai] = await Promise.all([
        db.listingEvent.count({ where: { listingId: { in: listingIds }, type: "impression", createdAt: { gte: dayStart, lt: dayEnd } } }),
        db.listingEvent.count({ where: { listingId: { in: listingIds }, type: "click", createdAt: { gte: dayStart, lt: dayEnd } } }),
        db.listingEvent.count({ where: { listingId: { in: listingIds }, type: "ai_recommendation", createdAt: { gte: dayStart, lt: dayEnd } } }),
      ]);
      trendData.push({ date: dayStart.toISOString().split("T")[0], impressions: imp, clicks: clk, aiRecs: ai });
    }

    return NextResponse.json({
      summary: {
        totalListings: listings.length,
        plan: owner.plan,
        monthlyCost,
        impressions30d,
        clicks30d,
        aiRecommendations30d: aiRecs30d,
        leads30d,
        impressions7d,
        clicks7d,
        aiRecommendations7d: aiRecs7d,
        leads7d,
        conversionRate: Math.round(conversionRate * 10) / 10,
        estimatedRevenue,
        roi: Math.round(roi),
        roiStatus,
        avgLeadValue,
      },
      topListings: topListings.map((l) => ({
        id: l.id, name: l.name, slug: l.slug, category: l.category,
        views: l.viewCount, clicks: l.clickCount, aiRecs: l.aiRecommendations, leads: l.leadCount,
        rating: l.rating, destination: l.destinationName,
      })),
      trend: trendData,
      allListings: listings.map((l) => ({
        id: l.id, name: l.name, slug: l.slug, category: l.category,
        views: l.viewCount, clicks: l.clickCount, aiRecs: l.aiRecommendations, leads: l.leadCount,
        featured: l.featured, rating: l.rating,
      })),
    });
  } catch (error) {
    console.error("[owner/analytics] napaka:", error);
    return NextResponse.json({ error: "Napaka pri pridobivanju analitike" }, { status: 500 });
  }
}
