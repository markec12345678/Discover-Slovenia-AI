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
// TASK 8 / D8-D (§3.3): kanonski "Dodaj v mojo pot" na dogodkih (D8-A §9.2)
import { AddToTripButton } from "@/components/add-to-trip-button";
// TASK 8 / F3-B (D8-A P-STATE-2): prazno stanje nosi družinska EmptyState
// (lokalni klon poenoten — isto besedilo).
import { EmptyState } from "@/components/states/empty-state";
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
  SLOVENIAN_MONTHS_FULL,
  formatEventDate,
  type EventItem,
  type EventCategory,
} from "@/lib/events-data";
// TASK 8 / F4-D (issue #8 Faza 4 / F3-E): EN prekrivna plast dogodkov —
// EVENTS_EN (ime + opis po id-ju) in EVENT_CATEGORY_LABELS_EN. SL pot
// ostaja nespremenjena (EVENTS + EVENT_CATEGORY_LABELS); resolucija sledi
// vzorcu matchEventsForItinerary (events-match.ts): en?.name ?? ime.
import { EVENTS_EN, EVENT_CATEGORY_LABELS_EN } from "@/lib/events-data-en";
import { REGIONS } from "@/lib/slovenia-data";
import { useLocale } from "next-intl";

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

// TASK 8 / F4-D: UI krom koledarja v L-pattern (SL/EN). Datume formatira
// formatEventDate(event.date, event.endDate, lang) — istoimenski tretji
// parameter obstaja od 1.29.0 (revizija #13), tu ga šele vklopimo.
const L = {
  headerBadge: { sl: "Vse leto", en: "All year round" },
  title: { sl: "Koledar dogodkov", en: "Event calendar" },
  subtitle: {
    sl: "Festivali, prireditve in dogodki skozi vse leto",
    en: "Festivals, happenings and events all year round",
  },
  allMonths: { sl: "Vsi meseci", en: "All months" },
  filterByMonth: { sl: "Filtriraj po mesecu", en: "Filter by month" },
  allCategories: { sl: "Vse kategorije", en: "All categories" },
  filterByCategory: {
    sl: "Filtriraj po kategoriji",
    en: "Filter by category",
  },
  allRegions: { sl: "Vse regije", en: "All regions" },
  filterByRegion: { sl: "Filtriraj po regiji", en: "Filter by region" },
  noEvents: {
    sl: "Ni dogodkov za izbrane filtre",
    en: "No events match your filters",
  },
  oneEvent: { sl: "1 dogodek", en: "1 event" },
  eventsCount: { sl: "dogodkov", en: "events" },
  emptyTitle: {
    sl: "Ni dogodkov za izbrane filtre.",
    en: "No events match your filters.",
  },
  emptyDescription: {
    sl: "Poskusite spremeniti mesec, kategorijo ali regijo.",
    en: "Try changing the month, category or region.",
  },
  featured: { sl: "Izpostavljeno", en: "Featured" },
  dateTitle: { sl: "Datum dogodka", en: "Event date" },
  locationTitle: { sl: "Lokacija", en: "Location" },
  admissionTitle: { sl: "Vstopnina", en: "Admission" },
  free: { sl: "Brezplačno", en: "Free" },
  website: { sl: "Spletna stran", en: "Website" },
  exploreDestination: {
    sl: "Razišči destinacijo",
    en: "Explore the destination",
  },
} as const;

// EN polna imena mesecev (F4-D — zrcalo SLOVENIAN_MONTHS_FULL; kratke EN
// oblike že obstajajo v events-data kot ENGLISH_MONTHS_SHORT).
const ENGLISH_MONTHS_FULL: string[] = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Polna imena mesecev v izbranem jeziku (glava skupine + filter). */
export function monthsFull(lang: "sl" | "en"): string[] {
  return lang === "en" ? ENGLISH_MONTHS_FULL : SLOVENIAN_MONTHS_FULL;
}

/**
 * Možnosti filtra meseca (vrednost = indeks meseca kot string — ISTA
 * pogodba kot MONTH_OPTIONS iz events-data, samo oznake so jezikovne).
 */
export function monthOptions(
  lang: "sl" | "en"
): { value: string; label: string }[] {
  return monthsFull(lang).map((label, idx) => ({ value: String(idx), label }));
}

/**
 * F4-D: ime + opis dogodka v izbranem jeziku — EN prekrivna plast EVENTS_EN
 * po id-ju z varnim fallbackom na SL (isti vzorec kot resolucija v
 * matchEventsForItinerary / events-match.ts). Identifikatorji, datumi,
 * kategorije, regije in slike se NE prevajajo.
 */
export function eventText(
  event: Pick<EventItem, "id" | "name" | "description">,
  lang: "sl" | "en"
): { name: string; description: string } {
  const en = lang === "en" ? EVENTS_EN[event.id] : undefined;
  return {
    name: en?.name ?? event.name,
    description: en?.description ?? event.description,
  };
}

/** Oznaka kategorije dogodka v izbranem jeziku (F4-D — čista funkcija). */
export function eventCategoryLabel(
  category: EventCategory,
  lang: "sl" | "en"
): string {
  return lang === "en"
    ? EVENT_CATEGORY_LABELS_EN[category]
    : EVENT_CATEGORY_LABELS[category];
}

/**
 * EventsCalendar — koledar slovenskih festivaljev in prireditev.
 * "use client" zaradi filtrov (Select) in memoizacije.
 * Dogodki so uvoženi direktno iz events-data.ts (brez API klica).
 */
export function EventsCalendar() {
  // TASK 8 / F4-D: jezik koledarja — poganja UI krom (L), EN podatkovno
  // plast (EVENTS_EN) in format datumov (formatEventDate, 3. parameter).
  const locale = useLocale();
  const lang: "sl" | "en" = locale === "en" ? "en" : "sl";
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
            {L.headerBadge[lang]}
          </Badge>
          <h2
            id="dogodki-title"
            className="text-3xl font-bold tracking-tight sm:text-4xl"
          >
            {L.title[lang]}
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            {L.subtitle[lang]}
          </p>
        </div>

        {/* Filter vrstica */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
          <FilterSelect
            value={month}
            onChange={setMonth}
            placeholder={L.allMonths[lang]}
            ariaLabel={L.filterByMonth[lang]}
            options={monthOptions(lang)}
          />
          <FilterSelect
            value={category}
            onChange={setCategory}
            placeholder={L.allCategories[lang]}
            ariaLabel={L.filterByCategory[lang]}
            options={EVENT_CATEGORIES.map((c) => ({
              value: c.value,
              label: `${c.icon} ${eventCategoryLabel(c.value, lang)}`,
            }))}
          />
          <FilterSelect
            value={region}
            onChange={setRegion}
            placeholder={L.allRegions[lang]}
            ariaLabel={L.filterByRegion[lang]}
            options={REGIONS.map((r) => ({
              value: r.value,
              label: r.label,
            }))}
          />
        </div>

        {/* Števec */}
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {total === 0
            ? L.noEvents[lang]
            : total === 1
              ? L.oneEvent[lang]
              : `${total} ${L.eventsCount[lang]}`}
        </p>

        {/* Mesečni prikaz */}
        {groupedByMonth.length === 0 ? (
          <EmptyState
            icon={CalendarX}
            title={L.emptyTitle[lang]}
            description={L.emptyDescription[lang]}
            className="mt-8 py-16"
          />
        ) : (
          <div className="mt-8 flex flex-col gap-10">
            {groupedByMonth.map((group) => (
              <MonthGroup
                key={group.month}
                month={group.month}
                events={group.events}
                lang={lang}
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
  lang,
}: {
  month: number;
  events: EventItem[];
  /** F4-D: jezik glave meseca (ime meseca + števec dogodkov). */
  lang: "sl" | "en";
}) {
  return (
    <div>
      {/* Glava meseca */}
      <div className="flex items-center gap-3 border-b border-border pb-3">
        <h3 className="text-xl font-bold text-primary sm:text-2xl">
          {monthsFull(lang)[month]}
        </h3>
        <Badge variant="secondary" className="font-medium">
          {events.length === 1
            ? L.oneEvent[lang]
            : `${events.length} ${L.eventsCount[lang]}`}
        </Badge>
      </div>

      {/* Kartice dogodkov */}
      <div className="mt-5 grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-2">
        {events.map((event) => (
          <EventCard key={event.id} event={event} lang={lang} />
        ))}
      </div>
    </div>
  );
}

function EventCard({
  event,
  lang,
}: {
  event: EventItem;
  /** F4-D: jezik kartice (ime/opis prek EVENTS_EN, kategorija, datumi). */
  lang: "sl" | "en";
}) {
  const CategoryIcon = CATEGORY_ICON[event.category];
  const isFree = event.priceRange === "brezplačno";
  // F4-D: ime/opis v jeziku površine (EN prekrivna plast, fallback SL).
  const text = eventText(event, lang);

  return (
    <Card className="group gap-0 overflow-hidden py-0 transition-all hover:shadow-lg">
      {/* Mobilni row layout (slika levo) — enak kot ≥sm; prej je bila slika čez vso širino (~500px/kartico) */}
      <div className="flex flex-row">
        {/* Slika */}
        <div className="relative w-28 shrink-0 overflow-hidden bg-muted sm:w-40">
          <img
            src={event.image}
            alt={`${text.name} — ${event.location}`}
            loading="lazy"
            className="aspect-square size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          {event.featured ? (
            <Badge className="absolute right-2 top-2 bg-amber-400 text-amber-950 shadow-sm">
              <Star
                className="size-3 fill-amber-950 text-amber-950"
                aria-hidden="true"
              />
              {/* Besedilo ne spravi v 112px sliko — na mobilnem samo zvezdica + sr-only */}
              <span className="sr-only sm:hidden">{L.featured[lang]}</span>
              <span className="hidden sm:inline">{L.featured[lang]}</span>
            </Badge>
          ) : null}
        </div>

        {/* Vsebina */}
        <CardContent className="flex min-w-0 flex-1 flex-col gap-2 p-4 sm:p-5">
          {/* Kategorija */}
          <Badge
            className={`w-fit ${CATEGORY_BADGE_CLASS[event.category]}`}
          >
            <CategoryIcon className="size-3" aria-hidden="true" />
            {eventCategoryLabel(event.category, lang)}
          </Badge>

          {/* Ime */}
          <h4 className="text-base font-semibold leading-tight sm:text-lg">
            {text.name}
          </h4>

          {/* Meta: datum, lokacija, cena */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span
              className="inline-flex items-center gap-1.5"
              title={L.dateTitle[lang]}
            >
              <Calendar className="size-4 text-primary" aria-hidden="true" />
              <time
                dateTime={event.date}
                className="font-medium text-foreground/80"
              >
                {formatEventDate(event.date, event.endDate, lang)}
              </time>
            </span>
            <span
              className="inline-flex items-center gap-1.5"
              title={L.locationTitle[lang]}
            >
              <MapPin className="size-4 text-primary" aria-hidden="true" />
              {event.location}
            </span>
            <span
              className="inline-flex items-center gap-1.5"
              title={L.admissionTitle[lang]}
            >
              <Ticket className="size-4 text-primary" aria-hidden="true" />
              {isFree ? (
                <span className="font-medium text-emerald-700 dark:text-emerald-400">
                  {L.free[lang]}
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
            {text.description}
          </p>

          {/* CTA gumbi — TASK 8 / D8-D: kanonski "Dodaj v mojo pot" je ZDAJ
              vedno prisoten (prej so kartice brez website/destinationId niso
              imele NOBENE akcije). Obstoječi gumbi (spletna stran /
              razišči destinacijo) ostajajo nespremenjeni. */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <AddToTripButton
              variant="compact"
              item={{
                kind: "event",
                refId: event.id,
                title: text.name,
                subtitle: `${formatEventDate(
                  event.date,
                  event.endDate,
                  lang
                )} · ${event.location}`,
                // ISKRENOST href: dogodki nimajo interne podstrani — zbirka
                // "Moja pot" sprejema SAMO notranje poti (my-trip.ts meja),
                // zato vodi na koledar /dogodki (zunanja spletna stran
                // dogodka ostaja gumb zgoraj).
                href: "/dogodki",
                image: event.image,
                source: "dogodki",
              }}
            />
            {event.website ? (
                <Button asChild size="sm" variant="outline">
                  <a
                    href={event.website}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {L.website[lang]}
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
                  <a href="/destinacije">
                    {L.exploreDestination[lang]}
                    <ArrowRight
                      className="size-3.5 transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </a>
                </Button>
              ) : null}
          </div>
        </CardContent>
      </div>
    </Card>
  );
}

/* TASK 8 / F3-B: lokalni klon EmptyState je ODSTRANJEN — površina
 * uporablja družinsko komponento @/components/states/empty-state
 * (isto besedilo: naslov + namig, brez CTA). */

export default EventsCalendar;
