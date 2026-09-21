// ============================================================================
// TASK 58 — POTOVANJA: KANONSKA SKUPNA CENA POTOVANJA (§16)
// ============================================================================
// Ločba (NIKOLI mešano):
//  - confirmedTotal: SAMO iz plačanih/potrjenih rezervacij (JourneyBooking
//    CONFIRMED/PAID — danes 0, ker 0 ponudnikov podpira API_BOOKING);
//  - knownTotal: kanonske NE-fromPrice cene (natančne iz vira);
//  - estimatedTotal: vsota fromPrice („od" — spodnja meja, NE obljuba);
//  - unknownCount: produkti brez cene — IZRECNO šteti, NIKOLI prišteti
//    kot 0 (unknown ≠ brezplačno).
//
// UI mora vedno povedati, kaj številka PREDSTAVLJA (glej journey-planner).
// ============================================================================

import type { JourneyProduct, JourneyTotals } from "./types";

/**
 * Izračun skupne cene iz KANONSKIH produktov potovanja.
 * Čista funkcija; fromPrice cene grejo SAMO v estimatedTotal (spodnja meja),
// odstoječa cena v unknownCount.
 *
 * TASK 72: podpis je STRUKTURNO razširjen na ReadonlyArray<Pick<JourneyProduct,
 * "price">> — isti kanon §16 zdaj sešteva tudi postavke POTRDITVENEGA
 * DOKUMENTA ( TripEntry iz trip-view nosi price?: PriceInfo — enaka oblika).
 * Nazaj kompatibilno: vsi obstoječi klici ( JourneyProduct[]) še vedno
 * tipkajo; NI nove logike — EN vir resnice za „od/znano/unknown“ ločbo.
 */
export function computeJourneyTotals(
  products: ReadonlyArray<Pick<JourneyProduct, "price">>
): JourneyTotals {
  let knownTotal = 0;
  let estimatedTotal = 0;
  let unknownCount = 0;
  let fromPriceCount = 0;

  for (const p of products) {
    const price = p.price;
    if (!price || typeof price.amount !== "number" || !Number.isFinite(price.amount)) {
      unknownCount++; // unknown ≠ 0 — izrecno štet, nikoli prištet
      continue;
    }
    if (price.fromPrice) {
      estimatedTotal += price.amount;
      fromPriceCount++;
    } else {
      knownTotal += price.amount;
    }
  }

  return {
    // Danes 0: 0 ponudnikov vrača potrjene rezervacije (API_BOOKING arhitektura
    // pripravljena; affiliate tok plačila/potrditve živi pri ponudniku).
    confirmedTotal: 0,
    knownTotal: Math.round(knownTotal * 100) / 100,
    estimatedTotal: Math.round(estimatedTotal * 100) / 100,
    unknownCount,
    fromPriceCount,
    currency: "EUR",
  };
}

/**
 * Iskerno dvojezično pojasnilo, kaj skupna cena PREDSTAVLJA (§16 —
// „UI must explain what the total actually represents").
 */
export function describeTotals(
  t: JourneyTotals,
  lang: "sl" | "en"
): string {
  const parts: string[] = [];
  if (t.estimatedTotal > 0) {
    parts.push(
      lang === "en"
        ? `from-price lower bound €${t.estimatedTotal} (${t.fromPriceCount} published „from" prices — final price is confirmed with the provider)`
        : `spodnja meja „od" €${t.estimatedTotal} (${t.fromPriceCount} objavljenih „od" cen — končna cena se potrdi pri ponudniku)`
    );
  }
  if (t.knownTotal > 0) {
    parts.push(
      lang === "en"
        ? `known canonical prices €${t.knownTotal}`
        : `znane kanonske cene €${t.knownTotal}`
    );
  }
  if (t.confirmedTotal > 0) {
    parts.push(
      lang === "en"
        ? `confirmed bookings €${t.confirmedTotal}`
        : `potrjene rezervacije €${t.confirmedTotal}`
    );
  }
  if (t.unknownCount > 0) {
    parts.push(
      lang === "en"
        ? `${t.unknownCount} products with unknown price (not counted as free)`
        : `${t.unknownCount} produktov z neznano ceno (ne štejejo kot brezplačno)`
    );
  }
  return parts.join(" · ");
}
