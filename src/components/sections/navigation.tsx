"use client";

import * as React from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useTheme } from "next-themes";
import { useLocale, useTranslations } from "next-intl";
import { Mountain, Sun, Moon, Compass, Search, ShoppingCart, Building2, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { pick } from "@/lib/i18n-pick";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { MyTripAccountSync } from "@/components/my-trip-account-sync";
import { LanguageSwitcher } from "@/components/language-switcher";
import { PwaHeaderIcons } from "@/components/pwa/pwa-header-icons";
import { SmartSearch } from "@/components/smart-search";
import { WishlistSheet } from "@/components/wishlist-sheet";
import { A11yControls } from "@/components/a11y-controls";
import { useCart } from "@/lib/cart-store";
import { destinationHref } from "@/lib/search-result-nav";
import { trackPlannerEvent } from "@/lib/planner-analytics";


/**
 * FW3 (AI-first hierarhija): navigacija ima samo 4 glavne povezave
 * (Destinacije, Doživetja, Zemljevid, Vodiči) + primarni CTA "Načrtuj z AI"
 * (→ /načrtuj) + diskretni "Za ponudnike". Preostale funkcije (nivo 2:
 * Dogodki, Lokali, Tržnica, Slovenia Pass) so dostopne v mobilnem meniju in
 * prek sekcije "Razišči Slovenijo" na homepageu — progresivno razkrivanje
 * namesto kognitivnega overloada.
 *
 * Issue #3 (UX REDESIGN — ZERO FEATURE LOSS): "Moja potovanja" je dodana
 * TUDI v desktop navigacijo (prej samo mobilni meni — pokopana zmožnost
 * na najširšem zaslonu). Ciljni model DISCOVER → PLAN → BOOK → GO zahteva,
 * da je centralni shranjeni objekt (MY TRIP) dosegljiv z vsake naprave.
 */

// F4-E (issue #8 Faza 4): lupina mora biti dvojezična na VSEH EN straneh —
// trije pušči (košarica aria, tema aria, gumb Svetla/Temna v Sheetu) so bili
// zadnji SL-only nizi navigacije. aria-labeli gredo branju zaslona — SL
// label na EN strani je dostopnostna napaka, ne le kozmetična.
// W1 (Issue #15): razširjeno na 4 javne jezike (it/de) prek pick().
// W12 (smer 2, faza 1): +fr/es (navigacijska lupina je na vseh FR/ES
// whitelistnih poteh — /, /destinacije, /primerjava, info strani).
const NAV_L = {
  cart: (l: string) => pick(l, { sl: "Odpri košarico", en: "Open cart", it: "Apri il carrello", de: "Warenkorb öffnen", fr: "Ouvrir le panier", es: "Abrir el carrito" }),
  cartWithItems: (l: string, n: number) =>
    pick(l, {
      sl: `Odpri košarico (${n} izdelkov)`,
      en: `Open cart (${n} items)`,
      it: `Apri il carrello (${n} articoli)`,
      de: `Warenkorb öffnen (${n} Artikel)`,
      fr: `Ouvrir le panier (${n} articles)`,
      es: `Abrir el carrito (${n} artículos)`,
    }),
  theme: (l: string) => pick(l, { sl: "Preklopi temo", en: "Toggle theme", it: "Cambia tema", de: "Design wechseln", fr: "Changer le thème", es: "Cambiar el tema" }),
  themeLight: (l: string) => pick(l, { sl: "Svetla", en: "Light", it: "Chiaro", de: "Hell", fr: "Clair", es: "Claro" }),
  themeDark: (l: string) => pick(l, { sl: "Temna", en: "Dark", it: "Scuro", de: "Dunkel", fr: "Sombre", es: "Oscuro" }),
};

/**
 * ISSUE #16 (UX/IA KONSOLIDACIJA — ONE JOURNEY, ONE HOME, ZERO FEATURE
 * LOSS) faza 1: primarna navigacija sledi mentalnemu modelu
 * ODKRIJ → DODAJ → MOJA POT → NAČRTUJ → POJDI (issue §Navigacijska
 * arhitektura — Desktop: Odkrij · Moja pot · Zemljevid · Pojdi · Več).
 *
 * - Odkrij (/destinacije) — primarna vstopna površina raziskovanja.
 * - Moja pot (/moja-potovanja) — osrednji trip hub (issue §2).
 * - Zemljevid (/zemljevid) — samostojna discovery površina (issue §4).
 * - Pojdi (/na-poti) — ločen aktivni način, PREJ dosegljiv samo prek noge
 *   in Sheet menija (revizija TASK 4/K-12 ga je dodala v Sheet — zdaj
 *   prvič v DESKTOP primarni vrstici).
 * - "Več" (dropdown) — progressive disclosure (issue §5): Doživetja,
 *   Vodiči, Dogodki, Lokali, Tržnica, Slovenia Pass se umaknejo iz primarne
 *   vrstice (ne izgubijo!); + skupini Načrtuj in orodja ter Račun.
 * - CTA "Načrtuj potovanje" ostaja primarna akcija (korak NAČRTUJ).
 *
 * Prej (FW3 + Issue #3): 5 kategorij odkrivanja (Destinacije/Doživetja/
 * Zemljevid/Vodiči/Moja potovanja) — preurejeno po issue #16, ZERO LOSS
 * (vseh 13 prejšnjih ciljev + 2 novi [Primerjava, Prijava] dosegljivih).
 */
function useNavLinks() {
  const t = useTranslations("nav");
  return [
    // ISSUE #16 F5: `tab` je analitska preslikava za shell_nav_clicked
    // (explore|map|my_trip|go — isti kanon kot MobileTabBar TAB_EVENT).
    { href: "/destinacije", label: t("discover"), tab: "explore" as const },
    { href: "/moja-potovanja", label: t("myTrip"), tab: "my_trip" as const },
    { href: "/zemljevid", label: t("map"), tab: "map" as const },
    { href: "/na-poti", label: t("go"), tab: "go" as const },
  ];
}

/**
 * "Več" — skupina ODKRIJ VEČ (issue #16 §5: odkrivanje ostaja dostopno,
 * a izven primarne vrstice — progressive disclosure, ne feature reduction).
 * Vsebuje bivše primarne povezave (Doživetja, Vodiči) + bivše sekundarne
 * odkrivalne (Dogodki, Lokali, Tržnica, Slovenia Pass).
 */
function useMoreLinks() {
  const t = useTranslations("nav");
  return [
    { href: "/dozivetja", label: t("experiences") },
    { href: "/vodici", label: t("guides") },
    { href: "/dogodki", label: t("events") },
    { href: "/lokali", label: t("listings") },
    { href: "/trznica", label: t("marketplace") },
    { href: "/slovenia-pass", label: t("pass") },
  ];
}

/**
 * "Več" — skupina NAČRTUJ IN ORODJA (issue #16: koraki načrtovanja in
 * orodja). /potovanje je korak ponudnikov ENEGA načrtovalnika (issue #8
 * §43 NO PARALLEL APP); Začni kjerkoli je uvoz virov (F3-C); Primerjava
 * je iskrena primerjava načrtovalnikov (prej dosegljiva SAMO iz noge —
 * audit Issue #16: vrzel, dodana v Več).
 */
function useToolLinks() {
  const t = useTranslations("nav");
  return [
    { href: "/potovanje", label: t("journey") },
    { href: "/nacrtuj#start-kjerkoli", label: t("startAnywhere") },
    { href: "/primerjava", label: t("compare") },
  ];
}

/**
 * "Več" — skupina RAČUN (issue #16 §5: administrativne funkcije pod Več).
 * Prijava je bila prej dosegljiva SAMO iz noge (audit Issue #16: vrzel).
 */
function useAccountLinks() {
  const t = useTranslations("nav");
  return [{ href: "/prijava", label: t("login") }];
}

/**
 * Scroll-aware glass navigacija (pattern GYG/Airbnb):
 * - nad herojem: prozorna, bela pisava nad fotografijo
 * - po odscrollu: stekleno meglo ozadje + meja + senca
 * - tanek progress bar na dnu (branje dolžine strani)
 *
 * FW3: prop `solid` prisili stekleno obliko tudi na vrhu strani — za
 * podstrani brez fotografskega heroja (/načrtuj, /destinacije, …), kjer
 * bi prozorna bela navigacija bila nevidna na belem ozadju.
 */
export function Navigation({ solid = false }: { solid?: boolean }) {
  const [mounted, setMounted] = React.useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const t = useTranslations("nav");
  const navLocale = useLocale();
  // W1: jezik lupine = aktivni locale (4 javni jeziki; pick() validira).
  const lang = navLocale;
  const router = useRouter();
  const navLinks = useNavLinks();
  const moreLinks = useMoreLinks();
  const toolLinks = useToolLinks();
  const accountLinks = useAccountLinks();

  // ISSUE #5 T5-B / H1 (fix wave 1): SmartSearch rezultati so bili MRTVI
  // KLIKI — <SmartSearch> je bil izrisan BREZ onSelectDestination, zato je
  // bil klik na destinacijo no-op (optional chaining v komponenti), ostale
  // skupine pa so samo zaprle dialog. Zdaj klik na destinacijo navigira na
  // hub stran (/destinacija/[idOrSlug] — obe obliki razreši SSG hub prek
  // getDestinationById najprej) in dialog se zapre (handleClose v
  // komponenti). Router je locale-zaveden (@/i18n/navigation), zato EN
  // uporabnik ostane v angleščini. Ostale skupine (lokali/izdelki/
  // doživetja) navigira komponenta sama prek search-result-nav.ts.
  const handleSearchSelectDestination = React.useCallback(
    (destIdOrSlug: string) => {
      router.push(destinationHref(destIdOrSlug));
    },
    [router]
  );

  // ISSUE #16 F5 „analitika lupine": klik na vstop lupine ODKRIJ ·
  // MOJA POT · ZEMLJEVID · POJDI · VEČ. Površine: header (desktop vrstica
  // + sprožilec Več), dropdown (desktop Več vnosi ravni-2 — label = href),
  // sheet (mobilni Več meni; primarne povezave nosijo svoj tab, ravni-2
  // vnosi tab "more" + label). Fire-and-forget, brez PII (isti kanon kot
  // MobileTabBar TAB_EVENT / planner-analytics.ts).
  const trackShellNav = React.useCallback(
    (
      tab: "explore" | "map" | "my_trip" | "go" | "more",
      surface: "header" | "dropdown" | "sheet",
      label?: string
    ) => {
      trackPlannerEvent(
        "shell_nav_clicked",
        label ? { tab, surface, label } : { tab, surface }
      );
    },
    []
  );

  // "Steklo" = odscrollano ALI vedno (podstrani brez heroja)
  const glass = scrolled || solid;

  // Cart store — items prikazujemo šele po mountu, da se izognemo
  // hydration mismatchu (Zustand persist prebere localStorage šele na klientu).
  const cartItems = useCart((s) => s.items);
  const openCart = useCart((s) => s.openCart);
  const cartCount = mounted
    ? cartItems.reduce((sum, i) => sum + i.quantity, 0)
    : 0;

  React.useEffect(() => setMounted(true), []);

  // Scroll listener: preklop stekla + progress branja
  React.useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        setScrolled(y > 24);
        const doc = document.documentElement;
        const max = doc.scrollHeight - window.innerHeight;
        setProgress(max > 0 ? Math.min(y / max, 1) : 0);
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  return (
    <>
      {/* TASK 8 / F2-A: strežniška refleksija zbirke "Moja pot" — nevidni
          gonilev (prijava sync + diff-sync med B2C sejo). Izrisuje null. */}
      <MyTripAccountSync />
      <header
        className={cn(
          "sticky top-0 z-[2000] w-full transition-all duration-300",
          glass
            ? "border-b border-border/70 bg-background/85 shadow-[0_4px_24px_-12px_rgba(0,0,0,0.18)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/70"
            : "border-b border-transparent bg-transparent"
        )}
      >
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          {/* Logotip */}
          <Link
            href="/"
            className={cn(
              "group flex items-center gap-2 transition-colors",
              glass
                ? "text-foreground hover:text-primary"
                : "text-white drop-shadow-md hover:text-white"
            )}
            aria-label="Discover Slovenia AI — domov"
          >
            <span
              className={cn(
                "flex size-9 items-center justify-center rounded-lg shadow-md transition-all group-hover:scale-105",
                glass
                  ? "bg-primary text-primary-foreground"
                  : "bg-white/15 text-white backdrop-blur-md ring-1 ring-white/30"
              )}
            >
              <Mountain className="size-5" aria-hidden="true" />
            </span>
            {/* Besedna znamka — na zelo ozkih zaslonih (<360px) se skrije,
                ostane gorski znak (prej 2px horizontalni preliv na 320px) */}
            <span className="flex max-[359px]:hidden flex-col leading-none">
              <span className="text-sm font-bold tracking-tight sm:text-base">
                Discover Slovenia AI
              </span>
              <span
                className={cn(
                  "hidden text-[10px] font-medium uppercase tracking-[0.18em] sm:block",
                  glass ? "text-muted-foreground" : "text-white/70"
                )}
              >
                {t("tagline")}
              </span>
            </span>
          </Link>

          {/* Desktop navigacija — Issue #16 faza 1: Odkrij · Moja pot ·
              Zemljevid · Pojdi + "Več" (dropdown — progressive disclosure) */}
          <nav
            className="hidden items-center gap-1 lg:flex"
            aria-label="Glavna navigacija"
          >
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => trackShellNav(link.tab, "header")}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  glass
                    ? "text-foreground/80 hover:bg-accent hover:text-accent-foreground"
                    : "text-white/85 hover:bg-white/10 hover:text-white"
                )}
              >
                {link.label}
              </Link>
            ))}

            {/* Issue #16 §5 — "Več": napredne funkcije se NE odstranijo,
                ampak se umaknejo iz primarne navigacije (progressive
                disclosure). Skupine: Odkrij več · Načrtuj in orodja · Račun. */}
            <DropdownMenu>
              <DropdownMenuTrigger
                onClick={() => trackShellNav("more", "header")}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition-colors outline-none",
                  glass
                    ? "text-foreground/80 hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    : "text-white/85 hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60"
                )}
              >
                {t("more")}
                <ChevronDown className="size-3.5" aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60">
                <DropdownMenuLabel>{t("moreHeading")}</DropdownMenuLabel>
                {moreLinks.map((link) => (
                  <DropdownMenuItem asChild key={link.href}>
                    <Link
                      href={link.href}
                      onClick={() => trackShellNav("more", "dropdown", link.href)}
                    >
                      {link.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel>{t("toolsHeading")}</DropdownMenuLabel>
                {toolLinks.map((link) => (
                  <DropdownMenuItem asChild key={link.href}>
                    <Link
                      href={link.href}
                      onClick={() => trackShellNav("more", "dropdown", link.href)}
                    >
                      {link.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel>{t("accountHeading")}</DropdownMenuLabel>
                {accountLinks.map((link) => (
                  <DropdownMenuItem asChild key={link.href}>
                    <Link
                      href={link.href}
                      onClick={() => trackShellNav("more", "dropdown", link.href)}
                    >
                      {link.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </nav>

          {/* Desno: offline/install (PWA) + cart + wishlist + smart search + theme toggle + language switcher + CTA + mobile menu */}
          <div className="flex items-center gap-1">
            {/* F5.7 PWA: badge "Brez povezave" (samo offline) + gumb za namestitev */}
            <PwaHeaderIcons scrolled={glass} />
            {/* Košarica (tržnica) */}
            <Button
              variant="ghost"
              size="icon"
              onClick={openCart}
              aria-label={
                cartCount > 0
                  ? NAV_L.cartWithItems(lang, cartCount)
                  : NAV_L.cart(lang)
              }
              className={cn(
                "relative",
                glass ? "text-foreground" : "text-white hover:bg-white/10 hover:text-white"
              )}
            >
              <ShoppingCart className="size-5" aria-hidden="true" />
              {cartCount > 0 ? (
                <span
                  className={cn(
                    "absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none",
                    glass
                      ? "bg-primary text-primary-foreground"
                      : "bg-white text-primary shadow-sm"
                  )}
                  aria-hidden="true"
                >
                  {cartCount > 99 ? "99+" : cartCount}
                </span>
              ) : null}
            </Button>

            {/* Priljubljene (wishlist) — srček s števčno značko, odpre Sheet */}
            <WishlistSheet scrolled={glass} />

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSearchOpen(true)}
              aria-label={t("searchAria")}
              className={cn(
                glass ? "text-foreground" : "text-white hover:bg-white/10 hover:text-white"
              )}
            >
              <Search className="size-5" aria-hidden="true" />
            </Button>

            {/* P4-5: preklop teme — na mobilnem dostopen v meniju (razbremenjen header) */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label={NAV_L.theme(lang)}
              className={cn(
                "hidden sm:inline-flex",
                glass ? "text-foreground" : "text-white hover:bg-white/10 hover:text-white"
              )}
            >
              {mounted ? (
                resolvedTheme === "dark" ? (
                  <Sun className="size-5" aria-hidden="true" />
                ) : (
                  <Moon className="size-5" aria-hidden="true" />
                )
              ) : (
                // Placeholder med hidracijo, da se izognemo mismatchu
                <span className="size-5" aria-hidden="true" />
              )}
            </Button>

            {/* W5 (Issue #15): dostopnost — visok kontrast + bralni način
                (STB nacionalni standard); ikona OB preklopu teme, enaka
                lupina (bela pisava nad herojem, temna po odscrollu).
                Na mobilnem dostopen v meniju (razbremenjen header) — isto
                kot preklop teme. */}
            <div
              className={cn(
                "hidden sm:inline-flex",
                !glass && "[&>button]:text-white [&>button:hover]:bg-white/10 [&>button:hover]:text-white"
              )}
            >
              <A11yControls scrolled={glass} />
            </div>

            <div className={cn("hidden sm:block", glass ? "" : "[&>button]:text-white [&>button:hover]:bg-white/10")}>
              <LanguageSwitcher />
            </div>

            {/* P4-5: javni lijak na ponudnike (prej orphan /za-ponudnike) */}
            <Button
              asChild
              variant="ghost"
              size="sm"
              className={cn(
                "hidden gap-1.5 md:inline-flex",
                glass
                  ? "text-foreground/80 hover:text-primary"
                  : "text-white/85 hover:bg-white/10 hover:text-white"
              )}
            >
              <Link href="/za-ponudnike">
                <Building2 className="size-4" aria-hidden="true" />
                {t("providers")}
              </Link>
            </Button>

            {/* FW3: primarni CTA — vedno viden, vodi na AI planner */}
            <Button
              asChild
              size="sm"
              className={cn(
                "hidden shadow-md transition-all hover:shadow-lg sm:inline-flex",
                glass
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-white text-primary hover:bg-white/90"
              )}
            >
              <Link href="/nacrtuj">{t("cta")}</Link>
            </Button>

            {/* Mobilni meni — TASK 8 / D8-E: hamburger gumb v headerju je
                zamenjal spodnji tab bar (zavihek "Več" ga odpre prek
                onMore → setMobileOpen). Sheet OSTAJA nespremenjen: vseh 13
                destinacij + jezikovna/source kontrola + CTA. */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetContent side="right" className="w-[82vw] sm:max-w-sm">
                <SheetTitle className="px-4 pt-4 text-lg font-bold text-foreground">
                  <span className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
                      <Compass className="size-4" aria-hidden="true" />
                    </span>
                    Discover Slovenia AI
                  </span>
                </SheetTitle>

                <nav
                  className="mt-2 flex flex-col gap-1 px-2"
                  aria-label="Mobilna navigacija"
                >
                  {/* Issue #16 faza 1 — primarne povezave (4): isti vrstni red
                      kot tab vrstica (Odkrij · Moja pot · Zemljevid · Pojdi).
                      F5: sheet klik nosi svoj tab (analitika lupine). */}
                  {navLinks.map((link) => (
                    <SheetClose asChild key={link.href}>
                      <Link
                        href={link.href}
                        onClick={() => trackShellNav(link.tab, "sheet")}
                        className="rounded-md px-3 py-3 text-base font-medium text-foreground/90 transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        {link.label}
                      </Link>
                    </SheetClose>
                  ))}

                  {/* Issue #16 §5 — "Več" skupina ODKRIJ VEČ (prej
                      "Razišči več" + primarne Doživetja/Vodiči) */}
                  <div className="my-2 h-px bg-border" aria-hidden="true" />
                  <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {t("moreHeading")}
                  </p>
                  {moreLinks.map((link) => (
                    <SheetClose asChild key={link.href}>
                      <Link
                        href={link.href}
                        onClick={() => trackShellNav("more", "sheet", link.href)}
                        className="rounded-md px-3 py-2.5 text-sm font-medium text-foreground/70 transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        {link.label}
                      </Link>
                    </SheetClose>
                  ))}

                  {/* Issue #16 — skupina NAČRTUJ IN ORODJA */}
                  <div className="my-2 h-px bg-border" aria-hidden="true" />
                  <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {t("toolsHeading")}
                  </p>
                  {toolLinks.map((link) => (
                    <SheetClose asChild key={link.href}>
                      <Link
                        href={link.href}
                        onClick={() => trackShellNav("more", "sheet", link.href)}
                        className="rounded-md px-3 py-2.5 text-sm font-medium text-foreground/70 transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        {link.label}
                      </Link>
                    </SheetClose>
                  ))}

                  {/* Issue #16 — skupina RAČUN (prijava prej samo noga) */}
                  <div className="my-2 h-px bg-border" aria-hidden="true" />
                  <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {t("accountHeading")}
                  </p>
                  {accountLinks.map((link) => (
                    <SheetClose asChild key={link.href}>
                      <Link
                        href={link.href}
                        onClick={() => trackShellNav("more", "sheet", link.href)}
                        className="rounded-md px-3 py-2.5 text-sm font-medium text-foreground/70 transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        {link.label}
                      </Link>
                    </SheetClose>
                  ))}

                  <div className="my-2 h-px bg-border" aria-hidden="true" />
                  <SheetClose asChild>
                    <Link
                      href="/za-ponudnike"
                      className="flex items-center gap-2 rounded-md px-3 py-3 text-base font-semibold text-primary transition-colors hover:bg-primary/10"
                    >
                      <Building2 className="size-4" aria-hidden="true" />
                      {t("providers")}
                    </Link>
                  </SheetClose>
                </nav>

                <div className="mt-4 flex items-center justify-between gap-3 px-4">
                  <LanguageSwitcher />
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={toggleTheme}
                      aria-label={NAV_L.theme(lang)}
                      className="gap-2"
                    >
                      {mounted && resolvedTheme === "dark" ? (
                        <Sun className="size-4" aria-hidden="true" />
                      ) : (
                        <Moon className="size-4" aria-hidden="true" />
                      )}
                      {mounted && resolvedTheme === "dark"
                        ? NAV_L.themeLight(lang)
                        : NAV_L.themeDark(lang)}
                    </Button>
                    {/* W5: dostopnost tudi v mobilnem meniju — svetla lupina
                        (Sheet je na svetlem ozadju) */}
                    <A11yControls scrolled />
                  </div>
                </div>

                <div className="mt-auto px-4 pb-6">
                  <SheetClose asChild>
                    <Button
                      asChild
                      className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                      size="lg"
                    >
                      <Link href="/nacrtuj">{t("cta")}</Link>
                    </Button>
                  </SheetClose>
                  <p className="mt-3 text-center text-xs text-muted-foreground">
                    {t("sheetSlogan")}
                  </p>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* Progress bar branja — subtilneje kot običajen scroll indikator */}
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 h-0.5 origin-left bg-gradient-to-r from-primary via-emerald-500 to-amber-400 transition-opacity duration-300",
            glass ? "opacity-100" : "opacity-0"
          )}
          style={{ transform: `scaleX(${progress})` }}
          aria-hidden="true"
        />

        {/* AI Smart Search — naravno-jezikovno iskanje */}
        <SmartSearch
          open={searchOpen}
          onOpenChange={setSearchOpen}
          onSelectDestination={handleSearchSelectDestination}
        />
      </header>

      {/* TASK 8 / D8-E (issue #8 §52): spodnja mobilna tab vrstica — vidi se
          SAMO <lg; odpre ta isti Sheet meni prek zavihka "Več". */}
      <MobileTabBar onMore={() => setMobileOpen(true)} />
    </>
  );
}

export default Navigation;
