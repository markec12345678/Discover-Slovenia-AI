// TASK 8 / F4-D (issue #8 Faza 4 „Discovery UX 2.0" — F3-E EN razširitev):
// testi EN razširitve RAZISKOVALNIH površin — /lokali (listings),
// /dogodki (events-calendar) in /dozivetja (experiences + Marketplace
// defaultTab, slednji je lastništvo naloge 4-a).
//
// 1. L-PARITETA: vsak list L-slovarja v vsaki dotaknjeni datoteki ima
//    neprazen SL in EN niz (EN ≠ SL — resni prevodi, ne kopije).
// 2. EVENTS EN WIRING: events-calendar uvaža EVENTS_EN +
//    EVENT_CATEGORY_LABELS_EN (source contract) in resolucija
//    eventText(event, lang) VEDNO vrne EN ime/opis pri lang="en"
//    (prekrivna plast po id-ju, fallback SL) — vedenjsko, na vseh 30
//    dogodkih, v uskladju z matchEventsForItinerary (events-i18n.test).
// 3. BREZ PREOSTALIH HARDCODED SL OZNAK: reprezentativni nizi obstajajo
//    SAMO znotraj L-slovarjev (ne kot goli JSX/atribut literali).
// 4. ZERO-LOSS: filter logika, sortiranje, groupedByMonth, states družina,
//    kanonski Dodaj v mojo pot in defaultTab="experiences" ostajajo.
// 5. STRANI: generateMetadata (getLocale + hreflangForPath) na vseh treh;
//    lupina Navigation/Footer/Chatbot ohranjena (pogodba D8-E).
// 6. EXPERIENCES: površina je dvojezična prek next-intl ključev homeExp.*
//    (isti vzorec kot destinations/homeDest) — pariteta SL/EN sporočil.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  EVENTS,
  EVENT_CATEGORY_LABELS,
  MONTH_OPTIONS,
  type EventCategory,
} from "@/lib/events-data";
import { EVENTS_EN, EVENT_CATEGORY_LABELS_EN } from "@/lib/events-data-en";
import { matchEventsForItinerary } from "@/lib/events-match";
// Vedenjski uvoz čistih funkcij iz komponent (isti kanon kot
// task97-planner-affiliate: insuranceGoHref iz booking-panel.tsx).
import {
  eventText,
  eventCategoryLabel,
  monthsFull,
  monthOptions,
} from "@/components/sections/events-calendar";
import { categoryLabel } from "@/components/sections/listings";
import { CATEGORY_LABELS, PLAN_LABELS } from "@/lib/listings-types";

const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const LISTINGS_SRC = read("src/components/sections/listings.tsx");
const EVENTS_SRC = read("src/components/sections/events-calendar.tsx");
const EXPERIENCES_SRC = read("src/components/sections/experiences.tsx");
const LOKALI_PAGE_SRC = read("src/app/lokali/page.tsx");
const DOGODKI_PAGE_SRC = read("src/app/dogodki/page.tsx");
const DOZIVETJA_PAGE_SRC = read("src/app/dozivetja/page.tsx");

const SL_MESSAGES = JSON.parse(read("src/i18n/messages/sl.json"));
const EN_MESSAGES = JSON.parse(read("src/i18n/messages/en.json"));

// ---------------------------------------------------------------------------
// 1. L-PARITETA — vsak list { sl, en }, obe vrednosti neprazni, resni prevodi
// ---------------------------------------------------------------------------
/** Izlušči telo L-slovarja (`const L = { … } as const;`). */
function extractL(name: string, src: string): string {
  const m = src.match(/const L = \{([\s\S]*?)\n\} as const;/);
  expect(m, `${name}: manjka L-slovar (L-pattern)`).not.toBeNull();
  return m?.[1] ?? "";
}

/** Pogodba paritete za eno datoteko: listi sl/en poravnani, neprazni, ≠. */
function expectLangParity(name: string, src: string) {
  const body = extractL(name, src);
  const slLeaves = [...body.matchAll(/sl: "((?:[^"\\]|\\.)*)"/g)].map(
    (x) => x[1]
  );
  const enLeaves = [...body.matchAll(/en: "((?:[^"\\]|\\.)*)"/g)].map(
    (x) => x[1]
  );
  expect(
    slLeaves.length,
    `${name}: vsak list potrebuje sl in en vejo`
  ).toBe(enLeaves.length);
  expect(slLeaves.length).toBeGreaterThan(0);
  for (const v of [...slLeaves, ...enLeaves]) {
    expect(v.trim().length, `${name}: prazen niz v L-slovarju`).toBeGreaterThan(
      0
    );
  }
  // Resni prevodi: noben EN list ni kopija SL lista (zipped po vrstnem redu
  // listov — vsak list je { sl, … en, … } v tem vrstnem redu).
  for (let i = 0; i < slLeaves.length; i++) {
    expect(
      enLeaves[i],
      `${name}: EN kopija SL pri listu ${i} (${slLeaves[i]})`
    ).not.toBe(slLeaves[i]);
  }
}

describe("F4-D L-pariteta: raziskovalne površine (SL + EN listi)", () => {
  test("listings.tsx — ves UI krom ima SL in EN", () => {
    expectLangParity("listings.tsx", LISTINGS_SRC);
  });

  test("events-calendar.tsx — ves UI krom ima SL in EN", () => {
    expectLangParity("events-calendar.tsx", EVENTS_SRC);
  });

  test("lokali/page.tsx — hero + metadata L", () => {
    expectLangParity("lokali/page.tsx", LOKALI_PAGE_SRC);
  });

  test("dogodki/page.tsx — hero + metadata L", () => {
    expectLangParity("dogodki/page.tsx", DOGODKI_PAGE_SRC);
  });

  test("dozivetja/page.tsx — hero + metadata L", () => {
    expectLangParity("dozivetja/page.tsx", DOZIVETJA_PAGE_SRC);
  });

  test("jezik površine: useLocale + SSR-varna preslikava (klientke strani)", () => {
    for (const [name, src] of [
      ["listings", LISTINGS_SRC],
      ["events-calendar", EVENTS_SRC],
    ] as const) {
      expect(src).toContain("useLocale");
      expect(src).toContain('locale === "en" ? "en" : "sl"');
      void name;
    }
  });
});

// ---------------------------------------------------------------------------
// 2. EVENTS EN WIRING — prekrivna plast EVENTS_EN + oznake kategorij EN
// ---------------------------------------------------------------------------
describe("F4-D events EN wiring: source contract (uvozi + resolucija)", () => {
  test("events-calendar uvaža EVENTS_EN in EVENT_CATEGORY_LABELS_EN", () => {
    expect(EVENTS_SRC).toContain(
      'import { EVENTS_EN, EVENT_CATEGORY_LABELS_EN } from "@/lib/events-data-en"'
    );
  });

  test("resolucija sledi vzorcu events-match (en?.name ?? ime, fallback SL)", () => {
    expect(EVENTS_SRC).toContain("en?.name ?? event.name");
    expect(EVENTS_SRC).toContain("en?.description ?? event.description");
    expect(EVENTS_SRC).toContain('lang === "en" ? EVENTS_EN[event.id] : undefined');
  });

  test("SL pot ostaja nespremenjena (EVENTS + EVENT_CATEGORY_LABELS iz events-data)", () => {
    expect(EVENTS_SRC).toContain('from "@/lib/events-data"');
    expect(EVENTS_SRC).toContain("EVENT_CATEGORY_LABELS[category]");
    // kartice pijejo iz EVENTS (filter/group logika nedotaknjena)
    expect(EVENTS_SRC).toContain("return EVENTS.filter((e) =>");
  });

  test("formatEventDate dobi tretji parameter lang (1.29.0 revizija #13)", () => {
    expect(EVENTS_SRC).toContain("formatEventDate(event.date, event.endDate, lang)");
  });

  test("meseci so jezikovno odvisni (glava skupine + filter)", () => {
    expect(EVENTS_SRC).toContain("monthsFull(lang)[month]");
    expect(EVENTS_SRC).toContain("monthOptions(lang)");
  });

  test("kategorija badge + filter pijejo EN oznake pri lang=en", () => {
    expect(EVENTS_SRC).toContain("eventCategoryLabel(event.category, lang)");
    expect(EVENTS_SRC).toContain("eventCategoryLabel(c.value, lang)");
  });
});

describe("F4-D events EN wiring: vedenjsko (resolucija na vseh 30 dogodkih)", () => {
  test('lang="en" → EN ime in opis iz EVENTS_EN za VSAK dogodek', () => {
    expect(EVENTS.length).toBe(30);
    for (const e of EVENTS) {
      const en = eventText(e, "en");
      expect(en.name).toBe(EVENTS_EN[e.id]!.name);
      expect(en.description).toBe(EVENTS_EN[e.id]!.description);
      // resni prevodi: EN opis se razlikuje od SL (imena so lahko ista —
      // lastna imena, npr. "Ljubljana Festival")
      expect(en.description).not.toBe(e.description);
    }
  });

  test('lang="sl" (privzeto) → slovensko ime in opis (nazaj kompatibilno)', () => {
    for (const e of EVENTS) {
      expect(eventText(e, "sl").name).toBe(e.name);
      expect(eventText(e, "sl").description).toBe(e.description);
    }
  });

  test("resolucija je V uskladju z matchEventsForItinerary (ista plast)", () => {
    const bledDays = [
      {
        day: 1,
        locations: [{ destination_id: "bled", destination_name: "Bled" }],
      },
    ];
    const matched = matchEventsForItinerary(bledDays, 6, null, "en");
    expect(matched.length).toBeGreaterThan(0);
    for (const ev of matched) {
      const source = EVENTS.find((e) => e.id === ev.id)!;
      expect(eventText(source, "en").name).toBe(ev.name);
      expect(eventText(source, "en").description).toBe(ev.description);
    }
  });

  test("neznan id (ni EN vnosa) → varen fallback na SL ime/opis", () => {
    const ghost = { id: "ne-obstojeci", name: "SL ime", description: "SL opis" };
    expect(eventText(ghost, "en").name).toBe("SL ime");
    expect(eventText(ghost, "en").description).toBe("SL opis");
  });

  test("kategorije: EN oznake za vseh 6 ključev, razlikujejo se od SL", () => {
    const categories = [...new Set(EVENTS.map((e) => e.category))];
    expect(categories.sort()).toEqual(
      (["festival", "glasba", "hrana", "kultura", "sport", "tradicija"] as EventCategory[]).sort()
    );
    for (const c of categories) {
      expect(eventCategoryLabel(c, "en")).toBe(EVENT_CATEGORY_LABELS_EN[c]);
      expect(eventCategoryLabel(c, "sl")).toBe(EVENT_CATEGORY_LABELS[c]);
      // "Festival" je ista beseda v obeh jezikih; ostale se razlikujejo
      if (c !== "festival") {
        expect(eventCategoryLabel(c, "en")).not.toBe(
          eventCategoryLabel(c, "sl")
        );
      }
    }
  });

  test("meseci: EN polna imena + ista pogodba vrednosti filtra kot MONTH_OPTIONS", () => {
    expect(monthsFull("sl")).toEqual(EVENTS.length ? monthsFull("sl") : []);
    expect(monthsFull("sl")[0]).toBe("Januar");
    expect(monthsFull("en")[0]).toBe("January");
    expect(monthsFull("en")).toHaveLength(12);
    // vrednosti (indeksi mesecev) ostajajo jezikovno nevtralne — filter
    // logika (selectedMonth >= startMonth …) se NE dotika
    expect(monthOptions("en").map((o) => o.value)).toEqual(
      MONTH_OPTIONS.map((o) => o.value)
    );
    expect(monthOptions("sl").map((o) => o.value)).toEqual(
      MONTH_OPTIONS.map((o) => o.value)
    );
    expect(monthOptions("en")[0].label).toBe("January");
    expect(monthOptions("sl")[0].label).toBe("Januar");
  });
});

// ---------------------------------------------------------------------------
// 3. LISTINGS — oznake kategorij/paketov + števec + filtri (vedenjsko)
// ---------------------------------------------------------------------------
describe("F4-D listings: kategorije/paketi v obeh jezikih (vedenjsko)", () => {
  test("categoryLabel pokriva VSE kategorije v SL in EN", () => {
    for (const key of Object.keys(CATEGORY_LABELS) as (keyof typeof CATEGORY_LABELS)[]) {
      expect(categoryLabel(key, "sl")).toBe(CATEGORY_LABELS[key]);
      expect(
        typeof categoryLabel(key, "en"),
        `CATEGORY_LABELS_EN manjka kategorijo "${key}"`
      ).toBe("string");
      expect(categoryLabel(key, "en").length).toBeGreaterThan(0);
    }
    // reprezentativni prevodi
    expect(categoryLabel("restaurant", "en")).toBe("Restaurant");
    expect(categoryLabel("activity", "en")).toBe("Activity");
    expect(categoryLabel("other", "en")).toBe("Other");
  });

  test("PLAN_LABELS_EN zrcali vse pakete (source — free/premium/enterprise)", () => {
    expect(LISTINGS_SRC).toContain("const PLAN_LABELS_EN: Record<ListingPlan, string> = {");
    for (const plan of Object.keys(PLAN_LABELS)) {
      expect(LISTINGS_SRC).toContain(`${plan}:`);
    }
    expect(LISTINGS_SRC).toContain('free: "Basic"');
  });

  test("števec ohranja SL dvojino/množino + EN preprosto množino (zero-loss)", () => {
    // SL: lokal / lokale (2–4) / lokalov (5+); EN: venue / venues
    expect(LISTINGS_SRC).toContain("L.showing[lang]");
    expect(LISTINGS_SRC).toContain("total === 1");
    expect(LISTINGS_SRC).toContain("total < 5");
    expect(LISTINGS_SRC).toContain("L.venueOne[lang]");
    expect(LISTINGS_SRC).toContain("L.venueFew[lang]");
    expect(LISTINGS_SRC).toContain("L.venueMany[lang]");
  });
});

// ---------------------------------------------------------------------------
// 4. BREZ PREOSTALIH HARDCODED SL OZNAK (reprezentativni nizi)
// ---------------------------------------------------------------------------
/** Niz ne sme biti goli JSX tekst (`>niz<`) — sme živeti samo v L-slovarju. */
function expectNoBareJsx(name: string, src: string, literals: string[]) {
  for (const lit of literals) {
    const escaped = lit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    expect(
      src.match(new RegExp(`>\\s*${escaped}\\s*<`)),
      `${name}: "${lit}" mora biti v L-slovarju, ne gol JSX tekst`
    ).toBeNull();
  }
}

describe("F4-D brez hardcoded SL: goli JSX/atribut literali so iztrebljeni", () => {
  test("listings.tsx — nizi živijo SAMO v L-slovarju", () => {
    expectNoBareJsx("listings", LISTINGS_SRC, [
      "Filtri",
      "Počisti filtre",
      "Podrobnosti",
      "Pridruži se",
      "Lokali v Sloveniji",
      "B2B imenik",
    ]);
    expect(LISTINGS_SRC).not.toContain('placeholder="Vse kategorije"');
    expect(LISTINGS_SRC).not.toContain('placeholder="Vse destinacije"');
    expect(LISTINGS_SRC).not.toContain('aria-label="Filtriraj');
    expect(LISTINGS_SRC).not.toContain('aria-label={`Spletna stran');
    // vseeno: SL vrednosti obstajajo kot L listi (ne izguba SL besedila)
    expect(LISTINGS_SRC).toContain('sl: "Podrobnosti"');
    expect(LISTINGS_SRC).toContain('sl: "Filtri"');
  });

  test("events-calendar.tsx — nizi živijo SAMO v L-slovarju", () => {
    expectNoBareJsx("events-calendar", EVENTS_SRC, [
      "Vse leto",
      "Koledar dogodkov",
      "Brezplačno",
      "Spletna stran",
      "Razišči destinaciju",
      "Izpostavljeno",
    ]);
    expect(EVENTS_SRC).not.toContain('placeholder="Vsi meseci"');
    expect(EVENTS_SRC).not.toContain('placeholder="Vse kategorije"');
    expect(EVENTS_SRC).not.toContain('placeholder="Vse regije"');
    expect(EVENTS_SRC).not.toContain('title="Datum dogodka"');
    expect(EVENTS_SRC).not.toContain('title="Lokacija"');
    expect(EVENTS_SRC).not.toContain('title="Vstopnina"');
    expect(EVENTS_SRC).not.toContain('? "1 dogodek"');
    expect(EVENTS_SRC).not.toContain("Ni dogodkov za izbrane filtre\"\n");
    // SL vrednosti ostajajo (v L-slovarju)
    expect(EVENTS_SRC).toContain('sl: "Koledar dogodkov"');
    expect(EVENTS_SRC).toContain('sl: "Ni dogodkov za izbrane filtre."');
  });

  test("strani — hero nizi živijo SAMO v L-slovarju", () => {
    expectNoBareJsx("lokali/page", LOKALI_PAGE_SRC, [
      "Lokalni ponudniki",
      "Dogodki",
    ]);
    expectNoBareJsx("dogodki/page", DOGODKI_PAGE_SRC, ["Dogodki"]);
    expectNoBareJsx("dozivetja/page", DOZIVETJA_PAGE_SRC, ["Doživetja"]);
    // statični metadata je zamenjan z generateMetadata
    for (const [name, src] of [
      ["lokali", LOKALI_PAGE_SRC],
      ["dogodki", DOGODKI_PAGE_SRC],
      ["dozivetja", DOZIVETJA_PAGE_SRC],
    ] as const) {
      expect(src, `${name}: statični metadata`).not.toContain(
        "export const metadata: Metadata"
      );
      void name;
    }
  });

  test("experiences.tsx — NIČ goli JSX tekst (vse prek next-intl t())", () => {
    // površina je dvojezična sama po sebi (homeExp ključi — isti vzorec
    // kot destinations/homeDest): vsak uporabniško viden niz gre skozi t().
    const bare = [...EXPERIENCES_SRC.matchAll(/>([^<>{}]+)</g)]
      .map((m) => m[1].trim())
      .filter((t) => t.length > 0 && t !== "(");
    expect(bare).toEqual([]);
    expect(EXPERIENCES_SRC).toContain('getTranslations("homeExp")');
    expect(EXPERIENCES_SRC).toContain("t(exp.titleKey)");
    expect(EXPERIENCES_SRC).toContain("t(exp.descriptionKey)");
    expect(EXPERIENCES_SRC).toContain("t(exp.altKey)");
    // povezava je locale-zavedna (i18n/navigation Link, ne next/link)
    expect(EXPERIENCES_SRC).toContain(
      'import { Link } from "@/i18n/navigation"'
    );
  });
});

// ---------------------------------------------------------------------------
// 5. ZERO-LOSS — filtri, sortiranje, grupiranje, states družina, kanonski dodaj
// ---------------------------------------------------------------------------
describe("F4-D zero-loss: logika ostaja nedotaknjena (source contracts)", () => {
  test("listings: filter/sort hendleri + API parametri + states družina", () => {
    expect(LISTINGS_SRC).toContain("const [category, setCategory] = useState");
    expect(LISTINGS_SRC).toContain("const [destinationId, setDestinationId] = useState");
    expect(LISTINGS_SRC).toContain("const [sort, setSort] = useState");
    expect(LISTINGS_SRC).toContain('params.set("sort", sort)');
    expect(LISTINGS_SRC).toContain('params.set("limit", "50")');
    expect(LISTINGS_SRC).toContain("`/api/listings?${params.toString()}`");
    expect(LISTINGS_SRC).toContain("hasActiveFilters");
    expect(LISTINGS_SRC).toContain("clearFilters");
    // states družina (F3-B) ostaja — klicatelj prinese besedilo prek L
    expect(LISTINGS_SRC).toContain(
      'import { LoadingState } from "@/components/states/loading-state"'
    );
    expect(LISTINGS_SRC).toContain(
      'import { EmptyState } from "@/components/states/empty-state"'
    );
    expect(LISTINGS_SRC).toContain(
      'import { ErrorState } from "@/components/states/error-state"'
    );
    expect(LISTINGS_SRC).toContain("onRetry={() => void fetchListings()}");
    expect(LISTINGS_SRC).toContain("function ListingSkeleton()");
    expect(LISTINGS_SRC).toContain("{ length: 6 }");
    // kanonski Dodaj v mojo pot (D8-D) + vrstni red (Podrobnosti pred dodajem)
    expect(LISTINGS_SRC).toContain("<AddToTripButton");
    expect(LISTINGS_SRC.indexOf("Podrobnosti")).toBeLessThan(
      LISTINGS_SRC.indexOf("<AddToTripButton")
    );
  });

  test("events-calendar: filter + groupedByMonth logika ostaja", () => {
    expect(EVENTS_SRC).toContain("const [month, setMonth] = useState");
    expect(EVENTS_SRC).toContain("const [category, setCategory] = useState");
    expect(EVENTS_SRC).toContain("const [region, setRegion] = useState");
    expect(EVENTS_SRC).toContain("category === ALL_VALUE || e.category === category");
    expect(EVENTS_SRC).toContain("region === ALL_VALUE || e.region === region");
    expect(EVENTS_SRC).toContain(
      "selectedMonth >= startMonth && selectedMonth <= endMonth"
    );
    expect(EVENTS_SRC).toContain("for (let m = 0; m < 12; m++)");
    expect(EVENTS_SRC).toContain(
      "new Date(a.date).getTime() - new Date(b.date).getTime()"
    );
    // kanonski Dodaj v mojo pot (D8-D) + obstoječi CTA
    expect(EVENTS_SRC).toContain("<AddToTripButton");
    expect(EVENTS_SRC).toContain('kind: "event"');
    expect(EVENTS_SRC).toContain('href: "/dogodki"');
    expect(EVENTS_SRC).toContain('source: "dogodki"');
    expect(EVENTS_SRC).toContain("L.website[lang]");
    expect(EVENTS_SRC).toContain("L.exploreDestination[lang]");
    expect(EVENTS_SRC).toContain(
      'import { EmptyState } from "@/components/states/empty-state"'
    );
  });

  test("dozivetja: MarketplaceSection defaultTab=experiences + ExperiencesSection", () => {
    expect(DOZIVETJA_PAGE_SRC).toContain(
      '<MarketplaceSection defaultTab="experiences" />'
    );
    expect(DOZIVETJA_PAGE_SRC).toContain("<ExperiencesSection />");
  });

  test("vse tri strani: lupina Navigation/Footer/Chatbot ohranjena (D8-E)", () => {
    for (const src of [LOKALI_PAGE_SRC, DOGODKI_PAGE_SRC, DOZIVETJA_PAGE_SRC]) {
      expect(src).toContain('from "@/components/sections/navigation"');
      expect(src).toContain('from "@/components/sections/footer"');
      expect(src).toContain("<Navigation solid />");
      expect(src).toContain("<Footer />");
      expect(src).toContain("<Chatbot />");
    }
  });
});

// ---------------------------------------------------------------------------
// 6. STRANI — generateMetadata pogodbe (getLocale + hreflangForPath)
// ---------------------------------------------------------------------------
describe("F4-D strani: generateMetadata (jezikovno odvisen metadata)", () => {
  const pages: [string, string, string][] = [
    ["lokali", LOKALI_PAGE_SRC, "/lokali"],
    ["dogodki", DOGODKI_PAGE_SRC, "/dogodki"],
    ["dozivetja", DOZIVETJA_PAGE_SRC, "/dozivetja"],
  ];

  for (const [name, src, path] of pages) {
    test(`${name}: generateMetadata z getLocale + hreflang + canonical`, () => {
      expect(src).toContain("export async function generateMetadata(): Promise<Metadata>");
      expect(src).toContain("await getLocale()");
      expect(src).toContain('locale === "en" ? "en" : "sl"');
      expect(src).toContain("hreflangForPath(PATH, base)");
      expect(src).toContain("await currentBaseUrl()");
      expect(src).toContain(`const PATH = "${path}";`);
      expect(src).toContain("L.metaTitle[lang]");
      expect(src).toContain("L.metaDescription[lang]");
    });
  }

  test("hero L: badge + h1 + subtitle + hint imajo obe veji (strukturno)", () => {
    for (const [name, src] of [
      ["lokali", LOKALI_PAGE_SRC],
      ["dogodki", DOGODKI_PAGE_SRC],
      ["dozivetja", DOZIVETJA_PAGE_SRC],
    ] as const) {
      expect(src).toContain("L.badge[lang]");
      expect(src).toContain("L.title[lang]");
      expect(src).toContain("L.subtitle[lang]");
      expect(src).toContain("L.hint[lang]");
      void name;
    }
  });
});

// ---------------------------------------------------------------------------
// 7. EXPERIENCES — pariteta next-intl sporočil homeExp (SL/EN)
// ---------------------------------------------------------------------------
describe("F4-D experiences: homeExp sporočila imajo polno SL/EN pariteto", () => {
  const slExp = SL_MESSAGES.homeExp as Record<string, string>;
  const enExp = EN_MESSAGES.homeExp as Record<string, string>;

  test("ključi so identični v obeh jezikih (noben manjkajoč prevod)", () => {
    expect(Object.keys(enExp).sort()).toEqual(Object.keys(slExp).sort());
  });

  test("vse vrednosti so neprazne v obeh jezikih", () => {
    for (const [k, v] of Object.entries(slExp)) {
      expect(v.trim().length, `sl.homeExp.${k} prazen`).toBeGreaterThan(0);
    }
    for (const [k, v] of Object.entries(enExp)) {
      expect(v.trim().length, `en.homeExp.${k} prazen`).toBeGreaterThan(0);
    }
  });

  test("resni prevodi: naslovi/opisi se razlikujejo med jezikoma", () => {
    for (const k of Object.keys(slExp)) {
      if (k === "eyebrow") continue; // "Doživetja"/"Experiences" — prevod, a
      // krajšega ne preverjamo posebej; vse ostale primerjamo dobesedno
      expect(enExp[k], `homeExp.${k}: EN je kopija SL?`).not.toBe(slExp[k]);
    }
    expect(enExp.eyebrow).not.toBe(slExp.eyebrow);
  });

  test("vsak ključ, ki ga komponenta uporablja, obstaja v obeh jezikih", () => {
    const used = [
      "eyebrow",
      "title",
      "subtitle",
      "hikingTitle",
      "hikingDesc",
      "hikingAlt",
      "waterTitle",
      "waterDesc",
      "waterAlt",
      "historyTitle",
      "historyDesc",
      "historyAlt",
      "natureTitle",
      "natureDesc",
      "natureAlt",
      "foodTitle",
      "foodDesc",
      "foodAlt",
      "gemsTitle",
      "gemsDesc",
      "gemsAlt",
    ];
    for (const key of used) {
      expect(slExp[key], `sl.homeExp.${key} manjka`).toBeDefined();
      expect(enExp[key], `en.homeExp.${key} manjka`).toBeDefined();
    }
  });
});
