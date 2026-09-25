// ============================================================================
// ISSUE #5 / T5-D (M7) — ROČNO PRESTAVLJANJE POSTANKOV + DODAJ/ODSTRANI DAN
// ============================================================================
// Vrzel (matrika M7): "Planner: ni drag/drop prestavljanja, ni dodajanja/
// odstranjevanja dneva" (rg draggable|addDay = 0). Edini preureditvi sta
// bili optimalno zaporedje (optimizeDayOrder) in NL "prestavi X" (AI) —
// ročne kontrole ni bilo.
//
// Fix (T5-D): dve ČISTI deterministični operaciji (0 AI, 0 omrežja):
//  · lib/planner-reorder.ts — reorderStopInItinerary (termini kot
//    permutacija položajev po kanonu route-order.ts; intentLocked potuje
//    s postankom — §21 ročna namernost; invalidacija F16);
//  · lib/planner-days.ts — addDay/removeDay (renumeracija 1..N, crowdNotices
//    remap, tripEndDate prek trip-dates kanona, varovalki 1..14).
// UI: puščici ↑/↓ (tipkovnica + dotik + bralniki) + HTML5 drag/drop (miš) +
// gumb "Dodaj dan" + odstrani dan v glavi dneva; 17 novih i18n ključev
// (SL+EN, pariteta pinirana).
//
// Test varuje:
//   1. obnašanje obeh operacij (multiset ohranjenost, termini, renumeracija,
//      crowdNotices, tripEndDate, invalidacija, no-op varovalke, determinizem);
//   2. PRIKLOP NA PONENTE (prazni dan ne podre ICS izvoza ne Go Mode mosta);
//   3. source-contract plannerja (draggable/ondrop/puščici/gumba/handlerji);
//   4. i18n: VSEH 17 novih ključev v OBEH jezikih (eksplicitna pariteta).
// ============================================================================
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { reorderStopInItinerary } from "@/lib/planner-reorder";
import {
  addDay,
  removeDay,
  MAX_PLANNER_DAYS,
  MIN_PLANNER_DAYS,
} from "@/lib/planner-days";
import { buildItineraryICS } from "@/lib/ics-export";
import { buildItineraryGoView } from "@/lib/journey/itinerary-go";
import type { Itinerary, LocationVisit, DayPlan } from "@/lib/types";

const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const plannerSrc = read("src/components/sections/itinerary-planner.tsx");
const slMessages = JSON.parse(read("src/i18n/messages/sl.json"));
const enMessages = JSON.parse(read("src/i18n/messages/en.json"));

// ---------------------------------------------------------------------------
// fiksture
// ---------------------------------------------------------------------------

function v(
  id: string,
  slot: string,
  extra: Partial<LocationVisit> = {}
): LocationVisit {
  return {
    destination_id: id,
    destination_name: id.toUpperCase(),
    time_slot: slot,
    duration: 2,
    estimated_cost: 10,
    notes: "",
    ...extra,
  };
}

function it3(): Itinerary {
  return {
    days: [
      {
        day: 1,
        locations: [
          v("a", "09:00-11:00"),
          v("b", "11:30-13:30"),
          v("c", "14:00-16:00"),
        ],
        weather: { condition: "sončno", temp: 24 },
      },
    ],
    total_budget: 100,
    recommendations: [],
    tips: [],
    source: "deterministic",
  };
}

function names(day: DayPlan | undefined): string[] {
  return (day?.locations ?? []).map((l) => l.destination_id);
}

// ─────────────────────────────────────────────────────────────────────────
// 1. reorderStopInItinerary — obnašanje
// ─────────────────────────────────────────────────────────────────────────

describe("T5-D/M7: reorderStopInItinerary — čista operacija", () => {
  test("premik A z mesta 0 na mesto 2: [a,b,c] → [b,c,a]", () => {
    const next = reorderStopInItinerary(it3(), 1, 0, 2);
    expect(names(next.days[0])).toEqual(["b", "c", "a"]);
    // multiset postankov je ohranjen (nikoli ne izgubimo/kličnemo):
    expect(names(next.days[0]).sort()).toEqual(["a", "b", "c"]);
  });

  test("termini so PERMUTACIJA položajev (urejeni po začetku — kanon route-order)", () => {
    const next = reorderStopInItinerary(it3(), 1, 0, 2);
    expect(next.days[0].locations.map((l) => l.time_slot)).toEqual([
      "09:00-11:00", // položaj 1 → najzgodnejši termin
      "11:30-13:30",
      "14:00-16:00", // premaknjeni a prevzeme termin svojega NOVEGA položaja
    ]);
    // multiset terminov je ohranjen:
    const slots = next.days[0].locations.map((l) => l.time_slot).sort();
    expect(slots).toEqual(["09:00-11:00", "11:30-13:30", "14:00-16:00"]);
  });

  test("intentLocked POTUJE s postankom (§21 — ročna namernost je izrecna)", () => {
    const base = it3();
    base.days[0].locations[1].intentLocked = true; // b zaklenjen
    const next = reorderStopInItinerary(base, 1, 1, 2);
    expect(names(next.days[0])).toEqual(["a", "c", "b"]);
    // zastavica je ostala NA postanku b (potuje z njim):
    expect(next.days[0].locations[2].intentLocked).toBe(true);
    expect(next.days[0].locations[0].intentLocked).toBeUndefined();
  });

  test("invalidacija F16: routeGeometry dneva + quality/geoValidation/legs načrta", () => {
    const base = it3();
    base.days[0].routeGeometry = [[14.5, 46.0]];
    base.quality = {} as Itinerary["quality"];
    base.geoValidation = {} as Itinerary["geoValidation"];
    base.legs = {};
    const next = reorderStopInItinerary(base, 1, 0, 1);
    expect(next.days[0].routeGeometry).toBeUndefined();
    expect(next.quality).toBeUndefined();
    expect(next.geoValidation).toBeUndefined();
    expect(next.legs).toBeUndefined();
  });

  test("nerazpoznaven termin → vsak postanek obdrži SVOJEGA (varovalka)", () => {
    const base = it3();
    base.days[0].locations[1].time_slot = "po dopoldnevu"; // b nerazpoznaven
    const next = reorderStopInItinerary(base, 1, 0, 2);
    expect(names(next.days[0])).toEqual(["b", "c", "a"]);
    // termini ostanejo prilepljeni svojim postankom (a je obdržal
    // "09:00-11:00", b svojega "po dopoldnevu", c "14:00-16:00"):
    expect(next.days[0].locations.find((l) => l.destination_id === "a")?.time_slot).toBe("09:00-11:00");
    expect(next.days[0].locations.find((l) => l.destination_id === "b")?.time_slot).toBe("po dopoldnevu");
    expect(next.days[0].locations.find((l) => l.destination_id === "c")?.time_slot).toBe("14:00-16:00");
  });

  test("no-op varovalke vračajo ISTO referenco (from===to / izven meja / dan ne obstaja)", () => {
    const base = it3();
    expect(reorderStopInItinerary(base, 1, 1, 1)).toBe(base);
    expect(reorderStopInItinerary(base, 1, 0, 99)).toBe(base);
    expect(reorderStopInItinerary(base, 1, -1, 0)).toBe(base);
    expect(reorderStopInItinerary(base, 7, 0, 1)).toBe(base);
  });

  test("determinizem: enak vhod → enak izhod", () => {
    expect(reorderStopInItinerary(it3(), 1, 0, 2)).toEqual(
      reorderStopInItinerary(it3(), 1, 0, 2)
    );
  });

  test("vhod NI mutiran (čista funkcija)", () => {
    const base = it3();
    const snapshot = JSON.stringify(base);
    reorderStopInItinerary(base, 1, 0, 2);
    expect(JSON.stringify(base)).toBe(snapshot);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. addDay / removeDay — obnašanje
// ─────────────────────────────────────────────────────────────────────────

describe("T5-D/M7: addDay / removeDay — čisti operaciji", () => {
  test("addDay doda PRAZEN dan N+1 z ocenjenim neznanim vremenom", () => {
    const next = addDay(it3());
    expect(next.days).toHaveLength(2);
    const added = next.days[1];
    expect(added.day).toBe(2);
    expect(added.locations).toEqual([]);
    expect(added.weatherEstimated).toBe(true);
  });

  test("addDay preračuna tripEndDate (dan 1 = tripStartDate, koledarsko)", () => {
    const base = it3();
    base.tripStartDate = "2026-07-12";
    base.tripEndDate = "2026-07-12";
    const next = addDay(base);
    expect(next.tripEndDate).toBe("2026-07-13");
  });

  test("addDay invalidira strukturne metrike (kanon F16)", () => {
    const base = it3();
    base.quality = {} as Itinerary["quality"];
    base.geoValidation = {} as Itinerary["geoValidation"];
    base.legs = {};
    const next = addDay(base);
    expect(next.quality).toBeUndefined();
    expect(next.geoValidation).toBeUndefined();
    expect(next.legs).toBeUndefined();
  });

  test(`addDay varovalka: ${MAX_PLANNER_DAYS} dni je meja (no-op → ista referenca)`, () => {
    const base = it3();
    base.days = Array.from({ length: MAX_PLANNER_DAYS }, (_, i) => ({
      day: i + 1,
      locations: [v(`d${i}`, "09:00-11:00")],
      weather: { condition: "", temp: 0 },
    }));
    expect(addDay(base)).toBe(base);
  });

  test("removeDay renumerira preostale na GOSTO 1..N (luknje se zaprejo)", () => {
    const base = it3();
    base.days = [
      { day: 1, locations: [v("a", "09:00-11:00")], weather: { condition: "", temp: 0 } },
      { day: 3, locations: [v("c", "11:00-13:00")], weather: { condition: "", temp: 0 } },
      { day: 5, locations: [v("e", "13:00-15:00")], weather: { condition: "", temp: 0 } },
    ];
    const next = removeDay(base, 3); // odstrani srednji
    expect(next.days.map((d) => d.day)).toEqual([1, 2]);
    expect(next.days[0].locations[0].destination_id).toBe("a");
    expect(next.days[1].locations[0].destination_id).toBe("e"); // preštevilčen na 2
  });

  test("removeDay zamakne crowdNotices (odstranjeni dan odpade, višji se premaknejo)", () => {
    const base = it3();
    base.crowdNotices = [
      { day: 1, destination_id: "a", destination_name: "A", reason: "r", alternatives: [] },
      { day: 2, destination_id: "b", destination_name: "B", reason: "r", alternatives: [] },
      { day: 3, destination_id: "c", destination_name: "C", reason: "r", alternatives: [] },
    ];
    base.days = [
      { day: 1, locations: [v("a", "09:00-11:00")], weather: { condition: "", temp: 0 } },
      { day: 2, locations: [v("b", "11:00-13:00")], weather: { condition: "", temp: 0 } },
      { day: 3, locations: [v("c", "13:00-15:00")], weather: { condition: "", temp: 0 } },
    ];
    const next = removeDay(base, 2);
    expect(next.crowdNotices?.map((n) => n.day)).toEqual([1, 2]);
    expect(next.crowdNotices?.[1].destination_id).toBe("c"); // bil dan 3 → dan 2
  });

  test("removeDay preračuna tripEndDate", () => {
    const base = it3();
    base.tripStartDate = "2026-07-12";
    base.tripEndDate = "2026-07-14";
    base.days = [
      { day: 1, locations: [v("a", "09:00-11:00")], weather: { condition: "", temp: 0 } },
      { day: 2, locations: [v("b", "11:00-13:00")], weather: { condition: "", temp: 0 } },
      { day: 3, locations: [v("c", "13:00-15:00")], weather: { condition: "", temp: 0 } },
    ];
    const next = removeDay(base, 3);
    expect(next.tripEndDate).toBe("2026-07-13");
  });

  test(`removeDay varovalki: ${MIN_PLANNER_DAYS} dan minimum + manjkajoč dan (no-op)`, () => {
    const single = it3();
    expect(removeDay(single, 1)).toBe(single); // edini dan
    const base = it3();
    expect(removeDay(base, 9)).toBe(base); // dan ne obstaja
  });

  test("addDay → PRAZNI dan ne podre ICS izvoza ne Go Mode mosta", () => {
    const base = it3();
    base.tripStartDate = "2026-07-12";
    base.tripEndDate = "2026-07-12";
    const next = addDay(base);
    // ICS izvoz prenese prazen dan (brez izjeme, veljaven izhod):
    const ics = buildItineraryICS(next, { lang: "sl" });
    expect(typeof ics === "string" || ics === null).toBe(true);
    // Go Mode most prenese prazen dan (0 postankov dneva 2):
    const goView = buildItineraryGoView(next, { lang: "sl", name: "Test" });
    expect(Array.isArray(goView.days)).toBe(true);
    expect(goView.days).toHaveLength(2);
  });

  test("determinizem: addDay in removeDay sta ponovljivi", () => {
    expect(addDay(it3())).toEqual(addDay(it3()));
    expect(removeDay(it3(), 1)).toEqual(removeDay(it3(), 1));
  });

  test("vhoda addDay/removeDay NISTA mutirana (čisti funkciji)", () => {
    const base = it3();
    const snapshot = JSON.stringify(base);
    addDay(base);
    removeDay(base, 1);
    expect(JSON.stringify(base)).toBe(snapshot);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. Source-contract — priklop planner UI
// ─────────────────────────────────────────────────────────────────────────

describe("T5-D/M7: source-contract itinerary-planner.tsx", () => {
  test("ročno prestavljanje: drag/drop (HTML5) + puščici ↑/↓ na isti operaciji", () => {
    expect(plannerSrc).toContain("applyStopReorder");
    expect(plannerSrc).toContain("draggable={day.locations.length > 1}");
    expect(plannerSrc).toContain("onDragStart");
    expect(plannerSrc).toContain("onDragOver");
    expect(plannerSrc).toContain("onDrop");
    expect(plannerSrc).toContain("GripVertical");
    expect(plannerSrc).toContain("ChevronUp");
    expect(plannerSrc).toContain('t("moveStopUpAria"');
    expect(plannerSrc).toContain('t("moveStopDownAria"');
  });

  test("dodajanje/odstranjevanje dneva: gumba + varovalki MAX/MIN", () => {
    expect(plannerSrc).toContain("handleAddDay");
    expect(plannerSrc).toContain("handleRemoveDay");
    expect(plannerSrc).toContain("addDayToItinerary");
    expect(plannerSrc).toContain("removeDayFromItinerary");
    expect(plannerSrc).toContain("MAX_PLANNER_DAYS");
    // gumb "Dodaj dan" je onesposobljen na meji (poštena meja, ne tiha):
    expect(plannerSrc).toMatch(
      /disabled=\{itinerary\.days\.length >= MAX_PLANNER_DAYS\}/
    );
    // odstrani dan se skrije, ko je dan EDINI (varovalka):
    expect(plannerSrc).toContain("itinerary.days.length > 1 && (");
    expect(plannerSrc).toContain("Trash2");
    expect(plannerSrc).toContain('t("removeDayAria"');
  });

  test("strukturna sprememba razveljavi deljeno povezavo + formData.days sinhronizacija", () => {
    // vsi trije handlerji nosijo kanon F16 (shareUrl ugasi) + sync dni:
    const handlerBlocks = plannerSrc.match(/function (applyStopReorder|handleAddDay|handleRemoveDay)\(/g);
    expect(handlerBlocks).toHaveLength(3);
    expect(plannerSrc).toContain("setFormData((p) => ({ ...p, days: next.days.length }))");
  });

  test("dogodki analitike so priklopljeni (stop_reordered / day_added / day_removed)", () => {
    expect(plannerSrc).toContain('"stop_reordered"');
    expect(plannerSrc).toContain('"day_added"');
    expect(plannerSrc).toContain('"day_removed"');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. i18n — VSI novi ključi v OBEH jezikih (eksplicitna pariteta)
// ─────────────────────────────────────────────────────────────────────────

describe("T5-D/M7: i18n pariteta novih ključev (SL + EN)", () => {
  const NEW_KEYS = [
    "moveStopUpAria",
    "moveStopUpTitle",
    "moveStopDownAria",
    "moveStopDownTitle",
    "dragHandleTitle",
    "stopReorderedToastTitle",
    "addDay",
    "addDayAria",
    "addDayMaxTitle",
    "addDayMaxDesc",
    "dayAddedToastTitle",
    "dayAddedToastDesc",
    "removeDayAria",
    "removeDayTitle",
    "removeDayMinTitle",
    "dayRemovedToastTitle",
    "dayRemovedToastDesc",
  ] as const;

  test("vsak ključ obstaja v planner NS obeh jezikov", () => {
    for (const key of NEW_KEYS) {
      expect(key in slMessages.planner).toBe(true);
      expect(key in enMessages.planner).toBe(true);
    }
  });

  test("in blanco interpolacije so skladne ({name}/{day}/{max} v vrednostih obeh jezikov)", () => {
    for (const key of NEW_KEYS) {
      const sl = String(slMessages.planner[key]);
      const en = String(enMessages.planner[key]);
      const placeholders = (s: string) => (s.match(/\{[^}]+\}/g) ?? []).sort();
      expect(placeholders(sl)).toEqual(placeholders(en));
    }
  });
});
