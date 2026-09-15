import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

// ============================================================================
// TRIP COMMENTS — komentarji obiskovalcev na deljenem potovanju
// ============================================================================
//
// Skupinsko planiranje na /pot/[shareId]: obiskovalci deljene povezave lahko
// potovanje komentirajo (npr. "vidimo se ob 9h pred jezerom") — Booking/
// Mindtrip-style social layer. Komentarji so anonimni (authorName, brez
// računa) in vezani samo na shareId.
//
// Kontrakt (konsumira ga TripSocial / P1-2a frontend):
//   GET  /api/trip-comments?shareId=xxx
//        → { comments: [{ id, authorName, text, createdAt }] }  (najnovejši
//           najprej, limit 100)
//   POST /api/trip-comments  body { shareId, authorName, text }
//        → { success: true, comment: { id, authorName, text, createdAt } }
//
// Validacija: shareId hex ≤ 32, authorName trim 1–60, text trim 2–500.
// Potovanje mora obstajati (SavedItinerary) — sicer 404.
// ============================================================================

const HOUR_MS = 60 * 60_000;

/** Veljaven shareId (hex, max 32 znakov) — enak vzorec kot /pot stran. */
const SHARE_ID_RE = /^[a-z0-9]{1,32}$/;

const AUTHOR_NAME_MAX = 60;
const COMMENT_TEXT_MAX = 500;
const COMMENTS_LIMIT = 100;

interface CommentBody {
  shareId?: unknown;
  authorName?: unknown;
  text?: unknown;
}

// ============================================================================
// GET — seznam komentarjev za potovanje (najnovejši najprej)
// ============================================================================
export async function GET(request: Request) {
  const limited = rateLimit(request, {
    limit: 240,
    windowMs: HOUR_MS,
    key: "trip-comments",
  });
  if (limited) return limited;

  try {
    const url = new URL(request.url);
    const shareId = (url.searchParams.get("shareId") ?? "")
      .trim()
      .toLowerCase();

    if (!SHARE_ID_RE.test(shareId)) {
      return NextResponse.json(
        { error: "Manjka ali neveljaven ID deljenega potovanja (shareId)" },
        { status: 400 }
      );
    }

    const exists = await db.savedItinerary.findUnique({
      where: { shareId },
      select: { id: true },
    });
    if (!exists) {
      return NextResponse.json(
        { error: "Deljeno potovanje ne obstaja" },
        { status: 404 }
      );
    }

    const comments = await db.tripComment.findMany({
      where: { shareId },
      orderBy: { createdAt: "desc" },
      take: COMMENTS_LIMIT,
      select: {
        id: true,
        authorName: true,
        text: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      comments: comments.map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("[trip-comments] GET napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pridobivanju komentarjev" },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST — objavi nov komentar
// ============================================================================
export async function POST(request: Request) {
  const limited = rateLimit(request, {
    limit: 20,
    windowMs: HOUR_MS,
    key: "trip-comments",
  });
  if (limited) return limited;

  try {
    const raw: unknown = await request.json().catch(() => null);
    const b = (raw ?? {}) as CommentBody;

    const shareId =
      typeof b.shareId === "string" ? b.shareId.trim().toLowerCase() : "";
    const authorName =
      typeof b.authorName === "string" ? b.authorName.trim() : "";
    const text = typeof b.text === "string" ? b.text.trim() : "";

    if (!SHARE_ID_RE.test(shareId)) {
      return NextResponse.json(
        { error: "Manjka ali neveljaven ID deljenega potovanja (shareId)" },
        { status: 400 }
      );
    }

    if (authorName.length < 1 || authorName.length > AUTHOR_NAME_MAX) {
      return NextResponse.json(
        { error: `Ime mora imeti med 1 in ${AUTHOR_NAME_MAX} znakov` },
        { status: 400 }
      );
    }

    if (text.length < 2 || text.length > COMMENT_TEXT_MAX) {
      return NextResponse.json(
        {
          error: `Komentar mora imeti med 2 in ${COMMENT_TEXT_MAX} znakov`,
        },
        { status: 400 }
      );
    }

    // Potovanje mora obstajati (preprečuje komentiranje izmišljenih tripov)
    const exists = await db.savedItinerary.findUnique({
      where: { shareId },
      select: { id: true },
    });
    if (!exists) {
      return NextResponse.json(
        { error: "Deljeno potovanje ne obstaja" },
        { status: 404 }
      );
    }

    const comment = await db.tripComment.create({
      data: { shareId, authorName, text },
      select: {
        id: true,
        authorName: true,
        text: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      comment: {
        ...comment,
        createdAt: comment.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("[trip-comments] POST napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri objavi komentarja" },
      { status: 500 }
    );
  }
}
