import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import {
  generateTripItineraryPdf,
  type TripItineraryPdfReservation,
  type TripPdfLang,
} from "@/lib/pdf/trip-itinerary-pdf";
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
//
// M8+ (Issue #6 / D6-B): ?lang=en — izvoz v ANGLEŠČINI (vsota STRINGS v
// generatorju + Intl en-GB). Veljavni sta SAMO "sl" (privzeto) in "en";
// vsako drugo vrednost (vključno z musasto) spodrsne v privzeti "sl" —
// arbitrirne vrednosti NIKOLI ne potujejo v generator.
//
// M8+ (D6-B): CONFIRMED rezervacije poti (JourneyBooking.veza = shareId,
// ISTI vir kot bookingList v /api/trip/[shareId]) se izpišejo v razdelku
// "Rezervacije" — provider + št. + status; importData parsamo strežniško in
// izpišemo SAMO prikazna polja (providerName/številka — brez contact/notes,
// isti §23 kanon kot bookings odgovori).
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

    // M8+ (D6-B): jezik izvoza — belisted DOVOLJENIH vrednosti ("sl" je
    // privzet; vse ostalo, razen "en", spodrsne v "sl").
    const { searchParams } = new URL(request.url);
    const langParam = searchParams.get("lang");
    const lang: TripPdfLang = langParam === "en" ? "en" : "sl";

    // M8+ (D6-B): SAMO CONFIRMED rezervacije te poti (veza shareId — čista,
    // isto polje kot bookingList agregator). Prikazna preslikava poteka TUKAJ
    // (surovi importData nikoli ne potuje v generator).
    const bookingRows = await db.journeyBooking.findMany({
      where: { shareId, status: "CONFIRMED" },
      select: {
        provider: true,
        providerBookingId: true,
        importData: true,
        status: true,
      },
      orderBy: { createdAt: "asc" },
      take: 20,
    });
    const reservations: TripItineraryPdfReservation[] = bookingRows.map(
      (b) => {
        // Prikazna polja iz uvoženih podatkov (§23: brez contact/notes).
        // Pokvarjen JSON NE sesuje izvoza — preprosto ni prikaznega imena
        // (fallback na provider slug), nič se ne izumi.
        let providerName: string | null = null;
        let importNumber: string | null = null;
        if (b.importData) {
          try {
            const d = JSON.parse(b.importData) as Record<string, unknown>;
            providerName =
              typeof d.providerName === "string"
                ? d.providerName.slice(0, 100)
                : null;
            importNumber =
              typeof d.reservationNumber === "string"
                ? d.reservationNumber.slice(0, 60)
                : null;
          } catch {
            // pokvarjen importData → samo kanonična polja zapisa
          }
        }
        return {
          provider: providerName ?? b.provider,
          // providerBookingId je atestirana številka (provider oz. uporabniško
          // potrjen dokument) — prednost pred surovo parse-vrednostjo.
          reservationNumber: b.providerBookingId ?? importNumber,
          status: b.status,
        };
      }
    );

    const bytes = await generateTripItineraryPdf(
      {
        name: saved.name,
        shareId,
        itinerary,
        createdAt: saved.createdAt?.toISOString() ?? null,
        reservations,
      },
      lang
    );

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
