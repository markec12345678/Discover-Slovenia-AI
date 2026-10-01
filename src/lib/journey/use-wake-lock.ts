// ============================================================================
// ISSUE #21 §10 (1.161.0) — SCREEN WAKE LOCK: zaslon PRIŽGAN med vožnjo
// ============================================================================
// Konkurenčna delta D1 (docs/COMPETITIVE-ANALYSIS-TRIP-NAVIGATOR.md):
// vodilči (Wanderlog/TripIt/Roadtrippers) ob vožnji ZASLON ugasne — uporabnik
// si mora zaslon odkleniti, da vidi naslednji postanek. Mi ga držimo prižganega,
// KAR OBSTOJEČA OMEJITEV dokumentirana v LIVE-TRIP-NAVIGATOR.md (»wake lock
// (zaslon ugasne → watchPosition se ustavi) — ni v jedru #21«) — zdaj je.
//
// Uporaba: SAMO v Go Mode, SAMO dokler je GPS watch aktiviran (uporabnikov
// izrecni začetek) — ob izklopu GPS/izhodu iz načina se takoj sprosti
// (spoštovanje baterije; brez skritega držanja).
//
// Iskrenost (isti kanon kot GPS hook):
//  - Wake Lock API ni podprt povsod (Safari < 16.4, Firefox namizni) —
//    `supported: false` in NIČ se ne zgodi (brez laži, da „držimo“);
//  - brskalnik lahko presoja (battery saver, zavihek v ozadju) — lock se
//    sam sprosti (W3C spec: hidden dokument IZGUBI lock); ob vrnitvi v
//    vidno stanje ga ponovno zaprosimo, DOKLER je `active` res true;
//  - `held` je dejansko stanje — UI ga sme pokazati samo kot informacijo.
//
// ČISTOST: nobenega shranjevanja; živi samo v seji komponente.
// ============================================================================

import { useEffect, useRef, useState } from "react";

/** Strukturni tipi Wake Lock API (lib.dom ga (še) ne nosi povsod). */
interface WakeLockSentinel {
  release: () => Promise<void>;
  released: boolean;
}
interface WakeLockNamespace {
  request: (type: "screen") => Promise<WakeLockSentinel>;
}
type NavigatorWithWakeLock = Navigator & { wakeLock?: WakeLockNamespace };

export interface UseWakeLockResult {
  /** Ali naprava/brskalnik sploh podpira Screen Wake Lock. */
  supported: boolean;
  /** Ali je TRENUTNO dejansko pridržan (brskalnik ga lahko odvzame). */
  held: boolean;
}

/** Ali okolje podpira Screen Wake Lock (SSR varno — brez navigatorja false). */
export function isWakeLockSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as NavigatorWithWakeLock;
  return typeof nav.wakeLock?.request === "function";
}

/**
 * Drži zaslon prižgan, DOKLER je `active` true (Go Mode z živim GPS).
 * Samodejno: sprostitev ob active=false/unmount, ponovni poskus ob
 * vrnitvi zavihka v vidno stanje (W3C: hidden izgubi lock), iskrena
 * opustitev, kadar API ni podprt.
 */
export function useWakeLock(active: boolean): UseWakeLockResult {
  const [held, setHeld] = useState(false);
  const lockRef = useRef<WakeLockSentinel | null>(null);
  // Ref zrcali `active` — visibility listener vedno vidi aktualno željo.
  // Posodobitev IZKLJUČNO v efektu (react-hooks/refs: med renderjem prepovedano);
  // efekt je razglašen PRED glavnim, zato glavni ob zagonu vidi svežo vrednost.
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    const nav = typeof navigator === "undefined" ? null : (navigator as NavigatorWithWakeLock);
    if (nav == null || typeof nav.wakeLock?.request !== "function") {
      // Podpora NI — iskrena opustitev. queueMicrotask: setState NI
      // sinhrono v telesu efekta (react-hooks/set-state-in-effect).
      queueMicrotask(() => setHeld(false));
      return;
    }

    let disposed = false;

    const release = async () => {
      const lock = lockRef.current;
      lockRef.current = null;
      if (lock != null && !lock.released) {
        try {
          await lock.release();
        } catch {
          // neblokirajoče (sentinel je morda že ugasnjen)
        }
      }
      if (!disposed) setHeld(false);
    };

    const request = async () => {
      if (disposed || lockRef.current != null || !activeRef.current) return;
      try {
        const lock = await nav.wakeLock!.request("screen");
        if (disposed) {
          // ugasli smo med requestom — takoj vrnemo (0 puščanja)
          if (!lock.released) {
            try {
              await lock.release();
            } catch {
              // neblokirajoče
            }
          }
          return;
        }
        lockRef.current = lock;
        setHeld(true);
      } catch {
        // Zavrnitev (battery saver / vidnost / prepoved) — iskreno brez locka.
        if (!disposed) setHeld(false);
      }
    };

    if (active) {
      void request();
    } else {
      void release();
    }

    // W3C: lock UGANE, ko dokument postane hidden. Ob vrnitvi v vidno
    // stanje ga (če je GPS še vedno aktiven) ponovno zaprosimo.
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void request();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      const lock = lockRef.current;
      lockRef.current = null;
      if (lock != null && !lock.released) {
        try {
          void lock.release();
        } catch {
          // neblokirajoče
        }
      }
      setHeld(false);
    };
  }, [active]);

  return { supported: isWakeLockSupported(), held };
}
