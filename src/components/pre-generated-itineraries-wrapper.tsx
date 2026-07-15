"use client";

import { PreGeneratedItineraries } from "@/components/pre-generated-itineraries";

/**
 * PreGeneratedItinerariesWrapper — povezuje pre-generated klik z heroQuery eventom.
 */
export function PreGeneratedItinerariesWrapper() {
  const handleSelect = (query: string) => {
    const planner = document.getElementById("načrtuj");
    if (planner) {
      planner.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("heroQuery", { detail: query }));
    }, 500);
  };

  return <PreGeneratedItineraries onSelect={handleSelect} />;
}
