// TASK 8 / F3-D (issue #8 — audit §4 "wishlist→trip auto-bridge"): ČISTA
// mostna plast "Priljubljene" → "Moja pot" / načrtovalnik.
//
// MOSTNA SEMANTIKA (ista meja kot planner-my-trip-strip.tsx — "NO silent AI"):
//   - PLAST ZBIRKE: razreši destinacije iz prostega besedila + preslikaj
//     vnose v predmete zbirke (dedup po `kind:refId`).
//   - NO AI generiranje, NO razporejanje: načrt sestavi uporabnik sam v
//     načrtovalniku ("Uporabi v načrtu" = predlog destinacij prek
//     `dai:my-trip-prefill`, ne tiha regeneracija).
//   - ISKREN fallback: nerazrešljivo besedilo destinacije ostane vidno
//     (surov tekst) BREZ prispevka k prefillu; globoka povezava vodi na
//     /trznica (wishlist tam živi).
//
// 0 React odvisnosti — čiste funkcije, unit-testabilne (bun test).

import { DESTINATIONS } from "@/lib/slovenia-data";
import { formatPrice } from "@/lib/marketplace-types";
import type { MyTripInput } from "@/lib/my-trip";
import type { WishlistEntry } from "@/lib/wishlist-storage";

/**
 * Preslikava wishlist vnosa → predmet zbirke "Moja pot".
 *
 * EXAKTNA kopija preslikave `wishlistTripItem` iz wishlist-sheet.tsx
 * (D8-D ročni most) — identiteta `kind:refId` (izkušnja/izdelek + ID
 * zapisa) MORA ostati enaka, da dedup deluje čez površine (srček v
 * tržnici + list priljubljenih + ta most). href je iskren fallback
 * /trznica (modal odpre openFromWishlist prek dogodka — globoke
 * povezave ni). Ne urejaj obeh kopij ločeno — glavni agent ju bo
 * konsolidiral na to funkcijo.
 */
export function wishlistTripItemOf(entry: WishlistEntry): MyTripInput {
  const subtitle = [
    entry.destination ?? undefined,
    entry.price !== null ? formatPrice(entry.price) : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    kind: entry.type,
    refId: entry.id,
    title: entry.name,
    subtitle: subtitle || undefined,
    href: "/trznica",
    image: entry.image ?? undefined,
    source: "priljubljene",
  };
}

/** Skupina destinacij iz "Priljubljenih" (za čipe s števci). */
export interface WishlistDestinationGroup {
  /** ID iz DESTINATIONS (T1 dataset) — undefined, če besedilo ni razrešljivo. */
  destinationId?: string;
  /** Iskreno ime: kanonično ime destinacije ALI surov tekst vnosa. */
  destinationName: string;
  count: number;
}

/**
 * Združi vnose "Priljubljenih" po destinaciji — prosti tekst
 * (`entry.destination`) se razreši proti DESTINATIONS z neobčutljivim
 * ujemanjem imena ALI slug-a (ista resolucija kot destinationIdOf v
 * planner-my-trip-strip, razširjena na prosto besedilo).
 *
 * Pravila:
 *   - razrešljivo besedilo → destinationId + kanonično ime (vnosi "Bled"
 *     in "bled" se združijo v isto skupino);
 *   - NERAZREŠLJIVO besedilo → destinationId undefined, iskreno ime =
 *     surov tekst (brez izmišljanja ID-jev — prefill ne dobi nič);
 *   - BREZ besedila → destinationId undefined, ime = drugaLabel
 *     ("Drugo"/"Other" glede na jezik klicatelja);
 *   - vrstni red: število padajoče (največja skupina prva).
 */
export function groupWishlistByDestination(
  entries: WishlistEntry[],
  otherLabel = "Drugo"
): WishlistDestinationGroup[] {
  const groups = new Map<string, WishlistDestinationGroup>();
  for (const entry of entries) {
    const raw = (entry.destination ?? "").trim();
    if (!raw) {
      const existing = groups.get("__none__");
      if (existing) {
        existing.count++;
      } else {
        groups.set("__none__", {
          destinationId: undefined,
          destinationName: otherLabel,
          count: 1,
        });
      }
      continue;
    }
    const needle = raw.toLowerCase();
    const dest = DESTINATIONS.find(
      (d) =>
        d.name.toLowerCase() === needle || d.slug.toLowerCase() === needle
    );
    if (dest) {
      const key = `id:${dest.id}`;
      const existing = groups.get(key);
      if (existing) {
        existing.count++;
      } else {
        groups.set(key, {
          destinationId: dest.id,
          destinationName: dest.name,
          count: 1,
        });
      }
    } else {
      // Iskren fallback: surov tekst kot ime, BREZ ID-ja (prefill ne
      // dobi tega prispevka; čip vodi na /trznica).
      const key = `raw:${needle}`;
      const existing = groups.get(key);
      if (existing) {
        existing.count++;
      } else {
        groups.set(key, {
          destinationId: undefined,
          destinationName: raw,
          count: 1,
        });
      }
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}
