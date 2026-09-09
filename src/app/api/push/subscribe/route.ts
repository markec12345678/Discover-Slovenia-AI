import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

// ============================================================================
// PUSH SUBSCRIBE — shrani/osveži browser push naročnino (VAPID)
// ============================================================================
//
// Kontrakt (konsumira ga PushSubscribe / 11-b frontend):
//   POST /api/push/subscribe
//     body { endpoint, keys: { p256dh, auth }, userAgent? }
//     → 201 (nova vrstica) | 200 (posodobljena) { success: true }
//
// Upsert po endpoint (@unique): ob vsakem klicu osvežimo p256dh/auth/
// userAgent + lastSeenAt in POČISTIMO unsubscribedAt (brskalnik lahko
// re-subscriba isti endpoint z novimi ključi).
//
// Validacija:
//   endpoint  — https URL, 1–2048 znakov (trim)
//   p256dh    — 1–512 znakov (base64)
//   auth      — 1–512 znakov (base64)
//   userAgent — neobvezno, max 300 znakov
// ============================================================================

const HOUR_MS = 60 * 60_000;

interface SubscribeBody {
  endpoint?: unknown;
  keys?: unknown;
  userAgent?: unknown;
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
      },
      create: { endpoint, p256dh, auth, userAgent },
    });

    return NextResponse.json(
      { success: true },
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
