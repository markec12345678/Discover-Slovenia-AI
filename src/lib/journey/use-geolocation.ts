// ============================================================================
// TASK 64 — GO MODE GPS HOOK: navigator.geolocation.watchPosition (1.64.0)
// ============================================================================
// Prva uporaba Geolocation API-ja v projektu. Živi SAMO na klientu
// (hook — klipe se iz "use client" komponente; SSR varno prek tipa
// navigator guard). NE shranjuje sledi — položaj živi v pomnilniku seje.
//
// Iskrenost: status je vedno ena od realnih stanj API-ja (active/denied/
// unavailable/error) — NIKOLI ne lažemo, da imamo položaj, ko ga ni.
//
// ISSUE #21 §6 (1.159.0) — profesionalni GPS življenjski cikel:
//  - EN sam samodejni ponovni poskus po PREHODNI napaki (timeout/signal),
//    ne po zavrnitvi dovoljenja (denied = uporabnikova izrecna izbira) in
//    ne v zanki (en poskus, potem iskreno stanje error + gumb);
//  - uspešna fiksacija ponastavi proračun ponovitve;
//  - stop()/unmount počistita TUDI časovnik ponovitve (0 lukenj);
//  - starost fiksacije (zastarelost) je čista izpeljava v travel-state.ts
//    (positionAgeMs/isPositionStale) — hook samo nosi timestamp.
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

/** Zakasnitev samodejne ponovitve po prehodni napaki (ISSUE #21 §6). */
const RETRY_DELAY_MS = 4_000;

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
 * unmount. Večkraten start() brez učinka (en watch). Po prehodni napaki
 * (ne zavrnitvi) EN sam samodejni ponovni poskus po 4 s — nato iskreno
 * stanje error (gumb Vklopi GPS ostane edina pot naprej).
 */
export function useGeolocation(): UseGeolocationResult {
  const [position, setPosition] = useState<GoPosition | null>(null);
  const [status, setStatus] = useState<GeoStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retriedRef = useRef(false);

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

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current != null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const beginWatchRef = useRef<() => void>(() => {
    // nadomeščen v efektu (ref indirekcija — rekurzija v useCallback
    // bi ranila react-hooks/immutability); klic pred prvim efektom je
    // nemogoč (časovnik ponovitve ≥ 4 s po mountu).
  });

  const beginWatch = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unavailable");
      return;
    }
    if (watchIdRef.current != null) return; // že aktivno
    setStatus("requesting");
    setErrorMessage(null);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        // Uspešna fiksacija — ponovno odpre proračun ponovitve (naslednja
        // prehodna napaka spet dobi en sam poskus; §6 brez neskončne zanke).
        retriedRef.current = false;
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
        // Po napaki/zavrnitvi zapremo watch — sicer bi gumb „Vklopi GPS"
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
        if (err.code === err.PERMISSION_DENIED) {
          // Zavrnitev = izrecna uporabnikova izbira — NO samodejne ponovitve.
          setStatus("denied");
          setErrorMessage(err.message || String(err.code));
          return;
        }
        if (!retriedRef.current) {
          // ISSUE #21 §6: EN sam samodejni ponovni poskus za prehodne
          // napake (timeout / izguba signala) — stanje ostane requesting,
          // po 4 s znova odpremo watch. Druga napaka → iskreno error.
          retriedRef.current = true;
          setStatus("requesting");
          clearRetryTimer();
          retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null;
            beginWatchRef.current(); // ref — ne lastna zanka (immutability)
          }, RETRY_DELAY_MS);
          return;
        }
        setStatus("error");
        setErrorMessage(err.message || String(err.code));
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 }
    );
  }, [clearRetryTimer]);

  // Ref indirekcija: časovnik ponovitve vedno pokliče NAJNOVEJŠO instanco
  // beginWatch (identiteta prek refa — stabilna, brez rekurzije vClosure).
  useEffect(() => {
    beginWatchRef.current = beginWatch;
  }, [beginWatch]);

  const start = useCallback(() => {
    clearRetryTimer();
    retriedRef.current = false; // ročni zagon ima svež proračun ponovitve
    beginWatch();
  }, [beginWatch, clearRetryTimer]);

  const stop = useCallback(() => {
    clearRetryTimer();
    retriedRef.current = false;
    clearWatch();
    setStatus("idle");
    setPosition(null);
  }, [clearWatch, clearRetryTimer]);

  // Cleanup ob unmount (React pravilo: hook brez lukenj — tudi časovnik
  // ponovitve mora umreti s komponento).
  useEffect(
    () => () => {
      clearRetryTimer();
      clearWatch();
    },
    [clearWatch, clearRetryTimer]
  );

  return { position, status, errorMessage, start, stop };
}
