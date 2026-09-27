"use client";

/**
 * useTripPresence — prisotnost ob deljeni poti (Issue #13 / P2-2 ·
 * UX-BENCHMARK 2026 §4 G2 — vzorec Wanderlog „uredi v živo").
 *
 * Klient mini-servisa trip-presence (socket.io, port 3003 prek gatewaya
 * `/?XTransformPort=3003` — RELATIVNA pot, kanon sandboxa; za produkcijo
 * glej mini-services/trip-presence/README.md).
 *
 * VAROVALO (najpomembnejše — iz načrta Issue #13):
 * - prisotnost je ČISTO kozmetična plast nad CAS (TASK 28 ostaja resnica);
 * - service mrtven/izklopljen → hook tiho odneha po 4 reconnect poskusih
 *   (connected=false, ni retry zanke, ni napak v UI, ni console spam);
 * - NIKOLI ne blokira rendera: socket.io-client se naloži LAZY (dynamic
 *   import) ŠELE na /pot strani v brskalniku (≈38 kB gzip izven glavnih
 *   bundle-ov).
 *
 * "Ureja" signal: signalEditing() ob DEJANSKI vnosni interakciji (tipkanje)
 * — debauncano 1 s; strežnik drži TTL 6 s (presence-core kanon).
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** Port mini-servisa (konstanta kanona; glej README mini-servisa). */
const TRIP_PRESENCE_PORT = 3003;

/** Omejeni reconnect: po 4 poskusih tiho odnehamo (kozmetična plast). */
const RECONNECT_ATTEMPTS = 4;

/** Debounce editing-signala (1 s — tipkanje v izbruhih). */
const EDITING_DEBOUNCE_MS = 1_000;

export interface TripPresenceResult {
  /** Skupno število prisotnih v sobi (vključno z mano). */
  viewers: number;
  /** Urejevalci v zadnjih 6 s (ime ali null za anonimnega). */
  editors: Array<{ name: string | null }>;
  /** Živa povezava (kozmetično — vse deluje tudi brez). */
  connected: boolean;
  /** Eksplicitni „jaz urejam" signal (klic iz input interakcij). */
  signalEditing: () => void;
}

interface PresenceStatePayload {
  viewers: number;
  editors: Array<{ name: string | null }>;
}

export function useTripPresence(
  shareId: string,
  /** Prijavno ime (session.user.name) ali null za anonimnega. */
  name: string | null | undefined
): TripPresenceResult {
  const [viewers, setViewers] = useState(0);
  const [editors, setEditors] = useState<Array<{ name: string | null }>>([]);
  const [connected, setConnected] = useState(false);

  const socketRef = useRef<import("socket.io-client").Socket | null>(null);
  const lastEditSignal = useRef(0);
  const nameRef = useRef<string | null | undefined>(name);

  // Posodobitev imena v efektu (NE v render fazi — React opozorilo o
  // side-effect v renderu); connect handler in re-join bereta current.
  useEffect(() => {
    nameRef.current = name;
  }, [name]);

  const joinRoom = useCallback((sock: import("socket.io-client").Socket) => {
    sock.emit("presence:join", {
      shareId,
      name: nameRef.current ?? null,
    });
  }, [shareId]);

  useEffect(() => {
    let disposed = false;
    let sock: import("socket.io-client").Socket | null = null;

    // LAZY load — teža šele na /pot; ob napaki tiho odnehamo.
    import("socket.io-client")
      .then(({ io }) => {
        if (disposed) return;
        const s = io({
          // Kanon sandboxa: path "/" + XTransformPort query → gateway.
          // (RELATIVNA povezava — NIKOLI absolutna URL s portom.)
          path: "/",
          query: { XTransformPort: String(TRIP_PRESENCE_PORT) },
          reconnectionAttempts: RECONNECT_ATTEMPTS,
          reconnectionDelay: 800,
          reconnectionDelayMax: 3_000,
          timeout: 5_000,
        });
        sock = s;
        socketRef.current = s;

        s.on("connect", () => {
          setConnected(true);
          joinRoom(s);
        });
        s.on("disconnect", () => {
          setConnected(false);
          // Prisotnost pade na 0 — iskren prikaz (samo med pot prekinitvami).
          setViewers(0);
          setEditors([]);
        });
        s.on("presence:state", (state: PresenceStatePayload) => {
          if (!state || typeof state !== "object") return;
          setViewers(
            typeof state.viewers === "number" && state.viewers >= 0
              ? state.viewers
              : 0
          );
          setEditors(Array.isArray(state.editors) ? state.editors : []);
        });
        // Fail-silent kanon (G3/G6 isti vzorec): napaka povezave je
        // KOZMETIČNA izguba, nikoli uporabniška napaka.
        s.on("connect_error", () => {
          setConnected(false);
        });
        s.on("reconnect_failed", () => {
          setConnected(false);
        });
      })
      .catch(() => {
        // Modul nedosegljiv (nikoli v praksi) — tiho.
      });

    return () => {
      disposed = true;
      sock?.removeAllListeners();
      sock?.close();
      socketRef.current = null;
    };
  }, [joinRoom]);

  // Sprememba imena (session se naloži async) → ponovni join s novim
  // identitetom (strežnik prepiše vrstnika pod istim socket ID-jem).
  useEffect(() => {
    const sock = socketRef.current;
    if (sock && sock.connected) joinRoom(sock);
  }, [name, joinRoom]);

  const signalEditing = useCallback(() => {
    const sock = socketRef.current;
    if (!sock || !sock.connected) return;
    const now = Date.now();
    if (now - lastEditSignal.current < EDITING_DEBOUNCE_MS) return;
    lastEditSignal.current = now;
    sock.emit("presence:editing", { shareId });
  }, [shareId]);

  return { viewers, editors, connected, signalEditing };
}
