"use client";

/**
 * trip-presence-socket — SKUPEN socket.io vtičnik mini-servisa 3003 (W2).
 *
 * Do W2 je imel /pot ENEGA konsumerja vtičnika (useTripPresence). Skupinski
 * klepet z @AI (use-trip-chat) posluša `chat:new` na ISTI povezavi — dva
 * vtičnika na brskalnik bi NAPIHNILA števec prisotnih (2 osebi bi videle
 * "3 na strani" — prekršek iskrenostnega kanona). Zato: modulski SINGLETON
 * z referenčnim štetjem:
 *
 *   acquireTripSocket() → Promise<Socket>   (prvi klic odpre, ostali delijo)
 *   releaseTripSocket()                    (zadnji odklic ZAPRE)
 *
 * Kanon povezave (isti kot prej): LAZY dynamic import (teža šele na /pot),
 * RELATIVNA povezava io({ path: "/", query: { XTransformPort: 3003 } }) —
 * gateway posreduje HTTP + WS; omejeni reconnect (4 poskusi) → tiho odneha
 * (kozmetična plast — mrtv service = vse deluje prek pollinga).
 *
 * ODGOVORNOST KONSUMERJEV: vsak doda svoje listenere PO imenu in jih ob
 * odklicu ODSTRANI SAM (s.on/s.off par) — NIKOLI removeAllListeners, dokler
 * socket deli drug konsumer (releaseTripSocket ob refCount 0 je edina
 * izjema — takrat consumerv ni več).
 */

import type { Socket } from "socket.io-client";

/** Port mini-servisa (konstanta kanona; glej README mini-servisa). */
const TRIP_PRESENCE_PORT = 3003;

/** Omejeni reconnect: po 4 poskusih tiho odnehamo (kozmetična plast). */
const RECONNECT_ATTEMPTS = 4;

/** Modulski singleton — null, ko ni konsumerjev. */
let socketPromise: Promise<Socket> | null = null;

/** Referenčno število aktivnih konsumerjev (hook-i na /pot strani). */
let refCount = 0;

/**
 * Pridobi (deljen) vtičnik mini-servisa. Prvi klic lenco naloži
 * socket.io-client (≈38 kB gzip izven glavnih bundle-ov) in odpre povezavo;
 * vsak naslednji klic dobi ISTO instanco. Odklic z releaseTripSocket().
 */
export function acquireTripSocket(): Promise<Socket> {
  refCount++;
  if (!socketPromise) {
    socketPromise = import("socket.io-client").then(({ io }) =>
      io({
        // Kanon sandboxa: path "/" + XTransformPort query → gateway.
        // (RELATIVNA povezava — NIKOLI absolutna URL s portom.)
        path: "/",
        query: { XTransformPort: String(TRIP_PRESENCE_PORT) },
        reconnectionAttempts: RECONNECT_ATTEMPTS,
        reconnectionDelay: 800,
        reconnectionDelayMax: 3_000,
        timeout: 5_000,
      })
    );
    // Modul nedosegljiv (nikoli v praksi) — rejected promise tiho pogoltnejo
    // konsumerji (.catch v hook-u; fail-silent kanon G3/G6).
    socketPromise.catch(() => {
      /* tiho */
    });
  }
  return socketPromise;
}

/**
 * Odkliče pridobitev. Zadnji odklic (refCount 0) ODSTRANI vse listenere
 * (takrat consumerv ni več) in ZAPRE vtičnik. Pokliči OBEMO ob odklicu
 * hook-a (cleanup funkcija useEffect-a) — sicer povezava ostane odprta.
 */
export function releaseTripSocket(): void {
  refCount = Math.max(0, refCount - 1);
  if (refCount === 0 && socketPromise) {
    const p = socketPromise;
    socketPromise = null;
    // Zapri ŠELE ko se instanca dejansko odpre (race: odklic pred povezavo).
    p.then((s) => {
      s.removeAllListeners();
      s.close();
    }).catch(() => {
      /* modul se ni naložil — nič za zapreti */
    });
  }
}
