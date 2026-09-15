import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";

// ============================================================================
// /api/user/trips — "Moja potovanja" (P1-2b)
// ============================================================================
// GET: shranjeni itinererji prijavljenega popotnika + osnovni podatki računa.
// Konzultacije (zasebni AI odgovori na e-pošto) se vrnejo SAMO, če je
// e-pošta potrjena (emailVerified) — sicer bi lahko tujec z registracijo na
// tujo e-pošto vpogledal v zgodovino konzultacij lastnika nabiralnika.
//
// Varnost: samo seje z accountType === "user" (B2C popotnik).
// B2B Owner seje so zavrnjene (403), brez seje 401.
// ============================================================================

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Niste prijavljeni" },
        { status: 401 }
      );
    }
    if (session.user.accountType !== "user") {
      return NextResponse.json(
        { error: "Ta endpoint je za račune popotnikov" },
        { status: 403 }
      );
    }

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
      },
    });
    if (!user) {
      return NextResponse.json(
        { error: "Uporabnik ni najden" },
        { status: 404 }
      );
    }

    const emailVerified = user.emailVerified !== null;

    // === Shranjeni itinererji (vedno vidni — niso vezani na e-pošto) ===
    const saved = await db.savedItinerary.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        shareId: true,
        name: true,
        createdAt: true,
        views: true,
        itinerary: true,
      },
      take: 50,
    });

    const trips = saved.map((row) => {
      // dayCount iz JSON itinererja — try/catch, ob napaki 0
      let dayCount = 0;
      try {
        const parsed = JSON.parse(row.itinerary) as { days?: unknown[] };
        dayCount = Array.isArray(parsed.days) ? parsed.days.length : 0;
      } catch {
        dayCount = 0;
      }

      return {
        shareId: row.shareId,
        name: row.name,
        createdAt: row.createdAt.toISOString(),
        views: row.views,
        dayCount,
      };
    });

    // === AI konzultacije (SAMO potrjena e-pošta) ===
    let consultations: Array<{
      token: string;
      status: string;
      createdAt: string;
      questionPreview: string;
      deliveredAt: string | null;
    }> = [];

    if (emailVerified) {
      const rows = await db.consultation.findMany({
        where: { email: user.email },
        orderBy: { createdAt: "desc" },
        select: {
          accessToken: true,
          status: true,
          createdAt: true,
          question: true,
          deliveredAt: true,
        },
        take: 20,
      });

      consultations = rows.map((row) => ({
        token: row.accessToken,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        questionPreview: (row.question ?? "").slice(0, 140),
        deliveredAt: row.deliveredAt ? row.deliveredAt.toISOString() : null,
      }));
    }

    return NextResponse.json({
      trips,
      consultations,
      emailVerified,
      user: { name: user.name, email: user.email },
    });
  } catch (error) {
    console.error("[api/user/trips] napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pridobivanju potovanj" },
      { status: 500 }
    );
  }
}
