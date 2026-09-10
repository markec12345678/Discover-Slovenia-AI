import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { isStripeDemo, PLAN_MONTHLY_PRICE } from "@/lib/stripe-server";
import { sendEmail, getAdminEmail } from "@/lib/email";
import {
  paymentConfirmationEmail,
  adminAlertEmail,
  commissionInvoicePaidEmail,
} from "@/lib/email-templates";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit-log";
import { activateSponsorship } from "@/lib/sponsorships";

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

  // P3b-12: ločena odgovora — mankajoča KONFIGURACIJA je napaka strežnika
  // (500), manjkajoči PODPIS pa napaka klica (400, ne 500).
  if (!webhookSecret || !stripeKey) {
    console.error(
      "[stripe/webhook] Manjkajoča konfiguracija (STRIPE_WEBHOOK_SECRET / STRIPE_SECRET_KEY)"
    );
    return NextResponse.json(
      { error: "Webhook ni konfiguriran" },
      { status: 500 }
    );
  }
  if (!signature) {
    console.error("[stripe/webhook] Manjka stripe-signature glava");
    return NextResponse.json(
      { error: "Manjka podpis" },
      { status: 400 }
    );
  }

  const stripe = new Stripe(stripeKey, {
    // FIXME: stripe v22 tipi pri\u010dakujejo le LatestApiVersion ("2026-05-27.dahlia");
    // pin ostaja na "2024-12-18.acacia" (nespremenjeno obna\u0161anje) \u2014 cast na pri\u010dakovani tip konfiguracije.
    apiVersion: "2024-12-18.acacia" as NonNullable<
      ConstructorParameters<typeof Stripe>[1]
    >["apiVersion"],
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

  // === P3b-7: DEDUPLIKACIJA EVENTOV ===
  // Stripe ob napaki retry-a dostavljanje — obdelan event.id se zapiše v
  // ProcessedStripeEvent (PK). Unique constraint (P2002) je ATOMARNA
  // varovalka tudi pred sočasno obdelavo istega eventa (dve instanci).
  // Ponovitev → 200 { received, duplicate }, da Stripe ne retry-a več.
  try {
    await db.processedStripeEvent.create({
      data: { id: event.id, eventType: event.type },
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      console.log(
        `[stripe/webhook] podvojen event ${event.id} (${event.type}) — obdelava preskočena`
      );
      return NextResponse.json({ received: true, duplicate: true });
    }
    throw e;
  }
  // Best-effort čiščenje zapisov starejših od 30 dni (ne-čakajoče —
  // kozmetika, ki ne sme vplivati na obdelavo eventa).
  db.processedStripeEvent
    .deleteMany({
      where: {
        createdAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60_000) },
      },
    })
    .catch(() => {
      // čiščenje je best-effort — napako tiho pogoltnemo
    });

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

        // === COMMISSION INVOICE CHECKOUT (Faza 5 — provizijski račun) ===
        if (type === "commission_invoice" && cs.metadata?.invoiceId) {
          const invoice = await db.commissionInvoice.findUnique({
            where: { id: cs.metadata.invoiceId },
          });
          if (!invoice) {
            console.error(
              `[stripe/webhook] commission_invoice: račun ${cs.metadata.invoiceId} ni najden`
            );
            break;
          }
          // P3b-6: plačilo mora pokriti znesek računa. invoice.amount je v
          // EUR, cs.amount_total v CENTIH → pričakovano = round(amount × 100).
          // Premajhen znesek → ZAVRNJENO (račun ostane issued, log).
          const expectedInvoiceCents = Math.round(invoice.amount * 100);
          const paidInvoiceCents = cs.amount_total ?? 0;
          if (paidInvoiceCents < expectedInvoiceCents) {
            console.error(
              `[stripe/webhook] commission_invoice ${invoice.invoiceNumber} ZAVRNJEN: plačano ${paidInvoiceCents} centov < znesek računa ${expectedInvoiceCents} centov`
            );
            break;
          }
          // Idempotenca — webhook lahko pride dvakrat (retry)
          if (invoice.status !== "paid") {
            const paymentIntentId =
              typeof cs.payment_intent === "string"
                ? cs.payment_intent
                : cs.payment_intent?.id ?? null;

            await db.commissionInvoice.update({
              where: { id: invoice.id },
              data: {
                status: "paid",
                paidAt: new Date(),
                stripePaymentId: paymentIntentId ?? undefined,
              },
            });

            await logAudit({
              actorId: invoice.ownerId,
              actorRole: "owner",
              action: AUDIT_ACTIONS.COMMISSION_INVOICE_PAID,
              resourceType: "commission_invoice",
              resourceId: invoice.id,
              resourceName: invoice.invoiceNumber,
              metadata: {
                amount: invoice.amount,
                via: "stripe",
                paymentIntentId: paymentIntentId ?? null,
              },
            });

            // Potrdilo o plačilu (receipt) lastniku
            try {
              const ownerRec = await db.owner.findUnique({
                where: { id: invoice.ownerId },
                select: { name: true, email: true },
              });
              if (ownerRec) {
                const { subject, html, text } = commissionInvoicePaidEmail({
                  ownerName: ownerRec.name,
                  invoiceNumber: invoice.invoiceNumber,
                  amount: invoice.amount,
                  paidAt: new Date(),
                });
                await sendEmail({
                  to: ownerRec.email,
                  subject,
                  html,
                  text,
                });
              }
            } catch (emailErr) {
              console.error(
                "[stripe/webhook] commission receipt email napaka:",
                emailErr
              );
            }
          }
          console.log(
            `[stripe/webhook] commission_invoice ${invoice.invoiceNumber} plačan`
          );
          break;
        }

        // === SPONSORSHIP CHECKOUT ===
        if (type === "sponsorship" && sponsorshipId && listingId && ownerId && level) {
          // P3b-6: plačilo mora ustrezati ceni nivoja. Cene niso izvožene kot
          // skupna konstanta (SPONSORSHIP_PRICES je lokal v owner/sponsorship
          // route) — zato preverjamo proti Sponsorship zapisu, ki je nastal ob
          // create s to ceno: sponsorship.amount (EUR) × 100 = centi.
          // Zapis ne obstaja ali premajhen znesek → ZAVRNJENO.
          const sponsorship = await db.sponsorship.findUnique({
            where: { id: sponsorshipId },
            select: { amount: true },
          });
          const expectedSponsorshipCents = sponsorship
            ? Math.round(sponsorship.amount * 100)
            : null;
          const paidSponsorshipCents = cs.amount_total ?? 0;
          if (
            expectedSponsorshipCents === null ||
            paidSponsorshipCents < expectedSponsorshipCents
          ) {
            console.error(
              `[stripe/webhook] sponsorship ${sponsorshipId} ZAVRNJEN: plačano ${paidSponsorshipCents} centov < pričakovano ${expectedSponsorshipCents} centov`
            );
            break;
          }

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
          // P3b-6: plačilo mora biti PRAVZAPOR plačano in v pričakovanem
          // znesku. PLAN_MONTHLY_PRICE je v EUR (149/499), cs.amount_total je
          // v CENTIH → pričakovano = cena × 100. Neznan plan → Infinity
          // (fail-closed). Neveljavno → NE aktiviraj (samo log + break).
          const expectedPlanCents =
            (PLAN_MONTHLY_PRICE[plan] ?? Number.POSITIVE_INFINITY) * 100;
          const paidPlanCents = cs.amount_total ?? 0;
          if (
            cs.payment_status !== "paid" ||
            paidPlanCents < expectedPlanCents
          ) {
            console.error(
              `[stripe/webhook] subscription ${plan} za owner ${ownerId} ZAVRNJENA: payment_status=${
                cs.payment_status ?? "neznan"
              }, amount_total=${paidPlanCents} centov (pričakovano ≥ ${expectedPlanCents})`
            );
            break;
          }

          // Pridobi subscription za renewal date
          let subscriptionEndsAt: Date | null = null;
          if (typeof cs.subscription === "string") {
            try {
              const sub = await stripe.subscriptions.retrieve(cs.subscription);
              // stripe v22: current_period_end je na SubscriptionItem (items.data[0]);
              // fallback cast za starej\u0161e API verzije, ki ga po\u0161iljajo neposredno na Subscription.
              const periodEnd =
                sub.items.data[0]?.current_period_end ??
                (sub as unknown as { current_period_end?: number })
                  .current_period_end;
              subscriptionEndsAt = periodEnd
                ? new Date(periodEnd * 1000)
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
        // stripe v22: current_period_end je na SubscriptionItem (items.data[0]);
        // fallback cast za starej\u0161e API verzije.
        const periodEnd =
          sub.items.data[0]?.current_period_end ??
          (sub as unknown as { current_period_end?: number }).current_period_end;
        const subEnd = periodEnd ? new Date(periodEnd * 1000) : null;

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
