// ============================================================================
// TASK 102 — GO MODE DAILY OVERVIEW: SHEMA DNEVA + ZEMLJEVID DNEVA (1.160.0)
// ============================================================================
// Pokriva: čisti gradilnik zemljevida dneva (buildDayMapUrl — uradni Maps
// URL API z vmesnimi točkami; fail-closed po postanku, strop 10 točk, v URL
// SAMO številke — injekcijsko varno) in projekcijo SHEMA DNEVA + »NASLEDNJE
// PO TEM« skozi buildGoView (vrstni red načrta ohranjen; stanja so projekcija
// done/skipped/next; razdalja SAMO na trenutnem in SAMO z GPS paro;
// arrived SAMO stabilen — §7 kanon). isti DI fixtures kot task64 suite.
// ============================================================================

import { describe, expect, test } from "bun:test";

import type { MyTripDay, MyTripView, TripEntry } from "@/lib/journey/trip-view";
import { buildGoView } from "@/lib/journey/go-view";
import {
  buildDayMapUrl,
  DAY_MAP_MAX_STOPS,
  DAY_LINE_LABELS,
  type DayLineState,
} from "@/lib/journey/day-line";
import { DEFAULT_ARRIVAL_CONFIG } from "@/lib/journey/travel-state";

// ---------------------------------------------------------------------------
// Fixture gradniki (čisti — isti kanon kot task64-go-mode.test.ts)
// ---------------------------------------------------------------------------

function mkEntry(
  key: string,
  over: Partial<TripEntry> = {}
): TripEntry {
  return {
    key,
    category: "attractions",
    icon: "🏛️",
    title: `Postanek ${key}`,
    providerLabel: { sl: "FSQ OS Places", en: "FSQ OS Places" },
    status: "INFO",
    statusLabel: {
      sl: "Samo informacija — brez rezervacije",
      en: "Information only — no booking",
    },
    cancellation: {
      sl: "Ni rezervacije — nič za preklicati.",
      en: "No booking — nothing to cancel.",
    },
    bookingId: null,
    ...over,
  };
}

function mkDay(date: string | undefined, entries: TripEntry[]): MyTripDay {
  return {
    ...(date ? { date } : {}),
    dateLabel: date
      ? { sl: `${date} (sl)`, en: `${date} (en)` }
      : { sl: "Datum prihoda ni vnesen", en: "Arrival date not entered" },
    entries,
  };
}

function mkTrip(days: MyTripDay[]): MyTripView {
  return {
    title: { sl: "MOJA POT — Bled", en: "MY TRIP — Bled" },
    days,
    externalCards: [],
    confirmation: {
      confirmedCount: 0,
      note: { sl: "opomba", en: "note" },
    },
    generatedAt: "2026-10-01T00:00:00.000Z",
  };
}

/** Bled območje (realne koordinate, med seboj oddaljene za smiselne teste). */
const BLED = { lat: 46.3683, lng: 14.1146 };
const VOGEL = { lat: 46.3378, lng: 13.9165 };
const LJUBLJANA = { lat: 46.0569, lng: 14.5058 };

// ---------------------------------------------------------------------------
// buildDayMapUrl — ZEMLJEVID DNEVA (zunanji handoff celotnega dneva)
// ---------------------------------------------------------------------------

describe("TASK 102: buildDayMapUrl — fail-closed po postanku", () => {
  test("① prazna lista / ena točka → null (ena točka ni »dan na zemljevidu«)", () => {
    expect(buildDayMapUrl([])).toBeNull();
    expect(buildDayMapUrl([BLED])).toBeNull();
  });

  test("② vse brez geo / neveljavne → null (NE izmišljujemo ciljev)", () => {
    expect(buildDayMapUrl([{}, {}])).toBeNull();
    expect(
      buildDayMapUrl([
        { lat: Number.NaN, lng: 14.1 },
        { lat: 999, lng: 14.1 }, // izven razpona
        { lat: 46.1, lng: Number.POSITIVE_INFINITY },
      ])
    ).toBeNull();
  });

  test("③ dve točki → destination = ZADNJI, waypoint = PRVI (sidra začetek poti)", () => {
    const url = buildDayMapUrl([BLED, VOGEL]);
    expect(url).toBeString();
    expect(url).toContain(
      `destination=${VOGEL.lat.toFixed(6)},${VOGEL.lng.toFixed(6)}`
    );
    // PRVI postanek je vmesna točka — Maps vodi [trenutna lokacija] → prvi → zadnji
    expect(url).toContain(
      `waypoints=${BLED.lat.toFixed(6)},${BLED.lng.toFixed(6)}`
    );
    expect(url).not.toContain("origin=");
    expect(url).toStartWith("https://www.google.com/maps/dir/?api=1&");
  });

  test("④ tri+ točke → waypoints po VRSTNEM REDU načrta, zadnji = cilj", () => {
    const url = buildDayMapUrl([LJUBLJANA, BLED, VOGEL]);
    expect(url).toContain(
      `waypoints=${LJUBLJANA.lat.toFixed(6)},${LJUBLJANA.lng.toFixed(6)}` +
        `|${BLED.lat.toFixed(6)},${BLED.lng.toFixed(6)}`
    );
    expect(url).toContain(
      `destination=${VOGEL.lat.toFixed(6)},${VOGEL.lng.toFixed(6)}`
    );
  });

  test("⑤ mešano veljavne/neveljavne → neveljavne se IZPUSTJO (par ne sesuje dneva)", () => {
    const url = buildDayMapUrl([
      { lat: 999, lng: 0 }, // neveljavna — izpust
      BLED,
      {}, // brez geo — izpust
      VOGEL,
    ]);
    expect(url).toBeString();
    // 2 veljavni → prvi = waypoint (sidra začetek), zadnji = cilj
    expect(url).toContain(`waypoints=${BLED.lat.toFixed(6)},${BLED.lng.toFixed(6)}`);
    expect(url).toContain(`destination=${VOGEL.lat.toFixed(6)},${VOGEL.lng.toFixed(6)}`);
    expect(url).not.toContain(`|`); // samo ENA vmesna točka
  });

  test("⑥ čez 10 veljavnih → PRVIH 10 po vrstnem redu (uradna meja, iskerno)", () => {
    const stops = Array.from({ length: 14 }, (_, i) => ({
      lat: 45.5 + i * 0.01,
      lng: 14.0 + i * 0.01,
    }));
    const url = buildDayMapUrl(stops);
    expect(url).toBeString();
    // 10. točka (indeks 9) je še destination; 11. (indeks 10) NE sme nastopiti.
    expect(url).toContain(`destination=${stops[9].lat.toFixed(6)}`);
    expect(url).not.toContain(`${stops[10].lat.toFixed(6)}`);
  });

  test("⑦ živi GPS origin → prenese se (isti pomen kot go-nav buildWebNavUrl)", () => {
    const url = buildDayMapUrl([BLED, VOGEL], LJUBLJANA);
    expect(url).toContain(
      `origin=${LJUBLJANA.lat.toFixed(6)},${LJUBLJANA.lng.toFixed(6)}`
    );
  });

  test("⑧ neveljaven origin → IZPUSTI se (ne gradimo smeti v URL)", () => {
    const url = buildDayMapUrl([BLED, VOGEL], { lat: 999, lng: 0 });
    expect(url).not.toContain("origin=");
  });

  test("⑨ URL nosi SAMO številke — 0 besedila (injekcijska varnost)", () => {
    const url = buildDayMapUrl([BLED, VOGEL], LJUBLJANA);
    expect(url).not.toContain("<");
    expect(url).not.toContain("%22"); // enkodiran narekovaj
    // fiksnih 6 mest — 0 eksponentov (znanstvena notacija bi razbila parser)
    expect(url).not.toMatch(/e[+-]?\d/i);
  });

  test("⑩ DAY_MAP_MAX_STOPS je 10 (uradna meja Maps URL API)", () => {
    expect(DAY_MAP_MAX_STOPS).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// buildGoView — SHEMA DNEVA (line) + NASLEDNJE PO TEM (nextAfter)
// ---------------------------------------------------------------------------

describe("TASK 102: buildGoView.line — cel dan po vrstnem redu načrta", () => {
  const day = mkDay("2026-10-01", [
    mkEntry("a", { title: "Pirani", lat: BLED.lat, lng: BLED.lng }),
    mkEntry("b", { title: "Vogel", lat: VOGEL.lat, lng: VOGEL.lng }),
    mkEntry("c", { title: "Ljubljana", lat: LJUBLJANA.lat, lng: LJUBLJANA.lng }),
    mkEntry("d", { title: "Bled", lat: BLED.lat, lng: BLED.lng }),
  ]);
  const trip = mkTrip([day]);
  const now = new Date("2026-10-01T10:00:00");

  test("① vrstni red načrta je OHRANJEN (a→d) ne glede na stanja", () => {
    const view = buildGoView(
      trip,
      now,
      null,
      { a: "2026-10-01T08:00:00.000Z" }, // a opravljen
      { skipped: { c: "2026-10-01T09:00:00.000Z" } } // c preskočen
    );
    expect(view.line.map((i) => i.key)).toEqual(["a", "b", "c", "d"]);
  });

  test("② stanja so projekcija done/skipped/next (b = trenutni, d = prihodnji)", () => {
    const view = buildGoView(
      trip,
      now,
      null,
      { a: "2026-10-01T08:00:00.000Z" },
      { skipped: { c: "2026-10-01T09:00:00.000Z" } }
    );
    const states = Object.fromEntries(view.line.map((i) => [i.key, i.state]));
    expect(states).toEqual({
      a: "done",
      b: "current",
      c: "skipped",
      d: "upcoming",
    });
  });

  test("③ geo se prenese na elemente (za zunanji zemljevid dneva)", () => {
    const view = buildGoView(trip, now, null, {}, {});
    const b = view.line.find((i) => i.key === "b");
    expect(b?.lat).toBe(VOGEL.lat);
    expect(b?.lng).toBe(VOGEL.lng);
  });

  test("④ razdalja SAMO na trenutnem in SAMO z živim GPS paro", () => {
    // brez GPS → brez razdalje (iskrena odsotnost)
    const noGps = buildGoView(trip, now, null, {}, {});
    expect(noGps.line.every((i) => i.distanceM == null)).toBeTrue();

    // z GPS daleč od vseh → razdalja je, a samo na trenutnem
    const withGps = buildGoView(
      trip,
      now,
      { lat: 45.5, lng: 14.0, timestamp: now.getTime() },
      {},
      {}
    );
    const current = withGps.line.find((i) => i.state === "current");
    const others = withGps.line.filter((i) => i.state !== "current");
    expect(current?.distanceM).toBeNumber();
    expect(others.every((i) => i.distanceM == null)).toBeTrue();
  });

  test("⑤ arrived SAMO stabilen (geofence + min. čas §7) — sicer current", () => {
    const positionAt = (m: number) => ({
      lat: BLED.lat + m * 0.00001, // ~1.1 m na enoto
      lng: BLED.lng,
      accuracyM: 20,
      timestamp: now.getTime(),
    });
    // prva fiksacija znotraj radija → še NI stabilna (minStableMs 8 s)
    const t0 = now.getTime();
    const first = buildGoView(trip, now, positionAt(5), {}, {});
    expect(first.line.find((i) => i.key === "a")?.state).toBe("current");

    // nadaljevanje z ISTIM kontekstom čez > minStableMs → arrived
    const later = new Date(t0 + DEFAULT_ARRIVAL_CONFIG.minStableMs + 1_000);
    const second = buildGoView(trip, later, positionAt(5), {}, {
      arrivalContext: first.arrivalContext,
    });
    expect(second.line.find((i) => i.key === "a")?.state).toBe("arrived");
  });

  test("⑥ prazen dan → line = [] (komponenta se ne rendra)", () => {
    const view = buildGoView(mkTrip([mkDay("2026-10-01", [])]), now, null, {}, {});
    expect(view.line).toEqual([]);
  });

  test("⑦ vsi opravljeni → brez current (iskrena odsotnost)", () => {
    const view = buildGoView(
      trip,
      now,
      null,
      {
        a: "2026-10-01T08:00:00.000Z",
        b: "2026-10-01T09:00:00.000Z",
        c: "2026-10-01T09:30:00.000Z",
        d: "2026-10-01T09:45:00.000Z",
      },
      {}
    );
    expect(view.line.every((i) => i.state === "done")).toBeTrue();
    expect(view.nextAfter).toBeUndefined();
  });
});

describe("TASK 102: buildGoView.nextAfter — »NASLEDNJE PO TEM« (§10/§12)", () => {
  const day = mkDay("2026-10-01", [
    mkEntry("a", { title: "Pirani" }),
    mkEntry("b", { title: "Vogel", time: { start: "19:30" } }),
    mkEntry("c", { title: "Ljubljana" }),
  ]);
  const trip = mkTrip([day]);
  const now = new Date("2026-10-01T10:00:00");

  test("① brez opravljenih → nextAfter = DRUGI postanek (prvi je naslednji)", () => {
    const view = buildGoView(trip, now, null, {}, {});
    expect(view.nextAfter?.entry.key).toBe("b");
    expect(view.nextAfter?.entry.time?.start).toBe("19:30");
  });

  test("② po opravljenem prvem → nextAfter se premakne na tretjega", () => {
    const view = buildGoView(
      trip,
      now,
      null,
      { a: "2026-10-01T09:00:00.000Z" },
      {}
    );
    expect(view.next?.entry.key).toBe("b");
    expect(view.nextAfter?.entry.key).toBe("c");
  });

  test("③ preskočen NE more biti nextAfter (izpadel iz toka §5)", () => {
    const view = buildGoView(
      trip,
      now,
      null,
      { a: "2026-10-01T09:00:00.000Z" },
      { skipped: { b: "2026-10-01T09:10:00.000Z" } }
    );
    expect(view.next?.entry.key).toBe("c");
    expect(view.nextAfter).toBeUndefined(); // c je zadnji
  });

  test("④ zadnji postanek kot naslednji → nextAfter ni (iskrena odsotnost)", () => {
    const twoDay = mkTrip([
      mkDay("2026-10-01", [mkEntry("x"), mkEntry("y")]),
    ]);
    const view = buildGoView(twoDay, now, null, { x: "2026-10-01T08:00:00.000Z" }, {});
    expect(view.next?.entry.key).toBe("y");
    expect(view.nextAfter).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Oznake (L vzorec — dvojezične, izvožene za UI)
// ---------------------------------------------------------------------------

describe("TASK 102: DAY_LINE_LABELS — dvojezične oznake stanj", () => {
  test("① vsa stanja imajo sl+en oznaki (a11y: sr-only objave)", () => {
    const states: DayLineState[] = [
      "done",
      "skipped",
      "current",
      "arrived",
      "upcoming",
    ];
    for (const s of states) {
      expect(DAY_LINE_LABELS.state[s].sl).toBeString();
      expect(DAY_LINE_LABELS.state[s].en).toBeString();
    }
  });
});
