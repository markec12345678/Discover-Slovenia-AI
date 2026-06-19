import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAdmin } from "@/lib/auth-guards";

function unauthorized() {
  return NextResponse.json(
    { error: "Neavtoriziran dostop" },
    { status: 401 }
  );
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function ensureUniqueSlug(
  baseSlug: string,
  excludeId: string
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

function parseList(input: string | null | undefined): string[] {
  if (!input) return [];
  return input
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// GET /api/admin/listings/[id]
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminPassword = request.headers.get("x-admin-password");
  if (!checkAdmin(adminPassword)) {
    return unauthorized();
  }

  try {
    const { id } = await params;
    const listing = await db.listing.findUnique({ where: { id } });

    if (!listing) {
      return NextResponse.json(
        { error: "Lokal ni najden" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      listing: {
        ...listing,
        images: JSON.parse(listing.images || "[]") as string[],
        specialties: listing.specialties
          ? (JSON.parse(listing.specialties) as string[])
          : [],
      },
    });
  } catch (error) {
    console.error("[admin/listings/id] GET napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pridobivanju lokala" },
      { status: 500 }
    );
  }
}

// PUT /api/admin/listings/[id]
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminPassword = request.headers.get("x-admin-password");
  if (!checkAdmin(adminPassword)) {
    return unauthorized();
  }

  try {
    const { id } = await params;
    const existing = await db.listing.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Lokal ni najden" },
        { status: 404 }
      );
    }

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

    // Posodobi slug če se je ime spremenilo
    const providedSlug =
      typeof body.slug === "string" && body.slug.trim()
        ? slugify(body.slug.trim())
        : slugify(name);
    const slug = await ensureUniqueSlug(providedSlug, id);

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

    const updated = await db.listing.update({
      where: { id },
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

    return NextResponse.json({
      listing: {
        ...updated,
        images,
        specialties,
      },
      success: true,
    });
  } catch (error) {
    console.error("[admin/listings/id] PUT napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri posodabljanju lokala" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/listings/[id]
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminPassword = request.headers.get("x-admin-password");
  if (!checkAdmin(adminPassword)) {
    return unauthorized();
  }

  try {
    const { id } = await params;
    const existing = await db.listing.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Lokal ni najden" },
        { status: 404 }
      );
    }

    await db.listing.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      message: `Lokal "${existing.name}" izbrisan`,
    });
  } catch (error) {
    console.error("[admin/listings/id] DELETE napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri brisanju lokala" },
      { status: 500 }
    );
  }
}
