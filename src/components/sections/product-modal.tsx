"use client";

import { useRef, useState } from "react";
import {
  Star,
  MapPin,
  Phone,
  Mail,
  Globe,
  ExternalLink,
  CheckCircle2,
  Eye,
  TrendingUp,
  Leaf,
  HandHeart,
  ShoppingBag,
  Truck,
  Globe2,
  Package,
  Boxes,
  Sparkles,
  Scale,
  Tag,
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
import {
  PRODUCT_CATEGORY_LABELS,
  PRODUCT_CATEGORY_ICONS,
  formatPrice,
  type Product,
} from "@/lib/marketplace-types";
import { useCart } from "@/lib/cart-store";

interface ProductModalProps {
  product: Product | null;
  onClose: () => void;
}

/**
 * ProductModal — podrobnosti izdelka iz tržnice.
 * Prikazuje veliko sliko, opis, atribute, kontakt prodajalca in CTA.
 */
export function ProductModal({ product, onClose }: ProductModalProps) {
  const [activeImage, setActiveImage] = useState(0);
  const addItem = useCart((s) => s.addItem);

  // Reset aktivne slike ko se spremeni izdelek (render-phase check, brez effect-a)
  const prevProductId = useRef<string | undefined>(undefined);
  if (prevProductId.current !== product?.id) {
    prevProductId.current = product?.id;
    if (activeImage !== 0) {
      setActiveImage(0);
    }
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  if (!product) {
    return (
      <Dialog open={false} onOpenChange={handleOpenChange}>
        <DialogContent />
      </Dialog>
    );
  }

  const image = product.images[activeImage] ?? product.images[0];
  const discount = product.compareAtPrice
    ? Math.round(
        ((product.compareAtPrice - product.price) / product.compareAtPrice) * 100
      )
    : 0;

  return (
    <Dialog open={product !== null} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton
        className="max-h-[90vh] max-w-3xl gap-0 overflow-hidden p-0 sm:max-w-3xl"
        aria-describedby="product-modal-desc"
      >
        <DialogTitle className="sr-only">{product.name}</DialogTitle>
        <DialogDescription id="product-modal-desc" className="sr-only">
          Podrobnosti izdelka {product.name}: opis, cena, atributi, kontakt
          prodajalca in možnost nakupa.
        </DialogDescription>

        <div className="scroll-area-custom max-h-[88vh] overflow-y-auto">
          {/* Velika slika */}
          <div className="relative aspect-video w-full overflow-hidden bg-muted">
            {image ? (
              <img
                src={image}
                alt={`${product.name} — slika ${activeImage + 1}`}
                className="size-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex size-full items-center justify-center text-5xl">
                <span aria-hidden="true">
                  {PRODUCT_CATEGORY_ICONS[product.category]}
                </span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

            {/* Badge kategorije */}
            <Badge className="absolute left-4 top-4 bg-primary text-primary-foreground shadow-sm">
              <span aria-hidden="true">
                {PRODUCT_CATEGORY_ICONS[product.category]}
              </span>
              {PRODUCT_CATEGORY_LABELS[product.category]}
            </Badge>

            {/* Featured badge */}
            {product.featured ? (
              <Badge className="absolute right-4 top-4 bg-amber-400 text-amber-950 shadow-sm">
                <Sparkles className="size-3" aria-hidden="true" />
                Izpostavljeno
              </Badge>
            ) : null}

            {/* Ime + lokacija */}
            <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold sm:text-3xl">{product.name}</h2>
                {product.verified ? (
                  <CheckCircle2
                    className="size-5 text-primary"
                    aria-label="Overjen izdelek"
                  />
                ) : null}
              </div>
              {product.destinationName ? (
                <p className="mt-1 flex items-center gap-1.5 text-sm text-white/90">
                  <MapPin className="size-3.5" aria-hidden="true" />
                  {product.destinationName}
                </p>
              ) : null}
            </div>
          </div>

          {/* Thumbnail strip (če več slik) */}
          {product.images.length > 1 ? (
            <div className="flex gap-2 overflow-x-auto border-b border-border/60 bg-muted/30 p-3">
              {product.images.map((img, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveImage(idx)}
                  aria-label={`Prikaži sliko ${idx + 1}`}
                  aria-pressed={idx === activeImage}
                  className={`relative size-16 shrink-0 overflow-hidden rounded-md border-2 transition-all ${
                    idx === activeImage
                      ? "border-primary ring-2 ring-primary/30"
                      : "border-transparent opacity-70 hover:opacity-100"
                  }`}
                >
                  <img
                    src={img}
                    alt=""
                    className="size-full object-cover"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          ) : null}

          {/* Vsebina */}
          <div className="space-y-6 p-5 sm:p-6">
            {/* Rating + cena */}
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <Star
                  className="size-4 fill-amber-400 text-amber-400"
                  aria-hidden="true"
                />
                <span className="text-sm font-semibold tabular-nums">
                  {product.rating.toFixed(1)}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({product.reviewCount} mnenj)
                </span>
              </div>

              <div className="text-right">
                <div className="flex items-center gap-2">
                  {discount > 0 ? (
                    <Badge className="bg-destructive text-destructive-foreground">
                      -{discount}%
                    </Badge>
                  ) : null}
                  <span className="text-2xl font-bold text-foreground">
                    {formatPrice(product.price, product.currency)}
                  </span>
                </div>
                {product.compareAtPrice ? (
                  <span className="text-sm text-muted-foreground line-through">
                    {formatPrice(product.compareAtPrice, product.currency)}
                  </span>
                ) : null}
              </div>
            </div>

            {/* Kratek opis */}
            <p className="text-sm leading-relaxed text-foreground/90">
              {product.description}
            </p>

            {/* Long description */}
            {product.longDescription ? (
              <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
                <p className="text-sm leading-relaxed text-foreground/80">
                  {product.longDescription}
                </p>
              </div>
            ) : null}

            {/* Grid 2x2 info */}
            <div className="grid grid-cols-2 gap-3">
              <InfoItem
                icon={Tag}
                label="Kategorija"
                value={PRODUCT_CATEGORY_LABELS[product.category]}
              />
              <InfoItem
                icon={MapPin}
                label="Lokacija"
                value={product.destinationName ?? "—"}
              />
              <InfoItem
                icon={Boxes}
                label="Zaloga"
                value={
                  product.stock > 0
                    ? `${product.stock} kosov`
                    : "Ni na zalogi"
                }
              />
              <InfoItem
                icon={Scale}
                label="Teža"
                value={product.weight ? `${product.weight} g` : "—"}
              />
            </div>

            {/* Atributi */}
            <section>
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Leaf className="size-4 text-primary" aria-hidden="true" />
                Atributi
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {product.organic ? (
                  <Badge className="bg-primary text-primary-foreground">
                    <Leaf className="size-3" aria-hidden="true" />
                    Ekološko
                  </Badge>
                ) : null}
                {product.handmade ? (
                  <Badge className="bg-blue-600 text-white">
                    <HandHeart className="size-3" aria-hidden="true" />
                    Ročna izdelava
                  </Badge>
                ) : null}
                {product.local ? (
                  <Badge variant="secondary">
                    <MapPin className="size-3" aria-hidden="true" />
                    Lokalno
                  </Badge>
                ) : null}
                {product.vegan ? (
                  <Badge variant="secondary">
                    <Leaf className="size-3" aria-hidden="true" />
                    Vegansko
                  </Badge>
                ) : null}
                {product.shippingFree ? (
                  <Badge className="bg-amber-400 text-amber-950">
                    <Truck className="size-3" aria-hidden="true" />
                    Brezplačna dostava
                  </Badge>
                ) : null}
                {product.shipsEurope ? (
                  <Badge variant="secondary">
                    <Globe className="size-3" aria-hidden="true" />
                    Dostava EU
                  </Badge>
                ) : null}
                {product.shipsWorldwide ? (
                  <Badge variant="secondary">
                    <Globe2 className="size-3" aria-hidden="true" />
                    Dostava svet
                  </Badge>
                ) : null}
              </div>
            </section>

            {/* Kontakt prodajalca */}
            <section>
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <ShoppingBag
                  className="size-4 text-primary"
                  aria-hidden="true"
                />
                Prodajalec
              </h3>
              <div className="mt-3 space-y-2">
                <p className="text-sm font-medium">{product.sellerName}</p>
                <div className="flex flex-wrap gap-2">
                  {product.sellerPhone ? (
                    <a
                      href={`tel:${product.sellerPhone.replace(/\s/g, "")}`}
                      className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-background px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <Phone className="size-4 text-primary" aria-hidden="true" />
                      {product.sellerPhone}
                    </a>
                  ) : null}
                  {product.sellerEmail ? (
                    <a
                      href={`mailto:${product.sellerEmail}`}
                      className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-background px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <Mail className="size-4 text-primary" aria-hidden="true" />
                      {product.sellerEmail}
                    </a>
                  ) : null}
                  {product.sellerWebsite ? (
                    <a
                      href={product.sellerWebsite}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-background px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <Globe className="size-4 text-primary" aria-hidden="true" />
                      Spletna stran
                      <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                  ) : null}
                </div>
              </div>
            </section>

            {/* Statistika */}
            <section className="grid grid-cols-2 gap-3">
              <StatCard
                icon={Eye}
                label="Ogledov"
                value={product.viewCount.toLocaleString("sl-SI")}
              />
              <StatCard
                icon={TrendingUp}
                label="Prodanih"
                value={product.saleCount.toLocaleString("sl-SI")}
              />
            </section>

            {/* CTA */}
            <div className="space-y-2">
              <Button
                type="button"
                size="lg"
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={product.stock <= 0}
                onClick={() => {
                  addItem({
                    productId: product.id,
                    name: product.name,
                    slug: product.slug,
                    price: product.price,
                    image: product.images[0] ?? "",
                    sellerName: product.sellerName,
                    shippingFree: product.shippingFree,
                    currency: product.currency,
                  });
                  // Zapri modal — košarica se odpre avtomatsko iz addItem
                  onClose();
                }}
              >
                <ShoppingBag className="size-4" aria-hidden="true" />
                {product.stock > 0 ? "Dodaj v košaro" : "Ni na zalogi"}
              </Button>
              {product.sellerWebsite ? (
                <Button
                  type="button"
                  asChild
                  variant="outline"
                  size="lg"
                  className="w-full"
                >
                  <a
                    href={product.sellerWebsite}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Globe className="size-4" aria-hidden="true" />
                    Spletna stran prodajalca
                    <ExternalLink className="size-4" aria-hidden="true" />
                  </a>
                </Button>
              ) : null}
            </div>

            {/* Source note */}
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Package className="size-3" aria-hidden="true" />
              Vir: Lokalni ponudnik
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* Pomožne komponente */

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

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Eye;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 p-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="text-sm font-semibold tabular-nums">{value}</div>
      </div>
    </div>
  );
}

export default ProductModal;
