"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type ComponentType,
} from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  MapPin,
  Navigation,
  X,
  Star,
  Loader2,
  Eye,
  EyeOff,
  Ticket,
  Landmark,
  Trees,
  Church,
  Utensils,
  BedDouble,
  ShoppingBag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DESTINATIONS } from "@/lib/slovenia-data";
import { cn } from "@/lib/utils";
import { trackPlannerEvent } from "@/lib/planner-analytics";
import type { Destination, DestinationType } from "@/lib/types";
import {
  PoiModal,
  CATEGORY_META,
} from "@/components/sections/poi-modal";

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
  castle: "🏰",
};

// === Lokalni tip Poi (po API specifikaciji) ===
interface Poi {
  id: string;
  osmId: number;
  name: string;
  category: string;
  subcategory: string;
  lat: number;
  lng: number;
  description?: string;
  website?: string;
  phone?: string;
  openingHours?: string;
  cuisine?: string;
  wikidata?: string;
  wikipedia?: string;
  image?: string;
  address?: string;
}

// === POI kategorije za čipe (1.47) ===
// Uskladitev s čip vzorcem klepeta (1.46): multi-select + iskreni števci +
// prazno stanje. Prej: enojni Select z 5/8 kategorij — hrana, nastanitve
// in trgovine so bile skrite pred uporabniki, čeprav jih /api/pois že
// podpira. Ikone se prekrivajo namenoma s klepetom tam, kjer je semantika
// ista (restaurant↔food: Utensils, hotel↔stay: BedDouble).
const POI_CATEGORIES: {
  value: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Privzeto vklopljene kategorije naložimo z ENIM klicem category=all
   *  (hrana/nastanitve/trgovine so preštevilčne — izrecna izbira). */
  default: boolean;
}[] = [
  { value: "attraction", label: "Atrakcije", icon: Ticket, default: true },
  { value: "museum", label: "Muzeji", icon: Landmark, default: true },
  { value: "natural", label: "Narava", icon: Trees, default: true },
  { value: "viewpoint", label: "Razgledišča", icon: Eye, default: true },
  { value: "religious", label: "Religiozno", icon: Church, default: true },
  {
    value: "restaurant",
    label: "Hrana & pijača",
    icon: Utensils,
    default: false,
  },
  { value: "hotel", label: "Nastanitve", icon: BedDouble, default: false },
  { value: "shop", label: "Trgovine", icon: ShoppingBag, default: false },
];

const DEFAULT_POI_CATS = POI_CATEGORIES.filter((c) => c.default).map(
  (c) => c.value
);

interface MapViewProps {
  /** Koordinate poti (polyline) za prikaz — npr. iz AI itinererja */
  routeCoords?: { lat: number; lng: number; name: string; day?: number }[];
  /** Koordinate grupirane po dnevih z barvami (Wanderlog color-coded) */
  routeByDay?: { day: number; color: string; coords: { lat: number; lng: number; name: string }[] }[];
  /** Callback ko uporabnik klikne "Več informacij" na markerju */
  onOpenDestination?: (destination: Destination) => void;
}

/**
 * MapView — interaktivni Leaflet zemljevid Slovenije.
 * Client-only (Leaflet dostopa do window).
 *
 * Prikazuje vseh 22 destinacij kot markerje z custom ikonami,
 * popup-i z informacijami in izbirno polyline za pot.
 *
 * POI layer (default OFF): dodatni manjši markerji iz OpenStreetMap,
 * filtrirani z multi-select čipi kategorij (usklajeno s klepetom, 1.47).
 * Klik odpre PoiModal z Wikipedia opisom.
 */
export function MapView({ routeCoords, routeByDay, onOpenDestination }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const poiLayerRef = useRef<L.LayerGroup | null>(null);
  const [showRoute, setShowRoute] = useState(true);

  // === POI state (1.47: multi-select čipi po kategorijah) ===
  const [showPois, setShowPois] = useState(false);
  /** Aktivne (vklopljene) kategorije — izklop = skrivanje, ne brisanje. */
  const [activeCats, setActiveCats] = useState<ReadonlySet<string>>(
    () => new Set(DEFAULT_POI_CATS)
  );
  /** Kategorije z ongoing prenosom (spinner na čipu + globalni loader). */
  const [loadingCats, setLoadingCats] = useState<ReadonlySet<string>>(
    new Set()
  );
  const [poiError, setPoiError] = useState<string | null>(null);
  // Cache POI-jev po kategoriji — NAMENOMA ref, ne state: preživi izklop
  // plaste (ponovni vklop = instant iz cache-a, 0 omrežnih klicev) in
  // preklope filtrov. complete=false = delni seznam iz skupnega "all"
  // klica; complete=true = naloženo posamično (poln seznam). Mutacije
  // sporoča cacheVersion, da se izpeljana useMemo rekonstituirata.
  const poiCacheRef = useRef<Map<string, { pois: Poi[]; complete: boolean }>>(
    new Map()
  );
  /** Dvojni klic istega categoryja med letom (rapid toggling). */
  const poiInflightRef = useRef<Set<string>>(new Set());
  const [cacheVersion, setCacheVersion] = useState(0);
  // Ref za dostop do najnovejših POI-jev iz event handlerja (closure safe)
  const poisRef = useRef<Poi[]>([]);
  const [selectedPoi, setSelectedPoi] = useState<Poi | null>(null);

  /** Prikazani POI-ji = aktivne kategorije ∩ cache (0 klicev ob filtru). */
  const pois = useMemo<Poi[]>(() => {
    void cacheVersion; // odvisnost: recompute po vsaki mutaciji cache-a
    if (!showPois) return [];
    const out: Poi[] = [];
    for (const cat of activeCats) {
      out.push(...(poiCacheRef.current.get(cat)?.pois ?? []));
    }
    return out;
  }, [showPois, activeCats, cacheVersion]);

  /** Iskreni števci čipov — koliko POI-jev je dejansko naloženih po kategoriji. */
  const catCounts = useMemo<ReadonlyMap<string, number>>(() => {
    void cacheVersion;
    const m = new Map<string, number>();
    for (const c of POI_CATEGORIES) {
      m.set(c.value, poiCacheRef.current.get(c.value)?.pois.length ?? 0);
    }
    return m;
  }, [cacheVersion]);

  // Cache spremeni izpeljeni seznam → posodobi ref za event handlerje
  useEffect(() => {
    poisRef.current = pois;
  }, [pois]);

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
    poiLayerRef.current = L.layerGroup().addTo(map);

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
            <span style="font-size: 12px; color: #6b7280;">uredniška</span>
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
      poiLayerRef.current = null;
    };
  }, []);

  // Event delegation za CTA gumbe v popupih (destinacije + POI)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handlePopupClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // POI CTA → odpri PoiModal
      if (target.classList.contains("map-poi-cta")) {
        const id = target.getAttribute("data-poi-id");
        const poi = poisRef.current.find((p) => p.id === id);
        if (poi) {
          map.closePopup();
          setSelectedPoi(poi);
        }
        return;
      }

      // Destinacijski CTA → odpri DestinationModal
      if (target.classList.contains("map-popup-cta")) {
        const id = target.getAttribute("data-dest-id");
        const dest = DESTINATIONS.find((d) => d.id === id);
        if (dest) {
          map.closePopup();
          onOpenDestination?.(dest);
        }
      }
    };

    map.getContainer().addEventListener("click", handlePopupClick);
    return () => {
      map.getContainer().removeEventListener("click", handlePopupClick);
    };
  }, [onOpenDestination]);

  // Risanje polyline (poti) — color-coded po dnevih (Wanderlog)
  useEffect(() => {
    const map = mapRef.current;
    const layer = routeLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    if (!showRoute) return;

    // Če imamo routeByDay, riši vsak dan z svojo barvo
    if (routeByDay && routeByDay.length > 0) {
      let globalIdx = 0;
      routeByDay.forEach((dayRoute) => {
        if (dayRoute.coords.length < 2) {
          // Samo ena točka — marker brez polyline
          dayRoute.coords.forEach((coord) => {
            const numIcon = L.divIcon({
              className: "route-marker",
              html: `
                <div style="transform: translateY(-50%);">
                  <div style="
                    width: 28px; height: 28px;
                    border-radius: 50%;
                    background: ${dayRoute.color};
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 700;
                    font-size: 13px;
                    border: 2px solid white;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                  ">${globalIdx + 1}</div>
                </div>
              `,
              iconSize: [28, 28],
              iconAnchor: [14, 14],
            });
            const marker = L.marker([coord.lat, coord.lng], { icon: numIcon });
            marker.bindPopup(`<strong>${coord.name}</strong><br>Dan ${dayRoute.day}`);
            layer.addLayer(marker);
            globalIdx++;
          });
          return;
        }

        const latlngs = dayRoute.coords.map((c) => [c.lat, c.lng] as [number, number]);
        const polyline = L.polyline(latlngs, {
          color: dayRoute.color,
          weight: 4,
          opacity: 0.8,
          dashArray: "8, 8",
        });
        layer.addLayer(polyline);

        // Numbered markers z barvo dneva
        dayRoute.coords.forEach((coord) => {
          const numIcon = L.divIcon({
            className: "route-marker",
            html: `
              <div style="transform: translateY(-50%);">
                <div style="
                  width: 28px; height: 28px;
                  border-radius: 50%;
                  background: ${dayRoute.color};
                  color: white;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  font-weight: 700;
                  font-size: 13px;
                  border: 2px solid white;
                  box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                ">${globalIdx + 1}</div>
              </div>
            `,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          });
          const marker = L.marker([coord.lat, coord.lng], { icon: numIcon });
          marker.bindPopup(`<strong>${coord.name}</strong><br>Dan ${dayRoute.day}`);
          layer.addLayer(marker);
          globalIdx++;
        });
      });

      // Fit bounds na vse točke
      const allLatLngs = routeByDay.flatMap((d) => d.coords.map((c) => [c.lat, c.lng] as [number, number]));
      if (allLatLngs.length > 0) {
        map.fitBounds(L.latLngBounds(allLatLngs).pad(0.1));
      }
      return;
    }

    // Fallback: ena barva za vse (stara logika)
    if (!routeCoords || routeCoords.length < 2) return;

    const latlngs = routeCoords.map((c) => [c.lat, c.lng] as [number, number]);
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
  }, [showRoute, routeCoords, routeByDay]);

  // === POI fetch — kategorija-po-kategorija s skupnim cache-om (1.47) ===
  // Prvi vklop plaste: EN klic category=all pokrije vseh 5 privzetih
  // kategorij (isti obseg kot prej — ne 5 ločenih klicev na Overpass).
  // Vklop dodatne kategorije (hrana/nastanitve/trgovine) = 1 posamičen
  // klic, samo če še ni v cache-u. Izklop kategorije = čisto skrivanje
  // (0 klicev) — enak vzorec kot čipi v klepetu (1.46), kjer filter dela
  // nad že pridobljenimi kraji. Lazy upgrade: kadar je aktivna IZKLJUČNO
  // ena privzeta kategorija, se njen delni seznam iz "all" klica nadgradi
  // s posamičnim (polnih 200 — enako kot prejšnje vedenje ene kategorije).
  const ensureDefaultLayer = useCallback(async () => {
    if (poiInflightRef.current.has("__all__")) return;
    if (DEFAULT_POI_CATS.some((c) => poiCacheRef.current.has(c))) return;
    poiInflightRef.current.add("__all__");
    setLoadingCats((prev) => {
      const next = new Set(prev);
      for (const c of DEFAULT_POI_CATS) next.add(c);
      return next;
    });
    setPoiError(null);
    try {
      const res = await fetch(`/api/pois?category=all&limit=200`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { pois: Poi[] } = await res.json();
      const byCat = new Map<string, Poi[]>();
      for (const p of data.pois ?? []) {
        const list = byCat.get(p.category);
        if (list) list.push(p);
        else byCat.set(p.category, [p]);
      }
      for (const cat of DEFAULT_POI_CATS) {
        poiCacheRef.current.set(cat, {
          pois: byCat.get(cat) ?? [],
          complete: false,
        });
      }
      setCacheVersion((v) => v + 1);
    } catch (e) {
      console.error("[map-view/pois] napaka:", e);
      setPoiError("POI-jev ni mogoče naložiti. Poskusite pozneje.");
    } finally {
      poiInflightRef.current.delete("__all__");
      setLoadingCats((prev) => {
        const next = new Set(prev);
        for (const c of DEFAULT_POI_CATS) next.delete(c);
        return next;
      });
    }
  }, []);

  const ensureCategory = useCallback(async (cat: string) => {
    if (poiInflightRef.current.has(cat)) return;
    if (poiCacheRef.current.get(cat)?.complete) return;
    poiInflightRef.current.add(cat);
    setLoadingCats((prev) => new Set(prev).add(cat));
    setPoiError(null);
    try {
      const res = await fetch(
        `/api/pois?category=${encodeURIComponent(cat)}&limit=200`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { pois: Poi[] } = await res.json();
      poiCacheRef.current.set(cat, { pois: data.pois ?? [], complete: true });
      setCacheVersion((v) => v + 1);
    } catch (e) {
      console.error("[map-view/pois] napaka:", e);
      setPoiError("POI-jev ni mogoče naložiti. Poskusite pozneje.");
    } finally {
      poiInflightRef.current.delete(cat);
      setLoadingCats((prev) => {
        const next = new Set(prev);
        next.delete(cat);
        return next;
      });
    }
  }, []);

  // Sproži ustrezne prenose ob vklopu plaste / spremembi filtrov
  useEffect(() => {
    if (!showPois) {
      setPoiError(null);
      return;
    }
    const active = [...activeCats];
    const anyDefaultActive = active.some((c) => DEFAULT_POI_CATS.includes(c));
    if (
      anyDefaultActive &&
      !DEFAULT_POI_CATS.some((c) => poiCacheRef.current.has(c))
    ) {
      void ensureDefaultLayer();
    }
    const single = active.length === 1;
    for (const cat of active) {
      const entry = poiCacheRef.current.get(cat);
      if (!entry && !DEFAULT_POI_CATS.includes(cat)) {
        // dodatna kategorija (hrana/nastanitve/trgovine) — posamičen klic
        void ensureCategory(cat);
      } else if (entry && single && !entry.complete) {
        // lazy upgrade delnega seznama iz "all" klica
        void ensureCategory(cat);
      }
    }
  }, [showPois, activeCats, ensureDefaultLayer, ensureCategory]);

  const toggleCat = (cat: string) => {
    const wasOn = activeCats.has(cat);
    setActiveCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
    // Telemetrija (komplement chat_geo_filtered s klepeta): meri, ali
    // multi-select čipi pomagajo tudi na brskalnem zemljevidu — in katere
    // kategorije uporabniki dejansko iščejo (hrana/nastanitve).
    trackPlannerEvent("map_poi_filtered", {
      category: cat,
      enabled: wasOn ? 0 : 1,
      surface: "map",
    });
  };

  /** Prazno stanje → nazaj na privzetih 5 kategorij (iz cache-a, instant). */
  const resetCats = () => {
    setActiveCats(new Set(DEFAULT_POI_CATS));
  };

  // === Render POI markerjev — ko se pois ali showPois spremenita ===
  useEffect(() => {
    const layer = poiLayerRef.current;
    if (!layer) return;

    layer.clearLayers();

    if (!showPois || pois.length === 0) return;

    pois.forEach((poi) => {
      const meta = CATEGORY_META[poi.category] ?? CATEGORY_META.other;
      const icon = L.divIcon({
        className: "poi-marker",
        html: `
          <div style="transform: translateY(-50%);">
            <div style="
              width: 28px; height: 28px;
              border-radius: 50%;
              background: ${meta.color};
              color: white;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 14px;
              border: 2px solid white;
              box-shadow: 0 1px 3px rgba(0,0,0,0.35);
              font-family: sans-serif;
              cursor: pointer;
            ">${meta.icon}</div>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -14],
      });

      const marker = L.marker([poi.lat, poi.lng], {
        icon,
        title: poi.name,
      }).addTo(layer);

      const popupHtml = `
        <div style="min-width: 180px; max-width: 220px; font-family: sans-serif;">
          <div style="font-weight: 700; font-size: 14px; color: #1a2e1a; margin-bottom: 6px; line-height: 1.3;">
            ${escapeHtml(poi.name)}
          </div>
          <span style="
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 2px 8px;
            border-radius: 12px;
            background: ${meta.color};
            color: white;
            font-size: 11px;
            font-weight: 600;
            margin-bottom: 10px;
          ">${meta.icon} ${meta.label}</span>
          <button data-poi-id="${escapeAttr(poi.id)}" class="map-poi-cta" style="
            width: 100%;
            padding: 6px 10px;
            background: ${meta.color};
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            font-family: sans-serif;
          ">Podrobnosti →</button>
        </div>
      `;

      marker.bindPopup(popupHtml, {
        maxWidth: 240,
        className: "poi-popup",
      });
    });
  }, [pois, showPois]);

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

  const togglePois = () => {
    setShowPois((s) => !s);
  };

  return (
    <div className="relative h-full w-full">
      {/* Map container */}
      <div
        ref={containerRef}
        className="h-[500px] w-full sm:h-[600px] lg:h-full lg:min-h-[600px]"
        role="application"
        aria-label="Interaktivni zemljevid slovenskih destinacij in točk interesa"
      />

      {/* Kontrolni gumbi (zgoraj desno) — kompaktneje da ne prekrivajo */}
      <div className="absolute right-3 top-3 z-[1000] flex flex-col gap-1.5 max-h-[calc(100%-80px)] overflow-y-auto scroll-area-custom">
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

        {/* POI layer toggle */}
        <Button
          type="button"
          size="sm"
          variant={showPois ? "default" : "secondary"}
          onClick={togglePois}
          className="shadow-md"
          aria-pressed={showPois}
        >
          {showPois ? (
            <Eye className="size-4" />
          ) : (
            <EyeOff className="size-4" />
          )}
          {showPois ? "Skrij POI" : "Pokaži POI"}
        </Button>
      </div>

      {/* POI category chips (1.47) — multi-select s števci, usklajeno s
          čip vzorcem klepeta. Prikazani samo ko je POI layer vklopljen.
          NAMENOMA vrstnik kontrolnega stolpca (ne njegov otrok): absolute
          bottom-12 left-3 se mora razrešiti proti ZEMLJEVIDU (div.relative),
          ne proti ozkemu stolpcu z gumbi desno zgoraj. */}
      {showPois ? (
        <div className="absolute bottom-12 left-3 z-[1000] max-w-[calc(100%-1.5rem)] rounded-md border border-border bg-background/95 p-1.5 shadow-md backdrop-blur sm:max-w-[calc(100%-9rem)]">
          <div
            role="group"
            aria-label="Filtriranje POI kategorij"
            className="flex flex-wrap gap-1"
          >
            {POI_CATEGORIES.map(({ value, label, icon: Icon }) => {
              const on = activeCats.has(value);
              const loading = loadingCats.has(value);
              const loaded = poiCacheRef.current.has(value);
              const count = catCounts.get(value) ?? 0;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggleCat(value)}
                  aria-pressed={on}
                  title={label}
                  className={cn(
                    "flex min-h-7 shrink-0 items-center gap-1 rounded-full border px-2 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    on
                      ? "border-primary/30 bg-primary/10 text-foreground"
                      : "border-border/60 bg-transparent text-muted-foreground opacity-60"
                  )}
                >
                  {loading ? (
                    <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden />
                  ) : (
                    <Icon className="size-3 shrink-0" aria-hidden />
                  )}
                  <span className="truncate">{label}</span>
                  {loaded && !loading ? (
                    <span className="shrink-0 tabular-nums opacity-70">
                      {count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          {/* Prazno stanje — iskren opis + reset (vzorec iz klepeta 1.46) */}
          {activeCats.size === 0 ? (
            <div className="mt-1 flex items-center justify-between gap-2 border-t border-border/60 pt-1">
              <p className="text-[10px] leading-snug text-muted-foreground">
                Vse kategorije so izklopljene — POI-ji niso prikazani.
              </p>
              <button
                type="button"
                onClick={resetCats}
                className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[10px] font-medium text-foreground transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Prikaži privzeto
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Loading spinner za POI fetch (zgornji levi kot, ne blokira zemljevida) */}
      {loadingCats.size > 0 ? (
        <div className="absolute left-3 top-3 z-[1000] flex items-center gap-2 rounded-lg border border-border bg-background/95 px-3 py-1.5 text-xs shadow-md backdrop-blur">
          <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden="true" />
          <span className="font-medium">Nalagam POI-je…</span>
        </div>
      ) : null}

      {/* Error badge za POI (zgornji levi, pod spinnerjem) */}
      {loadingCats.size === 0 && poiError && showPois ? (
        <div className="absolute left-3 top-12 z-[1000] max-w-[220px] rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 shadow-md dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          {poiError}
        </div>
      ) : null}

      {/* Info badge (spodaj levo) */}
      <div className="absolute bottom-3 left-3 z-[1000] rounded-lg border border-border bg-background/95 px-3 py-2 text-xs shadow-md backdrop-blur">
        <div className="flex items-center gap-2">
          <Star className="size-3.5 fill-amber-400 text-amber-400" />
          <span className="font-medium">{DESTINATIONS.length} destinacij</span>
          {showPois && pois.length > 0 ? (
            <>
              <span className="text-muted-foreground">·</span>
              <Badge variant="outline" className="text-[10px]">
                {pois.length} POI · OSM
              </Badge>
            </>
          ) : null}
          {!showPois ? (
            <Badge variant="outline" className="text-[10px]">
              Klikni marker
            </Badge>
          ) : null}
        </div>
      </div>

      {/* PoiModal — odpre se ko uporabnik klikne POI marker */}
      <PoiModal poi={selectedPoi} onClose={() => setSelectedPoi(null)} />
    </div>
  );
}

/** Escaping za varno vstavljanje teksta v HTML popup-a. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escaping za HTML atribut (data-poi-id). */
function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default MapView;
