"use client";

// ============================================================================
// MAP PINS — KLIENTSKI HOOK (viewport → /api/map/pins, 1.95.1)
// ============================================================================
// Vzorec use-supply-query (debounce 400 ms, AbortController, zaporedna
// številka proti zastarelim odgovorom) — a za STATIČNI FSQ sloj:
//  - brez zoom gatinga (grid agregacija dela pri VSAKEM zoomu),
//  - brez "enabled" stikala (sloj je osnovna plast zemljevida),
//  - napaka je enostavna boolean (klient pokaže iskren hint).
//
// React 19 higiena (enako kot use-supply-query): setState SAMO iz
// asinhronih callbackov; stanje ob NE-poizvedbi je izpeljano ob branju.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProductType } from "@/lib/supply/types";
import type { MapPin, MapPinCell, MapPinsDatasetInfo } from "@/lib/map-pins";

export interface MapPinsState {
  /** "grid" = mehurčki (z≤10), "pins" = posamezni (z≥11). */
  mode: "grid" | "pins";
  cells: MapPinCell[];
  pins: MapPin[];
  /** Vseh ujemajočih v viewportu (pred kapom). */
  total: number;
  /** Ali je individualni odgovor kap-an (iskrenost za UI). */
  capped: boolean;
  loading: boolean;
  /** Omrežna/strežniška napaka (iskren hint, ponovni poskus ob premiku). */
  error: boolean;
  dataset: MapPinsDatasetInfo | null;
}

interface UseMapPinsOpts {
  /** Trenutni bbox viewporta [s,w,n,e] (null pred prvim syncViewport). */
  bbox: [number, number, number, number] | null;
  /** Trenutni zoom (posodablja MapView ob moveend/zoomend). */
  zoom: number;
  /** Aktivne kategorije (deljene s supply čipi — kanonska taksonomija). */
  cats: ProductType[];
}

const EMPTY: MapPinsState = {
  mode: "grid",
  cells: [],
  pins: [],
  total: 0,
  capped: false,
  loading: false,
  error: false,
  dataset: null,
};

export function useMapPins({ bbox, zoom, cats }: UseMapPinsOpts): MapPinsState {
  const [state, setState] = useState<MapPinsState>(EMPTY);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);
  const catsKey = cats.join(",");

  const run = useCallback(
    (z: number, b: [number, number, number, number], c: ProductType[]) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const seq = ++seqRef.current;

      setState((prev) => ({ ...prev, loading: true, error: false }));

      const params = new URLSearchParams({
        bbox: b.join(","),
        zoom: String(Math.floor(z)),
      });
      if (c.length > 0) params.set("cats", c.join(","));

      fetch(`/api/map/pins?${params.toString()}`, {
        signal: controller.signal,
        cache: "no-store",
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then(
          (data: {
            mode: "grid" | "pins";
            cells?: MapPinCell[];
            pins?: MapPin[];
            total: number;
            returned: number;
            capped: boolean;
            dataset: MapPinsDatasetInfo;
          }) => {
            if (seq !== seqRef.current) return; // zastarel odgovor
            setState({
              mode: data.mode,
              cells: data.cells ?? [],
              pins: data.pins ?? [],
              total: data.total ?? 0,
              capped: Boolean(data.capped),
              loading: false,
              error: false,
              dataset: data.dataset ?? null,
            });
          }
        )
        .catch((err: unknown) => {
          if (seq !== seqRef.current) return;
          if (err instanceof DOMException && err.name === "AbortError") {
            setState((prev) => ({ ...prev, loading: false }));
            return;
          }
          setState((prev) => ({
            ...prev,
            mode: "grid",
            cells: [],
            pins: [],
            total: 0,
            loading: false,
            error: true,
          }));
        });
    },
    []
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (bbox == null) {
      // Še ni viewporta (prvi izris) — poizvedba poteka po syncViewport.
      abortRef.current?.abort();
      return;
    }
    debounceRef.current = setTimeout(() => {
      run(zoom, bbox, cats);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [bbox, zoom, catsKey, run]);

  // Odpoved ob unmountu.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return state;
}
