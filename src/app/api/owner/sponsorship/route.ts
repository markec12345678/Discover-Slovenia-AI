import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import Stripe from "stripe";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isStripeDemo } from "@/lib/stripe-server";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit-log";

// ============================================================================
// POST /api/owner/sponsorship — ustvari sponsorship checkout (demo ali Stripe)
// ============================================================================
//
// Tok:
// Provider → "Promoviraj svoj lokal" → Izbere paket → Checkout →
// Plačilo uspešno → Webhook → Sponsorship = ACTIVE → AI dobi 5% boost + ⭐ badge
//
// Demo mode: direktno aktivira (brez Stripe)
// Production mode: vrne Stripe checkout URL

const SPONSORSHIP_PRICES: Record<string, number> = {
  premium: 149,    // €149/mesec — 5% AI boost + Premium badge
  featured: 299,   // €299/mesec — 5% AI boost + Featured badge (zahteva Q>90)
};

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Niste prijavljeni" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { listingId, level } = body as { listingId?: string; level?: string };

    if (!listingId || !level) {
      return NextResponse.json(
        { error: "Manjkata listingId in level" },
        { status: 400 }
      );
    }

    if (!SPONSORSHIP_PRICES[level]) {
      return NextResponse.json(
        { error: "Neveljaven level. Dovoljeno: premium | featured" },
        { status: 400 }
      );
    }

    const owner = await db.owner.findUnique({
      where: { email: session.user.email },
      select: { id: true, email: true, name: true },
    });

    if (!owner) {
      return NextResponse.json({ error: "Lastnik ni najden" }, { status: 404 });
    }

    // Preveri lastništvo
    const listing = await db.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        name: true,
        ownerId: true,
        status: true,
        partnerStatus: true,
        rating: true,
        verifiedByAdmin: true,
        sponsored: true,
        sponsoredUntil: true,
      },
    });

    if (!listing || listing.ownerId !== owner.id) {
      return NextResponse.json(
        { error: "Lokal ni najden ali nimate dovoljenja" },
        { status: 403 }
      );
    }

    if (listing.status !== "published") {
      return NextResponse.json(
        { error: "Lokal mora biti objavljen preden lahko aktivirate sponzorstvo" },
        { status: 400 }
      );
    }

    // Featured zahteva Q>90 + verified
    if (level === "featured") {
      const { calculateQualityScore, qualifiesForFeatured } = await import("@/lib/quality-score");
      const qs = calculateQualityScore(listing);
      if (!qualifiesForFeatured(listing, qs.total)) {
        return NextResponse.json(
          {
            error: "Featured zahteva Quality Score > 90 in admin verifikacijo",
            qualityScore: qs.total,
            minRequired: 90,
          },
          { status: 400 }
        );
      }
    }

    // Preveri ali že ima aktivno sponzorstvo
    const existing = await db.sponsorship.findFirst({
      where: {
        listingId,
        status: { in: ["active", "paid"] },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Lokal že ima aktivno sponzorstvo", existingId: existing.id },
        { status: 400 }
      );
    }

    const amount = SPONSORSHIP_PRICES[level];
    const startsAt = new Date();
    const endsAt = new Date();
    endsAt.setMonth(endsAt.getMonth() + 1); // 1 mesec

    // Ustvari sponsorship zapis (status: created)
    const sponsorship = await db.sponsorship.create({
      data: {
        listingId,
        ownerId: owner.id,
        level,
        amount,
        status: "created",
        startsAt,
        endsAt,
      },
    });

    await logAudit({
      actorId: owner.id,
      actorEmail: owner.email,
      actorRole: "owner",
      action: AUDIT_ACTIONS.SPONSORSHIP_CREATED,
      resourceType: "sponsorship",
      resourceId: sponsorship.id,
      resourceName: listing.name,
      metadata: { level, amount, listingId },
    });

    // === DEMO MODE — direktno aktiviraj ===
    if (isStripeDemo()) {
      await activateSponsorship(sponsorship.id, listingId, owner.id, level, endsAt, listing.name);

      return NextResponse.json({
        success: true,
        demo: true,
        message: `Sponzorstvo aktivirano (demo mode) — ${level} €${amount}/mesec`,
        sponsorshipId: sponsorship.id,
        redirectUrl: null,
      });
    }

    // === PRODUCTION MODE — Stripe Checkout ===
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

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: owner.email,
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: `Sponzorstvo — ${level === "featured" ? "Featured" : "Premium"} Partner`,
              description: `${listing.name} — ${level === "featured" ? "Featured" : "Premium"} boost za 1 mesec`,
            },
            unit_amount: amount * 100, // cents
          },
          quantity: 1,
        },
      ],
      metadata: {
        sponsorshipId: sponsorship.id,
        ownerId: owner.id,
        listingId,
        level,
        type: "sponsorship",
      },
      success_url: `${baseUrl}/owner/dashboard?sponsorship=success&id=${sponsorship.id}`,
      cancel_url: `${baseUrl}/owner/dashboard?sponsorship=cancelled`,
    });

    // Posodobi sponsorship z Stripe session ID
    await db.sponsorship.update({
      where: { id: sponsorship.id },
      data: { stripePaymentId: checkoutSession.id },
    });

    return NextResponse.json({
      success: true,
      redirectUrl: checkoutSession.url,
      sponsorshipId: sponsorship.id,
    });
  } catch (error) {
    console.error("[owner/sponsorship] napaka:", error);
    return NextResponse.json({ error: "Napaka pri ustvarjanju sponzorstva" }, { status: 500 });
  }
}

// ============================================================================
// GET /api/owner/sponsorship — pridobi aktivna sponzorstva lastnika
// ============================================================================

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Niste prijavljeni" }, { status: 401 });
    }

    const owner = await db.owner.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });

    if (!owner) {
      return NextResponse.json({ error: "Lastnik ni najden" }, { status: 404 });
    }

    const sponsorships = await db.sponsorship.findMany({
      where: { ownerId: owner.id },
      orderBy: { createdAt: "desc" },
      include: {
        listing: {
          select: { name: true, slug: true, partnerStatus: true },
        },
      },
    });

    return NextResponse.json({ sponsorships });
  } catch (error) {
    console.error("[owner/sponsorship GET] napaka:", error);
    return NextResponse.json({ error: "Napaka" }, { status: 500 });
  }
}

// ============================================================================
// HELPER — aktiviraj sponzorstvo
// ============================================================================

export async function activateSponsorship(
  sponsorshipId: string,
  listingId: string,
  ownerId: string,
  level: string,
  endsAt: Date,
  listingName: string
): Promise<void> {
  // 1. Posodobi sponsorship status
  await db.sponsorship.update({
    where: { id: sponsorshipId },
    data: {
      status: "active",
      startsAt: new Date(),
      endsAt,
    },
  });

  // 2. Posodobi listing — sponsored = true + sponsoredUntil
  await db.listing.update({
    where: { id: listingId },
    data: {
      sponsored: true,
      sponsoredUntil: endsAt,
      plan: level === "featured" ? "enterprise" : "premium",
    },
  });

  // 3. Posodobi owner plan
  await db.owner.update({
    where: { id: ownerId },
    data: {
      plan: level === "featured" ? "enterprise" : "premium",
      subscriptionStatus: "active",
      subscriptionEndsAt: endsAt,
    },
  });

  // 4. Audit log
  await logAudit({
    actorId: ownerId,
    actorRole: "system",
    action: AUDIT_ACTIONS.SPONSORSHIP_ACTIVATED,
    resourceType: "sponsorship",
    resourceId: sponsorshipId,
    resourceName: listingName,
    metadata: { level, endsAt: endsAt.toISOString() },
  });

  console.log(`[sponsorship] Aktivirana: ${listingName} (${level}) do ${endsAt.toISOString()}`);
}
