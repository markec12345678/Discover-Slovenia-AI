import { describe, expect, test } from "bun:test";
import {
  normalizeParsedReservation,
  extractJsonObject,
  providerSlugFromName,
  importedProductId,
  isKnownProviderSlug,
  RESERVATION_PARSE_PROMPT,
} from "@/lib/imported-reservation";
import {
  computeTripBudgetSummary,
  bookedFromBookings,
  expensesByKind,
  groupSizeFromFormData,
} from "@/lib/trip-budget";
import {
  CONFIRMATION_STATUSES,
  INITIAL_CONFIRMATION_STATUSES,
} from "@/lib/journey/types";
import {
  isValidStatusTransition,
  validateConfirmationRecord,
  CONFIRMATION_STATUS_LABELS,
} from "@/lib/journey/booking";
import { dayCostSummary } from "@/lib/cost-truth";
import { productGoUrl } from "@/lib/supply/itinerary-validation";
import type { DayPlan } from "@/lib/types";

// ============================================================================
// ISSUE #4 VAL 3 (§4 + §7 + §14) — RESNICA S TESTI
// Disciplina VAL 1/2: meriti → popraviti → dokazati. Vsi čisti plasti.
// ============================================================================

// ---------------------------------------------------------------------------
// §4 — normalizacija AI parse izhoda (lib/imported-reservation.ts)
// ---------------------------------------------------------------------------

describe("Issue4 §4 — normalizeParsedReservation", () => {
  test("popoln dokument: vsa polja normalizirana", () => {
    const r = normalizeParsedReservation({
      providerName: "  GetYourGuide  ",
      reservationNumber: "GYG-123456",
      startDateTime: "12.07.2026 10:00",
      locationName: "Bled",
      guestName: "Ana Novak",
      price: 58,
      currency: "eur",
      cancellationDeadline: "24 h pred",
      contact: "support@getyourguide.com",
      notes: "Vodeni ogled",
    });
    expect(r.providerName).toBe("GetYourGuide");
    expect(r.reservationNumber).toBe("GYG-123456");
    expect(r.price).toBe(58);
    expect(r.currency).toBe("EUR");
    expect(r.needsConfirmation).toBe(false);
  });

  test("manjkajoč ponudnik → needsConfirmation (parse je nezanesljiv)", () => {
    const r = normalizeParsedReservation({ price: 30 });
    expect(r.providerName).toBeNull();
    expect(r.needsConfirmation).toBe(true);
  });

  test("manjka KDAJ in št. rezervacije → needsConfirmation", () => {
    const r = normalizeParsedReservation({ providerName: "Booking.com" });
    expect(r.startDateTime).toBeNull();
    expect(r.reservationNumber).toBeNull();
    expect(r.needsConfirmation).toBe(true);
  });

  test("cena iz niza EU formata (1.250,00) + zavrnitev absurdov", () => {
    const r = normalizeParsedReservation({
      providerName: "Hotel",
      startDateTime: "2026-07-12",
      price: "1.250,00",
    });
    expect(r.price).toBe(1250);
    // absurdne cene (0, negativne, >100k) → null — NE izmišljujemo
    expect(normalizeParsedReservation({ price: 0 }).price).toBeNull();
    expect(normalizeParsedReservation({ price: -5 }).price).toBeNull();
    expect(normalizeParsedReservation({ price: 250_000 }).price).toBeNull();
  });

  test("neznana valuta → null (ne pretvarjamo)", () => {
    expect(normalizeParsedReservation({ currency: "XYZ" }).currency).toBeNull();
    expect(normalizeParsedReservation({ currency: "usd" }).currency).toBe("USD");
  });

  test("'null'/'N/A' nizi → null (modeli radi izpišejo dobesedno)", () => {
    const r = normalizeParsedReservation({
      providerName: "null",
      reservationNumber: "N/A",
      contact: "n/a",
    });
    expect(r.providerName).toBeNull();
    expect(r.reservationNumber).toBeNull();
    expect(r.contact).toBeNull();
  });

  test("kap dolžin: 500 znakov ponudnika → 200", () => {
    const r = normalizeParsedReservation({ providerName: "x".repeat(500) });
    expect(r.providerName?.length).toBe(200);
  });

  test("JSON v nizu z ograjo (```json) — extractJsonObject", () => {
    const text = 'Tu je rezultat:\n```json\n{"providerName":"Omio","price":12.5}\n```\nhvala';
    const obj = extractJsonObject(text);
    expect(obj).not.toBeNull();
    expect(obj?.providerName).toBe("Omio");
    const r = normalizeParsedReservation(text);
    expect(r.providerName).toBe("Omio");
    expect(r.price).toBe(12.5);
  });

  test("ne-JSON smeti → vsa polja null (NE sesuje)", () => {
    const r = normalizeParsedReservation("Oprosti, tukaj ni rezervacije.");
    expect(r.providerName).toBeNull();
    expect(r.price).toBeNull();
    expect(r.needsConfirmation).toBe(true);
  });

  test("parse prompt vsebuje izrecna pravila NE izmišljuj", () => {
    expect(RESERVATION_PARSE_PROMPT).toContain("NEVER invent values");
    expect(RESERVATION_PARSE_PROMPT).toContain("null");
  });
});

// ---------------------------------------------------------------------------
// §4 — preslikava imena ponudnika → kanonski slug
// ---------------------------------------------------------------------------

describe("Issue4 §4 — providerSlugFromName", () => {
  test("znana imena → kanonski slug", () => {
    expect(providerSlugFromName("Booking.com")).toBe("booking");
    expect(providerSlugFromName("GetYourGuide")).toBe("getyourguide");
    expect(providerSlugFromName("KiwiTaxi")).toBe("kiwitaxi");
    expect(providerSlugFromName("Skyscanner")).toBe("skyscanner");
    expect(providerSlugFromName("Viator")).toBe("viator");
    expect(providerSlugFromName("Tiqets")).toBe("tiqets");
    expect(providerSlugFromName("Omio")).toBe("omio");
    expect(providerSlugFromName("DiscoverCars")).toBe("discovercars");
  });

  test("neznano ime / null → 'manual' (izrecno, nikoli lažen kanonski)", () => {
    expect(providerSlugFromName("Hotel Zlatorog")).toBe("manual");
    expect(providerSlugFromName(null)).toBe("manual");
    expect(providerSlugFromName("")).toBe("manual");
  });

  test("isKnownProviderSlug: manual je kanonski član", () => {
    expect(isKnownProviderSlug("manual")).toBe(true);
    expect(isKnownProviderSlug("booking")).toBe(true);
    expect(isKnownProviderSlug("fake-provider")).toBe(false);
  });

  test("importedProductId: determinističen dedup ključ", () => {
    expect(importedProductId("manual", "ABC-123")).toBe("imp-manual-ABC-123");
    expect(importedProductId("manual", "abc 123")).toBe("imp-manual-ABC123"); // presledek očiščen
    expect(importedProductId("manual", "abc-123")).toBe("imp-manual-ABC-123"); // case-insensitive
    expect(importedProductId("manual", null)).toBe("imp-manual-NN");
    expect(importedProductId("manual", "X".repeat(60))).toBe(
      `imp-manual-${"X".repeat(40)}`
    );
    // suma znakov (injektirani ločili) se očisti — ključ je URL/clean varen
    expect(importedProductId("manual", "ABC/123 ??")).toBe("imp-manual-ABC123");
  });
});

// ---------------------------------------------------------------------------
// §4 — DRAFT status + source-aware validacija (lib/journey/booking.ts)
// ---------------------------------------------------------------------------

describe("Issue4 §4 — DRAFT status v državnem stroju", () => {
  test("CONFIRMATION_STATUSES vsebuje DRAFT (14 statusov)", () => {
    expect(CONFIRMATION_STATUSES).toContain("DRAFT");
    expect(CONFIRMATION_STATUSES.length).toBe(14);
  });

  test("INITIAL statusi vključujejo DRAFT (uporabniška pot §4)", () => {
    expect(INITIAL_CONFIRMATION_STATUSES).toContain("DRAFT");
  });

  test("labels: DRAFT ima dvojezično oznako", () => {
    expect(CONFIRMATION_STATUS_LABELS.DRAFT.sl).toContain("Osnutek");
    expect(CONFIRMATION_STATUS_LABELS.DRAFT.en).toContain("Draft");
  });

  test("prehodi: DRAFT → CONFIRMED/CANCELLED/FAILED/UNKNOWN/EXTERNAL", () => {
    expect(isValidStatusTransition("DRAFT", "CONFIRMED")).toBe(true);
    expect(isValidStatusTransition("DRAFT", "CANCELLED")).toBe(true);
    expect(isValidStatusTransition("DRAFT", "FAILED")).toBe(true);
    expect(isValidStatusTransition("DRAFT", "UNKNOWN")).toBe(true);
    expect(isValidStatusTransition("DRAFT", "EXTERNAL")).toBe(true);
  });

  test("prehodi: DRAFT NIKOLI → PAID/SELECTED (plačilo ni uporabnikov vnos)", () => {
    expect(isValidStatusTransition("DRAFT", "PAID")).toBe(false);
    expect(isValidStatusTransition("DRAFT", "SELECTED")).toBe(false);
    expect(isValidStatusTransition("DRAFT", "REFUNDED")).toBe(false);
  });

  test("VALIDACIJA: DRAFT ne sme nositi atestacij (osnutek je nepotrjen)", () => {
    const bad = validateConfirmationRecord({
      provider: "manual",
      providerProductId: "imp-manual-X",
      status: "DRAFT",
      source: "IMPORTED",
      providerBookingId: "ABC-1",
    });
    expect(bad.ok).toBe(false);

    const good = validateConfirmationRecord({
      provider: "manual",
      providerProductId: "imp-manual-X",
      status: "DRAFT",
      source: "IMPORTED",
      importData: "{}",
    });
    expect(good.ok).toBe(true);
  });

  test("VALIDACIJA: source USER/IMPORTED sme nositi št. + ceno (dokument = atestacija)", () => {
    const ok = validateConfirmationRecord({
      provider: "getyourguide",
      providerProductId: "imp-getyourguide-GYG1",
      status: "CONFIRMED",
      source: "IMPORTED",
      providerBookingId: "GYG-123456",
      confirmedPrice: { amount: 58, currency: "EUR" },
    });
    expect(ok.ok).toBe(true);
  });

  test("VALIDACIJA: BREZ source ostanejo STARA pravila (S1 neoslabljen)", () => {
    // klientova trditev o providerjevem odgovoru BREZ št. rezervacije → zavrnjeno
    const bad = validateConfirmationRecord({
      provider: "getyourguide",
      providerProductId: "123",
      status: "CONFIRMED",
      confirmedPrice: { amount: 10, currency: "EUR" },
      // BREZ source in BREZ providerBookingId — trditev, ne potrditev
    });
    expect(bad.ok).toBe(false);
    expect(bad.ok === false && bad.reason).toContain("providerBookingId");

    // tudi z izmišljenim ID-jem ostane zavrnitev, ker manjka POTRJENA CENA
    const bad2 = validateConfirmationRecord({
      provider: "getyourguide",
      providerProductId: "123",
      status: "PAID",
      providerBookingId: "X",
      // BREZ source, BREZ cene
    });
    expect(bad2.ok).toBe(false);
  });

  test("VALIDACIJA: EXTERNAL pravila nespremenjena (source ne odpre EXTERNAL)", () => {
    const bad = validateConfirmationRecord({
      provider: "viator",
      providerProductId: "123",
      status: "EXTERNAL",
      source: "USER",
      providerBookingId: "X",
    });
    expect(bad.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §14 — proračun poti (lib/trip-budget.ts)
// ---------------------------------------------------------------------------

const day = (costs: Array<number | null>): DayPlan =>
  ({
    day: 1,
    date: "2026-07-12",
    locations: costs.map((c) => ({
      destination_id: "bled",
      destination_name: "Bled",
      estimated_cost: c == null ? NaN : c,
    })),
  }) as unknown as DayPlan;

describe("Issue4 §14 — computeTripBudgetSummary", () => {
  test("pet vedric: planned (ocena) + booked/paid (denar) + perPerson", () => {
    const s = computeTripBudgetSummary(
      [day([50, 30]), day([20, NaN])],
      {
        knownTotal: 100,
        stopsTotal: 100,
        fromPriceCount: 0,
        unknownCostStops: 1,
        status: "uncertain",
        budget: 500,
      },
      [
        { status: "CONFIRMED", source: "IMPORTED", confirmedPrice: 58, currency: "EUR" },
      ],
      [
        { kind: "booked", amountEur: 42 },
        { kind: "paid", amountEur: 20 },
      ],
      4
    );
    expect(s.currency).toBe("EUR");
    expect(s.planned.knownTotal).toBe(100);
    expect(s.planned.unknownCostStops).toBe(1);
    expect(s.planned.status).toBe("uncertain");
    expect(s.booked.amount).toBe(100); // 58 (rezervacija) + 42 (zaveza)
    expect(s.booked.count).toBe(2);
    expect(s.paid.amount).toBe(20);
    expect(s.paid.count).toBe(1);
    expect(s.groupSize).toBe(4);
    expect(s.perPerson).toEqual({ booked: 25, paid: 5 });
  });

  test("NEZNANA cena NIKOLI v vsoto (§14: ne računaj total brez znane cene)", () => {
    const s = computeTripBudgetSummary(
      [day([NaN, NaN, 40])],
      null, // stara pot brez budgetValidation → fallback dayCostSummary
      [],
      [],
      null
    );
    expect(s.planned.knownTotal).toBe(40); // SAMO znana cena
    expect(s.planned.unknownCostStops).toBe(2); // števec, ne €0
  });

  test("booked šteje SAMO uporabniško potrjene (source USER/IMPORTED)", () => {
    const b = bookedFromBookings([
      { status: "CONFIRMED", source: "IMPORTED", confirmedPrice: 58, currency: "EUR" },
      { status: "CONFIRMED", source: "USER", confirmedPrice: 12, currency: "EUR" },
      // provider/legacy zapisi NE štejejo v uporabniški denar
      { status: "CONFIRMED", source: "PROVIDER", confirmedPrice: 99, currency: "EUR" },
      { status: "CONFIRMED", source: null, confirmedPrice: 99, currency: "EUR" },
      // EXTERNAL nima cene; ne-EUR ne šteje
      { status: "EXTERNAL", source: "IMPORTED", confirmedPrice: 1, currency: "EUR" },
      { status: "CONFIRMED", source: "IMPORTED", confirmedPrice: 5, currency: "USD" },
    ]);
    expect(b.amount).toBe(70);
    expect(b.count).toBe(2);
  });

  test("expensesByKind: samo veljavne vrste, samo pozitivni zneski", () => {
    const { booked, paid } = expensesByKind([
      { kind: "booked", amountEur: 10 },
      { kind: "paid", amountEur: 3.5 },
      { kind: "paid", amountEur: 6.5 },
      { kind: "other", amountEur: 100 }, // neznana vrsta → ignor
      { kind: "paid", amountEur: -1 }, // negativen → ignor
    ]);
    expect(booked).toEqual({ amount: 10, count: 1 });
    expect(paid).toEqual({ amount: 10, count: 2 });
  });

  test("perPerson: null brez groupSize (ne ugibamo skupine)", () => {
    const s = computeTripBudgetSummary([day([10])], null, [], [{ kind: "paid", amountEur: 10 }], null);
    expect(s.groupSize).toBeNull();
    expect(s.perPerson).toBeNull();
  });

  test("perPerson: null kadar ni denarja (nič ne delimo)", () => {
    const s = computeTripBudgetSummary([day([10])], null, [], [], 3);
    expect(s.perPerson).toBeNull();
  });

  test("groupSizeFromFormData: valida obseg 1–20", () => {
    expect(groupSizeFromFormData('{"groupSize": 4}')).toBe(4);
    expect(groupSizeFromFormData('{"groupSize": 0}')).toBeNull();
    expect(groupSizeFromFormData('{"groupSize": 21}')).toBeNull();
    expect(groupSizeFromFormData('{"groupSize": "4"}')).toBeNull();
    expect(groupSizeFromFormData(null)).toBeNull();
    expect(groupSizeFromFormData("ne-JSON")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §7 — transport resnica: kiwitaxi produktna /go povezava (AI pot)
// ---------------------------------------------------------------------------

describe("Issue4 §7 — productGoUrl kiwitaxi (transfer cikel na AI poti)", () => {
  test("numerični KT ID → /go/transfers?product=…", () => {
    expect(productGoUrl("kiwitaxi", "10428391")).toBe("/go/transfers?product=10428391");
  });

  test("ne-numeričen KT ref → null (ne ponujamo lažnega produkta)", () => {
    expect(productGoUrl("kiwitaxi", "abc")).toBeNull();
    expect(productGoUrl("kiwitaxi", "")).toBeNull();
  });

  test("viator/getyourguide nespremenjena oblika (VAL 1 kompatibilnost)", () => {
    expect(productGoUrl("viator", "227717P1")).toBe("/go/viator?product=227717P1");
    expect(productGoUrl("getyourguide", "66985")).toBe("/go/getyourguide?product=66985");
  });

  test("affiliate transporti (rental/rail/bus/flight) → null (ni produkta)", () => {
    expect(productGoUrl("discovercars", "x")).toBeNull();
    expect(productGoUrl("omio", "x")).toBeNull();
    expect(productGoUrl("skyscanner", "x")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §14 — save-path fix: cost-truth semantika ostane hrbtenica
// ---------------------------------------------------------------------------

describe("Issue4 §14 — cost-truth hrbtenica (VAL 1 semantika nespremenjena)", () => {
  test("dayCostSummary: NaN → unknownCount, NIKOLI €0", () => {
    const s = dayCostSummary([
      { estimated_cost: 30 } as never,
      { estimated_cost: NaN } as never,
      { estimated_cost: 0 } as never, // pošteno brezplačen
    ]);
    expect(s.known).toBe(30);
    expect(s.unknownCount).toBe(1);
  });
});
