"use client";

import { useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Calendar,
  Clock,
  CloudSun,
  Euro,
  Eye,
  Lightbulb,
  Map as MapIcon,
  MapPin,
  Route,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SocialShare } from "@/components/social-share";
import { useAppStore, DAY_COLORS } from "@/lib/store";
import type { Itinerary, LocationVisit } from "@/lib/types";

// Client-only load Leaflet zemljevida (enak vzorec kot map-section.tsx)
const MapView = dynamic(
  () => import("@/components/sections/map-view").then((m) => m.MapView),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[500px] w-full items-center justify-center bg-muted sm:h-[600px]">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <MapIcon className="size-8 animate-pulse" />
          <p className="text-sm">Nalagam zemljevid…</p>
        </div>
      </div>
    ),
  }
);

// ============================================================================
// SHARED TRIP — javna stran deljenega itinererja (/pot/[shareId])
// ============================================================================
//
// Itinerer nastavi v skupni Zustand store, tako da MapView nariše
// barvno označeno pot po dnevih (enak prikaz kot na domači strani).
// ============================================================================

interface SharedTripProps {
  itinerary: Itinerary;
  shareId: string;
  name: string | null;
  views: number;
  createdAt: string; // ISO datum
}

export function SharedTrip({
  itinerary,
  shareId,
  name,
  views,
  createdAt,
}: SharedTripProps) {
  const setItinerary = useAppStore((s) => s.setItinerary);
  const routeCoords = useAppStore((s) => s.routeCoords);
  const routeByDay = useAppStore((s) => s.routeByDay);

  // Na mountu nastavi itinerer v store → MapView nariše barvno pot po dnevih
  useEffect(() => {
    setItinerary(itinerary);
  }, [itinerary, setItinerary]);

  const title = name || "AI načrt potovanja po Sloveniji";

  // Varna vrednost skupnega proračuna (shranjen JSON lahko manjka polje)
  const totalBudget =
    typeof itinerary.total_budget === "number" ? itinerary.total_budget : 0;

  const createdLabel = useMemo(() => {
    try {
      return new Date(createdAt).toLocaleDateString("sl-SI", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return createdAt;
    }
  }, [createdAt]);

  // Vsa imena destinacij (za SocialShare)
  const destinationNames = useMemo(() => {
    const seen = new Set<string>();
    itinerary.days.forEach((d) =>
      d.locations.forEach((l: LocationVisit) => {
        if (l.destination_name) seen.add(l.destination_name);
      })
    );
    return Array.from(seen).slice(0, 5);
  }, [itinerary]);

  return (
    <main className="min-h-screen bg-background">
      {/* === Hero === */}
      <div className="border-b border-border bg-gradient-to-b from-primary/10 to-transparent">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <Badge variant="secondary" className="mb-3 gap-1.5">
            <MapPin className="size-3.5" aria-hidden="true" />
            Deljen AI itinerer
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {title}
          </h1>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <Badge className="gap-1.5 bg-primary text-primary-foreground">
              <Calendar className="size-3.5" aria-hidden="true" />
              {itinerary.days.length}
              {itinerary.days.length === 1 ? " dan" : " dni"}
            </Badge>
            <Badge variant="outline" className="gap-1.5">
              <Euro className="size-3.5" aria-hidden="true" />
              ~€{totalBudget} skupaj
            </Badge>
            <Badge variant="outline" className="gap-1.5">
              <Sparkles className="size-3.5" aria-hidden="true" />
              {itinerary.source === "ai" ? "AI načrt" : "Predloga načrta"}
            </Badge>
            <Badge variant="outline" className="gap-1.5">
              <Eye className="size-3.5" aria-hidden="true" />
              {views}
              {views === 1 ? " ogled" : " ogledov"}
            </Badge>
            <span className="text-muted-foreground">
              Ustvarjeno: {createdLabel}
            </span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        {/* === Zemljevid s barvno potjo === */}
        {routeByDay.length > 0 && (
          <section className="mb-10" aria-label="Zemljevid poti">
            <div className="mb-3 flex items-center gap-2">
              <Route className="size-5 text-primary" aria-hidden="true" />
              <h2 className="text-xl font-bold sm:text-2xl">Pot na zemljevidu</h2>
              <Badge variant="secondary" className="ml-1">
                {routeCoords.length} postankov
              </Badge>
            </div>
            <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
              <MapView routeCoords={routeCoords} routeByDay={routeByDay} />
            </div>
            {/* Legenda dni */}
            {routeByDay.length > 1 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {routeByDay.map((d) => (
                  <span
                    key={d.day}
                    className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium"
                  >
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: d.color }}
                      aria-hidden="true"
                    />
                    Dan {d.day}
                  </span>
                ))}
              </div>
            )}
          </section>
        )}

        {/* === dnevi === */}
        <section className="mb-10 space-y-8" aria-label="Načrt po dnevih">
          <h2 className="text-xl font-bold sm:text-2xl">
            Načrt po dnevih
          </h2>

          {itinerary.days.map((day) => {
            const dayColor =
              DAY_COLORS[(day.day - 1) % DAY_COLORS.length] ?? "#2d6a3e";
            return (
              <div key={day.day} className="scroll-mt-24" id={`dan-${day.day}`}>
                {/* Dan header */}
                <div className="mb-4 flex items-center gap-3">
                  <div
                    className="flex size-12 items-center justify-center rounded-full text-lg font-bold text-white shadow-md"
                    style={{ backgroundColor: dayColor }}
                    aria-hidden="true"
                  >
                    {day.day}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">Dan {day.day}</h3>
                    {day.weather && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <CloudSun className="size-3.5" aria-hidden="true" />
                        {day.weather.condition} · {day.weather.temp}°C
                      </div>
                    )}
                  </div>
                </div>

                {/* Lokacije v dnevu */}
                <div className="ml-16 grid grid-cols-1 gap-4 md:grid-cols-2">
                  {day.locations.map((visit, idx) => (
                    <LocationCard key={`${day.day}-${idx}`} visit={visit} />
                  ))}
                </div>
              </div>
            );
          })}
        </section>

        {/* === Priporočila === */}
        {itinerary.recommendations?.length > 0 && (
          <section className="mb-10" aria-label="Priporočila">
            <h2 className="mb-4 flex items-center gap-2 text-xl font-bold sm:text-2xl">
              <Sparkles className="size-5 text-primary" aria-hidden="true" />
              Priporočila
            </h2>
            <Card>
              <CardContent className="p-4 sm:p-6">
                <ul className="space-y-2">
                  {itinerary.recommendations.map((rec, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <MapPin
                        className="mt-0.5 size-3.5 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      {rec}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>
        )}

        {/* === Nasveti === */}
        {itinerary.tips?.length > 0 && (
          <section className="mb-10" aria-label="Nasveti">
            <h2 className="mb-4 flex items-center gap-2 text-xl font-bold sm:text-2xl">
              <Lightbulb className="size-5 text-primary" aria-hidden="true" />
              Nasveti za potovanje
            </h2>
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-4 sm:p-6">
                <ul className="space-y-2">
                  {itinerary.tips.map((tip, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <Lightbulb
                        className="mt-0.5 size-3.5 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      {tip}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>
        )}

        {/* === CTA vrstica === */}
        <section className="mb-10 rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center sm:p-8">
          <h2 className="text-xl font-bold sm:text-2xl">
            Všeč ta načrt?
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
            Sestavi svoj AI načrt potovanja po Sloveniji — proračun, interesi in
            vreme, vse na enem mestu.
          </p>
          <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/#načrtuj">
                <MapPin className="size-4 mr-2" aria-hidden="true" />
                Načrtuj svoje potovanje
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href={`/?odpri=${shareId}`}>
                <Sparkles className="size-4 mr-2" aria-hidden="true" />
                Odpri v načrtovalniku
              </Link>
            </Button>
          </div>
        </section>

        {/* === Deljenje === */}
        <section className="mb-10" aria-label="Deli načrt">
          <div className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-border p-4 sm:flex-row sm:p-6">
            <div>
              <p className="font-semibold">Deli ta načrt s prijatelji</p>
              <p className="text-sm text-muted-foreground">
                Povezavo pošlji sovažencem ali družini — pot se odpre na
                zemljevidu.
              </p>
            </div>
            <SocialShare
              title={title}
              description={`${itinerary.days.length}-dnevni AI načrt potovanja po Sloveniji (~€${totalBudget})`}
              destinations={destinationNames}
              variant="inline"
            />
          </div>
        </section>

        {/* === SEO noga === */}
        <footer className="border-t border-border pt-6 text-center text-sm text-muted-foreground">
          <p>
            Načrt generiran z AI · vsi kraji preverjeni ·{" "}
            <Link
              href="/"
              className="font-medium text-primary hover:underline"
            >
              Discover Slovenia AI
            </Link>
          </p>
        </footer>
      </div>
    </main>
  );
}

// ============================================================================
// Kartica lokacije v dnevu
// ============================================================================

function LocationCard({ visit }: { visit: LocationVisit }) {
  return (
    <Card className="overflow-hidden border-border/60 transition-all hover:border-primary/30 hover:shadow-md">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h4 className="flex items-start gap-1.5 text-base font-semibold leading-tight">
            <MapPin
              className="mt-0.5 size-4 shrink-0 text-primary"
              aria-hidden="true"
            />
            {visit.destination_name}
          </h4>
        </div>

        {visit.notes && (
          <p className="mt-2 line-clamp-4 text-sm text-muted-foreground">
            {visit.notes}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {visit.time_slot && (
            <Badge variant="secondary" className="gap-1 text-xs">
              <Clock className="size-3" aria-hidden="true" />
              {visit.time_slot}
            </Badge>
          )}
          {visit.duration > 0 && (
            <Badge variant="secondary" className="gap-1 text-xs">
              {visit.duration} h
            </Badge>
          )}
          {visit.estimated_cost > 0 && (
            <Badge variant="secondary" className="gap-1 text-xs">
              <Euro className="size-3" aria-hidden="true" />
              {visit.estimated_cost}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default SharedTrip;
