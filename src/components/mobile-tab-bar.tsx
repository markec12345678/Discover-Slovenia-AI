"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { useLocale } from "next-intl";
import { Compass, Map as MapIcon, Menu, Navigation, Route } from "lucide-react";

import { cn } from "@/lib/utils";
import { Link } from "@/i18n/navigation";
import { useMyTrip } from "@/hooks/use-my-trip";
import { trackPlannerEvent } from "@/lib/planner-analytics";

/**
 * MobileTabBar — mobilna spodnja navigacijska vrstica (TASK 8 / D8-E,
 * issue #8 §52 / D8-B §6.2; preoblikovano v Issue #16 fazi 1).
 *
 * ISSUE #16 (UX/IA KONSOLIDACIJA — ONE JOURNEY, ONE HOME, ZERO FEATURE
 * LOSS): mentalni model ODKRIJ → DODAJ → MOJA POT → NAČRTUJ → POJDI.
 * Vrstica sledi issue §Navigacijska arhitektura (Mobile):
 *
 *   ODKRIJ | ZEMLJEVID | MOJA POT | POJDI | VEČ
 *
 * - ODKRIJ (/destinacije) — primarna vstopna površina raziskovanja (detajl
 *   destinacije je del odkrivanja: /destinacija/*).
 * - ZEMLJEVID (/zemljevid) — samostojna močna discovery površina (#16 §4).
 * - MOJA POT (/moja-potovanja) — SREDINSKI poudarjen zavihek + števčna
 *   značka iz zbirke dai:my-trip-items: osrednji trip hub aplikacije
 *   (#16 §2 „Kaj je moja pot in kaj je naslednji korak?"). Aktivna TUDI
 *   na /nacrtuj + /potovanje (korak NAČRTUJ živi v kontekstu Moja pot —
 *   isto staro pravilo aktivnosti, preneseno z upokojenega zavihka
 *   Načrtuj: načrtovanje je del poti, ne vzporedna aplikacija).
 * - POJDI (/na-poti) — ločen aktivni način (#16 §3) zdaj v primarni
 *   vrstici (prej pokopan pod Več — največja IA vrzel audita).
 * - VEČ — odpre obstoječi mobilni Sheet meni iz Navigation (progressive
 *   disclosure #16 §5 — ne izguba funkcij; /na-poti je iz MORE_MENU_ROUTES
 *   odstranjen, ker ima ZDAJ lastni zavihek).
 *
 * Nadomešča hamburger gumb v headerju (meni OSTAJA — odpre se prek zavihka
 * "Več" in Sheet vsebuje vseh 15 destinacij). Vidna SAMO <lg (desktop
 * header ima svojo strukturo Odkrij · Moja pot · Zemljevid · Pojdi · Več).
 *
 * Aktivno stanje (startsWith logika, dokumentirano):
 * - /destinacije + /destinacija/* → Odkrij
 * - /zemljevid → Zemljevid
 * - /moja-potovanja + /nacrtuj + /potovanje → Moja pot (hub + načrtovanje)
 * - /na-poti → Pojdi
 * - /dozivetja, /vodici, /dogodki, /lokali, /trznica, /slovenia-pass,
 *   /za-ponudnike, /primerjava, /prijava → Več (poti, ki živijo v Sheetu)
 *
 * Tehnično: postavi body[data-mobile-tabbar="true"] (globals.css dviga
 * chat FAB/panel nad vrstico), pb-[env(safe-area-inset-bottom)] za iPhone,
 * dot-tarče ≥44px, aria-current="page" ko aktivno.
 */
const L = {
  sl: {
    explore: "Odkrij",
    map: "Zemljevid",
    myTrip: "Moja pot",
    go: "Pojdi",
    more: "Več",
    moreAria: "Odpri meni",
    myTripBadge: (n: number) =>
      n === 1 ? "1 ideja v moji poti" : `${n} idej v moji poti`,
  },
  en: {
    explore: "Discover",
    map: "Map",
    myTrip: "My trip",
    go: "Go",
    more: "More",
    moreAria: "Open menu",
    myTripBadge: (n: number) =>
      n === 1 ? "1 idea in my trip" : `${n} ideas in my trip`,
  },
  // W1 faza 2a (Issue #15): mobilna vrstica živi na destinacijskih straneh
  // — IT/DE imata svoje oznake (isti vzorec kot Navigation NAV_L).
  it: {
    explore: "Scopri",
    map: "Mappa",
    myTrip: "Il mio viaggio",
    go: "Vai",
    more: "Altro",
    moreAria: "Apri il menù",
    myTripBadge: (n: number) =>
      n === 1 ? "1 idea nel mio viaggio" : `${n} idee nel mio viaggio`,
  },
  de: {
    explore: "Entdecken",
    map: "Karte",
    myTrip: "Meine Reise",
    go: "Los",
    more: "Mehr",
    moreAria: "Menü öffnen",
    myTripBadge: (n: number) =>
      n === 1 ? "1 Idee in meiner Reise" : `${n} Ideen in meiner Reise`,
  },
  // W12 (smer 2, faza 1): FR/ES — vrstica je globalni krom (živi tudi na
  // FR/ES whitelistnih poteh — /, /destinacije, info strani).
  // Issue #16 faza 1: oznake po novem modelu (Odkrij/Pojdi namesto
  // Razišči/Načrtuj v sredini).
  fr: {
    explore: "Découvrir",
    map: "Carte",
    myTrip: "Mon voyage",
    go: "Aller",
    more: "Plus",
    moreAria: "Ouvrir le menu",
    myTripBadge: (n: number) =>
      n === 1 ? "1 idée dans mon voyage" : `${n} idées dans mon voyage`,
  },
  es: {
    explore: "Descubrir",
    map: "Mapa",
    myTrip: "Mi viaje",
    go: "Ir",
    more: "Más",
    moreAria: "Abrir el menú",
    myTripBadge: (n: number) =>
      n === 1 ? "1 idea en mi viaje" : `${n} ideas en mi viaje`,
  },
} as const;

/**
 * Poti, ki živijo v Sheet meniju ("Več" je zanje sidro) — Issue #16 §5
 * progressive disclosure. /na-poti je IZ seznama (lastni zavihek POJDI);
 * /dozivetja + /vodici sta PRIDRUŽENA (iz primarne vrstice sta se umaknila
 * pod Več — odkrivanje ostaja dostopno, a izven primarnih 5);
 * /primerjava + /prijava sta dodani (prej samo noga — vrzel audita).
 */
const MORE_MENU_ROUTES = [
  "/dozivetja",
  "/vodici",
  "/dogodki",
  "/lokali",
  "/trznica",
  "/slovenia-pass",
  "/za-ponudnike",
  "/primerjava",
  "/prijava",
];

/** Oznake zavihkov (samo nizinski ključi — brez aria/badge pomočnikov). */
type TabLabelKey = "explore" | "map" | "myTrip" | "go" | "more";

/** ISSUE #16 F5 „analitika lupine": preslikava zavihka → dogodkovni tab. */
const TAB_EVENT: Record<TabLabelKey, "explore" | "map" | "my_trip" | "go" | "more"> = {
  explore: "explore",
  map: "map",
  myTrip: "my_trip",
  go: "go",
  more: "more",
};

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
    href: "/moja-potovanja",
    icon: Route,
    labelKey: "myTrip",
    center: true,
    badge: true,
    // Hub Moja pot + korak NAČRTUJ (issue #16: načrtovanje je del poti —
    // /nacrtuj + /potovanje osvetlita MOJA POT, ne vzparenega zavihka).
    match: (p) =>
      p === "/moja-potovanja" ||
      p === "/nacrtuj" ||
      p.startsWith("/potovanje"),
  },
  {
    href: "/na-poti",
    icon: Navigation,
    labelKey: "go",
    match: (p) => p === "/na-poti" || p.startsWith("/na-poti/"),
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
  // W1 faza 2a: 4 javni jeziki (vrstica živi na destinacijskih straneh)
  // W12 (smer 2, faza 1): +fr/es (globalni krom na FR/ES poteh)
  const t =
    locale === "en" || locale === "it" || locale === "de" || locale === "fr" || locale === "es"
      ? L[locale]
      : L.sl;
  const { count } = useMyTrip();

  // ISSUE #16 F5 „analitika lupine": vsak klik zavihka izstreli
  // shell_nav_clicked {tab, surface: "tabbar"} (fire-and-forget, brez PII —
  // pri my_trip tudi items = velikost zbirke ob kliku, meri "zbirka → hub").
  const trackTab = (labelKey: TabLabelKey) => {
    trackPlannerEvent(
      "shell_nav_clicked",
      labelKey === "myTrip"
        ? { tab: TAB_EVENT[labelKey], surface: "tabbar", items: count }
        : { tab: TAB_EVENT[labelKey], surface: "tabbar" }
    );
  };

  // FW4.3-2: usePathname vrača ZUNANJI URL — odstrani `/en` prefix, da
  // ujemanje zavihkov deluje tudi na angleški različici (isti vzorec kot
  // LanguageSwitcher; upokojena StickyMobileCTA ga je uporabljala enako).
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

          // Sredinski zavihek (MOJA POT — issue #16 §2 osrednji trip hub):
          // poudarjena primarna akcija — napolnjen dvignjen kroglec
          // (premium center action) + števčna značka zbirke dai:my-trip-items
          // (bg-background kontrast nad primarnim kroglecem).
          if (tab.center) {
            return (
              <Link
                key={tab.href}
                href={tab.href as string}
                onClick={() => trackTab(tab.labelKey)}
                aria-current={active ? "page" : undefined}
                className="flex min-h-[44px] flex-col items-center justify-end gap-0.5 rounded-lg pb-2 pt-1 text-[11px] font-medium"
              >
                <span
                  className={cn(
                    "-mt-5 relative flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background transition-transform active:scale-95",
                    active && "shadow-primary/30"
                  )}
                >
                  <Icon className="size-5" aria-hidden="true" />
                  {/* Števčna značka zbirke "Moja pot" na kroglici */}
                  {tab.badge && count > 0 ? (
                    <span
                      className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-background px-1 text-[10px] font-bold leading-none text-foreground shadow-sm ring-2 ring-primary"
                      aria-label={t.myTripBadge(count)}
                    >
                      {count > 99 ? "99+" : count}
                    </span>
                  ) : null}
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
                onClick={() => {
                  trackTab("more");
                  onMore();
                }}
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
              onClick={() => trackTab(tab.labelKey)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-2 text-[11px] font-medium transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {/* Značka zbirke "Moja pot" živi ZDAJ na sredinskem kroglici
                  (issue #16 — Moja pot je hub); ostali zavihki so brez nje. */}
              <span className="relative">
                <Icon className="size-5" aria-hidden="true" />
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
