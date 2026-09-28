import {
  CalendarDays,
  Check,
  Compass,
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
import { EVENT_CATEGORY_LABELS_IT } from "@/lib/events-data-it";
import { EVENT_CATEGORY_LABELS_DE } from "@/lib/events-data-de";
// W6 (Issue #15): telemetrija vstopničnega CTA — ISTA G6 pot (listing_click
// funnel korak; klik na partnerja prek /go redirecta šteje strežniško).
// Modul je SSR-varen (fetch šele ob klicu — kliše se SAMO v klientu ob kliku).
import { trackFunnel } from "@/lib/funnel";
// TASK 8 / D8-D (§3.3 write-through): dogodek, preklopljen V NAČRT, se
// registrira tudi v zbirko "Moja pot" (čista lib — SSR-varna brez okna).
import { addMyTripItem } from "@/lib/my-trip";
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
export type EventsLang = "sl" | "en" | "it" | "de";

// UI nizi — komponenta je skupna plannerju (next-intl, EN prek locale) in
// /pot strani (SL-only) → jezik nosi eksplicitni prop, ne globalni intl.
// W1-2b-2: IT/DE eksplicitna (dogodki imajo EVENTS_IT/DE prekrivne plasti).
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
    // W6 (Issue #15): brskalni pas "izven tvojih datumov" + vstopnični CTA
    browseTitle: string;
    browseHint: string;
    browseAriaLabel: string;
    ticketsCta: string;
    ticketsPartner: string;
    ticketsNote: string;
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
    browseTitle: "Kaj se dogaja izven tvojih datumov",
    browseHint:
      "Dogodki na istih destinacijah, ki se ne prekrivajo s tvojo potjo — premisli datume ali načrtuj nov obisk.",
    browseAriaLabel: "Brskalni pas dogodkov izven tvojih datumov",
    ticketsCta: "Išči vstopnice",
    ticketsPartner: "Tiqets",
    ticketsNote:
      "Partnerska povezava (Tiqets) — zunanja rezervacija; pogoje in razpoložljivost preveri pri partnerju.",
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
    browseTitle: "What's on outside your dates",
    browseHint:
      "Events at the same destinations that don't overlap your trip — consider shifting dates or planning another visit.",
    browseAriaLabel: "Browse band of events outside your dates",
    ticketsCta: "Search for tickets",
    ticketsPartner: "Tiqets",
    ticketsNote:
      "Partner link (Tiqets) — external booking; check terms and availability with the partner.",
  },
  it: {
    defaultTitle: "Cosa succede durante la tua visita",
    duringBadge: "Durante la tua visita",
    duringBadgeTitle: "Questo evento si svolge durante la tua visita",
    dateTitle: "Data dell'evento",
    locationTitle: "Luogo dell'evento",
    admissionTitle: "Ingresso",
    free: "Gratuito",
    inYourTrip: "Nel tuo viaggio",
    addToMyTrip: "Aggiungi al mio viaggio",
    inTrip: "Nel viaggio",
    website: "Sito web",
    yourTripSubtitle: (range) => `Il tuo viaggio è ${range}`,
    browseTitle: "Cosa succede fuori dalle tue date",
    browseHint:
      "Eventi nelle stesse destinazioni che non si sovrappongono al tuo viaggio — valuta di spostare le date o di pianificare un'altra visita.",
    browseAriaLabel: "Striscia di esplorazione eventi fuori dalle tue date",
    ticketsCta: "Cerca biglietti",
    ticketsPartner: "Tiqets",
    ticketsNote:
      "Link partner (Tiqets) — prenotazione esterna; condizioni e disponibilità presso il partner.",
  },
  de: {
    defaultTitle: "Was während deines Besuchs los ist",
    duringBadge: "Während deines Besuchs",
    duringBadgeTitle: "Dieses Ereignis findet während deines Besuchs statt",
    dateTitle: "Ereignisdatum",
    locationTitle: "Veranstaltungsort",
    admissionTitle: "Eintritt",
    free: "Kostenlos",
    inYourTrip: "In deiner Reise",
    addToMyTrip: "Zu meiner Reise hinzufügen",
    inTrip: "In der Reise",
    website: "Webseite",
    yourTripSubtitle: (range) => `Deine Reise läuft ${range}`,
    browseTitle: "Was außerhalb deiner Termine los ist",
    browseHint:
      "Veranstaltungen an denselben Destinationen, die sich nicht mit deiner Reise überschneiden — verschiebe die Termine oder plane einen weiteren Besuch.",
    browseAriaLabel: "Stöberband mit Veranstaltungen außerhalb deiner Termine",
    ticketsCta: "Tickets suchen",
    ticketsPartner: "Tiqets",
    ticketsNote:
      "Partnerlink (Tiqets) — externe Buchung; Bedingungen und Verfügbarkeit beim Partner prüfen.",
  },
};

function categoryLabel(category: string, lang: EventsLang): string {
  const labels = (
    lang === "en"
      ? EVENT_CATEGORY_LABELS_EN
      : lang === "it"
        ? EVENT_CATEGORY_LABELS_IT
        : lang === "de"
          ? EVENT_CATEGORY_LABELS_DE
          : EVENT_CATEGORY_LABELS
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
              onClick={() => {
                onToggle(event);
                // TASK 8 / D8-D (write-through, SAMO dodajanje): dogodek, ki
                // ga uporabnik preklopi V NAČRT (razpored), se hkrati
                // registrira v zbirko "Moja pot" (ADD sloj — zbirka ≠
                // razpored). Ob odstranitvi iz načrta zbirke NE dotikamo:
                // odstranitev iz razporeda ni odstranitev ideje. href je
                // iskren koledar /dogodki (dogodki nimajo interne podstrani;
                // zunanja spletna stran ostaja gumb ob sebi).
                if (!added) {
                  addMyTripItem({
                    kind: "event",
                    refId: event.id,
                    title: event.name,
                    subtitle: `${formatEventDate(
                      event.date,
                      event.endDate,
                      lang
                    )} · ${event.location}`,
                    href: "/dogodki",
                    source: "planner-dogodki",
                  });
                }
              }}
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

// ============================================================================
// W6 (Issue #15): BRSKALNI PAS — kompaktna kartica dogodka IZVEN okvirja
// potovanja. NAMENOMA brez "Dodaj v mojo pot": dogodek se ne prekriva s
// potjo — dodatev bi bilo LAŽNO razporejanje (kanon iskrenosti: zbirka ≠
// razporejevalnik datumov, ki jih uporabnik ni izbral). Brskanje + uradna
// spletna stran dogodka + pasovni vstopnični CTA (G6 pot).
// ============================================================================
interface EventBrowseChipProps {
  event: ItineraryEvent;
  lang: EventsLang;
}

function EventBrowseChip({ event, lang }: EventBrowseChipProps) {
  const s = STRINGS[lang];
  const badgeClass =
    CATEGORY_BADGE_CLASS[event.category] ?? FALLBACK_BADGE_CLASS;
  const CategoryIcon = CATEGORY_ICON[event.category] ?? CalendarDays;
  const isFree = event.priceRange === "brezplačno";

  return (
    <article className="w-64 shrink-0 snap-start rounded-lg border border-border/60 bg-card/50 p-3.5 transition-colors hover:border-primary/30">
      <div className="flex items-center justify-between gap-2">
        <Badge className={cn("shrink-0 gap-1", badgeClass)}>
          <CategoryIcon className="size-3" aria-hidden="true" />
          {categoryLabel(event.category, lang)}
        </Badge>
      </div>
      <h4 className="mt-2 line-clamp-2 text-sm font-semibold leading-snug">
        {event.name}
      </h4>
      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
        <time
          dateTime={event.date}
          className="flex items-center gap-1.5"
          title={s.dateTitle}
        >
          <CalendarDays className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
          <span className="font-medium text-foreground/80">
            {formatEventDate(event.date, event.endDate, lang)}
          </span>
        </time>
        <span className="flex items-center gap-1.5" title={s.locationTitle}>
          <MapPin className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
          {event.location}
        </span>
        <span className="flex items-center gap-1.5" title={s.admissionTitle}>
          <Ticket className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
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
      {event.website && (
        <a
          href={event.website}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
        >
          {s.website}
          <ExternalLink className="size-3" aria-hidden="true" />
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
  /** W6 (Issue #15): dogodki NA ISTIH destinacijah, ki se NE prekrivajo z
   *  okvirjem potovanja — brskalni pas "Kaj se dogaja izven tvojih datumov"
   *  (API jih izračuna ob generiranju + refine). Odsotno/prazno → pas se
   *  ne izriše (/pot brez sprememb). */
  outsideEvents?: ItineraryEvent[];
  /** W6: cilj vstopničnega CTA — /go/tickets?dest=… (goHref iz
   *  booking-panel, ISTA G6 pot). Odsotno → CTA se ne izriše. */
  ticketsHref?: string;
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
  outsideEvents,
  ticketsHref,
}: ItineraryEventsSectionProps) {
  const s = STRINGS[lang];
  const sectionTitle = title ?? s.defaultTitle;

  // Prazna/undefined sekcija se ne renderira
  if (!events || events.length === 0) return null;

  // Varnostna meja — API vrne max 6, a tudi stari shranjeni načrti so varni
  const safeEvents = events.slice(0, 6);
  const addedSet = new Set(addedEventIds ?? []);

  // W6: brskalni pas — ista varnostna meja (API vrne max 6); praznina ne
  // sproži pasu (iskrenost: ni dogodkov izven datumov → pas ni)
  const safeOutside = (outsideEvents ?? []).slice(0, 6);

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
  // SL: slovenska sklonska fraza (tripDuringPhraseSI); IT/DE: lastni formati
  // (s.yourTripSubtitle + formatEventDate v jeziku sekcije)
  const duringSubtitle = tripStartDate
    ? lang === "sl"
      ? `Tvoja pot je ${tripDuringPhraseSI(tripStartDate, tripEndDate)}`
      : s.yourTripSubtitle(
          formatEventDate(tripStartDate, tripEndDate, lang)
        )
    : null;

  // W6: brskalni pas "Kaj se dogaja izven tvojih datumov" — horizontalni
  // scroll trak kompaktnih kartic + pasovni vstopnični CTA (ISTA G6 pot:
  // /go/tickets?dest=… prek goHref, telemetrija listing_click + strežniški
  // redirect tracking). VAROVALO: datumsko ujemanje ostane PRIMARNO — pas
  // je DODATEN, pod glavno mrežo, in se ne izriše brez podatkov.
  const browseBand = safeOutside.length > 0 && (
    <div
      className="mt-4 border-t border-border/60 pt-4"
      aria-label={s.browseAriaLabel}
    >
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Compass className="size-4 shrink-0 text-primary" aria-hidden="true" />
        {s.browseTitle}
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {s.browseHint}
      </p>
      <div
        className="mt-3 flex snap-x gap-3 overflow-x-auto pb-2"
        role="list"
      >
        {safeOutside.map((event) => (
          <div key={event.id} role="listitem" className="flex">
            <EventBrowseChip event={event} lang={lang} />
          </div>
        ))}
      </div>
      {ticketsHref && (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <a
            href={ticketsHref}
            onClick={() => trackFunnel("listing_click", ticketsHref)}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-primary/40 bg-primary/5 px-4 py-2 text-sm font-medium text-primary transition-colors hover:border-primary/60 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Ticket className="size-4 shrink-0" aria-hidden="true" />
            {s.ticketsCta}
            <span className="text-muted-foreground">· {s.ticketsPartner}</span>
            <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
          </a>
          <p className="text-[11px] leading-snug text-muted-foreground">
            {s.ticketsNote}
          </p>
        </div>
      )}
    </div>
  );

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
        {browseBand}
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
        <CardContent>
          {grid}
          {browseBand}
        </CardContent>
      </Card>
    </section>
  );
}

export default ItineraryEventsSection;
