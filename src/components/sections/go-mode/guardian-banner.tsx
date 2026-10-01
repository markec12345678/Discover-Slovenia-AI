"use client";

// ============================================================================
// ISSUE #22 §4/§30.E — GUARDIAN BANNER: stanje dneva na enem pogledu
// ============================================================================
// Prva stvar, ki jo uporabnik vidi na /na-poti po glavi: 🟢/🟠/🔴/⚪ stanje
// Z DEJANSKIMI številkami pod njim (ena vrstica — ONE DECISION AT A TIME §21).
// Tehniški izraz "Trip Health" je NIKOLI izpisan (§30.E — uporabniška imena).
//
// A11Y: role=status + aria-live=polite (bralnik zasliši spremembo stanja);
// barvni indikator ima tudi besedno vrednost (ni samo barva).
// ============================================================================

import { cn } from "@/lib/utils";
import type { GuardianSnapshot } from "@/lib/journey/trip-health";

const TONE: Record<
  GuardianSnapshot["health"],
  {
    icon: string;
    card: string;
    title: string;
  }
> = {
  ON_TRACK: {
    icon: "🟢",
    card:
      "border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950",
    title: "text-emerald-900 dark:text-emerald-200",
  },
  NEEDS_ATTENTION: {
    icon: "🟠",
    card:
      "border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950",
    title: "text-amber-900 dark:text-amber-200",
  },
  BLOCKED: {
    icon: "🔴",
    card: "border-red-400 bg-red-50 dark:border-red-800 dark:bg-red-950",
    title: "text-red-900 dark:text-red-200",
  },
  UNKNOWN: {
    icon: "⚪",
    card: "border-border bg-muted/40",
    title: "text-muted-foreground",
  },
};

export interface GuardianBannerProps {
  snapshot: GuardianSnapshot;
  lang: "sl" | "en";
}

/** Stanje dneva: naslov (🟢 VSE TEČE PO NAČRTU …) + ena vrstica dejstev. */
export function GuardianBanner({ snapshot, lang }: GuardianBannerProps) {
  const tone = TONE[snapshot.health];
  const t = (o: { sl: string; en: string }) => o[lang];
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3",
        tone.card
      )}
    >
      <span aria-hidden="true" className="text-xl leading-none">
        {tone.icon}
      </span>
      <div className="min-w-0 space-y-0.5">
        <p className={cn("text-sm font-bold tracking-wide", tone.title)}>
          {t(snapshot.headline)}
        </p>
        <p className="text-xs text-muted-foreground">{t(snapshot.detail)}</p>
      </div>
    </div>
  );
}
