import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";

// ============================================================================
// POLISH 1.174.0 — 2. RAZISKOVALNO-ANALITIČNI OBHOD (desktop + jeziki)
// ============================================================================
// Vir: produkcijski QA obhod #2 (3. 10. 2026, Render 1.173.4, desktop
// 1280×800 — 25 strani + IT/DE/FR/ES vzorčne točke + dialogi). Vsa ostala
// površina je bila ČISTA (0 preliva, 0 napak, 0 konzolnih errorjev, vse
// vsebine prevedene); EDINA sistemska vrzel:
//
//  ① UI PRIMITIVI so vsebovali HARDCODED angleške nize (sr-only "Close"
//     v dialog.tsx [~25 dialog komponent] in sheet.tsx [mobilni meni
//     »Več« — edina navigacijska pot mobilnim uporabnikom], "Previous/
//     Next slide" v carousel, "Toggle Sidebar" ×3 v sidebar [tudi
//     tooltip title, ki je uporabniku VIDEN], "Go to previous/next page"
//     + vidno "Previous"/"Next" v pagination, dead sr-only "More"/"More
//     pages" v aria-hidden elipsah breadcrumb/pagination). Bralnik
//     zaslona na SL/IT/DE/FR/ES strani je slišal angleščino — ista vrsta
//     jezikovne nekonzistence kot nav.languageAria (popravljena 1.173.0).
//
// Rešitev: en sam vir resnice UI_A11Y (a11y-strings.ts, 10 ključev ×
// 6 jezikov) + useLocale() v primitivih. TA datoteka zaklene kanon:
// "V src/components/ui NI hardcoded uporabniških nizov."
// ============================================================================

const root = "src";
const read = (p: string) => readFileSync(`${root}/${p}`, "utf-8");

const A11Y_SRC = read("components/ui/a11y-strings.ts");
const DIALOG_SRC = read("components/ui/dialog.tsx");
const SHEET_SRC = read("components/ui/sheet.tsx");
const CAROUSEL_SRC = read("components/ui/carousel.tsx");
const SIDEBAR_SRC = read("components/ui/sidebar.tsx");
const PAGINATION_SRC = read("components/ui/pagination.tsx");
const BREADCRUMB_SRC = read("components/ui/breadcrumb.tsx");

const UI_FILES = readdirSync(`${root}/components/ui`).filter((f) =>
  f.endsWith(".tsx")
);

/** Vsa uporabniška sr-only / aria besedila po celotni UI mapi. */
function hardcodedEnglishStringHits(src: string): string[] {
  const patterns = [
    /sr-only">[A-Za-z][^<]*</g, // sr-only z besedilom (ne izrazom)
    /aria-label="[A-Z][a-z]+ [a-z][^"]*"/g, // aria-label z angleškim stavkom
    /title="[A-Z][a-z]+ [A-Z][a-z][^"]*"/g, // title tooltip z angleškim stavkom
  ];
  return patterns.flatMap((re) => src.match(re) ?? []);
}

/** Odstrani komentarje — REGRESIJSKE varovalke preverjajo KODO,
 *  ne dokumentacijske komentarje (ti smejo omenjati stare nize).
 *  Blokovne {/* … *} + vrstične // (celotna vrstica, da se URL-ji v
 *  nizih ne odstranijo). */
function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/[^\n]*$/gm, "");
}

// ---------------------------------------------------------------------------
// ① SLOVAR UI_A11Y — 10 ključev × 6 jezikov, polni prevodi
// ---------------------------------------------------------------------------
describe("POLISH 1.174.0 ① UI_A11Y slovar: popolna jezikovna mreža", () => {
  const KEYS = [
    "close",
    "previousSlide",
    "nextSlide",
    "more",
    "morePages",
    "toggleSidebar",
    "previousPage",
    "nextPage",
    "previous",
    "next",
  ] as const;

  test("slovar obstaja z vsemi 10 ključi (izvožen UI_A11Y)", () => {
    expect(A11Y_SRC).toContain("export const UI_A11Y");
    for (const k of KEYS) {
      expect(A11Y_SRC).toContain(`${k}: {`);
    }
  });

  test("vsak ključ ima VSEH 6 jezikov (sl/en/it/de/fr/es) — noben manjka", () => {
    for (const k of KEYS) {
      const block = A11Y_SRC.split(`${k}: {`)[1]?.split("},")[0] ?? "";
      for (const lang of ["sl", "en", "it", "de", "fr", "es"]) {
        expect(block).toContain(`${lang}:`);
      }
    }
  });

  test("noben niz v slovarju ni prazen (izpust bi bralnik slišal kot tišino)", () => {
    const emptyStrings = A11Y_SRC.match(/: ""/g) ?? [];
    expect(emptyStrings.length).toBe(0);
  });

  test("slovarjevi ključi so usklajeni z routing.locales (kanon src/i18n/routing.ts)", () => {
    const routing = read("i18n/routing.ts");
    expect(routing).toContain('locales: ["sl", "en", "it", "de", "fr", "es"]');
  });
});

// ---------------------------------------------------------------------------
// ② uiA11yText — fallback neznanega locvida na SL (isti kanon kot
//    pickWishlistLang: neznan → default, nikoli izjema)
// ---------------------------------------------------------------------------
describe("POLISH 1.174.0 ② uiA11yText resolve logika", () => {
  test("funktionalni kanon: neznan locale → SL fallback (ne crash)", () => {
    expect(A11Y_SRC).toContain(
      'UI_A11Y_LANGS.includes(locale as UiA11yLang)'
    );
    expect(A11Y_SRC).toContain(': "sl"');
  });

  test("funktionalni kanon: pot podpira undefined locale", () => {
    expect(A11Y_SRC).toContain(
      "locale: string | undefined"
    );
  });
});

// ---------------------------------------------------------------------------
// ③ DIALOG — ~25 komponent (vsaka stran z modalom); prej "Close"
// ---------------------------------------------------------------------------
describe("POLISH 1.174.0 ③ dialog.tsx: X gumb lokaliziran", () => {
  test("DialogContent kliče useLocale + uiA11yText(\"close\")", () => {
    expect(DIALOG_SRC).toContain("useLocale");
    expect(DIALOG_SRC).toContain('uiA11yText("close", locale)');
  });

  test("closeLabel prop: izjema za klicatelje z lastnim besedilom (?? veriga)", () => {
    expect(DIALOG_SRC).toContain("closeLabel?: string");
    expect(DIALOG_SRC).toContain(
      '{closeLabel ?? uiA11yText("close", locale)}'
    );
  });

  test("REGRESIJSKA VAROVALKA: ni več hardcoded sr-only »Close«", () => {
    expect(DIALOG_SRC).not.toContain('sr-only">Close<');
  });
});

// ---------------------------------------------------------------------------
// ④ SHEET — mobilni meni »Več«; prej "Close"
// ---------------------------------------------------------------------------
describe("POLISH 1.174.0 ④ sheet.tsx: X gumb lokaliziran", () => {
  test("SheetContent kliče useLocale + uiA11yText(\"close\") + closeLabel prop", () => {
    expect(SHEET_SRC).toContain("useLocale");
    expect(SHEET_SRC).toContain('uiA11yText("close", locale)');
    expect(SHEET_SRC).toContain("closeLabel?: string");
    expect(SHEET_SRC).toContain(
      '{closeLabel ?? uiA11yText("close", locale)}'
    );
  });

  test("REGRESIJSKA VAROVALKA: ni več hardcoded sr-only »Close«", () => {
    expect(SHEET_SRC).not.toContain('sr-only">Close<');
  });
});

// ---------------------------------------------------------------------------
// ⑤ CAROUSEL — prej "Previous slide"/"Next slide"
// ---------------------------------------------------------------------------
describe("POLISH 1.174.0 ⑤ carousel.tsx: puščici lokalizirani", () => {
  test("CarouselPrevious/Next uporabljata useLocale + uiA11yText", () => {
    expect(CAROUSEL_SRC).toContain("useLocale");
    expect(CAROUSEL_SRC).toContain(
      'uiA11yText("previousSlide", locale)'
    );
    expect(CAROUSEL_SRC).toContain('uiA11yText("nextSlide", locale)');
  });

  test("REGRESIJSKA VAROVALKA: ni več »Previous slide«/»Next slide«", () => {
    const code = stripComments(CAROUSEL_SRC);
    expect(code).not.toContain("Previous slide");
    expect(code).not.toContain("Next slide");
  });
});

// ---------------------------------------------------------------------------
// ⑥ SIDEBAR — prej "Toggle Sidebar" ×3 (sr-only + aria-label + VIDEN tooltip)
// ---------------------------------------------------------------------------
describe("POLISH 1.174.0 ⑥ sidebar.tsx: preklop lokaliziran (tudi tooltip)", () => {
  test("SidebarTrigger (sr-only) in SidebarRail (aria-label + title) lokalizirana", () => {
    expect(SIDEBAR_SRC).toContain("useLocale");
    expect(SIDEBAR_SRC).toContain(
      'uiA11yText("toggleSidebar", locale)'
    );
    expect(SIDEBAR_SRC).toContain("aria-label={sidebarLabel}");
    expect(SIDEBAR_SRC).toContain("title={sidebarLabel}");
  });

  test("REGRESIJSKA VAROVALKA: ni več hardcoded »Toggle Sidebar«", () => {
    expect(SIDEBAR_SRC).not.toContain('"Toggle Sidebar"');
  });
});

// ---------------------------------------------------------------------------
// ⑦ PAGINATION — prej "Go to previous/next page" (aria) + vidno "Previous"/"Next"
// ---------------------------------------------------------------------------
describe("POLISH 1.174.0 ⑦ pagination.tsx: listalka lokalizirana (aria + vidno)", () => {
  test("PaginationPrevious/Next: 4 ključi slovarja v uporabi", () => {
    expect(PAGINATION_SRC).toContain("useLocale");
    expect(PAGINATION_SRC).toContain(
      'uiA11yText("previousPage", locale)'
    );
    expect(PAGINATION_SRC).toContain('uiA11yText("nextPage", locale)');
    expect(PAGINATION_SRC).toContain('uiA11yText("previous", locale)');
    expect(PAGINATION_SRC).toContain('uiA11yText("next", locale)');
  });

  test("REGRESIJSKA VAROVALKA: ni več hardcoded angleških listalk", () => {
    expect(PAGINATION_SRC).not.toContain('"Go to previous page"');
    expect(PAGINATION_SRC).not.toContain('"Go to next page"');
    expect(PAGINATION_SRC).not.toContain(">Previous<");
    expect(PAGINATION_SRC).not.toContain(">Next<");
  });
});

// ---------------------------------------------------------------------------
// ⑧ DEAD CODE — aria-hidden elipsi sta izgubili zavajajoči sr-only otrok
// (bralnik ju nikoli ni objavil; s src bi bil NAPAČNO angleški, če bi bil)
// ---------------------------------------------------------------------------
describe("POLISH 1.174.0 ⑧ breadcrumb/pagination elipsi: dead sr-only odstranjen", () => {
  test("BreadcrumbEllipsis nima več sr-only otroka (aria-hidden = dekorativno)", () => {
    const block = stripComments(
      BREADCRUMB_SRC.split("BreadcrumbEllipsis")[1]?.split("function")[0] ?? ""
    );
    expect(block).toContain('aria-hidden="true"');
    expect(block).not.toContain("sr-only");
  });

  test("PaginationEllipsis nima več sr-only otroka", () => {
    const block = stripComments(
      PAGINATION_SRC.split("PaginationEllipsis")[1]?.split("function")[0] ?? ""
    );
    expect(block).toContain("aria-hidden");
    expect(block).not.toContain("sr-only");
  });
});

// ---------------------------------------------------------------------------
// ⑨ SPLOŠNA VAROVALKA — TRAJEN KANON: v celotni UI mapi NI hardcoded
// angleških uporabniških nizov (vsak nov primitiv mora iti prek UI_A11Y).
// Preveri VSE .tsx datoteke v src/components/ui (tudi prihodnje dodane).
// ---------------------------------------------------------------------------
describe("POLISH 1.174.0 ⑨ TRAJNA VAROVALKA: UI mapa brez hardcoded nizov", () => {
  test("noben .tsx v src/components/ui ne vsebuje hardcoded angleških sr-only/aria/title nizov", () => {
    const offenders: string[] = [];
    for (const f of UI_FILES) {
      const hits = hardcodedEnglishStringHits(
        read(`components/ui/${f}`)
      );
      for (const h of hits) offenders.push(`${f}: ${h}`);
    }
    // Vzorci ciljajo večbesedne angleške stavke (sr-only besedilo,
    // aria-label/title s pisanimi stavki) — enobesedni tehnični
    // identifikatorji (npr. role="navigation" ali data-* atributi) niso
    // uporabniško slišno besedilo in vzorca ne ujameta.
    expect(offenders).toEqual([]);
  });
});
