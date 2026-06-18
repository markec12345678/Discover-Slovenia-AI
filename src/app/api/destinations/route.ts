import { NextResponse } from "next/server";
import { DESTINATIONS } from "@/lib/slovenia-data";

// GET /api/destinations - vrne vse destinacije (brez baze, statični podatki)
export async function GET(request: Request) {
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
}
