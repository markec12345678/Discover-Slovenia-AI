"use client";

/**
 * useTripChat — skupinski klepet na /pot/[shareId] (W2, Issue #15, 1.131.0).
 *
 * NadgradnjaTripComment komentarjev v KLEPET (ZERO FEATURE LOSS — ista
 * tabela, obstoječa zgodovina postane zgodovina klepeta). Dve plasti živosti:
 *
 *  1. POLLING (osnova — deluje povsod, tudi na Vercelu brez mini-servisa):
 *     inkrementalni GET /api/trip-comments?shareId=&since=<zadnji ISO>
 *     na vsakih 6 s, SAMO ob vidnem zavihku (document.hidden → preskok);
 *     ob vrnitvi na zavihek takojšen dotik (visibilitychange).
 *     Prekrivno okno 2 s na `since` (serverless ura se lahko razhaja) +
 *     dedupe po ID — vrstica nikoli ne podvoji.
 *
 *  2. SOCKET pospešitev (kozmetična — mini-service 3003): soba trip:{shareId}
 *     dobi `chat:new` signal ob objavi → TAKOJŠEN dotik namesto čakanja na
 *     polling. Povezavo DELI use-trip-presence (singleton — iskren števec
 *     prisotnih); mrtv service → tiho odneha, polling prevzame (kanon G2:
 *     DB je edina resnica, vtičnik je pospešitev).
 *
 * Vrstice AI svetovalca (isAI) izstavlja IZKLJUČNO strežnik prek
 * /api/trip-comments/ai-reply — askAi() tukaj je le klient tega klica.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { acquireTripSocket, releaseTripSocket } from "@/lib/trip-presence-socket";

/** Interval pollinga (ms) — raven klepeta brez črpanja strežnika. */
const POLL_INTERVAL_MS = 6_000;

/** Prekrivno okno na `since` (ms) — kompenzacija razhoda ur med instancami. */
const SINCE_OVERLAP_MS = 2_000;

/** Ena vrstica skupinskega klepeta (ista oblika kot API odgovor). */
export interface TripChatItem {
  id: string;
  authorName: string;
  text: string;
  /** Značka AI svetovalca — izstavlja samo strežnik. */
  isAI: boolean;
  /** JSON priloga AI odgovora (places/sources) — raw, klient validira. */
  payload: string | null;
  /** ISO datum objave. */
  createdAt: string;
}

/** Defenzivna validacija vrstice (shranjenemu/oddanemu JSON-u ne zaupamo). */
function isValidChatItem(raw: unknown): raw is TripChatItem {
  if (!raw || typeof raw !== "object") return false;
  const c = raw as Partial<TripChatItem>;
  return (
    typeof c.id === "string" &&
    c.id.length > 0 &&
    typeof c.authorName === "string" &&
    c.authorName.length > 0 &&
    typeof c.text === "string" &&
    typeof c.isAI === "boolean" &&
    (c.payload === null ||
      c.payload === undefined ||
      typeof c.payload === "string") &&
    typeof c.createdAt === "string" &&
    !Number.isNaN(Date.parse(c.createdAt))
  );
}

/** Normalizirana vrstica iz API-ja (payload undefined → null). */
function normalizeItem(raw: unknown): TripChatItem | null {
  if (!isValidChatItem(raw)) return null;
  const c = raw as TripChatItem;
  return { ...c, payload: c.payload ?? null };
}

export interface UseTripChatResult {
  /** Vrstice v KRONOLOŠKEM vrstnem redu (najstarejša prva). */
  comments: TripChatItem[];
  /** Živa socket povezava (kozmetično — indikator „klepet v živo"). */
  connected: boolean;
  /** AI svetovalec računa odgovor (lokalni indikator tipkanja). */
  aiPending: boolean;
  /** Doda pravkar objavljeno vrstico (idempotentno po ID). */
  appendLocal: (item: TripChatItem) => void;
  /** Takojšen inkrementalni dotik (ne čaka intervala). */
  pollNow: () => void;
  /** Obvesti prisotne v sobi (chat:signal) o novi vrstici. */
  emitChatSignal: (commentId?: string) => void;
  /** Zahtevaj odgovor AI svetovalca (POST /api/trip-comments/ai-reply). */
  askAi: (question: string) => Promise<TripChatItem>;
}

export function useTripChat(
  shareId: string,
  /** Začetne vrstice iz RSC (najnovejše prve — DESC; hook jih obrne). */
  initialComments: TripChatItem[]
): UseTripChatResult {
  // Kronološki vrstni red (ASC) — klepet doda na konec.
  const [comments, setComments] = useState<TripChatItem[]>(() =>
    [...(initialComments ?? [])].reverse()
  );
  const [connected, setConnected] = useState(false);
  const [aiPending, setAiPending] = useState(false);

  // Zadnji znani ISO (strežniški) — baza za ?since= inkrementalnega dotika.
  const lastIsoRef = useRef<string>(
    (() => {
      const items = [...(initialComments ?? [])].reverse();
      return items.length > 0 ? items[items.length - 1].createdAt : "";
    })()
  );
  const pollingRef = useRef(false);
  const socketRef = useRef<Socket | null>(null);

  const appendLocal = useCallback((item: TripChatItem) => {
    if (!isValidChatItem(item)) return;
    setComments((prev) => {
      if (prev.some((c) => c.id === item.id)) return prev;
      return [...prev, { ...item, payload: item.payload ?? null }];
    });
    if (item.createdAt > lastIsoRef.current) {
      lastIsoRef.current = item.createdAt;
    }
  }, []);

  // === Inkrementalni dotik (?since= — SAMO nove vrstice, ASC) ===
  const poll = useCallback(async () => {
    if (pollingRef.current) return; // brez prekrivanja tekov
    pollingRef.current = true;
    try {
      // Prazna zgodovina → prvi dotik brez since (prebere vse, DESC → ni
      // potreben: RSC je že prinesel začetno stanje; dotik zgolj za novo).
      const sinceIso = lastIsoRef.current;
      if (sinceIso === "") {
        // Še nič vrstic: podaj trenutni čas minus prekrivanje (serverless
        // ura) — vrstice, objavljene po odprtu strani, se poberejo.
        lastIsoRef.current = new Date(
          Date.now() - SINCE_OVERLAP_MS
        ).toISOString();
        return;
      }
      const since = new Date(
        Math.max(0, Date.parse(sinceIso) - SINCE_OVERLAP_MS)
      ).toISOString();
      const res = await fetch(
        `/api/trip-comments?shareId=${encodeURIComponent(shareId)}&since=${encodeURIComponent(since)}`,
        { cache: "no-store" }
      );
      if (!res.ok) return; // fail-silent — naslednji interval poskusi znova
      const data: unknown = await res.json().catch(() => null);
      const d = data as { comments?: unknown } | null;
      if (!Array.isArray(d?.comments)) return;
      const items = d.comments
        .map(normalizeItem)
        .filter((x): x is TripChatItem => x !== null);
      if (items.length === 0) return;

      let newest = lastIsoRef.current;
      setComments((prev) => {
        const known = new Set(prev.map((c) => c.id));
        const fresh = items.filter((c) => !known.has(c.id));
        if (fresh.length === 0) return prev;
        for (const c of fresh) {
          if (c.createdAt > newest) newest = c.createdAt;
        }
        return [...prev, ...fresh];
      });
      // Ref posodobimo tudi izven setComments (setState lahko preskoči ob
      // identičnem prev — ref mora dohiteti strežnik v vsakem primeru).
      for (const c of items) {
        if (c.createdAt > lastIsoRef.current) lastIsoRef.current = c.createdAt;
      }
    } catch {
      // fail-silent (offline/timeout) — polling poskusi znova na intervalu
    } finally {
      pollingRef.current = false;
    }
  }, [shareId]);

  const pollNow = useCallback(() => {
    void poll();
  }, [poll]);

  // === Polling interval (SAMO ob vidnem zavihku) ===
  useEffect(() => {
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void poll();
    };
    const id = setInterval(tick, POLL_INTERVAL_MS);
    // Vrnitev na zavihek → takojšen dotik (brez čakanja na naslednji tick).
    const onVisible = () => {
      if (typeof document !== "undefined" && !document.hidden) void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll]);

  // === Socket pospešitev (chat:new → takojšen dotik) — DELJENA povezava ===
  useEffect(() => {
    let disposed = false;
    let sock: Socket | null = null;
    const onNew = () => {
      void poll();
    };
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    acquireTripSocket()
      .then((s) => {
        if (disposed) return;
        sock = s;
        socketRef.current = s;
        s.on("chat:new", onNew);
        s.on("connect", onConnect);
        s.on("disconnect", onDisconnect);
      })
      .catch(() => {
        // Modul nedosegljiv (nikoli v praksi) — tiho.
      });

    return () => {
      disposed = true;
      const s = sock ?? socketRef.current;
      if (s) {
        s.off("chat:new", onNew);
        s.off("connect", onConnect);
        s.off("disconnect", onDisconnect);
      }
      socketRef.current = null;
      releaseTripSocket();
    };
  }, [poll]);

  // === Signal prisotnim (po uspešni objavi/ai-reply) ===
  const emitChatSignal = useCallback(
    (commentId?: string) => {
      const sock = socketRef.current;
      if (!sock || !sock.connected) return;
      sock.emit("chat:signal", {
        shareId,
        ...(typeof commentId === "string" && commentId.length > 0
          ? { commentId }
          : {}),
      });
    },
    [shareId]
  );

  // === AI svetovalec — odgovor izda strežnik (isti pogon kot /api/chat) ===
  const askAi = useCallback(
    async (question: string): Promise<TripChatItem> => {
      setAiPending(true);
      try {
        const res = await fetch("/api/trip-comments/ai-reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shareId, question }),
        });
        const data: unknown = await res.json().catch(() => null);
        const d = data as
          | { success?: unknown; comment?: unknown; error?: unknown }
          | null;
        if (!res.ok || d?.success !== true) {
          const error =
            typeof d?.error === "string" ? d.error : `HTTP ${res.status}`;
          throw new Error(error);
        }
        const item = normalizeItem(d.comment);
        if (!item) throw new Error("Neveljaven odgovor strežnika.");
        appendLocal(item);
        emitChatSignal(item.id);
        return item;
      } finally {
        setAiPending(false);
      }
    },
    [shareId, appendLocal, emitChatSignal]
  );

  return {
    comments,
    connected,
    aiPending,
    appendLocal,
    pollNow,
    emitChatSignal,
    askAi,
  };
}
