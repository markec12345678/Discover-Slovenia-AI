import { NextResponse } from "next/server";
import { z } from "zod";
import { sendEmail } from "@/lib/email";
import { welcomeEmail } from "@/lib/email-templates";

// Validacijska shema za welcome email
const welcomeSchema = z.object({
  to: z.string().email(),
  ownerName: z.string().min(1),
  businessName: z.string().min(1),
  plan: z.enum(["free", "premium", "enterprise"]).default("free"),
});

// POST /api/email/welcome — internal API za pošiljanje welcome emaila
// Kliče se iz /api/owner/register po uspešni registraciji
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => ({}));
    const parsed = welcomeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Neveljavni podatki" },
        { status: 400 }
      );
    }

    const { to, ownerName, businessName, plan } = parsed.data;
    const { subject, html, text } = welcomeEmail(
      ownerName,
      businessName,
      plan
    );

    const ok = await sendEmail({ to, subject, html, text });

    return NextResponse.json({
      success: ok,
      demo: !process.env.SMTP_HOST || process.env.SMTP_HOST === "localhost",
    });
  } catch (error) {
    console.error("[api/email/welcome] napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pošiljanju e-pošte" },
      { status: 500 }
    );
  }
}
