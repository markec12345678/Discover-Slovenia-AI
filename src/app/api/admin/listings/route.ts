import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAdmin } from "@/lib/auth-guards";

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
  const adminPassword = request.headers.get("x-admin-password");
  if (!checkAdmin(adminPassword)) {
    return unauthorized();
  }

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
  const adminPassword = request.headers.get("x-admin-password");
  if (!checkAdmin(adminPassword)) {
    return unauthorized();
  }

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
