import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import {
  resolveTripRole,
  SHARE_ID_RE,
  type TripSession,
} from "@/lib/trip-permissions";

// ============================================================================
// GET /api/trip/[shareId]/version — TASK 28 (Tier 1 #1): LAHKOTNA VERZIJA
// POTI ZA LIVE-SYNC INDIKATOR („Wanderlog model": prisotnost brez CRDT).
// ============================================================================
//
// Namen: odjemalec, ki ima odprto pot (/pot/[shareId] ali povezani načrt v
// načrtovalniku), vsakih ~20 s preveri SAMO contentVersion/updatedAt —
// če je strežniška verzija NOVEJŠA od lokalno znane, pokažemo banner
// „načrt je bil posodobljen drugje — Osveži". Ni ws/SSE infrastrukture,
// ni CRDT — 20 % kompleksnosti, 80 % vrednosti sodelovanja.
//
// ZAKAJ /api/trip/… in NE /api/itinerary/shared/…: service worker
// (public/sw.js) za /api/itinerary/shared/* uporablja network-first S
// offline fallbackom iz predpomnilnika — ob izgubi omrežja bi polling
// dobil STARI predpomnjenjeni odgovor in sprožil LAŽNI banner
// „posodobljeno". Pot /api/trip/* SW ne jemlje (splošni /api/ skip)
// → ob izgubi omrežja fetch pošteno PADE in odjemalec utihne.
//
// Zasebnost: ISTA disciplina kot vse §13 rute — zasebna pot (isPublic=false)
// brez vloge ≥ VIEWER vrne 404 (NE 403: obstoj poti ostane skrit).
// Ne šteje ogleda (brez views inkrementa) in ne piše audita (bralno-
// metapodatkovna polling ruta, ne dogodek).
//
// Omejitev: 600/h/IP na ključ "trip-version" (polling 20 s = 180/h/zavihek;
// pokriva ~3 sočasno odprte zavihke nad istim ali različnimi potmi).
// ============================================================================

const HOUR_MS = 60 * 60_000;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  const limited = rateLimit(request, {
    limit: 600,
    windowMs: HOUR_MS,
    key: "trip-version",
  });
  if (limited) return limited;

  try {
    const { shareId } = await params;
    if (!SHARE_ID_RE.test(shareId)) {
      return NextResponse.json({ error: "Neveljaven ID poti" }, { status: 400 });
    }

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

    // Zasebna pot brez vloge / neobstoječa pot — NEVIDNOST (404, ne 403).
    if (!saved || role === "NONE") {
      return NextResponse.json(
        { error: "Deljeno potovanje ne obstaja" },
        { status: 404 }
      );
    }

    // Metapodatka verzije SAMO (nič vsebine, nič imena — minimalen
    // odgovor za polling; resolveTripologija vrne vrstico brez verzije,
    // zato ena dodatna lahka poizvedba po unikatnem ključu).
    const meta = await db.savedItinerary.findUnique({
      where: { shareId },
      select: { contentVersion: true, updatedAt: true },
    });
    if (!meta) {
      return NextResponse.json(
        { error: "Deljeno potovanje ne obstaja" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      shareId,
      contentVersion: meta.contentVersion,
      updatedAt: meta.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error("[trip/version] GET napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pridobivanju verzije poti" },
      { status: 500 }
    );
  }
}
