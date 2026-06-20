import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { DESTINATIONS } from "@/lib/slovenia-data";
import type { ExperienceCategory } from "@/lib/marketplace-types";

// Validacijska shema za posodobitev izkušnje
const updateSchema = z.object({
  name: z.string().min(2, "Ime izkušnje je obvezno").optional(),
  category: z
    .enum([
      "tour",
      "workshop",
      "tasting",
      "outdoor",
      "cultural",
      "adventure",
      "wellness",
    ])
    .optional(),
  description: z
    .string()
    .min(10, "Kratki opis mora imeti vsaj 10 znakov")
    .max(120, "Kratki opis je omejen na 120 znakov")
    .optional(),
  longDescription: z.string().nullable().optional(),
  destinationId: z.string().nullable().optional(),
  destinationName: z.string().nullable().optional(),
  pricePerPerson: z
    .number()
    .min(0, "Cena na osebo mora biti pozitivna")
    .optional(),
  durationHours: z.number().min(0.5).optional(),
  minGroupSize: z.number().int().min(1).optional(),
  maxGroupSize: z.number().int().min(1).optional(),
  languages: z.array(z.string()).optional(),
  meetingPoint: z.string().nullable().optional(),
  address: z.string().min(3, "Naslov je obvezen").optional(),
  images: z.array(z.string()).optional(),
  providerName: z.string().min(2, "Ime ponudnika je obvezno").optional(),
  providerEmail: z.string().nullable().optional(),
  providerPhone: z.string().nullable().optional(),
  providerWebsite: z.string().nullable().optional(),
  familyFriendly: z.boolean().optional(),
  accessibility: z.boolean().optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Pomožna funkcija: preveri lastništvo izkušnje
async function getOwnedExperience(id: string, ownerId: string) {
  const experience = await db.experience.findUnique({ where: { id } });
  if (!experience) {
    return { error: "not-found" as const, experience: null };
  }
  if (experience.ownerId !== ownerId) {
    return { error: "forbidden" as const, experience: null };
  }
  return { error: null, experience };
}

// GET /api/owner/experiences/[id] — posamezna izkušnja (samo lastnik)
export async function GET(_request: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Niste prijavljeni" }, { status: 401 });
  }

  const { id } = await params;
  const { error, experience } = await getOwnedExperience(id, session.user.id);
  if (error === "not-found") {
    return NextResponse.json({ error: "Izkušnja ni najdena" }, { status: 404 });
  }
  if (error === "forbidden") {
    return NextResponse.json(
      { error: "Nimate dostopa do te izkušnje" },
      { status: 403 }
    );
  }

  return NextResponse.json({
    experience: {
      ...experience,
      images: JSON.parse(experience.images || "[]") as string[],
      languages: JSON.parse(experience.languages || "[]") as string[],
    },
  });
}

// PUT /api/owner/experiences/[id] — posodobi izkušnjo (samo lastnik)
export async function PUT(request: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Niste prijavljeni" }, { status: 401 });
  }

  const { id } = await params;
  const { error, experience } = await getOwnedExperience(id, session.user.id);
  if (error === "not-found") {
    return NextResponse.json({ error: "Izkušnja ni najdena" }, { status: 404 });
  }
  if (error === "forbidden") {
    return NextResponse.json(
      { error: "Nimate dostopa do te izkušnje" },
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

    // Validacija: max >= min (če sta podana oba ali samo en)
    const newMin = data.minGroupSize ?? experience.minGroupSize;
    const newMax = data.maxGroupSize ?? experience.maxGroupSize;
    if (newMax < newMin) {
      return NextResponse.json(
        { error: "Maksimalna skupina ne sme biti manjša od minimalne." },
        { status: 400 }
      );
    }

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
    let newSlug = experience.slug;
    if (data.name && data.name.trim() !== experience.name) {
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
          .replace(/^-|-$/g, "") || experience.slug;
      let candidate = root;
      let i = 1;
      while (true) {
        const existing = await db.experience.findFirst({
          where: { slug: candidate, NOT: { id } },
        });
        if (!existing) break;
        candidate = `${root}-${i++}`;
      }
      newSlug = candidate;
    }

    const updated = await db.experience.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name.trim() }),
        ...(newSlug !== experience.slug && { slug: newSlug }),
        ...(data.category !== undefined && {
          category: data.category as ExperienceCategory,
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
        ...(data.pricePerPerson !== undefined && {
          pricePerPerson: data.pricePerPerson,
        }),
        ...(data.durationHours !== undefined && {
          durationHours: data.durationHours,
        }),
        ...(data.minGroupSize !== undefined && {
          minGroupSize: data.minGroupSize,
        }),
        ...(data.maxGroupSize !== undefined && {
          maxGroupSize: data.maxGroupSize,
        }),
        ...(data.languages !== undefined && {
          languages: JSON.stringify(data.languages),
        }),
        ...(data.meetingPoint !== undefined && {
          meetingPoint: data.meetingPoint?.trim() || null,
        }),
        ...(data.address !== undefined && { address: data.address.trim() }),
        ...(data.images !== undefined && {
          images: JSON.stringify(data.images),
        }),
        ...(data.providerName !== undefined && {
          providerName: data.providerName.trim(),
        }),
        ...(data.providerEmail !== undefined && {
          providerEmail: data.providerEmail?.trim() || null,
        }),
        ...(data.providerPhone !== undefined && {
          providerPhone: data.providerPhone?.trim() || null,
        }),
        ...(data.providerWebsite !== undefined && {
          providerWebsite: data.providerWebsite?.trim() || null,
        }),
        ...(data.familyFriendly !== undefined && {
          familyFriendly: data.familyFriendly,
        }),
        ...(data.accessibility !== undefined && {
          accessibility: data.accessibility,
        }),
        // Plan, featured in verified se NE posodabljajo preko tega API-ja
      },
    });

    return NextResponse.json({
      success: true,
      experience: {
        ...updated,
        images: JSON.parse(updated.images || "[]") as string[],
        languages: JSON.parse(updated.languages || "[]") as string[],
      },
    });
  } catch (error) {
    console.error("[api/owner/experiences/[id]] PUT napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri posodabljanju izkušnje" },
      { status: 500 }
    );
  }
}

// DELETE /api/owner/experiences/[id] — izbriše izkušnjo (samo lastnik)
export async function DELETE(_request: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Niste prijavljeni" }, { status: 401 });
  }

  const { id } = await params;
  const { error } = await getOwnedExperience(id, session.user.id);
  if (error === "not-found") {
    return NextResponse.json({ error: "Izkušnja ni najdena" }, { status: 404 });
  }
  if (error === "forbidden") {
    return NextResponse.json(
      { error: "Nimate dostopa do te izkušnje" },
      { status: 403 }
    );
  }

  try {
    await db.experience.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[api/owner/experiences/[id]] DELETE napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri brisanju izkušnje" },
      { status: 500 }
    );
  }
}
