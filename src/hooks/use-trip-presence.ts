"use client";

/**
 * useTripPresence — prisotnost ob deljeni poti (Issue #13 / P2-2 ·
 * UX-BENCHMARK 2026 §4 G2 — vzorec Wanderlog „uredi v živo").
 *
 * Klient mini-servisa trip-presence (socket.io, port 3003 prek gatewaya
 * `/?XTransformPort=3003` — RELATIVNA pot, kanon sandboxa; za produkcijo
 * glej mini-services/trip-presence/README.md).
 *
 * W2 (Issue #15, 1.131.0): povezavo zdaj DELI use-trip-chat prek modulskega
 * singletona src/lib/trip-presence-socket.ts (en vtičnik na brskalnik —
 * števec prisotnih ostane iskren). Listeneri se dodajajo/odstranjujejo
 * PO IMENU (nikoli removeAllListeners — socket ima lahko so-consumerja).
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
import type { Socket } from "socket.io-client";
import { acquireTripSocket, releaseTripSocket } from "@/lib/trip-presence-socket";

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

  const socketRef = useRef<Socket | null>(null);
  const lastEditSignal = useRef(0);
  const nameRef = useRef<string | null | undefined>(name);

  // Posodobitev imena v efektu (NE v render fazi — React opozorilo o
  // side-effect v renderu); connect handler in re-join bereta current.
  useEffect(() => {
    nameRef.current = name;
  }, [name]);

  const joinRoom = useCallback((sock: Socket) => {
    sock.emit("presence:join", {
      shareId,
      name: nameRef.current ?? null,
    });
  }, [shareId]);

  useEffect(() => {
    let disposed = false;
    // Lastni listeneri (imensko odstranjevanje v cleanup-u — socket je
    // DELJEN od W2, removeAllListeners bi pobrisal še use-trip-chat).
    // Handlerji sprejemajo unknown (socket.io oddaja poljubne tovore) —
    // validacija je znotraj handlerja (defenzivni kanon).
    let handlers: Array<[string, (data?: unknown) => void]> | null = null;
    let sock: Socket | null = null;

    // LAZY load — teža šele na /pot; ob napaki tiho odnehamo.
    acquireTripSocket()
      .then((s) => {
        if (disposed) return;
        sock = s;
        socketRef.current = s;

        const onConnect = () => {
          setConnected(true);
          joinRoom(s);
        };
        const onDisconnect = () => {
          setConnected(false);
          // Prisotnost pade na 0 — iskren prikaz (samo med pot prekinitvami).
          setViewers(0);
          setEditors([]);
        };
        const onState = (state: unknown) => {
          const p = state as Partial<PresenceStatePayload> | null;
          if (!p || typeof p !== "object") return;
          setViewers(
            typeof p.viewers === "number" && p.viewers >= 0
              ? p.viewers
              : 0
          );
          setEditors(Array.isArray(p.editors) ? p.editors : []);
        };
        // Fail-silent kanon (G3/G6 isti vzorec): napaka povezave je
        // KOZMETIČNA izguba, nikoli uporabniška napaka.
        const onConnectError = () => {
          setConnected(false);
        };
        const onReconnectFailed = () => {
          setConnected(false);
        };

        handlers = [
          ["connect", onConnect],
          ["disconnect", onDisconnect],
          ["presence:state", onState],
          ["connect_error", onConnectError],
          ["reconnect_failed", onReconnectFailed],
        ];

        s.on("connect", onConnect);
        s.on("disconnect", onDisconnect);
        s.on("presence:state", onState);
        s.on("connect_error", onConnectError);
        s.on("reconnect_failed", onReconnectFailed);
      })
      .catch(() => {
        // Modul nedosegljiv (nikoli v praksi) — tiho.
      });

    return () => {
      disposed = true;
      const s = sock ?? socketRef.current;
      if (s && handlers) {
        for (const [event, fn] of handlers) {
          s.off(event, fn);
        }
      }
      socketRef.current = null;
      releaseTripSocket();
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
