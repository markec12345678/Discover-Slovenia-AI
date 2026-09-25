import { NextResponse } from "next/server";
import { DESTINATIONS } from "@/lib/slovenia-data";
import {
  DESTINATIONS_DATA_AS_OF,
  withDestinationProvenance,
} from "@/lib/destination-provenance";

// GET /api/destinations - vrne vse destinacije (brez baze, statični podatki)
//
// TASK 99-a (§15, fail-closed): pot NE dostopa do Prisma (statični podatki
// iz @/lib/slovenia-data), vendar ovojnica try/catch zagotavlja, da tudi
// nepričakovana runtime napaka vrne STRUKTURIRAN JSON (503) namesto surovega
// Next.js 500 HTML. Sporočilo je iskreno (govori o destinacijah, ne o bazi,
// ker baze tu ni) — uspešna pot in oblika odgovora sta nespremenjeni.
//
// ISSUE #4 §18 (VAL 7): vsak zapis nosi `provenance` (kind/source/sourceUrl/
// verifiedAt — resolver iz lib/destination-provenance.ts) + glava
// X-Data-As-Of (datum vsebinske posodobitve dataseta). Oblika telesa je
// NAZAJ KOMPATIBILNA (aditivno polje + glava; obstoječi odjemalci ali
// neznan polji preprosto ne vidijo).
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const region = searchParams.get("region");
    const featured = searchParams.get("featured");

    let result = DESTINATIONS;

    if (region && region !== "all") {
      result = result.filter((d) => d.region === region);
    }
    if (featured === "true") {
      result = result.filter((d) => d.featured);
    }

    // §18: provenance per zapis (aditivno) + as-of žig v glavi.
    const enriched = withDestinationProvenance(result);

    return NextResponse.json(
      {
        destinations: enriched,
        total: enriched.length,
      },
      {
        headers: {
          "X-Data-As-Of": DESTINATIONS_DATA_AS_OF,
        },
      }
    );
  } catch (error) {
    console.error("[destinations] GET napaka:", error);
    return NextResponse.json(
      { error: "Destinacije trenutno niso dosegljive" },
      { status: 503 }
    );
  }
}
