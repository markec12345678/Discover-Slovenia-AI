"use client";

// ============================================================================
// ISSUE #22 §13/§30 — GUARDIAN DAY START: ZAČNI DAN povzetek
// ============================================================================
// Ob začetku dneva (jutro + danes + nič opravljenega + GPS še izklopljen)
// Discover povzame dan in ponudi [ZAČNI DAN] → vklop GPS + skok na NASLEDNJE.
// Povzetek nosi SAMO dejstva: št. postankov, rezervacije, prvi cilj, znana
// pot, opozorila in MANJKAJ OČI podatki (iskreno — ne skrivamo lukenj vira).
// ============================================================================

import { AlertTriangle, Sunrise } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DAY_START_LABELS,
  type DayStartSummary,
} from "@/lib/journey/day-start";
import { CONFLICT_LABELS } from "@/lib/journey/conflict-detect";

export interface GuardianDayStartProps {
  summary: DayStartSummary;
  lang: "sl" | "en";
  onStartDay: () => void;
}

export function GuardianDayStartSection({
  summary,
  lang,
  onStartDay,
}: GuardianDayStartProps) {
  const t = (o: { sl: string; en: string }) => o[lang];
  const greeting =
    lang === "sl"
      ? DAY_START_LABELS.greeting.sl(summary.stopCount, summary.fixedCount)
      : DAY_START_LABELS.greeting.en(summary.stopCount, summary.fixedCount);
  const missing =
    lang === "sl"
      ? DAY_START_LABELS.missing.sl(summary.missingGeoCount, summary.missingTimeCount)
      : DAY_START_LABELS.missing.en(summary.missingGeoCount, summary.missingTimeCount);

  return (
    <section
      aria-label={t(DAY_START_LABELS.title)}
      className="space-y-3 rounded-lg border border-emerald-400 bg-gradient-to-b from-emerald-50 to-background px-4 py-4 dark:border-emerald-700 dark:from-emerald-950/60"
    >
      <div className="flex items-start gap-3">
        <Sunrise
          className="mt-1 h-6 w-6 shrink-0 text-emerald-600 dark:text-emerald-400"
          aria-hidden="true"
        />
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            {lang === "sl" ? "DOBRO JUTRO" : "GOOD MORNING"}
          </p>
          <p className="text-sm font-medium">{greeting}</p>
          {summary.firstStop && (
            <p className="text-sm text-muted-foreground">
              {lang === "sl"
                ? DAY_START_LABELS.firstGoal.sl(summary.firstStop.title)
                : DAY_START_LABELS.firstGoal.en(summary.firstStop.title)}
              {summary.firstStop.timeStart ? ` · ${summary.firstStop.timeStart}` : ""}
            </p>
          )}
          {summary.route && (
            <p className="text-xs text-muted-foreground">
              {lang === "sl"
                ? DAY_START_LABELS.route.sl(summary.route.km, summary.route.min)
                : DAY_START_LABELS.route.en(summary.route.km, summary.route.min)}
              {summary.route.legsKnown < summary.route.legsTotal
                ? ` (${summary.route.legsKnown}/${summary.route.legsTotal})`
                : ""}
            </p>
          )}
          {summary.warnings.length > 0 && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              {t(DAY_START_LABELS.warnings)}:{" "}
              {summary.warnings
                .map((w) => `${w.count}× ${t(CONFLICT_LABELS[w.kind])}`)
                .join(" · ")}
            </p>
          )}
          {missing !== "" && (
            <p className="text-xs text-muted-foreground">{missing}</p>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button
          size="lg"
          className="h-12 flex-1 bg-emerald-600 text-base hover:bg-emerald-700"
          onClick={onStartDay}
        >
          <Sunrise className="mr-2 h-5 w-5" aria-hidden="true" />
          {t(DAY_START_LABELS.title)}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t(DAY_START_LABELS.gpsHint)}</p>
    </section>
  );
}
