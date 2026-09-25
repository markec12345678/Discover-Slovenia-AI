// ============================================================================
// T5-b1 / M5 (Issue #5 fix val 1) — PLAN-QA + PLAN-FACTS: unit testi
// (prej 0 pokritosti)
// ============================================================================
//
// ZADEVA: PlanCopilot "Vprašaj" plast (F9) — src/lib/plan-qa.ts
// (answerPlanQuestion) in src/lib/plan-facts.ts (buildPlanFacts) sta po
// reviziji T5-a2 ~700 vrstic determinističnega Q&A BREZ testov (M5 v
// docs/PRODUCT-FUNCTIONALITY-MATRIX.md §5). Ta datoteka pokriva:
//
//   1. buildPlanFacts na malem fixture načrtu (Ljubljana+Bled / Postojnska
//      jama, realne koordinate dataseta): km na dan in minute vožnje
//      preverjene z NEODVISNO testno kopijo haversine formule (× 1,3 ÷ 55,
//      round5 — isti vzorec kot issue4-wave6 regresijski testi), proračun
//      (estimatedCost/budgetGoal/driveCosts), število dni, imena postankov,
//      najbolj natrpan/najmirnejši dan, datumi, defenzivna prazna oblika;
//   2. answerPlanQuestion — prepoznani nameni (SL+EN): skupna vožnja,
//      vožnja dneva, najbolj natrpan dan, stroški (skupaj/dan), načrt dneva,
//      vreme (z živo napovedjo in brez nje), število postankov, pakiranje,
//      pomoč — vsi odgovori IZ IZRAČUNANIH dejstev z razkritim virom;
//   3. iskrene poti: dan izven obsega (out_of_range popravek, ne izmišljen
//      dan), neprepoznan namen → null (klicatelj gre v AI pot) in
//      buildUnknownAnswer — EXACT pogodba "ugibati ne bom" / "I won't guess".
//
// Pogodba F9: AI dobi ISTE številke kot deterministični odgovori (nič
// številk se ne izmišljuje) — renderFactsSheet test to zaklene.
// ============================================================================

import { describe, test, expect } from "bun:test";
import {
  answerPlanQuestion,
  buildUnknownAnswer,
  EXAMPLE_QUESTIONS,
  type PlanQaInput,
  type PlanForecastDay,
} from "@/lib/plan-qa";
import { buildPlanFacts, renderFactsSheet } from "@/lib/plan-facts";
import { validateItineraryGeo } from "@/lib/geo-validation";
import {
  FUEL_CONSUMPTION_L_PER_100,
  FUEL_PRICE_EUR_PER_L,
  pickVignetteDays,
} from "@/lib/trip-costs";
import { DESTINATIONS } from "@/lib/slovenia-data";
import type { Itinerary, LocationVisit, PlannerInput } from "@/lib/types";

// ---------------------------------------------------------------------------
// Fixture — isti vzorec kot geo-validation.test.ts (polja, ki jih plast bere)
// ---------------------------------------------------------------------------

function stop(
  id: string,
  name: string,
  slot: string,
  duration: number,
  cost: number
): LocationVisit {
  return {
    destination_id: id,
    destination_name: name,
    time_slot: slot,
    duration,
    estimated_cost: cost,
    notes: "",
  };
}

const LJ = DESTINATIONS.find((d) => d.id === "ljubljana")!;
const BLED = DESTINATIONS.find((d) => d.id === "bled")!;
const POSTOJNA = DESTINATIONS.find((d) => d.id === "postojna")!;

/** Dvodnevni načrt: dan 1 Ljubljana→Bled (60 km ocena), dan 2 Postojnska jama. */
const ITIN: Itinerary = {
  days: [
    {
      day: 1,
      locations: [
        stop("ljubljana", "Ljubljana", "09:00-12:00", 3, 20),
        stop("bled", "Bled", "14:00-16:00", 2, 25),
      ],
      weather: { condition: "sončno", temp: 20 },
    },
    {
      day: 2,
      locations: [stop("postojna", "Postojnska jama", "09:00-11:00", 2, 30)],
      weather: { condition: "oblačno", temp: 16 },
    },
  ],
  total_budget: 75,
  recommendations: [],
  tips: [],
  source: "fallback",
  tripStartDate: "2026-07-04",
};

const INPUT: PlannerInput = {
  budget: 200,
  days: 2,
  interests: ["narava", "kultura"],
  season: "summer",
  groupSize: 2,
};

// ---------------------------------------------------------------------------
// NEODVISNA testna kopija haversine formule (isti vzorec kot
// issue4-wave6-route-regression.test.ts — test NE sme uvažati formule iz
// modula, ki ga preverja) + round5 semantika geo-validacije.
// ---------------------------------------------------------------------------

function hav(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const round5 = (n: number) => Math.round(n / 5) * 5;

/** Ocene za fixture (haversine × 1,3 ÷ 55 km/h, zaokroženo na 5). */
const HAV_LJ_BLED = hav(
  LJ.coords.lat,
  LJ.coords.lng,
  BLED.coords.lat,
  BLED.coords.lng
);
const HAV_BLED_POST = hav(
  BLED.coords.lat,
  BLED.coords.lng,
  POSTOJNA.coords.lat,
  POSTOJNA.coords.lng
);
const DAY1_KM = round5(HAV_LJ_BLED * 1.3);
const DAY1_DRIVE_MIN = round5(((HAV_LJ_BLED * 1.3) / 55) * 60);
// trip-costs: vse noge (tudi prek meje dni) × 1,3, nato zaokroženo na 5
const DRIVE_KM = Math.round(((HAV_LJ_BLED + HAV_BLED_POST) * 1.3) / 5) * 5;
const FUEL_L = Math.round((DRIVE_KM / 100) * FUEL_CONSUMPTION_L_PER_100);
const FUEL_EUR = Math.round(FUEL_L * FUEL_PRICE_EUR_PER_L);

function ask(
  question: string,
  extra?: Partial<PlanQaInput>
): ReturnType<typeof answerPlanQuestion> {
  return answerPlanQuestion({
    question,
    itinerary: ITIN,
    input: INPUT,
    ...extra,
  });
}

// ---------------------------------------------------------------------------
// 1. buildPlanFacts — list dejstev (vse številke izračunane)
// ---------------------------------------------------------------------------

describe("buildPlanFacts — list dejstev iz fixture načrta", () => {
  const facts = buildPlanFacts(ITIN, INPUT);

  test("število dni, imena postankov po dnevih, totalStops, groupSize, vir", () => {
    expect(facts.days).toBe(2);
    expect(facts.totalStops).toBe(3);
    expect(facts.groupSize).toBe(2);
    expect(facts.source).toBe("fallback");
    expect(facts.perDay).toHaveLength(2);
    expect(facts.perDay[0]!.names).toEqual(["Ljubljana", "Bled"]);
    expect(facts.perDay[1]!.names).toEqual(["Postojnska jama"]);
    expect(facts.perDay.map((d) => d.stops)).toEqual([2, 1]);
  });

  test("km in minute vožnje dneva: neodvisen haversine × 1,3 ÷ 55, zaokroženo na 5", () => {
    expect(facts.perDay[0]!.km).toBe(DAY1_KM);
    expect(facts.perDay[0]!.km % 5).toBe(0); // brez lažne natančnosti
    expect(facts.perDay[0]!.drivingMinutes).toBe(DAY1_DRIVE_MIN);
    expect(facts.perDay[1]!.km).toBe(0); // en postanek → 0 nog
    expect(facts.tripKm).toBe(DAY1_KM); // dan 2 prispeva 0
    // F9 pogodba: ISTE številke kot plošča izvedljivosti (delegacija)
    const geo = validateItineraryGeo(ITIN, "sl");
    expect(facts.perDay[0]!.km).toBe(geo.days[0]!.km);
    expect(facts.tripKm).toBe(geo.tripKm);
  });

  test("proračun: estimatedCost = seštevek cen atrakcij; budgetGoal iz obrazca", () => {
    expect(facts.perDay.map((d) => d.cost)).toEqual([45, 30]);
    expect(facts.estimatedCost).toBe(75);
    expect(facts.budgetGoal).toBe(200);
    expect(facts.estimatedCost).toBe(ITIN.days.reduce((s, d) => s + d.locations.reduce((x, l) => x + l.estimated_cost, 0), 0));
  });

  test("stroški vožnje: km iz iste hevristike (tudi prek meje dni), tarife trip-costs", () => {
    expect(facts.driveCosts).not.toBeNull();
    expect(facts.driveCosts!.km).toBe(DRIVE_KM);
    expect(facts.driveCosts!.fuelLiters).toBe(FUEL_L);
    expect(facts.driveCosts!.fuelEur).toBe(FUEL_EUR);
    expect(facts.driveCosts!.vignetteDays).toBe(pickVignetteDays(2));
    expect(facts.driveCosts!.totalEur).toBe(
      facts.driveCosts!.fuelEur + facts.driveCosts!.vignetteEur
    );
  });

  test("najbolj natrpan / najmirnejši dan iz loadMinutes (vožnja + aktivnosti)", () => {
    expect(facts.perDay[0]!.activityMinutes).toBe(300); // 3 h + 2 h
    expect(facts.perDay[1]!.activityMinutes).toBe(120);
    expect(facts.perDay[0]!.loadMinutes).toBe(
      facts.perDay[0]!.drivingMinutes + facts.perDay[0]!.activityMinutes
    );
    expect(facts.busiest?.day).toBe(1);
    expect(facts.quietest?.day).toBe(2);
  });

  test("datumi dni iz tripStartDate (brez časovnega pasu) in vreme je OCENA v načrtu", () => {
    expect(facts.tripStartDate).toBe("2026-07-04");
    expect(facts.perDay[0]!.date).toBe("2026-07-04");
    expect(facts.perDay[1]!.date).toBe("2026-07-05");
    expect(facts.perDay.map((d) => d.weather)).toEqual(["sončno", "oblačno"]);
    expect(facts.perDay.map((d) => d.temp)).toEqual([20, 16]);
  });

  test("fixture je čist za geo-validacijo: 0 opozoril (ne pačimo številk za test)", () => {
    expect(facts.warnings).toBe(0);
    expect(facts.errors).toBe(0);
    expect(facts.closedNotices).toEqual([]);
  });

  test("prazen načrt → defenzivna oblika (0 dni, driveCosts null, brez busiest)", () => {
    const empty = buildPlanFacts(
      {
        days: [],
        total_budget: 0,
        recommendations: [],
        tips: [],
        source: "fallback",
      },
      null
    );
    expect(empty.days).toBe(0);
    expect(empty.perDay).toEqual([]);
    expect(empty.totalStops).toBe(0);
    expect(empty.estimatedCost).toBe(0);
    expect(empty.driveCosts).toBeNull();
    expect(empty.busiest).toBeUndefined();
    expect(empty.quietest).toBeUndefined();
    expect(empty.warnings).toBe(0);
    expect(empty.groupSize).toBe(1); // brez obrazca → 1 oseba
    expect(empty.budgetGoal).toBeUndefined();
  });

  test("brez obrazca (input null): groupSize 1, budgetGoal undefined", () => {
    const f = buildPlanFacts(ITIN, null);
    expect(f.groupSize).toBe(1);
    expect(f.budgetGoal).toBeUndefined();
    expect(f.estimatedCost).toBe(75); // dejstva načrta ostanejo
  });

  test("renderFactsSheet (AI grounding) vsebuje ISTE številke kot facts", () => {
    const sheet = renderFactsSheet(facts, "sl");
    expect(sheet).toContain(`${facts.tripKm} km`);
    expect(sheet).toContain(`${facts.estimatedCost}`);
    expect(sheet).toContain("Ljubljana");
    expect(sheet).toContain("Postojnska jama");
    expect(sheet).toContain("EDINI dovoljen vir številk"); // pogodba za AI
    expect(sheet).toContain("NISO živa napoved"); // iskrenost vremena
  });
});

// ---------------------------------------------------------------------------
// 2. answerPlanQuestion — prepoznani nameni (SL)
// ---------------------------------------------------------------------------

describe("answerPlanQuestion — prepoznani nameni (SL)", () => {
  test("skupna vožnja → drive_total: številke iz dejstev + razkrit hevristični vir", () => {
    const a = ask("Koliko km in vožnje je na celotni poti?");
    expect(a?.intent).toBe("drive_total");
    expect(a?.text).toContain(`~${DAY1_KM} km`);
    expect(a?.text).toContain("Celotna pot");
    expect(a?.text).toContain("ocena, haversine × 1.3"); // vir razkrit
    expect(a?.text).toContain("Največ za volanom: dan 1"); // najdaljša etapa
    expect(a?.text).toContain("povprečno"); // povprečje na dan izračunano
  });

  test("vožnja dneva → drive_day: km dneva 1 + imena postankov + vir", () => {
    const a = ask("Koliko km je na dan 1?");
    expect(a?.intent).toBe("drive_day");
    expect(a?.text).toContain(`Dan 1: ~${DAY1_KM} km vožnje`);
    expect(a?.text).toContain("Ljubljana, Bled");
    expect(a?.text).toContain("isti vir kot plošča izvedljivosti"); // dnevni odgovor razkrije vir
  });

  test("najbolj natrpan dan → busiest: obseg izračunan (ne občutek)", () => {
    const a = ask("Kateri dan je najbolj natrpan?");
    expect(a?.intent).toBe("busiest");
    expect(a?.text).toContain("Najbolj natrpan je dan 1");
    expect(a?.text).toContain("[Ljubljana, Bled]");
    expect(a?.text).toContain("Najlažji je dan 2");
    expect(a?.text).toContain("izračunano — ne občutek");
  });

  test("stroški skupaj → cost_total: atrakcije na osebo + vožnja + proračunski cilj", () => {
    const a = ask("Koliko bo stalo (skupaj in na osebo)?");
    expect(a?.intent).toBe("cost_total");
    expect(a?.text).toContain("Atrakcije: 75 €");
    expect(a?.text).toContain("38 € na osebo (2 oseb)"); // 75 / 2 → zaokroženo
    expect(a?.text).toContain("Skupaj načrt ≈");
    expect(a?.text).toContain("Tvoj proračunski cilj: 200 €");
    expect(a?.text).toContain("NISO vključeni"); // nočitev/hrana izrecno ven
  });

  test("stroški dneva → cost_day: cena atrakcij tega dne + ime", () => {
    const a = ask("Koliko stane dan 2?");
    expect(a?.intent).toBe("cost_day");
    expect(a?.text).toContain("Dan 2: atrakcije 30 € (Postojnska jama)");
  });

  test("načrt dneva → day_plan: zaporedje postankov + km + termin", () => {
    const a = ask("Kaj je na dan 1?");
    expect(a?.intent).toBe("day_plan");
    expect(a?.text).toContain("1. Ljubljana; 2. Bled");
    expect(a?.text).toContain(`~${DAY1_KM} km`);
  });

  test("vreme BREZ žive napovedi → ocena zadeta v načrt, izrecno NE napoved", () => {
    const a = ask("Kakšno bo vreme?");
    expect(a?.intent).toBe("weather");
    expect(a?.text).toContain("Vreme, zadeto v načrt");
    expect(a?.text).toContain("Dan 1: sončno, 20 °C");
    expect(a?.text).toContain("Dan 2: oblačno, 16 °C");
    expect(a?.text).toContain("NI živa napoved");
  });

  test("vreme Z živo napovedjo → dnevi načrta + dež verjeten (≥ 50 %)", () => {
    const forecast: PlanForecastDay[] = [
      { day: 1, text: "Dež", tempMax: 18, rainProb: 70 },
      { day: 2, text: "Pretežno sončno", tempMax: 24, rainProb: 10 },
    ];
    const a = ask("Kakšno bo vreme?", { forecast });
    expect(a?.intent).toBe("weather");
    expect(a?.text).toContain("Živa napoved");
    expect(a?.text).toContain("Dan 1: Dež, 18 °C · 70 % padavin");
    expect(a?.text).toContain("Dež verjeten na dan(e) 1");
  });

  test("število postankov → stops_total: skupaj + povprečje + dan z največ", () => {
    const a = ask("Koliko postankov imamo skupaj?");
    expect(a?.intent).toBe("stops_total");
    expect(a?.text).toContain("3 postanki na 2 dni");
    expect(a?.text).toContain("povprečno 1.5 na dan");
    expect(a?.text).toContain("Največ postankov: dan 1 (2)");
  });

  test("pakiranje → packing: isti čisti seznam kot pod načrtom", () => {
    const a = ask("Kaj naj pakiram?");
    expect(a?.intent).toBe("packing");
    expect(a?.text).toContain("Pametni pakirni seznam");
    expect(a?.text).toContain("razkrito, ne ugibano");
  });

  test("pomoč → help: razloži, od kje odgovarja (izračunana dejstva)", () => {
    const a = ask("Kaj lahko vprašam?");
    expect(a?.intent).toBe("help");
    expect(a?.text).toContain("preračunana, ne ugibana");
    expect(a?.text).toContain("Primeri:");
  });
});

// ---------------------------------------------------------------------------
// 3. answerPlanQuestion — EN fraze
// ---------------------------------------------------------------------------

describe("answerPlanQuestion — EN fraze", () => {
  test("How many km and driving overall? → drive_total z en vsebino", () => {
    const a = ask("How many km and driving overall?", { lang: "en" });
    expect(a?.intent).toBe("drive_total");
    expect(a?.text).toContain("Whole trip");
    expect(a?.text).toContain(`~${DAY1_KM} km`);
    expect(a?.text).toContain("estimate, haversine × 1.3");
  });

  test("Which day is the busiest? → busiest z imeni postankov", () => {
    const a = ask("Which day is the busiest?", { lang: "en" });
    expect(a?.intent).toBe("busiest");
    expect(a?.text).toContain("The busiest day is day 1");
    expect(a?.text).toContain("[Ljubljana, Bled]");
    expect(a?.text).toContain("computed — not a feeling");
  });

  test("How much will it cost (total and per person)? → cost_total", () => {
    const a = ask("How much will it cost (total and per person)?", {
      lang: "en",
    });
    expect(a?.intent).toBe("cost_total");
    expect(a?.text).toContain("Attractions: 75 €");
    expect(a?.text).toContain("38 € per person (2)");
    expect(a?.text).toContain("Your budget goal: €200");
    expect(a?.text).toContain("are NOT included");
  });
});

// ---------------------------------------------------------------------------
// 4. Iskrene poti — no guessing
// ---------------------------------------------------------------------------

describe("answerPlanQuestion — iskrene poti (brez ugibanja)", () => {
  test("dan izven obsega → out_of_range: popravek uporabnika, NE izmišljen dan", () => {
    const a = ask("Kaj je na dan 5?");
    expect(a?.intent).toBe("out_of_range");
    expect(a?.text).toContain("Načrt ima samo 2 dni");
    expect(a?.text).toContain("dneva 5 ni");
  });

  test("neprepoznano vprašanje → null (klicalec nadaljuje AI/fallback pot)", () => {
    expect(ask("Povej mi šalo.")).toBeNull();
    expect(ask("Katera je glavna reka na Kitajskem?")).toBeNull();
  });

  test("prekratko vprašanje (< 3 znaki) in prazen načrt → null", () => {
    expect(ask("A?")).toBeNull();
    expect(
      answerPlanQuestion({
        question: "Koliko km?",
        itinerary: {
          days: [],
          total_budget: 0,
          recommendations: [],
          tips: [],
          source: "fallback",
        },
      })
    ).toBeNull();
  });

  test("buildUnknownAnswer (SL): izrecna odklonitev ugibanja + 3 primeri + usmeritev", () => {
    const text = buildUnknownAnswer("sl");
    expect(text).toContain("Na to ne morem odgovoriti iz izračunanih dejstev");
    expect(text).toContain("ugibati pa ne bom"); // EXACT pogodba no-guessing
    expect(text).toContain("Prilagodi itinerer");
    for (const q of EXAMPLE_QUESTIONS.sl.slice(0, 3)) {
      expect(text).toContain(q);
    }
  });

  test("buildUnknownAnswer (EN): 'I won't guess' pogodba + primeri v EN", () => {
    const text = buildUnknownAnswer("en");
    expect(text).toContain("I can't answer that from the computed plan facts");
    expect(text).toContain("I won't guess"); // EXACT no-guessing contract
    expect(text).toContain("Adjust the itinerary");
    for (const q of EXAMPLE_QUESTIONS.en.slice(0, 3)) {
      expect(text).toContain(q);
    }
  });
});
