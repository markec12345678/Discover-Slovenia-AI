"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { Globe } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
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
 * Skupna jedrna logika preklopnika (delita jo dropdown v headerju in
 * inline vrstica v mobilnem Sheetu — POLISH 1.173.0 izvlečena iz
 * LanguageSwitcher, da ostajata po definiciji enaki).
 *
 * Vrača: trenutni jezik, ponujene jezike za AKTUALNO POT (whitelist) in
 * navigacijsko funkcijo, ki ohrani stran + hash.
 */
function useLanguageOptions() {
  const locale = useLocale() as string;
  const rawPathname = usePathname() ?? "/";
  const t = useTranslations("nav");

  // Normaliziraj pot: odstrani locale prefix, če je prisoten (zunanji URL).
  const pathname = stripLocalePrefix(rawPathname);

  // Jeziki, ki za TO pot res imajo različico (SL vedno — izvirnik).
  const offered = AVAILABLE_LANGUAGES.filter(
    (l) => l.code === routing.defaultLocale || isLocaleRoute(pathname, l.code)
  );

  const current =
    AVAILABLE_LANGUAGES.find((l) => l.code === locale) ?? offered[0];

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

    // TRDA navigacija (ne router.push): proxy REWRITE locale prefix interna
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

  return {
    locale,
    offered,
    current,
    alternatives: offered.filter((l) => l.code !== locale),
    switchTo,
    ariaLabel: t("languageAria", { current: current.label }),
    heading: t("languageHeading"),
    hint: t("languageSheetHint"),
  };
}

/**
 * Language Switcher — dropdown z javno dostopnimi jeziki (NAMIZNI header).
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
  const { offered, current, alternatives, switchTo, ariaLabel } =
    useLanguageOptions();

  // Nobena alternativa → preklopnik nima pomena — se skrije.
  if (alternatives.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 px-2 text-foreground"
          aria-label={ariaLabel}
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
              lang.code === current.code
                ? "bg-accent text-accent-foreground"
                : ""
            }
          >
            <span className="mr-2 text-base" aria-hidden="true">
              {lang.flag}
            </span>
            <span>{lang.label}</span>
            {lang.code === current.code && (
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

/**
 * LanguageSheetRow — INLINE vrstica jezikov za MOBILNI Sheet meni
 * (POLISH 1.173.0).
 *
 * ZAKAJ INLINE IN NE DROPDOWN: vgnezden Radix dropdown v Sheetu (Dialog) je
 * bil v produkciji POKVARJEN — dropdown content portalira na document.body,
 * kar je IZVEN Sheet vsebine → Sheetov outside-interaction handler je zaprl
 * Sheet, preden se je dropdown sploh odprl (klik = nič se ne zgodi; enako
 * velja za A11yControls). Inline vrstica ne potrebuje portala in je za
 * mobilni UX boljša tudi sicer: en klik namesto dveh, vsi jeziki vidni
 * naenkrat, ≥44px tipke.
 *
 - Ista jedrna logika kot header dropdown (useLanguageOptions — en vir
 * resnice): ista whitelist ponudbe po poti, isti trdi preklop, isto
 * skrivanje, kadar alternativ ni.
 */
export function LanguageSheetRow() {
  const { offered, locale, alternatives, switchTo, ariaLabel, heading, hint } =
    useLanguageOptions();

  // Nobena alternativa → vrstica nima pomena (Sheet jo izpusti).
  if (alternatives.length === 0) return null;

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="space-y-2"
    >
      <p className="flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        <Globe className="size-3.5" aria-hidden="true" />
        {heading}
      </p>
      <div className="flex flex-wrap gap-2">
        {offered.map((lang) => {
          const active = lang.code === locale;
          return (
            <button
              key={lang.code}
              type="button"
              onClick={() => switchTo(lang.code)}
              aria-current={active ? "true" : undefined}
              className={cn(
                "inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground/80 hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <span className="text-base leading-none" aria-hidden="true">
                {lang.flag}
              </span>
              <span>{lang.label}</span>
              {active ? (
                <span className="text-xs" aria-hidden="true">
                  ✓
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {/* Namig, da se stran ob preklopu ohrani (isti kanon kot dropdown) */}
      <p className="px-1 text-[11px] leading-snug text-muted-foreground">
        {hint}
      </p>
    </div>
  );
}

export default LanguageSwitcher;
