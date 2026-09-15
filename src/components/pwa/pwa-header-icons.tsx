"use client";

// F5.7 (PWA offline načrt) — glavne ikone v navigaciji:
//   1. OfflineBadge  — viden SAMO, ko ni povezave (amber WifiOff + tooltip;
//                      ne zorit strani, ko je vse normalno)
//   2. InstallButton — viden, ko je namestitev možna:
//                      a) beforeinstallprompt (Chrome/Android/Edge) → prompt()
//                      b) iOS Safari → Sheet z navodili "Dodaj na domači zaslon"
//                      če je app že nameščena (standalone) → skrit
//
// React 19idiomi: navigator.onLine / display-mode / UA se berejo prek
// useSyncExternalStore (hidracijsko-varno: strežniški snapshot = privzeta
// vrednost, klient prevzame po hidraciji BREZ mismatch opozorila).
//
// Dogodki (analitika, brez PII): pwa_install_prompted (klik → sistemski
// prompt), pwa_install_accepted (sprejet namestitveni dialog).

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Download, Share, PlusCircle, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { toast } from "@/hooks/use-toast";
import { trackPlannerEvent } from "@/lib/planner-analytics";
import { cn } from "@/lib/utils";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// ---------------------------------------------------------------------------
// Hidracijsko-varni "external store" hook-i (React 19 useSyncExternalStore).
// ---------------------------------------------------------------------------

const noopSubscribe = () => () => {};

/** Ali teče app kot nameščena PWA (samostojno okno brez URL vrstice)? */
function useStandalone(): boolean {
  const standalone = useSyncExternalStore(
    noopSubscribe, // display-mode se v življenju strani ne spreminja
    () =>
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    () => false
  );
  return standalone;
}

/** iOS Safari? (iPadOS 13+ se izdaja kot Mac — zato tudi maxTouchPoints.) */
function useIsIosSafari(): boolean {
  return useSyncExternalStore(
    noopSubscribe, // UA se v življenju strani ne spreminja
    () => {
      const ua = navigator.userAgent;
      const ios = /iphone|ipad|ipod/i.test(ua);
      const ipadOs13Plus =
        ua.includes("Macintosh") && navigator.maxTouchPoints > 1;
      return (
        (ios || ipadOs13Plus) &&
        /safari/i.test(ua) &&
        !/chrome|crios|fxios/i.test(ua)
      );
    },
    () => false
  );
}

/** Spletni status povezave (dogodki online/offline + trenutni snapshot). */
function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    (callback) => {
      window.addEventListener("online", callback);
      window.addEventListener("offline", callback);
      return () => {
        window.removeEventListener("online", callback);
        window.removeEventListener("offline", callback);
      };
    },
    () => navigator.onLine,
    () => true
  );
}

/** Toast ob prehodu v offline / nazaj online (enkrat na prehod). */
function useConnectionToasts(online: boolean): void {
  const t = useTranslations("pwa");
  // Prvi prehod (mount) NE sme sprožiti toast-a — sicer bi vsak obisk strani
  // z delujočo povezavo "pozdravil" z online toast-om.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (online) {
      toast({
        title: t("onlineToastTitle"),
        description: t("onlineToastBody"),
      });
    } else {
      toast({
        title: t("offlineToastTitle"),
        description: t("offlineToastBody"),
      });
    }
  }, [online, t]);
}

// ---------------------------------------------------------------------------
// Namestitveni gumb.
// ---------------------------------------------------------------------------

function InstallButton({ scrolled }: { scrolled: boolean }) {
  const t = useTranslations("pwa");
  const standalone = useStandalone();
  const iosSafari = useIsIosSafari();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null
  );
  // Po appinstalled skrijemo gumb TAKOJ (display-mode se spremeni šele v
  // novo odprtem oknu nameščene app).
  const [installedThisSession, setInstalledThisSession] = useState(false);
  const [iosHintOpen, setIosHintOpen] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // prepreči samodejni mini infobar → lasten gumb
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setInstalledThisSession(true);
      toast({
        title: t("installDoneTitle"),
        description: t("installDoneBody"),
      });
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [t]);

  const onInstallClick = useCallback(async () => {
    if (!deferred) return;
    try {
      trackPlannerEvent("pwa_install_prompted");
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") {
        trackPlannerEvent("pwa_install_accepted");
      }
      // appinstalled event (če sledi) pobriše gumb; sicer dovoli ponovni poskus.
      setDeferred(null);
    } catch {
      // preklican prompt / zasebni način — tiho
      setDeferred(null);
    }
  }, [deferred]);

  if (standalone || installedThisSession) return null;

  const iconClass = scrolled
    ? "text-foreground"
    : "text-white hover:bg-white/10 hover:text-white";

  // iOS Safari: beforeinstallprompt NE obstaja → Sheet z navodili.
  if (!deferred && iosSafari) {
    return (
      <Sheet open={iosHintOpen} onOpenChange={setIosHintOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("installAria")}
            title={t("install")}
            className={iconClass}
          >
            <Download className="size-5" aria-hidden="true" />
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{t("installIosTitle")}</SheetTitle>
            <SheetDescription>{t("installIosHint")}</SheetDescription>
          </SheetHeader>
          <ol className="space-y-4 px-4 pb-6 pt-2 text-sm text-foreground/90">
            <li className="flex gap-3">
              <span className="flex size-8 flex-none items-center justify-center rounded-full bg-primary/10 text-primary">
                <Share className="size-4" aria-hidden="true" />
              </span>
              <span className="pt-1.5">{t("installIosStep1")}</span>
            </li>
            <li className="flex gap-3">
              <span className="flex size-8 flex-none items-center justify-center rounded-full bg-primary/10 text-primary">
                <PlusCircle className="size-4" aria-hidden="true" />
              </span>
              <span className="pt-1.5">{t("installIosStep2")}</span>
            </li>
            <li className="flex gap-3">
              <span className="flex size-8 flex-none items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
                3
              </span>
              <span className="pt-1.5">{t("installIosStep3")}</span>
            </li>
          </ol>
        </SheetContent>
      </Sheet>
    );
  }

  if (!deferred) return null;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onInstallClick}
      aria-label={t("installAria")}
      title={t("install")}
      className={iconClass}
    >
      <Download className="size-5" aria-hidden="true" />
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Offline badge.
// ---------------------------------------------------------------------------

/** Badg "Brez povezave" — viden samo, ko povezave ni. */
function OfflineBadge({ scrolled }: { scrolled: boolean }) {
  const t = useTranslations("pwa");
  const online = useOnlineStatus();
  useConnectionToasts(online);
  if (online) return null;
  return (
    <span
      role="status"
      aria-label={t("offlineAria")}
      title={t("offlineAria")}
      className={cn(
        "flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold",
        scrolled
          ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
          : "bg-amber-400/90 text-amber-950"
      )}
    >
      <WifiOff className="size-3.5" aria-hidden="true" />
      <span className="hidden sm:inline">{t("offline")}</span>
    </span>
  );
}

/** Montira se v desni ikonski vrstici navigacije (navigation.tsx). */
export function PwaHeaderIcons({ scrolled }: { scrolled: boolean }) {
  return (
    <>
      <OfflineBadge scrolled={scrolled} />
      <InstallButton scrolled={scrolled} />
    </>
  );
}
