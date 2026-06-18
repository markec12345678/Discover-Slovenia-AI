import { NextResponse } from "next/server";
import { DESTINATIONS, getDestinationById } from "@/lib/slovenia-data";

// GET /api/destinations/[slug] - vrne posamezno destinacijo
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const destination = getDestinationById(slug) || DESTINATIONS.find((d) => d.slug === slug);

  if (!destination) {
    return NextResponse.json(
      { error: "Destination not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ destination });
}
