"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPinned } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { DAY_COLORS } from "@/lib/store";
import { escapeHtml } from "@/lib/security";
import { trackPlannerEvent } from "@/lib/planner-analytics";
import type { TripMapPin } from "@/lib/trips-map-pins";

// ============================================================================
// MY TRIPS MAP — »Zemljevid mojih potovanj« (#24 Sklop 3, 1.165.0)
// ============================================================================
// Polarsteps vzorec »profilnega globusa« (benchmark Round 2, edini NEW
// FEATURE CANDIDATE): hub /moja-potovanja nad seznamom kartic pokaže VSA
// uporabnikova potovanja na ENEM zemljevidu — čustvena vez s zgodovino
// potovanj. Kompaktna delovna različica po kanonu TripMapPanel (F5.1):
//  - ena črtkana polyline + majhni markerji PO POTI (barva = pot);
//  - interaktivna legenda: žetoni poti vklop/izklop prikaza;
//  - klik markerja → popup z imenom postanka + povezavo »Odpri pot«
//    (VES uporabniški tekst escapeHtml — imena poti prihajajo iz localStorage
//    ali DB in so uporabniška vsebina);
//  - brez plasta vseh destinacij/POI (to je raziskovalni zemljevid na
//    /zemljevid — tukaj so samo UPORABNIKOVA potovanja).
//
// Iskrenost:
//  - ravne črtkane črte (brez OSRM geometrije — hint pod mapo to pove);
//  - poti brez znanih koordinat se ne prikažejo (endpoint jih izpusti);
//  - napaka nalaganja → komponenta izgine (fail-closed, brez mrtvega
//    prostora — seznam kartic ostaja polna vrednost);
//  - telemetrija my_trips_map_opened samo ob USPEŠNEM prikazu pinov.
//
// Leaflet imperativno (isti vzorec kot trip-map-panel.tsx / map-view.tsx).
// VSAKA koda mora slediti Rules of Hooks — zgodnjih returnov pred zadnjim
// hookom NI (stanja se vračajo po vseh useEffect klicih).
// ============================================================================

export interface MyTripsMapTrip {
  shareId: string;
  /** Prikazno ime poti (že z fallbackom — pride iz hub seznama). */
  label: string;
}

interface PinsEntry {
  shareId: string;
  stops: TripMapPin[];
}

/** Dvojezični nizi T (prevodi) — L je že Leaflet (isti vzorec kot map-view.tsx); {sl,en} kanon huba. */
const T = {
  title: { sl: "Zemljevid mojih potovanj", en: "My trips on a map" },
  allTrips: { sl: "Vsi", en: "All" },
  hint: {
    sl: "Ravne črtkane črte povezujejo postanke v vrstnem redu poti — kliknite piko za podrobnosti.",
    en: "Straight dashed lines connect stops in trip order — tap a dot for details.",
  },
  open: { sl: "Odpri pot", en: "Open trip" },
  day: { sl: "dan", en: "day" },
  loadingAria: {
    sl: "Nalagam zemljevid potovanj",
    en: "Loading your trips map",
  },
  mapAria: {
    sl: "Zemljevid s pini vaših shranjenih potovanj",
    en: "Map with pins of your saved trips",
  },
  legendAria: {
    sl: "Poti na zemljevidu — klik za prikaz/skritje",
    en: "Trips on the map — click to show/hide",
  },
  tripsCount: {
    sl: (n: number) =>
      n === 1 ? `${n} potovanje` : n < 5 ? `${n} potovanja` : `${n} potovanj`,
    en: (n: number) => (n === 1 ? `${n} trip` : `${n} trips`),
  },
} as const;

/** Klientna validacija enega pin zapisa (nezaupan odgovor — fail-safe). */
function validEntry(p: unknown): PinsEntry | null {
  if (typeof p !== "object" || p === null) return null;
  const e = p as { shareId?: unknown; stops?: unknown };
  if (typeof e.shareId !== "string" || !Array.isArray(e.stops)) return null;
  const stops: TripMapPin[] = [];
  for (const s of e.stops) {
    if (typeof s !== "object" || s === null) continue;
    const pin = s as Partial<TripMapPin>;
    if (
      typeof pin.lat === "number" &&
      typeof pin.lng === "number" &&
      Number.isFinite(pin.lat) &&
      Number.isFinite(pin.lng) &&
      !(pin.lat === 0 && pin.lng === 0) &&
      typeof pin.name === "string" &&
      typeof pin.day === "number"
    ) {
      stops.push({
        lat: pin.lat,
        lng: pin.lng,
        name: pin.name.slice(0, 120),
        day: pin.day,
      });
    }
  }
  if (stops.length === 0) return null;
  return { shareId: e.shareId, stops };
}

export function MyTripsMap({
  trips,
  lang = "sl",
  className,
}: {
  trips: MyTripsMapTrip[];
  lang?: "sl" | "en";
  className?: string;
}) {
  // null = nalaganje, [] = ni pinov, [...] = prikaz
  const [entries, setEntries] = useState<PinsEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  // Izpeljano stanje nalaganja (pred efekti — init efekt ga bere)
  const loading = entries === null;

  // Vzorec TripMapPanel (onStopSelectRef): trips ref + ključ ids za fetch
  // efekt — novi array propov NE sproži ponovnega nalaganja pinov.
  const tripsRef = useRef(trips);
  useEffect(() => {
    tripsRef.current = trips;
  }, [trips]);
  const idsKey = useMemo(() => trips.map((t) => t.shareId).join(","), [trips]);

  // === Nalaganje pinov (POST /api/trips/map-pins — ena zahteva za vse) ===
  useEffect(() => {
    const list = tripsRef.current;
    if (list.length === 0 || idsKey === "") return;
    let cancelled = false;
    // queueMicrotask: setState NI sinhrono v telesu efekta (vzorec
    // moja-potovanja-view / use-wake-lock — react-hooks/set-state-in-effect
    // disciplina). Reset teče PRED omrežnim odgovorom (mikroopravilo).
    queueMicrotask(() => {
      if (cancelled) return;
      setEntries(null);
      setFailed(false);
    });

    fetch("/api/trips/map-pins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: list.map((t) => t.shareId) }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as { pins?: unknown };
      })
      .then((d) => {
        if (cancelled) return;
        const raw = Array.isArray(d?.pins) ? d.pins : [];
        const valid = raw
          .map(validEntry)
          .filter((e): e is PinsEntry => e !== null);
        setEntries(valid);
        if (valid.length > 0) {
          // Telemetrija SAMO ob uspešnem prikazu (brez PII — samo števci)
          trackPlannerEvent("my_trips_map_opened", {
            trips: list.length,
            pins: valid.length,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  // === Inicializacija Leaflet (ko se kontejner prikaže — med nalaganjem je
  // na mestu zemljevida skelet, zato init čaka na loading=false; isto velja
  // obnovi ob spremembi seznama poti: cleanup odstrani map, init ponudi novo)
  useEffect(() => {
    if (loading || !containerRef.current || mapRef.current) return;
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
    };
  }, [loading]);

  // === Ris plasti po poteh (ob novih pinih ali preklopu vidnosti) ===
  useEffect(() => {
    const map = mapRef.current;
    if (!map || entries === null) return;

    const labelByShareId = new Map(
      tripsRef.current.map((t) => [t.shareId, t.label])
    );
    const rootLayer = L.layerGroup().addTo(map);

    entries.forEach((entry, tripIdx) => {
      if (hidden.has(entry.shareId)) return; // skrita pot — sploh ne rišemo
      const color = DAY_COLORS[tripIdx % DAY_COLORS.length];
      const label = labelByShareId.get(entry.shareId) ?? entry.shareId;
      const layer = L.layerGroup();

      // Polyline poti (črtkana — poštena ravna črta, glej hint)
      if (entry.stops.length >= 2) {
        L.polyline(
          entry.stops.map((s) => [s.lat, s.lng] as [number, number]),
          { color, weight: 3, opacity: 0.7, dashArray: "6, 8" }
        ).addTo(layer);
      }

      // Majhni piki z tooltipom + popupom (VES tekst escapeHtml — imena
      // poti/postankov so uporabniška vsebina; href shareId encodan)
      for (const stop of entry.stops) {
        const icon = L.divIcon({
          className: "trip-map-marker",
          html: `
            <div style="transform: translateY(-50%);">
              <div style="
                width: 14px; height: 14px;
                border-radius: 50%;
                background: ${color};
                border: 2px solid white;
                box-shadow: 0 1px 4px rgba(0,0,0,0.4);
              "></div>
            </div>
          `,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });
        const marker = L.marker([stop.lat, stop.lng], { icon });
        marker.bindTooltip(`${escapeHtml(stop.name)} · ${escapeHtml(label)}`, {
          direction: "top",
        });
        marker.bindPopup(
          `<strong>${escapeHtml(stop.name)}</strong><br/>` +
            `<span style="font-size:12px;color:#57534e;">` +
            `${escapeHtml(label)} · ${escapeHtml(T.day[lang])} ${stop.day}</span><br/>` +
            `<a href="/pot/${encodeURIComponent(entry.shareId)}" ` +
            `style="font-size:13px;">${T.open[lang]}</a>`
        );
        marker.addTo(layer);
      }

      layer.addTo(rootLayer);
    });

    return () => {
      map.removeLayer(rootLayer);
    };
  }, [entries, hidden, lang]);

  // === Prilagodi pogled na vse pike — SAMO ob novih pinih ===
  useEffect(() => {
    const map = mapRef.current;
    if (!map || entries === null || entries.length === 0) return;
    const all = entries.flatMap((e) =>
      e.stops.map((s) => [s.lat, s.lng] as [number, number])
    );
    if (all.length > 0) {
      map.fitBounds(L.latLngBounds(all).pad(0.15));
    }
    const invalidate = () => map.invalidateSize();
    const raf = requestAnimationFrame(invalidate);
    const timeout = setTimeout(invalidate, 350);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timeout);
    };
  }, [entries]);

  // === Prazna stanja (iskreno brez mrtvega prostora — ZA zadnjim hookom) ===
  if (trips.length === 0 || failed) return null;
  if (entries !== null && entries.length === 0) return null;

  const labelByShareId = new Map(trips.map((t) => [t.shareId, t.label]));

  function toggleTrip(shareId: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(shareId)) next.delete(shareId);
      else next.add(shareId);
      return next;
    });
  }

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-4 sm:p-5 space-y-3">
        {/* Glava + interaktivna legenda poti */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <MapPinned className="size-4 shrink-0 text-primary" aria-hidden />
            <p className="text-sm font-semibold truncate">
              {T.title[lang]}
              {!loading && (
                <span className="ml-1.5 font-normal text-muted-foreground">
                  · {T.tripsCount[lang](entries!.length)}
                </span>
              )}
            </p>
          </div>
          {!loading && entries !== null && entries.length > 1 && (
            <div
              role="group"
              aria-label={T.legendAria[lang]}
              className="flex flex-wrap items-center gap-1.5"
            >
              <button
                type="button"
                onClick={() => setHidden(new Set())}
                aria-pressed={hidden.size === 0}
                className={cn(
                  "inline-flex min-h-[32px] items-center rounded-full border px-2.5 py-1 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  hidden.size === 0
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-muted text-muted-foreground hover:bg-muted/70"
                )}
              >
                {T.allTrips[lang]}
              </button>
              {entries.map((entry, idx) => {
                const visible = !hidden.has(entry.shareId);
                const color = DAY_COLORS[idx % DAY_COLORS.length];
                const label =
                  labelByShareId.get(entry.shareId) ?? entry.shareId;
                return (
                  <button
                    key={entry.shareId}
                    type="button"
                    onClick={() => toggleTrip(entry.shareId)}
                    aria-pressed={visible}
                    title={label}
                    className={cn(
                      "inline-flex min-h-[32px] max-w-[180px] items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      visible
                        ? "border-transparent text-white shadow-sm"
                        : "border-border bg-muted text-muted-foreground hover:bg-muted/70"
                    )}
                    style={
                      visible
                        ? { backgroundColor: color, borderColor: color }
                        : undefined
                    }
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        !visible && "inline-block"
                      )}
                      style={!visible ? { backgroundColor: color } : undefined}
                    />
                    <span className="truncate">{label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Zemljevid / skelet nalaganja */}
        {loading ? (
          <div
            role="status"
            aria-busy="true"
            className="h-[300px] w-full overflow-hidden rounded-lg border border-border/60 bg-muted animate-pulse sm:h-[380px]"
          >
            <span className="sr-only">{T.loadingAria[lang]}</span>
          </div>
        ) : (
          <div
            ref={containerRef}
            role="img"
            aria-label={T.mapAria[lang]}
            className="h-[300px] w-full overflow-hidden rounded-lg border border-border/60 sm:h-[380px]"
          />
        )}

        <p className="text-xs text-muted-foreground">{T.hint[lang]}</p>
      </CardContent>
    </Card>
  );
}

export default MyTripsMap;
