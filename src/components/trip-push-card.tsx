"use client";

import { useCallback, useEffect, useState } from "react";
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

interface TripPushCardProps {
  /** shareId deljenega načrta (pot v push payloadu). */
  shareId: string;
  /** Število dni načrta — določi življenjsko dobo opomnikov (1–30). */
  days: number;
}

export function TripPushCard({ shareId, days }: TripPushCardProps) {
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
        throw new Error("Brskalnik ni vrnil popolne naročnine");
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
        throw new Error(data?.error ?? "Naročnine ni bilo mogoče shraniti");
      }

      setEndpoint(json.endpoint);
      setStatus("subscribed");
      localStorage.setItem(LS_TRIP_KEY, shareId);
      toast({
        title: "Dnevni opomniki so vklopljeni",
        description: `Vsak dan en namig za to potovanje (${reminderDays} dni).`,
      });
    } catch (err) {
      setStatus("default");
      const message =
        err instanceof Error
          ? err.message
          : "Omogočanje opomnikov ni uspelo";
      setInlineError(message);
      toast({
        title: "Opomnikov ni bilo mogoče vklopiti",
        description: message,
        variant: "destructive",
      });
    }
  }, [status, shareId, reminderDays, toast]);

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
        title: "Opomniki so izklopljeni",
        description: "Dnevnih namigov za to potovanje ne boš več prejemal.",
      });
    } catch {
      setStatus("subscribed");
      setInlineError("Odjave ni bilo mogoče zaključiti — poskusi znova");
    }
  }, [status, endpoint, toast]);

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
            {status === "subscribed"
              ? "Dnevni opomniki so vklopljeni"
              : "Ne zamudi ničesar na potovanju"}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {status === "subscribed" ? (
              <>
                Vsak dan do konca načrta ti pošljemo en namig — dogodek na
                tvoji destinaciji ali izkušnjo, ki jo še lahko rezerviraš.
                Obvestilo te vrne na ta načrt.
              </>
            ) : (
              <>
                Vklopi dnevne opomnike ({reminderDays}{" "}
                {reminderDays === 1 ? "dan" : "dni"}): vsako jutro en namig —
                dogodek med tvojim obiskom ali izkušnja za rezervacijo. Brez
                neželene pošte, kadar koli izklopiš.
              </>
            )}
          </p>

          {status === "denied" && (
            <p
              role="note"
              className="mt-2 flex items-start gap-2 text-xs text-muted-foreground"
            >
              <BellOff className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              Obvestila so blokirana — v nastavitvah brskalnika (ikona
              ključavnice ob naslovu → <em>Obvestila</em> → <em>Dovoli</em>) jih
              lahko znova omogočiš.
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
                aria-label="Vklopi dnevne opomnike za to potovanje"
              >
                {status === "subscribing" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Bell className="size-4" aria-hidden="true" />
                )}
                {status === "subscribing" ? "Vklopim…" : "Vklopi dnevne opomnike"}
              </Button>
            )}
            {(status === "subscribed" || status === "unsubscribing") && (
              <>
                <span className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  <BellRing className="size-4" aria-hidden="true" />
                  Vsak dan en namig
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-11 px-3 text-xs text-muted-foreground hover:text-foreground"
                  onClick={handleDisable}
                  disabled={status === "unsubscribing"}
                  aria-label="Izklopi dnevne opomnike"
                >
                  {status === "unsubscribing" ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  Izklopi opomnike
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
