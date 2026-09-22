// ============================================================================
// PLANNER — INLINE VALIDACIJA ŠTEVILSKIH POLJ (TASK 82, 1.74.5)
// ============================================================================
// ENA sama resnica o pogojih treh številskih polj obrazca (dnevi, proračun,
// velikost skupine). Isto čisto logiko poganjajo tri površine:
//
//   1. inline napaka pod poljem (prikaz po "touched" — blur ali neuspešna
//      oddaja — nikoli med samim tipkanjem prvih števk),
//   2. validate() ob oddaji (toast + fokus na prvo neveljavno polje),
//   3. enotski testi nad čisto funkcijo (brez DOM-a).
//
// POGODBA je poravnana s strežnikom (/api/itinerary, zod ročno validacijo):
//   days:      celo število 1–14   (strežnik: obseg 1–14; tu še celost,
//                                  ker delni dnevi tiho porežeta zanko dni)
//   budget:    > 0 in ≤ 100.000 €  (strežnik: število, > 0 po truthy preverbi,
//                                  ≤ 100.000)
//   groupSize: celo število 1–20   (strežnik: obseg 1–20; delne osebe so
//                                  nesmisel)
//
// PREJ (1.74.4): polja so imela samo HTML min/max atribute + noValidate na
// <form> (brskalnikova validacija IZKLOPLJENA) → uporabnik je ob praznem/
// smešnem vnosu dobil EN generičen toast, brez rdeče oznake polja, brez
// fokusa, brez sporočila pod poljem. Čiščenje polja je pokazalo "0".
// ===========================================================================

/** Imena treh številskih polj obrazca (iste vrednosti kot id-ji inputov). */
export type NumericFieldName = "days" | "budget" | "groupSize";

/** Vrstni red preverjanja — enak vrstnemu redu sporočil v validate()
 * (days → budget → groupSize). Fokus ob oddaji gre na PRVO neveljavno. */
export const NUMERIC_FIELD_ORDER: readonly NumericFieldName[] = [
  "days",
  "budget",
  "groupSize",
];

/** Zgornja meja proračuna — preslikana iz strežniške validacije (ne izmišljena
 * klientska meja; enako številko vrača /api/itinerary pri 400). */
export const BUDGET_MAX = 100_000;

/**
 * Dnevi: končno število, celo, 1–14.
 * NaN/null/undefined/niz → neveljavno (prazno polje = Number("") === 0).
 */
export function isDaysValid(value: unknown): boolean {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 14
  );
}

/**
 * Proračun: končno število, strogo > 0, ≤ BUDGET_MAX.
 * Ni zahteve po celi številke (evrocenti so legitimni; step=50 je samo
 * vodilo vrtilnika). Zrcali strežniško pogodbo.
 */
export function isBudgetValid(value: unknown): boolean {
  return budgetInvalidReason(value) === null;
}

/**
 * Razlog neveljavnosti proračuna — dve ločeni sporočili (i18n):
 *   "not_positive" → validationBudget ("večji od 0 €")
 *   "too_large"    → validationBudgetMax ("največ 100.000 €")
 * null → veljavno. Končno stanje (NaN/prazno) spada k "not_positive",
 * ker je to sporočilo, ki uporabnika usmeri nazaj k vnosu.
 */
export type BudgetInvalidReason = "not_positive" | "too_large" | null;

export function budgetInvalidReason(value: unknown): BudgetInvalidReason {
  if (typeof value !== "number") {
    return "not_positive";
  }
  // Najprej zgornja meja: Infinity je "preveliko", ne "nepozitivno".
  if (value > BUDGET_MAX) return "too_large";
  // NaN (in preostale končne napake) ter ≤ 0 vodijo k istemu sporočilu,
  // ki uporabnika usmeri nazaj k vnosu.
  if (!Number.isFinite(value) || value <= 0) return "not_positive";
  return null;
}

/** Velikost skupine: končno število, celo, 1–20. */
export function isGroupSizeValid(value: unknown): boolean {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 20
  );
}

/** Validacijska funkcija enega polja po imenu (za komponentne mape). */
export function isNumericFieldValid(
  field: NumericFieldName,
  value: unknown
): boolean {
  switch (field) {
    case "days":
      return isDaysValid(value);
    case "budget":
      return isBudgetValid(value);
    case "groupSize":
      return isGroupSizeValid(value);
  }
}

/** Vrednosti treh številskih polj (neznane vrste — preverba je poštena). */
export interface NumericFieldValues {
  days: unknown;
  budget: unknown;
  groupSize: unknown;
}

/**
 * Prvo neveljavno številsko polje po vrstnem redu NUMERIC_FIELD_ORDER,
 * oz. null, če so vsa tri veljavna. Uporaba: fokus ob neuspešni oddaji
 * + analytika (field prop dogodka planner_validation_failed).
 */
export function firstInvalidNumericField(
  values: NumericFieldValues
): NumericFieldName | null {
  for (const field of NUMERIC_FIELD_ORDER) {
    if (!isNumericFieldValid(field, values[field])) return field;
  }
  return null;
}
