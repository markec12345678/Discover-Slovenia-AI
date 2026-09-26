"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { useLocale } from "next-intl";
import { Compass, Map as MapIcon, Menu, Route, Wand2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Link } from "@/i18n/navigation";
import { useMyTrip } from "@/hooks/use-my-trip";

/**
 * MobileTabBar — mobilna spodnja navigacijska vrstica (TASK 8 / D8-E,
 * issue #8 §52 / D8-B §6.2).
 *
 * Nadomešča hamburger gumb v headerju (meni OSTAJA — odpre se prek zavihka
 * "Več" in Sheet vsebuje vseh 13 destinacij) in StickyMobileCTA na straneh
 * z lupino. Vidna SAMO <lg (desktop header ostaja nespremenjen).
 *
 * 5 zavihkov: Razišči (/destinacije) · Zemljevid (/zemljevid) ·
 * Načrtuj (/nacrtuj — sredinski, poudarjen) · Moja pot (/moja-potovanja,
 * števčna značka iz zbirke dai:my-trip-items) · Več (odpre obstoječi
 * mobilni Sheet meni iz Navigation — NE nov meni).
 *
 * Aktivno stanje (startsWith logika, dokumentirano):
 * - /destinacije + /destinacija/* → Razišči (detajl destinacije je del
 *   odkrivanja)
 * - /zemljevid → Zemljevid
 * - /nacrtuj + /potovanje → Načrtuj (oba načrtovalnika — D8-B IA: PLAN)
 * - /moja-potovanja → Moja pot
 * - /na-poti, /dogodki, /lokali, /trznica, /slovenia-pass, /za-ponudnike →
 *   Več (te poti živijo SAMO v Sheet meniju → "Več" kot sidro; /na-poti je
 *   GO ločen način, a živi pod Več v meniju, zato tam tudi ostane)
 *
 * Tehnično: postavi body[data-mobile-tabbar="true"] (globals.css dviga
 * chat FAB/panel nad vrstico), pb-[env(safe-area-inset-bottom)] za iPhone,
 * dot-tarče ≥44px, aria-current="page" ko aktivno.
 */
const L = {
  sl: {
    explore: "Razišči",
    map: "Zemljevid",
    plan: "Načrtuj",
    myTrip: "Moja pot",
    more: "Več",
    moreAria: "Odpri meni",
    myTripBadge: (n: number) =>
      n === 1 ? "1 ideja v moji poti" : `${n} idej v moji poti`,
  },
  en: {
    explore: "Explore",
    map: "Map",
    plan: "Plan",
    myTrip: "My trip",
    more: "More",
    moreAria: "Open menu",
    myTripBadge: (n: number) =>
      n === 1 ? "1 idea in my trip" : `${n} ideas in my trip`,
  },
} as const;

/** Poti, ki živijo SAMO v mobilnem Sheet meniju (Več je zanje sidro). */
const MORE_MENU_ROUTES = [
  "/na-poti",
  "/dogodki",
  "/lokali",
  "/trznica",
  "/slovenia-pass",
  "/za-ponudnike",
];

/** Oznake zavihkov (samo nizinski ključi — brez aria/badge pomočnikov). */
type TabLabelKey = "explore" | "map" | "plan" | "myTrip" | "more";

interface TabDef {
  href: string | null;
  icon: typeof Compass;
  labelKey: TabLabelKey;
  center?: boolean;
  badge?: boolean;
  match: (path: string) => boolean;
}

const TABS: TabDef[] = [
  {
    href: "/destinacije",
    icon: Compass,
    labelKey: "explore",
    match: (p) => p === "/destinacije" || p.startsWith("/destinacija"),
  },
  {
    href: "/zemljevid",
    icon: MapIcon,
    labelKey: "map",
    match: (p) => p === "/zemljevid",
  },
  {
    href: "/nacrtuj",
    icon: Wand2,
    labelKey: "plan",
    center: true,
    match: (p) => p === "/nacrtuj" || p.startsWith("/potovanje"),
  },
  {
    href: "/moja-potovanja",
    icon: Route,
    labelKey: "myTrip",
    badge: true,
    match: (p) => p === "/moja-potovanja",
  },
  {
    href: null,
    icon: Menu,
    labelKey: "more",
    match: (p) => MORE_MENU_ROUTES.some((r) => p === r || p.startsWith(`${r}/`)),
  },
];

export function MobileTabBar({ onMore }: { onMore: () => void }) {
  const rawPathname = usePathname() ?? "/";
  const locale = useLocale() as string;
  const t = L[locale === "en" ? "en" : "sl"];
  const { count } = useMyTrip();

  // FW4.3-2: usePathname vrača ZUNANJI URL — odstrani `/en` prefix, da
  // ujemanje zavihkov deluje tudi na angleški različici (isti vzorec kot
  // StickyMobileCTA / LanguageSwitcher).
  const pathname =
    rawPathname === "/en" ? "/" : rawPathname.replace(/^\/en(?=\/)/, "");

  // globals.css: chat FAB + panel se dvigneta nad vrstico (<lg).
  React.useEffect(() => {
    document.body.dataset.mobileTabbar = "true";
    return () => {
      delete document.body.dataset.mobileTabbar;
    };
  }, []);

  return (
    <nav
      aria-label="Spodnja mobilna navigacija"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 lg:hidden",
        "border-t border-border/70 bg-background/90 backdrop-blur-xl supports-[backdrop-filter]:bg-background/75",
        "pb-[env(safe-area-inset-bottom,0px)]",
        "shadow-[0_-4px_24px_-12px_rgba(0,0,0,0.18)]"
      )}
    >
      <div className="mx-auto grid max-w-lg grid-cols-5 items-end px-1">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          const Icon = tab.icon;
          const label = t[tab.labelKey];

          // Sredinski zavihek (Načrtuj) — poudarjena primarna akcija:
          // napolnjen dvignjen kroglec (premium center action).
          if (tab.center) {
            return (
              <Link
                key={tab.href}
                href={tab.href as string}
                aria-current={active ? "page" : undefined}
                className="flex min-h-[44px] flex-col items-center justify-end gap-0.5 rounded-lg pb-2 pt-1 text-[11px] font-medium"
              >
                <span
                  className={cn(
                    "-mt-5 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background transition-transform active:scale-95",
                    active && "shadow-primary/30"
                  )}
                >
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span className={active ? "text-primary" : "text-muted-foreground"}>
                  {label}
                </span>
              </Link>
            );
          }

          // "Več" — gumb, ki odpre obstoječi Sheet meni iz Navigation.
          if (tab.href === null) {
            return (
              <button
                key="tab-more"
                type="button"
                onClick={onMore}
                aria-haspopup="dialog"
                aria-label={t.moreAria}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-2 text-[11px] font-medium transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                <span>{label}</span>
              </button>
            );
          }

          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-2 text-[11px] font-medium transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span className="relative">
                <Icon className="size-5" aria-hidden="true" />
                {/* Števčna značka zbirke "Moja pot" (dai:my-trip-items) */}
                {tab.badge && count > 0 ? (
                  <span
                    className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground shadow-sm"
                    aria-label={t.myTripBadge(count)}
                  >
                    {count > 99 ? "99+" : count}
                  </span>
                ) : null}
              </span>
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default MobileTabBar;
