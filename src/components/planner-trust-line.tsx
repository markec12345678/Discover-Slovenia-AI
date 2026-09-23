"use client";

import * as React from "react";
import { useLocale } from "next-intl";
import { Check, TriangleAlert, Route, CloudSun, DoorOpen } from "lucide-react";

import { cn } from "@/lib/utils";
import type { GeoValidation, Itinerary } from "@/lib/types";

// ============================================================================
// PLANNER TRUST LINE — Issue #3 §4 "TRUST"
// ============================================================================
//
// Kompleksna validacija ostane AKTIVNA (geo-validacija, OSRM razdalje,
// Open-Meteo vreme, odpiralni časi) — komunicirana pa ENOSTAVNO:
//   ✓ Pot preverjena · ✓ Razdalje izračunane · ✓ Vreme preverjeno ·
//   ✓ Odprto ob tvojem času
//
// ISKRENOST (NEIZPOGLEDNA PRAVILA Issue #3 §4):
//  - ✓ se izriše SAMO, kadar je bila plast DEJANSKO izvedena in čista;
//  - opozorila/napake geo-validacije → ⚠ z številom (ne prikrivanje);
//  - zaprti kraji (closed_month/closed_weekday) → ⚠ z dejanskim številom;
//  - manjkajoča plast (npr. brez vremena) → postavka SE NE izriše
//    (ne trdimo ničesar, česar ne vemo).
// Podrobnosti ostanejo v PlannerStatusStrip/"Podrobnosti izračunov"
// (HIDE ≠ DELETE — vrstica je ZBITEK, ne nadomestilo).
// ============================================================================

interface PlannerTrustLineProps {
  itinerary: Itinerary;
  geoValidation: GeoValidation | null | undefined;
}

const L = {
  routeVerified: { sl: "Pot preverjena", en: "Route verified" },
  routeWarn: {
    sl: "Pot: {count} opozorila",
    en: "Route: {count} warnings",
  },
  routeError: {
    sl: "Pot: {count} težav",
    en: "Route: {count} issues",
  },
  distances: { sl: "Razdalje izračunane", en: "Distances calculated" },
  distancesHeuristic: {
    sl: "Razdalje ocenjene (približek)",
    en: "Distances estimated (approximate)",
  },
  weather: { sl: "Vreme preverjeno", en: "Weather checked" },
  openAtYourTime: {
    sl: "Odprto ob tvojem času",
    en: "Open at your time",
  },
  closedAtYourTime: {
    sl: "{count} krajev zaprtih ob obisku",
    en: "{count} places closed during your visit",
  },
} as const;

type TrustItem = {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  text: string;
  ok: boolean;
};

export function PlannerTrustLine({
  itinerary,
  geoValidation,
}: PlannerTrustLineProps) {
  const locale = useLocale();
  const isEn = locale === "en";
  const lng = isEn ? "en" : "sl";
  const fmt = (s: string, count?: number) =>
    count === undefined ? s : s.replace("{count}", String(count));

  const items: TrustItem[] = [];

  // 1) Pot preverjena / ⚠ opozorila — iz geo-validacije ( obstoječa plast)
  if (geoValidation) {
    const warnCount = geoValidation.issues.filter(
      (i) => i.level === "warn"
    ).length;
    const errorCount = geoValidation.issues.filter(
      (i) => i.level === "error"
    ).length;
    if (errorCount > 0) {
      items.push({
        id: "route",
        icon: TriangleAlert,
        text: fmt(L.routeError[lng], errorCount),
        ok: false,
      });
    } else if (warnCount > 0) {
      items.push({
        id: "route",
        icon: TriangleAlert,
        text: fmt(L.routeWarn[lng], warnCount),
        ok: false,
      });
    } else {
      items.push({
        id: "route",
        icon: Check,
        text: L.routeVerified[lng],
        ok: true,
      });
    }

    // 2) Razdalje izračunane — OSRM realne ceste vs hevristika (pošteno)
    items.push({
      id: "distances",
      icon: Route,
      text:
        geoValidation.method === "osrm"
          ? L.distances[lng]
          : L.distancesHeuristic[lng],
      ok: geoValidation.method === "osrm",
    });

    // 3) Odprto ob tvojem času — F5.5 odpiralni časi (closed_month/weekday)
    const closedCount = geoValidation.issues.filter(
      (i) =>
        i.rule === "closed_month" || i.rule === "closed_weekday"
    ).length;
    if (closedCount > 0) {
      items.push({
        id: "opening",
        icon: TriangleAlert,
        text: fmt(L.closedAtYourTime[lng], closedCount),
        ok: false,
      });
    } else {
      items.push({
        id: "opening",
        icon: DoorOpen,
        text: L.openAtYourTime[lng],
        ok: true,
      });
    }
  }

  // 4) Vreme preverjeno — samo, če ima vsaj en dan realno napoved
  if (itinerary.days.some((d) => d.weather)) {
    items.push({
      id: "weather",
      icon: CloudSun,
      text: L.weather[lng],
      ok: true,
    });
  }

  if (items.length === 0) return null;

  return (
    <ul
      className="flex flex-wrap items-center gap-x-4 gap-y-1.5"
      aria-label={isEn ? "Trip verification summary" : "Zbirka preverb poti"}
    >
      {items.map(({ id, icon: Icon, text, ok }) => (
        <li
          key={id}
          className="flex items-center gap-1.5 text-xs font-medium"
        >
          <Icon
            className={cn(
              "size-3.5 shrink-0",
              ok
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-amber-600 dark:text-amber-400"
            )}
            aria-hidden="true"
          />
          <span
            className={cn(
              ok
                ? "text-muted-foreground"
                : "text-amber-700 dark:text-amber-400"
            )}
          >
            {text}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default PlannerTrustLine;
