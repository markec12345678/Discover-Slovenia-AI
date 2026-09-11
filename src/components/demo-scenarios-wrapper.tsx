"use client";

import { useRouter } from "next/navigation";

import { DemoScenarios } from "@/components/demo-scenarios";

/**
 * DemoScenariosWrapper — FW3: klik na demo scenarij prenese željo na
 * /načrtuj prek sessionStorage (AI planner ima tam svojo celo stran).
 */
export function DemoScenariosWrapper() {
  const router = useRouter();

  const handleSelect = (query: string) => {
    sessionStorage.setItem("heroQuery", query);
    router.push("/nacrtuj");
  };

  return <DemoScenarios onSelect={handleSelect} />;
}
