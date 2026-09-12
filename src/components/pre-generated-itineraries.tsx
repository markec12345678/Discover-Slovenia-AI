"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Sparkles,
  Clock,
  MapPin,
  ArrowRight,
  Star,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ============================================================================
// PRE-GENERATED ITINERARIES — priljubljeni načrti (Layla.ai inspiracija)
// ============================================================================
//
// Za nižji barrier — uporabnik ne mora napisati, lahko izbere
// preverjen itinerer in ga AI še dodatno personalizira.
//
// FW4.3-2: naslovi/poizvedbe/destinacije/poudarki živijo v fragmentih
// pregenTrips.{sl,en}.json (ključi po id-ju poti); budget (€xx-yy) je
// krajevno nevtralen in ostaja v podatkih.
// ============================================================================

interface PreGeneratedTrip {
  id: string;
  emoji: string;
  days: number;
  /** število prikazanih destinacijskih chipov (dest1..destN) */
  destinationCount: number;
  budget: string;
  interests: string[];
  gradient: string;
}

const TRIPS: PreGeneratedTrip[] = [
  {
    id: "bled-1-day",
    emoji: "🏔️",
    days: 1,
    destinationCount: 2,
    budget: "€50-80",
    interests: ["narava", "kultura"],
    gradient: "from-blue-500/10 to-cyan-500/10",
  },
  {
    id: "ljubljana-2-days",
    emoji: "🏛️",
    days: 2,
    destinationCount: 1,
    budget: "€100-150",
    interests: ["kultura", "kulinarika"],
    gradient: "from-emerald-500/10 to-green-500/10",
  },
  {
    id: "soca-3-days",
    emoji: "🌊",
    days: 3,
    destinationCount: 3,
    budget: "€200-300",
    interests: ["avantura", "narava"],
    gradient: "from-cyan-500/10 to-blue-500/10",
  },
  {
    id: "piran-coast",
    emoji: "🌊",
    days: 2,
    destinationCount: 2,
    budget: "€120-180",
    interests: ["narava", "kulinarika"],
    gradient: "from-amber-500/10 to-orange-500/10",
  },
  {
    id: "bela-krajina",
    emoji: "🍯",
    days: 2,
    destinationCount: 1,
    budget: "€80-120",
    interests: ["kulinarika", "narava"],
    gradient: "from-violet-500/10 to-purple-500/10",
  },
  {
    id: "triglav-park",
    emoji: "🏔️",
    days: 3,
    destinationCount: 2,
    budget: "€150-250",
    interests: ["narava", "avantura"],
    gradient: "from-emerald-500/10 to-teal-500/10",
  },
];

interface PreGeneratedItinerariesProps {
  onSelect?: (query: string) => void;
}

export function PreGeneratedItineraries({ onSelect }: PreGeneratedItinerariesProps) {
  const t = useTranslations("pregenTrips");
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <section className="py-12 bg-gradient-to-b from-background to-muted/20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8 text-center">
          <div className="mb-3 flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-medium">
              <TrendingUp className="size-3.5 text-primary" aria-hidden="true" />
              {t("badge")}
            </span>
          </div>
          <h2 className="text-2xl font-bold sm:text-3xl">
            {t("title")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>

        <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TRIPS.map((trip) => {
            const isHovered = hovered === trip.id;
            return (
              <button
                key={trip.id}
                type="button"
                onClick={() => onSelect?.(t(`trips.${trip.id}.query`))}
                onMouseEnter={() => setHovered(trip.id)}
                onMouseLeave={() => setHovered(null)}
                className={cn(
                  "group relative overflow-hidden rounded-2xl border-2 p-5 text-left transition-all",
                  "hover:border-primary/40 hover:shadow-lg hover:-translate-y-0.5",
                  isHovered ? "border-primary/40 shadow-lg" : "border-border/60",
                  "bg-gradient-to-br",
                  trip.gradient
                )}
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-3xl" aria-hidden="true">{trip.emoji}</span>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="secondary" className="text-[10px] gap-0.5">
                      <Clock className="size-2.5" aria-hidden="true" />
                      {trip.days} {trip.days === 1 ? t("dayOne") : t("dayOther")}
                    </Badge>
                  </div>
                </div>

                {/* Title */}
                <h3 className="text-base font-bold leading-tight mb-2">
                  {t(`trips.${trip.id}.title`)}
                </h3>

                {/* Destinations */}
                <div className="flex flex-wrap gap-1 mb-3">
                  {Array.from({ length: trip.destinationCount }, (_, i) => (
                    <span
                      key={i}
                      className="flex items-center gap-0.5 text-[11px] text-muted-foreground"
                    >
                      <MapPin className="size-2.5" aria-hidden="true" />
                      {t(`trips.${trip.id}.dest${i + 1}`)}
                    </span>
                  ))}
                </div>

                {/* Highlights */}
                <div className="space-y-0.5 mb-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Star className="size-2.5 fill-amber-400 text-amber-400" aria-hidden="true" />
                      {t(`trips.${trip.id}.hl${i}`)}
                    </div>
                  ))}
                </div>

                {/* Budget + CTA */}
                <div className="flex items-center justify-between pt-2 border-t border-border/40">
                  <span className="text-xs font-medium text-muted-foreground">{trip.budget}</span>
                  <span className={cn(
                    "flex items-center gap-1 text-xs font-semibold text-primary transition-all",
                    isHovered ? "translate-x-0" : "-translate-x-2 opacity-0"
                  )}>
                    <Sparkles className="size-3" aria-hidden="true" />
                    {t("planCta")}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
