import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAdmin } from "@/lib/auth-guards";
import { monthlyRevenueForPlan } from "@/lib/stripe-server";

function unauthorized() {
  return NextResponse.json(
    { error: "Neavtoriziran dostop" },
    { status: 401 }
  );
}

// GET /api/admin/subscriptions — vsi ownerji z njihovimi naročninami
// Vrne: { owners: [...], kpi: { totalMrr, active, premium, enterprise, canceled, free, arr } }
export async function GET(request: Request) {
  const adminPassword = request.headers.get("x-admin-password");
  if (!checkAdmin(adminPassword)) {
    return unauthorized();
  }

  try {
    const owners = await db.owner.findMany({
      orderBy: [{ plan: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        businessName: true,
        name: true,
        email: true,
        plan: true,
        subscriptionStatus: true,
        subscriptionEndsAt: true,
        stripeCustomerId: true,
        createdAt: true,
      },
    });

    const enriched = owners.map((o) => {
      const monthlyRevenue = monthlyRevenueForPlan(o.plan);

      let daysUntilRenewal: number | null = null;
      if (o.subscriptionEndsAt) {
        const ms = o.subscriptionEndsAt.getTime() - Date.now();
        daysUntilRenewal = Math.max(
          0,
          Math.ceil(ms / (1000 * 60 * 60 * 24))
        );
      }

      return {
        ...o,
        subscriptionEndsAt: o.subscriptionEndsAt?.toISOString() ?? null,
        createdAt: o.createdAt.toISOString(),
        monthlyRevenue,
        daysUntilRenewal,
      };
    });

    // KPI izračuni
    const active = enriched.filter((o) => o.subscriptionStatus === "active");
    const canceled = enriched.filter(
      (o) => o.subscriptionStatus === "canceled"
    );
    const pastDue = enriched.filter(
      (o) => o.subscriptionStatus === "past_due"
    );
    const none = enriched.filter((o) => o.subscriptionStatus === "none");

    const premiumActive = enriched.filter(
      (o) => o.plan === "premium" && o.subscriptionStatus === "active"
    );
    const enterpriseActive = enriched.filter(
      (o) => o.plan === "enterprise" && o.subscriptionStatus === "active"
    );
    const freeOwners = enriched.filter((o) => o.plan === "free");

    const totalMrr = active.reduce((sum, o) => sum + o.monthlyRevenue, 0);
    const arr = totalMrr * 12;

    return NextResponse.json({
      owners: enriched,
      kpi: {
        totalMrr,
        arr,
        activeCount: active.length,
        premiumCount: premiumActive.length,
        enterpriseCount: enterpriseActive.length,
        premiumMrr: premiumActive.length * monthlyRevenueForPlan("premium"),
        enterpriseMrr: enterpriseActive.length * monthlyRevenueForPlan("enterprise"),
        canceledCount: canceled.length,
        pastDueCount: pastDue.length,
        noneCount: none.length,
        freeCount: freeOwners.length,
        totalOwners: enriched.length,
        churnRate:
          enriched.length > 0
            ? Number(
                ((canceled.length / enriched.length) * 100).toFixed(1)
              )
            : 0,
      },
    });
  } catch (error) {
    console.error("[admin/subscriptions] GET napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pridobivanju naročnin" },
      { status: 500 }
    );
  }
}
