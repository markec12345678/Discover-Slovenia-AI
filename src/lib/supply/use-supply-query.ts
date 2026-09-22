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
  error: SupplyLayerError | null;
  degraded: string[];
  adapters: SupplySearchResponse["adapters"];
  lastZoom: number;
}

/**
 * Iskrene kode napake sloja ponudbe (TASK 99-a, §15):
 *  - "client-network"     — odpoved na strani ODJEMALCA (offline oz. fetch
 *                            ni niti prišel do strežnika) — NOBEN ponudnik
 *                            ni kriv;
 *  - "supply-unavailable" — strežniška/HTTP napaka — plast ni na voljo,
 *                            a krivda se NE pripisuje posameznemu
 *                            ponudniku (samo poštena strežniška atribucija
 *                            v uspešnem odgovoru sme napolniti degraded).
 */
export type SupplyLayerError = "client-network" | "supply-unavailable";

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
          // TASK 99-a (§15, iskrenost): prej je VSA odpoved obsodila OSM
          // (degraded: ["osm"]) — tudi kadar je uporabnik offline. Zdaj
          // ločimo dve povsem različni vzroki:
          //   1) NAPAKA ODJEMALCA: navigator.onLine === false ALI TypeError
          //      (fetch je padel na omrežni ravni — HTTP odgovora sploh ni
          //      bilo) → "client-network", degraded: [] (nihče ni kriv);
          //   2) sicer (HTTP status napaka / strežniška odpoved) →
          //      "supply-unavailable", a degraded: [] — ponudnika ne
          //      obtožimo, dokler ga ne znamo iskreno pripisati (degraded
          //      sme priti le iz strežniškega atribucijskega odgovora
          //      v uspešni poti zgoraj).
          const isClientNetwork =
            (typeof navigator !== "undefined" && navigator.onLine === false) ||
            err instanceof TypeError;
          setState((prev) => ({
            ...prev,
            loading: false,
            error: isClientNetwork ? "client-network" : "supply-unavailable",
            products: [],
            degraded: [],
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
  // sinhronih setState klicev v efektu — React 19 pravila). Modulno-konstanten
  // objekt (AUDIT 42, 42-e F9): brez tega bi vsak render starša dobil NOVO
  // identiteto products:[] → efekt markerjev se ponovno izvede vsak render.
  if (!shouldQuery) {
    return EMPTY_STATE;
  }
  return state;
}

const EMPTY_STATE: SupplyLayerState = {
  products: [],
  loading: false,
  error: null,
  degraded: [],
  adapters: [],
  lastZoom: 0,
};
