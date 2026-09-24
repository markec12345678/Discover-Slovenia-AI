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
import {
  computeTripBudgetSummary,
  groupSizeFromFormData,
} from "@/lib/trip-budget";
import type { DayPlan } from "@/lib/types";

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

/** ISSUE #4 §14 (val 3): dnevi načrta iz JSON (samo za cost-truth vsote). */
function parseItineraryDays(raw: string): DayPlan[] {
  try {
    const parsed = JSON.parse(raw) as { days?: unknown };
    if (!Array.isArray(parsed.days)) return [];
    return parsed.days as DayPlan[];
  } catch {
    return [];
  }
}

/** ISSUE #4 §14 (val 3): budgetValidation iz JSON (null za stare pote). */
function parseBudgetValidation(
  raw: string
): Parameters<typeof computeTripBudgetSummary>[1] {
  try {
    const parsed = JSON.parse(raw) as { budgetValidation?: unknown };
    const bv = parsed.budgetValidation;
    if (typeof bv !== "object" || bv === null) return null;
    return bv as Parameters<typeof computeTripBudgetSummary>[1];
  } catch {
    return null;
  }
}

/** ISSUE #4 §4 (val 3): prikazni povzetek uvožene rezervacije (brez
 *  contact/notes — javni odgovor ne razkriva zasebnih podatkov). */
function bookingSummaryOf(
  importData: string | null
): {
  providerName: string | null;
  reservationNumber: string | null;
  startDateTime: string | null;
  locationName: string | null;
  guestName: string | null;
  cancellationDeadline: string | null;
} {
  const empty = {
    providerName: null,
    reservationNumber: null,
    startDateTime: null,
    locationName: null,
    guestName: null,
    cancellationDeadline: null,
  };
  if (!importData) return empty;
  try {
    const d = JSON.parse(importData) as Record<string, unknown>;
    const s = (k: string) =>
      typeof d[k] === "string" ? (d[k] as string).slice(0, 200) : null;
    return {
      providerName: s("providerName"),
      reservationNumber: s("reservationNumber"),
      startDateTime: s("startDateTime"),
      locationName: s("locationName"),
      guestName: s("guestName"),
      cancellationDeadline: s("cancellationDeadline"),
    };
  } catch {
    return empty;
  }
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
      formData,
      guide,
      commentCount,
      likeCount,
      voteCount,
      pollCount,
      diaryCount,
      bookings,
      expenses,
      documents,
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
      db.savedItinerary.findUnique({
        where: { shareId },
        select: { formData: true },
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
        select: {
          status: true,
          source: true,
          confirmedPrice: true,
          currency: true,
          provider: true,
          providerProductId: true,
          providerBookingId: true,
          importData: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: "asc" },
        take: 100,
      }),
      db.tripExpense.findMany({
        where: { shareId },
        select: { kind: true, amountEur: true },
        take: 200,
      }),
      // ISSUE #4 §15 (val 4): dokumenti poti (metapodatki — javna polja
      // brez avtorjevega clientId; isti izris kot /pot plošča).
      db.tripDocument.findMany({
        where: { shareId },
        select: {
          id: true,
          type: true,
          format: true,
          source: true,
          title: true,
          note: true,
          url: true,
          bookingId: true,
          dayIndex: true,
          authorName: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
        take: 100,
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
      // ISSUE #4 §4 (val 3): osnutki (parsan dokument čaka potrditev).
      draft: bookings.filter((b) => b.status === "DRAFT").length,
      // Preostli statusi (PENDING/FAILED/...) se ne povprečijo — samo
      // kategorije, ki jih UI dejansko izrisuje.
    };

    // ISSUE #4 §14 (val 3): PRORAČUN — 5 vedric resnice, izračunano
    // strežniško (ista čista plast kot UI). planned iz JSON (ocena),
    // booked/paid iz uporabnikovih zapisov (denar). groupSize iz formData
    // (PlannerInput — prej nikoli ni prišel do /pot).
    const itineraryDays = parseItineraryDays(savedFull.itinerary);
    const budgetValidation = parseBudgetValidation(savedFull.itinerary);
    const budget = computeTripBudgetSummary(
      itineraryDays,
      budgetValidation,
      bookings.map((b) => ({
        status: b.status,
        source: b.source,
        confirmedPrice: b.confirmedPrice,
        currency: b.currency,
      })),
      expenses.map((e) => ({ kind: e.kind, amountEur: e.amountEur })),
      groupSizeFromFormData(formData?.formData ?? null)
    );

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
      // ISSUE #4 §4 (val 3): seznam rezervacij (omejena polja — importData
      // PARSIRAMO in vrnemo SAMO prikazna polja, brez contact/notes v
      // javnem odgovoru; podrobnosti dostopne prek bookings GET iste poti).
      bookingList: bookings.map((b) => ({
        provider: b.provider,
        providerProductId: b.providerProductId,
        status: b.status,
        source: b.source,
        providerBookingId: b.providerBookingId,
        confirmedPrice: b.confirmedPrice,
        currency: b.currency,
        summary: bookingSummaryOf(b.importData),
        createdAt: b.createdAt.toISOString(),
        updatedAt: b.updatedAt.toISOString(),
      })),
      // ISSUE #4 §14 (val 3): proračun poti (5 vedric — planned ocena,
      // booked/paid denar, perPerson samo ob znani skupini).
      budget,
      // ISSUE #4 §15 (val 4): seznam dokumentov poti (type/source/createdAt
      // + povezava na rezervacijo — §15 zahtevana polja v agregatorju).
      documents: documents.map((doc) => ({
        id: doc.id,
        type: doc.type,
        format: doc.format,
        source: doc.source,
        title: doc.title,
        note: doc.note,
        url: doc.url,
        bookingId: doc.bookingId,
        dayIndex: doc.dayIndex,
        authorName: doc.authorName,
        createdAt: doc.createdAt.toISOString(),
      })),
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
