"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Compass, Home, Search } from "lucide-react";

// ============================================================================
// ROOT NOT-FOUND (404) — Issue #3 (revizija 5-D, točka 15: stanja)
// ============================================================================
//
// Prej: privzeti Next.js 404 (brez blagovne znamke, brez izhodov).
// Zdaj: prijazna 404 stran z dvema izhodoma na zlato pot — domov (DISCOVER)
// in načrtuj (PLAN). Dvojezična detekcija po poti (/en prefix) — ISTI vzorec
// kot pot/[shareId]/error.tsx (klientka detekcija, ker not-found teče izven
// RSC prevajalske plasti za ne-lokalizirane/nezname poti).
//
// POLISH 1.173.0/1.173.2: naslov zavihka (tab title). not-found.tsx NE MORE
// izvoziti Next metadata (spec), layoutov statični naslov pa velja za vse
// neznane poti. Ugotovitve produkcijske QA na <head>:
//  • klientski efekt SAM (1.173.0) je izgubil tekmo — Nextova metapodatkovna
//    plast ga je prepisala NAZAJ po hidraciji;
//  • deklarativen <title> (1.173.1, React 19 hoisting) se je pripel ZA
//    layoutovim — brskalnik upošteva PRVEGA <title> v <head> (opazovanih
//    3: layout + 2 dvignjena).
// Rešitev 1.173.2: efekt počisti VSE <title> in zapiše enega samega —
// po definiciji ni konkurenta. Ob odhodu s 404 naš element odstranimo;
// Nextov client router ob navigaciji v nov vdih vnese naslov nove rute.
// ============================================================================
const TITLE_SL = "404 — Te strani (še) ni na zemljevidu | Discover Slovenia AI";
const TITLE_EN = "404 — This page is not on the map yet | Discover Slovenia AI";

export default function NotFound() {
  const isEn =
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/en");

  useEffect(() => {
    const wanted = isEn ? TITLE_EN : TITLE_SL;
    // Počisti VSE naslove (layout metadata + morebitni dvignjeni) —
    // brskalnik upošteva prvega, morebitni konkurent pomeni neveljaven tab.
    document.querySelectorAll("title").forEach((t) => t.remove());
    const title = document.createElement("title");
    title.textContent = wanted;
    document.head.appendChild(title);
    return () => {
      // Ob odhodu s 404 (klientka navigacija) odstranimo svoj naslov —
      // naslednja ruta prinese svojega (Next metadata ob renderu).
      title.remove();
    };
  }, [isEn]);

  return (
    <main
      role="main"
      className="flex min-h-[80vh] flex-col items-center justify-center gap-6 bg-background px-4 py-16 text-center"
    >
      <div className="max-w-md space-y-4">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10">
          <Compass className="size-7 text-primary" aria-hidden="true" />
        </div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
          404
        </p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {isEn
            ? "This page is not on the map yet"
            : "Te strani (še) ni na zemljevidu"}
        </h1>
        <p className="text-muted-foreground">
          {isEn
            ? "The link doesn't lead anywhere — but we can take you back to the right path."
            : "Povezava ne vodi nikamor — lahko pa te peljemo nazaj na pravo pot."}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            href={isEn ? "/en" : "/"}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Home className="size-4" aria-hidden="true" />
            {isEn ? "Back to start" : "Nazaj na začetek"}
          </Link>
          <Link
            href={isEn ? "/en/nacrtuj" : "/nacrtuj"}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            <Search className="size-4" aria-hidden="true" />
            {isEn ? "Plan a trip" : "Načrtuj potovanje"}
          </Link>
        </div>
      </div>
    </main>
  );
}
