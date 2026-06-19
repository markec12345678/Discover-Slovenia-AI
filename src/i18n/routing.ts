import { defineRouting } from "next-intl/routing";

/**
 * Next-intl routing konfiguracija.
 *
 * - 4 jeziki: slovenščina (default), angleščina, nemščina, italijanščina.
 * - `localePrefix: "as-needed"` pomeni, da default locale ("sl") NIMA prefix-a
 *   (URL je `/`), ostali jeziki pa imajo prefix (`/en`, `/de`, `/it`).
 */
export const routing = defineRouting({
  locales: ["sl", "en", "de", "it"],
  defaultLocale: "sl",
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];
