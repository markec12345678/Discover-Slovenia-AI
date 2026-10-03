"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { localePrefix } from "@/i18n/routing";
import {
  BedDouble,
  TicketCheck,
  Car,
  Ticket,
  Plane,
  ExternalLink,
  MapPin,
  Clock,
  Euro,
  Tag,
  CheckCircle2,
  Sparkles,
  Building2,
  Star,
  ArrowRight,
  Store,
  Compass,
  MapPlus,
  CalendarDays,
  BadgeCheck,
  BookOpen,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { WeatherWidget } from "@/components/sections/weather-widget";
import { ListingModal } from "@/components/sections/listing-modal";
// TASK 8 / D8-D (§3.3): kanonski "Dodaj v mojo pot" — zbirka referenc (ADD sloj)
import { AddToTripButton } from "@/components/add-to-trip-button";
import { trackFunnel } from "@/lib/funnel";
import { REGIONS } from "@/lib/slovenia-data";
import { BEST_FOR_EN, REGIONS_EN } from "@/lib/slovenia-data-en";
import { bestForLabelFor, regionLabelFor } from "@/lib/slovenia-labels-it-de";
import { pick } from "@/lib/i18n-pick";
import { getDestinationProvenance } from "@/lib/destination-provenance";
import {
  CATEGORY_LABELS,
  CATEGORY_ICONS,
  PLAN_LABELS,
  type Listing,
} from "@/lib/listings-types";
import type { Destination, DestinationType } from "@/lib/types";

interface DestinationModalProps {
  destination: Destination | null;
  onClose: () => void;
}

const TYPE_LABELS: Record<DestinationType, string> = {
  lake: "Jezero",
  city: "Mesto",
  mountain: "Gorovje",
  cave: "Jama",
  coast: "Obala",
  river: "Reka",
  spa: "Zdravilišče",
  gorge: "Soteska",
  castle: "Grad",
};

/** W1: tip destinacije po locale (prej SL tudi na EN — P4-8 dres).
 *  W12 (smer 2, faza 1): + fr/es. */
const TYPE_LABELS_BY_LOCALE: Record<
  "sl" | "en" | "it" | "de" | "fr" | "es",
  Record<DestinationType, string>
> = {
  sl: TYPE_LABELS,
  en: {
    lake: "Lake",
    city: "City",
    mountain: "Mountains",
    cave: "Cave",
    coast: "Coast",
    river: "River",
    spa: "Spa",
    gorge: "Gorge",
    castle: "Castle",
  },
  it: {
    lake: "Lago",
    city: "Città",
    mountain: "Montagna",
    cave: "Grotta",
    coast: "Costa",
    river: "Fiume",
    spa: "Terme",
    gorge: "Gola",
    castle: "Castello",
  },
  de: {
    lake: "See",
    city: "Stadt",
    mountain: "Gebirge",
    cave: "Höhle",
    coast: "Küste",
    river: "Fluss",
    spa: "Thermen",
    gorge: "Klamm",
    castle: "Burg",
  },
  fr: {
    lake: "Lac",
    city: "Ville",
    mountain: "Montagne",
    cave: "Grotte",
    coast: "Côte",
    river: "Rivière",
    spa: "Thermes",
    gorge: "Gorges",
    castle: "Château",
  },
  es: {
    lake: "Lago",
    city: "Ciudad",
    mountain: "Montaña",
    cave: "Cueva",
    coast: "Costa",
    river: "Río",
    spa: "Balneario",
    gorge: "Garganta",
    castle: "Castillo",
  },
};

function regionLabel(value: string, locale: string): string {
  // W1: oznaka regije po locale (EN zgodovinsko prek REGIONS_EN na hubu;
  // IT/DE prek slovenia-labels-it-de; fallback SL).
  if (locale === "en") {
    return REGIONS_EN[value] ?? REGIONS.find((r) => r.value === value)?.label ?? value;
  }
  return (
    regionLabelFor(value, locale) ??
    REGIONS.find((r) => r.value === value)?.label ??
    value
  );
}

interface AffiliateCta {
  href: string;
  icon: typeof BedDouble;
  partner: string;
  category: string;
  badge?: string;
  /** ISSUE #4 §7 (val 3): transport CTA-ji — izrecen žeton, da je to
   *  ZUNANJA rezervacija pri partnerju (ne naše iskanje/inventar). */
  externalOnly?: boolean;
}

export function DestinationModal({
  destination,
  onClose,
}: DestinationModalProps) {
  const router = useRouter();
  const locale = useLocale();

  // Lokali v bližini (B2B listings)
  const [nearbyListings, setNearbyListings] = useState<Listing[]>([]);
  const [loadingNearby, setLoadingNearby] = useState<boolean>(false);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);

  // Funnel tracking + gamifikacija ob odprtju modal okna (Slovenia Pass posluša)
  useEffect(() => {
    if (!destination) return;
    trackFunnel("destination_view", destination.id);
    window.dispatchEvent(
      new CustomEvent("destinationViewed", {
        detail: { destinationId: destination.id },
      })
    );
  }, [destination]);

  useEffect(() => {
    if (!destination) {
      setNearbyListings([]);
      setLoadingNearby(false);
      return;
    }
    let cancelled = false;
    const fetchNearby = async () => {
      setLoadingNearby(true);
      try {
        const res = await fetch(
          `/api/listings?destinationId=${encodeURIComponent(
            destination.id
          )}&limit=4&sort=featured`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error("napaka");
        const data: { listings: Listing[]; total: number } = await res.json();
        if (!cancelled) {
          setNearbyListings(data.listings ?? []);
        }
      } catch {
        if (!cancelled) setNearbyListings([]);
      } finally {
        if (!cancelled) setLoadingNearby(false);
      }
    };
    void fetchNearby();
    return () => {
      cancelled = true;
    };
  }, [destination]);

  // Partnerske povezave grejo IZKLJUČNO prek /go/ redirecta (strežniško
  // tracking + strežniška affiliate konfiguracija — klient nikoli ne drži
  // partner ID-jev). AffiliateCta badge z odstotkom provizije je ODSTRANJEN
  // (delež partnerjevega dobička ≠ % cene — zavajajoče).
  const ctas: AffiliateCta[] = destination
    ? [
        {
          href: `/go/hotels?dest=${encodeURIComponent(destination.name)}`,
          icon: BedDouble,
          partner: "Booking.com",
          category: "Hoteli",
        },
        {
          href: `/go/cars?dest=${encodeURIComponent(destination.name)}`,
          icon: Car,
          partner: "DiscoverCars",
          category: "Najem avta",
          externalOnly: true,
        },
        {
          href: `/go/activities?dest=${encodeURIComponent(destination.name)}`,
          icon: Ticket,
          partner: "GetYourGuide",
          category: "Aktivnosti",
        },
        {
          href: `/go/viator?dest=${encodeURIComponent(destination.name)}`,
          icon: Compass,
          partner: "Viator",
          category: "Vodeni izleti",
        },
        {
          href: `/go/flights?dest=${encodeURIComponent(destination.name)}`,
          icon: Plane,
          partner: "Skyscanner",
          category: "Letalske vozovnice",
          externalOnly: true,
        },
        {
          href: `/go/tickets?dest=${encodeURIComponent(destination.name)}`,
          icon: TicketCheck,
          partner: "Tiqets",
          category: "Vstopnice",
        },
      ]
    : [];

  return (
    <Dialog
      open={destination !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {destination ? (
        <DialogContent
          showCloseButton
          className="max-w-3xl gap-0 overflow-hidden p-0 sm:max-w-3xl"
          aria-describedby="destination-modal-desc"
        >
          <DialogTitle className="sr-only">{destination.name}</DialogTitle>
          <DialogDescription id="destination-modal-desc" className="sr-only">
            Podrobnosti destinacije {destination.name}: opis, poudarki,
            aktivnosti, vreme in rezervacijske povezave.
          </DialogDescription>

          {/* Scrollable container za dolgo vsebino */}
          <div className="scroll-area-custom max-h-[80vh] overflow-y-auto">
            {/* Velika slika */}
            <div className="relative aspect-video w-full overflow-hidden bg-muted">
              <img
                src={destination.image}
                alt={`${destination.name} — ${destination.tagline}`}
                className="size-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
                <Badge className="mb-2 bg-primary text-primary-foreground">
                  {regionLabel(destination.region, locale)}
                </Badge>
                <h2 className="text-2xl font-bold sm:text-3xl">
                  {destination.name}
                </h2>
                <p className="text-sm text-white/90">{destination.tagline}</p>
              </div>
            </div>

            {/* Vsebina */}
            <div className="space-y-6 p-5 sm:p-6">
              {/* TASK 8 / D8-D (§3.3, D8-A P-CTA-1): KANONSKI "Dodaj v mojo
                  pot" — destinacijo dodamo v zbirko referenc (ADD sloj,
                  dai:my-trip-items). Modala prej NI imela nobenega dodajanja
                  v pot — samo regeneracijo. Spodnji "Zgradi novo pot" ostaja
                  napredna pot (heroQuery prenos → nova generacija). */}
              <AddToTripButton
                variant="full"
                className="w-full justify-center"
                item={{
                  kind: "destination",
                  refId: destination.slug,
                  title: destination.name,
                  subtitle: regionLabel(destination.region, locale),
                  href: `/destinacija/${encodeURIComponent(destination.slug)}`,
                  image: destination.image,
                  source: "destination-modal",
                }}
              />

              {/* Issue #3 §8 (EXPLORE → "Add to my trip") — prej lažnjujoče
                  ime "Dodaj v mojo pot": gumb NE doda k obstoječemu načrtu,
                  ampak ZGRADI NOVEGA okoli destinacije (heroQuery prenos →
                  nova generacija; živi dokaz revizije K-10). Iskreno ime +
                  še vedno ISTI prenos — NI nove logike. */}
              <Button
                type="button"
                size="lg"
                className="w-full gap-2"
                onClick={() => {
                  if (!destination) return;
                  trackFunnel("listing_click", `/nacrtuj?dest=${destination.id}`);
                  sessionStorage.setItem(
                    "heroQuery",
                    `3-dnevno potovanje z destinacijo ${destination.name} — ${destination.tagline}`
                  );
                  onClose();
                  router.push(`${localePrefix(locale)}/nacrtuj`);
                }}
              >
                <MapPlus className="size-4" aria-hidden="true" />
                Zgradi novo pot okoli {destination.name}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>

              {/* Opis */}
              <p className="text-sm leading-relaxed text-foreground/90">
                {destination.description}
              </p>

              {/* Grid 2x2 info */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
                <InfoItem
                  icon={MapPin}
                  label={pick(locale, { sl: "Regija", en: "Region", it: "Regione", de: "Region", fr: "Région", es: "Región" })}
                  value={regionLabel(destination.region, locale)}
                />
                <InfoItem
                  icon={Tag}
                  label={pick(locale, { sl: "Tip", en: "Type", it: "Tipo", de: "Typ", fr: "Type", es: "Tipo" })}
                  value={
                    TYPE_LABELS_BY_LOCALE[
                      (["sl", "en", "it", "de", "fr", "es"] as const).includes(
                        locale as "sl" | "en" | "it" | "de" | "fr" | "es"
                      )
                        ? (locale as "sl" | "en" | "it" | "de" | "fr" | "es")
                        : "sl"
                    ][destination.type] ?? destination.type
                  }
                />
                <InfoItem
                  icon={Clock}
                  label={pick(locale, { sl: "Trajanje", en: "Duration", it: "Durata", de: "Dauer", fr: "Durée", es: "Duración" })}
                  value={destination.duration}
                />
                <InfoItem
                  icon={Euro}
                  label={pick(locale, { sl: "Ocena obiska", en: "Visit cost", it: "Costo della visita", de: "Besuchskosten", fr: "Coût de la visite", es: "Costo de la visita" })}
                  value={`${destination.costPerPerson} €`}
                />
              </div>

              {/* ISSUE #4 §18 (VAL 7): odpiralni časi, kjer obstajajo —
                  prej jih je pokazal SAMO planner (stop-insights); uporabnik
                  na modalu ni vedel, da znamenitost pozimi morda sploh ni
                  odprta. Vir je prikazan (isti vzorec poštenosti F5.5). */}
              {destination.opening ? (
                <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
                  <p className="flex flex-wrap items-start gap-x-1.5">
                    <CalendarDays
                      className="mt-0.5 size-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <span>
                      <span className="font-medium text-foreground/80">
                        {pick(locale, {
                          sl: "Odpiralni čas",
                          en: "Opening hours",
                          it: "Orari di apertura",
                          de: "Öffnungszeiten",
                          fr: "Horaires d'ouverture",
                          es: "Horario de apertura",
                        })}
                        :
                      </span>{" "}
                      {/* W1: odpiralni note je podatkovna plast SL/EN — za
                          it/de beremo EN različico (referenčni mednarodni
                          jezik platforme; kratko faktografsko polje). */}
                      {locale === "sl"
                        ? destination.opening.note
                        : destination.opening.noteEn}{" "}
                      <span className="text-muted-foreground/80">
                        ({pick(locale, { sl: "vir", en: "source", it: "fonte", de: "Quelle", fr: "source", es: "fuente" })}:{" "}
                        {destination.opening.source})
                      </span>
                    </span>
                  </p>
                </div>
              ) : null}

              {/* Poudarki */}
              <section>
                <SectionTitle icon={Sparkles}>
                  {pick(locale, { sl: "Poudarki", en: "Highlights", it: "Punti forti", de: "Höhepunkte", fr: "Points forts", es: "Puntos destacados" })}
                </SectionTitle>
                <ul className="mt-3 space-y-2">
                  {destination.highlights.map((h) => (
                    <li
                      key={h}
                      className="flex items-start gap-2 text-sm text-foreground/90"
                    >
                      <CheckCircle2
                        className="mt-0.5 size-4 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Aktivnosti */}
              <section>
                <SectionTitle>
                  {pick(locale, { sl: "Aktivnosti", en: "Activities", it: "Attività", de: "Aktivitäten", fr: "Activités", es: "Actividades" })}
                </SectionTitle>
                <div className="mt-3 flex flex-wrap gap-2">
                  {destination.activities.map((a) => (
                    <Badge key={a} variant="secondary" className="text-xs">
                      {a}
                    </Badge>
                  ))}
                </div>
              </section>

              {/* Najboljše za (W1: oznake po locale — prej surovi SL ključi
                  tudi na EN; identifikatorji ostanejo slovenski) */}
              <section>
                <SectionTitle>
                  {pick(locale, { sl: "Najboljše za", en: "Best for", it: "Ideale per", de: "Am besten für", fr: "Idéal pour", es: "Ideal para" })}
                </SectionTitle>
                <div className="mt-3 flex flex-wrap gap-2">
                  {destination.bestFor.map((b) => (
                    <Badge key={b} variant="outline" className="capitalize">
                      {locale === "sl"
                        ? b
                        : locale === "en"
                          ? (BEST_FOR_EN[b] ?? b)
                          : (bestForLabelFor(b, locale) ?? b)}
                    </Badge>
                  ))}
                </div>
              </section>

              {/* Vreme */}
              <WeatherWidget
                lat={destination.coords.lat}
                lng={destination.coords.lng}
                name={destination.name}
              />

              {/* LOKALI V BLIŽINI — B2B listings */}
              <section>
                <SectionTitle icon={Building2}>
                  {pick(locale, { sl: "Lokali v bližini", en: "Places nearby", it: "Luoghi nelle vicinanze", de: "Orte in der Nähe", fr: "Lieux à proximité", es: "Lugares cercanos" })}
                </SectionTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  {pick(locale, {
                    sl: "Hotelir, restavracije in aktivnosti — prijavljeni lastniki.",
                    en: "Hotels, restaurants and activities — registered owners.",
                    it: "Hotel, ristoranti e attività — proprietari registrati.",
                    de: "Hotels, Restaurants und Aktivitäten — registrierte Inhaber.",
                    fr: "Hôtels, restaurants et activités — propriétaires enregistrés.",
                    es: "Hoteles, restaurantes y actividades — propietarios registrados.",
                  })}
                </p>

                {loadingNearby ? (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <NearbySkeleton key={i} />
                    ))}
                  </div>
                ) : nearbyListings.length === 0 ? (
                  <div className="mt-3 rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center">
                    <Store
                      className="mx-auto size-5 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <p className="mt-2 text-sm font-medium">
                      {pick(locale, {
                        sl: "Ni registriranih lokalov v bližini.",
                        en: "No registered places nearby.",
                        it: "Nessun locale registrato nelle vicinanze.",
                        de: "Keine registrierten Orte in der Nähe.",
                        fr: "Aucun lieu enregistré à proximité.",
                        es: "No hay lugares registrados cerca.",
                      })}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {pick(locale, {
                        sl: "Postanite prvi!",
                        en: "Be the first!",
                        it: "Sii il primo!",
                        de: "Sei der Erste!",
                        fr: "Soyez le premier !",
                        es: "¡Sé el primero!",
                      })}
                    </p>
                    <a
                      href="/za-ponudnike#pridruzi-se"
                      onClick={() => onClose()}
                      className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80"
                    >
                      {pick(locale, {
                        sl: "Pridruži se",
                        en: "Join us",
                        it: "Unisciti",
                        de: "Mach mit",
                        fr: "Rejoignez-nous",
                        es: "Únete",
                      })}
                      <ArrowRight className="size-3" aria-hidden="true" />
                    </a>
                  </div>
                ) : (
                  <>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      {nearbyListings.map((l) => (
                        <NearbyListingCard
                          key={l.id}
                          listing={l}
                          onOpen={() => setSelectedListing(l)}
                        />
                      ))}
                    </div>
                    <a
                      href="/lokali"
                      onClick={() => onClose()}
                      className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80"
                    >
                      {pick(locale, {
                        sl: "Vsi lokalci v regiji",
                        en: "All places in the region",
                        it: "Tutti i locali nella regione",
                        de: "Alle Orte in der Region",
                        fr: "Tous les lieux de la région",
                        es: "Todos los lugares de la región",
                      })}
                      <ArrowRight className="size-3.5" aria-hidden="true" />
                    </a>
                  </>
                )}
              </section>

              {/* REZERVACIJSKI CTA */}
              <section className="rounded-xl border border-border/60 bg-muted/30 p-4">
                <h3 className="text-base font-semibold">
                  {pick(locale, {
                    sl: "Rezerviraj direktno",
                    en: "Book directly",
                    it: "Prenota direttamente",
                    de: "Direkt buchen",
                    fr: "Réservez en direct",
                    es: "Reserva directamente",
                  })}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {pick(locale, {
                    sl: "Preverjene partnerske povezave za hitro in varno rezervacijo.",
                    en: "Verified partner links for a fast and secure booking.",
                    it: "Link partner verificati per una prenotazione rapida e sicura.",
                    de: "Geprüfte Partner-Links für schnelle und sichere Buchung.",
                    fr: "Liens partenaires vérifiés pour une réservation rapide et sûre.",
                    es: "Enlaces de socios verificados para una reserva rápida y segura.",
                  })}
                </p>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {ctas.map((cta) => {
                    const Icon = cta.icon;
                    return (
                      <a
                        key={cta.partner}
                        href={cta.href}
                        target="_blank"
                        rel="noopener noreferrer sponsored"
                        onClick={() => {
                          // Fire-and-forget funnel tracking — ne blokira navigacije
                          trackFunnel("listing_click", cta.href);
                        }}
                        className="group flex items-center gap-3 rounded-lg border bg-background p-3 transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <Icon className="size-5" aria-hidden="true" />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="flex items-center gap-2">
                            <span className="font-medium text-sm">
                              {cta.partner}
                            </span>
                            {cta.badge ? (
                              <Badge className="bg-amber-400 text-amber-950 text-[10px] px-1.5 py-0">
                                {cta.badge}
                              </Badge>
                            ) : null}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {cta.category}
                          </span>
                          {cta.externalOnly ? (
                            <span className="mt-1 inline-flex items-center gap-1 text-[10px] leading-none text-muted-foreground">
                              <ExternalLink className="size-3" aria-hidden="true" />
                              {pick(locale, {
                                sl: "Zunanja rezervacija pri ponudniku",
                                en: "External booking with the provider",
                                it: "Prenotazione esterna presso il fornitore",
                                de: "Externe Buchung beim Anbieter",
                                fr: "Réservation externe auprès du prestataire",
                                es: "Reserva externa con el proveedor",
                              })}
                            </span>
                          ) : null}
                        </span>
                        <ExternalLink
                          className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                          aria-hidden="true"
                        />
                      </a>
                    );
                  })}
                </div>

                <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                  {pick(locale, {
                    sl: "Affiliate povezave — podpora projektu brez dodatnih stroškov zate.",
                    en: "Affiliate links — supporting the project at no extra cost to you.",
                    it: "Link affiliate — sostengono il progetto senza costi extra per te.",
                    de: "Affiliate-Links — sie unterstützen das Projekt ohne Mehrkosten für dich.",
                    fr: "Liens affiliés — ils soutiennent le projet sans coût supplémentaire pour vous.",
                    es: "Enlaces de afiliados — apoyan el proyecto sin coste adicional para ti.",
                  })}
                </p>
              </section>

              {/* POLISH 1.173.0: CELOTEN VODNIK — povezava na hub stran
                  destinacije (/destinacija/[slug]; obstaja od TASK 70+
                  z guide/itinerary/things-to-do/best-time podstranmi),
                  a je bila iz raziskovalne poti (katalog → modal) NEOBSTOJEČA
                  (modal vodi samo k partnerjem). Poveže človeško pot IN
                  notranje povezovanje (katalog → 38 hub strani). */}
              <Link
                href={`/destinacija/${encodeURIComponent(destination.slug)}`}
                onClick={() => {
                  trackFunnel("listing_click", `/destinacija/${destination.slug}`);
                  onClose();
                }}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-4 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
              >
                <BookOpen className="size-4" aria-hidden="true" />
                {pick(locale, {
                  sl: `Odpri celoten vodnik: ${destination.name}`,
                  en: `Open the full guide: ${destination.name}`,
                  it: `Apri la guida completa: ${destination.name}`,
                  de: `Den ganzen Guide öffnen: ${destination.name}`,
                  fr: `Ouvrir le guide complet : ${destination.name}`,
                  es: `Abrir la guía completa: ${destination.name}`,
                })}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>

              {/* ISSUE #4 §18 (VAL 7): PROVENANCE NOGA — vir vsebine +
                  "posodobljeno" (uradna stran ↔ uredniška kuracija).
                  Komponenta je SL-vzorčena (P4-8); novi nizi so dvodelni
                  SL/EN prek locale (isti vzorec kot hub stran). */}
              <footer className="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
                <p className="flex flex-wrap items-center gap-x-1.5">
                  <BadgeCheck
                    className="size-3.5 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <span className="font-medium text-foreground/70">
                    {pick(locale, { sl: "Vir", en: "Source", it: "Fonte", de: "Quelle", fr: "Source", es: "Fuente" })}:
                  </span>
                  {(() => {
                    const prov = getDestinationProvenance(destination);
                    if (prov.kind === "official" && prov.sourceUrl) {
                      return (
                        <a
                          href={prov.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
                        >
                          {prov.source}
                          <ExternalLink className="size-3" aria-hidden="true" />
                        </a>
                      );
                    }
                    return (
                      <span>
                        {pick(locale, {
                          sl: "Discover Slovenia — uredniška kuracija",
                          en: "Discover Slovenia editorial curation",
                          it: "Discover Slovenia — curatela editoriale",
                          de: "Discover Slovenia — redaktionelle Kuratierung",
                          fr: "Discover Slovenia — curation éditoriale",
                          es: "Discover Slovenia — curación editorial",
                        })}
                      </span>
                    );
                  })()}
                  <span aria-hidden="true">·</span>
                  <span>
                    {pick(locale, { sl: "posodobljeno", en: "updated", it: "aggiornato", de: "aktualisiert", fr: "mis à jour", es: "actualizado" })}{" "}
                    {getDestinationProvenance(destination).verifiedAt.replaceAll(
                      "-",
                      ". "
                    )}
                  </span>
                </p>
              </footer>
            </div>
          </div>
        </DialogContent>
      ) : null}

      {/* Listing modal za lokal v bližini */}
      <ListingModal
        listing={selectedListing}
        onClose={() => setSelectedListing(null)}
      />
    </Dialog>
  );
}

/**
 * NearbyListingCard — mini-kartica za lokale znotraj DestinationModal.
 * 2x2 grid, slika je manjša (aspect-square), klik odpre ListingModal.
 */
function NearbyListingCard({
  listing,
  onOpen,
}: {
  listing: Listing;
  onOpen: () => void;
}) {
  const image = listing.images[0];
  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={`Odpri podrobnosti za ${listing.name}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group cursor-pointer gap-0 overflow-hidden py-0 transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        {image ? (
          <img
            src={image}
            alt={listing.name}
            loading="lazy"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-muted text-3xl">
            <span aria-hidden="true">
              {CATEGORY_ICONS[listing.category]}
            </span>
          </div>
        )}
        {/* Plan badge */}
        {listing.plan === "enterprise" ? (
          <Badge className="absolute right-2 top-2 bg-primary text-primary-foreground text-[10px] px-1.5 py-0">
            {PLAN_LABELS[listing.plan]}
          </Badge>
        ) : listing.plan === "premium" ? (
          <Badge className="absolute right-2 top-2 bg-amber-400 text-amber-950 text-[10px] px-1.5 py-0">
            {PLAN_LABELS[listing.plan]}
          </Badge>
        ) : null}
      </div>
      <CardContent className="space-y-1.5 p-3">
        <div className="flex items-center gap-1.5">
          <Badge
            variant="secondary"
            className="text-[10px] px-1.5 py-0"
          >
            <span aria-hidden="true">{CATEGORY_ICONS[listing.category]}</span>
            {CATEGORY_LABELS[listing.category]}
          </Badge>
        </div>
        <h4 className="line-clamp-1 text-sm font-semibold leading-tight">
          {listing.name}
        </h4>
        {listing.reviewCount > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Star
              className="size-3 fill-amber-400 text-amber-400"
              aria-hidden="true"
            />
            <span className="font-medium tabular-nums text-foreground">
              {listing.rating.toFixed(1)}
            </span>
            <span>({listing.reviewCount})</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NearbySkeleton() {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <Skeleton className="aspect-square w-full rounded-none" />
      <CardContent className="space-y-2 p-3">
        <Skeleton className="h-3 w-16 rounded-md" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-20" />
      </CardContent>
    </Card>
  );
}

function InfoItem({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
}) {
  return (
    <Card className="gap-0 py-3">
      <CardContent className="px-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="size-3.5" aria-hidden="true" />
          <span className="text-[11px] uppercase tracking-wide">{label}</span>
        </div>
        <div className="mt-1 text-sm font-semibold text-foreground">{value}</div>
      </CardContent>
    </Card>
  );
}

function SectionTitle({
  icon: Icon,
  children,
}: {
  icon?: typeof Sparkles;
  children: React.ReactNode;
}) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold">
      {Icon ? <Icon className="size-4 text-primary" aria-hidden="true" /> : null}
      {children}
    </h3>
  );
}

export default DestinationModal;
