import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

// ============================================================================
// TRIP LIKES — všečki (srčki) na deljenem potovanju
// ============================================================================
//
// Skupinsko planiranje na /pot/[shareId]: obiskovalec potovanje označi z
// "všeč" (srček). En všeček na pot na anonimni clientId (localStorage,
// enak pristop kot voterId pri glasovanju) — toggle prek tega API-ja.
//
// Kontrakt (konsumira ga TripSocial / P1-2a frontend):
//   POST /api/trip-likes  body { shareId, clientId }
//        → { success: true, liked, count }   (TOGGLE — insert ali delete)
//
//   liked = true  → všeček je bil dodan
//   liked = false → všeček je bil odstranjen
//   count = skupno število všečkov za shareId PO spremembi
//
// Validacija: shareId hex ≤ 32, clientId 8–64 znakov [A-Za-z0-9_-].
// Potovanje mora obstajati (SavedItinerary) — sicer 404.
// Unique([shareId, clientId]) garantira en všeček na obiskovalca.
// ============================================================================

const HOUR_MS = 60 * 60_000;

/** Veljaven shareId (hex, max 32 znakov) — enak vzorec kot /pot stran. */
const SHARE_ID_RE = /^[a-z0-9]{1,32}$/;
/** Veljaven clientId (enak vzorec kot voterId pri glasovanju). */
const CLIENT_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;

interface LikeBody {
  shareId?: unknown;
  clientId?: unknown;
}

// ============================================================================
// POST — TOGGLE všečka (dodaj ali odstrani)
// ============================================================================
export async function POST(request: Request) {
  const limited = rateLimit(request, {
    limit: 60,
    windowMs: HOUR_MS,
    key: "trip-likes",
  });
  if (limited) return limited;

  try {
    const raw: unknown = await request.json().catch(() => null);
    const b = (raw ?? {}) as LikeBody;

    const shareId =
      typeof b.shareId === "string" ? b.shareId.trim().toLowerCase() : "";
    const clientId =
      typeof b.clientId === "string" ? b.clientId.trim() : "";

    if (!SHARE_ID_RE.test(shareId)) {
      return NextResponse.json(
        { error: "Manjka ali neveljaven ID deljenega potovanja (shareId)" },
        { status: 400 }
      );
    }

    if (!CLIENT_ID_RE.test(clientId)) {
      return NextResponse.json(
        { error: "Manjka ali neveljaven identifikator obiskovalca (8–64 znakov)" },
        { status: 400 }
      );
    }

    // Potovanje mora obstajati (preprečuje všečke na izmišljene tripe)
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

    // Toggle: če všeček obstaja → izbriši, sicer ustvari
    const existing = await db.tripLike.findUnique({
      where: { shareId_clientId: { shareId, clientId } },
      select: { id: true },
    });

    let liked: boolean;
    if (existing) {
      await db.tripLike.delete({ where: { id: existing.id } });
      liked = false;
    } else {
      await db.tripLike.create({ data: { shareId, clientId } });
      liked = true;
    }

    const count = await db.tripLike.count({ where: { shareId } });

    return NextResponse.json({ success: true, liked, count });
  } catch (error) {
    console.error("[trip-likes] POST napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri shranjevanju všečka" },
      { status: 500 }
    );
  }
}
