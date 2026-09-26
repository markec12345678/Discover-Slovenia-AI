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
import { PartnerBadge, type PartnerStatus } from "@/components/partner-badge";
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
// TASK 8 / D8-D (§3.3): kanonski "Dodaj v mojo pot" tudi na kartici lokala
import { AddToTripButton } from "@/components/add-to-trip-button";
// TASK 8 / F3-B (D8-A P-STATE-2): družina stanj — LoadingState (hardcoded
// „Nalagam lokale..." → L-pattern SL/EN), EmptyState (lokalni klon
// poenoten) in ErrorState (črtkasta destructivna škatla → Alert
// slovnica + ponovitev). 6× ListingSkeleton mreža ostaja (dobro hotena).
import { LoadingState } from "@/components/states/loading-state";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { useLocale } from "next-intl";

const ALL_VALUE = "all";

// TASK 8 / F3-B: oznaka nalaganja v L-pattern (SL/EN — D8-A §13 „Nalagam…"
// uhodi so trdi predpogoj za F3-E EN razširitev).
// TASK 8 / F4-D (issue #8 Faza 4 / F3-E): CEL UI krom površine je zdaj v
// L-pattern (glava, filtri, števec, EmptyState/ErrorState nizi klicatelja,
// kartica, noga). Meja: PODATkovna plast (ime/opis lokala, specialitete,
// odpiralni čas, naslov) prihaja iz /api/listings, ki (še) ne podpira
// parametra `lang` — UI ostaja dvojezičen, vsebina kartic pa sledi jeziku
// podatkov (dokumentirano v worklogu; API je izven lastništva naloge).
const L = {
  loadingListings: { sl: "Nalagam lokale …", en: "Loading venues …" },
  badge: { sl: "B2B imenik", en: "B2B directory" },
  title: { sl: "Lokali v Sloveniji", en: "Venues in Slovenia" },
  subtitle: {
    sl: "Hotelir, restavracije in aktivnosti — neposredno od lastnikov",
    en: "Hotels, restaurants and activities — directly from the owners",
  },
  filters: { sl: "Filtri", en: "Filters" },
  clearFilters: { sl: "Počisti filtre", en: "Clear filters" },
  allCategories: { sl: "Vse kategorije", en: "All categories" },
  filterByCategory: {
    sl: "Filtriraj po kategoriji",
    en: "Filter by category",
  },
  allDestinations: { sl: "Vse destinacije", en: "All destinations" },
  filterByDestination: {
    sl: "Filtriraj po destinaciji",
    en: "Filter by destination",
  },
  sortBy: { sl: "Razvrsti po", en: "Sort by" },
  sortAria: { sl: "Razvrsti lokale", en: "Sort venues" },
  // Števec: beseda + oblikovana številka + samostalnik (ista vizualna
  // struktura kot prej — SL dvojina/množina, EN preprosta množina).
  showing: { sl: "Prikazujem", en: "Showing" },
  venueOne: { sl: "lokal", en: "venue" },
  venueFew: { sl: "lokale", en: "venues" },
  venueMany: { sl: "lokalov", en: "venues" },
  error: {
    sl: "Ne morem naložiti lokalov. Poskusite kasneje.",
    en: "Cannot load venues. Please try again later.",
  },
  emptyTitle: {
    sl: "Ni lokalov za izbrane filtre.",
    en: "No venues match your filters.",
  },
  emptyDescription: {
    sl: "Poskusite spremeniti filtre ali jih počistiti.",
    en: "Try changing or clearing the filters.",
  },
  footerNote: {
    sl: "Želite biti tukaj? Pridruži se in izpostavite svoj lokal.",
    en: "Want to be listed here? Join us and feature your venue.",
  },
  joinCta: { sl: "Pridruži se", en: "Join us" },
  details: { sl: "Podrobnosti", en: "Details" },
  websiteSr: { sl: "Spletna stran", en: "Website" },
  websiteAria: {
    sl: "Spletna stran",
    en: "Website of",
  },
  sort: {
    featured: { sl: "Izpostavljeni", en: "Featured" },
    rating: { sl: "Najvišja ocena", en: "Top rated" },
    newest: { sl: "Najnovejši", en: "Newest" },
  },
} as const;

// TASK 8 / F4-D: EN oznake kategorij lokalov (zrcali CATEGORY_LABELS iz
// listings-types.ts — skupna lib ostaja SL lastnina lastniškega portala,
// prevod živi ob javni površini, enak vzorec kot EVENT_CATEGORY_LABELS_EN).
const CATEGORY_LABELS_EN: Record<ListingCategory, string> = {
  hotel: "Hotel",
  restaurant: "Restaurant",
  bar: "Bar",
  activity: "Activity",
  shop: "Shop",
  transport: "Transport",
  other: "Other",
};

// F4-E §38 iskrena meja — NAMERNO IZVEN L slovarja (EN-only vrstica; SL
// uporabnik je nikoli ne vidi). Imena lokalov so lastna imena (jezikovno
// nevtralna), specialitete/opisi pa so PODATEK lastnikov v SL — okvir,
// filtri in urniki so EN. Isti kanon kot marketplace DATA_LANGUAGE_NOTE_EN.
const DATA_LANGUAGE_NOTE_EN =
  "Venue names are proper names; descriptions come from the owners in Slovenian — filters and opening hours work in English.";

// TASK 8 / F4-D: EN oznake paketov (zrcali PLAN_LABELS — "Premium"/
// "Enterprise" sta že angleški, razlikuje se samo "Osnovni"/"Basic").
const PLAN_LABELS_EN: Record<ListingPlan, string> = {
  free: "Basic",
  premium: "Premium",
  enterprise: "Enterprise",
};

/** Oznaka kategorije v izbranem jeziku (F4-D: čista funkcija — testna). */
export function categoryLabel(
  category: ListingCategory,
  lang: "sl" | "en"
): string {
  return lang === "en" ? CATEGORY_LABELS_EN[category] : CATEGORY_LABELS[category];
}

// Možnosti za filter kategorije (jezikovno odvisne — F4-D)
const CATEGORY_OPTIONS = (
  lang: "sl" | "en"
): { value: ListingCategory; label: string }[] =>
  (Object.keys(CATEGORY_LABELS) as ListingCategory[]).map((c) => ({
    value: c,
    label: categoryLabel(c, lang),
  }));

// Možnosti za filter destinacije (imena destinacij so lastna imena —
// jezikovno nevtralna)
const DESTINATION_OPTIONS = DESTINATIONS.map((d) => ({
  value: d.id,
  label: d.name,
}));

// Možnosti za sortiranje (vrednosti ostajajo enake — samo oznake se
// prevajajo; logika sortiranja v API-ju je nedotaknjena)
const SORT_OPTIONS = (lang: "sl" | "en"): { value: string; label: string }[] => [
  { value: "featured", label: L.sort.featured[lang] },
  { value: "rating", label: L.sort.rating[lang] },
  { value: "newest", label: L.sort.newest[lang] },
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
  // TASK 8 / F3-B: jezik za L-pattern oznake nalaganja (SL privzeto).
  // TASK 8 / F4-D: isti `lang` poganja ves UI krom površine.
  const locale = useLocale();
  const lang: "sl" | "en" = locale === "en" ? "en" : "sl";
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
      // F4-D: sporočilo napake v L-pattern (edini uporabniško vidni niz —
      // throw zgoraj je interni, konča samo v konzoli).
      setError(L.error[lang]);
      setListings([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [category, destinationId, sort, lang]);

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
            {L.badge[lang]}
          </Badge>
          <h2
            id="lokali-title"
            className="text-3xl font-bold tracking-tight sm:text-4xl"
          >
            {L.title[lang]}
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            {L.subtitle[lang]}
          </p>
          {/* F4-E: tiha resnična vrstica — SAMO na EN */}
          {lang === "en" && (
            <p className="mt-3 text-xs text-muted-foreground/80">
              {DATA_LANGUAGE_NOTE_EN}
            </p>
          )}
        </div>

        {/* Filter vrstica */}
        <div className="mt-8 rounded-xl border border-border/60 bg-muted/20 p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Filter className="size-4 text-primary" aria-hidden="true" />
              {L.filters[lang]}
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
                {L.clearFilters[lang]}
              </Button>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FilterSelect
              value={category}
              onChange={setCategory}
              placeholder={L.allCategories[lang]}
              ariaLabel={L.filterByCategory[lang]}
              options={CATEGORY_OPTIONS(lang)}
            />
            <FilterSelect
              value={destinationId}
              onChange={setDestinationId}
              placeholder={L.allDestinations[lang]}
              ariaLabel={L.filterByDestination[lang]}
              options={DESTINATION_OPTIONS}
            />
            <FilterSelect
              value={sort}
              onChange={setSort}
              placeholder={L.sortBy[lang]}
              ariaLabel={L.sortAria[lang]}
              options={SORT_OPTIONS(lang)}
              showAllOption={false}
            />
          </div>
        </div>

        {/* Števec / nalaganje — TASK 8 / F3-B: med nalaganjem družina
            LoadingState (status + aria-live + L-pattern oznaka), sicer
            stevec površine. */}
        {loading ? (
          <LoadingState
            variant="inline"
            label={L.loadingListings[lang]}
            className="mt-5"
          />
        ) : (
          <p className="mt-5 text-sm text-muted-foreground">
            <>
              {L.showing[lang]}{" "}
              <span className="font-semibold text-foreground">{total}</span>{" "}
              {total === 1
                ? L.venueOne[lang]
                : total < 5
                  ? L.venueFew[lang]
                  : L.venueMany[lang]}
            </>
          </p>
        )}

        {/* Grid */}
        {loading ? (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <ListingSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          /* TASK 8 / F3-B: enotna error slovnica (destructive Alert +
              ponovitev = fetchListings) — prej črtkasta škatla. */
          <ErrorState
            message={error}
            onRetry={() => void fetchListings()}
            className="mt-6"
          />
        ) : listings.length === 0 ? (
          /* TASK 8 / F3-B: družinska EmptyState — isto besedilo/akcija
              (Počisti filtre ob aktivnih filtrih). */
          <EmptyState
            icon={Store}
            title={L.emptyTitle[lang]}
            description={L.emptyDescription[lang]}
            action={
              hasActiveFilters
                ? { label: L.clearFilters[lang], onClick: clearFilters, icon: X }
                : undefined
            }
            className="mt-6 py-16"
          />
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3">
            {listings.map((l) => (
              <ListingCard
                key={l.id}
                listing={l}
                lang={lang}
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
          <p className="text-sm text-foreground/90">{L.footerNote[lang]}</p>
          <a
            href="/za-ponudnike#pridruzi-se"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-colors hover:text-primary/80"
          >
            {L.joinCta[lang]}
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
  lang,
  onOpen,
}: {
  listing: Listing;
  /** F4-D: jezik UI kroma kartice (kategorija, CTA, aria). */
  lang: "sl" | "en";
  onOpen: () => void;
}) {
  const planStyles = getPlanCardStyles(listing.plan, lang);
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

        {/* Badge kategorije (top-left) — skrčen na ozki sliki (~175px), da se ne prekriva s partner badgeom */}
        <Badge className="absolute left-3 top-3 max-w-[45%] bg-background/90 text-[10px] text-foreground backdrop-blur-sm sm:max-w-none sm:text-xs">
          <span aria-hidden="true">{CATEGORY_ICONS[listing.category]}</span>
          <span className="truncate">{categoryLabel(listing.category, lang)}</span>
        </Badge>

        {/* Partner badge (top-right) — samo ena glavna oznaka */}
        {listing.partnerStatus && listing.partnerStatus !== "standard" && (
          <div className="absolute right-3 top-3 z-10">
            <PartnerBadge
              status={listing.partnerStatus as PartnerStatus}
              size="sm"
            />
          </div>
        )}
      </div>

      {/* Body */}
      <CardContent className="flex flex-col gap-3 p-3 sm:p-4">
        <div className="min-w-0">
          <h3 className="text-base font-semibold leading-tight sm:text-lg">
            {listing.name}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2 sm:text-sm">
            {listing.description}
          </p>
        </div>

        {/* Rating — samo ob pravih mnenjih (P4-9: iskrena komunikacija) */}
        {listing.reviewCount > 0 && (
          <div className="flex items-center gap-1.5">
            <Star
              className="size-4 fill-amber-400 text-amber-400"
              aria-hidden="true"
            />
            <span className="text-xs font-medium tabular-nums sm:text-sm">
              {listing.rating.toFixed(1)}
            </span>
            <span className="text-[11px] text-muted-foreground sm:text-xs">
              ({listing.reviewCount})
            </span>
          </div>
        )}

        {/* Lokacija */}
        {location ? (
          <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground sm:text-xs">
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

        {/* Specialties — na mobilnem največ 2 */}
        {listing.specialties.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {listing.specialties.slice(0, 3).map((s, i) => (
              <span
                key={s}
                className={`rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground${
                  i === 2 ? " hidden sm:inline-block" : ""
                }`}
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
            {L.details[lang]}
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
                aria-label={`${L.websiteAria[lang]} ${listing.name}`}
              >
                <Globe className="size-4" aria-hidden="true" />
                <span className="sr-only">{L.websiteSr[lang]}</span>
                <ExternalLink className="size-3" aria-hidden="true" />
              </a>
            </Button>
          ) : null}
        </div>

        {/* TASK 8 / D8-D (§3.3): kompaktstni kanonski dodaj — POLNA širina
            pod obstoječo CTA vrstico (obstoječe akcije Podrobnosti/spletna
            stran ostajajo nespremenjene; 44px dotik iz primitve). */}
        <AddToTripButton
          variant="compact"
          className="w-full justify-center"
          item={{
            kind: "listing",
            refId: listing.id,
            title: listing.name,
            subtitle:
              listing.reviewCount > 0
                ? `${categoryLabel(listing.category, lang)} · ★ ${listing.rating.toFixed(1)}`
                : categoryLabel(listing.category, lang),
            href: "/lokali",
            image,
            source: "lokali",
          }}
        />
      </CardContent>
    </Card>
  );
}

function getPlanCardStyles(plan: ListingPlan, lang: "sl" | "en"): {
  card: string;
  badge: React.ReactNode;
} {
  // F4-D: oznaka paketa v jeziku površine ("Osnovni"/"Basic") — vrednosti
  // paketov (free/premium/enterprise) so identifikatorji in se NE prevajajo.
  const planText =
    lang === "en" ? PLAN_LABELS_EN[plan] : PLAN_LABELS[plan];
  if (plan === "enterprise") {
    return {
      card: "border-2 border-primary shadow-lg scale-[1.02]",
      badge: (
        <Badge className="absolute right-3 top-3 bg-primary text-primary-foreground shadow-sm">
          <Sparkles className="size-3" aria-hidden="true" />
          {planText}
        </Badge>
      ),
    };
  }
  if (plan === "premium") {
    return {
      card: "border-primary",
      badge: (
        <Badge className="absolute right-3 top-3 bg-amber-400 text-amber-950 shadow-sm">
          ★ {planText}
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
      <CardContent className="space-y-3 p-3 sm:p-4">
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

/* TASK 8 / F3-B: lokalni klon EmptyState je ODSTRANJEN — površina
 * uporablja družinsko komponento @/components/states/empty-state
 * (isto besedilo, ista akcija, enotna črtkasta slovnica). */

export default ListingsSection;
