import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { toPublicListing } from "@/lib/public-fields";
import { parseSeasons } from "@/lib/listing-practical";

// GET /api/listings — vrne lokale z opcionalnimi filtri
// Query params: category, destinationId, plan, featured, limit, sort
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const destinationId = searchParams.get("destinationId");
    const plan = searchParams.get("plan");
    const featured = searchParams.get("featured");
    // QH 1.153.2 (popravljen latentni hrošč #1): ?limit=abc je parseInt-ra
    // dal NaN → Math.min(NaN, 100) = NaN → Prisma je zavrla `take` →
    // PrismaClientValidationError → 500 na JAVNI ruti (produkcijsko
    // potrjeno na Vercelu 1.153.0: /api/listings?limit=abc → 500).
    // Varovalka: neveljavna/nenegativna/nenaravna vrednost → privzeti 50.
    const rawLimit = parseInt(searchParams.get("limit") || "50", 10);
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.min(rawLimit, 100)
        : 50;
    const sort = searchParams.get("sort") || "featured"; // featured | rating | newest

    // Zgradi where pogoj — samo PUBLISHED lokalci so javno vidni
    const where: Record<string, unknown> = {
      status: "published", // Rule: AI in uporabnik vidijo samo published
    };
    if (category && category !== "all") where.category = category;
    if (destinationId && destinationId !== "all") where.destinationId = destinationId;
    if (plan && plan !== "all") where.plan = plan;
    if (featured === "true") where.featured = true;

    // Sortiranje — Prisma orderBy POLJE (deluje tudi na SQLite)
    // QH 1.153.2 (popravljen latentni hrošč #2): privzeti "featured" sort je
    // v komentarju obljubljal »featured first, then by rating«, a izvajal SAMO
    // { featured: "desc" } — vrstni red neizpostavljenih je bil po vstavitvi
    // (produkcija: Kavarna 4.4 pred Piran 4.9). Stara opomba, da "SQLite ne
    // podpira kompleksnih orderBy", je bila napačna: Prisma polje orderBy se
    // prevede v večstolpčni ORDER BY, ki SQLite podpira v celoti.
    let orderBy: Prisma.ListingOrderByWithRelationInput[];
    if (sort === "rating") {
      orderBy = [{ rating: "desc" }];
    } else if (sort === "newest") {
      orderBy = [{ createdAt: "desc" }];
    } else {
      // featured (privzeto): izpostavljeni najprej, nato po oceni
      orderBy = [{ featured: "desc" }, { rating: "desc" }];
    }

    const listings = await db.listing.findMany({
      where,
      orderBy,
      take: limit, // varovalna vrednost iz zgornje preverbe ( že cap-ana)
    });

    // Razčleni JSON polja (images, specialties)
    // FW1 (audit R3 🟠): javni odgovor NE sme izdati ownerEmail (prijavni
    // mail ponudnika), rejectionReason, approvedBy, ownerId, draftNudge*
    // in B2B metrik — sanitiziramo prek toPublicListing.
    const parsed = listings.map((l) => ({
      ...toPublicListing(l),
      images: JSON.parse(l.images || "[]") as string[],
      specialties: l.specialties ? (JSON.parse(l.specialties) as string[]) : [],
      seasons: parseSeasons(l.seasons),
    }));

    return NextResponse.json({
      listings: parsed,
      total: parsed.length,
    });
  } catch (error) {
    console.error("[listings] GET napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pridobivanju lokalov" },
      { status: 500 }
    );
  }
}
