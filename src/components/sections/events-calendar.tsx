"use client";

import { useMemo, useState } from "react";
import {
  Calendar,
  MapPin,
  Ticket,
  Star,
  ExternalLink,
  ArrowRight,
  Music,
  Trophy,
  UtensilsCrossed,
  Sparkles,
  Theater,
  PartyPopper,
  CalendarX,
  type LucideIcon,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EVENTS,
  EVENT_CATEGORIES,
  EVENT_CATEGORY_LABELS,
  MONTH_OPTIONS,
  SLOVENIAN_MONTHS_FULL,
  formatEventDate,
  type EventItem,
  type EventCategory,
} from "@/lib/events-data";
import { REGIONS } from "@/lib/slovenia-data";

const ALL_VALUE = "all";

// Barva badge-a glede na kategorijo (NO indigo/blue)
const CATEGORY_BADGE_CLASS: Record<EventCategory, string> = {
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
const CATEGORY_ICON: Record<EventCategory, LucideIcon> = {
  glasba: Music,
  sport: Trophy,
  hrana: UtensilsCrossed,
  tradicija: Sparkles,
  kultura: Theater,
  festival: PartyPopper,
};

/**
 * EventsCalendar — koledar slovenskih festivaljev in prireditev.
 * "use client" zaradi filtrov (Select) in memoizacije.
 * Dogodki so uvoženi direktno iz events-data.ts (brez API klica).
 */
export function EventsCalendar() {
  const [month, setMonth] = useState<string>(ALL_VALUE);
  const [category, setCategory] = useState<string>(ALL_VALUE);
  const [region, setRegion] = useState<string>(ALL_VALUE);

  // Filtrirani dogodki glede na izbrane filtre
  const filtered = useMemo(() => {
    return EVENTS.filter((e) => {
      const categoryOk = category === ALL_VALUE || e.category === category;
      const regionOk = region === ALL_VALUE || e.region === region;
      if (!categoryOk || !regionOk) return false;

      if (month === ALL_VALUE) return true;

      const selectedMonth = Number(month);
      const startMonth = new Date(e.date).getMonth();
      const endMonth = e.endDate
        ? new Date(e.endDate).getMonth()
        : startMonth;
      return selectedMonth >= startMonth && selectedMonth <= endMonth;
    });
  }, [month, category, region]);

  // Združevanje po mesecu (od januarja do decembra)
  const groupedByMonth = useMemo(() => {
    const groups: { month: number; events: EventItem[] }[] = [];
    for (let m = 0; m < 12; m++) {
      const monthEvents = filtered
        .filter((e) => {
          // Če je izbran konkreten mesec, vse prikažemo pod njim
          if (month !== ALL_VALUE) {
            return Number(month) === m;
          }
          // Sicer grupiramo po začetnem mesecu
          return new Date(e.date).getMonth() === m;
        })
        .sort(
          (a, b) =>
            new Date(a.date).getTime() - new Date(b.date).getTime()
        );
      if (monthEvents.length > 0) {
        groups.push({ month: m, events: monthEvents });
      }
    }
    return groups;
  }, [filtered, month]);

  const total = filtered.length;

  return (
    <section
      id="dogodki"
      className="scroll-mt-20 bg-muted/30 py-16 sm:py-20"
      aria-labelledby="dogodki-title"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <Badge
            variant="outline"
            className="mb-3 border-primary/30 text-primary"
          >
            <Calendar className="size-3" aria-hidden="true" />
            Vse leto
          </Badge>
          <h2
            id="dogodki-title"
            className="text-3xl font-bold tracking-tight sm:text-4xl"
          >
            Koledar dogodkov
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            Festivali, prireditve in dogodki skozi vse leto
          </p>
        </div>

        {/* Filter vrstica */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
          <FilterSelect
            value={month}
            onChange={setMonth}
            placeholder="Vsi meseci"
            ariaLabel="Filtriraj po mesecu"
            options={MONTH_OPTIONS}
          />
          <FilterSelect
            value={category}
            onChange={setCategory}
            placeholder="Vse kategorije"
            ariaLabel="Filtriraj po kategoriji"
            options={EVENT_CATEGORIES.map((c) => ({
              value: c.value,
              label: `${c.icon} ${c.label}`,
            }))}
          />
          <FilterSelect
            value={region}
            onChange={setRegion}
            placeholder="Vse regije"
            ariaLabel="Filtriraj po regiji"
            options={REGIONS.map((r) => ({
              value: r.value,
              label: r.label,
            }))}
          />
        </div>

        {/* Števec */}
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {total === 0
            ? "Ni dogodkov za izbrane filtre"
            : total === 1
              ? "1 dogodek"
              : `${total} dogodkov`}
        </p>

        {/* Mesečni prikaz */}
        {groupedByMonth.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="mt-8 flex flex-col gap-10">
            {groupedByMonth.map((group) => (
              <MonthGroup
                key={group.month}
                month={group.month}
                events={group.events}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ===================== POMOŽNE KOMPONENTE =====================

interface FilterOption {
  value: string;
  label: string;
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  ariaLabel,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  ariaLabel: string;
  options: FilterOption[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={ariaLabel} className="w-full sm:w-56">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_VALUE}>{placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MonthGroup({
  month,
  events,
}: {
  month: number;
  events: EventItem[];
}) {
  return (
    <div>
      {/* Glava meseca */}
      <div className="flex items-center gap-3 border-b border-border pb-3">
        <h3 className="text-xl font-bold text-primary sm:text-2xl">
          {SLOVENIAN_MONTHS_FULL[month]}
        </h3>
        <Badge variant="secondary" className="font-medium">
          {events.length === 1 ? "1 dogodek" : `${events.length} dogodkov`}
        </Badge>
      </div>

      {/* Kartice dogodkov */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        {events.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
}

function EventCard({ event }: { event: EventItem }) {
  const CategoryIcon = CATEGORY_ICON[event.category];
  const isFree = event.priceRange === "brezplačno";

  return (
    <Card className="group gap-0 overflow-hidden py-0 transition-all hover:shadow-lg">
      <div className="flex flex-col sm:flex-row">
        {/* Slika */}
        <div className="relative w-full overflow-hidden bg-muted sm:w-40 sm:shrink-0">
          <img
            src={event.image}
            alt={`${event.name} — ${event.location}`}
            loading="lazy"
            className="aspect-video size-full object-cover transition-transform duration-500 group-hover:scale-105 sm:aspect-square"
          />
          {event.featured ? (
            <Badge className="absolute right-2 top-2 bg-amber-400 text-amber-950 shadow-sm">
              <Star
                className="size-3 fill-amber-950 text-amber-950"
                aria-hidden="true"
              />
              Izpostavljeno
            </Badge>
          ) : null}
        </div>

        {/* Vsebina */}
        <CardContent className="flex flex-1 flex-col gap-2 p-4 sm:p-5">
          {/* Kategorija */}
          <Badge
            className={`w-fit ${CATEGORY_BADGE_CLASS[event.category]}`}
          >
            <CategoryIcon className="size-3" aria-hidden="true" />
            {EVENT_CATEGORY_LABELS[event.category]}
          </Badge>

          {/* Ime */}
          <h4 className="text-lg font-semibold leading-tight">
            {event.name}
          </h4>

          {/* Meta: datum, lokacija, cena */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
            <span
              className="inline-flex items-center gap-1.5"
              title="Datum dogodka"
            >
              <Calendar className="size-4 text-primary" aria-hidden="true" />
              <time
                dateTime={event.date}
                className="font-medium text-foreground/80"
              >
                {formatEventDate(event.date, event.endDate)}
              </time>
            </span>
            <span
              className="inline-flex items-center gap-1.5"
              title="Lokacija"
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

          {/* Opis */}
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground line-clamp-2">
            {event.description}
          </p>

          {/* CTA gumbi */}
          {(event.website || event.destinationId) && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {event.website ? (
                <Button asChild size="sm" variant="outline">
                  <a
                    href={event.website}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Spletna stran
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                  </a>
                </Button>
              ) : null}
              {event.destinationId ? (
                <Button
                  asChild
                  size="sm"
                  variant="ghost"
                  className="text-primary hover:bg-primary/10 hover:text-primary"
                >
                  <a href="#destinacije">
                    Razišči destinacijo
                    <ArrowRight
                      className="size-3.5 transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </a>
                </Button>
              ) : null}
            </div>
          )}
        </CardContent>
      </div>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-background/50 px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted">
        <CalendarX
          className="size-6 text-muted-foreground"
          aria-hidden="true"
        />
      </span>
      <p className="text-base font-medium">Ni dogodkov za izbrane filtre.</p>
      <p className="text-sm text-muted-foreground">
        Poskusite spremeniti mesec, kategorijo ali regijo.
      </p>
    </div>
  );
}

export default EventsCalendar;
