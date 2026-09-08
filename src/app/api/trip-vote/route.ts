import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

// ============================================================================
// TRIP VOTE — glasovanje obiskovalcev na lokacijah deljenega potovanja
// ============================================================================
//
// Skupinsko planiranje na /pot/[shareId]: vsak anonimni obiskovalec
// (voterId = client-generated ID brskalnika, 8–64 znakov) lahko poda
// glas za destination_id (locationKey) deljenega itinererja.
//
// Kontrakt (konsumira ga SharedTrip / 7-b frontend):
//   POST   /api/trip-vote   body { shareId, locationKey, voterId }
//                          → { success: true, count }   (idempotent insert)
//   DELETE /api/trip-vote   body { shareId, locationKey, voterId }
//                          → { success: true, count }   (nov count po brisanju)
//   GET    /api/trip-vote?shareId=xxx
//                          → { votes: Record<locationKey, count> }
//
// locationKey = destination_id lokacije iz itinererja (stabilen za trip).
// Unique([shareId, locationKey, voterId]) garantuje 1 glas = 1 obiskovalec
// na lokacijo — vstavljanje je idempotentno.
// ============================================================================

const HOUR_MS = 60 * 60_000;

/** Veljaven shareId (hex, max 32 znakov) — enak vzorec kot /pot stran. */
const SHARE_ID_RE = /^[a-z0-9]{1,32}$/;
/** Veljaven locationKey (destination_id: npr. "bled", "slovenj-gradec"). */
const LOCATION_KEY_RE = /^[a-zA-Z0-9_-]{1,64}$/;

interface VoteBody {
  shareId?: unknown;
  locationKey?: unknown;
  voterId?: unknown;
}

/** Skupni validacijski + fetch helper → veljavne vrednosti ali NextResponse. */
async function validateVoteBody(
  raw: unknown
): Promise<
  | {
      ok: true;
      shareId: string;
      locationKey: string;
      voterId: string;
    }
  | { ok: false; response: NextResponse }
> {
  const b = (raw ?? {}) as VoteBody;

  const shareId =
    typeof b.shareId === "string" ? b.shareId.trim().toLowerCase() : "";
  const locationKey =
    typeof b.locationKey === "string" ? b.locationKey.trim() : "";
  const voterId = typeof b.voterId === "string" ? b.voterId.trim() : "";

  if (!SHARE_ID_RE.test(shareId)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Manjka ali neveljaven ID deljenega potovanja (shareId)" },
        { status: 400 }
      ),
    };
  }

  if (!LOCATION_KEY_RE.test(locationKey)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Manjka ali neveljaven ključ lokacije (locationKey)" },
        { status: 400 }
      ),
    };
  }

  if (voterId.length < 8 || voterId.length > 64) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Manjka ali neveljaven identifikator glasovalca (8–64 znakov)" },
        { status: 400 }
      ),
    };
  }

  // Potovanje mora obstajati (preprečuje glasovanje na izmišljene tripe)
  const saved = await db.savedItinerary.findUnique({
    where: { shareId },
    select: { itinerary: true },
  });
  if (!saved) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Deljeno potovanje ne obstaja" },
        { status: 404 }
      ),
    };
  }

  // locationKey mora biti destinacija tega potovanja (preprečuje smeti v DB)
  let destinationIds = new Set<string>();
  try {
    const itinerary = JSON.parse(saved.itinerary) as {
      days?: { locations?: { destination_id?: unknown }[] }[];
    };
    for (const day of itinerary?.days ?? []) {
      for (const loc of day?.locations ?? []) {
        const id = loc?.destination_id;
        if (typeof id === "string" && id.trim()) destinationIds.add(id.trim());
      }
    }
  } catch {
    // Pokvarjen JSON — pripadnosti lokacije ne moremo preveriti
  }

  if (destinationIds.size > 0 && !destinationIds.has(locationKey)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Ta lokacija ni del tega potovanja" },
        { status: 400 }
      ),
    };
  }

  return { ok: true, shareId, locationKey, voterId };
}

/** Prešteje glasove za eno lokacijo na trip-u. */
async function countVotes(
  shareId: string,
  locationKey: string
): Promise<number> {
  return db.tripVote.count({ where: { shareId, locationKey } });
}

// ============================================================================
// POST — oddaj glas (idempotentno)
// ============================================================================
export async function POST(request: Request) {
  const limited = rateLimit(request, {
    limit: 60,
    windowMs: HOUR_MS,
    key: "trip-vote",
  });
  if (limited) return limited;

  try {
    const raw: unknown = await request.json().catch(() => null);
    const validated = await validateVoteBody(raw);
    if (!validated.ok) return validated.response;
    const { shareId, locationKey, voterId } = validated;

    // Idempotent insert: ob unique konfliktu (P2002) glas že obstaja — samo preštejmo
    try {
      await db.tripVote.create({
        data: { shareId, locationKey, voterId },
      });
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code !== "P2002") throw e;
    }

    const count = await countVotes(shareId, locationKey);
    return NextResponse.json({ success: true, count });
  } catch (error) {
    console.error("[trip-vote] POST napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri oddaji glasu" },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE — umakni glas
// ============================================================================
export async function DELETE(request: Request) {
  const limited = rateLimit(request, {
    limit: 60,
    windowMs: HOUR_MS,
    key: "trip-vote",
  });
  if (limited) return limited;

  try {
    const raw: unknown = await request.json().catch(() => null);
    const validated = await validateVoteBody(raw);
    if (!validated.ok) return validated.response;
    const { shareId, locationKey, voterId } = validated;

    await db.tripVote.deleteMany({
      where: { shareId, locationKey, voterId },
    });

    const count = await countVotes(shareId, locationKey);
    return NextResponse.json({ success: true, count });
  } catch (error) {
    console.error("[trip-vote] DELETE napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri umiku glasu" },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET — vsi glasovi za trip (locationKey → count)
// ============================================================================
export async function GET(request: Request) {
  const limited = rateLimit(request, {
    limit: 240,
    windowMs: HOUR_MS,
    key: "trip-vote",
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

    const grouped = await db.tripVote.groupBy({
      by: ["locationKey"],
      where: { shareId },
      _count: { _all: true },
    });

    const votes: Record<string, number> = {};
    for (const g of grouped) votes[g.locationKey] = g._count._all;

    return NextResponse.json({ votes });
  } catch (error) {
    console.error("[trip-vote] GET napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pridobivanju glasov" },
      { status: 500 }
    );
  }
}
