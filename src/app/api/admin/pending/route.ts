import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAdmin } from "@/lib/auth-guards";

// GET /api/admin/pending — seznam vsebin, ki čakajo na odobritev
// Header: x-admin-password
//
// P3c-9: poleg lokalov vrne TUDI pending izdelke in izkušnje tržnice.
// Vsak zapis ima polje `type`: "listing" | "product" | "experience".
// Listingi ohranjajo prvotno obliko polj (backward kompatibilnost —
// type je pri njih dodan eksplicitno). Skupni vrstni red: submittedAt
// (?? createdAt) asc čez vse tipe — najstarejša oddaja prva na vrsti.
export async function GET(request: Request) {
  try {
    if (!checkAdmin(request.headers.get("x-admin-password"))) {
      return NextResponse.json({ error: "Neavtorizirano" }, { status: 401 });
    }

    const ownerSelect = {
      select: { email: true, name: true, businessName: true },
    } as const;

    const [pendingListings, pendingProducts, pendingExperiences] =
      await Promise.all([
        db.listing.findMany({
          where: { status: "pending" },
          orderBy: { submittedAt: "asc" },
          select: {
            id: true,
            name: true,
            slug: true,
            category: true,
            destinationName: true,
            address: true,
            phone: true,
            email: true,
            website: true,
            description: true,
            images: true,
            submittedAt: true,
            createdAt: true,
            ownerId: true,
            owner: ownerSelect,
          },
        }),
        db.product.findMany({
          where: { status: "pending" },
          orderBy: { submittedAt: "asc" },
          select: {
            id: true,
            name: true,
            slug: true,
            category: true,
            destinationName: true,
            description: true,
            images: true,
            submittedAt: true,
            createdAt: true,
            ownerId: true,
            owner: ownerSelect,
          },
        }),
        db.experience.findMany({
          where: { status: "pending" },
          orderBy: { submittedAt: "asc" },
          select: {
            id: true,
            name: true,
            slug: true,
            category: true,
            destinationName: true,
            description: true,
            images: true,
            submittedAt: true,
            createdAt: true,
            ownerId: true,
            owner: ownerSelect,
          },
        }),
      ]);

    // Združi vse tipe v skupno čakalno vrsto (najstarejša oddaja prva)
    const items = [
      ...pendingListings.map((l) => ({
        type: "listing" as const,
        id: l.id,
        name: l.name,
        slug: l.slug,
        category: l.category,
        destinationName: l.destinationName,
        address: l.address,
        phone: l.phone,
        email: l.email,
        website: l.website,
        description: l.description,
        images: JSON.parse(l.images || "[]") as string[],
        submittedAt: l.submittedAt,
        submittedAgo: minutesAgo(l.submittedAt ?? l.createdAt),
        ownerId: l.ownerId,
        owner: l.owner,
        _sortAt: l.submittedAt ?? l.createdAt,
      })),
      ...pendingProducts.map((p) => ({
        type: "product" as const,
        id: p.id,
        name: p.name,
        slug: p.slug,
        category: p.category,
        destinationName: p.destinationName,
        description: p.description,
        images: JSON.parse(p.images || "[]") as string[],
        submittedAt: p.submittedAt,
        submittedAgo: minutesAgo(p.submittedAt ?? p.createdAt),
        ownerId: p.ownerId,
        owner: p.owner,
        _sortAt: p.submittedAt ?? p.createdAt,
      })),
      ...pendingExperiences.map((e) => ({
        type: "experience" as const,
        id: e.id,
        name: e.name,
        slug: e.slug,
        category: e.category,
        destinationName: e.destinationName,
        description: e.description,
        images: JSON.parse(e.images || "[]") as string[],
        submittedAt: e.submittedAt,
        submittedAgo: minutesAgo(e.submittedAt ?? e.createdAt),
        ownerId: e.ownerId,
        owner: e.owner,
        _sortAt: e.submittedAt ?? e.createdAt,
      })),
    ].sort((a, b) => a._sortAt.getTime() - b._sortAt.getTime());

    // Čist odgovor brez pomožnega _sortAt polja
    const pending = items.map(({ _sortAt: _ignored, ...rest }) => rest);

    return NextResponse.json({ pending, total: pending.length });
  } catch (error) {
    console.error("[admin/pending] napaka:", error);
    return NextResponse.json({ error: "Napaka" }, { status: 500 });
  }
}

// Minute od oddaje (za prikaz "oddano pred X")
function minutesAgo(date: Date): number | null {
  return Math.round((Date.now() - date.getTime()) / 1000 / 60);
}
