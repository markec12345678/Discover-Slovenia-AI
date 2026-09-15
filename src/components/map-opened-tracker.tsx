"use client";

import { useEffect } from "react";
import { trackPlannerEvent } from "@/lib/planner-analytics";

/**
 * MapOpenedTracker (Faza 4 — pilotna analitika) — zabeleži "map_opened",
 * ko uporabnik pride na stran zemljevida (lokalna stran /zemljevid).
 * Montiran v src/app/zemljevid/page.tsx; ne potrebuje props ali UI.
 */
export function MapOpenedTracker() {
  useEffect(() => {
    trackPlannerEvent("map_opened", { via: "zemljevid_page" });
  }, []);

  return null;
}

export default MapOpenedTracker;
