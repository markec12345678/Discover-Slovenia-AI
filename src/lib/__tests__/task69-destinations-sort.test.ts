import { describe, expect, test } from "bun:test";
import { DESTINATIONS } from "@/lib/slovenia-data";
import type { Destination } from "@/lib/types";
import {
  DESTINATIONS_SORT_OPTIONS,
  isDestinationsSort,
  sortDestinations,
} from "@/lib/destinations-sort";

/**
 * TASK 69 (P2): testi razvrščanja destinacij.
 *
 * Fixture: realni podatki (slovenia-data) + sintetični izolirani primeri
 * za izenačitve (isti rating / ista cena), ker med realnimi podatki
 * izenačitve na PRIMARNEM kriteriju obstajajo, sekundarne vezi pa želimo
 * dokazati izrecno in deterministično.
 */

function mkDest(overrides: Partial<Destination>): Destination {
  return {
    id: "x",
    slug: "x",
    name: "X",
    tagline: "",
    region: "gorenjska",
    country: "SI",
    type: "lake",
    description: "",
    highlights: [],
    activities: [],
    bestFor: [],
    bestSeason: ["summer"],
    image: "",
    coords: { lat: 46, lng: 14 },
    rating: 4.5,
    budget: "€",
    duration: "2 uri",
    costPerPerson: 20,
    featured: false,
    ...overrides,
  };
}

describe("TASK 69 — sortDestinations (čista logika)", () => {
  test("recommended ohranja uredniški vrstni red (identičen seznam)", () => {
    const sorted = sortDestinations(DESTINATIONS, "recommended");
    expect(sorted.map((d) => d.id)).toEqual(
      DESTINATIONS.map((d) => d.id)
    );
  });

  test("rating — padajoče po uredniški oceni", () => {
    const sorted = sortDestinations(DESTINATIONS, "rating");
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i - 1].rating).toBeGreaterThanOrEqual(sorted[i].rating);
    }
  });

  test("price — naraščajoče po ceni na osebo", () => {
    const sorted = sortDestinations(DESTINATIONS, "price");
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i - 1].costPerPerson).toBeLessThanOrEqual(
        sorted[i].costPerPerson
      );
    }
  });

  test("NE mutira vhodnega seznama (čista funkcija)", () => {
    const before = DESTINATIONS.map((d) => d.id).join(",");
    const input = DESTINATIONS.slice();
    sortDestinations(input, "rating");
    sortDestinations(input, "price");
    expect(input.map((d) => d.id).join(",")).toBe(before);
    expect(DESTINATIONS.map((d) => d.id).join(",")).toBe(before);
  });

  test("prazen seznam → prazen seznam za vse načine", () => {
    for (const s of DESTINATIONS_SORT_OPTIONS) {
      expect(sortDestinations([], s)).toEqual([]);
    }
  });

  test("ena destinacija → isti en element", () => {
    const one = [mkDest({ id: "solo", name: "Solo" })];
    for (const s of DESTINATIONS_SORT_OPTIONS) {
      expect(sortDestinations(one, s).map((d) => d.id)).toEqual(["solo"]);
    }
  });

  test("izenačitev ratinga → cena naraščajoče, nato ime", () => {
    const a = mkDest({ id: "a", name: "Bled", rating: 4.8, costPerPerson: 40 });
    const b = mkDest({ id: "b", name: "Piran", rating: 4.8, costPerPerson: 20 });
    const c = mkDest({ id: "c", name: "Soča", rating: 4.8, costPerPerson: 20 });
    // b in c: isti rating, ista cena → ime ("Piran" < "Soča")
    const sorted = sortDestinations([a, b, c], "rating");
    expect(sorted.map((d) => d.id)).toEqual(["b", "c", "a"]);
  });

  test("izenačitev cene → rating padajoče, nato ime", () => {
    const a = mkDest({ id: "a", name: "Zzz", rating: 4.5, costPerPerson: 30 });
    const b = mkDest({ id: "b", name: "Aaa", rating: 4.9, costPerPerson: 30 });
    const c = mkDest({ id: "c", name: "Mmm", rating: 4.7, costPerPerson: 30 });
    const sorted = sortDestinations([a, b, c], "price");
    expect(sorted.map((d) => d.id)).toEqual(["b", "c", "a"]);
  });

  test("determinizem: dvojni klic da identičen vrstni red", () => {
    const s1 = sortDestinations(DESTINATIONS, "price").map((d) => d.id);
    const s2 = sortDestinations(DESTINATIONS, "price").map((d) => d.id);
    expect(s1).toEqual(s2);
    expect(s1.length).toBe(DESTINATIONS.length);
    // Permutacija: vsak id se pojavi točno enkrat
    expect(new Set(s1).size).toBe(DESTINATIONS.length);
  });

  test("vsi realni podatki imajo veljavne številke (predpogoj sortiranja)", () => {
    for (const d of DESTINATIONS) {
      expect(Number.isFinite(d.rating)).toBe(true);
      expect(d.rating).toBeGreaterThan(0);
      expect(Number.isFinite(d.costPerPerson)).toBe(true);
      expect(d.costPerPerson).toBeGreaterThan(0);
    }
  });

  test("integracija: filter (proračun €) + sort price ostane znotraj filtrirane množice", () => {
    const cheap = DESTINATIONS.filter((d) => d.budget === "€");
    const sorted = sortDestinations(cheap, "price");
    expect(sorted.length).toBe(cheap.length);
    const cheapIds = new Set(cheap.map((d) => d.id));
    for (const d of sorted) {
      expect(cheapIds.has(d.id)).toBe(true);
    }
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i - 1].costPerPerson).toBeLessThanOrEqual(
        sorted[i].costPerPerson
      );
    }
  });
});

describe("TASK 69 — DESTINATIONS_SORT_OPTIONS / isDestinationsSort", () => {
  test("točno trije načini, priporočeno je prvi (privzet v UI)", () => {
    expect(DESTINATIONS_SORT_OPTIONS).toEqual(["recommended", "rating", "price"]);
  });

  test("isDestinationsSort sprejme veljavne, zavrača neveljavne", () => {
    for (const s of ["recommended", "rating", "price"]) {
      expect(isDestinationsSort(s)).toBe(true);
    }
    for (const bad of ["", "Rating", "price ", "distance", null, undefined, 42, {}]) {
      expect(isDestinationsSort(bad)).toBe(false);
    }
  });

  test("neznana vrednost v sortDestinations → uredniški vrstni red (fallback, ne crash)", () => {
    const sorted = sortDestinations(DESTINATIONS, "nepoznan" as never);
    expect(sorted.map((d) => d.id)).toEqual(DESTINATIONS.map((d) => d.id));
  });
});
