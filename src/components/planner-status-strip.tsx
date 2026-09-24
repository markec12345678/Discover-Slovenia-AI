"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertCircle,
  BedDouble,
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
import { trackPlannerEvent } from "@/lib/planner-analytics";
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
  /** OPCIJA-3: skupno število rezervabilnih ponudb (listings+izkušnje+
   *  izdelki) prek vseh dni — poganja vrstico "Rezerviraj" pod ploščicami.
   *  0 ali undefined = vrstica se ne prikaže (prazna tržnica ni CTA). */
  bookingOfferCount?: number;
  /**
   * TASK 4 / K-15 (UX FIX PASS): nadzorovani način razklopa — stanje je
   * DVIGNJENO v itinerary-planner, da ga lahko sproži tudi klik na
   * postavko v PlannerTrustLine (isti `open`). Opcijsko: brez obeh propov
   * komponenta obdrži lastno stanje (nazaj kompatibilno za ostale klice).
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** TASK 4 / K-11: vrstni red v flex delovni površini. */
  className?: string;
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
  bookingOfferCount = 0,
  open: openControlled,
  onOpenChange,
  className,
}: PlannerStatusStripProps) {
  const t = useTranslations("planner");
  // K-15: nadzorovani (dvignjeni) način ima prednost; sicer lastno stanje.
  const [openLocal, setOpenLocal] = useState(false);
  const open = openControlled ?? openLocal;
  const setOpen = (v: boolean) => {
    if (onOpenChange) onOpenChange(v);
    else setOpenLocal(v);
  };

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
    <div className={cn("space-y-3", className)}>
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

      {/* OPCIJA-3 (transakcijska globina): rezervacija kot PRVORAZREDNI
          državljan delovne površine — vrstica pod ploščicami stanja, VIDNA
          TAKOJ po generiranju (ne šele po scrollu skozi vse dneve). Vodi na
          booking panel prvega dne (nadaljnji dnevni paneli ostanejo na
          svojih mestih). Prikaže se SAMO kadar obstajajo ponudbe — prazna
          tržnica bi bila nepošten CTA. */}
      {bookingOfferCount > 0 && (
        <button
          type="button"
          onClick={() => {
            trackPlannerEvent("booking_cta_clicked", {
              placement: "status_strip",
              offers: bookingOfferCount,
            });
            document
              .getElementById("booking-panel-1")
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2.5 text-sm font-semibold text-primary transition-colors hover:border-primary/50 hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <BedDouble className="size-4 shrink-0" aria-hidden />
          {t("bookingCtaStrip")}
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold">
            {t("bookingOffersCount", { count: bookingOfferCount })}
          </span>
        </button>
      )}

      {/* Zložene podrobnosti — iste kartice kot prej, korak dlje
          (TASK 4 / K-15: id="planner-calc-details" — cilj scrolla ob kliku
          na postavko trust vrstice) */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(!open)}
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
        <div id="planner-calc-details" className="space-y-4 scroll-mt-24">
          <ItineraryQualityCard itinerary={itinerary} input={input} />
          <BudgetPanel itinerary={itinerary} input={input} />
          <GeoValidationPanel itinerary={itinerary} />
        </div>
      )}
    </div>
  );
}
