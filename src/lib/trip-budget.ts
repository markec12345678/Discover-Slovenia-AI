// ============================================================================
// PRORAČUN POTI — 5 vedric resnice (Issue #4 §14, val 3)
// ============================================================================
// NAMEN: Issue #4 §14 zahteva minimalni trip budget z planned / booked /
// paid / estimated / unknown + currency + per person + group total — OB
// POGOJU "ne računaj total cost, če cena ni dejansko znana".
//
// ARHITEKTURA (sodba TRIP-DOMAIN-MAP val 2: ocena ≠ strošek):
//  · planned   = OCENA načrta (SavedItinerary.itinerary JSON) — nikdar ni
//                denar; mešanica kanonskih cen in "od" cen (spodnja meja);
//  · booked    = UPORABNIKOVO potrjene rezervacije (JourneyBooking z
//                source USER/IMPORTED + status CONFIRMED/PAID/MODIFIED —
//                atestacija je uporabnikov dokument) + TripExpense
//                kind="booked" (uporabnikovo zabeležena zaveza);
//  · paid      = TripExpense kind="paid" (uporabnikovo zabeleženo plačilo);
//  · estimated = število "od" cen v načrtu (fromPriceCount — spodnje meje,
//                ki končnega zneska NE dokažejo);
//  · unknown   = število postankov brez dokazljive cene — NIKOLI sešteje.
//
// SKUPNI ZNESEK se NE meša čez planned + booked + paid: planned OCENA
// pokriva postanke, ki so (delno) isti predmet rezervacij — seštevanje bi
// dvojno štelo. UI izpiše vedrice POSEBEJ z izvorom vsake. Edine vsote,
// ki jih izračunamo, so vedro-po-vedro (booked skupaj, paid skupaj) —
// in perPerson deljenje SAMO teh (denar, ne ocen).
// ============================================================================

import { dayCostSummary } from "@/lib/cost-truth";
import type { DayPlan } from "@/lib/types";

/** Vedrica uporabnikovih zneskov (denar, ne ocena). */
export interface MoneyBucket {
  amount: number;
  count: number;
}

/** Vedrica načrta (ocena — izvožena iz budgetValidation, kjer obstaja). */
export interface PlanBudgetBucket {
  /** Seštevek dokazljivih kanonskih stroškov (spodnja meja). */
  knownTotal: number;
  /** Prikazna vsota načrta (vključno z ocenami "od" — izpiše se kot ~). */
  stopsTotal: number;
  /** Št. postankov z "od" ceno (končni znesek ni dokazan). */
  fromPriceCount: number;
  /** Št. postankov brez dokazljive cene (NE seštejejo — nikoli €0). */
  unknownCostStops: number;
  /** Status glede na uporabnikov proračun (null = brez cilja/star JSON). */
  status: "within" | "exceeded" | "uncertain" | null;
  /** Uporabnikov proračun (cilj, EUR) — null če ni znan. */
  budget: number | null;
}

/** Povzetek proračuna poti — ENA resnica za agregator + UI + teste. */
export interface TripBudgetSummary {
  currency: "EUR";
  planned: PlanBudgetBucket;
  booked: MoneyBucket;
  paid: MoneyBucket;
  /** Velikost skupine iz PlannerInput (formData) — null = neznana. */
  groupSize: number | null;
  /** Na osebo — SAMO za uporabniške zneske (denar), samo če groupSize ≥ 1. */
  perPerson: { booked: number; paid: number } | null;
}

/** Vrstica rezervacije, kot jo vrne agregator (podmnožica JourneyBooking). */
export interface BookingMoneyRow {
  status: string;
  source: string | null;
  confirmedPrice: number | null;
  currency: string;
}

/** Vrstica stroška (TripExpense). */
export interface ExpenseMoneyRow {
  kind: string;
  amountEur: number;
}

/**
 * Seštej uporabniško-potrjene rezervacije (source USER/IMPORTED, status
 * CONFIRMED/PAID/MODIFIED, cena + valuta EUR). PROVIDER/legacy zapisi so
 * že tako redki (0 poverilnic) — a pravilo ostaja: vedro šteje SAMO
 * uporabniško potrjene zneske, ker je to semantika "booked" v Issue §14.
 */
export function bookedFromBookings(
  rows: BookingMoneyRow[]
): MoneyBucket {
  let amount = 0;
  let count = 0;
  for (const r of rows) {
    if (
      (r.source === "USER" || r.source === "IMPORTED") &&
      (r.status === "CONFIRMED" || r.status === "PAID" || r.status === "MODIFIED") &&
      typeof r.confirmedPrice === "number" &&
      Number.isFinite(r.confirmedPrice) &&
      r.confirmedPrice > 0 &&
      r.currency === "EUR"
    ) {
      amount += r.confirmedPrice;
      count++;
    }
  }
  return { amount: Math.round(amount * 100) / 100, count };
}

/** Seštej stroške po vrsti ("booked" / "paid") — vse ostalo ignorira. */
export function expensesByKind(
  rows: ExpenseMoneyRow[]
): { booked: MoneyBucket; paid: MoneyBucket } {
  let bookedAmount = 0;
  let bookedCount = 0;
  let paidAmount = 0;
  let paidCount = 0;
  for (const r of rows) {
    if (typeof r.amountEur !== "number" || !Number.isFinite(r.amountEur) || r.amountEur <= 0) {
      continue;
    }
    if (r.kind === "booked") {
      bookedAmount += r.amountEur;
      bookedCount++;
    } else if (r.kind === "paid") {
      paidAmount += r.amountEur;
      paidCount++;
    }
  }
  return {
    booked: { amount: Math.round(bookedAmount * 100) / 100, count: bookedCount },
    paid: { amount: Math.round(paidAmount * 100) / 100, count: paidCount },
  };
}

/**
 * Povzetek proračuna poti — ČISTA funkcija (0 omrežja, 0 db).
 *
 * @param days            dnevi načrta (planned ocena)
 * @param budgetValidation obstoječa validacija iz JSON (lahko null — stare
 *                        pote; tedaj izračunamo iz dayCostSummary)
 * @param bookings        rezervacije (uporabniško potrjene — booked denar)
 * @param expenses        stroški (booked/paid denar)
 * @param groupSize       velikost skupine (null = neznana → perPerson null)
 */
export function computeTripBudgetSummary(
  days: DayPlan[],
  budgetValidation: {
    status?: string;
    budget?: number | null;
    knownTotal?: number;
    stopsTotal?: number;
    fromPriceCount?: number;
    unknownCostStops?: number;
  } | null,
  bookings: BookingMoneyRow[],
  expenses: ExpenseMoneyRow[],
  groupSize: number | null
): TripBudgetSummary {
  // planned: iz budgetValidation (kanonska, če obstaja) sicer iz dayCostSummary
  let planned: PlanBudgetBucket;
  if (
    budgetValidation &&
    typeof budgetValidation.knownTotal === "number" &&
    typeof budgetValidation.stopsTotal === "number" &&
    typeof budgetValidation.fromPriceCount === "number" &&
    typeof budgetValidation.unknownCostStops === "number"
  ) {
    planned = {
      knownTotal: budgetValidation.knownTotal,
      stopsTotal: budgetValidation.stopsTotal,
      fromPriceCount: budgetValidation.fromPriceCount,
      unknownCostStops: budgetValidation.unknownCostStops,
      status:
        budgetValidation.status === "within" ||
        budgetValidation.status === "exceeded" ||
        budgetValidation.status === "uncertain"
          ? budgetValidation.status
          : null,
      budget:
        typeof budgetValidation.budget === "number" &&
        Number.isFinite(budgetValidation.budget)
          ? budgetValidation.budget
          : null,
    };
  } else {
    // Fallback: čista vsota čez dneve (dayCostSummary — unknown NIKOLI €0)
    let known = 0;
    let unknown = 0;
    for (const d of days) {
      const s = dayCostSummary(d?.locations ?? []);
      known += s.known;
      unknown += s.unknownCount;
    }
    planned = {
      knownTotal: known,
      stopsTotal: known,
      fromPriceCount: 0,
      unknownCostStops: unknown,
      status: null,
      budget: null,
    };
  }

  const bookingBooked = bookedFromBookings(bookings);
  const expenseBuckets = expensesByKind(expenses);
  const booked: MoneyBucket = {
    amount:
      Math.round((bookingBooked.amount + expenseBuckets.booked.amount) * 100) /
      100,
    count: bookingBooked.count + expenseBuckets.booked.count,
  };
  const paid: MoneyBucket = expenseBuckets.paid;

  const gs =
    typeof groupSize === "number" &&
    Number.isFinite(groupSize) &&
    groupSize >= 1 &&
    Number.isInteger(groupSize)
      ? groupSize
      : null;

  return {
    currency: "EUR",
    planned,
    booked,
    paid,
    groupSize: gs,
    perPerson:
      gs != null && (booked.count > 0 || paid.count > 0)
        ? {
            booked: Math.round((booked.amount / gs) * 100) / 100,
            paid: Math.round((paid.amount / gs) * 100) / 100,
          }
        : null,
  };
}

/** Preberi groupSize iz surovega formData JSON stringa (null = neznano). */
export function groupSizeFromFormData(
  formDataJson: string | null
): number | null {
  if (!formDataJson) return null;
  try {
    const fd = JSON.parse(formDataJson) as { groupSize?: unknown };
    if (
      typeof fd?.groupSize === "number" &&
      Number.isFinite(fd.groupSize) &&
      fd.groupSize >= 1 &&
      fd.groupSize <= 20
    ) {
      return Math.round(fd.groupSize);
    }
  } catch {
    // star/hyperoken formData — neznano
  }
  return null;
}
