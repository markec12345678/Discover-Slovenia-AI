import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { timingSafeEqual } from "@/lib/security";

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
// - ISSUE #4 §23 (VAL 8, P2 — takeover fix): prevzem ZAHTEVA veljaven
//   editToken (hash) za vsako pot. Prej je zadostoval SAMO shareId — ker je
//   shareId javen (deljena povezava), si je lahko vsak prejemnik povezave
//   po prijavi prevzel pot kot so-lastnika. Žeton ima v localStorage le
//   tisti, ki je pot shranil (dsa_edit_token_{shareId}). Pote brez
//   editTokenHash (stare, pre-F7) NE morejo biti prevzete — fail-closed
//   (enako načelo kot avtorstvo vodnika v shemi).
// - validacija: array 1–50 ID-jev, vsak 5–20 znakov hex-ish
// - rate limit 10/h na IP
// ============================================================================

const MAX_CLAIM = 50;
const SHARE_ID_RE = /^[a-z0-9]{5,20}$/i;
const EDIT_TOKEN_RE = /^[a-f0-9]{32,64}$/;

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

    // === ISSUE #4 §23 (VAL 8): žetoni dokazila lastništva ===
    // Body: { shareIds: [...], editTokens?: { [shareId]: token } } — klient
    // pošlje žetone iz localStorage za pote, ki jih je TA brskalnik shranil.
    const editTokensRaw = (body as { editTokens?: unknown })?.editTokens;
    const editTokens = new Map<string, string>();
    if (editTokensRaw != null && typeof editTokensRaw === "object") {
      for (const [sid, tok] of Object.entries(
        editTokensRaw as Record<string, unknown>
      )) {
        if (
          typeof tok === "string" &&
          shareIds.includes(sid) && // žeton SAMO za zahtevane pote
          EDIT_TOKEN_RE.test(tok) &&
          editTokens.size < MAX_CLAIM
        ) {
          editTokens.set(sid, tok);
        }
      }
    }

    // === Prevzem: SAMO anonimni zapisi (userId: null) z veljavnim žetonom ===
    // Že prevzeta potovanja (tudi tujega uporabnika) se ne pipajo; pote brez
    // žetona ali z napačnim žetonom se izpustijo (fail-closed, iskren števec).
    const candidates = await db.savedItinerary.findMany({
      where: { shareId: { in: shareIds } },
      select: { shareId: true, userId: true, editTokenHash: true },
    });
    const verified: string[] = [];
    for (const trip of candidates) {
      if (trip.userId != null) continue; // že prevzeto (idempotentno)
      if (!trip.editTokenHash) continue; // stara pot (pre-F7) — ni dokazila
      const token = editTokens.get(trip.shareId);
      if (!token) continue; // žeton ni poslan
      const tokenHash = createHash("sha256").update(token).digest("hex");
      if (!timingSafeEqual(tokenHash, trip.editTokenHash)) continue; // napačen
      verified.push(trip.shareId);
    }

    if (verified.length === 0) {
      return NextResponse.json({
        success: true,
        claimed: 0,
        skipped: shareIds.length,
      });
    }

    // CAS: pogojni update še vedno ščiti pred sočasnostjo (dve prijavi
    // hkrati) — updateMany sprejme predpogoj userId: null.
    const result = await db.savedItinerary.updateMany({
      where: {
        shareId: { in: verified },
        userId: null,
      },
      data: {
        userId: session.user.id,
      },
    });

    return NextResponse.json({
      success: true,
      claimed: result.count,
      skipped: shareIds.length - result.count,
    });
  } catch (error) {
    console.error("[user/trips/claim] POST napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri prevzemu potovanj" },
      { status: 500 }
    );
  }
}
