import { NextResponse } from "next/server";
import { DESTINATIONS } from "@/lib/slovenia-data";

// GET /api/destinations - vrne vse destinacije (brez baze, statični podatki)
//
// TASK 99-a (§15, fail-closed): pot NE dostopa do Prisma (statični podatki
// iz @/lib/slovenia-data), vendar ovojnica try/catch zagotavlja, da tudi
// nepričakovana runtime napaka vrne STRUKTURIRAN JSON (503) namesto surovega
// Next.js 500 HTML. Sporočilo je iskreno (govori o destinacijah, ne o bazi,
// ker baze tu ni) — uspešna pot in oblika odgovora sta nespremenjeni.
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

    return NextResponse.json({
      destinations: result,
      total: result.length,
    });
  } catch (error) {
    console.error("[destinations] GET napaka:", error);
    return NextResponse.json(
      { error: "Destinacije trenutno niso dosegljive" },
      { status: 503 }
    );
  }
}
