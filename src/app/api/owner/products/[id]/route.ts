import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { DESTINATIONS } from "@/lib/slovenia-data";
import type { ProductCategory } from "@/lib/marketplace-types";

// Validacijska shema za posodobitev izdelka
const updateSchema = z.object({
  name: z.string().min(2, "Ime izdelka je obvezno").optional(),
  category: z
    .enum(["food", "wine", "honey", "oil", "craft", "souvenir", "other"])
    .optional(),
  description: z
    .string()
    .min(10, "Kratki opis mora imeti vsaj 10 znakov")
    .max(120, "Kratki opis je omejen na 120 znakov")
    .optional(),
  longDescription: z.string().nullable().optional(),
  destinationId: z.string().nullable().optional(),
  destinationName: z.string().nullable().optional(),
  price: z.number().min(0, "Cena mora biti pozitivna").optional(),
  compareAtPrice: z.number().min(0).nullable().optional(),
  stock: z.number().int().min(0).optional(),
  weight: z.number().min(0).nullable().optional(),
  images: z.array(z.string()).optional(),
  organic: z.boolean().optional(),
  handmade: z.boolean().optional(),
  local: z.boolean().optional(),
  vegan: z.boolean().optional(),
  shippingFree: z.boolean().optional(),
  shipsEurope: z.boolean().optional(),
  shipsWorldwide: z.boolean().optional(),
  sellerName: z.string().min(2, "Ime prodajalca je obvezno").optional(),
  sellerEmail: z.string().nullable().optional(),
  sellerPhone: z.string().nullable().optional(),
  sellerWebsite: z.string().nullable().optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Pomožna funkcija: preveri lastništvo izdelka
async function getOwnedProduct(id: string, ownerId: string) {
  const product = await db.product.findUnique({ where: { id } });
  if (!product) return { error: "not-found" as const, product: null };
  if (product.ownerId !== ownerId) {
    return { error: "forbidden" as const, product: null };
  }
  return { error: null, product };
}

// GET /api/owner/products/[id] — posamezni product (samo lastnik)
export async function GET(_request: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Niste prijavljeni" }, { status: 401 });
  }

  const { id } = await params;
  const { error, product } = await getOwnedProduct(id, session.user.id);
  if (error === "not-found") {
    return NextResponse.json({ error: "Izdelek ni najden" }, { status: 404 });
  }
  if (error === "forbidden") {
    return NextResponse.json(
      { error: "Nimate dostopa do tega izdelka" },
      { status: 403 }
    );
  }

  return NextResponse.json({
    product: {
      ...product,
      images: JSON.parse(product.images || "[]") as string[],
    },
  });
}

// PUT /api/owner/products/[id] — posodobi product (samo lastnik)
export async function PUT(request: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Niste prijavljeni" }, { status: 401 });
  }

  const { id } = await params;
  const { error, product } = await getOwnedProduct(id, session.user.id);
  if (error === "not-found") {
    return NextResponse.json({ error: "Izdelek ni najden" }, { status: 404 });
  }
  if (error === "forbidden") {
    return NextResponse.json(
      { error: "Nimate dostopa do tega izdelka" },
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
    if (data.destinationId !== undefined && destName === undefined) {
      if (data.destinationId) {
        const dest = DESTINATIONS.find((d) => d.id === data.destinationId);
        destName = dest?.name ?? null;
      } else {
        destName = null;
      }
    }

    // Če se ime spreminja, posodobi tudi slug (z unikatnostjo)
    let newSlug = product.slug;
    if (data.name && data.name.trim() !== product.name) {
      const root =
        data.name
          .toLowerCase()
          .trim()
          .replace(/[čć]/g, "c")
          .replace(/[š]/g, "s")
          .replace(/[ž]/g, "z")
          .replace(/đ/g, "d")
          .replace(/[^a-z0-9\s-]/g, "")
          .replace(/\s+/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "") || product.slug;
      let candidate = root;
      let i = 1;
      while (true) {
        const existing = await db.product.findFirst({
          where: { slug: candidate, NOT: { id } },
        });
        if (!existing) break;
        candidate = `${root}-${i++}`;
      }
      newSlug = candidate;
    }

    const updated = await db.product.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name.trim() }),
        ...(newSlug !== product.slug && { slug: newSlug }),
        ...(data.category !== undefined && {
          category: data.category as ProductCategory,
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
        ...(data.price !== undefined && { price: data.price }),
        ...(data.compareAtPrice !== undefined && {
          compareAtPrice: data.compareAtPrice,
        }),
        ...(data.stock !== undefined && { stock: data.stock }),
        ...(data.weight !== undefined && { weight: data.weight }),
        ...(data.images !== undefined && {
          images: JSON.stringify(data.images),
        }),
        ...(data.organic !== undefined && { organic: data.organic }),
        ...(data.handmade !== undefined && { handmade: data.handmade }),
        ...(data.local !== undefined && { local: data.local }),
        ...(data.vegan !== undefined && { vegan: data.vegan }),
        ...(data.shippingFree !== undefined && {
          shippingFree: data.shippingFree,
        }),
        ...(data.shipsEurope !== undefined && {
          shipsEurope: data.shipsEurope,
        }),
        ...(data.shipsWorldwide !== undefined && {
          shipsWorldwide: data.shipsWorldwide,
        }),
        ...(data.sellerName !== undefined && {
          sellerName: data.sellerName.trim(),
        }),
        ...(data.sellerEmail !== undefined && {
          sellerEmail: data.sellerEmail?.trim() || null,
        }),
        ...(data.sellerPhone !== undefined && {
          sellerPhone: data.sellerPhone?.trim() || null,
        }),
        ...(data.sellerWebsite !== undefined && {
          sellerWebsite: data.sellerWebsite?.trim() || null,
        }),
        // Plan, featured in verified se NE posodabljajo preko tega API-ja
      },
    });

    return NextResponse.json({
      success: true,
      product: {
        ...updated,
        images: JSON.parse(updated.images || "[]") as string[],
      },
    });
  } catch (error) {
    console.error("[api/owner/products/[id]] PUT napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri posodabljanju izdelka" },
      { status: 500 }
    );
  }
}

// DELETE /api/owner/products/[id] — izbriše product (samo lastnik)
export async function DELETE(_request: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Niste prijavljeni" }, { status: 401 });
  }

  const { id } = await params;
  const { error } = await getOwnedProduct(id, session.user.id);
  if (error === "not-found") {
    return NextResponse.json({ error: "Izdelek ni najden" }, { status: 404 });
  }
  if (error === "forbidden") {
    return NextResponse.json(
      { error: "Nimate dostopa do tega izdelka" },
      { status: 403 }
    );
  }

  try {
    await db.product.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[api/owner/products/[id]] DELETE napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri brisanju izdelka" },
      { status: 500 }
    );
  }
}
