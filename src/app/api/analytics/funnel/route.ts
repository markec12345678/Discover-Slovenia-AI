import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAdmin } from "@/lib/auth-guards";

// GET /api/analytics/funnel — search → click → contact → booking funnel
// Header: x-admin-password
// Query: ?days=30 (default 30)
//
// Primer:
// AI priporočilo: 500 prikazov
// Klik: 83
// Kontakt: 12
// Rezervacija: 3
export async function GET(request: Request) {
  try {
    if (!checkAdmin(request.headers.get("x-admin-password"))) {
      return NextResponse.json({ error: "Neavtorizirano" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") || "30", 10);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // === GLOBAL FUNNEL ===
    const [impressions, clicks, contacts, bookings, aiRecs] = await Promise.all([
      db.listingEvent.count({
        where: { type: "impression", createdAt: { gte: since } },
      }),
      db.listingEvent.count({
        where: { type: "click", createdAt: { gte: since } },
      }),
      db.listingEvent.count({
        where: { type: "lead", createdAt: { gte: since } },
      }),
      db.booking.count({
        where: { createdAt: { gte: since } },
      }),
      db.listingEvent.count({
        where: { type: "ai_recommendation", createdAt: { gte: since } },
      }),
    ]);

    // === CONVERSION RATES ===
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const contactRate = clicks > 0 ? (contacts / clicks) * 100 : 0;
    const bookingRate = contacts > 0 ? (bookings / contacts) * 100 : 0;
    const overallConversion = impressions > 0 ? (bookings / impressions) * 100 : 0;
    const aiToClickRate = aiRecs > 0 ? (clicks / aiRecs) * 100 : 0;

    // === AI vs ORGANIC ===
    const aiClicks = await db.listingEvent.count({
      where: {
        type: "click",
        createdAt: { gte: since },
        source: "ai_recommendation",
      },
    }).catch(() => 0);

    const organicClicks = clicks - aiClicks;

    // === TOP PERFORMERS ===
    const topListings = await db.listingEvent.groupBy({
      by: ["listingId"],
      where: {
        type: "click",
        createdAt: { gte: since },
      },
      _count: { listingId: true },
      orderBy: { _count: { listingId: "desc" } },
      take: 10,
    });

    // Enrich z imeni
    const topEnriched = await Promise.all(
      topListings.map(async (item) => {
        const listing = await db.listing.findUnique({
          where: { id: item.listingId },
          select: { name: true, category: true, destinationName: true, partnerStatus: true, plan: true },
        });
        return {
          listingId: item.listingId,
          name: listing?.name || "Neznan",
          category: listing?.category,
          destinationName: listing?.destinationName,
          partnerStatus: listing?.partnerStatus,
          plan: listing?.plan,
          clicks: item._count.listingId,
        };
      })
    );

    // === DAILY BREAKDOWN (zadnje 7 dni) ===
    const dailyData: Array<{ date: string; impressions: number; clicks: number; contacts: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);

      const [dayImp, dayClicks, dayContacts] = await Promise.all([
        db.listingEvent.count({
          where: { type: "impression", createdAt: { gte: dayStart, lte: dayEnd } },
        }),
        db.listingEvent.count({
          where: { type: "click", createdAt: { gte: dayStart, lte: dayEnd } },
        }),
        db.listingEvent.count({
          where: { type: "lead", createdAt: { gte: dayStart, lte: dayEnd } },
        }),
      ]);

      dailyData.push({
        date: dayStart.toISOString().split("T")[0],
        impressions: dayImp,
        clicks: dayClicks,
        contacts: dayContacts,
      });
    }

    return NextResponse.json({
      funnel: {
        aiRecommendations: aiRecs,
        impressions,
        clicks,
        contacts,
        bookings,
      },
      conversionRates: {
        aiToClick: `${aiToClickRate.toFixed(1)}%`,
        ctr: `${ctr.toFixed(1)}%`,
        contactRate: `${contactRate.toFixed(1)}%`,
        bookingRate: `${bookingRate.toFixed(1)}%`,
        overallConversion: `${overallConversion.toFixed(2)}%`,
      },
      aiVsOrganic: {
        aiClicks,
        organicClicks,
        aiClickShare: clicks > 0 ? `${((aiClicks / clicks) * 100).toFixed(1)}%` : "0%",
      },
      topListings: topEnriched,
      daily: dailyData,
      period: { days, since: since.toISOString() },
    });
  } catch (error) {
    console.error("[analytics/funnel] napaka:", error);
    return NextResponse.json({ error: "Napaka" }, { status: 500 });
  }
}
