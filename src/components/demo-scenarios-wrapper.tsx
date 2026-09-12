"use client";

import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";

import { DemoScenarios } from "@/components/demo-scenarios";
import { localePrefix } from "@/i18n/routing";

/**
 * DemoScenariosWrapper — FW3: klik na demo scenarij prenese željo na
 * /načrtuj prek sessionStorage (AI planner ima tam svojo celo stran).
 * FW4.3-2: preusmeritev je locale-zavedna (/en/nacrtuj na angleščini).
 */
export function DemoScenariosWrapper() {
  const router = useRouter();
  const locale = useLocale();

  const handleSelect = (query: string) => {
    sessionStorage.setItem("heroQuery", query);
    router.push(`${localePrefix(locale)}/nacrtuj`);
  };

  return <DemoScenarios onSelect={handleSelect} />;
}
