import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { sendEmail, getAdminEmail } from "@/lib/email";
import { welcomeEmail, adminAlertEmail } from "@/lib/email-templates";

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

    // Hash gesla (bcrypt, 10 rund)
    const passwordHash = await hash(password, 10);

    // Ustvari lastnika — privzeto free paket
    const owner = await db.owner.create({
      data: {
        name: name.trim(),
        email: emailLower,
        phone: phone?.trim() || null,
        businessName: businessName.trim(),
        passwordHash,
        plan: "free",
        subscriptionStatus: "none",
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
