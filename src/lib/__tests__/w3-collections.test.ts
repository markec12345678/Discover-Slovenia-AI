// W3 (Issue #15, 1.132.0): KOLEKCIJE PRILJUBLJENIH — regresijska varovalka.
//
// Pokriva:
//  1. FUNKCIONALNO: tema vnosa (deterministična preslikava type+category),
//     združevanje po temi (števci, vrstni red, fiksni tiebreak), razdelki po
//     destinaciji z vnosi (ista resolucija kot most v my-trip-view), 4-jezične
//     oznake.
//  2. STORAGE: kategorija je DODATNO polje — sanitizacija (trim/lowercase/kap),
//     starejši vnosi brez kategorije ostanejo veljavni (ZERO LOSS pri braniu
//     obstoječega localStorage-a).
//  3. SOURCE-CONTRACT: 4 površine shranjevanja zapišejo kategorijo; list ima
//     preklop pogledov (Vse/Po destinaciji/Po temi), gumb "Načrtuj" na
//     razdelku OBSTOJEČI handoff kanon (addMyTripItem + setMyTripHandoff +
//     dai:my-trip-prefill); varovala (privzeto "Vse", reset ob odpiranju).
//  4. TELEMETRIJA: wishlist_collection_used/planned v klientnem union-u IN
//     strežniški whitelisti + vrstici v docs/ANALYTICS-EVENTS.md.
//  5. WHITELIST PARITETA (NAJVAŽNEJŠE): vsak član PlannerEventName union-a
//     mora biti prisoten v strežniški VALID_EVENTS listi — past, ki jo je
//     revizija 1.132.0 odkrila (18 manjkajočih dogodkov, tihi 400-i) in ki
//     se od zdaj ne more tiho ponoviti.
//  6. ZERO-LOSS: identiteta wishlistTripItem (kind:refId) ostaja enaka
//     mostu v lib/wishlist-trip-bridge.ts (dedup čez površine).

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "node:fs";

import {
  themeOfEntry,
  groupWishlistByTheme,
  groupWishlistEntriesByDestination,
  resolveWishlistDestination,
  WISHLIST_THEME_LABELS,
  WISHLIST_OTHER_LABEL,
  type WishlistTheme,
} from "@/lib/wishlist-collections";
import {
  addToWishlist,
  getWishlist,
  type WishlistEntry,
  type WishlistInput,
} from "@/lib/wishlist-storage";
import { DESTINATIONS } from "@/lib/slovenia-data";

const COLLECTIONS_SRC = readFileSync(
  new URL("../../lib/wishlist-collections.ts", import.meta.url),
  "utf8"
);
const SHEET_SRC = readFileSync(
  new URL("../../components/wishlist-sheet.tsx", import.meta.url),
  "utf8"
);
const STORAGE_SRC = readFileSync(
  new URL("../../lib/wishlist-storage.ts", import.meta.url),
  "utf8"
);
const ANALYTICS_SRC = readFileSync(
  new URL("../../lib/planner-analytics.ts", import.meta.url),
  "utf8"
);
const ANALYTICS_ROUTE_SRC = readFileSync(
  new URL("../../app/api/analytics/event/route.ts", import.meta.url),
  "utf8"
);
const ANALYTICS_DOC = readFileSync(
  new URL("../../../docs/ANALYTICS-EVENTS.md", import.meta.url),
  "utf8"
);
const MARKETPLACE_SRC = readFileSync(
  new URL("../../components/sections/marketplace.tsx", import.meta.url),
  "utf8"
);
const EXPERIENCE_MODAL_SRC = readFileSync(
  new URL("../../components/sections/experience-modal.tsx", import.meta.url),
  "utf8"
);
const PRODUCT_MODAL_SRC = readFileSync(
  new URL("../../components/sections/product-modal.tsx", import.meta.url),
  "utf8"
);
const BRIDGE_SRC = readFileSync(
  new URL("../../lib/wishlist-trip-bridge.ts", import.meta.url),
  "utf8"
);

// ---------------------------------------------------------------------------
// localStorage mock (isti vzorec kot task8-my-trip-core.test.ts)
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

// ---------------------------------------------------------------------------
// pomožni gradniki
// ---------------------------------------------------------------------------
function entry(overrides: Partial<WishlistEntry> = {}): WishlistEntry {
  return {
    id: `cuid-${Math.random().toString(36).slice(2, 10)}`,
    type: "experience",
    name: "Testna izkušnja",
    image: null,
    price: 42,
    destination: null,
    slug: null,
    category: null,
    savedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. FUNKCIONALNO: themeOfEntry — deterministična preslikava (0 AI)
// ---------------------------------------------------------------------------
describe("W3 themeOfEntry (deterministična preslikava)", () => {
  test("izkušnje: vseh 7 kategorij D8-B taksonomije", () => {
    expect(themeOfEntry(entry({ type: "experience", category: "tour" }))).toBe("aktivnosti");
    expect(themeOfEntry(entry({ type: "experience", category: "outdoor" }))).toBe("aktivnosti");
    expect(themeOfEntry(entry({ type: "experience", category: "adventure" }))).toBe("aktivnosti");
    expect(themeOfEntry(entry({ type: "experience", category: "tasting" }))).toBe("hrana");
    expect(themeOfEntry(entry({ type: "experience", category: "cultural" }))).toBe("kultura");
    expect(themeOfEntry(entry({ type: "experience", category: "workshop" }))).toBe("kultura");
    expect(themeOfEntry(entry({ type: "experience", category: "wellness" }))).toBe("mir");
  });

  test("izdelki: vseh 7 kategorij D8-B taksonomije", () => {
    expect(themeOfEntry(entry({ type: "product", category: "food" }))).toBe("hrana");
    expect(themeOfEntry(entry({ type: "product", category: "wine" }))).toBe("hrana");
    expect(themeOfEntry(entry({ type: "product", category: "honey" }))).toBe("hrana");
    expect(themeOfEntry(entry({ type: "product", category: "oil" }))).toBe("hrana");
    expect(themeOfEntry(entry({ type: "product", category: "craft" }))).toBe("kultura");
    expect(themeOfEntry(entry({ type: "product", category: "souvenir" }))).toBe("kultura");
    expect(themeOfEntry(entry({ type: "product", category: "other" }))).toBe("drugo");
  });

  test("iskren fallback: mankajoča/null/prazna/neznana kategorija → drugo (brez izmišljanja)", () => {
    expect(themeOfEntry(entry({ category: null }))).toBe("drugo");
    expect(themeOfEntry(entry({ category: undefined }))).toBe("drugo");
    expect(themeOfEntry({ type: "experience", category: undefined })).toBe("drugo");
    expect(themeOfEntry({ type: "product", category: undefined })).toBe("drugo");
    expect(themeOfEntry(entry({ category: "" }))).toBe("drugo");
    expect(themeOfEntry(entry({ category: "  " }))).toBe("drugo");
    expect(themeOfEntry(entry({ category: "hyperloop" }))).toBe("drugo");
  });

  test("normalizacija: velike črke/bele prostora se preslikajo enako (kanonična mala oblika)", () => {
    expect(themeOfEntry(entry({ type: "experience", category: "Tasting" }))).toBe("hrana");
    expect(themeOfEntry(entry({ type: "product", category: " WINE " }))).toBe("hrana");
    expect(themeOfEntry(entry({ type: "experience", category: "Wellness" }))).toBe("mir");
  });
});

// ---------------------------------------------------------------------------
// 2. FUNKCIONALNO: groupWishlistByTheme — števci, vrstni red, vnosovne skupine
// ---------------------------------------------------------------------------
describe("W3 groupWishlistByTheme (razdelki po temi)", () => {
  test("združi po temi z VNOSI (isti vnosi kot v skupini); števci so veljavni", () => {
    const entries = [
      entry({ name: "Degustacija vina", category: "tasting" }),
      entry({ type: "product", name: "Teran", category: "wine" }),
      entry({ name: "Kolesarski ogled", category: "tour" }),
      entry({ name: "Muzej", category: "cultural" }),
    ];
    const groups = groupWishlistByTheme(entries);
    expect(groups.length).toBe(3);
    expect(groups.find((x) => x.theme === "hrana")?.entries.length).toBe(2);
    expect(groups.find((x) => x.theme === "aktivnosti")?.entries.length).toBe(1);
    expect(groups.find((x) => x.theme === "kultura")?.entries.length).toBe(1);
    // skupina hrana vsebuje PRAVE vnose (ne kopije drugih)
    const hrana = groups.find((x) => x.theme === "hrana")?.entries ?? [];
    expect(hrana.map((e) => e.name).sort()).toEqual(["Degustacija vina", "Teran"]);
  });

  test("vrstni red: število padajoče; pri izenačenju fiksni vrstni red taksonomije", () => {
    const entries = [
      entry({ category: "cultural" }), // kultura 1
      entry({ category: "tasting" }), // hrana 1
      entry({ name: "brez kategorije" }), // drugo 1
    ];
    const groups = groupWishlistByTheme(entries);
    // vsi imajo 1 → fiksni vrstni red: hrana, kultura, aktivnosti, mir, drugo
    expect(groups.map((x) => x.theme)).toEqual(["hrana", "kultura", "drugo"]);
    // največja tema je prva tudi pri mešanju
    const mixed = [
      entry({ category: "wellness" }),
      entry({ category: "tasting" }),
      entry({ category: "wine", type: "product" }),
      entry({ category: "honey", type: "product" }),
    ];
    expect(groupWishlistByTheme(mixed)[0].theme).toBe("hrana");
  });

  test("prazen seznam → prazni razdelki", () => {
    expect(groupWishlistByTheme([])).toEqual([]);
  });

  test("starejši vnosi brez kategorije → iskren razdelek drugo (ne izgubijo se)", () => {
    const legacy = [entry({ category: null }), entry({ category: null })];
    const groups = groupWishlistByTheme(legacy);
    expect(groups.length).toBe(1);
    expect(groups[0].theme).toBe("drugo");
    expect(groups[0].entries.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 3. FUNKCIONALNO: razdelki po destinaciji — ISTA resolucija kot most
// ---------------------------------------------------------------------------
describe("W3 groupWishlistEntriesByDestination (razdelki z vnosi)", () => {
  test("razrešljivo besedilo → destinationId + kanonično ime; vnosi v skupini", () => {
    const bled = DESTINATIONS.find((d) => d.name.toLowerCase() === "bled")!;
    expect(bled).toBeTruthy();
    const entries = [
      entry({ destination: "Bled", name: "A" }),
      entry({ destination: "bled", name: "B" }), // ista destinacija, druga velikost
    ];
    const sections = groupWishlistEntriesByDestination(entries);
    expect(sections.length).toBe(1);
    expect(sections[0].destinationId).toBe(bled.id);
    expect(sections[0].destinationName).toBe(bled.name);
    expect(sections[0].entries.map((e) => e.name)).toEqual(["A", "B"]);
  });

  test("nerazrešljivo besedilo → iskreno surovo ime BREZ ID-ja", () => {
    const sections = groupWishlistEntriesByDestination([
      entry({ destination: "Namišljena vas", name: "X" }),
    ]);
    expect(sections[0].destinationId).toBeUndefined();
    expect(sections[0].destinationName).toBe("Namišljena vas");
  });

  test("brez besedila → drugaLabel; vrstni red število padajoče", () => {
    const bled = DESTINATIONS.find((d) => d.name.toLowerCase() === "bled")!;
    const sections = groupWishlistEntriesByDestination(
      [
        entry({ destination: null, name: "samo" }),
        entry({ destination: "Bled", name: "b1" }),
        entry({ destination: "bled", name: "b2" }),
      ],
      "Drugo"
    );
    expect(sections[0].destinationId).toBe(bled.id);
    expect(sections[0].entries.length).toBe(2);
    expect(sections[1].destinationName).toBe("Drugo");
    expect(sections[1].entries.length).toBe(1);
  });

  test("resolveWishlistDestination: slug ujemanje + neobčutljivost (ista pravila kot most)", () => {
    const bySlug = DESTINATIONS[0];
    expect(resolveWishlistDestination(entry({ destination: bySlug.slug }))).toEqual({
      id: bySlug.id,
      name: bySlug.name,
    });
    expect(resolveWishlistDestination(entry({ destination: null }))).toBeUndefined();
    expect(resolveWishlistDestination(entry({ destination: "  " }))).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 4. FUNKCIONALNO: 4-jezične oznake (pariteta ključev — W1 kanon)
// ---------------------------------------------------------------------------
describe("W3 oznake tem (4 jeziki)", () => {
  const LANGS = ["sl", "en", "it", "de"] as const;

  test("vsaka tema ima VSE 4 jezike (pariteta — nikoli delno preveden razdelek)", () => {
    for (const theme of Object.keys(WISHLIST_THEME_LABELS) as WishlistTheme[]) {
      for (const lang of LANGS) {
        expect(WISHLIST_THEME_LABELS[theme][lang].length).toBeGreaterThan(3);
      }
    }
    for (const lang of LANGS) {
      expect(WISHLIST_OTHER_LABEL[lang].length).toBeGreaterThan(3);
    }
  });

  test("SL oznake so skladne z besedjem intent čipov (semenske teme)", () => {
    expect(WISHLIST_THEME_LABELS.hrana.sl).toContain("Hrana");
    expect(WISHLIST_THEME_LABELS.kultura.sl).toContain("Kultura");
    expect(WISHLIST_THEME_LABELS.aktivnosti.sl).toContain("Aktivnosti");
    expect(WISHLIST_THEME_LABELS.mir.sl).toContain("Mir");
    expect(WISHLIST_THEME_LABELS.drugo.sl).toBe("Drugo");
  });
});

// ---------------------------------------------------------------------------
// 5. STORAGE: kategorija je DODATNO polje (ZERO LOSS obstoječih vnosov)
// ---------------------------------------------------------------------------
describe("W3 storage: kategorija (dodatno polje)", () => {
  test("addToWishlist zapiše kategorijo; getWishlist jo vrne (roundtrip)", () => {
    storage.clear();
    addToWishlist({
      id: "cuid-w3-a",
      type: "experience",
      name: "Degustacija v kleti",
      image: null,
      price: 30,
      destination: "Vipava",
      slug: "degustacija-v-kleti",
      category: "tasting",
    });
    const list = getWishlist();
    expect(list.length).toBe(1);
    expect(list[0].category).toBe("tasting");
  });

  test("vnos BREZ kategorije ostane veljaven (starejši localStorage)", () => {
    storage.clear();
    addToWishlist({
      id: "cuid-w3-legacy",
      type: "product",
      name: "Stari vnos",
      image: null,
      price: 10,
      destination: null,
      slug: null,
    });
    const list = getWishlist();
    expect(list.length).toBe(1);
    expect(list[0].category).toBeNull();
  });

  test("sanitizacija: trim + lowercase + kap 40; neveljavna vrsta → null", () => {
    storage.clear();
    addToWishlist({
      id: "cuid-w3-b",
      type: "experience",
      name: "X",
      image: null,
      price: null,
      destination: null,
      slug: null,
      category: "  Wellness  ",
    } as never);
    // namerna neveljavna vrsta (defenzivna sanitizacija — runtime ne sesuje)
    addToWishlist({
      id: "cuid-w3-c",
      type: "experience",
      name: "Y",
      image: null,
      price: null,
      destination: null,
      slug: null,
      category: 123,
    } as unknown as WishlistInput);
    const list = getWishlist();
    const b = list.find((e) => e.id === "cuid-w3-b");
    const c = list.find((e) => e.id === "cuid-w3-c");
    expect(b?.category).toBe("wellness");
    expect(c?.category).toBeNull();
  });

  test("žaljivo dolga kategorija se kap-a na 40 znakov (obramba)", () => {
    storage.clear();
    addToWishlist({
      id: "cuid-w3-d",
      type: "product",
      name: "Z",
      image: null,
      price: null,
      destination: null,
      slug: null,
      category: "a".repeat(80),
    });
    expect(getWishlist()[0].category?.length).toBe(40);
  });
});

// ---------------------------------------------------------------------------
// 6. SOURCE-CONTRACT: površine shranjevanja zapišejo kategorijo
// ---------------------------------------------------------------------------
describe("W3 source-contract: kategorija ob shranjevanju (4 površine)", () => {
  test("tržnica: kartica izdelka + kartica izkušnje", () => {
    expect(MARKETPLACE_SRC).toContain("category: product.category,");
    expect(MARKETPLACE_SRC).toContain("category: experience.category,");
  });

  test("modala: izkušnja + izdelek", () => {
    expect(EXPERIENCE_MODAL_SRC).toContain("category: experience.category,");
    expect(PRODUCT_MODAL_SRC).toContain("category: product.category,");
  });

  test("storage: sanitizacija kategorije je v branju (neobvezno polje)", () => {
    expect(STORAGE_SRC).toContain("category?: string | null");
    expect(STORAGE_SRC).toContain("CATEGORY_MAX_LENGTH = 40");
    expect(STORAGE_SRC).toContain("entry.category.trim().toLowerCase()");
  });
});

// ---------------------------------------------------------------------------
// 7. SOURCE-CONTRACT: list — preklop pogledov + handoff kanon + varovala
// ---------------------------------------------------------------------------
describe("W3 source-contract: wishlist-sheet (razdelki + varovala)", () => {
  test("preklop pogledov: Vse / Po destinaciji / Po temi (role=tablist)", () => {
    expect(SHEET_SRC).toContain('type WishlistView = "all" | "destination" | "theme"');
    expect(SHEET_SRC).toContain('role="tablist"');
    expect(SHEET_SRC).toContain('viewAll: { sl: "Vse"');
    expect(SHEET_SRC).toContain("groupWishlistEntriesByDestination");
    expect(SHEET_SRC).toContain("groupWishlistByTheme");
    expect(SHEET_SRC).toContain("WISHLIST_THEME_LABELS");
  });

  test("VAROVALO: privzeto „Vse“ + reset ob odpiranju (ploščen seznam ostane)", () => {
    expect(SHEET_SRC).toContain('useState<WishlistView>("all")');
    // reset v onOpenChange (VSI odpiralni potoki — trigger/ESC/programsko),
    // ne v efektu (react-hooks/set-state-in-effect disciplina)
    expect(SHEET_SRC).toContain("if (next) setView(\"all\")");
    expect(SHEET_SRC).toContain("count >= 2");
  });

  test("VAROVALO: preklop vidna šele od 2 vnosov — 1 vnos nima razdelkov", () => {
    // nadzorna struktura: toggle je pogojen z {count >= 2 ? ... : null}
    expect(SHEET_SRC).toContain("{count >= 2 ? (");
  });

  test("gumb „Načrtuj“ na razdelku: OBSTOJEČI handoff kanon (addMyTripItem + handoff + prefill)", () => {
    expect(SHEET_SRC).toContain('planSection: { sl: "Načrtuj"');
    expect(SHEET_SRC).toContain("addMyTripItem(wishlistTripItem(entry))");
    expect(SHEET_SRC).toContain("setMyTripHandoff()");
    expect(SHEET_SRC).toContain(
      'new CustomEvent<MyTripPrefillDetail>(MY_TRIP_PREFILL_EVENT'
    );
    expect(SHEET_SRC).toContain(
      'import {\n  MY_TRIP_PREFILL_EVENT,\n  type MyTripPrefillDetail,\n} from "@/components/planner-my-trip-strip"'
    );
  });

  test("navigacija locale-zavedajoča (it/de pote ostanejo v jeziku — W1 kanon)", () => {
    expect(SHEET_SRC).toContain('import { useRouter } from "@/i18n/navigation"');
    expect(SHEET_SRC).toContain('router.push("/nacrtuj")');
  });

  test("telemetrija v listu: used ob preklopu, planned ob „Načrtuj“", () => {
    expect(SHEET_SRC).toContain('trackPlannerEvent("wishlist_collection_used"');
    expect(SHEET_SRC).toContain('trackPlannerEvent("wishlist_collection_planned"');
  });

  test("ZERO-LOSS: identiteta wishlistTripItem ostaja enaka mostu v lib (dedup čez površine)", () => {
    for (const literal of [
      "kind: entry.type,",
      "refId: entry.id,",
      'href: "/trznica",',
      'source: "priljubljene",',
    ]) {
      expect(SHEET_SRC).toContain(literal);
      expect(BRIDGE_SRC).toContain(literal);
    }
    expect(SHEET_SRC).toContain("entry.destination ?? undefined");
  });

  test("ZERO-LOSS: vrstice razdelkov so ISTA WishlistRow (isti gumbi/akcije)", () => {
    // WishlistSection uporabi WishlistRow (ena vrstica — enaka izkušnja)
    expect(SHEET_SRC).toContain("function WishlistSection(");
    expect(SHEET_SRC).toContain("<WishlistRow");
    expect(SHEET_SRC).toContain("openFromWishlist({ type: item.type, id: item.id, slug: item.slug })");
    expect(SHEET_SRC).toContain("AddToTripButton");
  });

  test("4-jezični WL: vsak ključ nosi sl+en+it+de (nikoli delno preveden list)", () => {
    // vzorčni ključi iz vsake plasti (prazno stanje, glava, gumb Načrtuj)
    for (const key of [
      "exploreCta:",
      "emptyTitle:",
      "title:",
      "localNote:",
      "heartSaveTitle:",
      "viewAll:",
      "viewDestination:",
      "viewTheme:",
      "planSection:",
      "plannedTitle:",
    ]) {
      const idx = SHEET_SRC.indexOf(key);
      expect(idx).toBeGreaterThan(-1);
      const line = SHEET_SRC.slice(idx, idx + 400);
      expect(line).toContain("sl:");
      expect(line).toContain("en:");
      expect(line).toContain("it:");
      expect(line).toContain("de:");
    }
    // SL/EN vrednosti DOBESEDNO enake starejšim (zero-loss prevodi)
    expect(SHEET_SRC).toContain('title: { sl: "Priljubljene", en: "Favorites"');
    expect(SHEET_SRC).toContain('sl: "Razišči tržnico"');
    expect(SHEET_SRC).toContain('en: "Explore the marketplace"');
  });
});

// ---------------------------------------------------------------------------
// 8. TELEMETRIJA: oba nova dogodka v union-u, whitelisti in dokumentaciji
// ---------------------------------------------------------------------------
describe("W3 telemetrija (kanon: klient + strežnik + docs)", () => {
  test("wishlist_collection_used/planned v klientnem union-u", () => {
    expect(ANALYTICS_SRC).toContain('| "wishlist_collection_used"');
    expect(ANALYTICS_SRC).toContain('| "wishlist_collection_planned"');
  });

  test("wishlist_collection_used/planned v strežniški whitelisti", () => {
    expect(ANALYTICS_ROUTE_SRC).toContain('"wishlist_collection_used"');
    expect(ANALYTICS_ROUTE_SRC).toContain('"wishlist_collection_planned"');
  });

  test("vrstici v docs/ANALYTICS-EVENTS.md (dOS dokumentacija po kanonu)", () => {
    expect(ANALYTICS_DOC).toContain("`wishlist_collection_used` (1.132.0");
    expect(ANALYTICS_DOC).toContain("`wishlist_collection_planned` (1.132.0");
  });

  test("backfill 1.132.0: 18 prej manjkajočih dogodkov je zdaj v whitelisti", () => {
    const backfilled = [
      "chat_group_ai_asked",
      "chat_group_place_added",
      "chat_ask_cta_clicked",
      "chat_map_pinned",
      "chat_map_unpinned",
      "day_added",
      "day_removed",
      "stop_reordered",
      "stop_moved_to_day",
      "plan_update_detected",
      "plan_update_loaded",
      "plan_update_load_failed",
      "ingest_completed",
      "itinerary_undo",
      "save_inplace_fallback",
      "refine_cancelled",
      "refine_timeout",
      "go_mode_started",
    ];
    for (const name of backfilled) {
      expect(ANALYTICS_ROUTE_SRC).toContain(`"${name}"`);
    }
    expect(ANALYTICS_DOC).toContain("Revizija whitelist 1.132.0");
  });
});

// ---------------------------------------------------------------------------
// 9. WHITELIST PARITETA — regresijska varovalka (najpomembnejši test W3)
//    Vsak član PlannerEventName union-a MORA biti v VALID_EVENTS —
//    sicer klient tiho dobi 400 in vrstice NI v DB (past 1.118.0–1.131.0).
// ---------------------------------------------------------------------------
describe("W3 whitelist pariteta (klient union ⊆ strežniška VALID_EVENTS)", () => {
  test("vsak dogodek union-a je v strežniški whitelisti (0 tihih 400)", () => {
    // Izlušči člane union-a: vrstice oblike | "ime"
    const unionMembers = new Set<string>();
    for (const m of ANALYTICS_SRC.matchAll(/\|\s*"([a-z0-9_]+)"/g)) {
      unionMembers.add(m[1]);
    }
    // Odstrani vrste, ki niso dogodki (IngestMode vrednosti itd. — union
    // dogodkov se začne pri "planner_started"; vrste so zunaj bloka)
    const unionStart = ANALYTICS_SRC.indexOf("export type PlannerEventName");
    const unionEnd = ANALYTICS_SRC.indexOf("export type PlannerEventProps");
    const unionBlock = ANALYTICS_SRC.slice(unionStart, unionEnd);
    const eventNames = new Set<string>();
    for (const m of unionBlock.matchAll(/\|\s*"([a-z0-9_]+)"/g)) {
      eventNames.add(m[1]);
    }
    expect(eventNames.size).toBeGreaterThanOrEqual(70);

    const whitelistStart = ANALYTICS_ROUTE_SRC.indexOf("VALID_EVENTS = new Set([");
    const whitelistEnd = ANALYTICS_ROUTE_SRC.indexOf("]);", whitelistStart);
    const whitelistBlock = ANALYTICS_ROUTE_SRC.slice(whitelistStart, whitelistEnd);
    const whitelisted = new Set<string>();
    for (const m of whitelistBlock.matchAll(/"([a-z0-9_]+)"/g)) {
      whitelisted.add(m[1]);
    }

    const missing = [...eventNames].filter((name) => !whitelisted.has(name));
    expect(
      missing,
      `Dogodki union-a, ki manjkajo v strežniški whitelisti (tihi 400!): ${missing.join(", ")}`
    ).toEqual([]);
    // varovalka pred lažno praznim testom (union blok se je strgalo)
    expect(unionMembers.size).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 10. ČISTOST: lib/wishlist-collections je 0-React (unit-testabilen)
// ---------------------------------------------------------------------------
describe("W3 čistost lib plasti", () => {
  test("wishlist-collections.ts nima React odvisnosti", () => {
    expect(COLLECTIONS_SRC).not.toContain('"react"');
    expect(COLLECTIONS_SRC).not.toContain("next/");
    // uporablja isti T1 dataset kot most (ena resolucija, ne dve kopiji)
    expect(COLLECTIONS_SRC).toContain('from "@/lib/slovenia-data"');
    expect(COLLECTIONS_SRC).toContain('from "@/lib/wishlist-storage"');
  });
});
