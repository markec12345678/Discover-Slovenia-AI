// ============================================================================
// ISSUE #22 — TRAVEL GUARDIAN: SMART FREE-TIME (§9 + §10 + §11) — testi
// ============================================================================
// Pokriva (čisto, 0 omrežja):
//  §9  okno: fixed termin v prihodnosti, AT_STOP_EARLY (prisoten zgodaj) in
//      BEFORE_DRIVE (ocena vožnje odšeta), brez termina NI okna, prekratko
//      → NI okna, termin teče → NI okna;
//  §10 varnostna rezerva: base + 10 % je VEDNO odšteta (uporabniku ponujeno
//      okno < surovo okno), neznan route time (brez GPS) → okna NI,
//      konfigurabilnost;
//  §9  kandidati: celotna ZANKA (tja + obisk + do termina) ≤ okno, W8
//      izvzem današnje postanke, radij, kategorije, zaprto ob prihodu →
//      izpade, urejenost po zanki, max 4;
//  §11 nearbyBbox oblika.
// ============================================================================

import { describe, expect, test } from "bun:test";

import type { MyTripDay, MyTripView, TripEntry } from "@/lib/journey/trip-view";
import { buildGoView } from "@/lib/journey/go-view";
import {
  detectFreeTimeWindow,
  filterNearbyCandidates,
  nearbyBbox,
  DEFAULT_FREE_TIME_CONFIG,
  NEARBY_CATEGORY_OF,
  type NearbyCandidate,
} from "@/lib/journey/free-time";

// ---------------------------------------------------------------------------
// Fixture
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
/** ~10 km od cilja → hevristika 15 min. */
const POS = { lat: 46.41, lng: 14.0, timestamp: MONDAY.getTime() };

// ---------------------------------------------------------------------------
// 1 — OKNO (§9 + §10)
// ---------------------------------------------------------------------------

describe("ISSUE #22 §9/§10: prostotno okno — prepoznavanje", () => {
  test("① BEFORE_DRIVE: termin 12:00, vožnja 15 min → surovo 105, rezerva odšteta", () => {
    const trip = mkTrip([
      {
        date: MONDAY_DATE,
        dateLabel: { sl: MONDAY_DATE, en: MONDAY_DATE },
        entries: [mkEntry("a", { ...STOP_GEO, time: { start: "12:00" } })],
      },
    ]);
    const view = buildGoView(trip, MONDAY, POS, {});
    const w = detectFreeTimeWindow({ view, now: MONDAY, position: POS });
    expect(w).not.toBeNull();
    expect(w?.kind).toBe("BEFORE_DRIVE");
    expect(w?.rawMin).toBe(105); // 120 − 15 (vožnja)
    // rezerva = 15 + 10 % × 105 = 26 → uporabniku 79
    expect(w?.safetyMin).toBe(26);
    expect(w?.minutes).toBe(79);
    expect(w?.quality).toBe("ESTIMATED");
    expect(w?.endsAtHhmm).toBe("12:00");
  });

  test("② AT_STOP_EARLY: prisoten + termin 11:00 → okno na lokaciji (VERIFIED)", () => {
    const trip = mkTrip([
      {
        date: MONDAY_DATE,
        dateLabel: { sl: MONDAY_DATE, en: MONDAY_DATE },
        entries: [mkEntry("a", { ...STOP_GEO, time: { start: "11:00" } })],
      },
    ]);
    const view = buildGoView(trip, MONDAY, POS, {});
    const w = detectFreeTimeWindow({
      view,
      now: MONDAY,
      position: POS,
      arrived: true,
    });
    expect(w?.kind).toBe("AT_STOP_EARLY");
    expect(w?.rawMin).toBe(60);
    expect(w?.safetyMin).toBe(21); // 15 + 10 % × 60
    expect(w?.minutes).toBe(39);
    expect(w?.quality).toBe("VERIFIED");
  });

  test("③ BREZ fiksnega termina → okna NI (meje ni — ne izmišljujemo)", () => {
    const trip = mkTrip([
      {
        date: MONDAY_DATE,
        dateLabel: { sl: MONDAY_DATE, en: MONDAY_DATE },
        entries: [mkEntry("a", STOP_GEO)],
      },
    ]);
    const view = buildGoView(trip, MONDAY, POS, {});
    expect(detectFreeTimeWindow({ view, now: MONDAY, position: POS })).toBeNull();
  });

  test("④ brez GPS (in nisi prisoten) → okna NI (neznan route time — §10)", () => {
    const trip = mkTrip([
      {
        date: MONDAY_DATE,
        dateLabel: { sl: MONDAY_DATE, en: MONDAY_DATE },
        entries: [mkEntry("a", { ...STOP_GEO, time: { start: "14:00" } })],
      },
    ]);
    const view = buildGoView(trip, MONDAY, null, {});
    expect(detectFreeTimeWindow({ view, now: MONDAY, position: null })).toBeNull();
  });

  test("⑤ prekratko okno (rezerva pojé vse) → NI okna", () => {
    const trip = mkTrip([
      {
        date: MONDAY_DATE,
        dateLabel: { sl: MONDAY_DATE, en: MONDAY_DATE },
        entries: [mkEntry("a", { ...STOP_GEO, time: { start: "11:20" } })],
      },
    ]);
    const view = buildGoView(trip, MONDAY, POS, {});
    // surovo = 80 − 15 = 65; rezerva = 15 + 7 = 22; uporabno = 43 ≥ 30 → JE okno
    // (preverimo mejo: termin 11:05 → surovo 50 − rezerva 20 = 30 → ravno meja)
    const wA = detectFreeTimeWindow({ view, now: MONDAY, position: POS });
    expect(wA?.minutes).toBe(43);

    const tripB = mkTrip([
      {
        date: MONDAY_DATE,
        dateLabel: { sl: MONDAY_DATE, en: MONDAY_DATE },
        entries: [mkEntry("a", { ...STOP_GEO, time: { start: "11:04" } })],
      },
    ]);
    const viewB = buildGoView(tripB, MONDAY, POS, {});
    // surovo = 64 − 15 = 49; rezerva = 15 + 5 = 20; uporabno = 29 < 30 → NI okna
    expect(detectFreeTimeWindow({ view: viewB, now: MONDAY, position: POS })).toBeNull();
  });

  test("⑥ termin že teče/pretekel → NI okna", () => {
    const trip = mkTrip([
      {
        date: MONDAY_DATE,
        dateLabel: { sl: MONDAY_DATE, en: MONDAY_DATE },
        entries: [mkEntry("a", { ...STOP_GEO, time: { start: "09:30" } })],
      },
    ]);
    const view = buildGoView(trip, MONDAY, POS, {});
    expect(detectFreeTimeWindow({ view, now: MONDAY, position: POS })).toBeNull();
  });

  test("⑦ konfiguracija rezerve se spoštuje (0 % + 5 min base)", () => {
    const trip = mkTrip([
      {
        date: MONDAY_DATE,
        dateLabel: { sl: MONDAY_DATE, en: MONDAY_DATE },
        entries: [mkEntry("a", { ...STOP_GEO, time: { start: "12:00" } })],
      },
    ]);
    const view = buildGoView(trip, MONDAY, POS, {});
    const w = detectFreeTimeWindow({
      view,
      now: MONDAY,
      position: POS,
      config: { ...DEFAULT_FREE_TIME_CONFIG, safetyBaseMin: 5, safetyRatio: 0 },
    });
    expect(w?.safetyMin).toBe(5);
    expect(w?.minutes).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// 2 — FILTRIRANJE KANDIDATOV (§9 + §11)
// ---------------------------------------------------------------------------

describe("ISSUE #22 §9/§11: nearby kandidati — varnostna vrata", () => {
  const now = MONDAY;
  const window = {
    minutes: 79,
    endsAtHhmm: "12:00",
    safetyMin: 26,
    rawMin: 105,
    kind: "BEFORE_DRIVE" as const,
    quality: "ESTIMATED" as const,
  };
  /** Kandidat ~3 km vzhodno (dLat 0) — hevristika tja 5 min. */
  const mkCand = (
    key: string,
    over: Partial<NearbyCandidate> = {}
  ): NearbyCandidate => ({
    key,
    title: `Kandidat ${key}`,
    lat: 46.5,
    lng: 14.05,
    category: "sight",
    ...over,
  });

  test("① spravi se v zanko → predlagan; predolg obisk → izpade", () => {
    const fits = filterNearbyCandidates({
      candidates: [
        mkCand("ok"), // sight: 5 tja + 45 obisk + 5 nazaj = 55 ≤ 79
        mkCand("long", { durationMin: 90 }), // 5 + 90 + 5 = 100 > 79
      ],
      position: { lat: 46.5, lng: 14.0 },
      window,
      now,
      exclude: [],
      nextStop: { lat: 46.5, lng: 14.0 },
    });
    expect(fits.map((f) => f.candidate.key)).toEqual(["ok"]);
    expect(fits[0].loopMin).toBe(55);
    expect(fits[0].driveThereMin).toBe(5);
    expect(fits[0].visitMin).toBe(45);
    expect(fits[0].driveBackMin).toBe(5);
  });

  test("② W8: današnji postanek (~100 m) se NE ponudi kot odkritje", () => {
    const fits = filterNearbyCandidates({
      candidates: [mkCand("today", { lat: 46.5001, lng: 14.0001 })],
      position: { lat: 46.5, lng: 14.0 },
      window,
      now,
      exclude: [{ lat: 46.5, lng: 14.0 }],
      nextStop: { lat: 46.5, lng: 14.0 },
    });
    expect(fits).toHaveLength(0);
  });

  test("③ radij: kandidat čez searchRadiusKm izpade (6 km > 5)", () => {
    const fits = filterNearbyCandidates({
      candidates: [mkCand("far", { lat: 46.55, lng: 14.05 })], // ~6.7 km
      position: { lat: 46.5, lng: 14.0 },
      window,
      now,
      exclude: [],
      nextStop: { lat: 46.5, lng: 14.0 },
    });
    expect(fits).toHaveLength(0);
  });

  test("④ zaprto ob prihodu → izpade; odprto → prikaže OPEN; brez ur → UNKNOWN", () => {
    const fits = filterNearbyCandidates({
      candidates: [
        mkCand("closed", { openingHours: "Mo-Fr 09:00-09:30" }), // prihod ~10:05 → ZAPRTO
        mkCand("open", { openingHours: "Mo-Su 08:00-20:00" }),
        mkCand("nohours"),
      ],
      position: { lat: 46.5, lng: 14.0 },
      window,
      now,
      exclude: [],
      nextStop: { lat: 46.5, lng: 14.0 },
    });
    const keys = fits.map((f) => f.candidate.key);
    expect(keys).toContain("open");
    expect(keys).toContain("nohours");
    expect(keys).not.toContain("closed");
    expect(fits.find((f) => f.candidate.key === "open")?.opening).toBe("OPEN");
    expect(fits.find((f) => f.candidate.key === "nohours")?.opening).toBe("UNKNOWN");
  });

  test("⑤ kategorije: filter uporabnika (food) + AT_STOP_EARLY brez povratka", () => {
    const food = mkCand("restavracija", { category: "food" }); // 5 + 60 + 0 = 65 ≤ 79
    const drink = mkCand("kavarna", { category: "drink" });
    const atStop = { ...window, kind: "AT_STOP_EARLY" as const };
    const fits = filterNearbyCandidates({
      candidates: [food, drink],
      position: { lat: 46.5, lng: 14.0 },
      window: atStop,
      now,
      exclude: [],
      nextStop: { lat: 46.5, lng: 14.0 },
      category: "food",
    });
    expect(fits.map((f) => f.candidate.key)).toEqual(["restavracija"]);
    expect(fits[0].driveBackMin).toBe(0); // tam že sem
  });

  test("⑥ ureditev po zanki + max 4 kandidatov", () => {
    const cands = [
      mkCand("d1", { lng: 14.02, durationMin: 30 }),
      mkCand("a0", { lng: 14.008, durationMin: 20 }),
      mkCand("b1", { lng: 14.01 }),
      mkCand("c1", { lng: 14.03 }),
      mkCand("e1", { lng: 14.04 }),
      mkCand("f1", { lng: 14.045 }),
    ];
    const fits = filterNearbyCandidates({
      candidates: cands,
      position: { lat: 46.5, lng: 14.0 },
      window: { ...window, minutes: 200, rawMin: 260, safetyMin: 41 },
      now,
      exclude: [],
      nextStop: { lat: 46.5, lng: 14.0 },
    });
    expect(fits.length).toBeLessThanOrEqual(4);
    const loops = fits.map((f) => f.loopMin);
    const sorted = [...loops].sort((a, b) => a - b);
    expect(sorted).toEqual(loops); // urejeni naraščajoče po zanki
    expect(fits.length).toBe(4);
  });

  test("⑦ NEARBY_CATEGORY_OF preslikava iz ProductType", () => {
    expect(NEARBY_CATEGORY_OF.museum).toBe("sight");
    expect(NEARBY_CATEGORY_OF.restaurant).toBe("food");
    expect(NEARBY_CATEGORY_OF.shop).toBe("drink");
    expect(NEARBY_CATEGORY_OF.natural).toBe("walk");
    expect(NEARBY_CATEGORY_OF.flight).toBeUndefined(); // nezanimivi tipi
  });
});

// ---------------------------------------------------------------------------
// 3 — BBOX (za /api/map/pins)
// ---------------------------------------------------------------------------

describe("ISSUE #22 §11: nearbyBbox — oblika za API", () => {
  test("① bbox okoli pozicije z radijem (s,w,n,e — naraščajoče)", () => {
    const bbox = nearbyBbox({ lat: 46.5, lng: 14.0 }, 5);
    const [s, w, n, e] = bbox.split(",").map(Number);
    expect(s).toBeLessThan(46.5);
    expect(n).toBeGreaterThan(46.5);
    expect(w).toBeLessThan(14.0);
    expect(e).toBeGreaterThan(14.0);
    // lat razpon ~5/111 ≈ 0.045
    expect(n - s).toBeCloseTo(0.09, 2); // ±0.045
  });
});
