// ============================================================================
// LASTNA TRŽNICA — STRIPE CHECKOUT AKTIVACIJSKA POT (Issue #20 §4, FAZA 2)
// ============================================================================
// PURE funkcije (brez db/env/Stripe klicev) za B2C produkcijski plačilni tok:
//
//   izdelek/izkušnja → POST /api/checkout | /api/bookings
//     → pending vrstica (atomarna rezervacija zaloge/kapacitete)
//     → Stripe Checkout Session (payment mode, metadata marketplace_*)
//     → url preusmeritev → Stripe plačilo
//     → webhook checkout.session.completed (EDINI writer "paid"/"confirmed")
//     → checkout.session.expired | async_payment_failed → sprostitev
//
// Pravila (iskrenost, fail-closed — enaka kot subscription/sponsorship/
// commission veje v /api/stripe/webhook):
//  - "paid" NIKOLI ne zapiše klic, ki ni overjen webhook (P3b-6).
//  - Znesek mora biti vsakrat preverjen proti strežniški vrednosti.
//  - Rezervacija zaloge/kapacitete ob ustvarjanju seje je OMEJENA na
//    CHECKOUT_RESERVATION_MINUTES; po poteku jo webhook sprosti.
// ============================================================================

import type Stripe from "stripe";

/** Metadata diskriminator lastno-tržničnih Stripe sej (webhook routing). */
export const MARKETPLACE_ORDER_TYPE = "marketplace_order";
export const MARKETPLACE_BOOKING_TYPE = "marketplace_booking";
export type MarketplaceSessionType =
  | typeof MARKETPLACE_ORDER_TYPE
  | typeof MARKETPLACE_BOOKING_TYPE;

/**
 * Okno rezervacije zaloge/kapacitete za čakanje na plačilo (Stripe Checkout
 * Session `expires_at`). 60 minut: dovolj za mirno plačilo, prekratko za
 * večne zadržbe zaloge. Po poteku (ali propadu asinhronega plačila) webhook
 * `checkout.session.expired` / `async_payment_failed` sprosti rezervacijo.
 */
export const CHECKOUT_RESERVATION_MINUTES = 60;

/** `expires_at` (epoch sekunde) za Stripe Checkout Session. */
export function checkoutExpiresAt(now: Date = new Date()): number {
  return (
    Math.floor(now.getTime() / 1000) + CHECKOUT_RESERVATION_MINUTES * 60
  );
}

/**
 * Razreši vrsto lastno-tržnične seje iz Stripe metadata. Vsa ostala
 * metadata (subscription/sponsorship/commission_invoice) → null — te veje
 * webhook obdela po svojih (sestarejših) pravilih.
 */
export function resolveMarketplaceType(
  metadata: Record<string, string> | null | undefined
): MarketplaceSessionType | null {
  if (!metadata) return null;
  if (metadata.type === MARKETPLACE_ORDER_TYPE) return MARKETPLACE_ORDER_TYPE;
  if (metadata.type === MARKETPLACE_BOOKING_TYPE)
    return MARKETPLACE_BOOKING_TYPE;
  return null;
}

export type OrderCheckoutItem = {
  productId: string;
  name: string;
  quantity: number;
  /** Enota v CENTIH (strežniška cena iz DB — klientu se NE zaupa). */
  unitAmountCents: number;
};

/**
 * Line items za Stripe Checkout Session naročila izdelkov: po ena postavka
 * po (aggregiranem) izdelku + poštnina kot lastna postavka, če je > 0.
 * Defenzivno: negativni zneski → 0, količine → celo število ≥ 1 (vrata so
 * sicer že na ruti — to je druga, neodvisna varovalba).
 */
export function buildOrderCheckoutLineItems(
  items: OrderCheckoutItem[],
  shippingCents: number
): Stripe.Checkout.SessionCreateParams.LineItem[] {
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] =
    items.map((item) => ({
      price_data: {
        currency: "eur",
        product_data: { name: item.name },
        unit_amount: Math.max(0, Math.round(item.unitAmountCents)),
      },
      quantity: Math.max(1, Math.floor(item.quantity)),
    }));
  if (shippingCents > 0) {
    lineItems.push({
      price_data: {
        currency: "eur",
        product_data: { name: "Poštnina" },
        unit_amount: Math.round(shippingCents),
      },
      quantity: 1,
    });
  }
  return lineItems;
}

/**
 * P3b-6 vzorec (enako subscription/sponsorship/commission_invoice vejam):
 * plačilo je sprejeto SAMO, če je bremenitev PRAVZAPOR opravljena
 * (`payment_status === "paid"` — async metodi, npr. SEPA, pošljejo
 * `completed` še PRED bremenitvijo) in vsaj v pričakovanem znesku.
 * Fail-closed: katerikoli mank → { ok: false, reason } (klicalnik ONLY logga
 * in NE spremeni stanja).
 */
export type MarketplacePaymentCheck = { ok: true } | { ok: false; reason: string };

export function validateMarketplacePayment(args: {
  paymentStatus?: string | null;
  amountTotalCents?: number | null;
  expectedTotalCents: number;
}): MarketplacePaymentCheck {
  const { paymentStatus, amountTotalCents, expectedTotalCents } = args;
  if (paymentStatus !== "paid") {
    return {
      ok: false,
      reason: `payment_status=${paymentStatus ?? "neznan"} — sredstva še niso bremenjena`,
    };
  }
  const paid = typeof amountTotalCents === "number" ? amountTotalCents : 0;
  const expected = Math.round(expectedTotalCents);
  if (paid < expected) {
    return {
      ok: false,
      reason: `plačano ${paid} centov < pričakovano ${expected} centov`,
    };
  }
  return { ok: true };
}

/**
 * Razčleni `Order.items` JSON (kanonska agregirana oblika iz /api/checkout)
 * v parove productId/quantity za sprostitev zaloge ob poteku/preklicu seje.
 * Katerakoli nepravilnost → null (klicalnik sprostitev varno preskoči in
 * izpiše opozorilo za ročno uskladitev — nikoli ne ugiba).
 */
export function orderItemsForStockRestore(
  itemsJson: string
): Array<{ productId: string; quantity: number }> | null {
  try {
    const parsed = JSON.parse(itemsJson) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const out: Array<{ productId: string; quantity: number }> = [];
    for (const p of parsed) {
      if (!p || typeof p !== "object") return null;
      const productId = (p as { productId?: unknown }).productId;
      const quantity = (p as { quantity?: unknown }).quantity;
      if (
        typeof productId !== "string" ||
        !productId ||
        typeof quantity !== "number" ||
        !Number.isInteger(quantity) ||
        quantity <= 0
      ) {
        return null;
      }
      out.push({ productId, quantity });
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Stanji, v katerih naročilo/rezervacija ŠE aktivno obstojata za kupca
 * (dedup okno v produkciji in pogojni prehodi v webhook-u). Preklicana
 * (potekla/plačilno propadla) vrstica NOVEGA poskusa ne blokira — rezervacija
 * je bila sproščena.
 */
export const ORDER_ACTIVE_STATUSES = ["pending", "paid"] as const;
export const BOOKING_ACTIVE_STATUSES = ["pending", "confirmed"] as const;
