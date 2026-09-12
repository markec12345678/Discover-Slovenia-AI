"use client";

import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";

import { PreGeneratedItineraries } from "@/components/pre-generated-itineraries";
import { localePrefix } from "@/i18n/routing";

/**
 * PreGeneratedItinerariesWrapper — FW3: klik na priljubljeno AI pot
 * prenese željo na /načrtuj prek sessionStorage (planner živi tam).
 * FW4.3-2: preusmeritev je locale-zavedna (/en/nacrtuj na angleščini).
 */
export function PreGeneratedItinerariesWrapper() {
  const router = useRouter();
  const locale = useLocale();

  const handleSelect = (query: string) => {
    sessionStorage.setItem("heroQuery", query);
    router.push(`${localePrefix(locale)}/nacrtuj`);
  };

  return <PreGeneratedItineraries onSelect={handleSelect} />;
}
