// TASK 8 / F3-A (issue #8 §43 NO PARALLEL APP + §40 ena vidna življenjska
// doba poti): USKLADITEV OGLEDALA IZBIR /potovanje ↔ zbirka "Moja pot".
//
// Problem (D8-A/38-a §1f — DVA DRIFTA):
//  - DRIFT A: novo iskanje na /potovanje pobriše `selected` (React state),
//    predmeti, ki so bili prek write-through dodani v zbirko "Moja pot",
//    pa ostanejo → /moja-potovanja pravi "V moji poti", /potovanje pa ne.
//  - DRIFT B: odstranitev predmeta iz zbirke (npr. /moja-potovanja, drug
//    zavihek) NE odstrani izbire na /potovanje → gumb kartice pravi
//    "V moji poti", zbirka pa ga nima več.
//  - BONUS: `selected` je bil čisti React state — izgubil se je ob vsakem
//    osvežitvi strani (go-persist.ts:4 priznava), čeprav so bile izbire
//    "shranjene" v zbirki.
//
// Rešitev (Google Maps „Want to go" vzorec — zbirka je resnica ogledala):
// za produkte AKTUALNEGA potovanja velja selected ⟺ v zbirki (kind:refId).
// Dogodki so iz zbirke IZKLJUČENI po namenu (D8-D: informacijski, brez
// nakupa vstopnic) → ostanejo session-only in se prenesijo iz prejšnje
// izbire, če so še v aktualnem potovanju. Predmeti, ki v novem potovanju
// niso prisotni, iz izbire odpadejo — a OSTANEJO v zbirki (zbirka ≠ izbira:
// dodaj sloj ostane, razporejanje/iskanje je površinsko).
//
// Čista funkcija (0 odvisnosti od Reacta) — unit-testabilna po vzorcu
// src/lib/supply/my-trip-item.ts.

import { supplyTripKind } from "@/lib/supply/my-trip-item";
import type { MyTripKind } from "@/lib/my-trip";
import type { JourneyProduct } from "@/lib/journey/types";

/** Ali je produkt potovanja informacijski dogodek (izven zbirke)? */
export function isJourneyEventProduct(p: JourneyProduct): boolean {
  return p.provider === "events";
}

/**
 * Uskladi izbiro z zbirko "Moja pot" za produkte AKTUALNEGA potovanja:
 *
 *  - produkt (ne-dogodek) je izbran ⟺ isInMyTrip(supplyTripKind(type), id);
 *  - dogodek ostaja izbran, če je bil izbran prej IN je v aktualnem
 *    potovanju (session-only ogledalo — zbirka dogodkov NE nosi);
 *  - ID-ji, ki v aktualnem potovanju ne obstajajo več, odpadejo iz izbire
 *    (v zbirki pa ostanejo — to je njihov dom).
 *
 * Vrača NOVO množico; če ni spremembe, vrne `previous` (isto referenco —
 * React setState bailout, brez odvečnih re-renderjev).
 */
export function reconcileSelectionFromCollection(
  previous: ReadonlySet<string>,
  products: readonly JourneyProduct[],
  inCollection: (kind: MyTripKind, refId: string) => boolean
): ReadonlySet<string> {
  const next = new Set<string>();
  let changed = false;

  for (const p of products) {
    if (isJourneyEventProduct(p)) {
      // Dogodki: session-only — prenesejo se iz prejšnje izbire.
      if (previous.has(p.id)) next.add(p.id);
      continue;
    }
    if (inCollection(supplyTripKind(p.type), p.id)) next.add(p.id);
  }

  if (next.size !== previous.size) changed = true;
  else {
    for (const id of next) {
      if (!previous.has(id)) {
        changed = true;
        break;
      }
    }
  }

  return changed ? next : previous;
}
