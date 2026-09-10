import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAdmin } from "@/lib/auth-guards";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit-log";
import { rateLimit } from "@/lib/rate-limit";
import { escapeHtml } from "@/lib/security";

// Validni razlogi za zavrnitev
const REJECTION_REASONS = [
  "Manjkajo fotografije",
  "Nepopoln opis",
  "Napačna kategorija",
  "Podvojeni vnos",
  "Ni povezano s turizmom",
  "Napačni kontakt podatki",
  "Neprimerna vsebina",
  "Drugo",
];

// POST /api/admin/reject/[id] — zavrne vsebino z razlogom
// Header: x-admin-password
// Query: type = "listing" (privzeto, backward kompat) | "product" | "experience"
// Body: { reason: string, customReason?: string }
//
// Status → rejected (lastnik lahko uredi in ponovno odda)
// P3c-9: za izdelke/izkušnje (type=product|experience) velja enaka
// moderacijska zanka (pending → rejected + rejectionReason).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Rate limit (brute-force zaščita)
    const limited = rateLimit(request, { limit: 60, windowMs: 10 * 60_000, key: "admin-reject" });
    if (limited) return limited;

    if (!checkAdmin(request.headers.get("x-admin-password"))) {
      return NextResponse.json({ error: "Neavtorizirano" }, { status: 401 });
    }

    const { id } = await params;
    const type = new URL(request.url).searchParams.get("type") ?? "listing";
    if (type !== "listing" && type !== "product" && type !== "experience") {
      return NextResponse.json(
        { error: `Neveljaven type "${type}"` },
        { status: 400 }
      );
    }
    const body = await request.json();
    const { reason, customReason } = body;

    if (!reason) {
      return NextResponse.json(
        { error: "Manjka razlog za zavrnitev" },
        { status: 400 }
      );
    }

    if (!REJECTION_REASONS.includes(reason) && reason !== "Drugo") {
      return NextResponse.json(
        { error: "Neveljaven razlog" },
        { status: 400 }
      );
    }

    // Sestavi polni razlog
    const fullReason = reason === "Drugo" && customReason
      ? `Drugo: ${customReason}`
      : reason;

    // === P3c-9: IZDELKI TRŽNICE ===
    if (type === "product") {
      const product = await db.product.findUnique({ where: { id } });
      if (!product) {
        return NextResponse.json({ error: "Izdelek ni najden" }, { status: 404 });
      }
      if (product.status !== "pending") {
        return NextResponse.json(
          {
            error: `Izdelek ima status "${product.status}", ne more biti zavrnjen`,
          },
          { status: 400 }
        );
      }

      await db.product.update({
        where: { id },
        data: {
          status: "rejected",
          rejectionReason: fullReason,
        },
      });

      // Audit log
      await logAudit({
        actorRole: "admin",
        action: AUDIT_ACTIONS.PRODUCT_REJECTED,
        resourceType: "product",
        resourceId: id,
        resourceName: product.name,
        metadata: { reason: fullReason, type },
      });

      // Pošlji email lastniku (ne blokiraj)
      if (product.ownerId) {
        const owner = await db.owner.findUnique({
          where: { id: product.ownerId },
          select: { email: true, name: true },
        });
        if (owner) {
          sendMarketplaceRejectionEmail(
            owner.email,
            owner.name,
            product.name,
            fullReason,
            "izdelek"
          ).catch(() => {});
        }
      }

      console.log(`[admin/reject] izdelek ${product.name} → rejected (${fullReason})`);

      return NextResponse.json({
        success: true,
        message: "Izdelek zavrnjen",
        reason: fullReason,
      });
    }

    // === P3c-9: IZKUŠNJE TRŽNICE ===
    if (type === "experience") {
      const experience = await db.experience.findUnique({ where: { id } });
      if (!experience) {
        return NextResponse.json({ error: "Izkušnja ni najdena" }, { status: 404 });
      }
      if (experience.status !== "pending") {
        return NextResponse.json(
          {
            error: `Izkušnja ima status "${experience.status}", ne more biti zavrnjena`,
          },
          { status: 400 }
        );
      }

      await db.experience.update({
        where: { id },
        data: {
          status: "rejected",
          rejectionReason: fullReason,
        },
      });

      // Audit log
      await logAudit({
        actorRole: "admin",
        action: AUDIT_ACTIONS.EXPERIENCE_REJECTED,
        resourceType: "experience",
        resourceId: id,
        resourceName: experience.name,
        metadata: { reason: fullReason, type },
      });

      // Pošlji email lastniku (ne blokiraj)
      if (experience.ownerId) {
        const owner = await db.owner.findUnique({
          where: { id: experience.ownerId },
          select: { email: true, name: true },
        });
        if (owner) {
          sendMarketplaceRejectionEmail(
            owner.email,
            owner.name,
            experience.name,
            fullReason,
            "izkušnja"
          ).catch(() => {});
        }
      }

      console.log(`[admin/reject] izkušnja ${experience.name} → rejected (${fullReason})`);

      return NextResponse.json({
        success: true,
        message: "Izkušnja zavrnjena",
        reason: fullReason,
      });
    }

    // === LOKALI (privzeto — nespremenjena obstoječa logika) ===
    const listing = await db.listing.findUnique({ where: { id } });
    if (!listing) {
      return NextResponse.json({ error: "Lokal ni najden" }, { status: 404 });
    }

    if (listing.status !== "pending") {
      return NextResponse.json(
        { error: `Lokal ima status "${listing.status}", ne more biti zavrnjen` },
        { status: 400 }
      );
    }

    // Zavrnitev → status nazaj na draft (lastnik lahko popravi in ponovno odda)
    await db.listing.update({
      where: { id },
      data: {
        status: "rejected",
        rejectionReason: fullReason,
        approvedBy: null,
        approvedAt: null,
      },
    });

    // Audit log
    await logAudit({
      actorRole: "admin",
      action: AUDIT_ACTIONS.LISTING_REJECTED,
      resourceType: "listing",
      resourceId: id,
      resourceName: listing.name,
      metadata: { reason: fullReason },
    });

    // Pošlji email lastniku
    if (listing.ownerId) {
      const owner = await db.owner.findUnique({
        where: { id: listing.ownerId },
        select: { email: true, name: true },
      });
      if (owner) {
        sendRejectionEmail(
          owner.email,
          owner.name,
          listing.name,
          fullReason
        ).catch(() => {});
      }
    }

    console.log(`[admin/reject] ${listing.name} → rejected (${fullReason})`);

    return NextResponse.json({
      success: true,
      message: "Lokal zavrnjen",
      reason: fullReason,
    });
  } catch (error) {
    console.error("[admin/reject] napaka:", error);
    return NextResponse.json({ error: "Napaka pri zavrnitvi" }, { status: 500 });
  }
}

// GET — vrne seznam validnih razlogov
export async function GET(request: Request) {
  if (!checkAdmin(request.headers.get("x-admin-password"))) {
    return NextResponse.json({ error: "Neavtorizirano" }, { status: 401 });
  }
  return NextResponse.json({ reasons: REJECTION_REASONS });
}

async function sendRejectionEmail(
  email: string,
  name: string,
  listingName: string,
  reason: string
) {
  const { sendEmail, emailTemplate } = await import("@/lib/email");

  await sendEmail({
    to: email,
    subject: `Vaš lokal "${listingName}" potrebuje popravke`,
    html: emailTemplate(
      "Lokal potrebuje popravke",
      `<p>Pozdravljeni <strong>${escapeHtml(name)}</strong>,</p>
      <p>Vaš lokal <strong>${escapeHtml(listingName)}</strong> je bil pregledan in potrebuje naslednje popravke:</p>
      <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 16px 0; border-radius: 4px;">
        <strong>Razlog:</strong> ${escapeHtml(reason)}
      </div>
      <p>Prosimo, da uredite lokal in ga ponovno oddate v pregled. V dashboardu kliknite "Uredi" in nato "Oddaj v pregled".</p>
      <p>Če imate vprašanja, pišite na <a href="mailto:support@discoverslovenia.ai">support@discoverslovenia.ai</a>.</p>`
    ),
  });
}

// P3c-9: email obvestilo o zavrnitvi izdelka/izkušnje tržnice
async function sendMarketplaceRejectionEmail(
  email: string,
  name: string,
  itemName: string,
  reason: string,
  kind: "izdelek" | "izkušnja"
) {
  const { sendEmail, emailTemplate } = await import("@/lib/email");

  const isExperience = kind === "izkušnja";

  await sendEmail({
    to: email,
    subject: isExperience
      ? `Vaša izkušnja "${itemName}" potrebuje popravke`
      : `Vaš izdelek "${itemName}" potrebuje popravke`,
    html: emailTemplate(
      isExperience ? "Izkušnja potrebuje popravke" : "Izdelek potrebuje popravke",
      `<p>Pozdravljeni <strong>${escapeHtml(name)}</strong>,</p>
      <p>${
        isExperience
          ? `Vaša izkušnja <strong>${escapeHtml(itemName)}</strong> je bila pregledana`
          : `Vaš izdelek <strong>${escapeHtml(itemName)}</strong> je bil pregledan`
      } in potrebuje naslednje popravke:</p>
      <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 16px 0; border-radius: 4px;">
        <strong>Razlog:</strong> ${escapeHtml(reason)}
      </div>
      <p>Prosimo, da vsebino uredite in shranite — s popravljenimi podatki bo znova poslana v pregled.</p>
      <p>Če imate vprašanja, pišite na <a href="mailto:support@discoverslovenia.ai">support@discoverslovenia.ai</a>.</p>`
    ),
  });
}
