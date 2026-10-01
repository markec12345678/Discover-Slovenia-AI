"use client";

// ============================================================================
// ISSUE #22 §9/§10/§11/§30.F — GUARDIAN FREE-TIME SEKCIJA
// ============================================================================
// "Imaš približno 45 min prostega časa — Kaj lahko narediš v bližini?"
// [Znamenitosti][Hrana][Kava][Sprehod] → max 4 varno preverjeni kandidati
// (celotna zanka ≤ okno − varnostna rezerva — nikoli ne povzročijo zamude).
//
// Iskrenost: odpiralni čas neznan → izrecno povedan; kandidatov brez signala
// (ali ob napaki) NI — načrt in časovnica delujejo naprej (§23 negativni E2E).
// Dodajanje v pot: SAMO v2 zapisi (go-edit) — v1 pokaže iskreno opombo.
// ============================================================================

import { Coffee, MapPin, Utensils, Footprints, Landmark } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  FREE_TIME_LABELS,
  NEARBY_CATEGORY_LABELS,
  type FreeTimeWindow,
  type GuardianNearbyCategory,
  type NearbyFit,
} from "@/lib/journey/free-time";

const CATEGORY_ICON: Record<GuardianNearbyCategory, typeof Landmark> = {
  sight: Landmark,
  food: Utensils,
  drink: Coffee,
  walk: Footprints,
};

/** Vrstni red gumbov kategorij (§30.F). */
const CATEGORIES: GuardianNearbyCategory[] = ["sight", "food", "drink", "walk"];

export interface GuardianFreeTimeProps {
  window: FreeTimeWindow;
  lang: "sl" | "en";
  /** Izbrana kategorija (null = še ni izbire — izpis poklika). */
  selectedCategory: GuardianNearbyCategory | null;
  onCategorySelect: (category: GuardianNearbyCategory) => void;
  /** Prikazani kandidati (že prefiltrirani — varnostna vrata enginea). */
  fits: NearbyFit[];
  loading: boolean;
  /** Napaka omrežja/dostopnosti (iskrena opomba — neblokirajoče). */
  unavailable: boolean;
  /** Ali je dodajanje v pot mogoče (v2 zapis — sicer klik pove iskreno opombo). */
  canAdd: boolean;
  /** Povratna informacija (uspeh dodajanja ali v1 opomba — iskren feedback). */
  note?: { sl: string; en: string } | null;
  onAdd: (fit: NearbyFit) => void;
}

export function GuardianFreeTimeSection({
  window,
  lang,
  selectedCategory,
  onCategorySelect,
  fits,
  loading,
  unavailable,
  canAdd,
  note,
  onAdd,
}: GuardianFreeTimeProps) {
  const t = (o: { sl: string; en: string }) => o[lang];

  return (
    <section
      aria-label={t(FREE_TIME_LABELS.title)}
      className="space-y-3 rounded-lg border border-emerald-300 bg-emerald-50/60 px-4 py-3 dark:border-emerald-800 dark:bg-emerald-950/40"
    >
      <div className="space-y-0.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          ⏳ {t(FREE_TIME_LABELS.title)}
        </p>
        <p className="text-sm font-bold text-emerald-900 dark:text-emerald-100">
          {lang === "sl"
            ? FREE_TIME_LABELS.headline.sl(window.minutes)
            : FREE_TIME_LABELS.headline.en(window.minutes)}{" "}
          <span className="font-normal text-muted-foreground">
            ·{" "}
            {lang === "sl"
              ? FREE_TIME_LABELS.until.sl(window.endsAtHhmm)
              : FREE_TIME_LABELS.until.en(window.endsAtHhmm)}
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          {lang === "sl"
            ? FREE_TIME_LABELS.safety.sl(window.safetyMin)
            : FREE_TIME_LABELS.safety.en(window.safetyMin)}
        </p>
      </div>

      {/* Kategorije — uporabnikova izbira (§30.F naravna imena) */}
      <div className="flex flex-wrap gap-2" role="group" aria-label={t(FREE_TIME_LABELS.question)}>
        {CATEGORIES.map((cat) => {
          const Icon = CATEGORY_ICON[cat];
          const active = selectedCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => onCategorySelect(cat)}
              aria-pressed={active}
              className={cn(
                "inline-flex h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors",
                active
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-border bg-background text-foreground hover:border-emerald-600/50"
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {t(NEARBY_CATEGORY_LABELS[cat])}
            </button>
          );
        })}
      </div>

      {/* Kandidati — SAMO po izbiri kategorije (ne preplavimo §11). */}
      {selectedCategory != null && (
        <div className="space-y-2" aria-live="polite">
          {loading ? (
            <>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </>
          ) : unavailable ? (
            <p className="text-xs text-muted-foreground">
              {t(FREE_TIME_LABELS.unavailable)}
            </p>
          ) : fits.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t(FREE_TIME_LABELS.empty)}
            </p>
          ) : (
            fits.map((fit) => (
              <div
                key={fit.candidate.key}
                className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="truncate">{fit.candidate.title}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {lang === "sl"
                      ? FREE_TIME_LABELS.fitLine.sl({
                          drive: fit.driveThereMin,
                          visit: fit.visitMin,
                          back: fit.driveBackMin,
                        })
                      : FREE_TIME_LABELS.fitLine.en({
                          drive: fit.driveThereMin,
                          visit: fit.visitMin,
                          back: fit.driveBackMin,
                        })}
                    {" · ~"}
                    {fit.distanceKm} km
                  </p>
                  <Badge
                    variant="outline"
                    className="px-1.5 py-0 text-[10px] font-normal text-muted-foreground"
                  >
                    {fit.opening === "OPEN"
                      ? t(FREE_TIME_LABELS.openNow)
                      : t(FREE_TIME_LABELS.closedUnknown)}
                  </Badge>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-11 shrink-0"
                  onClick={() => onAdd(fit)}
                  title={
                    canAdd
                      ? undefined
                      : lang === "sl"
                        ? "Ta pot je kanonična — dodajanje med potjo ni mogoče"
                        : "This trip is canonical — adding stops mid-trip is not possible"
                  }
                >
                  + {lang === "sl" ? "V mojo pot" : "To my trip"}
                </Button>
              </div>
            ))
          )}
          {note && (
            <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
              {t(note)}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
