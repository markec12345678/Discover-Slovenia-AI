import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import Stripe from "stripe";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isStripeDemo } from "@/lib/stripe-server";

// POST /api/stripe/checkout — začne Stripe Checkout session (SUBSCRIPTION mode)
// Demo mode: direktno nadgradi Owner-ja (brez Stripe klica)
// Production mode: ustvari Stripe Customer + Checkout Session in vrne URL za redirect
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Niste prijavljeni" },
        { status: 401 }
      );
    }

    const body: unknown = await request.json().catch(() => ({}));
    const plan =
      typeof body === "object" &&
      body !== null &&
      "plan" in body &&
      typeof (body as Record<string, unknown>).plan === "string"
        ? ((body as Record<string, unknown>).plan as string)
        : null;

    if (!plan || !["premium", "enterprise"].includes(plan)) {
      return NextResponse.json(
        { error: "Neveljaven paket. Dovoljeno: premium | enterprise" },
        { status: 400 }
      );
    }

    const owner = await db.owner.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        email: true,
        businessName: true,
        name: true,
        plan: true,
        subscriptionStatus: true,
        stripeCustomerId: true,
        subscriptionEndsAt: true,
      },
    });

    if (!owner) {
      return NextResponse.json(
        { error: "Lastnik ni najden" },
        { status: 404 }
      );
    }

    const baseUrl =
      process.env.NEXTAUTH_URL ??
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000");

    // === DEMO MODE (brez realnih Stripe ključev) ===
    // Takoj nadgradi Owner-ja, ker ni webhook-a
    if (isStripeDemo()) {
      const now = new Date();
      const subEnd = new Date(now);
      subEnd.setMonth(subEnd.getMonth() + 1);

      await db.owner.update({
        where: { id: owner.id },
        data: {
          plan,
          subscriptionStatus: "active",
          subscriptionEndsAt: subEnd,
        },
      });

      // Nadgradi tudi vse lastnikove listings na nov plan
      await db.listing.updateMany({
        where: { ownerId: owner.id },
        data: { plan },
      });

      return NextResponse.json({
        success: true,
        demo: true,
        message: `Demo: nadgrajeni na ${plan} paket (mesečna naročnina)`,
        plan,
        subscriptionEndsAt: subEnd.toISOString(),
      });
    }

    // === PRODUCTION MODE (z realnimi Stripe ključi) ===
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return NextResponse.json(
        { error: "Stripe ni konfiguriran" },
        { status: 501 }
      );
    }

    const priceId =
      plan === "premium"
        ? process.env.STRIPE_PREMIUM_PRICE_ID
        : process.env.STRIPE_ENTERPRISE_PRICE_ID;

    if (!priceId) {
      return NextResponse.json(
        {
          error: `Manjka Stripe Price ID za paket "${plan}" (STRIPE_${plan.toUpperCase()}_PRICE_ID)`,
        },
        { status: 500 }
      );
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2024-12-18.acacia" as Stripe.LatestApiVersion,
    });

    // 1. Pridobi ali ustvari Stripe Customer
    let customerId = owner.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: owner.email,
        name: owner.businessName || owner.name,
        metadata: {
          ownerId: owner.id,
          ownerEmail: owner.email,
        },
      });
      customerId = customer.id;

      await db.owner.update({
        where: { id: owner.id },
        data: { stripeCustomerId: customerId },
      });
    }

    // 2. Ustvari Checkout Session v subscription mode
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/owner/dashboard?upgrade=success`,
      cancel_url: `${baseUrl}/owner/dashboard?upgrade=cancelled`,
      metadata: {
        ownerId: owner.id,
        ownerEmail: owner.email,
        plan,
      },
      subscription_data: {
        metadata: {
          ownerId: owner.id,
          ownerEmail: owner.email,
          plan,
        },
      },
      allow_promotion_codes: true,
    });

    // NE posodabljamo Owner-ja tukaj — to stori webhook po uspešnem plačilu
    return NextResponse.json({
      url: checkoutSession.url,
    });
  } catch (error) {
    console.error("[stripe/checkout] napaka:", error);
    const message =
      error instanceof Error ? error.message : "Napaka pri checkout-u";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
