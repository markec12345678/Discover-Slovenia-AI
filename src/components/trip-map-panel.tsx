"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// ============================================================================
// TRIP MAP PANEL — zemljevid poti NA strani načrtovalnika (F5.1)
// ============================================================================
//
// Primerjalna analiza (MindTrip): njihova jedro prednost je "split
// map + itinerary workspace" — vse, kar AI sestavi, se GLEDA na zemljevidu.
// Do Faze 5 je naš zemljevid živel ločeno (/zemljevid, /pot/[shareId]);
// /nacrtuj je bil brez njega.
//
// Ta komponenta je KOMPAKTNA delovna različica mapa za rezultat načrta:
//  - ena barvna črtasta polyline + oštevilčeni markerji PO DNEVU
//  - INTERAKTIVNA legenda: žetoni dni vklop/izklop prikaza
//  - dvosmerna sinhronizacija: klik markerja → scroll na kartico postanka;
//    gumb "Prikaži na zemljevidu" na kartici → map se zamakne na marker
//  - brez plasta vseh destinacij/POI ( to je raziskovalni zemljevid na
//    /zemljevid — tukaj je čista POT uporabnika)
//
// Leaflet imperativno ( isti vzorec kot map-view.tsx — doslednost kode).
// ============================================================================

interface RouteCoord {
  lat: number;
  lng: number;
  name: string;
}

export interface TripMapPanelProps {
  /** Pot grupirana po dnevih z barvami ( iz Zustand store) */
  routeByDay: { day: number; color: string; coords: RouteCoord[] }[];
  /** Kilometri po dnevih ( iz geo-validacije — poštena ocena) */
  dayKm?: Record<number, number>;
  /** Klik markerja → povej plannerju, naj scrolla na kartico postanka */
  onStopSelect?: (day: number, indexInDay: number) => void;
  /** Programatski fokus ( gumb na kartici postanka) → pan na marker */
  focusRequest?: { day: number; indexInDay: number; nonce: number } | null;
  className?: string;
}

export function TripMapPanel({
  routeByDay,
  dayKm,
  onStopSelect,
  focusRequest,
  className,
}: TripMapPanelProps) {
  const t = useTranslations("planner.mapPanel");
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  /** Markerji po dnevu ( za fokus/sinhronizacijo) */
  const dayMarkersRef = useRef<Map<number, L.Marker[]>>(new Map());
  /** Zadnji onStopSelect v refu — marker kliče vedno svež callback */
  const onStopSelectRef = useRef(onStopSelect);
  useEffect(() => {
    onStopSelectRef.current = onStopSelect;
  }, [onStopSelect]);

  const totalDays = routeByDay.length;

  // Vidni dnevi ( privzeto vsi). Žeton "Vsi" = vsi vklopljeni.
  const [hiddenDays, setHiddenDays] = useState<Set<number>>(new Set());

  // Inicializacija mape ( enkrat — neodvisna od plasti)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [46.15, 14.47],
      zoom: 8,
      scrollWheelZoom: false,
      zoomControl: true,
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
      dayMarkersRef.current = new Map();
    };
  }, []);

  // ( Pre)risanje plasti poti — ob spremembi poti ALI vklopa dni.
  // Preklop dneva preriše plasti ( poceni: nekaj markerjev), a NE resetira
  // pogleda (fitBounds živi v ločenem efektu spodaj).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const rootLayer = L.layerGroup().addTo(map);
    dayMarkersRef.current = new Map();

    for (const dayRoute of routeByDay) {
      const visible = !hiddenDays.has(dayRoute.day);
      if (!visible) continue; // skrit dan — sploh ne rišemo

      const layer = L.layerGroup();
      const markers: L.Marker[] = [];

      // Polyline dneva ( če ima ≥ 2 točki)
      if (dayRoute.coords.length >= 2) {
        const latlngs = dayRoute.coords.map(
          (c) => [c.lat, c.lng] as [number, number]
        );
        L.polyline(latlngs, {
          color: dayRoute.color,
          weight: 4,
          opacity: 0.75,
          dashArray: "8, 8",
        }).addTo(layer);
      }

      // Oštevilčeni markerji ( številčenje ZNOTRAJ dneva — usklajeno s
      // karticami dni v plannerju)
      dayRoute.coords.forEach((coord, idx) => {
        const numIcon = L.divIcon({
          className: "trip-map-marker",
          html: `
            <div style="transform: translateY(-50%);">
              <div style="
                width: 26px; height: 26px;
                border-radius: 50%;
                background: ${dayRoute.color};
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: 700;
                font-size: 12px;
                border: 2px solid white;
                box-shadow: 0 2px 6px rgba(0,0,0,0.35);
              ">${idx + 1}</div>
            </div>
          `,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        });
        const marker = L.marker([coord.lat, coord.lng], { icon: numIcon });
        marker.bindTooltip(`${coord.name}`, { direction: "top" });
        marker.on("click", () => {
          onStopSelectRef.current?.(dayRoute.day, idx);
        });
        marker.addTo(layer);
        markers.push(marker);
      });

      layer.addTo(rootLayer);
      dayMarkersRef.current.set(dayRoute.day, markers);
    }

    return () => {
      map.removeLayer(rootLayer);
    };
  }, [routeByDay, hiddenDays]);

  // Prilagodi pogled na vse točke — SAMO ob novi poti ( ne ob preklopu dni)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || routeByDay.length === 0) return;
    const allLatLngs = routeByDay.flatMap((d) =>
      d.coords.map((c) => [c.lat, c.lng] as [number, number])
    );
    if (allLatLngs.length > 0) {
      map.fitBounds(L.latLngBounds(allLatLngs).pad(0.12));
    }
    // Leaflet ob skritem kontejnerju napačno izmeri velikost → previj,
    // ko se komponenta prikaže ( animation frame + pas po mont)
    const invalidate = () => map.invalidateSize();
    const raf = requestAnimationFrame(invalidate);
    const timeout = setTimeout(invalidate, 350);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timeout);
    };
  }, [routeByDay]);

  // Programatski fokus: pan na marker dneva + pulz
  useEffect(() => {
    if (!focusRequest || !mapRef.current) return;
    const markers = dayMarkersRef.current.get(focusRequest.day);
    const marker = markers?.[focusRequest.indexInDay];
    if (!marker) return;

    mapRef.current.panTo(marker.getLatLng(), { animate: true });
    // Pulz: enkratno odpre tooltip + privzdigne z-index
    marker.openTooltip();
    const el = marker.getElement();
    if (el) {
      el.style.filter = "drop-shadow(0 0 6px rgba(45, 106, 62, 0.9))";
      setTimeout(() => {
        if (el) el.style.filter = "";
      }, 1400);
    }
  }, [focusRequest]);

  const allVisible = hiddenDays.size === 0;

  function toggleDay(day: number) {
    setHiddenDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  function toggleAll() {
    setHiddenDays(new Set());
  }

  // Skupni km poti ( vsota dnevnih, za naslov)
  const totalKm = useMemo(
    () =>
      dayKm
        ? Object.values(dayKm).reduce((a, b) => a + b, 0)
        : null,
    [dayKm]
  );

  if (totalDays === 0) return null;

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-4 sm:p-5 space-y-3">
        {/* Glava + interaktivna legenda dni */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <MapPin className="size-4 shrink-0 text-primary" aria-hidden />
            <p className="text-sm font-semibold truncate">
              {t("title")}
              {totalKm ? (
                <span className="ml-1.5 font-normal text-muted-foreground">
                  · ~{totalKm} km
                </span>
              ) : null}
            </p>
          </div>
          <div
            role="group"
            aria-label={t("legendAria")}
            className="flex flex-wrap items-center gap-1.5"
          >
            <button
              type="button"
              onClick={toggleAll}
              aria-pressed={allVisible}
              className={cn(
                "inline-flex min-h-[32px] items-center rounded-full border px-2.5 py-1 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                allVisible
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-muted text-muted-foreground hover:bg-muted/70"
              )}
            >
              {t("allDays")}
            </button>
            {routeByDay.map((d) => {
              const visible = !hiddenDays.has(d.day);
              return (
                <button
                  key={d.day}
                  type="button"
                  onClick={() => toggleDay(d.day)}
                  aria-pressed={visible}
                  title={dayKm?.[d.day] ? `~${dayKm[d.day]} km` : undefined}
                  className={cn(
                    "inline-flex min-h-[32px] items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    visible
                      ? "border-transparent text-white shadow-sm"
                      : "border-border bg-muted text-muted-foreground hover:bg-muted/70"
                  )}
                  style={
                    visible
                      ? { backgroundColor: d.color, borderColor: d.color }
                      : undefined
                  }
                >
                  <span
                    aria-hidden
                    className={cn(
                      "size-2 rounded-full",
                      !visible && "inline-block"
                    )}
                    style={!visible ? { backgroundColor: d.color } : undefined}
                  />
                  {t("dayLabel")} {d.day}
                </button>
              );
            })}
          </div>
        </div>

        {/* Zemljevid */}
        <div
          ref={containerRef}
          role="img"
          aria-label={t("mapAria")}
          className="h-[300px] w-full overflow-hidden rounded-lg border border-border/60 sm:h-[380px]"
        />

        <p className="text-xs text-muted-foreground">{t("hint")}</p>
      </CardContent>
    </Card>
  );
}

export default TripMapPanel;
