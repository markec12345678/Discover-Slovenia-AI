import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAdmin } from "@/lib/auth-guards";
import { generateCompletion } from "@/lib/ai-client";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit-log";

// POST /api/admin/approve/[id] — odobri lokal in ga objavi
// Header: x-admin-password
// Body: { publishNow?: boolean } (default true)
//
// Ko admin odobri lokal:
// 1. Status → approved → published
// 2. partnerStatus → verified (če še ni)
// 3. verifiedByAdmin → true
// 4. AI avtomatsko generira: SEO meta, ključne besede, AI oznake
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!checkAdmin(request.headers.get("x-admin-password"))) {
      return NextResponse.json({ error: "Neavtorizirano" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const publishNow = body.publishNow !== false; // default true

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
    const newStatus = publishNow ? "published" : "approved";
    const updated = await db.listing.update({
      where: { id },
      data: {
        status: newStatus,
        approvedAt: new Date(),
        approvedBy: "admin",
        verifiedByAdmin: true,
        partnerStatus: listing.partnerStatus === "standard" ? "verified" : listing.partnerStatus,
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
    { temperature: 0.4, jsonMode: true, feature: "tag" }
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
  // Uporabi obstoječi email sistem
  const { sendEmail } = await import("@/lib/email");
  const { emailTemplate } = await import("@/lib/email");

  await sendEmail(
    email,
    `✅ Vaš lokal "${listingName}" je odobren!`,
    emailTemplate(
      "Lokal odobren in objavljen",
      `<p>Pozdravljeni <strong>${name}</strong>,</p>
      <p>Vaš lokal <strong>${listingName}</strong> je bil odobren in je sedaj objavljen na platformi Discover Slovenia AI.</p>
      <p>AI ga lahko sedaj priporoča uporabnikom v itinererjih in iskanju.</p>
      <p>Vaš profil je bil avtomatsko optimiziran z AI (SEO oznake, ključne besede).</p>`
    )
  );
}
