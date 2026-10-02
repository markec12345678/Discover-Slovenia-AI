"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import {
  Bell,
  BellRing,
  BellOff,
  CalendarClock,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

// ============================================================================
// TRIP PUSH CARD — dnevni opomniki ZA TO potovanje (retencijski motor, 3b)
// ============================================================================
//
// Na javni strani deljenega načrta /pot/{shareId} ponudimo vklop dnevnih
// push opomnikov, VEZANIH na ta načrt:
//   → POST /api/push/subscribe { endpoint, keys, trip: { shareId, days } }
//   → dnevni cron pošlje dogodek/predlog izkušnje, dokler tripEnd ne poteče
//   → klik na obvestilo odpre isti načrt (?src=push → funnel klik)
//
// Štetje dni opomnikov = trajanje načrta (days), min 1, max 30 (API limit).
// ============================================================================

/** VAPID javni ključ (inline ob buildu; prazen = push izklopljen). */
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/** localStorage mirror — ali je NA TEH STRANEH že vklopljen trip push. */
const LS_TRIP_KEY = "trip-push-shareId";

type TripPushStatus =
  | "checking"
  | "unsupported"
  | "denied"
  | "default"
  | "subscribing"
  | "unsubscribing"
  | "subscribed";

/** base64url VAPID ključ → Uint8Array (BufferSource za pushManager). */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

// ISSUE #24 Sklop 1 (1.164.0): L-vzorec {sl,en} — prej SL-only
const L = {
  sl: {
    errorIncompleteSubscription: "Brskalnik ni vrnil popolne naročnine",
    errorSaveFallback: "Naročnine ni bilo mogoče shraniti",
    errorEnableFallback: "Omogočanje opomnikov ni uspelo",
    enabledTitle: "Dnevni opomniki so vklopljeni",
    enabledDesc: (days: number) =>
      `Vsak dan en namig za to potovanje (${days} dni).`,
    enableFailedTitle: "Opomnikov ni bilo mogoče vklopiti",
    disabledTitle: "Opomniki so izklopljeni",
    disabledDesc: "Dnevnih namigov za to potovanje ne boš več prejemal.",
    unsubscribeFailed: "Odjave ni bilo mogoče zaključiti — poskusi znova",
    headingOn: "Dnevni opomniki so vklopljeni",
    headingOff: "Ne zamudi ničesar na potovanju",
    subscribedNote:
      "Vsak dan do konca načrta ti pošljemo en namig — dogodek na tvoji destinaciji ali izkušnjo, ki jo še lahko rezerviraš. Obvestilo te vrne na ta načrt.",
    defaultIntro: (days: number) =>
      `Vklopi dnevne opomnike (${days} ${days === 1 ? "dan" : "dni"}): vsako jutro en namig — dogodek med tvojim obiskom ali izkušnja za rezervacijo. Brez neželene pošte, kadar koli izklopiš.`,
    deniedPrefix:
      "Obvestila so blokirana — v nastavitvah brskalnika (ikona ključavnice ob naslovu → ",
    deniedNotifWord: "Obvestila",
    deniedAllowWord: "Dovoli",
    deniedSuffix: ") jih lahko znova omogočiš.",
    enableAria: "Vklopi dnevne opomnike za to potovanje",
    enabling: "Vklopim…",
    enableButton: "Vklopi dnevne opomnike",
    subscribedChip: "Vsak dan en namig",
    disableAria: "Izklopi dnevne opomnike",
    disableButton: "Izklopi opomnike",
  },
  en: {
    errorIncompleteSubscription:
      "The browser did not return a complete subscription",
    errorSaveFallback: "The subscription could not be saved",
    errorEnableFallback: "Enabling reminders failed",
    enabledTitle: "Daily reminders are on",
    enabledDesc: (days: number) =>
      `One tip a day for this trip (${days} ${days === 1 ? "day" : "days"}).`,
    enableFailedTitle: "Reminders could not be turned on",
    disabledTitle: "Reminders are off",
    disabledDesc: "You will no longer receive daily tips for this trip.",
    unsubscribeFailed:
      "Unsubscribing could not be completed — please try again",
    headingOn: "Daily reminders are on",
    headingOff: "Don't miss a thing on your trip",
    subscribedNote:
      "Every day until the end of the plan we'll send you one tip — an event at your destination or an experience you can still book. The notification brings you back to this plan.",
    defaultIntro: (days: number) =>
      `Turn on daily reminders (${days} ${days === 1 ? "day" : "days"}): one tip every morning — an event during your visit or an experience to book. No spam, turn them off any time.`,
    deniedPrefix:
      "Notifications are blocked — in your browser settings (padlock icon next to the address → ",
    deniedNotifWord: "Notifications",
    deniedAllowWord: "Allow",
    deniedSuffix: ") you can turn them on again.",
    enableAria: "Turn on daily reminders for this trip",
    enabling: "Turning on…",
    enableButton: "Turn on daily reminders",
    subscribedChip: "One tip a day",
    disableAria: "Turn off daily reminders",
    disableButton: "Turn off reminders",
  },
} as const;

interface TripPushCardProps {
  /** shareId deljenega načrta (pot v push payloadu). */
  shareId: string;
  /** Število dni načrta — določi življenjsko dobo opomnikov (1–30). */
  days: number;
}

export function TripPushCard({ shareId, days }: TripPushCardProps) {
  const locale = useLocale();
  const lang: "sl" | "en" = locale === "en" ? "en" : "sl";
  const t = L[lang];
  const { toast } = useToast();
  const [status, setStatus] = useState<TripPushStatus>("checking");
  const [inlineError, setInlineError] = useState<string | null>(null);
  // Endpoint trenutne naročnine (za izklop) — iz pushManager ob mountu.
  const [endpoint, setEndpoint] = useState<string | null>(null);

  // Dnevi opomnikov: trajanje načrta, zagozdimo v [1, 30].
  const reminderDays = Math.min(30, Math.max(1, days));

  /** Časovna omejitev za serviceWorker.ready — ob SW napaki (headless,
   *  prepovedana registracija ipd.) obesi; brez timeout-a bi kartica
   *  ostala večno v „checking" (disabled gumb). */
  const SW_READY_TIMEOUT_MS = 6000;

  /** Ob mountu: podpora + ali je brskalnik že naročen (katerikoli push). */
  const checkState = useCallback(async () => {
    const supported =
      "serviceWorker" in navigator &&
      "Notification" in window &&
      "pushManager" in ServiceWorkerRegistration.prototype &&
      Boolean(VAPID_PUBLIC_KEY);

    if (!supported) {
      setStatus("unsupported");
      return;
    }

    try {
      // Timeout: če SW ni registriran (ali registracija pada), ready obesi.
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), SW_READY_TIMEOUT_MS)
        ),
      ]);
      if (!reg) {
        // SW ni pripravljen — push ni možen na tej napravi/kontekstu.
        setStatus("unsupported");
        return;
      }
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        setEndpoint(sub.endpoint);
        // Naročen (na tej ali drugi strani) — pokaži vklopljeno stanje.
        setStatus("subscribed");
        return;
      }
      setEndpoint(null);
      setStatus(Notification.permission === "denied" ? "denied" : "default");
    } catch {
      setStatus("default");
    }
  }, []);

  useEffect(() => {
    void checkState();
  }, [checkState]);

  // === PUSH KLIK TRACKING ===
  // Push URL-ji nosijo ?src=push; ob mountu (tudi v unsupported stanju —
  // komponenta je mountana kljub null renderu) zabeležimo funnel korak
  // trip_push_click prek obstoječe /api/track-funnel rute (client-side,
  // brez RSC side-effect write-a).
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("src") === "push") {
        fetch("/api/track-funnel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            step: "trip_push_click",
            path: `/pot/${shareId}`,
          }),
          keepalive: true,
        }).catch(() => undefined);
      }
    } catch {
      // tracking ni kritičen
    }
  }, [shareId]);

  /** Vklopi dnevne opomnike za to potovanje. */
  const handleEnable = useCallback(async () => {
    if (status !== "default") return;
    setStatus("subscribing");
    setInlineError(null);

    try {
      // 1. Permission
      if (Notification.permission === "default") {
        const permission = await Notification.requestPermission();
        if (permission === "denied") {
          setStatus("denied");
          return;
        }
        if (permission !== "granted") {
          setStatus("default");
          return;
        }
      } else if (Notification.permission !== "granted") {
        setStatus("denied");
        return;
      }

      // 2. Browser subscribe (VAPID)
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const json = sub.toJSON() as {
        endpoint: string;
        keys?: { p256dh: string; auth: string };
      };
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error(t.errorIncompleteSubscription);
      }

      // 3. Shrani na strežnik — s TRIP kontekstom tega načrta.
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
          userAgent: navigator.userAgent,
          trip: { shareId, days: reminderDays },
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
      } | null;
      if (!res.ok || !data?.success) {
        await sub.unsubscribe().catch(() => undefined);
        throw new Error(data?.error ?? t.errorSaveFallback);
      }

      setEndpoint(json.endpoint);
      setStatus("subscribed");
      localStorage.setItem(LS_TRIP_KEY, shareId);
      toast({
        title: t.enabledTitle,
        description: t.enabledDesc(reminderDays),
      });
    } catch (err) {
      setStatus("default");
      const message =
        err instanceof Error ? err.message : t.errorEnableFallback;
      setInlineError(message);
      toast({
        title: t.enableFailedTitle,
        description: message,
        variant: "destructive",
      });
    }
  }, [status, shareId, reminderDays, t, toast]);

  /** Izklopi (browser unsubscribe + server delete). */
  const handleDisable = useCallback(async () => {
    if (status !== "subscribed" || !endpoint) return;
    setStatus("unsubscribing");

    try {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
      } catch {
        // server-side delete zadostuje
      }

      await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      }).catch(() => undefined);

      localStorage.removeItem(LS_TRIP_KEY);
      setEndpoint(null);
      setStatus("default");
      toast({
        title: t.disabledTitle,
        description: t.disabledDesc,
      });
    } catch {
      setStatus("subscribed");
      setInlineError(t.unsubscribeFailed);
    }
  }, [status, endpoint, t, toast]);

  // =========================================================================
  // RENDER — kartica na dnu načrta
  // =========================================================================

  if (status === "unsupported") return null;

  return (
    <section
      className="mt-8 rounded-2xl border border-primary/25 bg-primary/5 p-5 sm:p-6"
      aria-labelledby="trip-push-heading"
    >
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/15">
          {status === "subscribed" ? (
            <BellRing className="size-5 text-primary" aria-hidden="true" />
          ) : (
            <CalendarClock className="size-5 text-primary" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 id="trip-push-heading" className="text-lg font-bold">
            {status === "subscribed" ? t.headingOn : t.headingOff}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {status === "subscribed"
              ? t.subscribedNote
              : t.defaultIntro(reminderDays)}
          </p>

          {status === "denied" && (
            <p
              role="note"
              className="mt-2 flex items-start gap-2 text-xs text-muted-foreground"
            >
              <BellOff className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {t.deniedPrefix}
              <em>{t.deniedNotifWord}</em> → <em>{t.deniedAllowWord}</em>
              {t.deniedSuffix}
            </p>
          )}

          {inlineError && (
            <p
              role="alert"
              className="mt-2 flex items-start gap-1.5 text-xs text-destructive"
            >
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {inlineError}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {(status === "default" ||
              status === "checking" ||
              status === "subscribing") && (
              <Button
                type="button"
                className="h-11 gap-2"
                onClick={handleEnable}
                disabled={status === "subscribing" || status === "checking"}
                aria-label={t.enableAria}
              >
                {status === "subscribing" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Bell className="size-4" aria-hidden="true" />
                )}
                {status === "subscribing" ? t.enabling : t.enableButton}
              </Button>
            )}
            {(status === "subscribed" || status === "unsubscribing") && (
              <>
                <span className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  <BellRing className="size-4" aria-hidden="true" />
                  {t.subscribedChip}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-11 px-3 text-xs text-muted-foreground hover:text-foreground"
                  onClick={handleDisable}
                  disabled={status === "unsubscribing"}
                  aria-label={t.disableAria}
                >
                  {status === "unsubscribing" ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  {t.disableButton}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default TripPushCard;
