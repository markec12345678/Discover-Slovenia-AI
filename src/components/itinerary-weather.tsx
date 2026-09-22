"use client";

// ============================================================================
// TASK 88 — ŽIVO VREME V DNEVNIH KARTICAH ITINERARJA: komponente (1.79.0)
// ============================================================================
//
// Tri izvoze uporabljata TripTimeline (rezultati načrtovalnika, sl+en) in
// SharedTrip (/pot/[shareId], sl-only) — vzorec TASK 66 iz journey-trip.tsx:
//
//   useItineraryForecast(days, tripStartDate, lang)
//     → chipFor(dan) + iskreni statusi (unavailable / notPublished).
//     Ena zahteva /api/weather (NAČIN B) na UNIKATNO sidro dneva (dedupe,
//     cap 4 — glej itinerary-weather.ts). Prekinitve novih odgovorov NE
//     štejejo kot napaka; odpadla skupina pusti svoje dneve brez čipa
//     ( iskrena odsotnost — ostali dnevi dobijo svoje čipe).
//
//   <WeatherChip w lang />
//     Čip dneva (pogoj + do X °C + padavine) — IZVLEČEN iz journey-trip.tsx
//     ( popolnoma ista vizija), da ga zdaj deli tudi itinerar.
//
//   <ItineraryWeatherNotes … />
//     Iskrene opombe (vir izrecno naveden, časovnica dela naprej).
//
// ISKRENOST: čipi se pokažejo SAMO iz odgovora, ki pokriva AKTUALNI načrt
// (zastarel odgovor = brez čipov). Dan brez čipa (brez datuma/sidra/napovedi)
// NE pokaže izmišljenega „neznano" — preprosto ni čipa.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CloudSun } from "lucide-react";
import {
  applyForecastToDays,
  itineraryWeatherPlan,
  itineraryWeatherRequestKey,
} from "@/lib/itinerary-weather";
import {
  parseTripWeatherResponse,
  TRIP_WEATHER_LABELS,
  type TripWeatherDay,
} from "@/lib/journey/trip-weather";
import type { DayPlan } from "@/lib/types";

// ---------------------------------------------------------------------------
// VREMESKI ČIP DNEVA (deljen — journey-trip + TripTimeline + SharedTrip)
// ---------------------------------------------------------------------------

export function WeatherChip({
  w,
  lang,
}: {
  w: TripWeatherDay;
  lang: "sl" | "en";
}) {
  const dayText = TRIP_WEATHER_LABELS.day[lang](w);
  return (
    <span
      className="inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-full border bg-muted/30 px-2.5 py-0.5 text-xs text-muted-foreground print:hidden"
      title={TRIP_WEATHER_LABELS.source[lang]}
      aria-label={`${w.condition}, ${dayText}`}
    >
      <span role="img" aria-hidden="true" className="leading-none">
        {w.icon}
      </span>
      <span className="capitalize">{w.condition}</span>
      <span className="font-medium tabular-nums text-foreground">{dayText}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// HOOK — ŽIVA DNEVNA NAPOVED ITINERARJA
// ---------------------------------------------------------------------------

export interface ItineraryForecast {
  /** Čip dneva iz AKTUALNEGA odgovora; dan brez napovedi → undefined. */
  chipFor: (dayNumber: number) => TripWeatherDay | undefined;
  /** Vse skupine sider so odpadle (omrežje/vir) — iskrena opomba. */
  unavailable: boolean;
  /** Dnevi obstajajo, njihova realna napoved pa NE (preteklost/horizont). */
  notPublished: boolean;
  /** Ali sploh obstaja okvir zahteve (brez njega ni niti opomb). */
  hasWindow: boolean;
}

export function useItineraryForecast(
  days: ReadonlyArray<DayPlan>,
  tripStartDate: string | null | undefined,
  lang: "sl" | "en"
): ItineraryForecast {
  const plan = useMemo(
    () => itineraryWeatherPlan(days, tripStartDate),
    [days, tripStartDate]
  );
  const requestKey = useMemo(
    () => itineraryWeatherRequestKey(plan, lang),
    [plan, lang]
  );

  /** Vedno svež načrt znotraj efekta (effect dep je SAMO primitivni
   *  ključ — fetch se sproži ob spremembi potovanja, ne ob vsakem renderu).
   *  Ref se posodobi v efektu, deklariranem PRED fetch efektom (efekti tečejo
   *  po vrstnem redu deklaracije → fetch vidi že svež načrt). */
  const planRef = useRef(plan);
  useEffect(() => {
    planRef.current = plan;
  });

  /** Dan → napoved (samo dnevi z ujemajočim datumom v ujemajoči skupini). */
  const [byDay, setByDay] = useState<Map<number, TripWeatherDay>>(
    () => new Map()
  );
  const [failedAll, setFailedAll] = useState(false);
  /** Za kateri ključ je trenutni odgovor veljaven (drugo = zastarel). */
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  useEffect(() => {
    if (requestKey == null) return;
    let active = true;
    const controller = new AbortController();

    (async () => {
      const currentPlan = planRef.current;
      if (!currentPlan) return;

      // ENA zahteva na unikatno sidro; odpadla skupina (omrežje/502/parse)
      // vrne null — NJENI dnevi ostanejo brez čipa, ostali živijo naprej.
      const results = await Promise.all(
        currentPlan.groups.map((g) =>
          (async () => {
            const res = await fetch(
              `/api/weather?lat=${g.lat}&lng=${g.lng}&lang=${lang}&start=${g.start}&end=${g.end}`,
              { signal: controller.signal }
            );
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return parseTripWeatherResponse(await res.json());
          })().catch(() => null)
        )
      );
      if (!active) return;

      const next = applyForecastToDays(currentPlan, results);
      const healthyGroups = results.filter((r) => r != null).length;

      setByDay(next);
      setFailedAll(healthyGroups === 0);
      setLoadedFor(requestKey);
    })().catch(() => {
      // Prekinitev (nov načrt) NE šteje kot napaka — active je takrat false.
      if (!active) return;
      setByDay(new Map());
      setFailedAll(true);
      setLoadedFor(requestKey);
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [requestKey, lang]);

  /** Čipi se pokažejo SAMO iz odgovora, ki pokriva aktualni načrt. */
  const current = requestKey != null && requestKey === loadedFor;

  const chipFor = useCallback(
    (dayNumber: number) => (current ? byDay.get(dayNumber) : undefined),
    [current, byDay]
  );

  /** Koliko dni je dobilo čip (za iskreno opombo „ni objavljena"). */
  const matchedDays =
    current && plan ? [...plan.dayDates.keys()].filter((n) => byDay.has(n)).length : 0;

  return {
    chipFor,
    unavailable: current && failedAll,
    notPublished: current && !failedAll && plan != null && plan.dayDates.size > 0 && matchedDays === 0,
    hasWindow: requestKey != null,
  };
}

// ---------------------------------------------------------------------------
// ISKRENE OPOMBE (časovnica poti dela naprej)
// ---------------------------------------------------------------------------

export function ItineraryWeatherNotes({
  unavailable,
  notPublished,
  lang,
}: {
  unavailable: boolean;
  notPublished: boolean;
  lang: "sl" | "en";
}) {
  if (!unavailable && !notPublished) return null;
  return (
    <p
      role="note"
      className="flex items-start gap-1.5 text-xs text-muted-foreground print:hidden"
    >
      <CloudSun className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      {unavailable
        ? TRIP_WEATHER_LABELS.unavailable[lang]
        : TRIP_WEATHER_LABELS.notPublished[lang]}
    </p>
  );
}
