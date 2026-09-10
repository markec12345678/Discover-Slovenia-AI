import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

// ============================================================================
// POST /api/user/trips/claim — prevzem anonimnih potovanj v B2C račun (P2-3)
// ============================================================================
// Booking.com-style "claim" izkušnja: popotnik je anonimno shranil načrte
// (SavedItinerary z userId: null) prek plannerja/timelinea. Ko se prijavi ali
// registrira, frontend (src/app/prijava/page.tsx) pošlje seznam shareId-jev
// iz localStorage (dai:my-trips) sem.
//
// Varnost:
// - samo B2C seje (accountType === "user") — Owner/B2B seja → 403, brez seje → 401
//   (vzor iz /api/user/trips)
// - prevzamejo se SAMO anonimni zapisi (userId: null) — lastništva že
//   prevzetih potovanj ni mogoče prepisati (idempotentno)
// - validacija: array 1–50 ID-jev, vsak 5–20 znakov hex-ish
// - rate limit 10/h na IP
// ============================================================================

const MAX_CLAIM = 50;
const SHARE_ID_RE = /^[a-z0-9]{5,20}$/i;

export async function POST(request: Request) {
  // Rate limit prevzemov (preprečuje bruto-force enumeracijo shareId-jev)
  const limited = rateLimit(request, {
    limit: 10,
    windowMs: 60 * 60_000,
    key: "user-trips-claim",
  });
  if (limited) return limited;

  try {
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

    // === Validacija telesa ===
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Neveljavno telo zahteve" },
        { status: 400 }
      );
    }

    const shareIdsRaw = (body as { shareIds?: unknown })?.shareIds;
    if (!Array.isArray(shareIdsRaw) || shareIdsRaw.length === 0) {
      return NextResponse.json(
        { error: "Manjka seznam potovanj (shareIds)" },
        { status: 400 }
      );
    }
    if (shareIdsRaw.length > MAX_CLAIM) {
      return NextResponse.json(
        { error: `Naenkrat lahko prevzamete največ ${MAX_CLAIM} potovanj` },
        { status: 400 }
      );
    }

    // Dedupliciraj + preveri format vsakega ID-ja
    const shareIds = [
      ...new Set(
        shareIdsRaw.map((id) => (typeof id === "string" ? id.trim() : ""))
      ),
    ].filter((id) => id.length > 0);

    if (shareIds.length === 0 || !shareIds.every((id) => SHARE_ID_RE.test(id))) {
      return NextResponse.json(
        { error: "Neveljavni ID-ji potovanj" },
        { status: 400 }
      );
    }

    // === Prevzem: SAMO anonimni zapisi (userId: null) ===
    // Že prevzeta potovanja (tudi tujega uporabnika) se ne pipajo —
    // updateMany vrne število dejansko posodobljenih vrstic.
    const result = await db.savedItinerary.updateMany({
      where: {
        shareId: { in: shareIds },
        userId: null,
      },
      data: {
        userId: session.user.id,
      },
    });

    return NextResponse.json({
      success: true,
      claimed: result.count,
    });
  } catch (error) {
    console.error("[user/trips/claim] POST napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri prevzemu potovanj" },
      { status: 500 }
    );
  }
}
