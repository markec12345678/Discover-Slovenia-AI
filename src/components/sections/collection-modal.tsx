"use client";

import { useCallback, useEffect, useState } from "react";
import { Star, MapPin, X, PackageOpen, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  PRODUCT_CATEGORY_LABELS,
  PRODUCT_CATEGORY_ICONS,
  EXPERIENCE_CATEGORY_LABELS,
  EXPERIENCE_CATEGORY_ICONS,
  formatPrice,
  type Product,
  type Experience,
} from "@/lib/marketplace-types";
import type { Collection } from "@/lib/collections";
import { ProductModal } from "@/components/sections/product-modal";
import { ExperienceModal } from "@/components/sections/experience-modal";

interface CollectionResponse {
  collection: Collection;
  products: Product[];
  experiences: Experience[];
  total: number;
}

interface CollectionModalProps {
  collection: Collection | null;
  onClose: () => void;
}

/**
 * CollectionModal — prikazuje vse products in experiences, ki ustrezajo
 * filtrom zbirke. Podatke pridobi iz /api/collections/[slug].
 * Klik na kartico odre podroben ProductModal / ExperienceModal (zgoraj).
 */
export function CollectionModal({
  collection,
  onClose,
}: CollectionModalProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Podrobni modal (na vrhu collection modala).
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedExperience, setSelectedExperience] =
    useState<Experience | null>(null);

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  const fetchCollection = useCallback(async (slug: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/collections/${slug}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        if (res.status === 404) {
          setError("Zbirka ni najdena.");
        } else {
          setError("Napaka pri pridobivanju zbirke.");
        }
        setProducts([]);
        setExperiences([]);
        return;
      }
      const data: CollectionResponse = await res.json();
      setProducts(data.products ?? []);
      setExperiences(data.experiences ?? []);
    } catch {
      setError("Napaka pri povezavi s strežnikom.");
      setProducts([]);
      setExperiences([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (collection) {
      fetchCollection(collection.slug);
    } else {
      // Reset ob zaprtju.
      setProducts([]);
      setExperiences([]);
      setError(null);
    }
  }, [collection, fetchCollection]);

  const isEmpty =
    !loading && !error && products.length === 0 && experiences.length === 0;

  return (
    <>
      <Dialog open={collection !== null} onOpenChange={handleOpenChange}>
        <DialogContent
          showCloseButton
          className="max-h-[90vh] max-w-4xl gap-0 overflow-hidden p-0 sm:max-w-4xl"
          aria-describedby="collection-modal-desc"
        >
          {collection ? (
            <>
              <DialogTitle className="sr-only">
                Zbirka: {collection.title}
              </DialogTitle>
              <DialogDescription id="collection-modal-desc" className="sr-only">
                Kurirana zbirka {collection.title}: izdelki in izkušnje, ki
                ustrezajo kriterijem zbirke.
              </DialogDescription>

              {/* Glava modala */}
              <div className="flex items-start gap-4 border-b border-border/60 bg-muted/30 p-5 sm:p-6">
                <div
                  className={cn(
                    "flex size-14 shrink-0 items-center justify-center rounded-xl text-3xl",
                    collection.color
                  )}
                  aria-hidden="true"
                >
                  {collection.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-bold sm:text-2xl">
                    {collection.title}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {collection.description}
                  </p>
                  {!loading && !error ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {products.length} izdelkov · {experiences.length}{" "}
                      izkušenj
                    </p>
                  ) : null}
                </div>
              </div>

              {/* Vsebina — scroll area */}
              <div className="scroll-area-custom max-h-[70vh] overflow-y-auto p-5 sm:p-6">
                {loading ? (
                  <CollectionSkeleton />
                ) : error ? (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-center">
                    <p className="text-sm text-destructive">{error}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => fetchCollection(collection.slug)}
                    >
                      Poskusi znova
                    </Button>
                  </div>
                ) : isEmpty ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                    <PackageOpen
                      className="size-10 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <p className="text-sm text-muted-foreground">
                      V tej zbirki trenutno ni izdelkov ali izkušenj.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {products.length > 0 ? (
                      <section>
                        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                          Izdelki ({products.length})
                        </h3>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                          {products.map((p) => (
                            <MiniProductCard
                              key={p.id}
                              product={p}
                              onClick={() => setSelectedProduct(p)}
                            />
                          ))}
                        </div>
                      </section>
                    ) : null}

                    {experiences.length > 0 ? (
                      <section>
                        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                          Izkušnje ({experiences.length})
                        </h3>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                          {experiences.map((e) => (
                            <MiniExperienceCard
                              key={e.id}
                              experience={e}
                              onClick={() => setSelectedExperience(e)}
                            />
                          ))}
                        </div>
                      </section>
                    ) : null}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between gap-2 border-t border-border/60 bg-background p-4 sm:px-6">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Sparkles className="size-3 text-primary" aria-hidden="true" />
                  Kurirano na podlagi kategorij, atributov in destinacij.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onClose}
                  className="gap-1.5"
                >
                  <X className="size-4" aria-hidden="true" />
                  Zapri
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Stack detail modalov na vrhu */}
      <ProductModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
      />
      <ExperienceModal
        experience={selectedExperience}
        onClose={() => setSelectedExperience(null)}
      />
    </>
  );
}

/* Mini kartice za products/experiences znotraj collection modala */

function MiniProductCard({
  product,
  onClick,
}: {
  product: Product;
  onClick: () => void;
}) {
  const image = product.images[0];
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col overflow-hidden rounded-lg border border-border/60 bg-background text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
      aria-label={`Odpri ${product.name}`}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        {image ? (
          <img
            src={image}
            alt={product.name}
            className="size-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-3xl">
            <span aria-hidden="true">
              {PRODUCT_CATEGORY_ICONS[product.category]}
            </span>
          </div>
        )}
        <Badge className="absolute left-1.5 top-1.5 bg-background/90 text-[10px] text-foreground backdrop-blur-sm">
          <span aria-hidden="true">{PRODUCT_CATEGORY_ICONS[product.category]}</span>
          {PRODUCT_CATEGORY_LABELS[product.category]}
        </Badge>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <h4 className="line-clamp-1 text-xs font-semibold">{product.name}</h4>
        {product.destinationName ? (
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground line-clamp-1">
            <MapPin className="size-3 shrink-0" aria-hidden="true" />
            {product.destinationName}
          </p>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-1">
          <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
            <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden="true" />
            <span className="tabular-nums">{product.rating.toFixed(1)}</span>
          </span>
          <span className="text-xs font-bold text-foreground">
            {formatPrice(product.price, product.currency)}
          </span>
        </div>
      </div>
    </button>
  );
}

function MiniExperienceCard({
  experience,
  onClick,
}: {
  experience: Experience;
  onClick: () => void;
}) {
  const image = experience.images[0];
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col overflow-hidden rounded-lg border border-border/60 bg-background text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
      aria-label={`Odpri ${experience.name}`}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        {image ? (
          <img
            src={image}
            alt={experience.name}
            className="size-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-3xl">
            <span aria-hidden="true">
              {EXPERIENCE_CATEGORY_ICONS[experience.category]}
            </span>
          </div>
        )}
        <Badge className="absolute left-1.5 top-1.5 bg-background/90 text-[10px] text-foreground backdrop-blur-sm">
          <span aria-hidden="true">
            {EXPERIENCE_CATEGORY_ICONS[experience.category]}
          </span>
          {EXPERIENCE_CATEGORY_LABELS[experience.category]}
        </Badge>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <h4 className="line-clamp-1 text-xs font-semibold">{experience.name}</h4>
        {experience.destinationName ? (
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground line-clamp-1">
            <MapPin className="size-3 shrink-0" aria-hidden="true" />
            {experience.destinationName}
          </p>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-1">
          <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
            <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden="true" />
            <span className="tabular-nums">{experience.rating.toFixed(1)}</span>
          </span>
          <span className="text-xs font-bold text-foreground">
            {formatPrice(experience.pricePerPerson, experience.currency)}
          </span>
        </div>
      </div>
    </button>
  );
}

function CollectionSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="mb-3 h-4 w-32" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-lg border border-border/60"
            >
              <Skeleton className="aspect-square w-full" />
              <div className="space-y-2 p-2.5">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default CollectionModal;
