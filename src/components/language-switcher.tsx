"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { Globe } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { routing } from "@/i18n/routing";

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
 * Javno dostopni jeziki = routing.locales. P4-8: trenutno samo "sl"
 * (celoviti prevodi so roadmap C5 — glej src/i18n/routing.ts). Ko bodo
 * prevodi celoviti in se jeziki dodajo nazaj v routing, se preklopnik
 * samodejno spet prikaže — brez spremembe te komponente.
 */
const AVAILABLE_LANGUAGES = LANGUAGES.filter((l) =>
  (routing.locales as readonly string[]).includes(l.code)
);

/**
 * Language Switcher — dropdown z javno dostopnimi jeziki.
 *
 * - Trenutni jezik prikazan z zastavico emoji in Globe ikono.
 * - Klik na jezik → navigacija na `/{locale}` (ali `/` za default "sl").
 * - Hash (npr. `#destinacije`) se ohrani pri preklopu, da uporabnik
 *   ostane na isti sekciji strani.
 * - Če je na voljo samo en jezik, se preklopnik NE prikaže (P4-8) —
 *   preklop na neobstoječo/partialno prevedeno verzijo bi bil lažen.
 *
 * Opomba: ker custom middleware rewrites URL (`/en` → `/` interno), ne
 * moremo uporabiti `@/i18n/navigation` helper-jev za `usePathname`.
 * Zato direktno konstruiramo URL z locale prefix-om.
 */
export function LanguageSwitcher() {
  const locale = useLocale() as string;
  const router = useRouter();

  // P4-8: z enim javnim jezikom preklopnik nima pomena — se skrije.
  if (AVAILABLE_LANGUAGES.length <= 1) return null;

  const current =
    AVAILABLE_LANGUAGES.find((l) => l.code === locale) ?? AVAILABLE_LANGUAGES[0];

  const switchTo = (next: string) => {
    if (next === locale) return;

    // Ohrani hash (npr. `#destinacije`) pri preklopu jezika
    const hash =
      typeof window !== "undefined" ? window.location.hash : "";

    // Default locale ("sl") nima prefix-a (`localePrefix: "as-needed"`),
    // ostali jeziki imajo prefix (`/en`, `/de`, `/it`).
    const target = next === routing.defaultLocale ? "/" : `/${next}`;

    router.push(`${target}${hash}`);
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
