// ============================================================================
// TASK 8 / D8-E (issue #8 §52 — Discovery UX 2.0) — ENOTNA LUPINA + MOBILNA
// TAB VRSTICA · source-contract
// ----------------------------------------------------------------------------
// Pokriva dve spremembi (D8-B §6.1 + §6.2, popravlja P-NAV-1):
//  1. MobileTabBar (src/components/mobile-tab-bar.tsx): 5 zavihkov <lg
//     (Razišči / Zemljevid / Načrtuj sredinski / Moja pot s števčno značko
//     / Več → obstoječi Sheet meni), body[data-mobile-tabbar] dvig chat FAB.
//  2. Lupina (Navigation solid + Footer) na 19 prej sirotih straneh
//     (D8-A §2.4 jih šteje 17 + /moja-potovanja + /pot/[shareId] po nalogi
//     D8-E); LanguageToggle lebdeča pilula odstranjena (LanguageSwitcher v
//     Navigation pokriva isto SL⇄EN dejanje na EN-whitelistanih straneh),
//     StickyMobileCTA upokojen na straneh z lupino (ostane samo domača
//     stran — druga faza).
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
  "src/app/pot/[shareId]/page.tsx",
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

/** Strani, kjer je bil StickyMobileCTA upokojen (ostane SAMO domača stran). */
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
describe("TASK 8 / D8-E: MobileTabBar — 5 zavihkov + značka + Več", () => {
  test("datoteka obstaja in je klientna komponenta", () => {
    expect(tabbarSrc.startsWith('"use client";')).toBe(true);
    expect(tabbarSrc).toContain("export function MobileTabBar");
  });

  test("5 zavihkov: oznake (SL+EN) + povezave", () => {
    // SL oznake
    for (const label of ["Razišči", "Zemljevid", "Načrtuj", "Moja pot", "Več"]) {
      expect(tabbarSrc).toContain(`"${label}"`);
    }
    // EN oznake (isti komponent, L vzorec)
    for (const label of ["Explore", "Map", "Plan", "My trip", "More"]) {
      expect(tabbarSrc).toContain(`"${label}"`);
    }
    // hrefs
    expect(tabbarSrc).toContain('href: "/destinacije"');
    expect(tabbarSrc).toContain('href: "/zemljevid"');
    expect(tabbarSrc).toContain('href: "/nacrtuj"');
    expect(tabbarSrc).toContain('href: "/moja-potovanja"');
  });

  test("aktivacijska logika: /destinacija/* → Razišči, /potovanje → Načrtuj, Več samo za Sheet poti", () => {
    expect(tabbarSrc).toContain('p === "/destinacije" || p.startsWith("/destinacija")');
    expect(tabbarSrc).toContain('p === "/nacrtuj" || p.startsWith("/potovanje")');
    // Več kot sidro za poti, ki živijo SAMO v Sheet meniju (dvh. /na-poti)
    expect(tabbarSrc).toContain('"/na-poti"');
    expect(tabbarSrc).toContain("MORE_MENU_ROUTES.some");
  });

  test("števčna značka iz zbirke Moja pot (useMyTrip count)", () => {
    expect(tabbarSrc).toContain('from "@/hooks/use-my-trip"');
    expect(tabbarSrc).toContain("useMyTrip()");
    expect(tabbarSrc).toContain("{ count }");
    expect(tabbarSrc).toContain("count > 99");
  });

  test("onMore prop odpre OBSTOJEČI Sheet meni (ne nov meni)", () => {
    expect(tabbarSrc).toContain("onMore: () => void");
    expect(tabbarSrc).toContain("onClick={onMore}");
    expect(tabbarSrc).toContain('aria-haspopup="dialog"');
  });

  test("vidik <lg, fixed bottom, varnostni zamik, dot-tarče ≥44px, aria-current", () => {
    expect(tabbarSrc).toContain("lg:hidden");
    expect(tabbarSrc).toContain("fixed inset-x-0 bottom-0");
    expect(tabbarSrc).toContain("pb-[env(safe-area-inset-bottom,0px)]");
    expect(tabbarSrc).toContain("min-h-[44px]");
    expect(tabbarSrc).toContain('aria-current={active ? "page" : undefined}');
  });

  test("sredinski zavihek Načrtuj je poudarjen (polnjen primarni kroglec)", () => {
    expect(tabbarSrc).toContain("center: true");
    expect(tabbarSrc).toContain("bg-primary text-primary-foreground");
    expect(tabbarSrc).toContain("rounded-full");
  });

  test("postavi body[data-mobile-tabbar] ob mountu + počisti ob unmountu", () => {
    expect(tabbarSrc).toContain('document.body.dataset.mobileTabbar = "true"');
    expect(tabbarSrc).toContain("delete document.body.dataset.mobileTabbar");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. NAVIGATION — tab bar vgrajen, Sheet (13 destinacij) OHRANJEN, desktop
//    nespremenjen, hamburger odstranjen
// ─────────────────────────────────────────────────────────────────────────
describe("TASK 8 / D8-E: Navigation — tab bar + ohranjen mobilni Sheet", () => {
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

  test("mobilni Sheet: VSEH 12 link ciljev (5 primarnih + 5 sekundarnih + za ponudnike + CTA; D8-A §2.1 jih šteje kot 13 destinacij skupaj z logotipom/domov)", () => {
    const sheet = navSrc.slice(navSrc.indexOf("<SheetContent"));
    // Primarne + sekundarne povezave se izrisujejo iz ISTIH seznamov kot
    // desktop (useNavLinks/useSecondaryLinks) — Sheet ju preslika v celoti.
    expect(sheet).toContain("navLinks.map");
    expect(sheet).toContain("secondaryLinks.map");
    // Seznama vsebujeta vseh 10 povezav (5 primarnih + 5 sekundarnih):
    for (const href of ["/destinacije", "/dozivetja", "/zemljevid", "/vodici", "/moja-potovanja", "/na-poti", "/dogodki", "/lokali", "/trznica", "/slovenia-pass"]) {
      expect(navSrc).toContain(`href: "${href}"`);
    }
    // Za ponudnike + CTA Načrtuj sta v Sheetu dobesedno
    expect(sheet).toContain('href="/za-ponudnike"');
    expect(sheet).toContain('href="/nacrtuj"');
    // Vsebina Sheeta: naslov + jezikovni preklopnik + tema (isti kot prej)
    expect(sheet).toContain("Discover Slovenia AI");
    expect(sheet).toContain("<LanguageSwitcher />");
    expect(sheet).toContain("Razišči več");
    expect(sheet).toContain("SheetClose");
  });

  test("desktop navigacija NEspremenjena: 5 glavnih povezav + CTA + za ponudnike", () => {
    // useNavLinks (5 povezav) ostaja
    for (const href of ["/destinacije", "/dozivetja", "/zemljevid", "/vodici", "/moja-potovanja"]) {
      expect(navSrc).toContain(`href: "${href}"`);
    }
    expect(navSrc).toContain('hidden items-center gap-1 lg:flex');
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
    const src = read("src/app/pot/[shareId]/page.tsx");
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
// 4. STICKYMOBILECTA — upokojen na straneh z lupino (ostane samo domov)
// ─────────────────────────────────────────────────────────────────────────
describe("TASK 8 / D8-E: StickyMobileCTA upokojen na straneh z lupino", () => {
  for (const page of RETIRED_CTA_PAGES) {
    test(`${page} NE uvoza več StickyMobileCTA`, () => {
      expect(read(page)).not.toContain("sticky-mobile-cta");
    });
  }

  test("domača stran (druga faza D8-F) ga ŠE vedno uporablja; komponenta ostaja v repu", () => {
    expect(read("src/app/page.tsx")).toContain("StickyMobileCTA");
    const comp = read("src/components/sticky-mobile-cta.tsx");
    expect(comp).toContain("UPOKOJEN");
  });

  test("data-sticky-cta CSS pravila OSTAJAJO (domača stran jih še rabi)", () => {
    expect(globalsSrc).toContain('body[data-sticky-cta="true"] .dsa-chat-fab');
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
