// SLOVENIA PASS — posvečena regresijska varovalka (1.153.1).
//
// Zapira vrzel kandidata #4 iz zaključnega audita #17 (17-A): »Slovenia Pass
// (/slovenia-pass, pass-logic) nima posvečenega testa« — edina od ~34 funkcij
// §4 brez lastne evidence.
//
// Pokriva:
//  1. FUNKCIONALNO — loadPass/sanitizacija (pokvarjen JSON, delni podatki,
//     ne-veljavni tipi), awardPoints, markRegionVisited (idempotenca),
//     recordItineraryGenerated (+50, regije, števci kategorij, idempotenca
//     po NABORU destinacij — vrstni red se ignorira), recordDestinationViewed
//     (+10, idempotenca, neznana destinacija = poštena meja), recordListingViewed
//     (+5, idempotenca).
//  2. ZNAČKE — vsi pogoji odklopa (explorer 3 regije, nature 5, foodie 3,
//     adventure 3, local 5, master VSEH 9 slovenskih regij); PASS_BADGES
//     integriteta (6 unikatnih id-jev, neprazna polja).
//  3. MASTER FIX (1.153.1, NAJVAŽNEJŠE): DESTINATIONS pokriva tudi Balkan
//     (dalmacija, istra, kvartner, lika, kontinentalna-hrvaska, boka-kotorska,
//     crnogorsko-primorje, severna/osrednja-crna-gora, albanija — 11 regij),
//     zato prejšnji pogoj visitedRegions.length >= 9 NI bil »vseh 9 regij«:
//     izključno balkanski itinerer bi odklenil master in števec pokazal
//     »10+/9«. Zdaj: master zahteva vseh 9 SLOVENSKIH regij (PASS_REGIONS),
//     števec šteje samo slovenske, balkanski obiski se v visitedRegions
//     zapišejo pošteno (točke + explorer še vedno delujejo).
//  4. ENA TOČKA RESNICE: pogoji značk + seznam regij živijo SAMO v lib
//     (computeUnlockedBadges / PASS_REGIONS) — komponenta ne duplicira več
//     (drift tveganje istega razreda kot refId split, popravljen 1.153.0).
//  5. DOGODKI: savePass → "passUpdated"; mutacije → "passToast" sporočila
//     (+N točk, razlogi, objava novih značk).
//  6. SOURCE-CONTRACT: komponenta posluša itineraryGenerated/
//     destinationViewed/listingViewed/passUpdated/passToast; razpošiljalci
//     (itinerary-planner, destination-modal, listing-modal) oddajajo kanonske
//     detajle; stran /slovenia-pot mountira sekcijo + klepeta.
//  7. PODATKOVNA POGODBA: vsaka od 9 slovenskih regij ima ≥1 destinacijo v
//     T1 datasetu (master je DOSEGLJIV, ne mrtva značka).

import { describe, expect, test, beforeAll, afterAll, beforeEach } from "bun:test";
import { readFileSync } from "node:fs";

import {
  PASS_BADGES,
  PASS_REGIONS,
  PASS_STORAGE_KEY,
  computeUnlockedBadges,
  countVisitedSlovenianRegions,
  loadPass,
  awardPoints,
  markRegionVisited,
  recordItineraryGenerated,
  recordDestinationViewed,
  recordListingViewed,
  type SloveniaPassData,
} from "@/lib/pass-logic";
import { DESTINATIONS } from "@/lib/slovenia-data";
import type { LocationVisit } from "@/lib/types";

const PASS_SRC = readFileSync(
  new URL("../../lib/pass-logic.ts", import.meta.url),
  "utf8"
);
const COMPONENT_SRC = readFileSync(
  new URL("../../components/slovenia-pass.tsx", import.meta.url),
  "utf8"
);
const SECTION_SRC = readFileSync(
  new URL("../../components/slovenia-pass-section.tsx", import.meta.url),
  "utf8"
);
const PAGE_SRC = readFileSync(
  new URL("../../app/slovenia-pass/page.tsx", import.meta.url),
  "utf8"
);
const PLANNER_SRC = readFileSync(
  new URL("../../components/sections/itinerary-planner.tsx", import.meta.url),
  "utf8"
);
const DEST_MODAL_SRC = readFileSync(
  new URL("../../components/sections/destination-modal.tsx", import.meta.url),
  "utf8"
);
const LISTING_MODAL_SRC = readFileSync(
  new URL("../../components/sections/listing-modal.tsx", import.meta.url),
  "utf8"
);

// ---------------------------------------------------------------------------
// localStorage + window mock (isti vzorec kot task8-my-trip-core.test.ts)
// ---------------------------------------------------------------------------
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
  };
}

const storage = makeStorage();
const win = new EventTarget() as EventTarget & { localStorage: typeof storage };
win.localStorage = storage;
const g = globalThis as Record<string, unknown>;
let hadLocalStorage = false;
let hadWindow = false;
let prevLocalStorage: unknown;
let prevWindow: unknown;

// Zbiratelj toast sporočil (dogodek "passToast") in števec "passUpdated"
const toastMessages: string[] = [];
let passUpdatedCount = 0;
win.addEventListener("passToast", (e) => {
  const message = (e as CustomEvent<{ message?: string }>).detail?.message;
  if (typeof message === "string") toastMessages.push(message);
});
win.addEventListener("passUpdated", () => {
  passUpdatedCount += 1;
});

beforeAll(() => {
  hadLocalStorage = "localStorage" in g;
  prevLocalStorage = g.localStorage;
  hadWindow = "window" in g;
  prevWindow = g.window;
  g.localStorage = storage;
  g.window = win;
});

afterAll(() => {
  if (hadLocalStorage) g.localStorage = prevLocalStorage;
  else delete g.localStorage;
  if (hadWindow) g.window = prevWindow;
  else delete g.window;
});

beforeEach(() => {
  storage.clear();
  toastMessages.length = 0;
  passUpdatedCount = 0;
});

// ---------------------------------------------------------------------------
// pomožni gradniki
// ---------------------------------------------------------------------------

/** Minimalen LocationVisit (samo obvezna polja + neobvezna kategorija). */
function loc(destination_id: string, category?: string): LocationVisit {
  return {
    destination_id,
    destination_name: destination_id,
    time_slot: "10:00–11:00",
    duration: 60,
    estimated_cost: 10,
    notes: "",
    category,
  };
}

/** Id prve destinacije dane (slovenske) regije iz T1 dataseta. */
function destIdOfRegion(regionId: string): string {
  const dest = DESTINATIONS.find((d) => d.region === regionId);
  if (!dest) throw new Error(`regija ${regionId} nima destinacije v T1`);
  return dest.id;
}

/** Vseh 9 slovenskih regij → id-ji destinacij (po ena na regijo). */
const SLOVENIAN_DEST_IDS = PASS_REGIONS.map((r) => destIdOfRegion(r.id));

/** Balkanske regije v T1 datasetu (izven potnega lista Slovenije). */
const BALKAN_REGIONS = new Set([
  "kontinentalna-hrvaska",
  "lika",
  "kvartner",
  "istra",
  "dalmacija",
  "boka-kotorska",
  "crnogorsko-primorje",
  "severna-crna-gora",
  "osrednja-crna-gora",
  "osrednja-albanija",
  "juana-albanija",
]);
/** Po ENA destinacija na balkansko regijo (distinktne regije!). */
const BALKAN_DEST_BY_REGION = new Map<string, string>();
for (const d of DESTINATIONS) {
  if (BALKAN_REGIONS.has(d.region) && !BALKAN_DEST_BY_REGION.has(d.region)) {
    BALKAN_DEST_BY_REGION.set(d.region, d.id);
  }
}
const BALKAN_ITINERARY = [...BALKAN_DEST_BY_REGION.values()];

// Kanonski fixture (trajni T1 podatki — preverjeno pred uporabo):
const BLED = "bled"; // gorenjska, type "lake"
const BOHINJ = "bohinj"; // gorenjska, type "lake", bestFor narava/aktivnosti/mir
const LJUBLJANA = "ljubljana"; // osrednja, type "city", bestFor kultura/hrana/mesto

// ---------------------------------------------------------------------------
// 1. FUNKCIONALNO: loadPass + sanitizacija
// ---------------------------------------------------------------------------
describe("Slovenia Pass loadPass (sanitizacija stanja)", () => {
  test("prazen storage → privzeti pass", () => {
    const p = loadPass();
    expect(p.points).toBe(0);
    expect(p.visitedRegions).toEqual([]);
    expect(p.badges).toEqual([]);
    expect(p.natureVisits).toBe(0);
    expect(p.foodVisits).toBe(0);
    expect(p.activityVisits).toBe(0);
    expect(p.viewedListingIds).toEqual([]);
    expect(p.awardedDestinationIds).toEqual([]);
    expect(p.lastItineraryKey).toBeNull();
  });

  test("pokvarjen JSON → privzeti pass, brez meta", () => {
    storage.setItem(PASS_STORAGE_KEY, "{ni-veljaven-json");
    const p = loadPass();
    expect(p.points).toBe(0);
    expect(p.visitedRegions).toEqual([]);
  });

  test("delni (starejši) zapisi → zamankajoča polja dobijo privzetke (ZERO LOSS)", () => {
    storage.setItem(
      PASS_STORAGE_KEY,
      JSON.stringify({ points: 42, visitedRegions: ["gorenjska"] })
    );
    const p = loadPass();
    expect(p.points).toBe(42);
    expect(p.visitedRegions).toEqual(["gorenjska"]);
    expect(p.badges).toEqual([]); // dodana pozneje
    expect(p.viewedListingIds).toEqual([]); // dodana pozneje
    expect(p.lastItineraryKey).toBeNull();
  });

  test("ne-veljavni tipi se odstranijo/ponastavijo (neustrnljiv storage)", () => {
    storage.setItem(
      PASS_STORAGE_KEY,
      JSON.stringify({
        visitedRegions: ["gorenjska", 42, null, true],
        badges: [7, "explorer"],
        viewedListingIds: ["a", { x: 1 }],
        awardedDestinationIds: "ne-seznam",
        points: "štirideset",
        natureVisits: true,
        foodVisits: Number.NaN,
        activityVisits: Infinity,
        lastItineraryKey: 99,
      })
    );
    const p = loadPass();
    expect(p.visitedRegions).toEqual(["gorenjska"]);
    expect(p.badges).toEqual(["explorer"]);
    expect(p.viewedListingIds).toEqual(["a"]);
    expect(p.awardedDestinationIds).toEqual([]);
    expect(p.points).toBe(0);
    expect(p.natureVisits).toBe(0);
    expect(p.foodVisits).toBe(0);
    expect(p.activityVisits).toBe(0);
    expect(p.lastItineraryKey).toBeNull();
  });

  test("PASS_STORAGE_KEY je discoverslovenia_pass (kompatibilnost obstoječih uporabnikov)", () => {
    expect(PASS_STORAGE_KEY).toBe("discoverslovenia_pass");
  });

  test("FRESH DEFAULT FIX 1.153.1: privzeto stanje NE deli tabel s prejšnjimi mutacijami", () => {
    // prva mutacija po PRAZNEM storage-u (prej: deljena referenca s privzetkom)
    markRegionVisited("gorenjska");
    recordListingViewed("l1");
    awardPoints(10);
    // simuliraj propad persistente (zasebni način: setItem ne uspe / prazno)
    storage.clear();
    const fresh = loadPass();
    expect(fresh.visitedRegions).toEqual([]); // NE ["gorenjska"] (duhovne regije)
    expect(fresh.viewedListingIds).toEqual([]); // NE ["l1"] (duhovni lokalci)
    expect(fresh.points).toBe(0);
    expect(fresh.badges).toEqual([]);

    // dve zaporedni privzeti branji tudi ne delita tabel med sabo
    const a = loadPass();
    const b = loadPass();
    expect(a.visitedRegions).not.toBe(b.visitedRegions);
    expect(a.badges).not.toBe(b.badges);
    expect(a.viewedListingIds).not.toBe(b.viewedListingIds);
    expect(a.awardedDestinationIds).not.toBe(b.awardedDestinationIds);
  });
});

// ---------------------------------------------------------------------------
// 2. FUNKCIONALNO: awardPoints + persistenca + toast
// ---------------------------------------------------------------------------
describe("Slovenia Pass awardPoints", () => {
  test("kopiči točke, persistira, sporoči toast", () => {
    awardPoints(10, "razlog");
    awardPoints(5);
    const p = loadPass();
    expect(p.points).toBe(15);
    expect(passUpdatedCount).toBe(2);
    expect(toastMessages).toContain("🇸🇮 Slovenia Pass: +10 točk (razlog)");
    expect(toastMessages).toContain("🇸🇮 Slovenia Pass: +5 točk");
  });
});

// ---------------------------------------------------------------------------
// 3. FUNKCIONALNO: markRegionVisited (idempotenca)
// ---------------------------------------------------------------------------
describe("Slovenia Pass markRegionVisited", () => {
  test("prvi obisk spremeni stanje, drugi NE (idempotentno)", () => {
    const first = markRegionVisited("gorenjska");
    expect(first.changed).toBe(true);
    expect(first.pass.visitedRegions).toEqual(["gorenjska"]);

    const second = markRegionVisited("gorenjska");
    expect(second.changed).toBe(false);
    expect(second.newBadges).toEqual([]);
    expect(loadPass().visitedRegions).toEqual(["gorenjska"]); // brez duplikata
  });

  test("3 različne regije odklenejo explorer (objava značke v toast-u)", () => {
    markRegionVisited("gorenjska");
    markRegionVisited("primorska");
    const third = markRegionVisited("kras");
    expect(third.newBadges).toContain("explorer");
    expect(toastMessages).toContain("🗺️ Nova značka: Explorer!");
    expect(loadPass().badges).toContain("explorer");
  });
});

// ---------------------------------------------------------------------------
// 4. FUNKCIONALNO: recordItineraryGenerated
// ---------------------------------------------------------------------------
describe("Slovenia Pass recordItineraryGenerated", () => {
  test("+50 točk + obiskane regije + toast + persistenca ključa", () => {
    const r = recordItineraryGenerated({
      destinationIds: [BLED, LJUBLJANA],
    });
    expect(r.changed).toBe(true);
    const p = loadPass();
    expect(p.points).toBe(50);
    expect(p.visitedRegions.sort()).toEqual(["gorenjska", "osrednja"].sort());
    expect(p.lastItineraryKey).toBe([BLED, LJUBLJANA].sort().join("|"));
    expect(toastMessages).toContain("🇸🇮 Slovenia Pass: +50 točk (AI načrt)");
  });

  test("idempotentno po NABORU destinacij — vrstni red se ignorira", () => {
    recordItineraryGenerated({ destinationIds: [BLED, LJUBLJANA] });
    const again = recordItineraryGenerated({
      destinationIds: [LJUBLJANA, BLED], // isti nabor, drugačen vrstni red
    });
    expect(again.changed).toBe(false);
    expect(loadPass().points).toBe(50); // ne dvojno nagrajevanje
  });

  test("drugačen nabor destinacij → novo nagrajevanje (+50)", () => {
    recordItineraryGenerated({ destinationIds: [BLED] });
    const second = recordItineraryGenerated({ destinationIds: [BLED, BOHINJ] });
    expect(second.changed).toBe(true);
    expect(loadPass().points).toBe(100);
  });

  test("prazen seznam → brez spremembe", () => {
    const r = recordItineraryGenerated({ destinationIds: [] });
    expect(r.changed).toBe(false);
    expect(loadPass().points).toBe(0);
  });

  test("ne-nizi v destinationIds se odstranijo (obrambna sanitizacija)", () => {
    const r = recordItineraryGenerated({
      destinationIds: [42, BLED, null, undefined] as unknown as string[],
    });
    expect(r.changed).toBe(true);
    expect(loadPass().visitedRegions).toEqual(["gorenjska"]);
    expect(loadPass().points).toBe(50);
  });

  test("števci kategorij — narava po TIPU destinacije (bled: lake)", () => {
    recordItineraryGenerated({ destinationIds: [BLED] });
    const p = loadPass();
    expect(p.natureVisits).toBe(1);
  });

  test("števci kategorij — hrana po bestFor (ljubljana: hrana)", () => {
    recordItineraryGenerated({ destinationIds: [LJUBLJANA] });
    const p = loadPass();
    expect(p.foodVisits).toBe(1);
    expect(p.natureVisits).toBe(0); // city
    expect(p.activityVisits).toBe(0);
  });

  test("števci kategorij — kategorija OBISKA iz locations (restaurant/bar/activity)", () => {
    // bled nima lastnega hrana/aktivnost signala → števec samo iz kategorije obiska
    recordItineraryGenerated({
      destinationIds: [BLED],
      locations: [loc(BLED, "restaurant")],
    });
    let p = loadPass();
    expect(p.foodVisits).toBe(1);
    expect(p.natureVisits).toBe(1); // tip lake še vedno šteje naravo

    storage.clear();
    recordItineraryGenerated({
      destinationIds: [BLED],
      locations: [loc(BLED, "activity")],
    });
    p = loadPass();
    expect(p.activityVisits).toBe(1);
    expect(p.foodVisits).toBe(0);

    storage.clear();
    recordItineraryGenerated({
      destinationIds: [BLED],
      locations: [loc(BLED, "bar")],
    });
    expect(loadPass().foodVisits).toBe(1);
  });

  test("kategorija obiska se nanaša na pripadajočo destinacijo (destination_id)", () => {
    // kategorija "restaurant" pod ljubljanskim obiskom NE šteje za bled
    recordItineraryGenerated({
      destinationIds: [BLED],
      locations: [loc(LJUBLJANA, "restaurant")],
    });
    const p = loadPass();
    expect(p.foodVisits).toBe(0); // bled: ni hrane ne iz bestFor ne iz lastne kategorije
  });
});

// ---------------------------------------------------------------------------
// 5. FUNKCIONALNO: recordDestinationViewed + recordListingViewed
// ---------------------------------------------------------------------------
describe("Slovenia Pass recordDestinationViewed", () => {
  test("+10 točk + obisk regije + idempotenca po destinaciji", () => {
    const first = recordDestinationViewed(BLED);
    expect(first.changed).toBe(true);
    let p = loadPass();
    expect(p.points).toBe(10);
    expect(p.visitedRegions).toEqual(["gorenjska"]);
    expect(p.awardedDestinationIds).toEqual([BLED]);
    expect(toastMessages).toContain("🇸🇮 Slovenia Pass: +10 točk (nova destinacija)");

    const second = recordDestinationViewed(BLED);
    expect(second.changed).toBe(false);
    p = loadPass();
    expect(p.points).toBe(10); // ne dvojno
    expect(p.awardedDestinationIds).toEqual([BLED]);
  });

  test("neznana destinacija → točke da, regije NE (poštena meja brez ugibanja)", () => {
    const r = recordDestinationViewed("ne-obstojeca-destinacija");
    expect(r.changed).toBe(true);
    const p = loadPass();
    expect(p.points).toBe(10);
    expect(p.visitedRegions).toEqual([]);
    expect(p.awardedDestinationIds).toEqual(["ne-obstojeca-destinacija"]);
  });
});

describe("Slovenia Pass recordListingViewed", () => {
  test("+5 točk + idempotenca po lokalcu", () => {
    const first = recordListingViewed("listing-1");
    expect(first.changed).toBe(true);
    expect(loadPass().points).toBe(5);
    expect(toastMessages).toContain("🇸🇮 Slovenia Pass: +5 točk (lokalni ponudnik)");

    const second = recordListingViewed("listing-1");
    expect(second.changed).toBe(false);
    expect(loadPass().points).toBe(5);

    recordListingViewed("listing-2");
    const p = loadPass();
    expect(p.viewedListingIds).toEqual(["listing-1", "listing-2"]);
    expect(p.points).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// 6. ZNAČKE — pogoji odklopa + MASTER FIX (1.153.1)
// ---------------------------------------------------------------------------
describe("Slovenia Pass značke (pogoji odklopa)", () => {
  test("nature: 5 naravnih destinacij v itinererjih", () => {
    // bled (lake) + bohinj (lake) + postojna (cave) + piran (coast) + dravograd (river)
    const natureIds = ["bled", "bohinj", "postojna", "piran", "dravograd"];
    for (const id of natureIds) {
      const d = DESTINATIONS.find((x) => x.id === id);
      expect(d, `destinacija ${id} manjka v T1`).toBeDefined();
      expect(
        ["mountain", "lake", "river", "gorge", "cave", "coast"]
      ).toContain(d!.type);
    }
    const r = recordItineraryGenerated({ destinationIds: natureIds });
    expect(r.pass.natureVisits).toBe(5);
    expect(r.newBadges).toContain("nature");
  });

  test("foodie: 3 gastro obiski (kategorija restaurant)", () => {
    for (const id of [BLED, BOHINJ, destIdOfRegion("kras")]) {
      recordItineraryGenerated({
        destinationIds: [id],
        locations: [loc(id, "restaurant")],
      });
    }
    const p = loadPass();
    expect(p.foodVisits).toBe(3);
    expect(p.badges).toContain("foodie");
  });

  test("adventure: 3 aktivnosti", () => {
    recordItineraryGenerated({ destinationIds: [BOHINJ] }); // bestFor aktivnosti
    recordItineraryGenerated({
      destinationIds: [BLED],
      locations: [loc(BLED, "activity")],
    });
    recordItineraryGenerated({
      destinationIds: [destIdOfRegion("kras")],
      locations: [loc(destIdOfRegion("kras"), "activity")],
    });
    const p = loadPass();
    expect(p.activityVisits).toBe(3);
    expect(p.badges).toContain("adventure");
  });

  test("local: 5 ogledov lokalov", () => {
    for (let i = 1; i <= 5; i++) recordListingViewed(`lok-${i}`);
    const p = loadPass();
    expect(p.viewedListingIds).toHaveLength(5);
    expect(p.badges).toContain("local");
  });

  test("PASS_BADGES integriteta: 6 unikatnih, popolnoma napolnjenih značk", () => {
    expect(PASS_BADGES).toHaveLength(6);
    const ids = PASS_BADGES.map((b) => b.id);
    expect(new Set(ids).size).toBe(6);
    for (const b of PASS_BADGES) {
      expect(b.id.length).toBeGreaterThan(0);
      expect(b.name.length).toBeGreaterThan(0);
      expect(b.emoji.length).toBeGreaterThan(0);
      expect(b.description.length).toBeGreaterThan(0);
    }
  });

  test("master: VSEH 9 slovenskih regij (itinerer čez vso Slovenijo)", () => {
    expect(SLOVENIAN_DEST_IDS).toHaveLength(9);
    const r = recordItineraryGenerated({
      destinationIds: SLOVENIAN_DEST_IDS,
    });
    expect(countVisitedSlovenianRegions(r.pass.visitedRegions)).toBe(9);
    expect(r.newBadges).toContain("master");
    expect(r.newBadges).toContain("explorer");
  });
});

describe("MASTER FIX 1.153.1 — balkanski obiski NE štejejo kot slovenske regije", () => {
  test("izključno balkanski itinerer (≥9 regij) NE odklene master", () => {
    // T1 podatkovna pogodba: ≥9 distinktnih balkanskih regij obstaja
    // (zemljevid „Slovenija in Balkan“) — sicer ta varovalka nima smisla
    expect(BALKAN_ITINERARY.length).toBeGreaterThanOrEqual(9);

    const r = recordItineraryGenerated({ destinationIds: BALKAN_ITINERARY });
    expect(r.pass.visitedRegions.length).toBeGreaterThanOrEqual(9); // pošteno zapisano
    expect(r.newBadges).toContain("explorer"); // „3+ regije“ — opis ne omejuje na Slovenijo
    expect(r.newBadges).not.toContain("master"); // »vseh 9 regij« = slovenske
    expect(countVisitedSlovenianRegions(r.pass.visitedRegions)).toBe(0);
    expect(computeUnlockedBadges(r.pass).has("master")).toBe(false);
  });

  test("8 slovenskih + 3 balkanske regije → še vedno brez master; dopolnjena 9. slovenska ga odklene", () => {
    const eightSlovenian = SLOVENIAN_DEST_IDS.slice(0, 8);
    const balkan = BALKAN_ITINERARY.slice(0, 3);
    const r1 = recordItineraryGenerated({
      destinationIds: [...eightSlovenian, ...balkan],
    });
    expect(r1.pass.visitedRegions).toHaveLength(11);
    expect(countVisitedSlovenianRegions(r1.pass.visitedRegions)).toBe(8);
    expect(r1.newBadges).not.toContain("master");

    // manjkajoča slovenska regija (9.) prek obiska destinacije
    const missingRegionId = PASS_REGIONS.find(
      (r) => !r1.pass.visitedRegions.includes(r.id)
    )?.id;
    expect(missingRegionId).toBeDefined();
    const r2 = recordDestinationViewed(destIdOfRegion(missingRegionId as string));
    expect(r2.newBadges).toContain("master");
  });

  test("countVisitedSlovenianRegions ignorira balkanske vnose", () => {
    expect(countVisitedSlovenianRegions(["dalmacija", "istra", "kvartner"])).toBe(0);
    expect(countVisitedSlovenianRegions(["gorenjska", "dalmacija"])).toBe(1);
    expect(countVisitedSlovenianRegions(PASS_REGIONS.map((r) => r.id))).toBe(9);
  });
});

// ---------------------------------------------------------------------------
// 7. ENA TOČKA RESNICE: computeUnlockedBadges + PASS_REGIONS pogodbe
// ---------------------------------------------------------------------------
describe("computeUnlockedBadges (prikaz = lib pogoji, persistirano ∪ stanje)", () => {
  test("maksimalen pass odklene vseh 6 značk (tudi brez persistiranih)", () => {
    const maximal: SloveniaPassData = {
      visitedRegions: PASS_REGIONS.map((r) => r.id),
      points: 999,
      badges: [],
      natureVisits: 5,
      foodVisits: 3,
      activityVisits: 3,
      viewedListingIds: ["l1", "l2", "l3", "l4", "l5"],
      awardedDestinationIds: [],
      lastItineraryKey: null,
    };
    const unlocked = computeUnlockedBadges(maximal);
    for (const b of PASS_BADGES) {
      expect(unlocked.has(b.id)).toBe(true);
    }
  });

  test("persistirane značke ostanejo odklenjene tudi po padcu števcev", () => {
    const degraded: SloveniaPassData = {
      visitedRegions: [],
      points: 0,
      badges: ["explorer"],
      natureVisits: 0,
      foodVisits: 0,
      activityVisits: 0,
      viewedListingIds: [],
      awardedDestinationIds: [],
      lastItineraryKey: null,
    };
    expect(computeUnlockedBadges(degraded).has("explorer")).toBe(true);
    expect(computeUnlockedBadges(degraded).has("master")).toBe(false);
  });
});

describe("PASS_REGIONS (kanonski seznam 9 slovenskih regij)", () => {
  test("9 regij z id/ime/emoji", () => {
    expect(PASS_REGIONS).toHaveLength(9);
    for (const r of PASS_REGIONS) {
      expect(r.id.length).toBeGreaterThan(0);
      expect(r.name.length).toBeGreaterThan(0);
      expect(r.emoji.length).toBeGreaterThan(0);
    }
    expect(new Set(PASS_REGIONS.map((r) => r.id)).size).toBe(9);
  });

  test("PODATKOVNA POGODBA: vsaka regija ima ≥1 destinacijo v T1 (master dosegljiv)", () => {
    for (const r of PASS_REGIONS) {
      expect(
        DESTINATIONS.some((d) => d.region === r.id),
        `regija ${r.id} nima destinacij — master bi bil NEDOSEGLJIV`
      ).toBe(true);
    }
  });

  test("PASS_REGIONS se ne prekriva z balkanskimi regijami dataseta", () => {
    const slovenianIds = new Set(PASS_REGIONS.map((r) => r.id));
    for (const d of DESTINATIONS) {
      if (BALKAN_REGIONS.has(d.region)) {
        expect(slovenianIds.has(d.region)).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 8. DOGODKI (passUpdated / passToast)
// ---------------------------------------------------------------------------
describe("Slovenia Pass dogodki", () => {
  test("vsaka mutacija, ki shranjuje, sproži passUpdated (komponenta se osveži)", () => {
    awardPoints(1);
    markRegionVisited("gorenjska");
    recordItineraryGenerated({ destinationIds: [BLED] });
    recordDestinationViewed(BOHINJ);
    recordListingViewed("l1");
    expect(passUpdatedCount).toBe(5);
  });

  test("ne-spremenjene mutacije NE shranjujejo (idempotenca ne razpršuje dogodkov)", () => {
    markRegionVisited("gorenjska");
    markRegionVisited("gorenjska"); // idempotentna
    recordItineraryGenerated({ destinationIds: [] });
    recordItineraryGenerated({ destinationIds: [BLED] });
    recordItineraryGenerated({ destinationIds: [BLED] }); // isti nabor
    expect(passUpdatedCount).toBe(2); // 1 regija + 1 itinerer
  });
});

// ---------------------------------------------------------------------------
// 9. SOURCE-CONTRACT (priključitev površin)
// ---------------------------------------------------------------------------
describe("Slovenia Pass source-contract", () => {
  test("komponenta posluša VSE 3 domenske dogodke + passUpdated + passToast", () => {
    expect(COMPONENT_SRC).toContain('addEventListener("itineraryGenerated"');
    expect(COMPONENT_SRC).toContain('addEventListener("destinationViewed"');
    expect(COMPONENT_SRC).toContain('addEventListener("listingViewed"');
    expect(COMPONENT_SRC).toContain('addEventListener("passUpdated"');
    expect(COMPONENT_SRC).toContain('addEventListener("passToast"');
  });

  test("razpošiljalci oddajajo kanonske detajle (ista imena dogodkov + polja)", () => {
    expect(PLANNER_SRC).toContain('new CustomEvent("itineraryGenerated"');
    expect(PLANNER_SRC).toContain("destinationIds");
    expect(PLANNER_SRC).toContain("locations: data.days.flatMap");

    expect(DEST_MODAL_SRC).toContain('new CustomEvent("destinationViewed"');
    expect(DEST_MODAL_SRC).toContain("destinationId: destination.id");

    expect(LISTING_MODAL_SRC).toContain('new CustomEvent("listingViewed"');
    expect(LISTING_MODAL_SRC).toContain("listingId: listing.id");
  });

  test("stran /slovenia-pass mountira sekcijo (pass) + klepeta (asistent)", () => {
    expect(PAGE_SRC).toContain("SloveniaPassSection");
    expect(PAGE_SRC).toContain("<Chatbot />");
    expect(SECTION_SRC).toContain("<SloveniaPass />");
  });

  test("ENA TOČKA RESNICE: komponenta uvaža PASS_REGIONS + computeUnlockedBadges iz lib", () => {
    expect(COMPONENT_SRC).toContain("PASS_REGIONS");
    expect(COMPONENT_SRC).toContain("computeUnlockedBadges");
    expect(COMPONENT_SRC).toContain("countVisitedSlovenianRegions");
    // duplikat seznama regij v komponenti je ODSTRANJEN (1.153.1)
    expect(COMPONENT_SRC).not.toContain("const REGIONS = [");
    // duplikat pogojev značk v komponenti je ODSTRANJEN (1.153.1)
    expect(COMPONENT_SRC).not.toContain("visitedRegions.length >= 9");
    expect(COMPONENT_SRC).not.toContain("natureVisits >= 5");
  });

  test("lib master pogoj zahteva vseh 9 slovenskih regij (ne število ≥ 9)", () => {
    expect(PASS_SRC).toContain(
      "master: (p) => PASS_REGIONS.every((r) => p.visitedRegions.includes(r.id))"
    );
    expect(PASS_SRC).not.toContain("visitedRegions.length >= 9");
  });

  test("števec regij v komponenti šteje samo slovenske (ne surovo dolžino)", () => {
    expect(COMPONENT_SRC).toContain("{slovenianVisited}/{PASS_REGIONS.length}");
    expect(COMPONENT_SRC).not.toContain("{pass.visitedRegions.length}/9");
  });
});
