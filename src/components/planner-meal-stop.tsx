"use client";

import * as React from "react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Utensils, X } from "lucide-react";

import { DESTINATIONS } from "@/lib/slovenia-data";
import { fmtHm, specialtiesFor, type MealSuggestion } from "@/lib/meal-stops";
import { trackPlannerEvent } from "@/lib/planner-analytics";

// ============================================================================
// PLANNER MEAL STOP — backlog #6 "Postanki za hrano na dolgih etapah" (1.25.0)
// ============================================================================
//
// MEM: "realize 6 hours in that lunch should've happened two hours ago" —
// SVETOVALNA kartica pod povezovalnikom dolge etape (ne mutira načrta).
// Vsa številka so deterministične: časi iz time_slot postankov, minute etape
// iz iste OSRM plasti kot povezovalniki, kraj na koridorju iz geometrije
// backlog #5. Specialitete so KURIRANE in regionalne — brez imen lokalov,
// cen in ur (prazno ≠ izmišljeno).
//
// Kartica se prikaže SAMO, če dan sproži prag (najdaljša etapa ≥ 75 min ali
// skupna vožnja ≥ 120 min — glej meal-stops.ts) — največ ena na dan.

interface PlannerMealStopProps {
  suggestion: MealSuggestion;
}

export function PlannerMealStop({ suggestion }: PlannerMealStopProps) {
  const t = useTranslations("planner");
  const locale = useLocale() === "en" ? "en" : "sl";
  const [dismissed, setDismissed] = useState(false);
  const tracked = useRef(false);

  // Analitika: en "shown" na prikaz (remount ob novem načrtu je nova izpostavljenost)
  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;
    trackPlannerEvent("meal_suggestion_shown", {
      day: suggestion.day,
      kind: suggestion.kind,
      destination_id: suggestion.destId,
      leg_min: suggestion.legMin,
      day_drive_min: suggestion.dayDriveMin,
    });
  }, [suggestion]);

  if (dismissed) return null;

  const dishes = specialtiesFor(suggestion.destId, locale);
  const dest = DESTINATIONS.find((d) => d.id === suggestion.destId);
  const from = DESTINATIONS.find((d) => d.id === suggestion.fromId);
  const to = DESTINATIONS.find((d) => d.id === suggestion.toId);

  const lunchTime = fmtHm(12 * 60 + 30);
  const depart = suggestion.departMin !== null
    ? fmtHm(suggestion.departMin)
    : null;
  const arrive = suggestion.arriveMin !== null
    ? fmtHm(suggestion.arriveMin)
    : null;

  return (
    <section
      aria-label={t("mealTitle")}
      className="rounded-lg border border-amber-500/40 bg-amber-500/[0.06] p-3 dark:border-amber-400/30 dark:bg-amber-400/[0.06]"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Utensils
            className="size-4 shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden
          />
          {t("mealTitle")}
        </p>
        <button
          type="button"
          onClick={() => {
            setDismissed(true);
            trackPlannerEvent("meal_suggestion_dismissed", {
              day: suggestion.day,
              kind: suggestion.kind,
            });
          }}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t("mealDismiss")}
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>

      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        {suggestion.kind === "arrive" &&
          t("mealArrive", {
            min: suggestion.legMin,
            time: arrive ?? lunchTime,
            place: suggestion.destName,
          })}
        {suggestion.kind === "depart" &&
          t("mealDepart", {
            time: depart ?? lunchTime,
            place: suggestion.destName,
          })}
        {suggestion.kind === "enroute" &&
          t("mealEnroute", {
            min: suggestion.legMin,
            place: suggestion.destName,
            km: suggestion.offRouteKm,
            time: lunchTime,
          })}
        {suggestion.kind === "honest" &&
          t("mealHonest", {
            min: suggestion.legMin,
            placeFrom: from?.name ?? suggestion.fromId,
            placeTo: to?.name ?? suggestion.destName,
            depart: depart ?? "—",
            arrive: arrive ?? "—",
          })}
      </p>

      {/* Regionalne specialitete — REDKE, kurirane (brez vnosa = brez čipov) */}
      {dishes.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("mealSpecialtiesLabel")}
          </span>
          {dishes.map((dish) => (
            <span
              key={dish}
              className="inline-flex items-center rounded-full border border-border/60 bg-background px-2.5 py-1 text-xs text-muted-foreground"
            >
              {dish}
            </span>
          ))}
          {dest && (
            <Link
              href={`/destinacija/${dest.slug}`}
              className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t("mealAboutPlace", { place: dest.name })}
            </Link>
          )}
        </div>
      )}

      <p className="mt-2 text-[11px] leading-snug text-muted-foreground/80">
        {t("mealHonestyNote")}
      </p>
    </section>
  );
}
