import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendPush, isPushConfigured, type PushPayload } from "@/lib/push";

// ============================================================================
// ADMIN PUSH SEND — broadcast obvestila vsem aktivnim naročninam
// ============================================================================
//
// Avtentikacija: isti vzorec kot /api/admin/analytics — header
// `x-admin-password` primerjamo s process.env.ADMIN_PASSWORD (401
// "Neavtorizirano"; fail-closed: manjkajoč env zavrne vse).
//
// Kontrakt (admin orodje — konzumira ga admin UI / curl):
//   POST /api/admin/push/send
//     header x-admin-password
//     body { title (1–120), body (1–300), url? (internal path, "/", max 500) }
//     → 200 { success: true, stats: { sent, failed, gone, total } }
//   GET  /api/admin/push/send
//     header x-admin-password
//     → 200 { active, total, unsubscribed, news, trip }
//
// Broadcast: samo splošne (kind="news") aktivne naročnine (unsubscribedAt:
// null). Naročnine kind="trip" so VEZANE na konkretno potovanje (dnevni
// opomniki iz /api/cron/daily-trip-push) — uporabnik je privolil SAMO v
// namige za svoj načrt, zato generični broadcast zanje ni pošten (spam).
// Pošiljanje prek Promise.allSettled — ZAPOREDNO bi ob sto naročnikih
// pomenilo dolgo življenjsko dobo requesta; allSettled omogoča vzporednost,
// en odgovor na vse in statistiko ne glede na posamične odpovedi.
//
// Čiščenje: vrstice, kjer je push service vrnil 404/410 (gone), pobrišemo
// (dead weight). Network napake NE brišejo (naročnina je morda živa).
// ============================================================================

/** Veljaven notranji URL: začne se s "/", max 500 znakov. */
const MAX_URL_LEN = 500;
const MAX_TITLE = 120;
const MAX_BODY = 300;

interface SendBody {
  title?: unknown;
  body?: unknown;
  url?: unknown;
}

/** Validacija broadcast payload-a → PushPayload ali NextResponse. */
function validateSendBody(
  raw: unknown
): { ok: true; payload: PushPayload } | { ok: false; response: NextResponse } {
  const b = (raw ?? {}) as SendBody;

  const title = typeof b.title === "string" ? b.title.trim() : "";
  if (!title || title.length > MAX_TITLE) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Naslov obvestila je obvezen (1–${MAX_TITLE} znakov)` },
        { status: 400 }
      ),
    };
  }

  const body = typeof b.body === "string" ? b.body.trim() : "";
  if (!body || body.length > MAX_BODY) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Besedilo obvestila je obvezno (1–${MAX_BODY} znakov)` },
        { status: 400 }
      ),
    };
  }

  let url: string | undefined;
  if (b.url !== undefined && b.url !== null && b.url !== "") {
    if (typeof b.url !== "string") {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "URL mora biti notranja pot (niz, ki se začne s \"/\")" },
          { status: 400 }
        ),
      };
    }
    const trimmedUrl = b.url.trim();
    // SAMO notranje poti — preprečuje phishing na zunanje domene.
    if (!trimmedUrl.startsWith("/") || trimmedUrl.length > MAX_URL_LEN) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: `URL mora biti notranja pot, ki se začne s "/" (max ${MAX_URL_LEN} znakov)`,
          },
          { status: 400 }
        ),
      };
    }
    url = trimmedUrl;
  }

  return { ok: true, payload: { title, body, url } };
}

/** Avtentikacija admin-a (fail-closed). */
function checkAdmin(request: Request): NextResponse | null {
  const adminPassword = request.headers.get("x-admin-password");
  if (!process.env.ADMIN_PASSWORD || adminPassword !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Neavtorizirano" }, { status: 401 });
  }
  return null;
}

// ============================================================================
// POST — broadcast
// ============================================================================
export async function POST(request: Request) {
  const unauthorized = checkAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    const raw: unknown = await request.json().catch(() => null);
    const validated = validateSendBody(raw);
    if (!validated.ok) return validated.response;
    const payload = validated.payload;

    if (!isPushConfigured()) {
      return NextResponse.json(
        { error: "Push ni konfiguriran (manjkajo VAPID ključi na strežniku)" },
        { status: 503 }
      );
    }

    // Samo splošne aktivne naročnine — trip naročnine cilja dnevni cron.
    const subscriptions = await db.pushSubscription.findMany({
      where: { unsubscribedAt: null, kind: "news" },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
      orderBy: { createdAt: "asc" },
    });

    const total = subscriptions.length;

    if (total === 0) {
      return NextResponse.json({
        success: true,
        stats: { sent: 0, failed: 0, gone: 0, total: 0 },
      });
    }

    // Vzporedno pošiljanje z allSettled — sendPush sama NE vrže.
    const results = await Promise.allSettled(
      subscriptions.map((sub) => sendPush(sub, payload))
    );

    let sent = 0;
    let failed = 0;
    let gone = 0;
    const goneIds: string[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const sub = subscriptions[i];
      if (result.status === "rejected") {
        // Teoretično (sendPush lovi vse) — vseeno obravnavamo.
        failed++;
        console.error(
          `[admin/push/send] Nepričakovana napaka (${sub.endpoint}):`,
          result.reason
        );
        continue;
      }
      if (result.value.ok) {
        sent++;
        // Osveži lastSeenAt (pošiljanje uspelo = naročnina živi).
        await db.pushSubscription.update({
          where: { id: sub.id },
          data: { lastSeenAt: new Date() },
        }).catch(() => undefined);
      } else if (result.value.gone) {
        gone++;
        goneIds.push(sub.id);
      } else {
        failed++;
      }
    }

    // Mrtve naročnine (push service 404/410) pobrišimo — dead weight.
    if (goneIds.length > 0) {
      await db.pushSubscription.deleteMany({
        where: { id: { in: goneIds } },
      });
    }

    return NextResponse.json({
      success: true,
      stats: { sent, failed, gone, total },
    });
  } catch (error) {
    console.error("[admin/push/send] POST napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pošiljanju obvestil" },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET — statistika naročnin
// ============================================================================
export async function GET(request: Request) {
  const unauthorized = checkAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    const total = await db.pushSubscription.count();
    const active = await db.pushSubscription.count({
      where: { unsubscribedAt: null },
    });
    // Razčlenitev po namenu naročnine (broadcast = "news", dnevni cron = "trip").
    const news = await db.pushSubscription.count({
      where: { unsubscribedAt: null, kind: "news" },
    });
    const trip = await db.pushSubscription.count({
      where: { unsubscribedAt: null, kind: "trip" },
    });

    return NextResponse.json({
      active,
      total,
      unsubscribed: total - active,
      // Aktivne po namenu: news (prejema broadcast) / trip (dnevni opomniki)
      news,
      trip,
    });
  } catch (error) {
    console.error("[admin/push/send] GET napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pridobivanju statistike naročnin" },
      { status: 500 }
    );
  }
}
