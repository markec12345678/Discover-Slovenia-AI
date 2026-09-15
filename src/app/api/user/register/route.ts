import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { sendEmail, getBaseUrl } from "@/lib/email";
import { randomId, escapeHtml } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";

// ============================================================================
// POST /api/user/register — registracija B2C računa popotnika (P1)
// ============================================================================
// Popotnik: shranjevanje itinererjev v "Moja potovanja", zgodovina AI
// konzultacij. Enak vzorec varnosti kot Owner registracija:
// zod validacija, rate limit, bcrypt (10 rund), žeton za potrditev
// e-pošte (24 h) — dokler e-pošta ni potrjena, "moja potovanja" NE
// prikazujejo konzultacij (preprečuje vpogled v tuj poštni nabiralnik).
//
// CROSS-TABLE zaščita: email, ki že obstaja kot Owner (B2B), se zavrne —
// sicer bi session email kollideral z Owner zapisom (glej auth-guards).
// ============================================================================

const VERIFY_TOKEN_HOURS = 24;

const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Ime mora imeti vsaj 2 znaka")
    .max(60, "Ime je lahko največ 60 znakov"),
  email: z.string().email("Vnesite veljaven e-poštni naslov"),
  password: z
    .string()
    .min(8, "Geslo mora imeti vsaj 8 znakov")
    .max(100, "Geslo je lahko največ 100 znakov"),
});

export async function POST(request: Request) {
  try {
    // Rate limit (javni endpoint — preprečuje masovne registracije)
    const limited = rateLimit(request, {
      limit: 10,
      windowMs: 60 * 60_000,
      key: "user-register",
    });
    if (limited) return limited;

    const body = await request.json().catch(() => ({}));
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return NextResponse.json(
        { error: firstError?.message ?? "Neveljavni podatki" },
        { status: 400 }
      );
    }

    const { name, email, password } = parsed.data;
    const emailLower = email.toLowerCase().trim();

    // Preveri ali email že obstaja med popotniki
    const existingUser = await db.user.findUnique({
      where: { email: emailLower },
      select: { id: true },
    });
    if (existingUser) {
      return NextResponse.json(
        {
          error:
            "Ta e-poštni naslov je že registriran. Poskusite se prijaviti.",
        },
        { status: 409 }
      );
    }

    // CROSS-TABLE: email ne sme pripadati ponudniškemu (Owner) računu —
    // prijava poteka prek ločenih providerjev, kollision pa bi mešal seje
    const existingOwner = await db.owner.findUnique({
      where: { email: emailLower },
      select: { id: true },
    });
    if (existingOwner) {
      return NextResponse.json(
        {
          error:
            "Ta e-poštni naslov je že registriran kot ponudniški račun. Uporabite ponudniško prijavo.",
        },
        { status: 409 }
      );
    }

    // Hash gesla (bcrypt, 10 rund — enako kot Owner)
    const passwordHash = await hash(password, 10);

    // Žeton za potrditev e-pošte (24 h) — isti princip kot Owner
    const verificationToken = randomId(48);
    const verificationTokenExpires = new Date(
      Date.now() + VERIFY_TOKEN_HOURS * 60 * 60 * 1000
    );

    const user = await db.user.create({
      data: {
        name: name.trim(),
        email: emailLower,
        passwordHash,
        verificationToken,
        verificationTokenExpires,
      },
      select: { id: true, email: true, name: true },
    });

    // Pošlji povezavo za potrditev e-pošte (non-blocking)
    void sendVerificationEmail(
      user.email,
      user.name ?? user.email.split("@")[0],
      verificationToken
    ).catch((e) => console.error("[user/register] verification email napaka:", e));

    console.log(`[user/register] novi popotnik: ${user.email}`);

    return NextResponse.json(
      {
        success: true,
        userId: user.id,
        email: user.email,
        message:
          "Račun je ustvarjen. Povezavo za potrditev e-pošte smo poslali nanj.",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[api/user/register] napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri registraciji. Poskusite znova." },
      { status: 500 }
    );
  }
}

async function sendVerificationEmail(
  email: string,
  name: string,
  token: string
) {
  const { emailTemplate } = await import("@/lib/email");

  const link = `${getBaseUrl()}/preverba-emaila?token=${token}`;

  await sendEmail({
    to: email,
    subject: "Potrdite svojo e-pošto — Discover Slovenia AI",
    html: emailTemplate(
      "Potrdite svojo e-pošto",
      `<p>Pozdravljeni <strong>${escapeHtml(name)}</strong>,</p>
      <p>Hvala za registracijo računa popotnika na Discover Slovenia AI. S potrditvijo e-pošte odklenete <strong>Moja potovanja</strong> (shranjeni načrti in zgodovina AI konzultacij):</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${link}" style="background: #2d6a3e; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
          Potrdi e-pošto →
        </a>
      </div>
      <p style="font-size: 13px; color: #6b7280;">Povezava velja ${VERIFY_TOKEN_HOURS} ur. Če se povezava ne odpre, kopirajte naslov v brskalnik:<br>${link}</p>
      <p style="font-size: 13px; color: #6b7280;">Če se niste registrirali, to sporočilo ignorirajte.</p>`
    ),
  });
}
