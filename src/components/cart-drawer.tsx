"use client";

import * as React from "react";
import { useLocale } from "next-intl";
import {
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  Truck,
  X,
  ShoppingBag,
  ArrowRight,
} from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useCart, formatEUR, type CartItem } from "@/lib/cart-store";
import { CheckoutModal } from "@/components/checkout-modal";

const FREE_SHIPPING_THRESHOLD = 50;

// TASK 8 / F4-B (issue #8 Faza 4 — EN razširitev booking sklada): L-pattern
// slovar (SL+EN) za VES UI chrome košarice — vrstice, povzetki, CTA, arija,
// prazno stanje. RESNICA (§38): "Skupaj" ↔ "Total", "Brezplačna" ↔ "Free",
// "Vse cene so v EUR" ↔ "All prices are in EUR" — EXAKTNA ohranitev pomena.
// ZERO-LOSS: samo nizi, nobena logika/vedenje se ne spreminja.
const L = {
  a11y: {
    close: { sl: "Zapri košarico", en: "Close the cart" },
    removeItem: {
      sl: (name: string) => `Odstrani ${name}`,
      en: (name: string) => `Remove ${name}`,
    },
    decrease: {
      sl: (name: string) => `Zmanjšaj količino za ${name}`,
      en: (name: string) => `Decrease quantity of ${name}`,
    },
    increase: {
      sl: (name: string) => `Povečaj količino za ${name}`,
      en: (name: string) => `Increase quantity of ${name}`,
    },
  },
  header: {
    title: { sl: "Košarica", en: "Cart" },
    empty: { sl: "Prazna košarica", en: "Empty cart" },
    count: {
      sl: (n: number) =>
        `${n} ${n === 1 ? "izdelek" : n < 5 ? "izdelka" : "izdelkov"}`,
      en: (n: number) => `${n} ${n === 1 ? "item" : "items"}`,
    },
  },
  clear: { sl: "Izprazni košarico", en: "Clear cart" },
  shipping: {
    remainingPre: { sl: "Še", en: "Only" },
    remainingPost: {
      sl: "do brezplačne dostave",
      en: "away from free shipping",
    },
    unlocked: { sl: "Brezplačna dostava!", en: "Free shipping!" },
  },
  summary: {
    subtotal: { sl: "Vrednost izdelkov", en: "Subtotal" },
    shipping: { sl: "Dostava", en: "Shipping" },
    free: { sl: "Brezplačna", en: "Free" },
    total: { sl: "Skupaj", en: "Total" },
  },
  checkoutCta: { sl: "Zaključi nakup", en: "Checkout" },
  note: {
    sl: "Vse cene so v EUR. Dostava se obračuna pri plačilu.",
    en: "All prices are in EUR. Shipping is charged at payment.",
  },
  perPiece: { sl: "/ kos", en: "/ pc" },
  empty: {
    title: { sl: "Košarica je prazna", en: "Your cart is empty" },
    desc: {
      sl: "Brskajte po tržnici in dodajte slovenske izdelke.",
      en: "Browse the marketplace and add Slovenian products.",
    },
    cta: { sl: "Nazaj v tržnico", en: "Back to the marketplace" },
  },
};

/**
 * CartDrawer — stranski panel (Sheet) z vsebino košarice.
 * Odpre se iz navigation cart ikone ali pa avtomatsko ob addItem.
 * Gumb "Zaključi nakup" odpre CheckoutModal.
 */
export function CartDrawer() {
  // F4-B: jezik UI chroma (L-pattern, isti vzorec kot journey-planner).
  const locale = useLocale();
  const lang: "sl" | "en" = locale === "en" ? "en" : "sl";
  const isOpen = useCart((s) => s.isOpen);
  const setCartOpen = useCart((s) => s.setCartOpen);
  const items = useCart((s) => s.items);
  const removeItem = useCart((s) => s.removeItem);
  const updateQuantity = useCart((s) => s.updateQuantity);
  const clearCart = useCart((s) => s.clearCart);

  // Lokalno stanje za checkout modal — ne persisted
  const [checkoutOpen, setCheckoutOpen] = React.useState(false);

  const subtotal = useCart((s) => s.subtotal());
  const shipping = useCart((s) => s.shippingTotal());
  const total = useCart((s) => s.total());
  const count = useCart((s) => s.itemCount());

  const handleOpenChange = (open: boolean) => {
    setCartOpen(open);
  };

  const handleCheckout = () => {
    // Zapri drawer, odpri checkout
    setCartOpen(false);
    setCheckoutOpen(true);
  };

  const freeShippingProgress = Math.min(
    100,
    Math.round((subtotal / FREE_SHIPPING_THRESHOLD) * 100)
  );
  const remainingForFree = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);

  return (
    <>
      <Sheet open={isOpen} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
        >
          {/* Header */}
          <SheetHeader className="flex flex-row items-center justify-between gap-2 border-b border-border/60 p-4">
            <div className="flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
                <ShoppingCart className="size-4" aria-hidden="true" />
              </span>
              <div className="flex flex-col">
                <SheetTitle className="text-base font-bold">
                  {L.header.title[lang]}
                </SheetTitle>
                <SheetDescription className="text-xs">
                  {count === 0
                    ? L.header.empty[lang]
                    : L.header.count[lang](count)}
                </SheetDescription>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => setCartOpen(false)}
              aria-label={L.a11y.close[lang]}
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          </SheetHeader>

          {/* Body — scrollable */}
          {items.length === 0 ? (
            <EmptyCart onClose={() => setCartOpen(false)} />
          ) : (
            <div className="scroll-area-custom flex-1 overflow-y-auto px-4 py-3">
              <ul className="flex flex-col gap-3">
                {items.map((item) => (
                  <CartLine
                    key={item.productId}
                    item={item}
                    onUpdate={updateQuantity}
                    onRemove={removeItem}
                  />
                ))}
              </ul>

              <button
                type="button"
                onClick={clearCart}
                className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-destructive"
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                {L.clear[lang]}
              </button>
            </div>
          )}

          {/* Footer — sticky bottom */}
          {items.length > 0 ? (
            <div className="border-t border-border/60 bg-background p-4">
              {/* Free shipping progress */}
              {shipping > 0 ? (
                <div className="mb-3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Truck className="size-3.5" aria-hidden="true" />
                      {remainingForFree > 0 ? (
                        <>
                          {L.shipping.remainingPre[lang]}{" "}
                          <span className="font-semibold text-foreground">
                            {formatEUR(remainingForFree)}
                          </span>{" "}
                          {L.shipping.remainingPost[lang]}
                        </>
                      ) : (
                        L.shipping.unlocked[lang]
                      )}
                    </span>
                    <span className="tabular-nums">{freeShippingProgress}%</span>
                  </div>
                  <Progress value={freeShippingProgress} className="h-1.5" />
                </div>
              ) : null}

              {/* Povzetek cen */}
              <div className="space-y-1.5 text-sm">
                <Row label={L.summary.subtotal[lang]} value={formatEUR(subtotal)} />
                <Row
                  label={L.summary.shipping[lang]}
                  value={
                    shipping === 0 ? (
                      <span className="font-semibold text-primary">
                        {L.summary.free[lang]}
                      </span>
                    ) : (
                      formatEUR(shipping)
                    )
                  }
                />
                <Separator className="my-2" />
                <div className="flex items-center justify-between">
                  <span className="text-base font-semibold">{L.summary.total[lang]}</span>
                  <span className="text-xl font-bold tabular-nums text-foreground">
                    {formatEUR(total)}
                  </span>
                </div>
              </div>

              <Button
                type="button"
                size="lg"
                className="mt-3 w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={handleCheckout}
              >
                {L.checkoutCta[lang]}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>

              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                {L.note[lang]}
              </p>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Checkout modal — odprt iz košarice */}
      <CheckoutModal
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
      />
    </>
  );
}

/* ---------------- Pomožne komponente ---------------- */

function CartLine({
  item,
  onUpdate,
  onRemove,
}: {
  item: CartItem;
  onUpdate: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
}) {
  // F4-B: jezik UI chroma vrstice (isti L slovar kot drawer zgoraj)
  const locale = useLocale();
  const lang: "sl" | "en" = locale === "en" ? "en" : "sl";
  return (
    <li className="flex gap-3 rounded-lg border border-border/60 bg-background p-2.5">
      {/* Slika */}
      <div className="size-16 shrink-0 overflow-hidden rounded-md bg-muted">
        {item.image ? (
          <img
            src={item.image}
            alt={item.name}
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <ShoppingBag className="size-5" aria-hidden="true" />
          </div>
        )}
      </div>

      {/* Info + controls */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="line-clamp-1 text-sm font-semibold leading-tight">
              {item.name}
            </p>
            <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
              {item.sellerName}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onRemove(item.productId)}
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label={L.a11y.removeItem[lang](item.name)}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-1 flex items-center justify-between gap-2">
          {/* Quantity controls */}
          <div className="flex items-center rounded-md border border-border">
            <button
              type="button"
              onClick={() => onUpdate(item.productId, item.quantity - 1)}
              disabled={item.quantity <= 1}
              className="flex size-7 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              aria-label={L.a11y.decrease[lang](item.name)}
            >
              <Minus className="size-3.5" aria-hidden="true" />
            </button>
            <span
              className="min-w-7 text-center text-sm font-semibold tabular-nums"
              aria-live="polite"
            >
              {item.quantity}
            </span>
            <button
              type="button"
              onClick={() => onUpdate(item.productId, item.quantity + 1)}
              className="flex size-7 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label={L.a11y.increase[lang](item.name)}
            >
              <Plus className="size-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="flex flex-col items-end">
            <span className="text-sm font-bold tabular-nums text-foreground">
              {formatEUR(item.price * item.quantity)}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {formatEUR(item.price)} {L.perPiece[lang]}
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}

function EmptyCart({ onClose }: { onClose: () => void }) {
  // F4-B: jezik UI chroma praznega stanja (isti L slovar)
  const locale = useLocale();
  const lang: "sl" | "en" = locale === "en" ? "en" : "sl";
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-muted">
        <ShoppingBag className="size-7 text-muted-foreground" aria-hidden="true" />
      </span>
      <div>
        <p className="text-base font-semibold">{L.empty.title[lang]}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {L.empty.desc[lang]}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onClose}
        className="mt-2 gap-1.5"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden="true" />
        {L.empty.cta[lang]}
      </Button>
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="tabular-nums text-foreground">{value}</span>
    </div>
  );
}

export default CartDrawer;
