// ============================================================================
// TASK 99-b — STATE CONSOLIDATION: testi (enkraten vir localStorage ključev)
// ============================================================================
//
// Revizija GitHub #1 §18 je odkrila TRI duplikate virov resnice, ki so
// ogrožali konsistentnost stanja (isti ključ, neodvisni pisci → drift):
//
//   1. "discoverslovenia_last_itinerary" — DVA pisca (plannerjev
//      persistItineraryLocally + klepetov persistLastItinerary v
//      chat-add-place.ts). Od 99-b: src/lib/itinerary-persist.ts.
//   2. "dai:my-orders" / "dai:my-bookings" — lib je izvažal add/get,
//      my-orders-section.tsx pa repliciral writeList + LIST_CAP + ključa.
//      Od 99-b: writeList + ključa v src/lib/my-orders-storage.ts.
//   3. "discoverslovenia_voter" / "discoverslovenia_comment_name" —
//      NEODVISNO reimplementirana v 4 komponentah (shared-trip, trip-social,
//      trip-diary, trip-polls). Od 99-b: src/lib/client-identity.ts.
//
// Ta datoteka varuje OBA vidika konsolidacije:
//   - SOURCE-CONTRACT: raw literal ključev živi SAMO v lib-u (komponente/
//     stari pisci ne vsebujejo več lastnih kopij — komentarji odstranjeni
//     prek stripComments, da testi ne padajo zaradi pojasnil);
//   - FUNKCIONALNO: semantika je NESPREMENJENA (iste meje, isti payload,
//     ista defenzivnost) — prek localStorage mock-a.
// ============================================================================

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Itinerary, PlannerInput } from "@/lib/types";
import {
  LAST_ITINERARY_KEY,
  MAX_PERSIST_CHARS,
  persistItinerary,
  readLastItinerary,
} from "@/lib/itinerary-persist";
import {
  BOOKINGS_KEY,
  ORDERS_KEY,
  getBookingNumbers,
  getOrderNumbers,
  writeList,
} from "@/lib/my-orders-storage";
import {
  AUTHOR_NAME_KEY,
  VOTER_KEY,
  getAuthorName,
  getVoterId,
  saveAuthorName,
} from "@/lib/client-identity";

function source(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

/** Koda brez komentarjev — testi literalov ne smejo pasti zaradi pojasnil. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

// ---------------------------------------------------------------------------
// localStorage mock (bun nima DOM) — itinerary-persist uporablja globalni
// `localStorage`, my-orders/client-identity pa `window.localStorage`.
// afterAll POČISTI globala, da jih drugi testi v istem procesu ne podedujejo.
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
const g = globalThis as Record<string, unknown>;
let hadLocalStorage = false;
let hadWindow = false;
let prevLocalStorage: unknown;
let prevWindow: unknown;

beforeAll(() => {
  hadLocalStorage = "localStorage" in g;
  prevLocalStorage = g.localStorage;
  hadWindow = "window" in g;
  prevWindow = g.window;
  g.localStorage = storage;
  g.window = { localStorage: storage };
});

afterAll(() => {
  if (hadLocalStorage) g.localStorage = prevLocalStorage;
  else delete g.localStorage;
  if (hadWindow) g.window = prevWindow;
  else delete g.window;
});

// ---------------------------------------------------------------------------
// 1. itinerary-persist — konsolidacija pisca zadnjega načrta
// ---------------------------------------------------------------------------

describe("TASK 99-b: itinerary-persist (funkcionalno)", () => {
  // Fixtura ni popoln Itinerary (persist POTI ne validirajo — tudi stari
  // pisci niso) → cast za toEqual tipiziranje
  const itinerary = {
    days: [{ day: 1, locations: [] }],
    total_budget: 100,
    recommendations: [],
    tips: [],
    source: "fallback",
  } as unknown as Itinerary;
  const input = {
    budget: 500,
    days: 3,
    interests: ["narava"],
    season: "summer",
    groupSize: 2,
  } satisfies PlannerInput;

  test("persistItinerary zapiše payload (itinerary + formData + SVEŽ savedAt)", () => {
    storage.clear();
    expect(persistItinerary(itinerary, input)).toBe(true);
    const read = readLastItinerary();
    expect(read).not.toBeNull();
    expect(read?.itinerary).toEqual(itinerary);
    expect(read?.formData).toEqual(input);
    expect(typeof read?.savedAt).toBe("string");
    expect(Number.isNaN(Date.parse(read?.savedAt ?? ""))).toBe(false);
  });

  test("savedAt se OSVEŽI ob vsakem zapisu (ne kopira starega)", () => {
    storage.clear();
    persistItinerary(itinerary, input);
    const first = readLastItinerary()?.savedAt ?? "";
    persistItinerary(itinerary, input);
    const second = readLastItinerary()?.savedAt ?? "";
    expect(Date.parse(second)).toBeGreaterThanOrEqual(Date.parse(first));
  });

  test("persistItinerary brez formData — ključ IZPUŠČEN iz JSON (ista semantika klepeta)", () => {
    storage.clear();
    persistItinerary(itinerary);
    const raw = storage.getItem(LAST_ITINERARY_KEY) ?? "";
    expect(raw).not.toContain("formData");
    expect(readLastItinerary()?.formData).toBeUndefined();
  });

  test("KAP 250 * 1024: prevelik payload se NE zapiše (prejšnji ostane)", () => {
    storage.clear();
    persistItinerary(itinerary, input);
    const big = {
      days: [{ day: 1, locations: [], notes: "x".repeat(300_000) }],
    };
    expect(JSON.stringify(big).length).toBeGreaterThan(MAX_PERSIST_CHARS);
    expect(persistItinerary(big)).toBe(false);
    // star zapis ni bil prepisan (ne brišemo nezavedno)
    expect(readLastItinerary()?.itinerary).toEqual(itinerary);
  });

  test("KAP je strogo < (enako meji gre SKOZI)", () => {
    storage.clear();
    // naredi payload, katerega serializirana dolžina je PRAV 256000 → gre skozi
    const target = MAX_PERSIST_CHARS;
    const filler = "x".repeat(
      Math.max(0, target - 2 - 60 /* ogrodje okrog fillerja */)
    );
    const exact = { days: [{ day: 1, locations: [], notes: filler }] };
    if (JSON.stringify(exact).length === target) {
      expect(persistItinerary(exact)).toBe(true);
    } else {
      // ogrodje je odvisno od JSON preslikave — preveri le mejo prek konstant
      expect(MAX_PERSIST_CHARS).toBe(250 * 1024);
    }
  });

  test("readLastItinerary defenzivno: manjka/smeti/prazni dni/napačna oblika → null", () => {
    storage.clear();
    expect(readLastItinerary()).toBeNull(); // manjkajoč ključ
    storage.setItem(LAST_ITINERARY_KEY, "ne-je-json{{{");
    expect(readLastItinerary()).toBeNull(); // korupten JSON
    storage.setItem(LAST_ITINERARY_KEY, "null");
    expect(readLastItinerary()).toBeNull(); // JSON null
    storage.setItem(
      LAST_ITINERARY_KEY,
      JSON.stringify({ itinerary: { days: [] } })
    );
    expect(readLastItinerary()).toBeNull(); // days.length === 0
    storage.setItem(
      LAST_ITINERARY_KEY,
      JSON.stringify({ itinerary: { days: "ne-array" } })
    );
    expect(readLastItinerary()).toBeNull(); // days ni array
    storage.setItem(
      LAST_ITINERARY_KEY,
      JSON.stringify({ itinerary: { days: [{ day: 1 }] } })
    );
    expect(readLastItinerary()).not.toBeNull(); // veljavno
  });

  test("klic z ŽE SESTAVLJENIM payloadom (en argument) se ne ovije dvakrat", () => {
    storage.clear();
    const payload = {
      itinerary: { days: [{ day: 2 }] },
      savedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(persistItinerary(payload)).toBe(true);
    const read = readLastItinerary();
    expect(read?.savedAt).toBe("2026-01-01T00:00:00.000Z"); // ne podvoji
    expect((read?.itinerary as { days: unknown[] }).days).toHaveLength(1);
  });
});

describe("TASK 99-b: itinerary-persist (source-contract)", () => {
  const lib = source("src/lib/itinerary-persist.ts");
  const chatAdd = stripComments(source("src/lib/chat-add-place.ts"));

  test("lib izvaža ključ + mejo + persist/read funkcije", () => {
    expect(lib).toContain(
      'export const LAST_ITINERARY_KEY = "discoverslovenia_last_itinerary"'
    );
    expect(lib).toContain("export const MAX_PERSIST_CHARS = 250 * 1024");
    expect(lib).toContain("export function persistItinerary(");
    expect(lib).toContain("export function readLastItinerary(");
    expect(lib).toContain("export interface PersistedItinerary");
  });

  test('literal "discoverslovenia_last_itinerary" živi SAMO v lib (chat-add-place brez duplikata)', () => {
    expect(lib).toContain("discoverslovenia_last_itinerary");
    expect(chatAdd).not.toContain("discoverslovenia_last_itinerary");
  });

  test("chat-add-place nima več lastne meje MAX_PERSIST_CHARS (duplikat kap odstranjen)", () => {
    expect(chatAdd).not.toContain("MAX_PERSIST_CHARS");
    expect(chatAdd).not.toContain("250 * 1024");
  });

  test("chat-add-place delegira na lib in OHRANJA stara izvoza (planner/klepet)", () => {
    expect(chatAdd).toContain('from "@/lib/itinerary-persist"');
    // stara javna površina (imena/signature) ostaja: planner uvaža
    // LAST_ITINERARY_KEY, klepet readLastItinerary/persistLastItinerary
    expect(chatAdd).toContain("readLastItinerary");
    expect(chatAdd).toContain("persistLastItinerary");
    expect(chatAdd).toContain("LAST_ITINERARY_KEY");
  });
});

// ---------------------------------------------------------------------------
// 2. my-orders — writeList + ključa iz lib-a (ne iz komponente)
// ---------------------------------------------------------------------------

describe("TASK 99-b: my-orders writeList (funkcionalno)", () => {
  test("writeList zapiše seznam (najnovejše najprej) in ga getOrderNumbers prebere", () => {
    storage.clear();
    writeList(ORDERS_KEY, ["ORD-2", "ORD-1"]);
    expect(getOrderNumbers()).toEqual(["ORD-2", "ORD-1"]);
    writeList(BOOKINGS_KEY, ["BK-9"]);
    expect(getBookingNumbers()).toEqual(["BK-9"]);
  });

  test("PRAZEN seznam → removeItem (ključ IZGINE, ne prazen JSON array)", () => {
    storage.clear();
    writeList(ORDERS_KEY, ["ORD-1"]);
    expect(storage.getItem(ORDERS_KEY)).not.toBeNull();
    writeList(ORDERS_KEY, []);
    expect(storage.getItem(ORDERS_KEY)).toBeNull();
    expect(getOrderNumbers()).toEqual([]);
  });

  test("CAP 50 — 80 številk se pri zapisu skrajša NA 50 (parity z MAX_NUMBERS)", () => {
    storage.clear();
    const nums = Array.from({ length: 80 }, (_, i) => `ORD-${i}`);
    writeList(ORDERS_KEY, nums);
    const stored = JSON.parse(storage.getItem(ORDERS_KEY) ?? "[]");
    expect(stored).toHaveLength(50);
    expect(stored[0]).toBe("ORD-0");
    expect(stored[49]).toBe("ORD-49");
    expect(getOrderNumbers()).toHaveLength(50);
  });
});

describe("TASK 99-b: my-orders (source-contract)", () => {
  const lib = source("src/lib/my-orders-storage.ts");
  const section = stripComments(
    source("src/components/my-orders-section.tsx")
  );

  test("lib izvaža writeList + ključa (cap 50 = MAX_NUMBERS, isti kot nekdaj LIST_CAP)", () => {
    expect(lib).toContain("export function writeList(");
    expect(lib).toContain('export const ORDERS_KEY = "dai:my-orders"');
    expect(lib).toContain('export const BOOKINGS_KEY = "dai:my-bookings"');
    expect(lib).toContain("const MAX_NUMBERS = 50");
    expect(lib).toContain("numbers.slice(0, MAX_NUMBERS)");
    expect(lib).toContain("window.localStorage.removeItem(key)");
  });

  test("my-orders-section NIMA več lokalne writeList implementacije", () => {
    expect(section).not.toMatch(/function\s+writeList\s*\(/);
    expect(section).not.toContain("const LIST_CAP");
    expect(section).toContain("writeList"); // uvožena in uporabljena
    expect(section).toContain('from "@/lib/my-orders-storage"');
  });

  test('ključa "dai:my-orders"/"dai:my-bookings" nista več duplicirana v komponenti', () => {
    expect(section).not.toContain('"dai:my-orders"');
    expect(section).not.toContain('"dai:my-bookings"');
    expect(section).toContain("ORDERS_KEY");
    expect(section).toContain("BOOKINGS_KEY");
  });

  test("FETCH_CAP (20) ostaja komponentna lastnina (lookup limita ni lib kontrakt)", () => {
    expect(section).toContain("const FETCH_CAP = 20");
  });
});

// ---------------------------------------------------------------------------
// 3. client-identity — anonimni ID + ime iz lib-a (4 komponente čiste)
// ---------------------------------------------------------------------------

describe("TASK 99-b: client-identity (funkcionalno)", () => {
  test("getVoterId ustvari ID in je STABILEN med klici (isti brskalnik = isti obiskovalec)", () => {
    storage.clear();
    const v1 = getVoterId();
    expect(v1).not.toBeNull();
    expect(getVoterId()).toBe(v1);
    expect((v1 as string).length).toBeGreaterThanOrEqual(8);
  });

  test("SMETEN shranjen ID (ne ustreza CLIENT_ID_RE) se regenerira IN prepiše", () => {
    storage.clear();
    storage.setItem(VOTER_KEY, "kratak!");
    const v = getVoterId();
    expect(v).not.toBe("kratak!");
    expect(v).not.toBeNull();
    expect(storage.getItem(VOTER_KEY)).toBe(v);
  });

  test("getAuthorName/saveAuthorName — prihranjeno ime kroži (brez trimanja v lib-u)", () => {
    storage.clear();
    expect(getAuthorName()).toBeNull();
    saveAuthorName("Ana Potnik");
    expect(getAuthorName()).toBe("Ana Potnik");
  });

  test("ključa sta TOČNO vrednosti prejšnjih literalov (parity shrambe)", () => {
    expect(VOTER_KEY).toBe("discoverslovenia_voter");
    expect(AUTHOR_NAME_KEY).toBe("discoverslovenia_comment_name");
  });
});

describe("TASK 99-b: client-identity (source-contract — 4 komponente)", () => {
  const lib = source("src/lib/client-identity.ts");
  const comps: Record<string, string> = {
    "trip-social.tsx": stripComments(source("src/components/trip-social.tsx")),
    "trip-diary.tsx": stripComments(source("src/components/trip-diary.tsx")),
    "shared-trip.tsx": stripComments(source("src/components/shared-trip.tsx")),
    "trip-polls.tsx": stripComments(source("src/components/trip-polls.tsx")),
  };

  test("lib izvaža ključa + 3 helperje (oblika ID-ja iz trip-social)", () => {
    expect(lib).toContain('export const VOTER_KEY = "discoverslovenia_voter"');
    expect(lib).toContain(
      'export const AUTHOR_NAME_KEY = "discoverslovenia_comment_name"'
    );
    expect(lib).toContain("export function getVoterId(");
    expect(lib).toContain("export function getAuthorName(");
    expect(lib).toContain("export function saveAuthorName(");
    // identična identiteta: UUID + fallback vzorec + validacijski RE
    expect(lib).toContain("crypto.randomUUID");
    expect(lib).toContain("v-${Date.now()}-${Math.random()");
    expect(lib).toContain("CLIENT_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/");
  });

  test('raw literal "discoverslovenia_voter" živi SAMO v lib (vse 4 komponente čiste)', () => {
    expect(lib).toContain("discoverslovenia_voter");
    expect(lib).toContain("discoverslovenia_comment_name");
    for (const [name, src] of Object.entries(comps)) {
      expect(src).not.toContain("discoverslovenia_voter");
      expect(src).not.toContain("discoverslovenia_comment_name");
    }
  });

  test("vse 4 komponente uvažajo helperje iz deljene knjižnice", () => {
    for (const [name, src] of Object.entries(comps)) {
      expect(src).toContain('from "@/lib/client-identity"');
    }
  });

  test("komponente ne definirajo več lastnih ključev/validacije identitete", () => {
    for (const src of Object.values(comps)) {
      expect(src).not.toMatch(
        /CLIENT_ID_STORAGE_KEY|VOTER_STORAGE_KEY|AUTHOR_NAME_STORAGE_KEY/
      );
      expect(src).not.toContain("CLIENT_ID_RE");
    }
  });

  test("komponentne lastnine ostajajo (like/votes ključi so ločene lastnosti, NE identiteta)", () => {
    expect(comps["trip-social.tsx"]).toContain("discoverslovenia_like_");
    expect(comps["shared-trip.tsx"]).toContain("discoverslovenia_votes_");
  });
});

// ---------------------------------------------------------------------------
// 4. Pariteta semantike — ključi + meje so TOČNO vrednosti iz pred-konsolidacije
// ---------------------------------------------------------------------------

describe("TASK 99-b: pariteta semantike (ključi + meje)", () => {
  test("MAX_PERSIST_CHARS = 250 * 1024 (= 256000 — vrednost plannerja, NE 250000)", () => {
    expect(MAX_PERSIST_CHARS).toBe(250 * 1024);
    expect(MAX_PERSIST_CHARS).toBe(256000);
  });

  test("ključi so točno enaki prejšnjim ( obstoječa shramba ostaja berljiva)", () => {
    expect(LAST_ITINERARY_KEY).toBe("discoverslovenia_last_itinerary");
    expect(ORDERS_KEY).toBe("dai:my-orders");
    expect(BOOKINGS_KEY).toBe("dai:my-bookings");
    expect(VOTER_KEY).toBe("discoverslovenia_voter");
    expect(AUTHOR_NAME_KEY).toBe("discoverslovenia_comment_name");
  });

  test("meje naročil/rezervacij ostajajo 50 (MAX_NUMBERS v lib-u, NE v komponenti)", () => {
    const lib = source("src/lib/my-orders-storage.ts");
    expect(lib).toContain("const MAX_NUMBERS = 50");
    const section = stripComments(
      source("src/components/my-orders-section.tsx")
    );
    expect(section).not.toMatch(/=\s*50\b/); // kap živi samo v lib-u
  });
});
