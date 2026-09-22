import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
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

  // Sestavi zapis + potrdi invariante (EXTERNAL brez bookingId/cene …).
  const rec = buildRecordFromBody(body, {
    provider,
    providerProductId,
    status,
  });
  const validation = validateConfirmationRecord(rec);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.reason }, { status: 400 });
  }

  try {
    // Idempotenčna semantika: obstoječa vrstica ISTEGA produkta (in istega
    // konteksta shareId+sessionKey) se NE podvaja — ponovni klik na handoff
    // povezavo ne ustvari novih vrstic; sprememba statusa gre prek prehodov.
    const existing = await db.journeyBooking.findFirst({
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
        const booking = await db.journeyBooking.findUnique({
          where: { id: existing.id },
          select: SELECT_FIELDS,
        });
        return NextResponse.json({ booking, idempotent: true });
      }
      if (!isValidStatusTransition(existing.status as never, rec.status as never)) {
        return NextResponse.json(
          {
            error: `Prehod ${existing.status} → ${rec.status} ni dovoljen`,
          },
          { status: 409 }
        );
      }
      const booking = await db.journeyBooking.update({
        where: { id: existing.id },
        data: updateDataOf(rec),
        select: SELECT_FIELDS,
      });
      return NextResponse.json({ booking, transitioned: true });
    }

    const booking = await db.journeyBooking.create({
      data: {
        provider,
        providerProductId,
        status: rec.status,
        ...(shareId ? { shareId } : { sessionKey }),
        providerBookingId: rec.providerBookingId ?? null,
        confirmedPrice: rec.confirmedPrice?.amount ?? null,
        currency: "EUR",
        confirmationUrl: rec.confirmationUrl ?? null,
        cancellationUrl: rec.cancellationUrl ?? null,
        providerPayload: rec.providerPayload ?? null,
      },
      select: SELECT_FIELDS,
    });
    return NextResponse.json({ booking, created: true }, { status: 201 });
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
  if (provided !== token) {
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

    const booking = await db.journeyBooking.update({
      where: { id },
      data: updateDataOf(rec),
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
