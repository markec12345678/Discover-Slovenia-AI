// ============================================================================
// ISSUE #6 / D6-B (M7+) — PRESTAVLJANJE POSTANKA MED DNEVI + VARNOSTNO
// ODSTRANJEVANJE DNEVA S POSTANKI
// ============================================================================
// Vrzel (M7+ po T5-D): (1) ročno prestavljanje je bilo omejeno na ZNOTRAJ
// dneva — med dnevi je edina pot bil NL ukaz AI („prestavi X na dan 2");
// (2) „Odstrani dan" je brišal TAKOJ tudi dneve S postanki (destruktiven
// popravek brez potrditve — en klik uniči N postankov iz načrta).
//
// Fix (D6-B):
//  · lib/planner-reorder.ts — moveStopToDay(it, day, idx, targetDay):
//    čista operacija — postanek se odstrani iz izvornega dneva in PRIPNE
//    NA KONEC ciljnega dneva z VSEMI polji (intentLocked potuje z njim —
//    §21); termini se NE prerazporejajo (ciljni dan ima svojo kronologijo);
//    invalidacija routeGeometry OBEH dni + quality/geoValidation/legs;
//  · itinerary-planner.tsx — gumba ChevronLeft/ChevronRight na postanku
//    (prejšnji/naslednji dan; onemogočena na mejah) + radix AlertDialog
//    pred odstranitvijo dneva S postanki (prazen dan gre takoj skozi).
//
// Test varuje:
//   1. obnašanje moveStopToDay (priloga na konec, ohranjenost polj +
//      intentLocked, multiset dni, invalidacija, no-op varovalke,
//      determinizem, nemutiranost);
//   2. removeDay MIN 1 varovalka ostaja (D6-B je dodal SAMO dialog —
//      čista logika iz planner-days.ts se ni spremenila);
//   3. source-contract plannerja (AlertDialog + potrditvena vrata +
//      gumba prejšnji/naslednji dan z aria-label + meje onemogočenja);
//   4. i18n: VSIH 8 novih ključev v OBEH jezikih (eksplicitna pariteta
//      na vrhu task71 varovalke).
// ============================================================================
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  reorderStopInItinerary,
  moveStopToDay,
} from "@/lib/planner-reorder";
import { removeDay, MIN_PLANNER_DAYS } from "@/lib/planner-days";
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

/** Tridnevni načrt z različnim številom postankov na dan (gosto 1..3). */
function it3d(): Itinerary {
  return {
    days: [
      {
        day: 1,
        locations: [
          v("a", "09:00-11:00"),
          v("b", "11:30-13:30"),
        ],
        weather: { condition: "sončno", temp: 24 },
      },
      {
        day: 2,
        locations: [v("c", "10:00-12:00")],
        weather: { condition: "oblačno", temp: 19 },
      },
      {
        day: 3,
        locations: [
          v("d", "09:30-11:30"),
          v("e", "13:00-15:00"),
          v("f", "16:00-18:00"),
        ],
        weather: { condition: "dež", temp: 15 },
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

/** Multiset VSEH postankov načrta (kanon: nikoli ne izgubimo/kličnemo). */
function allStops(it: Itinerary): string[] {
  return it.days
    .flatMap((d) => d.locations.map((l) => l.destination_id))
    .sort();
}

// ─────────────────────────────────────────────────────────────────────────
// 1. moveStopToDay — obnašanje
// ─────────────────────────────────────────────────────────────────────────

describe("D6-B (M7+): moveStopToDay — čista operacija med dnevi", () => {
  test("happy path: postanek se odstrani iz izvora in PRIPNE NA KONEC cilja", () => {
    const base = it3d();
    const next = moveStopToDay(base, 1, 1, 2); // b → dan 2
    expect(names(next.days[0])).toEqual(["a"]); // izvor brez b
    expect(names(next.days[1])).toEqual(["c", "b"]); // b PRIPNjen na konec
    expect(names(next.days[2])).toEqual(["d", "e", "f"]); // nedotaknjen dan
    expect(next.days.map((d) => d.day)).toEqual([1, 2, 3]); // številke nespremenjene
  });

  test("postanek obdrži VSA svoja polja (termin, trajanje, cena, opomba, kategorija)", () => {
    const base = it3d();
    const stop = base.days[0].locations[1];
    stop.duration = 4;
    stop.estimated_cost = 55;
    stop.notes = "opomba iz klepeta";
    stop.category = "chat";
    const next = moveStopToDay(base, 1, 1, 2);
    const moved = next.days[1].locations.find(
      (l) => l.destination_id === "b"
    );
    expect(moved).toBeDefined();
    expect(moved?.time_slot).toBe("11:30-13:30"); // TERMIN potuje s postankom (brez prerazporeditve)
    expect(moved?.duration).toBe(4);
    expect(moved?.estimated_cost).toBe(55);
    expect(moved?.notes).toBe("opomba iz klepeta");
    expect(moved?.category).toBe("chat");
  });

  test("intentLocked POTUJE s postankom (§21 — ročna namernost je izrecna)", () => {
    const base = it3d();
    base.days[0].locations[0].intentLocked = true; // a zaklenjen
    const next = moveStopToDay(base, 1, 0, 3); // a → dan 3
    expect(names(next.days[0])).toEqual(["b"]);
    expect(names(next.days[2])).toEqual(["d", "e", "f", "a"]); // prine na konec
    const moved = next.days[2].locations.find(
      (l) => l.destination_id === "a"
    );
    expect(moved?.intentLocked).toBe(true); // zastavica je OSTALA na postanku
    expect(
      next.days[2].locations.filter((l) => l.intentLocked === true)
    ).toHaveLength(1);
  });

  test("termini ciljnega dneva se NE prerazporejajo (kronologija cilja ostane)", () => {
    const base = it3d();
    const next = moveStopToDay(base, 1, 0, 3); // a (09:00-11:00) → dan 3
    expect(next.days[2].locations.map((l) => l.time_slot)).toEqual([
      "09:30-11:30", // d obdrži svojega
      "13:00-15:00", // e obdrži svojega
      "16:00-18:00", // f obdrži svojega
      "09:00-11:00", // a prine na konec S SVOJIM terminom
    ]);
  });

  test("multiset postankov celega načrta je ohranjen (0 izgub, 0 klonov)", () => {
    const base = it3d();
    expect(allStops(moveStopToDay(base, 1, 1, 3))).toEqual(allStops(base));
    expect(allStops(moveStopToDay(base, 3, 2, 2))).toEqual(allStops(base));
  });

  test("prestavitev v PRAZEN dan dela (postanek postane edini na cilju)", () => {
    const base = it3d();
    base.days[1].locations = [];
    const next = moveStopToDay(base, 1, 0, 2);
    expect(names(next.days[1])).toEqual(["a"]);
  });

  test("izgorni dan ostane z routeGeometry=undefined in PRAZEN seznam če je imel 1 postanek", () => {
    const base = it3d();
    base.days[0].routeGeometry = [[14.5, 46.0]];
    base.days[2].routeGeometry = [[15.0, 46.5]];
    const next = moveStopToDay(base, 2, 0, 1); // edini postanek dneva 2 → dan 1
    expect(names(next.days[1])).toEqual([]); // izvor izpraznjen
    expect(next.days[0].routeGeometry).toBeUndefined(); // invalidirana geometrija OBEH dni
    expect(next.days[1].routeGeometry).toBeUndefined();
    expect(next.days[2].routeGeometry).toEqual([[15, 46.5]]); // NEDOTAKNJEN dan obdrži svojo geometrijo
  });

  test("invalidacija F16: quality/geoValidation/legs načrta", () => {
    const base = it3d();
    base.quality = {} as Itinerary["quality"];
    base.geoValidation = {} as Itinerary["geoValidation"];
    base.legs = {};
    const next = moveStopToDay(base, 1, 1, 2);
    expect(next.quality).toBeUndefined();
    expect(next.geoValidation).toBeUndefined();
    expect(next.legs).toBeUndefined();
  });

  test("mejne varovalke: dan 1 ← prejšnji (0) in zadnji dan → naslednji (N+1) sta no-op", () => {
    const base = it3d();
    expect(moveStopToDay(base, 1, 0, 0)).toBe(base); // UI: prev gumb onemogočen na dnevu 1
    expect(moveStopToDay(base, 3, 0, 4)).toBe(base); // UI: next gumb onemogočen na zadnjem dnevu
  });

  test("neveljaven ciljni dan / izvor / indeks → ISTA referenca (no-op)", () => {
    const base = it3d();
    expect(moveStopToDay(base, 1, 0, 99)).toBe(base); // cilj ne obstaja
    expect(moveStopToDay(base, 9, 0, 2)).toBe(base); // izvor ne obstaja
    expect(moveStopToDay(base, 1, -1, 2)).toBe(base); // indeks pod mejo
    expect(moveStopToDay(base, 1, 5, 2)).toBe(base); // indeks nad mejo
    expect(moveStopToDay(base, 1, 0, 1)).toBe(base); // target === source (isti dan)
  });

  test("determinizem: enak vhod → enak izhod (samo po seji znotraj dneva ostane)", () => {
    const a = moveStopToDay(it3d(), 1, 1, 3);
    const b = moveStopToDay(it3d(), 1, 1, 3);
    expect(a).toEqual(b);
    // kombinacija: prestavitev med dnevi NE podre znotraj-dnevne permutacije
    // (b prine na konec dneva 3 → [d,e,f,b]; premik z mesta 3 na 2 → [d,e,b,f])
    const combo = reorderStopInItinerary(
      moveStopToDay(it3d(), 1, 1, 3),
      3,
      3,
      2
    );
    expect(names(combo.days[2])).toEqual(["d", "e", "b", "f"]);
  });

  test("vhod NI mutiran (čista funkcija)", () => {
    const base = it3d();
    const snapshot = JSON.stringify(base);
    moveStopToDay(base, 1, 1, 2);
    moveStopToDay(base, 3, 0, 1);
    expect(JSON.stringify(base)).toBe(snapshot);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. removeDay — MIN 1 varovalka ostaja (D6-B je dodal SAMO potrditev UI)
// ─────────────────────────────────────────────────────────────────────────

describe("D6-B (M7+): removeDay varovalke ostajajo", () => {
  test(`removeDay ohranja MIN ${MIN_PLANNER_DAYS} dan (edini dan = no-op)`, () => {
    const single: Itinerary = {
      days: [
        {
          day: 1,
          locations: [v("a", "09:00-11:00")],
          weather: { condition: "", temp: 0 },
        },
      ],
      total_budget: 10,
      recommendations: [],
      tips: [],
      source: "deterministic",
    };
    expect(removeDay(single, 1)).toBe(single);
  });

  test("removeDay na dni S postanki briše njegove postanke (razlog za potrditev)", () => {
    const base = it3d();
    const next = removeDay(base, 3); // dan 3 ima 3 postanke
    expect(next.days.map((d) => d.day)).toEqual([1, 2]);
    expect(allStops(next)).toEqual(["a", "b", "c"]); // d/e/f so res ODSTRANJENI
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. Source-contract — priklop planner UI
// ─────────────────────────────────────────────────────────────────────────

describe("D6-B (M7+): source-contract itinerary-planner.tsx", () => {
  test("odstranitev dneva S postanki zahteva POTRDITEV (AlertDialog + vrata)", () => {
    // radix AlertDialog (obstoječa shadcn komponenta, 0 novih odvisnosti):
    expect(plannerSrc).toContain("from \"@/components/ui/alert-dialog\"");
    expect(plannerSrc).toContain("<AlertDialog");
    expect(plannerSrc).toContain("<AlertDialogContent>");
    expect(plannerSrc).toContain("<AlertDialogAction");
    // vrata: klik na dan S postanki samo ODPRE dialog (ne briše takoj)…
    expect(plannerSrc).toContain("setRemoveDayPending(day)");
    // …destruktivni prehod je ločen v applyRemoveDay (klic iz potrditve):
    expect(plannerSrc).toContain("function applyRemoveDay(");
    expect(plannerSrc).toMatch(/if \(day\) applyRemoveDay\(day\)/);
    // dialog je krmiljan stanjem (prekliči = počisti):
    expect(plannerSrc).toContain("open={removeDayPending !== null}");
    expect(plannerSrc).toContain("setRemoveDayPending(null)");
    // opozorilo o številu postankov v opisu (iskrenost):
    expect(plannerSrc).toContain('t("removeDayConfirmDesc"');
    expect(plannerSrc).toContain(
      "count: removeDayPending?.locations.length ?? 0"
    );
  });

  test("prestavljanje postanka MED DNEVI: gumba prejšnji/naslednji dan + meje", () => {
    // čista operacija je priklopljena (isti import kanon kot reorder):
    expect(plannerSrc).toContain(
      "import { reorderStopInItinerary, moveStopToDay } from \"@/lib/planner-reorder\""
    );
    expect(plannerSrc).toContain("handleMoveStopToDay(");
    expect(plannerSrc).toContain("moveStopToDay(itinerary, day.day, idx, targetDayNumber)");
    // gumba (ChevronLeft/ChevronRight, ghost/sm — vidna samo z >1 dnem):
    expect(plannerSrc).toContain("ChevronLeft");
    expect(plannerSrc).toContain("ChevronRight");
    expect(plannerSrc).toMatch(/variant="ghost"/);
    expect(plannerSrc).toContain("itinerary.days.length > 1 && (");
    // POŠTENI meji: prejšnji onemogočen na dnevu 1, naslednji na zadnjem:
    expect(plannerSrc).toContain("disabled={day.day === 1}");
    expect(plannerSrc).toMatch(
      /disabled=\{\s*day\.day ===\s*\n\s*itinerary\.days\.length\s*\}/
    );
    // aria-labela z imenom postanka (bralniki):
    expect(plannerSrc).toContain('t("moveStopToPrevDayAria"');
    expect(plannerSrc).toContain('t("moveStopToNextDayAria"');
    // toast opomni preveriti zaporedje in čase (termini se ne prerazporejajo):
    expect(plannerSrc).toContain('t("stopMovedToDayToastTitle"');
    expect(plannerSrc).toContain('t("stopMovedToDayToastDesc"');
  });

  test("handler sledi kanonu persist + analytics + shareUrl-clear (F16)", () => {
    expect(plannerSrc).toContain('"stop_moved_to_day"');
    const block = plannerSrc.match(
      /function handleMoveStopToDay\([\s\S]*?\n  \}/
    )?.[0];
    expect(block).toBeDefined();
    expect(block).toContain("persistItinerary(next, formData)");
    expect(block).toContain("markResultEngaged()");
    expect(block).toContain("setShareUrl(null)");
    expect(block).toContain("trackPlannerEvent");
    expect(block).toContain("toast({");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. i18n — VSI novi ključi v OBEH jezikih (eksplicitna pariteta)
// ─────────────────────────────────────────────────────────────────────────

describe("D6-B (M7+): i18n pariteta novih ključev (SL + EN)", () => {
  const NEW_KEYS = [
    "removeDayConfirmTitle",
    "removeDayConfirmDesc",
    "removeDayConfirmCancel",
    "removeDayConfirmAction",
    "moveStopToPrevDayAria",
    "moveStopToNextDayAria",
    "stopMovedToDayToastTitle",
    "stopMovedToDayToastDesc",
  ] as const;

  test("vsak ključ obstaja v planner NS obeh jezikov", () => {
    for (const key of NEW_KEYS) {
      expect(key in slMessages.planner).toBe(true);
      expect(key in enMessages.planner).toBe(true);
    }
  });

  test("interpolacije so skladne ({day}/{count}/{name} v vrednostih obeh jezikov)", () => {
    for (const key of NEW_KEYS) {
      const sl = String(slMessages.planner[key]);
      const en = String(enMessages.planner[key]);
      const placeholders = (s: string) => (s.match(/\{[^}]+\}/g) ?? []).sort();
      expect(placeholders(sl)).toEqual(placeholders(en));
    }
  });

  test("opozorilo o postankih res šteje postanke (removeDayConfirmDesc vsebuje {count})", () => {
    expect(String(slMessages.planner.removeDayConfirmDesc)).toContain(
      "{count}"
    );
    expect(String(enMessages.planner.removeDayConfirmDesc)).toContain(
      "{count}"
    );
  });
});
