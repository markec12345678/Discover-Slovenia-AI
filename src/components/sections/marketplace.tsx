"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Star,
  MapPin,
  Clock,
  Calendar,
  ShoppingBag,
  Filter,
  X,
  Leaf,
  HandHeart,
  Truck,
  Globe,
  Baby,
  Accessibility,
  Compass,
  Sparkles,
  Store,
  ExternalLink,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import {
  PRODUCT_CATEGORY_LABELS,
  PRODUCT_CATEGORY_ICONS,
  EXPERIENCE_CATEGORY_LABELS,
  EXPERIENCE_CATEGORY_ICONS,
  formatPrice,
  formatDuration,
  type Product,
  type ProductCategory,
  type Experience,
  type ExperienceCategory,
} from "@/lib/marketplace-types";
import { ProductModal } from "@/components/sections/product-modal";
import { ExperienceModal } from "@/components/sections/experience-modal";


const ALL_VALUE = "all";

// Možnosti za filter kategorije izdelkov
const PRODUCT_CATEGORY_OPTIONS: { value: ProductCategory; label: string }[] = (
  Object.keys(PRODUCT_CATEGORY_LABELS) as ProductCategory[]
).map((c) => ({
  value: c,
  label: `${PRODUCT_CATEGORY_ICONS[c]} ${PRODUCT_CATEGORY_LABELS[c]}`,
}));

// Možnosti za filter kategorije izkušenj
const EXPERIENCE_CATEGORY_OPTIONS: {
  value: ExperienceCategory;
  label: string;
}[] = (
  Object.keys(EXPERIENCE_CATEGORY_LABELS) as ExperienceCategory[]
).map((c) => ({
  value: c,
  label: `${EXPERIENCE_CATEGORY_ICONS[c]} ${EXPERIENCE_CATEGORY_LABELS[c]}`,
}));

// Možnosti za sortiranje izdelkov
const PRODUCT_SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "featured", label: "Izpostavljeni" },
  { value: "price-asc", label: "Cena naraščajoče" },
  { value: "price-desc", label: "Cena padajoče" },
  { value: "rating", label: "Najvišja ocena" },
];

// Možnosti za sortiranje izkušenj
const EXPERIENCE_SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "featured", label: "Izpostavljeni" },
  { value: "price-asc", label: "Cena naraščajoče" },
  { value: "price-desc", label: "Cena padajoče" },
  { value: "rating", label: "Najvišja ocena" },
];

type ProductsResponse = {
  products: Product[];
  total: number;
};

type ExperiencesResponse = {
  experiences: Experience[];
  total: number;
};

type Tab = "products" | "experiences";

/**
 * MarketplaceSection — tržnica slovenskih izdelkov in izkušenj.
 * Tabs med izdelki in izkušnjami, filtri kategorije in sortiranja.
 * Kartice odprejo detail modal (ProductModal / ExperienceModal).
 */
export function MarketplaceSection() {
  const [tab, setTab] = useState<Tab>("products");

  // Filtri izdelki
  const [productCategory, setProductCategory] = useState<string>(ALL_VALUE);
  const [productSort, setProductSort] = useState<string>("featured");

  // Filtri izkušnje
  const [expCategory, setExpCategory] = useState<string>(ALL_VALUE);
  const [expSort, setExpSort] = useState<string>("featured");

  const [products, setProducts] = useState<Product[]>([]);
  const [productsTotal, setProductsTotal] = useState<number>(0);
  const [productsLoading, setProductsLoading] = useState<boolean>(true);
  const [productsError, setProductsError] = useState<string | null>(null);

  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [experiencesTotal, setExperiencesTotal] = useState<number>(0);
  const [experiencesLoading, setExperiencesLoading] = useState<boolean>(true);
  const [experiencesError, setExperiencesError] = useState<string | null>(null);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedExperience, setSelectedExperience] =
    useState<Experience | null>(null);

  // Fetch izdelkov
  const fetchProducts = useCallback(async () => {
    setProductsLoading(true);
    setProductsError(null);
    try {
      const params = new URLSearchParams();
      if (productCategory !== ALL_VALUE)
        params.set("category", productCategory);
      params.set("sort", productSort);
      params.set("limit", "50");

      const res = await fetch(`/api/products?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Napaka pri pridobivanju izdelkov");
      const data: ProductsResponse = await res.json();
      setProducts(data.products ?? []);
      setProductsTotal(data.total ?? 0);
    } catch (err) {
      console.error("[products] fetch napaka:", err);
      setProductsError("Ne morem naložiti izdelkov. Poskusite kasneje.");
      setProducts([]);
      setProductsTotal(0);
    } finally {
      setProductsLoading(false);
    }
  }, [productCategory, productSort]);

  // Fetch izkušenj
  const fetchExperiences = useCallback(async () => {
    setExperiencesLoading(true);
    setExperiencesError(null);
    try {
      const params = new URLSearchParams();
      if (expCategory !== ALL_VALUE) params.set("category", expCategory);
      params.set("sort", expSort);
      params.set("limit", "50");

      const res = await fetch(`/api/experiences?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Napaka pri pridobivanju izkušenj");
      const data: ExperiencesResponse = await res.json();
      setExperiences(data.experiences ?? []);
      setExperiencesTotal(data.total ?? 0);
    } catch (err) {
      console.error("[experiences] fetch napaka:", err);
      setExperiencesError("Ne morem naložiti izkušenj. Poskusite kasneje.");
      setExperiences([]);
      setExperiencesTotal(0);
    } finally {
      setExperiencesLoading(false);
    }
  }, [expCategory, expSort]);

  useEffect(() => {
    void fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    void fetchExperiences();
  }, [fetchExperiences]);

  // Počisti filtre glede na aktivni tab
  const clearFilters = () => {
    if (tab === "products") {
      setProductCategory(ALL_VALUE);
      setProductSort("featured");
    } else {
      setExpCategory(ALL_VALUE);
      setExpSort("featured");
    }
  };

  const hasActiveFilters =
    tab === "products"
      ? productCategory !== ALL_VALUE || productSort !== "featured"
      : expCategory !== ALL_VALUE || expSort !== "featured";

  return (
    <section
      id="trznica"
      className="scroll-mt-20 bg-muted/20 py-16 sm:py-20"
      aria-labelledby="trznica-title"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <Badge
            variant="secondary"
            className="mb-3 gap-1.5 bg-primary/10 text-primary"
          >
            <Store className="size-3.5" aria-hidden="true" />
            Tržnica
          </Badge>
          <h2
            id="trznica-title"
            className="text-3xl font-bold tracking-tight sm:text-4xl"
          >
            Tržnica Slovenije
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            Lokalni izdelki in izkušnje — direktno od kmetov, vinogradnikov in
            vodnikov
          </p>
        </div>

        {/* Tabs */}
        <div className="mt-8 flex justify-center">
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as Tab)}
            className="w-full max-w-md"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="products" className="gap-1.5">
                <ShoppingBag className="size-4" aria-hidden="true" />
                Izdelki
              </TabsTrigger>
              <TabsTrigger value="experiences" className="gap-1.5">
                <Compass className="size-4" aria-hidden="true" />
                Izkušnje
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Filter vrstica */}
        <div className="mx-auto mt-6 max-w-3xl rounded-xl border border-border/60 bg-background p-4 sm:p-5">
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {tab === "products" ? (
              <>
                <FilterSelect
                  value={productCategory}
                  onChange={setProductCategory}
                  placeholder="Vse kategorije"
                  ariaLabel="Filtriraj izdelke po kategoriji"
                  options={PRODUCT_CATEGORY_OPTIONS}
                />
                <FilterSelect
                  value={productSort}
                  onChange={setProductSort}
                  placeholder="Razvrsti po"
                  ariaLabel="Razvrsti izdelke"
                  options={PRODUCT_SORT_OPTIONS}
                  showAllOption={false}
                />
              </>
            ) : (
              <>
                <FilterSelect
                  value={expCategory}
                  onChange={setExpCategory}
                  placeholder="Vse kategorije"
                  ariaLabel="Filtriraj izkušnje po kategoriji"
                  options={EXPERIENCE_CATEGORY_OPTIONS}
                />
                <FilterSelect
                  value={expSort}
                  onChange={setExpSort}
                  placeholder="Razvrsti po"
                  ariaLabel="Razvrsti izkušnje"
                  options={EXPERIENCE_SORT_OPTIONS}
                  showAllOption={false}
                />
              </>
            )}
          </div>
        </div>

        {/* Števec */}
        <p className="mt-5 text-center text-sm text-muted-foreground">
          {tab === "products"
            ? productsLoading
              ? "Nalagam izdelke..."
              : (() => {
                  const t = productsTotal;
                  return (
                    <>
                      Prikazujem{" "}
                      <span className="font-semibold text-foreground">{t}</span>{" "}
                      {t === 1 ? "izdelek" : t < 5 ? "izdelke" : "izdelkov"}
                    </>
                  );
                })()
            : experiencesLoading
              ? "Nalagam izkušnje..."
              : (() => {
                  const t = experiencesTotal;
                  return (
                    <>
                      Prikazujem{" "}
                      <span className="font-semibold text-foreground">{t}</span>{" "}
                      {t === 1
                        ? "izkušnjo"
                        : t < 5
                          ? "izkušnje"
                          : "izkušenj"}
                    </>
                  );
                })()}
        </p>

        {/* Grid */}
        {tab === "products" ? (
          productsLoading ? (
            <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <ProductSkeleton key={i} />
              ))}
            </div>
          ) : productsError ? (
            <ErrorState
              message={productsError}
              onRetry={() => void fetchProducts()}
            />
          ) : products.length === 0 ? (
            <EmptyState
              canClear={hasActiveFilters}
              onClear={clearFilters}
              label="izdelkov"
            />
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {products.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  onOpen={() => setSelectedProduct(p)}
                />
              ))}
            </div>
          )
        ) : experiencesLoading ? (
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <ExperienceSkeleton key={i} />
            ))}
          </div>
        ) : experiencesError ? (
          <ErrorState
            message={experiencesError}
            onRetry={() => void fetchExperiences()}
          />
        ) : experiences.length === 0 ? (
          <EmptyState
            canClear={hasActiveFilters}
            onClear={clearFilters}
            label="izkušenj"
          />
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {experiences.map((e) => (
              <ExperienceCard
                key={e.id}
                experience={e}
                onOpen={() => setSelectedExperience(e)}
              />
            ))}
          </div>
        )}

        {/* Footer note — monetizacijski CTA */}
        <div className="mt-10 flex flex-col items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-6 text-center sm:flex-row sm:gap-4">
          <Store className="size-5 text-primary" aria-hidden="true" />
          <p className="text-sm text-foreground/90">
            Želite prodajati svoje izdelke ali izkušnje? Pridruži se tržnici.
          </p>
          <a
            href="#pridruzi-se"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-colors hover:text-primary/80"
          >
            Pridruži se
            <Compass className="size-3.5" aria-hidden="true" />
          </a>
        </div>
      </div>

      {/* Modala */}
      <ProductModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onSelect={setSelectedProduct}
      />
      <ExperienceModal
        experience={selectedExperience}
        onClose={() => setSelectedExperience(null)}
        onSelect={setSelectedExperience}
      />
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
 * ProductCard — kartica izdelka za tržnico.
 */
function ProductCard({
  product,
  onOpen,
}: {
  product: Product;
  onOpen: () => void;
}) {
  const image = product.images[0];
  const discount = product.compareAtPrice
    ? Math.round(
        ((product.compareAtPrice - product.price) / product.compareAtPrice) *
          100
      )
    : 0;

  // Preusmeritev na ponudnika — mi samo usmerjamo promet, ne pobiramo plačil
  const handleVisitSeller = () => {
    if (product.sellerWebsite) {
      window.open(product.sellerWebsite, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <Card
      className={cn(
        "group relative gap-0 overflow-hidden py-0 transition-all hover:shadow-lg focus-within:shadow-lg",
        product.plan === "premium" && "border-primary"
      )}
    >
      {/* Slika */}
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        {image ? (
          <img
            src={image}
            alt={`${product.name} — ${product.description}`}
            loading="lazy"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-muted text-4xl">
            <span aria-hidden="true">
              {PRODUCT_CATEGORY_ICONS[product.category]}
            </span>
          </div>
        )}

        {/* Atributi (top-left) */}
        <div className="absolute left-3 top-3 flex flex-col gap-1.5">
          {product.organic ? (
            <Badge className="bg-primary text-primary-foreground shadow-sm">
              <Leaf className="size-3" aria-hidden="true" />
              Ekološko
            </Badge>
          ) : null}
          {product.handmade ? (
            <Badge className="bg-blue-600 text-white shadow-sm">
              <HandHeart className="size-3" aria-hidden="true" />
              Ročno
            </Badge>
          ) : null}
          {product.vegan ? (
            <Badge variant="secondary" className="shadow-sm">
              <Leaf className="size-3" aria-hidden="true" />
              Vegansko
            </Badge>
          ) : null}
        </div>

        {/* Featured badge (top-right) */}
        {product.featured ? (
          <Badge className="absolute right-3 top-3 bg-amber-400 text-amber-950 shadow-sm">
            <Sparkles className="size-3" aria-hidden="true" />
            Izpostavljeno
          </Badge>
        ) : null}

        {/* Discount badge (bottom-right) */}
        {discount > 0 ? (
          <Badge className="absolute bottom-3 right-3 bg-destructive text-destructive-foreground shadow-sm">
            -{discount}%
          </Badge>
        ) : null}
      </div>

      {/* Body */}
      <CardContent className="flex flex-col gap-3 p-4">
        <div>
          <h3 className="line-clamp-1 text-lg font-semibold leading-tight">
            {product.name}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
            {product.description}
          </p>
        </div>

        {/* Rating */}
        <div className="flex items-center gap-1.5">
          <Star
            className="size-4 fill-amber-400 text-amber-400"
            aria-hidden="true"
          />
          <span className="text-sm font-medium tabular-nums">
            {product.rating.toFixed(1)}
          </span>
          <span className="text-xs text-muted-foreground">
            ({product.reviewCount})
          </span>
        </div>

        {/* Cena */}
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-bold text-foreground">
            {formatPrice(product.price, product.currency)}
          </span>
          {product.compareAtPrice ? (
            <span className="text-sm text-muted-foreground line-through">
              {formatPrice(product.compareAtPrice, product.currency)}
            </span>
          ) : null}
        </div>

        {/* Seller name + location */}
        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <MapPin
            className="mt-0.5 size-3.5 shrink-0"
            aria-hidden="true"
          />
          <span className="line-clamp-1">
            {product.sellerName}
            {product.destinationName ? ` · ${product.destinationName}` : ""}
          </span>
        </div>

        {/* Shipping badge */}
        <div className="flex flex-wrap gap-1.5">
          {product.shippingFree ? (
            <Badge className="bg-amber-400 text-amber-950">
              <Truck className="size-3" aria-hidden="true" />
              Brezplačna dostava
            </Badge>
          ) : product.shipsEurope ? (
            <Badge variant="secondary">
              <Globe className="size-3" aria-hidden="true" />
              Dostava EU
            </Badge>
          ) : null}
        </div>

        {/* CTA */}
        <div className="mt-1 flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="flex-1 justify-center bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={!product.sellerWebsite}
            onClick={handleVisitSeller}
          >
            <ExternalLink className="size-4" aria-hidden="true" />
            {product.sellerWebsite ? "Pri prodajalcu" : "Brez spletne"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-center"
            onClick={onOpen}
          >
            Podrobnosti
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * ExperienceCard — kartica izkušnje za tržnico.
 */
function ExperienceCard({
  experience,
  onOpen,
}: {
  experience: Experience;
  onOpen: () => void;
}) {
  const image = experience.images[0];

  // Preusmeritev na ponudnika — mi samo usmerjamo promet, ne pobiramo plačil
  const handleVisitProvider = () => {
    if (experience.providerWebsite) {
      window.open(experience.providerWebsite, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <Card
      className={cn(
        "group relative gap-0 overflow-hidden py-0 transition-all hover:shadow-lg focus-within:shadow-lg",
        experience.plan === "premium" && "border-primary"
      )}
    >
      {/* Slika */}
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {image ? (
          <img
            src={image}
            alt={`${experience.name} — ${experience.description}`}
            loading="lazy"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-muted text-4xl">
            <span aria-hidden="true">
              {EXPERIENCE_CATEGORY_ICONS[experience.category]}
            </span>
          </div>
        )}

        {/* Category badge (top-left) */}
        <Badge className="absolute left-3 top-3 bg-background/90 text-foreground backdrop-blur-sm">
          <span aria-hidden="true">
            {EXPERIENCE_CATEGORY_ICONS[experience.category]}
          </span>
          {EXPERIENCE_CATEGORY_LABELS[experience.category]}
        </Badge>

        {/* Featured badge (top-right) */}
        {experience.featured ? (
          <Badge className="absolute right-3 top-3 bg-amber-400 text-amber-950 shadow-sm">
            <Sparkles className="size-3" aria-hidden="true" />
            Izpostavljeno
          </Badge>
        ) : null}

        {/* Duration badge (bottom-right) */}
        <Badge className="absolute bottom-3 right-3 bg-background/90 text-foreground backdrop-blur-sm">
          <Clock className="size-3" aria-hidden="true" />
          {formatDuration(experience.durationHours)}
        </Badge>
      </div>

      {/* Body */}
      <CardContent className="flex flex-col gap-3 p-4">
        <div>
          <h3 className="line-clamp-1 text-lg font-semibold leading-tight">
            {experience.name}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
            {experience.description}
          </p>
        </div>

        {/* Rating */}
        <div className="flex items-center gap-1.5">
          <Star
            className="size-4 fill-amber-400 text-amber-400"
            aria-hidden="true"
          />
          <span className="text-sm font-medium tabular-nums">
            {experience.rating.toFixed(1)}
          </span>
          <span className="text-xs text-muted-foreground">
            ({experience.reviewCount})
          </span>
        </div>

        {/* Cena */}
        <div className="flex items-baseline gap-1">
          <span className="text-xs text-muted-foreground">od</span>
          <span className="text-lg font-bold text-foreground">
            {formatPrice(experience.pricePerPerson, experience.currency)}
          </span>
          <span className="text-xs text-muted-foreground">/ osebo</span>
        </div>

        {/* Provider name + location */}
        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <MapPin
            className="mt-0.5 size-3.5 shrink-0"
            aria-hidden="true"
          />
          <span className="line-clamp-1">
            {experience.providerName}
            {experience.destinationName ? ` · ${experience.destinationName}` : ""}
          </span>
        </div>

        {/* Atributi */}
        {(experience.familyFriendly || experience.accessibility) && (
          <div className="flex flex-wrap gap-1.5">
            {experience.familyFriendly ? (
              <Badge variant="secondary">
                <Baby className="size-3" aria-hidden="true" />
                Družinsko
              </Badge>
            ) : null}
            {experience.accessibility ? (
              <Badge variant="secondary">
                <Accessibility className="size-3" aria-hidden="true" />
                Dostopno
              </Badge>
            ) : null}
          </div>
        )}

        {/* CTA */}
        <div className="mt-1 flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="flex-1 justify-center bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={!experience.providerWebsite}
            onClick={(e) => {
              e.stopPropagation();
              handleVisitProvider();
            }}
          >
            <ExternalLink className="size-4" aria-hidden="true" />
            {experience.providerWebsite ? "Pri ponudniku" : "Brez spletne"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-center"
            onClick={onOpen}
          >
            Podrobnosti
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ProductSkeleton() {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <Skeleton className="aspect-square w-full rounded-none" />
      <CardContent className="space-y-3 p-4">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-5 w-1/3" />
        <div className="flex gap-2">
          <Skeleton className="h-8 flex-1 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
      </CardContent>
    </Card>
  );
}

function ExperienceSkeleton() {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <Skeleton className="aspect-video w-full rounded-none" />
      <CardContent className="space-y-3 p-4">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-5 w-1/3" />
        <div className="flex gap-2">
          <Skeleton className="h-8 flex-1 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({
  canClear,
  onClear,
  label,
}: {
  canClear: boolean;
  onClear: () => void;
  label: string;
}) {
  return (
    <div className="mt-6 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-background px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Store className="size-6 text-muted-foreground" aria-hidden="true" />
      </span>
      <p className="text-base font-medium">Ni najdenih rezultatov.</p>
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
          Počisti filtre ({label})
        </Button>
      ) : null}
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="mt-6 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-destructive/40 bg-destructive/5 px-6 py-16 text-center">
      <p className="text-base font-medium text-destructive">{message}</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onRetry}
        className="gap-1.5"
      >
        Poskusi znova
      </Button>
    </div>
  );
}

export default MarketplaceSection;
