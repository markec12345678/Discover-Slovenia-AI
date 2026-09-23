// ============================================================================
// TASK 82 (1.74.5) — inline validacija številskih polj (dnevi/proračun/skupina)
// ============================================================================
// REPRODUCIRANA VRZEL: obrazec ima <form noValidate> (brskalnikova validacija
// NAMERNO izklopljena, ker toast + strežnik valuejo svojo), a polja niso
// imela NOBENE vidne povratne informacije: uporabnik, ki je izpraznil
// "dnevi" (Number("") === 0) ali vtipal 20 oseb/3,5 dneva/150.000 €, je ob
// oddaji dobil EN generičen toast — brez rdečega polja, brez sporočila pod
// njim, brez fokusa. Izpraznjeno polje je pokazalo "0". Delne vrednosti dni
// (3,5) in oseb (2,5) so TIHO prešle (strežnik jih sprejme; zanka dni jih
// poreže).
//
// PRISTOP (precedent TASK 78/73/80 — source-contract + čiste funkcije):
//  1. ENOTSKE čiste funkcije v src/lib/planner-field-validation.ts (ista
//     logika za inline prikaz, validate() in teste) — pogodba poravnana s
//     /api/itinerary (celo število dni/oseb; proračun > 0 in ≤ 100.000).
//  2. SOURCE-CONTRACT trditve o DEJANSKI odposlani datoteki
//     itinerary-planner.tsx: touched ob bluru, aria-invalid +
//     aria-describedby, role="alert" sporočila, fokus na prvo neveljavno,
//     analytika planner_validation_failed, prikaz praznega namesto "0".
// Obnašanje (rdeče obraz, fokus, izginotje napake) dokazuje E2E.
// ============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  isDaysValid,
  isBudgetValid,
  budgetInvalidReason,
  isGroupSizeValid,
  isNumericFieldValid,
  firstInvalidNumericField,
  NUMERIC_FIELD_ORDER,
  BUDGET_MAX,
} from "@/lib/planner-field-validation";

const PLANNER_SOURCE = readFileSync(
  "src/components/sections/itinerary-planner.tsx",
  "utf8"
);
const VALIDATION_SOURCE = readFileSync(
  "src/lib/planner-field-validation.ts",
  "utf8"
);
const ANALYTICS_SOURCE = readFileSync(
  "src/lib/planner-analytics.ts",
  "utf8"
);
const ANALYTICS_ROUTE_SOURCE = readFileSync(
  "src/app/api/analytics/event/route.ts",
  "utf8"
);
const ITINERARY_ROUTE_SOURCE = readFileSync(
  "src/app/api/itinerary/route.ts",
  "utf8"
);
const SL = JSON.parse(readFileSync("src/i18n/messages/sl.json", "utf8")) as {
  planner: Record<string, string>;
};
const EN = JSON.parse(readFileSync("src/i18n/messages/en.json", "utf8")) as {
  planner: Record<string, string>;
};

// ---------------------------------------------------------------------------
// 1. ENOTSKE ČISTE FUNKCIJE — pogodba treh polj
// ---------------------------------------------------------------------------

describe("TASK 82 — isDaysValid (celo število 1–14)", () => {
  test("veljavni: 1, 7, 14 (meje vključno)", () => {
    expect(isDaysValid(1)).toBe(true);
    expect(isDaysValid(7)).toBe(true);
    expect(isDaysValid(14)).toBe(true);
  });
  test("neveljavni obseg: 0 (izpraznjeno polje!), 15, -1", () => {
    expect(isDaysValid(0)).toBe(false);
    expect(isDaysValid(15)).toBe(false);
    expect(isDaysValid(-1)).toBe(false);
  });
  test("neveljavne vrste/način: 3.5 (delni dan), NaN, Infinity, niz, null, undefined", () => {
    expect(isDaysValid(3.5)).toBe(false); // prej TIHO sprejeto, zanka dni poreže
    expect(isDaysValid(Number(""))).toBe(false); // Number("") === 0
    expect(isDaysValid(Number("abc"))).toBe(false); // NaN
    expect(isDaysValid(Infinity)).toBe(false);
    expect(isDaysValid("3")).toBe(false);
    expect(isDaysValid(null)).toBe(false);
    expect(isDaysValid(undefined)).toBe(false);
  });
});

describe("TASK 82 — budgetInvalidReason (> 0 in ≤ 100.000, dve sporočili)", () => {
  test("veljavno: null razlog — 500, 1, 0.5 (evrocenti), 100.000 (meja)", () => {
    expect(budgetInvalidReason(500)).toBeNull();
    expect(budgetInvalidReason(1)).toBeNull();
    expect(budgetInvalidReason(0.5)).toBeNull(); // step=50 je vodilo, ne pogodba
    expect(budgetInvalidReason(100_000)).toBeNull();
  });
  test("not_positive: 0, -5, NaN, niz — sporočilo „večji od 0 €“", () => {
    expect(budgetInvalidReason(0)).toBe("not_positive");
    expect(budgetInvalidReason(-5)).toBe("not_positive");
    expect(budgetInvalidReason(Number(""))).toBe("not_positive");
    expect(budgetInvalidReason("500")).toBe("not_positive");
  });
  test("too_large: 100.001, Infinity — sporočilo „največ 100.000 €“", () => {
    expect(budgetInvalidReason(100_001)).toBe("too_large");
    expect(budgetInvalidReason(Infinity)).toBe("too_large");
  });
  test("isBudgetValid = (razlog === null)", () => {
    expect(isBudgetValid(500)).toBe(true);
    expect(isBudgetValid(0)).toBe(false);
    expect(isBudgetValid(100_001)).toBe(false);
  });
});

describe("TASK 82 — isGroupSizeValid (celo število 1–20)", () => {
  test("veljavni: 1, 2, 20", () => {
    expect(isGroupSizeValid(1)).toBe(true);
    expect(isGroupSizeValid(2)).toBe(true);
    expect(isGroupSizeValid(20)).toBe(true);
  });
  test("neveljavni: 0, 21, 2.5 (delna oseba), NaN, niz", () => {
    expect(isGroupSizeValid(0)).toBe(false);
    expect(isGroupSizeValid(21)).toBe(false);
    expect(isGroupSizeValid(2.5)).toBe(false); // prej TIHO sprejeto
    expect(isGroupSizeValid(Number("abc"))).toBe(false);
    expect(isGroupSizeValid("2")).toBe(false);
  });
});

describe("TASK 82 — firstInvalidNumericField + vrstni red", () => {
  test("vrstni red je days → budget → groupSize (enak redu sporočil)", () => {
    expect(NUMERIC_FIELD_ORDER).toEqual(["days", "budget", "groupSize"]);
  });
  test("vsa veljavna → null", () => {
    expect(
      firstInvalidNumericField({ days: 3, budget: 500, groupSize: 2 })
    ).toBeNull();
  });
  test("dnevi prvi — tudi če so vsa tri slaba (fokus na PRVO)", () => {
    expect(
      firstInvalidNumericField({ days: 0, budget: 0, groupSize: 0 })
    ).toBe("days");
  });
  test("dnevi urejeni → budget; skupina zadnja", () => {
    expect(
      firstInvalidNumericField({ days: 3, budget: -1, groupSize: 2 })
    ).toBe("budget");
    expect(
      firstInvalidNumericField({ days: 3, budget: 500, groupSize: 99 })
    ).toBe("groupSize");
  });
  test("isNumericFieldValid razpozna po imenu (ista logika, en vhod)", () => {
    expect(isNumericFieldValid("days", 3)).toBe(true);
    expect(isNumericFieldValid("budget", 0)).toBe(false);
    expect(isNumericFieldValid("groupSize", 2.5)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. POGODBA ≡ STREŽNIK — številke so preslikane, ne izmišljene
// ---------------------------------------------------------------------------

describe("TASK 82 — pogodba poravnana s /api/itinerary (drift nemogoč)", () => {
  test("BUDGET_MAX = 100.000 — ISTE številke kot strežniška validacija", () => {
    expect(BUDGET_MAX).toBe(100_000);
    expect(ITINERARY_ROUTE_SOURCE).toContain("input.budget > 100_000");
  });
  test("strežnik še vedno čuva dneve 1–14 in skupino 1–20 (naša meja = njegova)", () => {
    // HARDENING I3: days je od 1.88.0 typovno varovan (integer) + range
    // 1–14 (prej je niz "abc" prešel range primerjavo → NaN dayCap)
    expect(ITINERARY_ROUTE_SOURCE).toContain(
      "typeof input.days !== \"number\" ||"
    );
    expect(ITINERARY_ROUTE_SOURCE).toContain("!Number.isInteger(input.days)");
    expect(ITINERARY_ROUTE_SOURCE).toContain("input.days < 1");
    expect(ITINERARY_ROUTE_SOURCE).toContain("input.days > 14");
    // groupSize preverba je v strežniku VEČVRSTIČNA — obe meji ločeno
    expect(ITINERARY_ROUTE_SOURCE).toContain("input.groupSize < 1");
    expect(ITINERARY_ROUTE_SOURCE).toContain("input.groupSize > 20");
    expect(VALIDATION_SOURCE).toContain("value <= 14");
    expect(VALIDATION_SOURCE).toContain("value <= 20");
  });
});

// ---------------------------------------------------------------------------
// 3. SOURCE-CONTRACT — itinerary-planner.tsx (DEJANSKO odposlana datoteka)
// ---------------------------------------------------------------------------

describe("TASK 82 — stara vgnešena validacija je ZAMENJANA s čisto logiko", () => {
  test("① STARE vrsticne preverbe dni/proračuna/skupine so ODSOTNE", () => {
    // To je bila podvojena logika (drift med inline prikazom in oddajo):
    expect(
      PLANNER_SOURCE.includes(
        "!Number.isFinite(input.days) || input.days < 1 || input.days > 14"
      )
    ).toBe(false);
    expect(
      PLANNER_SOURCE.includes("!Number.isFinite(input.budget) || input.budget <= 0")
    ).toBe(false);
    expect(
      PLANNER_SOURCE.includes(
        "!Number.isFinite(input.groupSize) || input.groupSize < 1 || input.groupSize > 20"
      )
    ).toBe(false);
  });
  test("② uvožene čiste funkcije iz planner-field-validation", () => {
    expect(PLANNER_SOURCE).toContain(
      'from "@/lib/planner-field-validation"'
    );
    expect(PLANNER_SOURCE).toContain("isDaysValid(");
    expect(PLANNER_SOURCE).toContain("budgetInvalidReason(");
    expect(PLANNER_SOURCE).toContain("isGroupSizeValid(");
    expect(PLANNER_SOURCE).toContain("firstInvalidNumericField(");
  });
});

describe("TASK 82 — touched + inline napaka pod poljem", () => {
  test("③ stanje touched za vsa tri polja", () => {
    expect(PLANNER_SOURCE).toContain(
      "useState<Record<NumericFieldName, boolean>>"
    );
  });
  test("④ onBlur nastavi touched (napaka NE med tipkanjem, šele ob izhodu)", () => {
    const blurDays = /onBlur=\{\(\) =>\s*setTouched\(\(p\) => \(\{ \.\.\.p, days: true \}\)\)/;
    const blurBudget = /onBlur=\{\(\) =>\s*setTouched\(\(p\) => \(\{ \.\.\.p, budget: true \}\)\)/;
    const blurGroup = /onBlur=\{\(\) =>\s*setTouched\(\(p\) => \(\{ \.\.\.p, groupSize: true \}\)\)/;
    expect(blurDays.test(PLANNER_SOURCE)).toBe(true);
    expect(blurBudget.test(PLANNER_SOURCE)).toBe(true);
    expect(blurGroup.test(PLANNER_SOURCE)).toBe(true);
  });
  test("⑤ aria-invalid + aria-describedby na VSEH treh inputih", () => {
    expect(PLANNER_SOURCE).toContain(
      'aria-invalid={daysFieldError ? true : undefined}'
    );
    expect(PLANNER_SOURCE).toContain(
      'aria-describedby={\n                        daysFieldError ? "days-field-error" : undefined\n                      }'
    );
    expect(PLANNER_SOURCE).toContain(
      'aria-invalid={budgetFieldError ? true : undefined}'
    );
    expect(PLANNER_SOURCE).toContain('id="budget-field-error"');
    expect(PLANNER_SOURCE).toContain(
      'aria-invalid={groupSizeFieldError ? true : undefined}'
    );
    expect(PLANNER_SOURCE).toContain('id="groupSize-field-error"');
  });
  test("⑥ sporočila so role=\"alert\" z ikono (napoved bralniku ob pojavitvi)", () => {
    const alerts = PLANNER_SOURCE.match(/role="alert"/g) ?? [];
    // 3 nova (polja) + morebitne obstoječe — GORNJA meja 3 + obstoječe
    expect(alerts.length).toBeGreaterThanOrEqual(3);
    expect(PLANNER_SOURCE).toContain('id="days-field-error"');
    expect((PLANNER_SOURCE.match(/field-error"/g) ?? []).length).toBe(6); // 3× id + 3× describedby
  });
  test("⑦ izpraznjeno polje prikaže PRAZNO, ne „0“ (Number(\"\") === 0)", () => {
    expect(PLANNER_SOURCE).toContain('value={formData.days || ""}');
    expect(PLANNER_SOURCE).toContain('value={formData.budget || ""}');
    expect(PLANNER_SOURCE).toContain('value={formData.groupSize || ""}');
  });
});

describe("TASK 82 — oddaja: fokus + vse tri inline napake + analytika", () => {
  test("⑧ refs obstajajo in handleSubmit fokusira PRVO neveljavno polje", () => {
    expect(PLANNER_SOURCE).toContain("const daysInputRef = useRef<HTMLInputElement>(null)");
    expect(PLANNER_SOURCE).toContain("const budgetInputRef = useRef<HTMLInputElement>(null)");
    expect(PLANNER_SOURCE).toContain("const groupSizeInputRef = useRef<HTMLInputElement>(null)");
    expect(PLANNER_SOURCE).toContain("firstInvalidNumericField(formData)");
    expect(PLANNER_SOURCE).toContain("ref.current?.focus()");
  });
  test("⑨ ob zavrnitvi so vsa številska polja touched (vidne vse napake, ne samo prva)", () => {
    expect(PLANNER_SOURCE).toContain(
      "setTouched({ days: true, budget: true, groupSize: true })"
    );
  });
  test("⑩ dogodek planner_validation_failed z merjenim poljem", () => {
    expect(PLANNER_SOURCE).toContain(
      'trackPlannerEvent("planner_validation_failed"'
    );
    expect(PLANNER_SOURCE).toContain("field: vErr.field");
  });
});

// ---------------------------------------------------------------------------
// 4. ANALYTIKA — OBA allowlista (klient + strežnik), sicer strežnik 400
// ---------------------------------------------------------------------------

describe("TASK 82 — analytika dogodka je dovoljena na OBEH straneh", () => {
  test("⑪ PlannerEventName unija vsebuje planner_validation_failed", () => {
    expect(ANALYTICS_SOURCE).toContain('"planner_validation_failed"');
  });
  test("⑫ strežniški VALID_EVENTS dovoljuje dogodek (drift = tiha izguba podatkov)", () => {
    expect(ANALYTICS_ROUTE_SOURCE).toContain('"planner_validation_failed"');
  });
});

// ---------------------------------------------------------------------------
// 5. I18N — SL/EN pariteta novih/posodobljenih sporočil
// ---------------------------------------------------------------------------

describe("TASK 82 — i18n sporočila (SL + EN, ista ključa)", () => {
  test("⑬ validationBudgetMax obstaja v obeh jezikih (task71 pariteta)", () => {
    expect(SL.planner.validationBudgetMax).toBeTruthy();
    expect(EN.planner.validationBudgetMax).toBeTruthy();
    expect(SL.planner.validationBudgetMax).toContain("100.000");
    expect(EN.planner.validationBudgetMax).toContain("100,000");
  });
  test("⑭ sporočili dni/skupine izrecno napovesta CELO število (3,5 dni = zavrnjeno)", () => {
    expect(SL.planner.validationDays).toContain("celo število");
    expect(EN.planner.validationDays).toContain("whole number");
    expect(SL.planner.validationGroupSize).toContain("celo število");
    expect(EN.planner.validationGroupSize).toContain("whole number");
  });
});
