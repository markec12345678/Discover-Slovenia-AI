"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent } from "@/components/ui/card";
import type { JourneyProduct, MapProductStatus } from "@/lib/journey/types";
import { taxonomyOf } from "@/lib/supply/taxonomy";

// ============================================================================
// JOURNEY MAP — ZEMLJEVID ENEGA POTOVANJA (TASK 58 §13)
// ============================================================================
// Vsi relevantni produkti potovanja na ENEM zemljevidu z STATUSI pinov:
//   selected (izbrano) · recommended (priporočeno) · informational (info) ·
//   booked/pending/failed (rezervacijski — dosegljivi SAMO prek API_BOOKING
//   toka; danes 0 ponudnikov → NIKOLI prikazani, barva ne laže).
// Pin nikoli ne nakazuje rezervacije, ki je ni (preusmeritev ≠ rezervacija).
// Leaflet imperativno — isti vzorec kot trip-map-panel/map-view.
// ============================================================================

export interface JourneyMapProps {
  products: JourneyProduct[];
  origin?: { label: string; lat?: number; lng?: number };
  destination?: { label: string; lat?: number; lng?: number };
  lang: "sl" | "en";
}

/** Status → prikazna barva/obroba pina (semantično poštena). */
function pinAppearance(status: MapProductStatus): {
  color: string;
  ring: string;
} {
  switch (status) {
    case "selected":
      // Izbrano = izrazita smaragdna obroba (kategorija ostane barvno).
      return { color: "#059669", ring: "#059669" };
    case "booked":
      return { color: "#0891b2", ring: "#0891b2" };
    case "pending":
      return { color: "#d97706", ring: "#d97706" };
    case "failed":
      return { color: "#dc2626", ring: "#dc2626" };
    case "recommended":
      return { color: "#7c3aed", ring: "#7c3aed" };
    case "informational":
    default:
      return { color: "#6b7280", ring: "#6b7280" };
  }
}

function statusLabel(status: MapProductStatus, lang: "sl" | "en"): string {
  const map: Record<MapProductStatus, { sl: string; en: string }> = {
    selected: { sl: "Izbrano", en: "Selected" },
    recommended: { sl: "Priporočeno", en: "Recommended" },
    informational: { sl: "Informacija", en: "Information" },
    booked: { sl: "Rezervirano", en: "Booked" },
    pending: { sl: "V postopku", en: "Pending" },
    failed: { sl: "Spodletelo", en: "Failed" },
  };
  return map[status][lang];
}

export function JourneyMap({ products, origin, destination, lang }: JourneyMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [46.15, 14.99],
      zoom: 8,
      scrollWheelZoom: false,
      attributionControl: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    const bounds: L.LatLngExpression[] = [];
    const t = lang === "en" ? "en" : "sl";

    // Izhodišče (✈) in destinacija (🎯) — kanonični kraji potovanja.
    if (origin?.lat != null && origin?.lng != null) {
      L.marker([origin.lat, origin.lng], {
        icon: L.divIcon({
          className: "",
          html: `<div style="font-size:20px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))">✈️</div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
        title: origin.label,
      })
        .bindPopup(`<strong>✈ ${origin.label}</strong>`)
        .addTo(layer);
      bounds.push([origin.lat, origin.lng]);
    }
    if (destination?.lat != null && destination?.lng != null) {
      L.marker([destination.lat, destination.lng], {
        icon: L.divIcon({
          className: "",
          html: `<div style="font-size:20px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))">🎯</div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
        title: destination.label,
      })
        .bindPopup(`<strong>🎯 ${destination.label}</strong>`)
        .addTo(layer);
      bounds.push([destination.lat, destination.lng]);
    }

    // Produkti s statusi (samo tisti z geo — iskrenost).
    for (const p of products) {
      if (p.lat == null || p.lng == null) continue;
      const tax = taxonomyOf(p.type);
      const appear = pinAppearance(p.mapStatus);
      const price =
        p.price != null
          ? p.price.fromPrice
            ? ` <span style="color:#b45309">od €${p.price.amount} / ${p.price.unit.replace("per_", "")}</span>`
            : ` <span style="color:#059669">€${p.price.amount}</span>`
          : "";
      const dist =
        p.distanceKm != null ? ` · ${p.distanceKm} km` : "";
      const icon =
        p.mapStatus === "selected"
          ? `${tax.icon}<span style="position:absolute;right:-4px;bottom:-4px;font-size:10px">✅</span>`
          : tax.icon;
      L.marker([p.lat, p.lng], {
        icon: L.divIcon({
          className: "",
          html: `<div style="position:relative;font-size:16px;line-height:1;background:#fff;border:2px solid ${appear.color};border-radius:9999px;padding:3px;box-shadow:0 1px 3px rgba(0,0,0,.3)">${icon}</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        }),
        title: p.title,
      })
        .bindPopup(
          `<strong>${tax.icon} ${p.title}</strong><br/>` +
            `<span style="color:#6b7280">${tax.label[t]} · ${statusLabel(p.mapStatus, lang)}${dist}</span>` +
            (price ? `<br/>${price}` : "")
        )
        .addTo(layer);
      bounds.push([p.lat, p.lng]);
    }

    if (bounds.length > 0) {
      map.fitBounds(L.latLngBounds(bounds).pad(0.25), {
        maxZoom: 14,
        animate: false,
      });
    }
  }, [products, origin, destination, lang]);

  return (
    <Card>
      <CardContent className="p-2 sm:p-3">
        <div
          ref={containerRef}
          className="h-[280px] w-full rounded-lg sm:h-[340px]"
          role="region"
          aria-label={lang === "en" ? "Journey map" : "Zemljevid potovanja"}
        />
      </CardContent>
    </Card>
  );
}
