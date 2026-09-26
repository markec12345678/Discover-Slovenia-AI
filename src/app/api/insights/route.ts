import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { checkAdmin } from "@/lib/auth-guards";
import { rateLimit } from "@/lib/rate-limit";
import {
  generateDeterministicInsights,
  type StatsData,
} from "@/lib/deterministic-insights";

// GET /api/insights?type=admin — DETERMINISTIČNI poslovni vpogledi za admin
//                            dashboard (Issue #9 ZERO-AI: preimenovali iz
//                            /api/ai-insights, vir vedno "deterministic")
// GET /api/insights?type=owner — vpogledi za owner dashboard (session)
//
// Vpogledi so IZRAČUNANI iz statistike baze (stopnje, pragovi, trendi):
// - Trendi (rast/padec)
// - Priporočila (kaj izboljšati)
// - Anomalije (nenavadni vzorci)
// - Priložnosti (neizkoriščeni potenciali)
//
// NIČ AI, NIČ omrežja — enak izračun za enako statistiko.
//
// P3a-4: timing-safe checkAdmin + rate limit 60/10 min (nespremenjeni).

export async function GET(request: Request) {
  try {
    // P3a-4: rate limit (nespremenjena varovalka)
    const limited = rateLimit(request, {
      limit: 60,
      windowMs: 10 * 60_000,
      key: "insights",
    });
    if (limited) return limited;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "admin";

    // 19c-6 (revizija 1.36.0, P3): neznan type → 404 (nespremenjeno)
    if (type !== "admin" && type !== "owner") {
      return NextResponse.json({ error: "Neznan tip" }, { status: 404 });
    }

    // Avtentikacija (P3a-4: timing-safe checkAdmin iz auth-guards)
    if (type === "admin") {
      if (!checkAdmin(request)) {
        return NextResponse.json({ error: "Neavtorizirano" }, { status: 401 });
      }
    }

    let ownerId = "";
    if (type === "owner") {
      const session = await getServerSession(authOptions);
      // F1 (revizija 1.36.0, 19-b P2): email kolizija User/Owner — brez
      // tega guard-a bi B2C seja brala tuje ponudniške statistike.
      if (
        !session?.user?.email ||
        session.user.accountType === "user"
      ) {
        return NextResponse.json({ error: "Neavtorizirano" }, { status: 401 });
      }
      const owner = await db.owner.findUnique({
        where: { email: session.user.email },
        select: { id: true },
      });
      if (!owner) {
        return NextResponse.json({ error: "Owner ni najden" }, { status: 404 });
      }
      ownerId = owner.id;
    }

    // Zberi statistiko glede na tip (agregati iz baze — nespremenjeno)
    const stats = type === "admin"
      ? await collectAdminStats()
      : await collectOwnerStats(ownerId);

    // Deterministični vpogledi — izračunani iz statistike (0 AI)
    const insights = generateDeterministicInsights(
      stats,
      type as "admin" | "owner"
    );

    return NextResponse.json(insights);
  } catch (error) {
    console.error("[insights] napaka:", error);
    return NextResponse.json(
      {
        insights: [],
        summary: "Vpogledi trenutno niso na voljo.",
        source: "deterministic",
      },
      { status: 200 }
    );
  }
}

async function collectAdminStats(): Promise<StatsData> {
  const [
    totalListings,
    totalOwners,
    owners,
    listingViews,
    listingClicks,
    listingAiRecs,
    categoriesGroup,
  ] = await Promise.all([
    db.listing.count(),
    db.owner.count(),
    db.owner.findMany({ select: { plan: true, subscriptionStatus: true } }),
    db.listing.aggregate({ _sum: { viewCount: true } }),
    db.listing.aggregate({ _sum: { clickCount: true } }),
    db.listing.aggregate({ _sum: { viewCount: true } }), // fallback (aiRecs nima svojega polja)
    db.listing.groupBy({ by: ["category"], _count: { _all: true }, orderBy: { _count: { category: "desc" } }, take: 5 }),
  ]);

  const premiumOwners = owners.filter((o) => o.plan === "premium").length;
  const enterpriseOwners = owners.filter((o) => o.plan === "enterprise").length;
  const freeOwners = owners.filter((o) => o.plan === "free").length;
  const canceled = owners.filter((o) => o.subscriptionStatus === "canceled").length;
  const active = owners.filter((o) => o.subscriptionStatus === "active").length;
  const churnRate = active + canceled > 0 ? (canceled / (active + canceled)) * 100 : 0;

  const PLAN_PRICES: Record<string, number> = { premium: 149, enterprise: 499, free: 0 };
  const mrr = owners.reduce((sum, o) => sum + (PLAN_PRICES[o.plan] || 0), 0);

  return {
    totalListings,
    totalOwners,
    premiumOwners,
    enterpriseOwners,
    freeOwners,
    mrr,
    churnRate: Math.round(churnRate * 10) / 10,
    totalViews: listingViews._sum.viewCount || 0,
    totalClicks: listingClicks._sum.clickCount || 0,
    totalAiRecs: listingAiRecs._sum.viewCount || 0,
    leads7d: 0,
    leads30d: 0,
    topCategories: categoriesGroup.map((c) => ({ category: c.category, count: c._count._all })),
    topRegions: [],
    type: "admin",
  };
}

async function collectOwnerStats(ownerId: string): Promise<StatsData> {
  if (!ownerId) {
    return {
      totalListings: 0, totalOwners: 0, premiumOwners: 0, enterpriseOwners: 0,
      freeOwners: 0, mrr: 0, churnRate: 0, totalViews: 0, totalClicks: 0,
      totalAiRecs: 0, leads7d: 0, leads30d: 0, topCategories: [], topRegions: [],
      type: "owner", ownerListings: 0, ownerViews: 0, ownerClicks: 0, ownerAiRecs: 0,
    };
  }

  const owner = await db.owner.findUnique({
    where: { id: ownerId },
    select: { plan: true, name: true, businessName: true },
  });

  const listings = await db.listing.findMany({
    where: { ownerId },
    select: { viewCount: true, clickCount: true, category: true, destinationName: true },
  });

  const ownerViews = listings.reduce((sum, l) => sum + l.viewCount, 0);
  const ownerClicks = listings.reduce((sum, l) => sum + l.clickCount, 0);

  const catMap = new Map<string, number>();
  listings.forEach((l) => {
    catMap.set(l.category, (catMap.get(l.category) || 0) + 1);
  });
  const topCategories = Array.from(catMap.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totalListings: listings.length,
    totalOwners: 0, premiumOwners: 0, enterpriseOwners: 0, freeOwners: 0,
    mrr: 0, churnRate: 0,
    totalViews: ownerViews, totalClicks: ownerClicks, totalAiRecs: ownerViews,
    leads7d: 0, leads30d: 0,
    topCategories, topRegions: [],
    type: "owner",
    ownerListings: listings.length,
    ownerViews, ownerClicks, ownerAiRecs: ownerViews,
    ownerPlan: owner?.plan || "free",
  };
}


