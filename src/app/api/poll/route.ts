import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

// ============================================================================
// TRIP POLLS — skupinske ankete na deljenem potovanju (F11, MindTrip vrzel #2)
// ============================================================================
//
// Brez-računa glasovanje o poljubnem vprašanju (npr. "Kateri dan?", "Hotel
// ali apartma?") na javni strani /pot/[shareId]. Enako anonimno identiteto
// kot ostale socialne funkcije: clientId/voterId iz localStorage
// ("discoverslovenia_voter").
//
// Kontrakt (konsumira ga TripPollsPanel / F11 frontend):
//   GET    /api/poll?shareId=xxx&voterId=yyy
//          → { polls: [{ id, question, options, authorName, closed,
//                        createdAt, counts, total, myVote, isAuthor }] }
//   POST   /api/poll   body { shareId, question, options[], authorName?,
//                              clientId }
//          → { success: true, poll: {...} }         (max 10 aktivnih/trip)
//   PATCH  /api/poll   body { pollId, clientId, closed }
//          → { success: true, poll: {...} }         (samo avtor ankete)
//   DELETE /api/poll   body { pollId, clientId }
//          → { success: true }                      (samo avtor ankete)
//
// Validacija: shareId hex ≤ 32; question 2–200; 2–6 opcij po 1–80 znakov;
// authorName 1–60 (opcijsko); clientId 8–64. Potovanje mora obstajati.
// ============================================================================

const HOUR_MS = 60 * 60_000;

/** Veljaven shareId (hex, max 32 znakov) — enak vzorec kot /pot stran. */
const SHARE_ID_RE = /^[a-z0-9]{1,32}$/;
/** Veljaven clientId/voterId (enak vzorec kot trip-vote / trip-social). */
const CLIENT_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;
/** Veljaven pollId (cuid). */
const POLL_ID_RE = /^[a-zA-Z0-9]{20,40}$/;

const QUESTION_MIN = 2;
const QUESTION_MAX = 200;
const OPTIONS_MIN = 2;
const OPTIONS_MAX = 6;
const OPTION_MAX = 80;
const AUTHOR_NAME_MAX = 60;
/** Zgornja meja aktivnih anket na potovanje (preprečuje smeti). */
const ACTIVE_POLLS_MAX = 10;

/** Serializirana anketa za frontend. */
export interface PollDTO {
  id: string;
  question: string;
  options: string[];
  authorName: string | null;
  closed: boolean;
  createdAt: string;
  /** Število glasov po opciji (index = optionIdx). */
  counts: number[];
  /** Skupno število glasov. */
  total: number;
  /** Indeks moje izbire (null = še nisem glasoval). */
  myVote: number | null;
  /** Ali je trenutni clientId avtor ankete (lahko zaključi/izbriše). */
  isAuthor: boolean;
}

interface PollBody {
  shareId?: unknown;
  question?: unknown;
  options?: unknown;
  authorName?: unknown;
  clientId?: unknown;
  pollId?: unknown;
  closed?: unknown;
}

type PollRow = {
  id: string;
  question: string;
  options: string;
  authorName: string | null;
  closed: boolean;
  createdAt: Date;
  authorClientId?: string;
};

/** Pretvori vrstico TripPoll v PollDTO (z glasovi + vlogami). */
async function toDTO(poll: PollRow, voterId: string | null): Promise<PollDTO> {
  let options: string[] = [];
  try {
    const parsed = JSON.parse(poll.options) as unknown;
    if (Array.isArray(parsed)) {
      options = parsed.filter(
        (o): o is string => typeof o === "string" && o.trim().length > 0
      );
    }
  } catch {
    // Pokvarjen JSON — prazna lista; counts se spodaj poravna nanjo
  }

  const votes = await db.tripPollVote.findMany({
    where: { pollId: poll.id },
    select: { optionIdx: true, voterId: true },
  });

  const counts = new Array<number>(options.length).fill(0);
  let myVote: number | null = null;
  for (const v of votes) {
    if (v.optionIdx >= 0 && v.optionIdx < counts.length) {
      counts[v.optionIdx] += 1;
    }
    if (voterId && v.voterId === voterId) myVote = v.optionIdx;
  }

  return {
    id: poll.id,
    question: poll.question,
    options,
    authorName: poll.authorName,
    closed: poll.closed,
    createdAt: poll.createdAt.toISOString(),
    counts,
    total: votes.length,
    myVote,
    isAuthor:
      voterId !== null && poll.authorClientId !== undefined
        ? poll.authorClientId === voterId
        : false,
  };
}

/** Preveri, da potovanje obstaja (404 sicer). */
async function tripExists(shareId: string): Promise<boolean> {
  const saved = await db.savedItinerary.findUnique({
    where: { shareId },
    select: { id: true },
  });
  return saved !== null;
}

// ============================================================================
// GET — vse ankete za potovanje (najnovejše najprej) z mojim glasom
// ============================================================================
export async function GET(request: Request) {
  const limited = rateLimit(request, {
    limit: 240,
    windowMs: HOUR_MS,
    key: "poll-get",
  });
  if (limited) return limited;

  try {
    const url = new URL(request.url);
    const shareId = (url.searchParams.get("shareId") ?? "")
      .trim()
      .toLowerCase();
    const voterId = (url.searchParams.get("voterId") ?? "").trim();

    if (!SHARE_ID_RE.test(shareId)) {
      return NextResponse.json(
        { error: "Manjka ali neveljaven ID deljenega potovanja (shareId)" },
        { status: 400 }
      );
    }

    if (voterId && !CLIENT_ID_RE.test(voterId)) {
      return NextResponse.json(
        { error: "Neveljaven identifikator obiskovalca (8–64 znakov)" },
        { status: 400 }
      );
    }

    if (!(await tripExists(shareId))) {
      return NextResponse.json(
        { error: "Deljeno potovanje ne obstaja" },
        { status: 404 }
      );
    }

    const polls = await db.tripPoll.findMany({
      where: { shareId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        question: true,
        options: true,
        authorName: true,
        closed: true,
        createdAt: true,
        authorClientId: true,
      },
    });

    const normalizedVoter = CLIENT_ID_RE.test(voterId) ? voterId : null;
    const dtos = await Promise.all(polls.map((p) => toDTO(p, normalizedVoter)));

    return NextResponse.json({ polls: dtos });
  } catch (error) {
    console.error("[poll] GET napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pridobivanju anket" },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST — ustvari anketo
// ============================================================================
export async function POST(request: Request) {
  const limited = rateLimit(request, {
    limit: 20,
    windowMs: HOUR_MS,
    key: "poll-create",
  });
  if (limited) return limited;

  try {
    const raw: unknown = await request.json().catch(() => null);
    const b = (raw ?? {}) as PollBody;

    const shareId =
      typeof b.shareId === "string" ? b.shareId.trim().toLowerCase() : "";
    const question = typeof b.question === "string" ? b.question.trim() : "";
    const clientId = typeof b.clientId === "string" ? b.clientId.trim() : "";
    const authorName =
      typeof b.authorName === "string" ? b.authorName.trim() : "";

    // options: array stringov iz JSON body-ja
    const rawOptions = Array.isArray(b.options) ? b.options : [];
    const options = rawOptions
      .filter((o): o is string => typeof o === "string")
      .map((o) => o.trim())
      .filter((o) => o.length > 0);

    if (!SHARE_ID_RE.test(shareId)) {
      return NextResponse.json(
        { error: "Manjka ali neveljaven ID deljenega potovanja (shareId)" },
        { status: 400 }
      );
    }
    if (question.length < QUESTION_MIN || question.length > QUESTION_MAX) {
      return NextResponse.json(
        {
          error: `Vprašanje mora imeti ${QUESTION_MIN}–${QUESTION_MAX} znakov`,
        },
        { status: 400 }
      );
    }
    if (options.length < OPTIONS_MIN || options.length > OPTIONS_MAX) {
      return NextResponse.json(
        { error: `Anketa potrebuje ${OPTIONS_MIN}–${OPTIONS_MAX} možnosti` },
        { status: 400 }
      );
    }
    if (options.some((o) => o.length > OPTION_MAX)) {
      return NextResponse.json(
        {
          error: `Posamezna možnost je lahko dolga največ ${OPTION_MAX} znakov`,
        },
        { status: 400 }
      );
    }
    if (authorName.length > AUTHOR_NAME_MAX) {
      return NextResponse.json(
        { error: `Ime je lahko dolgo največ ${AUTHOR_NAME_MAX} znakov` },
        { status: 400 }
      );
    }
    if (!CLIENT_ID_RE.test(clientId)) {
      return NextResponse.json(
        {
          error: "Manjka ali neveljaven identifikator obiskovalca (8–64 znakov)",
        },
        { status: 400 }
      );
    }
    if (!(await tripExists(shareId))) {
      return NextResponse.json(
        { error: "Deljeno potovanje ne obstaja" },
        { status: 404 }
      );
    }

    // Zgornja meja AKTIVNIH anket (zaprte ne štejejo)
    const activeCount = await db.tripPoll.count({
      where: { shareId, closed: false },
    });
    if (activeCount >= ACTIVE_POLLS_MAX) {
      return NextResponse.json(
        {
          error: `Doseženih je največ ${ACTIVE_POLLS_MAX} odprtih anket — zaključi ali izbriši obstoječo`,
        },
        { status: 429 }
      );
    }

    const created = await db.tripPoll.create({
      data: {
        shareId,
        question,
        options: JSON.stringify(options),
        authorName: authorName || null,
        authorClientId: clientId,
      },
      select: {
        id: true,
        question: true,
        options: true,
        authorName: true,
        closed: true,
        createdAt: true,
        authorClientId: true,
      },
    });

    return NextResponse.json(
      { success: true, poll: await toDTO(created, clientId) },
      { status: 201 }
    );
  } catch (error) {
    console.error("[poll] POST napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri ustvarjanju ankete" },
      { status: 500 }
    );
  }
}

// ============================================================================
// PATCH — zaključi / ponovno odpri anketo (samo avtor)
// ============================================================================
export async function PATCH(request: Request) {
  const limited = rateLimit(request, {
    limit: 30,
    windowMs: HOUR_MS,
    key: "poll-patch",
  });
  if (limited) return limited;

  try {
    const raw: unknown = await request.json().catch(() => null);
    const b = (raw ?? {}) as PollBody;

    const pollId = typeof b.pollId === "string" ? b.pollId.trim() : "";
    const clientId = typeof b.clientId === "string" ? b.clientId.trim() : "";
    const closed = b.closed === true;

    if (!POLL_ID_RE.test(pollId)) {
      return NextResponse.json(
        { error: "Manjka ali neveljaven ID ankete" },
        { status: 400 }
      );
    }
    if (!CLIENT_ID_RE.test(clientId)) {
      return NextResponse.json(
        { error: "Manjka ali neveljaven identifikator obiskovalca" },
        { status: 400 }
      );
    }

    const poll = await db.tripPoll.findUnique({
      where: { id: pollId },
      select: { authorClientId: true },
    });
    if (!poll) {
      return NextResponse.json({ error: "Anketa ne obstaja" }, { status: 404 });
    }

    // Samo avtor ankete lahko zaključi/odpre
    if (poll.authorClientId !== clientId) {
      return NextResponse.json(
        { error: "Samo avtor ankete jo lahko zaključi ali znova odpre" },
        { status: 403 }
      );
    }

    const updated = await db.tripPoll.update({
      where: { id: pollId },
      data: { closed },
      select: {
        id: true,
        question: true,
        options: true,
        authorName: true,
        closed: true,
        createdAt: true,
        authorClientId: true,
      },
    });

    return NextResponse.json({
      success: true,
      poll: await toDTO(updated, clientId),
    });
  } catch (error) {
    console.error("[poll] PATCH napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri posodabljanju ankete" },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE — izbriši anketo z glasovi (samo avtor)
// ============================================================================
export async function DELETE(request: Request) {
  const limited = rateLimit(request, {
    limit: 30,
    windowMs: HOUR_MS,
    key: "poll-delete",
  });
  if (limited) return limited;

  try {
    const raw: unknown = await request.json().catch(() => null);
    const b = (raw ?? {}) as PollBody;

    const pollId = typeof b.pollId === "string" ? b.pollId.trim() : "";
    const clientId = typeof b.clientId === "string" ? b.clientId.trim() : "";

    if (!POLL_ID_RE.test(pollId)) {
      return NextResponse.json(
        { error: "Manjka ali neveljaven ID ankete" },
        { status: 400 }
      );
    }
    if (!CLIENT_ID_RE.test(clientId)) {
      return NextResponse.json(
        { error: "Manjka ali neveljaven identifikator obiskovalca" },
        { status: 400 }
      );
    }

    const poll = await db.tripPoll.findUnique({
      where: { id: pollId },
      select: { authorClientId: true },
    });
    if (!poll) {
      return NextResponse.json({ error: "Anketa ne obstaja" }, { status: 404 });
    }

    if (poll.authorClientId !== clientId) {
      return NextResponse.json(
        { error: "Samo avtor ankete jo lahko izbriše" },
        { status: 403 }
      );
    }

    // Glasovi se pobrišejo prek Cascade
    await db.tripPoll.delete({ where: { id: pollId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[poll] DELETE napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri brisanju ankete" },
      { status: 500 }
    );
  }
}
