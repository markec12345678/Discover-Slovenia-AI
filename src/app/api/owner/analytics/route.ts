import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { promises as fs } from "fs";
import path from "path";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { PLAN_MONTHLY_PRICE } from "@/lib/stripe-server";

// GET /api/owner/analytics — vrne analitiko za trenutno prijavljenega ownerja
//
// Aggregira views, clicks in leads iz vseh njegovih listings/products/experiences.
// Vrne tudi "value delivered" izračun (ROI primerjava).

interface LeadRecord {
  id: string;
  timestamp: string;
  name: string;
  email: string;
  businessName: string;
  businessType: string;
  location: string;
  plan: string;
  message?: string;
}

const LEADS_FILE = path.join(process.cwd(), "data", "leads.json");

async function readLeads(): Promise<LeadRecord[]> {
  try {
    const raw = await fs.readFile(LEADS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as LeadRecord[];
    return [];
  } catch {
    return [];
  }
}

interface AnalyticsResponse {
  kpi: {
    totalViews: number;
    totalClicks: number;
    totalLeads: number;
    conversionRate: number;
    listingsCount: number;
    productsCount: number;
    experiencesCount: number;
  };
  topListings: Array<{
    id: string;
    name: string;
    category: string;
    destinationName: string | null;
    viewCount: number;
    clickCount: number;
    type: "listing";
  }>;
  topProducts: Array<{
    id: string;
    name: string;
    category: string;
    destinationName: string | null;
    viewCount: number;
    saleCount: number;
    type: "product";
  }>;
  topExperiences: Array<{
    id: string;
    name: string;
    category: string;
    destinationName: string | null;
    viewCount: number;
    bookingCount: number;
    type: "experience";
  }>;
  trend: {
    // Poenostavljeno: views zadnjih 30 dni = totalViews / 30 (demo)
    days: number;
    dailyViews: number;
    dailyClicks: number;
    dailyLeads: number;
    series: Array<{ day: number; views: number; clicks: number }>;
  };
  roi: {
    plan: string;
    monthlyPrice: number;
    leadsDelivered: number;
    // ROI hevristika: 1 lead ≈ €50 vrednost (povprečna rezervacija)
    estimatedValue: number;
    isPositive: boolean;
    label: string;
    message: string;
  };
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Niste prijavljeni" },
        { status: 401 }
      );
    }

    const owner = await db.owner.findUnique({
      where: { email: session.user.email },
      select: { id: true, plan: true, businessName: true, email: true },
    });

    if (!owner) {
      return NextResponse.json(
        { error: "Lastnik ni najden" },
        { status: 404 }
      );
    }

    // Pridobi vse lastnikove listings, products, experiences
    const [listings, products, experiences] = await Promise.all([
      db.listing.findMany({
        where: { ownerId: owner.id },
        select: {
          id: true,
          name: true,
          category: true,
          destinationName: true,
          viewCount: true,
          clickCount: true,
        },
      }),
      db.product.findMany({
        where: { ownerId: owner.id },
        select: {
          id: true,
          name: true,
          category: true,
          destinationName: true,
          viewCount: true,
          saleCount: true,
        },
      }),
      db.experience.findMany({
        where: { ownerId: owner.id },
        select: {
          id: true,
          name: true,
          category: true,
          destinationName: true,
          viewCount: true,
          bookingCount: true,
        },
      }),
    ]);

    // KPI: agregiraj
    const listingViews = listings.reduce((s, l) => s + l.viewCount, 0);
    const listingClicks = listings.reduce((s, l) => s + l.clickCount, 0);
    const productViews = products.reduce((s, p) => s + p.viewCount, 0);
    const experienceViews = experiences.reduce((s, e) => s + e.viewCount, 0);

    const totalViews = listingViews + productViews + experienceViews;
    const totalClicks = listingClicks;

    // Leads: preberi leads.json in preštej tiste, kjer businessName vsebuje
    // owner.businessName (povpraševanja po tem lokalu) ALI kjer je email enak
    const allLeads = await readLeads();
    const ownerLeads = allLeads.filter((l) => {
      const matchesBusiness =
        l.businessName &&
        owner.businessName &&
        (l.businessName
          .toLowerCase()
          .includes(owner.businessName.toLowerCase()) ||
          owner.businessName.toLowerCase().includes(l.businessName.toLowerCase()));
      return matchesBusiness;
    });
    const totalLeads = ownerLeads.length;

    const conversionRate =
      totalViews > 0 ? Number(((totalClicks / totalViews) * 100).toFixed(2)) : 0;

    // Top oglas: združi listings, products, experiences, uredi po views
    const topListings = [...listings]
      .sort((a, b) => b.viewCount - a.viewCount)
      .slice(0, 5)
      .map((l) => ({
        id: l.id,
        name: l.name,
        category: l.category,
        destinationName: l.destinationName ?? null,
        viewCount: l.viewCount,
        clickCount: l.clickCount,
        type: "listing" as const,
      }));

    const topProducts = [...products]
      .sort((a, b) => b.viewCount - a.viewCount)
      .slice(0, 5)
      .map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        destinationName: p.destinationName ?? null,
        viewCount: p.viewCount,
        saleCount: p.saleCount,
        type: "product" as const,
      }));

    const topExperiences = [...experiences]
      .sort((a, b) => b.viewCount - a.viewCount)
      .slice(0, 5)
      .map((e) => ({
        id: e.id,
        name: e.name,
        category: e.category,
        destinationName: e.destinationName ?? null,
        viewCount: e.viewCount,
        bookingCount: e.bookingCount,
        type: "experience" as const,
      }));

    // Trend: poenostavljen demo (total / 30 → dnevno povprečje)
    const days = 30;
    const dailyViews = Number((totalViews / days).toFixed(1));
    const dailyClicks = Number((totalClicks / days).toFixed(1));
    const dailyLeads = Number((totalLeads / days).toFixed(2));

    // Generiraj sintetične dnevne podatke z blagim naključnim šumom
    // (za vizualizacijo trenda — deterministic seed iz owner.id)
    const seed = hashString(owner.id);
    const series: Array<{ day: number; views: number; clicks: number }> = [];
    for (let i = 0; i < days; i++) {
      const rnd = pseudoRandom(seed + i);
      const factor = 0.6 + rnd * 0.8; // 0.6–1.4
      series.push({
        day: i + 1,
        views: Math.max(0, Math.round(dailyViews * factor)),
        clicks: Math.max(0, Math.round(dailyClicks * factor)),
      });
    }

    // ROI izračun
    const plan = owner.plan;
    const monthlyPrice = PLAN_MONTHLY_PRICE[plan] ?? 0;
    // Hevristika: 1 lead ≈ €50 vrednost (povprečna rezervacija/kos)
    const LEAD_VALUE_EUR = 50;
    const estimatedValue = totalLeads * LEAD_VALUE_EUR;
    // ROI pozitiven če prinaša ≥ 3 leade ALI če je vrednost > cena paketa
    const isPositive =
      plan === "free" || totalLeads >= 3 || estimatedValue >= monthlyPrice;

    const label = isPositive ? "ROI pozitiven" : "ROI negotiven";
    const message = isPositive
      ? `Vaš paket ${plan === "free" ? "Free" : plan} ${
          plan === "free"
            ? "je brezplačen — vsi lead-i so čisti dobiček."
            : `prinaša ${totalLeads} lead-ov (vrednost ${estimatedValue} €) pri ceni ${monthlyPrice} €/mes.`
        }`
      : `Vaš paket ${plan} stane ${monthlyPrice} €/mes, prinaša pa ${totalLeads} lead-ov (vrednost ${estimatedValue} €). Povečajte promocijo!`;

    const response: AnalyticsResponse = {
      kpi: {
        totalViews,
        totalClicks,
        totalLeads,
        conversionRate,
        listingsCount: listings.length,
        productsCount: products.length,
        experiencesCount: experiences.length,
      },
      topListings,
      topProducts,
      topExperiences,
      trend: { days, dailyViews, dailyClicks, dailyLeads, series },
      roi: {
        plan,
        monthlyPrice,
        leadsDelivered: totalLeads,
        estimatedValue,
        isPositive,
        label,
        message,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[api/owner/analytics] napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pridobivanju analitike" },
      { status: 500 }
    );
  }
}

// =========================
// Helper: deterministic hash + PRNG (za stabilne "demo" trend grafike)
// =========================
function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function pseudoRandom(seed: number): number {
  // Mulberry32
  const t = (seed + 0x6d2b79f5) | 0;
  let x = t;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
}
