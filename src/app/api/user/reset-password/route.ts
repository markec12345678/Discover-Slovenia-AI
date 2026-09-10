import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

// ============================================================================
// /api/user/reset-password — ponastavitev gesla B2C računa z žetonom (P1-2b)
// ============================================================================
// POST { token, password } — preveri žeton (1 h) in nastavi novo geslo.
// Žeton je enkraten — po uspehu se pobriše. Klon owner/reset-password,
// prilagojen tabeli User.
// ============================================================================

export async function POST(request: Request) {
  try {
    const limited = rateLimit(request, {
      limit: 10,
      windowMs: 15 * 60_000,
      key: "user-reset-password",
    });
    if (limited) return limited;

    const body = await request.json().catch(() => ({}));
    const token = (body?.token ?? "").toString().trim();
    const password = (body?.password ?? "").toString();

    if (!token || !password) {
      return NextResponse.json(
        { error: "Manjka žeton ali novo geslo." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Geslo mora imeti vsaj 8 znakov." },
        { status: 400 }
      );
    }

    const user = await db.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpires: { gt: new Date() },
      },
    });

    if (!user) {
      return NextResponse.json(
        {
          error:
            "Povezava za ponastavitev je neveljavna, je potekla ali je bila že uporabljena. Zahtevajte novo.",
        },
        { status: 400 }
      );
    }

    const passwordHash = await hash(password, 10);

    await db.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExpires: null,
      },
    });

    console.log(`[user/reset-password] geslo ponastavljeno za ${user.email}`);

    return NextResponse.json({
      success: true,
      message:
        "Geslo je bilo uspešno spremenjeno. Sedaj se lahko prijavite z novim geslom.",
    });
  } catch (error) {
    console.error("[user/reset-password] napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri ponastavitvi gesla" },
      { status: 500 }
    );
  }
}
