import { getLocale, getTranslations } from "next-intl/server";
import { Globe } from "lucide-react";

/**
 * LanguageToggle — kompaktna povezava SL ⇄ EN za strani BREZ Navigation
 * komponente (info/E-E-A-T strani + destinacijske podstrani na EN
 * whitelisti). Na straneh z Navigation je že LanguageSwitcher (dropdown).
 *
 * FW4.3-2:
 * - Povezava je NAVADEN <a> (trda navigacija): proxy REWITA `/en` interno
 *   na isto pot kot SL, zato bi client-side soft navigacija izračunala
 *   prazno RSC drevesno razliko in vsebine ne zamenjala (glej komentar v
 *   language-switcher.tsx). Trdi skok zagotovi poln SSR v novem jeziku.
 * - `hreflang` atribut pove brskalnikom in iskalnikom jezik ciljne povezave.
 * - Strani, ki niso na EN whitelisti, komponente NE namestijo — preklop
 *   bi bil lažen (cilj ne obstaja; P4-8).
 * - path je NOTRANJA (slovenska) pot brez locale prefix-a; komponenta sam
 *   doda `/en` prefix kadar je aktiven SL.
 */
export async function LanguageToggle({ path }: { path: string }) {
  const t = await getTranslations("common");
  const locale = await getLocale();
  const isEn = locale === "en";

  const href = isEn ? path : path === "/" ? "/en" : `/en${path}`;

  return (
    <div className="px-4 pt-4 sm:px-6">
      <a
        href={href}
        hrefLang={isEn ? "sl" : "en"}
        className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
      >
        <Globe className="size-3.5" aria-hidden="true" />
        {isEn ? t("readInSlovenian") : t("readInEnglish")}
      </a>
    </div>
  );
}
