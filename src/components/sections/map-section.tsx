"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Map as MapIcon, Route, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DestinationModal } from "@/components/sections/destination-modal";
import { useAppStore } from "@/lib/store";
import type { Destination } from "@/lib/types";

// Client-only load Leaflet zemljevida (Leaflet dostopa do window)
const MapView = dynamic(
  () => import("@/components/sections/map-view").then((m) => m.MapView),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[500px] w-full items-center justify-center bg-muted sm:h-[600px] lg:h-[700px]">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <MapIcon className="size-8 animate-pulse" />
          <p className="text-sm">Nalagam zemljevid…</p>
        </div>
      </div>
    ),
  }
);

/**
 * MapSection — wrapper okoli Leaflet zemljevida.
 * Upravlja modal za podrobnosti destinacije in bere routeCoords iz store-a
 * (ki jih nastavi ItineraryPlanner ko uporabnik generira itinerer).
 */
export function MapSection() {
  const [selected, setSelected] = useState<Destination | null>(null);
  const routeCoords = useAppStore((s) => s.routeCoords);
  const routeByDay = useAppStore((s) => s.routeByDay);

  return (
    <section
      id="zemljevid"
      className="scroll-mt-20 bg-muted/30 py-16 sm:py-20"
      aria-labelledby="zemljevid-title"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <Badge variant="secondary" className="mb-3">
            <MapIcon className="mr-1.5 size-3.5" />
            Interaktivni zemljevid
          </Badge>
          <h2
            id="zemljevid-title"
            className="text-3xl font-bold tracking-tight sm:text-4xl"
          >
            Odkrijte Slovenijo na zemljevidu
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            12 destinacij razporejenih od Alp do Jadrana. Kliknite marker za
            podrobnosti, vreme in rezervacije.
          </p>
        </div>

        {/* Map container z route badge */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
          {routeCoords && routeCoords.length >= 2 ? (
            <div className="absolute left-3 top-3 z-[1001] flex items-center gap-2 rounded-lg border border-border bg-background/95 px-3 py-2 text-xs shadow-md backdrop-blur">
              <Route className="size-4 text-primary" />
              <span className="font-medium">
                Pot iz AI itinererja ({routeCoords.length} postankov)
              </span>
            </div>
          ) : null}

          <MapView routeCoords={routeCoords} routeByDay={routeByDay} onOpenDestination={setSelected} />
        </div>

        {/* Legend / pomoč */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-primary" />
            Kliknite marker za podrobnosti
          </span>
          <span className="flex items-center gap-1.5">
            <Route className="size-3.5 text-primary" />
            Črtkana črta = predlagana pot
          </span>
          <span className="flex items-center gap-1.5">
            <MapIcon className="size-3.5 text-primary" />
            Podatki: OpenStreetMap
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
