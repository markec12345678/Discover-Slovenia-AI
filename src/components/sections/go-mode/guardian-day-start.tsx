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
// ISSUE #24 Sklop 8 (1.170.0): 6-jezični izpis (faza 2).
import { GL, GFn, type GoLang, type GoStrings } from "@/lib/journey/go-lang";

/** Pozdrav »dobro jutro« (6 jezikov — prej inline ternary). */
const MORNING_LABEL = {
  sl: "DOBRO JUTRO",
  en: "GOOD MORNING",
  it: "BUONGIORNO",
  de: "GUTEN MORGEN",
  fr: "BONJOUR",
  es: "BUENOS DÍAS",
} as const;

export interface GuardianDayStartProps {
  summary: DayStartSummary;
  lang: GoLang;
  onStartDay: () => void;
}

export function GuardianDayStartSection({
  summary,
  lang,
  onStartDay,
}: GuardianDayStartProps) {
  const t = (o: GoStrings) => GL(lang, o);
  const greeting = GFn(lang, DAY_START_LABELS.greeting)(
    summary.stopCount,
    summary.fixedCount
  );
  const missing = GFn(lang, DAY_START_LABELS.missing)(
    summary.missingGeoCount,
    summary.missingTimeCount
  );

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
            {GL(lang, MORNING_LABEL)}
          </p>
          <p className="text-sm font-medium">{greeting}</p>
          {summary.firstStop && (
            <p className="text-sm text-muted-foreground">
              {GFn(lang, DAY_START_LABELS.firstGoal)(summary.firstStop.title)}
              {summary.firstStop.timeStart ? ` · ${summary.firstStop.timeStart}` : ""}
            </p>
          )}
          {summary.route && (
            <p className="text-xs text-muted-foreground">
              {GFn(lang, DAY_START_LABELS.route)(summary.route.km, summary.route.min)}
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
