"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useLocale } from "next-intl";
import { Map as MapIcon, Route, Sparkles, Star, Mountain } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DestinationModal } from "@/components/sections/destination-modal";
import { useAppStore } from "@/lib/store";
import { DESTINATIONS } from "@/lib/slovenia-data";
import type { Destination } from "@/lib/types";

// Client-only load Leaflet zemljevida (Leaflet dostopa do window)
const MapView = dynamic(
  () => import("@/components/sections/map-view").then((m) => m.MapView),
  {
    ssr: false,
    loading: () => (
      /* Ikona brez besedila — language-neutral (loading state nima dostopa
         do hooka useLocale, besedilo bi bilo hardcoded v enem jeziku) */
      <div className="flex h-[500px] w-full items-center justify-center bg-muted sm:h-[600px] lg:h-[700px]">
        <MapIcon className="size-8 animate-pulse text-muted-foreground" aria-hidden />
      </div>
    ),
  }
);

// ============================================================================
// UX-CMP #4 (Mindtrip primerjava, 17. 9. 2026): hub zemljevida je imel
// veliko belega prostora nad karto (py-16 + mb-10 header) in "generične"
// besedilne legende pod njo. Zdaj: gostejši vertikalni ritem (manj
// odmikov), podatkovna statistika nad karo (štetje IZ DATASETA — nič
// ročnih številk) in legendi v obliki čipov. Vsi nizi so dvojezični
// (vzorec L iz stop-insights — prej hardcoded SL tudi na /en).
// ============================================================================

const L = {
  badge: { sl: "Interaktivni zemljevid", en: "Interactive map" },
  title: { sl: "Odkrijte Slovenijo na zemljevidu", en: "Discover Slovenia on the map" },
  subtitle: {
    sl: (n: number) =>
      `${n} destinacij razporejenih od Alp do Jadrana. Kliknite marker za podrobnosti, vreme in rezervacije.`,
    en: (n: number) =>
      `${n} destinations from the Alps to the Adriatic. Tap a marker for details, weather and bookings.`,
  },
  loading: { sl: "Nalagam zemljevid…", en: "Loading map…" }, // rezerva za prihodnjo uporabo znotraj komponente
  routeBadge: {
    sl: (n: number) => `Pot iz AI itinererja (${n} postankov)`,
    en: (n: number) => `Route from AI itinerary (${n} stops)`,
  },
  statDestinationsUnit: { sl: "destinacij", en: "destinations" },
  statRegionsUnit: { sl: "regij", en: "regions" },
  statRatingPrefix: {
    sl: "povprečna ocena",
    en: "average rating",
  },
  legendClick: { sl: "Kliknite marker za podrobnosti", en: "Tap a marker for details" },
  legendRoute: { sl: "Črtkana črta = predlagana pot", en: "Dashed line = suggested route" },
  legendSource: { sl: "Podatki: OpenStreetMap", en: "Data: OpenStreetMap" },
} as const;

/** Statistika huba — izključno iz uredniškega dataseta (brez ročnih številk). */
const MAP_STATS = (() => {
  const regions = new Set(DESTINATIONS.map((d) => d.region)).size;
  const withRating = DESTINATIONS.filter((d) => typeof d.rating === "number");
  const avg = withRating.length
    ? withRating.reduce((s, d) => s + (d.rating ?? 0), 0) / withRating.length
    : 0;
  return {
    count: DESTINATIONS.length,
    regions,
    // 1 decimalna mesta, SL decimalna vejica
    rating: avg.toFixed(1).replace(".", ","),
  };
})();

/**
 * MapSection — wrapper okoli Leaflet zemljevida.
 * Upravlja modal za podrobnosti destinacije in bere routeCoords iz store-a
 * (ki jih nastavi ItineraryPlanner ko uporabnik generira itinerer).
 *
 * @param hideHeader — stran ima ŽE lastno glavo (npr. /zemljevid hero z
 *   H1) — notranja glava sekcije (badge + H2 + podnaslov) je potem
 *   odveč in se ne izriše; statistika + karta + legenda ostanejo
 *   (UX-CMP #4: odpravljena duplikatna glava = manj mrtvega prostora).
 */
export function MapSection({ hideHeader = false }: { hideHeader?: boolean }) {
  const [selected, setSelected] = useState<Destination | null>(null);
  const routeCoords = useAppStore((s) => s.routeCoords);
  const routeByDay = useAppStore((s) => s.routeByDay);
  const lang = useLocale() === "en" ? "en" : "sl";

  return (
    <section
      id="zemljevid"
      className="scroll-mt-20 bg-muted/30 py-12 sm:py-16"
      aria-labelledby={hideHeader ? undefined : "zemljevid-title"}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header — gostejši ritem (UX-CMP #4); izpuščen, kadar stran
            že ima svojo glavo (hideHeader) */}
        {!hideHeader && (
          <div className="mx-auto mb-5 max-w-2xl text-center">
            <Badge variant="secondary" className="mb-3">
              <MapIcon className="mr-1.5 size-3.5" />
              {L.badge[lang]}
            </Badge>
            <h2
              id="zemljevid-title"
              className="text-3xl font-bold tracking-tight sm:text-4xl"
            >
              {L.title[lang]}
            </h2>
            <p className="mt-2 text-base text-muted-foreground">
              {L.subtitle[lang](MAP_STATS.count)}
            </p>
          </div>
        )}

        {/* Statistika huba iz dataseta — zapolni prostor z dejstvi
            namesto belega prostora nad karto (UX-CMP #4); številke so
            poudarjene za scannability (VLM povratna informacija) */}
        <div className="mb-5 flex flex-wrap items-center justify-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
            <MapIcon className="size-3.5 text-primary" aria-hidden />
            <b className="font-semibold text-foreground">{MAP_STATS.count}</b>{" "}
            {L.statDestinationsUnit[lang]}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
            <Mountain className="size-3.5 text-primary" aria-hidden />
            <b className="font-semibold text-foreground">{MAP_STATS.regions}</b>{" "}
            {L.statRegionsUnit[lang]}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
            <Star className="size-3.5 text-primary" aria-hidden />
            {L.statRatingPrefix[lang]}{" "}
            <b className="font-semibold text-foreground">{MAP_STATS.rating}</b>
          </span>
        </div>

        {/* Map container z route badge */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
          {routeCoords && routeCoords.length >= 2 ? (
            <div className="absolute left-3 top-3 z-[1001] flex items-center gap-2 rounded-lg border border-border bg-background/95 px-3 py-2 text-xs shadow-md backdrop-blur">
              <Route className="size-4 text-primary" />
              <span className="font-medium">
                {L.routeBadge[lang](routeCoords.length)}
              </span>
            </div>
          ) : null}

          <MapView routeCoords={routeCoords} routeByDay={routeByDay} onOpenDestination={setSelected} />
        </div>

        {/* Legend / pomoč — čipi namesto golega besedila (UX-CMP #4) */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/70 px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" aria-hidden />
            {L.legendClick[lang]}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/70 px-3 py-1 text-xs text-muted-foreground">
            <Route className="size-3.5 text-primary" aria-hidden />
            {L.legendRoute[lang]}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/70 px-3 py-1 text-xs text-muted-foreground">
            <MapIcon className="size-3.5 text-primary" aria-hidden />
            {L.legendSource[lang]}
          </span>
        </div>
      </div>

      {/* Modal za podrobnosti destinacije (deljen z DestinationsSection) */}
      <DestinationModal
        destination={selected}
        onClose={() => setSelected(null)}
      />
    </section>
  );
}

export default MapSection;
