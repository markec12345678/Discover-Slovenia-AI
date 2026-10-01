// ============================================================================
// ISSUE #23 — GUIDANCE ENGINE: unit testi (jedro, 1.163.0)
// ============================================================================
// Pokriva (issue §37 Unit): intent→guidance, state→guidance, prioriteto,
// razpoložljivost akcij (fail-closed), dismissibility, determinizem,
// first-run / returning / trip-ready / active-trip / unknown stanja,
// konfliktne kandidate. Čisto jedro — 0 I/O, 0 DOM.
// ============================================================================

import { describe, expect, test } from "bun:test";
import { selectGuidance } from "@/lib/guidance/guide-engine";
import type { GuidanceInput } from "@/lib/guidance/types";

// ---------------------------------------------------------------------------
// Tovarne vhodov (manj šuma)
// ---------------------------------------------------------------------------

function input(partial: Partial<GuidanceInput> = {}): GuidanceInput {
  return {
    surface: "home",
    firstSession: true,
    returningUser: false,
    myTripCount: 0,
    savedTripsCount: 0,
    go: null,
    live: null,
    ...partial,
  };
}

function goFacts(partial: Partial<NonNullable<GuidanceInput["go"]>> = {}) {
  return {
    active: true,
    remainingToday: 2,
    doneToday: 1,
    skippedToday: 0,
    laterDayStops: 0,
    nextStopTitle: "Blejski grad",
    nextStopGeoKnown: true,
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// PREJ-POT stanja
// ---------------------------------------------------------------------------

describe("ISSUE #23 guidance engine — prej-pot stanja", () => {
  test("① prva seja + prazna zbirka → NEW_USER (prioriteta 5, korak discover)", () => {
    const g = selectGuidance(input({ firstSession: true }));
    expect(g.state).toBe("NEW_USER");
    expect(g.priority).toBe(5);
    expect(g.chain.current).toBe("discover");
    expect(g.chain.index).toBe(1);
    expect(g.primaryAction?.id).toBe("discover");
    expect(g.dismissible).toBe(true);
  });

  test("② vračajoči + prazna zbirka → DISCOVERING (ne NEW_USER — §19)", () => {
    const g = selectGuidance(input({ firstSession: false, returningUser: true }));
    expect(g.state).toBe("DISCOVERING");
    expect(g.priority).toBe(10);
    expect(g.messageKey).toBe("discovering");
  });

  test("③ zbirka 1+ predmetov → TRIP_BUILDING, primarna akcija načrtuj", () => {
    const g = selectGuidance(input({ myTripCount: 3 }));
    expect(g.state).toBe("TRIP_BUILDING");
    expect(g.primaryAction?.id).toBe("plan");
    expect(g.primaryAction?.href).toBe("/nacrtuj");
    expect(g.facts.myTripCount).toBe(3);
    expect(g.chain.current).toBe("plan");
  });

  test("④ shranjen načrt → TRIP_READY, primarna ZAČNI (sekundarna REZERVIRAJ — §10)", () => {
    const g = selectGuidance(input({ myTripCount: 3, savedTripsCount: 1 }));
    expect(g.state).toBe("TRIP_READY");
    expect(g.primaryAction?.id).toBe("start_trip");
    expect(g.secondaryActions.map((a) => a.id)).toEqual(["book"]);
    expect(g.chain.current).toBe("book");
    expect(g.priority).toBe(30);
  });

  test("⑤ BOOKING_PENDING ZAHTEVA dejanski podatek — brez živega konteksta GA NE izrečemo (§30/§31)", () => {
    const a = selectGuidance(input({ savedTripsCount: 1 }));
    expect(a.state).toBe("TRIP_READY"); // NE BOOKING_PENDING
    const b = selectGuidance(input({ savedTripsCount: 1, live: { hasOpenBookings: true } }));
    expect(b.state).toBe("BOOKING_PENDING");
    expect(b.primaryAction?.id).toBe("book");
    expect(b.priority).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// SREDI-POT stanja (Go Mode aktiven)
// ---------------------------------------------------------------------------

describe("ISSUE #23 guidance engine — sredi-pot stanja", () => {
  test("⑥ aktiven Go Mode brez živega konteksta → iskreno TRIP_STARTED z imenom cilja", () => {
    const g = selectGuidance(input({ go: goFacts() }));
    expect(g.state).toBe("TRIP_STARTED");
    expect(g.primaryAction?.id).toBe("go_mode");
    expect(g.primaryAction?.href).toBe("/na-poti");
    expect(g.messageKey).toBe("started");
    expect(g.facts.nextStopTitle).toBe("Blejski grad");
    expect(g.chain.current).toBe("go");
    expect(g.priority).toBe(40);
  });

  test("⑦ konec dneva z nadaljnjimi dnevi → startedNextDay sporočilo (NI COMPLETED — danes ni vse)", () => {
    const g = selectGuidance(
      input({ go: goFacts({ remainingToday: 0, doneToday: 2, laterDayStops: 3, nextStopTitle: null }) }),
    );
    expect(g.state).toBe("TRIP_STARTED");
    expect(g.messageKey).toBe("startedNextDay");
    expect(g.facts.laterDayStops).toBe(3);
  });

  test("⑧ zadnji dan, 0 preostalih, 1+ obdelanih → COMPLETED (terminalno stanje)", () => {
    const g = selectGuidance(
      input({ go: goFacts({ remainingToday: 0, doneToday: 4, skippedToday: 1, laterDayStops: 0, nextStopTitle: null }) }),
    );
    expect(g.state).toBe("COMPLETED");
    expect(g.primaryAction?.id).toBe("new_trip");
    expect(g.secondaryActions.map((a) => a.id)).toEqual(["open_trips"]);
    expect(g.chain.current).toBe("finish");
    expect(g.chain.index).toBe(5);
    expect(g.priority).toBe(45);
  });

  test("⑨ prazen zadnji dan BREZ obdelanih postankov NI COMPLETED (0/0 dvoumnost → TRIP_STARTED)", () => {
    const g = selectGuidance(
      input({ go: goFacts({ remainingToday: 0, doneToday: 0, skippedToday: 0, laterDayStops: 0 }) }),
    );
    expect(g.state).toBe("TRIP_STARTED");
  });

  test("⑩ živi kontekst: BLOCKED > NEEDS_ATTENTION > ARRIVED > NAVIGATING > FREE_TIME (§32)", () => {
    const blocked = selectGuidance(input({ go: goFacts(), live: { health: "BLOCKED" } }));
    expect(blocked.state).toBe("BLOCKED");
    expect(blocked.priority).toBe(100);
    expect(blocked.dismissible).toBe(false); // §40.20 kritično NI dismissible
    expect(blocked.primaryAction?.id).toBe("recovery");

    const attn = selectGuidance(
      input({ go: goFacts(), live: { health: "NEEDS_ATTENTION", hasConflicts: true } }),
    );
    expect(attn.state).toBe("NEEDS_ATTENTION");
    expect(attn.priority).toBe(90);
    expect(attn.dismissible).toBe(false);

    const arrived = selectGuidance(input({ go: goFacts(), live: { arrivalState: "arrived" } }));
    expect(arrived.state).toBe("ARRIVED");
    expect(arrived.priority).toBe(80);
    expect(arrived.dismissible).toBe(false);
    expect(arrived.primaryAction?.href).toBe("/na-poti#naslednje");

    const nav = selectGuidance(input({ go: goFacts(), live: { arrivalState: "approaching" } }));
    expect(nav.state).toBe("NAVIGATING");
    expect(nav.priority).toBe(70);

    const free = selectGuidance(input({ go: goFacts(), live: { freeTimeMinutes: 45 } }));
    expect(free.state).toBe("FREE_TIME");
    expect(free.facts.freeTimeMinutes).toBe(45);
    expect(free.priority).toBe(50);
  });

  test("⑪ konflikt brez HEALTH oznake → NEEDS_ATTENTION (hasConflicts zadostuje)", () => {
    const g = selectGuidance(input({ go: goFacts(), live: { hasConflicts: true } }));
    expect(g.state).toBe("NEEDS_ATTENTION");
  });

  test("⑫ kratek prosti čas (< 15 min) NI FREE_TIME stanje (iskrena meja #22)", () => {
    const g = selectGuidance(input({ go: goFacts(), live: { freeTimeMinutes: 8 } }));
    expect(g.state).toBe("TRIP_STARTED");
  });

  test("⑬ RECOVERY: odprt recovery foldout → stanje obnove (nedismissible, §40.20)", () => {
    const g = selectGuidance(input({ go: goFacts(), live: { recoveryActive: true } }));
    expect(g.state).toBe("RECOVERY");
    expect(g.priority).toBe(60);
    expect(g.dismissible).toBe(false);
  });

  test("⑭ GPS uncertain NI arrival — ostane TRIP_STARTED (iskre­nost #21)", () => {
    const g = selectGuidance(input({ go: goFacts(), live: { arrivalState: "uncertain" } }));
    expect(g.state).toBe("TRIP_STARTED");
  });
});

// ---------------------------------------------------------------------------
// UNKNOWN + determinizem + invariante
// ---------------------------------------------------------------------------

describe("ISSUE #23 guidance engine — invariante", () => {
  test("⑮ dataQuality unknown → UNKNOWN brez primarne akcije (§30 — brez izmišljanja)", () => {
    const g = selectGuidance(input({ live: { dataQuality: "unknown" } }));
    expect(g.state).toBe("UNKNOWN");
    expect(g.primaryAction).toBe(null);
    expect(g.messageKey).toBe("unknown");
  });

  test("⑯ DETERMINIZEM: isti vhodi → identičen izhod (100×)", () => {
    const base = input({ myTripCount: 2, savedTripsCount: 1, go: goFacts() });
    const first = selectGuidance(base);
    for (let i = 0; i < 100; i++) {
      expect(selectGuidance(input({ myTripCount: 2, savedTripsCount: 1, go: goFacts() }))).toEqual(first);
    }
  });

  test("⑰ ENA primarna akcija na trenutek + vsa href so relativna (§10, brez locale leakage)", () => {
    const states: GuidanceInput[] = [
      input(),
      input({ firstSession: false, returningUser: true }),
      input({ myTripCount: 1 }),
      input({ savedTripsCount: 1 }),
      input({ go: goFacts() }),
      input({ go: goFacts({ remainingToday: 0, doneToday: 2, laterDayStops: 0, nextStopTitle: null }) }),
    ];
    for (const s of states) {
      const g = selectGuidance(s);
      expect(g.primaryAction).not.toBeNull();
      expect(g.secondaryActions.every((a) => a.kind === "secondary")).toBe(true);
      if (g.primaryAction?.href) {
        expect(g.primaryAction.href.startsWith("/")).toBe(true);
        expect(g.primaryAction.href.includes("localhost")).toBe(false);
      }
    }
  });

  test("⑱ prioritete so POPOLNOMO urejene po §32 (strogo padajoče po pomembnosti)", () => {
    const cases: [ReturnType<typeof selectGuidance>["state"], number][] = [
      ["BLOCKED", 100],
      ["NEEDS_ATTENTION", 90],
      ["ARRIVED", 80],
      ["NAVIGATING", 70],
      ["RECOVERY", 60],
      ["FREE_TIME", 50],
      ["COMPLETED", 45],
      ["TRIP_STARTED", 40],
      ["TRIP_READY", 30],
      ["BOOKING_PENDING", 25],
      ["TRIP_BUILDING", 20],
      ["DISCOVERING", 10],
      ["NEW_USER", 5],
    ];
    for (let i = 1; i < cases.length; i++) {
      expect(cases[i - 1][1]).toBeGreaterThan(cases[i][1]);
    }
  });

  test("⑲ površina NE spreminja stanja (samo izris) — enako stanje na vseh površinah", () => {
    for (const surface of ["home", "hub", "planner", "go"] as const) {
      const g = selectGuidance(input({ surface, myTripCount: 1 }));
      expect(g.state).toBe("TRIP_BUILDING");
    }
  });

  test("⑳ ZASEBNOST: izhod nikoli ne nosi ključev koordinat/GPS (samo števci + ime)", () => {
    const g = selectGuidance(input({ go: goFacts() }));
    const FORBIDDEN = new Set(["lat", "lng", "latitude", "longitude", "position", "accuracy", "coords"]);
    const seen = new Set<string>();
    const walk = (v: unknown) => {
      if (Array.isArray(v)) return void v.forEach(walk);
      if (v && typeof v === "object") {
        for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
          seen.add(k);
          walk(val);
        }
      }
    };
    walk(g);
    for (const key of seen) expect(FORBIDDEN.has(key)).toBe(false);
  });

  test("㉑ COMPLETED dejstva nosijo poštene števce (opravljeni + preskočeni)", () => {
    const g = selectGuidance(
      input({ go: goFacts({ remainingToday: 0, doneToday: 4, skippedToday: 2, laterDayStops: 0 }) }),
    );
    expect(g.state).toBe("COMPLETED");
    expect(g.facts.doneToday).toBe(4);
    expect(g.facts.skippedToday).toBe(2);
  });
});
