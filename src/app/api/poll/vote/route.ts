import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

// ============================================================================
// TRIP POLL VOTE — oddaj / prestavi glas v anketi (F11)
// ============================================================================
//
// Kontrakt (konsumira ga TripPollsPanel / F11 frontend):
//   POST /api/poll/vote  body { pollId, voterId, optionIdx }
//        → { success: true, counts: number[], total, myVote }
//
// En glas na obiskovalca (unique([pollId, voterId])):
//   - novo glasovanje → create
//   - prestavitev na drugo opcijo → update optionIdx (zadnji glas velja)
//   - ista opcija → no-op (idempotentno)
// Zaprte ankete ne sprejemajo glasov (409).
// ============================================================================

const HOUR_MS = 60 * 60_000;

/** Veljaven voterId (enak vzorec kot trip-vote). */
const VOTER_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;
/** Veljaven pollId (cuid). */
const POLL_ID_RE = /^[a-zA-Z0-9]{20,40}$/;

interface VoteBody {
  pollId?: unknown;
  voterId?: unknown;
  optionIdx?: unknown;
}

/** Prešteje glasove po opciji + skupaj + moj glas. */
async function tally(pollId: string, voterId: string) {
  const poll = await db.tripPoll.findUnique({
    where: { id: pollId },
    select: { options: true },
  });
  if (!poll) return null;

  let optionCount = 0;
  try {
    const parsed = JSON.parse(poll.options) as unknown;
    if (Array.isArray(parsed)) optionCount = parsed.length;
  } catch {
    // Pokvarjen JSON — 0 opcij
  }

  const votes = await db.tripPollVote.findMany({
    where: { pollId },
    select: { optionIdx: true, voterId: true },
  });

  const counts = new Array<number>(optionCount).fill(0);
  let myVote: number | null = null;
  for (const v of votes) {
    if (v.optionIdx >= 0 && v.optionIdx < optionCount) counts[v.optionIdx] += 1;
    if (v.voterId === voterId) myVote = v.optionIdx;
  }

  return { counts, total: votes.length, myVote };
}

export async function POST(request: Request) {
  const limited = rateLimit(request, {
    limit: 60,
    windowMs: HOUR_MS,
    key: "poll-vote",
  });
  if (limited) return limited;

  try {
    const raw: unknown = await request.json().catch(() => null);
    const b = (raw ?? {}) as VoteBody;

    const pollId = typeof b.pollId === "string" ? b.pollId.trim() : "";
    const voterId = typeof b.voterId === "string" ? b.voterId.trim() : "";
    const optionIdx =
      typeof b.optionIdx === "number" && Number.isInteger(b.optionIdx)
        ? b.optionIdx
        : -1;

    if (!POLL_ID_RE.test(pollId)) {
      return NextResponse.json(
        { error: "Manjka ali neveljaven ID ankete" },
        { status: 400 }
      );
    }
    if (!VOTER_ID_RE.test(voterId)) {
      return NextResponse.json(
        { error: "Manjka ali neveljaven identifikator glasovalca (8–64 znakov)" },
        { status: 400 }
      );
    }
    if (optionIdx < 0) {
      return NextResponse.json(
        { error: "Manjka ali neveljavna izbrana možnost (optionIdx)" },
        { status: 400 }
      );
    }

    const poll = await db.tripPoll.findUnique({
      where: { id: pollId },
      select: { options: true, closed: true },
    });
    if (!poll) {
      return NextResponse.json({ error: "Anketa ne obstaja" }, { status: 404 });
    }

    if (poll.closed) {
      return NextResponse.json(
        { error: "Anketa je zaključena — glasovanje ni več mogoče" },
        { status: 409 }
      );
    }

    let optionCount = 0;
    try {
      const parsed = JSON.parse(poll.options) as unknown;
      if (Array.isArray(parsed)) optionCount = parsed.length;
    } catch {
      // Pokvarjen JSON — 0 opcij
    }
    if (optionIdx >= optionCount) {
      return NextResponse.json(
        { error: "Izbrana možnost ne obstaja v tej anketi" },
        { status: 400 }
      );
    }

    // Upsert: obstoječ glas se prestavi (zadnji glas velja)
    const existing = await db.tripPollVote.findUnique({
      where: { pollId_voterId: { pollId, voterId } },
      select: { id: true, optionIdx: true },
    });

    if (!existing) {
      await db.tripPollVote.create({ data: { pollId, voterId, optionIdx } });
    } else if (existing.optionIdx !== optionIdx) {
      await db.tripPollVote.update({
        where: { id: existing.id },
        data: { optionIdx },
      });
    }
    // ista opcija → no-op (idempotentno)

    const result = await tally(pollId, voterId);
    if (!result) {
      return NextResponse.json(
        { error: "Anketa ne obstaja" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[poll-vote] POST napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri oddaji glasu" },
      { status: 500 }
    );
  }
}
