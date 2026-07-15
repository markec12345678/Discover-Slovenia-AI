"use client";

import { DemoScenarios } from "@/components/demo-scenarios";

/**
 * DemoScenariosWrapper — client wrapper ki povezuje demo klik z heroQuery eventom.
 * Ko uporabnik klikne scenarij, dispatch-a heroQuery ki ga itinerary planner posluša.
 */
export function DemoScenariosWrapper() {
  const handleSelect = (query: string) => {
    // Scroll do AI plannerja
    const planner = document.getElementById("načrtuj");
    if (planner) {
      planner.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    // Dispatch heroQuery event (itinerary planner posluša)
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("heroQuery", { detail: query }));
    }, 500);
  };

  return <DemoScenarios onSelect={handleSelect} />;
}
