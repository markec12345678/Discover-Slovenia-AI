"use client";

import * as React from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { Mountain, Menu, Sun, Moon, Compass, Search, ShoppingCart, Building2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SmartSearch } from "@/components/smart-search";
import { WishlistSheet } from "@/components/wishlist-sheet";
import { useCart } from "@/lib/cart-store";


/**
 * FW3 (AI-first hierarhija): navigacija ima samo 4 glavne povezave
 * (Destinacije, Doživetja, Zemljevid, Vodiči) + primarni CTA "Načrtuj z AI"
 * (→ /načrtuj) + diskretni "Za ponudnike". Preostale funkcije (nivo 2:
 * Dogodki, Lokali, Tržnica, Slovenia Pass, Moja potovanja) so dostopne v
 * mobilnem meniju in prek sekcije "Razišči Slovenijo" na homepageu —
 * progresivno razkrivanje namesto kognitivnega overloada.
 */
function useNavLinks() {
  const t = useTranslations("nav");
  return [
    { href: "/destinacije", label: t("destinations") },
    { href: "/dozivetja", label: t("experiences") },
    { href: "/zemljevid", label: t("map") },
    { href: "/vodici", label: t("guides") },
  ];
}

/**
 * Sekundarne povezave (nivo 2 — "raziskovanje") — prikazane samo v
 * mobilnem meniju pod glavnimi povezavami, da desktop ostane minimalen.
 */
function useSecondaryLinks() {
  const t = useTranslations("nav");
  return [
    { href: "/dogodki", label: t("events") },
    { href: "/lokali", label: t("listings") },
    { href: "/trznica", label: t("marketplace") },
    { href: "/slovenia-pass", label: t("pass") },
    { href: "/moja-potovanja", label: t("trips") },
  ];
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
  const navLinks = useNavLinks();
  const secondaryLinks = useSecondaryLinks();

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
          <span className="flex flex-col leading-none">
            <span className="text-sm font-bold tracking-tight sm:text-base">
              Discover Slovenia AI
            </span>
            <span
              className={cn(
                "text-[10px] font-medium uppercase tracking-[0.18em]",
                glass ? "text-muted-foreground" : "text-white/70"
              )}
            >
              AI potovanja
            </span>
          </span>
        </Link>

        {/* Desktop navigacija — 4 glavne povezave (FW3 hierarhija) */}
        <nav
          className="hidden items-center gap-1 lg:flex"
          aria-label="Glavna navigacija"
        >
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
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
        </nav>

        {/* Desno: cart + wishlist + smart search + theme toggle + language switcher + CTA + mobile menu */}
        <div className="flex items-center gap-1">
          {/* Košarica (tržnica) */}
          <Button
            variant="ghost"
            size="icon"
            onClick={openCart}
            aria-label={
              cartCount > 0
                ? `Odpri košarico (${cartCount} izdelkov)`
                : "Odpri košarico"
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
            aria-label="AI iskanje"
            className={cn(
              glass ? "text-foreground" : "text-white hover:bg-white/10 hover:text-white"
            )}
          >
            <Search className="size-5" aria-hidden="true" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label="Preklopi temo"
            className={cn(
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

          <div className={cn(glass ? "" : "[&>button]:text-white [&>button:hover]:bg-white/10")}>
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

          {/* Mobilni hamburger meni */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "lg:hidden",
                  glass ? "text-foreground" : "text-white hover:bg-white/10 hover:text-white"
                )}
                aria-label="Odpri meni"
              >
                <Menu className="size-5" aria-hidden="true" />
              </Button>
            </SheetTrigger>
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
                {navLinks.map((link) => (
                  <SheetClose asChild key={link.href}>
                    <Link
                      href={link.href}
                      className="rounded-md px-3 py-3 text-base font-medium text-foreground/90 transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      {link.label}
                    </Link>
                  </SheetClose>
                ))}

                {/* FW3: sekundarne povezave (nivo 2) pod ločilom */}
                <div className="my-2 h-px bg-border" aria-hidden="true" />
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Razišči več
                </p>
                {secondaryLinks.map((link) => (
                  <SheetClose asChild key={link.href}>
                    <Link
                      href={link.href}
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

              <div className="mt-4 px-2">
                <LanguageSwitcher />
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
                  AI vam sestavi itinerer v sekundah.
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
      <SmartSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  );
}

export default Navigation;
