// ============================================================================
// ISSUE #4 §10 — DETERMINISTIČNA PERSONALIZACIJA TESTI (VAL 4, 1.96.0)
// ============================================================================
// Naročnik: "Če je odločitev mogoče sprejeti deterministično, ne sme
// zahtevati LLM." Pokrivamo tri nove čiste plasti motorja:
//   1. BUDGET-aware izbira postankov (dnevni proračun vpliva na izbor)
//   2. PARTY TYPE učinek nad bestFor (prej samo AI prompt)
//   3. TEDENSKA ZAPRTJA (weekdayClosedIds — izločanje destination-level)
// plus refine hitre akcije = deterministično-PRIMARNE (0 LLM klicev).
// ============================================================================

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
  generateDeterministicItinerary,
  weekdayClosedIds,
  type WeekdayClosureInput,
} from "@/lib/deterministic-itinerary";
import { DESTINATIONS } from "@/lib/slovenia-data";
import type { PlannerInput } from "@/lib/types";

const BASE: PlannerInput = {
  budget: 5000, // radodaren — izbira po oceni, ne po ceni
  days: 2,
  interests: ["kultura", "narava"],
  season: "summer",
  groupSize: 2,
};

function idsOf(it: ReturnType<typeof generateDeterministicItinerary>): string[] {
  return it.days.flatMap((d) => d.locations.map((l) => l.destination_id));
}

function costOf(id: string): number {
  return DESTINATIONS.find((d) => d.id === id)?.costPerPerson ?? 0;
}

// ---------------------------------------------------------------------------
// 1. TEDENSKA ZAPRTJA — čista funkcija (sintetični vnosi)
// ---------------------------------------------------------------------------

const SYNTHETIC: WeekdayClosureInput[] = [
  {
    id: "dest-zaprt-pon",
    // 2027-03-08 je PONEDELJNIK (JS getDay 1)
    opening: { closureLevel: "destination", closedWeekdays: [1], note: "", noteEn: "", source: "test" },
  },
  {
    id: "dest-zaprt-ned",
    opening: { closureLevel: "destination", closedWeekdays: [0], note: "", noteEn: "", source: "test" },
  },
  {
    id: "atrakcija-zaprt-pon",
    // mainAttraction NE izloča (mesto je odprto — WARN only)
    opening: { closureLevel: "mainAttraction", closedWeekdays: [1], note: "", noteEn: "", source: "test" },
  },
  { id: "brez-podatka" },
];

describe("§10 weekdayClosedIds — čista funkcija", () => {
  it("ponedeljiški začetek izloči destination-level zaprto ob ponedeljkih", () => {
    // 2027-03-08 = ponedeljek; 1-dnevno potovanje
    const closed = weekdayClosedIds(SYNTHETIC, "2027-03-08", 1);
    expect(closed.has("dest-zaprt-pon")).toBe(true);
    expect(closed.has("dest-zaprt-ned")).toBe(false); // nedelja ni v poti
    expect(closed.has("atrakcija-zaprt-pon")).toBe(false); // mainAttraction
    expect(closed.has("brez-podatka")).toBe(false);
  });

  it("7-dnevno potovanje zajame VSE dneve v tednu", () => {
    const closed = weekdayClosedIds(SYNTHETIC, "2027-03-08", 7);
    expect(closed.has("dest-zaprt-pon")).toBe(true);
    expect(closed.has("dest-zaprt-ned")).toBe(true);
    expect(closed.has("atrakcija-zaprt-pon")).toBe(false);
    expect(closed.size).toBe(2);
  });

  it("brez startDate → prazna množica (nikoli ne izloča)", () => {
    expect(weekdayClosedIds(SYNTHETIC, undefined, 3).size).toBe(0);
  });

  it("neveljaven datum → prazna množica (fail-open, iskren WARN ostane)", () => {
    expect(weekdayClosedIds(SYNTHETIC, "ni-datum", 3).size).toBe(0);
  });

  it("determinizem: isti vhod → isti izhod", () => {
    const a = weekdayClosedIds(SYNTHETIC, "2027-03-08", 7);
    const b = weekdayClosedIds(SYNTHETIC, "2027-03-08", 7);
    expect([...a].sort()).toEqual([...b].sort());
  });

  it("motor: mainAttraction zaprtje (ptuj, ponedeljki) NE izloči postanka", () => {
    // ptuj je edini kanonski closedWeekdays zapis (mainAttraction) —
    // motor ga NE sme izločiti iz bazena (mesto odprto, WARN v validatorju)
    const it = generateDeterministicItinerary({
      ...BASE,
      days: 1,
      preferredDestinations: ["ptuj"],
      // 2027-03-08 = ponedeljek — dan ptujskega zaprtja glavne atrakcije
      startDate: "2027-03-08",
    });
    expect(idsOf(it)).toContain("ptuj");
  });
});

// ---------------------------------------------------------------------------
// 2. BUDGET-AWARE IZBIRA
// ---------------------------------------------------------------------------

describe("§10 budget-aware izbira postankov", () => {
  it("majhen dnevni proračun → VSE izbrane postanke so cenovno dosegljive", () => {
    // budget 80, days 2, groupSize 1 → 40 €/dan; izbira sme vzeti samo
    // postanke s costPerPerson ≤ 40, dokler so na voljo (min 10 €)
    const it = generateDeterministicItinerary({
      ...BASE,
      budget: 80,
      groupSize: 1,
    });
    expect(it.days).toHaveLength(2);
    for (const id of idsOf(it)) {
      expect(costOf(id)).toBeLessThanOrEqual(40);
    }
  });

  it("micro proračun → poštena poševna izbira (prva dosegljiva, druga najcenejša)", () => {
    // budget 24, days 1, groupSize 1 → 24 €/dan, 2 postanka:
    // 1. postanek ≤ 24 (ocena med dosegljivimi), po njem ostane 9 €;
    // 2. postanek: NIČ dosegljivega (min 10 €) → najcenejši neizrabljen (10 €).
    // Iskren izid: 25 € > 24 € proračun — budgetValidation označi exceeded,
    // motor NE prireza cene in NE izpušča postankov s lažnim "znotraj".
    const it = generateDeterministicItinerary({
      ...BASE,
      budget: 24,
      days: 1,
      groupSize: 1,
    });
    const costs = idsOf(it).map(costOf);
    expect(costs[0]).toBeLessThanOrEqual(24);
    // druga izbira = globalno najcenejša kategorija (10 €), ko ni dosegljivih
    expect(costs[1]).toBe(10);
    expect(costs[0] + costs[1]).toBe(25);
  });

  it("NIČELNI proračun → izbira IDENTIČNA kot prej (ocena odloča, ne cena)", () => {
    // budget 0 = brez proračuna → originalna logika (bitno-identična)
    const a = generateDeterministicItinerary({ ...BASE, budget: 0 });
    const b = generateDeterministicItinerary({ ...BASE, budget: 0 });
    expect(idsOf(a)).toEqual(idsOf(b));
    // in enaka kot pri zelo majhnem "0-ju" — negativen tudi
    const c = generateDeterministicItinerary({ ...BASE, budget: -5 });
    expect(idsOf(a)).toEqual(idsOf(c));
  });

  it("radodaren proračun: želja (preferredDestinations) je ŠE VEDNO izbrana", () => {
    const it = generateDeterministicItinerary({
      ...BASE,
      days: 1,
      preferredDestinations: ["bled"],
    });
    expect(idsOf(it)).toContain("bled");
  });

  it("determinizem ostaja: isti vhod → bitno-identičen izhod (s proračunom)", () => {
    const a = generateDeterministicItinerary({ ...BASE, budget: 120 });
    const b = generateDeterministicItinerary({ ...BASE, budget: 120 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("total_budget je vedno POŠTEN seštevek (NIKOLI lažno prirezan na proračun)", () => {
    const it = generateDeterministicItinerary({ ...BASE, budget: 30, groupSize: 2 });
    const sum = it.days.reduce(
      (s, d) => s + d.locations.reduce((x, l) => x + l.estimated_cost, 0),
      0
    );
    expect(it.total_budget).toBe(sum);
    // micro proračun 30 € (15 €/dan) realno PRESEŽE — iskren seštevek, ne €0
    expect(it.total_budget).toBeGreaterThanOrEqual(20);
  });
});

// ---------------------------------------------------------------------------
// 3. PARTY TYPE — deterministični učinek nad bestFor
// ---------------------------------------------------------------------------

describe("§10 partyType učinek (družina/par/prijatelji/sam)", () => {
  it("family: prva izbira ima 'družina' v bestFor (pohostnitev deluje)", () => {
    const it = generateDeterministicItinerary({
      ...BASE,
      days: 1,
      interests: [], // brez interesov → score = rating/10 + boost
      partyType: "family",
    });
    const first = idsOf(it)[0];
    const dest = DESTINATIONS.find((d) => d.id === first);
    expect(dest?.bestFor).toContain("družina");
  });

  it("couple: prva izbira ima 'romantika' v bestFor", () => {
    const it = generateDeterministicItinerary({
      ...BASE,
      days: 1,
      interests: [],
      partyType: "couple",
    });
    const first = idsOf(it)[0];
    const dest = DESTINATIONS.find((d) => d.id === first);
    expect(dest?.bestFor).toContain("romantika");
  });

  it("brez partyType → izbira nespremenjena (nazaj kompatibilno)", () => {
    const a = generateDeterministicItinerary({ ...BASE, days: 1, interests: [] });
    const b = generateDeterministicItinerary({
      ...BASE,
      days: 1,
      interests: [],
      partyType: undefined,
    });
    expect(idsOf(a)).toEqual(idsOf(b));
  });

  it("interesi uporabnika ostanejo GLAVNA sila (boost je rafinacija)", () => {
    // z interesi, ki so močni za destinacijo BREZ družine, family boost
    // (1,5) ne sme premagati 2+ zadetkov interesa (2,0) + rating
    const it = generateDeterministicItinerary({
      ...BASE,
      days: 1,
      interests: ["smučanje", "pohodništvo"], // tipično NE-družinske
      partyType: "family",
    });
    const first = idsOf(it)[0];
    const dest = DESTINATIONS.find((d) => d.id === first);
    expect(
      dest?.bestFor.some((b) => ["smučanje", "pohodništvo"].includes(b))
    ).toBe(true);
  });

  it("determinizem: partyType pot je reproducibilna", () => {
    const a = generateDeterministicItinerary({ ...BASE, partyType: "friends" });
    const b = generateDeterministicItinerary({ ...BASE, partyType: "friends" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ---------------------------------------------------------------------------
// 4. REFINE — hitre akcije so deterministično-PRIMARNE (source contract)
// ---------------------------------------------------------------------------

describe("§10 refine: hitre akcije BREZ LLM (source-contract)", () => {
  const route = readFileSync(
    "src/app/api/itinerary/refine/route.ts",
    "utf8"
  );

  it("quick-action blok je PRED generateCompletion klicom (0 LLM klicev)", () => {
    const quickIdx = route.indexOf("if (action && day) {");
    const llmIdx = route.indexOf("generateCompletion(");
    expect(quickIdx).toBeGreaterThan(-1);
    expect(llmIdx).toBeGreaterThan(-1);
    // zgodnji return pred LLM — deterministično-prima
    expect(quickIdx).toBeLessThan(llmIdx);
  });

  it("zgodnja pot vrača source 'deterministic' (ne 'fallback')", () => {
    // iskrena oznaka: primarna deterministična pot, ne rezerva
    const early = route.slice(0, route.indexOf("generateCompletion("));
    expect(early).toContain('source: "deterministic"');
    expect(early).toContain("applied: true");
  });

  it("catch blok NE vsebuje več applyQuickAction (odmrli dvojnik odstranjen)", () => {
    const catchIdx = route.indexOf("catch (error)");
    const catchBlock = route.slice(catchIdx);
    expect(catchIdx).toBeGreaterThan(-1);
    expect(catchBlock).not.toContain("applyQuickAction");
  });

  it("§10 komentar dokumentira naročnikovo pravilo (kontekst za prihodnje)", () => {
    expect(route).toContain("DETERMINISTIČNA ODLOČITEV");
    expect(route).toContain("0 LLM");
  });
});
