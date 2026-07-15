import { NextResponse } from "next/server";
import { DESTINATIONS } from "@/lib/slovenia-data";

// GET /api/itinerary/stops-along-way?from=bled&to=bohinj
// Vrne POI-je in destinacije med dvema točkama (Roadtrippers inspiracija)
//
// Preprosta hevristika: najde destinacije ki so "na poti" med dvema
// V produkciji: Google Maps Directions API + midpoint search

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fromId = searchParams.get("from");
    const toId = searchParams.get("to");

    if (!fromId || !toId) {
      return NextResponse.json(
        { error: "Manjkata from in to parametra" },
        { status: 400 }
      );
    }

    const from = DESTINATIONS.find((d) => d.id === fromId);
    const to = DESTINATIONS.find((d) => d.id === toId);

    if (!from || !to) {
      return NextResponse.json(
        { error: "Destinaciji nista najdeni" },
        { status: 404 }
      );
    }

    // Izračunaj midpoint
    const midLat = (from.coords.lat + to.coords.lat) / 2;
    const midLng = (from.coords.lng + to.coords.lng) / 2;

    // Najdi destinacije v bližini midpoint (radij ~30km)
    const nearbyRadius = 0.3; // približno 30km v stopinjah
    const stops = DESTINATIONS.filter((d) => {
      if (d.id === fromId || d.id === toId) return false;
      const dist = Math.sqrt(
        Math.pow(d.coords.lat - midLat, 2) +
        Math.pow(d.coords.lng - midLng, 2)
      );
      return dist < nearbyRadius;
    }).map((d) => ({
      id: d.id,
      name: d.name,
      tagline: d.tagline,
      image: d.image,
      category: d.type,
      region: d.region,
      distanceFromMidpoint: Math.round(
        Math.sqrt(
          Math.pow(d.coords.lat - midLat, 2) +
          Math.pow(d.coords.lng - midLng, 2)
        ) * 111 // približno km
      ),
      coords: d.coords,
    }));

    // Sortiraj po razdalji od midpoint
    stops.sort((a, b) => a.distanceFromMidpoint - b.distanceFromMidpoint);

    return NextResponse.json({
      from: { id: from.id, name: from.name, coords: from.coords },
      to: { id: to.id, name: to.name, coords: to.coords },
      midpoint: { lat: midLat, lng: midLng },
      stops: stops.slice(0, 5), // max 5 suggestions
      totalStops: stops.length,
    });
  } catch (error) {
    console.error("[stops-along-way] napaka:", error);
    return NextResponse.json({ error: "Napaka" }, { status: 500 });
  }
}
