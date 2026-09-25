import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { timingSafeEqual } from "@/lib/security";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit-log";
import {
  providerSlugFromName,
  importedProductId,
  type ParsedReservation,
} from "@/lib/imported-reservation";
import {
  parseReservationText,
  isReservationParseEmpty,
} from "@/lib/reservation-text-parse";
import { parseIcsReservation, isIcsInput } from "@/lib/reservation-ics-parse";
import {
  parseEmailSource,
  emailTextForParsing,
  MAX_RAW_EMAIL_CHARS,
} from "@/lib/email-mime-parse";
import { SHARE_ID_RE } from "@/lib/trip-permissions";

// ============================================================================
// POST /api/journey/bookings/email-inbound — TASK 31 (Tier 1 #3): TRIPITOV
// MODEL — POSREDOVANA POTRDITVENA E-POŠTA → OSNUTEK REZERVACIJE (DORMANT)
// ----------------------------------------------------------------------------
// VRZEL (benchmark Task 28): svetovni produkti (TripIt od 2006) gradijo uvoz
// rezervacij okrog „posreduj potrdilo na naš naslov". Ta ruta je STROJNI
// prejemni kanal (webhook vhodne poštne storitve — SendGrid Inbound Parse /
// Postmark / SES), ki surovo RFC 5322 sporočilo razširi v OSNUTEK (DRAFT)
// rezervacije — uporabnik ga nato POTRDI v obstoječem UI (/pot → Rezervacije).
//
// DISCIPLINA (ista kot JOURNEY_PROVIDER_TOKEN / STRIPE — fail-closed):
//  · brez DSA_EMAIL_INBOUND_TOKEN je kanal IZKLOPLJEN in to iskreno pove
//    (503) — 0 poverilnic danes, 0 lažnega zelenja;
//  · žeton se primerja timing-safe (isti vzorec kot admin geslo / cron
//    secret / provider prehodi);
//  · strojni kanal NE zažge AI žetonov: čisto deterministična kaskada
//    (.ics priloga → Subject+besedilo → .pdf priloga prek unpdf);
//  · §4 iskrenost: webhook USTVARI SAMO DRAFT (source IMPORTED) — nikoli
//    CONFIRMED; potrjevanje je izključno uporabnikovo dejanje;
//  · idempotenca: isti dokument (provider + providerProductId + kontekst)
//    ne podvoji zapisa — ponovno posredovana e-pošta vrne obstoječi osnutek;
//  · asociacija (kam spada osnutek) je ODGOVORNOST POŠILJATELJA: plus-naslov
//    (npr. rezervacije+<sessionKey>@domena) ali polje sessionKey/shareId v
//    telesu. Žeton kanala + plus-naslov, ki ga je nastavil lastnik poti,
//    skupaj predstavljata pooblastilo (iskreno dokumentirano, brez skritih
//    zahtev po editTokenu — stroj ga nima in ne potrebuje);
//  · shareId MORA obstajati (SavedItinerary) — preprečimo sirote;
//  · surova pošta se NE shrani (razširi se v polja → pozabljena; v bazi
//    ostane samo normaliziran importData, isti kot ročni uvoz).
//
// Vhod: { raw: string (RFC 5322, ≤ 2 MB), sessionKey?: string,
//         shareId?: string } — NATANČNO ENA odvezava (sessionKey ali shareId).
// Izhod 201: { booking, created: true, needsConfirmation: true, via }
//      200: { booking, created: false (idempotent), … } · 422: nič prepoznanega.
// ============================================================================

const SESSION_KEY_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const MAX_PDF_PAGES = 60;

const SELECT_FIELDS = {
  id: true,
  provider: true,
  providerProductId: true,
  status: true,
  source: true,
  shareId: true,
  sessionKey: true,
  confirmedPrice: true,
  currency: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function POST(request: Request) {
  const limited = rateLimit(request, {
    limit: 30,
    windowMs: 60_000,
    key: "email-inbound",
  });
  if (limited) return limited;

  // ── FAIL-CLOSED žetonska vrata (vzorec JOURNEY_PROVIDER_TOKEN) ────────
  const token = process.env.DSA_EMAIL_INBOUND_TOKEN;
  if (!token) {
    return NextResponse.json(
      {
        error:
          "Kanal za vhodno pošto ni konfiguriran (DSA_EMAIL_INBOUND_TOKEN) — posredovanje potrdil je izklopljeno, dokler žeton ni nastavljen",
        hint: "Nastavi DSA_EMAIL_INBOUND_TOKEN in naključni posredovalni naslov pri ponudniku vhodne pošte (SendGrid Inbound Parse / Postmark / SES).",
      },
      { status: 503 }
    );
  }
  const provided =
    request.headers.get("x-provider-token") ??
    (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!timingSafeEqual(provided, token)) {
    return NextResponse.json({ error: "Neveljaven žeton" }, { status: 401 });
  }

  // ── Telo ─────────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Neveljaven JSON" }, { status: 400 });
  }

  const raw = typeof body.raw === "string" ? body.raw : "";
  const sessionKey =
    typeof body.sessionKey === "string" ? body.sessionKey.trim() : "";
  const shareId =
    typeof body.shareId === "string"
      ? body.shareId.trim().toLowerCase()
      : "";

  if (!raw.trim()) {
    return NextResponse.json(
      { error: "Manjka surovo sporočilo (raw)." },
      { status: 400 }
    );
  }
  if (raw.length > MAX_RAW_EMAIL_CHARS) {
    return NextResponse.json(
      { error: "Sporočilo je preveliko (največ 2 MB)." },
      { status: 413 }
    );
  }
  // NATANČNO ENA odvezava (kontekst osnutka):
  if (sessionKey && shareId) {
    return NextResponse.json(
      { error: "Posreduj SAMO ENO odvezavo: sessionKey ALI shareId." },
      { status: 400 }
    );
  }
  if (!sessionKey && !shareId) {
    return NextResponse.json(
      {
        error:
          "Manjka odvezava (sessionKey ali shareId) — osnutek mora vedeti, kam spada.",
      },
      { status: 400 }
    );
  }
  if (sessionKey && !SESSION_KEY_RE.test(sessionKey)) {
    return NextResponse.json({ error: "Neveljaven sessionKey" }, { status: 400 });
  }
  if (shareId && !SHARE_ID_RE.test(shareId)) {
    return NextResponse.json({ error: "Neveljaven shareId" }, { status: 400 });
  }
  // shareId MORA obstajati (preprečimo sirote):
  if (shareId) {
    const trip = await db.savedItinerary.findFirst({
      where: { shareId },
      select: { id: true },
    });
    if (!trip) {
      return NextResponse.json(
        { error: "Pot s tem shareId ne obstaja" },
        { status: 404 }
      );
    }
  }

  // ── Deterministična kaskada (0 AI — strojni kanal) ─────────────────────
  const parsedEmail = parseEmailSource(raw);
  if (!parsedEmail.ok) {
    return NextResponse.json(
      {
        error:
          "Sporočilo ni prepoznavna e-pošta (manjka glava s Subject/From). Kanal sprejema samo celotna posredovana sporočila.",
        needsConfirmation: false,
      },
      { status: 422 }
    );
  }
  const msg = parsedEmail.message;

  let fields: ParsedReservation | null = null;
  let via: "email-ics" | "email-text" | "email-pdf" = "email-text";
  // 1. .ics priloga — SPECIFIČNO PREJ SPLOŠNIM (structured data):
  if (msg.icsAttachment && isIcsInput(msg.icsAttachment)) {
    const icsFields = parseIcsReservation(msg.icsAttachment);
    if (!isReservationParseEmpty(icsFields)) {
      fields = icsFields;
      via = "email-ics";
    }
  }
  // 2. besedilo (Subject + telo; text/plain pred html→text):
  if (!fields) {
    const emailText = emailTextForParsing(msg);
    if (emailText) {
      const textFields = parseReservationText(emailText.slice(0, 60_000));
      if (!isReservationParseEmpty(textFields)) {
        fields = textFields;
        via = "email-text";
      }
    }
  }
  // 3. .pdf priloga (unpdf — dinamičen uvoz, enak cap kot parse ruta):
  if (!fields && msg.pdfAttachmentBase64) {
    const pdfText = await extractPdfText(msg.pdfAttachmentBase64);
    if (pdfText && pdfText.trim().length > 0) {
      const pdfFields = parseReservationText(pdfText.slice(0, 60_000));
      if (!isReservationParseEmpty(pdfFields)) {
        fields = pdfFields;
        via = "email-pdf";
      }
    }
  }

  if (!fields) {
    // ISKRENOST: nič prepoznanega → NOV zapis NE nastane (smeti ne delajo
    // osnutkov); pošiljatelj dobi jasen 422.
    return NextResponse.json(
      {
        error:
          "Iz e-pošte nisem prepoznal ključnih polj (ponudnik, št. rezervacije ali datum) — osnutek ni nastal.",
        needsConfirmation: false,
      },
      { status: 422 }
    );
  }

  const providerSlug = providerSlugFromName(fields.providerName);
  const providerProductId = importedProductId(
    providerSlug,
    fields.reservationNumber
  );

  // ── Zapis DRAFT (idempotentno, serializabilna transakcija) ────────────
  const importData = JSON.stringify({
    providerName: fields.providerName,
    reservationNumber: fields.reservationNumber,
    startDateTime: fields.startDateTime,
    endDateTime: fields.endDateTime,
    locationName: fields.locationName,
    guestName: fields.guestName,
    price: fields.price,
    currency: fields.currency,
    cancellationDeadline: fields.cancellationDeadline,
    contact: fields.contact,
    notes: fields.notes,
  }).slice(0, 20_000);

  const txOptions = process.env.DATABASE_URL?.startsWith("file:")
    ? undefined
    : { isolationLevel: "Serializable" as const };

  try {
    for (let attempt = 0; ; attempt++) {
      try {
        const result = await db.$transaction(
          async (tx) => {
            const existing = await tx.journeyBooking.findFirst({
              where: {
                provider: providerSlug,
                providerProductId,
                shareId: shareId || null,
                ...(shareId ? {} : { sessionKey }),
              },
              select: SELECT_FIELDS,
            });
            if (existing) {
              return { kind: "idempotent" as const, booking: existing };
            }
            const booking = await tx.journeyBooking.create({
              data: {
                provider: providerSlug,
                providerProductId,
                // §4: strojni kanal USTVARI SAMO DRAFT — potrditev je
                // izključno uporabnikovo dejanje v UI (/pot → Rezervacije).
                status: "DRAFT",
                source: "IMPORTED",
                ...(shareId ? { shareId } : { sessionKey }),
                providerBookingId: null,
                confirmedPrice: null,
                currency: "EUR",
                importData,
              },
              select: SELECT_FIELDS,
            });
            return { kind: "created" as const, booking };
          },
          txOptions
        );

        // Audit (fire-and-forget kanon — strojni kanal je iskreno "system").
        void logAudit({
          actorRole: "system",
          action: AUDIT_ACTIONS.RESERVATION_IMPORTED,
          resourceType: "journey_booking",
          resourceId: shareId || sessionKey,
          metadata: {
            provider: providerSlug,
            providerProductId,
            source: "IMPORTED",
            status: "DRAFT",
            channel: "email-inbound",
            via,
            emailSubject: msg.subject?.slice(0, 120) ?? null,
          },
        });

        return NextResponse.json(
          {
            booking: result.booking,
            created: result.kind === "created",
            // ISKRENOST: osnutek ČAKA uporabnikovo potrditev (nikoli samodejno
            // CONFIRMED) — isti §4 dogovor kot ročni uvoz iz dokumenta.
            needsConfirmation: true,
            via,
          },
          { status: result.kind === "created" ? 201 : 200 }
        );
      } catch (error) {
        const code = (error as { code?: string })?.code;
        if (code === "P2034" && attempt < 3) continue; // serializacija → poskusi znova
        throw error;
      }
    }
  } catch (error) {
    console.error("[journey/bookings/email-inbound] POST napaka:", error);
    return NextResponse.json(
      { error: "Obravnava vhodne pošte trenutno ni možna" },
      { status: 503 }
    );
  }
}

/** PDF besedilo prek unpdf (dinamičen uvoz — isti cap kot parse ruta). */
async function extractPdfText(base64: string): Promise<string | null> {
  try {
    const { getDocumentProxy, extractText } = await import("unpdf");
    const buffer = Buffer.from(base64, "base64");
    const data = new Uint8Array(buffer);
    const pdf = await getDocumentProxy(data);
    if (pdf.numPages > MAX_PDF_PAGES) return null;
    const { text } = await extractText(pdf, { mergePages: true });
    return typeof text === "string" ? text : null;
  } catch {
    return null;
  }
}
