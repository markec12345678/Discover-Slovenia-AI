import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAdmin } from "@/lib/auth-guards";
import { generateCompletion } from "@/lib/ai-client";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit-log";
import { rateLimit } from "@/lib/rate-limit";
import { escapeHtml } from "@/lib/security";

// POST /api/admin/approve/[id] — odobri vsebino in jo objavi
// Header: x-admin-password
// Query: type = "listing" (privzeto, backward kompat) | "product" | "experience"
// Body: { publishNow?: boolean } (default true — samo za listinge)
//
// Ko admin odobri lokal:
// 1. Status → approved → published
// 2. AI avtomatsko generira: SEO meta, ključne besede, AI oznake
//
// P4-2b: odobritev NE podeli več znaka "Preverjen partner" —
// verifikacija (verifiedByAdmin + partnerStatus=verified) je ločena
// eksplicitna admin odločitev: POST /api/admin/listings/[id]/verify.
//
// P3c-9: za izdelke/izkušnje (type=product|experience) velja enaka
// moderacijska zanka (pending → published), brez AI enrichmenta (samo lokalci).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Rate limit admin akcij (brute-force zaščita)
    const limited = rateLimit(request, { limit: 60, windowMs: 10 * 60_000, key: "admin-approve" });
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

    // 2. AI auto-enrichment (ne blokiraj odgovora)
    enrichListingInBackground(id, listing.name, listing.description, listing.category).catch(
      (e) => console.error("[approve] AI enrichment napaka:", e)
    );

    // 3. Audit log
    await logAudit({
      actorRole: "admin",
      action: newStatus === "published" ? AUDIT_ACTIONS.LISTING_APPROVED : AUDIT_ACTIONS.LISTING_PUBLISHED,
      resourceType: "listing",
      resourceId: id,
      resourceName: listing.name,
      metadata: { publishNow, partnerStatus: updated.partnerStatus },
    });

    // 3. Pošlji email lastniku (ne blokiraj)
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

// AI auto-enrichment — generira SEO meta, ključne besede, AI oznake
async function enrichListingInBackground(
  listingId: string,
  name: string,
  description: string,
  category: string
) {
  const prompt = `Si SEO asistent za slovensko turistično platformo. Za lokal "${name}" (kategorija: ${category}) generiraj:

VRNI SAMO JSON:
{
  "seoTitle": "naslov do 60 znakov za SEO",
  "seoDescription": "meta description do 155 znakov",
  "keywords": ["ključna1", "ključna2", "ključna3", "ključna4", "ključna5"],
  "aiTags": ["tag1", "tag2", "tag3"]
}

Opis lokalca: ${description}`;

  const result = await generateCompletion(
    [
      { role: "system", content: "Si SEO strokovnjak. Vedno odgovoriš z veljavnim JSON." },
      { role: "user", content: prompt },
    ],
    { temperature: 0.4, jsonMode: true }
  );

  if (!result?.content) return;

  const jsonMatch = result.content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return;

  const parsed = JSON.parse(jsonMatch[0]);

  // Shrani AI enrichment v specialties (kot AI tags + keywords)
  const existingSpecialties = await db.listing.findUnique({
    where: { id: listingId },
    select: { specialties: true },
  });

  const existing = existingSpecialties?.specialties
    ? (JSON.parse(existingSpecialties.specialties) as string[])
    : [];

  const aiTags = [...(parsed.aiTags || []), ...(parsed.keywords || [])];
  const merged = [...new Set([...existing, ...aiTags])].slice(0, 15);

  await db.listing.update({
    where: { id: listingId },
    data: {
      specialties: JSON.stringify(merged),
    },
  });

  console.log(`[approve] AI enrichment za ${name}: ${merged.length} tagov`);
}

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
      <p>AI ga lahko sedaj priporoča uporabnikom v itinererjih in iskanju.</p>
      <p>Vaš profil je bil avtomatsko optimiziran z AI (SEO oznake, ključne besede).</p>`
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
      <p>Uporabniki jo lahko sedaj najdejo v tržnici in AI priporočilih.</p>`
    ),
  });
}
