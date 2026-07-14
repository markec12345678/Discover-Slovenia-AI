import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import Stripe from "stripe";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isStripeDemo } from "@/lib/stripe-server";

// POST /api/stripe/portal — ustvari Stripe Customer Portal session
// (za upravljanje naročnine — cancel, update card, see invoices)
// Demo mode: vrne demo message
// Production mode: ustvari portal session z customer ID in vrne URL za redirect
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
        businessName: true,
        stripeCustomerId: true,
        plan: true,
      },
    });

    if (!owner) {
      return NextResponse.json(
        { error: "Lastnik ni najden" },
        { status: 404 }
      );
    }

    // Demo mode
    if (isStripeDemo()) {
      return NextResponse.json({
        demo: true,
        message:
          "Demo način — Stripe Customer Portal ni na voljo. V produkciji bi se tukaj odprl Stripe portal za upravljanje naročnine.",
      });
    }

    if (!owner.stripeCustomerId) {
      return NextResponse.json(
        {
          error:
            "Nimate aktivne Stripe naročnine. Najprej nadgradite paket preko checkout-a.",
        },
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

    const baseUrl =
      process.env.NEXTAUTH_URL ??
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000");

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: owner.stripeCustomerId,
      return_url: `${baseUrl}/owner/dashboard?portal=returned`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (error) {
    console.error("[stripe/portal] napaka:", error);
    const message =
      error instanceof Error ? error.message : "Napaka pri portal-u";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
