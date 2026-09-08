import {
  CalendarDays,
  ExternalLink,
  MapPin,
  Music,
  PartyPopper,
  Sparkles,
  Theater,
  Ticket,
  Trophy,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  EVENT_CATEGORY_LABELS,
  formatEventDate,
} from "@/lib/events-data";
import type { ItineraryEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

// ============================================================================
// ITINERARY EVENTS — "Kaj se dogaja med tvojim obiskom"
// ============================================================================
//
// Skupna sekcija dogodkov, ki se zgodijo med obiskom (max 6, glej API
// /api/itinerary). Uporabljena v itinerary-planner (rezultati) in na javni
// strani /pot/[shareId] (shared-trip) — enak dizajn na obeh površinah.
//
// Kategorije so obarvane po isti paleti kot koledar dogodkov
// (events-calendar.tsx) — brez modre/indigo.
// ============================================================================

// Barva badge-a glede na kategorijo (NO indigo/blue)
const CATEGORY_BADGE_CLASS: Record<string, string> = {
  glasba: "bg-primary text-primary-foreground",
  sport:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
  hrana: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  tradicija:
    "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-100",
  kultura:
    "bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-100",
  festival: "bg-accent text-accent-foreground",
};

// Ikona glede na kategorijo
const CATEGORY_ICON: Record<string, LucideIcon> = {
  glasba: Music,
  sport: Trophy,
  hrana: UtensilsCrossed,
  tradicija: Sparkles,
  kultura: Theater,
  festival: PartyPopper,
};

const FALLBACK_BADGE_CLASS = "bg-muted text-foreground";

function categoryLabel(category: string): string {
  const labels = EVENT_CATEGORY_LABELS as Record<string, string>;
  return labels[category] ?? category;
}

function EventMiniCard({ event }: { event: ItineraryEvent }) {
  const badgeClass =
    CATEGORY_BADGE_CLASS[event.category] ?? FALLBACK_BADGE_CLASS;
  const CategoryIcon = CATEGORY_ICON[event.category] ?? CalendarDays;
  const isFree = event.priceRange === "brezplačno";

  return (
    <article className="rounded-lg border border-border/60 bg-card/50 p-4 transition-colors hover:border-primary/30">
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-base font-semibold leading-tight">
          {event.name}
        </h4>
        <Badge className={cn("shrink-0 gap-1", badgeClass)}>
          <CategoryIcon className="size-3" aria-hidden="true" />
          {categoryLabel(event.category)}
        </Badge>
      </div>

      {/* Meta: datum, lokacija, vstopnina */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
        <time
          dateTime={event.date}
          className="inline-flex items-center gap-1.5"
          title="Datum dogodka"
        >
          <CalendarDays className="size-4 text-primary" aria-hidden="true" />
          <span className="font-medium text-foreground/80">
            {formatEventDate(event.date, event.endDate)}
          </span>
        </time>
        <span
          className="inline-flex items-center gap-1.5"
          title="Lokacija dogodka"
        >
          <MapPin className="size-4 text-primary" aria-hidden="true" />
          {event.location}
        </span>
        <span
          className="inline-flex items-center gap-1.5"
          title="Vstopnina"
        >
          <Ticket className="size-4 text-primary" aria-hidden="true" />
          {isFree ? (
            <span className="font-medium text-emerald-700 dark:text-emerald-400">
              Brezplačno
            </span>
          ) : (
            <span className="font-medium text-foreground/80">
              {event.priceRange}
            </span>
          )}
        </span>
      </div>

      {event.description && (
        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
          {event.description}
        </p>
      )}

      {event.website && (
        <a
          href={event.website}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
        >
          Spletna stran
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      )}
    </article>
  );
}

interface ItineraryEventsSectionProps {
  /** Dogodki med obiskom (API vrne max 6) */
  events?: ItineraryEvent[];
  /** Naslov sekcije — planner: "Kaj se dogaja med tvojim obiskom", /pot: "Dogodki med tvojim obiskom" */
  title?: string;
  /** "card" = naslov znotraj kartice (planner), "section" = h2 nad karticami (/pot) */
  variant?: "card" | "section";
  /** Dodatni razred za koren sekcije (npr. mb-10 na /pot) */
  className?: string;
}

export function ItineraryEventsSection({
  events,
  title = "Kaj se dogaja med tvojim obiskom",
  variant = "card",
  className,
}: ItineraryEventsSectionProps) {
  // Prazna/undefined sekcija se ne renderira
  if (!events || events.length === 0) return null;

  // Varnostna meja — API vrne max 6, a tudi stari shranjeni načrti so varni
  const safeEvents = events.slice(0, 6);

  const grid = (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {safeEvents.map((event) => (
        <EventMiniCard key={event.id} event={event} />
      ))}
    </div>
  );

  if (variant === "section") {
    return (
      <section className={className} aria-label={title}>
        <h2 className="mb-4 flex items-center gap-2 text-xl font-bold sm:text-2xl">
          <CalendarDays className="size-5 text-primary" aria-hidden="true" />
          {title}
        </h2>
        {grid}
      </section>
    );
  }

  return (
    <section className={className} aria-label={title}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarDays className="size-5 text-primary" aria-hidden="true" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>{grid}</CardContent>
      </Card>
    </section>
  );
}

export default ItineraryEventsSection;
