import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { sendEmail, getAdminEmail, getBaseUrl } from "@/lib/email";
import { welcomeEmail, adminAlertEmail } from "@/lib/email-templates";
import { randomId, escapeHtml } from "@/lib/security";

// Validacijska shema za registracijo lastnika
const registerSchema = z.object({
  name: z.string().min(2, "Ime in priimek mora imeti vsaj 2 znaka"),
  email: z.string().email("Vnesite veljaven e-poštni naslov"),
  phone: z.string().optional(),
  businessName: z.string().min(2, "Ime podjetja je obvezno"),
  password: z.string().min(8, "Geslo mora imeti vsaj 8 znakov"),
  gdprConsent: z
    .boolean()
    .refine((v) => v === true, "GDPR privolitev je obvezna"),
});

// POST /api/owner/register — registracija novega lastnika lokala
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return NextResponse.json(
        { error: firstError?.message ?? "Neveljavni podatki" },
        { status: 400 }
      );
    }

    const { name, email, phone, businessName, password } = parsed.data;
    const emailLower = email.toLowerCase().trim();

    // Preveri ali email že obstaja
    const existing = await db.owner.findUnique({
      where: { email: emailLower },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Ta e-poštni naslov je že registriran. Poskusite se prijaviti." },
        { status: 409 }
      );
    }

    // P1 CROSS-TABLE: email ne sme pripadati B2C računu popotnika —
    // prijava poteka prek ločenih providerjev ("credentials" vs "user"),
    // kollision emailov pa bi mešal seje (glej auth-guards isUserAccount)
    const existingUser = await db.user.findUnique({
      where: { email: emailLower },
      select: { id: true },
    });
    if (existingUser) {
      return NextResponse.json(
        {
          error:
            "Ta e-poštni naslov je že registriran kot račun popotnika. Uporabite drug e-poštni naslov.",
        },
        { status: 409 }
      );
    }

    // Hash gesla (bcrypt, 10 rund)
    const passwordHash = await hash(password, 10);

    // Ustvari lastnika — privzeto free paket
    // P0-4: takoj izda žeton za potrditev e-pošte (24 h)
    const verificationToken = randomId(48);
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const owner = await db.owner.create({
      data: {
        name: name.trim(),
        email: emailLower,
        phone: phone?.trim() || null,
        businessName: businessName.trim(),
        passwordHash,
        plan: "free",
        subscriptionStatus: "none",
        verificationToken,
        verificationTokenExpires,
      },
      select: { id: true, email: true, name: true, businessName: true },
    });

    // Pošlji welcome email (non-blocking — ne smemo zavreti registracije)
    try {
      const { subject, html, text } = welcomeEmail(
        owner.name,
        owner.businessName,
        "free"
      );
      await sendEmail({ to: owner.email, subject, html, text });
    } catch (emailErr) {
      console.error("[register] welcome email napaka:", emailErr);
    }

    // P0-4: pošlji povezavo za potrditev e-pošte (non-blocking)
    try {
      const link = `${getBaseUrl()}/owner/preverba-emaila?token=${verificationToken}`;
      const { emailTemplate } = await import("@/lib/email");
      await sendEmail({
        to: owner.email,
        subject: "Potrdite svojo e-pošto — Discover Slovenia AI",
        html: emailTemplate(
          "Potrdite svojo e-pošto",
          `<p>Pozdravljeni <strong>${escapeHtml(owner.name)}</strong>,</p>
          <p>Hvala za registracijo. Za aktivacijo vseh funkcij portala (objava lokalov, sprejem rezervacij, provizijski računi) potrdite svoj e-poštni naslov:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${link}" style="background: #2d6a3e; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
              Potrdi e-pošto →
            </a>
          </div>
          <p style="font-size: 13px; color: #6b7280;">Povezava velja 24 ur.</p>`
        ),
      });
    } catch (verifyErr) {
      console.error("[register] verification email napaka:", verifyErr);
    }

    // Obvesti admin-a o novi registraciji (non-blocking)
    try {
      const alert = adminAlertEmail("new_signup", {
        ownerId: owner.id,
        email: owner.email,
        businessName: owner.businessName,
        name: owner.name,
        plan: "free",
        timestamp: new Date().toISOString(),
      });
      await sendEmail({
        to: getAdminEmail(),
        subject: alert.subject,
        html: alert.html,
        text: alert.text,
      });
    } catch (adminErr) {
      console.error("[register] admin alert napaka:", adminErr);
    }

    return NextResponse.json({
      success: true,
      ownerId: owner.id,
      email: owner.email,
    });
  } catch (error) {
    console.error("[api/owner/register] napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri registraciji. Poskusite znova." },
      { status: 500 }
    );
  }
}
