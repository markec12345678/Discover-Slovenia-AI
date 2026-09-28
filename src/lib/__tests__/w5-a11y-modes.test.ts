import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import slMessages from "@/i18n/messages/sl.json";
import enMessages from "@/i18n/messages/en.json";
import itMessages from "@/i18n/messages/it.json";
import deMessages from "@/i18n/messages/de.json";
import {
  a11yClasses,
  A11Y_STORAGE_KEY,
  DEFAULT_A11Y_PREFS,
  isHighContrastActive,
  parseA11yPrefs,
} from "@/lib/a11y-mode";

/**
 * W5 (Issue #15, 1.135.0): VISOK KONTRAST + BRALNI NAČIN.
 *
 * Verifikacijska merila iz benchmarka (docs/UX-WORKFLOW-BENCHMARK-2026-09-27.md §3 W5):
 *  (1) visok kontrast (CSS variante) + reading mode (tipografska povečava)
 *      v obstoječi ThemeToggle sosednji → SOURCE CONTRACT: Navigation
 *      izrisuje A11yControls ob preklopu teme (desktop + mobilni meni);
 *      globals.css ima .contrast-high paleto za svetlo IN temno + bralni
 *      način font-size korak.
 *  (2) varovalo: respects prefers-contrast → SOURCE CONTRACT:
 *      @media (prefers-contrast: more) blok z :not(.contrast-off) varovalom
 *      (izrecna uporabničeva izbira OBEM OS zahtevo).
 *  (3) stanje preživi osvežitve → localStorage ključ dsa-a11y + no-flash
 *      skript v layout head (isti ključ).
 *  (4) dark mode / reduced-motion / ARIA obstoječi ostanejo → grep
 *      obstoječih varoval ne sme biti izbrisanih.
 */

// __tests/ → src/lib/__tests/; koren projekta je TRI ravni višje
const ROOT = new URL("../../../", import.meta.url);
const read = (p: string) =>
  readFileSync(new URL(p, ROOT), "utf-8") as string;

const CSS_SRC = read("src/app/globals.css");
const NAV_SRC = read("src/components/sections/navigation.tsx");
const CONTROLS_SRC = read("src/components/a11y-controls.tsx");
const LAYOUT_SRC = read("src/app/layout.tsx");

// ---------------------------------------------------------------------------
// 1. a11y-mode.ts — čista logika stanja (parse/resolve/razredi)
// ---------------------------------------------------------------------------

describe("W5: a11y-mode.ts — stanje (parse, razredi, resolucija)", () => {
  test("ključ localStorage je dsa-a11y (isti vir kot no-flash skript v layoutu)", () => {
    expect(A11Y_STORAGE_KEY).toBe("dsa-a11y");
    expect(LAYOUT_SRC).toContain('localStorage.getItem("dsa-a11y")');
  });

  test("privzeto stanje: brez shranjenega = sledi OS (null), branje izklopljeno", () => {
    expect(DEFAULT_A11Y_PREFS).toEqual({ contrast: null, reading: false });
    expect(parseA11yPrefs(null)).toEqual(DEFAULT_A11Y_PREFS);
    expect(parseA11yPrefs("")).toEqual(DEFAULT_A11Y_PREFS);
  });

  test("varen parse: korupcija/tuje ključi/napačne vrednosti padejo na privzeto", () => {
    expect(parseA11yPrefs("not json {")).toEqual(DEFAULT_A11Y_PREFS);
    expect(parseA11yPrefs('"string"')).toEqual(DEFAULT_A11Y_PREFS);
    expect(parseA11yPrefs("null")).toEqual(DEFAULT_A11Y_PREFS);
    expect(parseA11yPrefs('{"contrast":"maybe","reading":"yes"}')).toEqual(
      DEFAULT_A11Y_PREFS
    );
    expect(parseA11yPrefs('{"contrast":123,"reading":1}')).toEqual(
      DEFAULT_A11Y_PREFS
    );
  });

  test("veljavne izbire se preberejo: on/off/null + reading boolean", () => {
    expect(parseA11yPrefs('{"contrast":"on","reading":true}')).toEqual({
      contrast: "on",
      reading: true,
    });
    expect(parseA11yPrefs('{"contrast":"off","reading":false}')).toEqual({
      contrast: "off",
      reading: false,
    });
    // reading samo po sebi je veljavno (kontrast sledi OS)
    expect(parseA11yPrefs('{"reading":true}')).toEqual({
      contrast: null,
      reading: true,
    });
  });

  test("a11yClasses: razredi na <html> so točno preslikava stanja", () => {
    expect(a11yClasses({ contrast: null, reading: false })).toEqual([]);
    expect(a11yClasses({ contrast: "on", reading: false })).toEqual([
      "contrast-high",
    ]);
    expect(a11yClasses({ contrast: "off", reading: false })).toEqual([
      "contrast-off",
    ]);
    expect(a11yClasses({ contrast: "on", reading: true })).toEqual([
      "contrast-high",
      "reading-mode",
    ]);
    expect(a11yClasses({ contrast: null, reading: true })).toEqual([
      "reading-mode",
    ]);
  });

  test("isHighContrastActive: eksplicitna izbira zmaga nad OS; null sledi OS", () => {
    // eksplicitni ON zmaga vedno
    expect(isHighContrastActive({ contrast: "on", reading: false }, false)).toBe(true);
    expect(isHighContrastActive({ contrast: "on", reading: false }, true)).toBe(true);
    // eksplicitni OFF preglasi OS zahtevo (varovalo človeške izbire)
    expect(isHighContrastActive({ contrast: "off", reading: false }, true)).toBe(false);
    // null = sledi OS
    expect(isHighContrastActive({ contrast: null, reading: false }, true)).toBe(true);
    expect(isHighContrastActive({ contrast: null, reading: false }, false)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. globals.css — palete + varovala (source contract)
// ---------------------------------------------------------------------------

describe("W5: globals.css — visok kontrast + bralni način (source contract)", () => {
  test("eksplicitna .contrast-high paleta OBSTAJA za svetlo in temno (ključne spremenljivke)", () => {
    expect(CSS_SRC).toContain(":root.contrast-high {");
    expect(CSS_SRC).toContain("html.dark.contrast-high {");
    // svetel: meje močno vidne, utišano besedilo MUCH temnejše
    const lightBlock = CSS_SRC.slice(
      CSS_SRC.indexOf(":root.contrast-high {"),
      CSS_SRC.indexOf("html.dark.contrast-high {")
    );
    expect(lightBlock).toContain("--border: oklch(0.55 0.01 145)");
    expect(lightBlock).toContain("--muted-foreground: oklch(0.28 0.01 150)");
    // temen: čisto črno/belo + močne meje
    const darkBlock = CSS_SRC.slice(
      CSS_SRC.indexOf("html.dark.contrast-high {"),
      CSS_SRC.indexOf("html.reading-mode {")
    );
    expect(darkBlock).toContain("--background: oklch(0.1 0 0)");
    expect(darkBlock).toContain("--foreground: oklch(1 0 0)");
    expect(darkBlock).toContain("--border: oklch(1 0 0 / 55%)");
  });

  test("VAROVALO: OS zahteva prefers-contrast: more se spoštuje Z :not(.contrast-off) izjemo", () => {
    expect(CSS_SRC).toContain("@media (prefers-contrast: more) {");
    expect(CSS_SRC).toContain(":root:not(.contrast-off) {");
    expect(CSS_SRC).toContain("html.dark:not(.contrast-off) {");
    // .contrast-off sam NI paleta — samo varovalo proti OS (izrecni NE)
    const offIdx = CSS_SRC.indexOf(".contrast-off {");
    expect(offIdx).toBe(-1);
  });

  test("bralni način: tipografska povečava (font-size korak + vrstični presledki)", () => {
    expect(CSS_SRC).toContain("html.reading-mode {");
    expect(CSS_SRC).toMatch(/html\.reading-mode\s*\{\s*font-size:\s*112\.5%/);
    expect(CSS_SRC).toContain("html.reading-mode p,");
    expect(CSS_SRC).toContain("line-height: 1.7");
  });

  test("VAROVALO: obstoječa infrastruktura ostaja (dark/reduced-motion/scrollbar)", () => {
    // dark mode paleta nespremenjena
    expect(CSS_SRC).toContain(".dark {");
    // reduced-motion varovali (vsaj dve)
    const reduced = CSS_SRC.match(/@media \(prefers-reduced-motion: reduce\)/g);
    expect(reduced?.length ?? 0).toBeGreaterThanOrEqual(2);
    // prilagojena scrollbar ostaja
    expect(CSS_SRC).toContain(".scroll-area-custom::-webkit-scrollbar");
  });
});

// ---------------------------------------------------------------------------
// 3. A11yControls + Navigation (source contract)
// ---------------------------------------------------------------------------

describe("W5: A11yControls + Navigation — UI vstopne točke (source contract)", () => {
  test("kontrola ima DVA stikala (kontrast + branje) z Switch komponento shadcn", () => {
    expect(CONTROLS_SRC).toContain("<Switch");
    expect(CONTROLS_SRC).toContain('id="a11y-contrast-switch"');
    expect(CONTROLS_SRC).toContain('id="a11y-reading-switch"');
    expect(CONTROLS_SRC).toContain("toggleContrast");
    expect(CONTROLS_SRC).toContain("toggleReading");
  });

  test("ena pot za stanje: applyPrefs piše localStorage IN razrede na <html> (ne dvojnika)", () => {
    expect(CONTROLS_SRC).toContain("localStorage.setItem(A11Y_STORAGE_KEY");
    expect(CONTROLS_SRC).toContain("document.documentElement");
    expect(CONTROLS_SRC).toContain("a11yClasses(prefs)");
  });

  test("nizovje iz a11y slovarja (useTranslations) — 4 jeziki, 7 ključev", () => {
    expect(CONTROLS_SRC).toContain('useTranslations("a11y")');
    for (const key of [
      "menuAria",
      "menuTitle",
      "contrastLabel",
      "contrastHint",
      "readingLabel",
      "readingHint",
      "osNote",
    ]) {
      expect(CONTROLS_SRC).toContain(`t("${key}")`);
    }
  });

  test("Navigation izrisuje A11yControls ob preklopu teme: desktop + mobilni meni", () => {
    expect(NAV_SRC).toContain('<A11yControls scrolled={glass} />');
    expect(NAV_SRC).toContain("<A11yControls scrolled />");
    // obstoječi preklop teme ostaja (sosed, ne nadomestilo)
    expect(NAV_SRC).toContain("toggleTheme");
  });

  test("VAROVALO: hydration varno — stanje stikal se izrisuje šele po mountu", () => {
    // stikala pred mountom NE lažejo o dejavnosti (checked=false)
    expect(CONTROLS_SRC).toContain("mounted ? highContrastActive : false");
    expect(CONTROLS_SRC).toContain("mounted ? prefs.reading : false");
  });
});

// ---------------------------------------------------------------------------
// 4. i18n: a11y slovar × 4 jeziki
// ---------------------------------------------------------------------------

describe("W5: a11y slovar — 7 ključev × 4 jeziki", () => {
  const LOCALES: Record<string, typeof slMessages> = {
    sl: slMessages,
    en: enMessages,
    it: itMessages,
    de: deMessages,
  };

  for (const [loc, messages] of Object.entries(LOCALES)) {
    test(`${loc}: vsi ključi a11y neprazni`, () => {
      const a11y = (messages as Record<string, unknown>).a11y as Record<
        string,
        string
      >;
      expect(a11y).toBeDefined();
      for (const key of [
        "menuAria",
        "menuTitle",
        "contrastLabel",
        "contrastHint",
        "readingLabel",
        "readingHint",
        "osNote",
      ]) {
        expect(a11y[key]?.trim().length, `${loc}/a11y.${key}`).toBeGreaterThan(
          0
        );
      }
    });
  }
});
