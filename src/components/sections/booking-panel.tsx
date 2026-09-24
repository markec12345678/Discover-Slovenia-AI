"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { safeExternalHref } from "@/lib/external-url";
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
  TrainFront,
  CarTaxiFront,
  Smartphone,
  ShieldCheck,
  Landmark,
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
import { trackFunnel } from "@/lib/funnel";
import { trackPlannerEvent } from "@/lib/planner-analytics";
import { AffiliateBadge } from "@/components/partner-badge";
import type { DayPlan } from "@/lib/types";

// Partnerske povezave — vse prek /go/ redirecta (strežniško tracking +
// strežniška affiliate konfiguracija). Klient ne drži partner ID-jev.
// dest je opcijsken za nove providerje (esim deluje brez njega).
// TASK 97: "tickets" (Tiqets — vstopnice) dodan k unionu; zavarovanje ima
// lastni izgrajevalnik spodaj (days parameter, ne dest).
const goHref = (
  provider:
    | "hotels"
    | "cars"
    | "activities"
    | "flights"
    | "esim"
    | "transfers"
    | "transport"
    | "tickets",
  dest?: string,
) =>
  dest
    ? `/go/${provider}?dest=${encodeURIComponent(dest)}`
    : `/go/${provider}`;

// TASK 97 — ZAVAROVANJE (World Nomads / SafetyWing): trip-level ponudba z
// `days` parametrom iz dolžine načrta (/go ruta sprejme 1–30; več →
// zaščitenemo na 30). Čista funkcija: brez env, brez window — varna za
// klient in direktno testirljiva. Neveljaven/manjkajoč vnos → parameter
// izpuščen (ruta privzame 7 dni — enako kot homepage kartica).
export function insuranceGoHref(tripDays?: number): string {
  const n = clampInsuranceDays(tripDays);
  return n ? `/go/insurance?days=${n}` : "/go/insurance";
}

/** Days 1–30 (meja /go rute) ali null, če vnos ni uporaben. */
export function clampInsuranceDays(tripDays?: number): number | null {
  if (typeof tripDays !== "number" || !Number.isFinite(tripDays)) return null;
  const rounded = Math.round(tripDays);
  if (rounded < 1) return null;
  return Math.min(rounded, 30);
}

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
  /** HTML id (npr. "booking-panel-1") — gumb "Rezerviraj" v TripTimeline scrolla sem */
  id?: string;
  /** TASK 97: dolžina CELEGA načrta (v dnevih) — za /go/insurance?days=… */
  tripDays?: number;
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

// Povezava za kontakt lastnika — website > email > phone.
// TASK 98 (i18n): vrača labelKey (prevodne ključe), ne besedilo —
// besedilo je odvisno od locale, kartice ga prevedejo prek t().
export type ContactLabelKey = "contactWebsite" | "contactEmail" | "contactPhone";

function getContactLink(listing: BookingListing): {
  href: string;
  labelKey: ContactLabelKey;
} | null {
  if (listing.website)
    return { href: safeExternalHref(listing.website), labelKey: "contactWebsite" };
  if (listing.email)
    return { href: `mailto:${listing.email}`, labelKey: "contactEmail" };
  if (listing.phone)
    return { href: `tel:${listing.phone}`, labelKey: "contactPhone" };
  return null;
}

function getExperienceContact(exp: BookingExperience): {
  href: string;
  labelKey: ContactLabelKey;
} | null {
  if (exp.providerWebsite)
    return { href: safeExternalHref(exp.providerWebsite), labelKey: "contactWebsite" };
  if (exp.providerEmail)
    return { href: `mailto:${exp.providerEmail}`, labelKey: "contactEmail" };
  if (exp.providerPhone)
    return { href: `tel:${exp.providerPhone}`, labelKey: "contactPhone" };
  return null;
}

function getProductContact(p: BookingProduct): {
  href: string;
  labelKey: ContactLabelKey;
} | null {
  if (p.sellerWebsite)
    return { href: safeExternalHref(p.sellerWebsite), labelKey: "contactWebsite" };
  if (p.sellerEmail)
    return { href: `mailto:${p.sellerEmail}`, labelKey: "contactEmail" };
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
  // TASK 98 (i18n): oznaki prevedeni (prej hardcoded SL)
  const t = useTranslations("planner.booking");
  return (
    <div className="flex flex-wrap items-center gap-1">
      {featured && (
        <Badge
          variant="outline"
          className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 gap-1 text-[10px] px-1.5 py-0"
        >
          <Sparkles className="size-3" aria-hidden />
          {t("badgeFeatured")}
        </Badge>
      )}
      {verified && (
        <Badge
          variant="outline"
          className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 gap-1 text-[10px] px-1.5 py-0"
        >
          <BadgeCheck className="size-3" aria-hidden />
          {t("badgeVerified")}
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
  onTrack,
}: {
  href: string;
  icon: React.ReactNode;
  partnerName: string;
  cta: string;
  description: string;
  onTrack?: () => void;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer sponsored"
      onClick={() => {
        // Fire-and-forget funnel tracking — ne blokira navigacije
        onTrack?.();
        // FAZA 4 (pilotna analitika): affiliate_clicked z dejanskim ponudnikom
        // in destinacijo iz /go/ povezave (strežnik dodate zapiše funnel klik;
        // to je produktni kontekst pilota — kateri ponudnik/kraji se uporabljajo)
        try {
          const seg = href.split("/"); // ["", "go", "hotels?dest=Bled"]
          const provider = seg[2]?.split("?")[0] ?? "unknown";
          const dest = new URLSearchParams(href.split("?")[1] ?? "").get("dest");
          trackPlannerEvent("affiliate_clicked", {
            provider,
            dest: dest ?? "none",
            partner_name: partnerName,
          });
        } catch {
          // analitika nikoli ne sme prekiniti navigacije
        }
      }}
      className="group flex items-center gap-3 rounded-lg border border-primary/30 bg-background p-3 transition-all hover:border-primary/60 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <span className="truncate">{partnerName}</span>
          <AffiliateBadge type="generic" size="sm" />
          {/* TASK 97 (mobilni popravek): na <sm ikona skrita — sprosti ~18px
              v vrstici imena (celotna kartica JE povezava, badge "Partner"
              že sporoča zunanjo preusmeritev; "World Nomads" se ni več
              rezal v "World Noma…"). Na sm+ ikona ostane (ob CTA gumbu). */}
          <ExternalLink className="hidden size-3 shrink-0 text-muted-foreground sm:inline-block" aria-hidden />
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
  const t = useTranslations("planner.booking");
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
            onClick={() => {
              // FAZA 4 (pilotna analitika): odpiranje ponudnika (kontakt/obisk)
              trackPlannerEvent("provider_detail_opened", {
                provider: listing.name,
                provider_id: listing.id,
                category: listing.category,
              });
            }}
          >
            {/* TASK 98 (i18n): specifična akcija stika (prej vedno generični
                "Obišči"; label je bil mrtven kode — zdaj dejansko uporabljen) */}
            {t(contact.labelKey)}
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </Button>
      )}
    </div>
  );
}

function ExperienceCard({ exp }: { exp: BookingExperience }) {
  const t = useTranslations("planner.booking");
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
            {t("pricePerPerson", { price: exp.pricePerPerson })}
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
            {t(contact.labelKey)}
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </Button>
      )}
    </div>
  );
}

function ProductCard({ product }: { product: BookingProduct }) {
  const t = useTranslations("planner.booking");
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
                {t("badgeLocal")}
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
            {t(contact.labelKey)}
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
export function BookingPanel({ dayPlan, bookingData, id, tripDays }: BookingPanelProps) {
  // TASK 98 (i18n): VSA besedila površine so prevedena (planner.booking
  // imenski prostor, SL + EN) — prej je bila komponenta SL-hardcoded in
  // so EN uporabniki na /en/nacrtuj videli slovenščino.
  const t = useTranslations("planner.booking");
  const locations = dayPlan.locations;
  // TASK 4 / K-14 (UX FIX PASS): NADZOROVANI zavihki — prej je bil Tabs
  // nekontroliran (defaultValue="accommodation"), zato je klik na gumb
  // "Vstopnice" na kartici postanka odprl NASTANITEV (živi dokaz revizije:
  // Bohinj → plošča je pokazala Booking.com namesto Tiqets/izkušenj).
  // Zdaj: gumb pošlje dogodek `dsa:booking-tab` {panelId, tab}, ta plošča
  // (isti id) preklopi zavihek in scroll ostane pri klicatelju.
  const [tab, setTab] = React.useState<
    "accommodation" | "activities" | "dining" | "transport"
  >("accommodation");
  React.useEffect(() => {
    if (!id) return;
    const onOpenTab = (e: Event) => {
      const detail = (e as CustomEvent<{ panelId?: string; tab?: string }>)
        .detail;
      if (detail?.panelId !== id) return;
      if (
        detail.tab === "accommodation" ||
        detail.tab === "activities" ||
        detail.tab === "dining" ||
        detail.tab === "transport"
      ) {
        setTab(detail.tab);
      }
    };
    document.addEventListener("dsa:booking-tab", onOpenTab);
    return () => document.removeEventListener("dsa:booking-tab", onOpenTab);
  }, [id]);
  // Prva destinacija — za najem avta
  const firstDestination = locations[0];
  // TASK 97: zavarovanje — days iz dolžine načrta (clamp 1–30 v helperju)
  const insuranceDays = clampInsuranceDays(tripDays);
  const insuranceHref = insuranceGoHref(tripDays);
  const insuranceDescription = insuranceDays
    ? t("insuranceDaysDesc", { days: insuranceDays })
    : t("insuranceDesc");

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
    <div
      id={id}
      className="mt-3 scroll-mt-24 rounded-xl border border-primary/20 bg-primary/5 p-4"
    >
      <h4 className="flex items-center gap-2 text-sm font-semibold text-primary">
        <Calendar className="size-4" aria-hidden />
        {t("heading")}
      </h4>
      <p className="mt-0.5 text-xs text-muted-foreground">{t("intro")}</p>

      <Separator className="my-3" />

      <Tabs
        value={tab}
        onValueChange={(v) =>
          setTab(v as "accommodation" | "activities" | "dining" | "transport")
        }
        className="w-full"
      >
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4">
          <TabsTrigger value="accommodation" className="flex flex-col gap-0.5 py-1.5 text-xs sm:flex-row sm:text-sm">
            <span className="flex items-center gap-1">
              <Hotel className="size-3.5" aria-hidden />
              {t("tabAccommodation")}
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
              {t("tabActivities")}
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
              {t("tabDining")}
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
              {t("tabTransport")}
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
                  href={goHref("hotels", loc.destination_name)}
                  icon={<Hotel className="size-5" aria-hidden />}
                  partnerName="Booking.com"
                  cta={t("ctaSearch")}
                  description={t("hotelsDesc", { dest: loc.destination_name })}
                  onTrack={() => trackFunnel("listing_click", goHref("hotels", loc.destination_name))}
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
                    text={t("hotelsEmpty", { dest: loc.destination_name })}
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
                  href={goHref("activities", loc.destination_name)}
                  icon={<Ticket className="size-5" aria-hidden />}
                  partnerName="GetYourGuide"
                  cta={t("ctaSearch")}
                  description={t("activitiesDesc", { dest: loc.destination_name })}
                  onTrack={() => trackFunnel("listing_click", goHref("activities", loc.destination_name))}
                />
                {/* TASK 97 — Tiqets (vstopnice): zadnji manjkajoči partner na
                    glavni booking površini; deluje ČISTO brez poverilnic
                    (/go/tickets → tiqets.com), monetizacija se prižge z
                    TIQETS_AFFILIATE_URL brez spremembe kode. */}
                <AffiliateCard
                  href={goHref("tickets", loc.destination_name)}
                  icon={<Landmark className="size-5" aria-hidden />}
                  partnerName="Tiqets"
                  cta={t("ctaTickets")}
                  description={t("ticketsDesc")}
                  onTrack={() => trackFunnel("listing_click", goHref("tickets", loc.destination_name))}
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
                    text={t("activitiesEmpty", { dest: loc.destination_name })}
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
                        {t("localProducts")}
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
                    text={t("diningEmpty", { dest: loc.destination_name })}
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
                href={goHref("cars", firstDestination.destination_name)}
                icon={<Car className="size-5" aria-hidden />}
                partnerName="DiscoverCars"
                cta={t("ctaRental")}
                description={t("carsDesc", { dest: firstDestination.destination_name })}
                onTrack={() => trackFunnel("listing_click", goHref("cars", firstDestination.destination_name))}
              />
              <AffiliateCard
                href={goHref("transport", "Ljubljana")}
                icon={<TrainFront className="size-5" aria-hidden />}
                partnerName="Omio"
                cta={t("ctaSearch")}
                description={t("trainsDesc")}
                onTrack={() => trackFunnel("listing_click", goHref("transport", "Ljubljana"))}
              />
              <AffiliateCard
                href={`/go/transfers?from=${encodeURIComponent("Ljubljana")}&dest=${encodeURIComponent(firstDestination.destination_name)}`}
                icon={<CarTaxiFront className="size-5" aria-hidden />}
                partnerName="Kiwitaxi"
                cta={t("ctaTransfer")}
                description={t("transferDesc", { dest: firstDestination.destination_name })}
                onTrack={() =>
                  trackFunnel(
                    "listing_click",
                    `/go/transfers?from=${encodeURIComponent("Ljubljana")}&dest=${encodeURIComponent(firstDestination.destination_name)}`,
                  )
                }
              />
              <AffiliateCard
                href={goHref("esim")}
                icon={<Smartphone className="size-5" aria-hidden />}
                partnerName="Airalo"
                cta={t("ctaEsim")}
                description={t("esimDesc")}
                onTrack={() => trackFunnel("listing_click", goHref("esim"))}
              />
              <AffiliateCard
                href={goHref("flights", "Ljubljana")}
                icon={<Plane className="size-5" aria-hidden />}
                partnerName="Skyscanner"
                cta={t("ctaSearch")}
                description={t("flightsDesc")}
                onTrack={() => trackFunnel("listing_click", goHref("flights", "Ljubljana"))}
              />
              {/* TASK 97 — ZAVAROVANJE (World Nomads / SafetyWing): trip-level
                  ponudba z days iz dolžine načrta (/go rute meja 1–30).
                  Čista povezava danes (brez poverilnic); monetizacija se
                  prižge z WORLDNOMADS_AFFILIATE_URL / SAFETYWING_AMBASSADOR_ID. */}
              <AffiliateCard
                href={insuranceHref}
                icon={<ShieldCheck className="size-5" aria-hidden />}
                partnerName="World Nomads"
                cta={t("ctaInsurance")}
                description={insuranceDescription}
                onTrack={() => trackFunnel("listing_click", insuranceHref)}
              />
            </DestinationBlock>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default BookingPanel;
