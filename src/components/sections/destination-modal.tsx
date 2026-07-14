"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BedDouble,
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
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { WeatherWidget } from "@/components/sections/weather-widget";
import { ListingModal } from "@/components/sections/listing-modal";
import { getAffiliateLinks, COMMISSION_INFO } from "@/lib/affiliate";
import { REGIONS } from "@/lib/slovenia-data";
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

function regionLabel(value: string): string {
  return REGIONS.find((r) => r.value === value)?.label ?? value;
}

interface AffiliateCta {
  href: string;
  icon: typeof BedDouble;
  partner: string;
  category: string;
  badge?: string;
}

export function DestinationModal({
  destination,
  onClose,
}: DestinationModalProps) {
  // Pripravi affiliate povezave samo, ko imamo destinacijo
  const links = useMemo(
    () => (destination ? getAffiliateLinks(destination.name) : null),
    [destination]
  );

  // Lokali v bližini (B2B listings)
  const [nearbyListings, setNearbyListings] = useState<Listing[]>([]);
  const [loadingNearby, setLoadingNearby] = useState<boolean>(false);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);

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

  const ctas: AffiliateCta[] = links
    ? [
        {
          href: links.hotels,
          icon: BedDouble,
          partner: "Booking.com",
          category: "Hoteli",
        },
        {
          href: links.cars,
          icon: Car,
          partner: "DiscoverCars",
          category: "Najem avta",
          badge: `${COMMISSION_INFO.cars.rate} provizija`,
        },
        {
          href: links.activities,
          icon: Ticket,
          partner: "Viator",
          category: "Aktivnosti",
        },
        {
          href: links.flights,
          icon: Plane,
          partner: "Skyscanner",
          category: "Letalske vozovnice",
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
                  {regionLabel(destination.region)}
                </Badge>
                <h2 className="text-2xl font-bold sm:text-3xl">
                  {destination.name}
                </h2>
                <p className="text-sm text-white/90">{destination.tagline}</p>
              </div>
            </div>

            {/* Vsebina */}
            <div className="space-y-6 p-5 sm:p-6">
              {/* Opis */}
              <p className="text-sm leading-relaxed text-foreground/90">
                {destination.description}
              </p>

              {/* Grid 2x2 info */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
                <InfoItem
                  icon={MapPin}
                  label="Regija"
                  value={regionLabel(destination.region)}
                />
                <InfoItem
                  icon={Tag}
                  label="Tip"
                  value={TYPE_LABELS[destination.type]}
                />
                <InfoItem
                  icon={Clock}
                  label="Trajanje"
                  value={destination.duration}
                />
                <InfoItem
                  icon={Euro}
                  label="Ocena obiska"
                  value={`${destination.costPerPerson} €`}
                />
              </div>

              {/* Poudarki */}
              <section>
                <SectionTitle icon={Sparkles}>Poudarki</SectionTitle>
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
                <SectionTitle>Aktivnosti</SectionTitle>
                <div className="mt-3 flex flex-wrap gap-2">
                  {destination.activities.map((a) => (
                    <Badge key={a} variant="secondary" className="text-xs">
                      {a}
                    </Badge>
                  ))}
                </div>
              </section>

              {/* Najboljše za */}
              <section>
                <SectionTitle>Najboljše za</SectionTitle>
                <div className="mt-3 flex flex-wrap gap-2">
                  {destination.bestFor.map((b) => (
                    <Badge key={b} variant="outline" className="capitalize">
                      {b}
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
                <SectionTitle icon={Building2}>Lokali v bližini</SectionTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Hotelir, restavracije in aktivnosti — prijavljeni lastniki.
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
                      Ni registriranih lokalov v bližini.
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Postanite prvi!
                    </p>
                    <a
                      href="#pridruzi-se"
                      onClick={() => onClose()}
                      className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80"
                    >
                      Pridruži se
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
                      href="#lokali"
                      onClick={() => onClose()}
                      className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80"
                    >
                      Vsi lokalci v regiji
                      <ArrowRight className="size-3.5" aria-hidden="true" />
                    </a>
                  </>
                )}
              </section>

              {/* REZERVACIJSKI CTA */}
              <section className="rounded-xl border border-border/60 bg-muted/30 p-4">
                <h3 className="text-base font-semibold">Rezerviraj direktno</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Preverjene partnerske povezave za hitro in varno rezervacijo.
                </p>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {ctas.map((cta) => {
                    const Icon = cta.icon;
                    return (
                      <a
                        key={cta.partner}
                        href={cta.href}
                        target="_blank"
                        rel="noopener noreferrer"
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
                  Affiliate povezave — podpora projektu brez dodatnih stroškov
                  za vas.
                </p>
              </section>
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
