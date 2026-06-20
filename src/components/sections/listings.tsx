"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Star,
  MapPin,
  Clock,
  Globe,
  ExternalLink,
  CheckCircle2,
  Building2,
  Filter,
  X,
  ArrowRight,
  Store,
  Sparkles,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { DESTINATIONS } from "@/lib/slovenia-data";
import {
  CATEGORY_LABELS,
  CATEGORY_ICONS,
  PLAN_LABELS,
  type Listing,
  type ListingCategory,
  type ListingPlan,
} from "@/lib/listings-types";
import { ListingModal } from "@/components/sections/listing-modal";

const ALL_VALUE = "all";

// Možnosti za filter kategorije
const CATEGORY_OPTIONS: { value: ListingCategory; label: string }[] = (
  Object.keys(CATEGORY_LABELS) as ListingCategory[]
).map((c) => ({ value: c, label: CATEGORY_LABELS[c] }));

// Možnosti za filter destinacije
const DESTINATION_OPTIONS = DESTINATIONS.map((d) => ({
  value: d.id,
  label: d.name,
}));

// Možnosti za sortiranje
const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "featured", label: "Izpostavljeni" },
  { value: "rating", label: "Najvišja ocena" },
  { value: "newest", label: "Najnovejši" },
];

type ListingsResponse = {
  listings: Listing[];
  total: number;
};

/**
 * ListingsSection — javni prikaz vseh lokalov (B2B monetizacija).
 * Filtri: kategorija, destinacija, sortiranje.
 * Kartice vizualno razlikujejo pakete (free / premium / enterprise).
 */
export function ListingsSection() {
  const [category, setCategory] = useState<string>(ALL_VALUE);
  const [destinationId, setDestinationId] = useState<string>(ALL_VALUE);
  const [sort, setSort] = useState<string>("featured");

  const [listings, setListings] = useState<Listing[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Listing | null>(null);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (category !== ALL_VALUE) params.set("category", category);
      if (destinationId !== ALL_VALUE)
        params.set("destinationId", destinationId);
      params.set("sort", sort);
      params.set("limit", "50");

      const res = await fetch(`/api/listings?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Napaka pri pridobivanju lokalov");
      const data: ListingsResponse = await res.json();
      setListings(data.listings ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      console.error("[listings] fetch napaka:", err);
      setError("Ne morem naložiti lokalov. Poskusite kasneje.");
      setListings([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [category, destinationId, sort]);

  useEffect(() => {
    void fetchListings();
  }, [fetchListings]);

  const hasActiveFilters =
    category !== ALL_VALUE ||
    destinationId !== ALL_VALUE ||
    sort !== "featured";

  const clearFilters = () => {
    setCategory(ALL_VALUE);
    setDestinationId(ALL_VALUE);
    setSort("featured");
  };

  return (
    <section
      id="lokali"
      className="scroll-mt-20 bg-background py-16 sm:py-20"
      aria-labelledby="lokali-title"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <Badge
            variant="secondary"
            className="mb-3 gap-1.5 bg-primary/10 text-primary"
          >
            <Store className="size-3.5" aria-hidden="true" />
            B2B imenik
          </Badge>
          <h2
            id="lokali-title"
            className="text-3xl font-bold tracking-tight sm:text-4xl"
          >
            Lokali v Sloveniji
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            Hotelir, restavracije in aktivnosti — neposredno od lastnikov
          </p>
        </div>

        {/* Filter vrstica */}
        <div className="mt-8 rounded-xl border border-border/60 bg-muted/20 p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Filter className="size-4 text-primary" aria-hidden="true" />
              Filtri
            </div>
            {hasActiveFilters ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" aria-hidden="true" />
                Počisti filtre
              </Button>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FilterSelect
              value={category}
              onChange={setCategory}
              placeholder="Vse kategorije"
              ariaLabel="Filtriraj po kategoriji"
              options={CATEGORY_OPTIONS}
            />
            <FilterSelect
              value={destinationId}
              onChange={setDestinationId}
              placeholder="Vse destinacije"
              ariaLabel="Filtriraj po destinaciji"
              options={DESTINATION_OPTIONS}
            />
            <FilterSelect
              value={sort}
              onChange={setSort}
              placeholder="Razvrsti po"
              ariaLabel="Razvrsti lokale"
              options={SORT_OPTIONS}
              showAllOption={false}
            />
          </div>
        </div>

        {/* Števec */}
        <p className="mt-5 text-sm text-muted-foreground">
          {loading ? (
            "Nalagam lokale..."
          ) : (
            <>
              Prikazujem{" "}
              <span className="font-semibold text-foreground">{total}</span>{" "}
              {total === 1 ? "lokal" : total < 5 ? "lokale" : "lokalov"}
            </>
          )}
        </p>

        {/* Grid */}
        {loading ? (
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <ListingSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <div className="mt-6 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-destructive/40 bg-destructive/5 px-6 py-16 text-center">
            <p className="text-base font-medium text-destructive">{error}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void fetchListings()}
            >
              Poskusi znova
            </Button>
          </div>
        ) : listings.length === 0 ? (
          <EmptyState
            canClear={hasActiveFilters}
            onClear={clearFilters}
          />
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((l) => (
              <ListingCard
                key={l.id}
                listing={l}
                onOpen={() => setSelected(l)}
              />
            ))}
          </div>
        )}

        {/* Footer note — monetizacijski CTA */}
        <div className="mt-10 flex flex-col items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-6 text-center sm:flex-row sm:gap-4">
          <Building2
            className="size-5 text-primary"
            aria-hidden="true"
          />
          <p className="text-sm text-foreground/90">
            Želite biti tukaj? Pridruži se in izpostavite svoj lokal.
          </p>
          <a
            href="#pridruzi-se"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-colors hover:text-primary/80"
          >
            Pridruži se
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </a>
        </div>
      </div>

      {/* Modal */}
      <ListingModal listing={selected} onClose={() => setSelected(null)} />
    </section>
  );
}

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
  showAllOption = true,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  ariaLabel: string;
  options: FilterOption[];
  showAllOption?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={ariaLabel} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {showAllOption ? (
          <SelectItem value={ALL_VALUE}>{placeholder}</SelectItem>
        ) : null}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * ListingCard — kartica lokala z različnim stylingom glede na plan.
 * - Free: navadna siva kartica
 * - Premium: zeleni rob + amber "★ Premium" badge
 * - Enterprise: debelejši zeleni rob + shadow + scale + primary badge
 */
function ListingCard({
  listing,
  onOpen,
}: {
  listing: Listing;
  onOpen: () => void;
}) {
  const planStyles = getPlanCardStyles(listing.plan);
  const image = listing.images[0];
  const location = [listing.destinationName, listing.address]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card
      className={cn(
        "group relative gap-0 overflow-hidden py-0 transition-all hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        planStyles.card
      )}
    >
      {/* Slika */}
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {image ? (
          <img
            src={image}
            alt={`${listing.name} — ${listing.description}`}
            loading="lazy"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-muted text-4xl">
            <span aria-hidden="true">
              {CATEGORY_ICONS[listing.category]}
            </span>
          </div>
        )}

        {/* Badge kategorije (top-left) */}
        <Badge className="absolute left-3 top-3 bg-background/90 text-foreground backdrop-blur-sm">
          <span aria-hidden="true">{CATEGORY_ICONS[listing.category]}</span>
          {CATEGORY_LABELS[listing.category]}
        </Badge>

        {/* Plan / featured badge (top-right) */}
        {planStyles.badge}

        {/* Verified badge (bottom-left) */}
        {listing.verified ? (
          <Badge className="absolute bottom-3 left-3 bg-primary text-primary-foreground">
            <CheckCircle2 className="size-3" aria-hidden="true" />
            Overjeno
          </Badge>
        ) : null}
      </div>

      {/* Body */}
      <CardContent className="flex flex-col gap-3 p-4">
        <div>
          <h3 className="text-lg font-semibold leading-tight">
            {listing.name}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
            {listing.description}
          </p>
        </div>

        {/* Rating */}
        <div className="flex items-center gap-1.5">
          <Star
            className="size-4 fill-amber-400 text-amber-400"
            aria-hidden="true"
          />
          <span className="text-sm font-medium tabular-nums">
            {listing.rating.toFixed(1)}
          </span>
          <span className="text-xs text-muted-foreground">
            ({listing.reviewCount})
          </span>
        </div>

        {/* Lokacija */}
        {location ? (
          <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <MapPin
              className="mt-0.5 size-3.5 shrink-0"
              aria-hidden="true"
            />
            <span className="line-clamp-1">{location}</span>
          </div>
        ) : null}

        {/* Cena + odpiralni čas */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {listing.priceRange ? (
            <Badge variant="secondary" className="font-medium">
              {listing.priceRange}
            </Badge>
          ) : null}
          {listing.openingHours ? (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Clock className="size-3" aria-hidden="true" />
              <span className="line-clamp-1">{listing.openingHours}</span>
            </span>
          ) : null}
        </div>

        {/* Specialties */}
        {listing.specialties.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {listing.specialties.slice(0, 3).map((s) => (
              <span
                key={s}
                className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                {s}
              </span>
            ))}
          </div>
        ) : null}

        {/* CTA */}
        <div className="mt-1 flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1 justify-center"
            onClick={onOpen}
          >
            Podrobnosti
          </Button>
          {listing.website ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              asChild
              className="text-primary hover:bg-primary/10 hover:text-primary"
            >
              <a
                href={listing.website}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Spletna stran ${listing.name}`}
              >
                <Globe className="size-4" aria-hidden="true" />
                <span className="sr-only">Spletna stran</span>
                <ExternalLink className="size-3" aria-hidden="true" />
              </a>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function getPlanCardStyles(plan: ListingPlan): {
  card: string;
  badge: React.ReactNode;
} {
  if (plan === "enterprise") {
    return {
      card: "border-2 border-primary shadow-lg scale-[1.02]",
      badge: (
        <Badge className="absolute right-3 top-3 bg-primary text-primary-foreground shadow-sm">
          <Sparkles className="size-3" aria-hidden="true" />
          {PLAN_LABELS[plan]}
        </Badge>
      ),
    };
  }
  if (plan === "premium") {
    return {
      card: "border-primary",
      badge: (
        <Badge className="absolute right-3 top-3 bg-amber-400 text-amber-950 shadow-sm">
          ★ {PLAN_LABELS[plan]}
        </Badge>
      ),
    };
  }
  // free
  return {
    card: "bg-muted/20",
    badge: null,
  };
}

function ListingSkeleton() {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <Skeleton className="aspect-video w-full rounded-none" />
      <CardContent className="space-y-3 p-4">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-12 rounded-md" />
          <Skeleton className="h-6 w-20 rounded-md" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 flex-1 rounded-md" />
          <Skeleton className="h-8 w-10 rounded-md" />
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({
  canClear,
  onClear,
}: {
  canClear: boolean;
  onClear: () => void;
}) {
  return (
    <div className="mt-6 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Store className="size-6 text-muted-foreground" aria-hidden="true" />
      </span>
      <p className="text-base font-medium">Ni lokalov za izbrane filtre.</p>
      <p className="text-sm text-muted-foreground">
        Poskusite spremeniti filtre ali jih počistiti.
      </p>
      {canClear ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onClear}
          className="mt-2 gap-1.5"
        >
          <X className="size-3.5" aria-hidden="true" />
          Počisti filtre
        </Button>
      ) : null}
    </div>
  );
}

export default ListingsSection;
