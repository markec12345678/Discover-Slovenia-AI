"use client";

import * as React from "react";
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

/**
 * CartDrawer — stranski panel (Sheet) z vsebino košarice.
 * Odpre se iz navigation cart ikone ali pa avtomatsko ob addItem.
 * Gumb "Zaključi nakup" odpre CheckoutModal.
 */
export function CartDrawer() {
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
                  Košarica
                </SheetTitle>
                <SheetDescription className="text-xs">
                  {count === 0
                    ? "Prazna košarica"
                    : `${count} ${count === 1 ? "izdelek" : count < 5 ? "izdelka" : "izdelkov"}`}
                </SheetDescription>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => setCartOpen(false)}
              aria-label="Zapri košarico"
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
                Izprazni košarico
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
                          Še{" "}
                          <span className="font-semibold text-foreground">
                            {formatEUR(remainingForFree)}
                          </span>{" "}
                          do brezplačne dostave
                        </>
                      ) : (
                        "Brezplačna dostava!"
                      )}
                    </span>
                    <span className="tabular-nums">{freeShippingProgress}%</span>
                  </div>
                  <Progress value={freeShippingProgress} className="h-1.5" />
                </div>
              ) : null}

              {/* Povzetek cen */}
              <div className="space-y-1.5 text-sm">
                <Row label="Vrednost izdelkov" value={formatEUR(subtotal)} />
                <Row
                  label="Dostava"
                  value={
                    shipping === 0 ? (
                      <span className="font-semibold text-primary">
                        Brezplačna
                      </span>
                    ) : (
                      formatEUR(shipping)
                    )
                  }
                />
                <Separator className="my-2" />
                <div className="flex items-center justify-between">
                  <span className="text-base font-semibold">Skupaj</span>
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
                Zaključi nakup
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>

              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                Vse cene so v EUR. Dostava se obračuna pri plačilu.
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
            aria-label={`Odstrani ${item.name}`}
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
              aria-label={`Zmanjšaj količino za ${item.name}`}
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
              aria-label={`Povečaj količino za ${item.name}`}
            >
              <Plus className="size-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="flex flex-col items-end">
            <span className="text-sm font-bold tabular-nums text-foreground">
              {formatEUR(item.price * item.quantity)}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {formatEUR(item.price)} / kos
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}

function EmptyCart({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-muted">
        <ShoppingBag className="size-7 text-muted-foreground" aria-hidden="true" />
      </span>
      <div>
        <p className="text-base font-semibold">Košarica je prazna</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Brskajte po tržnici in dodajte slovenske izdelke.
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
        Nazaj v tržnico
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
