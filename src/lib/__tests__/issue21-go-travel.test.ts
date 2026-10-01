// ============================================================================
// ISSUE #21 — LIVE TRIP NAVIGATOR: INTEGRACIJA (1.159.0)
// ============================================================================
// Pokriva prek cele verige (čisto, 0 omrežja):
//  - buildGoView: travel status naslednjega postanka (active/navigating/
//    near_destination/arrived), kontekst prihoda (hystereza čez klice),
//    zastarelost fiksacije, PRESKOČENI postanki (ločeno od opravljenih);
//  - buildItineraryGoView: STABILNI VSEBINSKI KLJUČI (preurejanje načrta
//    NE razveljavi napredka — ključna regresija #21 §19);
//  - go-persist: dai:go-skipped persistenca (isti varnostni vzorec);
//  - go-audio: prihodni frazi v pripovedi (deterministično);
//  - source contract: use-geolocation (en sam auto-retry) in go-mode.tsx
//    (arrival UX, preskok, zastarelost, rezervacijska prekrivka SAMO branje).
// ============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { MyTripDay, MyTripView, TripEntry } from "@/lib/journey/trip-view";
import { buildGoView } from "@/lib/journey/go-view";
import { buildItineraryGoView } from "@/lib/journey/itinerary-go";
import {
  clearGoTrip,
  loadGoSkipped,
  saveGoSkipped,
} from "@/lib/journey/go-persist";
import { buildStopNarration } from "@/lib/journey/go-audio";
import type { Itinerary, LocationVisit } from "@/lib/types";

// ---------------------------------------------------------------------------
// Fixture gradniki (isti vzorec kot task64 — go-view BREZ celotnega journeyja)
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

const NOW = new Date(2026, 8, 20, 14, 0);
const TODAY = "2026-09-20";

/** Cilj na (46.009, 14.0); položaj DLn stopinj južno (Δφ 0.009° ≈ 1001 m …). */
const STOP_GEO = { lat: 46.009, lng: 14.0 };
const posAt = (dLat: number, ageMs = 0) => ({
  lat: 46.009 - dLat,
  lng: 14.0,
  timestamp: NOW.getTime() - ageMs,
});

// ---------------------------------------------------------------------------
// 1 — BUILD GO VIEW: TRAVEL STATUS NASLEDNJEGA POSTANKA
// ---------------------------------------------------------------------------

describe("ISSUE #21: buildGoView — travel status naslednjega", () => {
  const trip = mkTrip([
    mkDay(TODAY, [
      mkEntry("a", STOP_GEO),
      mkEntry("b"),
      mkEntry("c"),
    ]),
  ]);

  test("① brez GPS → active (ne lažemo o bližini) + kontekst null", () => {
    const v = buildGoView(trip, NOW, null, {});
    expect(v.next?.travel?.status).toBe("active");
    expect(v.next?.travel?.arrivalM).toBeUndefined();
    expect(v.arrivalContext).toBeNull();
    expect(v.positionAvailable).toBe(false);
    expect(v.positionStale).toBe(false);
  });

  test("② GPS 1001 m daleč → navigating + razdalja v metrih", () => {
    const v = buildGoView(trip, NOW, posAt(0.009), {});
    expect(v.next?.travel?.status).toBe("navigating");
    expect(v.next?.travel?.arrivalM).toBe(1001);
    expect(v.arrivalContext?.state).toBe("far");
    expect(v.positionAvailable).toBe(true);
  });

  test("③ GPS 222 m → near_destination", () => {
    const v = buildGoView(trip, NOW, posAt(0.002), {});
    expect(v.next?.travel?.status).toBe("near_destination");
    expect(v.next?.travel?.arrivalM).toBe(222);
  });

  test("④ GPS 44 m SVEŽ (brez konteksta) → prihod še NI stabilen → near_destination", () => {
    const v = buildGoView(trip, NOW, posAt(0.0004), {});
    expect(v.arrivalContext?.state).toBe("arrived");
    expect(v.next?.travel?.status).toBe("near_destination");
  });

  test("⑤ GPS 44 m z 10 s starim arrived kontekstom → STABILEN arrived", () => {
    const v = buildGoView(trip, NOW, posAt(0.0004), {}, {
      arrivalContext: {
        key: "a",
        state: "arrived",
        sinceMs: NOW.getTime() - 10_000,
        lastDistanceM: 44,
      },
    });
    expect(v.next?.travel?.status).toBe("arrived");
    expect(v.next?.travel?.stable).toBe(true);
    expect(v.arrivalContext?.state).toBe("arrived");
  });

  test("⑥ sprememba naslednjega (a opravljen) → kontekst se resetira na b", () => {
    const v = buildGoView(trip, NOW, posAt(0.0009), { a: "2026-09-20T13:00:00Z" }, {
      arrivalContext: { key: "a", state: "arrived", sinceMs: NOW.getTime() - 50_000 },
    });
    expect(v.next?.entry.key).toBe("b");
    // b nima geo → unknown → active (iskreno, brez lažnega prihoda)
    expect(v.next?.travel?.status).toBe("active");
    expect(v.arrivalContext).toBeNull();
  });

  test("⑦ zastarela fiksacija (2 min) se razkrije (positionStale)", () => {
    const v = buildGoView(trip, NOW, posAt(0.002, 120_000), {});
    expect(v.positionStale).toBe(true);
    const fresh = buildGoView(trip, NOW, posAt(0.002, 5_000), {});
    expect(fresh.positionStale).toBe(false);
  });

  test("⑧ preostali postanki NIMajo travel konteksta (samo naslednji je živ)", () => {
    const v = buildGoView(trip, NOW, posAt(0.009), {});
    expect(v.next?.travel).toBeDefined();
    expect(v.remaining.every((c) => c.travel == null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2 — BUILD GO VIEW: PRESKOČENI POSTANKI (§5 ročni nadzor)
// ---------------------------------------------------------------------------

describe("ISSUE #21: buildGoView — preskoki", () => {
  const trip = mkTrip([
    mkDay(TODAY, [mkEntry("a"), mkEntry("b"), mkEntry("c")]),
  ]);

  test("① preskočen postanek IZPADA iz naslednjega toka", () => {
    const v = buildGoView(trip, NOW, null, {}, { skipped: { a: "2026-09-20T10:00:00Z" } });
    expect(v.next?.entry.key).toBe("b");
    expect(v.remaining.map((c) => c.entry.key)).toEqual(["c"]);
  });

  test("② preskočeni imajo SVOJ razdelek z skippedAt (≠ opravljeni)", () => {
    const v = buildGoView(trip, NOW, null, {}, { skipped: { a: "2026-09-20T10:00:00Z" } });
    expect(v.skipped.length).toBe(1);
    expect(v.skipped[0].entry.key).toBe("a");
    expect(v.skipped[0].skippedAt).toBe("2026-09-20T10:00:00Z");
    expect(v.done.length).toBe(0);
  });

  test("③ opravljeni in preskočeni so LOČENI seznami (done ima prednost ob obojem)", () => {
    const v = buildGoView(
      trip,
      NOW,
      null,
      { a: "2026-09-20T11:00:00Z" },
      { skipped: { a: "2026-09-20T10:00:00Z", b: "2026-09-20T10:30:00Z" } }
    );
    expect(v.done.map((c) => c.entry.key)).toEqual(["a"]);
    expect(v.skipped.map((c) => c.entry.key)).toEqual(["b"]);
    expect(v.next?.entry.key).toBe("c");
  });

  test("④ Obnovi = odstranitev iz skip mape vrne postanek v tok", () => {
    const withSkip = buildGoView(trip, NOW, null, {}, { skipped: { b: "2026-09-20T10:30:00Z" } });
    expect(withSkip.next?.entry.key).toBe("a");
    const restored = buildGoView(trip, NOW, null, {}, { skipped: {} });
    expect(restored.next?.entry.key).toBe("a");
    expect(restored.remaining.map((c) => c.entry.key)).toEqual(["b", "c"]);
  });

  test("⑤ brez skip mape — obnašanje identično prej (zero feature loss)", () => {
    const v = buildGoView(trip, NOW, null, {});
    expect(v.skipped).toEqual([]);
    expect(v.next?.entry.key).toBe("a");
  });
});

// ---------------------------------------------------------------------------
// 3 — STABILNI VSEBINSKI KLJUČI (§19 — napredek preživi preureditev)
// ---------------------------------------------------------------------------

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
    days: [{ day: 1, locations }],
    total_budget: 0,
    recommendations: [],
    tips: [],
    source: "deterministic",
  };
}

describe("ISSUE #21: buildItineraryGoView — stabilni ključi", () => {
  test("① oblika: itin-d{dan}-{destinacija} (brez pozicijskega indeksa)", () => {
    const v = buildItineraryGoView(mkItin([mkLoc("bled"), mkLoc("bohinj")]), { lang: "sl" });
    expect(v.days[0].entries.map((e) => e.key)).toEqual([
      "itin-d1-bled",
      "itin-d1-bohinj",
    ]);
  });

  test("② ponovitev iste destinacije v dnevu → priponka -2 (ne tihi prepend)", () => {
    const v = buildItineraryGoView(
      mkItin([mkLoc("bled"), mkLoc("piran"), mkLoc("bled")]),
      { lang: "sl" }
    );
    expect(v.days[0].entries.map((e) => e.key)).toEqual([
      "itin-d1-bled",
      "itin-d1-piran",
      "itin-d1-bled-2",
    ]);
  });

  test("③ ista destinacija v RAZLIČNIH dneh = različna ključa (dan je obseg)", () => {
    const itin = mkItin([mkLoc("bled")]);
    itin.days.push({ day: 2, locations: [mkLoc("bled")] });
    const v = buildItineraryGoView(itin, { lang: "sl" });
    expect(v.days[0].entries[0].key).toBe("itin-d1-bled");
    expect(v.days[1].entries[0].key).toBe("itin-d2-bled");
  });

  test("④ sanitizacija ID-jev: velike črke/presledki/ločila → slug", () => {
    const v = buildItineraryGoView(
      mkItin([mkLoc("Zgornji Bohinj!"), mkLoc("osm/node-123")]),
      { lang: "sl" }
    );
    expect(v.days[0].entries[0].key).toBe("itin-d1-zgornji-bohinj");
    expect(v.days[0].entries[1].key).toBe("itin-d1-osm-node-123");
  });

  test("⑤ PRAZEN/neumen ID → praznina ne razbije ključa (stop)", () => {
    const v = buildItineraryGoView(mkItin([mkLoc("!!!")]), { lang: "sl" });
    expect(v.days[0].entries[0].key).toBe("itin-d1-stop");
  });

  test("⑥ REGRESIJA #21: vstavljena destinacija NE spremeni ključev obstoječih", () => {
    const before = buildItineraryGoView(
      mkItin([mkLoc("bled"), mkLoc("bohinj"), mkLoc("piran")]),
      { lang: "sl" }
    );
    const after = buildItineraryGoView(
      mkItin([mkLoc("vogel"), mkLoc("bled"), mkLoc("bohinj"), mkLoc("piran")]),
      { lang: "sl" }
    );
    const keysAfter = after.days[0].entries.map((e) => e.key);
    expect(keysAfter).toEqual([
      "itin-d1-vogel",
      "itin-d1-bled",
      "itin-d1-bohinj",
      "itin-d1-piran",
    ]);
    // vsi prejšnji ključi so NEspremenjeni:
    for (const e of before.days[0].entries) {
      expect(keysAfter).toContain(e.key);
    }
  });

  test("⑦ napredek preživi PONOVNI ZAGON z urejenim načrtom (cela veriga)", () => {
    const done = { "itin-d1-bled": "2026-09-20T10:00:00Z" } as Record<string, string>;
    const rebuilt = buildItineraryGoView(
      mkItin([mkLoc("vogel"), mkLoc("bled"), mkLoc("bohinj")]),
      { lang: "sl" }
    );
    const v = buildGoView(rebuilt, NOW, null, done);
    // bled je še vedno opravljen; naslednji je vogel (nov, neopravljen)
    expect(v.done.map((c) => c.entry.key)).toEqual(["itin-d1-bled"]);
    expect(v.next?.entry.key).toBe("itin-d1-vogel");
  });
});

// ---------------------------------------------------------------------------
// 4 — GO PERSIST: dai:go-skipped (isti varnostni vzorec kot progress)
// ---------------------------------------------------------------------------

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

describe("ISSUE #21: go-persist — skipped persistenca", () => {
  test("① save/load roundtrip + prazen map briše ključ", () => {
    withFakeWindow(() => {
      saveGoSkipped({ "itin-d1-bled": "2026-09-20T10:00:00Z" });
      expect(loadGoSkipped()).toEqual({ "itin-d1-bled": "2026-09-20T10:00:00Z" });
      saveGoSkipped({});
      expect(window.localStorage.getItem("dai:go-skipped")).toBeNull();
    });
  });

  test("② clearGoTrip počisti VSE tri ključe (pot + progres + preskoke)", () => {
    withFakeWindow(() => {
      saveGoSkipped({ a: "x" });
      window.localStorage.setItem("dai:go-trip", "{}");
      window.localStorage.setItem("dai:go-progress", "{}");
      clearGoTrip();
      expect(window.localStorage.getItem("dai:go-trip")).toBeNull();
      expect(window.localStorage.getItem("dai:go-progress")).toBeNull();
      expect(window.localStorage.getItem("dai:go-skipped")).toBeNull();
    });
  });

  test("③ pokvarjen JSON / napačna oblika → prazen map (ne sesuje)", () => {
    withFakeWindow(() => {
      window.localStorage.setItem("dai:go-skipped", "{not json");
      expect(loadGoSkipped()).toEqual({});
      window.localStorage.setItem("dai:go-skipped", "[1,2,3]");
      expect(loadGoSkipped()).toEqual({});
    });
  });
});

// ---------------------------------------------------------------------------
// 5 — GO AUDIO: prihodni frazi (deterministično iz travel state)
// ---------------------------------------------------------------------------

describe("ISSUE #21: buildStopNarration — prihodne fraze", () => {
  const base = mkEntry("a", { ...STOP_GEO, title: "Bled" });

  test("① near_destination + metri → »Kmalu boš tam — približno X metrov.«", () => {
    const out = buildStopNarration(
      { entry: base, travel: { status: "near_destination", arrivalM: 222 } },
      "sl"
    );
    expect(out).toContain("Kmalu boš tam — približno 222 metrov.");
  });

  test("② arrived → »Prišel si na lokacijo.« (EN različica)", () => {
    expect(
      buildStopNarration({ entry: base, travel: { status: "arrived" } }, "sl")
    ).toContain("Prišel si na lokacijo.");
    expect(
      buildStopNarration({ entry: base, travel: { status: "arrived" } }, "en")
    ).toContain("You have arrived at the location.");
  });

  test("③ BREZ travel → pripoved nespremenjena (regresija W7)", () => {
    const out = buildStopNarration({ entry: base }, "sl");
    expect(out).not.toContain("Kmalu boš tam");
    expect(out).not.toContain("Prišel si na lokacijo");
    expect(out).toContain("Postanek: Bled.");
  });

  test("④ near_destination BREZ metrov → fraze NI (ne izmišljujemo)", () => {
    const out = buildStopNarration(
      { entry: base, travel: { status: "near_destination" } },
      "sl"
    );
    expect(out).not.toContain("Kmalu boš tam");
  });
});

// ---------------------------------------------------------------------------
// 6 — SOURCE CONTRACT: use-geolocation (§6 profesionalni cikel)
// ---------------------------------------------------------------------------

describe("ISSUE #21: use-geolocation — source contract", () => {
  const src = readFileSync(
    join(import.meta.dir, "../journey/use-geolocation.ts"),
    "utf8"
  );

  test("① EN sam samodejni poskus ponovitve (retriedRef varovalka)", () => {
    expect(src).toContain("retriedRef");
    expect(src).toContain("RETRY_DELAY_MS");
  });

  test("② zavrnitev dovoljenja NIMA samodejne ponovitve (uporabnikova izbira)", () => {
    // denied veja se konča PRED retry logiko (return pred retriedRef vejo)
    const deniedIdx = src.indexOf("PERMISSION_DENIED");
    const retryIdx = src.indexOf("if (!retriedRef.current)");
    expect(deniedIdx).toBeGreaterThan(0);
    expect(retryIdx).toBeGreaterThan(deniedIdx);
    const deniedBlock = src.slice(deniedIdx, retryIdx);
    expect(deniedBlock).toContain("return");
  });

  test("③ uspešna fiksacija ponastavi proračun ponovitve", () => {
    expect(src).toContain("retriedRef.current = false");
  });

  test("④ cleanup počisti TUDI časovnik ponovitve (0 lukenj)", () => {
    expect(src).toContain("clearRetryTimer");
    expect(src.lastIndexOf("clearRetryTimer()")).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 7 — SOURCE CONTRACT: go-mode.tsx (arrival UX + preskok + prekrivka)
// ---------------------------------------------------------------------------

describe("ISSUE #21: go-mode.tsx — source contract", () => {
  const src = readFileSync(
    join(import.meta.dir, "../../components/sections/go-mode.tsx"),
    "utf8"
  );

  test("① arrival trakova: near (Približuješ se) in arrived (Prišel si) z role=status", () => {
    expect(src).toContain('role="status"');
    expect(src).toContain("ARRIVAL_LABELS.near[lang]");
    expect(src).toContain("ARRIVAL_LABELS.arrived[lang]");
    expect(src).toContain("ARRIVAL_LABELS.arrivedHint");
  });

  test("② preskok: gumb Preskoči + ločen razdelek + Obnovi", () => {
    expect(src).toContain("toggleSkip");
    expect(src).toContain('sl: "Preskoči"');
    expect(src).toContain('sl: "Preskočeno"');
    expect(src).toContain("skipHint");
  });

  test("③ preskoki se hidrati/persistirajo ločeno od done", () => {
    expect(src).toContain("loadGoSkipped");
    expect(src).toContain("saveGoSkipped");
  });

  test("④ zastarelost fiksacije se izrecno prikaže", () => {
    expect(src).toContain("ARRIVAL_LABELS.stale[lang]");
    expect(src).toContain("positionAgeMs");
    expect(src).toContain("positionStale");
  });

  test("⑤ rezervacijska prekrivka: SAMO GET (branje) — nikoli pisanje", () => {
    expect(src).toContain("/api/journey/bookings?products=");
    // edini fetch klici: vreme (GET) + bookings (GET) — brez method: "POST"/PATCH
    expect(src).not.toContain('method: "POST"');
    expect(src).not.toContain('method: "PATCH"');
    expect(src).toContain("CONFIRMATION_STATUS_LABELS");
  });

  test("⑥ kontekst prihoda se hrani v refu seje (ne persistira)", () => {
    expect(src).toContain("arrivalRef");
    expect(src).toContain("arrivalContext: arrivalRef.current");
  });

  test("⑦ GPS prihod NE dviga rezervacijskega statusa (dve resnici)", () => {
    // arrived veja ne dotika status/bookingId — samo prikazna plast
    const arrivedIdx = src.indexOf('travel?.status === "arrived"');
    expect(arrivedIdx).toBeGreaterThan(0);
    // rezervacijski status izhaja SAMO iz bookingBadgeOf (strežniške vrstice)
    expect(src).toContain("bookingBadgeOf");
  });
});
