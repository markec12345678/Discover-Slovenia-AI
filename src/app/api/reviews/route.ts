import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

// ============================================================================
// REVIEWS — UGC mnenja obiskovalcev za izdelke in izkušnje tržnice
// ============================================================================
//
// Social proof na monetizacijskih poteh (košarica + rezervacije):
// anonimni obiskovalci objavijo mnenje (ime, ocena 1–5, komentar).
//
// NAMENOMA ločeno od Product.rating / Experience.rating (demo podatki
// iz CSV-seeda) — UGC povprečje se izračuna iz teh vrstic, ne meša se
// z demo vrednostmi.
//
// Kontrakt (konsumira ga ReviewSection / 10-a frontend):
//   POST /api/reviews  body { productId? | experienceId?, authorName, rating, comment }
//                    → { success: true, review: { id, authorName, rating, comment, createdAt } }
//   GET  /api/reviews?productId=xxx  |  ?experienceId=xxx
//                    → { reviews: [{ id, authorName, rating, comment, createdAt }] }
//                      (najnovejša prva, limit 20)
//
// Validacija: productId XOR experienceId (ena od obeh, obe ne) + obstojnost
// v DB (404); authorName 2–60 znakov; rating celo število 1–5;
// comment 10–1000 znakov (oboje trim).
// ============================================================================

const HOUR_MS = 60 * 60_000;
const GET_LIMIT = 20;

/** Veljaven ID (cuid: alfanumerični) — preveri samo obliko, obstojnost v DB. */
const ID_RE = /^[a-zA-Z0-9]{1,64}$/;

interface ReviewBody {
  productId?: unknown;
  experienceId?: unknown;
  authorName?: unknown;
  rating?: unknown;
  comment?: unknown;
}

/** Uspešno validiran target recenzije (natanko en od obeh ID-jev). */
interface ReviewTarget {
  productId?: string;
  experienceId?: string;
}

/** Skupni validacijski helper → target + ostala polja ali NextResponse. */
async function validateReviewBody(
  raw: unknown
): Promise<
  | {
      ok: true;
      target: ReviewTarget;
      authorName: string;
      rating: number;
      comment: string;
    }
  | { ok: false; response: NextResponse }
> {
  const b = (raw ?? {}) as ReviewBody;

  // --- productId XOR experienceId (ena od obeh, obe ne) ---
  const productIdRaw =
    typeof b.productId === "string" ? b.productId.trim() : "";
  const experienceIdRaw =
    typeof b.experienceId === "string" ? b.experienceId.trim() : "";

  if (!productIdRaw && !experienceIdRaw) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Manjka ID izdelka ali izkušnje (productId ali experienceId)" },
        { status: 400 }
      ),
    };
  }
  if (productIdRaw && experienceIdRaw) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Navedite samo en ID — izdelek ALI izkušnjo, ne oba" },
        { status: 400 }
      ),
    };
  }

  let target: ReviewTarget;
  if (productIdRaw) {
    if (!ID_RE.test(productIdRaw)) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Neveljaven ID izdelka (productId)" },
          { status: 400 }
        ),
      };
    }
    const exists = await db.product.findUnique({
      where: { id: productIdRaw },
      select: { id: true },
    });
    if (!exists) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Izdelek ne obstaja" },
          { status: 404 }
        ),
      };
    }
    target = { productId: productIdRaw };
  } else {
    if (!ID_RE.test(experienceIdRaw)) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Neveljaven ID izkušnje (experienceId)" },
          { status: 400 }
        ),
      };
    }
    const exists = await db.experience.findUnique({
      where: { id: experienceIdRaw },
      select: { id: true },
    });
    if (!exists) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Izkušnja ne obstaja" },
          { status: 404 }
        ),
      };
    }
    target = { experienceId: experienceIdRaw };
  }

  // --- authorName: 2–60 znakov (trim) ---
  const authorName =
    typeof b.authorName === "string" ? b.authorName.trim() : "";
  if (authorName.length < 2 || authorName.length > 60) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Ime mora imeti 2–60 znakov" },
        { status: 400 }
      ),
    };
  }

  // --- rating: celo število 1–5 (ne niz, ne decimalna) ---
  const ratingRaw = b.rating;
  if (
    typeof ratingRaw !== "number" ||
    !Number.isInteger(ratingRaw) ||
    ratingRaw < 1 ||
    ratingRaw > 5
  ) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Ocena mora biti celo število od 1 do 5" },
        { status: 400 }
      ),
    };
  }

  // --- comment: 10–1000 znakov (trim) ---
  const comment = typeof b.comment === "string" ? b.comment.trim() : "";
  if (comment.length < 10 || comment.length > 1000) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Mnenje mora imeti 10–1000 znakov" },
        { status: 400 }
      ),
    };
  }

  return { ok: true, target, authorName, rating: ratingRaw, comment };
}

// ============================================================================
// POST — objavi novo mnenje
// ============================================================================
export async function POST(request: Request) {
  // UGC je javna potez na pisanje — strožji limit (5/h na IP).
  // LOČEN bucket od GET (ključ "reviews:post") — sicer bi ogledi seznama
  // (GET, isti key) izčrpali piščo kvoto.
  const limited = rateLimit(request, {
    limit: 5,
    windowMs: HOUR_MS,
    key: "reviews:post",
  });
  if (limited) return limited;

  try {
    const raw: unknown = await request.json().catch(() => null);
    const validated = await validateReviewBody(raw);
    if (!validated.ok) return validated.response;
    const { target, authorName, rating, comment } = validated;

    const review = await db.review.create({
      data: { ...target, authorName, rating, comment },
      select: {
        id: true,
        authorName: true,
        rating: true,
        comment: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, review }, { status: 201 });
  } catch (error) {
    console.error("[reviews] POST napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri objavi mnenja" },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET — mnenja za izdelek ali izkušnjo (najnovejša prva, limit 20)
// ============================================================================
export async function GET(request: Request) {
  const limited = rateLimit(request, {
    limit: 240,
    windowMs: HOUR_MS,
    key: "reviews:get",
  });
  if (limited) return limited;

  try {
    const url = new URL(request.url);
    const productId = (url.searchParams.get("productId") ?? "").trim();
    const experienceId = (url.searchParams.get("experienceId") ?? "").trim();

    // Ena od obeh paramterov je obvezna (XOR, enaka logika kot POST)
    if (!productId && !experienceId) {
      return NextResponse.json(
        { error: "Manjka parameter productId ali experienceId" },
        { status: 400 }
      );
    }
    if (productId && experienceId) {
      return NextResponse.json(
        { error: "Navedite samo en parameter — productId ALI experienceId" },
        { status: 400 }
      );
    }

    if (productId) {
      if (!ID_RE.test(productId)) {
        return NextResponse.json(
          { error: "Neveljaven ID izdelka (productId)" },
          { status: 400 }
        );
      }
      const exists = await db.product.findUnique({
        where: { id: productId },
        select: { id: true },
      });
      if (!exists) {
        return NextResponse.json(
          { error: "Izdelek ne obstaja" },
          { status: 404 }
        );
      }
    } else {
      if (!ID_RE.test(experienceId)) {
        return NextResponse.json(
          { error: "Neveljaven ID izkušnje (experienceId)" },
          { status: 400 }
        );
      }
      const exists = await db.experience.findUnique({
        where: { id: experienceId },
        select: { id: true },
      });
      if (!exists) {
        return NextResponse.json(
          { error: "Izkušnja ne obstaja" },
          { status: 404 }
        );
      }
    }

    const reviews = await db.review.findMany({
      where: productId ? { productId } : { experienceId },
      select: {
        id: true,
        authorName: true,
        rating: true,
        comment: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: GET_LIMIT,
    });

    return NextResponse.json({ reviews });
  } catch (error) {
    console.error("[reviews] GET napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pridobivanju mnenj" },
      { status: 500 }
    );
  }
}
