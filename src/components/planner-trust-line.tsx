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
// Kompleksna validacija ostaja AKTIVNA (geo-validacija, OSRM razdalje,
// Open-Meteo vreme, odpiralni časi) — komunicirana pa ENOSTAVNO:
//   ✓ Pot preverjena · ✓ Razdalje izračunane · ✓ Vreme preverjeno ·
//   ✓ Odprto ob tvojem času
//
// ISKRENOST (NEIZPOGLEDNA PRAVILA Issue #3 §4):
//  - ✓ se izriše SAMO, kadar je bila plast DEJANSKO izvedena in čista;
//  - opozorila/napake geo-validacije → ⚠ z številom (ne prikrivanje);
//  - zaprti kraji (closed_month/closed_weekday) → ⚠ z dejanskim številom;
//  - manjkajoča plast → postavka SE NE izriše (ne trdimo ničesar, česar
//    ne vemo).
//
// TASK 4 / UX FIX PASS (1.91.0) — K-2 in K-3 (živi dokazi revizije):
//  - K-2 »Vreme preverjeno ✓« se je izrisovalo tudi nad SEZONSKO OCENO /
//    AI-izmišljenim vremenom (Render: Open-Meteo nedosegljiv, itinerer je
//    trdil "sončno 22°", realno megla/nevhta). Zdaj se ✓ izriše SAMO nad
//    dnevi z realno napovedjo (weatherEstimated === false); ocena dobí
//    pošteno amber oznako "Vreme: sezonska ocena", mešano pa "delno".
//  - K-3 »Odprto ob tvojem času ✓« se je izrisovalo tudi BREZ datuma odhoda
//    — plast odpiralnih časov (closed_month/closed_weekday) teče SAMO z
//    znanim datumom (geo-validation.ts: if (dayMonth !== null)), brez njega
//    pa closedCount=0 napačno pomeni ✓. Zdaj postavka zahteva
//    geoValidation.openingHoursChecked === true, sicer SE NE izriše.
//  - K-15: vsaka postavka je KLIKABILNA — razklopi "Podrobnosti
//    izračunov" (isti podatki, korak dlje).
// Podrobnosti ostanejo v PlannerStatusStrip/"Podrobnosti izračunov"
// (HIDE ≠ DELETE — vrstica je ZBITEK, ne nadomestilo).
// ============================================================================

interface PlannerTrustLineProps {
  itinerary: Itinerary;
  geoValidation: GeoValidation | null | undefined;
  /**
   * TASK 4 / K-15: klik na postavko razklopi "Podrobnosti izračunov"
   * (dvignjeno stanje v itinerary-planner — isti `open` kot
   * PlannerStatusStrip). Opcijsko: brez njega so postavke navadno besedilo.
   */
  onOpenDetails?: () => void;
  /** TASK 4 / K-11: vrstni red v flex delovni površini. */
  className?: string;
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
  // K-2: pošteni oznaki nad oceno (NIKOLI ✓)
  weatherEstimated: {
    sl: "Vreme: sezonska ocena",
    en: "Weather: seasonal estimate",
  },
  weatherPartial: {
    sl: "Vreme: delno preverjeno",
    en: "Weather: partially checked",
  },
  openAtYourTime: {
    sl: "Odprto ob tvojem času",
    en: "Open at your time",
  },
  closedAtYourTime: {
    sl: "{count} krajev zaprtih ob obisku",
    en: "{count} places closed during your visit",
  },
  detailsAria: {
    sl: "Prikaži podrobnosti izračunov",
    en: "Show calculation details",
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
  onOpenDetails,
  className,
}: PlannerTrustLineProps) {
  const locale = useLocale();
  const isEn = locale === "en";
  const lng = isEn ? "en" : "sl";
  const fmt = (s: string, count?: number) =>
    count === undefined ? s : s.replace("{count}", String(count));

  const items: TrustItem[] = [];

  // 1) Pot preverjena / ⚠ opozorila — iz geo-validacije (obstoječa plast)
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
    //    TASK 4 / K-3: plast teče SAMO z znanim datumom odhoda
    //    (geoValidation.openingHoursChecked). Brez datuma SE NE IZRIŠE —
    //    prej je closedCount=0 napačno izrisal ✓, čeprav pravili sploh
    //    nista tekla (živi dokaz revizije: privzeti tok brez startDate).
    if (geoValidation.openingHoursChecked === true) {
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
  }

  // 4) Vreme — TASK 4 / K-2: ✓ SAMO nad REALNO napovedjo
  //    (weatherEstimated === false, postavil enrichWithRealWeather ob
  //    uspehu Open-Meteo). Sezonska ocena / AI-izmišljeno vreme dobí
  //    pošteno amber oznako; stari načrti brez markerja (neznana resnica)
  //    postavke NE izrišejo — nikoli ✓ brez dokaza.
  const daysWithWeather = itinerary.days.filter((d) => d.weather);
  if (daysWithWeather.length > 0) {
    const realCount = daysWithWeather.filter(
      (d) => d.weatherEstimated === false
    ).length;
    const estimatedCount = daysWithWeather.filter(
      (d) => d.weatherEstimated === true
    ).length;
    if (estimatedCount === 0 && realCount > 0) {
      // Vsi dnevi z vremenom imajo realno napoved
      items.push({
        id: "weather",
        icon: CloudSun,
        text: L.weather[lng],
        ok: true,
      });
    } else if (realCount > 0 && estimatedCount > 0) {
      // Mešano — nekateri dnevi realni, nekateri ocena
      items.push({
        id: "weather",
        icon: TriangleAlert,
        text: L.weatherPartial[lng],
        ok: false,
      });
    } else if (estimatedCount > 0) {
      // Vsi dnevi so ocena (Open-Meteo nedosegljiv ali AI izhod)
      items.push({
        id: "weather",
        icon: TriangleAlert,
        text: L.weatherEstimated[lng],
        ok: false,
      });
    }
    // realCount === 0 && estimatedCount === 0 (stari načrti brez markerja):
    // resnica NI znana → postavka se NE izriše (pravilo §4).
  }

  if (items.length === 0) return null;

  const itemClass = (interactive: boolean) =>
    interactive
      ? "flex items-center gap-1.5 rounded-md px-1 py-0.5 -mx-1 text-xs font-medium transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
      : "flex items-center gap-1.5 text-xs font-medium";

  const itemInner = ({ icon: Icon, text, ok }: TrustItem) => (
    <>
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
          ok ? "text-muted-foreground" : "text-amber-700 dark:text-amber-400"
        )}
      >
        {text}
      </span>
    </>
  );

  // TASK 4 / K-15: klikabilna vrstica — vsaka postavka razklopi podrobnosti
  return (
    <ul
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1.5",
        className
      )}
      aria-label={isEn ? "Trip verification summary" : "Zbirka preverb poti"}
    >
      {items.map((item) => (
        <li key={item.id} className="list-none">
          {onOpenDetails ? (
            <button
              type="button"
              onClick={onOpenDetails}
              aria-label={`${item.text} — ${L.detailsAria[lng]}`}
              title={L.detailsAria[lng]}
              className={itemClass(true)}
            >
              {itemInner(item)}
            </button>
          ) : (
            <div className={itemClass(false)}>{itemInner(item)}</div>
          )}
        </li>
      ))}
    </ul>
  );
}

export default PlannerTrustLine;
