// ============================================================================
// HARDENING MASTER TASK — I3/I5/I6: MEJE ZAUPANJA GENERACIJE/REFINE/AI
// ============================================================================
// I3 (P2): input.days brez typeof preverjanja — niz "abc" je prešel range
//   primerjavo ("abc" < 1 false, "abc" > 14 false) → NaN dayCap → prazni
//   dnevi kot 200-uspeh.
// I5 (P2): refine je klientov `current` uporabljal SUROVEGA (quick-action/
//   echo veje brez shape guarda — točno razred, ki ga je sanitizeItinerary
//   rešil na generaciji/save: notes:{} → React crash).
// I6 (P2): z-ai-sdk TEXT pot brez timeouta (VLM pot ga ima — 45 s) — obesek
//   je lahko povrnil celo generacijo.
// ============================================================================
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hasItineraryShape } from "@/lib/itinerary-sanitize";

const ROOT = join(__dirname, "..", "..", "..");
const routeSrc = readFileSync(
  join(ROOT, "src/app/api/itinerary/route.ts"),
  "utf8"
);
const refineSrc = readFileSync(
  join(ROOT, "src/app/api/itinerary/refine/route.ts"),
  "utf8"
);
const aiClientSrc = readFileSync(
  join(ROOT, "src/lib/ai-client.ts"),
  "utf8"
);

describe("HARDENING I3: days je typovno + range varovan na meji", () => {
  test("generacija zavrne ne-integer/ ne-številske dneve (typeof guard)", () => {
    expect(routeSrc).toContain('typeof input.days !== "number"');
    expect(routeSrc).toContain("!Number.isInteger(input.days)");
    expect(routeSrc).toContain("input.days < 1");
    expect(routeSrc).toContain("input.days > 14");
  });
});

describe("HARDENING I5: hasItineraryShape — crash-razredi zavrnjeni", () => {
  const validDay = (overrides: Record<string, unknown> = {}) => ({
    day: 1,
    locations: [
      {
        destination_id: "t1:ljubljana",
        destination_name: "Ljubljana",
        time_slot: "10:00",
        duration: 2,
        estimated_cost: 10,
        notes: " lep sprehod",
        category: "sightseeing",
      },
    ],
    weather: { condition: "sončno", temp: 22 },
    ...overrides,
  });
  const validItinerary = (days = [validDay()]) => ({
    days,
    total_budget: 500,
    recommendations: ["A", "B"],
    tips: [],
    source: "ai",
  });

  test("veljaven itinerer sprejet", () => {
    expect(hasItineraryShape(validItinerary())).toBe(true);
  });

  test("days: ne-array / prazno / 15 dni → zavrnjeno", () => {
    expect(hasItineraryShape({ ...validItinerary(), days: "3" })).toBe(false);
    expect(hasItineraryShape({ ...validItinerary(), days: [] })).toBe(false);
    expect(
      hasItineraryShape({ ...validItinerary(), days: Array(15).fill(validDay()) })
    ).toBe(false);
  });

  test("notes:{} / recommendations: string → zavrnjeno (React crash razred)", () => {
    expect(
      hasItineraryShape({
        ...validItinerary(),
        recommendations: "obiščite Ljubljano",
      })
    ).toBe(false);
    const badNotes = validDay({
      locations: [
        { destination_id: "x", notes: {} as unknown as string },
      ],
    });
    expect(hasItineraryShape(validItinerary([badNotes]))).toBe(false);
  });

  test("locations brez arraya → zavrnjeno (TypeError .map razred)", () => {
    const badLocs = validDay({ locations: null as unknown as [] });
    expect(hasItineraryShape(validItinerary([badLocs]))).toBe(false);
  });

  test("refine meja uporablja shape guard (400, ne surovo uporabo)", () => {
    expect(refineSrc).toContain("hasItineraryShape(current)");
    expect(refineSrc).toMatch(/if \(!hasItineraryShape\(current\)\)/);
  });
});

describe("HARDENING I6: z-ai-sdk TEXT pot ima timeout (kot VLM)", () => {
  test("Promise.race + ZAI_TEXT_TIMEOUT_MS v text poti", () => {
    expect(aiClientSrc).toContain("ZAI_TEXT_TIMEOUT_MS = 45_000");
    expect(aiClientSrc).toContain("ZAI_TEXT_TIMEOUT");
    // race je na chat.completions.create (text), ločeno od createVision (VLM)
    const textRace = aiClientSrc.indexOf("ZAI_TEXT_TIMEOUT_MS");
    const visionRace = aiClientSrc.indexOf("VLM_TIMEOUT_MS");
    expect(textRace).toBeGreaterThan(-1);
    expect(visionRace).toBeGreaterThan(-1);
    expect(aiClientSrc).toContain("Promise.race");
  });
});
