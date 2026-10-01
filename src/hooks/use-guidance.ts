"use client";

// ============================================================================
// ISSUE #23 — useGuidance hook: klientna projekcija vodene plasti (1.163.0)
// ============================================================================
// Odporen na hydration mismatch (SSR → null; šele effect prebere
// localStorage — isti vzorec kot useMyTrip / useWishlist). Brez pollinga
// (§36): osvežitev ob mountu, dogodku `dai:my-trip-changed` (isti zavihek
// + cross-tab), focus in visibilitychange (zavest zavihka se zbudi z
// svežim stanjem — poceni in iskreno).
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";

import { selectGuidance } from "@/lib/guidance/guide-engine";
import {
  hasSeenFirstRun,
  isGuidedTourActive,
  readGuidanceInput,
  setGuidedTour,
} from "@/lib/guidance/guidance-snapshot";
import type {
  Guidance,
  GuidanceInput,
  GuidanceLiveContext,
  GuidanceSurface,
} from "@/lib/guidance/types";
import { MY_TRIP_CHANGED_EVENT_NAME } from "@/lib/my-trip";

export interface UseGuidanceResult {
  /** null dokler ni hydration-safe branja (SSR + prvi render). */
  guidance: Guidance | null;
  input: GuidanceInput | null;
  /** Ali uporabik še ni videl first-run kartice (samo home uporablja). */
  showFirstRun: boolean;
  /** Vodena pot („Ne vem — pokaži mi") je dejavna. */
  tourActive: boolean;
  /** Izklopi vodeno pot (ob zaključku / ročnem koncu). */
  endTour: () => void;
}

export function useGuidance(
  surface: GuidanceSurface,
  live?: GuidanceLiveContext | null,
): UseGuidanceResult {
  const [snapshot, setSnapshot] = useState<GuidanceInput | null>(null);
  const [firstRunSeen, setFirstRunSeen] = useState(true);
  const [tourActive, setTourActive] = useState(false);

  const refresh = useCallback(() => {
    // firstSession/returningUser: poštena hevristika iz zastavic —
    // first-run flag poveduje prvo izkušnjo, visitCount profile ne beremo
    // tukaj (dvojna semantika števca je znana; flag je kanonični vir za
    // "prvi obisk" vodene plasti).
    const seen = hasSeenFirstRun();
    const next = readGuidanceInput(surface, {
      firstSession: !seen,
      returningUser: seen,
      live: live ?? null,
    });
    setFirstRunSeen(seen);
    setTourActive(isGuidedTourActive());
    setSnapshot(next);
    // live je stabilna referenca med renderji komponente-klicatelja —
    // namerno v odvisnostih samo surface/live identiteta
  }, [surface, live]);

  useEffect(() => {
    // Initial reading via queueMicrotask — setState NOT synchronously in
    // the effect body (react-hooks/set-state-in-effect discipline,
    // same pattern as use-wake-lock.ts). Event listeners are not
    // affected (callback = allowed path).
    queueMicrotask(refresh);
    const onMyTrip = () => refresh();
    const onFocus = () => refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener(MY_TRIP_CHANGED_EVENT_NAME, onMyTrip);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener(MY_TRIP_CHANGED_EVENT_NAME, onMyTrip);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  const guidance = useMemo(
    () => (snapshot ? selectGuidance(snapshot) : null),
    [snapshot],
  );

  const endTour = useCallback(() => {
    setGuidedTour(false);
    setTourActive(false);
  }, []);

  return {
    guidance,
    input: snapshot,
    showFirstRun: !firstRunSeen,
    tourActive,
    endTour,
  };
}
