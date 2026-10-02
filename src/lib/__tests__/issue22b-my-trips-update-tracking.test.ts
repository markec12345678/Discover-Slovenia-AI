// ISSUE #22 REMAINING (1.163.2) — addSavedTrip vrzel (update-pot):
// načelo iz glave my-trips-storage.ts pravi »ob vsakem uspešnem shranjevanju
// zapišemo shareId«, a so ga kršili VSI uspešni updateItinerary klici
// (CAS PATCH — uspešni LE z urejevalno pravico na napravi):
//   1. itinerary-planner.tsx handleSaveShare update veja — returnala je
//      BREZ addSavedTrip (pot po posodobitvi NI v Moja potovanja),
//   2. trip-collaboration.tsx restoreVersion (»drugi klik Shrani po
//      restore« — vrzel ujeta v produkcijskem dokazu #22),
//   3. trip-social.tsx »Dodaj v pot« (skupinski klepet, CAS PATCH).
//
// Vzorec: source-contract readFileSync (isto kot task8-f2c / w2-group-chat)
// + FUNKCIONALNI testi (mock globalThis.fetch + window.localStorage, isto
// kot task8-f2c-trip-fork). Varovalke:
//  (a) ZERO-LOSS: novi POST tok, issue4-wave5 CAS pogoji veje in w2
//      skupinski-klepet signatura ostanejo NESPREMENJENI,
//  (b) meja #17 §5: osebna zbirka postankov (my-trip.ts) ostane NEDOTAKNJENA
//      — addSavedTrip piše SAMO seznam shranjenih deljenih poti.

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { updateItinerary } from "../itinerary-share";
import {
  addSavedTrip,
  deriveSavedTripName,
  getSavedTrips,
} from "../my-trips-storage";
import type { Itinerary } from "../types";

const ROOT = join(import.meta.dir, "../../..");

function source(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

const PLANNER = source("src/components/sections/itinerary-planner.tsx");
const COLLAB = source("src/components/trip-collaboration.tsx");
const SOCIAL = source("src/components/trip-social.tsx");
const SHARE = source("src/lib/itinerary-share.ts");
const STORAGE = source("src/lib/my-trips-storage.ts");

/** Pritisni presledke/nove vrstice v en presledek (robustno na formatiranje). */
function norm(src: string): string {
  return src.replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// fiksture (isti minimalni kanon kot task8-f2c-trip-fork)
// ---------------------------------------------------------------------------

function stop(
  partial: Partial<Itinerary["days"][number]["locations"][number]>
): Itinerary["days"][number]["locations"][number] {
  return {
    destination_id: partial.destination_id ?? "bled",
    destination_name: partial.destination_name ?? "Bled",
    time_slot: partial.time_slot ?? "09:00-11:00",
    duration: partial.duration ?? 2,
    estimated_cost: partial.estimated_cost ?? 15,
    notes: partial.notes ?? "",
  };
}

function fixtureItinerary(): Itinerary {
  return {
    days: [
      {
        day: 1,
        locations: [
          stop({ destination_name: "Bled" }),
          stop({ destination_id: "vintgar", destination_name: "Soteska Vintgar" }),
        ],
        weather: { condition: "sončno", temp: 24 },
      },
    ],
    total_budget: 30,
    recommendations: [],
    tips: [],
    source: "ai",
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 1. SOURCE-CONTRACT — vsa tri mesta kličejo addSavedTrip ob uspešnem
//    updateItinerary (natančna oblika klica, vrstni red PRED return/reload,
//    uvozi, strežniško ime je kanon pred fallbackom)
// ─────────────────────────────────────────────────────────────────────────

describe("① SOURCE-CONTRACT: addSavedTrip ob uspešnem updateItinerary", () => {
  test("planner handleSaveShare update veja: klic PRED return (za savedUpdatedToast)", () => {
    const call = "addSavedTrip( linked.shareId, upd.name ?? deriveSavedTripName(itinerary) );";
    expect(norm(PLANNER)).toContain(call);
    // vrstni red znotraj veje: toast → addSavedTrip → return (obseg veje
    // iz issue4-wave5: update veja se zaključi s prvim returnom po toastu)
    const idxToast = PLANNER.indexOf('title: t("savedUpdatedToast")');
    const idxCall = PLANNER.indexOf("upd.name ?? deriveSavedTripName(itinerary)");
    const idxReturn = PLANNER.indexOf("return;", idxToast);
    expect(idxToast).toBeGreaterThanOrEqual(0);
    expect(idxCall).toBeGreaterThan(idxToast);
    expect(idxCall).toBeLessThan(idxReturn);
  });

  test("planner: uvoz addSavedTrip/deriveSavedTripName ostaja (kanonski helperji)", () => {
    expect(PLANNER).toContain(
      'import { addSavedTrip, deriveSavedTripName } from "@/lib/my-trips-storage";'
    );
  });

  test("collaboration restoreVersion: zajame upd in kliče addSavedTrip PRED setRestoreState(\"done\")", () => {
    const call = "addSavedTrip(shareId, upd.name ?? deriveSavedTripName(content));";
    expect(norm(COLLAB)).toContain(call);
    const idxUpd = COLLAB.indexOf("const upd = await updateItinerary(");
    const idxCall = COLLAB.indexOf("upd.name ?? deriveSavedTripName(content)");
    const idxDone = COLLAB.indexOf('setRestoreState("done")', idxUpd);
    expect(idxUpd).toBeGreaterThanOrEqual(0);
    expect(idxCall).toBeGreaterThan(idxUpd);
    expect(idxCall).toBeLessThan(idxDone);
  });

  test("collaboration: uvoz iz my-trips-storage ( isti modul kot planner/fork )", () => {
    expect(COLLAB).toContain("addSavedTrip,");
    expect(COLLAB).toContain("deriveSavedTripName,");
    expect(COLLAB).toContain('} from "@/lib/my-trips-storage";');
  });

  test("social \"Dodaj v pot\": klic PO uspešnem CAS, PRED telemetrijo", () => {
    const call =
      "addSavedTrip( shareId, upd.name ?? deriveSavedTripName(result.itinerary) );";
    expect(norm(SOCIAL)).toContain(call);
    const idxUpd = SOCIAL.indexOf(
      "const upd = await updateItinerary(shareId, result.itinerary, version);"
    );
    const idxCall = SOCIAL.indexOf(
      "upd.name ?? deriveSavedTripName(result.itinerary)"
    );
    const idxEvent = SOCIAL.indexOf('trackPlannerEvent("chat_group_place_added"');
    expect(idxUpd).toBeGreaterThanOrEqual(0);
    expect(idxCall).toBeGreaterThan(idxUpd);
    expect(idxCall).toBeLessThan(idxEvent);
  });

  test("itinerary-share pogodba: updateItinerary vrača strežniško ime (kanon)", () => {
    // strežniško ime mora priti skozi, da ga lahko klicatelj zapiše kot kanon
    expect(SHARE).toContain("name: string | null;");
    expect(SHARE).toContain("name: data.name ?? null,");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. ZERO-LOSS VAROVALKE — obstoječe pogodbe ostanejo nedotaknjene
// ─────────────────────────────────────────────────────────────────────────

describe("② ZERO-LOSS varovalke", () => {
  test("planner NOVI POST tok ostaja: addSavedTrip(result.shareId, …)", () => {
    expect(PLANNER).toContain(
      "addSavedTrip(result.shareId, deriveSavedTripName(itinerary));"
    );
  });

  test("planner issue4-wave5 CAS pogoji veje ostajajo (linked + contentVersion + editToken)", () => {
    expect(PLANNER).toContain("linked.contentVersion !== null");
    expect(PLANNER).toContain("getEditToken(linked.shareId)");
    expect(PLANNER).toContain("await updateItinerary(");
  });

  test("social w2-group-chat CAS signatura ostaja (updateItinerary(shareId, result.itinerary, version))", () => {
    expect(SOCIAL).toContain(
      "updateItinerary(shareId, result.itinerary, version)"
    );
  });

  test("meja #17 §5: osebna zbirka postankov NEDOTAKNJENA — piše se SAMO dai:my-trips", () => {
    // seznam shranjenih deljenih poti ima svoj lastni ključ …
    expect(STORAGE).toContain('const STORAGE_KEY = "dai:my-trips";');
    // … NIKOLI ključ osebne zbirke postankov (my-trip.ts, #17 §5) …
    expect(STORAGE).not.toContain("my-trip-items");
    const surfaces: readonly [string, string][] = [
      ["planner", PLANNER],
      ["collaboration", COLLAB],
      ["social", SOCIAL],
    ];
    for (const [_name, src] of surfaces) {
      // … nobena od treh površin ne piše osebne zbirke …
      expect(src).not.toContain("my-trip-items");
      expect(src).not.toMatch(/from "@\/lib\/my-trip"/);
      // … in uporablja kanonski seznam Moja potovanja (my-trips-storage,
      // ne lastna kopija)
      expect(src).toContain('my-trips-storage');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. FUNKCIONALNO — semantika update toka (mock fetch + window.localStorage,
//    isto kot task8-f2c): prazna naprava → vnos, dedup + osveženo ime/čas,
//    fallback ime, premik na vrh seznama, različne poti se ne deduplicirajo
// ─────────────────────────────────────────────────────────────────────────

function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => {
      map.clear();
    },
    dump: () => map,
  };
}

const storage = makeStorage();
const g = globalThis as Record<string, unknown>;
let prevFetch: unknown;
let hadWindow = false;
let prevWindow: unknown;

// odgovor PATCH-a (mutira ga posamezni test — isto tehniko kot capturedBodies)
let patchResponse: Record<string, unknown> = {
  success: true,
  contentVersion: 2,
  revisionSaved: true,
  name: "Vikend na Bledu",
};

/** Preberi surovi seznam iz localStorage (isti ključ kot my-trips-storage). */
function readRawTrips(): { shareId: string; name: string | null; savedAt: string }[] {
  const raw = storage.dump().get("dai:my-trips");
  expect(raw).toBeDefined();
  return JSON.parse(raw as string);
}

beforeAll(() => {
  prevFetch = g.fetch;
  g.fetch = (async (_input: unknown, init?: { method?: string }) => {
    if (init?.method === "PATCH") {
      return new Response(JSON.stringify(patchResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }) as typeof fetch;

  hadWindow = "window" in g;
  prevWindow = g.window;
  g.window = { localStorage: storage };
});

afterAll(() => {
  g.fetch = prevFetch;
  if (hadWindow) g.window = prevWindow;
  else delete g.window;
});

describe("③ FUNKCIONALNO: update tok piše/osveži Moja potovanja", () => {
  test("prazna naprava → uspešen update zapiše vnos z IMENOM STREŽNIKA", async () => {
    storage.clear();
    patchResponse = {
      success: true,
      contentVersion: 3,
      revisionSaved: true,
      name: "Vikend na Bledu",
    };
    const upd = await updateItinerary("shareAAA", fixtureItinerary(), 2);
    expect(upd.contentVersion).toBe(3);
    expect(upd.name).toBe("Vikend na Bledu");
    // natanko klic, ki ga zdaj naredijo vsa tri mesta (1.163.2)
    addSavedTrip("shareAAA", upd.name ?? deriveSavedTripName(fixtureItinerary()));

    const trips = readRawTrips();
    expect(trips).toHaveLength(1);
    expect(trips[0].shareId).toBe("shareAAA");
    expect(trips[0].name).toBe("Vikend na Bledu");
  });

  test("dedup: ponovni update istega shareId osveži ime/čas BREZ dvojnih vrstic", async () => {
    storage.clear();
    // stara vrstica (ročno sejana, ZASTAREL čas — deterministično)
    storage.setItem(
      "dai:my-trips",
      JSON.stringify([
        { shareId: "shareAAA", name: "Staro ime", savedAt: "2026-01-01T00:00:00.000Z" },
      ])
    );
    patchResponse = {
      success: true,
      contentVersion: 4,
      revisionSaved: true,
      name: "Novo ime s strežnika",
    };
    const upd = await updateItinerary("shareAAA", fixtureItinerary(), 3);
    addSavedTrip("shareAAA", upd.name ?? deriveSavedTripName(fixtureItinerary()));

    const trips = readRawTrips();
    expect(trips).toHaveLength(1);
    expect(trips[0].shareId).toBe("shareAAA");
    expect(trips[0].name).toBe("Novo ime s strežnika");
    expect(trips[0].savedAt > "2026-01-01T00:00:00.000Z").toBe(true);
  });

  test("fallback ime: strežnik brez imena → deriveSavedTripName (destinacije)", async () => {
    storage.clear();
    patchResponse = { success: true, contentVersion: 1, revisionSaved: false };
    const upd = await updateItinerary("shareBBB", fixtureItinerary(), 0);
    expect(upd.name).toBeNull();
    addSavedTrip("shareBBB", upd.name ?? deriveSavedTripName(fixtureItinerary()));

    const trips = readRawTrips();
    expect(trips).toHaveLength(1);
    expect(trips[0].name).toBe("Bled · Soteska Vintgar");
  });

  test("premik na vrh seznama: osvežena pot postane najnovejša (getSavedTrips)", () => {
    storage.clear();
    addSavedTrip("tripOLD", "Prva pot");
    addSavedTrip("tripNEW", "Druga pot");
    expect(getSavedTrips()[0].shareId).toBe("tripNEW");
    // osvežitev starejše poti (update-pot) jo premakne na vrh — uporabnik
    // vidi SVEŽE shranjeno pot prvo, ne 1. januarja sejane
    addSavedTrip("tripOLD", "Prva pot (osvežena)");
    const trips = getSavedTrips();
    expect(trips).toHaveLength(2);
    expect(trips[0].shareId).toBe("tripOLD");
    expect(trips[0].name).toBe("Prva pot (osvežena)");
  });

  test("različne poti se NE deduplicirajo (ključ je shareId, ne ime)", async () => {
    storage.clear();
    patchResponse = {
      success: true,
      contentVersion: 2,
      revisionSaved: true,
      name: null,
    };
    const it = fixtureItinerary();
    const updX = await updateItinerary("shareX", it, 1);
    addSavedTrip("shareX", updX.name ?? deriveSavedTripName(it));
    const updY = await updateItinerary("shareY", it, 1);
    addSavedTrip("shareY", updY.name ?? deriveSavedTripName(it));

    const trips = readRawTrips();
    expect(trips).toHaveLength(2);
    expect(trips.map((t) => t.shareId).sort()).toEqual(["shareX", "shareY"]);
  });
});
