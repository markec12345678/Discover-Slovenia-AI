import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guards";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit-log";

// GET /api/admin/sponsorships — seznam vseh sponzorstev (admin)
// Header: x-admin-password
export async function GET(request: Request) {
  try {
    const unauthorized = requireAdmin(request);
    if (unauthorized) return unauthorized;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status"); // active | expired | all

    const where: Record<string, unknown> = {};
    if (status && status !== "all") {
      where.status = status;
    }

    const sponsorships = await db.sponsorship.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        listing: {
          select: {
            id: true,
            name: true,
            slug: true,
            category: true,
            destinationName: true,
            partnerStatus: true,
            sponsored: true,
            sponsoredUntil: true,
          },
        },
        owner: {
          select: { id: true, email: true, name: true, businessName: true },
        },
      },
    });

    // Obogateni podatki
    const enriched = sponsorships.map((s) => ({
      ...s,
      daysUntilExpiry: s.endsAt
        ? Math.ceil((s.endsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null,
      isExpired: s.endsAt ? s.endsAt < new Date() : false,
    }));

    // Povzetek
    const summary = {
      total: enriched.length,
      active: enriched.filter((s) => s.status === "active" && !s.isExpired).length,
      expired: enriched.filter((s) => s.isExpired || s.status === "expired").length,
      totalRevenue: enriched
        .filter((s) => s.status === "active")
        .reduce((sum, s) => sum + s.amount, 0),
    };

    return NextResponse.json({
      sponsorships: enriched,
      summary,
    });
  } catch (error) {
    console.error("[admin/sponsorships] napaka:", error);
    return NextResponse.json({ error: "Napaka" }, { status: 500 });
  }
}

// ============================================================================
// POST /api/admin/sponsorships — admin ročno ustvari/razširi sponzorstvo
// ============================================================================

export async function POST(request: Request) {
  try {
    const unauthorized = requireAdmin(request);
    if (unauthorized) return unauthorized;

    const body = await request.json();
    const { listingId, ownerId, level, durationDays = 30 } = body;

    if (!listingId || !ownerId || !level) {
      return NextResponse.json(
        { error: "Manjkajo listingId, ownerId, level" },
        { status: 400 }
      );
    }

    // 19-f-5 (revizija 1.36.0, P2): validacija — prej je bil level prost
    // niz (owner ruta whitelistira!), durationDays neomejen (negativen →
    // aktivno sponzorstvo s pretečenim endsAt — nemogoče stanje), ownerId
    // pa brez obstoj/konsistency checka (P2003 → 500, ali finančni zapis
    // na NAPAČNEM ownerju).
    const VALID_LEVELS = ["basic", "premium", "featured"] as const;
    if (typeof level !== "string" || !VALID_LEVELS.includes(level as (typeof VALID_LEVELS)[number])) {
      return NextResponse.json(
        { error: `Neveljaven level sponzorstva (dovoljeno: ${VALID_LEVELS.join(" | ")})` },
        { status: 400 }
      );
    }
    if (
      typeof durationDays !== "number" ||
      !Number.isInteger(durationDays) ||
      durationDays < 1 ||
      durationDays > 365
    ) {
      return NextResponse.json(
        { error: "Trajanje mora biti celo število dni med 1 in 365" },
        { status: 400 }
      );
    }
    const listing = await db.listing.findUnique({
      where: { id: listingId },
      select: { id: true, name: true, ownerId: true },
    });

    if (!listing) {
      return NextResponse.json({ error: "Lokal ni najden" }, { status: 404 });
    }

    // Sponzorstvo pripada lastniku LOKALA — ownerId iz zahteve se mora
    // ujemati (prej bi admin pripisal zapis poljubnemu ownerju).
    const ownerRecord = await db.owner.findUnique({
      where: { id: ownerId },
      select: { id: true },
    });
    if (!ownerRecord) {
      return NextResponse.json({ error: "Owner ni najden" }, { status: 404 });
    }
    if (listing.ownerId !== ownerId) {
      return NextResponse.json(
        { error: "Owner se ne ujema z lastnikom lokala" },
        { status: 400 }
      );
    }

    const startsAt = new Date();
    const endsAt = new Date();
    endsAt.setDate(endsAt.getDate() + durationDays);

    const amount = level === "featured" ? 299 : 149;

    const sponsorship = await db.sponsorship.create({
      data: {
        listingId,
        ownerId,
        level,
        amount,
        status: "active",
        startsAt,
        endsAt,
      },
    });

    // Posodobi listing
    await db.listing.update({
      where: { id: listingId },
      data: {
        sponsored: true,
        sponsoredUntil: endsAt,
        plan: level === "featured" ? "enterprise" : "premium",
      },
    });

    await logAudit({
      actorRole: "admin",
      action: AUDIT_ACTIONS.SPONSORSHIP_ACTIVATED,
      resourceType: "sponsorship",
      resourceId: sponsorship.id,
      resourceName: listing.name,
      metadata: { level, durationDays, manual: true },
    });

    return NextResponse.json({
      success: true,
      sponsorship,
      message: `Sponzorstvo aktivirano za ${durationDays} dni`,
    });
  } catch (error) {
    console.error("[admin/sponsorships POST] napaka:", error);
    return NextResponse.json({ error: "Napaka" }, { status: 500 });
  }
}
