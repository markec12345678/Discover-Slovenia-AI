"use client";

import { useEffect } from "react";
import { trackFunnel } from "@/lib/funnel";

const SESSION_KEY = "funnel_home_viewed";

/**
 * FunnelTracker — zabeleži "homepage_view" enkrat na sejo (sessionStorage guard).
 * Montiran v app/page.tsx (nivo domače strani).
 */
export function FunnelTracker() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_KEY)) return;
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // sessionStorage nedostopen (private mode) — kljub temu sledi enkrat
    }
    trackFunnel("homepage_view", window.location.pathname);
  }, []);

  return null;
}

export default FunnelTracker;
