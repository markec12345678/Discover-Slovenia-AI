import webpush, {
  WebPushError,
  type PushSubscription as WebPushSubscription,
} from "web-push";

// ============================================================================
// WEB PUSH — server-side pošiljanje (VAPID)
// ============================================================================
//
// Retention kanal: obiskovalcem, ki so omogočili obvestila, lahko pošljemo
// "nudge" (npr. "Tvoj načrt je shranjen — dež napovedan za Bled soboto").
//
// Ključi so v .env (Task 11, skupna priprava):
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY — javni ključ (client urlBase64→Uint8Array
//     pri subscribe(); server ga bere prek istega imena spremenljivke)
//   VAPID_PRIVATE_KEY            — privatni ključ (SAMO server)
//   VAPID_SUBJECT                — mailto: kontakt (izdajatelj)
//
// Naročnine hranimo v Prisma modelu PushSubscription (endpoint @unique).
// "gone" semantika: ko push service vrne 404/410, je naročnina mrtva —
// klical naj jo pobriše. Vse OSTALE napake (timeout, 5xx, DNS …) niso
// smrt naročnine — vrstica OSTANE (sicer bi prehodna napaka izbrisala
// veljavnega naročnika).
// ============================================================================

/** Oblika payload-a, ki jo razume sw.js `push` handler (JSON, max ~2KB). */
export interface PushPayload {
  /** Naslov obvestila (1–120 znakov). */
  title: string;
  /** Telo obvestila (1–300 znakov). */
  body: string;
  /** Notranja pot (začne se s "/") — kam klik klikne. */
  url?: string;
  /** Notification tag — zamenja prejšnje obvestilo z istim tagom. */
  tag?: string;
}

/** Minimalna oblika PushSubscription vrstice iz DB-ja za pošiljanje. */
export interface PushSubscriptionLike {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Rezultat enega poskusa pošiljanja. */
export interface SendPushResult {
  /** true, če je push service sprejel obvestilo. */
  ok: boolean;
  /** true SAMO pri 404/410 — push service je naročnino odpovedal. */
  gone: boolean;
  /** Opis napake (za log / honestni odgovor klientu). */
  error?: string;
}

// --- Lazy VAPID konfiguracija -------------------------------------------------

let vapidConfigured = false;

/**
 * Nastavi VAPID podrobnosti na web-push knjižnici (idempotentno, lazy —
 * ob prvem pošiljanju). Vrne true, če so vsi ključi prisotni.
 */
function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) return false;

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidConfigured = true;
    return true;
  } catch {
    // Neveljavni ključi (npr. pokvarjen base64) — pošiljanje onemogočeno.
    console.error("[push] setVapidDetails je padel — preveri VAPID env ključe");
    return false;
  }
}

/**
 * Ali je web push konfiguriran (ključi prisotni + veljavni)?
 * Client ga uporablja prek NEXT_PUBLIC_VAPID_PUBLIC_KEY (praznega v .env
 * pomeni "kanal izklopljen"), server pa s to funkcijo pred pošiljanjem.
 */
export function isPushConfigured(): boolean {
  return ensureVapidConfigured();
}

// --- Pošiljanje ----------------------------------------------------------------

/**
 * Pošlje eno push obvestilo na eno naročnino.
 *
 * - payload se JSON.stringify-a (sw.js ga pars-a v `push` handlerju);
 *   drži se ~2KB omejitve push protokola (veljavnost limitiramo v API rutah).
 * - Napake so razvrščene:
 *     404/410        → { gone: true }  (naročnina mrtva — klical pobriše)
 *     ostalo (4xx/5xx/network) → { ok: false, gone: false } (naročnina
 *     OSTANE — prehodna napaka ≠ smrt naročnine)
 * - Vrni NE vrže — klical odloča o statusnem kodi HTTP.
 */
export async function sendPush(
  sub: PushSubscriptionLike,
  payload: PushPayload
): Promise<SendPushResult> {
  if (!isPushConfigured()) {
    return {
      ok: false,
      gone: false,
      error: "Push ni konfiguriran (manjkajo VAPID ključi)",
    };
  }

  // Varnostna meja: push protokol dovoljuje ~4KB, mi držimo ~2KB
  // (dolžine polj validiramo že v API rutah — to je zadnja obramba).
  let serialized: string;
  try {
    serialized = JSON.stringify(payload);
  } catch {
    return { ok: false, gone: false, error: "Payload ni serializljiv" };
  }
  if (serialized.length > 2048) {
    return { ok: false, gone: false, error: "Push payload prevelik (>2KB)" };
  }

  const webPushSub: WebPushSubscription = {
    endpoint: sub.endpoint,
    keys: { p256dh: sub.p256dh, auth: sub.auth },
  };

  try {
    await webpush.sendNotification(webPushSub, serialized);
    return { ok: true, gone: false };
  } catch (error) {
    // web-push vrne WebPushError s statusCode-om push service-ovga odgovora.
    if (error instanceof WebPushError) {
      const status = error.statusCode;
      // 404 Not Found / 410 Gone — push service je naročnino uničil
      // (brskalnik odjavil, cache počiščen, endpoint rotiran …).
      if (status === 404 || status === 410) {
        return {
          ok: false,
          gone: true,
          error: `Naročnina ni več veljavna (HTTP ${status})`,
        };
      }
      return {
        ok: false,
        gone: false,
        error: `Push storitev je vrnila HTTP ${status}`,
      };
    }

    // Omrežne/SSL/timeout napake — push service ni dosegljiv, ampak
    // naročnina je (verjetno) še živa. NE označi kot gone!
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, gone: false, error: `Push ni uspel: ${message}` };
  }
}
