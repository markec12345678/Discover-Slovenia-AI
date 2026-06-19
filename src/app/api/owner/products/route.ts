import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { DESTINATIONS } from "@/lib/slovenia-data";
import { getBetaStatus } from "@/lib/beta";
import type { ProductCategory, MarketplacePlan } from "@/lib/marketplace-types";

// Omejitve števila izdelkov glede na paket (izven beta obdobja)
const PLAN_LIMITS_NORMAL: Record<MarketplacePlan, number> = {
  free: 1,
  premium: 5,
  enterprise: Infinity,
};

// Omejitve med beta obdobjem (bolj radodarne)
const PLAN_LIMITS_BETA: Record<MarketplacePlan, number> = {
  free: 3,
  premium: 10,
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
  const root = slugify(base) || "izdelek";
  let slug = root;
  let i = 1;
  while (await db.product.findUnique({ where: { slug } })) {
    slug = `${root}-${i++}`;
  }
  return slug;
}

// Validacijska shema za nov product
const createSchema = z.object({
  name: z.string().min(2, "Ime izdelka je obvezno"),
  category: z.enum([
    "food",
    "wine",
    "honey",
    "oil",
    "craft",
    "souvenir",
    "other",
  ]),
  description: z
    .string()
    .min(10, "Kratki opis mora imeti vsaj 10 znakov")
    .max(120, "Kratki opis je omejen na 120 znakov"),
  longDescription: z.string().nullable().optional(),
  destinationId: z.string().nullable().optional(),
  destinationName: z.string().nullable().optional(),
  price: z.number().min(0, "Cena mora biti pozitivna"),
  compareAtPrice: z.number().min(0).nullable().optional(),
  stock: z.number().int().min(0).default(0),
  weight: z.number().min(0).nullable().optional(),
  images: z.array(z.string()).default([]),
  organic: z.boolean().default(false),
  handmade: z.boolean().default(false),
  local: z.boolean().default(true),
  vegan: z.boolean().default(false),
  shippingFree: z.boolean().default(false),
  shipsEurope: z.boolean().default(true),
  shipsWorldwide: z.boolean().default(false),
  sellerName: z.string().min(2, "Ime prodajalca je obvezno"),
  sellerEmail: z.string().nullable().optional(),
  sellerPhone: z.string().nullable().optional(),
  sellerWebsite: z.string().nullable().optional(),
});

// GET /api/owner/products — vrne vse izdelke trenutno prijavljenega lastnika
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Niste prijavljeni" },
      { status: 401 }
    );
  }

  try {
    const products = await db.product.findMany({
      where: { ownerId: session.user.id },
      orderBy: { createdAt: "desc" },
    });

    // Razčleni JSON polja (images) — SQLite ne podpira arrayjev
    const parsed = products.map((p) => ({
      ...p,
      images: JSON.parse(p.images || "[]") as string[],
    }));

    return NextResponse.json({ products: parsed, total: parsed.length });
  } catch (error) {
    console.error("[api/owner/products] GET napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pridobivanju izdelkov" },
      { status: 500 }
    );
  }
}

// POST /api/owner/products — ustvari nov product za prijavljenega lastnika
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

    // Pridobi lastnika in preštej njegove izdelke
    const owner = await db.owner.findUnique({
      where: { id: session.user.id },
      select: {
        plan: true,
        email: true,
        _count: { select: { products: true } },
      },
    });
    if (!owner) {
      return NextResponse.json(
        { error: "Lastnik ne obstaja" },
        { status: 404 }
      );
    }

    // Preveri beta status — v beta načinu so limiti radodarnejši
    const betaStatus = await getBetaStatus();
    const limits = betaStatus.isActive ? PLAN_LIMITS_BETA : PLAN_LIMITS_NORMAL;

    const limit = limits[owner.plan as MarketplacePlan] ?? 1;
    if (owner._count.products >= limit) {
      return NextResponse.json(
        {
          error:
            limit === Infinity
              ? "Dosežen limit izdelkov."
              : betaStatus.isActive
              ? `Vaš paket (${owner.plan}) omogoča med beta največ ${limit} ${
                  limit === 1 ? "izdelek" : limit < 5 ? "izdelka" : "izdelkov"
                }.`
              : `Vaš paket (${owner.plan}) omogoča največ ${limit} ${
                  limit === 1 ? "izdelek" : limit < 5 ? "izdelka" : "izdelkov"
                }. Nadgradite naročnino za več izdelkov.`,
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

    const product = await db.product.create({
      data: {
        name: data.name.trim(),
        slug,
        description: data.description.trim(),
        longDescription: data.longDescription?.trim() || null,
        category: data.category as ProductCategory,
        destinationId: data.destinationId || null,
        destinationName: destName,
        price: data.price,
        compareAtPrice: data.compareAtPrice ?? null,
        currency: "EUR",
        images: JSON.stringify(data.images),
        stock: data.stock,
        weight: data.weight ?? null,
        organic: data.organic,
        handmade: data.handmade,
        local: data.local,
        vegan: data.vegan,
        // Plan deduje iz owner.plan — owner ne more nastaviti sam
        plan: owner.plan as MarketplacePlan,
        // featured in verified lahko nastavi samo admin
        featured: false,
        verified: false,
        shippingFree: data.shippingFree,
        shipsEurope: data.shipsEurope,
        shipsWorldwide: data.shipsWorldwide,
        sellerName: data.sellerName.trim(),
        sellerEmail: data.sellerEmail?.trim() || null,
        sellerPhone: data.sellerPhone?.trim() || null,
        sellerWebsite: data.sellerWebsite?.trim() || null,
        ownerId: session.user.id,
      },
    });

    return NextResponse.json({
      success: true,
      product: {
        ...product,
        images: JSON.parse(product.images || "[]") as string[],
      },
    });
  } catch (error) {
    console.error("[api/owner/products] POST napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri ustvarjanju izdelka" },
      { status: 500 }
    );
  }
}
