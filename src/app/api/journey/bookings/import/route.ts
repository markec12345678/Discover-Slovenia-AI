import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { communityTripGate } from "@/lib/trip-permissions";
import {
  isValidStatusTransition,
  validateConfirmationRecord,
  type BookingConfirmationRecord,
  type BookingSource,
} from "@/lib/journey/booking";
import {
  providerSlugFromName,
  importedProductId,
  isKnownProviderSlug,
} from "@/lib/imported-reservation";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit-log";

// ============================================================================
// POST /api/journey/bookings/import — ISSUE #4 §4: ZAPIS UVOŽENE/ROČNE
// REZERVACIJE (SAMO po uporabnikovi potrditvi v UI)
// ============================================================================
// Ločeno od POST /api/journey/bookings (S1 hardening: klientovi dogodki
// SELECTED/EXTERNAL/BOOKING_REQUESTED brez atestacij). TA ruta nosi ZGODBO
// „uporabnikovo potrdilo od ponudnika":
//
//  · source "USER"     — ročni vnos: potrditev je SAM DEJANJE VNOSA
//                        (uporabnik izpolni obrazec in pritisne Shrani);
//  · source "IMPORTED" — parse dokumenta (slika/PDF/besedilo) + UPORABNIKOV
//                        PREGLED in potrditev predogleda (dokument =
//                        atestacija — lib/journey/booking.ts §4 utemeljitev);
//  · status "DRAFT"    — NEPOTRJEN parse (nezanesljiv parsing ostane DRAFT
//                        — Issue #4 §4 izrecno); nosi SAMO importData;
//  · status "CONFIRMED" — uporabniško potrjeno: sme nositi providerBookingId
//                        (št. rezervacije iz dokumenta) + confirmedPrice
//                        (cena iz dokumenta) + importData (surovi podatki).
//
// POSODABLJANJE obstoječega uvoza: { id } + { status } — SAMO zapisi z
// source USER/IMPORTED (provider kanal ima svoj PATCH z žetonom); prehod
// validira državna naprava (DRAFT → CONFIRMED/CANCELLED/…).
//
// Veljavni ponudniki: kanonski slugi + "manual" (rokano vpisan/neznan
// ponudnik — izrecen, nikoli lažen "booking").
//
// Varnost: rate limit 12/min; zasebna pot zahteva ≥ EDITOR (write je
// resnejši od komentarja — rezervacija je trditev uporabnika o svoji
// rezervaciji); javna pot kot booking POST (comment raven); audit
// RESERVATION_IMPORTED / RESERVATION_IMPORT_CONFIRMED.
// ============================================================================

const SHARE_ID_RE = /^[a-z0-9]{1,32}$/;
const SESSION_KEY_RE = /^[a-zA-Z0-9_-]{1,64}$/;

/** Veljavni ponudniki uvoza (kanonski + manual). */
const IMPORT_PROVIDERS: readonly string[] = [
  "osm", "fsq", "sto", "own", "booking", "viator", "getyourguide",
  "tiqets", "kiwitaxi", "discovercars", "skyscanner", "omio", "airalo",
  "worldnomads", "safetywing", "travelpayouts", "events", "manual",
];

/** Statusi, ki jih uvoz lahko ZAPIŠE (uporabniški kanal §4). */
const IMPORT_STATUSES: readonly string[] = ["DRAFT", "CONFIRMED"];

interface ImportFieldSet {
  providerName: string | null;
  reservationNumber: string | null;
  startDateTime: string | null;
  endDateTime: string | null;
  locationName: string | null;
  guestName: string | null;
  price: number | null;
  currency: string | null;
  cancellationDeadline: string | null;
  contact: string | null;
  notes: string | null;
}

function readString(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/\s+/g, " ");
  return t ? t.slice(0, max) : null;
}

function readPrice(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v > 0 && v <= 100_000 ? Math.round(v * 100) / 100 : null;
}

function readFields(body: Record<string, unknown>): ImportFieldSet {
  return {
    providerName: readString(body.providerName, 200),
    reservationNumber: readString(body.reservationNumber, 200),
    startDateTime: readString(body.startDateTime, 200),
    endDateTime: readString(body.endDateTime, 200),
    locationName: readString(body.locationName, 200),
    guestName: readString(body.guestName, 200),
    price: readPrice(body.price),
    currency: readString(body.currency, 3)?.toUpperCase() ?? null,
    cancellationDeadline: readString(body.cancellationDeadline, 200),
    contact: readString(body.contact, 300),
    notes: readString(body.notes, 300),
  };
}

export async function POST(request: Request) {
  const limited = rateLimit(request, {
    limit: 12,
    windowMs: 60_000,
    key: "journey-bookings-import",
  });
  if (limited) return limited;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Neveljaven JSON" }, { status: 400 });
  }

  const shareId =
    typeof body.shareId === "string" ? body.shareId.trim().toLowerCase() : "";
  const sessionKey =
    typeof body.sessionKey === "string" ? body.sessionKey.trim() : "";
  const source = body.source === "USER" || body.source === "IMPORTED"
    ? (body.source as BookingSource)
    : null;
  const status = typeof body.status === "string" ? body.status : "";
  const updateId = typeof body.id === "string" ? body.id.trim() : "";

  if (!source) {
    return NextResponse.json(
      { error: "Manjka izvor (source: USER | IMPORTED)." },
      { status: 400 }
    );
  }

  // Seja za audit (opcijsko — anonimni lastnik je legitimna pot).
  let sessionUserId: string | null = null;
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.accountType === "user" && session.user.id) {
      sessionUserId = session.user.id;
    }
  } catch {
    // anonimno
  }

  // POSODOBITEV obstoječega uvoza (id): dovoljeni končni statusi so
  // CONFIRMED/CANCELLED/FAILED (potrditev/zaključek osnutka) — validacija
  // steče V updateExisting (predno vržemo DRAFT-only napako).
  if (updateId) {
    return updateExisting(updateId, status, sessionUserId);
  }
  if (!IMPORT_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: "Neveljaven status — dovoljena: DRAFT, CONFIRMED" },
      { status: 400 }
    );
  }
  if (shareId && !SHARE_ID_RE.test(shareId)) {
    return NextResponse.json({ error: "Neveljaven shareId" }, { status: 400 });
  }
  if (!shareId && !SESSION_KEY_RE.test(sessionKey)) {
    return NextResponse.json(
      { error: "Manjka/nezveljaven sessionKey (obvezen brez shareId)" },
      { status: 400 }
    );
  }

  // ── NOV ZAPIS ──────────────────────────────────────────────────────────
  const fields = readFields(body);
  const providerName = fields.providerName;
  if (!providerName) {
    return NextResponse.json(
      { error: "Manjka ime ponudnika (providerName) — ključno polje uvoza." },
      { status: 400 }
    );
  }

  // Ponudnik: kanonski slug iz imena (prepoznavanje) ali eksplicitni podan.
  const explicitProvider =
    typeof body.provider === "string" ? body.provider.trim() : "";
  const provider = explicitProvider
    ? (isKnownProviderSlug(explicitProvider) ? explicitProvider : "manual")
    : providerSlugFromName(providerName);
  if (!IMPORT_PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: "Neveljaven ponudnik" }, { status: 400 });
  }

  const reservationNumber = fields.reservationNumber;
  const providerProductId = importedProductId(provider, reservationNumber);
  if (providerProductId.length === 0 || providerProductId.length > 200) {
    return NextResponse.json(
      { error: "Neveljaven ključ rezervacije" },
      { status: 400 }
    );
  }

  // ImportData (surovi podatki — vsebuje tudi contact/notes).
  const importData = JSON.stringify({
    ...fields,
    parseConfirmed: status === "CONFIRMED",
  });
  if (importData.length > 20_000) {
    return NextResponse.json(
      { error: "Podatki rezervacije so preveliki" },
      { status: 400 }
    );
  }

  // Zapis: DRAFT → brez atestacij; CONFIRMED → št. rezervacije + cena iz
  // dokumenta (uporabniško potrjen dokument).
  const rec: BookingConfirmationRecord = {
    provider: provider as BookingConfirmationRecord["provider"],
    providerProductId,
    status: status as BookingConfirmationRecord["status"],
    source,
    ...(status === "CONFIRMED" && reservationNumber
      ? { providerBookingId: reservationNumber }
      : {}),
    ...(status === "CONFIRMED" && fields.price != null
      ? { confirmedPrice: { amount: fields.price, currency: "EUR" as const } }
      : {}),
    importData,
  };
  const validation = validateConfirmationRecord(rec);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.reason }, { status: 400 });
  }

  // Vrata: zasebna pot → ≥ EDITOR (resnejši zapis od komentarja).
  if (shareId) {
    const savedAccess = await db.savedItinerary.findUnique({
      where: { shareId },
      select: { isPublic: true },
    });
    if (savedAccess && !savedAccess.isPublic) {
      const gate = await communityTripGate(shareId, "edit");
      if (gate) return gate;
    }
  }

  const txOptions = process.env.DATABASE_URL?.startsWith("file:")
    ? undefined
    : { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };

  try {
    for (let attempt = 0; ; attempt++) {
      try {
        const result = await db.$transaction(
          async (tx) => {
            // Idempotenca: isti dokument (provider + productId + kontekst)
            // ne podvoji zapisa — ponovni uvoz vrne obstoječega.
            const existing = await tx.journeyBooking.findFirst({
              where: {
                provider,
                providerProductId,
                shareId: shareId || null,
                ...(shareId ? {} : { sessionKey }),
              },
              select: { id: true, status: true, source: true },
            });
            if (existing) {
              if (existing.status === status) {
                const booking = await tx.journeyBooking.findUnique({
                  where: { id: existing.id },
                  select: SELECT_FIELDS,
                });
                return { kind: "idempotent" as const, booking };
              }
              if (
                !isValidStatusTransition(existing.status as never, status as never)
              ) {
                return { kind: "conflict" as const, from: existing.status };
              }
              // Prehod obstoječega (npr. DRAFT → CONFIRMED ob potrditvi):
              // posodobi status + atestacije (isti zapis, uporabniški kanal).
              const booking = await tx.journeyBooking.update({
                where: { id: existing.id },
                data: {
                  status,
                  source,
                  providerBookingId: rec.providerBookingId ?? null,
                  confirmedPrice: rec.confirmedPrice?.amount ?? null,
                  importData,
                },
                select: SELECT_FIELDS,
              });
              return { kind: "transitioned" as const, booking };
            }

            const booking = await tx.journeyBooking.create({
              data: {
                provider,
                providerProductId,
                status,
                source,
                ...(shareId ? { shareId } : { sessionKey }),
                providerBookingId: rec.providerBookingId ?? null,
                confirmedPrice: rec.confirmedPrice?.amount ?? null,
                currency: "EUR",
                importData,
              },
              select: SELECT_FIELDS,
            });
            return { kind: "created" as const, booking };
          },
          txOptions
        );

        if (result.kind === "conflict") {
          return NextResponse.json(
            { error: `Prehod ${result.from} → ${status} ni dovoljen` },
            { status: 409 }
          );
        }

        // Audit (fire-and-forget kanon).
        void logAudit({
          actorId: sessionUserId ?? undefined,
          actorRole: sessionUserId ? "user" : "edit-token-owner",
          action:
            status === "CONFIRMED"
              ? AUDIT_ACTIONS.RESERVATION_IMPORT_CONFIRMED
              : AUDIT_ACTIONS.RESERVATION_IMPORTED,
          resourceType: "journey_booking",
          resourceId: shareId || sessionKey,
          metadata: {
            provider,
            providerProductId,
            source,
            status,
            hasPrice: fields.price != null,
          },
        });

        return NextResponse.json(
          {
            booking: result.booking,
            ...(result.kind === "idempotent"
              ? { idempotent: true }
              : result.kind === "transitioned"
                ? { transitioned: true }
                : { created: true }),
          },
          { status: result.kind === "created" ? 201 : 200 }
        );
      } catch (error) {
        const conflict =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2034";
        if (!conflict || attempt >= 2) throw error;
        await new Promise((r) => setTimeout(r, 60));
      }
    }
  } catch (error) {
    console.error("[journey/bookings/import] POST napaka:", error);
    return NextResponse.json(
      { error: "Zapis rezervacije trenutno ni možen" },
      { status: 503 }
    );
  }
}

// ---------------------------------------------------------------------------
// Posodobitev obstoječega uvoza (DRAFT → CONFIRMED / CANCELLED / FAILED)
// ---------------------------------------------------------------------------

async function updateExisting(
  id: string,
  status: string,
  sessionUserId: string | null
): Promise<NextResponse> {
  // Veljavni končni statusi posodobitve: potrditev ali zaključek (ostalo
  // pusti državni stroj provider kanalu / uporabniku prek UI popolne forme).
  if (!["CONFIRMED", "CANCELLED", "FAILED"].includes(status)) {
    return NextResponse.json(
      { error: "Posodobitev omogoča samo: CONFIRMED, CANCELLED, FAILED" },
      { status: 400 }
    );
  }
  try {
    const existing = await db.journeyBooking.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        source: true,
        provider: true,
        providerProductId: true,
        shareId: true,
        importData: true,
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Zapis ni najden" }, { status: 404 });
    }
    // SAMO uporabniški uvozi (provider kanal ima svoj PATCH z žetonom);
    // legacy zapisi (source null) niso uporabnikovi uvozi.
    if (existing.source !== "USER" && existing.source !== "IMPORTED") {
      return NextResponse.json(
        {
          error:
            "Posodobiti se da samo uporabniški vnos/uvoz (provider zapisi imajo svoj kanal).",
        },
        { status: 403 }
      );
    }

    // Vrata: zasebna pot → ≥ EDITOR (ista vrata kot nov zapis).
    if (existing.shareId) {
      const savedAccess = await db.savedItinerary.findUnique({
        where: { shareId: existing.shareId },
        select: { isPublic: true },
      });
      if (savedAccess && !savedAccess.isPublic) {
        const gate = await communityTripGate(existing.shareId, "edit");
        if (gate) return gate;
      }
    }

    if (!isValidStatusTransition(existing.status as never, status as never)) {
      return NextResponse.json(
        { error: `Prehod ${existing.status} → ${status} ni dovoljen` },
        { status: 409 }
      );
    }

    // Atestacije iz importData (dokument je uporabniško potrjen ob
    // potrditvi; preklic/spodletek jih pometeta).
    let fields: ImportFieldSet = {
      providerName: null,
      reservationNumber: null,
      startDateTime: null,
      endDateTime: null,
      locationName: null,
      guestName: null,
      price: null,
      currency: null,
      cancellationDeadline: null,
      contact: null,
      notes: null,
    };
    try {
      if (existing.importData) {
        fields = {
          ...fields,
          ...(JSON.parse(existing.importData) as ImportFieldSet),
        };
      }
    } catch {
      // star/hiter importData — prazno
    }

    const rec: BookingConfirmationRecord = {
      provider: existing.provider as BookingConfirmationRecord["provider"],
      providerProductId: existing.providerProductId,
      status: status as BookingConfirmationRecord["status"],
      source: existing.source as BookingSource,
      ...(status === "CONFIRMED" && fields.reservationNumber
        ? { providerBookingId: fields.reservationNumber }
        : {}),
      ...(status === "CONFIRMED" && fields.price != null
        ? { confirmedPrice: { amount: fields.price, currency: "EUR" as const } }
        : {}),
    };
    const validation = validateConfirmationRecord(rec);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.reason }, { status: 400 });
    }

    // CAS (isto varovalko kot PATCH provider kanal).
    const updated = await db.journeyBooking.updateMany({
      where: { id, status: existing.status },
      data: {
        status,
        providerBookingId: rec.providerBookingId ?? null,
        confirmedPrice: rec.confirmedPrice?.amount ?? null,
        ...(status === "CONFIRMED" ? {} : { importData: null }),
      },
    });
    if (updated.count === 0) {
      return NextResponse.json(
        { error: "Stanje zapisa se je spremenilo — ponovite branje" },
        { status: 409 }
      );
    }

    void logAudit({
      actorId: sessionUserId ?? undefined,
      actorRole: sessionUserId ? "user" : "edit-token-owner",
      action: AUDIT_ACTIONS.RESERVATION_IMPORT_CONFIRMED,
      resourceType: "journey_booking",
      resourceId: existing.shareId ?? id,
      metadata: {
        id,
        from: existing.status,
        to: status,
        source: existing.source,
      },
    });

    const booking = await db.journeyBooking.findUnique({
      where: { id },
      select: SELECT_FIELDS,
    });
    return NextResponse.json({ booking, transitioned: true });
  } catch (error) {
    console.error("[journey/bookings/import] posodobitev napaka:", error);
    return NextResponse.json(
      { error: "Posodobitev rezervacije trenutno ni možna" },
      { status: 503 }
    );
  }
}

const SELECT_FIELDS = {
  id: true,
  provider: true,
  providerProductId: true,
  status: true,
  source: true,
  providerBookingId: true,
  confirmedPrice: true,
  currency: true,
  importData: true,
  createdAt: true,
  updatedAt: true,
} as const;
