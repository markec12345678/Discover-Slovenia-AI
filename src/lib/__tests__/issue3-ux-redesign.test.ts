import { describe, expect, test } from "bun:test";
import slMessages from "@/i18n/messages/sl.json";
import enMessages from "@/i18n/messages/en.json";
import { QUICK_ACTIONS } from "@/lib/refine-actions";
import { AI_CONTROL_FREE_ACTIONS } from "@/components/planner-ai-controls";

/**
 * Issue #3 (UX REDESIGN — ONE SIMPLE EXPERIENCE / ZERO FEATURE LOSS):
 * regresijska varovalka AI KONTROLNE PLASTI.
 *
 * §3 zahteva, da AI KONTROLIRA obstoječi načrt z: manj vožnje, ceneje,
 * več narave, več hrane, bolj aktivno, bolj mirno, dodaj/odstrani
 * destinacijo, spremeni tempo + prosti ukaz.
 *
 * Varovala:
 * 1. Vsi zahtevani nadzori obstajajo (deterministični QUICK_ACTIONS ∪
 *    prosti AI_CONTROL_FREE_ACTIONS ∪ prosti vnos) — ZERO FEATURE LOSS na
 *    strani nadzorov.
 * 2. Prosti čipi naslavljajo OBSTOJEČO prosto-besedilno pot (struction
 *    neprazna v obeh jezikih, brez novih transformacijskih id-jev, ki bi
 *    zahtevali strežniško logiko).
 * 3. Deterministične akcije ostajajo NESPREMENJENE (isti 6 id-jev kot
 *    pred redesignom — rail in kontrolna vrstica delita EN vir).
 * 4. Novi i18n ključi hero/footer obstajajo v OBEH jezikih (pariteto
 *    nadzorno pokriva task71; tu preverjamo ZAHTEVANE ključe redesigna).
 */

const REQUIRED_CONTROL_IDS = new Set([
  "less_driving", // manj vožnje (deterministično)
  "more_nature", // več narave (deterministično)
  "more_food", // več hrane (deterministično)
  "slower_pace", // spremeni tempo (deterministično)
  "cheaper", // ceneje (prosta pot)
  "more_active", // bolj aktivno (prosta pot)
  "calmer", // bolj mirno (prosta pot)
]);

describe("Issue #3 §3: AI kontrolna plast — pokritost nadzorov", () => {
  test("QUICK_ACTIONS ostajajo NESPREMENJENE (isti 6 determinističnih id-jev)", () => {
    expect(QUICK_ACTIONS.map((a) => a.id)).toEqual([
      "less_driving",
      "rain_suitable",
      "slower_pace",
      "more_nature",
      "more_food",
      "family_friendly",
    ]);
  });

  test("prosti čipi = natanko ceneje / bolj aktivno / bolj mirno (brez novih strežniških akcij)", () => {
    expect(AI_CONTROL_FREE_ACTIONS.map((a) => a.id)).toEqual([
      "cheaper",
      "more_active",
      "calmer",
    ]);
  });

  test("vsak zahtevani nadzor Issue #3 §3 je pokrit (ZERO FEATURE LOSS nadzorov)", () => {
    const covered = new Set([
      ...QUICK_ACTIONS.map((a) => a.id),
      ...AI_CONTROL_FREE_ACTIONS.map((a) => a.id),
    ]);
    // "dodaj/odstrani destinacijo" + poljuben prosti ukaz pokriva PROSTI
    // VNOS kontrolne vrstice (instrukcija po obstoječi free-text poti) —
    // demonstrirano z nepraznim placeholderjem, ki ga testira spodnji i18n
    // ključ? (placeholder je v L konstanti; tu preverjamo samo id-je)
    for (const id of REQUIRED_CONTROL_IDS) {
      expect(covered.has(id), `nadzor "${id}" manjka`).toBe(true);
    }
  });

  test("prosti čipi imajo neprazne oznake IN ukaze v SL ter EN (ista pot kot free-text refine)", () => {
    for (const fa of AI_CONTROL_FREE_ACTIONS) {
      for (const lng of ["sl", "en"] as const) {
        expect(fa.label[lng].trim().length).toBeGreaterThan(0);
        expect(fa.instruction[lng].trim().length).toBeGreaterThan(20);
      }
    }
  });

  test("ukazi prostih čipov NE vsebujejo dan-specifičnih ukazov (celoten načrt — day: null pot)", () => {
    // Prosti čipi gredo po WHOLE-TRIP prosto-besedilni poti (brez action/day
    // polja v obremenitvi) — ukaz ne sme vezati "Dan X" (to delajo samo
    // deterministične akcije).
    for (const fa of AI_CONTROL_FREE_ACTIONS) {
      expect(fa.instruction.sl).not.toMatch(/Dan \d/);
      expect(fa.instruction.en).not.toMatch(/Day \d/);
    }
  });
});

describe("Issue #3: i18n ključi redesigna (SL + EN)", () => {
  const requiredKeys = [
    "hero.startAnywhere",
    "heroChips.natureFood",
    "heroChips.natureFoodQuery",
    "heroChips.seaMountains",
    "heroChips.seaMountainsQuery",
    "footer.planGoMode",
    "footer.planJourney",
  ] as const;

  function flat(obj: unknown, prefix = ""): Record<string, string> {
    const out: Record<string, string> = {};
    if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
      return out;
    }
    for (const [key, value] of Object.entries(
      obj as Record<string, unknown>
    )) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        Object.assign(out, flat(value, path));
      } else {
        out[path] = String(value);
      }
    }
    return out;
  }

  test("vsi novi ključi obstajajo in so neprazni v obeh jezikih", () => {
    const SL = flat(slMessages);
    const EN = flat(enMessages);
    for (const key of requiredKeys) {
      expect(SL[key], `SL "${key}" manjka`).toBeTruthy();
      expect(EN[key], `EN "${key}" manjka`).toBeTruthy();
      expect(SL[key].trim().length).toBeGreaterThan(0);
      expect(EN[key].trim().length).toBeGreaterThan(0);
    }
  });
});
