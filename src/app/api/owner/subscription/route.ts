import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import Stripe from "stripe";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isStripeDemo, monthlyRevenueForPlan } from "@/lib/stripe-server";

// GET /api/owner/subscription — vrne trenutno naročnino ownerja
// Vrne: plan, subscriptionStatus, subscriptionEndsAt, stripeCustomerId, daysUntilRenewal, canCancel
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
      select: {
        id: true,
        email: true,
        businessName: true,
        plan: true,
        subscriptionStatus: true,
        subscriptionEndsAt: true,
        stripeCustomerId: true,
      },
    });

    if (!owner) {
      return NextResponse.json(
        { error: "Lastnik ni najden" },
        { status: 404 }
      );
    }

    // Izračunaj daysUntilRenewal
    let daysUntilRenewal: number | null = null;
    if (owner.subscriptionEndsAt) {
      const ms = owner.subscriptionEndsAt.getTime() - Date.now();
      daysUntilRenewal = Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
    }

    // canCancel: samo če ima aktivno naročnino (premium/enterprise in status active)
    const canCancel =
      owner.plan !== "free" &&
      owner.subscriptionStatus === "active" &&
      !!owner.stripeCustomerId;

    return NextResponse.json({
      subscription: {
        id: owner.id,
        plan: owner.plan,
        subscriptionStatus: owner.subscriptionStatus,
        subscriptionEndsAt: owner.subscriptionEndsAt?.toISOString() ?? null,
        stripeCustomerId: owner.stripeCustomerId,
        monthlyRevenue: monthlyRevenueForPlan(owner.plan),
        daysUntilRenewal,
        canCancel,
        demoMode: isStripeDemo(),
      },
    });
  } catch (error) {
    console.error("[owner/subscription] GET napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pridobivanju naročnine" },
      { status: 500 }
    );
  }
}

// POST /api/owner/subscription — prekliči naročnino
// Demo mode: takoj set status=canceled, plan=free
// Production mode: kliče Stripe API za cancel (ob koncu obdobja)
export async function POST() {
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
      select: {
        id: true,
        email: true,
        plan: true,
        subscriptionStatus: true,
        subscriptionEndsAt: true,
        stripeCustomerId: true,
      },
    });

    if (!owner) {
      return NextResponse.json(
        { error: "Lastnik ni najden" },
        { status: 404 }
      );
    }

    if (owner.plan === "free") {
      return NextResponse.json(
        { error: "Nimate aktivne naročnine za preklic" },
        { status: 400 }
      );
    }

    // === DEMO MODE ===
    if (isStripeDemo()) {
      await db.owner.update({
        where: { id: owner.id },
        data: {
          plan: "free",
          subscriptionStatus: "canceled",
          subscriptionEndsAt: null,
        },
      });

      // Sinhroniziraj listings
      await db.listing.updateMany({
        where: { ownerId: owner.id },
        data: { plan: "free" },
      });

      return NextResponse.json({
        success: true,
        demo: true,
        message: "Naročnina preklicana (demo mode). Paket ponastavljen na Free.",
      });
    }

    // === PRODUCTION MODE ===
    if (!owner.stripeCustomerId) {
      return NextResponse.json(
        { error: "Nimate Stripe customer ID — preklic ni mogoč" },
        { status: 400 }
      );
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return NextResponse.json(
        { error: "Stripe ni konfiguriran" },
        { status: 500 }
      );
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2024-12-18.acacia" as Stripe.LatestApiVersion,
    });

    // Pridobi aktivne subscription-e za tega customerja
    const subscriptions = await stripe.subscriptions.list({
      customer: owner.stripeCustomerId,
      status: "active",
      limit: 10,
    });

    if (subscriptions.data.length === 0) {
      // Ni aktivnih subscriptionov — samo lokalno označi kot canceled
      await db.owner.update({
        where: { id: owner.id },
        data: {
          subscriptionStatus: "canceled",
        },
      });
      return NextResponse.json({
        success: true,
        message: "Ni aktivnih Stripe naročnin — status posodobljen.",
      });
    }

    // Prekliči vse aktivne subscriptione
    for (const sub of subscriptions.data) {
      await stripe.subscriptions.cancel(sub.id, {
        cancellation_details: {
          reason: "cancellation_requested",
        },
      });
    }

    // Lokalno označi kot canceled (webhook bo dokončal cleanup)
    await db.owner.update({
      where: { id: owner.id },
      data: {
        subscriptionStatus: "canceled",
      },
    });

    return NextResponse.json({
      success: true,
      message:
        "Naročnina preklicana. Do konca tekočega obdobja boste obdržali dostop, nato pa se paket povrne na Free.",
    });
  } catch (error) {
    console.error("[owner/subscription] POST napaka:", error);
    const message =
      error instanceof Error ? error.message : "Napaka pri preklicu naročnine";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
