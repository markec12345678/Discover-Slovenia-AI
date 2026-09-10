import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import Stripe from "stripe";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isStripeDemo } from "@/lib/stripe-server";

// ============================================================================
// POST /api/owner/commissions/checkout — Stripe Checkout za provizijski račun
// ============================================================================
// Faza 5: enkratno (mode=payment) plačilo izdanega provizijskega računa.
// body: { invoiceId }
//
// Demo mode (brez STRIPE_SECRET_KEY): 503 + jasno sporočilo — lastnik naj
// plača prek SEPA nakazila (podatki so na PDF računu) ali uporabi
// "Označi kot plačano" po prejetem plačilu.
//
// Production: ustvari Checkout Session (podatek o računu v metadata) in vrne
// { url }. Ob uspešnem plačilu webhook (checkout.session.completed,
// type=commission_invoice) označi račun kot plačan in pošlje potrdilo.
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || session.user.accountType === "user") {
      return NextResponse.json({ error: "Niste prijavljeni" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      invoiceId?: string;
    };
    const { invoiceId } = body;

    if (!invoiceId) {
      return NextResponse.json({ error: "Manjka invoiceId" }, { status: 400 });
    }

    const owner = await db.owner.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        email: true,
        name: true,
        businessName: true,
        stripeCustomerId: true,
        emailVerified: true,
      },
    });
    if (!owner) {
      return NextResponse.json({ error: "Lastnik ni najden" }, { status: 404 });
    }

    // P3a-2: plačljive funkcije (provizijski račun) zahtevajo potrjeno
    // e-pošto (ponovna povezava: nadzorna plošča → verify-email "request")
    if (!owner.emailVerified) {
      return NextResponse.json(
        {
          error:
            "Pred aktivacijo plačljivih funkcij potrdite svojo e-pošto. Povezavo za potrditev lahko ponovno zahtevate na nadzorni plošči.",
        },
        { status: 403 }
      );
    }

    const invoice = await db.commissionInvoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice || invoice.ownerId !== owner.id) {
      return NextResponse.json(
        { error: "Račun ni najden ali nimate dovoljenja" },
        { status: 404 }
      );
    }
    if (invoice.status === "paid") {
      return NextResponse.json(
        { error: "Račun je že plačan" },
        { status: 400 }
      );
    }
    if (invoice.amount <= 0) {
      return NextResponse.json(
        { error: "Znesek računa je 0 — nič za plačati" },
        { status: 400 }
      );
    }

    // === DEMO MODE — kartično plačilo ni na voljo ===
    if (isStripeDemo()) {
      return NextResponse.json(
        {
          error:
            "Kartično plačilo ni konfigurirano (demo). Račun poravnajte prek " +
            "SEPA nakazila (podatki so na PDF računu) in ga nato označite kot plačan.",
          demo: true,
        },
        { status: 503 }
      );
    }

    // === PRODUCTION MODE ===
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return NextResponse.json(
        { error: "Stripe ni konfiguriran" },
        { status: 501 }
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

    // Pridobi (ali ustvari) Stripe Customer — kot pri naročninskem checkoutu.
    let customerId = owner.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: owner.email,
        name: owner.businessName || owner.name,
        metadata: { ownerId: owner.id, ownerEmail: owner.email },
      });
      customerId = customer.id;
      await db.owner.update({
        where: { id: owner.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            // Stripe pričakuje cente (integer)
            unit_amount: Math.round(invoice.amount * 100),
            product_data: {
              name: `Provizijski račun ${invoice.invoiceNumber}`,
              description:
                "Provizija za rezervacije iz AI konzultacij " +
                `(stopnja ${Math.round(invoice.rate * 100)} %)`,
            },
          },
        },
      ],
      success_url: `${baseUrl}/owner/dashboard?commission=success`,
      cancel_url: `${baseUrl}/owner/dashboard?commission=cancelled`,
      metadata: {
        type: "commission_invoice",
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        ownerId: owner.id,
      },
      payment_intent_data: {
        metadata: {
          type: "commission_invoice",
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          ownerId: owner.id,
        },
      },
    });

    // NE označujemo plačanega tukaj — to stori webhook (checkout.session.completed)
    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error("[owner/commissions/checkout] napaka:", error);
    const message =
      error instanceof Error ? error.message : "Napaka pri checkout-u";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
