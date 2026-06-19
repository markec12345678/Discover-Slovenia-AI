import { NextResponse } from "next/server";

// GET /api/pois — vrne POI-je (Points of Interest) iz OpenStreetMap Overpass API
// Brezplačni podatki, brez API ključa
//
// Query parametri:
// - bbox: "south,west,north,east" (default: Slovenija 45.4,13.4,46.9,16.6)
// - category: attraction | museum | restaurant | hotel | viewpoint | natural | religious | shop | all (default: all)
// - limit: max 500 (default 200)
//
// Uporablja Overpass API: https://overpass-api.de/api/interpreter

const SLOVENIA_BBOX = "45.4,13.4,46.9,16.6"; // south,west,north,east

// Overpass QL po kategorijah
const CATEGORY_QUERIES: Record<string, string> = {
  attraction: `
    node[tourism=attraction](${SLOVENIA_BBOX});
    node[tourism=artwork](${SLOVENIA_BBOX});
    node[historic=monument](${SLOVENIA_BBOX});
    node[historic=castle](${SLOVENIA_BBOX});
    way[tourism=attraction](${SLOVENIA_BBOX});
    way[historic=castle](${SLOVENIA_BBOX});
  `,
  museum: `
    node[tourism=museum](${SLOVENIA_BBOX});
    way[tourism=museum](${SLOVENIA_BBOX});
  `,
  restaurant: `
    node[amenity=restaurant](${SLOVENIA_BBOX});
    node[amenity=cafe](${SLOVENIA_BBOX});
    node[amenity=bar](${SLOVENIA_BBOX});
    node[amenity=fast_food](${SLOVENIA_BBOX});
  `,
  hotel: `
    node[tourism=hotel](${SLOVENIA_BBOX});
    node[tourism=hostel](${SLOVENIA_BBOX});
    node[tourism=guest_house](${SLOVENIA_BBOX});
    node[tourism=apartment](${SLOVENIA_BBOX});
    way[tourism=hotel](${SLOVENIA_BBOX});
  `,
  viewpoint: `
    node[tourism=viewpoint](${SLOVENIA_BBOX});
    node[tourism=picnic_site](${SLOVENIA_BBOX});
  `,
  natural: `
    node[natural=peak](${SLOVENIA_BBOX});
    node[natural=waterfall](${SLOVENIA_BBOX});
    node[natural=cave_entrance](${SLOVENIA_BBOX});
    node[natural=spring](${SLOVENIA_BBOX});
    way[natural=water](${SLOVENIA_BBOX});
    way[natural=beach](${SLOVENIA_BBOX});
  `,
  religious: `
    node[amenity=place_of_worship](${SLOVENIA_BBOX});
    node[historic=church](${SLOVENIA_BBOX});
    way[amenity=place_of_worship](${SLOVENIA_BBOX});
  `,
  shop: `
    node[shop=gift](${SLOVENIA_BBOX});
    node[shop=wine](${SLOVENIA_BBOX});
    node[shop=bakery](${SLOVENIA_BBOX});
  `,
};

// Združi vse kategorije za "all" — omejeno na najboljše (attractions, museums, natural, viewpoints, religious)
// Restavracije/hoteli so preštevilni za "all" — uporabnik naj jih filtrira posebej
const ALL_QUERY = `
  ${CATEGORY_QUERIES.attraction}
  ${CATEGORY_QUERIES.museum}
  ${CATEGORY_QUERIES.viewpoint}
  ${CATEGORY_QUERIES.natural}
  ${CATEGORY_QUERIES.religious}
`;

interface Poi {
  id: string;
  osmId: number;
  name: string;
  category: string;
  subcategory: string;
  lat: number;
  lng: number;
  description?: string;
  website?: string;
  phone?: string;
  openingHours?: string;
  cuisine?: string;
  wikidata?: string;
  wikipedia?: string;
  image?: string;
  address?: string;
}

// Mapiranje OSM tagov v našo kategorijo
function categorize(tags: Record<string, string>): { category: string; subcategory: string } {
  if (tags.tourism === "attraction" || tags.tourism === "artwork" || tags.historic === "monument" || tags.historic === "castle")
    return { category: "attraction", subcategory: tags.tourism || tags.historic || "attraction" };
  if (tags.tourism === "museum")
    return { category: "museum", subcategory: "museum" };
  if (tags.amenity === "restaurant" || tags.amenity === "cafe" || tags.amenity === "bar" || tags.amenity === "fast_food")
    return { category: "restaurant", subcategory: tags.amenity };
  if (tags.tourism === "hotel" || tags.tourism === "hostel" || tags.tourism === "guest_house" || tags.tourism === "apartment")
    return { category: "hotel", subcategory: tags.tourism };
  if (tags.tourism === "viewpoint" || tags.tourism === "picnic_site")
    return { category: "viewpoint", subcategory: tags.tourism };
  if (tags.natural === "peak" || tags.natural === "waterfall" || tags.natural === "cave_entrance" || tags.natural === "spring" || tags.natural === "water" || tags.natural === "beach")
    return { category: "natural", subcategory: tags.natural };
  if (tags.amenity === "place_of_worship" || tags.historic === "church")
    return { category: "religious", subcategory: tags.amenity || tags.historic };
  if (tags.shop)
    return { category: "shop", subcategory: tags.shop };
  return { category: "other", subcategory: "unknown" };
}

function parseElement(el: any): Poi | null {
  if (!el.tags || !el.tags.name) return null; // samo POI-ji z imenom
  const { category, subcategory } = categorize(el.tags);
  const lat = el.lat || (el.center && el.center.lat);
  const lng = el.lon || (el.center && el.center.lon);
  if (!lat || !lng) return null;

  const address = [el.tags["addr:street"], el.tags["addr:housenumber"], el.tags["addr:city"]]
    .filter(Boolean)
    .join(" ");

  return {
    id: `${el.type}-${el.id}`,
    osmId: el.id,
    name: el.tags.name,
    category,
    subcategory,
    lat,
    lng,
    description: el.tags.description || el.tags["description:sl"] || undefined,
    website: el.tags.website || el.tags["contact:website"] || undefined,
    phone: el.tags.phone || el.tags["contact:phone"] || undefined,
    openingHours: el.tags.opening_hours || undefined,
    cuisine: el.tags.cuisine || undefined,
    wikidata: el.tags.wikidata || undefined,
    wikipedia: el.tags.wikipedia || undefined,
    image: el.tags.image || el.tags.wikimedia_commons || undefined,
    address: address || undefined,
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") || "all";
    const limit = Math.min(parseInt(searchParams.get("limit") || "200", 10), 500);

    const queryBody = category === "all" ? ALL_QUERY : CATEGORY_QUERIES[category] || ALL_QUERY;

    const overpassQuery = `
      [out:json][timeout:60];
      (
        ${queryBody}
      );
      out center tags 1000;
    `;

    // Pošlji na Overpass API
    const overpassUrl = "https://overpass-api.de/api/interpreter";
    const res = await fetch(overpassUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "User-Agent": "I-Feel-Slovenia/1.0 (tourism platform)",
      },
      body: "data=" + encodeURIComponent(overpassQuery),
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`Overpass API: ${res.status}`);
    }

    const data = await res.json();
    const elements = data.elements || [];

    const pois: Poi[] = [];
    for (const el of elements) {
      const poi = parseElement(el);
      if (poi) pois.push(poi);
      if (pois.length >= limit) break;
    }

    return NextResponse.json({
      pois,
      total: pois.length,
      category,
      source: "OpenStreetMap",
      cached: true,
    });
  } catch (error) {
    console.error("[pois] napaka:", error);
    return NextResponse.json(
      {
        error: "Napaka pri pridobivanju POI-jev",
        pois: [],
        total: 0,
      },
      { status: 502 }
    );
  }
}
