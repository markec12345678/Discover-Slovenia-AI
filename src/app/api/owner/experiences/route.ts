import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { DESTINATIONS } from "@/lib/slovenia-data";
import { getBetaStatus } from "@/lib/beta";
import type { ExperienceCategory, MarketplacePlan } from "@/lib/marketplace-types";

// Omejitve števila izkušenj glede na paket (izven beta obdobja)
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
  const root = slugify(base) || "izkusnja";
  let slug = root;
  let i = 1;
  while (await db.experience.findUnique({ where: { slug } })) {
    slug = `${root}-${i++}`;
  }
  return slug;
}

// Validacijska shema za novo izkušnjo
const createSchema = z.object({
  name: z.string().min(2, "Ime izkušnje je obvezno"),
  category: z.enum([
    "tour",
    "workshop",
    "tasting",
    "outdoor",
    "cultural",
    "adventure",
    "wellness",
  ]),
  description: z
    .string()
    .min(10, "Kratki opis mora imeti vsaj 10 znakov")
    .max(120, "Kratki opis je omejen na 120 znakov"),
  longDescription: z.string().nullable().optional(),
  destinationId: z.string().nullable().optional(),
  destinationName: z.string().nullable().optional(),
  pricePerPerson: z.number().min(0, "Cena na osebo mora biti pozitivna"),
  durationHours: z.number().min(0.5, "Trajanje mora biti vsaj 0.5 ure"),
  minGroupSize: z.number().int().min(1).default(1),
  maxGroupSize: z.number().int().min(1).default(10),
  languages: z.array(z.string()).default(["sl"]),
  meetingPoint: z.string().nullable().optional(),
  address: z.string().min(3, "Naslov je obvezen"),
  images: z.array(z.string()).default([]),
  providerName: z.string().min(2, "Ime ponudnika je obvezno"),
  providerEmail: z.string().nullable().optional(),
  providerPhone: z.string().nullable().optional(),
  providerWebsite: z.string().nullable().optional(),
  familyFriendly: z.boolean().default(false),
  accessibility: z.boolean().default(false),
});

// GET /api/owner/experiences — vrne vse izkušnje trenutno prijavljenega lastnika
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Niste prijavljeni" },
      { status: 401 }
    );
  }

  try {
    const experiences = await db.experience.findMany({
      where: { ownerId: session.user.id },
      orderBy: { createdAt: "desc" },
    });

    // Razčleni JSON polja (images, languages) — SQLite ne podpira arrayjev
    const parsed = experiences.map((e) => ({
      ...e,
      images: JSON.parse(e.images || "[]") as string[],
      languages: JSON.parse(e.languages || "[]") as string[],
    }));

    return NextResponse.json({
      experiences: parsed,
      total: parsed.length,
    });
  } catch (error) {
    console.error("[api/owner/experiences] GET napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pridobivanju izkušenj" },
      { status: 500 }
    );
  }
}

// POST /api/owner/experiences — ustvari novo izkušnjo za prijavljenega lastnika
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

    // Validacija: max >= min
    if (data.maxGroupSize < data.minGroupSize) {
      return NextResponse.json(
        { error: "Maksimalna skupina ne sme biti manjša od minimalne." },
        { status: 400 }
      );
    }

    // Pridobi lastnika in preštej njegove izkušnje
    const owner = await db.owner.findUnique({
      where: { id: session.user.id },
      select: {
        plan: true,
        email: true,
        _count: { select: { experiences: true } },
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
    if (owner._count.experiences >= limit) {
      return NextResponse.json(
        {
          error:
            limit === Infinity
              ? "Dosežen limit izkušenj."
              : betaStatus.isActive
              ? `Vaš paket (${owner.plan}) omogoča med beta največ ${limit} ${
                  limit === 1 ? "izkušnjo" : limit < 5 ? "izkušnji" : "izkušenj"
                }.`
              : `Vaš paket (${owner.plan}) omogoča največ ${limit} ${
                  limit === 1 ? "izkušnjo" : limit < 5 ? "izkušnji" : "izkušenj"
                }. Nadgradite naročnino za več izkušenj.`,
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

    const experience = await db.experience.create({
      data: {
        name: data.name.trim(),
        slug,
        description: data.description.trim(),
        longDescription: data.longDescription?.trim() || null,
        category: data.category as ExperienceCategory,
        destinationId: data.destinationId || null,
        destinationName: destName,
        pricePerPerson: data.pricePerPerson,
        currency: "EUR",
        durationHours: data.durationHours,
        minGroupSize: data.minGroupSize,
        maxGroupSize: data.maxGroupSize,
        languages: JSON.stringify(data.languages),
        meetingPoint: data.meetingPoint?.trim() || null,
        address: data.address.trim(),
        images: JSON.stringify(data.images),
        providerName: data.providerName.trim(),
        providerEmail: data.providerEmail?.trim() || null,
        providerPhone: data.providerPhone?.trim() || null,
        providerWebsite: data.providerWebsite?.trim() || null,
        // Plan deduje iz owner.plan — owner ne more nastaviti sam
        plan: owner.plan as MarketplacePlan,
        // featured in verified lahko nastavi samo admin
        featured: false,
        verified: false,
        familyFriendly: data.familyFriendly,
        accessibility: data.accessibility,
        ownerId: session.user.id,
      },
    });

    return NextResponse.json({
      success: true,
      experience: {
        ...experience,
        images: JSON.parse(experience.images || "[]") as string[],
        languages: JSON.parse(experience.languages || "[]") as string[],
      },
    });
  } catch (error) {
    console.error("[api/owner/experiences] POST napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri ustvarjanju izkušnje" },
      { status: 500 }
    );
  }
}
