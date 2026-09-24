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
  type TripSession,
} from "@/lib/trip-permissions";

// ============================================================================
// GET /api/itinerary/shared/[shareId]/revisions — ISSUE #4 §22 (val 5):
// ZGODOVINA REVIZIJ VSEBINE POTI (undo na strežniku).
// ============================================================================
// DVA načina (isti endpoint, ločena po ?version):
//   1. BREZ version → METAPODATKI zadnjih 20 revizij (verzija, datum,
//      staro ime, velikost) — LAHEK seznam za UI zgodovine. Vsebina NI
//      vključena (vsaka revizija je do 200 KB).
//   2. ?version=N → CELA vsebina te revizije (za obnovitev/predogled).
//
// VRATA (ista kot PATCH vsebine): vloga ≥ EDITOR (seja ali
// x-dsa-edit-token glava). VIEWER/anonimni → 404 pri zasebnih (obstoj
// skrit), 403 pri javnih (obstoj je javen, revizije pa so UREDNIŠKA
// površina — NE smemo jih razkriti).
//
// RESTORE = običajen PATCH /api/itinerary/shared/[shareId] s prebrano
// vsebino revizije (CAS + revizija trenutne vsebine + audit — NI nove
// write poti; obnovitev je sama po sebi urejanje, ki dela revizijo).
// ============================================================================

const HOUR_MS = 60 * 60_000;

// Isti retencijski kanon kot PATCH (zapisovalna pot čisti na 20; bralna
// pot nikoli ne vrne več — usklajena zgornja meja).
const REVISIONS_RETURN_LIMIT = 20;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  const limited = rateLimit(request, {
    limit: 60,
    windowMs: HOUR_MS,
    key: "itinerary-revisions",
  });
  if (limited) return limited;

  try {
    const { shareId } = await params;
    if (!shareId || !SHARE_ID_RE.test(shareId)) {
      return NextResponse.json(
        { error: "Neveljaven ID itinererja" },
        { status: 400 }
      );
    }

    const editToken = request.headers.get("x-dsa-edit-token");
    let session: TripSession | null = null;
    try {
      session = (await getServerSession(authOptions)) as TripSession | null;
    } catch {
      // napaka seje = anonimno
    }

    const { role, saved } = await resolveTripRole(shareId, {
      editToken,
      session,
    });
    if (!saved) {
      return NextResponse.json(
        { error: "Itinerer ne obstaja" },
        { status: 404 }
      );
    }
    if (!roleAtLeast(role, "EDITOR")) {
      // Zasebna pot: 404 (obstoj skrit — isto kot GET vsebine). Javna: 403
      // (obstoj je javen, revizije pa so uredniške — NE smemo razkriti).
      if (!saved.isPublic) {
        return NextResponse.json(
          { error: "Itinerer ne obstaja" },
          { status: 404 }
        );
      }
      return NextResponse.json(
        {
          error:
            "Zgodovino verzij lahko vidi le lastnik ali urednik (povabljen z vlogo urejanja).",
        },
        { status: 403 }
      );
    }

    const versionParam = new URL(request.url).searchParams.get("version");

    // ── Način 2: posamezna revizija (cela vsebina) ──────────────────────
    if (versionParam !== null) {
      const version = Number(versionParam);
      if (
        !Number.isInteger(version) ||
        version < 0 ||
        String(version) !== versionParam.trim()
      ) {
        return NextResponse.json(
          { error: "Neveljavna verzija revizije" },
          { status: 400 }
        );
      }
      const revision = await db.savedItineraryRevision.findFirst({
        where: { shareId, version },
        select: {
          version: true,
          itinerary: true,
          name: true,
          authorRole: true,
          createdAt: true,
        },
      });
      if (!revision) {
        return NextResponse.json(
          { error: "Revizija ne obstaja" },
          { status: 404 }
        );
      }
      let itinerary: unknown;
      try {
        itinerary = JSON.parse(revision.itinerary);
      } catch {
        return NextResponse.json(
          { error: "Shranjena revizija je pokvarjena" },
          { status: 500 }
        );
      }
      await logAudit({
        actorId: session?.user?.id ?? undefined,
        actorRole: editToken ? "edit-token-owner" : "user",
        action: AUDIT_ACTIONS.TRIP_REVISION_READ,
        resourceType: "trip",
        resourceId: shareId,
        metadata: { version, role },
      });
      return NextResponse.json({
        success: true,
        shareId,
        version: revision.version,
        name: revision.name,
        authorRole: revision.authorRole,
        createdAt: revision.createdAt.toISOString(),
        itinerary,
      });
    }

    // ── Način 1: metapodatki zgodovine (brez vsebine) ───────────────────
    const rows = await db.savedItineraryRevision.findMany({
      where: { shareId },
      orderBy: { version: "desc" },
      take: REVISIONS_RETURN_LIMIT,
      select: {
        version: true,
        name: true,
        authorRole: true,
        createdAt: true,
        // Vsebino izberemo SAMO za štetje velikosti (sizeBytes) — v
        // odgovoru NE vračamo itinerarja (lahki seznam).
        itinerary: true,
      },
    });

    const current = await db.savedItinerary.findUnique({
      where: { shareId },
      select: { contentVersion: true, updatedAt: true },
    });

    return NextResponse.json({
      success: true,
      shareId,
      currentVersion: current?.contentVersion ?? null,
      currentUpdatedAt: current?.updatedAt.toISOString() ?? null,
      // Metapodatki, NE vsebina.
      revisions: rows.map((r) => ({
        version: r.version,
        name: r.name,
        authorRole: r.authorRole,
        createdAt: r.createdAt.toISOString(),
        sizeBytes: r.itinerary.length,
      })),
    });
  } catch (error) {
    console.error("[itinerary/revisions] GET napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pridobivanju zgodovine verzij" },
      { status: 500 }
    );
  }
}
