import { createNavigation } from "next-intl/navigation";

import { routing } from "./routing";

/**
 * Locale-zavedajoče navigacijski helperji (FW4.3-2).
 *
 * `Link` (LocaleLink): enak API kot `next/link`, a SAMODEJNO doda `/en`
 * prefix, kadar je aktiven locale "en" (default "sl" je brez prefix-a —
 * `localePrefix: "as-needed"`). Tako uporabnik, ki brska po angleški
 * različici, ob kliku na notranjo povezavo OSTANE v angleščini.
 *
 * Uporaba (nadomesti `import Link from "next/link"`):
 *   import { Link } from "@/i18n/navigation";
 *
 * Deluje v client komponentah (useLocale iz NextIntlClientProvider) in v
 * server komponentah (getLocale iz request config-a — header, ki ga nastavi
 * src/proxy.ts).
 *
 * ISSUE #5 T5-B (H1): izvožen je tudi `useRouter` — programski router.push
 * iz klientnih komponent (npr. SmartSearch navigacija) MORA ostati v
 * aktivnem lokalnem (enaka logika prefixa kot Link), sicer EN uporabnik
 * ob kliku na rezultat iskanja izgubi jezik.
 *
 * OPOMBA: `usePathname` iz tega modula NE uporabljajmo neposredno —
 * `usePathname()` (next/navigation) vrača ZUNANJI URL, torej S `/en`
 * prefix-om, kadar uporabnik brska angleško (proxy rewrite je klientu
 * proziren). Za locale-URL-e vedno uporabi `localePrefix(locale)` iz
 * routing.ts; pri delu s potmi najprej odstrani `/en` prefix (glej
 * vzorec v language-switcher.tsx).
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(
  routing,
);
