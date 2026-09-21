import type { Destination } from "@/lib/types";

/**
 * TASK 69 (P2): načini razvrščanja destinacij v mreži.
 *
 * - "recommended" — uredniški vrstni red podatkov (privzeto; enak
 *   dosedanjemu prikazu, torej ni reverzije obstoječega obnašanja).
 * - "rating" — uredniška ocena padajoče (zaupanje v sredini je ocena,
 *   ne ugibanje).
 * - "price" — strošek na osebo naraščajoče (costPerPerson je preverjeno
 *   število iz slovenia-data; 0/NaN destinacij ne obstaja — testi).
 *
 * Čista funkcija: ne mutira vhoda (slice pred sortiranjem), odločitne
 * izenačitve (rating/cena) se razrešijo deterministično — najprej
 * sekundarni kriterij, nato ime (localeCompare) — tako je vrstni red
 * enak v vseh izvajalnih okoljih.
 */
export type DestinationsSort = "recommended" | "rating" | "price";

/** Vsi podpirani načini ( vrstni red = vrstni red v UI segmentu). */
export const DESTINATIONS_SORT_OPTIONS: DestinationsSort[] = [
  "recommended",
  "rating",
  "price",
];

export function isDestinationsSort(v: unknown): v is DestinationsSort {
  return (
    v === "recommended" || v === "rating" || v === "price"
  );
}

/**
 * Razvrsti kopijo seznama destinacij po izbranem načinu.
 * Vedno vrača NOVO polje; vhod ostane nedotaknjen.
 */
export function sortDestinations<T extends Destination>(
  list: readonly T[],
  sort: DestinationsSort
): T[] {
  const copy = list.slice();
  switch (sort) {
    case "rating":
      return copy.sort(
        (a, b) =>
          b.rating - a.rating ||
          a.costPerPerson - b.costPerPerson ||
          a.name.localeCompare(b.name)
      );
    case "price":
      return copy.sort(
        (a, b) =>
          a.costPerPerson - b.costPerPerson ||
          b.rating - a.rating ||
          a.name.localeCompare(b.name)
      );
    case "recommended":
    default:
      // Uredniški vrstni red = vrstni red v podatkovnem viru (stabilno).
      return copy;
  }
}
