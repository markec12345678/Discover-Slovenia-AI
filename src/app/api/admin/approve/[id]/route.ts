import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAdmin } from "@/lib/auth-guards";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit-log";
import { rateLimit } from "@/lib/rate-limit";
import { escapeHtml } from "@/lib/security";
import { revalidateTag } from "next/cache";

// HARDENING S5: moderacija (approve/reject) takoj invalidira predpomnjene
// "marketplace" sklope (SEO strani) — prej se je sprememba prenesla šele po
// 1 h (revalidateTag nikoli klican). Fail-open: napaka invalidacije NE sme
// polomiti moderacijskega odgovora.
function invalidateMarketplaceCache(context: string) {
  try {
    // Next 16: drugi argument (profil) je obvezen — "max" pomeni
    // takojšnjo razveljavitev predpomnjenih vnosov tega taga.
    revalidateTag("marketplace", "max");
  } catch (error) {
    console.error(`[approve:${context}] revalidateTag napaka:`, error);
  }
}

// POST /api/admin/approve/[id] — odobri vsebino in jo objavi
// Header: x-admin-password
// Query: type = "listing" (privzeto, backward kompat) | "product" | "experience"
// Body: { publishNow?: boolean } (default true — samo za listinge)
//
// Ko admin odobri lokal:
// 1. Status → approved → published
//
// Issue #9 ZERO-AI: AI auto-enrichment (SEO oznake/ključne besede, ki so se
// tiho zapisale v Listing.specialties BREZ pregleda) je ODSTRANJEN —
// edini ne-pregledani AI→DB zapis (§16/§24). Specialitete sedaj zapiše
// IZKLJUČNO lastnik prek obrazca (human-in-the-loop).
//
// P4-2b: odobritev NE podeli več znaka "Preverjen partner" —
// verifikacija (verifiedByAdmin + partnerStatus=verified) je ločena
// eksplicitna admin odločitev: POST /api/admin/listings/[id]/verify.
//
// P3c-9: za izdelke/izkušnje (type=product|experience) velja enaka
// moderacijska zanka (pending → published).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Rate limit admin akcij (brute-force zaščita)
    const limited = rateLimit(request, { limit: 60, windowMs: 10 * 60_000, key: "admin-approve" });
    if (limited) return limited;

    if (!checkAdmin(request)) {
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
    const body = await request.json().catch(() => ({}));
    const publishNow = body.publishNow !== false; // default true

    // === P3c-9: IZDELKI TRŽNICE ===
    if (type === "product") {
      const product = await db.product.findUnique({ where: { id } });
      if (!product) {
        return NextResponse.json({ error: "Izdelek ni najden" }, { status: 404 });
      }
      if (product.status !== "pending") {
        return NextResponse.json(
          {
            error: `Izdelek ima status "${product.status}", ne more biti odobren`,
          },
          { status: 400 }
        );
      }

      const updated = await db.product.update({
        where: { id },
        // submittedAt ostaja (kdaj je bil oddan v pregled)
        data: { status: "published" },
      });

      // HARDENING S5: takojšnja osvežitev SEO predpomnilnika
      invalidateMarketplaceCache("product");

    // Audit log
      await logAudit({
        actorRole: "admin",
        action: AUDIT_ACTIONS.PRODUCT_APPROVED,
        resourceType: "product",
        resourceId: id,
        resourceName: product.name,
        metadata: { type },
      });

      // Email lastniku (ne blokiraj odgovora)
      if (product.ownerId) {
        const owner = await db.owner.findUnique({
          where: { id: product.ownerId },
          select: { email: true, name: true },
        });
        if (owner) {
          sendMarketplaceApprovalEmail(
            owner.email,
            owner.name,
            product.name,
            "izdelek"
          ).catch(() => {});
        }
      }

      console.log(`[admin/approve] izdelek ${product.name} → published`);

      return NextResponse.json({
        success: true,
        product: updated,
        message: "Izdelek odobren in objavljen",
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
            error: `Izkušnja ima status "${experience.status}", ne more biti odobrena`,
          },
          { status: 400 }
        );
      }

      const updated = await db.experience.update({
        where: { id },
        // submittedAt ostaja (kdaj je bila oddana v pregled)
        data: { status: "published" },
      });

      // HARDENING S5: takojšnja osvežitev SEO predpomnilnika
      invalidateMarketplaceCache("experience");

      // Audit log
      await logAudit({
        actorRole: "admin",
        action: AUDIT_ACTIONS.EXPERIENCE_APPROVED,
        resourceType: "experience",
        resourceId: id,
        resourceName: experience.name,
        metadata: { type },
      });

      // Email lastniku (ne blokiraj odgovora)
      if (experience.ownerId) {
        const owner = await db.owner.findUnique({
          where: { id: experience.ownerId },
          select: { email: true, name: true },
        });
        if (owner) {
          sendMarketplaceApprovalEmail(
            owner.email,
            owner.name,
            experience.name,
            "izkušnja"
          ).catch(() => {});
        }
      }

      console.log(`[admin/approve] izkušnja ${experience.name} → published`);

      return NextResponse.json({
        success: true,
        experience: updated,
        message: "Izkušnja odobrena in objavljena",
      });
    }

    // === LOKALI (privzeto — nespremenjena obstoječa logika) ===
    const listing = await db.listing.findUnique({ where: { id } });
    if (!listing) {
      return NextResponse.json({ error: "Lokal ni najden" }, { status: 404 });
    }

    if (listing.status !== "pending" && listing.status !== "approved") {
      return NextResponse.json(
        { error: `Lokal ima status "${listing.status}", ne more biti odobren` },
        { status: 400 }
      );
    }

    // 1. Posodobi status
    // P4-2b: odobritev NE podeli več znaka "Preverjen partner"
    // (verifiedByAdmin/partnerStatus) — to je ločena, eksplicitna admin
    // odločitev prek POST /api/admin/listings/[id]/verify.
    const newStatus = publishNow ? "published" : "approved";
    const updated = await db.listing.update({
      where: { id },
      data: {
        status: newStatus,
        approvedAt: new Date(),
        approvedBy: "admin",
        partnerSince: listing.partnerSince || new Date(),
      },
    });

    // 2. HARDENING S5: takojšnja osvežitev SEO predpomnilnika
    invalidateMarketplaceCache("listing");

    // 3. Audit log
    await logAudit({
      actorRole: "admin",
      action: newStatus === "published" ? AUDIT_ACTIONS.LISTING_APPROVED : AUDIT_ACTIONS.LISTING_PUBLISHED,
      resourceType: "listing",
      resourceId: id,
      resourceName: listing.name,
      metadata: { publishNow, partnerStatus: updated.partnerStatus },
    });

    // 4. Pošlji email lastniku (ne blokiraj)
    if (listing.ownerId) {
      const owner = await db.owner.findUnique({
        where: { id: listing.ownerId },
        select: { email: true, name: true },
      });
      if (owner) {
        sendApprovalEmail(owner.email, owner.name, listing.name).catch(() => {});
      }
    }

    console.log(`[admin/approve] ${listing.name} → ${newStatus}`);

    return NextResponse.json({
      success: true,
      listing: updated,
      message: publishNow
        ? "Lokal odobren in objavljen"
        : "Lokal odobren (čaka objavo)",
    });
  } catch (error) {
    console.error("[admin/approve] napaka:", error);
    return NextResponse.json({ error: "Napaka pri odobritvi" }, { status: 500 });
  }
}

// Issue #9 ZERO-AI: enrichListingInBackground (AI SEO oznake/ključne besede,
// zapisane v Listing.specialties BREZ pregleda) je POPOLNOMA ODSTRANJEN —
// glej opombo v glavi rute.

// Email obvestilo o odobritvi
async function sendApprovalEmail(email: string, name: string, listingName: string) {
  const { sendEmail, emailTemplate } = await import("@/lib/email");

  await sendEmail({
    to: email,
    subject: `✅ Vaš lokal "${listingName}" je odobren!`,
    html: emailTemplate(
      "Lokal odobren in objavljen",
      `<p>Pozdravljeni <strong>${escapeHtml(name)}</strong>,</p>
      <p>Vaš lokal <strong>${escapeHtml(listingName)}</strong> je bil odobren in je sedaj objavljen na platformi Discover Slovenia AI.</p>
      <p>Sedaj ga lahko platforma priporoča uporabnikom v itinererjih in iskanju.</p>
      <p>Za večjo vidljivost dopolnite opis, slike in specialitete v vašem ponudniškem panelu.</p>`
    ),
  });
}

// P3c-9: email obvestilo o odobritvi izdelka/izkušnje tržnice
async function sendMarketplaceApprovalEmail(
  email: string,
  name: string,
  itemName: string,
  kind: "izdelek" | "izkušnja"
) {
  const { sendEmail, emailTemplate } = await import("@/lib/email");

  const isExperience = kind === "izkušnja";
  const subject = isExperience
    ? `✅ Vaša izkušnja "${itemName}" je odobrena!`
    : `✅ Vaš izdelek "${itemName}" je odobren!`;

  await sendEmail({
    to: email,
    subject,
    html: emailTemplate(
      isExperience ? "Izkušnja odobrena in objavljena" : "Izdelek odobren in objavljen",
      `<p>Pozdravljeni <strong>${escapeHtml(name)}</strong>,</p>
      <p>${
        isExperience
          ? `Vaša izkušnja <strong>${escapeHtml(itemName)}</strong> je bila odobrena`
          : `Vaš izdelek <strong>${escapeHtml(itemName)}</strong> je bil odobren`
      } in je sedaj objavljen${
        isExperience ? "a" : ""
      } na platformi Discover Slovenia AI.</p>
      <p>Uporabniki jo lahko sedaj najdejo v tržnici in priporočilih platforme.</p>`
    ),
  });
}
