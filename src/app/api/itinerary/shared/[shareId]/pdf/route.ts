import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { generateTripItineraryPdf } from "@/lib/pdf/trip-itinerary-pdf";
import {
  resolveTripRole,
  roleAtLeast,
  SHARE_ID_RE,
  type TripSession,
} from "@/lib/trip-permissions";
import type { Itinerary } from "@/lib/types";

// ============================================================================
// GET /api/itinerary/shared/[shareId]/pdf — M8 (Issue #5 / T5-D): PDF IZVOZ
// ============================================================================
// Deterministični A4 izvoz SHRANJENE poti (pdf-lib + Liberation Sans — č/š/ž,
// isti vzorec kot provizijski račun; večstransko z paginacijo + noga).
//
// Dostop — ISTA vrata kot GET /api/itinerary/shared/[shareId]:
//  · javna pot → vsak (z omejitvijo 30/uro na IP);
//  · zasebna pot → vloga ≥ VIEWER (editToken glava ali seja), drugače 404
//    (NE 403 — obstoj poti ostane skrit, enak "oracle" kanon kot vse poti);
//  · ogledov NE štejemo (izvoz dokumenta ni ogled strani).
//
// Offline/PWA: PDF potrebuje strežnik (kot PATCH) — brskalniški gumb
// "Natisni / Shrani kot PDF" ostaja offline rezerva. Iskrena omejitev,
// zapisana v FEATURE-FLAGS.md.
// ============================================================================

export const runtime = "nodejs"; // fs dostop do pisav

const HOUR_MS = 60 * 60_000;

/** Ime datoteke: ASCII transliteracija imena poti (č→c …) + shareId. */
function asciiSlug(name: string | null, shareId: string): string {
  const fold: Record<string, string> = {
    č: "c", š: "s", ž: "z", ć: "c", đ: "d", Č: "c", Š: "s", Ž: "z",
  };
  const base = (name ?? "")
    .replace(/[čšžćđČŠŽĆĐ]/g, (ch) => fold[ch] ?? ch)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base ? `pot-${base}-${shareId}` : `pot-${shareId}`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  // Izvoz je težji od JSON ogleda — strožja meja (30/uro na IP).
  const limited = rateLimit(request, {
    limit: 30,
    windowMs: HOUR_MS,
    key: "itinerary-shared-pdf",
  });
  if (limited) return limited;

  try {
    const { shareId } = await params;
    if (!SHARE_ID_RE.test(shareId)) {
      return NextResponse.json(
        { error: "Neveljaven ID itinererja" },
        { status: 400 }
      );
    }

    const saved = await db.savedItinerary.findUnique({
      where: { shareId },
      select: {
        name: true,
        itinerary: true,
        createdAt: true,
        isPublic: true,
      },
    });

    if (!saved) {
      return NextResponse.json(
        { error: "Itinerer ne obstaja" },
        { status: 404 }
      );
    }

    // Zasebna pot → vloga ≥ VIEWER (drugače 404 — obstoj ostane skrit).
    if (!saved.isPublic) {
      let session: TripSession | null = null;
      try {
        session = (await getServerSession(authOptions)) as TripSession | null;
      } catch {
        // napaka seje = anonimno
      }
      const editToken = request.headers.get("x-dsa-edit-token");
      const { role } = await resolveTripRole(shareId, { editToken, session });
      if (!roleAtLeast(role, "VIEWER")) {
        return NextResponse.json(
          { error: "Itinerer ne obstaja" },
          { status: 404 }
        );
      }
    }

    // Parse itinererja — pokvarjen JSON se ne sesuje v 500 brez besedila.
    let itinerary: Itinerary;
    try {
      itinerary = JSON.parse(saved.itinerary) as Itinerary;
    } catch {
      return NextResponse.json(
        { error: "Shranjeni itinerer je pokvarjen" },
        { status: 500 }
      );
    }
    if (!itinerary || !Array.isArray(itinerary.days)) {
      return NextResponse.json(
        { error: "Shranjeni itinerer je pokvarjen" },
        { status: 500 }
      );
    }

    const bytes = await generateTripItineraryPdf({
      name: saved.name,
      shareId,
      itinerary,
      createdAt: saved.createdAt?.toISOString() ?? null,
    });

    const fileName = asciiSlug(saved.name, shareId);
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        // attachment — izvoz je prenos (račun je inline, ker se odpre v zavihku)
        "Content-Disposition": `attachment; filename="${fileName}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[itinerary/shared/pdf] GET napaka:", error);
    return NextResponse.json(
      { error: "Izvoz PDF trenutno ni možen" },
      { status: 500 }
    );
  }
}
