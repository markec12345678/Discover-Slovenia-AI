import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

// ============================================================================
// TRIP DIARY — skupinski potni dnevnik na deljenem potovanju (F12, vrzel #3)
// ============================================================================
//
// Brez-računa zapisovanje spominov na javni strani /pot/[shareId]. Stippl
// ponuja "travel reel / photobook" (foto-video) — naš pošteni pristop je
// TEKSTOVNI dnevnik: vsak vpis je povezan z dnevom načrta (dayIndex), lahko
// nosi kraj (placeName) in oceno 1–5 (rating). Natisnjena stran = naš
// "photobook" (PDF). BREZ slik: zasebnost (upload = zasebne fotografije) in
// ni stroškov shrambe — iskreno razkrito v UI in dokumentaciji.
//
// Enako anonimno identiteto kot ostale socialne funkcije: clientId iz
// localStorage ("discoverslovenia_voter").
//
// Kontrakt (konsumira ga TripDiary / F12 frontend):
//   GET    /api/diary?shareId=xxx&clientId=yyy
//          → { entries: [{ id, dayIndex, placeName, rating, text,
//                          authorName, createdAt, updatedAt, isAuthor }] }
//   POST   /api/diary   body { shareId, dayIndex?, placeName?, rating?,
//                              text, authorName?, clientId }
//          → { success: true, entry: {...} }   (max 200 vpisov/trip,
//                                               max 20 vpisov/avtor/trip)
//   PATCH  /api/diary   body { entryId, clientId, dayIndex?, placeName?,
//                              rating?, text? }
//          → { success: true, entry: {...} }   (samo avtor vpisa)
//   DELETE /api/diary   body { entryId, clientId }
//          → { success: true }                 (samo avtor vpisa)
//
// Validacija: shareId hex ≤ 32; text 2–2000; dayIndex 1–99 (opcijsko);
// placeName 1–80 (opcijsko); rating 1–5 (opcijsko); authorName 1–60
// (opcijsko); clientId 8–64. Potovanje mora obstajati.
// ============================================================================

const HOUR_MS = 60 * 60_000;

/** Veljaven shareId (hex, max 32 znakov) — enak vzorec kot /pot stran. */
const SHARE_ID_RE = /^[a-z0-9]{1,32}$/;
/** Veljaven clientId (enak vzorec kot trip-vote / trip-social / poll). */
const CLIENT_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;
/** Veljaven entryId (cuid). */
const ENTRY_ID_RE = /^[a-zA-Z0-9]{20,40}$/;

const TEXT_MIN = 2;
const TEXT_MAX = 2000;
const PLACE_MAX = 80;
const AUTHOR_NAME_MAX = 60;
const DAY_INDEX_MIN = 1;
const DAY_INDEX_MAX = 99;
/** Zgornja meja vpisov na potovanje (preprečuje smeti). */
const ENTRIES_MAX = 200;
/** Zgornja meja vpisov enega avtorja na potovanje. */
const AUTHOR_ENTRIES_MAX = 20;

/** Serializiran vpis dnevnika za frontend. */
export interface DiaryEntryDTO {
  id: string;
  dayIndex: number | null;
  placeName: string | null;
  rating: number | null;
  text: string;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
  /** Ali je trenutni clientId avtor vpisa (lahko ureja/izbriše). */
  isAuthor: boolean;
}

interface DiaryBody {
  shareId?: unknown;
  entryId?: unknown;
  dayIndex?: unknown;
  placeName?: unknown;
  rating?: unknown;
  text?: unknown;
  authorName?: unknown;
  clientId?: unknown;
}

type EntryRow = {
  id: string;
  dayIndex: number | null;
  placeName: string | null;
  rating: number | null;
  text: string;
  authorName: string | null;
  createdAt: Date;
  updatedAt: Date;
  authorClientId?: string;
};

/** Polja, ki jih vedno izberemo (authorClientId ostane zaseben v DTO). */
const ENTRY_SELECT = {
  id: true,
  dayIndex: true,
  placeName: true,
  rating: true,
  text: true,
  authorName: true,
  createdAt: true,
  updatedAt: true,
  authorClientId: true,
} as const;

/** Pretvori vrstico TripDiaryEntry v DiaryEntryDTO. */
function toDTO(entry: EntryRow, clientId: string | null): DiaryEntryDTO {
  return {
    id: entry.id,
    dayIndex: entry.dayIndex,
    placeName: entry.placeName,
    rating: entry.rating,
    text: entry.text,
    authorName: entry.authorName,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
    isAuthor:
      clientId !== null && entry.authorClientId !== undefined
        ? entry.authorClientId === clientId
        : false,
  };
}

/** Preveri, da potovanje obstaja (404 sicer). */
async function tripExists(shareId: string): Promise<boolean> {
  const saved = await db.savedItinerary.findUnique({
    where: { shareId },
    select: { id: true },
  });
  return saved !== null;
}

/** Varnostno prebere celoštevilsko vrednost iz neznanega telesa. */
function toInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isInteger(n) ? n : null;
  }
  return null;
}

// ============================================================================
// GET — vsi vpisi dnevnika za potovanje (starejši najprej = kronološko)
// ============================================================================
export async function GET(request: Request) {
  const limited = rateLimit(request, {
    limit: 240,
    windowMs: HOUR_MS,
    key: "diary-get",
  });
  if (limited) return limited;

  try {
    const url = new URL(request.url);
    const shareId = (url.searchParams.get("shareId") ?? "")
      .trim()
      .toLowerCase();
    const clientId = (url.searchParams.get("clientId") ?? "").trim();

    if (!SHARE_ID_RE.test(shareId)) {
      return NextResponse.json(
        { error: "Manjka ali neveljaven ID deljenega potovanja (shareId)" },
        { status: 400 }
      );
    }

    if (clientId && !CLIENT_ID_RE.test(clientId)) {
      return NextResponse.json(
        { error: "Neveljaven identifikator obiskovalca (8–64 znakov)" },
        { status: 400 }
      );
    }

    if (!(await tripExists(shareId))) {
      return NextResponse.json(
        { error: "Deljeno potovanje ne obstaja" },
        { status: 404 }
      );
    }

    const entries = await db.tripDiaryEntry.findMany({
      where: { shareId },
      orderBy: [{ createdAt: "asc" }],
      take: ENTRIES_MAX,
      select: ENTRY_SELECT,
    });

    const normalizedClient = CLIENT_ID_RE.test(clientId) ? clientId : null;
    return NextResponse.json({
      entries: entries.map((e) => toDTO(e, normalizedClient)),
    });
  } catch (error) {
    console.error("[diary] GET napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pridobivanju dnevnika" },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST — dodaj vpis v dnevnik
// ============================================================================
export async function POST(request: Request) {
  const limited = rateLimit(request, {
    limit: 20,
    windowMs: HOUR_MS,
    key: "diary-create",
  });
  if (limited) return limited;

  try {
    const raw: unknown = await request.json().catch(() => null);
    const b = (raw ?? {}) as DiaryBody;

    const shareId =
      typeof b.shareId === "string" ? b.shareId.trim().toLowerCase() : "";
    const clientId = typeof b.clientId === "string" ? b.clientId.trim() : "";
    const text = typeof b.text === "string" ? b.text.trim() : "";
    const authorName =
      typeof b.authorName === "string" ? b.authorName.trim() : "";
    const placeName =
      typeof b.placeName === "string" ? b.placeName.trim() : "";
    const dayIndex = toInt(b.dayIndex);
    const rating = toInt(b.rating);

    if (!SHARE_ID_RE.test(shareId)) {
      return NextResponse.json(
        { error: "Manjka ali neveljaven ID deljenega potovanja (shareId)" },
        { status: 400 }
      );
    }
    if (text.length < TEXT_MIN || text.length > TEXT_MAX) {
      return NextResponse.json(
        {
          error: `Spomin mora imeti ${TEXT_MIN}–${TEXT_MAX} znakov (dobljenih ${text.length})`,
        },
        { status: 400 }
      );
    }
    if (placeName.length > PLACE_MAX) {
      return NextResponse.json(
        { error: `Kraj je lahko dolg največ ${PLACE_MAX} znakov` },
        { status: 400 }
      );
    }
    if (authorName.length > AUTHOR_NAME_MAX) {
      return NextResponse.json(
        { error: `Ime je lahko dolgo največ ${AUTHOR_NAME_MAX} znakov` },
        { status: 400 }
      );
    }
    if (
      dayIndex !== null &&
      (dayIndex < DAY_INDEX_MIN || dayIndex > DAY_INDEX_MAX)
    ) {
      return NextResponse.json(
        { error: `Dan mora biti med ${DAY_INDEX_MIN} in ${DAY_INDEX_MAX}` },
        { status: 400 }
      );
    }
    if (rating !== null && (rating < 1 || rating > 5)) {
      return NextResponse.json(
        { error: "Ocena mora biti med 1 in 5 zvezdicami" },
        { status: 400 }
      );
    }
    if (!CLIENT_ID_RE.test(clientId)) {
      return NextResponse.json(
        {
          error: "Manjka ali neveljaven identifikator obiskovalca (8–64 znakov)",
        },
        { status: 400 }
      );
    }
    if (!(await tripExists(shareId))) {
      return NextResponse.json(
        { error: "Deljeno potovanje ne obstaja" },
        { status: 404 }
      );
    }

    // Zgornji meji: skupno in na avtorja (preprečuje smeti)
    const [total, mine] = await Promise.all([
      db.tripDiaryEntry.count({ where: { shareId } }),
      db.tripDiaryEntry.count({
        where: { shareId, authorClientId: clientId },
      }),
    ]);
    if (total >= ENTRIES_MAX) {
      return NextResponse.json(
        {
          error: `Doseženih je največ ${ENTRIES_MAX} vpisov v dnevnik — izbriši kakšen star`,
        },
        { status: 429 }
      );
    }
    if (mine >= AUTHOR_ENTRIES_MAX) {
      return NextResponse.json(
        {
          error: `Največ ${AUTHOR_ENTRIES_MAX} tvojih vpisov na potovanje — izbriši ali uredi obstoječega`,
        },
        { status: 429 }
      );
    }

    const created = await db.tripDiaryEntry.create({
      data: {
        shareId,
        authorName: authorName || null,
        authorClientId: clientId,
        dayIndex,
        placeName: placeName || null,
        rating,
        text,
      },
      select: ENTRY_SELECT,
    });

    return NextResponse.json(
      { success: true, entry: toDTO(created, clientId) },
      { status: 201 }
    );
  } catch (error) {
    console.error("[diary] POST napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri dodajanju vpisa v dnevnik" },
      { status: 500 }
    );
  }
}

// ============================================================================
// PATCH — uredi vpis (samo avtor)
// ============================================================================
export async function PATCH(request: Request) {
  const limited = rateLimit(request, {
    limit: 30,
    windowMs: HOUR_MS,
    key: "diary-patch",
  });
  if (limited) return limited;

  try {
    const raw: unknown = await request.json().catch(() => null);
    const b = (raw ?? {}) as DiaryBody;

    const entryId = typeof b.entryId === "string" ? b.entryId.trim() : "";
    const clientId = typeof b.clientId === "string" ? b.clientId.trim() : "";

    if (!ENTRY_ID_RE.test(entryId)) {
      return NextResponse.json(
        { error: "Manjka ali neveljaven ID vpisa" },
        { status: 400 }
      );
    }
    if (!CLIENT_ID_RE.test(clientId)) {
      return NextResponse.json(
        { error: "Manjka ali neveljaven identifikator obiskovalca" },
        { status: 400 }
      );
    }

    const entry = await db.tripDiaryEntry.findUnique({
      where: { id: entryId },
      select: { authorClientId: true },
    });
    if (!entry) {
      return NextResponse.json({ error: "Vpis ne obstaja" }, { status: 404 });
    }

    // Samo avtor vpisa ga lahko ureja
    if (entry.authorClientId !== clientId) {
      return NextResponse.json(
        { error: "Samo avtor vpisa ga lahko ureja" },
        { status: 403 }
      );
    }

    // Urejamo SAMO poslana polja (text / dayIndex / placeName / rating)
    const data: {
      text?: string;
      dayIndex?: number | null;
      placeName?: string | null;
      rating?: number | null;
    } = {};

    if (b.text !== undefined) {
      const text = typeof b.text === "string" ? b.text.trim() : "";
      if (text.length < TEXT_MIN || text.length > TEXT_MAX) {
        return NextResponse.json(
          {
            error: `Spomin mora imeti ${TEXT_MIN}–${TEXT_MAX} znakov (dobljenih ${text.length})`,
          },
          { status: 400 }
        );
      }
      data.text = text;
    }

    if (b.dayIndex !== undefined) {
      const dayIndex = toInt(b.dayIndex);
      if (
        dayIndex !== null &&
        (dayIndex < DAY_INDEX_MIN || dayIndex > DAY_INDEX_MAX)
      ) {
        return NextResponse.json(
          { error: `Dan mora biti med ${DAY_INDEX_MIN} in ${DAY_INDEX_MAX}` },
          { status: 400 }
        );
      }
      data.dayIndex = dayIndex;
    }

    if (b.placeName !== undefined) {
      const placeName =
        typeof b.placeName === "string" ? b.placeName.trim() : "";
      if (placeName.length > PLACE_MAX) {
        return NextResponse.json(
          { error: `Kraj je lahko dolg največ ${PLACE_MAX} znakov` },
          { status: 400 }
        );
      }
      data.placeName = placeName || null;
    }

    if (b.rating !== undefined) {
      const rating = toInt(b.rating);
      if (rating !== null && (rating < 1 || rating > 5)) {
        return NextResponse.json(
          { error: "Ocena mora biti med 1 in 5 zvezdicami" },
          { status: 400 }
        );
      }
      data.rating = rating;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        {
          error:
            "Nič za urejanje — pošlji text, dayIndex, placeName ali rating",
        },
        { status: 400 }
      );
    }

    const updated = await db.tripDiaryEntry.update({
      where: { id: entryId },
      data,
      select: ENTRY_SELECT,
    });

    return NextResponse.json({
      success: true,
      entry: toDTO(updated, clientId),
    });
  } catch (error) {
    console.error("[diary] PATCH napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri urejanju vpisa" },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE — izbriši vpis (samo avtor)
// ============================================================================
export async function DELETE(request: Request) {
  const limited = rateLimit(request, {
    limit: 30,
    windowMs: HOUR_MS,
    key: "diary-delete",
  });
  if (limited) return limited;

  try {
    const raw: unknown = await request.json().catch(() => null);
    const b = (raw ?? {}) as DiaryBody;

    const entryId = typeof b.entryId === "string" ? b.entryId.trim() : "";
    const clientId = typeof b.clientId === "string" ? b.clientId.trim() : "";

    if (!ENTRY_ID_RE.test(entryId)) {
      return NextResponse.json(
        { error: "Manjka ali neveljaven ID vpisa" },
        { status: 400 }
      );
    }
    if (!CLIENT_ID_RE.test(clientId)) {
      return NextResponse.json(
        { error: "Manjka ali neveljaven identifikator obiskovalca" },
        { status: 400 }
      );
    }

    const entry = await db.tripDiaryEntry.findUnique({
      where: { id: entryId },
      select: { authorClientId: true },
    });
    if (!entry) {
      return NextResponse.json({ error: "Vpis ne obstaja" }, { status: 404 });
    }

    if (entry.authorClientId !== clientId) {
      return NextResponse.json(
        { error: "Samo avtor vpisa ga lahko izbriše" },
        { status: 403 }
      );
    }

    await db.tripDiaryEntry.delete({ where: { id: entryId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[diary] DELETE napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri brisanju vpisa" },
      { status: 500 }
    );
  }
}
