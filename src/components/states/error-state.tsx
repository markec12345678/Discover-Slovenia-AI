"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { useLocale } from "next-intl";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ============================================================================
// ERROR STATE — družina stanj TASK 8 / F3-B (issue #8 §34, D8-A P-STATE-2:
// 5 konkurenčnih error slovnic — rdeče besedilo, črtkasta škatla, amber
// vrstica, destructive Alert, 503 banner).
// ============================================================================
// Dve zavedeni slovnici:
//  - "destructive" (default): rdeči Alert (ista slovnica kot napaka
//    generiranja v načrtovalniku — itinerary-planner.tsx TASK 80) z
//    opombo + izbirnim gumbom „Poskusi znova" (≥44px dotik);
//  - "warning": amber vrstica role="alert" (ista slovnica kot SmartSearch
//    K-5 — resnično, nevsiljivo opozorilo degraded stanja).
//
// ISKRENOST: napaka se vedno pokaže takšna, kot je — NIKOLI ne laže o
// uspehu (K-5). Besedilo sporočila prinese klicatelj (resnična napaka iz
// API-ja), naslov/ponovitev imata L-pattern privzete vrednosti (SL/EN —
// uporaba kot pri LoadingState; `lang` = SSR-varna explicitna pot).
// ============================================================================

const L = {
  sl: {
    title: "Nekaj ni uspelo",
    retry: "Poskusi znova",
  },
  en: {
    title: "Something went wrong",
    retry: "Try again",
  },
} as const;

export function ErrorState({
  /** Resnično sporočilo napake (iz API-ja / omrežja) — nikoli generično „OK". */
  message,
  /** Ponovitev dejanja (ponovni fetch / re-run). Brez → samo sporočilo. */
  onRetry,
  /** Besedilo gumba ponovitve (default: L-vrednost). */
  retryLabel,
  /** "destructive" (rdeči Alert) | "warning" (amber vrstica). */
  variant = "destructive",
  /** Naslov (default: L-vrednost). */
  title,
  /** SSR-varna explicitna izbira jezika (default: useLocale). */
  lang,
  className,
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  variant?: "destructive" | "warning";
  title?: string;
  lang?: "sl" | "en";
  className?: string;
}) {
  // Hook se pokliče VEDNO (pravila hookov) — `lang` ga le po želji obide.
  const locale = useLocale();
  const effectiveLang: "sl" | "en" = lang ?? (locale === "en" ? "en" : "sl");
  const heading = title ?? L[effectiveLang].title;
  const retry = retryLabel ?? L[effectiveLang].retry;

  const retryButton = onRetry ? (
    <Button
      type="button"
      variant="outline"
      onClick={onRetry}
      className="gap-1.5 sm:min-h-[44px] min-h-11"
    >
      <RefreshCw className="size-3.5" aria-hidden="true" />
      {retry}
    </Button>
  ) : null;

  if (variant === "warning") {
    // Amber vrstica — SmartSearch K-5 slovnica (degraded, ne usodno).
    return (
      <div
        role="alert"
        className={cn(
          "flex flex-wrap items-start gap-2 p-4 text-sm text-amber-700 dark:text-amber-400",
          className
        )}
      >
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">{message}</span>
        {retryButton}
      </div>
    );
  }

  // Destructive — enaka slovnica kot napaka generiranja načrta (TASK 80).
  // (ui/alert ima role="alert" že v primitivu; eksplicitno zaradi pogodbe.)
  return (
    <Alert variant="destructive" role="alert" className={className}>
      <AlertCircle className="size-4" aria-hidden="true" />
      <AlertTitle>{heading}</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>{message}</p>
        {retryButton}
      </AlertDescription>
    </Alert>
  );
}
