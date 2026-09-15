"use client";

// Registracija service workerja — v OBEH okoljih.
//
// ZAKAJ tudi v developmentu: web push (obvestila) zahteva AKTIVEN service
// worker (pushManager.subscribe + sw.js `push` handler). V dev zato
// registriramo "/sw.js?dev=1" — SW prek DEV_MODE flaga IZKLOPI caching
// (transparenten passthrough, HMR chunk-i ostanejo sveži) ampak OBDELA
// push/notificationclick dogodke. V produkciji (brez parametra) velja
// polna caching logika.
//
// F5.7: ob odkriti NOVI verziji SW (installing → installed && controller)
// odpošljemo window dogodek "dai:sw-update" — posluša ga PwaUpdateToast
// (znotraj providerjev; ta komponenta je zunaj NextIntlClientProvider in
// prevodov ne more uporabljati).

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (!window.isSecureContext) return;

    // Dev SW neha cachati prek ?dev=1 (DEV_MODE v sw.js), ampak push
    // handlerji ostanejo aktivni. updateViaCache: "none" — SW skript
    // VEDNO preverimo prek omrežja (tudi v produkciji brez HTTP cache).
    const swUrl =
      process.env.NODE_ENV === "production" ? "/sw.js" : "/sw.js?dev=1";

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register(swUrl, {
          scope: "/",
          updateViaCache: "none",
        });
        // če je na voljo update, prevzemi takoj.
        if (reg.waiting) {
          reg.waiting.postMessage({ type: "SKIP_WAITING" });
        }
        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (
              installing.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              // Nova različica je pripravljena — obvesti aplikacijo
              // (toast z gumbom "Osveži" — glej pwa-update-toast.tsx).
              console.info("[SW] Nova različica pripravljena.");
              window.dispatchEvent(
                new CustomEvent("dai:sw-update", {
                  detail: { waiting: reg.waiting ?? installing },
                })
              );
            }
          });
        });
      } catch (err) {
        console.warn("[SW] Registracija ni uspela:", err);
      }
    };

    register();
  }, []);

  return null;
}
