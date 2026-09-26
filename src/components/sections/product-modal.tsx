"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { safeExternalHref } from "@/lib/external-url";
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
  Lightbulb,
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  PRODUCT_CATEGORY_LABELS,
  PRODUCT_CATEGORY_LABELS_EN,
  PRODUCT_CATEGORY_ICONS,
  formatPrice,
  type Product,
} from "@/lib/marketplace-types";
import { useCart } from "@/lib/cart-store";
import { trackFunnel } from "@/lib/funnel";
import { useToast } from "@/hooks/use-toast";
import { ReviewSection } from "@/components/review-section";
import { ImageLightbox } from "@/components/image-lightbox";
import { WishlistHeartButton } from "@/components/wishlist-sheet";


interface ProductModalProps {
  product: Product | null;
  onClose: () => void;
  /** Opcijsko: zamenja trenutni izdelek (uporablja "Morda vam je všeč"). */
  onSelect?: (product: Product) => void;
}

/**
 * §20 (1.97.0): AI priporočilo z razložljivo why vrstico — ne črn AI
 * ranking. `whySource: "deterministic"` pomeni, da vrstico ni curirala
 * AI, ampak jo je koda sestavila iz podatkov izdelka (UI pokaže
 * "(iz podatkov)").
 */
interface RecommendedProduct extends Product {
  why?: string;
  whySource?: "ai" | "deterministic";
}

interface RecommendationsResponse {
  products: RecommendedProduct[];
  total: number;
  source?: "ai" | "fallback" | "cache";
}

// TASK 8 / F4-B (issue #8 Faza 4 — EN razširitev booking sklada): L-pattern
// slovar (SL+EN) za VES UI chrome modala — toasti, oznake, spec nalepke,
// arija, CTA gumbi. Vsebina priporočil (why vrstica) je že dvojezična prek
// API lang parametra + next-intl (marketplace.recsWhy*). ZERO-LOSS: samo
// nizi, nobena logika/vedenje se ne spreminja.
const L = {
  a11y: {
    dialogDesc: {
      sl: (name: string) =>
        `Podrobnosti izdelka ${name}: opis, cena, atributi, kontakt prodajalca in možnost nakupa.`,
      en: (name: string) =>
        `Product details for ${name}: description, price, attributes, seller contact and purchase option.`,
    },
    verified: { sl: "Overjen izdelek", en: "Verified product" },
    openGallery: {
      sl: (n: number) => `Odpri galerijo slik (${n})`,
      en: (n: number) => `Open the image gallery (${n})`,
    },
    showImage: {
      sl: (n: number) => `Prikaži sliko ${n}`,
      en: (n: number) => `Show image ${n}`,
    },
    imageAlt: {
      sl: (name: string, n: number) => `${name} — slika ${n}`,
      en: (name: string, n: number) => `${name} — image ${n}`,
    },
    openProduct: {
      sl: (name: string) => `Odpri ${name}`,
      en: (name: string) => `Open ${name}`,
    },
  },
  toast: {
    outOfStockTitle: { sl: "Ni na zalogi", en: "Out of stock" },
    outOfStockDesc: {
      sl: "Ta izdelek je trenutno razprodan.",
      en: "This product is currently sold out.",
    },
    addedTitle: { sl: "Dodano v košarico", en: "Added to cart" },
    addedDesc: {
      sl: (name: string) => `${name} — košarica se je odprla na desni.`,
      en: (name: string) => `${name} — the cart just opened on the right.`,
    },
  },
  badge: {
    featured: { sl: "Izpostavljeno", en: "Featured" },
    organic: { sl: "Ekološko", en: "Organic" },
    handmade: { sl: "Ročna izdelava", en: "Handmade" },
    local: { sl: "Lokalno", en: "Local" },
    vegan: { sl: "Vegansko", en: "Vegan" },
    freeShipping: { sl: "Brezplačna dostava", en: "Free shipping" },
    shipsEU: { sl: "Dostava EU", en: "EU shipping" },
    shipsWorld: { sl: "Dostava svet", en: "Worldwide shipping" },
  },
  reviews: { sl: "mnenj", en: "reviews" },
  info: {
    category: { sl: "Kategorija", en: "Category" },
    location: { sl: "Lokacija", en: "Location" },
    stock: { sl: "Zaloga", en: "Stock" },
    weight: { sl: "Teža", en: "Weight" },
    pieces: {
      sl: (n: number) => `${n} kosov`,
      en: (n: number) => `${n} pieces`,
    },
  },
  attributes: { sl: "Atributi", en: "Attributes" },
  seller: {
    heading: { sl: "Prodajalec", en: "Seller" },
    website: { sl: "Spletna stran", en: "Website" },
    statsViews: { sl: "Ogledov", en: "Views" },
    statsSold: { sl: "Prodanih", en: "Sold" },
    visit: { sl: "Obišči prodajalca", en: "Visit seller" },
    inquire: {
      sl: "Povpraševanje pri prodajalcu",
      en: "Ask the seller",
    },
    mailtoSubject: {
      sl: (name: string) => `Povpraševanje: ${name}`,
      en: (name: string) => `Inquiry: ${name}`,
    },
    noContact: {
      sl: "Brez kontakt prodajalca",
      en: "No seller contact",
    },
  },
  cta: {
    addToCart: {
      sl: (price: string) => `V košarico — ${price}`,
      en: (price: string) => `Add to cart — ${price}`,
    },
    outOfStock: { sl: "Ni na zalogi", en: "Out of stock" },
  },
  source: { sl: "Vir: Lokalni ponudnik", en: "Source: Local provider" },
  recs: {
    title: { sl: "Morda vam je všeč", en: "You may also like" },
    similar: { sl: "Podobni", en: "Similar" },
    aiTitle: {
      sl: "AI (GLM) je izbral ta priporočila",
      en: "AI (GLM) picked these recommendations",
    },
    similarTitle: {
      sl: "Podobni izdelki (fallback)",
      en: "Similar products (fallback)",
    },
  },
};

/**
 * ProductModal — podrobnosti izdelka iz tržnice.
 * Prikazuje veliko sliko, opis, atribute, kontakt prodajalca in CTA.
 * Na dnu je "Morda vam je všeč" z 4 podobnimi izdelki (ista kategorija/destinacija).
 */
export function ProductModal({ product, onClose, onSelect }: ProductModalProps) {
  // F4-B: jezik UI chroma (vsebina priporočil uporablja `locale` spodaj).
  const locale = useLocale();
  const lang: "sl" | "en" = locale === "en" ? "en" : "sl";
  const [activeImage, setActiveImage] = useState(0);
  // FW2-B: celozaslonska galerija (lightbox) nad modalom
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const addItem = useCart((s) => s.addItem);
  const { toast } = useToast();

  const handleAddToCart = (p: Product) => {
    if (p.stock <= 0) {
      toast({
        title: L.toast.outOfStockTitle[lang],
        description: L.toast.outOfStockDesc[lang],
        variant: "destructive",
      });
      return;
    }
    addItem({
      productId: p.id,
      name: p.name,
      slug: p.slug,
      price: p.price,
      image: p.images[0] ?? "",
      sellerName: p.sellerName,
      shippingFree: p.shippingFree,
      currency: p.currency,
    });
    trackFunnel("add_to_cart");
    toast({
      title: L.toast.addedTitle[lang],
      description: L.toast.addedDesc[lang](p.name),
    });
  };

  // Reset aktivne slike in lightboxa ko se spremeni izdelek (render-phase check, brez effect-a)
  const prevProductId = useRef<string | undefined>(undefined);
  if (prevProductId.current !== product?.id) {
    prevProductId.current = product?.id;
    if (activeImage !== 0) {
      setActiveImage(0);
    }
    if (lightboxOpen) {
      setLightboxOpen(false);
    }
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  // Priporočila — pridobi ko se product spremeni.
  // §20: pošljemo lang, da strežnik izbere jezikovno različico why
  // vrstice (cache hrani obe — prvi obiskovalec ne zaključi jezika).
  const [recommendations, setRecommendations] = useState<RecommendedProduct[]>([]);
  const [recLoading, setRecLoading] = useState(false);
  const [recError, setRecError] = useState<boolean>(false);
  const [recSource, setRecSource] = useState<"ai" | "fallback" | "cache">("ai");

  const fetchRecommendations = useCallback(async (productId: string) => {
    setRecLoading(true);
    setRecError(false);
    try {
      const res = await fetch(
        `/api/recommendations/products?productId=${encodeURIComponent(
          productId
        )}&limit=4&lang=${locale === "en" ? "en" : "sl"}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error("Napaka pri priporočilih");
      const data: RecommendationsResponse = await res.json();
      setRecommendations(data.products ?? []);
      setRecSource(data.source ?? "fallback");
    } catch {
      setRecError(true);
      setRecommendations([]);
    } finally {
      setRecLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    if (product?.id) {
      fetchRecommendations(product.id);
    } else {
      setRecommendations([]);
      setRecError(false);
    }
  }, [product?.id, fetchRecommendations, product]);

  if (!product) {
    return (
      <Dialog open={false} onOpenChange={handleOpenChange}>
        <DialogContent />
      </Dialog>
    );
  }

  const image = product.images[activeImage] ?? product.images[0];

  // Število veljavnih galerijskih slik (preskoči morebitne prazne vnose) —
  // ulovač klikov se izriše le, če lightbox dejansko ima kaj pokazati
  const galleryCount = product.images.filter(
    (src) => src.trim().length > 0
  ).length;

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
          {L.a11y.dialogDesc[lang](product.name)}
        </DialogDescription>

        <div className="scroll-area-custom max-h-[88vh] overflow-y-auto">
          {/* Velika slika — klik odpre celozaslonsko galerijo (lightbox) */}
          <div className="relative aspect-video w-full overflow-hidden bg-muted">
            {image ? (
              <img
                src={image}
                alt={L.a11y.imageAlt[lang](product.name, activeImage + 1)}
                className="size-full object-cover"
                loading="lazy"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <div className="flex size-full items-center justify-center text-5xl">
                <span aria-hidden="true">
                  {PRODUCT_CATEGORY_ICONS[product.category]}
                </span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

            {/* Badge kategorije + izpostavljeno (top-left) — top-right je rezerviran za srček (ob X gumbu) */}
            <div className="absolute left-4 top-4 flex flex-col items-start gap-2">
              <Badge className="bg-primary text-primary-foreground shadow-sm">
                <span aria-hidden="true">
                  {PRODUCT_CATEGORY_ICONS[product.category]}
                </span>
                {lang === "en"
                  ? PRODUCT_CATEGORY_LABELS_EN[product.category]
                  : PRODUCT_CATEGORY_LABELS[product.category]}
              </Badge>
              {product.featured ? (
                <Badge className="bg-amber-400 text-amber-950 shadow-sm">
                  <Sparkles className="size-3" aria-hidden="true" />
                  {L.badge.featured[lang]}
                </Badge>
              ) : null}
            </div>

            {/* Srček — shrani med priljubljene (ne odpre lightboxa) */}
            <WishlistHeartButton
              variant="modal"
              entry={{
                id: product.id,
                type: "product",
                name: product.name,
                image: product.images[0] ?? null,
                price: product.price,
                destination: product.destinationName ?? null,
                slug: product.slug,
              }}
            />

            {/* Ime + lokacija */}
            <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold sm:text-3xl">{product.name}</h2>
                {product.verified ? (
                  <CheckCircle2
                    className="size-5 text-primary"
                    aria-label={L.a11y.verified[lang]}
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

            {/*
              Prosojni ulovač klikov čez celo hero sliko (zadnji v drevesu,
              brez z-index): srček (z-[2]) leži nad njim, X gumb DialogContenta
              (kasnejši v drevesu, isti stacking level) pa ostane klikljiv.
            */}
            {galleryCount > 0 ? (
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                aria-label={L.a11y.openGallery[lang](galleryCount)}
                className="absolute inset-0 cursor-zoom-in"
              />
            ) : null}
          </div>

          {/* Thumbnail strip (če več slik) */}
          {product.images.length > 1 ? (
            <div className="flex gap-2 overflow-x-auto border-b border-border/60 bg-muted/30 p-3">
              {product.images.map((img, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveImage(idx)}
                  aria-label={L.a11y.showImage[lang](idx + 1)}
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
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
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
                {product.reviewCount > 0 && (
                  <>
                    <Star
                      className="size-4 fill-amber-400 text-amber-400"
                      aria-hidden="true"
                    />
                    <span className="text-sm font-semibold tabular-nums">
                      {product.rating.toFixed(1)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({product.reviewCount} {L.reviews[lang]})
                    </span>
                  </>
                )}
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
                label={L.info.category[lang]}
                value={
                  lang === "en"
                    ? PRODUCT_CATEGORY_LABELS_EN[product.category]
                    : PRODUCT_CATEGORY_LABELS[product.category]
                }
              />
              <InfoItem
                icon={MapPin}
                label={L.info.location[lang]}
                value={product.destinationName ?? "—"}
              />
              <InfoItem
                icon={Boxes}
                label={L.info.stock[lang]}
                value={
                  product.stock > 0
                    ? L.info.pieces[lang](product.stock)
                    : L.cta.outOfStock[lang]
                }
              />
              <InfoItem
                icon={Scale}
                label={L.info.weight[lang]}
                value={product.weight ? `${product.weight} g` : "—"}
              />
            </div>

            {/* Atributi */}
            <section>
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Leaf className="size-4 text-primary" aria-hidden="true" />
                {L.attributes[lang]}
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {product.organic ? (
                  <Badge className="bg-primary text-primary-foreground">
                    <Leaf className="size-3" aria-hidden="true" />
                    {L.badge.organic[lang]}
                  </Badge>
                ) : null}
                {product.handmade ? (
                  <Badge className="bg-blue-600 text-white">
                    <HandHeart className="size-3" aria-hidden="true" />
                    {L.badge.handmade[lang]}
                  </Badge>
                ) : null}
                {product.local ? (
                  <Badge variant="secondary">
                    <MapPin className="size-3" aria-hidden="true" />
                    {L.badge.local[lang]}
                  </Badge>
                ) : null}
                {product.vegan ? (
                  <Badge variant="secondary">
                    <Leaf className="size-3" aria-hidden="true" />
                    {L.badge.vegan[lang]}
                  </Badge>
                ) : null}
                {product.shippingFree ? (
                  <Badge className="bg-amber-400 text-amber-950">
                    <Truck className="size-3" aria-hidden="true" />
                    {L.badge.freeShipping[lang]}
                  </Badge>
                ) : null}
                {product.shipsEurope ? (
                  <Badge variant="secondary">
                    <Globe className="size-3" aria-hidden="true" />
                    {L.badge.shipsEU[lang]}
                  </Badge>
                ) : null}
                {product.shipsWorldwide ? (
                  <Badge variant="secondary">
                    <Globe2 className="size-3" aria-hidden="true" />
                    {L.badge.shipsWorld[lang]}
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
                {L.seller.heading[lang]}
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
                      href={safeExternalHref(product.sellerWebsite)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-background px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <Globe className="size-4 text-primary" aria-hidden="true" />
                      {L.seller.website[lang]}
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
                label={L.seller.statsViews[lang]}
                value={product.viewCount.toLocaleString(
                  lang === "en" ? "en-US" : "sl-SI"
                )}
              />
              <StatCard
                icon={TrendingUp}
                label={L.seller.statsSold[lang]}
                value={product.saleCount.toLocaleString(
                  lang === "en" ? "en-US" : "sl-SI"
                )}
              />
            </section>

            {/* UGC mnenja obiskovalcev (ločeno od demo ratinga) */}
            <ReviewSection key={product.id} productId={product.id} />

            {/* CTA — nakup prek naše tržnice (košarica) ali priprava do prodajalca */}
            <div className="space-y-2">
              <Button
                type="button"
                size="lg"
                disabled={product.stock <= 0}
                className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => handleAddToCart(product)}
              >
                <ShoppingBag className="size-4" aria-hidden="true" />
                {product.stock > 0
                  ? L.cta.addToCart[lang](
                      formatPrice(product.price, product.currency)
                    )
                  : L.cta.outOfStock[lang]}
              </Button>
              <Button
                type="button"
                asChild
                size="lg"
                variant="outline"
                className="w-full"
              >
                {product.sellerWebsite ? (
                  <a
                    href={safeExternalHref(product.sellerWebsite)}
                    target="_blank"
                    rel="noopener noreferrer sponsored"
                  >
                    <ExternalLink className="size-4" aria-hidden="true" />
                    {L.seller.visit[lang]}
                  </a>
                ) : product.sellerEmail ? (
                  <a
                    href={`mailto:${product.sellerEmail}?subject=${encodeURIComponent(
                      L.seller.mailtoSubject[lang](product.name)
                    )}`}
                  >
                    <Mail className="size-4" aria-hidden="true" />
                    {L.seller.inquire[lang]}
                  </a>
                ) : (
                  <span className="opacity-60 cursor-not-allowed">
                    <Package className="size-4" aria-hidden="true" />
                    {L.seller.noContact[lang]}
                  </span>
                )}
              </Button>
            </div>

            {/* Morda vam je všeč — AI priporočila */}
            <RecommendationsSection
              loading={recLoading}
              error={recError}
              items={recommendations}
              currentId={product.id}
              onSelect={onSelect}
              source={recSource}
            />

            {/* Source note */}
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Package className="size-3" aria-hidden="true" />
              {L.source[lang]}
            </p>
          </div>
        </div>

        {/*
          FW2-B: celozaslonska galerija — Radix Dialog portala na body, zato
          njegova pozicija v drevesu ne vpliva na layout modalov. Indeksi so
          surovi (isti kot activeImage), da modal po zaprtju lightboxa pokaže
          zadnjo gledano sliko.
        */}
        <ImageLightbox
          images={product.images}
          activeIndex={activeImage}
          onActiveIndexChange={setActiveImage}
          open={lightboxOpen}
          onOpenChange={setLightboxOpen}
          altPrefix={product.name}
        />
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

/**
 * RecommendationsSection — "Morda vam je všeč".
 * Prikazuje do 4 AI-priporočene podobne izdelke (GLM izbere iz 10 kandidatov).
 * Klik na kartico zamenja trenutni izdelek v modalu (preko onSelect).
 * `source` prikaže transparenten badge (AI / fallback / cache).
 * §20 (1.97.0): pod imenom vsake kartice je ENA iskrena vrstica
 * "Zakaj: {why}" (samo dejstva iz kandidata) + droben izvor
 * "(iz podatkov)", kadar vrstico ni curirala AI (whySource
 * "deterministic") — priporočilo ni črn AI ranking.
 */
function RecommendationsSection({
  loading,
  error,
  items,
  currentId,
  onSelect,
  source,
}: {
  loading: boolean;
  error: boolean;
  items: RecommendedProduct[];
  currentId: string;
  onSelect?: (product: Product) => void;
  source?: "ai" | "fallback" | "cache";
}) {
  // §20: prevodi why vrstice — komponenta sicer nosi hardcoded SL besedila
  // (tržnica je slovenska površina), a why vrstica je NEW površina in
  // kolektor-modal živi TUDI na dvojezičnih sekcijah → zato next-intl
  // (namespace marketplace).
  const t = useTranslations("marketplace");
  // F4-B: L-pattern za chrome naslova/oddpisa priporočil (isti slovar L zgoraj)
  const locale = useLocale();
  const lang: "sl" | "en" = locale === "en" ? "en" : "sl";
  const visible = items.filter((p) => p.id !== currentId).slice(0, 4);
  const isAI = source === "ai" || source === "cache";

  const sourceLabel = isAI ? "AI" : L.recs.similar[lang];

  if (loading) {
    return (
      <section aria-label={L.recs.title[lang]}>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Lightbulb className="size-4 text-primary" aria-hidden="true" />
          {L.recs.title[lang]}
          <Badge variant="secondary" className="ml-auto gap-1 text-[10px]">
            <Sparkles className="size-2.5" aria-hidden="true" />
            AI
          </Badge>
        </h3>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-lg border border-border/60"
            >
              <Skeleton className="aspect-square w-full" />
              <div className="space-y-1.5 p-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  // Tiho ignoriraj napake — priporočila so "nice to have".
  if (error || visible.length === 0) return null;

  return (
    <section aria-label={L.recs.title[lang]}>
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Lightbulb className="size-4 text-primary" aria-hidden="true" />
        {L.recs.title[lang]}
        <Badge
          variant={isAI ? "default" : "secondary"}
          className="ml-auto gap-1 text-[10px]"
          title={
            isAI ? L.recs.aiTitle[lang] : L.recs.similarTitle[lang]
          }
        >
          {isAI ? <Sparkles className="size-2.5" aria-hidden="true" /> : null}
          {sourceLabel}
        </Badge>
      </h3>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {visible.map((p) => {
          const img = p.images[0];
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect?.(p)}
              className="group flex flex-col overflow-hidden rounded-lg border border-border/60 bg-background text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              aria-label={L.a11y.openProduct[lang](p.name)}
            >
              <div className="relative aspect-square w-full overflow-hidden bg-muted">
                {img ? (
                  <img
                    src={img}
                    alt={p.name}
                    className="size-full object-cover transition-transform group-hover:scale-105"
                    loading="lazy"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-3xl">
                    <span aria-hidden="true">
                      {PRODUCT_CATEGORY_ICONS[p.category]}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1 p-2">
                <h4 className="line-clamp-1 text-xs font-semibold">
                  {p.name}
                </h4>
                {/* §20: ena iskrena vrstica razloga (samo dejstva iz
                    kandidata) — stilsko enaka meta vrstici kartice */}
                {p.why ? (
                  <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                    {t("recsWhy", { why: p.why })}
                    {p.whySource === "deterministic" ? (
                      <span title={t("recsWhyFromDataTitle")}>
                        {` ${t("recsWhyFromData")}`}
                      </span>
                    ) : null}
                  </p>
                ) : null}
                <div className="mt-auto flex items-center justify-between gap-1">
                  <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                    <Star
                      className="size-3 fill-amber-400 text-amber-400"
                      aria-hidden="true"
                    />
                    <span className="tabular-nums">{p.rating.toFixed(1)}</span>
                  </span>
                  <span className="text-xs font-bold text-foreground">
                    {formatPrice(p.price, p.currency)}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default ProductModal;
