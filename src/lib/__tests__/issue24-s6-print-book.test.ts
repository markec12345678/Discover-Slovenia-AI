// ISSUE #24 SKLOP 6 (1.168.0) — »TRAVEL BOOK LITE« / PDF POVZETEK POTI
// (P3 backlog, Polarsteps Travel Book vzorec — DO NOT COPY monetizacija):
// pogodbenski + funkcionalni testi.
//
// Obseg:
//  ① FUNKCIONALNO computePrintCoverStats (čisti delivec): štetje dni/
//     postankov (samo veljavna imena), vsota ocen vstopnin (samo končne
//     vrednosti), vožnja POŠTENO dvostopenjsko (quality > kanonska
//     hevristika ~; nepoznana noga → izpust), stroški iz
//     strežniškega agregata (null = izpust), datumska obsega (veljaven ISO
//     start → SI format; manjkajoč/nesmiseln → null), defenziva nad
//     neznanim JSON;
//  ② FUNKCIONALNO formatDrivingMinutes: berljiva duracija + prazna
//     pri neveljavnem vhodu;
//  ③ SOURCE-CONTRACT print-cover.tsx: strežniška komponenta (BREZ
//     "use client"), print-only (hidden + print:block), aria-hidden,
//     fail-closed ploščice (manjkajoč podatek → IZPUST, nikoli €0/0 min),
//     L-slovar {sl,en} pariteta, čisto iz podatkov (brez omrežja/okna);
//  ④ SOURCE-CONTRACT shared-trip-screen.tsx: uvozi + izriše PrintCover
//     (PRED SharedTrip — naslovnica knjige), !embed vrata (D7), agregat
//     TripExpense v try/catch (ne-kritično), print:hidden higiena na 5
//     upravljalnih kartah (sodelovanje/rezervacije/proračun/dokumenti/
//     opomniki), dnevnik + vodnik NISO skriti (vesolje knjige);
//  ⑤ PRINT CSS regresija: globals.css ohranja @media print s .print-hide,
//     .pot-page črno-belo paleto, break-inside-avoid karticami in
//     obnavljanjem line-clamp (PDF izhod ostane čist);
//  ⑥ ISKRENOST: vse vrednosti platnice izhajajo IZKLJUČNO iz props
//     (computePrintCoverStats) — nobenih izmišljenih vsebin.
//
// Vzorec: source-contract readFileSync (isto kot issue24-s3/s4/s5) +
// funkcionalni klici čistih funkcij (0 DB — sandbox prijazno).

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  computePrintCoverStats,
  formatDrivingMinutes,
  type ExpenseSummary,
} from "../print-book";
// heuristicLeg = kanon etape (isti vir številk kot povezovalnik plannerja
// in strežniški PDF izvoz) — pričakovana vrednost vožnje v testu izračunamo
// NEODVISNO iz istega kanona (testira NAŠO seštevalno logiko).
import { heuristicLeg } from "../road-routing";
import type { Itinerary } from "../types";

const ROOT = join(import.meta.dir, "../../..");

function source(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

const COVER = source("src/app/pot/[shareId]/print-cover.tsx");
const SCREEN = source("src/app/pot/shared-trip-screen.tsx");
const GLOBALS = source("src/app/globals.css");
const PRINT_BOOK = source("src/lib/print-book.ts");

/** Minimalen veljaven dan z lokacijami (isti kanon oblike kot s5 fixture). */
function day(n: number, locs: Array<Partial<Itinerary["days"][number]["locations"][number]>>) {
  return {
    day: n,
    locations: locs.map((l) => ({
      destination_id: l.destination_id ?? "d1",
      destination_name: l.destination_name ?? "Kraj",
      time_slot: "morning",
      duration: 60,
      estimated_cost: l.estimated_cost ?? 0,
      notes: "",
      ...l,
    })),
    weather: { condition: "jasno", temp: 20 },
  };
}

function itinerary(overrides: Partial<Itinerary> = {}): Itinerary {
  return {
    days: [
      day(1, [
        { destination_name: "Ljubljana", estimated_cost: 10 },
        { destination_name: "Bled", estimated_cost: 5 },
      ]),
      day(2, [{ destination_name: "Bohinj", estimated_cost: 8 }]),
    ],
    total_budget: 100,
    recommendations: [],
    tips: [],
    source: "deterministic",
    ...overrides,
  } as Itinerary;
}

const EXPENSES: ExpenseSummary = { totalEur: 123.456, count: 4 };

// ---------------------------------------------------------------------------
// ① computePrintCoverStats — čista matematika nad podatki
// ---------------------------------------------------------------------------

describe("① computePrintCoverStats — dnevi, postanki, stroški, datumi", () => {
  test("šteje dni in postanke ter sešteje ocene vstopnin", () => {
    const stats = computePrintCoverStats(itinerary(), EXPENSES);
    expect(stats.days).toBe(2);
    expect(stats.stops).toBe(3);
    expect(stats.estimatedCostEur).toBe(23);
  });

  test("vožnja: quality (FW4.1) ima PREDNOST pred hevristiko", () => {
    const withQuality = itinerary({
      quality: {
        drivingMinutes: 225,
        estimatedCost: 23,
        budgetTier: "€",
        tempo: "Umirjen",
        natureScore: 4,
        foodScore: 3,
        days: 2,
        groupSize: 2,
      },
    } as Partial<Itinerary>);
    expect(computePrintCoverStats(withQuality, null).drivingMinutes).toBe(225);
  });

  test("vožnja: brez quality → KANONSKA hevristika (heuristicLeg po nogah; isti vir kot planner/PDF izvoz)", () => {
    // LJ → Bled → Bohinj v enem dnevu (koordinate obstoječih krajev)
    const withCoords = itinerary({
      days: [
        day(1, [
          { destination_name: "Ljubljana", lat: 46.0569, lng: 14.5058 },
          { destination_name: "Bled", lat: 46.3683, lng: 14.1139 },
          { destination_name: "Bohinj", lat: 46.2864, lng: 13.8575 },
        ]),
      ],
    });
    const stats = computePrintCoverStats(withCoords, null);
    const expected =
      heuristicLeg(
        { lat: 46.0569, lng: 14.5058 },
        { lat: 46.3683, lng: 14.1139 }
      ).min +
      heuristicLeg(
        { lat: 46.3683, lng: 14.1139 },
        { lat: 46.2864, lng: 13.8575 }
      ).min;
    expect(stats.drivingMinutes).toBe(Math.round(expected));
    expect(stats.drivingMinutes).toBeGreaterThan(0);
  });

  test("vožnja fail-closed: KATERAKOLI noga brez koordinat → null (ne zanižamo)", () => {
    const missingOne = itinerary({
      days: [
        day(1, [
          { destination_name: "Ljubljana", lat: 46.0569, lng: 14.5058 },
          { destination_name: "Brez koordinat" },
        ]),
      ],
    });
    expect(
      computePrintCoverStats(missingOne, null).drivingMinutes
    ).toBeNull();
    // brez koordinat povsod (fixture privzeto) → tudi null
    expect(computePrintCoverStats(itinerary(), null).drivingMinutes).toBeNull();
  });

  test("vožnja: 0,0 null-island je neveljavna koordinata; samotni postanki (0 nog) → null", () => {
    const nullIsland = itinerary({
      days: [
        day(1, [
          { destination_name: "A", lat: 46.05, lng: 14.5 },
          { destination_name: "B", lat: 0, lng: 0 },
        ]),
      ],
    });
    expect(computePrintCoverStats(nullIsland, null).drivingMinutes).toBeNull();
    const singleStops = itinerary({
      days: [day(1, [{ destination_name: "Sam", lat: 46.05, lng: 14.5 }])],
    });
    expect(
      computePrintCoverStats(singleStops, null).drivingMinutes
    ).toBeNull();
  });

  test("stroški: agregat null → ploščica izpuščena; prazen nabor → izpuščena", () => {
    expect(computePrintCoverStats(itinerary(), null).expensesEur).toBeNull();
    expect(
      computePrintCoverStats(itinerary(), { totalEur: 0, count: 0 }).expensesEur
    ).toBeNull();
  });

  test("stroški: zaokrožitev na 2 decimalki + števec vnosov", () => {
    const stats = computePrintCoverStats(itinerary(), EXPENSES);
    expect(stats.expensesEur).toBe(123.46);
    expect(stats.expensesCount).toBe(4);
  });

  test("vir načrta: samo znane vrednosti, sicer null (defenzivno)", () => {
    expect(
      computePrintCoverStats(itinerary({ source: "deterministic" }), null)
        .source
    ).toBe("deterministic");
    expect(
      computePrintCoverStats(itinerary({ source: "ai" }), null).source
    ).toBe("ai");
    expect(
      computePrintCoverStats(itinerary({ source: "fallback" }), null).source
    ).toBe("fallback");
    expect(
      computePrintCoverStats(
        itinerary({ source: "izmišljen" } as unknown as Partial<Itinerary>),
        null
      ).source
    ).toBeNull();
    expect(
      computePrintCoverStats({ days: [] } as unknown as Itinerary, null)
        .source
    ).toBeNull();
  });

  test("datumska obsega: veljaven ISO start + dnevi → JEZIK-NEODVISEN ISO par", () => {
    const stats = computePrintCoverStats(
      itinerary({ tripStartDate: "2026-09-12" }),
      null
    );
    expect(stats.tripDates).toEqual({
      start: "2026-09-12",
      end: "2026-09-13",
    });
  });

  test("datumska obsega: en dan → end = start; manjkajoč/neveljaven start → null", () => {
    const one = itinerary({ tripStartDate: "2026-09-12" });
    one.days = [one.days[0]];
    expect(computePrintCoverStats(one, null).tripDates).toEqual({
      start: "2026-09-12",
      end: "2026-09-12",
    });
    expect(
      computePrintCoverStats(itinerary({ tripStartDate: "crga" }), null)
        .tripDates
    ).toBeNull();
    expect(computePrintCoverStats(itinerary(), null).tripDates).toBeNull();
  });

  test("defenzivno: days brez seznama/lokacij brez imen ne napihnejo števil", () => {
    const broken = {
      days: [
        { day: 1, locations: "ne-seznam" },
        { day: 2, locations: [{ destination_name: "", estimated_cost: 5 }] },
        { day: 3, locations: [{ destination_name: "Velika Planina" }] },
      ],
    } as unknown as Itinerary;
    const stats = computePrintCoverStats(broken, null);
    expect(stats.days).toBe(3);
    expect(stats.stops).toBe(1);
    expect(stats.estimatedCostEur).toBeNull();
  });

  test("ocena vstopnin: neveljavni zneski se preskočijo, vsaj en znan → vsota", () => {
    const mixed = itinerary({
      days: [
        day(1, [
          { destination_name: "A", estimated_cost: Number.NaN },
          { destination_name: "B", estimated_cost: 7.004 },
          { destination_name: "C", estimated_cost: -3 },
        ]),
      ],
    });
    const stats = computePrintCoverStats(mixed, null);
    expect(stats.estimatedCostEur).toBe(7);
  });

  test("prazen itinerer (0 dni) → vse številke 0/null, brez izjem", () => {
    const stats = computePrintCoverStats(
      { days: [] } as unknown as Itinerary,
      null
    );
    expect(stats.days).toBe(0);
    expect(stats.stops).toBe(0);
    expect(stats.estimatedCostEur).toBeNull();
    expect(stats.tripDates).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ② formatDrivingMinutes — berljiva duracija
// ---------------------------------------------------------------------------

describe("② formatDrivingMinutes — berljiva duracija", () => {
  test("minuti, ure, kombinacija", () => {
    expect(formatDrivingMinutes(45)).toBe("45 min");
    expect(formatDrivingMinutes(60)).toBe("1 h");
    expect(formatDrivingMinutes(225)).toBe("3 h 45 min");
  });

  test("neveljavni vhodi → prazen niz (ploščica se ne izriše)", () => {
    expect(formatDrivingMinutes(0)).toBe("");
    expect(formatDrivingMinutes(-10)).toBe("");
    expect(formatDrivingMinutes(Number.NaN)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// ③ print-cover.tsx — strežniška print-only komponenta (pogodba vira)
// ---------------------------------------------------------------------------

describe("③ print-cover.tsx — platnica po kanonu", () => {
  test("strežniška RSC komponenta — BREZ use client, brez omrežja/okna", () => {
    expect(COVER).not.toContain('"use client"');
    expect(COVER).not.toContain("use client");
    expect(COVER).not.toContain("fetch(");
    expect(COVER).not.toContain("window.");
    expect(COVER).not.toContain("localStorage");
  });

  test("print-only: hidden na zaslonu + print:block pri tiskanju", () => {
    expect(COVER).toContain("hidden");
    expect(COVER).toContain("print:block");
  });

  test("aria-hidden — nevidna platnica ni v bralnikih (isti vzorec kot URL nogica)", () => {
    expect(COVER).toContain('aria-hidden="true"');
  });

  test("tip PrintCoverStats uvožen iz print-book (čisti delivec = edini vir)", () => {
    expect(COVER).toContain("from \"@/lib/print-book\"");
    expect(COVER).toContain("PrintCoverStats");
  });

  test("fail-closed ploščice: manjkajoč podatek → IZPUST (pogojni push)", () => {
    expect(COVER).toContain("if (driving)");
    expect(COVER).toContain("if (stats.estimatedCostEur !== null)");
    expect(COVER).toContain("if (stats.expensesEur !== null)");
  });

  test("vožnja nosi oznako ocene ~ (isti kanon kot planner »~X km · ~Y min«)", () => {
    expect(COVER).toContain("`~${driving}`");
  });

  test("vir načrta — iskrena oznaka ISTEGA besedila kot hero/PDF izvoz, obojezikovno", () => {
    const slBlock = COVER.slice(COVER.indexOf("sl: {"), COVER.indexOf("en: {"));
    const enBlock = COVER.slice(COVER.indexOf("en: {"));
    expect(slBlock).toContain('sourceAi: "AI načrt"');
    expect(slBlock).toContain('sourceDeterministic: "Načrt brez AI (deterministični motor)"');
    expect(slBlock).toContain('sourceFallback: "Rezervni načrt"');
    expect(enBlock).toContain('sourceAi: "AI plan"');
    expect(enBlock).toContain('sourceDeterministic: "Itinerary without AI (deterministic engine)"');
    expect(enBlock).toContain('sourceFallback: "Fallback plan"');
    // pogojni izris (fail-closed: neznan vir → brez vrstice)
    expect(COVER).toContain("{sourceLabel && (");
  });

  test("obseg poti se formatira PO JEZIKU: SL genitivni kanon, EN en-GB", () => {
    // SL: formatDateRangeSI (genitiv, isti kanon kot povsod na /pot)
    expect(COVER).toContain("formatDateRangeSI(tripDates.start");
    // EN: lastna en-GB oblika (10–12 October 2026) — NE slovenskih mesecev
    expect(COVER).toContain("formatRangeEn");
    expect(COVER).toContain('"en-GB"');
  });

  test("datumska vrstica se čisto izpusti, ko ni podatka", () => {
    expect(COVER).toContain("(tripRange || created)");
    expect(COVER).toContain('created ? `${t.createdLabel} ${created}` : ""');
  });

  test("L-slovar {sl,en} pariteta ključev platnice", () => {
    const keys = [
      "wordmark",
      "daysLabel",
      "daysOne",
      "stopsLabel",
      "stopsOne",
      "drivingLabel",
      "ticketsLabel",
      "createdLabel",
    ];
    const slBlock = COVER.slice(
      COVER.indexOf("sl: {"),
      COVER.indexOf("en: {")
    );
    const enBlock = COVER.slice(COVER.indexOf("en: {"));
    for (const k of keys) {
      expect(slBlock).toContain(`${k}:`);
      expect(enBlock).toContain(`${k}:`);
    }
    // trackedLabel je funkcija v obeh jezikih (množina)
    expect(slBlock).toContain("trackedLabel:");
    expect(enBlock).toContain("trackedLabel:");
  });

  test("slovenske množine USKLAJENE s strežniškim PDF izvozom (1 dan / 2 dneva / 3+ dni; 2–4 postanki)", () => {
    expect(COVER).toContain('"dan"');
    expect(COVER).toContain('"dneva"');
    expect(COVER).toContain('"dni"');
    expect(COVER).not.toContain('"dnevi"');
    expect(COVER).toContain('"postanek"');
    expect(COVER).toContain('"postanki"');
    expect(COVER).toContain('"postankov"');
    expect(COVER).not.toContain('"postanka"');
  });

  test("iskrenost: vrednosti ploščic IZKLJUČNO iz stats prop (brez izmišljenih)", () => {
    // nobenih vpisanih številk/krajev — vse dinamike iz stats/name
    const tilesBlock = COVER.slice(
      COVER.indexOf("const tiles"),
      COVER.indexOf("return (")
    );
    expect(tilesBlock).toContain("stats.days");
    expect(tilesBlock).toContain("stats.stops");
    expect(tilesBlock).toContain("stats.estimatedCostEur");
    expect(tilesBlock).toContain("stats.expensesEur");
    expect(tilesBlock).toContain("stats.expensesCount");
    expect(tilesBlock).not.toMatch(/value: "\d/);
  });
});

// ---------------------------------------------------------------------------
// ④ shared-trip-screen.tsx — integracija + print higiena (pogodba vira)
// ---------------------------------------------------------------------------

describe("④ shared-trip-screen — platnica + čist PDF izhod", () => {
  test("uvozi PrintCover + computePrintCoverStats + ExpenseSummary", () => {
    expect(SCREEN).toContain('from "./[shareId]/print-cover"');
    expect(SCREEN).toContain("computePrintCoverStats");
    expect(SCREEN).toContain("ExpenseSummary");
  });

  test("izrise PrintCover PRED SharedTrip (naslovnica knjige = vrh PDF)", () => {
    const coverPos = SCREEN.indexOf("<PrintCover");
    const tripPos = SCREEN.indexOf("<SharedTrip");
    expect(coverPos).toBeGreaterThan(0);
    expect(tripPos).toBeGreaterThan(coverPos);
  });

  test("D7: platnica SAMO na polni strani (!embed) — blogger iframe brez nje", () => {
    const block = SCREEN.slice(
      SCREEN.indexOf("{!embed && ("),
      SCREEN.indexOf("<PrintCover") + 200
    );
    expect(block).toContain("<PrintCover");
  });

  test("agregat TripExpense v try/catch (ne-kritično — stran se izriše vedno)", () => {
    const agg = SCREEN.slice(
      SCREEN.indexOf("tripExpense.aggregate"),
      SCREEN.indexOf("tripExpense.aggregate") + 700
    );
    expect(agg).toContain("_sum: { amountEur: true }");
    expect(agg).toContain("console.error");
  });

  test("statistika platnice gre SKOZI čisti delivec (edini vir resnice)", () => {
    expect(SCREEN).toContain(
      "computePrintCoverStats(saved.itinerary, expenseSummary)"
    );
  });

  test("print:hidden na 5 upravljalnih kartah (PDF brez obrazcev/gumbov)", () => {
    const pairs: Array<[string, string]> = [
      ["TripCollaboration", "sodelovanje"],
      ["TripReservations", "rezervacije"],
      ["TripBudgetCard", "proračun"],
      ["TripDocumentsCard", "dokumenti"],
      ["TripPushCard", "opomniki"],
    ];
    for (const [tag] of pairs) {
      const idx = SCREEN.indexOf(`<${tag}`);
      expect(idx).toBeGreaterThan(0);
      // ovojnica pred komponento nosi print:hidden
      const wrapper = SCREEN.slice(Math.max(0, idx - 320), idx);
      expect(wrapper).toContain("print:hidden");
    }
  });

  test("dnevnik in vodnik OSTANEJO v tiskanju (vsebina knjige/spomini)", () => {
    for (const tag of ["<TripDiary", "<TripGuide"]) {
      const idx = SCREEN.indexOf(tag);
      expect(idx).toBeGreaterThan(0);
      const wrapper = SCREEN.slice(Math.max(0, idx - 320), idx);
      expect(wrapper).not.toContain("print:hidden");
      expect(wrapper).not.toContain("print-hide");
    }
  });

  test("predhodni kanoni ostajajo: URL nogica + QR v PDF (regresija)", () => {
    expect(SCREEN).toContain("print:block");
    expect(SCREEN).toContain("<PrintQr");
    expect(SCREEN).toContain("printFooter");
  });
});

// ---------------------------------------------------------------------------
// ⑤ globals.css — tiskalni predpisi ostajajo nedotaknjeni (regresija)
// ---------------------------------------------------------------------------

describe("⑤ print CSS — .pot-page kanon (regresija)", () => {
  test("@media print s .print-hide ostaja", () => {
    expect(GLOBALS).toContain("@media print");
    expect(GLOBALS).toContain(".print-hide");
  });

  test("črno-bela paleta .pot-page ostaja (tudi iz dark mode)", () => {
    expect(GLOBALS).toContain(".pot-page");
    expect(GLOBALS).toContain("background: #fff !important");
  });

  test("kartice se ne razlamajo čez prelom strani", () => {
    expect(GLOBALS).toContain("break-inside: avoid");
  });

  test("hero glava deljene poti se ob tiskanju skrije SAMO na polni strani (embed ohrani)", () => {
    // komponenta nosi razred
    const st = source("src/components/shared-trip.tsx");
    expect(st).toContain('className="shared-hero');
    // CSS pravilo je SCOPED na .pot-page (embed pot-embed-page ohrani hero)
    expect(GLOBALS).toContain(".pot-page .shared-hero");
    expect(GLOBALS).not.toContain(".pot-embed-page .shared-hero");
  });

  test("povrni prirezano besedilo (line-clamp) v PDF", () => {
    expect(GLOBALS).toContain(".line-clamp-2");
    expect(GLOBALS).toContain(".line-clamp-4");
  });
});

// ---------------------------------------------------------------------------
// ⑥ iskrenost — čisti delivec brez stranskih učinkov
// ---------------------------------------------------------------------------

describe("⑥ print-book.ts — čist delivec (determinizem)", () => {
  test("brez omrežja/stranskih učinkov — enaki vhodi → enaka statistika", () => {
    expect(PRINT_BOOK).not.toContain("fetch(");
    expect(PRINT_BOOK).not.toContain("window.");
    expect(PRINT_BOOK).not.toContain("localStorage");
    const a = computePrintCoverStats(itinerary(), EXPENSES);
    const b = computePrintCoverStats(itinerary(), EXPENSES);
    expect(a).toEqual(b);
  });

  test("varovalo dokumentirano: vožnja dvostopenjsko (quality > kanonska hevristika)", () => {
    expect(PRINT_BOOK).toContain("KANONSKE hevristike");
    expect(PRINT_BOOK).toContain("fail-closed");
  });
});
