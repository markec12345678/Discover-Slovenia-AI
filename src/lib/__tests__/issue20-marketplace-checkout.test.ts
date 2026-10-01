import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  MARKETPLACE_BOOKING_TYPE,
  MARKETPLACE_ORDER_TYPE,
  BOOKING_ACTIVE_STATUSES,
  CHECKOUT_RESERVATION_MINUTES,
  ORDER_ACTIVE_STATUSES,
  buildOrderCheckoutLineItems,
  checkoutExpiresAt,
  orderItemsForStockRestore,
  resolveMarketplaceType,
  validateMarketplacePayment,
} from "@/lib/marketplace-checkout";

// ============================================================================
// ISSUE #20 §4 FAZA 2 (1.158.0) — LASTNI CHECKOUT: B2C AKTIVACIJSKA POT
// ============================================================================
//
// Zahteva Issue #20 §4 besedno:
//   "product/experience → checkout session → payment result → webhook →
//    idempotent state transition → order/booking state → user-facing
//    confirmation. Obvezno: Stripe signature verification, idempotency,
//    webhook dedup, fail-closed stanje, jasni pending/paid/failed/cancelled
//    statusi in ločitev own checkout od affiliate handoffa."
//
// FAZA 1 je pustila B2C vejo kot 501 TODO (celo s prisotnimi Stripe
// ključi). FAZA 2 dopolni verigo:
//
//   §A PURE PLAST (vedenjsko testirana spodaj):
//      buildOrderCheckoutLineItems / checkoutExpiresAt /
//      resolveMarketplaceType / validateMarketplacePayment /
//      orderItemsForStockRestore — brez db/env/Stripe klicev.
//   §B RUTA /api/checkout (source-contract): 503 brez ključa (NE 501),
//      pending Order + paymentMethod "stripe" v atomarni transakciji,
//      dedup samo po AKTIVNIH vrsticah, metadata type=marketplace_order,
//      expires_at okno, uspešna/preklicna URL na /trznica, kompenzacija
//      (releasePendingOrder) ob napaki seje.
//   §C RUTA /api/bookings (source-contract): 503 brez ključa, pending
//      Booking BREZ confirmedAt + paymentMethod "stripe" (kapaciteta
//      zasedena — koledar šteje status ≠ "cancelled"), metadata
//      type=marketplace_booking, kompenzacija releasePendingBooking.
//   §D WEBHOOK (source-contract): veji marketplace_order/marketplace_booking
//      ZA dedup markerjem (ProcessedStripeEvent P2002) in podpisom
//      (constructEvent) → klientski payload NE MORE ponarediti "paid";
//      pogojni prehodi (updateMany WHERE status:"pending") = idempotenca;
//      preverba zneska + payment_status (P3b-6); expired +
//      async_payment_failed sprostitve.
//   §E FRONTEND (source-contract): checkout-modal in experience-modal se
//      ob odgovoru { url } preusmerita na Stripe (demo odgovor URL-ja nikoli
//      nima); PaymentReturnBanner je pripet na /trznica in /dozivetja
//      (uspešna/preklicna povratna URL-ja).
//   §F REGRESIJSKA PRAVILA: demo v produkciji ŠE VEDNO zahteva izrecni
//      DSA_DEMO_PAYMENTS=1 (stripe-server nedotaknjen — 503 vrata na obeh
//      rutah so nad demo preverko).
// ============================================================================

function source(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("ISSUE #20 §4 FAZA 2: lastni checkout — pure plast (vedenjski testi)", () => {
  // --- §A1: line items izdelkov + poštnina ------------------------------

  test("① buildOrderCheckoutLineItems: izdelki → po ena postavka s strežniško ceno v centih in količino", () => {
    const items = buildOrderCheckoutLineItems(
      [
        { productId: "p1", name: "Med gorska roža 500 g", quantity: 2, unitAmountCents: 1290 },
        { productId: "p2", name: "Pirin kis 250 ml", quantity: 1, unitAmountCents: 855 },
      ],
      0
    );
    expect(items).toHaveLength(2);
    expect(items[0]?.price_data?.unit_amount).toBe(1290);
    expect(items[0]?.quantity).toBe(2);
    expect(items[0]?.price_data?.currency).toBe("eur");
    expect(items[0]?.price_data?.product_data?.name).toBe("Med gorska roža 500 g");
    expect(items[1]?.price_data?.unit_amount).toBe(855);
    // brez poštnine NI dodatne postavke
    expect(items.some((i) => i.price_data?.product_data?.name === "Poštnina")).toBe(false);
  });

  test("② buildOrderCheckoutLineItems: poštnina > 0 → lastna postavka »Poštnina« (490 centov)", () => {
    const items = buildOrderCheckoutLineItems(
      [{ productId: "p1", name: "Izdelek", quantity: 1, unitAmountCents: 100 }],
      490
    );
    expect(items).toHaveLength(2);
    const shipping = items[1];
    expect(shipping?.price_data?.product_data?.name).toBe("Poštnina");
    expect(shipping?.price_data?.unit_amount).toBe(490);
    expect(shipping?.quantity).toBe(1);
  });

  test("③ buildOrderCheckoutLineItems: defenzivna vrata — negativna cena → 0, necelo količina → ≥ 1 (druga, neodvisna varovalba)", () => {
    const items = buildOrderCheckoutLineItems(
      [{ productId: "p1", name: "Čudno", quantity: 0.4, unitAmountCents: -5 }],
      0
    );
    expect(items[0]?.price_data?.unit_amount).toBe(0);
    expect(items[0]?.quantity).toBe(1);
  });

  // --- §A2: okno rezervacije --------------------------------------------

  test("④ checkoutExpiresAt: epoch sekunde + natanko CHECKOUT_RESERVATION_MINUTES (60) minut", () => {
    const now = new Date("2026-10-01T12:00:00.000Z");
    const exp = checkoutExpiresAt(now);
    expect(exp).toBe(Math.floor(now.getTime() / 1000) + 60 * 60);
    expect(CHECKOUT_RESERVATION_MINUTES).toBe(60);
  });

  // --- §A3: diskriminator metadata.type ----------------------------------

  test("⑤ resolveMarketplaceType: marketplace_order / marketplace_booking / null (subscription metadata)", () => {
    expect(resolveMarketplaceType({ type: "marketplace_order", orderNumber: "IF-1" })).toBe(MARKETPLACE_ORDER_TYPE);
    expect(resolveMarketplaceType({ type: "marketplace_booking", bookingNumber: "IF-EXP-1" })).toBe(MARKETPLACE_BOOKING_TYPE);
    expect(resolveMarketplaceType(null)).toBeNull();
    expect(resolveMarketplaceType(undefined)).toBeNull();
    expect(resolveMarketplaceType({})).toBeNull();
    // subscription/sponsorship/commission metadata → null (njune veje so nespremenjene)
    expect(resolveMarketplaceType({ ownerId: "o1", plan: "premium" })).toBeNull();
    expect(resolveMarketplaceType({ type: "commission_invoice", invoiceId: "i1" })).toBeNull();
    expect(resolveMarketplaceType({ type: "sponsorship", sponsorshipId: "s1" })).toBeNull();
  });

  // --- §A4: preverba plačila (P3b-6, skupna order+booking) ---------------

  test("⑥ validateMarketplacePayment: payment_status \"paid\" + znesek ≥ pričakovan → OK (enak in večji)", () => {
    expect(validateMarketplacePayment({ paymentStatus: "paid", amountTotalCents: 4990, expectedTotalCents: 4990 }).ok).toBe(true);
    expect(validateMarketplacePayment({ paymentStatus: "paid", amountTotalCents: 5500, expectedTotalCents: 4990 }).ok).toBe(true);
  });

  test("⑦ validateMarketplacePayment: async plačilo (payment_status unpaid/unpaid-string) → ZAVRNJENO (fail-closed)", () => {
    const r = validateMarketplacePayment({ paymentStatus: "unpaid", amountTotalCents: 4990, expectedTotalCents: 4990 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("payment_status=unpaid");
    // SEPA: completed pred bremenitvijo
    const r2 = validateMarketplacePayment({ paymentStatus: "processing", amountTotalCents: 4990, expectedTotalCents: 4990 });
    expect(r2.ok).toBe(false);
    // manjkajoč status
    const r3 = validateMarketplacePayment({ amountTotalCents: 4990, expectedTotalCents: 4990 });
    expect(r3.ok).toBe(false);
  });

  test("⑧ validateMarketplacePayment: premajhen znesek → ZAVRNJENO z razlogom v centih", () => {
    const r = validateMarketplacePayment({ paymentStatus: "paid", amountTotalCents: 4900, expectedTotalCents: 4990 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("4900");
      expect(r.reason).toContain("4990");
    }
    // znesek null/undefined → 0 → zavrnjeno
    const r2 = validateMarketplacePayment({ paymentStatus: "paid", expectedTotalCents: 100 });
    expect(r2.ok).toBe(false);
  });

  // --- §A5: razčlenitev items za sprostitev zaloge -----------------------

  test("⑨ orderItemsForStockRestore: kanonska oblika → parovi productId/quantity", () => {
    const json = JSON.stringify([
      { productId: "a", name: "A", quantity: 2, price: 10 },
      { productId: "b", name: "B", quantity: 1, price: 5 },
    ]);
    expect(orderItemsForStockRestore(json)).toEqual([
      { productId: "a", quantity: 2 },
      { productId: "b", quantity: 1 },
    ]);
  });

  test("⑩ orderItemsForStockRestore: pokvarjen JSON / ne-polje / prazno / neveljaven element / ne-celo količina → null (nikoli ugibanje)", () => {
    expect(orderItemsForStockRestore("{pokvarjen")).toBeNull();
    expect(orderItemsForStockRestore('{"productId":"a"}')).toBeNull();
    expect(orderItemsForStockRestore("[]")).toBeNull();
    expect(orderItemsForStockRestore('[{"name":"samo ime"}]')).toBeNull();
    expect(orderItemsForStockRestore('[{"productId":"a","quantity":1.5}]')).toBeNull();
    expect(orderItemsForStockRestore('[{"productId":"a","quantity":0}]')).toBeNull();
    expect(orderItemsForStockRestore('[{"productId":"","quantity":1}]')).toBeNull();
  });

  // --- §A6: aktivna stanja za dedup --------------------------------------

  test("⑪ ORDER_ACTIVE_STATUSES / BOOKING_ACTIVE_STATUSES: pending + plačano/potrjeno, BREZ cancelled", () => {
    expect([...ORDER_ACTIVE_STATUSES].sort()).toEqual(["paid", "pending"]);
    expect([...BOOKING_ACTIVE_STATUSES].sort()).toEqual(["confirmed", "pending"]);
  });
});

describe("ISSUE #20 §4 FAZA 2: /api/checkout — produkcijska veja (source-contract)", () => {
  const r = source("src/app/api/checkout/route.ts");

  test("① fail-closed 503 brez STRIPE_SECRET_KEY (NE več 501 TODO)", () => {
    expect(r).toContain('if (!isDemo && (!isStripeConfigured() || !stripeKey))');
    expect(r).toContain("Plačila niso konfigurirana (STRIPE_SECRET_KEY manjka)");
    expect(r).toContain("{ status: 503 }");
    // 501 TODO varovalka je ODSTRANJENA (bila je napačna tudi ob prisotnih ključih)
    expect(r).not.toContain("Kartično plačilo tržnice še ni konfigurirano");
    expect(r).not.toContain("PRODUCTION MODE ===\n    // (onemogočeno");
  });

  test("② pending Order + paymentMethod \"stripe\" v atomarni transakciji (zaloga rezervirana, NIKOLI \"paid\" s strani klica)", () => {
    expect(r).toContain('status: isDemo ? "paid" : "pending"');
    expect(r).toContain('paymentMethod: isDemo ? "demo" : "stripe"');
    expect(r).toContain("paidAt: isDemo ? new Date() : null");
    // pogojni decrement ostaja v isti transakciji (FW1 — brez preprodaje)
    expect(r).toContain("stock: { gte: item.quantity }");
    expect(r).toContain("stock: { decrement: item.quantity }");
  });

  test("③ Stripe Checkout Session: mode payment, metadata type=marketplace_order + orderNumber, expires_at okno", () => {
    expect(r).toContain("mode: \"payment\"");
    expect(r).toContain("type: MARKETPLACE_ORDER_TYPE");
    expect(r).toContain("orderNumber: createdOrderNumber");
    expect(r).toContain("expires_at: checkoutExpiresAt()");
    expect(r).toContain("customer_email: email");
    // cene iz STREŽNIŠKE plasti (buildOrderCheckoutLineItems iz DB cen)
    expect(r).toContain("buildOrderCheckoutLineItems(");
  });

  test("④ povratni URL-ji na /trznica (uspeh s številko naročila + preklic) — ločitev od affiliate /go/* handoffa", () => {
    expect(r).toContain("success_url: `${baseUrl}/trznica?placilo=uspeh&narocilo=${createdOrderNumber}`");
    expect(r).toContain("cancel_url: `${baseUrl}/trznica?placilo=preklicano`");
    // own checkout NE uporablja affiliate redirect mehanike /go/
    expect(r).not.toContain("/go/");
  });

  test("⑤ dedup v produkciji zajema SAMO aktivne vrstice (ORDER_ACTIVE_STATUSES) — preklicana ne blokira novega poskusa", () => {
    expect(r).toContain("const dedupStatusFilter = isDemo");
    expect(r).toContain("[...ORDER_ACTIVE_STATUSES]");
    expect(r).toContain("...(dedupStatusFilter ? { status: dedupStatusFilter } : {})");
  });

  test("⑥ kompenzacija: napaka ustvarjanja seje → releasePendingOrder (preklic pending + vrnitev zaloge, ker brez seje ni webhook-a)", () => {
    expect(r).toContain("await releasePendingOrder(createdOrderNumber).catch(");
    expect(r).toContain("Napaka pri pripravi plačila. Poskusite znova.");
  });

  test("⑦ odgovor { url } + status \"pending\" (klient NIKOLI ne vidi lažnega \"paid\" pred webhookom)", () => {
    expect(r).toContain("url: checkoutSession.url");
    expect(r).toContain('status: "pending" as const');
    expect(r).toContain("demo: false");
  });
});

describe("ISSUE #20 §4 FAZA 2: /api/bookings — produkcijska veja (source-contract)", () => {
  const r = source("src/app/api/bookings/route.ts");

  test("① fail-closed 503 brez STRIPE_SECRET_KEY (NE več 501 TODO)", () => {
    expect(r).toContain('if (!isDemo && (!isStripeConfigured() || !stripeKey))');
    expect(r).toContain("Plačila niso konfigurirana (STRIPE_SECRET_KEY manjka)");
    expect(r).toContain("{ status: 503 }");
    expect(r).not.toContain("Stripe checkout še ni konfiguriran v production načinu");
  });

  test("② pending Booking BREZ confirmedAt + paymentMethod \"stripe\" (kapaciteta zasedena — pending šteje v koledar)", () => {
    expect(r).toContain('status: isDemo ? "confirmed" : "pending"');
    expect(r).toContain('confirmedAt: isDemo ? new Date() : null');
    expect(r).toContain('paymentMethod: isDemo ? "demo" : "stripe"');
    // paymentStatus ostaja "unpaid" ob ustvarjanju — "paid" piše samo webhook
    expect(r).toContain('paymentStatus: "unpaid"');
    // TASK 33 koledar ostaja ZNOTRAJ transakcije (atomarna preprečitev overbookinga)
    expect(r).toContain("const { policy, booked } = await checkDayAvailability({");
  });

  test("③ Stripe Checkout Session: mode payment, metadata type=marketplace_booking + bookingNumber, cena/količina iz DB", () => {
    expect(r).toContain("type: MARKETPLACE_BOOKING_TYPE");
    expect(r).toContain("bookingNumber: booking.bookingNumber");
    expect(r).toContain("unit_amount: Math.round(pricePerPerson * 100)");
    expect(r).toContain("quantity: groupSize");
    expect(r).toContain("expires_at: checkoutExpiresAt()");
  });

  test("④ povratni URL-ji na /dozivetja (uspeh s številko rezervacije + preklic)", () => {
    expect(r).toContain("success_url: `${baseUrl}/dozivetja?placilo=uspeh&rezervacija=${booking.bookingNumber}`");
    expect(r).toContain("cancel_url: `${baseUrl}/dozivetja?placilo=preklicano`");
  });

  test("⑤ dedup v produkciji zajema SAMO aktivne vrstice (BOOKING_ACTIVE_STATUSES)", () => {
    expect(r).toContain("const dedupStatusFilter = isDemo");
    expect(r).toContain("[...BOOKING_ACTIVE_STATUSES]");
    expect(r).toContain("...(dedupStatusFilter ? { status: dedupStatusFilter } : {})");
  });

  test("⑥ kompenzacija: napaka ustvarjanja seje → releasePendingBooking (kapaciteta sproščena prek statusa cancelled)", () => {
    expect(r).toContain("await releasePendingBooking(booking.bookingNumber).catch(");
  });

  test("⑦ odgovor { url } + status \"pending\"; demo pot nedotaknjena (confirmed + e-pošta ostajata)", () => {
    expect(r).toContain("url: checkoutSession.url");
    expect(r).toContain('status: "pending" as const');
    expect(r).toContain('status: "confirmed" as const');
    expect(r).toContain("providerBookingNotificationEmail");
  });
});

describe("ISSUE #20 §4 FAZA 2: /api/stripe/webhook — marketplace veje (source-contract)", () => {
  const r = source("src/app/api/stripe/webhook/route.ts");

  test("① podpis + dedup STA PRED obdelavo: constructEvent, nato ProcessedStripeEvent P2002 → klientski payload NE MORE ponarediti \"paid\"", () => {
    const sigIdx = r.indexOf("constructEvent(");
    const dedupIdx = r.indexOf("processedStripeEvent.create(");
    const orderIdx = r.indexOf('marketplaceType === "marketplace_order"');
    const bookingIdx = r.indexOf('marketplaceType === "marketplace_booking"');
    expect(sigIdx).toBeGreaterThan(-1);
    expect(dedupIdx).toBeGreaterThan(sigIdx);
    expect(orderIdx).toBeGreaterThan(dedupIdx);
    expect(bookingIdx).toBeGreaterThan(dedupIdx);
    // P2002 → 200 { duplicate: true } (Stripe ne retry-a več) + brisanje
    // markerja ob napaki (P7-C4 — retry znova obdela)
    expect(r).toContain('"P2002"');
    expect(r).toContain("duplicate: true");
    expect(r).toContain("processedStripeEvent.delete(");
  });

  test("② marketplace_order: findUnique po orderNumber → validateMarketplacePayment → POGOJNI prehod pending→paid (idempotenca RC-4)", () => {
    expect(r).toContain('where: { orderNumber: cs.metadata.orderNumber }');
    expect(r).toContain("const orderCheck = validateMarketplacePayment({");
    expect(r).toContain('where: { orderNumber: order.orderNumber, status: "pending" }');
    expect(r).toContain('data: { status: "paid", paidAt: new Date() }');
    // markPaid.count === 0 → izpis za ročno uskladitev (brez tihega preskoka)
    expect(r).toContain("ro\u010dna uskladitev/refund");
    // potrditveni email kupcu (ne-blokirajoče)
    expect(r).toContain("orderConfirmationEmail({");
  });

  test("③ marketplace_booking: preverba + pogojni prehod pending→confirmed + paymentStatus \"paid\" (EDINI writer ob webhook-u)", () => {
    expect(r).toContain("const bookingCheck = validateMarketplacePayment({");
    expect(r).toContain('where: { bookingNumber: booking.bookingNumber, status: "pending" }');
    // paymentStatus "paid" se zapiše SAMO tukaj (provizijska osnova FW1)
    expect(r).toContain("paymentStatus: \"paid\"");
    expect(r).toContain("bookingCount: { increment: 1 }");
    // e-pošta gostu IN ponudniku (isti vzorec kot demo pot)
    expect(r).toContain("bookingConfirmationEmail({");
    expect(r).toContain("providerBookingNotificationEmail({");
  });

  test("④ preverba zneska je SKUPNA in fail-closed: payment_status \"paid\" + vsaj pričakovani znesek v centih", () => {
    expect(r).toContain("expectedTotalCents: Math.round(order.total * 100)");
    expect(r).toContain("expectedTotalCents: Math.round(booking.total * 100)");
    expect(r).toContain("amountTotalCents: cs.amount_total");
    expect(r).toContain("paymentStatus: cs.payment_status");
  });

  test("⑤ checkout.session.expired + async_payment_failed: idempotentna sprostitev obeh vrst rezervacij", () => {
    expect(r).toContain('case "checkout.session.expired":');
    expect(r).toContain('case "checkout.session.async_payment_failed":');
    expect(r).toContain("await releasePendingOrder(cs.metadata.orderNumber)");
    expect(r).toContain("await releasePendingBooking(");
  });

  test("⑥ sprostilna plast: preklic Najprej (pogojni updateMany pending), šele nato vrnitev zaloge + saleCount (varna smer napake)", () => {
    const s = source("src/lib/marketplace-checkout-server.ts");
    const cancelIdx = s.indexOf('db.order.updateMany({');
    const restoreIdx = s.indexOf("stock: { increment: r.quantity }");
    expect(cancelIdx).toBeGreaterThan(-1);
    expect(restoreIdx).toBeGreaterThan(cancelIdx);
    expect(s).toContain('where: { orderNumber, status: "pending" }');
    expect(s).toContain('saleCount: { decrement: r.quantity }');
    expect(s).toContain('where: { bookingNumber, status: "pending" }');
    // nedotakljivost koledarja: kapaciteta se sprosti prek statusa (checkDay-
    // Availability šteje status ≠ "cancelled") — brez ročnega posega vanj
    // neposreden klic v koledar NE obstaja (sprostitev gre prek statusa —
    // omemba v dokumentacijskem komentarju je pojasnilo, ne klic)
    expect(s).not.toContain("checkDayAvailability(");
  });
});

describe("ISSUE #20 §4 FAZA 2: frontend — preusmeritev + povratni banner (source-contract)", () => {
  test("① checkout-modal: ob odgovoru { url } preusmeritev na Stripe (pred prikazom demo uspeha); zgodovina + čiščenje košarice", () => {
    const r = source("src/components/checkout-modal.tsx");
    expect(r).toContain("url?: string;");
    expect(r).toContain("if (data.url) {");
    expect(r).toContain("window.location.href = data.url");
    expect(r).toContain("addOrderNumber(data.orderNumber)");
    expect(r).toContain("clearCart()");
  });

  test("② experience-modal: ob odgovoru { url } preusmeritev na Stripe; zgodovina + atribucija počiščena", () => {
    const r = source("src/components/sections/experience-modal.tsx");
    expect(r).toContain("url?: string;");
    expect(r).toContain("if (data.url) {");
    expect(r).toContain("window.location.href = data.url");
    expect(r).toContain("addBooking(data.bookingNumber)");
    expect(r).toContain("clearConsultationRef()");
  });

  test("③ PaymentReturnBanner: izris SAMO ob ?placilo=uspeh|preklicano (drugje null), dvojezično, Suspense ovoj", () => {
    const r = source("src/components/payment-return-banner.tsx");
    expect(r).toContain('params.get("placilo")');
    expect(r).toContain('outcome !== "uspeh" && outcome !== "preklicano"');
    expect(r).toContain("return null");
    expect(r).toContain("<Suspense");
    expect(r).toContain('sl: "Plačilo uspešno"');
    expect(r).toContain('en: "Payment successful"');
  });

  test("④ banner pripet na obe povratni strani (/trznica + /dozivetja)", () => {
    expect(source("src/app/trznica/page.tsx")).toContain("<PaymentReturnBanner />");
    expect(source("src/app/dozivetja/page.tsx")).toContain("<PaymentReturnBanner />");
  });
});

describe("ISSUE #20 §4 FAZA 2: regresijska pravila (source-contract)", () => {
  test("① demo v produkciji ŠE VEDNO zahteva izrecni DSA_DEMO_PAYMENTS=1 (stripe-server nedotaknjen)", () => {
    const r = source("src/lib/stripe-server.ts");
    expect(r).toContain('process.env.DSA_DEMO_PAYMENTS === "1"');
    expect(r).toContain("if (isStripeConfigured()) return false;");
  });

  test("② pravi ključ IZKLOPI demo (isStripeDemo → false) → produkcijska veja se dejansko izvede (ne 501)", () => {
    const r = source("src/lib/stripe-server.ts");
    const cfg = r.indexOf("export function isStripeConfigured");
    const demo = r.indexOf("export function isStripeDemo");
    expect(cfg).toBeGreaterThan(-1);
    expect(demo).toBeGreaterThan(cfg);
  });
});
