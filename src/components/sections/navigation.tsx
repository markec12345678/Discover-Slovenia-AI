"use client";

import * as React from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Mountain, Menu, Sun, Moon, Compass } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";


/**
 * Navigacijske povezave — deljene med desktop in mobilno Sheet varianto.
 * Anchor linki kažejo na sekcije znotraj enostranske aplikacije.
 */
const NAV_LINKS: { href: string; label: string }[] = [
  { href: "#destinacije", label: "Destinacije" },
  { href: "#načrtuj", label: "AI načrtovalec" },
  { href: "#zemljevid", label: "Zemljevid" },
  { href: "#lokali", label: "Lokali" },
  { href: "#dogodki", label: "Dogodki" },
  { href: "#pridruzi-se", label: "Pridruži se" },
];

export function Navigation() {
  const [mounted, setMounted] = React.useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  // Cart store — itemCount() prikazujemo šele po mountu, da se izognemo
  // hydration mismatchu (Zustand persist prebere localStorage šele na klientu).
  const itemCount = 0;
  const openCart = () => {};

  React.useEffect(() => setMounted(true), []);

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Logotip */}
        <Link
          href="#vrh"
          className="flex items-center gap-2 text-foreground transition-colors hover:text-primary"
          aria-label="I Feel Slovenia — domov"
        >
          <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
            <Mountain className="size-5" aria-hidden="true" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-sm font-bold tracking-tight sm:text-base">
              I Feel Slovenia
            </span>
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              AI potovanja
            </span>
          </span>
        </Link>

        {/* Desktop navigacija */}
        <nav
          className="hidden items-center gap-1 lg:flex"
          aria-label="Glavna navigacija"
        >
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Desno: theme toggle + CTA + mobile menu */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label="Preklopi temo"
            className="text-foreground"
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

          <Button
            asChild
            size="sm"
            className="hidden bg-primary text-primary-foreground hover:bg-primary/90 sm:inline-flex"
          >
            <Link href="#načrtuj">Načrtuj potovanje</Link>
          </Button>

          {/* Mobilni hamburger meni */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
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
                  I Feel Slovenia
                </span>
              </SheetTitle>

              <nav
                className="mt-2 flex flex-col gap-1 px-2"
                aria-label="Mobilna navigacija"
              >
                {NAV_LINKS.map((link) => (
                  <SheetClose asChild key={link.href}>
                    <Link
                      href={link.href}
                      className="rounded-md px-3 py-3 text-base font-medium text-foreground/90 transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      {link.label}
                    </Link>
                  </SheetClose>
                ))}
              </nav>

              <div className="mt-auto px-4 pb-6">
                <SheetClose asChild>
                  <Button
                    asChild
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                    size="lg"
                  >
                    <Link href="#načrtuj">Načrtuj potovanje</Link>
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
    </header>
  );
}

export default Navigation;
