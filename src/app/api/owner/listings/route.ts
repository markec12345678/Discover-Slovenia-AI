import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { DESTINATIONS } from "@/lib/slovenia-data";
import type { ListingCategory, ListingPlan } from "@/lib/listings-types";

// Omejitve števila lokalov glede na paket
const PLAN_LIMITS: Record<ListingPlan, number> = {
  free: 1,
  premium: 5,
  enterprise: Infinity,
};

// Slovenski slugify (č → c, š → s, ž → z)
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[čć]/g, "c")
    .replace(/[š]/g, "s")
    .replace(/[ž]/g, "z")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// Generira unikaten slug (če obstaja, doda številko)
async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base) || "lokal";
  let slug = root;
  let i = 1;
  while (await db.listing.findUnique({ where: { slug } })) {
    slug = `${root}-${i++}`;
  }
  return slug;
}

// Validacijska shema za nov listing
const createSchema = z.object({
  name: z.string().min(2, "Ime lokala je obvezno"),
  category: z.enum([
    "hotel",
    "restaurant",
    "bar",
    "activity",
    "shop",
    "transport",
    "other",
  ]),
  destinationId: z.string().nullable().optional(),
  destinationName: z.string().nullable().optional(),
  description: z.string().min(10, "Kratki opis mora imeti vsaj 10 znakov"),
  longDescription: z.string().nullable().optional(),
  address: z.string().min(3, "Naslov je obveznen"),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  images: z.array(z.string()).default([]),
  priceRange: z.enum(["€", "€€", "€€€"]).default("€"),
  openingHours: z.string().nullable().optional(),
  specialties: z.array(z.string()).default([]),
});

// GET /api/owner/listings — vrne vse lokale trenutno prijavljenega lastnika
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Niste prijavljeni" },
      { status: 401 }
    );
  }

  try {
    const listings = await db.listing.findMany({
      where: { ownerId: session.user.id },
      orderBy: { createdAt: "desc" },
    });

    // Razčleni JSON polja (images, specialties) — SQLite ne podpira arrayjev
    const parsed = listings.map((l) => ({
      ...l,
      images: JSON.parse(l.images || "[]") as string[],
      specialties: l.specialties
        ? (JSON.parse(l.specialties) as string[])
        : [],
    }));

    return NextResponse.json({ listings: parsed, total: parsed.length });
  } catch (error) {
    console.error("[api/owner/listings] GET napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pridobivanju lokalov" },
      { status: 500 }
    );
  }
}

// POST /api/owner/listings — ustvari nov listing za prijavljenega lastnika
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Niste prijavljeni" },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return NextResponse.json(
        { error: firstError?.message ?? "Neveljavni podatki" },
        { status: 400 }
      );
    }
    const data = parsed.data;

    // Pridobi lastnika in preštej njegove lokale
    const owner = await db.owner.findUnique({
      where: { id: session.user.id },
      select: {
        plan: true,
        email: true,
        _count: { select: { listings: true } },
      },
    });
    if (!owner) {
      return NextResponse.json(
        { error: "Lastnik ne obstaja" },
        { status: 404 }
      );
    }

    const limit = PLAN_LIMITS[owner.plan as ListingPlan] ?? 1;
    if (owner._count.listings >= limit) {
      return NextResponse.json(
        {
          error:
            limit === Infinity
              ? "Dosežen limit lokalov."
              : `Vaš paket (${owner.plan}) omogoča največ ${limit} ${
                  limit === 1 ? "lokal" : "lokalov"
                }. Nadgradite naročnino za več lokalov.`,
        },
        { status: 403 }
      );
    }

    // Določi destinationName iz DESTINATIONS, če ni podan
    let destName = data.destinationName ?? null;
    if (data.destinationId && !destName) {
      const dest = DESTINATIONS.find((d) => d.id === data.destinationId);
      destName = dest?.name ?? null;
    }

    const slug = await uniqueSlug(data.name);

    const listing = await db.listing.create({
      data: {
        name: data.name.trim(),
        slug,
        description: data.description.trim(),
        longDescription: data.longDescription?.trim() || null,
        category: data.category as ListingCategory,
        destinationId: data.destinationId || null,
        destinationName: destName,
        address: data.address.trim(),
        phone: data.phone?.trim() || null,
        email: data.email?.trim() || null,
        website: data.website?.trim() || null,
        images: JSON.stringify(data.images),
        // Plan deduje iz owner.plan — owner ne more nastaviti sam
        plan: owner.plan as ListingPlan,
        // featured in verified lahko nastavi samo admin
        featured: false,
        verified: false,
        priceRange: data.priceRange,
        openingHours: data.openingHours?.trim() || null,
        specialties: JSON.stringify(data.specialties),
        ownerId: session.user.id,
        ownerEmail: owner.email,
      },
    });

    return NextResponse.json({
      success: true,
      listing: {
        ...listing,
        images: JSON.parse(listing.images || "[]") as string[],
        specialties: listing.specialties
          ? (JSON.parse(listing.specialties) as string[])
          : [],
      },
    });
  } catch (error) {
    console.error("[api/owner/listings] POST napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri ustvarjanju lokala" },
      { status: 500 }
    );
  }
}
