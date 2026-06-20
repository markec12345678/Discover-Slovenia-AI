import { getRequestConfig } from "next-intl/server";

import { routing, type Locale } from "./routing";

/**
 * Request config — next-intl ga pokliče za vsak request da pridobi locale
 * in pripadajoče prevode.
 *
 * `requestLocale` pride iz middleware-a (header `x-next-intl-locale`).
 * Če ni nastavljen ali ni veljaven, fallback na default locale ("sl").
 */
export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  if (!locale || !routing.locales.includes(locale as Locale)) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
