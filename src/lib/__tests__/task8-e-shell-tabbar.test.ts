// ============================================================================
// TASK 8 / D8-E (issue #8 §52 — Discovery UX 2.0) · preoblikovano v ISSUE #16
// (UX/IA KONSOLIDACIJA — ONE JOURNEY, ONE HOME, ZERO FEATURE LOSS) fazi 1 ·
// source-contract
// ----------------------------------------------------------------------------
// Pokriva (issue #16 §Navigacijska arhitektura — mentalni model
// ODKRIJ → DODAJ → MOJA POT → NAČRTUJ → POJDI):
//  1. MobileTabBar (src/components/mobile-tab-bar.tsx): 5 zavihkov <lg
//     (Odkrij / Zemljevid / Moja pot SREDINSKI s števčno značko / Pojdi /
//     Več → obstoječi Sheet meni), body[data-mobile-tabbar] dvig chat FAB.
//     POJDI (/na-poti) ima ZDAJ lastni zavihek (prej pokopan pod Več —
//     največja IA vrzel audita #16); NAČRTUJ zapusti vrstico (korak živi v
//     kontekstu Moja pot: /nacrtuj + /potovanje osvetlita MOJA POT).
//  2. Desktop navigacija: Odkrij · Moja pot · Zemljevid · Pojdi + "Več"
//     dropdown (progressive disclosure — skupine Odkrij več / Načrtuj in
//     orodja / Račun).
//  3. Mobilni Sheet: 15 povezav (4 primarne + 6 Odkrij več + 3 orodja +
//     Prijava + za ponudnike + CTA) — ZERO LOSS (vseh 13 prejšnjih ciljev
//     + 2 novi: Primerjava, Prijava — prej samo noga).
//  4. Lupina (Navigation solid + Footer) na 19 prej sirotih straneh
//     (D8-A §2.4 jih šteje 17 + /moja-potovanja + /pot/[shareId] po nalogi
//     D8-E); StickyMobileCTA upokojen na straneh z lupino in (ISSUE #16 F5)
//     POPOLNOMA izbrisan iz repa (0 uporabnikov po umiku domače strani D8-F).
// Source-contract (readFileSync) — brez uvozov @/app → brez TASK 76
// obveznosti (kanon Task 28/33/34/35).
// ============================================================================
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const tabbarSrc = read("src/components/mobile-tab-bar.tsx");
const navSrc = read("src/components/sections/navigation.tsx");
const footerSrc = read("src/components/sections/footer.tsx");
const globalsSrc = read("src/app/globals.css");

/** 19 prej sirotih strani (D8-A §1/§2.4 + nalogа D8-E). */
const SHELL_PAGES: string[] = [
  "src/app/destinacija/[slug]/page.tsx",
  "src/app/destinacija/[slug]/things-to-do/page.tsx",
  "src/app/destinacija/[slug]/guide/[type]/page.tsx",
  "src/app/destinacija/[slug]/itinerary/[duration]/page.tsx",
  "src/app/destinacija/[slug]/best-time-to-visit/[season]/page.tsx",
  // D7 (1.140.0): lupina /pot seje živi v skupnem SharedTripScreen (page.tsx
  // je tanka ovojnica) — list sledi lokaciji lupine.
  "src/app/pot/shared-trip-screen.tsx",
  "src/app/moja-potovanja/page.tsx",
  "src/app/primerjava/page.tsx",
  "src/app/konzultacija/[token]/page.tsx",
  "src/app/prijava/page.tsx",
  "src/app/preverba-emaila/page.tsx",
  "src/app/reset-gesla/page.tsx",
  "src/app/pozabljeno-geslo/page.tsx",
  "src/app/o-strani/page.tsx",
  "src/app/kontakt/page.tsx",
  "src/app/vir-podatkov/page.tsx",
  "src/app/zaupanje-in-varnost/page.tsx",
  "src/app/pogoji-uporabe/page.tsx",
  "src/app/politika-zasebnosti/page.tsx",
];

/** Strani, kjer je bil StickyMobileCTA upokojen (umik zaključen z izbrisom F5). */
const RETIRED_CTA_PAGES: string[] = [
  "src/app/slovenia-pass/page.tsx",
  "src/app/lokali/page.tsx",
  "src/app/potovanje/page.tsx",
  "src/app/trznica/page.tsx",
  "src/app/na-poti/page.tsx",
  "src/app/dogodki/page.tsx",
  "src/app/nacrtuj/page.tsx",
  "src/app/vodici/page.tsx",
  "src/app/vodici/[slug]/page.tsx",
  "src/app/destinacije/page.tsx",
  "src/app/dozivetja/page.tsx",
  "src/app/zemljevid/page.tsx",
];

/** Koda brez komentarjev — literalni testi ne smejo pasti zaradi pojasnil (kanon task32). */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

// ─────────────────────────────────────────────────────────────────────────
// 1. MOBILE TAB BAR — vir, zavihki, značka, onMore, dostopnost
// ─────────────────────────────────────────────────────────────────────────
describe("ISSUE #16 faza 1: MobileTabBar — ODKRIJ | ZEMLJEVID | MOJA POT | POJDI | VEČ", () => {
  test("datoteka obstaja in je klientna komponenta", () => {
    expect(tabbarSrc.startsWith('"use client";')).toBe(true);
    expect(tabbarSrc).toContain("export function MobileTabBar");
  });

  test("5 zavihkov po modelu #16: oznake (SL+EN) + povezave", () => {
    // SL oznake (issue #16 §Navigacijska arhitektura — Mobile)
    for (const label of ["Odkrij", "Zemljevid", "Moja pot", "Pojdi", "Več"]) {
      expect(tabbarSrc).toContain(`"${label}"`);
    }
    // EN oznake (isti komponent, L vzorec)
    for (const label of ["Discover", "Map", "My trip", "Go", "More"]) {
      expect(tabbarSrc).toContain(`"${label}"`);
    }
    // hrefs — POJDI zdaj lastni zavihek, NAČRTUJ zapušča vrstico
    expect(tabbarSrc).toContain('href: "/destinacije"');
    expect(tabbarSrc).toContain('href: "/zemljevid"');
    expect(tabbarSrc).toContain('href: "/moja-potovanja"');
    expect(tabbarSrc).toContain('href: "/na-poti"');
    expect(tabbarSrc).not.toContain('href: "/nacrtuj"');
  });

  test("aktivacijska logika #16: /destinacija/* → Odkrij; /nacrtuj + /potovanje → Moja pot (korak NAČRTUJ); /na-poti → Pojdi", () => {
    expect(tabbarSrc).toContain('p === "/destinacije" || p.startsWith("/destinacija")');
    // Moja pot = hub + korak NAČRTUJ (issue #16: načrtovanje je del poti)
    expect(tabbarSrc).toContain('p === "/moja-potovanja"');
    expect(tabbarSrc).toContain('p === "/nacrtuj"');
    expect(tabbarSrc).toContain('p.startsWith("/potovanje")');
    // POJDI lastni zavihek
    expect(tabbarSrc).toContain('p === "/na-poti" || p.startsWith("/na-poti/")');
    // Več kot sidro za Sheet poti (/na-poti ODSTRANJEN iz seznama)
    expect(tabbarSrc).toContain("MORE_MENU_ROUTES.some");
    expect(tabbarSrc).toContain('"/primerjava"');
    expect(tabbarSrc).toContain('"/prijava"');
    expect(tabbarSrc).toContain('"/dozivetja"');
    expect(tabbarSrc).toContain('"/vodici"');
  });

  test("števčna značka iz zbirke Moja pot (useMyTrip count) — na SREDINSKEM kroglici", () => {
    expect(tabbarSrc).toContain('from "@/hooks/use-my-trip"');
    expect(tabbarSrc).toContain("useMyTrip()");
    expect(tabbarSrc).toContain("{ count }");
    expect(tabbarSrc).toContain("count > 99");
  });

  test("onMore prop odpre OBSTOJEČI Sheet meni (ne nov meni)", () => {
    expect(tabbarSrc).toContain("onMore: () => void");
    // ISSUE #16 F5: gumb Več najprej izstreli shell_nav_clicked {tab: more},
    // nato odpre meni — onMore živi v istem handlerju (analitika lupine).
    expect(tabbarSrc).toContain('trackTab("more");');
    expect(tabbarSrc).toMatch(/trackTab\("more"\);[\s\S]{0,80}onMore\(\)/);
    expect(tabbarSrc).toContain('aria-haspopup="dialog"');
  });

  test("vidik <lg, fixed bottom, varnostni zamik, dot-tarče ≥44px, aria-current", () => {
    expect(tabbarSrc).toContain("lg:hidden");
    expect(tabbarSrc).toContain("fixed inset-x-0 bottom-0");
    expect(tabbarSrc).toContain("pb-[env(safe-area-inset-bottom,0px)]");
    expect(tabbarSrc).toContain("min-h-[44px]");
    expect(tabbarSrc).toContain('aria-current={active ? "page" : undefined}');
  });

  test("sredinski zavihek MOJA POT je poudarjen (polnjen primarni kroglec + značka na njem)", () => {
    expect(tabbarSrc).toContain("center: true");
    expect(tabbarSrc).toContain("bg-primary text-primary-foreground");
    expect(tabbarSrc).toContain("rounded-full");
    // značka na sredinskem kroglicu (bg-background kontrast nad primarnim)
    const centerIdx = tabbarSrc.indexOf("if (tab.center)");
    const badgeIdx = tabbarSrc.indexOf("aria-label={t.myTripBadge(count)}");
    expect(badgeIdx).toBeGreaterThan(centerIdx);
    expect(tabbarSrc).toContain("ring-2 ring-primary");
  });

  test("postavi body[data-mobile-tabbar] ob mountu + počisti ob unmountu", () => {
    expect(tabbarSrc).toContain('document.body.dataset.mobileTabbar = "true"');
    expect(tabbarSrc).toContain("delete document.body.dataset.mobileTabbar");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. NAVIGATION — tab bar vgrajen, Sheet (15 povezav, skupine #16) OHRANJEN,
//    desktop Odkrij·Moja pot·Zemljevid·Pojdi + Več dropdown
// ─────────────────────────────────────────────────────────────────────────
describe("ISSUE #16 faza 1: Navigation — tab bar + pregrupiran Sheet + Več dropdown", () => {
  test("Navigation izrisuje MobileTabBar z onMore → setMobileOpen", () => {
    expect(navSrc).toContain('from "@/components/mobile-tab-bar"');
    expect(navSrc).toContain("<MobileTabBar onMore={() => setMobileOpen(true)} />");
  });

  test("Sheet OSTAJA (kontroliran brez hamburger gumba) — hamburger odstranjen", () => {
    // TASK 8 / D8-E: hamburger zamenjal spodnji tab bar (issue #8 §52) —
    // meni ostaja prek Več.
    expect(navSrc).toContain("<Sheet open={mobileOpen} onOpenChange={setMobileOpen}>");
    expect(navSrc).not.toContain("SheetTrigger");
    expect(navSrc).not.toContain('aria-label="Odpri meni"');
  });

  test("mobilni Sheet: VSEH 15 link ciljev (4 primarni + 6 Odkrij več + 3 orodja + Prijava + za ponudnike + CTA) — ZERO LOSS + 2 novi", () => {
    const sheet = navSrc.slice(navSrc.indexOf("<SheetContent"));
    // Vse skupine se izrisujejo iz seznamov (isti vir kot desktop Več)
    expect(sheet).toContain("navLinks.map");
    expect(sheet).toContain("moreLinks.map");
    expect(sheet).toContain("toolLinks.map");
    expect(sheet).toContain("accountLinks.map");
    // ZERO LOSS: vseh 13 prejšnjih ciljev + 2 nova (primerjava, prijava)
    for (const href of [
      "/destinacije", "/moja-potovanja", "/zemljevid", "/na-poti",
      "/dozivetja", "/vodici", "/dogodki", "/lokali", "/trznica", "/slovenia-pass",
      "/potovanje", "/nacrtuj#start-kjerkoli", "/primerjava", "/prijava",
    ]) {
      expect(navSrc).toContain(`href: "${href}"`);
    }
    // Za ponudnike + CTA Načrtuj sta v Sheetu dobesedno
    expect(sheet).toContain('href="/za-ponudnike"');
    expect(sheet).toContain('href="/nacrtuj"');
    // Vsebina Sheeta: naslov + jezikovni preklopnik + tema (isti kot prej)
    expect(sheet).toContain("Discover Slovenia AI");
    expect(sheet).toContain("<LanguageSwitcher />");
    // naslovi skupin prek i18n (prej hardkodiran SL niz "Razišči več")
    expect(sheet).toContain('t("moreHeading")');
    expect(sheet).toContain('t("toolsHeading")');
    expect(sheet).toContain('t("accountHeading")');
    expect(sheet).toContain("SheetClose");
    // slogan CTA prek i18n (prej hardkodiran SL niz)
    expect(sheet).toContain('t("sheetSlogan")');
    expect(sheet).not.toContain("AI vam sestavi itinerer v sekundah.");
  });

  test("desktop navigacija #16: Odkrij · Moja pot · Zemljevid · Pojdi + Več dropdown (progressive disclosure)", () => {
    // useNavLinks — 4 povezave po modelu #16 (+ F5 analitski tab)
    for (const [href, key, tab] of [
      ["/destinacije", "discover", "explore"],
      ["/moja-potovanja", "myTrip", "my_trip"],
      ["/zemljevid", "map", "map"],
      ["/na-poti", "go", "go"],
    ] as const) {
      expect(navSrc).toContain(
        `{ href: "${href}", label: t("${key}"), tab: "${tab}" as const }`
      );
    }
    expect(navSrc).toContain('hidden items-center gap-1 lg:flex');
    // Več dropdown s skupinami
    expect(navSrc).toContain("<DropdownMenu>");
    expect(navSrc).toContain("<DropdownMenuTrigger");
    expect(navSrc).toContain('t("more")');
    expect(navSrc).toContain("ChevronDown");
    // za ponudnike + CTA načrtuj ostajata
    expect(navSrc).toContain('href="/za-ponudnike"');
    expect(navSrc).toContain('href="/nacrtuj"');
    // desne kontrole ostanejo
    expect(navSrc).toContain("<PwaHeaderIcons");
    expect(navSrc).toContain("<WishlistSheet");
    expect(navSrc).toContain("<SmartSearch");
    expect(navSrc).toContain("<LanguageSwitcher />");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. LUPINA — vseh 19 prej sirotih strani ima Navigation (+ Footer)
// ─────────────────────────────────────────────────────────────────────────
describe("TASK 8 / D8-E: lupina na prej sirotih straneh (P-NAV-1)", () => {
  for (const page of SHELL_PAGES) {
    test(`${page} uvozi Navigation + Footer`, () => {
      const src = read(page);
      expect(src).toContain('from "@/components/sections/navigation"');
      expect(src).toContain('from "@/components/sections/footer"');
      expect(src).toContain("<Navigation solid />");
      expect(src).toContain("<Footer />");
    });
  }

  test("klientske strani razcepljene na server ovoj + klientni pogled (Footer je async server komponenta)", () => {
    for (const [page, view, comp] of [
      ["src/app/moja-potovanja/page.tsx", "src/app/moja-potovanja/moja-potovanja-view.tsx", "MojaPotovanjaView"],
      ["src/app/prijava/page.tsx", "src/app/prijava/prijava-view.tsx", "PrijavaView"],
      ["src/app/preverba-emaila/page.tsx", "src/app/preverba-emaila/preverba-emaila-view.tsx", "PreverbaEmailaView"],
      ["src/app/reset-gesla/page.tsx", "src/app/reset-gesla/reset-gesla-view.tsx", "ResetGeslaView"],
      ["src/app/pozabljeno-geslo/page.tsx", "src/app/pozabljeno-geslo/pozabljeno-geslo-view.tsx", "PozabljenoGesloView"],
    ] as const) {
      const src = read(page);
      // ovoj je server komponenta (direktiva na vrhu datoteke bi naredila
      // Footer — async server komponento — neizvedljivega v klientnem drevesu)
      expect(src.startsWith('"use client"')).toBe(false);
      expect(src).toContain(`<${comp} />`);
      // klientni pogled pa JE klienten
      expect(read(view).startsWith('"use client"')).toBe(true);
    }
  });

  test("moja-potovanja: MyTripView (D8-B §4) ostaja renderana — zero loss", () => {
    const view = read("src/app/moja-potovanja/moja-potovanja-view.tsx");
    expect(view).toContain("<MyTripView");
  });

  test("moja-potovanja: akcije headerja preložene v vsebino (odjava/račun/prijava) — zero loss", () => {
    const view = read("src/app/moja-potovanja/moja-potovanja-view.tsx");
    expect(view).toContain('signOut({ callbackUrl: "/" })');
    expect(view).toContain("Odjavi se");
    expect(view).toContain("Račun");
    expect(view).toContain("Prijavi se");
    // lastni header/noga chrome ODSTRANJENA
    expect(view).not.toContain("<header");
    expect(view).not.toContain("<footer");
  });

  test("LanguageToggle ni več uvožen na straneh z lupino (pokriva ga LanguageSwitcher)", () => {
    for (const page of SHELL_PAGES) {
      expect(read(page)).not.toContain("language-toggle");
    }
  });

  test("vir-podatkov: Footer NI podvojen (bil je že prej)", () => {
    const src = read("src/app/vir-podatkov/page.tsx");
    expect(src.match(/from "@\/components\/sections\/footer"/g)?.length).toBe(1);
    expect(src.match(/<Footer \/>/g)?.length).toBe(1);
  });

  test("pot/[shareId]: print čistost — Navigation v print-hide, Footer skrit prek .pot-page footer pravila", () => {
    // D7 (1.140.0): izris lupine je v skupnem zaslonu (page.tsx tanka ovojnica)
    const src = read("src/app/pot/shared-trip-screen.tsx");
    expect(src).toContain('className="print-hide"');
    expect(src).toContain("pot-page");
    expect(globalsSrc).toContain(".pot-page footer {");
  });

  test("vsaka stran lupine ima natanko EN <main> landmark (a11y)", () => {
    for (const page of SHELL_PAGES) {
      const src = stripComments(read(page));
      const opens = (src.match(/<main[\s>]/g) ?? []).length;
      const closes = (src.match(/<\/main>/g) ?? []).length;
      // server strani: 1 v ovoju; klientske: 0 v ovoju (landmark je v
      // klientnem pogledu — preverjeno spodaj)
      if (opens > 0) {
        expect(opens).toBe(1);
        expect(closes).toBe(1);
      }
    }
    // klientni pogledi: vsak render path ima svoj <main> (mutually exclusive)
    for (const view of [
      "src/app/moja-potovanja/moja-potovanja-view.tsx",
      "src/app/prijava/prijava-view.tsx",
      "src/app/preverba-emaila/preverba-emaila-view.tsx",
      "src/app/reset-gesla/reset-gesla-view.tsx",
      "src/app/pozabljeno-geslo/pozabljeno-geslo-view.tsx",
    ]) {
      const src = stripComments(read(view));
      expect((src.match(/<main[\s>]/g) ?? []).length).toBeGreaterThan(0);
      expect(src.match(/<main[\s>]/g)?.length).toBe(src.match(/<\/main>/g)?.length);
    }
    // pot/[shareId]: <main> pride iz SharedTrip (brez gnezdenja — dokumentirano
    // v komentarju page.tsx, zato ga koda ovoja nima)
    expect(stripComments(read("src/app/pot/[shareId]/page.tsx"))).not.toContain("<main");
  });

  test("konzultacija: nazaj-na-vprašanje + zasebna povezava ohranjena kot vsebina (zero loss)", () => {
    const src = read("src/app/konzultacija/[token]/page.tsx");
    expect(src).toContain('href="/#vprasi-lokalca"');
    expect(src).toContain("Zasebna povezava");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. STICKYMOBILECTA — POPOLNOMA upokojen in IZBRISAN (ISSUE #16 F5 dolg)
// ─────────────────────────────────────────────────────────────────────────
describe("ISSUE #16 F5: StickyMobileCTA izbrisan (0 uporabnikov → dolg odstranjen)", () => {
  for (const page of RETIRED_CTA_PAGES) {
    test(`${page} NE uvoza StickyMobileCTA`, () => {
      expect(read(page)).not.toContain("sticky-mobile-cta");
    });
  }

  test("komponenta NE obstaja več v repu (izbris v fazi 5)", () => {
    let exists = true;
    try {
      read("src/components/sticky-mobile-cta.tsx");
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);
  });

  test("domača stran ne referencira komponente (le dokumentacijski komentar o umiku)", () => {
    const home = stripComments(read("src/app/page.tsx"));
    expect(home).not.toContain("StickyMobileCTA");
    expect(home).not.toContain("sticky-mobile-cta");
  });

  test("data-sticky-cta CSS pravila ODSTRANJENA ( ostane samo data-mobile-tabbar dvig)", () => {
    expect(globalsSrc).not.toContain('body[data-sticky-cta="true"]');
    expect(globalsSrc).toContain('body[data-mobile-tabbar="true"] .dsa-chat-fab');
  });

  test("nobena lupina ne uvaža več sticky-mobile-cta", () => {
    expect(tabbarSrc).not.toContain('from "@/components/sticky-mobile-cta"');
    expect(navSrc).not.toContain('from "@/components/sticky-mobile-cta"');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 5. GLOBALS.CSS + FOOTER — dvig chat FAB nad tab vrstico, očistek noge
// ─────────────────────────────────────────────────────────────────────────
describe("TASK 8 / D8-E: globals.css + Footer odmiki", () => {
  test("data-mobile-tabbar dviga chat FAB + panel (<lg blok)", () => {
    expect(globalsSrc).toContain("@media (max-width: 1023px)");
    expect(globalsSrc).toContain('body[data-mobile-tabbar="true"] .dsa-chat-fab');
    expect(globalsSrc).toContain(
      "bottom: calc(4.75rem + env(safe-area-inset-bottom, 0px));"
    );
    expect(globalsSrc).toContain('body[data-mobile-tabbar="true"] .dsa-chat-panel');
    expect(globalsSrc).toContain(
      "bottom: calc(9rem + env(safe-area-inset-bottom, 0px));"
    );
  });

  test("footer: spodnji odmik povečan <lg (tab vrstica + dvignjen FAB)", () => {
    expect(footerSrc).toContain("pb-48 pt-10 sm:px-6 sm:pb-48");
    expect(footerSrc).toContain("lg:pb-24");
    expect(footerSrc).not.toContain("pb-40 pt-10 sm:px-6 sm:pb-24");
  });
});
