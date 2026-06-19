import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { DESTINATIONS } from "@/lib/slovenia-data";
import type { ListingCategory } from "@/lib/listings-types";

// Validacijska shema za posodobitev listinga
const updateSchema = z.object({
  name: z.string().min(2, "Ime lokala je obvezno").optional(),
  category: z
    .enum([
      "hotel",
      "restaurant",
      "bar",
      "activity",
      "shop",
      "transport",
      "other",
    ])
    .optional(),
  destinationId: z.string().nullable().optional(),
  destinationName: z.string().nullable().optional(),
  description: z
    .string()
    .min(10, "Kratki opis mora imeti vsaj 10 znakov")
    .optional(),
  longDescription: z.string().nullable().optional(),
  address: z.string().min(3, "Naslov je obveznen").optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  images: z.array(z.string()).optional(),
  priceRange: z.enum(["€", "€€", "€€€"]).optional(),
  openingHours: z.string().nullable().optional(),
  specialties: z.array(z.string()).optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Pomožna funkcija: preveri lastništvo lokala
async function getOwnedListing(id: string, ownerId: string) {
  const listing = await db.listing.findUnique({ where: { id } });
  if (!listing) return { error: "not-found" as const, listing: null };
  if (listing.ownerId !== ownerId) {
    return { error: "forbidden" as const, listing: null };
  }
  return { error: null, listing };
}

// GET /api/owner/listings/[id] — posamezni listing (samo lastnik)
export async function GET(_request: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Niste prijavljeni" }, { status: 401 });
  }

  const { id } = await params;
  const { error, listing } = await getOwnedListing(id, session.user.id);
  if (error === "not-found") {
    return NextResponse.json({ error: "Lokal ni najden" }, { status: 404 });
  }
  if (error === "forbidden") {
    return NextResponse.json(
      { error: "Nimate dostopa do tega lokala" },
      { status: 403 }
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
}

// PUT /api/owner/listings/[id] — posodobi listing (samo lastnik)
export async function PUT(request: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Niste prijavljeni" }, { status: 401 });
  }

  const { id } = await params;
  const { error, listing } = await getOwnedListing(id, session.user.id);
  if (error === "not-found") {
    return NextResponse.json({ error: "Lokal ni najden" }, { status: 404 });
  }
  if (error === "forbidden") {
    return NextResponse.json(
      { error: "Nimate dostopa do tega lokala" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return NextResponse.json(
        { error: firstError?.message ?? "Neveljavni podatki" },
        { status: 400 }
      );
    }
    const data = parsed.data;

    // Določi destinationName če se destinationId spreminja
    let destName = data.destinationName;
    if (data.destinationId !== undefined && !destName) {
      if (data.destinationId) {
        const dest = DESTINATIONS.find((d) => d.id === data.destinationId);
        destName = dest?.name ?? null;
      } else {
        destName = null;
      }
    }

    // Če se ime spreminja, posodobi tudi slug (z unikatnostjo)
    let newSlug = listing.slug;
    if (data.name && data.name.trim() !== listing.name) {
      const root =
        data.name
          .toLowerCase()
          .trim()
          .replace(/[čć]/g, "c")
          .replace(/[š]/g, "s")
          .replace(/[ž]/g, "z")
          .replace(/[^a-z0-9\s-]/g, "")
          .replace(/\s+/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "") || listing.slug;
      let candidate = root;
      let i = 1;
      while (true) {
        const existing = await db.listing.findFirst({
          where: { slug: candidate, NOT: { id } },
        });
        if (!existing) break;
        candidate = `${root}-${i++}`;
      }
      newSlug = candidate;
    }

    const updated = await db.listing.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name.trim() }),
        ...(newSlug !== listing.slug && { slug: newSlug }),
        ...(data.category !== undefined && {
          category: data.category as ListingCategory,
        }),
        ...(data.destinationId !== undefined && {
          destinationId: data.destinationId || null,
        }),
        ...(destName !== undefined && { destinationName: destName }),
        ...(data.description !== undefined && {
          description: data.description.trim(),
        }),
        ...(data.longDescription !== undefined && {
          longDescription: data.longDescription?.trim() || null,
        }),
        ...(data.address !== undefined && { address: data.address.trim() }),
        ...(data.phone !== undefined && {
          phone: data.phone?.trim() || null,
        }),
        ...(data.email !== undefined && {
          email: data.email?.trim() || null,
        }),
        ...(data.website !== undefined && {
          website: data.website?.trim() || null,
        }),
        ...(data.images !== undefined && {
          images: JSON.stringify(data.images),
        }),
        ...(data.priceRange !== undefined && { priceRange: data.priceRange }),
        ...(data.openingHours !== undefined && {
          openingHours: data.openingHours?.trim() || null,
        }),
        ...(data.specialties !== undefined && {
          specialties: JSON.stringify(data.specialties),
        }),
        // Plan, featured in verified se NE posodabljajo preko tega API-ja
      },
    });

    return NextResponse.json({
      success: true,
      listing: {
        ...updated,
        images: JSON.parse(updated.images || "[]") as string[],
        specialties: updated.specialties
          ? (JSON.parse(updated.specialties) as string[])
          : [],
      },
    });
  } catch (error) {
    console.error("[api/owner/listings/[id]] PUT napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri posodabljanju lokala" },
      { status: 500 }
    );
  }
}

// DELETE /api/owner/listings/[id] — izbriše listing (samo lastnik)
export async function DELETE(_request: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Niste prijavljeni" }, { status: 401 });
  }

  const { id } = await params;
  const { error } = await getOwnedListing(id, session.user.id);
  if (error === "not-found") {
    return NextResponse.json({ error: "Lokal ni najden" }, { status: 404 });
  }
  if (error === "forbidden") {
    return NextResponse.json(
      { error: "Nimate dostopa do tega lokala" },
      { status: 403 }
    );
  }

  try {
    await db.listing.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[api/owner/listings/[id]] DELETE napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri brisanju lokala" },
      { status: 500 }
    );
  }
}
