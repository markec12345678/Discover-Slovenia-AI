import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendPush, isPushConfigured, type PushPayload } from "@/lib/push";
import { rateLimit } from "@/lib/rate-limit";

// ============================================================================
// PUSH TEST — pošlji testno obvestilo na LASTNO naročnino (gumb v UI)
// ============================================================================
//
// Kontrakt (konsumira ga PushSubscribe.handleTest):
//   POST /api/push/test
//     body { subscription: { endpoint, keys: { p256dh, auth } } }
//     → 200 { success: true, message }   (push service sprejel)
//     → 400 { error }                    (neveljavno telo)
//     → 404 { error }                    (endpoint ni v DB — najprej prijava)
//     → 503 { error }                    (VAPID ni konfiguriran — honestno)
//     → 200 { error, gone: true }        (push service 404/410 — naročnina mrtva)
//
// VARNOSTNA RAZMISLEK (zakaj je ta ruta drugačna od "samo pošlji"):
//   1. POŠILJANJE JE DRAGO: vsak klic pomeni VAPID podpis + omrežni dostop
//      do push service — zato strožji limit (5/h) kot pri subscribe (20/h).
//   2. ARBITRARY-ENDPOINT SPAM: brez DB preverjanja bi lahko klicalec naš
//      strežnik uporabil kot push-relay — pošiljal bi obvestila na KATERIKOLI
//      endpoint, ki ga pozna (žrtev bi videla naše ime pošiljatelja). Zato
//      endpoint MORA obstajati v PushSubscription (findUnique po @unique).
//   3. KLJUČI IZ DB, NE IZ TELE: klicalčeve keys validiramo po OBLIKI (isti
//      vzorec kot subscribe), a pri pošiljanju uporabimo p256dh/auth IZ DB —
//      strežnik je avtoriteta, klient bi lahko poslal tuje ključe.
//   4. SOFT-DELETED (unsubscribedAt) vrstica je mrtva → obravnavana kot
//      "ni najdena" (cron ob 404/410 nastavi unsubscribedAt; honestno
//      zavrnemo test namesto pošiljanja v prazno).
// ============================================================================

const HOUR_MS = 60 * 60_000;

interface TestBody {
  subscription?: unknown;
}

/** Validirana oblika naročnine (samo OBLIKA — ključe za pošiljanje vzamemo iz DB). */
interface SubscriptionShape {
  endpoint: string;
}

/**
 * Validacija subscription telesa — enak vzorec kot /api/push/subscribe:
 * endpoint (https, 1–2048, trim) + keys.p256dh/auth (1–512, trim).
 */
function validateSubscription(raw: unknown):
  | { ok: true; subscription: SubscriptionShape }
  | { ok: false; response: NextResponse } {
  const b = (raw ?? {}) as TestBody;
  const sub =
    b.subscription && typeof b.subscription === "object"
      ? (b.subscription as Record<string, unknown>)
      : null;

  if (!sub) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Manjka subscription objekt" },
        { status: 400 }
      ),
    };
  }

  // --- endpoint: https URL, max 2048 znakov (trim) — kot subscribe ---
  const endpoint = typeof sub.endpoint === "string" ? sub.endpoint.trim() : "";
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

  // --- keys: p256dh + auth, 1–512 znakov (samo preverba oblike) ---
  const keys =
    sub.keys && typeof sub.keys === "object"
      ? (sub.keys as Record<string, unknown>)
      : {};
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

  return { ok: true, subscription: { endpoint } };
}

/** Testni payload — sw.js pričakuje { title, body, url?, tag? }. */
const TEST_PAYLOAD: PushPayload = {
  title: "Discover Slovenia AI",
  body: "Testno obvestilo deluje 🎉",
  // Notranja pot (phishing-varna po konvenciji iz admin/push/send).
  url: "/",
  // Isti tag zamenja prejšnje testno obvestilo — ponovni testi se ne kopičijo.
  tag: "push-test",
};

// ============================================================================
// POST — testno obvestilo
// ============================================================================
export async function POST(request: Request) {
  // Pošiljanje push-a je "draga" akcija — strožji limit kot subscribe.
  const limited = rateLimit(request, {
    limit: 5,
    windowMs: HOUR_MS,
    key: "push:test",
  });
  if (limited) return limited;

  try {
    const raw: unknown = await request.json().catch(() => null);
    const validated = validateSubscription(raw);
    if (!validated.ok) return validated.response;

    // Naročnina MORA obstajati v DB (preprečuje arbitrary-endpoint spam).
    const row = await db.pushSubscription.findUnique({
      where: { endpoint: validated.subscription.endpoint },
      select: { id: true, endpoint: true, p256dh: true, auth: true, unsubscribedAt: true },
    });

    if (!row || row.unsubscribedAt) {
      // Enako sporočilo za neobstoječo in soft-deleted vrstico (brez razkrivanja).
      return NextResponse.json(
        { error: "Naročnina ni najdena — najprej se prijavi za obvestila" },
        { status: 404 }
      );
    }

    // VAPID konfiguracija — honestna odpoved, če strežnik ni pripravljen.
    if (!isPushConfigured()) {
      return NextResponse.json(
        { error: "Push obvestila niso konfigurirana na strežniku (VAPID)" },
        { status: 503 }
      );
    }

    // Pošlji s KLJUČI IZ DB (strežnik je avtoriteta, ne klientovo telo).
    const result = await sendPush(
      { endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth },
      TEST_PAYLOAD
    );

    if (result.ok) {
      // Uspešna dostava = naročnina živi (osveži lastSeenAt kot admin ruta).
      await db.pushSubscription
        .update({ where: { id: row.id }, data: { lastSeenAt: new Date() } })
        .catch(() => undefined);

      return NextResponse.json({
        success: true,
        message: "Testno obvestilo je poslano — poglej svojo napravo.",
      });
    }

    if (result.gone) {
      // Push service je naročnino odpovedal (404/410) — soft-delete kot cron;
      // klient uporabnika vrne na prijavo (gone: true kontrakt).
      await db.pushSubscription
        .update({ where: { id: row.id }, data: { unsubscribedAt: new Date() } })
        .catch(() => undefined);

      return NextResponse.json(
        { error: result.error ?? "Naročnina ni več veljavna", gone: true },
        { status: 200 }
      );
    }

    // Prehodna napaka (omrežje/5xx push service) — naročnina OSTANE.
    return NextResponse.json(
      { error: result.error ?? "Pošiljanje ni uspelo" },
      { status: 502 }
    );
  } catch (error) {
    console.error("[push/test] POST napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pošiljanju testnega obvestila" },
      { status: 500 }
    );
  }
}
