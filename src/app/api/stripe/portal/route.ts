import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import Stripe from "stripe";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isStripeConfigured, isStripeDemo } from "@/lib/stripe-server";

// POST /api/stripe/portal — ustvari Stripe Customer Portal session
// (za upravljanje naročnine — cancel, update card, see invoices)
// Demo mode: vrne demo message
// Production mode: ustvari portal session z customer ID in vrne URL za redirect
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    // F1 (revizija 1.36.0, 19-b P2): email kolizija User/Owner — brez tega
    // guard-a bi B2C seja dobila Stripe billing portal TUJEGA ownerja
    // (preklic naročnine, zamenjava kartice).
    if (
      !session?.user?.email ||
      session.user.accountType === "user"
    ) {
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
    // 19e-1 (1.36.0): fail-closed — produkcija brez ključa (in brez
    // DSA_DEMO_PAYMENTS=1) ne sme tiho pasti v demo odgovor.
    if (!isStripeConfigured()) {
      return NextResponse.json(
        {
          error:
            "Plačila niso konfigurirana (STRIPE_SECRET_KEY manjka). Nastavite Stripe ključe ali DSA_DEMO_PAYMENTS=1 za demo način.",
        },
        { status: 503 }
      );
    }
    if (!stripeKey) {
      return NextResponse.json(
        { error: "Stripe ni konfiguriran" },
        { status: 500 }
      );
    }

    const stripe = new Stripe(stripeKey, {
      // FIXME: stripe v22 tipi pričakujejo le LatestApiVersion ("2026-05-27.dahlia");
      // pin ostaja na "2024-12-18.acacia" (nespremenjeno obnašanje).
      apiVersion: "2024-12-18.acacia" as NonNullable<
        ConstructorParameters<typeof Stripe>[1]
      >["apiVersion"],
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
    // INFO-LEAK FIX (1.33.0): statično sporočilo (detajli v server logu).
    return NextResponse.json({ error: "Napaka pri portal-u" }, { status: 500 });
  }
}
