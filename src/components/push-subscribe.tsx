"use client";

// ============================================================================
// PUSH SUBSCRIBE — prijava na web push obvestila (VAPID)
// ============================================================================
//
// Retention kanal: obiskovalca, ki načrtuje pot, spomnimo, da se vrne
// ("Tvoj načrt je shranjen — dež napovedan za Bled soboto").
//
// Tok:
//   1. support check (serviceWorker + Notification + pushManager + VAPID
//      javni ključ) → unsupported | denied | default | subscribed
//   2. "Vklopi obvestila" → Notification.requestPermission() → granted →
//      reg.pushManager.subscribe(userVisibleOnly + applicationServerKey)
//   3. POST /api/push/subscribe { endpoint, keys, userAgent }
//   4. subscribed: test gumb → POST /api/push/test { subscription }
//      (honestna napaka, če push service ni dosegljiv)
//   5. "Izklopi" → browser unsubscribe + POST /api/push/unsubscribe
//
// localStorage "push-subscribed" = mirror stanja (hitri hint ob mountu;
// resnico pove pushManager.getSubscription()).
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  BellRing,
  BellOff,
  Loader2,
  Send,
  AlertCircle,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

/** Vrsta prikaza: compact = newsletter integracija, full = samostojni blok. */
type PushVariant = "compact" | "full";

type PushStatus =
  | "checking" // mount: preverjamo podporo + obstoječo naročnino
  | "unsupported" // brskalnik/VAPID ne podpira push-a
  | "denied" // uporabnik je permission ZAVRNIL (blokiran)
  | "default" // ni naročen — gumb "Vklopi obvestila"
  | "subscribing" // async v teku (permission/subscribe/save)
  | "subscribed" // naročen — test + izklop
  | "testing" // testno obvestilo se pošilja
  | "unsubscribing"; // odjava v teku

/** localStorage mirror ključ (enako ime kot v komentarju zgoraj). */
const LS_MIRROR_KEY = "push-subscribed";

/**
 * Pretvori VAPID javni ključ (base64url, 65 bajtov) v Uint8Array —
 * PushManager.subscribe zahteva applicationServerKey kot BufferSource.
 * Standardni recept: zamenjaj URL-safe znake (- _) in dopolni padding.
 * (ArrayBuffer tip je eksplicten — DOM BufferSource zahteva pravi
 * ArrayBuffer, ne ArrayBufferLike.)
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

/** Javni VAPID ključ (inlined ob buildu iz NEXT_PUBLIC_VAPID_PUBLIC_KEY). */
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

interface PushSubscribeProps {
  variant?: PushVariant;
}

export function PushSubscribe({ variant = "full" }: PushSubscribeProps) {
  const { toast } = useToast();
  const [status, setStatus] = useState<PushStatus>("checking");
  const [inlineError, setInlineError] = useState<string | null>(null);
  // 503 (VAPID ni konfiguriran na strežniku) — prikažemo NEVTRALNO
  // obvestilo namesto destructive napake: gre za konfiguracijo strežnika,
  // ne dejanje uporabnika (FW2-C: edina sprememba tukaj je ravno to).
  const [inlineNotice, setInlineNotice] = useState<string | null>(null);
  const compact = variant === "compact";

  // Popolna naročnina (endpoint + keys) za test/unsubscribe klice.
  const [subscription, setSubscription] = useState<{
    endpoint: string;
    keys: { p256dh: string; auth: string };
  } | null>(null);

  // -------------------------------------------------------------------------
  // Preveri podporo, obstoječo naročnino in permission.
  // (checkState je ločen callback — "Preveri znova" iz denied stanja ga
  // pokliče, ko uporabnik odklene permission v brskalniških nastavitvah;
  // Notification.permission se namreč OSVEŽI brez ponovnega requesta.)
  // -------------------------------------------------------------------------
  const checkState = useCallback(async () => {
    const supported =
      "serviceWorker" in navigator &&
      "Notification" in window &&
      "pushManager" in ServiceWorkerRegistration.prototype &&
      Boolean(VAPID_PUBLIC_KEY);

    if (!supported) {
      // Compact variant se tiho skrije, full pokaže pojasnilo.
      setStatus("unsupported");
      return;
    }

    try {
      // ready počaka na SW registracijo (sw-register.tsx teče vzporedno).
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      const json = sub?.toJSON();

      if (json?.endpoint && json.keys?.p256dh && json.keys?.auth) {
        setSubscription({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        });
        setStatus("subscribed");
        localStorage.setItem(LS_MIRROR_KEY, "1");
        return;
      }

      // Brez naročnine — počisti zastarel mirror.
      localStorage.removeItem(LS_MIRROR_KEY);
      setSubscription(null);
      setStatus(Notification.permission === "denied" ? "denied" : "default");
    } catch (err) {
      console.warn("[push] Stanja ni bilo mogoče prebrati:", err);
      setStatus("default");
    }
  }, []);

  useEffect(() => {
    checkState();
  }, [checkState]);

  // -------------------------------------------------------------------------
  // Vklopi obvestila: permission → subscribe → POST /api/push/subscribe.
  // -------------------------------------------------------------------------
  const handleEnable = useCallback(async () => {
    if (status !== "default") return;
    setStatus("subscribing");
    setInlineError(null);
    setInlineNotice(null);

    try {
      // 1. Permission (brskalnik blokira ponovni request po denied —
      //    v tem stanju gumba sploh ne prikazujemo).
      if (Notification.permission === "default") {
        const permission = await Notification.requestPermission();
        if (permission === "denied") {
          setStatus("denied");
          return;
        }
        if (permission !== "granted") {
          // Uporabnik je zaprl prompt ("dismissed") — ostani na default.
          setStatus("default");
          return;
        }
      } else if (Notification.permission !== "granted") {
        setStatus("denied");
        return;
      }

      // 2. Subscribe z javnim VAPID ključem.
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

      // 3. Shrani na strežnik.
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
          userAgent: navigator.userAgent,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
      } | null;
      if (!res.ok || !data?.success) {
        // Browser-side naročnino razveljavimo — server je zavrnil.
        await sub.unsubscribe().catch(() => undefined);
        throw new Error(data?.error ?? "Naročnine ni bilo mogoče shraniti");
      }

      setSubscription({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      });
      setStatus("subscribed");
      localStorage.setItem(LS_MIRROR_KEY, "1");
      toast({
        title: "Obvestila so vklopljena",
        description: "Spomnili te bomo na zanimive dogodke in tvoj načrt.",
      });
    } catch (err) {
      setStatus("default");
      const message =
        err instanceof Error ? err.message : "Omogočanje obvestil ni uspelo";
      setInlineError(message);
      toast({
        title: "Obvestil ni bilo mogoče vklopiti",
        description: message,
        variant: "destructive",
      });
    }
  }, [status, toast]);

  // -------------------------------------------------------------------------
  // Testno obvestilo: POST /api/push/test { subscription }.
  // -------------------------------------------------------------------------
  const handleTest = useCallback(async () => {
    if (status !== "subscribed" || !subscription) return;
    setStatus("testing");
    setInlineError(null);
    setInlineNotice(null);

    try {
      const res = await fetch("/api/push/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription }),
      });
      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        message?: string;
        error?: string;
        gone?: boolean;
      } | null;

      if (data?.success) {
        toast({
          title: "Testno obvestilo poslano",
          description: data.message ?? "Poglej svojo napravo.",
        });
        return;
      }

      const message = data?.error ?? "Testnega obvestila ni bilo mogoče poslati";

      if (data?.gone) {
        // Naročnina je mrtva (404/410) — vrni uporabnika na prijavo.
        localStorage.removeItem(LS_MIRROR_KEY);
        setSubscription(null);
        setStatus("default");
        setInlineError(message);
        return;
      }

      if (res.status === 503) {
        // Strežnik nima VAPID ključev — honestno NEVTRALNO obvestilo
        // (napaka ni uporabnikova; naročnina ostaja veljavna za kasneje).
        setInlineNotice(message);
        return;
      }

      // Network/push-service napaka — naročnina ostane, pokaži honestno.
      setInlineError(message);
    } catch {
      setInlineError("Testnega obvestila ni bilo mogoče poslati — preveri povezavo");
    } finally {
      // Funkcijski update — resetiraj SAMO če smo še vedno v "testing"
      // (gone pot je status že prepisala v "default").
      setStatus((s) => (s === "testing" ? "subscribed" : s));
    }
  }, [status, subscription, toast]);

  // -------------------------------------------------------------------------
  // Izklopi: browser unsubscribe + POST /api/push/unsubscribe.
  // -------------------------------------------------------------------------
  const handleDisable = useCallback(async () => {
    if (status !== "subscribed" || !subscription) return;
    setStatus("unsubscribing");
    setInlineError(null);
    setInlineNotice(null);

    try {
      // Browser-side unsubscribe (prekine dostavo na tej napravi).
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
      } catch {
        // Ne uspe? Server-side delete vselej zadošča.
      }

      // Server-side HARD delete (idempotentna ruta).
      await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      }).catch(() => undefined);

      localStorage.removeItem(LS_MIRROR_KEY);
      setSubscription(null);
      setStatus("default");
      toast({
        title: "Obvestila so izklopljena",
        description: "Kadarkoli jih lahko znova vklopiš.",
      });
    } catch {
      setStatus("subscribed");
      setInlineError("Odjave ni bilo mogoče zaključiti — poskusi znova");
    }
  }, [status, subscription, toast]);

  // =========================================================================
  // RENDER
  // =========================================================================

  // Compact + unsupported → ne riši ničesar (diskretnost v newsletter bloku).
  if (compact && status === "unsupported") return null;

  const busy =
    status === "subscribing" || status === "testing" || status === "unsubscribing";

  // --- unsupported (samo full variant) ---
  if (status === "unsupported") {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="note">
        <Info className="size-4 shrink-0" aria-hidden="true" />
        Tvoj brskalnik ne podpira obvestil.
      </p>
    );
  }

  // --- denied: permission blokiran — iskreno razlagalno besedilo, brez gumba
  //     za ponovni request (brskalnik ga blokira; odklep je samo v
  //     nastavitvah — "Preveri znova" prebere svež Notification.permission). ---
  if (status === "denied") {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-muted bg-muted/40 p-3.5" role="note">
        <BellOff className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium">Obvestila so blokirana</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            V nastavitvah brskalnika (ikona ključavnice ali oglasic ob naslovni
            vrstici → <em>Obvestila</em> → <em>Dovoli</em>) jih lahko znova
            omogočiš.
          </p>
          <button
            type="button"
            onClick={() => {
              setInlineError(null);
              void checkState();
            }}
            className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            Preveri znova po odklepu
          </button>
        </div>
      </div>
    );
  }

  // --- subscribed: potrditveno stanje + test + izklop ---
  if (status === "subscribed" || status === "testing" || status === "unsubscribing") {
    return (
      <div aria-live="polite">
        <div className={cn("flex flex-wrap items-center gap-2", compact ? "" : "sm:flex-nowrap")}>
          <span className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
            <BellRing className="size-4 shrink-0" aria-hidden="true" />
            Obvestila so vklopljena
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("gap-1.5 font-normal", compact ? "" : "ml-auto")}
            onClick={handleTest}
            disabled={busy}
            aria-label="Pošlji testno obvestilo na svojo napravo"
          >
            {status === "testing" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="size-4" aria-hidden="true" />
            )}
            {status === "testing" ? "Pošiljam…" : "Pošlji testno obvestilo"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-11 min-w-11 px-3 text-xs text-muted-foreground hover:text-foreground"
            onClick={handleDisable}
            disabled={busy}
            aria-label="Izklopi obvestila"
          >
            {status === "unsubscribing" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : null}
            Izklopi
          </Button>
        </div>
        {inlineError && (
          <p role="alert" className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {inlineError}
          </p>
        )}
        {inlineNotice && (
          <p role="note" className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {inlineNotice}
          </p>
        )}
      </div>
    );
  }

  // --- default / checking / subscribing: gumb za prijavo ---
  return (
    <div aria-live="polite">
      <Button
        type="button"
        size="sm"
        className={cn(
          "h-11 gap-2 bg-primary transition-all hover:-translate-y-0.5 hover:shadow-md",
          compact ? "w-full" : ""
        )}
        onClick={handleEnable}
        disabled={busy || status === "checking"}
        aria-label="Vklopi obvestila o dogodkih in tvojem načrtu"
      >
        {status === "subscribing" ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Bell className="size-4" aria-hidden="true" />
        )}
        {status === "subscribing" ? "Vklopim…" : "Vklopi obvestila"}
      </Button>
      {inlineError && (
        <p role="alert" className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {inlineError}
        </p>
      )}
      {/* Zasebnost/izklop sporočilo IZPUSTIMO v compact varianti —
          newsletter sekcija ima že svojo "Brez neželene pošte" vrstico. */}
    </div>
  );
}

export default PushSubscribe;
