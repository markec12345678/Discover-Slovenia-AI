// ============================================================================
// CENOVNA RESNICA ČASOVNICE — čisti izračuni (Issue #4 §6, val 1)
// ============================================================================
// NAMEN: prej je trip-timeline dnevni strošek računala kot
//   `sum + (v.estimated_cost || 0)` — postanki z NEZNANO ceno (NaN sentinel
//   iz supply validacije: "Cena ni preverjena — vir ni strežniško
//   priključen") so se TIHO šteli kot €0. To je NEPOŠTENO (izgleda
//   brezplačno) in ravno to popravlja Issue #4 §6: UNKNOWN povsod, nikoli
//   pretvorjen v 0.
//
// Pravila (ISKRENOST):
//  · KONČNA cena (number, tudi 0 = pošteno brezplačen odprti vir) → sešteje.
//  · NaN / ne-šttevilo / manjkajoče → NEznana cena: NE šteje v vsoto,
//    šteje v števec `unknownCount` (UI izpiše "N z neznano ceno").
//  · 0 iz odprtih virov (OSM atrakcija) ostane €0 — dokumentirana semantika
//    (hardening-price-truth.test.ts: "odprti viri → €0 pošteno").
// ============================================================================

import type { DayPlan, LocationVisit } from "@/lib/types";

export interface DayCostSummary {
  /** Seštevek postankov s KONČNO ceno (znana ali pošteno ocenjena). */
  known: number;
  /** Št. postankov z NEZNANO ceno (NaN sentinel / manjkajoče). */
  unknownCount: number;
}

/** Dnevni strošek z ločeno neznano plastjo — ENA resnica za UI + teste. */
export function dayCostSummary(locations: LocationVisit[]): DayCostSummary {
  let known = 0;
  let unknownCount = 0;
  for (const v of locations) {
    const c = v?.estimated_cost;
    if (typeof c === "number" && Number.isFinite(c)) {
      known += c;
    } else {
      // NaN (cena ni preverjena) ali manjkajoče — NIKOLI 0 ( Issue #4 §6 ).
      unknownCount += 1;
    }
  }
  return { known, unknownCount };
}

/** Skupno št. postankov z neznano ceno čez vse dneve (glava načrta). */
export function totalUnknownCostStops(days: DayPlan[]): number {
  let total = 0;
  for (const d of days) {
    total += dayCostSummary(d?.locations ?? []).unknownCount;
  }
  return total;
}
