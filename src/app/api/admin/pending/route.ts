import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAdmin } from "@/lib/auth-guards";

// GET /api/admin/pending — seznam lokalov ki čakajo na odobritev
// Header: x-admin-password
export async function GET(request: Request) {
  try {
    if (!checkAdmin(request.headers.get("x-admin-password"))) {
      return NextResponse.json({ error: "Neavtorizirano" }, { status: 401 });
    }

    const pending = await db.listing.findMany({
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
        ownerId: true,
        owner: {
          select: { email: true, name: true, businessName: true },
        },
      },
    });

    const parsed = pending.map((l) => ({
      ...l,
      images: JSON.parse(l.images || "[]") as string[],
      submittedAgo: l.submittedAt
        ? Math.round((Date.now() - l.submittedAt.getTime()) / 1000 / 60)
        : null,
    }));

    return NextResponse.json({ pending: parsed, total: parsed.length });
  } catch (error) {
    console.error("[admin/pending] napaka:", error);
    return NextResponse.json({ error: "Napaka" }, { status: 500 });
  }
}
