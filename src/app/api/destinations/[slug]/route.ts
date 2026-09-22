import { NextResponse } from "next/server";
import { DESTINATIONS, getDestinationById } from "@/lib/slovenia-data";

// GET /api/destinations/[slug] - vrne posamezno destinacijo
//
// TASK 99-a (§15, fail-closed): pot NE dostopa do Prisma (statični podatki),
// vendar ovojnica try/catch zagotavlja, da tudi nepričakovana runtime
// napaka vrne STRUKTURIRAN JSON (503) namesto surovega Next.js 500 HTML.
// Uspešna pot (200) in pot "ni najdeno" (404) sta nespremenjeni.
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

    return NextResponse.json({ destination });
  } catch (error) {
    console.error("[destinations/[slug]] GET napaka:", error);
    return NextResponse.json(
      { error: "Destinacija trenutno ni dosegljiva" },
      { status: 503 }
    );
  }
}
