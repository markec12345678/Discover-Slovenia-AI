import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * CartItem — posamezen izdelek v košarici.
 * Vsi podatki so snapshot izdelka ob dodajanju (da košarica deluje tudi offline).
 */
export interface CartItem {
  productId: string;
  name: string;
  slug: string;
  price: number; // EUR
  image: string;
  quantity: number;
  sellerName: string;
  shippingFree: boolean;
  currency?: string;
}

interface CartState {
  items: CartItem[];
  isOpen: boolean;
  addItem: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  openCart: () => void;
  closeCart: () => void;
  setCartOpen: (open: boolean) => void;
  // Izračuni
  subtotal: () => number;
  shippingTotal: () => number;
  total: () => number;
  itemCount: () => number;
}

/**
 * Shipping logika:
 * - Brezplačno če je košarica prazna
 * - Brezplačno če je subtotal >= 50 EUR
 * - Brezplačno če VSI izdelki v košarici imajo shippingFree
 * - Drugače 4.90 EUR
 */
function computeShipping(items: CartItem[], subtotal: number): number {
  if (subtotal === 0) return 0;
  if (subtotal >= 50) return 0;
  if (items.length === 0) return 0;
  const allFree = items.every((i) => i.shippingFree);
  return allFree ? 0 : 4.9;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,

      addItem: (item, quantity = 1) =>
        set((state) => {
          const existing = state.items.find(
            (i) => i.productId === item.productId
          );
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.productId === item.productId
                  ? { ...i, quantity: i.quantity + quantity }
                  : i
              ),
              isOpen: true,
            };
          }
          return {
            items: [...state.items, { ...item, quantity }],
            isOpen: true,
          };
        }),

      removeItem: (productId) =>
        set((state) => ({
          items: state.items.filter((i) => i.productId !== productId),
        })),

      updateQuantity: (productId, quantity) =>
        set((state) => ({
          items: state.items
            .map((i) =>
              i.productId === productId
                ? { ...i, quantity: Math.max(0, quantity) }
                : i
            )
            .filter((i) => i.quantity > 0),
        })),

      clearCart: () => set({ items: [] }),

      openCart: () => set({ isOpen: true }),
      closeCart: () => set({ isOpen: false }),
      setCartOpen: (open) => set({ isOpen: open }),

      subtotal: () =>
        get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),

      shippingTotal: () => {
        const sub = get().subtotal();
        return computeShipping(get().items, sub);
      },

      total: () => get().subtotal() + get().shippingTotal(),

      itemCount: () =>
        get().items.reduce((sum, i) => sum + i.quantity, 0),
    }),
    {
      name: "discoverslovenia-cart",
      // Persistiramo samo items, ne pa tudi isOpen (drawer naj se odpre samo eksplicitno)
      partialize: (state) => ({ items: state.items }) as CartState,
    }
  )
);

/** Pomožna funkcija za formatiranje EUR cene. */
export function formatEUR(value: number): string {
  try {
    return new Intl.NumberFormat("sl-SI", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} €`;
  }
}
