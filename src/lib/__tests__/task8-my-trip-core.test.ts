// TASK 8 / D8-C — jedro zbirke "Moja pot": domenski testi src/lib/my-trip.ts
// (add/dedupe/FIFO/sanitize/subscribe/handoff) + source-contract primitiv.
//
// localStorage mock (bun nima DOM) — vzorec task99b-state-consolidation:
// globalni `localStorage` + `window.localStorage`, afterAll POČISTI globala.

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "node:fs";

import {
  addMyTripItem,
  removeMyTripItem,
  isInMyTrip,
  getMyTripItems,
  myTripCount,
  clearMyTripItems,
  subscribeMyTrip,
  myTripKey,
  setMyTripHandoff,
  hasMyTripHandoff,
  consumeMyTripHandoff,
  MY_TRIP_STORAGE_KEY,
  MY_TRIP_CHANGED_EVENT_NAME,
  MAX_MY_TRIP_ITEMS,
  type MyTripInput,
} from "../my-trip";

const BUTTON_SRC = readFileSync(
  new URL("../../components/add-to-trip-button.tsx", import.meta.url),
  "utf8",
);
const VIEW_SRC = readFileSync(
  new URL("../../components/my-trip-view.tsx", import.meta.url),
  "utf8",
);

// ---------------------------------------------------------------------------
// localStorage mock
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
const session = makeStorage();
// EventTarget kot window — addEventListener/removeEventListener/dispatchEvent
// delujejo (CustomEvent podpira bun globalno); + oba storage mock-a.
const win = new EventTarget() as EventTarget & {
  localStorage: typeof storage;
  sessionStorage: typeof session;
};
win.localStorage = storage;
win.sessionStorage = session;
const g = globalThis as Record<string, unknown>;
let hadLocalStorage = false;
let hadWindow = false;
let hadSessionStorage = false;
let prevLocalStorage: unknown;
let prevWindow: unknown;
let prevSessionStorage: unknown;

beforeAll(() => {
  hadLocalStorage = "localStorage" in g;
  prevLocalStorage = g.localStorage;
  hadWindow = "window" in g;
  prevWindow = g.window;
  hadSessionStorage = "sessionStorage" in g;
  prevSessionStorage = g.sessionStorage;
  g.localStorage = storage;
  g.window = win;
  // handoff uporablja globalni sessionStorage (vzorec wishlist-storage)
  g.sessionStorage = session;
});

afterAll(() => {
  if (hadLocalStorage) g.localStorage = prevLocalStorage;
  else delete g.localStorage;
  if (hadWindow) g.window = prevWindow;
  else delete g.window;
  if (hadSessionStorage) g.sessionStorage = prevSessionStorage;
  else delete g.sessionStorage;
});

function sample(over: Partial<MyTripInput> = {}): MyTripInput {
  return {
    kind: "destination",
    refId: "bled",
    title: "Bled",
    subtitle: "Gorenjska",
    href: "/destinacija/bled",
    source: "test",
    ...over,
  };
}

// ---------------------------------------------------------------------------
// 1. DOMENA: dodajanje / dedup / identiteta
// ---------------------------------------------------------------------------
describe("TASK 8 / D8-C — my-trip domena (dodajanje)", () => {
  test("dodaj → prisoten, števec 1, add vrne added=true", () => {
    clearMyTripItems();
    const r = addMyTripItem(sample());
    expect(r.added).toBe(true);
    expect(r.evictedTitle).toBeUndefined();
    expect(isInMyTrip("destination", "bled")).toBe(true);
    expect(myTripCount()).toBe(1);
    expect(getMyTripItems()[0]?.title).toBe("Bled");
  });

  test("idempotenca: ponovni dodatek istega kind:refId NE ustvari duplikata", () => {
    clearMyTripItems();
    addMyTripItem(sample());
    const r2 = addMyTripItem(sample({ title: "Bled (osveženo)" }));
    expect(r2.added).toBe(false);
    expect(myTripCount()).toBe(1);
    // osvežitev podatkov + najnovejši prvi
    expect(getMyTripItems()[0]?.title).toBe("Bled (osveženo)");
  });

  test("isti refId v DVEH vrstah = dva ločena predmeta (kind je del identitete)", () => {
    clearMyTripItems();
    addMyTripItem(sample()); // destination:bled
    addMyTripItem(sample({ kind: "poi", href: "/zemljevid?lat=1&lng=2" })); // poi:bled
    expect(myTripCount()).toBe(2);
    expect(myTripKey("destination", "bled")).toBe("destination:bled");
  });

  test("removeMyTripItem odstrani točno določen predmet", () => {
    clearMyTripItems();
    addMyTripItem(sample());
    addMyTripItem(sample({ refId: "bohinj", title: "Bohinj" }));
    removeMyTripItem("destination", "bled");
    expect(myTripCount()).toBe(1);
    expect(getMyTripItems()[0]?.refId).toBe("bohinj");
    // odstranitev nepričakovanega je tiha (nobenega meta)
    removeMyTripItem("event", "ne-obstaja");
    expect(myTripCount()).toBe(1);
  });

  test("clearMyTripItems izprazni zbirko", () => {
    addMyTripItem(sample());
    clearMyTripItems();
    expect(myTripCount()).toBe(0);
    expect(isInMyTrip("destination", "bled")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. SANITIZACIJA (varnostne meje — pokvarjen storage ne sesuje app)
// ---------------------------------------------------------------------------
describe("TASK 8 / D8-C — sanitizacija vnosa", () => {
  test("neveljaven kind → zavrnjen (nič se ne zapiše)", () => {
    clearMyTripItems();
    const r = addMyTripItem(sample({ kind: "hack" as MyTripInput["kind"] }));
    expect(r.added).toBe(false);
    expect(myTripCount()).toBe(0);
  });

  test("ZUNANJI href je zavrnjen — samo notranje relativne poti (XSS past)", () => {
    clearMyTripItems();
    addMyTripItem(sample({ href: "https://evil.example.com/x" }));
    addMyTripItem(sample({ refId: "x2", href: "//protocol-relative.com" }));
    expect(myTripCount()).toBe(0);
  });

  test("manjkajoč naslov ali refId → zavrnjen", () => {
    clearMyTripItems();
    addMyTripItem(sample({ title: "   " }));
    addMyTripItem(sample({ refId: "" }));
    expect(myTripCount()).toBe(0);
  });

  test("predolgi nizi se prisekojo (meje shrambe)", () => {
    clearMyTripItems();
    addMyTripItem(sample({ title: "x".repeat(500), subtitle: "y".repeat(500) }));
    const item = getMyTripItems()[0];
    expect(item?.title.length).toBe(160);
    expect(item?.subtitle?.length).toBe(200);
  });

  test("pokvarjen JSON v storage se tiho preskoči (defenzivnost)", () => {
    clearMyTripItems();
    storage.setItem(MY_TRIP_STORAGE_KEY, "{not json");
    expect(myTripCount()).toBe(0);
    // dodajanje čez pokvarjen podatek uspe (samoozdravitev)
    const r = addMyTripItem(sample());
    expect(r.added).toBe(true);
    expect(myTripCount()).toBe(1);
  });

  test("neveljavni vnosi v POLJU se preskočijo, veljavni ostanejo", () => {
    clearMyTripItems();
    storage.setItem(
      MY_TRIP_STORAGE_KEY,
      JSON.stringify([
        { kind: "destination", refId: "ok", title: "OK", href: "/destinacija/ok", addedAt: "2026-01-01" },
        { kind: "nope", refId: "bad", title: "Bad", href: "/x" },
        null,
      ])
    );
    expect(myTripCount()).toBe(1);
    expect(getMyTripItems()[0]?.refId).toBe("ok");
  });
});

// ---------------------------------------------------------------------------
// 3. FIFO KAPACITETA
// ---------------------------------------------------------------------------
describe("TASK 8 / D8-C — FIFO kapaciteta", () => {
  test(`kapaciteta ${MAX_MY_TRIP_ITEMS}: najstarejši odpade + evictedTitle obvestilo`, () => {
    clearMyTripItems();
    for (let i = 0; i < MAX_MY_TRIP_ITEMS; i++) {
      addMyTripItem(sample({ refId: `d-${i}`, title: `Destinacija ${i}` }));
    }
    expect(myTripCount()).toBe(MAX_MY_TRIP_ITEMS);
    const r = addMyTripItem(sample({ refId: "nova", title: "Nova" }));
    expect(myTripCount()).toBe(MAX_MY_TRIP_ITEMS);
    expect(r.evictedTitle).toBe("Destinacija 0");
    expect(isInMyTrip("destination", "d-0")).toBe(false);
    expect(isInMyTrip("destination", "nova")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. SINHRONIZACIJA (custom dogodek + storage cross-tab)
// ---------------------------------------------------------------------------
describe("TASK 8 / D8-C — sinhtonizacija (dogodki)", () => {
  test("subscribeMyTrip se sproži ob dodajanju/odstranjevanju (isti zavihek)", () => {
    clearMyTripItems();
    let calls = 0;
    const unsub = subscribeMyTrip(() => {
      calls++;
    });
    addMyTripItem(sample());
    removeMyTripItem("destination", "bled");
    unsub();
    // po odjavi dogodki ne prihajajo več
    addMyTripItem(sample());
    expect(calls).toBe(2);
    expect(MY_TRIP_CHANGED_EVENT_NAME).toBe("dai:my-trip-changed");
  });
});

// ---------------------------------------------------------------------------
// 5. HANDOFF (Moja pot → načrtovalnik)
// ---------------------------------------------------------------------------
describe("TASK 8 / D8-C — handoff zastavica", () => {
  test("set → has → consume (enkratno prevzemanje)", () => {
    expect(hasMyTripHandoff()).toBe(false);
    setMyTripHandoff();
    expect(hasMyTripHandoff()).toBe(true);
    expect(consumeMyTripHandoff()).toBe(true);
    expect(hasMyTripHandoff()).toBe(false);
    expect(consumeMyTripHandoff()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. SOURCE-CONTRACT: primitiva + pogled
// ---------------------------------------------------------------------------
describe("TASK 8 / D8-C — source-contract primitiv", () => {
  test("AddToTripButton: trije varianti, kanonski besednjak, 44px tarče, toast z Odpri pot", () => {
    expect(BUTTON_SRC).toContain('export type AddToTripVariant = "full" | "compact" | "icon"');
    expect(BUTTON_SRC).toContain('add: "Dodaj v mojo pot"');
    expect(BUTTON_SRC).toContain('added: "V moji poti"');
    expect(BUTTON_SRC).toContain('openTrip: "Odpri pot"');
    // EN pariteta
    expect(BUTTON_SRC).toContain('add: "Add to my trip"');
    expect(BUTTON_SRC).toContain('added: "In my trip"');
    // dostopnost: aria-pressed + sr-only za ikonsko izvedbo
    expect(BUTTON_SRC).toContain("aria-pressed={inTrip}");
    expect(BUTTON_SRC).toContain('className="sr-only"');
    // 44px v vseh velikostih
    expect(BUTTON_SRC).toContain("min-h-11");
    expect(BUTTON_SRC).toContain("size-11");
    // toast akcija vodi na #moja-pot sidro
    expect(BUTTON_SRC).toContain('"/moja-potovanja#moja-pot"');
    // razveljavitev odstranitve
    expect(BUTTON_SRC).toContain('undo: "Dodaj nazaj"');
  });

  test("AddToTripButton: controlled način (write-through površine) + emerald stanje", () => {
    expect(BUTTON_SRC).toContain("added?: boolean");
    expect(BUTTON_SRC).toContain("onToggle?: (nextAdded: boolean");
    // emerald slovnica (enotna z dogodki v načrtovalniku, ločena od srčka)
    expect(BUTTON_SRC).toContain("border-emerald-500/50 bg-emerald-500/10");
    expect(BUTTON_SRC).toContain("border-primary/40 text-primary hover:bg-primary/10");
  });

  test("MyTripView: skupine po vrstah, Nadaljuj načrtovanje (handoff), Počisti z undo", () => {
    expect(VIEW_SRC).toContain('id="moja-pot"');
    expect(VIEW_SRC).toContain('continue: "Nadaljuj načrtovanje"');
    expect(VIEW_SRC).toContain("setMyTripHandoff()");
    expect(VIEW_SRC).toContain('clear: "Počisti"');
    expect(VIEW_SRC).toContain("clearMyTripItems()");
    // prazen seznam = brez hrupa (ni praznega bloka)
    expect(VIEW_SRC).toContain("if (count === 0) return null;");
    // EN pariteta
    expect(VIEW_SRC).toContain('continue: "Continue planning"');
    // odstotek: 44px tarče
    expect(VIEW_SRC).toContain("min-h-11");
    expect(VIEW_SRC).toContain("size-11");
  });
});
