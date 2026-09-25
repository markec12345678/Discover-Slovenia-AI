import { NextResponse } from "next/server";
import { DESTINATIONS, getDestinationById } from "@/lib/slovenia-data";
import {
  DESTINATIONS_DATA_AS_OF,
  getDestinationProvenance,
} from "@/lib/destination-provenance";

// GET /api/destinations/[slug] - vrne posamezno destinacijo
//
// TASK 99-a (§15, fail-closed): pot NE dostopa do Prisma (statični podatki),
// vendar ovojnica try/catch zagotavlja, da tudi nepričakovana runtime
// napaka vrne STRUKTURIRAN JSON (503) namesto surovega Next.js 500 HTML.
// Uspešna pot (200) in pot "ni najdeno" (404) sta nespremenjeni.
//
// ISSUE #4 §18 (VAL 7): zapis nosi `provenance` (aditivno) + glavo
// X-Data-As-Of — enaka resnica kot /api/destinations.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const destination = getDestinationById(slug) || DESTINATIONS.find((d) => d.slug === slug);

    if (!destination) {
      return NextResponse.json(
        { error: "Destination not found" },
        { status: 404 }
      );
    }

    // §18: provenance (aditivno) + as-of žig v glavi.
    const enriched = {
      ...destination,
      provenance: getDestinationProvenance(destination),
    };

    return NextResponse.json(
      { destination: enriched },
      {
        headers: {
          "X-Data-As-Of": DESTINATIONS_DATA_AS_OF,
        },
      }
    );
  } catch (error) {
    console.error("[destinations/[slug]] GET napaka:", error);
    return NextResponse.json(
      { error: "Destinacija trenutno ni dosegljiva" },
      { status: 503 }
    );
  }
}
