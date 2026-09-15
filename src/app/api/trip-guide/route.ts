import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

// ============================================================================
// TRIP GUIDE — avtorski vodnik na deljenem potovanju (F7 skupnostni vodniki)
// ============================================================================
//
// Odgovor na MindTrip "community guides (realni avtorji, »Saved by 23«)":
// naš vodnik ni promocijski, temveč KOREKTIVNI — jedro je "verdict"
// (kaj bi avtor storil drugače), kar je izraz našega poštenostnega
// diferenciatorja (noben tekmec ne zbere popotnih popravkov načrta).
//
// Kdo SME pisati/urejati vodnik (anonymous-first, brez računa):
//   1. imetnik TAJNEGA editToken — vrne ga POST /api/itinerary/save
//      IZKLJUČNO shranjevalniku (client ga da v localStorage); v DB je
//      samo SHA-256 hash, ali
//   2. prijavljen uporabnik, ki je pot shranil (SavedItinerary.userId).
//
// Prijavljenim lastnikom poti BREZ žetona (stare poti pred F7) pot 2
// omogoča avtorstvo tudi za njih — anonimni starejši zapisi ga nimajo
// (iskrena omejitev: žetona ni mogoče izdati počasi).
//
// Kontrakt (konsumira ga TripGuide frontend na /pot/[shareId]):
//   PUT /api/trip-guide  body {
//     shareId, editToken?,
//     authorName, intro, verdict?, tips: [{ day?: number|null, text }],
//     lang?: "sl" | "en"
//   }
//   → { success: true, guide: { authorName, intro, verdict, tips, lang,
//                               updatedAt: ISO } }
//
// Upsert po shareId (unique) — ponovno oddajanje = urejanje.
// Javno BRANJE poteka prek RSC (direkten db klic na /pot strani in v
// homepage galeriji) — ta route sprejema SAMO pisanje.
// ============================================================================

const HOUR_MS = 60 * 60_000;

/** Veljaven shareId (hex, max 32 znakov) — enak vzorec kot /pot stran. */
const SHARE_ID_RE = /^[a-z0-9]{1,32}$/;
/** Veljaven editToken (hex, 32–64 znakov — generiramo 32). */
const EDIT_TOKEN_RE = /^[a-f0-9]{32,64}$/;

const AUTHOR_MAX = 60;
const INTRO_MIN = 2;
const INTRO_MAX = 500;
const VERDICT_MAX = 500;
const TIP_TEXT_MIN = 2;
const TIP_TEXT_MAX = 280;
const TIPS_MAX = 6;
const DAY_MAX = 14;

interface TipInput {
  day?: unknown;
  text?: unknown;
}

interface GuideBody {
  shareId?: unknown;
  editToken?: unknown;
  authorName?: unknown;
  intro?: unknown;
  verdict?: unknown;
  tips?: unknown;
  lang?: unknown;
}

/** Normaliziran nasvet po validaciji (serializira se v DB kot JSON). */
interface StoredTip {
  day: number | null;
  text: string;
}

/** Validiraj in normaliziraj seznam nasvetov — vrne null ob napaki. */
function parseTips(raw: unknown): StoredTip[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > TIPS_MAX) {
    return null;
  }
  const tips: StoredTip[] = [];
  for (const item of raw as TipInput[]) {
    if (typeof item !== "object" || item === null) return null;
    const text =
      typeof item.text === "string" ? item.text.trim() : "";
    if (text.length < TIP_TEXT_MIN || text.length > TIP_TEXT_MAX) return null;

    let day: number | null = null;
    if (item.day !== null && item.day !== undefined) {
      if (
        typeof item.day !== "number" ||
        !Number.isInteger(item.day) ||
        item.day < 1 ||
        item.day > DAY_MAX
      ) {
        return null;
      }
      day = item.day;
    }
    tips.push({ day, text });
  }
  return tips;
}

// ============================================================================
// PUT — shrani (upsert) vodnik
// ============================================================================
export async function PUT(request: Request) {
  const limited = rateLimit(request, {
    limit: 20,
    windowMs: HOUR_MS,
    key: "trip-guide",
  });
  if (limited) return limited;

  try {
    const raw: unknown = await request.json().catch(() => null);
    const b = (raw ?? {}) as GuideBody;

    // === Osnovna validacija formata ===
    const shareId =
      typeof b.shareId === "string" ? b.shareId.trim().toLowerCase() : "";
    if (!SHARE_ID_RE.test(shareId)) {
      return NextResponse.json(
        { error: "Manjka ali neveljaven ID deljenega potovanja (shareId)" },
        { status: 400 }
      );
    }

    const editToken =
      typeof b.editToken === "string" ? b.editToken.trim().toLowerCase() : "";

    const authorName =
      typeof b.authorName === "string" ? b.authorName.trim() : "";
    if (authorName.length < 1 || authorName.length > AUTHOR_MAX) {
      return NextResponse.json(
        { error: "Avtorsko ime mora imeti 1–60 znakov" },
        { status: 400 }
      );
    }

    const intro = typeof b.intro === "string" ? b.intro.trim() : "";
    if (intro.length < INTRO_MIN || intro.length > INTRO_MAX) {
      return NextResponse.json(
        { error: "Uvod vodnika mora imeti 2–500 znakov" },
        { status: 400 }
      );
    }

    const verdictRaw =
      typeof b.verdict === "string" ? b.verdict.trim() : "";
    if (verdictRaw.length > VERDICT_MAX) {
      return NextResponse.json(
        { error: "»Kaj bi storil drugače« je omejen na 500 znakov" },
        { status: 400 }
      );
    }
    const verdict = verdictRaw.length > 0 ? verdictRaw : null;

    const tips = parseTips(b.tips);
    if (!tips) {
      return NextResponse.json(
        {
          error: `Nasveti: 1–${TIPS_MAX} kosov, vsak 2–${TIP_TEXT_MAX} znakov, dan 1–${DAY_MAX} ali brez`,
        },
        { status: 400 }
      );
    }

    const lang = b.lang === "en" ? "en" : "sl";

    // === Avtorizacija: pot mora obstajati + lastništvo ===
    const saved = await db.savedItinerary.findUnique({
      where: { shareId },
      select: { editTokenHash: true, userId: true },
    });
    if (!saved) {
      return NextResponse.json(
        { error: "Deljeno potovanje ne obstaja" },
        { status: 404 }
      );
    }

    let isOwner = false;

    // Pot 1: tajni žeton (anonimni lastnik — hash primerjava)
    if (editToken && EDIT_TOKEN_RE.test(editToken) && saved.editTokenHash) {
      const tokenHash = createHash("sha256")
        .update(editToken)
        .digest("hex");
      isOwner = tokenHash === saved.editTokenHash;
    }

    // Pot 2: prijavljen lastnik (SavedItinerary.userId) — pokrije tudi
    // stare poti brez žetona, če jih je shranil prijavljen uporabnik
    if (!isOwner) {
      try {
        const session = await getServerSession(authOptions);
        if (
          session?.user?.accountType === "user" &&
          session.user.id &&
          session.user.id === saved.userId
        ) {
          isOwner = true;
        }
      } catch (e) {
        // Napaka sessiona pomeni le, da poti 2 ni mogoče preveriti —
        // nadaljuj z rezultatom poti 1 (žeton).
        console.error("[trip-guide] session napaka (preverjam samo žeton):", e);
      }
    }

    if (!isOwner) {
      return NextResponse.json(
        {
          error:
            "Vodnik lahko ureja le lastnik te poti (povezavo odpri v brskalniku, kjer si pot shranil)",
        },
        { status: 403 }
      );
    }

    // === Upsert (unique shareId) ===
    const guide = await db.tripGuide.upsert({
      where: { shareId },
      update: { authorName, intro, verdict, tips: JSON.stringify(tips), lang },
      create: {
        shareId,
        authorName,
        intro,
        verdict,
        tips: JSON.stringify(tips),
        lang,
      },
      select: {
        authorName: true,
        intro: true,
        verdict: true,
        tips: true,
        lang: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      guide: {
        authorName: guide.authorName,
        intro: guide.intro,
        verdict: guide.verdict,
        tips: JSON.parse(guide.tips) as StoredTip[],
        lang: guide.lang,
        updatedAt: guide.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("[trip-guide] PUT napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri shranjevanju vodnika" },
      { status: 500 }
    );
  }
}
