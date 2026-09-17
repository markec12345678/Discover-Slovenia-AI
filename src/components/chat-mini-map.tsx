"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { ChatPlace } from "@/lib/geo-intent";
import { cn } from "@/lib/utils";

// ============================================================================
// CHAT MINI MAP — "Geo odgovori" (Task 29, 1.41.0)
// ============================================================================
// Mini zemljevid znotraj AI odgovora v klepetu (Mindtrip vzorec "AI priporoča
// → pini se izrišejo"), v naši izvedbi:
//  - OŠTEVIČENI pini po vrstnem redu seznama krajev (1 = sidro iskanja)
//  - barva = POREKLO podatka (zeleni T1 "preverjeno" / jantarni OSM
//    "skupnostni vir") — zemljevid, ki prizna, od kod so podatki
//  - lazy-loaded (React.lazy v chatbot.tsx) — Leaflet gre v bundle ŠTEKNO,
//    ko prvi geo odgovor prispe (ostale strani ne plačajo ~140 KB)
//
// Leaflet imperativno — isti vzorec kot trip-map-panel.tsx (doslednost).
// ============================================================================

/** Barve pinov po plasteh zaupanja (usklajeno z legendo v chatbot.tsx). */
const PIN_COLORS = {
  t1: "#2d6a3e", // zeleni — naši preverjeni podatki (T1)
  osm: "#b45309", // jantarni — OpenStreetMap skupnostni vir (T3)
} as const;

export interface ChatMiniMapProps {
  places: ChatPlace[];
  /** overlay = velik prikaz čez cel zaslon (zoom kontrola, večji zoom) */
  variant?: "compact" | "overlay";
  className?: string;
}

export function ChatMiniMap({ places, variant = "compact", className }: ChatMiniMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  /** Živi markerji — za kasnejši programatski fokus (ni v MVP) */
  const markersRef = useRef<L.Marker[]>([]);

  // Inicializacija (enkrat)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [46.15, 14.47],
      zoom: variant === "overlay" ? 13 : 12,
      scrollWheelZoom: false,
      zoomControl: variant === "overlay",
      attributionControl: true,
    });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = [];
    };
  }, [variant]);

  // Risanje pinov + prilagoditev pogleda
  useEffect(() => {
    const map = mapRef.current;
    if (!map || places.length === 0) return;

    const layer = L.layerGroup().addTo(map);
    const markers: L.Marker[] = [];

    places.forEach((place, idx) => {
      const color = PIN_COLORS[place.provenance] ?? PIN_COLORS.osm;
      const icon = L.divIcon({
        className: "chat-map-marker",
        html: `
          <div style="transform: translateY(-50%);">
            <div style="
              width: 24px; height: 24px;
              border-radius: 50%;
              background: ${color};
              color: white;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: 700;
              font-size: 11px;
              border: 2px solid white;
              box-shadow: 0 2px 6px rgba(0,0,0,0.35);
            ">${idx + 1}</div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      const marker = L.marker([place.lat, place.lng], { icon });
      marker.bindTooltip(place.name, {
        direction: "top",
        offset: [0, -10],
      });
      marker.addTo(layer);
      markers.push(marker);
    });

    markersRef.current = markers;

    // Prilagodi pogled na vse pine (en pin → blizu, da se vidi kontekst)
    const bounds = L.latLngBounds(places.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, {
      padding: variant === "overlay" ? [40, 40] : [24, 24],
      maxZoom: 15,
    });

    // Leaflet ob skritem/ničelnem kontejnerju napačno izmeri velikost — ob
    // prikazu (lazy load / ekspanzija) previj (isti vzorec kot
    // trip-map-panel). VEČ klicev: lazy chunk + flex layout overlayja se
    // umirita postopoma (VLM presoja mobilnega overlayja: spodnji del
    // ploščic je ostal prazen pri enem samem zgodnjem klicu).
    const invalidate = () => map.invalidateSize();
    const timers = [150, 500, 1200].map((ms) => setTimeout(invalidate, ms));
    const raf = requestAnimationFrame(invalidate);

    return () => {
      cancelAnimationFrame(raf);
      for (const t of timers) clearTimeout(t);
      map.removeLayer(layer);
    };
  }, [places, variant]);

  if (places.length === 0) return null;

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={`Zemljevid s ${places.length} priporočenimi kraji`}
      className={cn(
        "w-full overflow-hidden rounded-lg border border-border/60",
        variant === "overlay" ? "h-full" : "h-40",
        className
      )}
    />
  );
}

export default ChatMiniMap;
