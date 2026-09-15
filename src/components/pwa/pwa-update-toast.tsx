"use client";

// F5.7 — toast "Nova različica aplikacije" z gumbom Osveži.
//
// sw-register.tsx (zunaj NextIntlClientProvider) ob zaznani posodobitvi SW
// odpošlje window dogodek "dai:sw-update" { waiting: ServiceWorker }.
// Ta komponenta (znotraj providerjev — potrebuje prevode + toast) ga ulovi
// in ponudi:
//   1. klik "Osveži" → SKIP_WAITING waiting SW-ju
//   2. controllerchange (stari SW odstopi) → ENOKRATEN location.reload()
//
// Reload varuje pred zanko: ob prvem prevzemu kontrole (install) controller
// change sproži SAMO reload, če je uporabnik dejansko kliknil "Osveži".

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

export function PwaUpdateToast() {
  const t = useTranslations("pwa");
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const reloadRequested = useRef(false);

  useEffect(() => {
    const onSwUpdate = (e: Event) => {
      const detail = (e as CustomEvent<{ waiting: ServiceWorker | null }>)
        .detail;
      if (detail?.waiting) setWaiting(detail.waiting);
    };
    window.addEventListener("dai:sw-update", onSwUpdate as EventListener);
    return () =>
      window.removeEventListener("dai:sw-update", onSwUpdate as EventListener);
  }, []);

  useEffect(() => {
    if (!waiting) return;
    toast({
      title: t("updateTitle"),
      description: t("updateBody"),
      duration: 12000,
      action: (
        <ToastAction
          altText={t("updateAction")}
          onClick={() => {
            reloadRequested.current = true;
            waiting.postMessage({ type: "SKIP_WAITING" });
            // Varnostna mreža: če controllerchange ne pride v 3 s (npr.
            // Safari/older), osveži vseeno — boljša zamujena osvežitev kot
            // obtičal gumb.
            window.setTimeout(() => {
              if (reloadRequested.current) window.location.reload();
            }, 3000);
          }}
        >
          {t("updateAction")}
        </ToastAction>
      ),
    });
  }, [waiting, t]);

  const onControllerChange = useCallback(() => {
    if (reloadRequested.current) {
      reloadRequested.current = false;
      window.location.reload();
    }
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange
    );
    return () =>
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange
      );
  }, [onControllerChange]);

  return null;
}
