"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { useLocale } from "next-intl";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
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
  CarTaxiFront,
  Compass,
  Bus,
  Fuel,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DESTINATIONS } from "@/lib/slovenia-data";
import { DESTINATIONS_EN } from "@/lib/slovenia-data-en";
import { cn } from "@/lib/utils";
import { trackPlannerEvent } from "@/lib/planner-analytics";
import type { Destination, DestinationType } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { taxonomyOf } from "@/lib/supply/taxonomy";
import type { ProductType, ProviderProduct } from "@/lib/supply/types";
import { useSupplyQuery } from "@/lib/supply/use-supply-query";
import { useMapPins } from "@/lib/map-pins-client";
import { SUPPLY_MIN_ZOOM } from "@/lib/supply/zoom";
import { getProvider } from "@/lib/supply/registry";
import { addProductToSelection } from "@/lib/supply/selection";
import { ProductModal } from "@/components/supply/product-modal";
import { ProviderPanel } from "@/components/supply/provider-panel";

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

// === Privzeti pogled: Slovenija + zahodni Balkan (1.95.1) =================
// Bbox 38 uredniških destinacij (SI+HR+ME+AL — TASK 62) — zemljevid se
// odpri na CELI regiji, ne samo Sloveniji. Center je rezerva za L.map()
// pred fitBounds (fitBounds se prilagodi dejanski velikosti kontejnerja).
const BALKANS_BOUNDS = L.latLngBounds([39.88, 13.57], [46.67, 20.14]);
const BALKANS_CENTER: [number, number] = [43.3, 16.9];

// === Dvojezični nizi zemljevida (1.48) — T (prevodi), ker je L že Leaflet ===
// (locale je stabilen za življenjsko dobo komponente: sprememba jezika =
// navigacija = remount; vseeno je v deps Effectov, da so popup-i iz LEAFLET
// template stringov vedno vezani na trenutni jezik)
const T = {
  catAttraction: { sl: "Atrakcije", en: "Attractions" },
  catMuseum: { sl: "Muzeji", en: "Museums" },
  catNatural: { sl: "Narava", en: "Nature" },
  catViewpoint: { sl: "Razgledišča", en: "Viewpoints" },
  catReligious: { sl: "Religiozno", en: "Religious" },
  catRestaurant: { sl: "Hrana & pijača", en: "Food & drink" },
  catAccommodation: { sl: "Nastanitve", en: "Stays" },
  catShop: { sl: "Trgovine", en: "Shops" },
  catPetrol: { sl: "Bencinske", en: "Petrol" },
  // TASK 45: aktivnosti/ture (Viator Partner API) — izrecna izbira
  // (default: false; naročniška zahteva §9: sloj OFF → 0 API klicev).
  catActivity: { sl: "Aktivnosti", en: "Activities" },
  catTour: { sl: "Ture", en: "Tours" },
  // TASK 43: transfer sloj (KiwiTaxi) — izrecna izbira (default: false):
  // sloj se prikaže SAMO ko ga uporabnik vklopi (naročniška zahteva §9).
  catTransfer: { sl: "Transferji", en: "Transfers" },
  allDestinations: { sl: "Vse destinacije", en: "All destinations" },
  reset: { sl: "Ponastavi", en: "Reset" },
  hideRoute: { sl: "Skrij pot", en: "Hide route" },
  showRoute: { sl: "Pokaži pot", en: "Show route" },
  hidePois: { sl: "Skrij POI", en: "Hide POI" },
  showPois: { sl: "Pokaži POI", en: "Show POI" },
  chipsAria: {
    sl: "Filtriranje POI kategorij",
    en: "Filter POI categories",
  },
  emptyText: {
    sl: "Vse kategorije so izklopljene — točke niso prikazane.",
    en: "All categories are off — no places are shown.",
  },
  emptyReset: { sl: "Prikaži privzeto", en: "Show defaults" },
  loadingPois: { sl: "Nalagam POI-je…", en: "Loading POIs…" },
  errorPois: {
    sl: "POI-jev ni mogoče naložiti. Poskusite pozneje.",
    en: "POIs could not be loaded. Try again later.",
  },
  mapAria: {
    sl: "Interaktivni zemljevid Slovenije in Balkana z destinacijami, bencinskimi, restavracijami in nastanitvami",
    en: "Interactive map of Slovenia and the Balkans with destinations, petrol stations, restaurants and stays",
  },
  infoDestUnit: { sl: "destinacij", en: "destinations" },
  infoClickMarker: { sl: "Klikni marker", en: "Tap a marker" },
  editorial: { sl: "uredniška", en: "editorial" },
  moreInfo: { sl: "Več informacij →", en: "More info →" },
  details: { sl: "Podrobnosti →", en: "Details →" },
  day: {
    sl: (n: number) => `Dan ${n}`,
    en: (n: number) => `Day ${n}`,
  },
  // F1 (Supply Map):
  zoomHint: {
    sl: "Približajte zemljevid za lokalne točke (z ≥ 10).",
    en: "Zoom in for local places (z ≥ 10).",
  },
  degradedHint: {
    sl: "Nekateri viri trenutno niso dosegljivi — destinacije ostajajo.",
    en: "Some sources are unreachable right now — destinations remain.",
  },
  // TASK 99-a (§15): iskrena oznaka za "client-network" — napaka je na
  // STRANI ODJEMALCA (offline), zato NE obtožuje virov/ponudnikov.
  networkHint: {
    sl: "Ni internetne povezave — destinacije ostajajo na voljo.",
    en: "You appear to be offline — destinations remain available.",
  },
  // MAP PINS sloj (1.95.1) — statični FSQ: bencinske/restavracije/
  // nastanitve SI+HR+ME+AL.
  pinsUnit: { sl: "točk", en: "places" },
  pinsCappedHint: {
    sl: "Prikazanih najboljše ocenjenih — približajte za vse.",
    en: "Showing best-rated — zoom in for all.",
  },
  pinsError: {
    sl: "Točk ni bilo mogoče naložiti — premaknite zemljevid in poskusite znova.",
    en: "Places could not be loaded — move the map and try again.",
  },
  pinsCellTitle: {
    sl: (n: number) => `${n} točk na tem območju`,
    en: (n: number) => `${n} places in this area`,
  },
  pinsCellZoom: { sl: "Približaj to območje", en: "Zoom into this area" },
  pinsReviews: {
    sl: (n: number) => `${n} mnenj`,
    en: (n: number) => `${n} reviews`,
  },
  // Atribucija (Apache-2.0) — ISTA vrednost kot MAP_PINS_SOURCE v
  // src/lib/map-pins.ts (server; klient ne sme uvažati node:fs plasti).
  pinsAttribution: {
    sl: "Foursquare Open Places (Apache-2.0)",
    en: "Foursquare Open Places (Apache-2.0)",
  },
} as const;

type MapLang = keyof typeof T.allDestinations;

// === Kategorije čipov (1.47 → F1 kanonska taksonomija) ===
// Vrednosti so zdaj KANONSKI ProductType iz supply taksonomije ("hotel" →
// "accommodation") — isti čipi, isti imenik, novi vir (supply API).
// Ikone se prekrivajo namenoma s klepetom tam, kjer je semantika ista.
const POI_CATEGORIES: {
  value: ProductType;
  label: { sl: string; en: string };
  icon: ComponentType<{ className?: string }>;
  default: boolean;
}[] = [
  { value: "attraction", label: T.catAttraction, icon: Ticket, default: true },
  { value: "museum", label: T.catMuseum, icon: Landmark, default: true },
  { value: "natural", label: T.catNatural, icon: Trees, default: true },
  { value: "viewpoint", label: T.catViewpoint, icon: Eye, default: true },
  { value: "religious", label: T.catReligious, icon: Church, default: true },
  // 1.95.1: bencinske/hrana/nastanitve/trgovine so zdaj PRIVZETO VKLOPLJENE
  // (uporabniška zahteva: "pini vse bencinske lokali restavracije hoteli
  // itd") — gostoto nadzoruje zoom-aware map-pins sloj (grid agregacija
  // pri nizkem zoomu) + strežniški zoom gating supply plasti (minZoom iz
  // taksonomije — restavracije z≥13 ipd.).
  {
    value: "petrol",
    label: T.catPetrol,
    icon: Fuel,
    default: true,
  },
  {
    value: "restaurant",
    label: T.catRestaurant,
    icon: Utensils,
    default: true,
  },
  {
    value: "accommodation",
    label: T.catAccommodation,
    icon: BedDouble,
    default: true,
  },
  { value: "shop", label: T.catShop, icon: ShoppingBag, default: true },
  {
    value: "transfer",
    label: T.catTransfer,
    icon: CarTaxiFront,
    default: false,
  },
  // TASK 45: Viator plasti (aktivnosti + ture) — kanonska taksonomija,
  // privzeto IZKLOPLJENO (isti vzorec kot Transferji iz Taska 43).
  {
    value: "activity",
    label: T.catActivity,
    icon: Compass,
    default: false,
  },
  {
    value: "tour",
    label: T.catTour,
    icon: Bus,
    default: false,
  },
];

// 1.95.1: privzete kategorije ZEMLJEVIDA (9 lokalnih tipov — "vsa mesta
// Balkana"). NAMENOMA lokalna konstanta, NE DEFAULT_SUPPLY_TYPES (strežniški
// privzete supply poizvedbe ostanejo nespremenjene — čipi zemljevida
// pošljejo svojo izbiro eksplicitno).
const DEFAULT_POI_CATS: ProductType[] = [
  "attraction",
  "museum",
  "viewpoint",
  "natural",
  "religious",
  "petrol",
  "restaurant",
  "accommodation",
  "shop",
];

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
 * F1 (Supply Map, 1.49.0): POI plast je zdaj SUPPLY sloj — viewport →
 * bbox → /api/supply/search (ne več fiksni bbox cele Slovenije!), z
 * grozdenjem (leaflet.markercluster), zoom gatingom in kanoničnimi
 * ProviderProduct markerji (modal + "Dodaj v moj načrt").
 */
export function MapView({ routeCoords, routeByDay, onOpenDestination }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const poiLayerRef = useRef<L.MarkerClusterGroup | null>(null);
  // 1.95.1: MAP PINS sloj — grid mehurčki (z≤10) + grozd posameznih pinov
  // (z≥11). Ločeno od supply poiLayer (komercialni/OSR produkti z modali).
  const gridLayerRef = useRef<L.LayerGroup | null>(null);
  const pinsClusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const [showRoute, setShowRoute] = useState(true);
  // 1.48: dvojezičnost (vzorec L iz map-section — prej hardcoded SL tudi na /en)
  const lang: MapLang = useLocale() === "en" ? "en" : "sl";

  // === SUPPLY state (F1) ===
  const [showPois, setShowPois] = useState(false);
  /** Aktivne (vklopljene) kategorije — izklop = skrivanje. */
  const [activeCats, setActiveCats] = useState<ReadonlySet<ProductType>>(
    () => new Set(DEFAULT_POI_CATS)
  );
  /** Trenutni viewport (posodobi se ob moveend/zoomend). */
  const [viewport, setViewport] = useState<{
    bbox: [number, number, number, number] | null;
    zoom: number;
  }>({ bbox: null, zoom: 8 });
  const [selectedProduct, setSelectedProduct] = useState<ProviderProduct | null>(null);

  const selectedProducts = useAppStore((s) => s.selectedProducts);
  const selectedIds = useMemo(
    () =>
      new Set(
        selectedProducts.map((p) => `${p.provider}:${p.providerProductId}`)
      ),
    [selectedProducts]
  );

  // Viewport → bbox → supply query (debounce v hooku; zoom gating strežniško).
  const cats = useMemo(() => [...activeCats].sort(), [activeCats]);
  const supply = useSupplyQuery({
    enabled: showPois,
    cats,
    zoom: viewport.zoom,
    bbox: viewport.bbox,
    locale: lang,
  });

  // 1.95.1: MAP PINS — statični FSQ sloj (bencinske/restavracije/nastanitve
  // … SI+HR+ME+AL) — VEDNO aktiven (grid agregacija pri nizkem zoomu,
  // posamezni pini pri z≥11). Isti cats kot supply (deljeni čipi).
  const pins = useMapPins({
    bbox: viewport.bbox,
    zoom: viewport.zoom,
    cats,
  });

  // Ref za dostop do najnovejših produktov iz event handlerja (closure safe)
  const productsRef = useRef<ProviderProduct[]>([]);
  useEffect(() => {
    productsRef.current = supply.products;
  }, [supply.products]);

  /** Najbližja destinacija centru karte (affiliate dest za provider kartice). */
  const nearestDestSlug = useMemo(() => {
    const map = mapRef.current;
    if (!map) return "slovenija";
    const c = map.getCenter();
    let best = { slug: "slovenija", dist: Number.POSITIVE_INFINITY };
    for (const d of DESTINATIONS) {
      const R = 6371;
      const dLat = ((d.coords.lat - c.lat) * Math.PI) / 180;
      const dLng = ((d.coords.lng - c.lng) * Math.PI) / 180;
      const s =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((c.lat * Math.PI) / 180) *
          Math.cos((d.coords.lat * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2;
      const dist = 2 * R * Math.asin(Math.sqrt(s));
      if (dist < best.dist) best = { slug: d.slug, dist };
    }
    return best.slug;
  }, [viewport]);

  // Inicializiraj zemljevid (enkrat)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // TASK 86: glob lokacija iz query (?lat=&lng=&zoom=&label=) —
    // povezava "Prikaži na zemljevidu" iz javnega listing modala.
    // Client-only branje (leaflet init živi v useEffect → ni SSR/hidration
    // vprašanj); neveljaven vnos iskreno pade na privzeti pogled Slovenije.
    // Null island (0,0) zavrnjen — enaka konvencija kot supply adapterji.
    const q = new URLSearchParams(window.location.search);
    const qLat = Number(q.get("lat"));
    const qLng = Number(q.get("lng"));
    const qZoom = Number(q.get("zoom"));
    const qLabel = q.get("label");
    const hasGeo =
      Number.isFinite(qLat) &&
      Number.isFinite(qLng) &&
      Math.abs(qLat) <= 90 &&
      Math.abs(qLng) <= 180 &&
      !(qLat === 0 && qLng === 0);
    const hasZoom = hasGeo && Number.isFinite(qZoom);

    const map = L.map(containerRef.current, {
      // TASK 86: center/zoom iz query (highlight lokacija), sicer Balkan
      // (1.95.1: privzeti pogled je Slovenija + zahodni Balkan — bbox 38
      // uredniških destinacij; fitBounds spodaj prilagodi velikosti).
      center: hasGeo ? [qLat, qLng] : BALKANS_CENTER,
      zoom: hasZoom ? Math.min(16, Math.max(10, qZoom)) : 6,
      scrollWheelZoom: false, // Boljša UX na mobilnem
      zoomControl: true,
      attributionControl: true,
    });

    // 1.95.1: privzeti pogled — CELA regija (Slovenija + zahodni Balkan),
    // prilagojena dejanski velikosti kontejnerja (ne fiksen zoom).
    if (!hasGeo) {
      map.fitBounds(BALKANS_BOUNDS, { padding: [12, 12] });
    }

    // OpenStreetMap tile layer
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    mapRef.current = map;
    routeLayerRef.current = L.layerGroup().addTo(map);
    // F1: grozdenje (markercluster) — tisoči pinov se združujejo v skupke;
    // pri z15+ se grozdenje izklopi (posamezni pini na uličnem nivoju).
    // chunkedLoading NAMENOMA izklopljen: asinhrona čakalna vrsta se križa z
    // clearLayers ob menjavi viewporta (živo ugotovljeno v E2E — markerji
    // ostanejo v vrsti, DOM pa prazen); naši količine (≤ 400) so majhne.
    poiLayerRef.current = L.markerClusterGroup({
      showCoverageOnHover: false,
      disableClusteringAtZoom: 15,
      maxClusterRadius: 60,
      spiderfyOnMaxZoom: true,
    }).addTo(map);

    // 1.95.1: MAP PINS sloji — grid mehurčki (layerGroup, z≤10) in grozd
    // posameznih pinov (markercluster, z≥11). Ista grozdenja nastavitev kot
    // supply sloj (enaka markercluster muha — zanesljiv izris v efektu).
    gridLayerRef.current = L.layerGroup().addTo(map);
    pinsClusterRef.current = L.markerClusterGroup({
      showCoverageOnHover: false,
      disableClusteringAtZoom: 15,
      maxClusterRadius: 60,
      spiderfyOnMaxZoom: true,
    }).addTo(map);

    // F1: viewport sledenje — moveend/zoomend posodobi stanje → supply hook.
    const syncViewport = () => {
      const b = map.getBounds();
      setViewport({
        bbox: [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()],
        zoom: map.getZoom(),
      });
    };
    map.on("moveend zoomend", syncViewport);
    syncViewport();

    // TASK 86: ZLATI poudarni marker na query lokaciji — vstop iz javnega
    // listing modala ("Prikaži na zemljevidu"). DIREKTNO na map (ne v
    // grozdenje!), da je vedno viden takoj; supply own pin se v grozdu
    // naloži ločeno (ista točka za published listing z geo). Label iz
    // query je uporabniški vnos → escapeHtml (XSS varnost).
    if (hasGeo) {
      const highlightIcon = L.divIcon({
        className: "highlight-location-marker",
        html: `
          <div style="transform: translateY(-50%); position: relative;">
            <div style="
              display: flex; align-items: center; justify-content: center;
              width: 40px; height: 40px; border-radius: 9999px;
              background: #d97706; color: white;
              box-shadow: 0 4px 12px rgba(217, 119, 6, 0.5);
              border: 3px solid white; font-size: 20px;
              font-family: sans-serif; position: relative; z-index: 1;
            ">📍</div>
            <div style="
              position: absolute; left: 50%; top: 100%;
              transform: translateX(-50%);
              width: 0; height: 0;
              border-left: 8px solid transparent;
              border-right: 8px solid transparent;
              border-top: 10px solid #d97706;
            "></div>
          </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 40],
        popupAnchor: [0, -38],
      });
      L.marker([qLat, qLng], {
        icon: highlightIcon,
        title: qLabel ?? undefined,
        zIndexOffset: 1000, // nad destinacijskimi/supply markerji
      })
        .addTo(map)
        .bindPopup(
          `<div style="min-width: 180px; font-family: sans-serif;">` +
            `<div style="font-weight: 700; font-size: 15px; color: #1a2e1a; margin-bottom: 4px;">${
              qLabel ? escapeHtml(qLabel) : (lang === "en" ? "Location" : "Lokacija")
            }</div>` +
            `<div style="font-size: 12px; color: #6b7280;" class="tabular-nums">${qLat.toFixed(5)}, ${qLng.toFixed(5)}</div>` +
            `</div>`
        );
    }

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

      // 1.48: EN overlay za tagline/duration (fallback na SL, če vnosa
      // ni v slovenia-data-en); budget (€) in ime sta jezikovno nevtralna
      const en = DESTINATIONS_EN[dest.slug];
      const tagline = lang === "en" ? (en?.tagline ?? dest.tagline) : dest.tagline;
      const duration = lang === "en" ? (en?.duration ?? dest.duration) : dest.duration;

      // Popup z informacijami
      const popupHtml = `
        <div style="min-width: 220px; max-width: 260px; font-family: sans-serif;">
          <img src="${dest.image}" alt="${dest.name}" style="width: 100%; height: 120px; object-fit: cover; border-radius: 8px 8px 0 0; margin: -13px -20px 8px -20px; width: calc(100% + 40px);" loading="lazy" />
          <div style="font-weight: 700; font-size: 16px; color: #1a2e1a; margin-bottom: 4px;">${dest.name}</div>
          <div style="font-size: 13px; color: #6b7280; margin-bottom: 8px; line-height: 1.4;">${tagline}</div>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
            <span style="display: inline-flex; align-items: center; gap: 3px; font-size: 13px; font-weight: 600; color: #d97706;">
              <span>★</span> ${dest.rating.toFixed(1)}
            </span>
            <span style="font-size: 12px; color: #6b7280;">${T.editorial[lang]}</span>
            <span style="font-size: 12px; color: #6b7280;">·</span>
            <span style="font-size: 12px; color: #6b7280;">${duration}</span>
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
            ${T.moreInfo[lang]}
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
      map.off("moveend zoomend");
      map.remove();
      mapRef.current = null;
      markersRef.current = [];
      poiLayerRef.current = null;
      gridLayerRef.current = null;
      pinsClusterRef.current = null;
    };
    // lang v deps: Leaflet popup-i so template stringi, vezani ob bindanju —
    // ob (teoretični) spremembi jezika se zemljevid pobriše in znova nariše
  }, [lang]);

  // Event delegation za CTA gumbe v popupih (destinacije + produkti + celice)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handlePopupClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Produkt CTA → odpri ProductModal
      if (target.classList.contains("map-poi-cta")) {
        const id = target.getAttribute("data-poi-id");
        const product = productsRef.current.find((p) => p.id === id);
        if (product) {
          map.closePopup();
          setSelectedProduct(product);
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
        return;
      }

      // 1.95.1: grid celica CTA → približaj območje (z12 = posamezni pini)
      if (target.classList.contains("map-cell-cta")) {
        const lat = Number(target.getAttribute("data-cell-lat"));
        const lng = Number(target.getAttribute("data-cell-lng"));
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          map.closePopup();
          map.setView([lat, lng], 12, { animate: true });
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
            marker.bindPopup(`<strong>${coord.name}</strong><br>${T.day[lang](dayRoute.day)}`);
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
          marker.bindPopup(`<strong>${coord.name}</strong><br>${T.day[lang](dayRoute.day)}`);
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
  }, [showRoute, routeCoords, routeByDay, lang]);

  // === Render SUPPLY markerjev (F1) — grozdeniMarkerCluster sloj ===
  // Products pridejo IZ supply hook-a (viewport poizvedba) — vsak marker je
  // kanonski ProviderProduct; klik (popup CTA) odpre ProductModal.
  //
  // MARKERCLUSTER MUHA (živo ugotovljena v E2E): clearLayers() + addLayer()
  // v istem ciklu pusti sloj s plastmi, a DOM PRAZEN (interno stanje
  // gručenja se ne pregradi brez dogodka zemljevida). Zanesljiva pot:
  // skupino SNEMI z zemljevida, počisti, serijsko dodaj markerje
  // (addLayers), skupino VRNI nazaj — onAdd sili celoten izris.
  useEffect(() => {
    const map = mapRef.current;
    const layer = poiLayerRef.current;
    if (!layer) return;

    if (!showPois || supply.products.length === 0) {
      layer.clearLayers();
      return;
    }

    const markers: L.Marker[] = [];
    supply.products.forEach((product) => {
      if (product.lat == null || product.lng == null) return;
      const meta = taxonomyOf(product.type);
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

      const marker = L.marker([product.lat, product.lng], {
        icon,
        title: product.title,
      });

      const popupHtml = `
        <div style="min-width: 180px; max-width: 220px; font-family: sans-serif;">
          <div style="font-weight: 700; font-size: 14px; color: #1a2e1a; margin-bottom: 6px; line-height: 1.3;">
            ${escapeHtml(product.title)}
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
          ">${meta.icon} ${meta.label[lang]}</span>
          <button data-poi-id="${escapeAttr(product.id)}" class="map-poi-cta" style="
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
          ">${T.details[lang]}</button>
        </div>
      `;

      marker.bindPopup(popupHtml, {
        maxWidth: 240,
        className: "poi-popup",
      });
      markers.push(marker);
    });

    if (markers.length === 0) {
      layer.clearLayers();
      return;
    }

    // Zanesljiv izris: snemi → počisti → serijsko dodaj → vrni nazaj.
    if (map) map.removeLayer(layer);
    layer.clearLayers();
    layer.addLayers(markers);
    if (map) map.addLayer(layer);
  }, [supply.products, showPois, lang]);

  // === Render MAP PINS sloja (1.95.1) — statični FSQ =====================
  // Grid mehurčki (z≤10) v gridLayer; posamezni pini (z≥11) v pinsCluster.
  // Ista markercluster muha kot supply sloj: snemi → počisti → dodaj →
  // vrni (zanesljiv izris). Pini dobijo zIndexOffset -200, da so supply
  // produkti (bogatejši popup z CTA) NAD osnovnimi pini, kadar se prekrivajo.
  // Prazne kategorije (activeCats.size === 0) pošteno skrijejo sloj
  // (konzistentno s supply plasto in besedilom praznega stanja).
  useEffect(() => {
    const map = mapRef.current;
    const cluster = pinsClusterRef.current;
    const gridLayer = gridLayerRef.current;
    if (!map || !cluster || !gridLayer) return;

    if (cats.length === 0 || pins.error) {
      cluster.clearLayers();
      gridLayer.clearLayers();
      return;
    }

    if (pins.mode === "grid") {
      // Grid mehurčki — dominantna kategorija obarva, število pove gostoto.
      cluster.clearLayers();
      map.removeLayer(gridLayer);
      gridLayer.clearLayers();

      for (const cell of pins.cells) {
        const dominant = cell.cats[0]?.type ?? "poi";
        const meta = taxonomyOf(dominant);
        const icon = L.divIcon({
          className: "map-grid-bubble",
          html: `
            <div style="position: absolute; transform: translate(-50%, -50%); white-space: nowrap;">
              <div style="
                display: inline-flex; align-items: center; gap: 4px;
                padding: 3px 9px; border-radius: 9999px;
                background: ${meta.color}; color: white;
                font-size: 11px; font-weight: 700;
                border: 2px solid white;
                box-shadow: 0 2px 6px rgba(0,0,0,0.35);
                font-family: sans-serif;
              "><span style="font-size: 13px;">${meta.icon}</span>${formatPinCount(cell.count, lang)}</div>
            </div>
          `,
        });

        const breakdown = cell.cats
          .map((c) => {
            const m = taxonomyOf(c.type);
            return `<div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 12px; color: #374151; padding: 2px 0;">
              <span>${m.icon} ${m.label[lang]}</span>
              <b class="tabular-nums">${c.count}</b>
            </div>`;
          })
          .join("");

        const popupHtml = `
          <div style="min-width: 190px; font-family: sans-serif;">
            <div style="font-weight: 700; font-size: 14px; color: #1a2e1a; margin-bottom: 6px;">
              ${T.pinsCellTitle[lang](cell.count)}
            </div>
            ${breakdown}
            <button data-cell-lat="${cell.lat.toFixed(5)}" data-cell-lng="${cell.lng.toFixed(5)}" class="map-cell-cta" style="
              width: 100%;
              margin-top: 8px;
              padding: 6px 10px;
              background: #2d6a3e;
              color: white;
              border: none;
              border-radius: 6px;
              font-size: 12px;
              font-weight: 600;
              cursor: pointer;
              font-family: sans-serif;
            ">${T.pinsCellZoom[lang]}</button>
          </div>
        `;

        L.marker([cell.lat, cell.lng], { icon, zIndexOffset: -200 })
          .addTo(gridLayer)
          .bindPopup(popupHtml, { maxWidth: 240, className: "grid-bubble-popup" });
      }

      map.addLayer(gridLayer);
      return;
    }

    // Posamezni pini (z≥11) — isti vizualni jezik kot supply markerji
    // (taksonomska ikona v barvnem krogu), a brez produktnega CTA-modal.
    gridLayer.clearLayers();
    map.removeLayer(cluster);
    cluster.clearLayers();

    for (const pin of pins.pins) {
      const meta = taxonomyOf(pin.type);
      const icon = L.divIcon({
        className: "map-pin-marker",
        html: `
          <div style="transform: translateY(-50%);">
            <div style="
              width: 26px; height: 26px;
              border-radius: 50%;
              background: ${meta.color};
              color: white;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 13px;
              border: 2px solid white;
              box-shadow: 0 1px 3px rgba(0,0,0,0.35);
              font-family: sans-serif;
              cursor: pointer;
            ">${meta.icon}</div>
          </div>
        `,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
        popupAnchor: [0, -13],
      });

      const ratingHtml =
        pin.rating != null
          ? `<div style="display: flex; align-items: center; gap: 6px; margin-bottom: 10px;">
              <span style="font-size: 13px; font-weight: 600; color: #d97706;">★ ${pin.rating.toFixed(1)}</span>
              ${pin.ratingCount ? `<span style="font-size: 12px; color: #6b7280;">${T.pinsReviews[lang](pin.ratingCount)}</span>` : ""}
            </div>`
          : "";

      const popupHtml = `
        <div style="min-width: 180px; max-width: 220px; font-family: sans-serif;">
          <div style="font-weight: 700; font-size: 14px; color: #1a2e1a; margin-bottom: 6px; line-height: 1.3;">
            ${escapeHtml(pin.name)}
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
            margin-bottom: 8px;
          ">${meta.icon} ${meta.label[lang]}${pin.sub ? ` · ${escapeHtml(pin.sub)}` : ""}</span>
          ${ratingHtml}
          <div style="font-size: 10px; color: #9ca3af; margin-top: 4px; border-top: 1px solid #f3f4f6; padding-top: 6px;">
            ${T.pinsAttribution[lang]}
          </div>
        </div>
      `;

      L.marker([pin.lat, pin.lng], {
        icon,
        title: pin.name,
        zIndexOffset: -200,
      })
        .addTo(cluster)
        .bindPopup(popupHtml, { maxWidth: 240, className: "map-pin-popup" });
    }

    map.addLayer(cluster);
  }, [pins.mode, pins.cells, pins.pins, pins.error, cats.length, lang]);

  const toggleCat = (cat: ProductType) => {
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

  /** Prazno stanje → nazaj na privzetih 5 kategorij. */
  const resetCats = () => {
    setActiveCats(new Set(DEFAULT_POI_CATS));
  };

  const handleResetView = () => {
    // 1.95.1: ponastavitev = CELA regija (Slovenija + zahodni Balkan)
    mapRef.current?.fitBounds(BALKANS_BOUNDS, { padding: [12, 12] });
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

  /** Dodajanje iz ProviderPanel/ProductCard (isti tok kot modal). */
  const handleAddProduct = (product: ProviderProduct) => {
    addProductToSelection(product, { locale: lang });
  };

  /** Imena DEJANSKIH virov v trenutnem rezultatu (TASK 44 §9: badge ne
   *  sme trditi "OSM", ko so med produkti tudi drugi providerji). */
  const sourcesLabel = useMemo(() => {
    const slugs = [...new Set(supply.products.map((p) => p.provider))];
    return slugs
      .map((s) => (s === "osm" ? "OSM" : (getProvider(s)?.labels[lang] ?? s)))
      .join(" · ");
  }, [supply.products, lang]);

  const zoomTooLow = showPois && Math.floor(viewport.zoom) < SUPPLY_MIN_ZOOM;

  return (
    <div className="relative h-full w-full">
      {/* Map container */}
      <div
        ref={containerRef}
        className="h-[500px] w-full sm:h-[600px] lg:h-full lg:min-h-[600px]"
        role="application"
        aria-label={T.mapAria[lang]}
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
          {T.allDestinations[lang]}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={handleResetView}
          className="shadow-md"
        >
          <Navigation className="size-4" />
          {T.reset[lang]}
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
            {showRoute ? T.hideRoute[lang] : T.showRoute[lang]}
          </Button>
        ) : null}

        {/* POI (supply) layer toggle */}
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
          {showPois ? T.hidePois[lang] : T.showPois[lang]}
        </Button>

        {/* F1: ProviderPanel — viri, statusi, ponudba v pogledu */}
        <ProviderPanel
          lang={lang}
          products={supply.products}
          loading={supply.loading}
          degraded={supply.degraded}
          nearestDestSlug={nearestDestSlug}
          selectedIds={selectedIds}
          onOpenProduct={(p) => setSelectedProduct(p)}
          onAddProduct={handleAddProduct}
        />
      </div>

      {/* POI category chips — multi-select s števci (iskreni: iz supply
          counts), usklajeno s čip vzorcem klepeta. 1.95.1: vidni VEDNO —
          nadzorujejo statični map-pins sloj (bencinske/hrana/nastanitve …)
          IN supply sloj (isti kanonski tipi). */}
      <div className="absolute bottom-12 left-3 z-[1000] max-w-[calc(100%-1.5rem)] rounded-md border border-border bg-background/95 p-1.5 shadow-md backdrop-blur sm:max-w-[calc(100%-9rem)]">
        <div
          role="group"
          aria-label={T.chipsAria[lang]}
          className="flex flex-wrap gap-1"
        >
          {POI_CATEGORIES.map(({ value, label, icon: Icon }) => {
            const on = activeCats.has(value);
            const count = supply.products.filter((p) => p.type === value).length;
            return (
              <button
                key={value}
                type="button"
                onClick={() => toggleCat(value)}
                aria-pressed={on}
                title={label[lang]}
                className={cn(
                  "flex min-h-7 shrink-0 items-center gap-1 rounded-full border px-2 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on
                    ? "border-primary/30 bg-primary/10 text-foreground"
                    : "border-border/60 bg-transparent text-muted-foreground opacity-60"
                )}
              >
                <Icon className="size-3 shrink-0" aria-hidden />
                <span className="truncate">{label[lang]}</span>
                {on && showPois && !supply.loading ? (
                  <span className="shrink-0 tabular-nums opacity-70">
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        {/* Iskrene opombe slojev: kap posameznih pinov / napaka / prazno
            stanje — enovrstične, nevsiljive. */}
        {activeCats.size === 0 ? (
          <div className="mt-1 flex items-center justify-between gap-2 border-t border-border/60 pt-1">
            <p className="text-[10px] leading-snug text-muted-foreground">
              {T.emptyText[lang]}
            </p>
            <button
              type="button"
              onClick={resetCats}
              className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[10px] font-medium text-foreground transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {T.emptyReset[lang]}
            </button>
          </div>
        ) : null}
        {activeCats.size > 0 && pins.mode === "pins" && pins.capped ? (
          <p className="mt-1 border-t border-border/60 pt-1 text-[10px] leading-snug text-muted-foreground">
            {T.pinsCappedHint[lang]}
          </p>
        ) : null}
        {activeCats.size > 0 && pins.error ? (
          <p className="mt-1 border-t border-border/60 pt-1 text-[10px] leading-snug text-amber-700 dark:text-amber-400">
            {T.pinsError[lang]}
          </p>
        ) : null}
      </div>

      {/* Loading spinner za supply poizvedbo (zgornji levi, ne blokira) */}
      {supply.loading && showPois ? (
        <div className="absolute left-3 top-3 z-[1000] flex items-center gap-2 rounded-lg border border-border bg-background/95 px-3 py-1.5 text-xs shadow-md backdrop-blur">
          <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden="true" />
          <span className="font-medium">{T.loadingPois[lang]}</span>
        </div>
      ) : null}

      {/* Zoom hint (supply zahteva približanje) */}
      {zoomTooLow && !supply.loading ? (
        <div className="absolute left-3 top-3 z-[1000] max-w-[240px] rounded-lg border border-border bg-background/95 px-3 py-1.5 text-xs text-muted-foreground shadow-md backdrop-blur">
          {T.zoomHint[lang]}
        </div>
      ) : null}

      {/* Error/degraded badge (zgornji levi) — TASK 99-a: koda napake
          odloča o iskrenem besedilu (client-network → namig na povezavo,
          sicer strežniška nedosegljivost virov) */}
      {!supply.loading && supply.error && showPois ? (
        <div className="absolute left-3 top-12 z-[1000] max-w-[240px] rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 shadow-md dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          {supply.error === "client-network"
            ? T.networkHint[lang]
            : T.degradedHint[lang]}
        </div>
      ) : null}

      {/* Info badge (spodaj levo) — 1.95.1: + števec statičnih točk (FSQ)
          z atribucijo v title (licenca Apache-2.0). */}
      <div className="absolute bottom-3 left-3 z-[1000] rounded-lg border border-border bg-background/95 px-3 py-2 text-xs shadow-md backdrop-blur">
        <div className="flex items-center gap-2">
          <Star className="size-3.5 fill-amber-400 text-amber-400" />
          <span className="font-medium">{DESTINATIONS.length} {T.infoDestUnit[lang]}</span>
          {activeCats.size > 0 && pins.dataset?.installed && pins.total > 0 ? (
            <>
              <span className="text-muted-foreground">·</span>
              <Badge
                variant="outline"
                className="max-w-[240px] truncate text-[10px]"
                title={T.pinsAttribution[lang]}
              >
                {formatPinCount(pins.total, lang)} {T.pinsUnit[lang]}
              </Badge>
            </>
          ) : null}
          {showPois && supply.products.length > 0 ? (
            <>
              <span className="text-muted-foreground">·</span>
              <Badge variant="outline" className="max-w-[220px] truncate text-[10px]">
                {supply.products.length} POI · {sourcesLabel}
              </Badge>
            </>
          ) : null}
          {!showPois && pins.total === 0 ? (
            <Badge variant="outline" className="text-[10px]">
              {T.infoClickMarker[lang]}
            </Badge>
          ) : null}
        </div>
      </div>

      {/* ProductModal — odpre se ko uporabnik klikne produkt marker/kartico */}
      <ProductModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
      />
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

/** Formatiranje števca točk (1.95.1): "12,5k" (SL) / "12.5k" (EN). */
function formatPinCount(n: number, lang: MapLang): string {
  if (n >= 1000) {
    const v = n / 1000;
    const str =
      v >= 10
        ? String(Math.round(v))
        : v.toFixed(1).replace(".", lang === "sl" ? "," : ".");
    return `${str}k`;
  }
  return String(n);
}

/** Escaping za HTML atribut (data-poi-id). */
function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default MapView;
