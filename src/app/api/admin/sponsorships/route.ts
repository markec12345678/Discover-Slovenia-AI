import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAdmin } from "@/lib/auth-guards";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit-log";

// GET /api/admin/sponsorships — seznam vseh sponzorstev (admin)
// Header: x-admin-password
export async function GET(request: Request) {
  try {
    if (!checkAdmin(request.headers.get("x-admin-password"))) {
      return NextResponse.json({ error: "Neavtorizirano" }, { status: 401 });
    }

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
    if (!checkAdmin(request.headers.get("x-admin-password"))) {
      return NextResponse.json({ error: "Neavtorizirano" }, { status: 401 });
    }

    const body = await request.json();
    const { listingId, ownerId, level, durationDays = 30 } = body;

    if (!listingId || !ownerId || !level) {
      return NextResponse.json(
        { error: "Manjkajo listingId, ownerId, level" },
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
