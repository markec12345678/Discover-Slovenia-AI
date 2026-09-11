"use client";

import { useRouter } from "next/navigation";

import { PreGeneratedItineraries } from "@/components/pre-generated-itineraries";

/**
 * PreGeneratedItinerariesWrapper — FW3: klik na priljubljeno AI pot
 * prenese željo na /načrtuj prek sessionStorage (planner živi tam).
 */
export function PreGeneratedItinerariesWrapper() {
  const router = useRouter();

  const handleSelect = (query: string) => {
    sessionStorage.setItem("heroQuery", query);
    router.push("/nacrtuj");
  };

  return <PreGeneratedItineraries onSelect={handleSelect} />;
}
