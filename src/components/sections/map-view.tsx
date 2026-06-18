"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin, Navigation, X, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DESTINATIONS } from "@/lib/slovenia-data";
import type { Destination, DestinationType } from "@/lib/types";

// Emojis za različne tipe destinacij
const TYPE_ICONS: Record<DestinationType, string> = {
  lake: "🏞️",
  city: "🏛️",
  mountain: "⛰️",
  cave: "🕳️",
  coast: "🏖️",
  river: "🌊",
  spa: "💆",
  gorge: "🏞️",
};

interface MapViewProps {
  /** Koordinate poti (polyline) za prikaz — npr. iz AI itinererja */
  routeCoords?: { lat: number; lng: number; name: string }[];
  /** Callback ko uporabnik klikne "Več informacij" na markerju */
  onOpenDestination?: (destination: Destination) => void;
}

/**
 * MapView — interaktivni Leaflet zemljevid Slovenije.
 * Client-only (Leaflet dostopa do window).
 *
 * Prikazuje vseh 12 destinacij kot markerje z custom ikonami,
 * popup-i z informacijami in izbirno polyline za pot.
 */
export function MapView({ routeCoords, onOpenDestination }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const [showRoute, setShowRoute] = useState(true);

  // Inicializiraj zemljevid (enkrat)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [46.15, 14.47], // Center Slovenije
      zoom: 8,
      scrollWheelZoom: false, // Boljša UX na mobilnem
      zoomControl: true,
      attributionControl: true,
    });

    // OpenStreetMap tile layer
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    mapRef.current = map;
    routeLayerRef.current = L.layerGroup().addTo(map);

    // Dodaj markerje za vse destinacije
    DESTINATIONS.forEach((dest) => {
      const icon = L.divIcon({
        className: "destination-marker",
        html: `
          <div class="flex flex-col items-center justify-center" style="transform: translateY(-50%);">
            <div class="flex size-9 items-center justify-center rounded-full bg-primary text-white shadow-lg border-2 border-white text-lg" style="font-family: sans-serif;">
              ${TYPE_ICONS[dest.type]}
            </div>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -20],
      });

      const marker = L.marker([dest.coords.lat, dest.coords.lng], {
        icon,
        title: dest.name,
      }).addTo(map);

      // Popup z informacijami
      const popupHtml = `
        <div style="min-width: 220px; max-width: 260px; font-family: sans-serif;">
          <img src="${dest.image}" alt="${dest.name}" style="width: 100%; height: 120px; object-fit: cover; border-radius: 8px 8px 0 0; margin: -13px -20px 8px -20px; width: calc(100% + 40px);" loading="lazy" />
          <div style="font-weight: 700; font-size: 16px; color: #1a2e1a; margin-bottom: 4px;">${dest.name}</div>
          <div style="font-size: 13px; color: #6b7280; margin-bottom: 8px; line-height: 1.4;">${dest.tagline}</div>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
            <span style="display: inline-flex; align-items: center; gap: 3px; font-size: 13px; font-weight: 600; color: #d97706;">
              <span>★</span> ${dest.rating.toFixed(1)}
            </span>
            <span style="font-size: 12px; color: #6b7280;">·</span>
            <span style="font-size: 12px; color: #6b7280;">${dest.duration}</span>
            <span style="font-size: 12px; color: #6b7280;">·</span>
            <span style="font-size: 12px; color: #6b7280;">${dest.budget}</span>
          </div>
          <button data-dest-id="${dest.id}" class="map-popup-cta" style="
            width: 100%;
            padding: 8px 12px;
            background: #2d6a3e;
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            font-family: sans-serif;
          ">
            Več informacij →
          </button>
        </div>
      `;

      marker.bindPopup(popupHtml, {
        maxWidth: 280,
        className: "destination-popup",
      });

      markersRef.current.push(marker);
    });

    // Cleanup
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = [];
    };
  }, []);

  // Event delegation za CTA gumbe v popupih
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !onOpenDestination) return;

    const handlePopupClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains("map-popup-cta")) {
        const id = target.getAttribute("data-dest-id");
        const dest = DESTINATIONS.find((d) => d.id === id);
        if (dest) {
          map.closePopup();
          onOpenDestination(dest);
        }
      }
    };

    map.getContainer().addEventListener("click", handlePopupClick);
    return () => {
      map.getContainer().removeEventListener("click", handlePopupClick);
    };
  }, [onOpenDestination]);

  // Risanje polyline (poti)
  useEffect(() => {
    const map = mapRef.current;
    const layer = routeLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    if (!showRoute || !routeCoords || routeCoords.length < 2) return;

    // Polyline med vsemi točkami
    const latlngs = routeCoords.map((c) => [c.lat, c.lng]);
    const polyline = L.polyline(latlngs, {
      color: "#2d6a3e",
      weight: 3,
      opacity: 0.7,
      dashArray: "8, 8",
    });
    layer.addLayer(polyline);

    // Numbered markers za vrstni red poti
    routeCoords.forEach((coord, idx) => {
      const numIcon = L.divIcon({
        className: "route-marker",
        html: `
          <div style="transform: translateY(-50%);">
            <div style="
              width: 28px; height: 28px;
              border-radius: 50%;
              background: #d97706;
              color: white;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: 700;
              font-size: 13px;
              border: 2px solid white;
              box-shadow: 0 2px 6px rgba(0,0,0,0.3);
              font-family: sans-serif;
            ">${idx + 1}</div>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      const m = L.marker([coord.lat, coord.lng], { icon: numIcon }).addTo(layer);
      if (coord.name) {
        m.bindTooltip(`${idx + 1}. ${coord.name}`, {
          permanent: false,
          direction: "top",
        });
      }
    });

    // Prilagodi zoom na pot
    map.fitBounds(polyline.getBounds(), { padding: [50, 50] });
  }, [showRoute, routeCoords]);

  const handleResetView = () => {
    mapRef.current?.setView([46.15, 14.47], 8);
  };

  const handleShowAll = () => {
    const map = mapRef.current;
    if (!map) return;
    const group = L.featureGroup(markersRef.current);
    map.fitBounds(group.getBounds(), { padding: [50, 50] });
  };

  const toggleRoute = () => {
    setShowRoute((s) => !s);
  };

  return (
    <div className="relative h-full w-full">
      {/* Map container */}
      <div
        ref={containerRef}
        className="h-[500px] w-full sm:h-[600px] lg:h-full lg:min-h-[600px]"
        role="application"
        aria-label="Interaktivni zemljevid slovenskih destinacij"
      />

      {/* Kontrolni gumbi (zgoraj desno) */}
      <div className="absolute right-3 top-3 z-[1000] flex flex-col gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={handleShowAll}
          className="shadow-md"
        >
          <MapPin className="size-4" />
          Vse destinacije
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={handleResetView}
          className="shadow-md"
        >
          <Navigation className="size-4" />
          Ponastavi
        </Button>
        {routeCoords && routeCoords.length >= 2 ? (
          <Button
            type="button"
            size="sm"
            variant={showRoute ? "default" : "secondary"}
            onClick={toggleRoute}
            className="shadow-md"
          >
            {showRoute ? <X className="size-4" /> : <Navigation className="size-4" />}
            {showRoute ? "Skrij pot" : "Pokaži pot"}
          </Button>
        ) : null}
      </div>

      {/* Info badge (spodaj levo) */}
      <div className="absolute bottom-3 left-3 z-[1000] rounded-lg border border-border bg-background/95 px-3 py-2 text-xs shadow-md backdrop-blur">
        <div className="flex items-center gap-2">
          <Star className="size-3.5 fill-amber-400 text-amber-400" />
          <span className="font-medium">{DESTINATIONS.length} destinacij</span>
          <Badge variant="outline" className="text-[10px]">
            Klikni marker
          </Badge>
        </div>
      </div>
    </div>
  );
}

export default MapView;
