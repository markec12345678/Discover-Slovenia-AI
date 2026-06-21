import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/track-funnel — sledi konverzijskemu funnelu
// Body: { step: "homepage_view" | "destination_view" | "itinerary_generate" | "newsletter_signup" | "listing_click", path?: string }
export async function POST(request: Request) {
  try {
    const { step, path } = await request.json();

    const validSteps = ["homepage_view", "destination_view", "itinerary_generate", "newsletter_signup", "listing_click"];
    if (!step || !validSteps.includes(step)) {
      return NextResponse.json({ error: "Neveljaven funnel step" }, { status: 400 });
    }

    await db.pageView.create({
      data: {
        path: path || "/",
        funnelStep: step,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[track-funnel] napaka:", error);
    return NextResponse.json({ error: "Napaka" }, { status: 500 });
  }
}

// GET — funnel statistika (za admin)
export async function GET(request: Request) {
  try {
    const adminPassword = request.headers.get("x-admin-password");
    if (adminPassword !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Neavtorizirano" }, { status: 401 });
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [homepage, destination, itinerary, newsletter, listingClick] = await Promise.all([
      db.pageView.count({ where: { funnelStep: "homepage_view", createdAt: { gte: thirtyDaysAgo } } }),
      db.pageView.count({ where: { funnelStep: "destination_view", createdAt: { gte: thirtyDaysAgo } } }),
      db.pageView.count({ where: { funnelStep: "itinerary_generate", createdAt: { gte: thirtyDaysAgo } } }),
      db.pageView.count({ where: { funnelStep: "newsletter_signup", createdAt: { gte: thirtyDaysAgo } } }),
      db.pageView.count({ where: { funnelStep: "listing_click", createdAt: { gte: thirtyDaysAgo } } }),
    ]);

    const homeToDest = homepage > 0 ? (destination / homepage) * 100 : 0;
    const destToItinerary = destination > 0 ? (itinerary / destination) * 100 : 0;
    const itineraryToSignup = itinerary > 0 ? (newsletter / itinerary) * 100 : 0;
    const overallConversion = homepage > 0 ? (newsletter / homepage) * 100 : 0;

    return NextResponse.json({
      steps: { homepage_view: homepage, destination_view: destination, itinerary_generate: itinerary, newsletter_signup: newsletter, listing_click: listingClick },
      conversionRates: {
        home_to_destination: Math.round(homeToDest * 10) / 10,
        destination_to_itinerary: Math.round(destToItinerary * 10) / 10,
        itinerary_to_signup: Math.round(itineraryToSignup * 10) / 10,
        overall: Math.round(overallConversion * 10) / 10,
      },
      period: "30d",
    });
  } catch (error) {
    console.error("[track-funnel] GET napaka:", error);
    return NextResponse.json({ error: "Napaka" }, { status: 500 });
  }
}
