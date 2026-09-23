// ============================================================================
// TASK 100 — DETERMINISTIČNI MOTOR ITINERERJA KOT FIRST-CLASS POT: testi
// ============================================================================
//
// Kontekst (TASK 99 na GitHubu — "odstrani odvisnost od generativnega AI
// modela, kjer ni potreben"): motor, ki je v /api/itinerary živel kot
// "fallback generator" (dosegljiv SAMO ob odpovedi AI), je izvlečen v čist
// modul src/lib/deterministic-itinerary.ts in dvignjen v NARAVNO pot —
// PlannerInput.engine = "deterministic" pokliče motor BREZ LLM klica.
//
// Pokriva:
//   1. DETERMINIZEM: isti vhod (+ isti sidrni podatki) → bitno-identičen
//      izhod (2 klica, JSON enakost); brez vremena je zaporedje izbire
//      identično poti z NIZKIM padavinskimi sidri (deževna logika se
//      sproži SAMO ob večinski realni napovedi ≥ 60 %);
//   2. SOURCE parametrizacija: privzeto "fallback", izrecno "deterministic"
//      (naravna pot) — isto jedro, poštena oznaka vira;
//   3. VEDENJE motorja: št. dni, veljavni ID-ji iz dataseta, format
//      terminov (brez prekrivanj), cena = costPerPerson × groupSize,
//      total = seštevek, SL/EN jezik celotnega besedila, tempo → gostota
//      dneva, preferredDestinations pohitritev izbire, privzeti bazen
//      SLOVENSKI (regionalne HR/ME/AL SAMO z izrecno željo), deževen dan
//      → notranji tipi (cave/spa/city), zaprtje destinacije (Vintgar
//      nov–mar) izloči postanek, ko je datum znan;
//   4. ČISTOST MODULA (source-contract): NI uvozov ai-client /
//      z-ai-web-dev-sdk / generateCompletion, NI ure (Date.now /
//      Math.random), NI omrežja (fetch) — 0 LLM žetonov po konstrukciji;
//   5. ROUTE WIRING (source-contract): route uvaża modul, LOKALNA kopija
//      generateFallbackItinerary je ODSTRANJENA (ena resnica), naravna pot
//      (engine === "deterministic") se odloči PRED klicem generateCompletion
//      (LLM se ne pokliče), engine validacija na meji, catch delegira v
//      ISTO verigo z oznako "fallback", observability union vključuje
//      "deterministic";
//   6. FRONTEND (source-contract): stikalo motorja (ENGINE_OPTIONS +
//      toggleEngine + engineHint), tri-stopenjski badge vira, i18n ključi
//      SL+EN popolni.
// ============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  generateDeterministicItinerary,
  isRainyDay,
  type AnchorForecast,
} from "@/lib/deterministic-itinerary";
import { DESTINATIONS } from "@/lib/slovenia-data";
import type { DailyForecast } from "@/lib/weather-utils";
import type { Itinerary, PlannerInput } from "@/lib/types";

function source(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

/** Izvorna koda BREZ komentarjev — čistostne preverjanje tipa na KODO,
 * ne na dokumentacijske omembe (glava modula utemeljuje, ZAKAJ nekaj NI
 * prisotno — komentar sme besedo omeniti, klic je ta, ki šteje). */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "") // blok komentarji
    .replace(/^\s*\/\/.*$/gm, ""); // vrstični komentarji
}

// ---------------------------------------------------------------------------
// Pomočniki: fiksni vhodi (brez ure/omrežja — reproducibilni testi)
// ---------------------------------------------------------------------------

const BASE_INPUT: PlannerInput = {
  budget: 800,
  days: 2,
  interests: ["kultura", "narava"],
  season: "summer",
  groupSize: 2,
};

function forecast(precip: number): DailyForecast {
  return {
    date: "2027-07-10",
    weatherCode: 61,
    tempMax: 21,
    precipitationProbabilityMax: precip,
  };
}

function anchor(precipDay0: number | null): AnchorForecast {
  return {
    label: "Gorenjska",
    labelEn: "Upper Carniola",
    // day 0 (prvi dan potovanja) — ostali dnevi brez podatka
    forecast: precipDay0 === null ? [] : [forecast(precipDay0)],
  };
}

function destType(id: string): string | undefined {
  return DESTINATIONS.find((d) => d.id === id)?.type;
}

function destCountry(id: string): string | undefined {
  return DESTINATIONS.find((d) => d.id === id)?.country;
}

function destCost(id: string): number | undefined {
  return DESTINATIONS.find((d) => d.id === id)?.costPerPerson;
}

/** Parsed HH:MM par iz "H:MM-H:MM" termina. */
function parseSlot(slot: string): { start: number; end: number } {
  const m = slot.match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
  if (!m) throw new Error(`Neveljaven format termina: ${slot}`);
  return {
    start: Number(m[1]) * 60 + Number(m[2]),
    end: Number(m[3]) * 60 + Number(m[4]),
  };
}

// ---------------------------------------------------------------------------
// 1. DETERMINIZEM — isti vhod → bitno-identičen izhod
// ---------------------------------------------------------------------------

describe("TASK 100: determinizem motorja", () => {
  test("isti vhod (brez vremena) → JSON-identičen izhod", () => {
    const a = generateDeterministicItinerary({ ...BASE_INPUT });
    const b = generateDeterministicItinerary({ ...BASE_INPUT });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test("isti vhod + ista sidra → JSON-identičen izhod", () => {
    const anchors = [anchor(80), anchor(90)];
    const a = generateDeterministicItinerary({ ...BASE_INPUT }, anchors);
    const b = generateDeterministicItinerary({ ...BASE_INPUT }, [
      anchor(80),
      anchor(90),
    ]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test("NIZKA padavinska sidra (< 60 %) → IDENTIČEN izhod kot brez sidrov", () => {
    const without = generateDeterministicItinerary({ ...BASE_INPUT });
    const lowRain = generateDeterministicItinerary(
      { ...BASE_INPUT },
      [anchor(10), anchor(20)]
    );
    expect(JSON.stringify(lowRain)).toBe(JSON.stringify(without));
  });

  test("samo ENO sidro s podatkom → ni deževne preklope (konzervativno)", () => {
    // isRainyDay zahteva ≥ 2 sidri s podatki — eno mokro sidro ne sme
    // preurejati dneva (motor ne pozna regije dneva)
    const single = generateDeterministicItinerary(
      { ...BASE_INPUT },
      [anchor(95)]
    );
    const without = generateDeterministicItinerary({ ...BASE_INPUT });
    expect(JSON.stringify(single)).toBe(JSON.stringify(without));
    expect(isRainyDay([anchor(95)], 0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. SOURCE — parametrizacija oznake vira
// ---------------------------------------------------------------------------

describe("TASK 100: source parametrizacija", () => {
  test("brez opts → source \"fallback\" (dosedanja semantika)", () => {
    const it = generateDeterministicItinerary({ ...BASE_INPUT });
    expect(it.source).toBe("fallback");
  });

  test("opts.source \"fallback\" → source \"fallback\"", () => {
    const it = generateDeterministicItinerary(
      { ...BASE_INPUT },
      [],
      [],
      { source: "fallback" }
    );
    expect(it.source).toBe("fallback");
  });

  test("opts.source \"deterministic\" → source \"deterministic\" (naravna pot)", () => {
    const it = generateDeterministicItinerary(
      { ...BASE_INPUT },
      [],
      [],
      { source: "deterministic" }
    );
    expect(it.source).toBe("deterministic");
  });

  test("source \"deterministic\" NE spreminja izbire postankov (isti jedro)", () => {
    const a = generateDeterministicItinerary({ ...BASE_INPUT });
    const b = generateDeterministicItinerary(
      { ...BASE_INPUT },
      [],
      [],
      { source: "deterministic" }
    );
    const strip = (i: Itinerary) => JSON.stringify({ ...i, source: undefined });
    expect(strip(b)).toBe(strip(a));
  });

  test("tip Itinerary[\"source\"] sprejme \"deterministic\" (širitev unije)", () => {
    const s: Itinerary["source"] = "deterministic";
    expect(s).toBe("deterministic");
  });
});

// ---------------------------------------------------------------------------
// 3. VEDENJE — struktura, cene, jeziki, tempo, dež, zaprtja, države
// ---------------------------------------------------------------------------

describe("TASK 100: vedenje motorja", () => {
  test("število dni in oštevilčenje ustrezata vhodu", () => {
    const it = generateDeterministicItinerary({ ...BASE_INPUT, days: 4 });
    expect(it.days).toHaveLength(4);
    expect(it.days.map((d) => d.day)).toEqual([1, 2, 3, 4]);
  });

  test("vsak postanek je VELJAVEN ID iz kanonskega dataseta", () => {
    const it = generateDeterministicItinerary({ ...BASE_INPUT, days: 3 });
    const ids = new Set(DESTINATIONS.map((d) => d.id));
    for (const day of it.days) {
      expect(day.locations.length).toBeGreaterThan(0);
      for (const loc of day.locations) {
        expect(ids.has(loc.destination_id)).toBe(true);
        expect(loc.destination_name).toBeTruthy();
      }
    }
  });

  test("termini so HH:MM-HH:MM in se NE prekrivajo znotraj dneva", () => {
    const it = generateDeterministicItinerary({ ...BASE_INPUT, days: 3 });
    for (const day of it.days) {
      let prevEnd = -1;
      for (const loc of day.locations) {
        const { start, end } = parseSlot(loc.time_slot);
        expect(start).toBeGreaterThan(0);
        expect(end).toBeGreaterThan(start);
        // drive-aware sloti: naslednji začetek najmanj prejšnji konec
        expect(start).toBeGreaterThanOrEqual(prevEnd);
        prevEnd = end;
      }
    }
  });

  test("cena = costPerPerson × groupSize; total = seštevek postankov", () => {
    const it = generateDeterministicItinerary({ ...BASE_INPUT, groupSize: 3 });
    let sum = 0;
    for (const day of it.days) {
      for (const loc of day.locations) {
        expect(loc.estimated_cost).toBe(
          (destCost(loc.destination_id) ?? 0) * 3
        );
        sum += loc.estimated_cost;
      }
    }
    expect(it.total_budget).toBe(sum);
  });

  test("EN jezik: priporočila, nasveti in opombe so ANGLEŠKI", () => {
    const it = generateDeterministicItinerary({
      ...BASE_INPUT,
      language: "en",
    });
    expect(it.recommendations[0]).toBe(
      "Book accommodation at least 2 weeks ahead"
    );
    expect(it.tips[0]).toContain("Start early");
    for (const day of it.days) {
      for (const loc of day.locations) {
        expect(loc.notes).not.toMatch(/[čšž]/);
      }
    }
  });

  test("SL jezik (privzeto): priporočila so SLOVENŠKI", () => {
    const it = generateDeterministicItinerary({ ...BASE_INPUT });
    expect(it.recommendations[0]).toContain("nastanitev");
  });

  test("tempo slow → 2 postanka/dan; fast → 3 postanki/dan", () => {
    const slow = generateDeterministicItinerary({
      ...BASE_INPUT,
      days: 2,
      pace: "slow",
    });
    for (const day of slow.days) {
      expect(day.locations.length).toBe(2);
    }
    const fast = generateDeterministicItinerary({
      ...BASE_INPUT,
      days: 2,
      pace: "fast",
    });
    for (const day of fast.days) {
      expect(day.locations.length).toBe(3);
    }
  });

  test("deževen dan (≥ 2 mokri sidri) → SAMO notranji tipi (cave/spa/city)", () => {
    const it = generateDeterministicItinerary(
      { ...BASE_INPUT, days: 1, interests: ["kultura"] },
      [anchor(80), anchor(70)]
    );
    expect(it.days[0].locations.length).toBeGreaterThan(0);
    for (const loc of it.days[0].locations) {
      // veljaven ID ⇒ veljaven tip (ID-ji prihajajo IZ kanonskega dataseta)
      const type = destType(loc.destination_id);
      expect(type).toBeTruthy();
      expect(["cave", "spa", "city"]).toContain(type as string);
      // SL (privzeti jezik): transparenten razlog notranje izbire
      expect(loc.notes).toContain("deževen dan");
    }
  });

  test("deževen dan (SL): opomba je slovenska", () => {
    const it = generateDeterministicItinerary(
      { ...BASE_INPUT, days: 1, interests: ["kultura"], language: "sl" },
      [anchor(80), anchor(70)]
    );
    for (const loc of it.days[0].locations) {
      expect(loc.notes).toContain("deževen dan");
    }
  });

  test("zaprtje destinacije (Vintgar nov–mar) izloči postanek pri znanem datumu", () => {
    // Vintgar ima closureLevel "destination" + closedMonths [11,12,1,2,3].
    // Z izrecno željo (preferredDestinations) se brez datuma ZAGOTOVO izbere;
    // z novembrskim startom ga filter izloči (fail-closed, ne opozori).
    const noDate = generateDeterministicItinerary({
      ...BASE_INPUT,
      days: 1,
      season: "autumn",
      preferredDestinations: ["vintgar"],
    });
    const pickedNoDate = noDate.days[0].locations.map((l) => l.destination_id);
    expect(pickedNoDate).toContain("vintgar");

    const withDate = generateDeterministicItinerary({
      ...BASE_INPUT,
      days: 1,
      season: "autumn",
      preferredDestinations: ["vintgar"],
      startDate: "2027-11-08",
    });
    const pickedWithDate = withDate.days[0].locations.map(
      (l) => l.destination_id
    );
    expect(pickedWithDate).not.toContain("vintgar");
  });

  test("privzeti bazen je SLOVENSKI — regionalni (HR/ME/AL) brez izrecne želje NE", () => {
    const it = generateDeterministicItinerary({
      ...BASE_INPUT,
      days: 3,
      interests: ["kultura", "mesto", "hrana"],
    });
    for (const day of it.days) {
      for (const loc of day.locations) {
        expect(destCountry(loc.destination_id)).toBe("SI");
      }
    }
  });

  test("izrecna želja po regionalni destinaciji jo SPUSTI v bazen", () => {
    const it = generateDeterministicItinerary({
      ...BASE_INPUT,
      days: 1,
      interests: ["kultura", "mesto", "hrana"],
      preferredDestinations: ["zagreb"],
    });
    const picked = it.days[0].locations.map((l) => l.destination_id);
    expect(picked).toContain("zagreb");
    expect(destCountry("zagreb")).toBe("HR");
  });

  test("preferredDestinations pohitritev (+2,5) — želja je NA DAN 1 izbrana", () => {
    // FAZA 2 (geografsko urejanje) lahko prestavi vrstni red znotraj dneva —
    // pohitritev izbire (+2,5) zagotovi, da je želja V naboru dneva 1.
    const it = generateDeterministicItinerary({
      ...BASE_INPUT,
      days: 1,
      preferredDestinations: ["bled"],
    });
    const day1 = it.days[0].locations.map((l) => l.destination_id);
    expect(day1).toContain("bled");
  });

  test("izčrpanje bazena ne sesuje motorja (14 dni, fast tempo)", () => {
    const it = generateDeterministicItinerary({
      ...BASE_INPUT,
      days: 14,
      pace: "fast",
    });
    expect(it.days).toHaveLength(14);
    for (const day of it.days) {
      expect(day.locations.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. ČISTOST MODULA — 0 LLM žetonov po konstrukciji (source-contract)
// ---------------------------------------------------------------------------

describe("TASK 100: čistost modula (source-contract)", () => {
  // codeOnly: glava modula UTERNELJUJE odsotnost (komentar sme omeniti
  // besedo) — preverjamo KODO, ne dokumentacijo.
  const mod = codeOnly(source("src/lib/deterministic-itinerary.ts"));

  test("NI odvisnosti od generativnega AI (ai-client / SDK / generateCompletion)", () => {
    expect(mod).not.toContain("ai-client");
    expect(mod).not.toContain("z-ai-web-dev-sdk");
    expect(mod).not.toMatch(/generateCompletion\s*\(/);
    expect(mod).not.toMatch(/generateText\s*\(/);
  });

  test("NI ure (Date.now / Math.random) — reproducibilnost", () => {
    expect(mod).not.toMatch(/Date\.now\s*\(/);
    expect(mod).not.toMatch(/Math\.random\s*\(/);
  });

  test("NI omrežja (fetch) in NI baze (prisma/db client)", () => {
    expect(mod).not.toMatch(/\bfetch\s*\(/);
    expect(mod).not.toContain("@/lib/db");
  });

  test("izvaža JAVNI API motorja + sidrni tip", () => {
    expect(mod).toContain("export function generateDeterministicItinerary");
    expect(mod).toContain("export function isRainyDay");
    expect(mod).toContain("export interface AnchorForecast");
    expect(mod).toContain("export interface DeterministicEngineOptions");
  });
});

// ---------------------------------------------------------------------------
// 5. ROUTE WIRING — naravna pot PRED LLM klicem, ena resnica (source-contract)
// ---------------------------------------------------------------------------

describe("TASK 100: route wiring (source-contract)", () => {
  const route = source("src/app/api/itinerary/route.ts");

  test("route UVAŽA modul (generateDeterministicItinerary + AnchorForecast)", () => {
    expect(route).toContain(
      'from "@/lib/deterministic-itinerary"'
    );
    expect(route).toContain("generateDeterministicItinerary");
  });

  test("LOKALNA kopija generateFallbackItinerary je ODSTRANJENA (ena resnica)", () => {
    expect(route).not.toContain("function generateFallbackItinerary");
    // stari lokalni INDOOR_TYPES (podvojena konstanta modula) prav tako
    expect(route).not.toMatch(/const INDOOR_TYPES/);
  });

  test("naravna pot (engine === \"deterministic\") se odloči PRED klicom LLM", () => {
    const branch = route.indexOf('input.engine === "deterministic"');
    const llmCall = route.indexOf("await generateCompletion(");
    expect(branch).toBeGreaterThan(-1);
    expect(llmCall).toBeGreaterThan(-1);
    expect(branch).toBeLessThan(llmCall);
  });

  test("engine validacija na meji (400 za neveljavno vrednost)", () => {
    expect(route).toContain("Motor generiranja je neveljaven (auto, deterministic)");
  });

  test("SKUPNA veriga: naravna pot \"deterministic\", catch \"fallback\"", () => {
    expect(route).toContain("async function buildDeterministicPlanResponse");
    const natural = route.indexOf(
      '[itinerary] TASK 100: naravna deterministična pot'
    );
    expect(natural).toBeGreaterThan(-1);
    // delegacija v catch poteče z oznako "fallback" (iskrena degradacija)
    const catchIdx = route.indexOf("AI napaka, uporabljam fallback");
    const delegAfterCatch = route.indexOf('"fallback"', catchIdx);
    expect(catchIdx).toBeGreaterThan(-1);
    expect(delegAfterCatch).toBeGreaterThan(catchIdx);
  });

  test("observability union (logItineraryValidation) vključuje \"deterministic\"", () => {
    const validation = source("src/lib/supply/itinerary-validation.ts");
    expect(validation).toContain(
      '"ai" | "fallback" | "deterministic" | "quick_action" | "fallback_echo"'
    );
  });
});

// ---------------------------------------------------------------------------
// 6. FRONTEND — stikalo motorja, badge vira, i18n (source-contract)
// ---------------------------------------------------------------------------

describe("TASK 100: frontend (source-contract)", () => {
  const planner = source("src/components/sections/itinerary-planner.tsx");

  test("stikalo motorja: ENGINE_OPTIONS + toggleEngine + hint", () => {
    expect(planner).toContain("const ENGINE_OPTIONS");
    expect(planner).toContain("function toggleEngine");
    expect(planner).toContain('t("engineHint")');
    expect(planner).toContain('t("engineLabel")');
    // privzeto stanje: neizbrano polje se bere kot "auto"
    expect(planner).toContain('(formData.engine ?? "auto")');
  });

  test("stikalo pošilja engine v API (fetch body razširjen prek PlannerInput)", () => {
    // formData: PlannerInput → ...input razširi tudi engine; analitika
    // nosi kateri motor je zahteval uporabnik
    expect(planner).toContain('engine: input.engine ?? "auto"');
  });

  test("badge vira loči \"deterministic\" (tri stanja + lastna barva)", () => {
    expect(planner).toContain('itinerary.source === "deterministic"');
    expect(planner).toContain('t("badgeDeterministic")');
  });

  test("i18n ključi SL + EN obstajajo in niso prazni", () => {
    for (const loc of ["sl", "en"] as const) {
      const messages = JSON.parse(
        source(`src/i18n/messages/${loc}.json`)
      ) as { planner: Record<string, string> };
      const plannerNs = messages.planner;
      for (const key of [
        "engineLabel",
        "engineAuto",
        "engineDeterministic",
        "engineHint",
        "badgeDeterministic",
      ]) {
        expect(plannerNs[key], `${loc}.${key}`).toBeTruthy();
        expect(plannerNs[key].length).toBeGreaterThan(0);
      }
    }
  });

  test("deljen pogled (shared-trip) pošteno označi deterministični načrt", () => {
    const shared = source("src/components/shared-trip.tsx");
    expect(shared).toContain('itinerary.source === "deterministic"');
  });

  test("zgodovina sprememb (refiner) pozna oznako \"brez AI\"", () => {
    const refiner = source("src/components/sections/itinerary-refiner.tsx");
    expect(refiner).toContain('h.source === "deterministic"');
  });
});
