/**
 * Testi sanitizacije itinererja (revizija 1.33.0, auditorski ugotovitvi
 * 16-c/16-d P2). Sanitizer teče na OBEH mejah zaupanja (AI izhod + save
 * persist) — pokriva: negativne numerike (invariant bypass), type confusion
 * (React crash na /pot), dneve nad zahtevanim, sezname kot stringe,
 * dolžinske kapit in idempotentnost nad fallback obliko.
 */

import { describe, expect, test } from "bun:test";
import { sanitizeItinerary } from "../itinerary-sanitize";
import type { Itinerary } from "../types";

const VALID_LOCATION = {
  destination_id: "bled",
  destination_name: "Bled",
  time_slot: "09:00–11:00",
  duration: 2,
  estimated_cost: 20,
  notes: "Jutranji sprehod ob jezeru.",
};

const VALID_DAY = {
  day: 1,
  locations: [VALID_LOCATION],
  weather: { condition: "sončno", temp: 22 },
};

describe("sanitizeItinerary", () => {
  test("veljaven AI izhod ostane nespremenjen po vsebini (idempotenten)", () => {
    const input = {
      days: [VALID_DAY],
      total_budget: 100,
      recommendations: ["Obišči Vintgar."],
      tips: ["Zgodnji začetek."],
      source: "ai",
    };
    const r = sanitizeItinerary(input, 1);
    expect(r.days).toHaveLength(1);
    expect(r.days[0].locations[0].destination_name).toBe("Bled");
    expect(r.days[0].locations[0].duration).toBe(2);
    expect(r.days[0].locations[0].estimated_cost).toBe(20);
    expect(r.total_budget).toBe(100);
    expect(r.recommendations).toEqual(["Obišči Vintgar."]);
    expect(r.source).toBe("ai");
  });

  test("NEGATIVNE numerike: duration -3 → 0.25, cost -9999 → 0 (invariant bypass zaprt)", () => {
    const input = {
      days: [
        {
          day: 1,
          locations: [{ ...VALID_LOCATION, duration: -3, estimated_cost: -9999 }],
          weather: { condition: "x", temp: 1 },
        },
      ],
      total_budget: -500,
      recommendations: [],
      tips: [],
      source: "ai",
    };
    const r = sanitizeItinerary(input, 1);
    expect(r.days[0].locations[0].duration).toBe(0.25);
    expect(r.days[0].locations[0].estimated_cost).toBe(0);
    expect(r.total_budget).toBe(0);
  });

  test("TYPE CONFUSION: notes kot objekt → prazen string (React crash na /pot preprečen)", () => {
    const input = {
      days: [
        {
          day: 1,
          locations: [
            // lokacija 1: veljavno ime, notes kot OBJEKT → coercion v ""
            { ...VALID_LOCATION, notes: { evil: true } },
            // lokacija 2: ime kot ŠTEVILKA → izpuščena (brez imena neuporabna)
            { ...VALID_LOCATION, destination_name: 42 },
          ],
          weather: { condition: "x", temp: 1 },
        },
      ],
      total_budget: 0,
      recommendations: [],
      tips: [],
      source: "ai",
    };
    const r = sanitizeItinerary(input, 1);
    expect(r.days[0].locations).toHaveLength(1);
    expect(typeof r.days[0].locations[0].notes).toBe("string");
    expect(r.days[0].locations[0].notes).toBe("");
  });

  test("recommendations kot STRING → prazen array (.map crash na klientu preprečen)", () => {
    const input = {
      days: [VALID_DAY],
      total_budget: 0,
      recommendations: "long string that has .length > 0 but no .map",
      tips: "isto",
      source: "ai",
    };
    const r = sanitizeItinerary(input, 1);
    expect(Array.isArray(r.recommendations)).toBe(true);
    expect(r.recommendations).toHaveLength(0);
    expect(Array.isArray(r.tips)).toBe(true);
  });

  test("dni nad zahtevanim: 5 dni pri input.days=3 → poreže na 3 + zaporedno številčenje", () => {
    const fiveDays = Array.from({ length: 5 }, (_, i) => ({
      ...VALID_DAY,
      day: 7, // AI duplicira številke
    }));
    const r = sanitizeItinerary(
      { days: fiveDays, total_budget: 0, recommendations: [], tips: [], source: "ai" },
      3
    );
    expect(r.days).toHaveLength(3);
    expect(r.days.map((d) => d.day)).toEqual([1, 2, 3]);
  });

  test("max 14 dni tudi brez maxDays; max 12 lokacij na dan", () => {
    const twentyDays = Array.from({ length: 20 }, () => ({ ...VALID_DAY }));
    const r = sanitizeItinerary(
      { days: twentyDays, total_budget: 0, recommendations: [], tips: [], source: "ai" }
    );
    expect(r.days).toHaveLength(14);

    const manyLocs = Array.from({ length: 20 }, () => ({ ...VALID_LOCATION }));
    const r2 = sanitizeItinerary(
      { days: [{ ...VALID_DAY, locations: manyLocs }], total_budget: 0, recommendations: [], tips: [], source: "ai" }
    );
    expect(r2.days[0].locations).toHaveLength(12);
  });

  test("ne-objekt / prazen vhod → prazen a ne crash", () => {
    expect(sanitizeItinerary(null).days).toHaveLength(0);
    expect(sanitizeItinerary(undefined).days).toHaveLength(0);
    expect(sanitizeItinerary("string").days).toHaveLength(0);
    expect(sanitizeItinerary(42).days).toHaveLength(0);
  });

  test("dolžinske kapit: notes > 1000, seznam > 20 itemov, item > 300 znakov", () => {
    const input = {
      days: [
        {
          day: 1,
          locations: [{ ...VALID_LOCATION, notes: "x".repeat(5000) }],
          weather: { condition: "x", temp: 1 },
        },
      ],
      total_budget: 0,
      recommendations: Array.from({ length: 50 }, () => "y".repeat(500)),
      tips: [],
      source: "ai",
    };
    const r = sanitizeItinerary(input, 1);
    expect(r.days[0].locations[0].notes.length).toBeLessThanOrEqual(1000);
    expect(r.recommendations).toHaveLength(20);
    expect(r.recommendations[0].length).toBeLessThanOrEqual(300);
  });

  test("source: fallback ohranjen, vse drugo → ai", () => {
    expect(
      sanitizeItinerary({ days: [VALID_DAY], recommendations: [], tips: [], source: "fallback" }).source
    ).toBe("fallback");
    expect(
      sanitizeItinerary({ days: [VALID_DAY], recommendations: [], tips: [], source: "evil" }).source
    ).toBe("ai");
  });
});
