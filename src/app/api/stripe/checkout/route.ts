import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// POST /api/stripe/checkout — začne Stripe Checkout session
// Za zdaj demo (brez realnih Stripe ključev) — simulačija checkout-a
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Niste prijavljeni" },
        { status: 401 }
      );
    }

    const { plan } = await request.json();
    if (!plan || !["premium", "enterprise"].includes(plan)) {
      return NextResponse.json(
        { error: "Neveljaven paket" },
        { status: 400 }
      );
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const isDemo = !stripeKey || stripeKey.includes("demo_placeholder");

    // === DEMO MODE (brez realnih Stripe ključev) ===
    if (isDemo) {
      // Simuliraj uspešen checkout — direktno nadgradi owner-ja
      const owner = await db.owner.findUnique({
        where: { email: session.user.email },
      });
      if (!owner) {
        return NextResponse.json(
          { error: "Lastnik ni najden" },
          { status: 404 }
        );
      }

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
        message: `Demo: nadgrajeni na ${plan} paket`,
        plan,
        subscriptionEndsAt: subEnd.toISOString(),
      });
    }

    // === PRODUCTION MODE (z realnimi Stripe ključi) ===
    // TODO: ko boš dodal realne Stripe ključe, implementiraj pravi checkout:
    // const stripe = new Stripe(stripeKey);
    // const priceId = plan === "premium" 
    //   ? process.env.STRIPE_PREMIUM_PRICE_ID 
    //   : process.env.STRIPE_ENTERPRISE_PRICE_ID;
    // const checkoutSession = await stripe.checkout.sessions.create({
    //   mode: "subscription",
    //   payment_method_types: ["card"],
    //   line_items: [{ price: priceId, quantity: 1 }],
    //   success_url: `${process.env.NEXTAUTH_URL}/owner/dashboard?upgrade=success`,
    //   cancel_url: `${process.env.NEXTAUTH_URL}/owner/dashboard?upgrade=cancelled`,
    //   customer_email: session.user.email,
    //   metadata: { ownerEmail: session.user.email, plan },
    // });
    // return NextResponse.json({ url: checkoutSession.url });

    return NextResponse.json(
      { error: "Stripe ni konfiguriran" },
      { status: 501 }
    );
  } catch (error) {
    console.error("[stripe/checkout] napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri checkout-u" },
      { status: 500 }
    );
  }
}
