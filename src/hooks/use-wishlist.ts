"use client";

import { useEffect, useState } from "react";

import {
  getWishlist,
  subscribeWishlist,
  type WishlistEntry,
} from "@/lib/wishlist-storage";

/**
 * useWishlist — seznam "Priljubljene" (localStorage `dai:my-wishlist`).
 *
 * Odporen na hydration mismatch (SSR → prazno; prvi klientski render →
 * prazno; šele effect prebere localStorage — isti vzorec kot useMyTrip /
 * useCart / useWishlist v wishlist-sheet). Sinhronizacija prek
 * subscribeWishlist dogodkov (ista zavihek + cross-tab).
 *
 * TASK 8 / F3-D: javna različica zasebnega hooka iz wishlist-sheet.tsx —
 * most "Iz priljubljenih" (MyTripView) in prihodnje površine berejo isti
 * vir resnice, ne lastne kopije stanja.
 */
export function useWishlist(): { entries: WishlistEntry[]; count: number } {
  const [entries, setEntries] = useState<WishlistEntry[]>([]);

  useEffect(() => {
    const sync = () => setEntries(getWishlist());
    sync(); // začetno branje — samo na klientu (SSR effectov ni)
    return subscribeWishlist(sync);
  }, []);

  return { entries, count: entries.length };
}
