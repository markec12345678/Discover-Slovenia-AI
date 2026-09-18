"use client";

// ============================================================================
// TRAVEL SUPPLY MAP — PRODUCT CARD (F1, 1.49.0)
// ============================================================================
// Kompaktna kartica produkta za seznam "Ponudba v pogledu" (dostopnostna
// alternativa zemljevidu) in za telesa provider kartic. Status ponudbe
// (LOCAL/AFFILIATE/LIVE/SEARCH) je VEDNO viden — iz registra, nikoli
// po posamični komponenti.
// ============================================================================

import { Star, MapPin, Plus, Check, Euro, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { taxonomyOf } from "@/lib/supply/taxonomy";
import { getProvider, statusLabel } from "@/lib/supply/registry";
import type { ProviderProduct } from "@/lib/supply/types";
import { cn } from "@/lib/utils";

const L = {
  status: { sl: "Vir", en: "Source" },
  addPlan: { sl: "V načrt", en: "Add to plan" },
  added: { sl: "V načrtu", en: "In plan" },
  perPerson: { sl: "/osebo", en: "/person" },
  perNight: { sl: "/noč", en: "/night" },
  perDay: { sl: "/dan", en: "/day" },
  perVehicle: { sl: "/vozilo", en: "/vehicle" },
  perTransfer: { sl: "/prevoz", en: "/transfer" },
  total: { sl: "skupaj", en: "total" },
  fromPrice: { sl: "od", en: "from" },
  reviews: { sl: "ocen", en: "reviews" },
  hours: { sl: "h", en: "h" },
  local: { sl: "lokalno", en: "local" },
} as const;

export interface ProductCardProps {
  product: ProviderProduct;
  lang: "sl" | "en";
  /** Ali je produkt ŽE v izbiri (checkbox look). */
  selected: boolean;
  onOpen: (product: ProviderProduct) => void;
  onAdd: (product: ProviderProduct) => void;
}

export function ProductCard({
  product,
  lang,
  selected,
  onOpen,
  onAdd,
}: ProductCardProps) {
  const tax = taxonomyOf(product.type);
  const provider = getProvider(product.provider);
  const status = provider ? statusLabel(provider.status)[lang] : "";

  const priceSuffix =
    product.price?.unit === "per_person"
      ? ` ${L.perPerson[lang]}`
      : product.price?.unit === "per_night"
        ? ` ${L.perNight[lang]}`
        : product.price?.unit === "per_day"
          ? ` ${L.perDay[lang]}`
          : product.price?.unit === "per_vehicle"
            ? ` ${L.perVehicle[lang]}`
            : product.price?.unit === "per_transfer"
              ? ` ${L.perTransfer[lang]}`
              : product.price?.unit === "total"
                ? ` ${L.total[lang]}`
                : "";

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-background p-3 transition-colors",
        "hover:bg-accent/30 focus-within:ring-2 focus-within:ring-ring"
      )}
    >
      <button
        type="button"
        onClick={() => onOpen(product)}
        className="w-full text-left"
        aria-label={product.title}
      >
        <div className="flex items-start gap-2">
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-md text-lg"
            style={{ backgroundColor: `${tax.color}1a` }}
          >
            {tax.icon}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {product.title}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge
                variant="outline"
                className="gap-1 px-1.5 py-0 text-[10px]"
                style={{ color: tax.color, borderColor: `${tax.color}55` }}
              >
                <span aria-hidden="true">{tax.icon}</span>
                {tax.label[lang]}
              </Badge>
              {provider ? (
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                  {status}
                </Badge>
              ) : null}
              {product.rating != null ? (
                <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
                  <Star className="size-3 fill-amber-500 text-amber-500" aria-hidden="true" />
                  {product.rating.toFixed(1)}
                  {product.reviewCount != null ? (
                    <span className="text-muted-foreground/70">
                      ({product.reviewCount})
                    </span>
                  ) : null}
                </span>
              ) : null}
            </div>
            {product.address ? (
              <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                <MapPin className="size-3 shrink-0" aria-hidden="true" />
                {product.address}
              </p>
            ) : null}
          </div>
        </div>
      </button>
      <div className="mt-2 flex items-center justify-between gap-2">
        {product.price ? (
          <span className="inline-flex items-center text-sm font-bold text-foreground">
            {product.price.fromPrice ? (
              <span className="mr-0.5 text-[11px] font-medium text-muted-foreground">
                {L.fromPrice[lang]}
              </span>
            ) : null}
            <Euro className="size-3.5" aria-hidden="true" />
            {product.price.amount}
            {priceSuffix}
          </span>
        ) : product.openingHours ? (
          <span className="inline-flex items-center gap-1 truncate text-[11px] text-muted-foreground">
            <Clock className="size-3 shrink-0" aria-hidden="true" />
            {product.openingHours.slice(0, 24)}
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground">
            {product.license?.source ?? provider?.labels[lang]}
          </span>
        )}
        <Button
          type="button"
          size="sm"
          variant={selected ? "secondary" : "default"}
          onClick={() => onAdd(product)}
          aria-pressed={selected}
          className="h-7 gap-1 px-2 text-[11px]"
        >
          {selected ? (
            <Check className="size-3" aria-hidden="true" />
          ) : (
            <Plus className="size-3" aria-hidden="true" />
          )}
          {selected ? L.added[lang] : L.addPlan[lang]}
        </Button>
      </div>
    </div>
  );
}

export default ProductCard;
