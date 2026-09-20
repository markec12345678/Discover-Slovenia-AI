import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

// GET /api/journey/bookings?shareId={id} — potrditve rezervacij shranjene poti.
//
// TASK 58 (§19): kanonični model potrditve. DANAŠNJE DEJANSKO STANJE:
// 0 ponudnikov potovalne verige podpira API_BOOKING (0 poverilnic) →
// tabela je PRAZNA in to je iskren odgovor (brez fake EXTERNAL/CONFIRMED
// zapisov). Affiliate tok: rezervacija/potrditev živi pri PONUDNIKU —
// zapis nastane ŠTEvilNO, ko bo provider dejansko vrnil svoj odgovor.
export async function GET(request: Request) {
  const limited = rateLimit(request, {
    limit: 60,
    windowMs: 60_000,
    key: "journey-bookings",
  });
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const shareId = (searchParams.get("shareId") ?? "").trim().toLowerCase();

  if (!/^[a-z0-9]{1,32}$/.test(shareId)) {
    return NextResponse.json({ error: "Neveljaven shareId" }, { status: 400 });
  }

  try {
    const bookings = await db.journeyBooking.findMany({
      where: { shareId },
      select: {
        id: true,
        provider: true,
        providerProductId: true,
        status: true,
        providerBookingId: true,
        confirmedPrice: true,
        currency: true,
        confirmationUrl: true,
        cancellationUrl: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    // Iskrenost: prazen seznam = ni še nobene provider potrditve (dokaz,
    // ne napaka) — UI izpiše ločeno od napake okolja.
    return NextResponse.json({ bookings });
  } catch (error) {
    console.error("[journey/bookings] GET napaka:", error);
    return NextResponse.json(
      { error: "Baza potrditev trenutno ni dosegljiva" },
      { status: 503 }
    );
  }
}
