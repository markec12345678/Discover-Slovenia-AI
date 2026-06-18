"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import {
  Sparkles,
  Clock,
  Calendar,
  Euro,
  Users,
  MapPin,
  AlertCircle,
  ExternalLink,
  Star,
  Cloud,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

import { getAffiliateLinks } from "@/lib/affiliate";
import { INTERESTS } from "@/lib/slovenia-data";
import type { PlannerInput, Itinerary, Season } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const SEASONS: { value: Season; label: string }[] = [
  { value: "spring", label: "Pomlad" },
  { value: "summer", label: "Poletje" },
  { value: "autumn", label: "Jesen" },
  { value: "winter", label: "Zima" },
];

/**
 * AI Itinerary Planner — jedrna funkcija platforme I Feel Slovenia.
 * Uporabnik izpolni obrazec (dnevi, proračun, skupina, sezona, interesi),
 * AI pa sestavi personalno dogodkovno povzetek potovanja po Sloveniji.
 */
export function ItineraryPlanner() {
  const { toast } = useToast();

  const [formData, setFormData] = useState<PlannerInput>({
    budget: 500,
    days: 3,
    interests: ["narava", "kultura"],
    season: "summer",
    groupSize: 2,
  });
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sinhroniziraj z globalnim store-om (za MapSection)
  const setStoreItinerary = useAppStore((s) => s.setItinerary);
  useEffect(() => {
    setStoreItinerary(itinerary);
  }, [itinerary, setStoreItinerary]);

  function toggleInterest(value: string) {
    setFormData((prev) => {
      const isSelected = prev.interests.includes(value);
      return {
        ...prev,
        interests: isSelected
          ? prev.interests.filter((i) => i !== value)
          : [...prev.interests, value],
      };
    });
  }

  function validate(input: PlannerInput): string | null {
    if (!Number.isFinite(input.days) || input.days < 1 || input.days > 14) {
      return "Število dni mora biti med 1 in 14.";
    }
    if (!Number.isFinite(input.budget) || input.budget <= 0) {
      return "Proračun mora biti večji od 0 €.";
    }
    if (!Number.isFinite(input.groupSize) || input.groupSize < 1 || input.groupSize > 20) {
      return "Velikost skupine mora biti med 1 in 20.";
    }
    if (input.interests.length === 0) {
      return "Izberite vsaj en interes.";
    }
    return null;
  }

  async function generateItinerary(input: PlannerInput) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Napaka pri generiranju");
      const data: Itinerary = await res.json();
      setItinerary(data);
      toast({
        title: "Itinerer generiran!",
        description:
          data.source === "ai"
            ? "AI je sestavil vaš popoln načrt potovanja."
            : "Prikazan je pripravljen predlog itinererja.",
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Napaka pri generiranju itinererja";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const vErr = validate(formData);
    if (vErr) {
      setError(vErr);
      toast({
        title: "Preverite vnose",
        description: vErr,
        variant: "destructive",
      });
      return;
    }
    await generateItinerary(formData);
  }

  return (
    <section
      id="načrtuj"
      className="scroll-mt-24 bg-gradient-to-b from-muted/40 to-background py-16 sm:py-20 lg:py-24"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
          {/* === LEVO — obrazec === */}
          <Card className="h-fit">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Sparkles className="size-6 text-primary" aria-hidden />
                <CardTitle className="text-2xl sm:text-3xl">
                  AI načrtovalec potovanj
                </CardTitle>
              </div>
              <CardDescription className="text-base">
                Povej nam želje in AI sestavi popoln itinerer
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit} noValidate>
              <CardContent className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="days" className="flex items-center gap-2">
                      <Calendar className="size-4" aria-hidden />
                      Število dni
                    </Label>
                    <Input
                      id="days"
                      name="days"
                      type="number"
                      min={1}
                      max={14}
                      value={formData.days}
                      onChange={(e) =>
                        setFormData((p) => ({
                          ...p,
                          days: Number(e.target.value),
                        }))
                      }
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="budget" className="flex items-center gap-2">
                      <Euro className="size-4" aria-hidden />
                      Proračun (€)
                    </Label>
                    <Input
                      id="budget"
                      name="budget"
                      type="number"
                      min={50}
                      max={5000}
                      step={50}
                      value={formData.budget}
                      onChange={(e) =>
                        setFormData((p) => ({
                          ...p,
                          budget: Number(e.target.value),
                        }))
                      }
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="groupSize" className="flex items-center gap-2">
                      <Users className="size-4" aria-hidden />
                      Velikost skupine
                    </Label>
                    <Input
                      id="groupSize"
                      name="groupSize"
                      type="number"
                      min={1}
                      max={20}
                      value={formData.groupSize}
                      onChange={(e) =>
                        setFormData((p) => ({
                          ...p,
                          groupSize: Number(e.target.value),
                        }))
                      }
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="season" className="flex items-center gap-2">
                      <Cloud className="size-4" aria-hidden />
                      Sezona
                    </Label>
                    <Select
                      value={formData.season}
                      onValueChange={(v: Season) =>
                        setFormData((p) => ({ ...p, season: v }))
                      }
                    >
                      <SelectTrigger id="season" className="w-full">
                        <SelectValue placeholder="Izberi sezono" />
                      </SelectTrigger>
                      <SelectContent>
                        {SEASONS.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Interesi</Label>
                  <div className="flex flex-wrap gap-2">
                    {INTERESTS.map((interest) => {
                      const selected = formData.interests.includes(interest.value);
                      return (
                        <button
                          key={interest.value}
                          type="button"
                          onClick={() => toggleInterest(interest.value)}
                          aria-pressed={selected}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-all",
                            "min-h-[36px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                            selected
                              ? "border-primary bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                              : "border-border bg-muted text-muted-foreground hover:bg-muted/70"
                          )}
                        >
                          <span aria-hidden>{interest.icon}</span>
                          {interest.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex-col items-stretch">
                <Button
                  type="submit"
                  className="w-full bg-primary"
                  size="lg"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      AI razmišlja...
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-4" aria-hidden />
                      Generiraj itinerer ✨
                    </>
                  )}
                </Button>
              </CardFooter>
            </form>
          </Card>

          {/* === DESNO — rezultat === */}
          <div className="lg:min-h-[600px]">
            {/* Empty state */}
            {!loading && !error && !itinerary && (
              <Card className="h-full border-dashed">
                <CardContent className="flex min-h-[400px] flex-col items-center justify-center gap-4 py-16 text-center">
                  <div className="rounded-full bg-primary/10 p-6">
                    <Sparkles className="size-10 text-primary" aria-hidden />
                  </div>
                  <div className="space-y-1">
                    <p className="text-lg font-semibold">
                      Vaš itinerer se bo prikazal tukaj
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Izpolnite obrazec in kliknite »Generiraj itinerer«.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Loading skeletons */}
            {loading && (
              <div className="space-y-4">
                <Skeleton className="h-10 w-2/3" />
                {Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i}>
                    <CardHeader>
                      <Skeleton className="h-6 w-32" />
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-16 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Error state */}
            {!loading && error && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" aria-hidden />
                <AlertTitle>Napaka</AlertTitle>
                <AlertDescription className="space-y-3">
                  <p>{error}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => generateItinerary(formData)}
                  >
                    <AlertCircle className="size-3.5" aria-hidden />
                    Poskusi znova
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {/* Success state */}
            {!loading && !error && itinerary && (
              <div className="space-y-5">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-2xl font-bold">
                    Vaš {itinerary.days.length}-dnevni itinerer
                  </h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        itinerary.source === "ai"
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                          : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                      )}
                    >
                      {itinerary.source === "ai" ? "AI" : "Predlog"}
                    </Badge>
                    <Badge className="bg-primary text-primary-foreground">
                      Skupaj ~€{itinerary.total_budget}
                    </Badge>
                  </div>
                </div>

                {/* Day plans */}
                <div className="space-y-4">
                  {itinerary.days.map((day) => (
                    <Card key={day.day}>
                      <CardHeader>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <CardTitle className="flex items-center gap-2 text-lg">
                            <Calendar className="size-5 text-primary" aria-hidden />
                            Dan {day.day}
                          </CardTitle>
                          <Badge variant="secondary" className="gap-1.5">
                            <Cloud className="size-3.5" aria-hidden />
                            {day.weather.condition} · {day.weather.temp}°C
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {day.locations.map((loc, idx) => {
                          const links = getAffiliateLinks(loc.destination_name);
                          return (
                            <div
                              key={`${loc.destination_id}-${idx}`}
                              className="rounded-lg border bg-card/50 p-4"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="space-y-0.5">
                                  <div className="text-sm font-semibold text-primary">
                                    {loc.time_slot}
                                  </div>
                                  <p className="flex items-center gap-1.5 text-lg font-semibold">
                                    <MapPin
                                      className="size-4 text-muted-foreground"
                                      aria-hidden
                                    />
                                    {loc.destination_name}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="gap-1">
                                    <Clock className="size-3" aria-hidden />
                                    {loc.duration}h
                                  </Badge>
                                  <Badge className="bg-accent text-accent-foreground">
                                    €{loc.estimated_cost}
                                  </Badge>
                                </div>
                              </div>
                              {loc.notes && (
                                <p className="mt-2 text-sm text-muted-foreground">
                                  {loc.notes}
                                </p>
                              )}
                              <Button
                                asChild
                                size="sm"
                                variant="outline"
                                className="mt-3"
                              >
                                <a
                                  href={links.hotels}
                                  target="_blank"
                                  rel="noopener noreferrer sponsored"
                                >
                                  Rezerviraj
                                  <ExternalLink className="size-3.5" aria-hidden />
                                </a>
                              </Button>
                            </div>
                          );
                        })}
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Recommendations */}
                {itinerary.recommendations.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Star className="size-5 text-primary" aria-hidden />
                        Priporočila
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {itinerary.recommendations.map((r, i) => (
                          <li key={i} className="flex gap-2 text-sm">
                            <span className="text-primary" aria-hidden>
                              •
                            </span>
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {/* Tips */}
                {itinerary.tips.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Sparkles className="size-5 text-primary" aria-hidden />
                        Nasveti
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {itinerary.tips.map((t, i) => (
                          <li key={i} className="flex gap-2 text-sm">
                            <span className="text-primary" aria-hidden>
                              •
                            </span>
                            <span>{t}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default ItineraryPlanner;
