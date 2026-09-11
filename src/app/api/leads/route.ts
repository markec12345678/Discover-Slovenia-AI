import { NextResponse } from "next/server";
import { sendEmail, getAdminEmail } from "@/lib/email";
import { leadNotificationEmail } from "@/lib/email-templates";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

// POST /api/leads — B2B prijava lokala prek obrazca "Pridruži se" (homepage)
//
// P4-2a: prej append-only data/leads.json (fs write) — na Vercelu je FS
// read-only → 500. Zdaj shranjevanje v PostgreSQL (model Lead).

// Validacija
function validateLead(data: unknown): string | null {
  if (typeof data !== "object" || data === null) {
    return "Manjkajoči podatki.";
  }
  const d = data as Record<string, unknown>;

  if (typeof d.name !== "string" || !d.name.trim()) {
    return "Ime je obvezno";
  }
  if (
    typeof d.email !== "string" ||
    !d.email.trim() ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)
  ) {
    return "Veljaven email je obvezen";
  }
  if (typeof d.businessName !== "string" || !d.businessName.trim()) {
    return "Ime lokala je obvezno";
  }
  if (typeof d.businessType !== "string" || !d.businessType.trim()) {
    return "Tip lokala je obvezen";
  }
  if (typeof d.location !== "string" || !d.location.trim()) {
    return "Kraj je obvezen";
  }
  if (typeof d.plan !== "string" || !d.plan.trim()) {
    return "Paket je obvezen";
  }
  if (d.gdprConsent !== true) {
    return "GDPR privolitev je obvezna";
  }
  return null;
}

export async function POST(request: Request) {
    // Rate limit lead form
    const limited = rateLimit(request, { limit: 10, windowMs: 3600000, key: "leads" });
    if (limited) return limited;

  try {
    const body: unknown = await request.json();

    // Validacija
    const error = validateLead(body);
    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    const data = body as Record<string, unknown>;

    // Shrani v DB (model Lead — P4-2a)
    const lead = await db.lead.create({
      data: {
        name: String(data.name).trim(),
        email: String(data.email).trim().toLowerCase(),
        phone:
          typeof data.phone === "string" && data.phone.trim()
            ? data.phone.trim()
            : null,
        businessName: String(data.businessName).trim(),
        businessType: String(data.businessType),
        location: String(data.location).trim(),
        plan: String(data.plan),
        message:
          typeof data.message === "string" && data.message.trim()
            ? data.message.trim()
            : null,
        gdprConsent: true,
      },
    });

    // === EMAIL OBVEŠČANJE ===
    // 1) Pošlji leadNotificationEmail na admin email (ADMIN_EMAIL)
    try {
      const { subject, html, text } = leadNotificationEmail(
        "Admin", // ownerName (admin vloga)
        lead.businessName,
        lead.name,
        lead.email,
        lead.phone ?? undefined,
        lead.plan,
        lead.message ?? undefined
      );
      await sendEmail({
        to: getAdminEmail(),
        subject,
        html,
        text,
      });
    } catch (emailErr) {
      console.error("[leads] admin email napaka:", emailErr);
    }

    // 2) FW1 (audit R2 🟠 #8 — lead PII k napačnemu prejemniku): email
    //    lastniku pošljemo SAMO ob NEDVOUMNEM ujemanju imena lokala —
    //    normaliziran (trim/lowercase) businessName mora biti ENAK imenu
    //    natančno ENEGA ownerja. Prej je veljal `contains`, ki je za
    //    "Gostilna Pri Ani" zadeli tako "Pri Ani Ljubljana" kot
    //    "Pri Ani Maribor" → zasebni podatki leada (ime, email, telefon,
    //    sporočilo) so lahko odšli napačnemu ponudniku. Fail-closed:
    //    0 ali 2+ zadetkov → BREZ samodejnega emaila (lead ostane
    //    zabeležen v admin/leads dashboardu za ročno obdelavo).
    try {
      const leadBiz = lead.businessName.trim().toLowerCase();
      const candidates = await db.owner.findMany({
        select: { id: true, name: true, email: true, businessName: true, plan: true },
      });
      const matches = candidates.filter(
        (o) =>
          o.businessName &&
          o.businessName.trim().toLowerCase() === leadBiz
      );
      if (matches.length === 1) {
        const matchingOwner = matches[0];
        const { subject, html, text } = leadNotificationEmail(
          matchingOwner.name,
          matchingOwner.businessName,
          lead.name,
          lead.email,
          lead.phone ?? undefined,
          matchingOwner.plan,
          lead.message ?? undefined
        );
        await sendEmail({
          to: matchingOwner.email,
          subject,
          html,
          text,
        });
      } else if (matches.length > 1) {
        console.log(
          `[leads] fail-closed: businessName "${lead.businessName}" se ujema z ${matches.length} ownerji — email NI poslan (ročna obdelava)`
        );
      }
    } catch (ownerErr) {
      console.error("[leads] owner email napaka:", ownerErr);
    }

    return NextResponse.json({
      success: true,
      id: lead.id,
      message: "Prijava uspešno prejeta",
    });
  } catch (error) {
    console.error("[leads] napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri shranjevanju prijave. Poskusite kasneje." },
      { status: 500 }
    );
  }
}

// GET — za preverjanje števila leadov (admin, brez občutljivih podatkov)
export async function GET() {
  try {
    const count = await db.lead.count();
    const latest = await db.lead.findFirst({
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    return NextResponse.json({
      count,
      latest: latest?.createdAt?.toISOString() ?? null,
    });
  } catch {
    return NextResponse.json({ count: 0, latest: null });
  }
}
