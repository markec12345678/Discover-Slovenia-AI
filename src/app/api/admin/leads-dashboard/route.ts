import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { promises as fs } from "fs";
import path from "path";

export async function GET(request: Request) {
  try {
    const adminPassword = request.headers.get("x-admin-password");
    if (adminPassword !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Neavtorizirano" }, { status: 401 });
    }

    let newsletterCount = 0;
    let newsletterLatest: string | null = null;
    let itineraryEmails = 0;
    try {
      const filePath = path.join(process.cwd(), "data", "newsletter.json");
      const data = await fs.readFile(filePath, "utf-8");
      const subs = JSON.parse(data);
      newsletterCount = subs.length;
      newsletterLatest = subs[subs.length - 1]?.createdAt || null;
      itineraryEmails = subs.filter((s: { source?: string }) => s.source === "itinerary_email").length;
    } catch {}

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [homepage, destination, itinerary, newsletter, listingClick] = await Promise.all([
      db.pageView.count({ where: { funnelStep: "homepage_view", createdAt: { gte: thirtyDaysAgo } } }),
      db.pageView.count({ where: { funnelStep: "destination_view", createdAt: { gte: thirtyDaysAgo } } }),
      db.pageView.count({ where: { funnelStep: "itinerary_generate", createdAt: { gte: thirtyDaysAgo } } }),
      db.pageView.count({ where: { funnelStep: "newsletter_signup", createdAt: { gte: thirtyDaysAgo } } }),
      db.pageView.count({ where: { funnelStep: "listing_click", createdAt: { gte: thirtyDaysAgo } } }),
    ]);

    const totalPageViews = await db.pageView.count();
    const topPagesRaw = await db.pageView.groupBy({
      by: ["path"], _count: { _all: true }, orderBy: { _count: { path: "desc" } }, take: 5,
    });

    return NextResponse.json({
      newsletterSubscribers: newsletterCount,
      newsletterLatest,
      itineraryEmailsSent: itineraryEmails,
      totalPageViews,
      overallConversionRate: homepage > 0 ? Math.round((newsletter / homepage) * 1000) / 10 : 0,
      funnel: { homepage_view: homepage, destination_view: destination, itinerary_generate: itinerary, newsletter_signup: newsletter, listing_click: listingClick },
      topPages: topPagesRaw.map((p) => ({ path: p.path, views: p._count._all })),
    });
  } catch (error) {
    console.error("[admin/leads-dashboard] napaka:", error);
    return NextResponse.json({ error: "Napaka" }, { status: 500 });
  }
}
