import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

// ============================================================================
// /api/owner/reset-password — ponastavitev gesla z žetonom (P0-4)
// ============================================================================
// POST { token, password } — preveri žeton (1 h) in nastavi novo geslo.
// Žeton je enkraten — po uspehu se pobriše.
// ============================================================================

export async function POST(request: Request) {
  try {
    const limited = rateLimit(request, {
      limit: 10,
      windowMs: 15 * 60_000,
      key: "reset-password",
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

    const owner = await db.owner.findFirst({
      where: {
        resetToken: token,
        resetTokenExpires: { gt: new Date() },
      },
    });

    if (!owner) {
      return NextResponse.json(
        {
          error:
            "Povezava za ponastavitev je neveljavna, je potekla ali je bila že uporabljena. Zahtevajte novo.",
        },
        { status: 400 }
      );
    }

    const passwordHash = await hash(password, 10);

    await db.owner.update({
      where: { id: owner.id },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExpires: null,
        // P3a-1: inkrement različice žetona — jwt callback v auth.ts ob
        // naslednjem preverjanju (≤60 s zaradi cache-a) razveljavi vse
        // obstoječe seje tega ownerja.
        tokenVersion: { increment: 1 },
      },
    });

    console.log(`[reset-password] geslo ponastavljeno za ${owner.email}`);

    return NextResponse.json({
      success: true,
      message:
        "Geslo je bilo uspešno spremenjeno. Sedaj se lahko prijavite z novim geslom.",
    });
  } catch (error) {
    console.error("[reset-password] napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri ponastavitvi gesla" },
      { status: 500 }
    );
  }
}
