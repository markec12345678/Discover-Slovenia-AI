"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  Printer,
  Route,
  Sparkles,
  ThumbsUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ItineraryEventsSection } from "@/components/itinerary-events";
import { PackingListSection } from "@/components/packing-list";
import { SocialShare } from "@/components/social-share";
import { useAppStore, DAY_COLORS } from "@/lib/store";
import type { Itinerary, ItineraryEvent, LocationVisit } from "@/lib/types";
import { cn } from "@/lib/utils";

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
//
// Faza 1 (skupinsko planiranje):
//  - DOGODKI: props.events (fallback itinerary.events) — ItineraryEventsSection
//  - PAKIRANJE: itinerary.packingList — PackingListSection
//  - GLASOVANJE: ThumbsUp na vsaki lokaciji → POST/DELETE /api/trip-vote
//    (voterId + oddani glasovi v localStorage; optimistični UI z revertom)
//  - TISKANJE: gumb "Natisni / Shrani kot PDF" + print-hide razredi
//    (CTA, deljenje, glasovanje in zemljevid se NE natisnejo)
// ============================================================================

// localStorage ključi za glasovanje skupine
const VOTER_STORAGE_KEY = "discoverslovenia_voter";
const votesStorageKey = (shareId: string) =>
  `discoverslovenia_votes_${shareId}`;

interface SharedTripProps {
  itinerary: Itinerary;
  shareId: string;
  name: string | null;
  views: number;
  createdAt: string; // ISO datum
  /** Dogodki med obiskom (page jih izračuna prek events-match) */
  events?: ItineraryEvent[];
  /** Začetni seštevek glasov po lokaciji (locationKey = destination_id) */
  initialVotes?: Record<string, number>;
}

interface LocationVoteProps {
  count: number;
  voted: boolean;
  pending: boolean;
  onToggle: () => void;
}

export function SharedTrip({
  itinerary,
  shareId,
  name,
  views,
  createdAt,
  events,
  initialVotes,
}: SharedTripProps) {
  const setItinerary = useAppStore((s) => s.setItinerary);
  const routeCoords = useAppStore((s) => s.routeCoords);
  const routeByDay = useAppStore((s) => s.routeByDay);

  // === Glasovanje skupine — stanje ===
  // Števci se inicializirajo iz server propsov (hidratacija varna),
  // oddani glasovi tega brskalnika pa se naložijo šele v useEffect
  // (prvi paint nevtralen → ni hydration mismatch).
  const [votes, setVotes] = useState<Record<string, number>>(
    () => initialVotes ?? {}
  );
  const [votedKeys, setVotedKeys] = useState<ReadonlySet<string>>(
    () => new Set<string>()
  );
  const [voterId, setVoterId] = useState<string>("");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);

  // Na mountu nastavi itinerer v store → MapView nariše barvno pot po dnevih
  useEffect(() => {
    setItinerary(itinerary);
  }, [itinerary, setItinerary]);

  // Mount: zagotovi voterId + naloži lokalno oddane glasove
  useEffect(() => {
    if (!shareId) return;
    try {
      let vid = window.localStorage.getItem(VOTER_STORAGE_KEY);
      if (!vid) {
        vid =
          typeof crypto !== "undefined" &&
          typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `v-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
        window.localStorage.setItem(VOTER_STORAGE_KEY, vid);
      }
      setVoterId(vid);

      const raw = window.localStorage.getItem(votesStorageKey(shareId));
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setVotedKeys(
            new Set(parsed.filter((k): k is string => typeof k === "string"))
          );
        }
      }
    } catch {
      // localStorage nedostopen (private mode) — glasovanje deluje brez
      // persistenze lastnih glasov
    }
  }, [shareId]);

  // Persistiraj lokalni seznam oddanih glasov
  const persistVotedKeys = useCallback(
    (next: ReadonlySet<string>) => {
      try {
        window.localStorage.setItem(
          votesStorageKey(shareId),
          JSON.stringify(Array.from(next))
        );
      } catch {
        // ignore — private mode
      }
    },
    [shareId]
  );

  // Glasuj / odvzemi glas za lokacijo (optimistično + revert ob napaki)
  const toggleVote = useCallback(
    async (locationKey: string) => {
      if (!shareId || !voterId || pendingKey) return;
      setVoteError(null);

      const wasVoted = votedKeys.has(locationKey);
      const prevCount = votes[locationKey] ?? 0;
      const optimisticCount = Math.max(
        0,
        prevCount + (wasVoted ? -1 : 1)
      );

      // Optimistična posodobitev UI + lokalni zapis
      setPendingKey(locationKey);
      setVotes((prev) => ({ ...prev, [locationKey]: optimisticCount }));
      setVotedKeys((prev) => {
        const next = new Set(prev);
        if (wasVoted) next.delete(locationKey);
        else next.add(locationKey);
        persistVotedKeys(next);
        return next;
      });

      try {
        const res = await fetch("/api/trip-vote", {
          method: wasVoted ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shareId, locationKey, voterId }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: unknown = await res.json();
        const count = (data as { count?: unknown } | null)?.count;
        if (typeof count === "number" && count >= 0) {
          // Server je avtoriteta (idempotentno, šteje vse volivce)
          setVotes((prev) => ({ ...prev, [locationKey]: count }));
        }
      } catch (err) {
        // Revert optimistične spremembe
        console.error("[shared-trip] glasovanje neuspešno:", err);
        setVotes((prev) => ({ ...prev, [locationKey]: prevCount }));
        setVotedKeys((prev) => {
          const reverted = new Set(prev);
          if (wasVoted) reverted.add(locationKey);
          else reverted.delete(locationKey);
          persistVotedKeys(reverted);
          return reverted;
        });
        setVoteError("Glasovanje trenutno ni na voljo — poskusi znova.");
      } finally {
        setPendingKey(null);
      }
    },
    [shareId, voterId, pendingKey, votedKeys, votes, persistVotedKeys]
  );

  const title = name || "AI načrt potovanja po Sloveniji";

  // Varna vrednost skupnega proračuna (shranjen JSON lahko manjka polje)
  const totalBudget =
    typeof itinerary.total_budget === "number" ? itinerary.total_budget : 0;

  // Dogodki: props (sveže izračunani) → fallback na shranjene v itinererju
  const displayEvents =
    events && events.length > 0 ? events : itinerary.events;

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
        {/* === Zemljevid s barvno potjo (ne tiska) === */}
        {routeByDay.length > 0 && (
          <section
            className="print-hide print:hidden mb-10"
            aria-label="Zemljevid poti"
          >
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

          {/* Glasovanje skupine — razlaga za obiskovalce (ne tiska) */}
          {shareId && (
            <div className="print-hide print:hidden">
              <p className="flex items-start gap-2 text-sm text-muted-foreground">
                <ThumbsUp
                  className="mt-0.5 size-4 shrink-0 text-primary"
                  aria-hidden="true"
                />
                V glasovanju izberi aktivnosti, ki ti najbolj ugajajo —
                lastnik načrta vidi izbiro skupine.
              </p>
              {voteError && (
                <p
                  role="alert"
                  className="mt-2 text-sm text-destructive"
                >
                  {voteError}
                </p>
              )}
            </div>
          )}

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
                  {day.locations.map((visit, idx) => {
                    const locationKey = visit.destination_id;
                    const vote: LocationVoteProps | undefined =
                      shareId && locationKey
                        ? {
                            count: votes[locationKey] ?? 0,
                            voted: votedKeys.has(locationKey),
                            pending: pendingKey === locationKey,
                            onToggle: () => void toggleVote(locationKey),
                          }
                        : undefined;
                    return (
                      <LocationCard
                        key={`${day.day}-${idx}`}
                        visit={visit}
                        vote={vote}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>

        {/* === Dogodki med tvojim obiskom === */}
        {/* events (prop) → fallback itinerary.events; se ne renderira, če prazno */}
        <ItineraryEventsSection
          events={displayEvents}
          title="Dogodki med tvojim obiskom"
          variant="section"
          className="mb-10"
        />

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

        {/* === Kaj pakirati === */}
        {/* packingList je del shranjenega itinererja; če ga ni, se ne renderira */}
        <PackingListSection
          items={itinerary.packingList}
          title="Kaj pakirati"
          variant="section"
          className="mb-10"
        />

        {/* === CTA vrstica (ne tiska) === */}
        <section className="print-hide print:hidden mb-10 rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center sm:p-8">
          <h2 className="text-xl font-bold sm:text-2xl">
            Všeč ta načrt?
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
            Sestavi svoj AI načrt potovanja po Sloveniji — proračun, interesi in
            vreme, vse na enem mestu.
          </p>
          <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
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
            {/* Natisni / Shrani kot PDF — danes + dogodki + packing lista */}
            <Button
              size="lg"
              variant="outline"
              onClick={() => window.print()}
              aria-label="Natisni načrt ali ga shrani kot PDF"
            >
              <Printer className="size-4 mr-2" aria-hidden="true" />
              Natisni / Shrani kot PDF
            </Button>
          </div>
        </section>

        {/* === Deljenje (ne tiska) === */}
        <section className="print-hide print:hidden mb-10" aria-label="Deli načrt">
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
// Kartica lokacije v dnevu (+ glasovanje skupine, če je na voljo)
// ============================================================================

interface LocationCardProps {
  visit: LocationVisit;
  vote?: LocationVoteProps;
}

function LocationCard({ visit, vote }: LocationCardProps) {
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

          {/* Glasovanje skupine — ThumbsUp + števec (ne tiska) */}
          {vote && (
            <button
              type="button"
              onClick={vote.onToggle}
              disabled={vote.pending}
              aria-pressed={vote.voted}
              aria-label={
                vote.voted
                  ? `Odstrani glas za ${visit.destination_name}`
                  : `Glasuj za ${visit.destination_name}`
              }
              title={vote.voted ? "Odstrani svoj glas" : "Glasuj za to aktivnost"}
              className={cn(
                "print-hide print:hidden ml-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
                vote.voted
                  ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                  : "border-border bg-background text-foreground hover:border-primary/40 hover:text-primary"
              )}
            >
              <ThumbsUp
                className={cn("size-3.5", vote.voted && "fill-current")}
                aria-hidden="true"
              />
              <span aria-hidden="true">{vote.count}</span>
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default SharedTrip;
