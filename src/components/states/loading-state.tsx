"use client";

import { Loader2 } from "lucide-react";
import { useLocale } from "next-intl";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ============================================================================
// LOADING STATE — družina stanj TASK 8 / F3-B (issue #8 §31/§32, D8-A
// P-STATE-2: „~58 površin, vsaka svoja slovnica nalaganja").
// ============================================================================
// Enotna slovnica nalaganja, modelirana po zlatih standardih repozitorija:
//  - statusna vrstica generiranja (itinerary-planner.tsx — TASK 77/80):
//    role="status" + aria-live="polite" neseta OBVESTILO bralnikom zaslonov,
//    skeleti so čisto dekorativni (aria-hidden);
//  - SmartSearch (pulse vrstice + oznaka + spinner).
//
// I18n: privzeta oznaka je L-pattern (SL/EN prek useLocale — isti vzorec kot
// AddToTripButton). Klicatelj lahko poda lastno oznako (površina pozna svoj
// besednjak) ali `lang` (SSR-varna pot brez useLocale — za uporabo izven
// provider konteksta / strežniške boundaryje). TRDI predpogoj za F3-E
// (EN razširitev): nobena nova površina ne sme več hardcodati „Nalagam …".
//
// NEINTERAKTIVNA komponenta — ni dotikovnih ciljev, samo spoštljivi
// razmiki in resnično sporočilo (nikoli ne laže o uspehu).
// ============================================================================

const L = {
  sl: {
    loading: "Nalagam …",
  },
  en: {
    loading: "Loading …",
  },
} as const;

export function LoadingState({
  /** Oznaka (vidna + bralnikom). Izpuščena → privzeta L-vrednost. */
  label,
  /** Število dekorativnih skeleton vrstic (0 = samo vrstica z oznako). */
  rows = 0,
  /** "inline" — vrstica v toku vsebine; "block" — sredinsko območje. */
  variant = "inline",
  /** SSR-varna explicitna izbira jezika (default: useLocale). */
  lang,
  className,
}: {
  label?: string;
  rows?: number;
  variant?: "inline" | "block";
  lang?: "sl" | "en";
  className?: string;
}) {
  // Hook se pokliče VEDNO (pravila hookov) — `lang` ga le po želji obide.
  const locale = useLocale();
  const effectiveLang: "sl" | "en" = lang ?? (locale === "en" ? "en" : "sl");
  const text = label ?? L[effectiveLang].loading;

  if (variant === "inline") {
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "flex items-center gap-2 text-sm text-muted-foreground",
          className
        )}
      >
        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
        <span>{text}</span>
        {rows > 0 && (
          <div aria-hidden="true" className="flex flex-1 flex-col gap-2">
            {Array.from({ length: rows }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-10 text-muted-foreground",
        className
      )}
    >
      {/* Obvestilo nosi VRSTICA (TASK 77): skeleti spodaj so dekorativni. */}
      <p
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 text-sm"
      >
        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
        {text}
      </p>
      {rows > 0 && (
        <div aria-hidden="true" className="mt-2 w-full space-y-3">
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}
    </div>
  );
}
