import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { isStripeDemo, PLAN_MONTHLY_PRICE } from "@/lib/stripe-server";
import { sendEmail, getAdminEmail } from "@/lib/email";
import {
  paymentConfirmationEmail,
  adminAlertEmail,
} from "@/lib/email-templates";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit-log";
import { activateSponsorship } from "@/app/api/owner/sponsorship/route";

// POST /api/stripe/webhook — Stripe webhook za subscription dogodke
// Demo mode: samo logiraj
// Production mode: verify signature in obdelaj event (aktivacija, update, cancel, failed)
export async function POST(request: Request) {
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");

  // === DEMO MODE ===
  if (isStripeDemo()) {
    console.log(
      "[stripe/webhook] Demo mode — webhook ignoriran (payload %d bytes)",
      payload.length
    );
    return NextResponse.json({ received: true, demo: true });
  }

  // === PRODUCTION MODE ===
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!webhookSecret || !stripeKey || !signature) {
    console.error(
      "[stripe/webhook] Manjkajoči konfiguracija (STRIPE_WEBHOOK_SECRET / STRIPE_SECRET_KEY / signature)"
    );
    return NextResponse.json(
      { error: "Webhook ni konfiguriran" },
      { status: 500 }
    );
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: "2024-12-18.acacia" as Stripe.LatestApiVersion,
  });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      payload,
      signature,
      webhookSecret
    );
  } catch (err) {
    console.error("[stripe/webhook] Signature verification failed:", err);
    return NextResponse.json(
      { error: "Neveljaven webhook podpis" },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const cs = event.data.object as Stripe.Checkout.Session;
        const ownerId = cs.metadata?.ownerId;
        const plan = cs.metadata?.plan;
        const sponsorshipId = cs.metadata?.sponsorshipId;
        const listingId = cs.metadata?.listingId;
        const level = cs.metadata?.level;
        const type = cs.metadata?.type;
        const customerId =
          typeof cs.customer === "string" ? cs.customer : cs.customer?.id;

        // === SPONSORSHIP CHECKOUT ===
        if (type === "sponsorship" && sponsorshipId && listingId && ownerId && level) {
          const listing = await db.listing.findUnique({
            where: { id: listingId },
            select: { name: true },
          });

          const endsAt = new Date();
          endsAt.setMonth(endsAt.getMonth() + 1);

          await activateSponsorship(sponsorshipId, listingId, ownerId, level, endsAt, listing?.name || "Lokal");

          console.log(`[stripe/webhook] Sponsorship activated: ${sponsorshipId} (${level})`);
          break;
        }

        // === SUBSCRIPTION CHECKOUT (existing) ===
        if (ownerId && plan && (plan === "premium" || plan === "enterprise")) {
          // Pridobi subscription za renewal date
          let subscriptionEndsAt: Date | null = null;
          if (typeof cs.subscription === "string") {
            try {
              const sub = await stripe.subscriptions.retrieve(cs.subscription);
              subscriptionEndsAt = sub.current_period_end
                ? new Date(sub.current_period_end * 1000)
                : null;
            } catch (e) {
              console.error("[stripe/webhook] sub retrieve failed:", e);
            }
          }

          await db.owner.update({
            where: { id: ownerId },
            data: {
              plan,
              subscriptionStatus: "active",
              subscriptionEndsAt,
              stripeCustomerId: customerId ?? undefined,
              // Reset renewal reminder flag ker je naročnina aktivirana
              renewalReminderSent: false,
            },
          });

          // Posodobi listings
          await db.listing.updateMany({
            where: { ownerId },
            data: { plan },
          });

          // Pošlji payment confirmation email (production)
          try {
            const ownerRec = await db.owner.findUnique({
              where: { id: ownerId },
              select: { name: true, email: true },
            });
            if (ownerRec && subscriptionEndsAt) {
              const amount = PLAN_MONTHLY_PRICE[plan] ?? 0;
              const { subject, html, text } = paymentConfirmationEmail(
                ownerRec.name,
                plan,
                amount,
                subscriptionEndsAt
              );
              await sendEmail({
                to: ownerRec.email,
                subject,
                html,
                text,
              });
            }
          } catch (emailErr) {
            console.error("[stripe/webhook] payment email napaka:", emailErr);
          }

          console.log(
            `[stripe/webhook] checkout.session.completed → owner ${ownerId} nadgrajen na ${plan}`
          );
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const ownerId = sub.metadata?.ownerId;
        const plan = sub.metadata?.plan;
        const status = sub.status;

        if (!ownerId) break;

        const mappedStatus = mapStripeStatus(status);
        const subEnd = sub.current_period_end
          ? new Date(sub.current_period_end * 1000)
          : null;

        const updateData: Record<string, unknown> = {
          subscriptionStatus: mappedStatus,
          subscriptionEndsAt: subEnd,
        };

        if (plan && (plan === "premium" || plan === "enterprise")) {
          updateData.plan = plan;
        }

        if (status === "canceled") {
          updateData.plan = "free";
        }

        // Reset renewalReminderSent če se je renewal datum podaljšal (nova obnovitev)
        if (subEnd && subEnd.getTime() > Date.now() + 7 * 24 * 60 * 60 * 1000) {
          updateData.renewalReminderSent = false;
        }

        await db.owner.update({
          where: { id: ownerId },
          data: updateData,
        });

        // Sinhroniziraj listings ob spremembi paketa
        if (typeof updateData.plan === "string") {
          await db.listing.updateMany({
            where: { ownerId },
            data: { plan: updateData.plan },
          });
        }

        console.log(
          `[stripe/webhook] customer.subscription.updated → owner ${ownerId} status=${mappedStatus} plan=${updateData.plan ?? "neznano"}`
        );
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const ownerId = sub.metadata?.ownerId;

        if (!ownerId) break;

        await db.owner.update({
          where: { id: ownerId },
          data: {
            plan: "free",
            subscriptionStatus: "canceled",
            subscriptionEndsAt: null,
          },
        });

        await db.listing.updateMany({
          where: { ownerId },
          data: { plan: "free" },
        });

        // Admin alert o preklicu
        try {
          const ownerRec = await db.owner.findUnique({
            where: { id: ownerId },
            select: { email: true, businessName: true },
          });
          if (ownerRec) {
            const alert = adminAlertEmail("cancellation", {
              ownerId,
              email: ownerRec.email,
              businessName: ownerRec.businessName,
              timestamp: new Date().toISOString(),
            });
            await sendEmail({
              to: getAdminEmail(),
              subject: alert.subject,
              html: alert.html,
              text: alert.text,
            });
          }
        } catch (emailErr) {
          console.error("[stripe/webhook] cancel alert napaka:", emailErr);
        }

        console.log(
          `[stripe/webhook] customer.subscription.deleted → owner ${ownerId} preklican`
        );
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === "string"
            ? invoice.customer
            : invoice.customer?.id;

        if (!customerId) break;

        const owner = await db.owner.findFirst({
          where: { stripeCustomerId: customerId },
          select: { id: true, email: true, businessName: true, plan: true },
        });

        if (owner) {
          await db.owner.update({
            where: { id: owner.id },
            data: { subscriptionStatus: "past_due" },
          });

          // Admin alert o neuspelem plačilu
          try {
            const alert = adminAlertEmail("payment_failed", {
              ownerId: owner.id,
              email: owner.email,
              businessName: owner.businessName,
              plan: owner.plan,
              invoiceId: invoice.id,
              timestamp: new Date().toISOString(),
            });
            await sendEmail({
              to: getAdminEmail(),
              subject: alert.subject,
              html: alert.html,
              text: alert.text,
            });
          } catch (emailErr) {
            console.error("[stripe/webhook] payment_failed alert napaka:", emailErr);
          }

          console.log(
            `[stripe/webhook] invoice.payment_failed → owner ${owner.id} status=past_due`
          );
        }
        break;
      }

      default:
        // Neobdelan event — samo log
        console.log(`[stripe/webhook] neobdelan event: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[stripe/webhook] napaka pri obdelavi eventa:", error);
    return NextResponse.json(
      { error: "Napaka pri obdelavi webhook-a" },
      { status: 500 }
    );
  }
}

// Mapiranje Stripe subscription statusa v naš interno polje
function mapStripeStatus(
  status: Stripe.Subscription.Status
): "active" | "past_due" | "canceled" | "none" {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      return "none";
  }
}
