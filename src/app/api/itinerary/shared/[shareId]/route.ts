import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit-log";
import { sanitizeItinerary } from "@/lib/itinerary-sanitize";
import { revalidateSavedItinerarySupply } from "@/lib/supply/itinerary-validation";
import {
  resolveTripRole,
  roleAtLeast,
  SHARE_ID_RE,
  type TripSession,
} from "@/lib/trip-permissions";

// ============================================================================
// GET   /api/itinerary/shared/[shareId] — javni ogled deljenega itinererja
// PATCH /api/itinerary/shared/[shareId] — ISSUE #4 §13 (val 2): prvi
//        MUTABILNI endpoint vsebine poti (vloga ≥ EDITOR + CAS).
// ============================================================================
// GET: poveča števec ogledov (views) in vrne itinerer BREZ formData
// (vhodni podatki načrtovalnika so zasebni). Zasebna pot (isPublic=false)
// zahteva vlogo ≥ VIEWER (seja ali editToken glava) — drugače 404 (NE 403:
// preklicana javna povezava NE sme potrditi obstoja poti).
//
// PATCH (sočasno urejanje — compare-and-swap, ISTI vzorec kot JourneyBooking
// PATCH :448-459, dokazan):
//   body { baseVersion: number, name?: string, itinerary?: Itinerary }
//   → { success, contentVersion, updatedAt }
//   konflikt (baseVersion ≠ strežnikova) → 409 { currentVersion, updatedAt }
//   — klient lahko ponovno naloži in izbere (NE tiho prepišemo tuče).
//
// Varnost vsebine: ISTA veriga kot POST /api/itinerary/save —
// sanitizeItinerary (shape guard, type confusion) +
// revalidateSavedItinerarySupply (kanonska supply avtoriteta) + 200 KB cap.
// F5.7 (PWA offline): ?warm=1 ne šteje ogleda.
// ============================================================================

const HOUR_MS = 60 * 60_000;

// ISSUE #4 §22 (val 5): največje število ohranjenih revizij na pot.
// 20 × 200 KB kap vsebine = zgornja meja prostora na pot (~4 MB worst
// case, tipično 10–50 KB na revizijo). Oddaljene počisti zapisovalna
// pot PATCH-a (retencija nad verzijo, ne createdAt — deterministično).
const TRIP_REVISIONS_KEEP = 20;

async function readEditTokenAndSession(
  request: Request
): Promise<{ editToken: string | null; session: TripSession | null }> {
  const editToken = request.headers.get("x-dsa-edit-token");
  let session: TripSession | null = null;
  try {
    session = (await getServerSession(authOptions)) as TripSession | null;
  } catch {
    // napaka seje = anonimno
  }
  return { editToken, session };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  // Rate limit ogledov deljenih itinererjev
  const limited = rateLimit(request, {
    limit: 120,
    windowMs: 60 * 60_000,
    key: "itinerary-shared",
  });
  if (limited) return limited;

  try {
    const { shareId } = await params;

    if (!shareId || shareId.length > 32) {
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
        views: true,
        isPublic: true,
        // TASK 28 (live-sync): verzija poti v odgovoru (additivno — stari
        // klienti prezrejo) → načrtovalnik po osvežitvi pozna CAS bazo.
        contentVersion: true,
      },
    });

    if (!saved) {
      return NextResponse.json(
        { error: "Itinerer ne obstaja" },
        { status: 404 }
      );
    }

    // ISSUE #4 §13: zasebna pot → zahtevaj vlogo ≥ VIEWER (drugače 404 —
    // obstoj ostane skrit). Ogrevanje offline predpomnilnika (lastnikova
    // naprava tik ob shranitvi) pošilja isti editToken glavo.
    if (!saved.isPublic) {
      const { editToken, session } = await readEditTokenAndSession(request);
      const { role } = await resolveTripRole(shareId, { editToken, session });
      if (!roleAtLeast(role, "VIEWER")) {
        return NextResponse.json(
          { error: "Itinerer ne obstaja" },
          { status: 404 }
        );
      }
    }

    // Inkrementiraj števec ogledov (ne-critical — napaka se tiho ignorira).
    // ?warm=1 (offline predpomnilnik) NE šteje — ni pravi ogled.
    const isWarm =
      new URL(request.url).searchParams.get("warm") === "1";
    if (!isWarm) {
      try {
        await db.savedItinerary.update({
          where: { shareId },
          data: { views: { increment: 1 } },
        });
      } catch (e) {
        console.error("[itinerary/shared] views increment napaka:", e);
      }
    }

    // Parse itinererja — neveljaven JSON ne sme sesuti celotnega odgovora
    let itinerary: unknown;
    try {
      itinerary = JSON.parse(saved.itinerary);
    } catch {
      return NextResponse.json(
        { error: "Shranjeni itinerer je pokvarjen" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      name: saved.name,
      itinerary,
      createdAt: saved.createdAt.toISOString(),
      views: isWarm ? saved.views : saved.views + 1,
      // TASK 28 (live-sync): additivno — baza za CAS po ponovnem odprtu.
      contentVersion: saved.contentVersion,
    });
  } catch (error) {
    console.error("[itinerary/shared] GET napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pridobivanju itinererja" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH — vsebina poti (ime + itinerer) z optimističnim zaklepom
// ---------------------------------------------------------------------------

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  const limited = rateLimit(request, {
    limit: 60,
    windowMs: HOUR_MS,
    key: "itinerary-shared-patch",
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

    const { editToken, session } = await readEditTokenAndSession(request);
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
      return NextResponse.json(
        {
          error:
            "Vsebino poti lahko ureja le lastnik ali urednik (povabljen z vlogo urejanja).",
        },
        { status: 403 }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Neveljavno telo zahteve" }, { status: 400 });
    }

    const baseVersion = body.baseVersion;
    if (typeof baseVersion !== "number" || !Number.isInteger(baseVersion) || baseVersion < 0) {
      return NextResponse.json(
        { error: "Manjka ali neveljavna baseVersion (optimistični zaklep)" },
        { status: 400 }
      );
    }

    // Ime (opcijsko) — ista pravila kot save.
    const nameRaw = typeof body.name === "string" ? body.name.trim() : "";
    const name = nameRaw ? nameRaw.slice(0, 120) : null;
    if (!("itinerary" in body) && !nameRaw) {
      return NextResponse.json(
        { error: "Nič za spremembo — podaj name in/ali itinerary" },
        { status: 400 }
      );
    }

    // Itinerer (opcijsko) — ISTA varnostna veriga kot save (shape guard +
    // supply revalidacija + kap velikosti). Nič klientovega ne zaupamo.
    let itineraryJson: string | null = null;
    if ("itinerary" in body) {
      const sanitized = sanitizeItinerary(body.itinerary);
      if (sanitized.days.length === 0) {
        return NextResponse.json(
          { error: "Itinerer nima veljavnih dni/lokacij" },
          { status: 400 }
        );
      }
      const supplyChecked = revalidateSavedItinerarySupply(sanitized, "sl");
      if (supplyChecked.report.rejected > 0) {
        console.warn(
          `[itinerary/shared PATCH] supply revalidacija: ODSTRANJENIH ${supplyChecked.report.rejected} fabrikantrnih supply postankov`
        );
      }
      itineraryJson = JSON.stringify(supplyChecked.itinerary);
      if (itineraryJson.length >= 200_000) {
        return NextResponse.json(
          { error: "Itinerer je prevelik" },
          { status: 400 }
        );
      }
    }

    // ── COMPARE-AND-SWAP (dokazan vzorec JourneyBooking PATCH) ───────────
    // Pogojeni zapis: če je katerikoli drugi urejevalec med tem povečal
    // contentVersion, updateMany ne zadene vrstice → 409 s strežnikovo
    // verzijo (klient odloči: ponovno naloži / zlije).
    const data: Record<string, unknown> = {
      contentVersion: { increment: 1 },
    };
    if (itineraryJson !== null) data.itinerary = itineraryJson;
    if (name !== null) data.name = name;

    // ISSUE #4 §22 (val 5): revizija STARE vsebine PRED zamenjavo. Beremo
    // vrstico PRED CAS (če CAS zadene, je prebrana vsebina po verzijah
    // nujno tista, ki jo ZAMENJUJEMO — verzije se samo povečujejo).
    // Name-only spremembe NE delajo revizije (vsebina se ni zamenjala).
    const prePatch =
      itineraryJson !== null
        ? await db.savedItinerary.findUnique({
            where: { shareId },
            select: { itinerary: true, name: true, contentVersion: true },
          })
        : null;

    const result = await db.savedItinerary.updateMany({
      where: { shareId, contentVersion: baseVersion },
      data,
    });

    if (result.count === 0) {
      // Konflikt — vrni strežnikovo resnico (retry/merge odloči klient).
      const current = await db.savedItinerary.findUnique({
        where: { shareId },
        select: { contentVersion: true, updatedAt: true },
      });
      await logAudit({
        actorId: session?.user?.id ?? undefined,
        actorRole: editToken ? "edit-token-owner" : "user",
        action: AUDIT_ACTIONS.TRIP_CONTENT_CONFLICT,
        resourceType: "trip",
        resourceId: shareId,
        metadata: { baseVersion, role },
      });
      return NextResponse.json(
        {
          error:
            "Pot je bila med tem spremenjena (sočasno urejanje) — osveži podatke in poskusi znova.",
          conflict: true,
          currentVersion: current?.contentVersion ?? null,
          serverUpdatedAt: current?.updatedAt.toISOString() ?? null,
        },
        { status: 409 }
      );
    }

    const updated = await db.savedItinerary.findUnique({
      where: { shareId },
      select: { contentVersion: true, updatedAt: true, name: true },
    });

    // ISSUE #4 §22 (val 5): USPELA zamenjava vsebine → zapiši revizijo
    // stare vsebine (undo na strežniku). FAIL-OPEN: napaka zapisa revizije
    // NE sesuje uspelega PATCH-a (vsebina JE zamenjana) — iskreno
    // zapišemo revisionSaved:false v odgovor + audit + dnevnik.
    let revisionSaved = false;
    if (prePatch && prePatch.itinerary) {
      try {
        await db.savedItineraryRevision.create({
          data: {
            shareId,
            // Verzija, ki jo ZAMENJUJEMO (prebrana pred CAS — vsebina, ki
            // je bila aktivna, dokler je baseVersion veljal).
            version: baseVersion,
            itinerary: prePatch.itinerary,
            name: prePatch.name,
            authorId: session?.user?.id ?? null,
            authorRole: editToken ? "edit-token-owner" : "user",
          },
        });
        revisionSaved = true;

        // Retencija: ohrani največ TRIP_REVISIONS_KEEP zadnjih revizij
        // (oddaljene počisti — omejen prostor, spodaj je vedno samo
        // nedavna zgodovina; §22 minimalni "restore prejšnje verzije").
        const keep = await db.savedItineraryRevision.findMany({
          where: { shareId },
          orderBy: { version: "desc" },
          skip: TRIP_REVISIONS_KEEP,
          take: 1,
          select: { version: true },
        });
        if (keep.length > 0) {
          await db.savedItineraryRevision.deleteMany({
            where: { shareId, version: { lt: keep[0].version } },
          });
        }
      } catch (revError) {
        console.error(
          "[itinerary/shared PATCH] §22 revizija ni zapisana (fail-open):",
          revError
        );
      }
    }

    await logAudit({
      actorId: session?.user?.id ?? undefined,
      actorRole: editToken ? "edit-token-owner" : "user",
      action: AUDIT_ACTIONS.TRIP_CONTENT_UPDATED,
      resourceType: "trip",
      resourceId: shareId,
      metadata: {
        baseVersion,
        newVersion: updated?.contentVersion,
        role,
        changedItinerary: itineraryJson !== null,
        changedName: name !== null,
        // §22: ali je bila stara vsebina arhivirana (revizija) — iskren
        // dokaz undo-varnosti tega PATCH-a.
        revisionSaved,
      },
    });

    return NextResponse.json({
      success: true,
      shareId,
      contentVersion: updated?.contentVersion,
      updatedAt: updated?.updatedAt.toISOString(),
      name: updated?.name,
      // §22: dodano (additive) — klienti ≤1.96 ga prezrejo.
      revisionSaved,
    });
  } catch (error) {
    console.error("[itinerary/shared] PATCH napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri shranjevanju vsebine poti" },
      { status: 500 }
    );
  }
}
