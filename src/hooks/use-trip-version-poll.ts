"use client";

// ============================================================================
// TASK 28 (Tier 1 #1) — useTripVersionPoll: live-sync indikator poti.
// ============================================================================
//
// Polling lahkotne verzije (src/lib/trip-version.ts) SAMO medtem, ko je
// zavihek Viden (visibilitychange) — skrit zavihek ne troši baterije ne
// omrežja. Ob ZAPOREDNIH napakah utihne (offline) in se ponovno zažene ob
// spremembi vidnosti.
//
// Pogodba:
//   const { stale, serverVersion, serverUpdatedAt, dismiss } =
//     useTripVersionPoll({ shareId, knownVersion, enabled });
//
//  - stale === true SAMO ko strežnik poroča STROGO novejšo verzijo od
//    knownVersion (resolveVersionStale) IN uporabnik ni ravno te zavrnili;
//  - `stale` je IZPELJAN med renderjem (nikoli setState znotraj efekta —
//    pravilo react-hooks/set-state-in-effect): ko klicatelj po osvežitvi
//    posodobi knownVersion, banner se sam pobriše brez efekta;
//  - dismiss() zavrne TO strežniško verzijo (do naslednje novejše);
//  - videno/zavrnjeno stanje je VEZANO na shareId (stanje iz prejšnje
//    odprte poti se ne prenaša na novo).
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchTripVersion,
  resolveVersionStale,
  TRIP_VERSION_MAX_CONSECUTIVE_ERRORS,
  TRIP_VERSION_POLL_MS,
} from "@/lib/trip-version";

export interface TripVersionPollState {
  /** Strežnik poroča novejšo verzijo → pokaži banner „Osveži". */
  stale: boolean;
  /** Strežniška (novejša) verzija — za izpis v bannerju. */
  serverVersion: number | null;
  /** ISO čas strežniške posodobitve (izpis opcijsko). */
  serverUpdatedAt: string | null;
  /** Uporabnik je banner skril (do naslednje novejše verzije). */
  dismiss: () => void;
}

/** Zadnja strežniška verzija, ki jo je polling videl (za DANI shareId). */
interface SeenVersion {
  shareId: string;
  version: number;
  updatedAt: string;
}

export function useTripVersionPoll(options: {
  shareId: string | null;
  /** Lokalno znana verzija (null = neznana → nikoli ne trdimo zastarelosti). */
  knownVersion: number | null;
  /** Poll samo, ko ima smisel (npr. odprta/povezana pot). */
  enabled: boolean;
}): TripVersionPollState {
  const { shareId, knownVersion, enabled } = options;

  const [seen, setSeen] = useState<SeenVersion | null>(null);
  // Verzija, ki jo je uporabnik ZAVESTNO zavrnil — vezana na shareId.
  const [dismissed, setDismissed] = useState<{
    shareId: string;
    version: number;
  } | null>(null);

  // Zadnja znana lokalna verzija (interval closure bere ob klicu — ref
  // se osveži po vsakem renderu, preden se koli klicev zgodi).
  const knownRef = useRef<number | null>(knownVersion);
  useEffect(() => {
    knownRef.current = knownVersion ?? null;
  }, [knownVersion]);

  // ZapoREDNE napake (offline) — po mejah utihnemo do spremembe vidnosti.
  const errors = useRef(0);

  // ── IZPELJANO stanje (isti rezultat kot efekt, brez kaskadnih renderov):
  // strežniška verzija/zavrnitev veljata SAMO za trenutni shareId.
  const serverVersion =
    seen && shareId !== null && seen.shareId === shareId ? seen.version : null;
  const serverUpdatedAt =
    seen && shareId !== null && seen.shareId === shareId
      ? seen.updatedAt
      : null;
  const dismissedVersion =
    dismissed && shareId !== null && dismissed.shareId === shareId
      ? dismissed.version
      : null;

  // Banner gor SAMO pri STROGO novejši strežniški verziji, ki je uporabnik
  // ni ravno te zavrnili (knownVersion dohiti strežnik → banner sam dol).
  const stale =
    serverVersion !== null &&
    resolveVersionStale(knownVersion ?? null, serverVersion) &&
    (dismissedVersion === null || serverVersion > dismissedVersion);

  const dismiss = useCallback(() => {
    if (serverVersion !== null && shareId !== null) {
      setDismissed({ shareId, version: serverVersion });
    }
  }, [serverVersion, shareId]);

  useEffect(() => {
    if (!enabled || !shareId) {
      // Izključeno — NE čistimo stanja v efektu (izpeljava zgoraj že
      // ignorira videno/zavrnjeno stanje drugih shareId-jev).
      return;
    }

    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      if (
        typeof document !== "undefined" &&
        document.visibilityState !== "visible"
      ) {
        return; // skrit zavihek — NE trošimo (naslednji tick vidnosti)
      }
      if (errors.current >= TRIP_VERSION_MAX_CONSECUTIVE_ERRORS) {
        return; // offline/utihnjeno — ponovno ob spremembi vidnosti
      }
      const version = await fetchTripVersion(shareId);
      if (cancelled) return;
      if (!version) {
        errors.current += 1; // iskren »ne vemo« — utihnemo po zaporedju
        return;
      }
      errors.current = 0;
      setSeen((prev) => {
        // Ista verzija kot prej → brez novega rendera (polling tiho).
        if (
          prev &&
          prev.shareId === shareId &&
          prev.version === version.contentVersion
        ) {
          return prev;
        }
        return {
          shareId,
          version: version.contentVersion,
          updatedAt: version.updatedAt,
        };
      });
    };

    const id = setInterval(poll, TRIP_VERSION_POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        errors.current = 0; // ponovni zagon po offline obdobju
        void poll();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [shareId, enabled]);

  return { stale, serverVersion, serverUpdatedAt, dismiss };
}
