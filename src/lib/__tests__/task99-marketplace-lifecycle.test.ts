// ============================================================================
// TASK 99 (issue #1 §10) — MARKETPLACE LIFECYCLE: payout state + customer
// state + NO_LIVE_DATA prazno stanje + gostov zahtevek preklica
// ============================================================================
// Revizija issue #1 je ugotovila:
//  1. payout state je MANJKAL popolnoma (edini "payout" zadetki so bili
//     ime ponudnika travelpayouts);
//  2. customer state je manjkal (kupec = ploska denormalizirana polja,
//     gost ni imel NOBENE poti za zahtevek preklica);
//  3. /trznica prazno stanje ni ločilo NO_LIVE_DATA od filtrirane praznine.
// Testi varujejo: shemska polja z iskrenimi privzetki, izpeljava payouta
// (fail-closed: unpaid NIKOLI "due"), customer cancellation-request pot
// (lastništvo po e-pošti, idempotenca, AuditLog) in lastnikovo vidnost.
// ============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  BOOKING_CUSTOMER_LABELS,
  BOOKING_CUSTOMER_STATUSES,
  BOOKING_PAYOUT_LABELS,
  BOOKING_PAYOUT_STATUSES,
  derivePayoutStatus,
} from "@/lib/marketplace-types";

const ROOT = join(__dirname, "..", "..", "..");
const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
const cancelRequestSrc = readFileSync(
  join(
    ROOT,
    "src/app/api/bookings/[bookingNumber]/cancel-request/route.ts"
  ),
  "utf8"
);
const ownerBookingsSrc = readFileSync(
  join(ROOT, "src/app/api/owner/bookings/route.ts"),
  "utf8"
);
const marketplaceSrc = readFileSync(
  join(ROOT, "src/components/sections/marketplace.tsx"),
  "utf8"
);
const myOrdersSrc = readFileSync(
  join(ROOT, "src/components/my-orders-section.tsx"),
  "utf8"
);

// ---------------------------------------------------------------------------
// 1. SHEMA — payout + customer state na Booking modelu
// ---------------------------------------------------------------------------

describe("TASK 99 §10: shema Booking (payout + customer state)", () => {
  test("① payoutStatus stolpec z iskrenim privzetkom not_due", () => {
    expect(schema).toMatch(/payoutStatus\s+String\s+@default\("not_due"\)/);
    // dokumentirana vrednostna množica v komentarju
    expect(schema).toContain('"not_due" (plačilo še ni bilo prisvojeno');
    expect(schema).toContain('| "processing" | "paid" | "failed"');
  });

  test("② customerStatus stolpec z iskrenim privzetkom none", () => {
    expect(schema).toMatch(/customerStatus\s+String\s+@default\("none"\)/);
    expect(schema).toContain("| \"cancellation_requested\"");
  });

  test("③ JourneyBooking sessionKey (eferni obseg seje — §2 povezava)", () => {
    expect(schema).toMatch(/sessionKey\s+String\?/);
    expect(schema).toContain("@@index([sessionKey])");
  });
});

// ---------------------------------------------------------------------------
// 2. TIPI + OZNAKE + ISKRENA IZPELJAVA (fail-closed)
// ---------------------------------------------------------------------------

describe("TASK 99 §10: payout/customer tipi in izpeljava", () => {
  test("① payout množica (5) + dvojezične oznake", () => {
    expect([...BOOKING_PAYOUT_STATUSES]).toHaveLength(5);
    for (const s of BOOKING_PAYOUT_STATUSES) {
      expect(BOOKING_PAYOUT_LABELS[s].sl.length).toBeGreaterThan(3);
      expect(BOOKING_PAYOUT_LABELS[s].en.length).toBeGreaterThan(3);
    }
    expect(BOOKING_PAYOUT_LABELS.not_due.sl).toContain("ne zapada");
  });

  test("② customer množica (2) + dvojezične oznake", () => {
    expect([...BOOKING_CUSTOMER_STATUSES]).toEqual([
      "none",
      "cancellation_requested",
    ]);
    for (const s of BOOKING_CUSTOMER_STATUSES) {
      expect(BOOKING_CUSTOMER_LABELS[s].sl.length).toBeGreaterThan(3);
      expect(BOOKING_CUSTOMER_LABELS[s].en.length).toBeGreaterThan(3);
    }
  });

  test("③ izpeljava FAIL-CLOSED: unpaid NIKOLI ne zapade izplačilu", () => {
    // demo/unpaid rezervacija je trajno not_due — tudi ko je "completed"
    expect(
      derivePayoutStatus({
        paymentStatus: "unpaid",
        status: "completed",
        payoutStatus: "not_due",
      })
    ).toBe("not_due");
    // preklicana plačila se vračajo kupcu, ne partnerju
    expect(
      derivePayoutStatus({
        paymentStatus: "paid",
        status: "cancelled",
        payoutStatus: "not_due",
      })
    ).toBe("not_due");
    // paid + completed + izplačilna plast še ni zapisala "due" → ostane not_due
    expect(
      derivePayoutStatus({
        paymentStatus: "paid",
        status: "completed",
        payoutStatus: "not_due",
      })
    ).toBe("not_due");
  });

  test("④ izpeljava: »due« SAMO ko jo je zapisala izplačilna plast", () => {
    expect(
      derivePayoutStatus({
        paymentStatus: "paid",
        status: "completed",
        payoutStatus: "due",
      })
    ).toBe("due");
    // izplačilna plast ima prednost (processing/paid/failed passthrough)
    expect(
      derivePayoutStatus({
        paymentStatus: "paid",
        status: "completed",
        payoutStatus: "processing",
      })
    ).toBe("processing");
    expect(
      derivePayoutStatus({
        paymentStatus: "paid",
        status: "completed",
        payoutStatus: "paid",
      })
    ).toBe("paid");
    expect(
      derivePayoutStatus({
        paymentStatus: "paid",
        status: "completed",
        payoutStatus: "failed",
      })
    ).toBe("failed");
  });
});

// ---------------------------------------------------------------------------
// 3. GOSTOV ZAHTEVEK PREKLICA (customer state pot)
// ---------------------------------------------------------------------------

describe("TASK 99 §10: /api/bookings/[n]/cancel-request (source-contract)", () => {
  test("① pot obstaja (POST) z lastništvom po e-pošti (PII varnost)", () => {
    expect(cancelRequestSrc).toContain("export async function POST");
    expect(cancelRequestSrc).toContain("guestEmail.toLowerCase().trim() !== email");
    expect(cancelRequestSrc).toMatch(/401/);
    // enako sporočilo za tuje/neobstoječe (brez razkrivanja)
    expect(cancelRequestSrc).toContain("Rezervacija ni najdena");
  });

  test("② zahtevek NE preklica — samo customerStatus + AuditLog", () => {
    expect(cancelRequestSrc).toContain(
      'customerStatus: "cancellation_requested"'
    );
    expect(cancelRequestSrc).toContain('action: "booking_cancel_requested"');
    expect(cancelRequestSrc).toContain("resourceType: \"booking\"");
    // nikoli ne piše status: "cancelled" (to je lastnikova pravica)
    expect(cancelRequestSrc).not.toMatch(/status:\s*"cancelled"/);
  });

  test("③ idempotenten (ponovna zahteva = 200 brez spremembe)", () => {
    expect(cancelRequestSrc).toContain("alreadyRequested: true");
  });

  test("④ pošteni 409 za končana stanja (cancelled/completed)", () => {
    expect(cancelRequestSrc).toContain("že preklicana");
    expect(cancelRequestSrc).toContain("že opravljena");
    expect(cancelRequestSrc).toMatch(/status: 409/);
  });

  test("⑤ rate limit (10/10 min — enumeracijska varnost)", () => {
    expect(cancelRequestSrc).toContain('key: "booking-cancel-request"');
    expect(cancelRequestSrc).toContain("limit: 10");
  });
});

// ---------------------------------------------------------------------------
// 4. LASTNIKOVA VIDNOST (owner bookings)
// ---------------------------------------------------------------------------

describe("TASK 99 §10: owner bookings vidnost (source-contract)", () => {
  test("① GET izbere customerStatus/payoutStatus/paymentStatus", () => {
    expect(ownerBookingsSrc).toContain("customerStatus: true");
    expect(ownerBookingsSrc).toContain("payoutStatus: true");
    expect(ownerBookingsSrc).toContain("paymentStatus: true");
  });

  test("② izpeljava payoutDisplay (derivePayoutStatus import + uporaba)", () => {
    expect(ownerBookingsSrc).toContain(
      'import { derivePayoutStatus } from "@/lib/marketplace-types"'
    );
    expect(ownerBookingsSrc).toContain("payoutDisplay: derivePayoutStatus(b)");
  });

  test("③ statistika odprtih zahtevkov (cancellationRequested)", () => {
    expect(ownerBookingsSrc).toContain("cancellationRequested:");
    expect(ownerBookingsSrc).toContain(
      'b.customerStatus === "cancellation_requested"'
    );
  });

  test("④ lastnikov preklic obravnava zahtevek (customerStatus → none)", () => {
    // HARDENING X2: vsak uspešen lastnikov prehod razreši zahtevek —
    // prej pogojno samo ob cancelu (zastareli "cancellation_requested"
    // je ostal na completed rezervacijah za vedno)
    expect(ownerBookingsSrc).toContain('customerStatus: "none"');
    expect(ownerBookingsSrc).not.toContain(
      'action === "cancel" ? { customerStatus: "none" }'
    );
  });
});

// ---------------------------------------------------------------------------
// 5. GOSTOV UI (my-orders-section) + NO_LIVE_DATA (marketplace)
// ---------------------------------------------------------------------------

describe("TASK 99 §10/§19: gostov UI + NO_LIVE_DATA prazno stanje", () => {
  test("① BookingData nosi customerStatus; kartica ima gumb zahtevka", () => {
    expect(myOrdersSrc).toContain("customerStatus?: string");
    expect(myOrdersSrc).toContain("Zahtevaj preklic");
    expect(myOrdersSrc).toContain("/cancel-request");
    expect(myOrdersSrc).toContain("requestCancellation");
  });

  test("② amber obvestilo za zabeležen zahtevek (iskrena komunikacija)", () => {
    expect(myOrdersSrc).toContain("Zahtevek za preklic je zabeležen");
    expect(myOrdersSrc).toContain("ponudnik ga bo obravnaval");
  });

  test("③ gumb samo za pending/confirmed (končani izven)", () => {
    expect(myOrdersSrc).toMatch(
      /\(b\.status === "pending" \|\| b\.status === "confirmed"\)/
    );
  });

  test("④ NO_LIVE_DATA prazno stanje ločeno od filtrirane praznine", () => {
    // brez filtrov → izrecno NO_LIVE_DATA (nikoli "uspešna" prazna tržnica)
    expect(marketplaceSrc).toContain("Ni še živih ponudb (NO_LIVE_DATA)");
    expect(marketplaceSrc).toContain("Ni najdenih rezultatov.");
    // TASK 8 / F3-B: lokalni EmptyState klon je zamenjala družinska
    // komponenta — vejo ŠE VEDNO odloča hasActiveFilters (= canClear),
    // stanji ostajata izključni (isti TASK 99 §10 pogodbi).
    expect(marketplaceSrc).toContain("hasActiveFilters");
    expect(marketplaceSrc).toContain("stanje ponudbe");
  });
});
