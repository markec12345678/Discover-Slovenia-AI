"use client";

import { useEffect, useState } from "react";
import { Droplets, Wind, CloudSun } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { WeatherData } from "@/lib/types";

interface WeatherWidgetProps {
  lat: number;
  lng: number;
  name?: string;
}

/**
 * WeatherWidget — prikazuje trenutno vreme za destinacijo.
 * Fetcha iz /api/weather (Open-Meteo proxy, 10-min cache na backendu).
 * Cache na frontendu: fetch samo ob spremembi lat/lng.
 */
export function WeatherWidget({ lat, lng, name }: WeatherWidgetProps) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [error, setError] = useState<string | null>(null);
  // loading je izveden iz primerjave loadedFor z aktualnima lat/lng.
  // Cache: fetch samo ob spremembi lat/lng — setState klici zgolj znotraj async callbacka.
  const [loadedFor, setLoadedFor] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const loading =
    loadedFor === null || loadedFor.lat !== lat || loadedFor.lng !== lng;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    (async () => {
      try {
        const res = await fetch(
          `/api/weather?lat=${lat}&lng=${lng}`,
          { signal: controller.signal }
        );
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as WeatherData;
        if (!active) return;
        setWeather(data);
        setError(null);
        setLoadedFor({ lat, lng });
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (!active) return;
        setError("Vreme trenutno ni na voljo");
        setWeather(null);
        setLoadedFor({ lat, lng });
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [lat, lng]);

  return (
    <Card className="overflow-hidden border-border/60 py-0">
      <CardHeader className="bg-muted/40 px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <CloudSun className="size-4 text-primary" aria-hidden="true" />
          <span>Vreme</span>
          {name ? (
            <span className="text-muted-foreground font-normal">
              · {name}
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>

      <CardContent className="px-4 py-4">
        {loading ? (
          <div className="flex items-center gap-4">
            <Skeleton className="size-12 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ) : error ? (
          <p className="text-sm text-muted-foreground py-2">{error}</p>
        ) : weather ? (
          <div className="flex items-center gap-4">
            <span
              className="text-4xl leading-none"
              role="img"
              aria-label={weather.condition}
            >
              {weather.icon}
            </span>
            <div className="flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tabular-nums">
                  {weather.temp}°C
                </span>
                <span className="text-sm text-muted-foreground capitalize">
                  {weather.condition}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Droplets className="size-3" aria-hidden="true" />
                  {weather.humidity}%
                </span>
                <span className="inline-flex items-center gap-1">
                  <Wind className="size-3" aria-hidden="true" />
                  {weather.windSpeed} km/h
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default WeatherWidget;
