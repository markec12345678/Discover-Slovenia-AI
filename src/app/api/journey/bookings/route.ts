import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { timingSafeEqual } from "@/lib/security";
import { communityTripGate } from "@/lib/trip-permissions";
import {
  isValidStatusTransition,
  validateConfirmationRecord,
  type BookingConfirmationRecord,
} from "@/lib/journey/booking";
import { CONFIRMATION_STATUSES, INITIAL_CONFIRMATION_STATUSES } from "@/lib/journey/types";
import type { ProviderSlug } from "@/lib/supply/types";

// ============================================================================
// TASK 99 (issue #1 §2) — WRITE POT ZA LIFECYCLE REZERVACIJ POTOVANJA
// ============================================================================
// Do TASK 98 je bila tabela JourneyBooking arhitektura BREZ pisalne poti
// (0 zapisov, GET brez klicalnika — spanja državna naprava). TASK 99 jo
// prebudi ISKRENO (brez fake potrditev):
//
//  GET   ?shareId=…            — potrditve shranjene poti (obstoječe)
//  GET   ?products=p:id,…      — efemerne vrstice (shareId NULL) za prekrivko
//                                My Trip (bookingId/confirmedCount iz DB)
//  POST                          — uporabnikovi ISKRENI dogodki brez provider
//                                odgovora: SELECTED / EXTERNAL (checkout
//                                handoff ob kliku na /go) / BOOKING_REQUESTED
//  PATCH                         — provider-driven prehodi (PENDING, PAID,
//                                CONFIRMED, REFUNDED, MODIFIED, EXPIRED …) —
//                                ZAKLENJENI z žetonom (env JOURNEY_PROVIDER_
//                                TOKEN), fail-closed dokler ni poverilnic
//
// INVARIANTE (lib/journey/booking.ts, testno varovane):
//  - EXTERNAL NIKOLI ne postane CONFIRMED (absorptivno stanje);
//  - CONFIRMED/PAID/MODIFIED zahtevata providerBookingId + potrjeno ceno;
//  - REFUNDED zahteva providerBookingId (vračilo = providerjev dogodek);
//  - zapišemo SAMO tisto, kar dejansko vemo (0 poverilnic → 0 CONFIRMED).
// ============================================================================

/** Veljavni ponudniki zapisa (kanonski slugi + lokalni koledar dogodkov). */
const VALID_PROVIDERS: readonly string[] = [
  "osm",
  "fsq",
  "sto",
  "own",
  "booking",
  "viator",
  "getyourguide",
  "tiqets",
  "kiwitaxi",
  "discovercars",
  "skyscanner",
  "omio",
  "airalo",
  "worldnomads",
  "safetywing",
  "travelpayouts",
  "events",
];

const SHARE_ID_RE = /^[a-z0-9]{1,32}$/;

/** Anonimni ID seje (UUID ali dsa- oblika) — obseg efemernih vrstic. */
const SESSION_KEY_RE = /^[a-zA-Z0-9_-]{1,64}$/;

function providerError(): NextResponse {
  return NextResponse.json(
    { error: "Neveljaven ponudnik (provider)" },
    { status: 400 }
  );
}

function statusError(allowed: readonly string[]): NextResponse {
  return NextResponse.json(
    {
      error: `Neveljaven status — dovoljeni: ${allowed.join(", ")}`,
    },
    { status: 400 }
  );
}

// ---------------------------------------------------------------------------
// GET — potrditve po shareId (shranjena pot) ALI po produktih (efemerna)
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const limited = rateLimit(request, {
    limit: 60,
    windowMs: 60_000,
    key: "journey-bookings",
  });
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const shareId = (searchParams.get("shareId") ?? "").trim().toLowerCase();
  const productsParam = (searchParams.get("products") ?? "").trim();

  try {
    // Način A: potrditve shranjene poti (obstoječa semantika TASK 58).
    if (shareId) {
      if (!SHARE_ID_RE.test(shareId)) {
        return NextResponse.json({ error: "Neveljaven shareId" }, { status: 400 });
      }

      // ISSUE #4 §13 (val 2): zasebna pot → branje prekrivke zahteva vlogo
      // ≥ VIEWER (javna pot = kot doslej). Preverimo poceni (en select),
      // vrata odperejo samo zasebnim pote potezam.
      const savedAccess = await db.savedItinerary.findUnique({
        where: { shareId },
        select: { isPublic: true },
      });
      if (savedAccess && !savedAccess.isPublic) {
        const gate = await communityTripGate(shareId, "read");
        if (gate) return gate;
      }

      const bookings = await db.journeyBooking.findMany({
        where: { shareId },
        select: SELECT_FIELDS,
        orderBy: { createdAt: "asc" },
        take: 100,
      });
      // Iskrenost: prazen seznam = ni še nobene provider potrditve (dokaz,
      // ne napaka) — UI izpiše ločeno od napake okolja.
      return NextResponse.json({ bookings });
    }

    // Način B (TASK 99): efemerne vrstice (shareId NULL) za My Trip
    // prekrivko — ključ je (provider, providerProductId), max 20 produktov.
    // OBVEZEN sessionKey (dsa_planner_sid): vrstice so obsegene na sejo
    // brskalnika, da stanje NE pušča med uporabniki.
    if (productsParam) {
      const sessionKey = (searchParams.get("sessionKey") ?? "").trim();
      if (!SESSION_KEY_RE.test(sessionKey)) {
        return NextResponse.json(
          { error: "Manjka/nezveljaven sessionKey" },
          { status: 400 }
        );
      }
      const pairs = productsParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 20)
        .map((s) => {
          const idx = s.indexOf(":");
          if (idx <= 0) return null;
          return {
            provider: s.slice(0, idx),
            providerProductId: s.slice(idx + 1),
          };
        })
        .filter(
          (p): p is { provider: string; providerProductId: string } =>
            p != null &&
            VALID_PROVIDERS.includes(p.provider) &&
            p.providerProductId.length > 0 &&
            p.providerProductId.length <= 200
        );
      if (pairs.length === 0) {
        return NextResponse.json(
          { error: "Neveljaven format products (provider:productId,…)" },
          { status: 400 }
        );
      }
      const bookings = await db.journeyBooking.findMany({
        where: { shareId: null, sessionKey, OR: pairs },
        select: SELECT_FIELDS,
        orderBy: { createdAt: "asc" },
        take: 100,
      });
      return NextResponse.json({ bookings });
    }

    return NextResponse.json(
      { error: "Zahtevan je shareId ali products parameter" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[journey/bookings] GET napaka:", error);
    return NextResponse.json(
      { error: "Baza potrditev trenutno ni dosegljiva" },
      { status: 503 }
    );
  }
}

const SELECT_FIELDS = {
  id: true,
  provider: true,
  providerProductId: true,
  status: true,
  providerBookingId: true,
  confirmedPrice: true,
  currency: true,
  confirmationUrl: true,
  cancellationUrl: true,
  createdAt: true,
  updatedAt: true,
} as const;

// ---------------------------------------------------------------------------
// POST — uporabnikovi ISKRENI dogodki (brez provider odgovora)
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const limited = rateLimit(request, {
    limit: 30,
    windowMs: 60_000,
    key: "journey-bookings-write",
  });
  if (limited) return limited;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Neveljaven JSON" }, { status: 400 });
  }

  const provider = typeof body.provider === "string" ? body.provider : "";
  const providerProductId =
    typeof body.providerProductId === "string" ? body.providerProductId.trim() : "";
  const status = typeof body.status === "string" ? body.status : "";
  const shareId =
    typeof body.shareId === "string" ? body.shareId.trim().toLowerCase() : "";
  const sessionKey =
    typeof body.sessionKey === "string" ? body.sessionKey.trim() : "";

  if (!VALID_PROVIDERS.includes(provider)) return providerError();
  if (providerProductId.length === 0 || providerProductId.length > 200) {
    return NextResponse.json(
      { error: "Neveljaven providerProductId (1–200 znakov)" },
      { status: 400 }
    );
  }
  if (shareId && !SHARE_ID_RE.test(shareId)) {
    return NextResponse.json({ error: "Neveljaven shareId" }, { status: 400 });
  }
  // Efemerne vrstice (brez shareId) ZAHTEVAJO sessionKey — obseg seje.
  if (!shareId && !SESSION_KEY_RE.test(sessionKey)) {
    return NextResponse.json(
      { error: "Manjka/nezveljaven sessionKey (obvezno brez shareId)" },
      { status: 400 }
    );
  }
  // SAMO začetni (uporabniku pripisljivi) statusi — vse ostalo je
  // provider-driven in živi za PATCH kanalom (žeton). Fail-closed.
  if (!INITIAL_CONFIRMATION_STATUSES.includes(status as never)) {
    return statusError(INITIAL_CONFIRMATION_STATUSES);
  }

  // ISSUE #4 §13 (val 2): zapis dogodka NA ZASEBNO pot zahteva vlogo
  // komentatorja+ (javna pot = kot doslej; efemerne vrstice brez shareId
  // so obsegene s sessionKey in ostajajo odprte).
  if (shareId) {
    const savedAccess = await db.savedItinerary.findUnique({
      where: { shareId },
      select: { isPublic: true },
    });
    if (savedAccess && !savedAccess.isPublic) {
      const gate = await communityTripGate(shareId, "comment");
      if (gate) return gate;
    }
  }

  // S1 (HARDENING, P1): klientova pot NIKOLI ne nosi provider-atestacij.
  // providerBookingId/confirmedPrice/confirmationUrl/cancellationUrl/
  // providerPayload so IZKLJUČNO tisto, kar je vrnil provider — zapisuje jih
  // lahko SAMO žetonom zaklenjen PATCH kanal. Prej je buildRecordFromBody
  // kopiral klientova polja za začetne statuse (SELECTED/BOOKING_REQUESTED
  // …): lažni providerBookingId se je izrisal kot „Št. rezervacije" v
  // dokumentu My Trip. Zapis klientovega dogodka = identiteta + status.
  const rec: BookingConfirmationRecord = {
    provider: provider as ProviderSlug,
    providerProductId,
    status: status as BookingConfirmationRecord["status"],
  };
  const validation = validateConfirmationRecord(rec);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.reason }, { status: 400 });
  }

  // C3 (HARDENING, P1-vzorec /api/bookings): dedup + create atomarno —
  // findFirst → create brez transakcije je TOCTOU (dva sočasna handoff
  // klika ustvarita dve vrstici). SERIALIZABLE na Postgresu (P2034 retry),
  // SQLite (enouporabniška demo) privzeta raven.
  const txOptions = process.env.DATABASE_URL?.startsWith("file:")
    ? undefined
    : { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };

  try {
    for (let attempt = 0; ; attempt++) {
      try {
        const result = await db.$transaction(
          async (tx) => {
            // Idempotenčna semantika: obstoječa vrstica ISTEGA produkta (in
            // istega konteksta shareId+sessionKey) se NE podvaja — ponovni
            // klik na handoff povezavo ne ustvari novih vrstic; sprememba
            // statusa gre prek prehodov.
            const existing = await tx.journeyBooking.findFirst({
              where: {
                provider,
                providerProductId,
                shareId: shareId || null,
                ...(shareId ? {} : { sessionKey }),
              },
              select: { id: true, status: true },
            });

            if (existing) {
              if (existing.status === rec.status) {
                const booking = await tx.journeyBooking.findUnique({
                  where: { id: existing.id },
                  select: SELECT_FIELDS,
                });
                return { kind: "idempotent" as const, booking };
              }
              if (
                !isValidStatusTransition(
                  existing.status as never,
                  rec.status as never
                )
              ) {
                return { kind: "conflict" as const, from: existing.status };
              }
              // Klientov prehod spreminja SAMO status — nikoli ne pomete
              // atestacij, ki jih je zapisal provider kanal (PATCH).
              const booking = await tx.journeyBooking.update({
                where: { id: existing.id },
                data: { status: rec.status },
                select: SELECT_FIELDS,
              });
              return { kind: "transitioned" as const, booking };
            }

            const booking = await tx.journeyBooking.create({
              data: {
                provider,
                providerProductId,
                status: rec.status,
                ...(shareId ? { shareId } : { sessionKey }),
                // S1: atestacijska polja ostanejo NULL — zapisuje jih izključno
                // provider (PATCH kanal, žeton) iz providerjevega odgovora.
                providerBookingId: null,
                confirmedPrice: null,
                currency: "EUR",
                confirmationUrl: null,
                cancellationUrl: null,
                providerPayload: null,
              },
              select: SELECT_FIELDS,
            });
            return { kind: "created" as const, booking };
          },
          txOptions
        );

        if (result.kind === "conflict") {
          return NextResponse.json(
            {
              error: `Prehod ${result.from} → ${rec.status} ni dovoljen`,
            },
            { status: 409 }
          );
        }
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
    console.error("[journey/bookings] POST napaka:", error);
    return NextResponse.json(
      { error: "Zapis potrditve trenutno ni možen" },
      { status: 503 }
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH — provider-driven prehodi (žeton, fail-closed brez poverilnic)
// ---------------------------------------------------------------------------

export async function PATCH(request: Request) {
  const limited = rateLimit(request, {
    limit: 30,
    windowMs: 60_000,
    key: "journey-bookings-write",
  });
  if (limited) return limited;

  // FAIL-CLOSED: prehode, ki jih poganja PONUDNIK (webhook/integracija),
  // sprejmemo SAMO s konfiguriranim žetonom. Danes (0 poverilnic) žetona
  // ni → kanal je izklopljen in to iskreno sporočimo. Z žetonom pa je
  // državna naprava (ALLOWED_TRANSITIONS + validator) pripravljena.
  const token = process.env.JOURNEY_PROVIDER_TOKEN;
  if (!token) {
    return NextResponse.json(
      {
        error:
          "Kanal provider prehodov ni konfiguriran (JOURNEY_PROVIDER_TOKEN) — brez poverilnic nobene spremembe statusa iz providerjevih dogodkov",
      },
      { status: 503 }
    );
  }
  const provided =
    request.headers.get("x-provider-token") ??
    (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  // C2 (HARDENING): timing-safe primerjava ( isti vzorec kot admin geslo /
  // cron secret — prej običajni !== je puščal timing signal).
  if (!timingSafeEqual(provided, token)) {
    return NextResponse.json({ error: "Neveljaven žeton" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Neveljaven JSON" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  const status = typeof body.status === "string" ? body.status : "";
  if (!id) {
    return NextResponse.json({ error: "Manjka id zapisa" }, { status: 400 });
  }
  if (!CONFIRMATION_STATUSES.includes(status as never)) {
    return statusError(CONFIRMATION_STATUSES);
  }

  try {
    const existing = await db.journeyBooking.findUnique({
      where: { id },
      select: { id: true, status: true, provider: true, providerProductId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Zapis ni najden" }, { status: 404 });
    }
    if (!isValidStatusTransition(existing.status as never, status as never)) {
      return NextResponse.json(
        { error: `Prehod ${existing.status} → ${status} ni dovoljen` },
        { status: 409 }
      );
    }

    const rec = buildRecordFromBody(body, {
      provider: existing.provider as ProviderSlug,
      providerProductId: existing.providerProductId,
      status,
    });
    const validation = validateConfirmationRecord(rec);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.reason }, { status: 400 });
    }

    // C4 (HARDENING): POGOJEN zapis (compare-and-swap) — prej je veljal
    // read-then-write z brezpogojnim update: sočasna PATCH-a sta se preklala
    // (last-write-wins) in lahko preskočila terminalna stanja. Oglišče
    // updateMany sprejme PREDALOGO statusa iz branja; če je vrstica vmes
    // spremenila stanje, count=0 → 409 ( isto vzorec kot owner PATCH).
    const result = await db.journeyBooking.updateMany({
      where: { id, status: existing.status },
      data: updateDataOf(rec),
    });
    if (result.count === 0) {
      return NextResponse.json(
        {
          error: `Stanje zapisa se je spremenilo ( ${existing.status} → …) — ponovite branje`,
        },
        { status: 409 }
      );
    }
    const booking = await db.journeyBooking.findUnique({
      where: { id },
      select: SELECT_FIELDS,
    });
    return NextResponse.json({ booking, transitioned: true });
  } catch (error) {
    console.error("[journey/bookings] PATCH napaka:", error);
    return NextResponse.json(
      { error: "Posodobitev potrditve trenutno ni možna" },
      { status: 503 }
    );
  }
}

// ---------------------------------------------------------------------------
// Pomožniki — sestava zapisa iz telesa zahteve
// ---------------------------------------------------------------------------

// SAMO za PATCH (provider kanal, žeton): prebere IZKLJUČNO providerjeva
// atestacijska polja iz telesa. POST (klientova pot) te pomožnika NE kliče
// — glej S1 zgoraj.
function buildRecordFromBody(
  body: Record<string, unknown>,
  identity: { provider: string; providerProductId: string; status: string }
): BookingConfirmationRecord {
  const confirmedPrice =
    typeof body.confirmedPrice === "number" && Number.isFinite(body.confirmedPrice)
      ? { amount: body.confirmedPrice, currency: "EUR" as const }
      : undefined;
  return {
    provider: identity.provider as ProviderSlug,
    providerProductId: identity.providerProductId,
    status: identity.status as BookingConfirmationRecord["status"],
    ...(typeof body.providerBookingId === "string" && body.providerBookingId.trim()
      ? { providerBookingId: body.providerBookingId.trim() }
      : {}),
    ...(confirmedPrice ? { confirmedPrice } : {}),
    ...(typeof body.confirmationUrl === "string" && /^https:\/\//.test(body.confirmationUrl)
      ? { confirmationUrl: body.confirmationUrl }
      : {}),
    ...(typeof body.cancellationUrl === "string" && /^https:\/\//.test(body.cancellationUrl)
      ? { cancellationUrl: body.cancellationUrl }
      : {}),
    ...(typeof body.providerPayload === "string" && body.providerPayload.length <= 20_000
      ? { providerPayload: body.providerPayload }
      : {}),
  };
}

function updateDataOf(rec: BookingConfirmationRecord) {
  return {
    status: rec.status,
    providerBookingId: rec.providerBookingId ?? null,
    confirmedPrice: rec.confirmedPrice?.amount ?? null,
    confirmationUrl: rec.confirmationUrl ?? null,
    cancellationUrl: rec.cancellationUrl ?? null,
    providerPayload: rec.providerPayload ?? null,
  };
}
