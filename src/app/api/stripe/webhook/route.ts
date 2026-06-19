import { NextResponse } from "next/server";

// POST /api/stripe/webhook — Stripe webhook za subscription dogodke
// DEMO MODE: samo log, brez prave obdelave
export async function POST(request: Request) {
  const payload = await request.text();

  // V demo mode samo logiraj
  if (process.env.STRIPE_SECRET_KEY?.includes("demo_placeholder")) {
    console.log("[stripe/webhook] Demo mode — webhook ignoriran");
    return NextResponse.json({ received: true, demo: true });
  }

  // TODO production: verify signature in obdelaj event
  // const sig = request.headers.get("stripe-signature");
  // const event = stripe.webhooks.constructEvent(payload, sig, process.env.STRIPE_WEBHOOK_SECRET);
  // switch (event.type) {
  //   case "checkout.session.completed": ...
  //   case "customer.subscription.updated": ...
  //   case "customer.subscription.deleted": ...
  // }

  return NextResponse.json({ received: true });
}
