"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  Info,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { validateItineraryGeo } from "@/lib/geo-validation";
import type { Itinerary } from "@/lib/types";
import { cn } from "@/lib/utils";

// ============================================================================
// GEO-VALIDATION PANEL (P0.2) — poštena preverba izvedljivosti poti
// ============================================================================
//
// Prikaz nad itinerarjem (pod kartico "Tvoja pot"): katere dnevi so
// geografsko/časovno naporni ali niso realno izvedljivi — z jasnim pozivom
// k dejanju ("Prilagodi ta dan" skrola na refiner z quick-akcijami).
//
// NAČELO POŠTENOSTI:
// - Sporočila opozoril so deterministično izračunana (strežnik ali klient —
//   ISTA čista funkcija) iz realnih koordinat; nikoli promet v realnem času.
// - Stopnji "error" in "warn" sta vidno ločeni (rdeča/jantbar) — uporabnik
//   točno ve, kaj je mnenje o udobju in kaj je dejansko neizvedljivo.
// - Stari shranjeni načrti brez geoValidation polja: panel izračuna na mestu
//   uporabe (vzorec ItineraryQualityCard).
// ============================================================================

interface GeoValidationPanelProps {
  itinerary: Itinerary;
  className?: string;
}

/** "1 h 25 min" / "40 min" / "—" ( klient-side format minute → berljivo). */
function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export function GeoValidationPanel({
  itinerary,
  className,
}: GeoValidationPanelProps) {
  const t = useTranslations("planner");
  const locale = useLocale();
  const lang = locale === "en" ? "en" : "sl";

  // Shranjeno (API/refine) ali izračunano na mestu uporabe (stari načrti) —
  // ista čista funkcija, enak rezultat kot na strežniku.
  const geo = useMemo(
    () =>
      itinerary.geoValidation ?? validateItineraryGeo(itinerary, lang),
    [itinerary, lang]
  );

  if (geo.days.length === 0) return null;

  const errorCount = geo.issues.filter((i) => i.level === "error").length;
  const warnCount = geo.issues.length - errorCount;

  // Ikona po najhujejši ravni (JSX komponenta iz pogojnega imena)
  const WorstIcon: LucideIcon =
    geo.worst === "error"
      ? CircleAlert
      : geo.worst === "warn"
        ? AlertTriangle
        : CheckCircle2;

  // Dnevi z opozorili (za ragrupirani prikaz) + metrike vseh dni
  const issuesByDay = new Map<number, typeof geo.issues>();
  for (const issue of geo.issues) {
    const list = issuesByDay.get(issue.day) ?? [];
    list.push(issue);
    issuesByDay.set(issue.day, list);
  }

  return (
    <Card
      className={cn(
        "overflow-hidden border-l-4",
        geo.worst === "error"
          ? "border-l-red-500/70"
          : geo.worst === "warn"
            ? "border-l-amber-500/70"
            : "border-l-emerald-500/60",
        className
      )}
    >
      <CardContent className="space-y-3 p-4 sm:p-5">
        {/* Glava — naslov + stanje */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <WorstIcon
              className={cn(
                "size-5 shrink-0",
                geo.worst === "error"
                  ? "text-red-600 dark:text-red-400"
                  : geo.worst === "warn"
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-emerald-600 dark:text-emerald-400"
              )}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground">
                {t("geoValidation.title")}
              </p>
              <p className="text-sm font-semibold leading-snug">
                {geo.worst === "error"
                  ? t("geoValidation.subtitleError")
                  : geo.worst === "warn"
                    ? t("geoValidation.subtitleWarn")
                    : t("geoValidation.subtitleOk")}
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "gap-1.5 font-normal",
              geo.worst === "error" && "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400",
              geo.worst === "warn" && "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
              geo.worst === "ok" && "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            )}
          >
            {t("geoValidation.tripKmBadge", { km: geo.tripKm })}
          </Badge>
        </div>

        {/* Opozorila — ragrupirana po dnevih (samo če so) */}
        {geo.issues.length > 0 && (
          <ul className="space-y-2" aria-label={t("geoValidation.issuesAriaLabel")}>
            {[...issuesByDay.entries()]
              .sort((a, b) => a[0] - b[0])
              .map(([day, dayIssues]) => {
                const dayMetrics = geo.days.find((d) => d.day === day);
                return (
                  <li
                    key={day}
                    className="rounded-lg border border-border/70 bg-muted/30 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("geoValidation.dayLabel", { day })}
                      </span>
                      {dayMetrics && (
                        <Badge variant="secondary" className="gap-1 font-normal">
                          {t("geoValidation.dayKmBadge", { km: dayMetrics.km })}
                          <span aria-hidden="true">·</span>
                          {formatMinutes(dayMetrics.drivingMinutes)}
                        </Badge>
                      )}
                      {dayIssues.some((i) => i.level === "error") ? (
                        <Badge
                          variant="outline"
                          className="border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400"
                        >
                          {t("geoValidation.errorBadge")}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                        >
                          {t("geoValidation.warnBadge")}
                        </Badge>
                      )}
                    </div>
                    <ul className="mt-2 space-y-1.5">
                      {dayIssues.map((issue, idx) => (
                        <li
                          key={`${issue.day}-${issue.rule}-${idx}`}
                          className="flex items-start gap-2 text-sm leading-relaxed"
                        >
                          {issue.level === "error" ? (
                            <CircleAlert
                              className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-400"
                              aria-hidden="true"
                            />
                          ) : (
                            <AlertTriangle
                              className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
                              aria-hidden="true"
                            />
                          )}
                          <span className="min-w-0 text-foreground/90">
                            {issue.message}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
          </ul>
        )}

        {/* Poziv k dejanju — skrol na refiner (isti sidro kot mobilni "Prilagodi") */}
        {geo.worst !== "ok" && (
          <a
            href="#itinerary-refiner"
            className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-primary underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t("geoValidation.adjustCta")}
          </a>
        )}

        {/* Transparentnost metode — prikrita razlaga (vzorec quality kartice) */}
        <Collapsible>
          <CollapsibleTrigger
            className="group flex w-full items-center justify-between rounded-md text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-expanded={false}
          >
            <span className="inline-flex items-center gap-1.5">
              <Info className="size-3.5" aria-hidden="true" />
              {t("geoValidation.methodTitle")}
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
            <p>{t("geoValidation.methodNote")}</p>
            <p className="border-t border-border/60 pt-1.5">
              {t("geoValidation.levelsNote", {
                warn: warnCount,
                error: errorCount,
              })}
            </p>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

export default GeoValidationPanel;
