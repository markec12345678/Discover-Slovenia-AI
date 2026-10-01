// ============================================================================
// ISSUE #22 — TRAVEL GUARDIAN: RECOVERY + DAY START + DATA QUALITY (1.162.0)
// ============================================================================
// Pokriva (čisto, 0 omrežja):
//  §7/§8  recovery: vsi sprožilci (MISSED/SKIPPED/CANCELLED/OFF_ROUTE/
//         DELAYED), predlogi zahtevajo potrditev, nextViable, stillValid,
//         nič recoveryja na čistem dnevu, determinizem;
//  §13    day start: applicable (jutro + danes + nič done + brez GPS),
//         števila, prvi cilj, pot, opozorila, manjkajoči podatki;
//  §18    data quality: positionQuality/routeQuality/bookingQuality/geoQuality
//         + legenda.
// ============================================================================

import { describe, expect, test } from "bun:test";

import type { MyTripDay, MyTripView, TripEntry } from "@/lib/journey/trip-view";
import { buildGoView } from "@/lib/journey/go-view";
import { evaluateTimeReserve } from "@/lib/journey/time-reserve";
import {
  positionQualityOf,
  routeQualityOf,
  bookingQualityOf,
} from "@/lib/journey/time-reserve";
import { detectConflicts } from "@/lib/journey/conflict-detect";
import { assessRecovery } from "@/lib/journey/recovery";
import { buildDayStartSummary } from "@/lib/journey/day-start";
import { resolveStopGeo } from "@/lib/journey/resolve-stop-geo";

// ---------------------------------------------------------------------------
// Fixture (isti vzorec kot issue22-guardian-core)
// ---------------------------------------------------------------------------

function mkEntry(key: string, over: Partial<TripEntry> = {}): TripEntry {
  return {
    key,
    category: "attractions",
    icon: "🏛️",
    title: `Postanek ${key}`,
    providerLabel: { sl: "AI načrt", en: "AI plan" },
    status: "INFO",
    statusLabel: { sl: "Načrtovani postanek", en: "Planned stop" },
    cancellation: { sl: "Ni rezervacije.", en: "No booking." },
    bookingId: null,
    ...over,
  };
}

function mkDay(date: string | undefined, entries: TripEntry[]): MyTripDay {
  return {
    ...(date ? { date } : {}),
    dateLabel: { sl: `${date} (sl)`, en: `${date} (en)` },
    entries,
  };
}

function mkTrip(days: MyTripDay[]): MyTripView {
  return {
    title: { sl: "MOJA POT — BLED", en: "MY TRIP — BLED" },
    days,
    externalCards: [],
    confirmation: { confirmedCount: 0, note: { sl: "ni", en: "none" } },
    generatedAt: new Date().toISOString(),
  };
}

/** Ponedeljek 21. 9. 2026, 10:00. */
const MONDAY = new Date(2026, 8, 21, 10, 0);
const MONDAY_DATE = "2026-09-21";
const STOP_GEO = { lat: 46.5, lng: 14.0 };
const posAt = (dLat: number) => ({
  lat: 46.5 - dLat,
  lng: 14.0,
  timestamp: MONDAY.getTime(),
});

/** Celoten Guardian vhod za dano pot + položaj (rezerva + konflikti). */
function guardianContext(
  trip: MyTripView,
  now: Date,
  position: ReturnType<typeof posAt> | null,
  bookingRows?: { key: string; status: string }[]
) {
  const view = buildGoView(trip, now, position, {});
  const geo = resolveStopGeo({ ...STOP_GEO, provider: "fsq" });
  const reserve = evaluateTimeReserve({
    next: { time: view.next?.entry.time ?? null, openingHours: view.next?.entry.openingHours },
    geo: view.next ? view.next.geo : geo,
    position,
    now,
  });
  const conflicts = detectConflicts({ view, now, reserve, bookingRows, position });
  return { view, reserve, conflicts };
}

// ---------------------------------------------------------------------------
// 1 — RECOVERY (§7 + §8)
// ---------------------------------------------------------------------------

describe("ISSUE #22 §7/§8: recovery — sprožilci in predlogi", () => {
  test("① čist dan → BREZ recovery načrta (null)", () => {
    const trip = mkTrip([
      mkDay(MONDAY_DATE, [mkEntry("a", { ...STOP_GEO, time: { start: "12:00" } })]),
    ]);
    const { view, reserve, conflicts } = guardianContext(trip, MONDAY, posAt(0.09));
    expect(reserve.status).toBe("ON_TIME");
    const plan = assessRecovery({ view, now: MONDAY, conflicts, position: posAt(0.09) });
    expect(plan).toBeNull();
  });

  test("② zamujen termin → MISSED_STOP s predlogi [Nadaljuj][Preskoči][Preuredi]", () => {
    const trip = mkTrip([
      mkDay(MONDAY_DATE, [
        mkEntry("a", { ...STOP_GEO, time: { start: "09:00" } }), // 60 min pretek
        mkEntry("b", { lat: 46.6, lng: 14.1, time: { start: "14:00" } }),
      ]),
    ]);
    const { view, conflicts } = guardianContext(trip, MONDAY, null);
    const plan = assessRecovery({ view, now: MONDAY, conflicts, position: null });
    expect(plan?.trigger).toBe("MISSED_STOP");
    expect(plan?.affected).toHaveLength(1);
    expect(plan?.affected[0].key).toBe("a");
    expect(plan?.suggestions.map((s) => s.action)).toEqual([
      "CONTINUE",
      "SKIP",
      "ADJUST_PLAN",
    ]);
    // Kaj ostaja veljavno: drugi postanek (ni prizadet).
    expect(plan?.stillValid.map((s) => s.key)).toEqual(["b"]);
    // Naslednji IZVEDLJIVI cilj: zamujeni postanek je ogrožen → prvi
    // ne-ogroženi z navigabilnim geo ( Nadaljuj kljub temu je predlog CONTINUE).
    expect(plan?.nextViable?.key).toBe("b");
  });

  test("③ preklicana rezervacija → CANCELLED_BOOKING z [Odpri rezervacijo]", () => {
    const trip = mkTrip([
      mkDay(MONDAY_DATE, [
        mkEntry("a", {
          ...STOP_GEO,
          time: { start: "12:00" },
          provider: "prov",
          providerProductId: "pid1",
        }),
      ]),
    ]);
    const rows = [{ key: "prov:pid1", status: "CANCELLED" }];
    const { view, conflicts } = guardianContext(trip, MONDAY, posAt(0.09), rows);
    const plan = assessRecovery({
      view,
      now: MONDAY,
      conflicts,
      position: posAt(0.09),
    });
    expect(plan?.trigger).toBe("CANCELLED_BOOKING");
    expect(plan?.suggestions[0].action).toBe("VIEW_BOOKING");
    expect(plan?.headline.sl).toContain("preklicana");
  });

  test("④ daleč + ogrožen termin → OFF_ROUTE (111 km + LATE)", () => {
    const trip = mkTrip([
      mkDay(MONDAY_DATE, [mkEntry("a", { ...STOP_GEO, time: { start: "10:10" } })]),
    ]);
    const far = posAt(1.0); // ~111 km naravnost
    const { view, conflicts } = guardianContext(trip, MONDAY, far);
    expect(view.next?.distanceKm).toBeGreaterThanOrEqual(80);
    expect(conflicts.some((c) => c.kind === "AT_RISK_BOOKING")).toBe(true);
    const plan = assessRecovery({ view, now: MONDAY, conflicts, position: far });
    expect(plan?.trigger).toBe("OFF_ROUTE");
    expect(plan?.headline.sl).toContain("km");
  });

  test("⑤ termin že teče (< 30 min) → DELAYED_DAY (ne MISSED)", () => {
    const trip = mkTrip([
      mkDay(MONDAY_DATE, [mkEntry("a", { ...STOP_GEO, time: { start: "09:50" } })]),
    ]);
    const { view, conflicts } = guardianContext(trip, MONDAY, null);
    const plan = assessRecovery({ view, now: MONDAY, conflicts, position: null });
    expect(plan?.trigger).toBe("DELAYED_DAY");
  });

  test("⑥ preskočen TERMINIRANI postanek → SKIPPED_STOP; brez termina → null", () => {
    const skippedFixed = { a: new Date().toISOString() };
    const trip = mkTrip([
      mkDay(MONDAY_DATE, [
        mkEntry("a", { ...STOP_GEO, time: { start: "09:00" } }),
        mkEntry("b", { lat: 46.6, lng: 14.1 }),
      ]),
    ]);
    const view = buildGoView(trip, MONDAY, null, {}, { skipped: skippedFixed });
    const plan = assessRecovery({ view, now: MONDAY, conflicts: [], position: null });
    expect(plan?.trigger).toBe("SKIPPED_STOP");
    expect(plan?.headline.sl).toContain("Postanek a");

    // Preskočen BREZ termina → ni recovery (nič se ni časovno spremenilo):
    const trip2 = mkTrip([
      mkDay(MONDAY_DATE, [
        mkEntry("a", { ...STOP_GEO }),
        mkEntry("b", { lat: 46.6, lng: 14.1 }),
      ]),
    ]);
    const view2 = buildGoView(trip2, MONDAY, null, {}, { skipped: skippedFixed });
    expect(assessRecovery({ view: view2, now: MONDAY, conflicts: [], position: null })).toBeNull();
  });

  test("⑦ dan brez odprtih postankov → null (recovery nima česa reševati)", () => {
    const trip = mkTrip([
      mkDay(MONDAY_DATE, [mkEntry("a", { ...STOP_GEO })]),
    ]);
    const view = buildGoView(trip, MONDAY, null, { a: new Date().toISOString() });
    expect(assessRecovery({ view, now: MONDAY, conflicts: [], position: null })).toBeNull();
  });

  test("⑧ determinizem: isti vhodi → isti načrt", () => {
    const trip = mkTrip([
      mkDay(MONDAY_DATE, [
        mkEntry("a", { ...STOP_GEO, time: { start: "09:00" } }),
        mkEntry("b", { lat: 46.6, lng: 14.1, time: { start: "14:00" } }),
      ]),
    ]);
    const ctx = guardianContext(trip, MONDAY, null);
    const input = {
      view: ctx.view,
      now: MONDAY,
      conflicts: ctx.conflicts,
      position: null,
    };
    expect(assessRecovery(input)).toEqual(assessRecovery(input));
  });
});

// ---------------------------------------------------------------------------
// 2 — DAY START (§13)
// ---------------------------------------------------------------------------

describe("ISSUE #22 §13: day start — jutranji povzetek", () => {
  const trip = mkTrip([
    mkDay(MONDAY_DATE, [
      mkEntry("a", { ...STOP_GEO, time: { start: "11:00" } }),
      mkEntry("b", { lat: 46.6, lng: 14.1 }),
      mkEntry("c"), // brez geo
    ]),
  ]);

  test("① jutro + danes + nič done + brez GPS → applicable s številkami", () => {
    const { view, conflicts } = guardianContext(trip, MONDAY, null);
    const s = buildDayStartSummary({
      view,
      now: MONDAY,
      conflicts,
      gpsActive: false,
    });
    expect(s.applicable).toBe(true);
    expect(s.stopCount).toBe(3);
    expect(s.fixedCount).toBe(1);
    expect(s.firstStop?.key).toBe("a");
    expect(s.firstStop?.timeStart).toBe("11:00");
    expect(s.missingGeoCount).toBe(1); // c
    expect(s.missingTimeCount).toBe(2); // b + c
    expect(s.warnings).toHaveLength(0); // čist dan
  });

  test("② opozorila se preštejejo po vrsti (attention/warning, ne info)", () => {
    const riskyTrip = mkTrip([
      mkDay(MONDAY_DATE, [
        mkEntry("a", { ...STOP_GEO, time: { start: "10:10" } }), // LATE → AT_RISK
      ]),
    ]);
    const { view, conflicts } = guardianContext(riskyTrip, MONDAY, posAt(0.09));
    const s = buildDayStartSummary({
      view,
      now: MONDAY,
      conflicts,
      gpsActive: false,
    });
    expect(s.warnings).toContainEqual({ kind: "AT_RISK_BOOKING", count: 1 });
  });

  test("③ ne-primeren: popoldan / GPS že aktiven / kaj opravljenega", () => {
    const afternoon = new Date(2026, 8, 21, 14, 0);
    const { view } = guardianContext(trip, afternoon, null);
    const s = buildDayStartSummary({ view, now: afternoon, conflicts: [], gpsActive: false });
    expect(s.applicable).toBe(false);
    expect(s.notApplicableReason).toBeDefined();

    const gps = buildDayStartSummary({ view, now: MONDAY, conflicts: [], gpsActive: true });
    expect(gps.applicable).toBe(false);
  });

  test("④ znana pot se prenese (SAMO kjer jo načrt nosi)", () => {
    const routedTrip = mkTrip([
      {
        date: MONDAY_DATE,
        dateLabel: { sl: MONDAY_DATE, en: MONDAY_DATE },
        entries: [mkEntry("a", { ...STOP_GEO })],
        route: { km: 120, min: 150, legsKnown: 2, legsTotal: 2, method: "osrm" },
      },
    ]);
    const { view } = guardianContext(routedTrip, MONDAY, null);
    const s = buildDayStartSummary({ view, now: MONDAY, conflicts: [], gpsActive: false });
    expect(s.route).toEqual({
      km: 120,
      min: 150,
      method: "osrm",
      legsKnown: 2,
      legsTotal: 2,
    });
  });

  test("⑤ prazen dan (brez odprtih) → applicable false + firstStop null", () => {
    const doneTrip = mkTrip([
      mkDay(MONDAY_DATE, [mkEntry("a", { ...STOP_GEO })]),
    ]);
    const view = buildGoView(doneTrip, MONDAY, null, { a: new Date().toISOString() });
    const s = buildDayStartSummary({ view, now: MONDAY, conflicts: [], gpsActive: false });
    expect(s.applicable).toBe(false);
    expect(s.firstStop).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3 — DATA QUALITY (§18)
// ---------------------------------------------------------------------------

describe("ISSUE #22 §18: data quality klasifikacija", () => {
  test("① pozicija: null → UNKNOWN; stale → STALE; sveža → ESTIMATED", () => {
    expect(positionQualityOf(null, MONDAY.getTime())).toBe("UNKNOWN");
    expect(
      positionQualityOf(
        { timestamp: MONDAY.getTime() - 120_000 },
        MONDAY.getTime()
      )
    ).toBe("STALE");
    expect(
      positionQualityOf({ timestamp: MONDAY.getTime() - 5_000 }, MONDAY.getTime())
    ).toBe("ESTIMATED");
  });

  test("② noga: osrm → VERIFIED; hevristika → ESTIMATED; brez → MISSING", () => {
    expect(routeQualityOf({ source: "osrm" })).toBe("VERIFIED");
    expect(routeQualityOf({ source: "heuristic" })).toBe("ESTIMATED");
    expect(routeQualityOf(null)).toBe("MISSING");
    expect(routeQualityOf(undefined)).toBe("MISSING");
  });

  test("③ rezervacija: vrstica → VERIFIED; brez → MISSING", () => {
    expect(bookingQualityOf({ status: "EXTERNAL" })).toBe("VERIFIED");
    expect(bookingQualityOf(null)).toBe("MISSING");
  });

  test("④ geo: own → VERIFIED; zunanji → ESTIMATED; missing → MISSING", () => {
    expect(resolveStopGeo({ lat: 46.5, lng: 14.0, provider: "own" }).precision).toBe("exact");
    expect(resolveStopGeo({ lat: 46.5, lng: 14.0, provider: "fsq" }).precision).toBe("approximate");
    expect(resolveStopGeo({}).precision).toBe("missing");
  });
});
