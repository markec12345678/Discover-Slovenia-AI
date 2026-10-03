"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Accessibility, BookOpenText, Contrast } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  A11Y_STORAGE_KEY,
  a11yClasses,
  DEFAULT_A11Y_PREFS,
  isHighContrastActive,
  parseA11yPrefs,
  type A11yPrefs,
} from "@/lib/a11y-mode";

// ============================================================================
// W5 (Issue #15, 1.135.0): DOSTOPNOST — VISOK KONTRAST + BRALNI NAČIN
// ============================================================================
// STB portal (nacionalni standard) ima obe načini; mi sicer imamo dark mode
// + reduced-motion + ARIA, teh dveh pa ne. Oba sta ČISTA PLAST nad obstoječo
// CSS spremenljivko arhitekturo (glej globals.css — W5 blok) in se
// stikata z <html> razredi (isti nosilec kot next-themes .dark).
//
// UI: ikona dostopnosti ob preklopu teme → dropdown z DVEMA stikaloma.
// Stanje živi v localStorage (dsa-a11y) — izbira uporabnika preživi
// navigacijo in osvežitve; no-flash skript v layout head razrede naloži
// PRED prvim barvanjem (isti ključ, en vir resnice).
//
// VAROVALA:
//  - dark mode / reduced-motion / ARIA obstoječe ostanejo NESPREMENJENI
//    (novi načini so dodatna plast, nič nadomeščanja);
//  - OS spoštovanje: brez shranjene izbire CSS sledi prefers-contrast: more;
//    izrecna uporabničeva izbira (DA ali NE) vedno zmaga nad OS privzetkom;
//  - stikala so ≥44px vrstic (dotik) + keyboard dostopna (native Switch).
// ============================================================================

/** Naloži stanje iz localStorage (varno — korupcija pade na privzeto). */
function loadPrefs(): A11yPrefs {
  try {
    return parseA11yPrefs(localStorage.getItem(A11Y_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_A11Y_PREFS };
  }
}

/** Shrani stanje + SINHRONO posodobi razrede na <html> (ena pot za obe). */
function applyPrefs(prefs: A11yPrefs): void {
  try {
    localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // zasebni način / poln localStorage — razredi se vseeno posodobijo
  }
  const root = document.documentElement;
  root.classList.remove("contrast-high", "contrast-off", "reading-mode");
  for (const cls of a11yClasses(prefs)) root.classList.add(cls);
}

/**
 * Stanje + logika obeh stikal (delita jo dropdown v headerju in inline
 * sekcija v mobilnem Sheetu — POLISH 1.173.0 izvlečena, da ostajata po
 * definiciji enaki: isti localStorage ključ, isti <html> razredi,
 * ista bivalentna semantika kontrasta).
 */
function useA11ySwitchState() {
  const [prefs, setPrefs] = React.useState<A11yPrefs>(DEFAULT_A11Y_PREFS);
  // OS zahteva po kontrastu (samo za stanje stikala — CSS odloča barve)
  const [osContrast, setOsContrast] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    const stored = loadPrefs();
    setPrefs(stored);
    // sinhr. ob mountu: razredi na <html> morajo biti usklajeni s stanjem
    // (no-flash skript jih je naložil pred hidracijo — applyPrefs je ena pot)
    applyPrefs(stored);
    const mq = window.matchMedia("(prefers-contrast: more)");
    setOsContrast(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setOsContrast(e.matches);
    mq.addEventListener("change", onChange);
    setMounted(true);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  /**
   * Preklop kontrasta (bivalentno stikalo glede na DEJANSKO dejavno stanje):
   * ON → zapiše eksplicitni "on"; OFF → zapiše eksplicitni "off" (preglasi
   * tudi OS zahtevo prefers-contrast — izrecna človekova izbira zmaga).
   * Izklop nikoli ne vrne "sledi OS": uporabnik je videl OFF in pričakuje OFF.
   */
  function toggleContrast(next: boolean) {
    const nextPrefs: A11yPrefs = {
      ...prefs,
      contrast: next ? "on" : "off",
    };
    setPrefs(nextPrefs);
    applyPrefs(nextPrefs);
  }

  function toggleReading(next: boolean) {
    const nextPrefs: A11yPrefs = { ...prefs, reading: next };
    setPrefs(nextPrefs);
    applyPrefs(nextPrefs);
  }

  return {
    prefs,
    mounted,
    osContrast,
    highContrastActive: isHighContrastActive(prefs, osContrast),
    toggleContrast,
    toggleReading,
  };
}

/**
 * Oba stikala (visok kontrast + bralni način) — vizualni fragment, ki ga
 * delita dropdown vsebina (header) in inline sekcija (mobilni Sheet).
 * Samo predstavitev: stanje in preklopi pridejo iz useA11ySwitchState.
 */
function A11ySwitchList({
  state,
  idPrefix,
}: {
  state: ReturnType<typeof useA11ySwitchState>;
  /** Edinstvena pripona id-jev (header in Sheet sta hkrati montirana). */
  idPrefix: string;
}) {
  const t = useTranslations("a11y");
  const { prefs, mounted, highContrastActive, toggleContrast, toggleReading } =
    state;
  return (
    <>
      <label
        htmlFor={`${idPrefix}-contrast-switch`}
        className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2.5 outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
      >
        <Contrast className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-medium leading-none">{t("contrastLabel")}</span>
          <span className="mt-1 text-xs leading-snug text-muted-foreground">
            {t("contrastHint")}
          </span>
        </span>
        <Switch
          id={`${idPrefix}-contrast-switch`}
          checked={mounted ? highContrastActive : false}
          onCheckedChange={toggleContrast}
          // nedoločeno stanje pred mountom — ne lažmo o dejavnosti
          aria-label={t("contrastLabel")}
        />
      </label>
      <label
        htmlFor={`${idPrefix}-reading-switch`}
        className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2.5 outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
      >
        <BookOpenText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-medium leading-none">{t("readingLabel")}</span>
          <span className="mt-1 text-xs leading-snug text-muted-foreground">
            {t("readingHint")}
          </span>
        </span>
        <Switch
          id={`${idPrefix}-reading-switch`}
          checked={mounted ? prefs.reading : false}
          onCheckedChange={toggleReading}
          aria-label={t("readingLabel")}
        />
      </label>
    </>
  );
}

export function A11yControls({
  scrolled = false,
}: {
  /** Navigacijska lupina: nad herojem bela pisava, po odscrollu temna. */
  scrolled?: boolean;
}) {
  const t = useTranslations("a11y");
  const state = useA11ySwitchState();
  const { mounted } = state;

  const anyActive = state.highContrastActive || state.prefs.reading;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("menuAria")}
          className={cn(
            "relative",
            scrolled
              ? "text-foreground"
              : "text-white hover:bg-white/10 hover:text-white"
          )}
        >
          <Accessibility className="size-5" aria-hidden="true" />
          {/* aktivna točka — hitri vizualni namig, da je kak način dejaven */}
          {mounted && anyActive ? (
            <span
              className={cn(
                "absolute right-1 top-1 size-1.5 rounded-full",
                scrolled ? "bg-primary" : "bg-amber-300"
              )}
              aria-hidden="true"
            />
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="px-2 py-1.5">
          <p className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("menuTitle")}
          </p>
        </div>
        <A11ySwitchList state={state} idPrefix="a11y" />
        <p className="px-4 pb-2 pt-1 text-[11px] leading-snug text-muted-foreground">
          {t("osNote")}
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * A11ySheetSection — INLINE sekcija obeh stikal za MOBILNI Sheet meni
 * (POLISH 1.173.0).
 *
 * ZAKAJ INLINE IN NE DROPDOWN: vgnezden Radix dropdown v Sheetu (Dialog) je
 * bil v produkciji POKVARJEN — dropdown content portalira na document.body,
 * kar je IZVEN Sheet vsebine → Sheetov outside-interaction handler je zaprl
 * Sheet, preden se je dropdown odprl (klik = nič se ne zgodi; enako velja
 * za LanguageSwitcher). Stikali vsebujemo neposredno v telesu Sheet.
 *
 - Ista stanja/logika kot header dropdown (useA11ySwitchState — en vir
 * resnice): isti localStorage, isti <html> razredi, isti naslovi/namigi.
 */
export function A11ySheetSection() {
  const t = useTranslations("a11y");
  const state = useA11ySwitchState();

  return (
    <div className="space-y-1" role="group" aria-label={t("menuTitle")}>
      <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {t("menuTitle")}
      </p>
      <A11ySwitchList state={state} idPrefix="a11y-sheet" />
      <p className="px-2 text-[11px] leading-snug text-muted-foreground">
        {t("osNote")}
      </p>
    </div>
  );
}

export default A11yControls;
