import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit-log";
import {
  resolveTripRole,
  roleAtLeast,
  SHARE_ID_RE,
  type TripRole,
  type TripSession,
} from "@/lib/trip-permissions";

// ============================================================================
// GET  /api/trip/[shareId] — ISSUE #4 §2: ENOTEN BRALNI OBJEKT POTI
// PATCH /api/trip/[shareId] — ISSUE #4 §13: nastavitve poti (isPublic)
// ============================================================================
// Agregator (0 novih težkih modelov, 0 podvajanja): vrne povzetek načrta +
// skupnostne številke + rezervacije + verzijo + vlogo klicalca; sodelujoče
// vidi SAMO lastnik (nikoli javnosti). Vsebina (full itinerer) ostane na
// edinem viru GET /api/itinerary/shared/[shareId] — ta agregator je glava
// in stanje poti, ne kopija vsebine.
//
// Vloga klicalca: editToken prek glave "x-dsa-edit-token" (NE prek URLja —
// žetona ne pišemo v zgodovino brskalnika) + seja B2C računa.
//
// ISKRENOST: številke so ONLY dejanske skupne vsote (groupBy/count); nič
// ni izmišljeno. isPublic=false → 404 za obiskovalce brez vloge (enako
// kot /pot stran — link sharing revoked pomeni NEVIDNOST, ne 403 ki bi
// potrdil obstoj).
// ============================================================================

const HOUR_MS = 60 * 60_000;

/** Povzetek načrta iz JSON (NE razkriva vsebine — samo števci/vidno). */
interface PlanSummary {
  days: number;
  stops: number;
  firstDayIso: string | null;
  lastDayIso: string | null;
  totalBudget: number | null;
  weatherEstimatedDays: number | null;
  hasGuide: boolean;
}

function summarizePlan(raw: string): PlanSummary | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const it = parsed as {
    days?: unknown;
    total_budget?: unknown;
    tripStartDate?: unknown;
    tripEndDate?: unknown;
  };
  if (typeof it !== "object" || it === null || !Array.isArray(it.days)) {
    return null;
  }
  let stops = 0;
  let estimatedDays = 0;
  let dayCount = 0;
  for (const d of it.days as Array<Record<string, unknown>>) {
    if (typeof d !== "object" || d === null) continue;
    dayCount++;
    const locs = d.locations;
    if (Array.isArray(locs)) stops += locs.length;
    if (d.weatherEstimated === true) estimatedDays++;
  }
  return {
    days: dayCount,
    stops,
    firstDayIso:
      typeof it.tripStartDate === "string" ? it.tripStartDate : null,
    lastDayIso: typeof it.tripEndDate === "string" ? it.tripEndDate : null,
    totalBudget:
      typeof it.total_budget === "number" && Number.isFinite(it.total_budget)
        ? it.total_budget
        : null,
    // weatherEstimatedDays: koliko dni ima oceno vremena (K-2 marker);
    // null pomeni "stara pot brez markerjev" (iskreno — ne ugibamo).
    weatherEstimatedDays: estimatedDays > 0 ? estimatedDays : null,
    hasGuide: false,
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  const limited = rateLimit(request, {
    limit: 240,
    windowMs: HOUR_MS,
    key: "trip-aggregate",
  });
  if (limited) return limited;

  try {
    const { shareId } = await params;
    if (!SHARE_ID_RE.test(shareId)) {
      return NextResponse.json({ error: "Neveljaven ID poti" }, { status: 400 });
    }

    // Vloga: editToken glava + seja (ista resolucija kot vse §13 rute).
    const editToken = request.headers.get("x-dsa-edit-token");
    let session: TripSession | null = null;
    try {
      session = (await getServerSession(authOptions)) as TripSession | null;
    } catch {
      // napaka seje = anonimni klic
    }
    const { role, saved } = await resolveTripRole(shareId, {
      editToken,
      session,
    });

    if (!saved) {
      return NextResponse.json(
        { error: "Deljeno potovanje ne obstaja" },
        { status: 404 }
      );
    }

    // Zasebna pot + brez vloge → 404 (NE 403 — obstoj poti ostane skrit).
    if (role === "NONE") {
      return NextResponse.json(
        { error: "Deljeno potovanje ne obstaja" },
        { status: 404 }
      );
    }

    // ── Agregacija (vzporedno, ena runda poizvedb) ──────────────────────
    const [
      savedFull,
      guide,
      commentCount,
      likeCount,
      voteCount,
      pollCount,
      diaryCount,
      bookings,
    ] = await Promise.all([
      db.savedItinerary.findUnique({
        where: { shareId },
        select: {
          name: true,
          itinerary: true,
          views: true,
          isPublic: true,
          contentVersion: true,
          updatedAt: true,
          createdAt: true,
        },
      }),
      db.tripGuide.findUnique({
        where: { shareId },
        select: { authorName: true, lang: true },
      }),
      db.tripComment.count({ where: { shareId } }),
      db.tripLike.count({ where: { shareId } }),
      db.tripVote.count({ where: { shareId } }),
      db.tripPoll.count({ where: { shareId } }),
      db.tripDiaryEntry.count({ where: { shareId } }),
      db.journeyBooking.findMany({
        where: { shareId },
        select: { status: true },
      }),
    ]);

    if (!savedFull) {
      return NextResponse.json(
        { error: "Deljeno potovanje ne obstaja" },
        { status: 404 }
      );
    }

    const plan = summarizePlan(savedFull.itinerary);
    if (plan) plan.hasGuide = guide != null;

    const bookingSummary = {
      total: bookings.length,
      external: bookings.filter((b) => b.status === "EXTERNAL").length,
      selected: bookings.filter((b) => b.status === "SELECTED").length,
      confirmed: bookings.filter(
        (b) => b.status === "CONFIRMED" || b.status === "PAID"
      ).length,
      // Preostli statusi (PENDING/FAILED/...) se ne povprečijo — samo
      // kategorije, ki jih UI dejansko izrisuje.
    };

    // Sodelujoči: SAMO lastnik (seznam ljudi NI javen podatek).
    let collaborators: unknown[] | undefined;
    if (role === "OWNER") {
      const rows = await db.tripCollaborator.findMany({
        where: { shareId },
        select: {
          id: true,
          role: true,
          status: true,
          inviteEmail: true,
          userId: true,
          invitedBy: true,
          createdAt: true,
          acceptedAt: true,
        },
        orderBy: { createdAt: "asc" },
        take: 50,
      });
      // Dopolni z e-pošto/uporabniškim imenom računa (samo lastniku).
      const userIds = rows
        .map((r) => r.userId)
        .filter((u): u is string => typeof u === "string");
      const users = userIds.length
        ? await db.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, email: true, name: true },
          })
        : [];
      collaborators = rows.map((r) => {
        const u = users.find((x) => x.id === r.userId);
        return {
          ...r,
          accountEmail: u?.email ?? null,
          accountName: u?.name ?? null,
          canRevoke: r.status !== "REVOKED",
        };
      });
    }

    return NextResponse.json({
      success: true,
      shareId,
      role,
      isPublic: saved.isPublic,
      name: savedFull.name,
      views: savedFull.views,
      version: {
        contentVersion: savedFull.contentVersion,
        updatedAt: savedFull.updatedAt.toISOString(),
        createdAt: savedFull.createdAt.toISOString(),
      },
      plan,
      guide: guide
        ? { exists: true, authorName: guide.authorName, lang: guide.lang }
        : { exists: false },
      community: {
        comments: commentCount,
        likes: likeCount,
        votes: voteCount,
        polls: pollCount,
        diaryEntries: diaryCount,
      },
      bookings: bookingSummary,
      ...(collaborators !== undefined ? { collaborators } : {}),
    });
  } catch (error) {
    console.error("[trip/aggregate] GET napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pridobivanju poti" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/trip/[shareId] — nastavitve poti (samo lastnik)
// ---------------------------------------------------------------------------

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  const limited = rateLimit(request, {
    limit: 30,
    windowMs: HOUR_MS,
    key: "trip-settings",
  });
  if (limited) return limited;

  try {
    const { shareId } = await params;
    if (!SHARE_ID_RE.test(shareId)) {
      return NextResponse.json({ error: "Neveljaven ID poti" }, { status: 400 });
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Neveljavno telo zahteve" }, { status: 400 });
    }

    const editToken = request.headers.get("x-dsa-edit-token");
    let session: TripSession | null = null;
    try {
      session = (await getServerSession(authOptions)) as TripSession | null;
    } catch {
      // anonimno
    }
    const { role, saved } = await resolveTripRole(shareId, {
      editToken,
      session,
    });
    if (!saved) {
      return NextResponse.json(
        { error: "Deljeno potovanje ne obstaja" },
        { status: 404 }
      );
    }
    if (role !== "OWNER") {
      return NextResponse.json(
        {
          error:
            "Nastavitve poti lahko spreminja le lastnik (odpri povezavo v brskalniku, kjer si pot shranil, ali se prijavi z računom lastnika).",
        },
        { status: 403 }
      );
    }

    // Edina nastavitev tega vala: javna/zasebna povezava.
    if (typeof body.isPublic !== "boolean" || Object.keys(body).length !== 1) {
      return NextResponse.json(
        { error: "Podprto telo: { isPublic: boolean }" },
        { status: 400 }
      );
    }
    const isPublic = body.isPublic;

    // VAROVALKA PRED ZAKLEPOM: izklop javnosti zahteva RAČUN lastnika
    // (editToken živi samo v brskalniku — anonimni lastnik zasebne poti si
    // sam zapre vrata in je ne more več odpreti za nastavitev nazaj).
    if (!isPublic && saved.userId == null) {
      return NextResponse.json(
        {
          error:
            "Zasebni način zahteva lastniški račun — najprej se prijavi in prevzami pot (Moja potovanja → Prevzemi), nato lahko izklopiš javno povezavo.",
        },
        { status: 409 }
      );
    }

    await db.savedItinerary.update({
      where: { shareId },
      data: { isPublic },
    });

    await logAudit({
      actorId: saved.userId ?? undefined,
      actorRole:
        saved.userId != null && session?.user?.id === saved.userId
          ? "user"
          : "edit-token-owner",
      action: AUDIT_ACTIONS.TRIP_LINK_SHARING_CHANGED,
      resourceType: "trip",
      resourceId: shareId,
      metadata: { isPublic },
    });

    return NextResponse.json({
      success: true,
      shareId,
      isPublic,
      role: "OWNER" satisfies TripRole,
    });
  } catch (error) {
    console.error("[trip/settings] PATCH napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri shranjevanju nastavitev" },
      { status: 500 }
    );
  }
}
