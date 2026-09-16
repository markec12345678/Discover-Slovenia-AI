import {
  CalendarDays,
  Check,
  ExternalLink,
  MapPin,
  Music,
  PartyPopper,
  Plus,
  Sparkles,
  Theater,
  Ticket,
  Trophy,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  EVENT_CATEGORY_LABELS,
  formatEventDate,
} from "@/lib/events-data";
import { EVENT_CATEGORY_LABELS_EN } from "@/lib/events-data-en";
import { eventOverlapsTrip, tripDuringPhraseSI } from "@/lib/trip-dates";
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
// FW4.2:
//   - tripStartDate/tripEndDate → podnaslov "Tvoja pot je med …" + badge
//     "Med tvojim obiskom" na dogodkih, ki se prekrivajo z okvirjem poti
//   - onToggleEvent (samo planner kontekst) → CTA "Dodaj v mojo pot" /
//     stanje "V tvoji poti"; na /pot se prikaže statični badge "V poti"
//     za dogodke, ki jih je lastnik dodal (itinerary.addedEvents)
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

/** Jezik sekcije (1.29.0, revizija #13) — privzeto SL (/pot stran). */
export type EventsLang = "sl" | "en";

// UI nizi — komponenta je skupna plannerju (next-intl, EN prek locale) in
// /pot strani (SL-only) → jezik nosi eksplicitni prop, ne globalni intl.
const STRINGS: Record<
  EventsLang,
  {
    defaultTitle: string;
    duringBadge: string;
    duringBadgeTitle: string;
    dateTitle: string;
    locationTitle: string;
    admissionTitle: string;
    free: string;
    inYourTrip: string;
    addToMyTrip: string;
    inTrip: string;
    website: string;
    yourTripSubtitle: (range: string) => string;
  }
> = {
  sl: {
    defaultTitle: "Kaj se dogaja med tvojim obiskom",
    duringBadge: "Med tvojim obiskom",
    duringBadgeTitle: "Dogodek se zgodi med tvojim obiskom",
    dateTitle: "Datum dogodka",
    locationTitle: "Lokacija dogodka",
    admissionTitle: "Vstopnina",
    free: "Brezplačno",
    inYourTrip: "V tvoji poti",
    addToMyTrip: "Dodaj v mojo pot",
    inTrip: "V poti",
    website: "Spletna stran",
    yourTripSubtitle: (range) => `Tvoja pot je ${range}`,
  },
  en: {
    defaultTitle: "What's on during your visit",
    duringBadge: "During your visit",
    duringBadgeTitle: "This event takes place during your visit",
    dateTitle: "Event date",
    locationTitle: "Event location",
    admissionTitle: "Admission",
    free: "Free",
    inYourTrip: "In your trip",
    addToMyTrip: "Add to my trip",
    inTrip: "In trip",
    website: "Website",
    yourTripSubtitle: (range) => `Your trip runs ${range}`,
  },
};

function categoryLabel(category: string, lang: EventsLang): string {
  const labels = (
    lang === "en" ? EVENT_CATEGORY_LABELS_EN : EVENT_CATEGORY_LABELS
  ) as Record<string, string>;
  return labels[category] ?? category;
}

interface EventMiniCardProps {
  event: ItineraryEvent;
  /** 1.29.0: jezik kartice (nizi + format datuma) */
  lang: EventsLang;
  /** FW4.2: dogodek se prekriva z okvirjem potovanja */
  duringVisit?: boolean;
  /** FW4.2: dogodek je v uporabnikovi poti (addedEvents) */
  added?: boolean;
  /** FW4.2: CTA preklopa "Dodaj v mojo pot" — samo planner kontekst */
  onToggle?: (event: ItineraryEvent) => void;
}

function EventMiniCard({ event, lang, duringVisit, added, onToggle }: EventMiniCardProps) {
  const s = STRINGS[lang];
  const badgeClass =
    CATEGORY_BADGE_CLASS[event.category] ?? FALLBACK_BADGE_CLASS;
  const CategoryIcon = CATEGORY_ICON[event.category] ?? CalendarDays;
  const isFree = event.priceRange === "brezplačno";

  return (
    <article className={cn(
      "rounded-lg border border-border/60 bg-card/50 p-4 transition-colors",
      added ? "border-emerald-500/40 bg-emerald-500/5" : "hover:border-primary/30"
    )}>
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-base font-semibold leading-tight">
          {event.name}
        </h4>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {duringVisit && (
            <Badge
              variant="outline"
              className="gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              title={s.duringBadgeTitle}
            >
              {s.duringBadge}
            </Badge>
          )}
          <Badge className={cn("shrink-0 gap-1", badgeClass)}>
            <CategoryIcon className="size-3" aria-hidden="true" />
            {categoryLabel(event.category, lang)}
          </Badge>
        </div>
      </div>

      {/* Meta: datum, lokacija, vstopnina */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
        <time
          dateTime={event.date}
          className="inline-flex items-center gap-1.5"
          title={s.dateTitle}
        >
          <CalendarDays className="size-4 text-primary" aria-hidden="true" />
          <span className="font-medium text-foreground/80">
            {formatEventDate(event.date, event.endDate, lang)}
          </span>
        </time>
        <span
          className="inline-flex items-center gap-1.5"
          title={s.locationTitle}
        >
          <MapPin className="size-4 text-primary" aria-hidden="true" />
          {event.location}
        </span>
        <span
          className="inline-flex items-center gap-1.5"
          title={s.admissionTitle}
        >
          <Ticket className="size-4 text-primary" aria-hidden="true" />
          {isFree ? (
            <span className="font-medium text-emerald-700 dark:text-emerald-400">
              {s.free}
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

      {(onToggle || (added && !onToggle)) && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {onToggle ? (
            <button
              type="button"
              onClick={() => onToggle(event)}
              aria-pressed={added}
              className={cn(
                "inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                added
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400"
                  : "border-primary/40 text-primary hover:bg-primary/10"
              )}
            >
              {added ? (
                <>
                  <Check className="size-4" aria-hidden="true" />
                  {s.inYourTrip}
                </>
              ) : (
                <>
                  <Plus className="size-4" aria-hidden="true" />
                  {s.addToMyTrip}
                </>
              )}
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
              <Check className="size-4" aria-hidden="true" />
              {s.inTrip}
            </span>
          )}
          {event.website && (
            <a
              href={event.website}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
            >
              {s.website}
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          )}
        </div>
      )}

      {!onToggle && !added && event.website && (
        <a
          href={event.website}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
        >
          {s.website}
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
  /** 1.29.0 (revizija #13): jezik sekcije — privzeto "sl" (/pot stran) */
  lang?: EventsLang;
  /** "card" = naslov znotraj kartice (planner), "section" = h2 nad karticami (/pot) */
  variant?: "card" | "section";
  /** Dodatni razred za koren sekcije (npr. mb-10 na /pot) */
  className?: string;
  /** FW4.2: okvir potovanja — podnaslov "Tvoja pot je med …" + badge "Med tvojim obiskom" */
  tripStartDate?: string;
  tripEndDate?: string;
  /** FW4.2: ID-ji dogodkov, ki so že v poti (itinerary.addedEvents) */
  addedEventIds?: string[];
  /** FW4.2: preklop "Dodaj v mojo pot" — samo planner kontekst (lastnik načrta) */
  onToggleEvent?: (event: ItineraryEvent) => void;
}

export function ItineraryEventsSection({
  events,
  title,
  lang = "sl",
  variant = "card",
  className,
  tripStartDate,
  tripEndDate,
  addedEventIds,
  onToggleEvent,
}: ItineraryEventsSectionProps) {
  const s = STRINGS[lang];
  const sectionTitle = title ?? s.defaultTitle;

  // Prazna/undefined sekcija se ne renderira
  if (!events || events.length === 0) return null;

  // Varnostna meja — API vrne max 6, a tudi stari shranjeni načrti so varni
  const safeEvents = events.slice(0, 6);
  const addedSet = new Set(addedEventIds ?? []);

  const grid = (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {safeEvents.map((event) => (
        <EventMiniCard
          key={event.id}
          event={event}
          lang={lang}
          duringVisit={
            tripStartDate
              ? eventOverlapsTrip(
                  event.date,
                  event.endDate,
                  tripStartDate,
                  tripEndDate ?? tripStartDate
                )
              : false
          }
          added={addedSet.has(event.id)}
          onToggle={onToggleEvent}
        />
      ))}
    </div>
  );

  // FW4.2: podnaslov z okvirjem potovanja (samo če so datumi znani) —
  // SL: slovenska sklonska fraza (tripDuringPhraseSI); EN: EN format datuma
  const duringSubtitle = tripStartDate
    ? lang === "en"
      ? s.yourTripSubtitle(
          formatEventDate(tripStartDate, tripEndDate, "en")
        )
      : `Tvoja pot je ${tripDuringPhraseSI(tripStartDate, tripEndDate)}`
    : null;

  if (variant === "section") {
    return (
      <section className={className} aria-label={sectionTitle}>
        <h2 className="mb-1 flex items-center gap-2 text-xl font-bold sm:text-2xl">
          <CalendarDays className="size-5 text-primary" aria-hidden="true" />
          {sectionTitle}
        </h2>
        {duringSubtitle && (
          <p className="mb-4 text-sm text-muted-foreground">{duringSubtitle}</p>
        )}
        {grid}
      </section>
    );
  }

  return (
    <section className={className} aria-label={sectionTitle}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarDays className="size-5 text-primary" aria-hidden="true" />
            {sectionTitle}
          </CardTitle>
          {duringSubtitle && (
            <CardDescription>{duringSubtitle}</CardDescription>
          )}
        </CardHeader>
        <CardContent>{grid}</CardContent>
      </Card>
    </section>
  );
}

export default ItineraryEventsSection;
