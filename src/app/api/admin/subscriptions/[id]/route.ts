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

// PUT /api/admin/subscriptions/[id] — admin override naročnine
// Telo: { plan?, subscriptionStatus?, subscriptionEndsAt? }
// Spremeni polja in sinhronizira listings.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminPassword = request.headers.get("x-admin-password");
  if (!checkAdmin(adminPassword)) {
    return unauthorized();
  }

  try {
    const { id } = await params;
    const existing = await db.owner.findUnique({
      where: { id },
      select: {
        id: true,
        businessName: true,
        email: true,
        plan: true,
        subscriptionStatus: true,
        subscriptionEndsAt: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Lastnik ni najden" },
        { status: 404 }
      );
    }

    const body: Record<string, unknown> = await request.json();

    const updateData: Record<string, unknown> = {};

    // Plan
    if (typeof body.plan === "string") {
      if (!["free", "premium", "enterprise"].includes(body.plan)) {
        return NextResponse.json(
          { error: "Neveljaven paket" },
          { status: 400 }
        );
      }
      updateData.plan = body.plan;
    }

    // Subscription status
    if (typeof body.subscriptionStatus === "string") {
      if (
        !["none", "active", "canceled", "past_due"].includes(
          body.subscriptionStatus
        )
      ) {
        return NextResponse.json(
          { error: "Neveljaven status naročnine" },
          { status: 400 }
        );
      }
      updateData.subscriptionStatus = body.subscriptionStatus;
    }

    // Subscription ends at (ISO string ali null)
    if (body.subscriptionEndsAt === null) {
      updateData.subscriptionEndsAt = null;
    } else if (typeof body.subscriptionEndsAt === "string") {
      const d = new Date(body.subscriptionEndsAt);
      if (isNaN(d.getTime())) {
        return NextResponse.json(
          { error: "Neveljaven datum subscriptionEndsAt" },
          { status: 400 }
        );
      }
      updateData.subscriptionEndsAt = d;
    }

    // Če preklopijo na free, ponastavi tudi status in endsAt
    if (updateData.plan === "free") {
      updateData.subscriptionStatus =
        updateData.subscriptionStatus ?? "canceled";
      if (updateData.subscriptionStatus === "canceled") {
        updateData.subscriptionEndsAt = updateData.subscriptionEndsAt ?? null;
      }
    }

    const updated = await db.owner.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        businessName: true,
        email: true,
        plan: true,
        subscriptionStatus: true,
        subscriptionEndsAt: true,
        stripeCustomerId: true,
      },
    });

    // Sinhroniziraj listings če se je plan spremenil
    if (typeof updateData.plan === "string") {
      await db.listing.updateMany({
        where: { ownerId: id },
        data: { plan: updateData.plan },
      });
    }

    console.log(
      `[admin/subscriptions] Override za owner ${id} (${existing.email}):`,
      {
        before: {
          plan: existing.plan,
          subscriptionStatus: existing.subscriptionStatus,
          subscriptionEndsAt: existing.subscriptionEndsAt?.toISOString() ?? null,
        },
        after: updateData,
      }
    );

    return NextResponse.json({
      success: true,
      owner: {
        ...updated,
        subscriptionEndsAt:
          updated.subscriptionEndsAt?.toISOString() ?? null,
        monthlyRevenue: monthlyRevenueForPlan(updated.plan),
      },
    });
  } catch (error) {
    console.error("[admin/subscriptions/id] PUT napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri posodabljanju naročnine" },
      { status: 500 }
    );
  }
}
