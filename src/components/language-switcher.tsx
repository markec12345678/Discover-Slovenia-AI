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
import { type Locale, routing } from "@/i18n/routing";

/**
 * Seznam podprtih jezikov z zastavico (emoji) in avtohtonim imenom.
 * Vrstni red = vrstni red v dropdown meniju.
 */
const LANGUAGES: { code: Locale; flag: string; label: string }[] = [
  { code: "sl", flag: "🇸🇮", label: "Slovenščina" },
  { code: "en", flag: "🇬🇧", label: "English" },
  { code: "de", flag: "🇩🇪", label: "Deutsch" },
  { code: "it", flag: "🇮🇹", label: "Italiano" },
];

/**
 * Language Switcher — dropdown z 4 jeziki.
 *
 * - Trenutni jezik prikazan z zastavico emoji in Globe ikono.
 * - Klik na jezik → navigacija na `/{locale}` (ali `/` za default "sl").
 * - Hash (npr. `#destinacije`) se ohrani pri preklopu, da uporabnik
 *   ostane na isti sekciji strani.
 *
 * Opomba: ker custom middleware rewrites URL (`/en` → `/` interno), ne
 * moremo uporabiti `@/i18n/navigation` helper-jev za `usePathname`.
 * Zato direktno konstruiramo URL z locale prefix-om.
 */
export function LanguageSwitcher() {
  const locale = useLocale() as Locale;
  const router = useRouter();

  const current = LANGUAGES.find((l) => l.code === locale) ?? LANGUAGES[0];

  const switchTo = (next: Locale) => {
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
        {LANGUAGES.map((lang) => (
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
