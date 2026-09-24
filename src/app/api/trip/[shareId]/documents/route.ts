import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { communityTripGate } from "@/lib/trip-permissions";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit-log";

// ============================================================================
// TRIP DOCUMENTS — ISSUE #4 §15 (val 4): dokumenti poti (metapodatki)
// ============================================================================
// Naročnikova zahteva (§15): vsak dokument ima type, source, createdAt,
// trip/reservation povezavo, privacy, deletion in offline availability.
//
// ISKRENA ODLOČITEV O VSEBINI (isti vzorec kot TripDiaryEntry "BREZ slik"
// in parse "dokument se NE shrani nikamor"): shranjujemo SAMO METAPODATKE
// + zunanjo povezavo — binarna/PDF vsebina ostane pri uporabniku (zasebnost
// + stroški shrambe na Neon). Dokument = type/format/source/title/note/url
// + mehka povezava na JourneyBooking (bookingId) + avtor (diary vzorec).
//
// Kontrakt (konsumira ga TripDocumentsCard na /pot):
//   GET    /api/trip/[shareId]/documents?clientId=yyy
//          → { documents: [{ id, type, format, source, title, note, url,
//                            bookingId, dayIndex, authorName, createdAt,
//                            isAuthor }] }
//   POST   body { type, format, title, url?, note?, bookingId?, dayIndex?,
//                 authorName?, clientId }
//          → { success: true, document }   (max 100/pot, max 25/avtor)
//   DELETE body { documentId, clientId }
//          → { success: true }             (samo avtor)
//
// Vrata (isto kot stroški/dnevnik): javna pot = vsak obiskovalec; zasebna
// pot → branje ≥ VIEWER, pisanje ≥ COMMENTER. ISKRENOST: type/format/source
// SAMO iz kanonskih naborov; url SAMO https (kap 500); title 2–160.
// Offline: dokumenti se strežniško izrišejo na /pot (HTML → SW dai-plans
// predpomnilnik) → vidni brez signala; ZAPIŠE se lahko samo online.
// ============================================================================

const SHARE_ID_RE = /^[a-z0-9]{1,32}$/;
const CLIENT_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;
const DOCUMENT_ID_RE = /^[a-zA-Z0-9]{20,40}$/;
const BOOKING_ID_RE = /^[a-zA-Z0-9]{20,40}$/;

/** Kanonske semantične vrste (§15 taksonomija — NE prosto besedilo). */
const DOCUMENT_TYPES = new Set([
  "booking_confirmation",
  "voucher",
  "ticket",
  "receipt",
  "note",
] as const);

/** Zapisi vira (§15: PDF/slika/samo povezava …). */
const DOCUMENT_FORMATS = new Set([
  "pdf",
  "image",
  "text",
  "link",
  "none",
] as const);

/** Izvor zapisa (ista doktrina kot JourneyBooking.source). */
const DOCUMENT_SOURCES = new Set(["USER", "IMPORTED"] as const);

const TITLE_MIN = 2;
const TITLE_MAX = 160;
const NOTE_MAX = 2000;
const URL_MAX = 500;
const AUTHOR_NAME_MAX = 60;
const DAY_INDEX_MIN = 0;
const DAY_INDEX_MAX = 30;

/** Zgornji meji smeti (isti razred kot diary/expenses). */
const DOCUMENTS_MAX = 100;
const AUTHOR_DOCUMENTS_MAX = 25;

export interface DocumentDTO {
  id: string;
  type: string;
  format: string;
  source: string;
  title: string;
  note: string | null;
  url: string | null;
  bookingId: string | null;
  dayIndex: number | null;
  authorName: string | null;
  createdAt: string;
  isAuthor: boolean;
}

function err(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/** Samo https povezave ( isti vzorec kot affiliate.ts isValidHttpsUrl). */
function isValidHttpsUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.hostname.includes(".");
  } catch {
    return false;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  const limited = rateLimit(request, {
    limit: 60,
    windowMs: 60_000,
    key: "trip-documents",
  });
  if (limited) return limited;

  const { shareId } = await params;
  if (!SHARE_ID_RE.test(shareId)) {
    return err(400, "Neveljaven ID poti");
  }

  const { searchParams } = new URL(request.url);
  const clientId = (searchParams.get("clientId") ?? "").trim();

  // Zasebna pot → branje zahteva ≥ VIEWER.
  const savedAccess = await db.savedItinerary.findUnique({
    where: { shareId },
    select: { isPublic: true },
  });
  if (!savedAccess) return err(404, "Potovanje ne obstaja");
  if (!savedAccess.isPublic) {
    const gate = await communityTripGate(shareId, "read");
    if (gate) return gate;
  }

  const rows = await db.tripDocument.findMany({
    where: { shareId },
    orderBy: { createdAt: "asc" },
    take: DOCUMENTS_MAX,
  });

  const documents: DocumentDTO[] = rows.map((r) => ({
    id: r.id,
    type: r.type,
    format: r.format,
    source: r.source,
    title: r.title,
    note: r.note,
    url: r.url,
    bookingId: r.bookingId,
    dayIndex: r.dayIndex,
    authorName: r.authorName,
    createdAt: r.createdAt.toISOString(),
    isAuthor:
      CLIENT_ID_RE.test(clientId) &&
      r.authorClientId != null &&
      r.authorClientId === clientId,
  }));

  return NextResponse.json({ documents });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  const limited = rateLimit(request, {
    limit: 30,
    windowMs: 60_000,
    key: "trip-documents-write",
  });
  if (limited) return limited;

  const { shareId } = await params;
  if (!SHARE_ID_RE.test(shareId)) {
    return err(400, "Neveljaven ID poti");
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return err(400, "Neveljaven JSON");
  }

  const type = typeof body.type === "string" ? body.type.trim() : "";
  const format = typeof body.format === "string" ? body.format.trim() : "none";
  const source = typeof body.source === "string" ? body.source.trim() : "USER";
  const title =
    typeof body.title === "string" ? body.title.trim().replace(/\s+/g, " ") : "";
  const note =
    typeof body.note === "string" ? body.note.trim().slice(0, NOTE_MAX) : null;
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const bookingId =
    typeof body.bookingId === "string" ? body.bookingId.trim() : "";
  const dayIndex =
    typeof body.dayIndex === "number" && Number.isInteger(body.dayIndex)
      ? body.dayIndex
      : null;
  const authorName =
    typeof body.authorName === "string"
      ? body.authorName.trim().replace(/\s+/g, " ").slice(0, AUTHOR_NAME_MAX)
      : null;
  const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";

  if (!DOCUMENT_TYPES.has(type as never)) {
    return err(
      400,
      "Vrsta dokumenta: booking_confirmation | voucher | ticket | receipt | note"
    );
  }
  if (!DOCUMENT_FORMATS.has(format as never)) {
    return err(400, "Zapis vira: pdf | image | text | link | none");
  }
  if (!DOCUMENT_SOURCES.has(source as never)) {
    return err(400, "Izvor: USER (ročni vnos) ali IMPORTED (iz dokumenta)");
  }
  if (title.length < TITLE_MIN || title.length > TITLE_MAX) {
    return err(400, `Naslov dokumenta: ${TITLE_MIN}–${TITLE_MAX} znakov`);
  }
  if (url.length > 0) {
    if (url.length > URL_MAX || !isValidHttpsUrl(url)) {
      return err(400, "Povezava mora biti veljaven https naslov");
    }
  }
  if (bookingId.length > 0 && !BOOKING_ID_RE.test(bookingId)) {
    return err(400, "Neveljaven ID rezervacije");
  }
  if (dayIndex != null && (dayIndex < DAY_INDEX_MIN || dayIndex > DAY_INDEX_MAX)) {
    return err(400, "Dan poti je izven obsega");
  }
  if (!CLIENT_ID_RE.test(clientId)) {
    return err(400, "Manjka/nezveljaven clientId");
  }

  const savedAccess = await db.savedItinerary.findUnique({
    where: { shareId },
    select: { isPublic: true },
  });
  if (!savedAccess) return err(404, "Potovanje ne obstaja");
  // Zasebna pot → zapis zahteva ≥ COMMENTER (skupnostna plast, kot diary).
  if (!savedAccess.isPublic) {
    const gate = await communityTripGate(shareId, "comment");
    if (gate) return gate;
  }

  // Mehka povezava na rezervacijo: preveri, da rezervacija RES pripada tej poti
  // (NE dovolimo tujih bookingId — povezava bi lažno kazala na tuji zapis).
  if (bookingId.length > 0) {
    const booking = await db.journeyBooking.findFirst({
      where: { id: bookingId, OR: [{ shareId }, { shareId: null }] },
      select: { id: true },
    });
    if (!booking) {
      return err(404, "Rezervacija ni najdena na tej poti");
    }
  }

  // Meji smeti (isti razred kot diary/expenses).
  const [total, byAuthor] = await Promise.all([
    db.tripDocument.count({ where: { shareId } }),
    db.tripDocument.count({ where: { shareId, authorClientId: clientId } }),
  ]);
  if (total >= DOCUMENTS_MAX) {
    return err(409, "Dosežena zgornja meja dokumentov na potovanje");
  }
  if (byAuthor >= AUTHOR_DOCUMENTS_MAX) {
    return err(409, "Dosežena zgornja meja dokumentov enega avtorja");
  }

  const document = await db.tripDocument.create({
    data: {
      shareId,
      type,
      format,
      source,
      title,
      note: note && note.length > 0 ? note : null,
      url: url.length > 0 ? url : null,
      bookingId: bookingId.length > 0 ? bookingId : null,
      dayIndex,
      authorName,
      authorClientId: clientId,
    },
  });

  void logAudit({
    actorRole: "user",
    action: AUDIT_ACTIONS.TRIP_DOCUMENT_ADDED,
    resourceType: "trip_document",
    resourceId: shareId,
    metadata: { type, format, source, bookingId: bookingId || null },
  });

  return NextResponse.json(
    {
      success: true,
      document: {
        id: document.id,
        type: document.type,
        format: document.format,
        source: document.source,
        title: document.title,
        note: document.note,
        url: document.url,
        bookingId: document.bookingId,
        dayIndex: document.dayIndex,
        authorName: document.authorName,
        createdAt: document.createdAt.toISOString(),
        isAuthor: true,
      } satisfies DocumentDTO,
    },
    { status: 201 }
  );
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  const limited = rateLimit(request, {
    limit: 30,
    windowMs: 60_000,
    key: "trip-documents-write",
  });
  if (limited) return limited;

  const { shareId } = await params;
  if (!SHARE_ID_RE.test(shareId)) {
    return err(400, "Neveljaven ID poti");
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return err(400, "Neveljaven JSON");
  }

  const documentId =
    typeof body.documentId === "string" ? body.documentId.trim() : "";
  const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";

  if (!DOCUMENT_ID_RE.test(documentId)) {
    return err(400, "Neveljaven ID dokumenta");
  }
  if (!CLIENT_ID_RE.test(clientId)) {
    return err(400, "Manjka/nezveljaven clientId");
  }

  const savedAccess = await db.savedItinerary.findUnique({
    where: { shareId },
    select: { isPublic: true },
  });
  if (!savedAccess) return err(404, "Potovanje ne obstaja");
  if (!savedAccess.isPublic) {
    const gate = await communityTripGate(shareId, "comment");
    if (gate) return gate;
  }

  const existing = await db.tripDocument.findUnique({
    where: { id: documentId },
    select: { id: true, shareId: true, authorClientId: true, type: true },
  });
  if (!existing || existing.shareId !== shareId) {
    return err(404, "Dokument ni najden");
  }
  // SAMO avtor (isti vzorec kot stroški/dnevnik — osebni zapisi).
  if (existing.authorClientId !== clientId) {
    return err(403, "Dokument lahko izbriše samo avtor");
  }

  await db.tripDocument.delete({ where: { id: documentId } });

  void logAudit({
    actorRole: "user",
    action: AUDIT_ACTIONS.TRIP_DOCUMENT_REMOVED,
    resourceType: "trip_document",
    resourceId: shareId,
    metadata: { documentId, type: existing.type },
  });

  return NextResponse.json({ success: true });
}
