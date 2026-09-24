import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildDeterministicWhy,
  cacheEntryHasValidWhy,
  containsInventedClaims,
  mapSelectionToWhys,
  parseSelection,
  shouldServeFromCache,
  type AiSelectionEntry,
  type CacheEntry,
  type ExperienceCandidate,
  type ProductCandidate,
  type RecommendationWhy,
  type WhySource,
} from "@/lib/ai-recommendations";
import slMessages from "@/i18n/messages/sl.json";
import enMessages from "@/i18n/messages/en.json";

// ============================================================================
// ISSUE #4 VAL 5 SKLOP B (§20) — RAZLOŽLJIVA PRIPOROČILA
// ============================================================================
//
// Priporočila tržnice niso več črn AI ranking: vsak item nosi why vrstico
// (samo dejstva iz kandidata) + whySource ("ai" | "deterministic").
// Ti testi kodirajo obljube plasti:
//
//   §1 DETERMINISTIČNI WHY: vrstica omenja SAMO prisotna polja (ocena+cena
//      → obe; brez ocene → brez omembe), obe lokali, obe vrsti
//      (izdelek/izkušnja).
//   §2 ČISTOST RAZLOGOV: why NIKOLI ne vsebuje izmišljenih označ
//      (recenzije/sezona/dostopnost/odpiralni čas/vreme/popularnost/
//      zaloga) — niti prek AI odgovora (containsInventedClaims filter).
//   §3 PRESLIKAVA (mapper): veljavna izbira → why; out-of-range i zavrnjen;
//      duplikat zavrnjen; manjkajoč/prazen why → deterministična zamenjava
//      (whySource "deterministic"); AI why → whySource "ai"; kap 4.
//   §4 CACHE: zapis z why se servira ob zadetku; dedni zapis brez why
//      (≤1.96) velja za ZASTARELO → rebuild (ne sesutje); pokvarjene
//      oblike (dolžina/prazno/neveljaven izvor) tudi ne.
//   §5 KONTRAKTNI: API odgovor vključuje why+whySource (tipovno +
//      wiring obeh rut + obeh modalov) in i18n ključi obstajajo v SL+EN
//      z enako množico (pariteta).
// ============================================================================

/** Fiksna ura (reproducibilnost — funkcije prejmejo uro injicirano). */
const NOW = Date.parse("2026-09-24T12:00:00Z");
const HOUR = 60 * 60 * 1000;

function source(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

// ---------------------------------------------------------------------------
// Fixture kandidati (polja, ki jih vidi AI prompt — nič drugega)
// ---------------------------------------------------------------------------

const PRODUCT_FULL: ProductCandidate = {
  id: "prod-1",
  name: "Refošk Vipava",
  description: "Rdeče vino iz Vipavske doline.",
  category: "wine",
  destinationName: "Vipavska dolina",
  price: 12.5,
  organic: true,
  handmade: false,
  local: true,
  vegan: false,
  rating: 4.8,
};

const PRODUCT_BARE: ProductCandidate = {
  id: "prod-2",
  name: "Suha mesnina",
  description: "Lokalna mesnina.",
  category: "food",
  destinationName: null,
  price: 0,
  organic: false,
  handmade: false,
  local: false,
  vegan: false,
  rating: 0,
};

const EXPERIENCE_FULL: ExperienceCandidate = {
  id: "exp-1",
  name: "Rafting na Soči",
  description: "Adrenalin na beli vodi.",
  category: "adventure",
  destinationName: "Soška dolina",
  pricePerPerson: 45,
  durationHours: 3,
  familyFriendly: true,
  rating: 4.9,
};

const EXPERIENCE_BARE: ExperienceCandidate = {
  id: "exp-2",
  name: "Degustacija sira",
  description: "Degustacija.",
  category: "tasting",
  destinationName: null,
  pricePerPerson: 0,
  durationHours: 0,
  familyFriendly: false,
  rating: 0,
};

/** Kandidatski nabor iz 6 kandidatov (mapper testira indekse 0–5). */
const PRODUCTS: ProductCandidate[] = [
  { ...PRODUCT_FULL, id: "p0" },
  { ...PRODUCT_FULL, id: "p1" },
  { ...PRODUCT_FULL, id: "p2" },
  { ...PRODUCT_FULL, id: "p3" },
  { ...PRODUCT_FULL, id: "p4" },
  { ...PRODUCT_FULL, id: "p5" },
];

// ---------------------------------------------------------------------------
// §1 — DETERMINISTIČNI WHY (samo prisotna polja)
// ---------------------------------------------------------------------------

describe("ISSUE #4 §20/§1: buildDeterministicWhy — sestava iz prisotnih polj", () => {
  test("izdelek z oceno IN ceno → vrstica omeni OBE (SL)", () => {
    const why = buildDeterministicWhy(PRODUCT_FULL, "product", "sl");
    expect(why).toContain("ocena 4,8");
    expect(why).toContain("od €12,5");
    expect(why).toContain("wine");
    expect(why).toContain("Vipavska dolina");
  });

  test("izdelek z oceno IN ceno → OBE tudi v EN (decimalna pika, from €)", () => {
    const why = buildDeterministicWhy(PRODUCT_FULL, "product", "en");
    expect(why).toContain("rating 4.8");
    expect(why).toContain("from €12.5");
    expect(why).toContain("wine");
    expect(why).toContain("Vipavska dolina");
  });

  test("kandidat BREZ ocene → NOBENE omembe ocene (ne izumi)", () => {
    const sl = buildDeterministicWhy(PRODUCT_BARE, "product", "sl");
    const en = buildDeterministicWhy(PRODUCT_BARE, "product", "en");
    expect(sl).not.toContain("ocena");
    expect(en).not.toContain("rating");
  });

  test("kandidat BREZ cene → NOBENE omembe cene (ne izumi)", () => {
    const sl = buildDeterministicWhy(PRODUCT_BARE, "product", "sl");
    const en = buildDeterministicWhy(PRODUCT_BARE, "product", "en");
    expect(sl).not.toContain("od €");
    expect(en).not.toContain("from €");
  });

  test("kandidat BREZ regije (destinationName null) → brez omembe regije", () => {
    const why = buildDeterministicWhy(PRODUCT_BARE, "product", "sl");
    expect(why).not.toContain("regija");
    expect(why).not.toContain("neznana");
    expect(why).not.toContain("Vipavska");
  });

  test("izkušnja z dimenzijo trajanja → omeni trajanje (SL/EN)", () => {
    const sl = buildDeterministicWhy(EXPERIENCE_FULL, "experience", "sl");
    const en = buildDeterministicWhy(EXPERIENCE_FULL, "experience", "en");
    expect(sl).toContain("trajanje 3 h");
    expect(en).toContain("duration 3 h");
  });

  test("izkušnja familyFriendly → oznaka; BREZ nje → brez oznake", () => {
    expect(buildDeterministicWhy(EXPERIENCE_FULL, "experience", "sl")).toContain(
      "primerno za družine"
    );
    expect(
      buildDeterministicWhy(EXPERIENCE_BARE, "experience", "en")
    ).not.toContain("family-friendly");
  });

  test("izkušnja BREZ trajanja → brez omembe trajanja (ne izumi)", () => {
    const sl = buildDeterministicWhy(EXPERIENCE_BARE, "experience", "sl");
    const en = buildDeterministicWhy(EXPERIENCE_BARE, "experience", "en");
    expect(sl).not.toContain("trajanje");
    expect(en).not.toContain("duration");
  });

  test("značke izdelka: samo RESNIČNE (bio+lokalno DA, vegansko NE)", () => {
    const sl = buildDeterministicWhy(PRODUCT_FULL, "product", "sl");
    const en = buildDeterministicWhy(PRODUCT_FULL, "product", "en");
    expect(sl).toContain("bio");
    expect(sl).toContain("lokalno");
    expect(sl).not.toContain("vegansko");
    expect(en).toContain("organic");
    expect(en).toContain("local");
    expect(en).not.toContain("vegan");
  });

  test("cena izdelka vs cena izkušnje: obe iz lastnega polja", () => {
    expect(buildDeterministicWhy(PRODUCT_FULL, "product", "sl")).toContain("od €12,5");
    expect(buildDeterministicWhy(EXPERIENCE_FULL, "experience", "sl")).toContain(
      "od €45"
    );
  });

  test("ekstrem: VSA polja manjkajo → vrstica pade na ime (neprazna)", () => {
    const bare: ProductCandidate = {
      ...PRODUCT_BARE,
      category: "",
      name: "Samo ime",
    };
    const why = buildDeterministicWhy(bare, "product", "sl");
    expect(why).toBe("Samo ime");
    expect(why.length).toBeGreaterThan(0);
  });

  test("decimalne ločila: SL vejica, EN pika (ocena + ne-cela cena)", () => {
    const sl = buildDeterministicWhy(PRODUCT_FULL, "product", "sl");
    const en = buildDeterministicWhy(PRODUCT_FULL, "product", "en");
    expect(sl).toContain("4,8");
    expect(sl).not.toContain("4.8");
    expect(en).toContain("4.8");
    expect(en).not.toContain("4,8");
  });
});

// ---------------------------------------------------------------------------
// §2 — ČISTOST RAZLOGOV (nikoli izmišljeni podatki)
// ---------------------------------------------------------------------------

describe("ISSUE #4 §20/§2: čistost razlogov — brez izmišljenih označ", () => {
  test("deterministični why NIKOLI ne omenja recenzij (reviewCount ni v kandidatu)", () => {
    for (const c of [PRODUCT_FULL, PRODUCT_BARE]) {
      for (const l of ["sl", "en"] as const) {
        const why = buildDeterministicWhy(c, "product", l);
        expect(why).not.toMatch(/recenz|mnenj|review/i);
      }
    }
  });

  test("deterministični why NIKOLI ne trdi sezone/dostopnosti/odpiralnega časa/vremena", () => {
    const banned = /sezon|season|dostopn|accessible|odpiral|opening|vreme|weather|priljubljen|popular|bestseller|stock|zalog/i;
    const cases: Array<[ProductCandidate | ExperienceCandidate, "product" | "experience"]> = [
      [PRODUCT_FULL, "product"],
      [PRODUCT_BARE, "product"],
      [EXPERIENCE_FULL, "experience"],
      [EXPERIENCE_BARE, "experience"],
    ];
    for (const [c, kind] of cases) {
      for (const l of ["sl", "en"] as const) {
        expect(buildDeterministicWhy(c, kind, l)).not.toMatch(banned);
      }
    }
  });

  test("containsInventedClaims: prepozna izmišljene trditve (SL + EN)", () => {
    expect(containsInventedClaims("Odlične recenzije obiskovalcev")).toBe(true);
    expect(containsInventedClaims("Najbolj priljubljena izbira")).toBe(true);
    expect(containsInventedClaims("Seasonal favorite")).toBe(true);
    expect(containsInventedClaims("Fully accessible venue")).toBe(true);
    expect(containsInventedClaims("Open all summer season")).toBe(true);
    expect(containsInventedClaims("Top reviews")).toBe(true);
    expect(containsInventedClaims("Dostopno za invalide")).toBe(true);
    expect(containsInventedClaims("Vreme je vedno lepo")).toBe(true);
    expect(containsInventedClaims("Odpoved ob slabem vremenu")).toBe(true);
    expect(containsInventedClaims("Only 2 left in stock")).toBe(true);
  });

  test("containsInventedClaims: zakonite vrstice (samo kandidatova polja) ostanejo", () => {
    expect(containsInventedClaims("ista regija in podobna cena, ocena 4,8")).toBe(false);
    expect(containsInventedClaims("complementary activity, rating 4.9")).toBe(false);
    expect(containsInventedClaims("bio, lokalno, od €12")).toBe(false);
    expect(containsInventedClaims("trajanje 3 h, primerno za družine")).toBe(false);
  });

  test("mapper: AI why z izmišljeno trditvijo → iskrena deterministična zamenjava", () => {
    const whys = mapSelectionToWhys(
      [{ i: 0, why: "najboljše recenzije v regiji", whyEn: "top reviews" }],
      PRODUCTS,
      "product"
    );
    expect(whys).toHaveLength(1);
    expect(whys[0].sourceSl).toBe("deterministic");
    expect(whys[0].sourceEn).toBe("deterministic");
    // Zamenjava je dejstva iz kandidata (ne izmišljena trditev)
    expect(whys[0].sl).toContain("ocena 4,8");
    expect(whys[0].sl).not.toMatch(/recenz|mnenj|review/i);
    expect(whys[0].en).not.toMatch(/recenz|mnenj|review/i);
  });
});

// ---------------------------------------------------------------------------
// §3 — PRESIKAVA (mapper hardening)
// ---------------------------------------------------------------------------

describe("ISSUE #4 §20/§3: mapSelectionToWhys — preslikava AI izbire", () => {
  test("veljavna izbira z AI why → itemi z why, whySource \"ai\"", () => {
    const selection: AiSelectionEntry[] = [
      { i: 2, why: "ista regija, podobna cena", whyEn: "same region, similar price" },
      { i: 0, why: "complementary uporaba", whyEn: "complementary use" },
    ];
    const whys = mapSelectionToWhys(selection, PRODUCTS, "product");
    expect(whys).toHaveLength(2);
    expect(whys[0].id).toBe("p2");
    expect(whys[0].sl).toBe("ista regija, podobna cena");
    expect(whys[0].en).toBe("same region, similar price");
    expect(whys[0].sourceSl).toBe("ai");
    expect(whys[0].sourceEn).toBe("ai");
    expect(whys[1].id).toBe("p0");
  });

  test("out-of-range i (≥ dolžina, negativen, necel) → vnos ZAVRNJEN", () => {
    const whys = mapSelectionToWhys(
      [
        { i: 6, why: "x" }, // nad naborom (6 kandidatov → 0–5)
        { i: -1, why: "x" },
        { i: 1.5, why: "x" }, // necelo število
        { i: "2", why: "x" } as unknown as AiSelectionEntry, // niz namesto številke
        { i: 5, why: "veljaven" },
      ],
      PRODUCTS,
      "product"
    );
    expect(whys).toHaveLength(1);
    expect(whys[0].id).toBe("p5");
    expect(whys[0].sl).toBe("veljaven");
  });

  test("podvojen i → drugi vnos ZAVRNJEN (brez duplikatov)", () => {
    const whys = mapSelectionToWhys(
      [
        { i: 1, why: "prvi" },
        { i: 1, why: "drugi" },
        { i: 3, why: "drugi indeks" },
      ],
      PRODUCTS,
      "product"
    );
    expect(whys).toHaveLength(2);
    expect(whys[0].sl).toBe("prvi");
    expect(whys[1].sl).toBe("drugi indeks");
  });

  test("manjkajoč/prazen/napačen-tip why → deterministična zamenjava z whySource \"deterministic\"", () => {
    const whys = mapSelectionToWhys(
      [
        { i: 0 }, // why povsem manjka
        { i: 1, why: "" }, // prazen niz
        { i: 2, why: 42 }, // napačen tip (številka)
      ],
      PRODUCTS,
      "product"
    );
    expect(whys).toHaveLength(3);
    for (const w of whys) {
      expect(w.sourceSl).toBe("deterministic");
      expect(w.sl).toBe(buildDeterministicWhy(PRODUCTS[0], "product", "sl"));
    }
  });

  test("AI why samo v SL (whyEn manjka) → SL \"ai\", EN iskreno \"deterministic\"", () => {
    const whys = mapSelectionToWhys([{ i: 0, why: "ista regija" }], PRODUCTS, "product");
    expect(whys[0].sourceSl).toBe("ai");
    expect(whys[0].sl).toBe("ista regija");
    expect(whys[0].sourceEn).toBe("deterministic");
    expect(whys[0].en).toBe(buildDeterministicWhy(PRODUCTS[0], "product", "en"));
  });

  test("kap DEFAULT_LIMIT: 6 veljavnih vnosov → največ 4", () => {
    const selection: AiSelectionEntry[] = [0, 1, 2, 3, 4, 5].map((i) => ({
      i,
      why: `razlog ${i}`,
    }));
    const whys = mapSelectionToWhys(selection, PRODUCTS, "product");
    expect(whys).toHaveLength(4);
    expect(whys[3].sl).toBe("razlog 3");
  });

  test("prazna izbira → prazen rezultat (iskrena praznina, ne izumi)", () => {
    expect(mapSelectionToWhys([], PRODUCTS, "product")).toEqual([]);
  });
});

describe("ISSUE #4 §20/§3b: parseSelection — luščenje AI odgovora", () => {
  test("nov obrazec {\"selection\":[…]} z ograjami ```json", () => {
    const content = '```json\n{"selection":[{"i":3,"why":"ista regija","whyEn":"same region"},{"i":1,"why":"cena","whyEn":"price"}]}\n```';
    const sel = parseSelection(content);
    expect(sel).not.toBeNull();
    expect(sel).toHaveLength(2);
    expect(sel?.[0].i).toBe(3);
    expect(sel?.[0].why).toBe("ista regija");
    expect(sel?.[0].whyEn).toBe("same region");
  });

  test("dedni obrazec [3,1,4,2] (brez why) → izbira se OHRANI (why pride deterministično)", () => {
    const sel = parseSelection("[3, 1, 4, 2]");
    expect(sel).not.toBeNull();
    expect(sel?.map((e) => e.i)).toEqual([3, 1, 4, 2]);
    expect(sel?.[0].why).toBeUndefined();
    const whys = mapSelectionToWhys(sel!, PRODUCTS, "product");
    expect(whys).toHaveLength(4);
    expect(whys.map((w) => w.id)).toEqual(["p3", "p1", "p4", "p2"]);
    expect(whys.every((w) => w.sourceSl === "deterministic")).toBe(true);
  });

  test("smeti → null (klicalec pade na SQL fallback)", () => {
    expect(parseSelection("")).toBeNull();
    expect(parseSelection("Nimam pojma, kaj bi izbral.")).toBeNull();
    expect(parseSelection('{"selection": "ni-array"}')).toBeNull();
    expect(parseSelection('{"selection": []}')).toBeNull();
  });

  test("nov obrazec ima prednost pred dednim (ograde okoli objekta)", () => {
    // Notranji array NE sme zmagati nad objektom (sicer bi izgubili why)
    const content = '{"selection":[{"i":2,"why":"a"}]}';
    const sel = parseSelection(content);
    expect(sel?.[0].why).toBe("a");
  });
});

// ---------------------------------------------------------------------------
// §4 — CACHE (why v shranjeni obliki; legacy = zastarelo)
// ---------------------------------------------------------------------------

describe("ISSUE #4 §20/§4: cache oblika z why (shape check + servis)", () => {
  const validWhy = (id: string): RecommendationWhy => ({
    id,
    sl: `kategorija ${id}`,
    en: `category ${id}`,
    sourceSl: "ai",
    sourceEn: "ai",
  });

  const freshEntry = (whys?: RecommendationWhy[]): CacheEntry => ({
    cachedAt: NOW - HOUR, // 1 h star — znotraj 24 h TTL
    itemIds: ["a", "b"],
    source: "ai",
    ...(whys ? { whys } : {}),
  });

  test("zapis Z why (veljavna oblika) + svež → servis iz cache-a", () => {
    const entry = freshEntry([validWhy("a"), validWhy("b")]);
    expect(cacheEntryHasValidWhy(entry)).toBe(true);
    expect(shouldServeFromCache(entry, NOW)).toBe(true);
  });

  test("DEDNI zapis BREZ whys (≤1.96) → ZASTARELO → rebuild (ne sesutje)", () => {
    const legacy = freshEntry(); // brez whys
    expect(cacheEntryHasValidWhy(legacy)).toBe(false);
    expect(shouldServeFromCache(legacy, NOW)).toBe(false);
  });

  test("whys dolžina ≠ itemIds dolžina → neveljavno", () => {
    const entry = freshEntry([validWhy("a")]); // 1 why za 2 itemIds
    expect(cacheEntryHasValidWhy(entry)).toBe(false);
    expect(shouldServeFromCache(entry, NOW)).toBe(false);
  });

  test("prazna sl/en vrstica v whys → neveljavno", () => {
    const broken: RecommendationWhy = { ...validWhy("a"), sl: "   " };
    const entry = freshEntry([broken, validWhy("b")]);
    expect(cacheEntryHasValidWhy(entry)).toBe(false);
  });

  test("neveljavna vrednost izvora (sourceSl) → neveljavno", () => {
    // Namerno neveljavna vrednost izvora — posredni kast prek unknown
    // (intencionalna kršitev tipa v testu vrata).
    const broken = {
      ...validWhy("a"),
      sourceSl: "crowdsourced",
    } as unknown as RecommendationWhy;
    const entry = freshEntry([broken, validWhy("b")]);
    expect(cacheEntryHasValidWhy(entry)).toBe(false);
  });

  test("id v whys se ne ujema z itemIds vrstnim redom → neveljavno", () => {
    const entry = freshEntry([validWhy("b"), validWhy("a")]); // obratno
    expect(cacheEntryHasValidWhy(entry)).toBe(false);
  });

  test("potekel TTL (24 h) → ne servisiramo (neodvisno od why oblike)", () => {
    const entry: CacheEntry = {
      cachedAt: NOW - 25 * HOUR,
      itemIds: ["a"],
      source: "ai",
      whys: [validWhy("a")],
    };
    expect(shouldServeFromCache(entry, NOW)).toBe(false);
  });

  test("manjkajoč zapis (undefined) → ne servisiramo", () => {
    expect(shouldServeFromCache(undefined, NOW)).toBe(false);
  });

  test("ne-objekt vnosi → neveljavno (ne sesuje se)", () => {
    expect(cacheEntryHasValidWhy(null)).toBe(false);
    expect(cacheEntryHasValidWhy("product:1")).toBe(false);
    expect(cacheEntryHasValidWhy({ itemIds: "a", whys: [] })).toBe(false);
    expect(
      cacheEntryHasValidWhy({ itemIds: ["a"], whys: [{ id: "a", sl: "x", en: "y" }] })
    ).toBe(false); // manjkajoča izvora
  });
});

// ---------------------------------------------------------------------------
// §5 — KONTRAKTNI (API odgovor + UI wiring + i18n pariteta)
// ---------------------------------------------------------------------------

describe("ISSUE #4 §20/§5: kontraktni — odgovor/API/UI/i18n nosita why + whySource", () => {
  test("tipovna: RecommendationWhy ima id/sl/en/sourceSl/sourceEn", () => {
    const fixture: RecommendationWhy = {
      id: "p1",
      sl: "wine · ocena 4,8",
      en: "wine · rating 4.8",
      sourceSl: "deterministic",
      sourceEn: "deterministic",
    };
    // Fixtura tipa PREVERJA kompilacija; runtime potrdi vrednosti ključev.
    expect(Object.keys(fixture).sort()).toEqual(
      ["id", "sl", "en", "sourceSl", "sourceEn"].sort()
    );
    const src: WhySource = fixture.sourceSl;
    expect(src === "ai" || src === "deterministic").toBe(true);
  });

  test("API odgovor item vključuje why + whySource (fixture oblike rute)", () => {
    // Fixture ravnatelja iz products rute: why + whySource se polegeta
    // SAMO kadar vrstica obstaja (pragma ...(why ? {why, whySource} : {})).
    const withWhy = { id: "p1", name: "X", why: "wine · ocena 4,8", whySource: "ai" as WhySource };
    const withoutWhy = { id: "p2", name: "Y" };
    expect(withWhy.why).toBeTypeOf("string");
    expect(withWhy.whySource).toBe("ai");
    expect("why" in withoutWhy).toBe(false);
    expect("whySource" in withoutWhy).toBe(false);
  });

  test("obe ruti pošiljata lang + pripenjata why/whySource na iteme (wiring)", () => {
    const productsRoute = source("src/app/api/recommendations/products/route.ts");
    const experiencesRoute = source("src/app/api/recommendations/experiences/route.ts");
    for (const route of [productsRoute, experiencesRoute]) {
      expect(route).toContain('searchParams.get("lang")');
      expect(route).toContain("whySource");
      expect(route).toContain("...(why ? { why, whySource } : {})");
      expect(route).toContain("getRecommendedIds");
    }
  });

  test("oba modala izrisujeta why vrstico + izvor (wiring)", () => {
    const expModal = source("src/components/sections/experience-modal.tsx");
    const prodModal = source("src/components/sections/product-modal.tsx");
    for (const modal of [expModal, prodModal]) {
      expect(modal).toContain('useTranslations("marketplace")');
      expect(modal).toContain('t("recsWhy", { why:');
      expect(modal).toContain('t("recsWhyFromData")');
      expect(modal).toContain('&lang=${locale === "en" ? "en" : "sl"}');
      // Iskrenostni pogoj: marker SAMO kadar whySource === "deterministic"
      expect(modal).toContain('=== "deterministic"');
    }
  });

  test("i18n: marketplace.recsWhy* obstaja v SL in EN (pariteta, {why} v obeh)", () => {
    // Posredni kast prek unknown: messages imajo 3-nivojsko gnezdenje
    // (npr. planCheck.errors), mi pa beremo SAMO marketplace (1 nivo).
    const sl = (slMessages as unknown as Record<string, Record<string, string>>).marketplace;
    const en = (enMessages as unknown as Record<string, Record<string, string>>).marketplace;
    expect(sl).toBeDefined();
    expect(en).toBeDefined();
    expect(Object.keys(sl).sort()).toEqual(Object.keys(en).sort());
    for (const key of ["recsWhy", "recsWhyFromData", "recsWhyFromDataTitle"]) {
      expect(sl[key]?.trim().length, `SL "${key}" prazen`).toBeGreaterThan(0);
      expect(en[key]?.trim().length, `EN "${key}" prazen`).toBeGreaterThan(0);
    }
    expect(sl.recsWhy).toContain("{why}");
    expect(en.recsWhy).toContain("{why}");
    // SL/EN sta prava prevoda (ne kopija) — vzorec task71
    expect(sl.recsWhy).not.toBe(en.recsWhy);
    expect(sl.recsWhy).toBe("Zakaj: {why}");
    expect(en.recsWhy).toBe("Why: {why}");
    expect(sl.recsWhyFromData).toContain("(iz podatkov)");
    expect(en.recsWhyFromData).toContain("(from data)");
  });
});
