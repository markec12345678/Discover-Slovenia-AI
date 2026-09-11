import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAdmin } from "@/lib/auth-guards";
import { rateLimit } from "@/lib/rate-limit";

// POST /api/newsletter/subscribe — prijava na newsletter
// P6: prej data/newsletter.json (fs write — na Vercelu read-only/efemeren FS,
// podatki so izginevali ob vsakem deployu). Zdaj PostgreSQL (NewsletterSubscriber),
// enako kot Lead. Duplikat = idempotentna prijava.
export async function POST(request: Request) {
    // Rate limit prijav na newsletter
    const limited = rateLimit(request, { limit: 10, windowMs: 3600000, key: "newsletter" });
    if (limited) return limited;

  try {
    const { email, source } = (await request.json()) as { email?: string; source?: string };

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Veljaven email je obvezen" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const validSource = source === "itinerary_email" ? "itinerary_email" : "homepage";

    // Idempotentna prijava (duplikat ne vrača napake)
    const existing = await db.newsletterSubscriber.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ success: true, message: "Že prijavljen!" });
    }

    await db.newsletterSubscriber.create({
      data: { email: normalizedEmail, source: validSource },
    });

    return NextResponse.json({ success: true, message: "Uspešno prijavljen!" });
  } catch (error) {
    // Tekmovalni dvojni insert (isti email hkrati) → obravnavaj kot uspeh
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return NextResponse.json({ success: true, message: "Že prijavljen!" });
    }
    console.error("[newsletter] napaka:", error);
    return NextResponse.json({ error: "Napaka pri prijavi" }, { status: 500 });
  }
}

// GET — število naročnikov (admin only — x-admin-password, P6: prej javen count)
export async function GET(request: Request) {
  try {
    if (!checkAdmin(request.headers.get("x-admin-password"))) {
      return NextResponse.json({ error: "Neavtorizirano" }, { status: 401 });
    }
    const [count, latest] = await Promise.all([
      db.newsletterSubscriber.count(),
      db.newsletterSubscriber.findFirst({
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
    ]);
    return NextResponse.json({ count, latest: latest?.createdAt ?? null });
  } catch (error) {
    console.error("[newsletter] GET napaka:", error);
    return NextResponse.json({ error: "Napaka" }, { status: 500 });
  }
}
