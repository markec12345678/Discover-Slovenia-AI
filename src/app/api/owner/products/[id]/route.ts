import { NextResponse } from "next/server";
import { safeWebsiteSchema } from "@/lib/external-url";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { db } from "@/lib/db";
import { invalidateMarketplaceCache } from "@/lib/marketplace-cache";
import { authOptions } from "@/lib/auth";
import { DESTINATIONS } from "@/lib/slovenia-data";
import type { ProductCategory } from "@/lib/marketplace-types";
import { rateLimit } from "@/lib/rate-limit";

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
  price: z
    .number()
    // 19-f-7 (revizija 1.36.0, P3): prej min(0) — 0 je šel skozi kljub
    // sporočilu "pozitivna" (€0 izkušnja → €0 provizijski račun), brez
    // zgornje meje pa je 1e308 naredil Infinity skupno vrednost rezervacije.
    .min(0.01, "Cena mora biti pozitivna (vsaj 0,01 €)")
    .max(100_000, "Cena je pretirana (max 100.000 €)")
    .optional(),
  compareAtPrice: z
    .number()
    .min(0.01)
    .max(100_000)
    .nullable()
    .optional(),
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
  sellerWebsite: safeWebsiteSchema,
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
export async function GET(request: Request, { params }: RouteParams) {
  // ISSUE #4 §24 (VAL 8, P3): session-gated owner API brez abuse-meje —
  // skupni bucket "owner-api" (vzorec requireAdmin "admin-any").
  const limited = rateLimit(request, {
    limit: 120,
    windowMs: 60_000,
    key: "owner-api",
  });
  if (limited) return limited;

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
  // ISSUE #4 §24 (VAL 8, P3): session-gated owner API brez abuse-meje —
  // skupni bucket "owner-api" (vzorec requireAdmin "admin-any").
  const limited = rateLimit(request, {
    limit: 120,
    windowMs: 60_000,
    key: "owner-api",
  });
  if (limited) return limited;

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

    // P3c-9: RE-MODERACIJA — vsebinska sprememba objavljenega zapisa vrne
    // izdelek nazaj v pregled (enako kot pri lokalih). Vključno z zavrnjenimi:
    // izdelki/izkušnje nimajo ločene "oddaj v pregled" rute (kot jo imajo
    // lokalci), zato popravek + shrani = ponovna oddaja. Pending zapisi
    // ostanejo kot so (že v čakalni vrsti).
    // 19-f-4 (revizija 1.36.0, P2): FW1 re-moderacijska razširitev iz
    // izkušenj (tiha €40→€400 sprememba cene) NI bila prenesena na izdelke —
    // cena/zaloga/prodajalec na OBJAVLJENEM izdelku so šli takoj v živo
    // (checkout bere DB ceno). Od tu naprej del "vsebinske" spremembe.
    const contentChanged =
      (data.name !== undefined && data.name.trim() !== product.name) ||
      // HARDENING M4: kategorija žene javno filtriranje/taksonomijo
      (data.category !== undefined && data.category !== product.category) ||
      (data.description !== undefined &&
        data.description.trim() !== product.description) ||
      (data.longDescription !== undefined &&
        (data.longDescription?.trim() || null) !==
          (product.longDescription || null)) ||
      (data.images !== undefined &&
        JSON.stringify(data.images) !== product.images) ||
      // 19-f-4: denarni/pogodbeni pogoji
      (data.price !== undefined && data.price !== product.price) ||
      (data.compareAtPrice !== undefined &&
        (data.compareAtPrice ?? null) !== (product.compareAtPrice ?? null)) ||
      (data.stock !== undefined && data.stock !== product.stock) ||
      // 19-f-4: kontakt prodajalca
      (data.sellerName !== undefined &&
        data.sellerName.trim() !== product.sellerName) ||
      (data.sellerEmail !== undefined &&
        (data.sellerEmail?.trim() || null) !== (product.sellerEmail || null)) ||
      // HARDENING M4: javni kontakt/trditve izdelka — telefon, spletna stran
      // prodajalca in marketinške trditve (organic/handmade/vegan/local) se
      // izpisujejo na javnem profilu izdelka → so VSEBINA.
      (data.sellerPhone !== undefined &&
        (data.sellerPhone?.trim() || null) !== (product.sellerPhone || null)) ||
      (data.sellerWebsite !== undefined &&
        (data.sellerWebsite?.trim() || null) !==
          (product.sellerWebsite || null)) ||
      (data.organic !== undefined && data.organic !== product.organic) ||
      (data.handmade !== undefined && data.handmade !== product.handmade) ||
      (data.local !== undefined && data.local !== product.local) ||
      (data.vegan !== undefined && data.vegan !== product.vegan);
    const needsReModeration =
      contentChanged &&
      (product.status === "published" || product.status === "rejected");

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
        ...(needsReModeration && {
          status: "pending",
          submittedAt: new Date(),
          rejectionReason: null,
        }),
      },
    });

    // 1.88.1 (F-C): objavljena vsebina je pravšla v pending — SEO
    // predpomnilnik takoj izpusti staro objavljeno različico (prej do 1 h).
    if (needsReModeration) {
      invalidateMarketplaceCache("owner-product-put");
    }

    return NextResponse.json({
      success: true,
      // P3c-9: flag za UI — vsebina gre nazaj v admin pregled
      ...(needsReModeration && { reSubmission: true }),
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
export async function DELETE(request: Request, { params }: RouteParams) {
  // ISSUE #4 §24 (VAL 8, P3): session-gated owner API brez abuse-meje —
  // skupni bucket "owner-api" (vzorec requireAdmin "admin-any").
  const limited = rateLimit(request, {
    limit: 120,
    windowMs: 60_000,
    key: "owner-api",
  });
  if (limited) return limited;

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
    // 1.88.1 (F-C): izbrisana vsebina takoj izpade iz javnih površin.
    invalidateMarketplaceCache("owner-product-delete");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[api/owner/products/[id]] DELETE napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri brisanju izdelka" },
      { status: 500 }
    );
  }
}
