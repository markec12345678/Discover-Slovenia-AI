"use client";

// Registracija service workerja — samo v production okolju.
// V developmentu (dev server) se SW izpusti, da ne cacheira half-baked vsebin.

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Registriraj samo v production (Next.js dev ima HMR, ki ga SW moti).
    if (process.env.NODE_ENV !== "production") return;
    if (!window.isSecureContext) return;

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
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
              // Nova različica je pripravljena — obvesti aplikacijo.
              console.info("[SW] Nova različica pripravljena.");
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
