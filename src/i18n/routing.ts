import { defineRouting } from "next-intl/routing";

/**
 * Next-intl routing konfiguracija.
 *
 * P4-8 (iskrena komunikacija): javno je trenutno SAMO slovenščina.
 * Prej so bile javno dostopne delno prevedene strani (/en, /de, /it —
 * prevedena navigacija + noga, hardcoded slovenska vsebina), kar je
 * mešanje jezikov na eni strani in slab signal za obiskovalce in SEO.
 *
 * Celoviti prevodi so strateška vrzel C5 (glej docs/COMPETITIVE-ANALYSIS.md)
 * in roadmap: infrastruktura (next-intl, proxy, sporočila v
 * src/i18n/messages/, jezikovni preklopnik) ostaja pripravljena — ko bodo
 * prevodi celoviti, dodajte locale nazaj v `locales` spodaj.
 *
 * `localePrefix: "as-needed"`: default locale ("sl") NIMA prefix-a (URL je
 * `/`); stari prefiksi (/en, /de, /it) se v src/proxy.ts trajno (308)
 * preusmerijo na slovensko pot.
 */
export const routing = defineRouting({
  locales: ["sl"],
  defaultLocale: "sl",
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];
