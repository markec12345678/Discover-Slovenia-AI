"use client";

import { useLocale } from "next-intl";
import { usePathname } from "next/navigation";
import { Globe } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isLocaleRoute, routing } from "@/i18n/routing";

/**
 * Seznam vseh jezikov, ki jih platforma pozna (zastavica + avtohtono ime).
 * Vrstni red = vrstni red v dropdown meniju.
 */
const LANGUAGES: { code: string; flag: string; label: string }[] = [
  { code: "sl", flag: "🇸🇮", label: "Slovenščina" },
  { code: "en", flag: "🇬🇧", label: "English" },
  { code: "de", flag: "🇩🇪", label: "Deutsch" },
  { code: "it", flag: "🇮🇹", label: "Italiano" },
  // W12 (smer 2, faza 1 — 1.144.0): francoščina in španščina kot javna
  // jezika (jedro odkrivanja + svetovanja). Vidna SAMO na FR/ES whitelistnih
  // poteh (isLocaleRoute) — drugje ju filter skrije (ne ponujamo različice,
  // ki je ni).
  { code: "fr", flag: "🇫🇷", label: "Français" },
  { code: "es", flag: "🇪🇸", label: "Español" },
];

/**
 * Javno dostopni jeziki = routing.locales. FW4.3-2: "sl" + "en";
 * W1 (Issue #15 V0, 1.126.0): + "it" + "de" (faza 1 — IT/DE whitelist).
 * W12 (smer 2, faza 1 — 1.144.0): + "fr" + "es" (FR/ES whitelist).
 */
const AVAILABLE_LANGUAGES = LANGUAGES.filter((l) =>
  (routing.locales as readonly string[]).includes(l.code)
);

/**
 * Odstrani locale prefix (/en, /it, /de) iz ZUNANJEGA URL-ja → notranja
 * (slovenska) pot za whitelistne preverbe in gradnjo cilja.
 *
 * Opomba: `usePathname()` (next/navigation) vrača ZUNANJI URL — torej S
 * locale prefix-om, kadar uporabnik brska v tujem jeziku (proxy rewrite je
 * klientu prozoren). Deluje neodvisno od tega, ali usePathname vrača
 * zunanjo ali notranjo pot.
 */
function stripLocalePrefix(rawPathname: string): string {
  const prefixes = routing.locales.filter((l) => l !== routing.defaultLocale);
  // W1: točno "/{locale}" (brez pod-poti) → "/" — lookahead spodaj namreč
  // zahteva "/" ZA prefixom in ga pri korenu ne najde (hrošč ujet na /it).
  if (prefixes.some((p) => rawPathname === `/${p}`)) return "/";
  return rawPathname.replace(
    new RegExp(`^/(${prefixes.join("|")})(?=/)`),
    ""
  );
}

/**
 * Language Switcher — dropdown z javno dostopnimi jeziki.
 *
 * FW4.3-2 + W1: javni jeziki so "sl" + "en" + "it" + "de" (vsak na svoji
 * whitelisti — routing.ts).
 * - Trenutni jezik prikazan z zastavico emoji in Globe ikono.
 * - Klik na jezik → navigacija OHRANI trenutno stran (samo zamenja locale
 *   prefix); hash se ohrani.
 * - Jeziki, ki za AKTUALNO POT nimajo različice, se v meniju NE pokažejo
 *   (P4-8 + W1) — ponuditi neobstoječo verzijo bi bilo lažno (proxy bi
 *   uporabnika takoj 308 preusmeril nazaj na slovensko).
 * - Če za aktualno pot ni NOBENE alternativne različice, se preklopnik
 *   skrije (isti kanon kot prej — preklop nima pomena).
 */
export function LanguageSwitcher() {
  const locale = useLocale() as string;
  const rawPathname = usePathname() ?? "/";

  // Normaliziraj pot: odstrani locale prefix, če je prisoten (zunanji URL).
  const pathname = stripLocalePrefix(rawPathname);

  // Jeziki, ki za TO pot res imajo različico (SL vedno — izvirnik).
  const offered = AVAILABLE_LANGUAGES.filter(
    (l) => l.code === routing.defaultLocale || isLocaleRoute(pathname, l.code)
  );

  // Nobena alternativa → preklopnik nima pomena — se skrije.
  const alternatives = offered.filter((l) => l.code !== locale);
  if (alternatives.length === 0) return null;

  const current = AVAILABLE_LANGUAGES.find((l) => l.code === locale) ?? offered[0];

  const switchTo = (next: string) => {
    if (next === locale) return;

    // Ohrani hash (npr. `#destinacije`) pri preklopu jezika
    const hash = typeof window !== "undefined" ? window.location.hash : "";

    // Preklop OHRANI trenutno stran, kadar ima ciljni jezik različico;
    // sicer vodi na domov ciljnega jezika (edina smiselna tarča — proxy
    // bi pot sicer 308 vrnil nazaj). Default locale nima prefix-a.
    const target = isLocaleRoute(pathname, next)
      ? next === routing.defaultLocale
        ? pathname
        : `/${next}${pathname === "/" ? "" : pathname}`
      : `/${next}`;

    // TRDA navigacija (ne router.push): proxy REWITA locale prefix interno
    // na isto pot kot SL, zato sta `/en/…` in `/…` ista RSC drevesa — client
    // router bi pri soft navigaciji izračunal PRAZNO drevesno razliko in
    // vsebine sploh ne zamenjal. Trdi skok zagotovi poln SSR v novem jeziku
    // in počisti Router Cache (standarden vzorec za preklop locale-a).
    // (eslint-disable: pravilo @next/next/no-location-assign-relative-destination
    // iz eslint-config-next 16.3.5 tu lažno pozitivno svaruje — hard navigacija
    // je NAMENJENA, glej zgornji komentar.)
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`${target}${hash}`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 px-2 text-foreground"
          aria-label={`Izberi jezik — trenutno ${current.label}`}
        >
          <Globe className="size-4" aria-hidden="true" />
          <span className="text-base leading-none" aria-hidden="true">
            {current.flag}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        {offered.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => switchTo(lang.code)}
            className={
              lang.code === locale
                ? "bg-accent text-accent-foreground"
                : ""
            }
          >
            <span className="mr-2 text-base" aria-hidden="true">
              {lang.flag}
            </span>
            <span>{lang.label}</span>
            {lang.code === locale && (
              <span className="ml-auto text-xs text-muted-foreground">
                ✓
              </span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default LanguageSwitcher;
