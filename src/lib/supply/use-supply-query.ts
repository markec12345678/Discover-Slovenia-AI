"use client";

// ============================================================================
// TRAVEL SUPPLY MAP — VIEWPORT QUERY HOOK (client, F1, 1.49.0)
// ============================================================================
// viewport → bbox → supply query (popravek audita: prej je vsak klik
// prinesel FIKSNI bbox cele Slovenije prek /api/pois).
//
// Obnašanje:
//  - debounce 500 ms na moveend/zoomend (ne vsak frame);
//  - zoom < 8: NE sprašuje (samo destinacije — mapa riše sama iz dataseta);
//  - kategorije pošljene kot cats csv (aktivni čipi, preklopljeni v
//    tipe, vidne pri zoom-u — strežnik dodatno globa);
//  - abort prejšnje poizvedbe ob novi (AbortController);
//  - telemetrija supply_map_query po vsakem zaključenem klicu.
//
// React 19 higiena: setState se kliče SAMO iz asinhronih callbackov
// (fetch then/catch) — stanje "izklopljeno/nizki zoom" je IZPELJANO ob
// branju (derived), ne sinhrono v efektnem telesu.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProductType } from "@/lib/supply/types";
import type { SupplySearchResponse } from "@/lib/supply/types";
import { SUPPLY_MIN_ZOOM } from "@/lib/supply/zoom";
import { trackPlannerEvent } from "@/lib/planner-analytics";

export interface SupplyLayerState {
  products: SupplySearchResponse["products"];
  loading: boolean;
  error: string | null;
  degraded: string[];
  adapters: SupplySearchResponse["adapters"];
  lastZoom: number;
}

interface UseSupplyQueryOpts {
  /** Ali je sloj sploh vklopljen (gumb Pokaži POI). */
  enabled: boolean;
  /** Aktivne kategorije (tipi). */
  cats: ProductType[];
  /** Trenutni zoom (posodablja MapView ob moveend/zoomend). */
  zoom: number;
  /** Trenutni bbox viewporta [s,w,n,e]. */
  bbox: [number, number, number, number] | null;
  locale: "sl" | "en";
}

export function useSupplyQuery({
  enabled,
  cats,
  zoom,
  bbox,
  locale,
}: UseSupplyQueryOpts): SupplyLayerState {
  const [state, setState] = useState<SupplyLayerState>({
    products: [],
    loading: false,
    error: null,
    degraded: [],
    adapters: [],
    lastZoom: zoom,
  });
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);

  /** Ali sploh smemo spraševati (izklop / nizki zoom / prazne kategorije). */
  const shouldQuery =
    enabled &&
    bbox != null &&
    Math.floor(zoom) >= SUPPLY_MIN_ZOOM &&
    cats.length > 0;

  const run = useCallback(
    (z: number, b: [number, number, number, number], c: ProductType[]) => {
      // Prejšnji klic prekliči (novo gibanje med čakanjem na odgovor).
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const seq = ++seqRef.current;

      const started = Date.now();
      setState((prev) => ({ ...prev, loading: true, error: null }));

      const params = new URLSearchParams({
        bbox: b.join(","),
        zoom: String(Math.floor(z)),
        cats: c.join(","),
        locale,
      });

      fetch(`/api/supply/search?${params.toString()}`, {
        signal: controller.signal,
        cache: "no-store",
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return (await res.json()) as SupplySearchResponse & { ms?: number };
        })
        .then((data) => {
          if (seq !== seqRef.current) return; // zastarel odgovor
          setState({
            products: data.products ?? [],
            loading: false,
            error: null,
            degraded: data.degraded ?? [],
            adapters: data.adapters ?? [],
            lastZoom: z,
          });
          trackPlannerEvent("supply_map_query", {
            zoom: Math.floor(z),
            cats: (data.query?.cats ?? c).length,
            products: data.products?.length ?? 0,
            degraded: (data.degraded ?? []).length,
            ms: data.ms ?? Date.now() - started,
          });
        })
        .catch((err: unknown) => {
          if (seq !== seqRef.current) return;
          if (err instanceof DOMException && err.name === "AbortError") {
            // Preklic zaradi nove poizvedbe/izklopa — loading utihne
            // samodejno ob naslednjem setState ali derived stanju.
            setState((prev) => ({ ...prev, loading: false }));
            return;
          }
          // OSM plast ni na voljo — mapa ostane funkcionalna (destinacije),
          // iskrena napaka se izpiše v sloju.
          setState((prev) => ({
            ...prev,
            loading: false,
            error: "supply-unavailable",
            products: [],
            degraded: ["osm"],
          }));
        });
    },
    [locale]
  );

  useEffect(() => {
    // Debounce 500 ms: izstopajo le smiselne poizvedbe (konec gest).
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!shouldQuery || bbox == null) {
      // Izklop / nizki zoom: samo preklic in umik tajmauta — stanje je
      // IZPELJANO prazno ob branju (ni setState v efektnem telesu).
      abortRef.current?.abort();
      return;
    }
    debounceRef.current = setTimeout(() => {
      run(zoom, bbox, cats);
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [shouldQuery, bbox, zoom, cats, run]);

  // Odpoved ob unmountu.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // IZPELJANO stanje: ko ne smemo spraševati, je sloj prazen (brez
  // sinhronih setState klicev v efektu — React 19 pravila).
  if (!shouldQuery) {
    return {
      products: [],
      loading: false,
      error: null,
      degraded: [],
      adapters: [],
      lastZoom: zoom,
    };
  }
  return state;
}
