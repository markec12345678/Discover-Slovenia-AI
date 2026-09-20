// ============================================================================
// TASK 64 — GO MODE GPS HOOK: navigator.geolocation.watchPosition (1.64.0)
// ============================================================================
// Prva uporaba Geolocation API-ja v projektu. Živi SAMO na klientu
// (hook — klipe se iz "use client" komponente; SSR varno prek tipa
// navigator guard). NE shranjuje sledi — položaj živi v pomnilniku seje.
//
// Iskrenost: status je vedno ena od realnih stanj API-ja (active/denied/
// unavailable/error) — NIKOLI ne lažemo, da imamo položaj, ko ga ni.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";

import type { GoPosition } from "./go-view";

export type GeoStatus =
  | "idle" // GPS ni vklopljen (uporabnik ga še ni zagnal)
  | "requesting" // čakamo prvo fiksacijo
  | "active" // watchPosition živi, položaj je
  | "denied" // uporabnik je zavrnil dovoljenje
  | "unavailable" // naprava/brskalnik nima Geolocation API-ja
  | "error"; // timeout / sporočilo napake

export interface UseGeolocationResult {
  position: GoPosition | null;
  status: GeoStatus;
  /** Surovo sporočilo napake (za prikaz pošteno kot ± tehnično). */
  errorMessage: string | null;
  start: () => void;
  stop: () => void;
}

/**
 * Živi GPS položaj za Go Mode. start() odpre watchPosition (visoka
 * natančnost, sveže vsaj 30 s), stop() ga zapre. Samodejni cleanup ob
 * unmount. Večkraten start() brez učinka (en watch).
 */
export function useGeolocation(): UseGeolocationResult {
  const [position, setPosition] = useState<GoPosition | null>(null);
  const [status, setStatus] = useState<GeoStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const clearWatch = useCallback(() => {
    if (watchIdRef.current != null) {
      try {
        navigator.geolocation.clearWatch(watchIdRef.current);
      } catch {
        // neblokirajoče
      }
      watchIdRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unavailable");
      return;
    }
    if (watchIdRef.current != null) return; // že aktivno
    setStatus("requesting");
    setErrorMessage(null);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          ...(Number.isFinite(pos.coords.accuracy)
            ? { accuracyM: pos.coords.accuracy }
            : {}),
          timestamp: pos.timestamp,
        });
        setStatus("active");
      },
      (err) => {
        // Po napaki/zavrnitvi zaprem watch — sicer bi gumb „Vklopi GPS"
        // nehal delovati (start() bi prezgodaj izstopil, ker watchId ni
        // null). Uporabnik tako lahko ponovno poskusi (npr. po omogočitvi
        // dovoljenja v nastavitvah brskalnika).
        if (watchIdRef.current != null) {
          try {
            navigator.geolocation.clearWatch(watchIdRef.current);
          } catch {
            // neblokirajoče
          }
          watchIdRef.current = null;
        }
        if (err.code === err.PERMISSION_DENIED) setStatus("denied");
        else setStatus("error");
        setErrorMessage(err.message || String(err.code));
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 }
    );
  }, []);

  const stop = useCallback(() => {
    clearWatch();
    setStatus("idle");
    setPosition(null);
  }, [clearWatch]);

  // Cleanup ob unmount (React pravilo: hook brez luk).
  useEffect(() => clearWatch, [clearWatch]);

  return { position, status, errorMessage, start, stop };
}
