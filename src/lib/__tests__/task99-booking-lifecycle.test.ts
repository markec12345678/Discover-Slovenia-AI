// ============================================================================
// TASK 99 (issue #1 §2) — BOOKING LIFECYCLE POTOVANJA: polni nabor statusov
// + ZBUDITEV spanje državne naprave (POST/PATCH write pot, MY TRIP prekrivka)
// ============================================================================
// Revizija issue #1 je ugotovila:
//  1. ConfirmationStatus je manjkal 4 zahtevane statuse issue §2:
//     BOOKING_REQUESTED / REFUNDED / MODIFIED / EXPIRED;
//  2. državna naprava (ALLOWED_TRANSITIONS + validator) je bila SPANJA —
//     ni bilo NOBENE write poti (tabela JourneyBooking nikoli zapisana,
//     GET brez klicalnika, confirmedCount hardcoded 0);
//  3. checkout handoff (klik na /go povezavo ponudnika) ni pustil NOBENEGA
//     lifecycle zapisa.
// Testi varujejo: nabor statusov, prehode, invariante iskrenosti
// (EXTERNAL ≠ CONFIRMED; CONFIRMED/PAID/MODIFIED zahtevata provider dokaz),
// write pot (POST začetni statusi, PATCH žeton fail-closed) in MY TRIP
// prekrivko (iz DEJANSKIH vrstic, nikoli hardcoded).
// ============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CONFIRMATION_STATUS_LABELS,
  isProviderConfirmed,
  isValidStatusTransition,
  validateConfirmationRecord,
  type BookingConfirmationRecord,
} from "@/lib/journey/booking";
import {
  CONFIRMATION_STATUSES,
  INITIAL_CONFIRMATION_STATUSES,
} from "@/lib/journey/types";

const ROOT = join(__dirname, "..", "..", "..");
const routeSrc = readFileSync(
  join(ROOT, "src/app/api/journey/bookings/route.ts"),
  "utf8"
);
const tripViewSrc = readFileSync(
  join(ROOT, "src/lib/journey/trip-view.ts"),
  "utf8"
);
const journeyTripSrc = readFileSync(
  join(ROOT, "src/components/journey-trip.tsx"),
  "utf8"
);
const plannerAnalyticsSrc = readFileSync(
  join(ROOT, "src/lib/planner-analytics.ts"),
  "utf8"
);

function rec(
  status: BookingConfirmationRecord["status"],
  overrides: Partial<BookingConfirmationRecord> = {}
): BookingConfirmationRecord {
  return {
    provider: "kiwitaxi",
    providerProductId: "route-1",
    status,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. NABOR STATUSOV (issue §2 zahteva vseh 12 lifecycle stanj)
// ---------------------------------------------------------------------------

describe("TASK 99 §2: polni nabor ConfirmationStatus", () => {
  test("① vseh 13 statusov (9 obstoječih + 4 novi iz issue §2)", () => {
    expect(CONFIRMATION_STATUSES).toHaveLength(13);
    // novi iz issue #1 §2 (prej manjkali POVsod — grep 0 zadetkov)
    expect(CONFIRMATION_STATUSES).toContain("BOOKING_REQUESTED");
    expect(CONFIRMATION_STATUSES).toContain("REFUNDED");
    expect(CONFIRMATION_STATUSES).toContain("MODIFIED");
    expect(CONFIRMATION_STATUSES).toContain("EXPIRED");
    // obstoječi (kompatibilnost TASK 58)
    for (const s of [
      "SELECTED", "PENDING", "PAYMENT_REQUIRED", "PAID", "CONFIRMED",
      "FAILED", "CANCELLED", "UNKNOWN", "EXTERNAL",
    ] as const) {
      expect(CONFIRMATION_STATUSES).toContain(s);
    }
  });

  test("② INITIAL_CONFIRMATION_STATUSES: SAMO uporabniku pripisljivi (fail-closed)", () => {
    // Brez provider odgovora lahko zapišemo LE izbiro/preusmeritev/zahtevo —
    // VSAK drug status je provider-driven dogodek (PATCH kanal, žeton).
    expect([...INITIAL_CONFIRMATION_STATUSES].sort()).toEqual([
      "BOOKING_REQUESTED",
      "EXTERNAL",
      "SELECTED",
    ]);
  });

  test("③ oznake vseh statusov so dvojezične (SL + EN, za My Trip prekrivko)", () => {
    expect(Object.keys(CONFIRMATION_STATUS_LABELS).sort()).toEqual(
      [...CONFIRMATION_STATUSES].sort()
    );
    for (const s of CONFIRMATION_STATUSES) {
      const l = CONFIRMATION_STATUS_LABELS[s];
      expect(l.sl.length).toBeGreaterThan(2);
      expect(l.en.length).toBeGreaterThan(2);
      expect(l.sl).not.toBe(l.en); // resen prevod, ne kopija
    }
  });
});

// ---------------------------------------------------------------------------
// 2. PREHODI (nove poti + OHRANJENE invariante TASK 58)
// ---------------------------------------------------------------------------

describe("TASK 99 §2: prehodi novih statusov", () => {
  test("① SELECTED → BOOKING_REQUESTED (izbor → oddana zahteva)", () => {
    expect(isValidStatusTransition("SELECTED", "BOOKING_REQUESTED")).toBe(true);
  });

  test("② BOOKING_REQUESTED → PENDING/CONFIRMED/FAILED/CANCELLED/EXPIRED/UNKNOWN", () => {
    for (const to of ["PENDING", "CONFIRMED", "FAILED", "CANCELLED", "EXPIRED", "UNKNOWN"] as const) {
      expect(isValidStatusTransition("BOOKING_REQUESTED", to)).toBe(true);
    }
    // nikoli nazaj na SELECTED (izbor je že za nami)
    expect(isValidStatusTransition("BOOKING_REQUESTED", "SELECTED")).toBe(false);
  });

  test("③ REFUNDED iz plačanih/potrjenih/preklicanih (providerjev dogodek)", () => {
    expect(isValidStatusTransition("PAID", "REFUNDED")).toBe(true);
    expect(isValidStatusTransition("CONFIRMED", "REFUNDED")).toBe(true);
    expect(isValidStatusTransition("CANCELLED", "REFUNDED")).toBe(true); // preklic + kasnejše vračilo
  });

  test("④ MODIFIED samo iz provider-potrjenih stanj", () => {
    expect(isValidStatusTransition("CONFIRMED", "MODIFIED")).toBe(true);
    expect(isValidStatusTransition("PAID", "MODIFIED")).toBe(true);
    // nikoli iz ne-potrjenih (spremeniti se lahko le DEJANSKA rezervacija)
    expect(isValidStatusTransition("SELECTED", "MODIFIED")).toBe(false);
    expect(isValidStatusTransition("PENDING", "MODIFIED")).toBe(false);
    expect(isValidStatusTransition("EXTERNAL", "MODIFIED")).toBe(false);
  });

  test("⑤ EXPIRED iz čakalnih stanj; REFUNDED/EXPIRED sta TERMINALNA", () => {
    expect(isValidStatusTransition("PENDING", "EXPIRED")).toBe(true);
    expect(isValidStatusTransition("PAYMENT_REQUIRED", "EXPIRED")).toBe(true);
    expect(isValidStatusTransition("UNKNOWN", "EXPIRED")).toBe(true);
    // terminalnost (kot FAILED)
    expect(isValidStatusTransition("EXPIRED", "PENDING")).toBe(false);
    expect(isValidStatusTransition("EXPIRED", "CONFIRMED")).toBe(false);
    expect(isValidStatusTransition("REFUNDED", "CONFIRMED")).toBe(false);
    expect(isValidStatusTransition("REFUNDED", "PENDING")).toBe(false);
  });

  test("⑥ TASK 58 invarianta OHRANJENA: EXTERNAL NIKOLI → CONFIRMED/PAID", () => {
    expect(isValidStatusTransition("EXTERNAL", "CONFIRMED")).toBe(false);
    expect(isValidStatusTransition("EXTERNAL", "PAID")).toBe(false);
    expect(isValidStatusTransition("EXTERNAL", "MODIFIED")).toBe(false);
    // absorptivno stanje ostaja
    expect(isValidStatusTransition("EXTERNAL", "EXTERNAL")).toBe(true);
    expect(isValidStatusTransition("EXTERNAL", "CANCELLED")).toBe(true);
    expect(isValidStatusTransition("EXTERNAL", "UNKNOWN")).toBe(true);
  });

  test("⑦ TASK 58 invarianta OHRANJENA: FAILED terminalen, PENDING→CONFIRMED dovoljen", () => {
    expect(isValidStatusTransition("FAILED", "PENDING")).toBe(false);
    expect(isValidStatusTransition("FAILED", "CONFIRMED")).toBe(false);
    expect(isValidStatusTransition("PENDING", "CONFIRMED")).toBe(true);
    expect(isValidStatusTransition("PAYMENT_REQUIRED", "PAID")).toBe(true);
    expect(isValidStatusTransition("PAID", "CANCELLED")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. VALIDATOR (provider dokaz za nove provider-potrjene statuse)
// ---------------------------------------------------------------------------

describe("TASK 99 §2: validator iskrenosti novih statusov", () => {
  test("① MODIFIED zahteva providerBookingId + potrjeno ceno (kot CONFIRMED)", () => {
    expect(validateConfirmationRecord(rec("MODIFIED")).ok).toBe(false);
    expect(
      validateConfirmationRecord(rec("MODIFIED", { providerBookingId: "V-123" })).ok
    ).toBe(false);
    expect(
      validateConfirmationRecord(
        rec("MODIFIED", { providerBookingId: "V-123", confirmedPrice: { amount: 90, currency: "EUR" } })
      ).ok
    ).toBe(true);
  });

  test("② REFUNDED zahteva providerBookingId (vračilo se nanaša na dejansko rezervacijo)", () => {
    expect(validateConfirmationRecord(rec("REFUNDED")).ok).toBe(false);
    // znesek vračila NI obvezen ( lahko drugačen od prvotne cene)
    expect(
      validateConfirmationRecord(rec("REFUNDED", { providerBookingId: "V-123" })).ok
    ).toBe(true);
    expect(
      validateConfirmationRecord(
        rec("REFUNDED", { providerBookingId: "V-123", confirmedPrice: { amount: 50, currency: "EUR" } })
      ).ok
    ).toBe(true);
  });

  test("③ isProviderConfirmed: +MODIFIED (provider-potrjen dogodek), brez EXTERNAL/REFUNDED", () => {
    expect(isProviderConfirmed("MODIFIED")).toBe(true);
    expect(isProviderConfirmed("CONFIRMED")).toBe(true);
    expect(isProviderConfirmed("PAID")).toBe(true);
    expect(isProviderConfirmed("REFUNDED")).toBe(false); // vračilo ≠ aktivna potrditev
    expect(isProviderConfirmed("EXTERNAL")).toBe(false);
    expect(isProviderConfirmed("SELECTED")).toBe(false);
    expect(isProviderConfirmed("BOOKING_REQUESTED")).toBe(false);
    expect(isProviderConfirmed("EXPIRED")).toBe(false);
  });

  test("④ TASK 58 invarianta OHRANJENA: EXTERNAL ne sme nositi provider dokazov", () => {
    expect(
      validateConfirmationRecord(rec("EXTERNAL", { providerBookingId: "V-1" })).ok
    ).toBe(false);
    expect(
      validateConfirmationRecord(
        rec("EXTERNAL", { confirmedPrice: { amount: 10, currency: "EUR" } })
      ).ok
    ).toBe(false);
    expect(validateConfirmationRecord(rec("EXTERNAL")).ok).toBe(true);
  });

  test("⑤ BOOKING_REQUESTED/EXPIRED brez posebnih zahtev (iskrena začetna/končna stanja)", () => {
    expect(validateConfirmationRecord(rec("BOOKING_REQUESTED")).ok).toBe(true);
    expect(validateConfirmationRecord(rec("EXPIRED")).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. WRITE POT (route source-contract) — zbujena državna naprava
// ---------------------------------------------------------------------------

describe("TASK 99 §2: /api/journey/bookings write pot (source-contract)", () => {
  test("① POST obstaja in sprejema SAMO začetne statuse (INITIAL_CONFIRMATION_STATUSES)", () => {
    expect(routeSrc).toContain("export async function POST");
    expect(routeSrc).toContain("INITIAL_CONFIRMATION_STATUSES.includes");
    expect(routeSrc).toContain('statusError(INITIAL_CONFIRMATION_STATUSES)');
  });

  test("② PATCH je FAIL-CLOSED brez žetona (JOURNEY_PROVIDER_TOKEN, 503)", () => {
    expect(routeSrc).toContain("export async function PATCH");
    expect(routeSrc).toContain("process.env.JOURNEY_PROVIDER_TOKEN");
    expect(routeSrc).toMatch(/!token[\s\S]{0,400}503/);
    // prehodi + validacija sta povezana v PATCH (državna naprava ŽIVA)
    expect(routeSrc).toContain("isValidStatusTransition(existing.status");
    expect(routeSrc).toContain("validateConfirmationRecord(rec)");
  });

  test("③ POST je idempotenten (obstoječa vrstica istega statusa → brez podvajanja)", () => {
    expect(routeSrc).toContain("idempotent: true");
    expect(routeSrc).toContain("findFirst");
  });

  test("④ GET products način zahteva sessionKey (obseg seje — stanje ne pušča)", () => {
    expect(routeSrc).toContain('searchParams.get("sessionKey")');
    expect(routeSrc).toContain("Manjka/nezveljaven sessionKey");
    expect(routeSrc).toContain("shareId: null, sessionKey, OR: pairs");
  });

  test("⑤ POST efemerne vrstice (brez shareId) ZAHTEVAJO sessionKey", () => {
    expect(routeSrc).toMatch(
      /!shareId && !SESSION_KEY_RE\.test\(sessionKey\)[\s\S]{0,150}400/
    );
  });

  test("⑥ ponudniki so omejeni na kanonski whitelist (17 vrednosti)", () => {
    expect(routeSrc).toContain("VALID_PROVIDERS");
    expect(routeSrc).toContain('"kiwitaxi"');
    expect(routeSrc).toContain('"events"');
    expect(routeSrc).toContain('"travelpayouts"');
  });

  test("⑦ rate limit na write kanalu (30/min, ločen ključ od GET)", () => {
    expect(routeSrc).toContain('key: "journey-bookings-write"');
    expect(routeSrc).toContain("limit: 30");
    expect(routeSrc).toContain('key: "journey-bookings"');
  });

  test("⑧ EXTERNAL handoff zapis NE more prinesti providerBookingId (validator v poti)", () => {
    expect(routeSrc).toContain("buildRecordFromBody");
    expect(routeSrc).toContain("validateConfirmationRecord");
  });
});

// ---------------------------------------------------------------------------
// 5. MY TRIP PREKRIVKA (journey-trip + trip-view source-contract)
// ---------------------------------------------------------------------------

describe("TASK 99 §2/§8: MY TRIP prekrivka iz DEJANSKIH vrstic", () => {
  test("① TripEntry nosi provider slug (povezava zapis ↔ postavka)", () => {
    expect(tripViewSrc).toContain("provider?: string");
    expect(tripViewSrc).toMatch(/providerLabel: providerLabelOf\(p\),\s*\n\s*provider: p\.provider,/);
  });

  test("② confirmedCount NI VEČ hardcoded 0 — prekrivka iz bookingRows", () => {
    // builder postavi iskren 0 kot OSNOWO; komponenta prekrije z realnimi
    expect(tripViewSrc).toContain("bookingId: null");
    expect(journeyTripSrc).toContain("confirmedCount = useMemo");
    expect(journeyTripSrc).toContain("isProviderConfirmed(r.status");
    expect(journeyTripSrc).toContain('r.status === "EXTERNAL"');
  });

  test("③ prekrivka fetcha products+sessionKey (obseg seje)", () => {
    expect(journeyTripSrc).toContain("/api/journey/bookings?products=");
    expect(journeyTripSrc).toContain("&sessionKey=");
    expect(journeyTripSrc).toContain("plannerSessionId()");
  });

  test("④ checkout handoff se ISKRENO zapiše (EXTERNAL, fire-and-forget)", () => {
    expect(journeyTripSrc).toContain("const recordHandoff");
    expect(journeyTripSrc).toContain('status: "EXTERNAL"');
    expect(journeyTripSrc).toContain("keepalive: true");
    expect(journeyTripSrc).toContain("onHandoff ? () => onHandoff(e)");
    // E2E odkritje: gumb NA ČASOVNICI (EntryRow) je DEJANSKI handoff površina —
    // postavka z bookingUrl + EXTERNAL dobi gumb pri ponudniku
    expect(journeyTripSrc).toMatch(
      /e\.bookingUrl && e\.status === "EXTERNAL" &&/
    );
    expect(journeyTripSrc).toContain(
      '<EntryRow key={e.key} e={e} lang={lang} onHandoff={recordHandoff} />'
    );
    // zunanjе kartice najema (brez providerProductId) NE sprožijo zapisa —
    // kategorija affiliate ni kanonski produkt (klik že sledi /go analitiki)
    expect(tripViewSrc).toContain(
      "providerProductId NAMENOMA manjka"
    );
  });

  test("⑤ postavka z zapisom dobi njegov status/oznako/bookingId (augment)", () => {
    expect(journeyTripSrc).toContain("const effectiveTrip = useMemo");
    expect(journeyTripSrc).toContain("CONFIRMATION_STATUS_LABELS[row.status");
    expect(journeyTripSrc).toContain("bookingId: row.providerBookingId");
  });

  test("⑥ ConfirmationDoc izpisuje DEJANSKO štetje (opomba >0 → štetje, handoff vrstica)", () => {
    expect(journeyTripSrc).toContain("confirmedCount?: number");
    expect(journeyTripSrc).toContain("handoffCount?: number");
    expect(journeyTripSrc).toContain("L.doc.confirmedApi[lang]");
    expect(journeyTripSrc).toContain("L.doc.handoffRecorded[lang]");
    // 0 → obstoječa iskrena opomba (kompatibilnost TASK 58)
    expect(journeyTripSrc).toContain("trip.confirmation.note[lang]");
  });

  test("⑦ statusBadge razlikuje provider-potrjeno/rdeče/rumeno/vijolično", () => {
    expect(journeyTripSrc).toMatch(/isProviderConfirmed\(e\.status as ConfirmationStatus\)/);
    expect(journeyTripSrc).toContain('e.status === "FAILED" || e.status === "CANCELLED"');
  });

  test("⑧ plannerSessionId je izvožen iz planner-analytics (isti vir kot analitika)", () => {
    expect(plannerAnalyticsSrc).toContain("export function plannerSessionId()");
    expect(journeyTripSrc).toContain(
      'import { plannerSessionId } from "@/lib/planner-analytics"'
    );
  });
});

// ============================================================================
// HARDENING MASTER TASK — S1/C2/C3/C4/X1 regresijska vrata
// ============================================================================
// S1 (P1): javna POST pot je prej kopirala klientova atestacijska polja
//   (providerBookingId/confirmedPrice/URLji/providerPayload) v kanonsko
//   tabelo potrditev za vse začetne statuse — lažni „Št. rezervacije" se je
//   izrisal v dokumentu My Trip. Client pot = identiteta + status, NIČ več.
// C2: žeton PATCH kanala se primerja timing-safe (ne z !==).
// C3: dedup+create POST je atomaren (SERIALIZABLE + P2034 retry).
// C4: PATCH piše pogojeno (CAS na status) — ne last-write-wins.
// X1: prehod SELECTED → EXTERNAL obstaja (handoff klik po izbiri).
// ============================================================================
describe("HARDENING: klientova pot brez provider atestacij + atomarnost", () => {
  const postSection = routeSrc.slice(
    routeSrc.indexOf("export async function POST"),
    routeSrc.indexOf("export async function PATCH")
  );
  const patchSection = routeSrc.slice(routeSrc.indexOf("export async function PATCH"));

  test("S1: POST ne kliče buildRecordFromBody — klient nikoli ne prineše atestacij", () => {
    // klicni vzorec (ne le ime — ime omenja tudi dokumentacijski komentar)
    expect(postSection).not.toMatch(/\bbuildRecordFromBody\s*\(/);
    // zapis klientovega dogodka je REČENO v poti kot identiteta + status
    expect(postSection).toContain("const rec: BookingConfirmationRecord = {");
  });

  test("S1: POST create zapiše atestacijska polja kot NULL (izključno provider kanal)", () => {
    expect(postSection).toContain("providerBookingId: null");
    expect(postSection).toContain("confirmedPrice: null");
    expect(postSection).toContain("confirmationUrl: null");
    expect(postSection).toContain("cancellationUrl: null");
    expect(postSection).toContain("providerPayload: null");
  });

  test("S1: klientov prehod (update obstoječe vrstice) spreminja SAMO status", () => {
    expect(postSection).toContain("data: { status: rec.status }");
  });

  test("C2: žeton PATCH kanala primerjan timing-safe", () => {
    expect(routeSrc).toContain("timingSafeEqual(provided, token)");
    expect(routeSrc).not.toContain("provided !== token");
  });

  test("C3: POST dedup+create teče v transakciji s P2034 retry", () => {
    expect(postSection).toContain("$transaction");
    expect(postSection).toContain("P2034");
    expect(postSection).toContain("Serializable");
  });

  test("C4: PATCH piše pogojeno — updateMany s predpogojem statusa + 409", () => {
    expect(patchSection).toContain("updateMany");
    expect(patchSection).toContain("where: { id, status: existing.status }");
    expect(patchSection).toContain("count === 0");
  });

  test("X1: prehod SELECTED → EXTERNAL je dovoljen (handoff po izbiri)", () => {
    expect(isValidStatusTransition("SELECTED", "EXTERNAL")).toBe(true);
    // invarianta ostaja: EXTERNAL nikoli ne postane CONFIRMED
    expect(isValidStatusTransition("EXTERNAL", "CONFIRMED")).toBe(false);
  });
});
