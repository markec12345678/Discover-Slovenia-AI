// TASK 8 / F4-C (issue #8 — Discovery UX 2.0, faza 4 „EN razširitev"):
// /moja-potovanja — EN pokritost MY TRIP COLLECTION pogleda (srce
// Save → Add → Plan). Source-contract regex testi (vzorec:
// task8-f3b-states-family.test.ts + task8-f3cd-startanywhere-wishlist).
//
// 1. L-PARITETA: vsak list slovarja L ima neprazen SL in EN niz.
//    - slog A „key: { sl: …, en: … }" (gold standard journey-planner):
//      moja-potovanja-view.tsx + moja-potovanja/page.tsx;
//    - slog B locale-blokov (my-trip-view.tsx, F3-D): isti nabor ključev
//      v SL in EN bloku, vsi nizi neprazni.
// 2. BREZ HARDCODE SL markerjev v renderu (območje IZVEN slovarja, brez
//    komentarjev) — reprezentativni markerji obeh datotek.
// 3. ZERO-LOSS: pogodbe zbirke (MyTripView render + count gate), mostu
//    „Iz priljubljenih" (dai:my-trip-prefill + quick-add), handoffa,
//    sinhronizacije, družine stanj in lupine strani.
// 4. generateMetadata pogodba strani (getLocale, canonical, hreflang).
// 5. SL/EN pariteta: ~10 ključnih nizov ima obe jezikovni različici in se
//    med sabo razlikujeta.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const VIEW_SRC = read("app/moja-potovanja/moja-potovanja-view.tsx");
const PAGE_SRC = read("app/moja-potovanja/page.tsx");
const MYTRIP_SRC = read("components/my-trip-view.tsx");

/** Koda brez komentarjev — literalni testi ne smejo pasti zaradi pojasnil
 *  (kanon task8-e-shell-tabbar). */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

/** Regija L-slovarja: od `const L = {` do zaključka (`} as const;` / `\n};`). */
function lRegion(src: string): string {
  const start = src.indexOf("const L = {");
  expect(start).toBeGreaterThanOrEqual(0);
  const ends = [
    src.indexOf("} as const;", start),
    src.indexOf("\n};", start),
  ].filter((e) => e >= 0);
  expect(ends.length).toBeGreaterThan(0);
  return src.slice(start, Math.min(...ends));
}

/** Render/logika IZVEN L-slovarja — tukaj ne sme biti hardcoded SL nizov. */
function renderRegion(src: string): string {
  const start = src.indexOf("const L = {");
  const ends = [
    src.indexOf("} as const;", start),
    src.indexOf("\n};", start),
  ].filter((e) => e >= 0);
  const end = Math.min(...ends);
  // za slog A (`} as const;`) preskoči cel zaključek, za slog B (`\n};`)
  // tri znake — v obeh primerih se regija začne s prvo kodo za slovarjem.
  const asConst = src.indexOf("} as const;", start) === end;
  return src.slice(end + (asConst ? "} as const;".length : 3));
}

type Leaf = { key: string; sl: string; en: string };

/**
 * Listi sloga A: `key: { sl: …, en: … }`. Podpira enovrstične liste (samo
 * nizi) in večvrstične (nizi/funkcije — vrstica `en:` je vedno za zadnjo
 * vrstico vrednosti `sl:`). Skupinski odpiralniki (`trips: {`) nimajo
 * `sl:` v prvi naslednji vrstici → se preskočijo (njihovi listi se
 * ulovijo v glavni zanki).
 */
function leavesOf(dict: string): Leaf[] {
  const lines = dict.split("\n");
  const leaves: Leaf[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    // enovrstični list (nizi): key: { sl: "…", en: "…" },
    const inline = line.match(
      /^\s*(\w+):\s*\{\s*sl:\s*"([^"]*)"\s*,\s*en:\s*"([^"]*)"\s*\}/
    );
    if (inline) {
      leaves.push({
        key: inline[1] as string,
        sl: inline[2] as string,
        en: inline[3] as string,
      });
      continue;
    }
    // večvrstični list: `key: {` + `sl: …` (+ nadaljevalne vrstice) + `en: …`
    const opener = line.match(/^\s*(\w+):\s*\{\s*$/);
    if (!opener) continue;
    const slIdx = i + 1;
    const slLine = lines[slIdx] ?? "";
    if (!/^\s*sl:/.test(slLine)) continue; // skupina, ne list
    let enIdx = -1;
    for (let j = slIdx + 1; j < lines.length; j++) {
      if (/^\s*en:/.test(lines[j] as string)) {
        enIdx = j;
        break;
      }
    }
    if (enIdx < 0) {
      leaves.push({ key: opener[1] as string, sl: slLine.trim(), en: "" });
      continue;
    }
    let closeIdx = enIdx + 1;
    while (
      closeIdx < lines.length &&
      !/^\s*\},?\s*$/.test(lines[closeIdx] as string)
    ) {
      closeIdx++;
    }
    const clean = (raw: string, token: string) =>
      raw.replace(new RegExp(`^\\s*${token}:\\s*`), "").replace(/,\s*$/, "");
    const sl = lines
      .slice(slIdx, enIdx)
      .map((raw) => clean(raw, "sl"))
      .join(" ")
      .trim();
    const en = lines
      .slice(enIdx, closeIdx)
      .map((raw) => clean(raw, "en"))
      .join(" ")
      .trim();
    leaves.push({ key: opener[1] as string, sl, en });
  }
  return leaves;
}

/**
 * Locale-bloka (slog B — my-trip-view): `  sl: { … }` in `  en: { … }`.
 * Vrne besedilo obeh blokov (brez odpiralnikov).
 */
function localeBlocks(src: string): { sl: string; en: string } {
  const lines = lRegion(src).split("\n");
  const slStart = lines.findIndex((l) => /^ {2}sl: \{$/.test(l));
  const enStart = lines.findIndex((l) => /^ {2}en: \{$/.test(l));
  expect(slStart).toBeGreaterThanOrEqual(0);
  expect(enStart).toBeGreaterThan(slStart);
  return {
    sl: lines.slice(slStart + 1, enStart).join("\n"),
    en: lines.slice(enStart + 1).join("\n"),
  };
}

/** Ključi listov locale-bloka (pot = zamik + ime) → vrednost. */
function leafKeys(block: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const raw of block.split("\n")) {
    const line = raw as string;
    if (/^\s*\/\//.test(line)) continue; // komentarji znotraj bloka
    const m = line.match(/^(\s+)([A-Za-z_]\w*):\s*(.+?)\s*,?\s*$/);
    if (!m) continue;
    const indent = (m[1] as string).length;
    const key = m[2] as string;
    const value = m[3] as string;
    if (value === "{") continue; // odpiralnik podobjekta (wishlist/groups)
    out.set(`${indent}:${key}`, value);
  }
  return out;
}

const VIEW_LEAVES = leavesOf(lRegion(VIEW_SRC));
const PAGE_LEAVES = leavesOf(lRegion(PAGE_SRC));
const VIEW_RENDER = stripComments(renderRegion(VIEW_SRC));
const MYTRIP_RENDER = stripComments(renderRegion(MYTRIP_SRC));

// ---------------------------------------------------------------------------
// 1. L-PARITETA — vsak list ima neprazen SL in EN
// ---------------------------------------------------------------------------
describe("F4-C L-pariteta: moja-potovanja-view (slog A, gold standard)", () => {
  test("slovar je obsežen (celoten chrome strani, ne le fragment)", () => {
    expect(VIEW_LEAVES.length).toBeGreaterThanOrEqual(40);
  });

  test("vsak list ima neprazen SL in EN (funkcijski listi vključno)", () => {
    for (const leaf of VIEW_LEAVES) {
      expect(leaf.sl.length).toBeGreaterThan(0);
      expect(leaf.en.length).toBeGreaterThan(0);
    }
  });

  test("noben `sl:` žeton brez para — števci sl:/en: se ujemata s listi", () => {
    const dict = lRegion(VIEW_SRC);
    // \b varuje pred identifikatorji (npr. ključ `open:` vsebuje "en:")
    expect((dict.match(/\bsl:/g) ?? []).length).toBe(VIEW_LEAVES.length);
    expect((dict.match(/\ben:/g) ?? []).length).toBe(VIEW_LEAVES.length);
  });

  test("množinska logika ostaja jezikovno ločena (SL dvojina/množina, EN preprosta)", () => {
    const count = VIEW_LEAVES.find((l) => l.key === "count");
    expect(count).toBeDefined();
    expect((count as Leaf).sl).toContain("načrti");
    expect((count as Leaf).sl).toContain("načrtov");
    expect((count as Leaf).en).not.toContain("načrt");
  });
});

describe("F4-C L-pariteta: my-trip-view (slog B, F3-D slovar)", () => {
  test("isti nabor ključev v SL in EN bloku + vsi nizi neprazni", () => {
    const { sl, en } = localeBlocks(MYTRIP_SRC);
    const slKeys = leafKeys(sl);
    const enKeys = leafKeys(en);
    expect(slKeys.size).toBeGreaterThanOrEqual(20);
    expect([...slKeys.keys()].sort()).toEqual([...enKeys.keys()].sort());
    for (const value of slKeys.values()) {
      expect(value.trim().length).toBeGreaterThan(0);
    }
    for (const value of enKeys.values()) {
      expect(value.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("F4-C L-pariteta: moja-potovanja/page.tsx (meta nizi)", () => {
  test("oba meta lista imata neprazen SL in EN", () => {
    expect(PAGE_LEAVES.length).toBe(2);
    for (const leaf of PAGE_LEAVES) {
      expect(leaf.sl.length).toBeGreaterThan(0);
      expect(leaf.en.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. BREZ HARDCODE SL markerjev v renderu (izven slovarja, brez komentarjev)
// ---------------------------------------------------------------------------
describe("F4-C brez hardcoded SL: moja-potovanja-view render", () => {
  const MARKERS = [
    "Moja potovanja",
    "Shranjena potovanja",
    "Tvoji shranjeni načrti",
    "Prijavi se",
    "Ustvari račun",
    "Odjavi se",
    "Pozdravljeni",
    "Račun",
    "Potrdite svojo e-pošto",
    "ste prejeli povezavo",
    "Pošlji povezavo znova",
    "Načrti so shranjeni",
    "na tej napravi",
    "Nimaš še shranjenih",
    "Nimate še shranjenih",
    "Niste še oddali",
    "Moje AI konzultacije",
    "Odgovor prispe",
    "V pripravi",
    "Odgovorjen",
    "Načrtuj potovanje",
    "Brezplačna konzultacija",
    "Povezava poslana",
    "Poskusite znova",
    "Nalaganje ni uspelo",
    "Pošiljanje ni uspelo",
    "Shranjeno",
    "Odpri",
  ];

  test("reprezentativni SL markerji so iztrebljeni iz rendera", () => {
    for (const marker of MARKERS) {
      expect(VIEW_RENDER.includes(marker)).toBe(false);
    }
  });

  test("markerji živijo SAMO v slovarju (SL strani ostaja popolna)", () => {
    const dict = lRegion(VIEW_SRC);
    for (const marker of [
      "Moja potovanja",
      "Shranjena potovanja",
      "Prijavi se",
      "Odjavi se",
      "Načrtuj potovanje",
      "Brezplačna konzultacija",
      "Moje AI konzultacije",
      "Potrdite svojo e-pošto",
    ]) {
      expect(dict.includes(marker)).toBe(true);
    }
  });

  test("družina stanj: klicatelj dobavlja dvojezične nize vsem trem stanjem", () => {
    expect(VIEW_SRC).toContain("title={L.trips.emptyGuestTitle[lang]}");
    expect(VIEW_SRC).toContain("title={L.trips.emptyTitle[lang]}");
    expect(VIEW_SRC).toContain("title={L.consult.emptyTitle[lang]}");
    expect(VIEW_SRC).toContain('action={{ label: L.trips.emptyAction[lang], href: "/nacrtuj" }');
    expect(VIEW_SRC).toContain('action={{ label: L.consult.emptyAction[lang], href: "/#vprasi-lokalca" }}');
    expect(VIEW_SRC).toContain("title={L.errorTitle[lang]}");
  });

  test("datumi so jezikovno zavestni (sl-SI privzet, en-GB za EN)", () => {
    expect(VIEW_SRC).toContain('formatDate(iso: string, lang: "sl" | "en")');
    expect(VIEW_SRC).toContain('"sl-SI"');
    expect(VIEW_SRC).toContain('"en-GB"');
    expect(VIEW_SRC).toContain("formatDate(trip.savedAt, lang)");
    expect(VIEW_SRC).toContain("formatDate(trip.createdAt, lang)");
    expect(VIEW_SRC).toContain("formatDate(c.deliveredAt, lang)");
  });
});

describe("F4-C brez hardcoded SL: my-trip-view render", () => {
  test("reprezentativni SL markerji so iztrebljeni iz rendera", () => {
    for (const marker of [
      "Iz priljubljenih",
      "Uporabi v načrtu",
      "Nadaljuj načrtovanje",
      "Moja pot",
      "Odstrani",
      "Počisti",
      "Obnovi",
      "Zbirka izpraznjena",
      "Uporabljeno v načrtu",
      "Načrtuj",
      "Odpri v tržnici",
      "Predlagane destinacije",
      "Vodiči",
      "Znamenitosti",
      "Lokali",
      "Doživetja",
      "Izdelki",
      "Skupnost",
      "Uvoženo",
      "AI predlogi",
    ]) {
      expect(MYTRIP_RENDER.includes(marker)).toBe(false);
    }
  });

  test("trak „Iz priljubljenih“ živi v obeh jezikih v slovarju", () => {
    expect(MYTRIP_SRC).toContain('title: "Iz priljubljenih"');
    expect(MYTRIP_SRC).toContain('title: "From favourites"');
    expect(MYTRIP_SRC).toContain('use: "Uporabi v načrtu"');
    expect(MYTRIP_SRC).toContain('use: "Use in my plan"');
    expect(MYTRIP_SRC).toContain('planAction: "Načrtuj"');
    expect(MYTRIP_SRC).toContain('planAction: "Plan"');
  });
});

// ---------------------------------------------------------------------------
// 3. ZERO-LOSS — zbirka, most, handoff, sinhronizacija, stanja, lupina
// ---------------------------------------------------------------------------
describe("F4-C zero-loss: moja-potovanja-view (zbirka + sinhronizacija + stanja)", () => {
  test("MyTripView ostaja renderan (gost + prijavljeni) + MyOrdersSection", () => {
    expect((VIEW_SRC.match(/<MyTripView/g) ?? []).length).toBe(2);
    expect(VIEW_SRC).toContain("<MyOrdersSection");
  });

  test("pull sinhronizacija F2-A ostaja (uvoz + klic ob mountu)", () => {
    expect(VIEW_SRC).toContain(
      'import { syncMyTripToServer } from "@/lib/my-trip-sync"'
    );
    expect(VIEW_SRC).toContain("void syncMyTripToServer()");
  });

  test("družina stanj F3-B ostaja (LoadingState ×3, ErrorState, EmptyState ×3)", () => {
    expect(VIEW_SRC).toContain(
      'import { LoadingState } from "@/components/states/loading-state"'
    );
    expect(VIEW_SRC).toContain(
      'import { ErrorState } from "@/components/states/error-state"'
    );
    expect(VIEW_SRC).toContain(
      'import { EmptyState } from "@/components/states/empty-state"'
    );
    expect((VIEW_SRC.match(/<LoadingState/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(VIEW_SRC).toContain("<ErrorState");
    expect((VIEW_SRC.match(/<EmptyState/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  test("account akcije + odjava ostajajo (zero-loss D8-E)", () => {
    expect(VIEW_SRC).toContain('signOut({ callbackUrl: "/" })');
    expect(VIEW_SRC).toContain("getSavedTrips");
    expect(VIEW_SRC).not.toContain("<header");
    expect(VIEW_SRC).not.toContain("<footer");
  });

  test("useLocale → lang kanon + jezikovno varna privzeta vrednost", () => {
    expect(VIEW_SRC).toContain('import { useLocale } from "next-intl"');
    expect(VIEW_SRC).toContain(
      'const lang: "sl" | "en" = locale === "en" ? "en" : "sl"'
    );
  });

  test("<main> landmark ostaja v vsaki render poti (a11y, kanon task8-e)", () => {
    const opens = (VIEW_SRC.match(/<main[\s>]/g) ?? []).length;
    const closes = (VIEW_SRC.match(/<\/main>/g) ?? []).length;
    expect(opens).toBe(3);
    expect(opens).toBe(closes);
  });
});

describe("F4-C zero-loss: my-trip-view (collection gate + most + handoff)", () => {
  test("collection gate ostaja NETAKNJEN (testna pogodba: count === 0 → null)", () => {
    expect(MYTRIP_SRC).toContain("if (count === 0) return null;");
  });

  test("most „Iz priljubljenih“: ISTI dai:my-trip-prefill dogodek + quick-add", () => {
    expect(MYTRIP_SRC).toContain(
      'import { MY_TRIP_PREFILL_EVENT, type MyTripPrefillDetail } from "@/components/planner-my-trip-strip"'
    );
    expect(MYTRIP_SRC).toContain(
      "new CustomEvent<MyTripPrefillDetail>(MY_TRIP_PREFILL_EVENT,"
    );
    expect(MYTRIP_SRC).toContain("addMyTripItem(wishlistTripItemOf(entry))");
    expect(MYTRIP_SRC).toContain(
      '.filter((id): id is string => typeof id === "string")'
    );
  });

  test("handoff v načrtovalnik + brisanje/obnova zbirke ostajajo", () => {
    expect(MYTRIP_SRC).toContain("setMyTripHandoff()");
    expect(MYTRIP_SRC).toContain("clearMyTripItems()");
    expect(MYTRIP_SRC).toContain('router.push("/nacrtuj")');
  });

  test("wishlist hook + grupiranje destinacij + /trznica fallback ostajajo", () => {
    expect(MYTRIP_SRC).toContain('import { useWishlist } from "@/hooks/use-wishlist"');
    expect(MYTRIP_SRC).toContain("groupWishlistByDestination(");
    expect(MYTRIP_SRC).toContain('href="/trznica"');
    expect(MYTRIP_SRC).toContain("×{group.count}");
    expect(MYTRIP_SRC).toContain('id="moja-pot"');
    expect(MYTRIP_SRC).toContain("useLocale");
  });
});

// ---------------------------------------------------------------------------
// 4. STRAN — generateMetadata pogodba (vzorec /potovanje)
// ---------------------------------------------------------------------------
describe("F4-C stran: generateMetadata + lupina", () => {
  test("generateMetadata z await getLocale() + L meta nizi", () => {
    expect(PAGE_SRC).toContain(
      "export async function generateMetadata(): Promise<Metadata>"
    );
    expect(PAGE_SRC).toContain("await getLocale()");
    expect(PAGE_SRC).toContain("L.metaTitle[lang]");
    expect(PAGE_SRC).toContain("L.metaDescription[lang]");
  });

  test("canonical /moja-potovanja + hreflang alternati (host-zavedno)", () => {
    expect(PAGE_SRC).toContain('const PATH = "/moja-potovanja"');
    expect(PAGE_SRC).toContain("canonical: `${base}${PATH}`");
    expect(PAGE_SRC).toContain("hreflangForPath(PATH, base)");
    expect(PAGE_SRC).toContain("currentBaseUrl()");
  });

  test("server ovoj ostaja strežniški z enotno lupino (D8-E zero-loss)", () => {
    expect(PAGE_SRC.startsWith('"use client"')).toBe(false);
    expect(PAGE_SRC).toContain("<Navigation solid />");
    expect(PAGE_SRC).toContain("<MojaPotovanjaView />");
    expect(PAGE_SRC).toContain("<Footer />");
  });

  test("EN razširitev ne odpira /en URL-ja sama (P4-8 — routing je lastnik)", () => {
    // whitelist (src/i18n/routing.ts) je IZVEN obsega F4-C — proxy 308
    // še vedno pokriva /en/moja-potovanja; hreflangForPath sam odloči.
    expect(PAGE_SRC).not.toContain("isEnRoute");
    expect(PAGE_SRC).not.toContain("EN_STATIC_ROUTES");
  });
});

// ---------------------------------------------------------------------------
// 5. SL/EN PARITETA — ključni nizi obstajajo v obeh jezikih in se razlikujejo
// ---------------------------------------------------------------------------
describe("F4-C pariteta SL/EN: ključni nizi se razlikujejo", () => {
  test("moja-potovanja-view: 12 ključnih nizov", () => {
    const byKey = (k: string) => VIEW_LEAVES.find((l) => l.key === k);
    for (const key of [
      "title",
      "open",
      "signIn",
      "signOut",
      "createAccount",
      "greeting",
      "resend",
      "answered",
      "pending",
      "answerByEmail",
      "loadFailed",
      "checkInbox",
      "alertTitle",
      "onThisDevice",
      "subtitleB",
    ]) {
      const leaf = byKey(key);
      expect(leaf).toBeDefined();
      const { sl, en } = leaf as Leaf;
      expect(sl.length).toBeGreaterThan(0);
      expect(en.length).toBeGreaterThan(0);
      expect(sl).not.toBe(en);
    }
  });

  test("my-trip-view: 10 ključnih nizov (koren + wishlist + skupine)", () => {
    const { sl, en } = localeBlocks(MYTRIP_SRC);
    const leaf = (block: string, indent: number, key: string) =>
      block.match(new RegExp(`^ {${indent}}${key}: "([^"]+)"`, "m"))?.[1];
    for (const [indent, key] of [
      [4, "title"],
      [4, "continue"],
      [4, "clear"],
      [4, "open"],
      [4, "cleared"],
      [4, "undo"],
      [6, "title"], // wishlist.title — „Iz priljubljenih“ / „From favourites“
      [6, "use"],
      [6, "planAction"],
      [6, "note"],
      [6, "openMarket"],
      [6, "destination"], // groups.destination
    ] as const) {
      const slValue = leaf(sl, indent, key);
      const enValue = leaf(en, indent, key);
      expect(slValue).toBeDefined();
      expect(enValue).toBeDefined();
      expect((slValue as string).length).toBeGreaterThan(0);
      expect((enValue as string).length).toBeGreaterThan(0);
      expect(slValue).not.toBe(enValue);
    }
  });

  test("stran: meta naslov in opis se razlikujeta med jezikoma", () => {
    for (const leaf of PAGE_LEAVES) {
      expect(leaf.sl).not.toBe(leaf.en);
      expect(leaf.sl.length).toBeGreaterThan(10);
      expect(leaf.en.length).toBeGreaterThan(10);
    }
  });
});
