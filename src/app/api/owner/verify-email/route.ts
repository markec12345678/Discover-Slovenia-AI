import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { randomId } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import { escapeHtml } from "@/lib/security";
import { getBaseUrl } from "@/lib/email";

// ============================================================================
// /api/owner/verify-email — potrditev e-pošte (P0-4)
// ============================================================================
// GET:  status verifikacije prijavljenega lastnika
// POST: { action: "request" | "confirm", token?: string }
//   request — izda nov žeton (24 h) in pošlje povezavo po e-pošti
//   confirm — potrdi e-pošto prek žetona iz povezave
// ============================================================================

const VERIFY_TOKEN_HOURS = 24;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Niste prijavljeni" }, { status: 401 });
  }

  const owner = await db.owner.findUnique({
    where: { id: session.user.id },
    select: { emailVerified: true, email: true },
  });
  if (!owner) {
    return NextResponse.json({ error: "Lastnik ni najden" }, { status: 404 });
  }

  return NextResponse.json({
    emailVerified: owner.emailVerified !== null,
    email: owner.email,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { action, token } = body ?? {};

    // === POTRDI (javna povezava iz e-pošte — brez prijave) ===
    if (action === "confirm") {
      if (!token) {
        return NextResponse.json(
          { error: "Manjka žeton za potrditev." },
          { status: 400 }
        );
      }

      const owner = await db.owner.findFirst({
        where: {
          verificationToken: token,
          verificationTokenExpires: { gt: new Date() },
        },
      });

      if (!owner) {
        return NextResponse.json(
          {
            error:
              "Povezava za potrditev je neveljavna ali je potekla. Prijavite se in zahtevajte novo.",
          },
          { status: 400 }
        );
      }

      await db.owner.update({
        where: { id: owner.id },
        data: {
          emailVerified: new Date(),
          verificationToken: null,
          verificationTokenExpires: null,
        },
      });

      console.log(`[verify-email] ${owner.email}: e-pošta potrjena`);
      return NextResponse.json({
        success: true,
        message: "E-poštni naslov je potrjen. Hvala!",
      });
    }

    // === ZAHTVAJ NOVO PIŠTOLO (samo prijavljeni lastnik) ===
    if (action === "request") {
      const limited = rateLimit(request, {
        limit: 5,
        windowMs: 15 * 60_000,
        key: "verify-email-request",
      });
      if (limited) return limited;

      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        return NextResponse.json(
          { error: "Niste prijavljeni" },
          { status: 401 }
        );
      }

      const owner = await db.owner.findUnique({
        where: { id: session.user.id },
        select: { id: true, email: true, name: true, emailVerified: true },
      });
      if (!owner) {
        return NextResponse.json(
          { error: "Lastnik ni najden" },
          { status: 404 }
        );
      }

      if (owner.emailVerified) {
        return NextResponse.json({
          success: true,
          alreadyVerified: true,
          message: "Vaša e-pošta je že potrjena.",
        });
      }

      const newToken = randomId(48);
      const expires = new Date(
        Date.now() + VERIFY_TOKEN_HOURS * 60 * 60 * 1000
      );

      await db.owner.update({
        where: { id: owner.id },
        data: {
          verificationToken: newToken,
          verificationTokenExpires: expires,
        },
      });

      // Pošlji povezavo — neblokirajoče
      void sendVerificationEmail(
        owner.email,
        owner.name,
        newToken
      ).catch((e) => console.error("[verify-email] napaka pošiljanja:", e));

      return NextResponse.json({
        success: true,
        message: `Povezava za potrditev je bila poslana na ${owner.email} (velja ${VERIFY_TOKEN_HOURS} h).`,
      });
    }

    return NextResponse.json(
      { error: "Neveljavna akcija (dovoljene: request, confirm)" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[verify-email] napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri obdelavi zahteve" },
      { status: 500 }
    );
  }
}

async function sendVerificationEmail(
  email: string,
  name: string,
  token: string
) {
  const { sendEmail, emailTemplate } = await import("@/lib/email");

  const link = `${getBaseUrl()}/owner/preverba-emaila?token=${token}`;

  await sendEmail({
    to: email,
    subject: "Potrdite svojo e-pošto — Discover Slovenia AI",
    html: emailTemplate(
      "Potrdite svojo e-pošto",
      `<p>Pozdravljeni <strong>${escapeHtml(name)}</strong>,</p>
      <p>Hvala za registracijo na portalu Discover Slovenia AI. Za aktivacijo vseh funkcij (objava lokalov, sprejem rezervacij, provizijski računi) potrdite svoj e-poštni naslov:</p>
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
