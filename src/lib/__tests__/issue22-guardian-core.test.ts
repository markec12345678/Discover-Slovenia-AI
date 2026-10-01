// ============================================================================
// ISSUE #22 — TRAVEL GUARDIAN: JEDRO (time-reserve + conflict-detect +
// trip-health/buildGuardian) — čisti unit testi (1.162.0)
// ============================================================================
// Pokriva (0 omrežja, 0 localStorage — vse čiste plasti):
//  §5  time reserve: fixed/flexible semantika, pragi ON_TIME/TIGHT/LATE,
//      fail-closed (brez GPS/stale/low accuracy/missing geo), arrived,
//      determinizem, pomožne HH:MM;
//  §6  conflict detection: AT_RISK/TIGHT/OVERLAP/TOO_TIGHT_LEG/STARTED/
//      PAST/MISSING_GEO/UNKNOWN_ROUTE/CLOSED_ON_ARRIVAL/CANCELLED +
//      negativni (brez dokaza NI konflikta) + vrstni red resnosti;
//  §4  trip health: ON_TRACK/NEEDS_ATTENTION/BLOCKED/UNKNOWN iz dejstev,
//      buildGuardian sestavni koren, null ob končanem dnevu;
//  §20 invariante: rezervacijske vrstice so SAMO branje (frozen test),
//      determinizem (isti vhodi → isti izhodi).
// ============================================================================

import { describe, expect, test } from "bun:test";

import type { MyTripDay, MyTripView, TripEntry } from "@/lib/journey/trip-view";
import { buildGoView } from "@/lib/journey/go-view";
import {
  evaluateTimeReserve,
  hhmmToMinutes,
  minutesToHhmm,
  DEFAULT_RESERVE_CONFIG,
} from "@/lib/journey/time-reserve";
import { detectConflicts } from "@/lib/journey/conflict-detect";
import { buildGuardian, assessTripHealth } from "@/lib/journey/trip-health";
import { resolveStopGeo } from "@/lib/journey/resolve-stop-geo";

// ---------------------------------------------------------------------------
// Fixture gradniki (isti vzorec kot issue21-go-travel)
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
    dateLabel: date
      ? { sl: `${date} (sl)`, en: `${date} (en)` }
      : { sl: "Brez datuma", en: "No date" },
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

/** Ponedeljek 21. 9. 2026 (weekday 1 — "Mo-Fr" odpiralni časi veljajo). */
const MONDAY = new Date(2026, 8, 21, 10, 0);
const MONDAY_DATE = "2026-09-21";

const STOP_GEO = { lat: 46.5, lng: 14.0 };
/** Položaj dLat stopinj JUŽNO od cilja; ~0.09° ≈ 10 km → hevristika 15 min. */
const posAt = (dLat: number, over: { accuracyM?: number; ageMs?: number } = {}) => ({
  lat: 46.5 - dLat,
  lng: 14.0,
  ...(over.accuracyM != null ? { accuracyM: over.accuracyM } : {}),
  timestamp: MONDAY.getTime() - (over.ageMs ?? 0),
});

/** Skoraj-na-lokaciji (~22 m) — za arrived kontekst. */
const POS_AT_STOP = posAt(0.0002);

// ---------------------------------------------------------------------------
// 1 — TIME RESERVE (§5)
// ---------------------------------------------------------------------------

describe("ISSUE #22 §5: time reserve — semantika in pragi", () => {
  const geo = resolveStopGeo({ ...STOP_GEO, provider: "fsq" });

  test("① pomožne HH:MM: veljavne/presledne/robne", () => {
    expect(hhmmToMinutes("09:05")).toBe(545);
    expect(hhmmToMinutes("9:5")).toBeNull(); // enomestne minute NISO "H:M"
    expect(hhmmToMinutes("24:00")).toBeNull();
    expect(hhmmToMinutes("abc")).toBeNull();
    expect(minutesToHhmm(545)).toBe("09:05");
    expect(minutesToHhmm(1445)).toBe("00:05"); // čez polnoč se zavrti
  });

  test("② fixed termin + GPS (15 min vožnje) → ON_TIME z dejanskimi številkami", () => {
    const r = evaluateTimeReserve({
      next: { time: { start: "12:00" } },
      geo,
      position: posAt(0.09),
      now: MONDAY,
    });
    expect(r.status).toBe("ON_TIME");
    expect(r.terminal).toBe("fixed_start");
    expect(r.bookingStart).toBe("12:00");
    expect(r.eta?.hhmm).toBe("10:15");
    expect(r.eta?.min).toBe(15);
    expect(r.eta?.km).toBe(15);
    expect(r.eta?.quality).toBe("ESTIMATED"); // hevristika NIKOLI VERIFIED
    expect(r.reserveMin).toBe(105);
  });

  test("③ rezerva 0–15 min → TIGHT; negativna → LATE", () => {
    const tight = evaluateTimeReserve({
      next: { time: { start: "10:20" } },
      geo,
      position: posAt(0.09),
      now: MONDAY,
    });
    expect(tight.status).toBe("TIGHT");
    expect(tight.reserveMin).toBe(5);

    const late = evaluateTimeReserve({
      next: { time: { start: "10:10" } },
      geo,
      position: posAt(0.09),
      now: MONDAY,
    });
    expect(late.status).toBe("LATE");
    expect(late.reserveMin).toBe(-5);
  });

  test("④ flexible (brez termina) → rezerve NI, a ETA obstaja (GPS)", () => {
    const r = evaluateTimeReserve({
      next: {},
      geo,
      position: posAt(0.09),
      now: MONDAY,
    });
    expect(r.terminal).toBe("flexible");
    expect(r.status).toBe("UNKNOWN"); // rezerva brez termina ne obstaja
    expect(r.eta?.hhmm).toBe("10:15");
    expect(r.reason?.sl).toContain("fiksnega termina");
  });

  test("⑤ fail-closed: brez GPS / stale / nizka natančnost / manjkajoči geo", () => {
    const noGps = evaluateTimeReserve({
      next: { time: { start: "12:00" } },
      geo,
      position: null,
      now: MONDAY,
    });
    expect(noGps.status).toBe("UNKNOWN");
    expect(noGps.eta).toBeUndefined();
    expect(noGps.reason?.sl).toContain("GPS");

    const stale = evaluateTimeReserve({
      next: { time: { start: "12:00" } },
      geo,
      position: posAt(0.09, { ageMs: 120_000 }),
      now: MONDAY,
    });
    expect(stale.status).toBe("UNKNOWN");
    expect(stale.quality).toBe("STALE");

    const rough = evaluateTimeReserve({
      next: { time: { start: "12:00" } },
      geo,
      position: posAt(0.09, { accuracyM: 1_500 }),
      now: MONDAY,
    });
    expect(rough.status).toBe("UNKNOWN");

    const missingGeo = resolveStopGeo({ location: "samo naslov" });
    const noGeo = evaluateTimeReserve({
      next: { time: { start: "12:00" } },
      geo: missingGeo,
      position: posAt(0.09),
      now: MONDAY,
    });
    expect(noGeo.status).toBe("UNKNOWN");
    expect(noGeo.quality).toBe("MISSING");
    expect(noGeo.reason?.sl).toContain("Lokacija");
  });

  test("⑥ arrived → ETA = zdaj (0 min, VERIFIED) + rezerva iz termina", () => {
    const r = evaluateTimeReserve({
      next: { time: { start: "10:30" } },
      geo,
      position: POS_AT_STOP,
      arrived: true,
      now: MONDAY,
    });
    expect(r.eta?.min).toBe(0);
    expect(r.eta?.quality).toBe("VERIFIED");
    expect(r.reserveMin).toBe(30);
    expect(r.status).toBe("ON_TIME");
  });

  test("⑦ neveljavna ura vira → UNKNOWN/MISSING (ne sesuje, ne ugiba)", () => {
    const r = evaluateTimeReserve({
      next: { time: { start: "99:99" } },
      geo,
      position: posAt(0.09),
      now: MONDAY,
    });
    expect(r.status).toBe("UNKNOWN");
    expect(r.quality).toBe("MISSING");
  });

  test("⑧ custom konfiguracija pragov se spoštuje", () => {
    const r = evaluateTimeReserve({
      next: { time: { start: "10:20" } },
      geo,
      position: posAt(0.09),
      now: MONDAY,
      config: { ...DEFAULT_RESERVE_CONFIG, onTimeMin: 5 },
    });
    expect(r.status).toBe("ON_TIME"); // rezerva 5 ≥ prag 5
  });

  test("⑨ determinizem: enaki vhodi → enak izhod (deep)", () => {
    const input = {
      next: { time: { start: "12:00" } },
      geo,
      position: posAt(0.09),
      now: MONDAY,
    } as const;
    expect(evaluateTimeReserve(input)).toEqual(evaluateTimeReserve(input));
  });
});

// ---------------------------------------------------------------------------
// 2 — CONFLICT DETECTION (§6)
// ---------------------------------------------------------------------------

describe("ISSUE #22 §6: conflict detection — naslednji termin", () => {
  test("① LATE rezerva → AT_RISK_BOOKING (attention) z dejstvi", () => {
    const trip = mkTrip([
      mkDay(MONDAY_DATE, [mkEntry("a", { ...STOP_GEO, time: { start: "10:10" } })]),
    ]);
    const view = buildGoView(trip, MONDAY, posAt(0.09), {});
    const reserve = evaluateTimeReserve({
      next: { time: { start: "10:10" } },
      geo: resolveStopGeo({ ...STOP_GEO, provider: "fsq" }),
      position: posAt(0.09),
      now: MONDAY,
    });
    const conflicts = detectConflicts({ view, now: MONDAY, reserve, position: posAt(0.09) });
    const risk = conflicts.find((c) => c.kind === "AT_RISK_BOOKING");
    expect(risk).toBeDefined();
    expect(risk?.severity).toBe("attention");
    expect(risk?.facts.sl).toContain("10:10");
    expect(risk?.facts.sl).toContain("~10:15");
    expect(risk?.actions).toContain("NAVIGATE");
    expect(risk?.actions).toContain("ADJUST_PLAN");
  });

  test("② TIGHT rezerva → TIGHT_BOOKING (warning, ne attention)", () => {
    const trip = mkTrip([
      mkDay(MONDAY_DATE, [mkEntry("a", { ...STOP_GEO, time: { start: "10:20" } })]),
    ]);
    const view = buildGoView(trip, MONDAY, posAt(0.09), {});
    const reserve = evaluateTimeReserve({
      next: { time: { start: "10:20" } },
      geo: resolveStopGeo({ ...STOP_GEO, provider: "fsq" }),
      position: posAt(0.09),
      now: MONDAY,
    });
    const conflicts = detectConflicts({ view, now: MONDAY, reserve, position: posAt(0.09) });
    const tight = conflicts.find((c) => c.kind === "TIGHT_BOOKING");
    expect(tight?.severity).toBe("warning");
    expect(conflicts.some((c) => c.severity === "attention")).toBe(false);
  });

  test("③ termin že teče: STARTED (< 30 min) in PAST (> 30 min)", () => {
    const startedTrip = mkTrip([
      mkDay(MONDAY_DATE, [mkEntry("a", { ...STOP_GEO, time: { start: "10:00" } })]),
    ]);
    const now5 = new Date(2026, 8, 21, 10, 5);
    const viewS = buildGoView(startedTrip, now5, null, {});
    const reserveS = evaluateTimeReserve({
      next: { time: { start: "10:00" } },
      geo: resolveStopGeo({ ...STOP_GEO, provider: "fsq" }),
      position: null,
      now: now5,
    });
    const conflictsS = detectConflicts({ view: viewS, now: now5, reserve: reserveS });
    const started = conflictsS.find((c) => c.kind === "STARTED_BOOKING");
    expect(started?.severity).toBe("warning");

    const now40 = new Date(2026, 8, 21, 10, 40);
    const viewP = buildGoView(startedTrip, now40, null, {});
    const reserveP = evaluateTimeReserve({
      next: { time: { start: "10:00" } },
      geo: resolveStopGeo({ ...STOP_GEO, provider: "fsq" }),
      position: null,
      now: now40,
    });
    const conflictsP = detectConflicts({ view: viewP, now: now40, reserve: reserveP });
    const past = conflictsP.find((c) => c.kind === "PAST_BOOKING");
    expect(past?.severity).toBe("attention");
    expect(conflictsP.find((c) => c.kind === "STARTED_BOOKING")).toBeUndefined();
  });
});

describe("ISSUE #22 §6: conflict detection — struktura dneva", () => {
  const geo = resolveStopGeo({ ...STOP_GEO, provider: "fsq" });

  test("④ prekrivanje fiksnih terminov Z dokazom trajanja (OVERLAP_FIXED)", () => {
    const trip = mkTrip([
      mkDay(MONDAY_DATE, [
        mkEntry("a", { ...STOP_GEO, time: { start: "10:00" }, durationMin: 90 }),
        mkEntry("b", { lat: 46.6, lng: 14.1, time: { start: "11:00" } }),
      ]),
    ]);
    const view = buildGoView(trip, MONDAY, posAt(0.09), {});
    const reserve = evaluateTimeReserve({
      next: { time: { start: "10:00" } },
      geo,
      position: posAt(0.09),
      now: MONDAY,
    });
    const conflicts = detectConflicts({ view, now: MONDAY, reserve, position: posAt(0.09) });
    const overlap = conflicts.find((c) => c.kind === "OVERLAP_FIXED");
    expect(overlap).toBeDefined();
    expect(overlap?.severity).toBe("attention");
    expect(overlap?.stopKey).toBe("b");
  });

  test("⑤ BREZ dokaza trajanja → prekrivanja NE trdimo (iskrenost)", () => {
    const trip = mkTrip([
      mkDay(MONDAY_DATE, [
        mkEntry("a", { ...STOP_GEO, time: { start: "10:00" } }), // brez durationMin
        mkEntry("b", { lat: 46.6, lng: 14.1, time: { start: "11:00" } }),
      ]),
    ]);
    const view = buildGoView(trip, MONDAY, posAt(0.09), {});
    const reserve = evaluateTimeReserve({
      next: { time: { start: "10:00" } },
      geo,
      position: posAt(0.09),
      now: MONDAY,
    });
    const conflicts = detectConflicts({ view, now: MONDAY, reserve, position: posAt(0.09) });
    expect(conflicts.find((c) => c.kind === "OVERLAP_FIXED")).toBeUndefined();
  });

  test("⑥ prekratek prehod med postankoma (TOO_TIGHT_LEG iz legFromPrev)", () => {
    const trip = mkTrip([
      mkDay(MONDAY_DATE, [
        mkEntry("a", { ...STOP_GEO, time: { start: "10:00" }, durationMin: 30 }),
        mkEntry("b", {
          lat: 46.6,
          lng: 14.1,
          time: { start: "10:20" },
          legFromPrev: { km: 30, min: 45, source: "heuristic" },
        }),
      ]),
    ]);
    const view = buildGoView(trip, MONDAY, posAt(0.09), {});
    const reserve = evaluateTimeReserve({
      next: { time: { start: "10:00" } },
      geo,
      position: posAt(0.09),
      now: MONDAY,
    });
    const conflicts = detectConflicts({ view, now: MONDAY, reserve, position: posAt(0.09) });
    const tight = conflicts.find((c) => c.kind === "TOO_TIGHT_LEG");
    expect(tight).toBeDefined();
    expect(tight?.severity).toBe("warning");
    expect(tight?.facts.sl).toContain("~75 min");
  });

  test("⑦ manjkajoča lokacija naslednjega postanka → MISSING_GEO (info)", () => {
    const trip = mkTrip([
      mkDay(MONDAY_DATE, [mkEntry("a", { time: { start: "12:00" } })]), // brez geo
    ]);
    const view = buildGoView(trip, MONDAY, posAt(0.09), {});
    const reserve = evaluateTimeReserve({
      next: { time: { start: "12:00" } },
      geo: resolveStopGeo({}),
      position: posAt(0.09),
      now: MONDAY,
    });
    const conflicts = detectConflicts({ view, now: MONDAY, reserve, position: posAt(0.09) });
    const missing = conflicts.find((c) => c.kind === "MISSING_GEO");
    expect(missing?.severity).toBe("info");
    expect(missing?.actions).toContain("ADJUST_PLAN");
  });

  test("⑧ dan s termini BREZ nog in BREZ GPS → UNKNOWN_ROUTE (info)", () => {
    const trip = mkTrip([
      mkDay(MONDAY_DATE, [
        mkEntry("a", { ...STOP_GEO, time: { start: "10:00" } }),
        mkEntry("b", { lat: 46.6, lng: 14.1, time: { start: "12:00" } }),
      ]),
    ]);
    const view = buildGoView(trip, MONDAY, null, {});
    const reserve = evaluateTimeReserve({
      next: { time: { start: "10:00" } },
      geo,
      position: null,
      now: MONDAY,
    });
    const conflicts = detectConflicts({ view, now: MONDAY, reserve, position: null });
    expect(conflicts.find((c) => c.kind === "UNKNOWN_ROUTE")).toBeDefined();
    // Z GPS isti dan UNKNOWN_ROUTE NI (hevristika pokriva rezervo):
    const viewGps = buildGoView(trip, MONDAY, posAt(0.09), {});
    const reserveGps = evaluateTimeReserve({
      next: { time: { start: "10:00" } },
      geo,
      position: posAt(0.09),
      now: MONDAY,
    });
    const conflictsGps = detectConflicts({
      view: viewGps,
      now: MONDAY,
      reserve: reserveGps,
      position: posAt(0.09),
    });
    expect(conflictsGps.find((c) => c.kind === "UNKNOWN_ROUTE")).toBeUndefined();
  });

  test("⑨ zaprto ob predvidenem prihodu (CLOSED_ON_ARRIVAL iz openingStatusAt)", () => {
    // Ponedeljek 16:50 + 15 min vožnje → prihod ~17:05; vir odprt "Mo-Fr 09:00-17:00".
    const late = new Date(2026, 8, 21, 16, 50);
    const trip = mkTrip([
      mkDay(MONDAY_DATE, [
        mkEntry("a", { ...STOP_GEO, time: { start: "18:30" }, openingHours: "Mo-Fr 09:00-17:00" }),
      ]),
    ]);
    const view = buildGoView(trip, late, posAt(0.09), {});
    const reserve = evaluateTimeReserve({
      next: { time: { start: "18:30" }, openingHours: "Mo-Fr 09:00-17:00" },
      geo,
      position: posAt(0.09, { ageMs: 0 }),
      now: late,
    });
    // pozor: posAt veže timestamp na MONDAY — za late uro naredimo svež položaj
    const posLate = { ...posAt(0.09), timestamp: late.getTime() };
    const view2 = buildGoView(trip, late, posLate, {});
    const reserve2 = evaluateTimeReserve({
      next: { time: { start: "18:30" }, openingHours: "Mo-Fr 09:00-17:00" },
      geo,
      position: posLate,
      now: late,
    });
    expect(reserve2.eta?.hhmm).toBe("17:05");
    const conflicts = detectConflicts({ view: view2, now: late, reserve: reserve2, position: posLate });
    const closed = conflicts.find((c) => c.kind === "CLOSED_ON_ARRIVAL");
    expect(closed).toBeDefined();
    expect(closed?.severity).toBe("attention");
    expect(closed?.facts.sl).toContain("17:05");

    // Odprto ob prihodu → NI konflikta:
    const tripOpen = mkTrip([
      mkDay(MONDAY_DATE, [
        mkEntry("a", { ...STOP_GEO, time: { start: "18:30" }, openingHours: "Mo-Su 08:00-22:00" }),
      ]),
    ]);
    const viewOpen = buildGoView(tripOpen, late, posLate, {});
    const reserveOpen = evaluateTimeReserve({
      next: { time: { start: "18:30" }, openingHours: "Mo-Su 08:00-22:00" },
      geo,
      position: posLate,
      now: late,
    });
    const conflictsOpen = detectConflicts({ view: viewOpen, now: late, reserve: reserveOpen, position: posLate });
    expect(conflictsOpen.find((c) => c.kind === "CLOSED_ON_ARRIVAL")).toBeUndefined();
    void view; void reserve; void conflicts;
  });

  test("⑩ preklicana rezervacija: next → attention; remaining → warning (samo prikaz)", () => {
    const trip = mkTrip([
      mkDay(MONDAY_DATE, [
        mkEntry("a", {
          ...STOP_GEO,
          time: { start: "12:00" },
          provider: "prov",
          providerProductId: "pid1",
        }),
        mkEntry("b", {
          lat: 46.6,
          lng: 14.1,
          provider: "prov",
          providerProductId: "pid2",
        }),
      ]),
    ]);
    const view = buildGoView(trip, MONDAY, posAt(0.09), {});
    const reserve = evaluateTimeReserve({
      next: { time: { start: "12:00" } },
      geo,
      position: posAt(0.09),
      now: MONDAY,
    });
    const rows = [
      { key: "prov:pid1", status: "CANCELLED" },
      { key: "prov:pid2", status: "CANCELLED" },
    ];
    const conflicts = detectConflicts({
      view,
      now: MONDAY,
      reserve,
      bookingRows: rows,
      position: posAt(0.09),
    });
    const cancelled = conflicts.filter((c) => c.kind === "CANCELLED_BOOKING");
    expect(cancelled).toHaveLength(2);
    expect(cancelled.find((c) => c.stopKey === "a")?.severity).toBe("attention");
    expect(cancelled.find((c) => c.stopKey === "b")?.severity).toBe("warning");
  });

  test("⑪ čist dan (flexible + navigabilen geo + GPS) → NIČ konfliktov", () => {
    const trip = mkTrip([
      mkDay(MONDAY_DATE, [mkEntry("a", { ...STOP_GEO })]),
    ]);
    const view = buildGoView(trip, MONDAY, posAt(0.09), {});
    const reserve = evaluateTimeReserve({
      next: {},
      geo,
      position: posAt(0.09),
      now: MONDAY,
    });
    const conflicts = detectConflicts({ view, now: MONDAY, reserve, position: posAt(0.09) });
    expect(conflicts).toHaveLength(0);
  });

  test("⑫ vrstni red: attention pred warning pred info (stabilno)", () => {
    const trip = mkTrip([
      mkDay(MONDAY_DATE, [
        mkEntry("a", {
          ...STOP_GEO,
          time: { start: "10:10" },
          openingHours: "Mo-Fr 09:00-17:00",
          provider: "prov",
          providerProductId: "pid1",
        }),
      ]),
    ]);
    const view = buildGoView(trip, MONDAY, posAt(0.09), {});
    const reserve = evaluateTimeReserve({
      next: { time: { start: "10:10" }, openingHours: "Mo-Fr 09:00-17:00" },
      geo,
      position: posAt(0.09),
      now: MONDAY,
    });
    const conflicts = detectConflicts({
      view,
      now: MONDAY,
      reserve,
      bookingRows: [{ key: "prov:pid1", status: "CANCELLED" }],
      position: posAt(0.09),
    });
    expect(conflicts.length).toBeGreaterThan(1);
    for (let i = 1; i < conflicts.length; i++) {
      const order = { attention: 0, warning: 1, info: 2 } as const;
      expect(order[conflicts[i - 1].severity]).toBeLessThanOrEqual(
        order[conflicts[i].severity]
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 3 — TRIP HEALTH + buildGuardian (§4)
// ---------------------------------------------------------------------------

describe("ISSUE #22 §4: trip health — strojno izpeljana stanja", () => {
  const geo = resolveStopGeo({ ...STOP_GEO, provider: "fsq" });

  test("① ON_TRACK: fixed termin z izračunljivo rezervo (uporabniška imena §30.E)", () => {
    const trip = mkTrip([
      mkDay(MONDAY_DATE, [mkEntry("a", { ...STOP_GEO, time: { start: "12:00" } })]),
    ]);
    const snap = buildGuardian({
      view: buildGoView(trip, MONDAY, posAt(0.09), {}),
      now: MONDAY,
      position: posAt(0.09),
    });
    expect(snap?.health).toBe("ON_TRACK");
    expect(snap?.headline.sl).toContain("VSE TEČE PO NAČRTU");
    expect(snap?.detail.sl).toContain("12:00");
    expect(snap?.detail.sl).toContain("Rezerva 105 min");
    expect(snap?.topConflict).toBeNull();
  });

  test("② ON_TRACK: flexible postanek z navigabilnim geo (izvedljiv)", () => {
    const trip = mkTrip([
      mkDay(MONDAY_DATE, [mkEntry("a", { ...STOP_GEO })]),
    ]);
    const snap = buildGuardian({
      view: buildGoView(trip, MONDAY, null, {}),
      now: MONDAY,
      position: null,
    });
    expect(snap?.health).toBe("ON_TRACK");
    expect(snap?.detail.sl).toContain("brez fiksnega termina");
  });

  test("③ UNKNOWN: fixed termin BREZ GPS (pozitivnega statusa ni brez podatkov)", () => {
    const trip = mkTrip([
      mkDay(MONDAY_DATE, [mkEntry("a", { ...STOP_GEO, time: { start: "12:00" } })]),
    ]);
    const snap = buildGuardian({
      view: buildGoView(trip, MONDAY, null, {}),
      now: MONDAY,
      position: null,
    });
    expect(snap?.health).toBe("UNKNOWN");
    expect(snap?.headline.sl).toContain("PODATKOV NI DOVOLJ");
    // UNKNOWN_ROUTE konflikt (dan ima 1 termin → NE — ta zahteva ≥ 2)
    expect(snap?.conflicts).toHaveLength(0);
  });

  test("④ UNKNOWN: flexible postanek BREZ geo (izvedljivosti ne moremo oceniti)", () => {
    const trip = mkTrip([
      mkDay(MONDAY_DATE, [mkEntry("a")]), // brez lat/lng
    ]);
    const snap = buildGuardian({
      view: buildGoView(trip, MONDAY, null, {}),
      now: MONDAY,
      position: null,
    });
    expect(snap?.health).toBe("UNKNOWN");
    expect(snap?.detail.sl).toContain("lokacije");
    expect(snap?.conflicts.some((c) => c.kind === "MISSING_GEO")).toBe(true);
  });

  test("⑤ NEEDS_ATTENTION: zamujen termin (AT_RISK s številkami)", () => {
    const trip = mkTrip([
      mkDay(MONDAY_DATE, [mkEntry("a", { ...STOP_GEO, time: { start: "10:10" } })]),
    ]);
    const snap = buildGuardian({
      view: buildGoView(trip, MONDAY, posAt(0.09), {}),
      now: MONDAY,
      position: posAt(0.09),
    });
    expect(snap?.health).toBe("NEEDS_ATTENTION");
    expect(snap?.headline.sl).toContain("POTREBUJE TVOJO POZORNOST");
    expect(snap?.topConflict?.kind).toBe("AT_RISK_BOOKING");
  });

  test("⑥ BLOCKED: preklicana rezervacija na naslednjem postanku", () => {
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
    const snap = buildGuardian({
      view: buildGoView(trip, MONDAY, posAt(0.09), {}),
      now: MONDAY,
      position: posAt(0.09),
      bookingRows: [{ key: "prov:pid1", status: "CANCELLED" }],
    });
    expect(snap?.health).toBe("BLOCKED");
    expect(snap?.headline.sl).toContain("POTREBEN POSEG");
    expect(snap?.topConflict?.kind).toBe("CANCELLED_BOOKING");
  });

  test("⑦ dan brez odprtih postankov → buildGuardian vrne null (banner izpade)", () => {
    const trip = mkTrip([
      mkDay(MONDAY_DATE, [mkEntry("a", { ...STOP_GEO })]),
    ]);
    const view = buildGoView(trip, MONDAY, null, { a: new Date().toISOString() });
    const snap = buildGuardian({ view, now: MONDAY, position: null });
    expect(snap).toBeNull();
  });

  test("⑧ arrived: prisoten sem → ON_TRACK kljub temu, da je ETA 0", () => {
    const trip = mkTrip([
      mkDay(MONDAY_DATE, [mkEntry("a", { ...STOP_GEO, time: { start: "10:30" } })]),
    ]);
    const ctx = {
      key: "a",
      state: "arrived" as const,
      sinceMs: MONDAY.getTime() - 10_000,
    };
    const view = buildGoView(trip, MONDAY, POS_AT_STOP, {}, {
      arrivalContext: ctx,
    });
    expect(view.next?.travel?.status).toBe("arrived");
    const snap = buildGuardian({
      view,
      now: MONDAY,
      position: POS_AT_STOP,
    });
    expect(snap?.health).toBe("ON_TRACK");
    expect(snap?.reserve.eta?.min).toBe(0);
    expect(snap?.detail.sl).toContain("Rezerva 30 min");
  });
});

// ---------------------------------------------------------------------------
// 4 — INVARIANTE (§20 — reservation state je sveta乘inja; determinizem)
// ---------------------------------------------------------------------------

describe("ISSUE #22 §20: invariante Guardiana", () => {
  const geo = resolveStopGeo({ ...STOP_GEO, provider: "fsq" });

  test("① rezervacijske vrstice so SAMO branje (frozen — nobenega pisanja)", () => {
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
    const rows = Object.freeze([
      Object.freeze({ key: "prov:pid1", status: "CONFIRMED" }),
    ]);
    const view = buildGoView(trip, MONDAY, posAt(0.09), {});
    expect(() =>
      buildGuardian({ view, now: MONDAY, position: posAt(0.09), bookingRows: rows })
    ).not.toThrow();
    expect(rows[0].status).toBe("CONFIRMED"); // nedotaknjeno
  });

  test("② determinizem sestavnega korena (isti vhodi → isti izhod)", () => {
    const trip = mkTrip([
      mkDay(MONDAY_DATE, [
        mkEntry("a", { ...STOP_GEO, time: { start: "10:10" }, durationMin: 30 }),
        mkEntry("b", { lat: 46.6, lng: 14.1, time: { start: "12:00" } }),
      ]),
    ]);
    const input = {
      view: buildGoView(trip, MONDAY, posAt(0.09), {}),
      now: MONDAY,
      position: posAt(0.09),
      bookingRows: [{ key: "x:y", status: "PENDING" }],
    };
    expect(buildGuardian(input)).toEqual(buildGuardian(input));
  });

  test("③ assessTripHealth: pure projekcija (brez skritega stanja)", () => {
    const trip = mkTrip([
      mkDay(MONDAY_DATE, [mkEntry("a", { ...STOP_GEO, time: { start: "12:00" } })]),
    ]);
    const view = buildGoView(trip, MONDAY, posAt(0.09), {});
    const reserve = evaluateTimeReserve({
      next: { time: { start: "12:00" } },
      geo,
      position: posAt(0.09),
      now: MONDAY,
    });
    const conflicts = detectConflicts({
      view,
      now: MONDAY,
      reserve,
      position: posAt(0.09),
    });
    const a = assessTripHealth({ view, reserve, conflicts, arrived: false });
    const b = assessTripHealth({ view, reserve, conflicts, arrived: false });
    expect(a).toEqual(b);
    expect(a.health).toBe("ON_TRACK");
  });
});
