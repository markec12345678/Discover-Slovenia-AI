import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { communityTripGate } from "@/lib/trip-permissions";
import { maybeRefreshStoIndex } from "@/lib/rag/freshness";
// W2 (Issue #15, 1.131.0): isti deterministični pogon kot /api/chat —
// baza + STO uzemljenje (T2) + OSM geo kraji (T3) + domenska plast.
import { answerChatQuestion } from "@/lib/chat-engine";
import { AI_ADVISOR_NAME, buildAiPayload, stripAiMention } from "@/lib/trip-chat";

// ============================================================================
// TRIP CHAT AI REPLY — odgovor AI svetovalca v skupinskem klepetu (W2)
// ============================================================================
//
// POST /api/trip-comments/ai-reply  body { shareId, question }
//
// Mindtripov vzorec "@Mindtrip AI v skupinskem klepetu", po našem kanonu:
//   - AI odgovor je VRSTICA TripComment (isAI=true, authorName "AI
//     svetovalec"), izstavljena IZKLJUČNO tukaj — klient ne more ponarediti
//     značke (navaden POST zavrne rezervirano ime);
//   - odgovor poganja ISTI deterministični pogon kot osebni klepet
//     (src/lib/chat-engine.ts → buildDomainAnswer): 0 runtime LLM klicev,
//     pošteno groundan na bazi + uradnih virih STO + OSM;
//   - priloga payload (places/sources) nosi PREDLOGE krajev — klient jih
//     izriše z gumbom "Dodaj v pot" (isti kanon kot klepet "+"), AI SAMO
//     PREDLAGA (nikoli ne piše v načrt — odločitev je človeška).
//
// Tok (klient): uporabnikovo sporočilo z @AI se NAJPREJ objavi kot navaden
// komentar (POST /api/trip-comments — viden vsem), NATO klient pokliče
// tale vstop z očistjenim vprašanjem. Vračanje: { success, comment } —
// klient doda vrstico (in signalizira prisotnim prek chat:signal).
//
// ISSUE #24 Sklop 1 (1.164.0): površina /pot je DVOJEZIČNA {sl,en} — jezik
// odgovora (in napak) sledi lokalu STRANI, ki sprašuje (izrecen
// body.locale "en"; vse ostalo, tudi izpuščena vrednost, je SL — privzeto).
// ============================================================================

const HOUR_MS = 60 * 60_000;

/** Veljaven shareId (hex, max 32 znakov) — enak vzorec kot /pot stran. */
const SHARE_ID_RE = /^[a-z0-9]{1,32}$/;

const QUESTION_MAX = 500;

interface AiReplyBody {
  shareId?: unknown;
  question?: unknown;
  /** ISSUE #24 Sklop 1 (1.164.0): jezik odgovora po površini ("en" | drugo). */
  locale?: unknown;
}

export async function POST(request: Request) {
  // AI odgovori so dražji od navadnih komentarjev (DB kontekst + STO +
  // Overpass) — lasten, strožji limiter (10/h na IP).
  const limited = rateLimit(request, {
    limit: 10,
    windowMs: HOUR_MS,
    key: "trip-chat-ai",
  });
  if (limited) return limited;

  // 1.45.0 §7 isti kanon kot /api/chat: fire-and-forget osvežitev T2 virov
  // STO (nikoli ne blokira odgovora).
  maybeRefreshStoIndex();

  // ISSUE #24 Sklop 1 (1.164.0): jezik odgovora/napak sledi lokalu strani —
  // default SL, dokler telo zahteve ne pove "en" (stroga validacija spodaj).
  let reqLang: "sl" | "en" = "sl";

  try {
    const raw: unknown = await request.json().catch(() => null);
    const b = (raw ?? {}) as AiReplyBody;

    const shareId =
      typeof b.shareId === "string" ? b.shareId.trim().toLowerCase() : "";
    // Vprašanje: očiščeno @AI omembo (žeton), trimano; prazno → 400.
    const question =
      typeof b.question === "string" ? stripAiMention(b.question) : "";

    // ISSUE #24 Sklop 1 (1.164.0): stroga validacija — SAMO "en" je EN,
    // vse ostalo (tudi izpuščeno) je SL.
    reqLang = b.locale === "en" ? "en" : "sl";

    if (!SHARE_ID_RE.test(shareId)) {
      return NextResponse.json(
        {
          error:
            reqLang === "en"
              ? "Missing or invalid shared trip ID (shareId)"
              : "Manjka ali neveljaven ID deljenega potovanja (shareId)",
        },
        { status: 400 }
      );
    }

    if (question.length < 2 || question.length > QUESTION_MAX) {
      return NextResponse.json(
        {
          error:
            reqLang === "en"
              ? "The question for the AI advisor must be between 2 and 500 characters (after removing @AI)."
              : "Vprašanje za AI svetovalca mora imeti med 2 in 500 znakov (po odstranitvi @AI).",
        },
        { status: 400 }
      );
    }

    // Potovanje mora obstajati — AI ne odgovarja v izmišljenih sobah.
    const exists = await db.savedItinerary.findUnique({
      where: { shareId },
      select: { id: true, isPublic: true },
    });
    if (!exists) {
      return NextResponse.json(
        {
          error:
            reqLang === "en"
              ? "Shared trip does not exist"
              : "Deljeno potovanje ne obstaja",
        },
        { status: 404 }
      );
    }

    // ISSUE #4 §13: zasebna pot → vloga komentatorja+ (javna = anonimno,
    // isto kot navadni komentarji).
    if (!exists.isPublic) {
      const gate = await communityTripGate(shareId, "comment");
      if (gate) return gate;
    }

    // Deterministični odgovor — isti pogon kot /api/chat. ISSUE #24 Sklop 1
    // (1.164.0): jezik sledi lokalu strani (prej:
    // answerChatQuestion(question, "sl") — SL-only).
    const answer = await answerChatQuestion(question, reqLang);

    // Priloga: predlogi krajev (gumb "Dodaj v pot" — AI samo predlaga) +
    // citati uradnih virov STO. Kapice v buildAiPayload (kraji ≤ 8, viri ≤ 5).
    const payload = buildAiPayload(answer.places, answer.sources);

    const comment = await db.tripComment.create({
      data: {
        shareId,
        authorName: AI_ADVISOR_NAME,
        text: answer.message,
        isAI: true,
        ...(payload !== null ? { payload } : {}),
      },
      select: {
        id: true,
        authorName: true,
        text: true,
        isAI: true,
        payload: true,
        createdAt: true,
      },
    });

    console.log(
      `[trip-chat-ai] AI svetovalec odgovoril na /pot/${shareId} — ` +
        `vprašanje: "${question.substring(0, 60)}…"` +
        `${answer.sources.length > 0 ? ` [T2: ${answer.sources.length} virov STO]` : ""}` +
        `${answer.places.length > 0 ? ` [predlogi: ${answer.places.length} krajev]` : ""}`
    );

    return NextResponse.json({
      success: true,
      comment: {
        id: comment.id,
        authorName: comment.authorName,
        text: comment.text,
        isAI: comment.isAI,
        payload: comment.payload,
        createdAt: comment.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("[trip-chat-ai] POST napaka:", error);
    return NextResponse.json(
      {
        error:
          reqLang === "en"
            ? "The AI advisor cannot answer right now — try again."
            : "AI svetovalec trenutno ne more odgovoriti — poskusi znova.",
      },
      { status: 500 }
    );
  }
}
