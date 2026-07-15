"use client";

import {
  Clock,
  MapPin,
  Navigation,
  Phone,
  Bookmark,
  Euro,
  Cloud,
  Sparkles,
  UtensilsCrossed,
  Mountain,
  Camera,
  ShoppingBag,
  Coffee,
  Calendar,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PartnerBadge, type PartnerStatus } from "@/components/partner-badge";
import { cn } from "@/lib/utils";
import type { DayPlan, LocationVisit } from "@/lib/types";

// ============================================================================
// AI TRIP TIMELINE — vizualni dan z timeline layout
// ============================================================================
//
// WOW: Ne seznam — vizualni dan!
// 09:00 ☕ Lokalna kavarna
// 11:00 🥾 Naravna pot
// 13:30 🍽️ Kosilo (⭐ Verified Partner)
// 15:00 🍯 Lokalni proizvajalec
// ============================================================================

interface TripTimelineProps {
  days: DayPlan[];
  totalBudget?: number;
}

// Kategorija → ikona + barva
const CATEGORY_STYLES: Record<string, { icon: typeof Coffee; color: string; bg: string }> = {
  restaurant: { icon: UtensilsCrossed, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-100 dark:bg-orange-950/30" },
  hotel: { icon: Calendar, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-950/30" },
  activity: { icon: Mountain, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-950/30" },
  shop: { icon: ShoppingBag, color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-100 dark:bg-violet-950/30" },
  bar: { icon: Coffee, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-950/30" },
  default: { icon: MapPin, color: "text-primary", bg: "bg-primary/10" },
};

function getCategoryStyle(category: string) {
  return CATEGORY_STYLES[category] || CATEGORY_STYLES.default;
}

// Določi ikono glede na ime destinacije/opis
function inferCategory(visit: LocationVisit): string {
  const text = `${visit.destination_name} ${visit.notes || ""}`.toLowerCase();
  if (text.includes("restavrac") || text.includes("gostiln") || text.includes("kosilo") || text.includes("večerja") || text.includes("hrana")) return "restaurant";
  if (text.includes("hotel") || text.includes("prenoč")) return "hotel";
  if (text.includes("pohod") || text.includes("narava") || text.includes("gora") || text.includes("smuč")) return "activity";
  if (text.includes("kup") || text.includes("trgovin") || text.includes("prodaj")) return "shop";
  if (text.includes("kava") || text.includes("bar") || text.includes("pijača")) return "bar";
  return "default";
}

export function TripTimeline({ days, totalBudget }: TripTimelineProps) {
  if (!days || days.length === 0) return null;

  return (
    <div className="space-y-8">
      {/* Skupni povzetek */}
      {totalBudget !== undefined && (
        <div className="flex items-center justify-center gap-4 rounded-xl bg-primary/5 border border-primary/20 p-4">
          <div className="flex items-center gap-2">
            <Calendar className="size-5 text-primary" aria-hidden="true" />
            <span className="font-semibold">{days.length}-dnevni načrt</span>
          </div>
          <div className="h-6 w-px bg-border" />
          <div className="flex items-center gap-2">
            <Euro className="size-5 text-primary" aria-hidden="true" />
            <span className="font-semibold">~€{totalBudget}</span>
          </div>
        </div>
      )}

      {/* Timeline za vsak dan */}
      {days.map((day) => (
        <div key={day.day} className="relative">
          {/* Dan header */}
          <div className="mb-4 flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-lg shadow-md">
              {day.day}
            </div>
            <div>
              <h3 className="text-lg font-bold">Dan {day.day}</h3>
              {day.weather && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Cloud className="size-3.5" aria-hidden="true" />
                  {day.weather.condition} · {day.weather.temp}°C
                </div>
              )}
            </div>
          </div>

          {/* Vertikalna črta */}
          <div className="absolute left-6 top-16 bottom-0 w-0.5 bg-border" aria-hidden="true" />

          {/* Lokacije */}
          <div className="ml-16 space-y-4">
            {day.locations.map((visit, idx) => {
              const category = inferCategory(visit);
              const style = getCategoryStyle(category);
              const Icon = style.icon;

              return (
                <div
                  key={`${visit.destination_id}-${idx}`}
                  className="relative animate-in fade-in slide-in-from-left-2 duration-300"
                  style={{ animationDelay: `${idx * 100}ms` }}
                >
                  {/* Timeline dot */}
                  <div
                    className={cn(
                      "absolute -left-12 top-4 flex size-8 items-center justify-center rounded-full border-4 border-background",
                      style.bg
                    )}
                  >
                    <Icon className={cn("size-4", style.color)} aria-hidden="true" />
                  </div>

                  {/* Kartica */}
                  <Card className="overflow-hidden border-border/60 transition-all hover:border-primary/30 hover:shadow-md">
                    <CardContent className="p-4">
                      {/* Vrsta 1: Čas + ime */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          {/* Čas */}
                          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1">
                            <Clock className="size-3" aria-hidden="true" />
                            {visit.time_slot}
                            <span className="text-muted-foreground/50">·</span>
                            <span>{visit.duration}h</span>
                          </div>

                          {/* Ime */}
                          <h4 className="text-base font-semibold leading-tight">
                            {visit.destination_name}
                          </h4>

                          {/* Opis/beleške */}
                          {visit.notes && (
                            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                              {visit.notes}
                            </p>
                          )}

                          {/* Badge + cena */}
                          <div className="mt-2 flex items-center gap-2">
                            {visit.estimated_cost > 0 && (
                              <Badge variant="secondary" className="text-[10px] gap-0.5">
                                <Euro className="size-2.5" aria-hidden="true" />
                                {visit.estimated_cost}
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Partner badge (desno) */}
                        {visit.recommendationType && visit.recommendationType !== "organic" && (
                          <PartnerBadge
                            status={visit.recommendationType === "sponsored" ? "premium" : "verified"}
                            size="sm"
                          />
                        )}
                      </div>

                      {/* Akcijski gumbi */}
                      <div className="mt-3 flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 text-xs"
                          onClick={() => {
                            window.open(
                              `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(visit.destination_name + " Slovenia")}`,
                              "_blank"
                            );
                          }}
                        >
                          <Navigation className="size-3" aria-hidden="true" />
                          Navigacija
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 text-xs"
                          onClick={() => {
                            // TODO: Implement save/bookmark
                          }}
                        >
                          <Bookmark className="size-3" aria-hidden="true" />
                          Shrani
                        </Button>
                        {visit.affiliateType && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 text-xs ml-auto text-blue-600"
                          >
                            <Sparkles className="size-3" aria-hidden="true" />
                            Rezerviraj
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* AI nasveti na dnu */}
      {days[0]?.locations && days[0].locations.length > 0 && (
        <div className="ml-16 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="size-4 text-primary" aria-hidden="true" />
            <span className="text-sm font-semibold">AI nasvet</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {days.length === 1
              ? "Za popoln dan začni zgodaj (pred 9:00) da izogneš se množicam."
              : "Premikaj se po regijah — Bled + Bohinj istočasno, nato Soča naslednji dan."}
          </p>
        </div>
      )}
    </div>
  );
}
