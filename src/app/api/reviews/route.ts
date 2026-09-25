import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { PROVIDER_CONFIRMED_STATUSES } from "@/lib/journey/booking";

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
//   POST /api/reviews  body { productId? | experienceId?, authorName, rating, comment,
//                             plannerSessionKey? }
//                    → { success: true, review: { id, authorName, rating, comment,
//                                                 verified, createdAt } }
//   GET  /api/reviews?productId=xxx  |  ?experienceId=xxx
//                    → { reviews: [{ id, authorName, rating, comment, verified,
//                                    createdAt }] }
//                      (najnovejša prva, limit 20)
//
// Validacija: productId XOR experienceId (ena od obeh, obe ne) + obstojnost
// v DB (404); authorName 2–60 znakov; rating celo število 1–5;
// comment 10–1000 znakov (oboje trim).
//
// TASK 28 (Tier 1 #2) — »OVERJENA REZERVACIJA« (GYG-model zaupanja,
// deterministično, 0 zunanjih odvisnosti):
//   review.verified = SNIMAK ob objavi: takrat je za TARO IZKUŠNJO
//   (experienceId) obstajala potrjena LASTNA rezervacija
//   (JourneyBooking: provider "own" + providerProductId = experience.id +
//   status CONFIRMED/PAID/MODIFIED — isProviderConfirmed). Dve iskreni
//   verigi identitete (nobena ni 100 % — obe sta nadgrajnjeni od brez
//   identitete, kar je status quo):
//     A (prijava):  sessionUser → SavedItinerary.userId → shareId →
//                   own-rezervacija s tem shareId
//     B (anonimno): plannerSessionKey (dsa_planner_sid iz načrtovalnika,
//                   opcijsko v telesu) → JourneyBooking.sessionKey
//   Izdelki (Product) NIKOLI ne dobijo žetona — njihove rezervacije živijo
//   pri zunanjih ponudnikih (affiliate preusmeritve; imp-* ID-ji uvozov se
//   ne povezujejo z našimi izdelki) → deterministične veze NI in je ne
//   izmišljujemo (data honesty). EXTERNAL handoff se NE šteje (potrditev
//   živi pri ponudniku — ne trdimo, da je bila opravljena).
//   Izračun je strežniški (klientovih trditev NE zaupamo — ŽETON se ne
//   poda, se izračuna).
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
  // TASK 28 (Tier 1 #2): opcijska anonimna identiteta seje načrtovalnika
  // (dsa_planner_sid) — strežnik jo uporabi SAMO za poizvedbo obstoječe
  // potrjene lastne rezervacije (žeton se izračuna, nikoli ne zaupa
  // klientovi trditvi).
  plannerSessionKey?: unknown;
}

/** Uspešno validiran target recenzije (natanko en od obeh ID-jev). */
interface ReviewTarget {
  productId?: string;
  experienceId?: string;
}

/** TASK 28: veljaven format seje načrtovalnika (planner-analytics kanon). */
const PLANNER_SESSION_KEY_RE = /^[a-z0-9_-]{8,64}$/i;

/**
 * TASK 28 (Tier 1 #2) — IZRAČUN ŽETONA »overjena rezervacija«.
 *
 * Deterministična poizvedba: obstaja POTRJENA lastna rezervacija (provider
 * "own", providerProductId = targetExperienceId, isProviderConfirmed)
 * katerina koli od:
 *   A) na poti, katere lastnik je PRIJAVLJEN uporabnik (SavedItinerary.userId
 *      = sessionUserId) — veriga za prijavljene;
 *   B) z isto sejo načrtovalnika (sessionKey = plannerSessionKey) — veriga
 *      za anonimne (isti brskalnik/seja, ki je zapisala rezervacijo).
 *
 * Iskrene meje (dokumentirane):
 *   - brez prijave in brez seje → false (ne moremo dokazati → ne trdimo);
 *   - anonimni lastnik poti z editTokenom (userId null, sessionKey
 *     null na rezervaciji s shareId) → NE ujame nobena veriga (iskrena
 *     vrzel — dokumentirana);
 *   - napaka poizvedbe → false (fail-closed za žeton, NE za objavo).
 */
async function computeReviewVerified(options: {
  targetExperienceId: string;
  sessionUserId: string | null;
  plannerSessionKey: string | null;
}): Promise<boolean> {
  const { targetExperienceId, sessionUserId, plannerSessionKey } = options;
  if (!sessionUserId && !plannerSessionKey) return false;

  // Skupni pogoj POTRJENE lastne rezervacije TARO izkušnje — status MORA
  // biti provider-potrjen (CONFIRMED/PAID/MODIFIED, isti vir resnice kot
  // isProviderConfirmed; EXTERNAL/DRAFT/SELECTED iskreno NE štejejo).
  const ownConfirmed = {
    provider: "own",
    providerProductId: targetExperienceId,
    status: { in: PROVIDER_CONFIRMED_STATUSES },
  } as const;

  try {
    // Veriga A: prijavljen lastnik poti (SavedItinerary.userId → shareId).
    if (sessionUserId) {
      const mine = await db.savedItinerary.findMany({
        where: { userId: sessionUserId },
        select: { shareId: true },
      });
      if (mine.length > 0) {
        const viaTrip = await db.journeyBooking.findFirst({
          where: {
            ...ownConfirmed,
            shareId: { in: mine.map((t) => t.shareId) },
          },
          select: { id: true },
        });
        if (viaTrip) return true;
      }
    }

    // Veriga B: ista seja načrtovalnika (efemerne rezervacije brez poti).
    if (plannerSessionKey) {
      const viaSession = await db.journeyBooking.findFirst({
        where: { ...ownConfirmed, sessionKey: plannerSessionKey },
        select: { id: true },
      });
      if (viaSession) return true;
    }
  } catch (error) {
    // Fail-closed SAMO za žeton: napaka dokaza pomeni »ne moremo potrditi«,
    // objava mnenja samo nadaljuje (iskrena meja, ne tiho lažno true).
    console.error("[reviews] computeReviewVerified napaka:", error);
    return false;
  }

  return false;
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
    // HARDENING M3: recenzije sprejemamo SAMO za OBJAVLJENE izdelke —
    // prej je obstoj zadostoval (recenzija za pending/rejected izdelek je
    // čakala v bazi in se pokazala ob objavi).
    const exists = await db.product.findUnique({
      where: { id: productIdRaw },
      select: { id: true, status: true },
    });
    if (!exists || exists.status !== "published") {
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
    // HARDENING M3: enako published-only pravilo za izkušnje.
    const exists = await db.experience.findUnique({
      where: { id: experienceIdRaw },
      select: { id: true, status: true },
    });
    if (!exists || exists.status !== "published") {
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

    // TASK 28 (Tier 1 #2): žeton izračuna STREŽNIK ob objavi (snimak).
    // plannerSessionKey je opcijsen in validiran po formatu; sejo uporabi
    // SAMO za poizvedbo rezervacije (nikoli se ne shrani na mnenje).
    const b = (raw ?? {}) as ReviewBody;
    const plannerSessionKey =
      typeof b.plannerSessionKey === "string" &&
      PLANNER_SESSION_KEY_RE.test(b.plannerSessionKey.trim())
        ? b.plannerSessionKey.trim()
        : null;

    let sessionUserId: string | null = null;
    try {
      const session = (await getServerSession(authOptions)) as {
        user?: { id?: string; accountType?: string };
      } | null;
      if (session?.user?.id && session.user.accountType === "user") {
        sessionUserId = session.user.id;
      }
    } catch {
      // napaka seje = anonimno (veriga A odpade, iskreno)
    }

    // Žeton SAMO za izkušnje (izdelki nimajo deterministične veze — glej
    // glavo datoteke). NE čitamo obstoječe rezervacije za izdelek.
    const verified = target.experienceId
      ? await computeReviewVerified({
          targetExperienceId: target.experienceId,
          sessionUserId,
          plannerSessionKey,
        })
      : false;

    const review = await db.review.create({
      data: { ...target, authorName, rating, comment, verified },
      select: {
        id: true,
        authorName: true,
        rating: true,
        comment: true,
        verified: true,
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
      // 1.88.1 (FINAL ACCEPTANCE F-A): obstojnost sama ni dovolj — UGC
      // recenzije NEOBJAVLJENEGA (draft/pending/rejected) izdelka so bile
      // javno berljive. Uniformni 404 (isti kanon kot M2 track/reviews
      // vrata: neizdano ne obstaja za javnost).
      const exists = await db.product.findUnique({
        where: { id: productId },
        select: { id: true, status: true },
      });
      if (!exists || exists.status !== "published") {
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
      // 1.88.1 (F-A): enaka published vrata kot izdelek zgoraj.
      const exists = await db.experience.findUnique({
        where: { id: experienceId },
        select: { id: true, status: true },
      });
      if (!exists || exists.status !== "published") {
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
        verified: true,
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
