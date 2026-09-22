import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-guards";
import {
  parseSeasons,
  SEASON_KEYS,
  isValidWeatherSuitability,
  isValidParkingOption,
} from "@/lib/listing-practical";
import { isLatValid, isLngValid } from "@/lib/listing-geo-validation";

// Pomožna: preveri admin geslo iz headerja
function unauthorized() {
  return NextResponse.json(
    { error: "Neavtoriziran dostop" },
    { status: 401 }
  );
}

// Slug: ime.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // odstrani diakritiko (č, š, ž → c, s, z)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Zagotovi unikaten slug (append -2, -3, ...)
async function ensureUniqueSlug(
  baseSlug: string,
  excludeId?: string
): Promise<string> {
  let candidate = baseSlug || "lokal";
  let suffix = 1;
  for (;;) {
    const existing = await db.listing.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing || existing.id === excludeId) {
      return candidate;
    }
    suffix += 1;
    candidate = `${baseSlug}-${suffix}`;
  }
}

// Razčleni list iz texta (split po novi vrstici ali vejici)
function parseList(input: string | null | undefined): string[] {
  if (!input) return [];
  return input
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// GET /api/admin/listings — vsi lokalci (admin)
export async function GET(request: Request) {
  const gate = requireAdmin(request);
  if (gate) return gate;

  try {
    const listings = await db.listing.findMany({
      orderBy: { createdAt: "desc" },
    });

    const parsed = listings.map((l) => ({
      ...l,
      images: JSON.parse(l.images || "[]") as string[],
      specialties: l.specialties
        ? (JSON.parse(l.specialties) as string[])
        : [],
      seasons: parseSeasons(l.seasons),
    }));

    return NextResponse.json({ listings: parsed, total: parsed.length });
  } catch (error) {
    console.error("[admin/listings] GET napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pridobivanju lokalov" },
      { status: 500 }
    );
  }
}

// POST /api/admin/listings — ustvari nov lokal
export async function POST(request: Request) {
  const gate = requireAdmin(request);
  if (gate) return gate;

  try {
    const body: Record<string, unknown> = await request.json();

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json(
        { error: "Ime je obvezno" },
        { status: 400 }
      );
    }
    const description =
      typeof body.description === "string" ? body.description.trim() : "";
    if (!description) {
      return NextResponse.json(
        { error: "Kratek opis je obvezen" },
        { status: 400 }
      );
    }
    const address =
      typeof body.address === "string" ? body.address.trim() : "";
    if (!address) {
      return NextResponse.json(
        { error: "Naslov je obvezen" },
        { status: 400 }
      );
    }

    const category = typeof body.category === "string" ? body.category : "other";
    const destinationId =
      typeof body.destinationId === "string" && body.destinationId
        ? body.destinationId
        : null;
    const destinationName =
      typeof body.destinationName === "string" && body.destinationName
        ? body.destinationName
        : null;

    // Slug: uporabi podanega ali avto-generiraj iz imena
    const providedSlug =
      typeof body.slug === "string" && body.slug.trim()
        ? slugify(body.slug.trim())
        : slugify(name);
    const slug = await ensureUniqueSlug(providedSlug);

    const plan = typeof body.plan === "string" ? body.plan : "free";
    const featured = body.featured === true;
    const verified = body.verified === true;
    const rating =
      typeof body.rating === "number" && !isNaN(body.rating)
        ? Math.max(0, Math.min(5, body.rating))
        : 0;
    const reviewCount =
      typeof body.reviewCount === "number" && !isNaN(body.reviewCount)
        ? Math.max(0, Math.floor(body.reviewCount))
        : 0;
    const priceRange =
      typeof body.priceRange === "string" ? body.priceRange : "€";

    const imagesRaw =
      typeof body.images === "string"
        ? body.images
        : Array.isArray(body.images)
        ? (body.images as string[]).join("\n")
        : "";
    const images = parseList(imagesRaw);

    const specialtiesRaw =
      typeof body.specialties === "string" ? body.specialties : "";
    const specialties = parseList(specialtiesRaw);

    // Praktični podatki (t12 faza 1) — strežniška validacija ključev
    const seasons = Array.isArray(body.seasons)
      ? (body.seasons.filter((s: unknown) =>
          (SEASON_KEYS as readonly string[]).includes(s as string)
        ) as string[])
      : [];
    const weatherSuitability = isValidWeatherSuitability(
      body.weatherSuitability
    )
      ? body.weatherSuitability
      : null;
    const parking = isValidParkingOption(body.parking) ? body.parking : null;

    // TASK 85: geo koordinati (pin lastne tržnice) — trda vrata enaka
    // owner API-ju: obe ALI nobena, ±90/±180. Neveljavna številka ni
    // tiho prirejena (clamp bi premaknil pin) ampak izrecno zavrnjena.
    const latRaw =
      typeof body.lat === "number" && Number.isFinite(body.lat)
        ? body.lat
        : null;
    const lngRaw =
      typeof body.lng === "number" && Number.isFinite(body.lng)
        ? body.lng
        : null;
    if (latRaw !== null && !isLatValid(latRaw)) {
      return NextResponse.json(
        { error: "Geo širina mora biti med -90 in 90" },
        { status: 400 }
      );
    }
    if (lngRaw !== null && !isLngValid(lngRaw)) {
      return NextResponse.json(
        { error: "Geo dolžina mora biti med -180 in 180" },
        { status: 400 }
      );
    }
    if ((latRaw !== null) !== (lngRaw !== null)) {
      return NextResponse.json(
        {
          error:
            "Vnesite obe koordinati (geo širino in geo dolžino) ali obe izpraznite.",
        },
        { status: 400 }
      );
    }
    const lat = latRaw;
    const lng = lngRaw;

    const created = await db.listing.create({
      data: {
        name,
        slug,
        description,
        longDescription:
          typeof body.longDescription === "string" && body.longDescription.trim()
            ? body.longDescription.trim()
            : null,
        category,
        destinationId,
        destinationName,
        address,
        phone:
          typeof body.phone === "string" && body.phone.trim()
            ? body.phone.trim()
            : null,
        email:
          typeof body.email === "string" && body.email.trim()
            ? body.email.trim()
            : null,
        website:
          typeof body.website === "string" && body.website.trim()
            ? body.website.trim()
            : null,
        images: JSON.stringify(images),
        plan,
        featured,
        verified,
        rating,
        reviewCount,
        priceRange,
        openingHours:
          typeof body.openingHours === "string" && body.openingHours.trim()
            ? body.openingHours.trim()
            : null,
        specialties: specialties.length > 0 ? JSON.stringify(specialties) : null,
        seasons: seasons.length > 0 ? JSON.stringify(seasons) : null,
        weatherSuitability,
        parking,
        // TASK 85: obe ali nobena (validirano zgoraj); null = brez pina
        lat,
        lng,
        ownerEmail:
          typeof body.ownerEmail === "string" && body.ownerEmail.trim()
            ? body.ownerEmail.trim()
            : null,
      },
    });

    return NextResponse.json(
      {
        listing: {
          ...created,
          images,
          specialties,
          seasons,
        },
        success: true,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[admin/listings] POST napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri ustvarjanju lokala" },
      { status: 500 }
    );
  }
}
