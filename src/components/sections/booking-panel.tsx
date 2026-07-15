"use client";

import * as React from "react";
import {
  Calendar,
  Hotel,
  Ticket,
  UtensilsCrossed,
  Car,
  Plane,
  ExternalLink,
  MapPin,
  Star,
  Clock,
  BadgeCheck,
  Wine,
  ShoppingBasket,
  Users,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

import {
  getBookingUrl,
  getDiscoverCarsUrl,
  getViatorUrl,
  getSkyscannerUrl,
} from "@/lib/affiliate";
import { AffiliateBadge } from "@/components/partner-badge";
import type { DayPlan } from "@/lib/types";

// === LOKALNI TIPI (da ne motimo obstoječih tipov v types.ts) ===
// Zrcalijo API route /api/itinerary/bookings — prijazno za client.
export interface BookingListing {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  destinationId: string | null;
  destinationName: string | null;
  address: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  images: string[];
  plan: string;
  featured: boolean;
  verified: boolean;
  rating: number;
  reviewCount: number;
  priceRange: string;
  specialties: string[];
}

export interface BookingExperience {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  destinationId: string | null;
  destinationName: string | null;
  pricePerPerson: number;
  currency: string;
  durationHours: number;
  minGroupSize: number;
  maxGroupSize: number;
  languages: string[];
  meetingPoint: string | null;
  address: string;
  images: string[];
  providerName: string;
  providerEmail: string | null;
  providerPhone: string | null;
  providerWebsite: string | null;
  featured: boolean;
  verified: boolean;
  rating: number;
  reviewCount: number;
  familyFriendly: boolean;
}

export interface BookingProduct {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  destinationId: string | null;
  destinationName: string | null;
  price: number;
  compareAtPrice: number | null;
  currency: string;
  images: string[];
  organic: boolean;
  handmade: boolean;
  local: boolean;
  vegan: boolean;
  featured: boolean;
  verified: boolean;
  rating: number;
  reviewCount: number;
  sellerName: string;
  sellerEmail: string | null;
  sellerWebsite: string | null;
  shippingFree: boolean;
}

export interface BookingOptions {
  listings: BookingListing[];
  experiences: BookingExperience[];
  products: BookingProduct[];
}

export type BookingData = Record<string, BookingOptions>;

interface BookingPanelProps {
  dayPlan: DayPlan;
  bookingData?: BookingData | null;
}

// "Hotel" kategorije, ki veljajo za nastanitev
const ACCOMMODATION_CATEGORIES = new Set(["hotel", "spa", "other"]);
// Kategorije listingov, ki veljajo za prehrano
const DINING_CATEGORIES = new Set(["restaurant", "bar"]);
// Kategorije izdelkov, ki veljajo za prehrano/vino
const FOOD_PRODUCT_CATEGORIES = new Set(["food", "wine", "honey", "oil"]);

function safeJsonImages(images: string[] | undefined | null): string | undefined {
  if (!images || images.length === 0) return undefined;
  return images[0];
}

// Povezava za kontakt lastnika — website > email > phone
function getContactLink(listing: BookingListing): {
  href: string;
  label: string;
} | null {
  if (listing.website) return { href: listing.website, label: "Spletna stran" };
  if (listing.email) return { href: `mailto:${listing.email}`, label: "Pošlji povpraševanje" };
  if (listing.phone) return { href: `tel:${listing.phone}`, label: "Pokliči" };
  return null;
}

function getExperienceContact(exp: BookingExperience): {
  href: string;
  label: string;
} | null {
  if (exp.providerWebsite)
    return { href: exp.providerWebsite, label: "Spletna stran" };
  if (exp.providerEmail)
    return { href: `mailto:${exp.providerEmail}`, label: "Pošlji povpraševanje" };
  if (exp.providerPhone)
    return { href: `tel:${exp.providerPhone}`, label: "Pokliči" };
  return null;
}

function getProductContact(p: BookingProduct): {
  href: string;
  label: string;
} | null {
  if (p.sellerWebsite) return { href: p.sellerWebsite, label: "Spletna stran" };
  if (p.sellerEmail)
    return { href: `mailto:${p.sellerEmail}`, label: "Pošlji povpraševanje" };
  return null;
}

// === Sub-komponente ===

function DestinationHeading({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <MapPin className="size-3.5" aria-hidden />
      {name}
    </div>
  );
}

function FeaturedVerifiedBadges({
  featured,
  verified,
}: {
  featured: boolean;
  verified: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {featured && (
        <Badge
          variant="outline"
          className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 gap-1 text-[10px] px-1.5 py-0"
        >
          <Sparkles className="size-3" aria-hidden />
          Izpostavljeno
        </Badge>
      )}
      {verified && (
        <Badge
          variant="outline"
          className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 gap-1 text-[10px] px-1.5 py-0"
        >
          <BadgeCheck className="size-3" aria-hidden />
          Preverjeno
        </Badge>
      )}
    </div>
  );
}

function AffiliateCard({
  href,
  icon,
  partnerName,
  cta,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  partnerName: string;
  cta: string;
  description: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer sponsored"
      className="group flex items-center gap-3 rounded-lg border border-primary/30 bg-background p-3 transition-all hover:border-primary/60 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <span className="truncate">{partnerName}</span>
          <AffiliateBadge type="generic" size="sm" />
          <ExternalLink className="size-3 shrink-0 text-muted-foreground" aria-hidden />
        </div>
        <p className="line-clamp-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <span className="hidden shrink-0 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground transition-colors group-hover:bg-primary/90 sm:inline-block">
        {cta}
      </span>
    </a>
  );
}

function ListingCard({ listing }: { listing: BookingListing }) {
  const img = safeJsonImages(listing.images);
  const contact = getContactLink(listing);
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-background p-3">
      <div className="size-12 shrink-0 overflow-hidden rounded-md bg-muted">
        {img ? (
          <img
            src={img}
            alt={listing.name}
            className="size-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <Hotel className="size-5" aria-hidden />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-1">
          <p className="line-clamp-1 text-sm font-semibold">{listing.name}</p>
          {listing.rating > 0 && (
            <span className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
              <Star className="size-3 fill-current" aria-hidden />
              {listing.rating.toFixed(1)}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">
            {listing.priceRange}
          </span>
          <span aria-hidden>·</span>
          <span className="line-clamp-1">{listing.address}</span>
        </div>
        <div className="mt-1.5">
          <FeaturedVerifiedBadges featured={listing.featured} verified={listing.verified} />
        </div>
      </div>
      {contact && (
        <Button
          asChild
          size="sm"
          variant="outline"
          className="shrink-0"
        >
          <a
            href={contact.href}
            target={contact.href.startsWith("http") ? "_blank" : undefined}
            rel={contact.href.startsWith("http") ? "noopener noreferrer" : undefined}
          >
            Obišči
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </Button>
      )}
    </div>
  );
}

function ExperienceCard({ exp }: { exp: BookingExperience }) {
  const img = safeJsonImages(exp.images);
  const contact = getExperienceContact(exp);
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-background p-3">
      <div className="size-12 shrink-0 overflow-hidden rounded-md bg-muted">
        {img ? (
          <img
            src={img}
            alt={exp.name}
            className="size-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <Ticket className="size-5" aria-hidden />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-1">
          <p className="line-clamp-1 text-sm font-semibold">{exp.name}</p>
          {exp.rating > 0 && (
            <span className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
              <Star className="size-3 fill-current" aria-hidden />
              {exp.rating.toFixed(1)}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-0.5">
            <Clock className="size-3" aria-hidden />
            {exp.durationHours}h
          </span>
          <span aria-hidden>·</span>
          <span className="flex items-center gap-0.5">
            <Users className="size-3" aria-hidden />
            {exp.minGroupSize}-{exp.maxGroupSize}
          </span>
          <span aria-hidden>·</span>
          <span className="font-semibold text-foreground/80">
            €{exp.pricePerPerson}/osebo
          </span>
        </div>
        <div className="mt-1.5">
          <FeaturedVerifiedBadges featured={exp.featured} verified={exp.verified} />
        </div>
      </div>
      {contact && (
        <Button asChild size="sm" variant="outline" className="shrink-0">
          <a
            href={contact.href}
            target={contact.href.startsWith("http") ? "_blank" : undefined}
            rel={contact.href.startsWith("http") ? "noopener noreferrer" : undefined}
          >
            Obišči
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </Button>
      )}
    </div>
  );
}

function ProductCard({ product }: { product: BookingProduct }) {
  const img = safeJsonImages(product.images);
  const contact = getProductContact(product);
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-background p-3">
      <div className="size-12 shrink-0 overflow-hidden rounded-md bg-muted">
        {img ? (
          <img
            src={img}
            alt={product.name}
            className="size-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <ShoppingBasket className="size-5" aria-hidden />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-1">
          <p className="line-clamp-1 text-sm font-semibold">{product.name}</p>
          <span className="shrink-0 text-xs font-semibold text-foreground/80">
            €{product.price.toFixed(2)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="line-clamp-1">{product.sellerName}</span>
          {product.local && (
            <>
              <span aria-hidden>·</span>
              <Badge
                variant="outline"
                className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px] px-1.5 py-0"
              >
                Lokalno
              </Badge>
            </>
          )}
        </div>
        <div className="mt-1.5">
          <FeaturedVerifiedBadges featured={product.featured} verified={product.verified} />
        </div>
      </div>
      {contact && (
        <Button asChild size="sm" variant="outline" className="shrink-0">
          <a
            href={contact.href}
            target={contact.href.startsWith("http") ? "_blank" : undefined}
            rel={contact.href.startsWith("http") ? "noopener noreferrer" : undefined}
          >
            Obišči
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </Button>
      )}
    </div>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed bg-background/50 py-6 text-center">
      <div className="text-muted-foreground">{icon}</div>
      <p className="max-w-[280px] text-xs text-muted-foreground">{text}</p>
    </div>
  );
}

function DestinationBlock({
  destinationName,
  children,
}: {
  destinationName: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <DestinationHeading name={destinationName} />
      <div className="space-y-2">{children}</div>
    </div>
  );
}

// === Glavna komponenta ===
export function BookingPanel({ dayPlan, bookingData }: BookingPanelProps) {
  const locations = dayPlan.locations;
  // Prva destinacija — za najem avta
  const firstDestination = locations[0];

  // Filtriraj listings po kategorijah za posamezen tab
  function getAccommodationListings(destId: string): BookingListing[] {
    const data = bookingData?.[destId];
    if (!data) return [];
    return data.listings.filter((l) => ACCOMMODATION_CATEGORIES.has(l.category));
  }
  function getDiningListings(destId: string): BookingListing[] {
    const data = bookingData?.[destId];
    if (!data) return [];
    return data.listings.filter((l) => DINING_CATEGORIES.has(l.category));
  }
  function getExperiences(destId: string): BookingExperience[] {
    return bookingData?.[destId]?.experiences ?? [];
  }
  function getFoodProducts(destId: string): BookingProduct[] {
    const data = bookingData?.[destId];
    if (!data) return [];
    return data.products.filter((p) => FOOD_PRODUCT_CATEGORIES.has(p.category));
  }

  // Preštej vsebino v vsakem tabu za prikaz številk v triggerjih
  const accommodationCount = locations.reduce(
    (sum, l) => sum + getAccommodationListings(l.destination_id).length,
    0
  );
  const activitiesCount = locations.reduce(
    (sum, l) => sum + getExperiences(l.destination_id).length,
    0
  );
  const diningCount = locations.reduce(
    (sum, l) =>
      sum +
      getDiningListings(l.destination_id).length +
      getFoodProducts(l.destination_id).length,
    0
  );

  return (
    <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-primary">
        <Calendar className="size-4" aria-hidden />
        Rezerviraj ta dan
      </h4>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Nastanitev, aktivnosti, prehrano in transport rezerviraj neposredno prek
        naših partnerjev ali lokalnih ponudnikov.
      </p>

      <Separator className="my-3" />

      <Tabs defaultValue="accommodation" className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4">
          <TabsTrigger value="accommodation" className="flex flex-col gap-0.5 py-1.5 text-xs sm:flex-row sm:text-sm">
            <span className="flex items-center gap-1">
              <Hotel className="size-3.5" aria-hidden />
              Nastanitev
            </span>
            {accommodationCount > 0 && (
              <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                {accommodationCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="activities" className="flex flex-col gap-0.5 py-1.5 text-xs sm:flex-row sm:text-sm">
            <span className="flex items-center gap-1">
              <Ticket className="size-3.5" aria-hidden />
              Aktivnosti
            </span>
            {activitiesCount > 0 && (
              <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                {activitiesCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="dining" className="flex flex-col gap-0.5 py-1.5 text-xs sm:flex-row sm:text-sm">
            <span className="flex items-center gap-1">
              <UtensilsCrossed className="size-3.5" aria-hidden />
              Hrana
            </span>
            {diningCount > 0 && (
              <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                {diningCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="transport" className="flex flex-col gap-0.5 py-1.5 text-xs sm:flex-row sm:text-sm">
            <span className="flex items-center gap-1">
              <Car className="size-3.5" aria-hidden />
              Transport
            </span>
          </TabsTrigger>
        </TabsList>

        {/* === NASTANITEV === */}
        <TabsContent value="accommodation" className="mt-3 space-y-4">
          {locations.map((loc) => {
            const listings = getAccommodationListings(loc.destination_id);
            return (
              <DestinationBlock
                key={`acc-${loc.destination_id}`}
                destinationName={loc.destination_name}
              >
                <AffiliateCard
                  href={getBookingUrl(loc.destination_name)}
                  icon={<Hotel className="size-5" aria-hidden />}
                  partnerName="Booking.com"
                  cta="Iskanje"
                  description={`Iskanje hotelov in apartmajev v ${loc.destination_name}`}
                />
                {listings.length > 0 ? (
                  <div className="space-y-2">
                    {listings.map((l) => (
                      <ListingCard key={l.id} listing={l} />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={<Hotel className="size-5" aria-hidden />}
                    text={`V bazi še ni hotelov za ${loc.destination_name}. Rezervirajte prek Booking.com zgoraj.`}
                  />
                )}
              </DestinationBlock>
            );
          })}
        </TabsContent>

        {/* === AKTIVNOSTI === */}
        <TabsContent value="activities" className="mt-3 space-y-4">
          {locations.map((loc) => {
            const exps = getExperiences(loc.destination_id);
            return (
              <DestinationBlock
                key={`act-${loc.destination_id}`}
                destinationName={loc.destination_name}
              >
                <AffiliateCard
                  href={getViatorUrl(loc.destination_name)}
                  icon={<Ticket className="size-5" aria-hidden />}
                  partnerName="Viator"
                  cta="Iskanje"
                  description={`Oglejte si vodene ture in izkušnje v ${loc.destination_name}`}
                />
                {exps.length > 0 ? (
                  <div className="space-y-2">
                    {exps.map((e) => (
                      <ExperienceCard key={e.id} exp={e} />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={<Ticket className="size-5" aria-hidden />}
                    text={`V bazi še ni izkušenj za ${loc.destination_name}. Poiščite aktivnosti na Viator zgoraj.`}
                  />
                )}
              </DestinationBlock>
            );
          })}
        </TabsContent>

        {/* === HRANA === */}
        <TabsContent value="dining" className="mt-3 space-y-4">
          {locations.map((loc) => {
            const diningListings = getDiningListings(loc.destination_id);
            const foodProducts = getFoodProducts(loc.destination_id);
            const hasAnything =
              diningListings.length > 0 || foodProducts.length > 0;
            return (
              <DestinationBlock
                key={`din-${loc.destination_id}`}
                destinationName={loc.destination_name}
              >
                {diningListings.length > 0 && (
                  <div className="space-y-2">
                    {diningListings.map((l) => (
                      <ListingCard key={l.id} listing={l} />
                    ))}
                  </div>
                )}
                {foodProducts.length > 0 && (
                  <>
                    {diningListings.length > 0 && (
                      <div className="flex items-center gap-1.5 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <Wine className="size-3.5" aria-hidden />
                        Lokalni izdelki
                      </div>
                    )}
                    <div className="space-y-2">
                      {foodProducts.map((p) => (
                        <ProductCard key={p.id} product={p} />
                      ))}
                    </div>
                  </>
                )}
                {!hasAnything && (
                  <EmptyState
                    icon={<UtensilsCrossed className="size-5" aria-hidden />}
                    text={`V bazi še ni restavrac ali lokalnih izdelkov za ${loc.destination_name}.`}
                  />
                )}
              </DestinationBlock>
            );
          })}
        </TabsContent>

        {/* === TRANSPORT === */}
        <TabsContent value="transport" className="mt-3 space-y-4">
          {firstDestination && (
            <DestinationBlock destinationName={firstDestination.destination_name}>
              <AffiliateCard
                href={getDiscoverCarsUrl(firstDestination.destination_name)}
                icon={<Car className="size-5" aria-hidden />}
                partnerName="DiscoverCars"
                cta="Najem"
                description={`Najem avta v ${firstDestination.destination_name} — prilagodljivi datumi prevzema`}
              />
              <AffiliateCard
                href={getSkyscannerUrl("Ljubljana")}
                icon={<Plane className="size-5" aria-hidden />}
                partnerName="Skyscanner"
                cta="Iskanje"
                description="Leti do Ljubljane (letališče Jožeta Pučnika) — primerjava cen"
              />
            </DestinationBlock>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default BookingPanel;
