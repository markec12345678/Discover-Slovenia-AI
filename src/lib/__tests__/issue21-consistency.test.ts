// ============================================================================
// ISSUE #21 §24 (F3) — KONSISTENCA: ISTA resnica v VSEH projekcijah (1.161.0)
// ============================================================================
// Izvedba §19 (divergenca My Trip ↔ Go Mode je nemogoča PO ZASNOVI, ne po
// obljubi): isti vnos poti se projekcira skozi VSE poglede (naslednji /
// naslednje po tem / preostali / opravljeni / preskočeni / shema dneva) in
// skozi PERSISTENCO (shranjevanje → nalaganje → ponovna izgradnja) — vsak
// pogled mora nositi IDENTNO identiteto vnosa (ključ, naslov, čas, geo,
// vir). En test, ki izvaja celoten §19.
// ============================================================================

import { describe, expect, test } from "bun:test";

import type { MyTripDay, MyTripView, TripEntry } from "@/lib/journey/trip-view";
import { buildGoView, type GoView } from "@/lib/journey/go-view";
import { buildItineraryGoView } from "@/lib/journey/itinerary-go";
import { resolveStopGeo } from "@/lib/journey/resolve-stop-geo";
import type { Itinerary, LocationVisit } from "@/lib/types";

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

function mkTrip(days: MyTripDay[]): MyTripView {
  return {
    title: { sl: "MOJA POT", en: "MY TRIP" },
    days,
    externalCards: [],
    confirmation: { confirmedCount: 0, note: { sl: "ni", en: "none" } },
    generatedAt: new Date(2026, 8, 20, 12, 0).toISOString(),
  };
}

const NOW = new Date(2026, 8, 20, 14, 0);

function withFakeWindow<T>(fn: () => T): T {
  const store = new Map<string, string>();
  const fakeWindow = {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => void store.clear(),
    },
  };
  const g = globalThis as Record<string, unknown>;
  const prev = g.window;
  g.window = fakeWindow;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete g.window;
    else g.window = prev;
  }
}

/** Identiteta vnosa, kot jo vidi vsak pogled (podpis §19). */
function identityOfCard(c: { entry: TripEntry; geo: unknown }) {
  return JSON.stringify({
    key: c.entry.key,
    title: c.entry.title,
    time: c.entry.time ?? null,
    date: c.entry.date ?? null,
    provider: c.entry.provider ?? null,
    geo: c.geo,
  });
}

function identityOfEntry(e: TripEntry) {
  return identityOfCard({ entry: e, geo: resolveStopGeo(e) });
}

// ---------------------------------------------------------------------------
// 1 — VSE PROJEKCIJE ISTEGA VNOSA = ISTA IDENTITETA (§19)
// ---------------------------------------------------------------------------

describe("ISSUE #21 §19/§24: konsistenca projekcij Go Mode", () => {
  const trip = mkTrip([
    {
      date: "2026-09-20",
      dateLabel: { sl: "x", en: "x" },
      entries: [
        mkEntry("own-1", {
          title: "Apartma Bled",
          lat: 46.1,
          lng: 14.1,
          provider: "own",
          providerProductId: "lst-1",
          location: "Bled",
          time: { start: "15:00" },
        }),
        mkEntry("fsq-2", {
          title: "Pogled na Ojstrino",
          lat: 46.2,
          lng: 14.2,
          provider: "fsq",
          time: { start: "17:30" },
        }),
        mkEntry("no-geo-3", { title: "Kavarna brez lokacije" }),
        mkEntry("sto-4", { title: "Kanal ob Soči", lat: 46.15, lng: 13.6, provider: "sto" }),
      ],
    },
  ]);

  function collectViews(done: Record<string, string>, skipped: Record<string, string>): GoView {
    return buildGoView(trip, NOW, null, done, { skipped });
  }

  test("① next/nextAfter/remaining/done/skipped: vsak ključ ima VES čas identično identiteto", () => {
    const v = collectViews(
      { "own-1": "2026-09-20T15:30:00Z" },
      { "fsq-2": "2026-09-20T17:31:00Z" }
    );
    // next = no-geo-3 (own opravljen, fsq preskočen)
    expect(v.next?.entry.key).toBe("no-geo-3");

    const byKey = new Map<string, string[]>();
    const push = (label: string, c: { entry: TripEntry; geo: unknown }) => {
      const list = byKey.get(c.entry.key) ?? [];
      list.push(label);
      byKey.set(c.entry.key, list);
      // identiteta tega pojavitve mora biti ENAKA kot identiteta vhodnega vnosa
      expect(identityOfCard(c)).toBe(identityOfEntry(c.entry));
    };

    if (v.next) push("next", v.next);
    if (v.nextAfter) push("nextAfter", v.nextAfter);
    v.remaining.forEach((c) => push("remaining", c));
    v.done.forEach((c) => push("done", c));
    v.skipped.forEach((c) => push("skipped", c));

    // vsak vnos se pojavi v vsaj enem pogledu (celota brez lukenj)
    expect([...byKey.keys()].sort()).toEqual(["fsq-2", "no-geo-3", "own-1", "sto-4"]);
  });

  test("② geo projekcija na karticah = resolveStopGeo(vnosa) (ista funkcija, isti izhod)", () => {
    const v = collectViews({}, {});
    for (const card of [v.next, v.nextAfter, ...v.remaining]) {
      if (card == null) continue;
      expect(card.geo).toEqual(resolveStopGeo(card.entry));
    }
  });

  test("③ shema dneva (line): ključ/naslov/čas ista kot na karticah istega dne", () => {
    const v = collectViews({}, {});
    const cardsByKey = new Map<string, { title: string; time?: { start: string } }>();
    for (const card of [v.next, v.nextAfter, ...v.remaining]) {
      if (card) cardsByKey.set(card.entry.key, { title: card.entry.title, time: card.entry.time });
    }
    expect(v.line.length).toBe(4);
    for (const item of v.line) {
      const ref = cardsByKey.get(item.key);
      expect(ref).toBeDefined();
      expect(item.title).toBe(ref!.title);
      expect(item.timeStart ?? null).toBe(ref!.time?.start ?? null);
    }
  });

  test("④ kasneje v dnevu so EXACTKO ista polja (remaining nosi enake provider/geo kot vhod)", () => {
    const v = collectViews({}, {});
    const stoCard = v.remaining.find((c) => c.entry.key === "sto-4");
    expect(stoCard?.entry.provider).toBe("sto");
    expect(stoCard?.geo).toEqual({
      lat: 46.15,
      lng: 13.6,
      source: "sto",
      precision: "approximate",
    });
  });
});

// ---------------------------------------------------------------------------
// 2 — PERSISTENCA ROUNDTRIP: shranjeno → naloženo → ponovno zgrajeno (§19)
// ---------------------------------------------------------------------------

describe("ISSUE #21 §19/§24: konsistenca čez persistenco", () => {
  function mkLoc(id: string, name = id): LocationVisit {
    return {
      destination_id: id,
      destination_name: name,
      time_slot: "10:00-12:00",
      duration: 2,
      estimated_cost: 0,
      notes: "",
    };
  }

  function mkItin(locations: LocationVisit[]): Itinerary {
    return {
      days: [
        {
          day: 1,
          locations,
          weather: { condition: "nic", temp: 0 },
          weatherEstimated: true,
        },
      ],
      total_budget: 0,
      recommendations: [],
      tips: [],
      source: "deterministic",
    };
  }

  test("① AI itinerer → GoView → shrani → naloži → GoView: IDENTNA identiteta naslednjega", async () => {
    const { saveItineraryGoTrip, saveGoProgress, saveGoSkipped, loadGoTrip, loadGoProgress, loadGoSkipped } =
      await import("@/lib/journey/go-persist");

    withFakeWindow(() => {
      const original = buildItineraryGoView(mkItin([mkLoc("bled"), mkLoc("bohinj")]), {
        lang: "sl",
      });
      expect(saveItineraryGoTrip(original, { shareId: null })).toBe(true);

      const done = { "itin-d1-bled": "2026-09-20T11:00:00Z" };
      saveGoProgress(done);
      saveGoSkipped({});

      // NALOŽI (kot Go Mode ob mountu) — V2 zapis nosi SESTAVLJEN pogled
      const record = loadGoTrip();
      expect(record?.version).toBe(2);
      if (record?.version !== 2) return;
      const loaded = record.view;

      // identiteta NASLEDNJEGA po roundtripu (bled opravljen → bohinj)
      const before = buildGoView(original, NOW, null, {});
      const after = buildGoView(loaded, NOW, null, loadGoProgress(), {
        skipped: loadGoSkipped(),
      });
      expect(before.next?.entry.key).toBe("itin-d1-bled");
      expect(after.next?.entry.key).toBe("itin-d1-bohinj"); // napredek preživi
      // §19: projekcija naloženega vnosa = identiteta ISTEGA vnosa v poti
      // (Go Mode ne more izračunati svojih podatkov — samo projicirati)
      const bohinjEntry = loaded.days[0].entries.find(
        (e) => e.key === "itin-d1-bohinj"
      );
      expect(bohinjEntry).toBeDefined();
      expect(identityOfCard(after.next!)).toBe(identityOfEntry(bohinjEntry!));
      // done/restored kartica ima isto identiteto kot vhodni vnos
      expect(after.done[0].entry.key).toBe("itin-d1-bled");
      expect(after.done[0].geo).toEqual(resolveStopGeo(after.done[0].entry));
    });
  });

  test("② preureditev načrta (vstavljen postanek) NE razveljavi obstoječega napredka (stabilni ključi)", () => {
    const before = buildItineraryGoView(mkItin([mkLoc("bled"), mkLoc("bohinj")]), { lang: "sl" });
    const after = buildItineraryGoView(
      mkItin([mkLoc("bled"), mkLoc("piran"), mkLoc("bohinj")]),
      { lang: "sl" }
    );
    const beforeKeys = before.days[0].entries.map((e) => e.key);
    const afterKeys = after.days[0].entries.map((e) => e.key);
    // obstoječi ključi ostanejo (vstavljen piran ne zamakne bohinja)
    expect(afterKeys).toContain("itin-d1-bled");
    expect(afterKeys).toContain("itin-d1-bohinj");
    expect(beforeKeys.every((k) => afterKeys.includes(k))).toBe(true);
    // vstavljen postanek dobi SVOJ novi ključ (ne reciklira tujega)
    expect(afterKeys).toContain("itin-d1-piran");
  });
});
