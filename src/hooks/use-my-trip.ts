"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getMyTripItems,
  addMyTripItem,
  removeMyTripItem,
  subscribeMyTrip,
  myTripKey,
  type MyTripInput,
  type MyTripItem,
  type MyTripKind,
} from "@/lib/my-trip";

/**
 * useMyTrip — zbirka "Moja pot" (TASK 8 / D8-B).
 *
 * Odporen na hydration mismatch (SSR → prazno; prvi klientski render →
 * prazno; šele effect prebere localStorage — isti vzorec kot useWishlist /
 * useCart). Sinhronizacija prek subscribeMyTrip dogodkov (ista zavihek +
 * cross-tab).
 */
export function useMyTrip(): {
  items: MyTripItem[];
  count: number;
  isIn: (kind: MyTripKind, refId: string) => boolean;
  add: (input: MyTripInput) => ReturnType<typeof addMyTripItem>;
  remove: (kind: MyTripKind, refId: string) => void;
} {
  const [items, setItems] = useState<MyTripItem[]>([]);

  useEffect(() => {
    const sync = () => setItems(getMyTripItems());
    sync(); // začetno branje — samo na klientu (SSR effectov ni)
    return subscribeMyTrip(sync);
  }, []);

  const keys = useMemo(() => new Set(items.map((i) => myTripKey(i.kind, i.refId))), [items]);

  return {
    items,
    count: items.length,
    isIn: (kind, refId) => keys.has(myTripKey(kind, refId)),
    add: addMyTripItem,
    remove: removeMyTripItem,
  };
}
