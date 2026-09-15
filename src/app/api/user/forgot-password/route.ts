import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { randomId, escapeHtml } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import { getBaseUrl } from "@/lib/email";

// ============================================================================
// /api/user/forgot-password — zahteva za ponastavitev gesla B2C računa (P1-2b)
// ============================================================================
// POST { email } — izda enkratni žeton (1 h) in pošlje povezavo na /reset-gesla.
// VEDNO vrne uspeh (zaščita pred ugibanjem obstoja računov — anti-enumeration).
// Klon owner/forgot-password, prilagojen tabeli User.
// ============================================================================

const RESET_TOKEN_MINUTES = 60;

export async function POST(request: Request) {
  try {
    const limited = rateLimit(request, {
      limit: 5,
      windowMs: 15 * 60_000,
      key: "user-forgot-password",
    });
    if (limited) return limited;

    const body = await request.json().catch(() => ({}));
    const email = (body?.email ?? "").toString().trim().toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Vnesite veljaven e-poštni naslov." },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true },
    });

    if (user) {
      const token = randomId(48);
      const expires = new Date(Date.now() + RESET_TOKEN_MINUTES * 60 * 1000);

      await db.user.update({
        where: { id: user.id },
        data: {
          resetToken: token,
          resetTokenExpires: expires,
        },
      });

      // Pošlji povezavo — neblokirajoče
      void sendResetEmail(
        user.email,
        user.name ?? user.email.split("@")[0],
        token
      ).catch((e) =>
        console.error("[user/forgot-password] napaka pošiljanja:", e)
      );

      console.log(`[user/forgot-password] žeton izdan za ${email}`);
    } else {
      console.log(
        `[user/forgot-password] zahteva za neobstoječi račun: ${email} (brez razkritja)`
      );
    }

    // Enak odgovor v obeh primerih (anti-enumeration)
    return NextResponse.json({
      success: true,
      message: `Če račun popotnika z e-pošto ${email} obstaja, smo nanj poslali povezavo za ponastavitev gesla (velja ${RESET_TOKEN_MINUTES} min).`,
    });
  } catch (error) {
    console.error("[user/forgot-password] napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri obdelavi zahteve" },
      { status: 500 }
    );
  }
}

async function sendResetEmail(email: string, name: string, token: string) {
  const { sendEmail, emailTemplate } = await import("@/lib/email");

  const link = `${getBaseUrl()}/reset-gesla?token=${token}`;

  await sendEmail({
    to: email,
    subject: "Ponastavitev gesla — Discover Slovenia AI",
    html: emailTemplate(
      "Ponastavitev gesla",
      `<p>Pozdravljeni <strong>${escapeHtml(name)}</strong>,</p>
      <p>prejeli smo zahtevo za ponastavitev gesla vašega računa popotnika. Za nastavitev novega gesla kliknite spodnjo povezavo:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${link}" style="background: #2d6a3e; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
          Nastavi novo geslo →
        </a>
      </div>
      <p style="font-size: 13px; color: #6b7280;">Povezava velja ${RESET_TOKEN_MINUTES} minut in je enkratna. Če gesla niste zahtevali, to sporočilo ignorirajte — vaše geslo ostaja nespremenjeno.</p>`
    ),
  });
}
