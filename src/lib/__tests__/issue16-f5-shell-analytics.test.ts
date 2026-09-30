// ============================================================================
// ISSUE #16 FAZA 5 — ANALITIKA LUPINE + STICKYMOBILECTA DOLG (1.152.0)
// ============================================================================
//
// Zadnja faza načrta #16 (ONE JOURNEY, ONE HOME, ZERO FEATURE LOSS):
//
// 1. ANALITIKA LUPINE: nov dogodek `shell_nav_clicked` meri, ali je preoblikovana
//    IA F1–F4 (lupina ODKRIJ | ZEMLJEVID | MOJA POT | POJDI | VEČ + Več
//    progressive disclosure) DEJANSKO v uporabi — brez tega je preoblikovanje
//    nemerljivo (issue §„Kako vemo, da deluje?"). Površine: tabbar (mobilna
//    vrstica), header (desktop povezave + sprožilec Več), dropdown (desktop
//    Več vnosi ravni-2), sheet (mobilni Več meni). Props: tab, surface,
//    items (samo my_trip — velikost zbirke ob kliku), label (samo sheet/
//    dropdown — href vnosa ravni-2, stabilen across locale).
// 2. STICKYMOBILECTA DOLG: komponenta je imela 0 uporabnikov od D8-F (D8-B
//    §6.2 jo je upokojenil na domači strani) — faza 5 dolg IZBRIŠE komponento
//    in njena data-sticky-cta CSS pravila (vec testov v task8-e preverja
//    detajle; tu varovalke celote).
//
// Source-contract (readFileSync) — brez uvozov @/app → brez TASK 76
// obveznosti (kanon Task 28/33/34/35).
// ============================================================================
import { describe, expect, test } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const ANALYTICS_SRC = read("src/lib/planner-analytics.ts");
const ROUTE_SRC = read("src/app/api/analytics/event/route.ts");
const ANALYTICS_DOC = read("docs/ANALYTICS-EVENTS.md");
const TABBAR_SRC = read("src/components/mobile-tab-bar.tsx");
const NAV_SRC = read("src/components/sections/navigation.tsx");
const GLOBALS_SRC = read("src/app/globals.css");

/** Koda brez komentarjev — literalni testi ne pastijo zaradi pojasnil (kanon task32). */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

// ─────────────────────────────────────────────────────────────────────────
// 1. DOGODEK shell_nav_clicked — union + strežniška whitelist + dokumentacija
//    (W3 past: klient union ⊆ strežniška VALID_EVENTS — 0 tihih 400)
// ─────────────────────────────────────────────────────────────────────────
describe("ISSUE #16 F5: dogodek shell_nav_clicked (analitika lupine)", () => {
  test("v klientnem PlannerEventName union-u", () => {
    const code = stripComments(ANALYTICS_SRC);
    expect(code).toContain('| "shell_nav_clicked"');
  });

  test("v strežniški VALID_EVENTS whitelisti (pariteta — 0 tihih 400)", () => {
    const code = stripComments(ROUTE_SRC);
    expect(code).toContain('"shell_nav_clicked"');
  });

  test("dokumentiran v docs/ANALYTICS-EVENTS.md (zlati kanon dokumentacije)", () => {
    expect(ANALYTICS_DOC).toContain("`shell_nav_clicked` (1.152.0, Issue #16 F5)");
    expect(ANALYTICS_DOC).toContain("analitika lupine");
    // props dokumentirani (tab/surface/items/label)
    expect(ANALYTICS_DOC).toMatch(/shell_nav_clicked[\s\S]*?`tab`/);
    expect(ANALYTICS_DOC).toMatch(/shell_nav_clicked[\s\S]*?`surface`/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. MOBILE TAB BAR — vseh 5 zavihkov sledi {tab, surface: "tabbar"}
// ─────────────────────────────────────────────────────────────────────────
describe("ISSUE #16 F5: MobileTabBar — sledenje klikov zavihkov", () => {
  test("uvozi trackPlannerEvent iz planner-analytics", () => {
    expect(TABBAR_SRC).toContain('from "@/lib/planner-analytics"');
  });

  test("TAB_EVENT preslikava pokriva vseh 5 zavihkov (myTrip → my_trip)", () => {
    const code = stripComments(TABBAR_SRC);
    expect(code).toContain("const TAB_EVENT");
    expect(code).toContain("myTrip: \"my_trip\"");
    expect(code).toContain("explore: \"explore\"");
    expect(code).toContain("map: \"map\"");
    expect(code).toContain("go: \"go\"");
    expect(code).toContain("more: \"more\"");
  });

  test("trackTab izstreli shell_nav_clicked s surface \"tabbar\"", () => {
    const code = stripComments(TABBAR_SRC);
    expect(code).toContain('trackPlannerEvent(');
    expect(code).toContain('"shell_nav_clicked"');
    expect(code).toContain('surface: "tabbar"');
  });

  test("my_trip klik nosi items (velikost zbirke — meri „zbirka → hub“ prehode)", () => {
    const code = stripComments(TABBAR_SRC);
    expect(code).toMatch(/labelKey === "myTrip"[\s\S]{0,200}items: count/);
  });

  test("vsak zavihek Link ima onClick sledenje (center + običajni)", () => {
    const code = stripComments(TABBAR_SRC);
    const onClicks = code.match(/onClick=\{\(\) => trackTab\(/g) ?? [];
    expect(onClicks.length).toBeGreaterThanOrEqual(2);
  });

  test("gumb Več sledi IN odpre meni (trackTab + onMore v istem handlerju)", () => {
    const code = stripComments(TABBAR_SRC);
    expect(code).toMatch(/trackTab\("more"\);[\s\S]{0,80}onMore\(\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. NAVIGATION — header (desktop) + dropdown (Več ravni-2) + sheet (mobilni Več)
// ─────────────────────────────────────────────────────────────────────────
describe("ISSUE #16 F5: Navigation — sledenje vseh površin lupine", () => {
  test("uvozi trackPlannerEvent", () => {
    expect(NAV_SRC).toContain('from "@/lib/planner-analytics"');
  });

  test("trackShellNav helper pokriva površine header/dropdown/sheet", () => {
    const code = stripComments(NAV_SRC);
    expect(code).toContain("trackShellNav");
    expect(code).toContain('"header"');
    expect(code).toContain('"dropdown"');
    expect(code).toContain('"sheet"');
  });

  test("navLinks nosijo analitski tab (preslikava 4 primarnih vstopov)", () => {
    const code = stripComments(NAV_SRC);
    expect(code).toContain('tab: "explore"');
    expect(code).toContain('tab: "my_trip"');
    expect(code).toContain('tab: "map"');
    expect(code).toContain('tab: "go"');
  });

  test("desktop header povezave sledijo {tab, surface: \"header\"}", () => {
    const code = stripComments(NAV_SRC);
    expect(code).toContain('trackShellNav(link.tab, "header")');
  });

  test("desktop sprožilec Več sledi {tab: more, surface: \"header\"}", () => {
    const code = stripComments(NAV_SRC);
    expect(code).toContain('trackShellNav("more", "header")');
  });

  test("desktop dropdown vnosi ravni-2 nosijo label (href — stabilen across locale)", () => {
    const code = stripComments(NAV_SRC);
    const dropdownClicks = code.match(
      /trackShellNav\("more", "dropdown", link\.href\)/g
    ) ?? [];
    // 3 skupine v dropdownu (Odkrij več / Načrtuj in orodja / Račun)
    expect(dropdownClicks.length).toBe(3);
  });

  test("sheet primarne povezave nosijo svoj tab, ravni-2 vnosi tab more + label", () => {
    const code = stripComments(NAV_SRC);
    expect(code).toContain('trackShellNav(link.tab, "sheet")');
    const sheetClicks = code.match(
      /trackShellNav\("more", "sheet", link\.href\)/g
    ) ?? [];
    // 3 skupine ravni-2 v sheetu (Odkrij več / orodja / Račun) — primarne
    // gredo prek link.tab, ne skozi "more"
    expect(sheetClicks.length).toBe(3);
  });

  test("MobileTabBar ostaja montiran z onMore (sheet odpiranje iz zavihka Več)", () => {
    const code = stripComments(NAV_SRC);
    expect(code).toContain("<MobileTabBar onMore=");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. STICKYMOBILECTA DOLG — izbris (0 uporabnikov → 0 mrtve kode)
// ─────────────────────────────────────────────────────────────────────────
describe("ISSUE #16 F5: StickyMobileCTA dolg poravnan (izbris)", () => {
  test("komponenta IZBRISANA iz repa", () => {
    expect(existsSync(join(ROOT, "src/components/sticky-mobile-cta.tsx"))).toBe(false);
  });

  test("data-sticky-cta CSS pravila ODSTRANJENA iz globals.css", () => {
    expect(GLOBALS_SRC).not.toContain('body[data-sticky-cta="true"]');
    // dvig nad tab vrstico ostaja (F1 lupina)
    expect(GLOBALS_SRC).toContain('body[data-mobile-tabbar="true"] .dsa-chat-fab');
  });

  test("noben vir ne uvaža več sticky-mobile-cta (0 uvozov v repu)", () => {
    expect(stripComments(TABBAR_SRC)).not.toContain("sticky-mobile-cta");
    expect(stripComments(NAV_SRC)).not.toContain("sticky-mobile-cta");
  });
});
