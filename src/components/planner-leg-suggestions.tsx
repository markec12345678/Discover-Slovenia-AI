"use client";

import * as React from "react";
import { useState } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { MapPin, Plus, Loader2 } from "lucide-react";

import { trackPlannerEvent } from "@/lib/planner-analytics";
import type { LocationVisit } from "@/lib/types";

// ============================================================================
// PLANNER LEG SUGGESTIONS — backlog #5 "Postanki na poti" (1.24.0)
// ============================================================================
//
// MEM road-trip ugotovitev: "suggestion needs the actual extra distance
// attached" — predlog brez cene (v kilometrih) ni odločitev, ampak uganka.
// Zato vsak predlog med dvema postankoma dneva nosi POŠTEN ovinek
// ("+X km izven rute"), izračunan na strežniku iz iste OSRM plasti kot
// značke ~km dni (A→s + s→B − A→B; ob napaki hevristika, vir razkrit).
//
// Vzorcek: F16 "Optimalno zaporedje" — progresivno razkrivanje (zložen
// žeton → razširitev na klik), črtkana obroba, 0 AI žetonov, lazy nalaganje
// (fetch šele ob razširitvi; modulski predpomnilnik na par from|to).

export interface StopSuggestion {
  id: string;
  name: string;
  tagline: string;
  image: string;
  category: string;
  region: string;
  detourKm: number;
  detourMin: number;
  source: "osrm" | "heuristic";
}

interface LegSuggestionsResponse {
  stops: StopSuggestion[];
  totalStops: number;
  method: "osrm" | "heuristic" | "mixed";
}

/** Predpomnilnik odgovorov na par postankov (razširitev ≠ ponovno nalaganje). */
const suggestionsCache = new Map<string, LegSuggestionsResponse>();

interface PlannerLegSuggestionsProps {
  day: number;
  from: LocationVisit;
  to: LocationVisit;
  /** VSI destination_id-ji trenutnega načrta (predlogi jih izpustijo). */
  usedIds: Set<string>;
  /** Determnistična vstavitev (F16 vzorec) — izvede nadrejena komponenta. */
  onAdd: (suggestion: StopSuggestion) => void;
}

export function PlannerLegSuggestions({
  day,
  from,
  to,
  usedIds,
  onAdd,
}: PlannerLegSuggestionsProps) {
  const t = useTranslations("planner");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [data, setData] = useState<LegSuggestionsResponse | null>(null);

  const cacheKey = `${from.destination_id}|${to.destination_id}`;

  const load = React.useCallback(async () => {
    if (loading) return;
    const cached = suggestionsCache.get(cacheKey);
    if (cached) {
      setData(cached);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams({
        from: from.destination_id,
        to: to.destination_id,
        lang: locale === "en" ? "en" : "sl",
        exclude: [...usedIds].join(","),
      });
      const res = await fetch(
        `/api/itinerary/stops-along-way?${params.toString()}`,
        { headers: { Accept: "application/json" } }
      );
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as LegSuggestionsResponse;
      suggestionsCache.set(cacheKey, json);
      setData(json);
      trackPlannerEvent("leg_suggestions_expanded", {
        day,
        count: json.stops.length,
        method: json.method,
      });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
    // usedIds namenoma ni odvisnost: exclude je smiselno zamrzniti na trenutek
    // nalaganja (po dodajanju se predlogi filtrirajo pri izrisu)
  }, [cacheKey, day, from.destination_id, locale, loading, to.destination_id]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !data && !loading) void load();
  };

  // Po dodajanju: skrijemo postanke, ki so že v načrtu (predpomnilnik ostane)
  const visible = data?.stops.filter((s) => !usedIds.has(s.id)) ?? [];

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={`leg-suggestions-${from.destination_id}-${to.destination_id}`}
        className="inline-flex min-h-[30px] shrink-0 items-center gap-1.5 rounded-full border border-dashed border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MapPin className="size-3.5 shrink-0" aria-hidden />
        {t("legSugLabel")}
      </button>

      {open && (
        <div
          id={`leg-suggestions-${from.destination_id}-${to.destination_id}`}
          className="mt-2 w-full rounded-lg border bg-muted/20 p-2"
        >
          {loading && (
            <div className="space-y-2" aria-live="polite">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-md border bg-card/60 p-2"
                >
                  <div className="size-10 shrink-0 animate-pulse rounded-md bg-muted" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-1/3 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                  </div>
                </div>
              ))}
              <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                {t("legSugLoading")}
              </p>
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center gap-1.5 py-2 text-xs text-muted-foreground">
              <p>{t("legSugError")}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="rounded-full border border-border/60 px-2.5 py-1 transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t("legSugRetry")}
              </button>
            </div>
          )}

          {!loading && !error && visible.length === 0 && (
            <p className="py-2 text-center text-xs text-muted-foreground">
              {t("legSugEmpty")}
            </p>
          )}

          {!loading && !error && visible.length > 0 && (
            <ul className="space-y-2">
              {visible.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-3 rounded-md border bg-card/60 p-2"
                >
                  {s.image && (
                    <div className="relative size-10 shrink-0 overflow-hidden rounded-md">
                      <Image
                        src={s.image}
                        alt=""
                        fill
                        sizes="40px"
                        className="object-cover"
                      />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {s.name}
                    </p>
                    <p
                      className="text-xs text-muted-foreground"
                      title={t("legSugDetourTitle", {
                        km: s.detourKm,
                        min: s.detourMin,
                        source: s.source === "osrm" ? "OSRM" : "±",
                      })}
                    >
                      {t("legSugDetour", { km: s.detourKm })}
                      {s.detourMin > 0 && (
                        <span className="text-muted-foreground/70">
                          {" "}
                          · ~+{s.detourMin} min
                        </span>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onAdd(s)}
                    className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-border/60 bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={t("legSugAddAria", {
                      name: s.name,
                      km: s.detourKm,
                    })}
                  >
                    <Plus className="size-3.5" aria-hidden />
                    {t("legSugAdd")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
