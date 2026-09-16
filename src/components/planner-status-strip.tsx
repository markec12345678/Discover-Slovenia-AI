"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertCircle,
  Car,
  ChevronDown,
  Clock,
  Euro,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ItineraryQualityCard } from "@/components/itinerary-quality-card";
import { BudgetPanel } from "@/components/budget-panel";
import { GeoValidationPanel } from "@/components/geo-validation-panel";
import { cn } from "@/lib/utils";
import type {
  GeoValidation,
  Itinerary,
  PlannerInput,
} from "@/lib/types";

interface PlannerStatusStripProps {
  itinerary: Itinerary;
  input: PlannerInput;
  /** Isti memo kot planner (dnevne značke) — en vir resnice za km/čase. */
  geoValidation: GeoValidation;
}

/**
 * UI sprint (točka A/C smeri): KOMPAKTNA slika stanja poti nad dnevno
 * časovno linijo — razdalja, čas vožnje, strošek in izvedljivost v štirih
 * ploščicah. Podrobne kartice (kakovost, proračun, geo-validacija) so še
 * vedno na voljo — zložene pod gumbom "Podrobnosti izračunov", da ne
 * dominirajo prvi zaslon. Številke so iz ISTIH plasti kot prej.
 */
export function PlannerStatusStrip({
  itinerary,
  input,
  geoValidation,
}: PlannerStatusStripProps) {
  const t = useTranslations("planner");
  const [open, setOpen] = useState(false);

  const drivingMinutes = geoValidation.days.reduce(
    (sum, d) => sum + (d.drivingMinutes ?? 0),
    0
  );
  const hours = Math.floor(drivingMinutes / 60);
  const mins = drivingMinutes % 60;
  const timeText =
    hours > 0
      ? `~${hours} h${mins > 0 ? ` ${mins} min` : ""}`
      : `~${mins} min`;

  const warnCount = geoValidation.issues.filter(
    (i) => i.level === "warn"
  ).length;
  const errorCount = geoValidation.issues.filter(
    (i) => i.level === "error"
  ).length;

  const feasibility =
    geoValidation.worst === "error"
      ? {
          icon: AlertCircle,
          value: t("statusErrorCount", { count: errorCount }),
          tone: "text-red-700 dark:text-red-400",
          iconTone: "bg-red-500/10 text-red-600 dark:text-red-400",
        }
      : geoValidation.worst === "warn"
        ? {
            icon: AlertCircle,
            value: t("statusWarnCount", { count: warnCount }),
            tone: "text-amber-700 dark:text-amber-400",
            iconTone: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
          }
        : {
            icon: ShieldCheck,
            value: t("statusOk"),
            tone: "text-emerald-700 dark:text-emerald-400",
            iconTone:
              "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
          };

  const tiles = [
    {
      icon: Car,
      label: t("statusKmLabel"),
      value: `~${geoValidation.tripKm} km`,
      tone: "text-foreground",
      iconTone: "bg-muted text-muted-foreground",
    },
    {
      icon: Clock,
      label: t("statusTimeLabel"),
      value: timeText,
      tone: "text-foreground",
      iconTone: "bg-muted text-muted-foreground",
    },
    {
      icon: Euro,
      label: t("statusCostLabel"),
      value: `~€${itinerary.total_budget}`,
      tone: "text-foreground",
      iconTone: "bg-muted text-muted-foreground",
    },
    {
      icon: feasibility.icon,
      label: t("statusFeasibilityLabel"),
      value: feasibility.value,
      tone: feasibility.tone,
      iconTone: feasibility.iconTone,
    },
  ];

  return (
    <div className="space-y-3">
      {/* Ploščice stanja */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {tiles.map(({ icon: Icon, label, value, tone, iconTone }) => (
          <div
            key={label}
            className="flex min-w-0 items-center gap-2.5 rounded-lg border bg-card/60 p-2.5 sm:p-3"
          >
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-md sm:size-9",
                iconTone
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[11px] text-muted-foreground">
                {label}
              </p>
              <p className={cn("truncate text-sm font-semibold", tone)}>
                {value}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Zložene podrobnosti — iste kartice kot prej, korak dlje */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full gap-1.5 border-dashed text-muted-foreground hover:text-foreground"
      >
        <ChevronDown
          className={cn(
            "size-4 transition-transform",
            open && "rotate-180"
          )}
          aria-hidden="true"
        />
        {t("statusDetails")}
      </Button>

      {open && (
        <div className="space-y-4">
          <ItineraryQualityCard itinerary={itinerary} input={input} />
          <BudgetPanel itinerary={itinerary} input={input} />
          <GeoValidationPanel itinerary={itinerary} />
        </div>
      )}
    </div>
  );
}
