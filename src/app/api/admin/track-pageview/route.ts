import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizePath } from "@/lib/sitemap-urls";

// POST /api/admin/track-pageview — beleži ogled strani v PageView tabelo
// Telo: { path: string, title?: string, referrer?: string }
//
// Endpoint je javen (brez admin gesla) — namenjen je klicu iz <PageViewTracker>
// komponente na strani, da beleži realne uporabniške ogledi.
//
// Za sledenje listingom (z listingId) uporabljamo /api/listings/[slug]/track
// ali /api/experiences/[slug]/track — ta endpoint je zgolj za path tracking.
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null);
    if (typeof body !== "object" || body === null) {
      return NextResponse.json(
        { error: "Neveljaven JSON" },
        { status: 400 },
      );
    }

    const rawPath = (body as Record<string, unknown>).path;
    const title = (body as Record<string, unknown>).title;
    const referrer = (body as Record<string, unknown>).referrer;

    if (typeof rawPath !== "string" || !rawPath.trim()) {
      return NextResponse.json(
        { error: "Manjka 'path'" },
        { status: 400 },
      );
    }

    const path = normalizePath(rawPath);

    // Basic sanitizacija — omeji dolžino
    if (path.length > 500) {
      return NextResponse.json(
        { error: "Predolg path" },
        { status: 400 },
      );
    }

    const pageView = await db.pageView.create({
      data: {
        path,
        title: typeof title === "string" ? title.slice(0, 500) : null,
        referrer:
          typeof referrer === "string" ? referrer.slice(0, 500) : null,
      },
      select: { id: true, path: true, createdAt: true },
    });

    return NextResponse.json({ success: true, pageView });
  } catch (error) {
    console.error("[admin/track-pageview] napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri beleženju ogleda" },
      { status: 500 },
    );
  }
}
