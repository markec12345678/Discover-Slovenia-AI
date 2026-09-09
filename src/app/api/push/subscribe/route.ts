import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

// ============================================================================
// PUSH SUBSCRIBE — shrani/osveži browser push naročnino (VAPID)
// ============================================================================
//
// Kontrakt (konsumirata ga PushSubscribe / TripPushCard frontend):
//   POST /api/push/subscribe
//     body { endpoint, keys: { p256dh, auth }, userAgent?,
//            trip?: { shareId, days } }   ← dnevni opomnik za potovanje
//     → 201 (nova vrstica) | 200 (posodobljena) { success: true }
//
// Upsert po endpoint (@unique): ob vsakem klicu osvežimo p256dh/auth/
// userAgent + lastSeenAt in POČISTIMO unsubscribedAt (brskalnik lahko
// re-subscriba isti endpoint z novimi ključi).
//
// TRIP kontekst (opcijsen): 
//   - shareId (10 hex znakov — enaka validacija kot /pot/[shareId]) mora
//     OBSTOJATI v SavedItinerary (grounded — push vezemo le na realne
//     načrte), days 1–30 določa življenjsko dobo naročnine.
//   - destinationIds izluščimo iz dni načrta (JSON), tripStart/lastPushAt
//     resetiramo, tripEnd = sedaj + days.
//   - Klic BREZ trip konteksta pusti obstoječa trip polja nedotaknjena
//     (newsletter re-subscribe NE razveljavi trip naročnine).
//
// Validacija:
//   endpoint  — https URL, 1–2048 znakov (trim)
//   p256dh    — 1–512 znakov (base64)
//   auth      — 1–512 znakov (base64)
//   userAgent — neobvezno, max 300 znakov
//   shareId   — 10 hex znakov (regex, enak /pot strani)
//   days      — celo število 1–30
// ============================================================================

const HOUR_MS = 60 * 60_000;

/** Enak pattern kot /pot/[shareId] — 10 hex znakov. */
const SHARE_ID_RE = /^[a-f0-9]{10}$/;

interface SubscribeBody {
  endpoint?: unknown;
  keys?: unknown;
  userAgent?: unknown;
  trip?: unknown;
}

/** Trip kontekst iz body-ja (validiran) ali null. */
interface TripContext {
  shareId: string;
  days: number;
}

/**
 * Validiraj opcijski trip kontekst.
 * - trip podan kot objekt z shareId + days → veljaven kontekst
 * - trip === undefined/null → null (splošna naročnina, OK)
 * - trip podan, ampak neveljaven → napaka (400 response)
 */
function validateTripContext(
  raw: unknown
): { ok: true; trip: TripContext | null } | { ok: false; response: NextResponse } {
  if (raw === undefined || raw === null) return { ok: true, trip: null };

  const t = (typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const shareId = typeof t.shareId === "string" ? t.shareId.trim().toLowerCase() : "";
  const days = typeof t.days === "number" ? t.days : Number(t.days);

  if (!SHARE_ID_RE.test(shareId)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Neveljaven shareId (10 hex znakov)" },
        { status: 400 }
      ),
    };
  }
  if (!Number.isInteger(days) || days < 1 || days > 30) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Število dni mora biti med 1 in 30" },
        { status: 400 }
      ),
    };
  }

  return { ok: true, trip: { shareId, days } };
}

/** Skupni validacijski helper → veljavna naročnina ali NextResponse. */
function validateSubscribeBody(
  raw: unknown
):
  | {
      ok: true;
      endpoint: string;
      p256dh: string;
      auth: string;
      userAgent: string | null;
    }
  | { ok: false; response: NextResponse } {
  const b = (raw ?? {}) as SubscribeBody;

  // --- endpoint: https URL, max 2048 znakov ---
  const endpoint = typeof b.endpoint === "string" ? b.endpoint.trim() : "";
  if (!endpoint) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Manjka endpoint naročnine" },
        { status: 400 }
      ),
    };
  }
  if (endpoint.length > 2048 || !endpoint.startsWith("https://")) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Endpoint mora biti veljaven https naslov (max 2048 znakov)" },
        { status: 400 }
      ),
    };
  }

  // --- keys: p256dh + auth, 1–512 znakov ---
  const keys =
    b.keys && typeof b.keys === "object" ? (b.keys as Record<string, unknown>) : {};
  const p256dh = typeof keys.p256dh === "string" ? keys.p256dh.trim() : "";
  const auth = typeof keys.auth === "string" ? keys.auth.trim() : "";

  if (!p256dh || p256dh.length > 512) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Manjka ali neveljaven ključ p256dh (1–512 znakov)" },
        { status: 400 }
      ),
    };
  }
  if (!auth || auth.length > 512) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Manjka ali neveljaven ključ auth (1–512 znakov)" },
        { status: 400 }
      ),
    };
  }

  // --- userAgent: neobvezen, max 300 znakov ---
  const userAgentRaw =
    typeof b.userAgent === "string" ? b.userAgent.trim() : "";
  const userAgent = userAgentRaw ? userAgentRaw.slice(0, 300) : null;

  return { ok: true, endpoint, p256dh, auth, userAgent };
}

// ============================================================================
// POST — upsert naročnine
// ============================================================================
export async function POST(request: Request) {
  const limited = rateLimit(request, {
    limit: 20,
    windowMs: HOUR_MS,
    key: "push:sub",
  });
  if (limited) return limited;

  try {
    const raw: unknown = await request.json().catch(() => null);
    const validated = validateSubscribeBody(raw);
    if (!validated.ok) return validated.response;
    const { endpoint, p256dh, auth, userAgent } = validated;

    // Trip kontekst (opcijsen) — validacija oblike.
    const tripValidated = validateTripContext(
      (raw as SubscribeBody | null)?.trip
    );
    if (!tripValidated.ok) return tripValidated.response;
    const trip = tripValidated.trip;

    // Grounded: trip naročnino vezemo SAMO na obstoječ shranjeni načrt.
    // (fetchMany, ker shareId ni unique ključ te tabele — vendar je v
    // praksi edinstven po /api/itinerary/save logiki; take:1 zadostuje.)
    let tripData: {
      shareId: string;
      destinationIds: string | null;
      tripStart: Date;
      tripEnd: Date;
    } | null = null;

    if (trip) {
      const saved = await db.savedItinerary.findFirst({
        where: { shareId: trip.shareId },
        select: { itinerary: true },
      });
      if (!saved) {
        return NextResponse.json(
          { error: "Potovanje s tem shareId ne obstaja" },
          { status: 404 }
        );
      }

      // Izlušči unikatne destination_id iz dni načrta (grounded kontekst).
      const destIds = new Set<string>();
      try {
        const parsed = JSON.parse(saved.itinerary) as {
          days?: Array<{ locations?: Array<{ destination_id?: unknown }> }>;
        };
        for (const day of parsed.days ?? []) {
          for (const loc of day.locations ?? []) {
            const id =
              typeof loc?.destination_id === "string"
                ? loc.destination_id.trim()
                : "";
            if (id) destIds.add(id);
          }
        }
      } catch {
        // Pokvarjen JSON načrta — push bo deloval, brez destinacijskega
        // ciljanja (cron fallback: splošna vsebina).
      }

      const tripStart = new Date();
      tripData = {
        shareId: trip.shareId,
        destinationIds: destIds.size > 0 ? JSON.stringify([...destIds]) : null,
        tripStart,
        tripEnd: new Date(tripStart.getTime() + trip.days * 24 * 60 * 60 * 1000),
      };
    }

    // Upsert po endpoint: novo vrstico → 201; obstoječo → osveži
    // ključe/userAgent/lastSeenAt in počisti unsubscribedAt (re-subscribe).
    const existing = await db.pushSubscription.findUnique({
      where: { endpoint },
      select: { id: true },
    });

    await db.pushSubscription.upsert({
      where: { endpoint },
      update: {
        p256dh,
        auth,
        userAgent,
        lastSeenAt: new Date(),
        unsubscribedAt: null, // re-subscribe: vrstica je spet aktivna
        // Trip kontekst nastavimo SAMO, če je podan (newsletter re-subscribe
        // naj ne razveljavi obstoječe trip naročnine).
        ...(tripData
          ? {
              kind: "trip",
              shareId: tripData.shareId,
              destinationIds: tripData.destinationIds,
              tripStart: tripData.tripStart,
              tripEnd: tripData.tripEnd,
              lastPushAt: null, // svež začetek — dnevni limit resetiran
            }
          : {}),
      },
      create: {
        endpoint,
        p256dh,
        auth,
        userAgent,
        ...(tripData
          ? {
              kind: "trip",
              shareId: tripData.shareId,
              destinationIds: tripData.destinationIds,
              tripStart: tripData.tripStart,
              tripEnd: tripData.tripEnd,
            }
          : {}),
      },
    });

    return NextResponse.json(
      { success: true, trip: tripData ? { shareId: tripData.shareId } : undefined },
      { status: existing ? 200 : 201 }
    );
  } catch (error) {
    console.error("[push/subscribe] POST napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri shranjevanju naročnine" },
      { status: 500 }
    );
  }
}
