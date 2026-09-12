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
import { isEnRoute, routing } from "@/i18n/routing";

/**
 * Seznam vseh jezikov, ki jih platforma pozna (zastavica + avtohtono ime).
 * Vrstni red = vrstni red v dropdown meniju.
 */
const LANGUAGES: { code: string; flag: string; label: string }[] = [
  { code: "sl", flag: "🇸🇮", label: "Slovenščina" },
  { code: "en", flag: "🇬🇧", label: "English" },
  { code: "de", flag: "🇩🇪", label: "Deutsch" },
  { code: "it", flag: "🇮🇹", label: "Italiano" },
];

/**
 * Javno dostopni jeziki = routing.locales (FW4.3-2: "sl" + "en").
 * Deutsch/Italiano ostajata skrita, dokler ne dobita celovitih prevodov
 * (P4-8; roadmap C5) — takrat se samodejno prikažeta nazaj.
 */
const AVAILABLE_LANGUAGES = LANGUAGES.filter((l) =>
  (routing.locales as readonly string[]).includes(l.code)
);

/**
 * Language Switcher — dropdown z javno dostopnimi jeziki.
 *
 * FW4.3-2: javna "sl" + "en" (EN na whitelisti — jedro lijaka).
 * - Trenutni jezik prikazan z zastavico emoji in Globe ikono.
 * - Klik na jezik → navigacija OHRANI trenutno stran (samo doda/odstrani
 *   `/en` prefix); hash se ohrani.
 * - Na straneh BREZ EN različice (npr. /vodici) se preklopnik skrije
 *   (P4-8) — preklop na neobstoječo verzijo bi bil lažen.
 *
 * Opomba: `usePathname()` (next/navigation) vrača ZUNANJI URL — torej S
 * `/en` prefix-om, kadar uporabnik brska angleško (proxy rewrite je
 * klientu prozoren). Zato prefix tu NORMALIZIRAMO (odstranimo), da dobimo
 * notranjo (slovensko) pot za isEnRoute() preverbo in gradnjo cilja.
 */
export function LanguageSwitcher() {
  const locale = useLocale() as string;
  const rawPathname = usePathname() ?? "/";

  // P4-8: z enim javnim jezikom preklopnik nima pomena — se skrije.
  if (AVAILABLE_LANGUAGES.length <= 1) return null;

  // Normaliziraj pot: odstrani `/en` prefix, če je prisoten (zunanji URL).
  // Deluje neodvisno od tega, ali usePathname vrača zunanjo ali notranjo pot.
  const pathname =
    rawPathname === "/en"
      ? "/"
      : rawPathname.replace(/^\/en(?=\/)/, "");

  // FW4.3-2: EN živi SAMO na whitelisti (jedro lijaka). Na straneh brez EN
  // različice (npr. /vodici) se preklopnik NE pokaže: ponuditi EN bi bilo
  // lažno (proxy bi uporabnika takoj 308 preusmeril nazaj na slovensko).
  const hasEn = isEnRoute(pathname);
  if (locale === routing.defaultLocale && !hasEn) return null;

  const current =
    AVAILABLE_LANGUAGES.find((l) => l.code === locale) ?? AVAILABLE_LANGUAGES[0];

  const switchTo = (next: string) => {
    if (next === locale) return;

    // Ohrani hash (npr. `#destinacije`) pri preklopu jezika
    const hash =
      typeof window !== "undefined" ? window.location.hash : "";

    // FW4.3-2: preklop OHRANI trenutno stran (prej je vodil na /{locale}
    // domov). Default locale ("sl") nima prefix-a; "en" ga ima. Na poti
    // brez EN različice preklop na EN vodi na domov angleške različice
    // (edina smiselna tarča — proxy bi pot sicer 308 vrnil nazaj).
    const cleanPath = pathname === "/" ? "/" : pathname;
    const target =
      next === routing.defaultLocale
        ? cleanPath
        : hasEn
          ? `/en${cleanPath === "/" ? "" : cleanPath}`
          : "/en";

    // TRDA navigacija (ne router.push): proxy REWITA `/en` interno na isto
    // pot kot SL, zato sta `/en/…` in `/…` ista RSC drevesa — client router
    // bi pri soft navigaciji izračunal PRAZNO drevesno razliko in vsebine
    // sploh ne zamenjal. Trdi skok zagotovi poln SSR v novem jeziku in
    // počisti Router Cache (standarden vzorec za preklop locale-a).
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
        {AVAILABLE_LANGUAGES.map((lang) => (
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
