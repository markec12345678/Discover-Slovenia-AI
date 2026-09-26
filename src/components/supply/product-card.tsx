"use client";

// ============================================================================
// TRAVEL SUPPLY MAP — PRODUCT CARD (F1, 1.49.0)
// ============================================================================
// Kompaktna kartica produkta za seznam "Ponudba v pogledu" (dostopnostna
// alternativa zemljevidu) in za telesa provider kartic. Status ponudbe
// (LOCAL/AFFILIATE/LIVE/SEARCH) je VEDNO viden — iz registra, nikoli
// po posamični komponenti.
// ============================================================================

import { Star, MapPin, Euro, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
// TASK 8 / D8-D (§3.3 write-through): kanonski "Dodaj v mojo pot" na kartici
// (prej gumb "V načrt" h-7 — 28px, premajhna dot-tarča po D8-A).
import { AddToTripButton } from "@/components/add-to-trip-button";
import { addMyTripItem, removeMyTripItem } from "@/lib/my-trip";
import { supplyTripItem, supplyTripKind } from "@/lib/supply/my-trip-item";
import { removeSelectedProduct } from "@/lib/supply/selection";
import { taxonomyOf } from "@/lib/supply/taxonomy";
import { getProvider, statusLabel } from "@/lib/supply/registry";
import { showsUnknownPriceChip } from "@/lib/supply/price-display";
import type { ProviderProduct } from "@/lib/supply/types";
import { cn } from "@/lib/utils";

const L = {
  status: { sl: "Vir", en: "Source" },
  // TASK 8 / D8-D (issue #8 §52 — NAMERNA sprememba besedila): oznaki gumba
  // "V načrt" / "V načrtu" sta upokojeni — kanonski AddToTripButton prinaša
  // svoje oznake ("Dodaj v mojo pot" / "V moji poti") + 44px dot-tarčo.
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
  // ISSUE #4 §6 (val 1): produkt brez cene pri viru, ki cene ima → ISKREN
  // žeton "Cena neznana" (prej: tiho skrivanje / naglo degradiranje na ure).
  priceUnknown: { sl: "Cena neznana", en: "Price unknown" },
  priceUnknownHint: {
    sl: "Cena ni preverjena — vir ne pošilja cene za ta produkt. Preveri pri ponudniku.",
    en: "Price not verified — the source does not send a price for this product. Check with the provider.",
  },
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
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
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
        ) : showsUnknownPriceChip(product) ? (
          // ISSUE #4 §6: vir cene ima, ta produkt je ne nosi → žeton, NE tišina.
          // (Odprti viri brez koncepta cen — OSM/FSQ — ostanejo na starem
          // poštenem prikazu spodaj: tišina TAM je iskrena.)
          <span
            className="inline-flex min-w-0 items-center gap-1.5"
            title={L.priceUnknownHint[lang]}
          >
            <Badge
              variant="outline"
              className="gap-0.5 border-amber-300 bg-amber-50 px-1.5 py-0 text-[10px] font-semibold text-amber-900 hover:bg-amber-50 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
            >
              <Euro className="size-2.5" aria-hidden="true" />
              {L.priceUnknown[lang]}
            </Badge>
            {product.openingHours ? (
              <span className="inline-flex min-w-0 items-center gap-1 truncate text-[11px] text-muted-foreground">
                <Clock className="size-3 shrink-0" aria-hidden="true" />
                {product.openingHours.slice(0, 24)}
              </span>
            ) : null}
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
        {/* TASK 8 / D8-D (§3.3 write-through, D8-A §4.1 varianta 3):
            kontrolirani kanonski gumb — dodajanje pokliče obstoječi
            onAdd (starševa mehanika addProductToSelection) IN registrira
            predmet v zbirki "Moja pot"; odstranitev pobriše oboje
            (removeSelectedProduct + removeMyTripItem). */}
        <AddToTripButton
          variant="compact"
          added={selected}
          onToggle={(next) => {
            if (next) {
              onAdd(product);
              addMyTripItem(supplyTripItem(product, lang, "zemljevid"));
            } else {
              removeSelectedProduct(product.provider, product.providerProductId);
              removeMyTripItem(supplyTripKind(product.type), product.id);
            }
          }}
          item={supplyTripItem(product, lang, "zemljevid")}
        />
      </div>
    </div>
  );
}

export default ProductCard;
