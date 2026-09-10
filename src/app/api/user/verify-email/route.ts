import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { randomId, escapeHtml } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import { getBaseUrl } from "@/lib/email";

// ============================================================================
// /api/user/verify-email — potrditev e-pošte B2C računa popotnika (P1-2b)
// ============================================================================
// GET:  status verifikacije prijavljenega popotnika (samo accountType "user")
// POST: { action: "request" | "confirm", token?: string }
//   request — izda nov žeton (24 h) in pošlje povezavo po e-pošti (samo prijavljen B2C)
//   confirm — potrdi e-pošto prek žetona iz povezave (javno, brez prijave)
//
// Klon owner/verify-email logike, prilagojen tabeli User in povezavi
// /preverba-emaila?token=… (stran za popotnike, ne owner varianto).
// ============================================================================

const VERIFY_TOKEN_HOURS = 24;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Niste prijavljeni" }, { status: 401 });
  }
  if (session.user.accountType !== "user") {
    return NextResponse.json(
      { error: "Ta endpoint je za račune popotnikov" },
      { status: 403 }
    );
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { emailVerified: true, email: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Uporabnik ni najden" }, { status: 404 });
  }

  return NextResponse.json({
    emailVerified: user.emailVerified !== null,
    email: user.email,
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

      const user = await db.user.findFirst({
        where: {
          verificationToken: token,
          verificationTokenExpires: { gt: new Date() },
        },
      });

      if (!user) {
        return NextResponse.json(
          {
            error:
              "Povezava za potrditev je neveljavna ali je potekla. Prijavite se in zahtevajte novo.",
          },
          { status: 400 }
        );
      }

      await db.user.update({
        where: { id: user.id },
        data: {
          emailVerified: new Date(),
          verificationToken: null,
          verificationTokenExpires: null,
        },
      });

      console.log(`[user/verify-email] ${user.email}: e-pošta potrjena`);
      return NextResponse.json({
        success: true,
        message: "E-poštni naslov je potrjen. Hvala!",
      });
    }

    // === ZAHTVAJ NOVO POVEZAVO (samo prijavljen B2C popotnik) ===
    if (action === "request") {
      const limited = rateLimit(request, {
        limit: 5,
        windowMs: 15 * 60_000,
        key: "user-verify-email-request",
      });
      if (limited) return limited;

      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        return NextResponse.json(
          { error: "Niste prijavljeni" },
          { status: 401 }
        );
      }
      if (session.user.accountType !== "user") {
        return NextResponse.json(
          { error: "Ta endpoint je za račune popotnikov" },
          { status: 403 }
        );
      }

      const user = await db.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, email: true, name: true, emailVerified: true },
      });
      if (!user) {
        return NextResponse.json(
          { error: "Uporabnik ni najden" },
          { status: 404 }
        );
      }

      if (user.emailVerified) {
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

      await db.user.update({
        where: { id: user.id },
        data: {
          verificationToken: newToken,
          verificationTokenExpires: expires,
        },
      });

      // Pošlji povezavo — neblokirajoče
      void sendVerificationEmail(
        user.email,
        user.name ?? user.email.split("@")[0],
        newToken
      ).catch((e) => console.error("[user/verify-email] napaka pošiljanja:", e));

      return NextResponse.json({
        success: true,
        message: `Povezava za potrditev je bila poslana na ${user.email} (velja ${VERIFY_TOKEN_HOURS} h).`,
      });
    }

    return NextResponse.json(
      { error: "Neveljavna akcija (dovoljene: request, confirm)" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[user/verify-email] napaka:", error);
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

  const link = `${getBaseUrl()}/preverba-emaila?token=${token}`;

  await sendEmail({
    to: email,
    subject: "Potrdite svojo e-pošto — Discover Slovenia AI",
    html: emailTemplate(
      "Potrdite svojo e-pošto",
      `<p>Pozdravljeni <strong>${escapeHtml(name)}</strong>,</p>
      <p>Za dostop do <strong>Moja potovanja</strong> (shranjeni načrti in zgodovina AI konzultacij) potrdite svoj e-poštni naslov:</p>
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
