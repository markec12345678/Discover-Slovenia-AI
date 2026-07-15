import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { generateCompletion } from "@/lib/ai-client";

// GET /api/ai-insights?type=admin — AI poslovni vpogledi za admin dashboard
// GET /api/ai-insights?type=owner — AI vpogledi za owner dashboard (uporablja session)
//
// AI analizira statistiko in generira actionable insights:
// - Trendi (rast/padec)
// - Priporočila (kaj izboljšati)
// - Anomalije (nenavadni vzorci)
// - Priložnosti (neizkoriščeni potenciali)

interface Insight {
  type: "trend" | "recommendation" | "anomaly" | "opportunity";
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
}

interface AIInsightsResponse {
  insights: Insight[];
  summary: string;
  source: "ai" | "fallback";
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "admin";

    // Avtentikacija
    const adminPassword = request.headers.get("x-admin-password");
    if (type === "admin" && adminPassword !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Neavtorizirano" }, { status: 401 });
    }

    let ownerId = "";
    if (type === "owner") {
      const session = await getServerSession(authOptions);
      if (!session?.user?.email) {
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

    // Zberi statistiko glede na tip
    const stats = type === "admin"
      ? await collectAdminStats()
      : await collectOwnerStats(ownerId);

    // Generiraj AI insights
    const insights = await generateInsights(stats, type);

    return NextResponse.json(insights);
  } catch (error) {
    console.error("[ai-insights] napaka:", error);
    return NextResponse.json(
      {
        insights: [],
        summary: "AI vpogledi trenutno niso na voljo.",
        source: "fallback",
      },
      { status: 200 }
    );
  }
}

interface StatsData {
  totalListings: number;
  totalOwners: number;
  premiumOwners: number;
  enterpriseOwners: number;
  freeOwners: number;
  mrr: number;
  churnRate: number;
  totalViews: number;
  totalClicks: number;
  totalAiRecs: number;
  leads7d: number;
  leads30d: number;
  topCategories: Array<{ category: string; count: number }>;
  topRegions: Array<{ region: string; count: number }>;
  type: "admin" | "owner";
  // Owner-specific
  ownerListings?: number;
  ownerViews?: number;
  ownerClicks?: number;
  ownerAiRecs?: number;
  ownerPlan?: string;
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

async function generateInsights(stats: StatsData, type: "admin" | "owner"): Promise<AIInsightsResponse> {
  const statsStr = type === "admin"
    ? `ADMIN STATISTIKA:
- Skupno lokalov: ${stats.totalListings}
- Skupno lastnikov: ${stats.totalOwners} (free: ${stats.freeOwners}, premium: ${stats.premiumOwners}, enterprise: ${stats.enterpriseOwners})
- MRR: €${stats.mrr}
- Churn rate: ${stats.churnRate}%
- Skupno ogledov: ${stats.totalViews}
- Skupno klikov: ${stats.totalClicks}
- AI priporočila: ${stats.totalAiRecs}
- Leads 7d: ${stats.leads7d}, 30d: ${stats.leads30d}
- Top kategorije: ${stats.topCategories.map((c) => `${c.category} (${c.count})`).join(", ")}`
    : `OWNER STATISTIKA:
- Število lokalov: ${stats.ownerListings}
- Paket: ${stats.ownerPlan}
- Skupno ogledov: ${stats.ownerViews}
- Skupno klikov: ${stats.ownerClicks}
- AI priporočila: ${stats.ownerAiRecs}
- Top kategorije: ${stats.topCategories.map((c) => `${c.category} (${c.count})`).join(", ")}`;

  const systemPrompt = `Si poslovni analitik za slovensko turistično platformo. Analiziraš statistiko in generiraš actionable insights v slovenščini.

VRNI SAMO JSON:
{"insights":[{"type":"","title":"","description":"","priority":""}],"summary":""}

type: "trend" | "recommendation" | "anomaly" | "opportunity"
priority: "high" | "medium" | "low"
title: do 60 znakov
description: do 150 znakov, konkretno in actionable
summary: 1-2 stavka povzetek

Pravila:
- 3-5 insights
- Bodisi specifičen (ne generičen "povečajte promocijo")
- Glede na statistiko, ne splošno
- V slovenščini`;

  const userPrompt = `${statsStr}

Generiraj insights glede na to statistiko.`;

  try {
    const result = await generateCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.5, jsonMode: true }
    );

    const content = result?.content;
    if (!content) throw new Error("Prazen odgovor");

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);

    const insights: Insight[] = (parsed.insights || [])
      .filter((i: Insight) => i.type && i.title && i.description)
      .slice(0, 5)
      .map((i: Insight) => ({
        type: ["trend", "recommendation", "anomaly", "opportunity"].includes(i.type) ? i.type : "recommendation",
        title: String(i.title).substring(0, 60),
        description: String(i.description).substring(0, 150),
        priority: ["high", "medium", "low"].includes(i.priority) ? i.priority : "medium",
      }));

    console.log(`[ai-insights] ${type} — ${insights.length} insights (source: ${result.source})`);

    return {
      insights,
      summary: parsed.summary || "AI vpogledi generirani.",
      source: "ai",
    };
  } catch (error) {
    console.error("[ai-insights] AI napaka:", error);

    // Fallback: preprosti deterministični insights
    return {
      insights: generateFallbackInsights(stats, type),
      summary: "Prikazani so osnovni vpogledi.",
      source: "fallback",
    };
  }
}

function generateFallbackInsights(stats: StatsData, type: "admin" | "owner"): Insight[] {
  const insights: Insight[] = [];

  if (type === "admin") {
    if (stats.churnRate > 5) {
      insights.push({
        type: "anomaly",
        title: "Visok churn rate",
        description: `Churn ${stats.churnRate}% je nad povprečjem. Predlagam pregled premium paketov.`,
        priority: "high",
      });
    }
    if (stats.freeOwners > stats.totalOwners * 0.7) {
      insights.push({
        type: "opportunity",
        title: "Nizka konverzija v premium",
        description: `${Math.round((stats.freeOwners / stats.totalOwners) * 100)}% lastnikov je na free paketu. Ciljajte z upgrade kampanjo.`,
        priority: "medium",
      });
    }
    if (stats.totalListings < 30) {
      insights.push({
        type: "recommendation",
        title: "Rast baze lokalov",
        description: `${stats.totalListings} lokalov — dodajte še ${30 - stats.totalListings} do monetizacije.`,
        priority: "medium",
      });
    }
    insights.push({
      type: "trend",
      title: `MRR: €${stats.mrr}/mesec`,
      description: `Skupno ${stats.totalOwners} lastnikov generira €${stats.mrr} mesečnega prihodka.`,
      priority: "low",
    });
  } else {
    // Owner insights
    if (stats.ownerPlan === "free") {
      insights.push({
        type: "recommendation",
        title: "Nadgradite na Premium",
        description: "Premium paket vključuje AI priporočila in 3x večjo vidljivost.",
        priority: "medium",
      });
    }
    if (stats.ownerViews > 100 && stats.ownerClicks < stats.ownerViews * 0.05) {
      insights.push({
        type: "anomaly",
        title: "Nizka CTR konverzija",
        description: `${stats.ownerClicks} klikov iz ${stats.ownerViews} ogledov. Izboljšajte opis in slike.`,
        priority: "high",
      });
    }
    insights.push({
      type: "trend",
      title: `${stats.ownerListings} lokalov aktivnih`,
      description: `Skupno ${stats.ownerViews} ogledov in ${stats.ownerClicks} klikov.`,
      priority: "low",
    });
  }

  return insights.slice(0, 4);
}
