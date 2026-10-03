// ============================================================================
// ISSUE #24 SKLOP 9 (1.171.0) — »Nearby dodajanje sredi dneva (ne samo konec)«
// (P3 backlog, TripIt Nearby vzorec): pogodbenski + funkcionalni testi.
//
// Obseg:
//  ① FUNKCIONALNO nearbyInsertIndex (čisti delivec): najden beforeKey →
//     njegov indeks; null/undefined/ni v dnevu → konec (dolžina) — staro
//     vedenje ostane privzeto (KOMPATIBILNOST);
//  ② FUNKCIONALNO addNearbyStopToRecord z beforeKey: VSTAVEK pred naslednji
//     postanek (sredi dneva — uporabnik ga obišče ZDAJ, ne čez tri
//     postanke); ZERO reordering obstoječih (vstavek ≠ preurejanje);
//     fallback na konec, ko beforeKey ni v dnevu (iskreno, ne zmiga);
//     drugi dnevi NEDOTAKNJENI; originalni zapis ni mutiran; stabilen
//     ključ nearby:{id} + savedAt;
//  ③ PARITETA zavrnitev: v1 (kanonična pot) + neveljavni vhodi tudi z
//     beforeKey → null (fail-closed nespremenjen);
//  ④ OZNAKE GO_EDIT_LABELS.addedMid: 6 jezikov, smiselne vsebine (P4-8
//     ne-mešanje — tuji prevodi so lastni, ne EN dedovanje);
//  ⑤ SOURCE-CONTRACT go-mode.tsx: beforeKey = view.next?.entry.key ?? null,
//     sporočilo glede na DEJANSKI položaj vstavitve (isMid → addedMid),
//     telemetrija brez PII (samo position mid|end — ne ime ne geo);
//  ⑥ ANALITIKA 3-plastna pariteta: nearby_stop_added v klientnem unionu IN
//     strežniškem VALID_EVENTS IN docs/ANALYTICS-EVENTS.md (zlati kanon);
//  ⑦ VAROVANJE: varnostna rezerva prostega časa (§10) OSTAJA —
//     DEFAULT_FREE_TIME_CONFIG vrednosti so testno zaklenjene (sprememba
//     zahteva ta test) — Sklop 9 ne odpira okna širše.
//
// Vzorec: source-contract readFileSync (isto kot issue24-s5/s4) +
// funkcionalni klici čistih funkcij (0 DB — sandbox prijazen).

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { MyTripDay, MyTripView, TripEntry } from "@/lib/journey/trip-view";
import type { GoTripRecordV1, GoTripRecordV2 } from "@/lib/journey/go-persist";
import {
  addNearbyStopToRecord,
  canAddNearbyStops,
  GO_EDIT_LABELS,
  nearbyCandidateToEntry,
  nearbyInsertIndex,
  type NearbyAddCandidate,
} from "@/lib/journey/go-edit";
import { DEFAULT_FREE_TIME_CONFIG } from "@/lib/journey/free-time";

const ROOT = process.cwd();

function source(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Fixture (isti vzorec kot issue22-guardian-ux)
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

const DAY = (keys: string[]): MyTripDay => ({
  date: "2026-10-03",
  dateLabel: { sl: "danes", en: "today" },
  entries: keys.map((k) => mkEntry(k)),
});

const v2Record = (days: MyTripDay[]): GoTripRecordV2 => ({
  version: 2,
  kind: "itinerary",
  savedAt: "2026-10-03T08:00:00.000Z",
  view: mkTrip(days),
});

const v1Record: GoTripRecordV1 = {
  version: 1,
  savedAt: "2026-10-03T08:00:00.000Z",
  journey: {} as never,
  selectedIds: [],
};

const cand: NearbyAddCandidate = {
  id: "fsq77",
  name: "Kavarna ob jezeru",
  lat: 46.36,
  lng: 14.10,
  category: "drink",
};

// ---------------------------------------------------------------------------
// ① nearbyInsertIndex (čisti delivec)
// ---------------------------------------------------------------------------

describe("ISSUE #24 Sklop 9 — ① nearbyInsertIndex (indeks vstavitve)", () => {
  const day = [mkEntry("a"), mkEntry("b"), mkEntry("c")];

  test("① najden beforeKey → njegov indeks (vstavek PRED njim)", () => {
    expect(nearbyInsertIndex(day, "a")).toBe(0); // pred prvim
    expect(nearbyInsertIndex(day, "b")).toBe(1); // sredi
    expect(nearbyInsertIndex(day, "c")).toBe(2); // pred zadnjim
  });

  test("② null/undefined → konec dneva (dolžina — staro vedenje)", () => {
    expect(nearbyInsertIndex(day, null)).toBe(3);
    expect(nearbyInsertIndex(day, undefined)).toBe(3);
  });

  test("③ beforeKey NI v dnevu → konec (iskren fallback, ne zmiga)", () => {
    expect(nearbyInsertIndex(day, "ne-obstaja")).toBe(3);
  });

  test("④ prazen dan → 0 (edini možni položaj)", () => {
    expect(nearbyInsertIndex([], "a")).toBe(0);
    expect(nearbyInsertIndex([], null)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ② addNearbyStopToRecord — SREDI DNEVA (vstavek, ne preurejanje)
// ---------------------------------------------------------------------------

describe("ISSUE #24 Sklop 9 — ② vstavek sredi dneva (TripIt Nearby)", () => {
  test("① beforeKey sredi dneva: [a,b,c] + pred b → [a,nearby,b,c]", () => {
    const rec = v2Record([DAY(["a", "b", "c"])]);
    const updated = addNearbyStopToRecord(rec, cand, 0, { beforeKey: "b" });
    expect(updated).not.toBeNull();
    const keys = updated!.view.days[0].entries.map((e) => e.key);
    expect(keys).toEqual(["a", "nearby:fsq77", "b", "c"]);
    // ZERO reordering: obstoječi vrstni red a→b→c ostane netaknjen
    expect(updated!.view.days[0].entries[0].title).toBe("Postanek a");
    expect(updated!.view.days[0].entries[2].title).toBe("Postanek b");
    expect(updated!.view.days[0].entries[3].title).toBe("Postanek c");
    // stabilen ključ z izvorom + nov savedAt + ČISTO (original ni mutiran)
    expect(updated!.savedAt >= rec.savedAt).toBe(true);
    expect(rec.view.days[0].entries).toHaveLength(3);
    expect(canAddNearbyStops(rec)).toBe(true);
  });

  test("② beforeKey = prvi postanek: [b,c] + pred b → [nearby,b,c]", () => {
    const rec = v2Record([DAY(["b", "c"])]);
    const updated = addNearbyStopToRecord(rec, cand, 0, { beforeKey: "b" });
    const keys = updated!.view.days[0].entries.map((e) => e.key);
    expect(keys).toEqual(["nearby:fsq77", "b", "c"]);
  });

  test("③ beforeKey = zadnji postanek: [a,b] + pred b → [a,nearby,b]", () => {
    const rec = v2Record([DAY(["a", "b"])]);
    const updated = addNearbyStopToRecord(rec, cand, 0, { beforeKey: "b" });
    const keys = updated!.view.days[0].entries.map((e) => e.key);
    expect(keys).toEqual(["a", "nearby:fsq77", "b"]);
  });

  test("④ BREZ beforeKey → konec dneva (kompatibilnost — kanon #22 ostaja)", () => {
    const rec = v2Record([DAY(["a", "b"])]);
    const updated = addNearbyStopToRecord(rec, cand, 0);
    const keys = updated!.view.days[0].entries.map((e) => e.key);
    expect(keys).toEqual(["a", "b", "nearby:fsq77"]);
    // eksplicitni null ima ENAK učinek (konec)
    const updated2 = addNearbyStopToRecord(rec, cand, 0, { beforeKey: null });
    expect(updated2!.view.days[0].entries.map((e) => e.key)).toEqual([
      "a",
      "b",
      "nearby:fsq77",
    ]);
  });

  test("⑤ beforeKey NI v dnevu → pošten konec dneva (fallback)", () => {
    const rec = v2Record([DAY(["a", "b"])]);
    const updated = addNearbyStopToRecord(rec, cand, 0, { beforeKey: "ne-obstaja" });
    const keys = updated!.view.days[0].entries.map((e) => e.key);
    expect(keys).toEqual(["a", "b", "nearby:fsq77"]);
  });

  test("⑥ beforeKey iz DRUGEGA dneva → NE vstavi tja; konec AKTIVNEGA dneva", () => {
    const rec = v2Record([DAY(["a", "b"]), DAY(["x", "y"])]);
    const updated = addNearbyStopToRecord(rec, cand, 0, { beforeKey: "x" });
    const day0 = updated!.view.days[0].entries.map((e) => e.key);
    const day1 = updated!.view.days[1].entries.map((e) => e.key);
    expect(day0).toEqual(["a", "b", "nearby:fsq77"]); // konec aktivnega dneva
    expect(day1).toEqual(["x", "y"]); // drugi dan NEDOTAKNJEN
  });

  test("⑦ vnos iz kandidata ostaja ISKREN (INFO, brez časa, vir razkrit)", () => {
    const rec = v2Record([DAY(["b"])]);
    const updated = addNearbyStopToRecord(rec, cand, 0, { beforeKey: "b" });
    const e = updated!.view.days[0].entries[0];
    expect(e.key).toBe("nearby:fsq77");
    expect(e.status).toBe("INFO");
    expect(e.lat).toBe(46.36);
    expect(e.providerLabel.sl).toContain("Zemljevid");
    expect(nearbyCandidateToEntry(cand).timeNote?.sl).toContain("med potjo");
  });
});

// ---------------------------------------------------------------------------
// ③ pariteta zavrnitev (v1 + neveljavni vhodi — tudi z beforeKey)
// ---------------------------------------------------------------------------

describe("ISSUE #24 Sklop 9 — ③ zavrnitve ostajajo (fail-closed)", () => {
  test("① v1 kanonična pot: tudi z beforeKey → null (izbire se NE mutirajo)", () => {
    expect(canAddNearbyStops(v1Record)).toBe(false);
    expect(addNearbyStopToRecord(v1Record, cand, 0, { beforeKey: "b" })).toBeNull();
  });

  test("② neveljaven dan/koordinate + beforeKey → null", () => {
    const rec = v2Record([DAY(["a"])]);
    expect(addNearbyStopToRecord(rec, cand, 5, { beforeKey: "a" })).toBeNull();
    expect(addNearbyStopToRecord(rec, cand, -1, { beforeKey: "a" })).toBeNull();
    expect(
      addNearbyStopToRecord(rec, { ...cand, lat: Number.NaN }, 0, { beforeKey: "a" })
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ④ oznake addedMid (6 jezikov — P4-8)
// ---------------------------------------------------------------------------

describe("ISSUE #24 Sklop 9 — ④ GO_EDIT_LABELS.addedMid (6 jezikov)", () => {
  test("① vsi jeziki prisotni, neprazni, z naslovom kandidata", () => {
    const langs = ["sl", "en", "it", "de", "fr", "es"] as const;
    for (const l of langs) {
      const fn = (GO_EDIT_LABELS.addedMid as Record<string, (t: string) => string>)[l];
      expect(typeof fn).toBe("function");
      const out = fn("Kavarna ob jezeru");
      expect(out.length).toBeGreaterThan(5);
      expect(out).toContain("Kavarna ob jezeru");
    }
  });

  test("② SL/EN ločena od sporočila za konec dneva (added ≠ addedMid)", () => {
    expect(GO_EDIT_LABELS.addedMid.sl("X")).not.toBe(GO_EDIT_LABELS.added.sl("X"));
    expect(GO_EDIT_LABELS.addedMid.en("X")).not.toBe(GO_EDIT_LABELS.added.en("X"));
    expect(GO_EDIT_LABELS.addedMid.sl("X")).toContain("pred naslednji");
    expect(GO_EDIT_LABELS.added.en("X")).toContain("end of the day");
  });

  test("③ tuji prevodi so LASTNI (ne EN kopija — P4-8 polni prevodi)", () => {
    const en = GO_EDIT_LABELS.addedMid.en("X");
    expect(GO_EDIT_LABELS.addedMid.it("X")).not.toBe(en);
    expect(GO_EDIT_LABELS.addedMid.de("X")).not.toBe(en);
    expect(GO_EDIT_LABELS.addedMid.fr("X")).not.toBe(en);
    expect(GO_EDIT_LABELS.addedMid.es("X")).not.toBe(en);
  });
});

// ---------------------------------------------------------------------------
// ⑤ source contract — go-mode.tsx (vstavek + sporočilo + telemetrija)
// ---------------------------------------------------------------------------

describe("ISSUE #24 Sklop 9 — ⑤ go-mode.tsx source contract", () => {
  const src = norm(source("src/components/sections/go-mode.tsx"));

  test("① beforeKey = naslednji postanek (view.next) — sredi dneva po zasnovi", () => {
    expect(src).toContain("const beforeKey = view.next?.entry.key ?? null;");
    expect(src).toContain("{ beforeKey }");
  });

  test("② sporočilo glede na DEJANSKI položaj vstavitve (isMid → addedMid)", () => {
    expect(src).toContain("isMid ? GO_EDIT_LABELS.addedMid : GO_EDIT_LABELS.added");
    expect(src).toContain("newIndex < dayEntries.length - 1");
  });

  test("③ telemetrija nearby_stop_added SAMO z položajem (brez PII)", () => {
    expect(src).toContain('trackPlannerEvent("nearby_stop_added"');
    expect(src).toContain('{ position: isMid ? "mid" : "end" }');
    // ime/geo kandidata NE gresta v telemetrijo (zasebnost — kanon #22 §5)
    const i = src.indexOf('trackPlannerEvent("nearby_stop_added"');
    const call = src.slice(i, i + 120);
    expect(call).not.toContain("candidate.title");
    expect(call).not.toContain("candidate.lat");
  });
});

// ---------------------------------------------------------------------------
// ⑥ analitika — 3-plastna pariteta (klient + strežnik + dokumentacija)
// ---------------------------------------------------------------------------

describe("ISSUE #24 Sklop 9 — ⑥ nearby_stop_added 3-plastna pariteta", () => {
  test("① klientni union (planner-analytics.ts)", () => {
    expect(norm(source("src/lib/planner-analytics.ts"))).toContain(
      '| "nearby_stop_added"'
    );
  });

  test("② strežniški VALID_EVENTS (api/analytics/event/route.ts)", () => {
    expect(norm(source("src/app/api/analytics/event/route.ts"))).toContain(
      '"nearby_stop_added"'
    );
  });

  test("③ docs/ANALYTICS-EVENTS.md (zlati kanon)", () => {
    const doc = source("docs/ANALYTICS-EVENTS.md");
    expect(doc).toContain("`nearby_stop_added` (1.171.0, Issue #24 Sklop 9)");
    expect(doc).toMatch(/nearby_stop_added[\s\S]*?`position`/);
  });
});

// ---------------------------------------------------------------------------
// ⑦ varnostna rezerva prostega časa OSTAJA (Sklop 9 ne odpira okna širše)
// ---------------------------------------------------------------------------

describe("ISSUE #24 Sklop 9 — ⑦ varnost okna nedotaknjena (§10)", () => {
  test("① DEFAULT_FREE_TIME_CONFIG vrednosti so testno zaklenjene", () => {
    // Sprememba katerekoli od teh vrednosti je VARNA le z ozaveščeno
    // posodobitvijo tega testa (isti kanon kot DEFAULT_ARRIVAL_CONFIG).
    expect(DEFAULT_FREE_TIME_CONFIG.minUsableMin).toBe(30);
    expect(DEFAULT_FREE_TIME_CONFIG.safetyBaseMin).toBe(15);
    expect(DEFAULT_FREE_TIME_CONFIG.safetyRatio).toBe(0.1);
    expect(DEFAULT_FREE_TIME_CONFIG.maxCandidates).toBe(4);
    expect(DEFAULT_FREE_TIME_CONFIG.searchRadiusKm).toBe(5);
  });
});
