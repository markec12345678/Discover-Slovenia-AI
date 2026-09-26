// TASK 8 / F4-A (issue #8 Phase 4 — „Discovery UX 2.0", EN razširitev na
// SL-only površine): TRŽNICA JEDRO (/trznica) postane dvojezična.
//
// 1. L-PARITETA (marketplace.tsx): vsak list slovarja L ima NEPRAZNO sl in
//    en vrednost — VEDENJSKA preveritev (izvleček + vrednotenje objekta,
//    ne le regex). Isti kanon za WL (wishlist-sheet) in L (trznica/page).
// 2. BREZ preostalih hardcodanih SL markerjev v uporabniško VIDNIH
//    položajih marketplace.tsx (po odstranitvi komentarjev + L sl-vej —
//    slovarčne SL vrednosti in komentarji so dovoljeni po namenu).
// 3. ZERO-LOSS markerji: defaultTab, NO_LIVE_DATA, ProductModal/
//    ExperienceModal, wishlist srček/dogodki, skeleton mreži.
// 4. /trznica stran: generateMetadata (getLocale) + dvojezična glava;
//    struktura identična (Navigation/Footer/Chatbot/Reveal).
// 5. wishlist-sheet: CTA href v tržnico je LOCALE-ZAVEDAJOČ (localePrefix),
//    identitetni href "/trznica" (most v zbirko) ostaja dobesedno.
// 6. API lang: /api/products + /api/experiences NE podpirata lang parametra
//    (preverjeno v viru — DB polja name/description nimajo EN različic) —
//    fetcha seznamov ostajata BREZ lang (iskrena pogodba, ne lažemo API-ju;
//    dokumentirano v worklogu Task 4-A).

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const MARKET_SRC = read("components/sections/marketplace.tsx");
const PAGE_SRC = read("app/trznica/page.tsx");
const WISHLIST_SRC = read("components/wishlist-sheet.tsx");

// ---------------------------------------------------------------------------
// POMOČNIKI — izvleček dobesednega const objekta (uravnoteženi oklepaji,
// zavest o nizih) + vrednotenje (samo dobesedni nizi, brez komponent).
// ---------------------------------------------------------------------------

/** Koda brez komentarjev — literalni testi ne smejo pasti zaradi pojasnil (kanon task8-e). */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

function extractConstObject(src: string, constName: string): string {
  const marker = `const ${constName} = {`;
  const start = src.indexOf(marker);
  if (start === -1) throw new Error(`const ${constName} ni najden v viru`);
  const objStart = src.indexOf("{", start);
  let depth = 0;
  let inString: '"' | "'" | "`" | null = null;
  for (let i = objStart; i < src.length; i += 1) {
    const ch = src[i];
    if (inString) {
      if (ch === "\\") {
        i += 1;
        continue;
      }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      continue;
    }
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(objStart, i + 1);
    }
  }
  throw new Error(`neuravnotežen objekt ${constName}`);
}

function evalObject(literal: string): Record<string, unknown> {
  return new Function(`return (${literal})`)() as Record<string, unknown>;
}

/** Rekurzivna pariteta: vsak list je { sl, en } z nepraznima nizoma. Vrne število listov. */
function assertLeafParity(node: unknown, path: string): number {
  if (typeof node !== "object" || node === null) {
    throw new Error(`${path}: list mora biti objekt { sl, en }`);
  }
  const rec = node as Record<string, unknown>;
  const keys = Object.keys(rec);
  if (keys.length === 2 && keys.includes("sl") && keys.includes("en")) {
    if (typeof rec.sl !== "string" || typeof rec.en !== "string") {
      throw new Error(`${path}: sl/en morata biti niza`);
    }
    if ((rec.sl as string).trim().length === 0) {
      throw new Error(`${path}: sl vrednost je prazna`);
    }
    if ((rec.en as string).trim().length === 0) {
      throw new Error(`${path}: en vrednost je prazna`);
    }
    return 1;
  }
  let leaves = 0;
  for (const [k, v] of Object.entries(rec)) {
    leaves += assertLeafParity(v, `${path}.${k}`);
  }
  return leaves;
}

const marketL = evalObject(extractConstObject(MARKET_SRC, "L"));
const pageL = evalObject(extractConstObject(PAGE_SRC, "L"));
const wishlistWL = evalObject(extractConstObject(WISHLIST_SRC, "WL"));

// ---------------------------------------------------------------------------
// 1. L-PARITETA — marketplace.tsx (jedro tržnice)
// ---------------------------------------------------------------------------
describe("F4-A marketplace: L slovar — popolna SL/EN pariteta", () => {
  test("vsak list L ima neprazno sl in en vrednost (vedenjsko, ≥45 listov)", () => {
    const leaves = assertLeafParity(marketL, "L");
    // glava + zavihki + filtri + razvrščanje + števci + napake + toasti +
    // prazna stanja + pridruži se + kartica + značke + CTA + cena
    expect(leaves).toBeGreaterThanOrEqual(45);
  });

  test("F3-B pogodba nalaganja ostaja dobesedno (isti ključi/vrednosti)", () => {
    const loading = marketL as { loadingProducts: { sl: string; en: string }; loadingExperiences: { sl: string; en: string } };
    expect(loading.loadingProducts.sl).toBe("Nalagam izdelke …");
    expect(loading.loadingProducts.en).toBe("Loading products …");
    expect(loading.loadingExperiences.sl).toBe("Nalagam izkušnje …");
    expect(loading.loadingExperiences.en).toBe("Loading experiences …");
  });

  test("§38 resnica cen: „od ~X €“ ima EN plat „from“ (ne „free“/„total“)", () => {
    const price = (marketL as { price: { from: { sl: string; en: string }; perPerson: { sl: string; en: string } } }).price;
    expect(price.from.sl).toBe("od");
    expect(price.from.en).toBe("from");
    expect(price.perPerson.sl).toBe("/ osebo");
    expect(price.perPerson.en).toBe("/ person");
  });

  test("NO_LIVE_DATA iskrenost živi v OBEH jezikih (nikoli „uspešna“ prazna tržnica)", () => {
    const empty = (marketL as { empty: Record<string, { sl: string; en: string }> }).empty;
    expect(empty.noLive.sl).toContain("NO_LIVE_DATA");
    expect(empty.noLive.en).toContain("NO_LIVE_DATA");
    // TASK 99 §10 pogodba: ločena praznina za filtre
    expect(empty.noResults.sl).toBe("Ni najdenih rezultatov.");
    expect(empty.noResults.en).toBe("No results found.");
  });

  test("razvrščalne vrednosti ostajajo nespremenjene (čista i18n, nič logike)", () => {
    expect(MARKET_SRC).toContain('value: "featured"');
    expect(MARKET_SRC).toContain('value: "price-asc"');
    expect(MARKET_SRC).toContain('value: "price-desc"');
    expect(MARKET_SRC).toContain('value: "rating"');
  });

  test("kategorije: dvojezične oznake (lokalne preslikave L vzorca)", () => {
    // SL vrednosti identične skupnemu viru (ničelna izguba za SL)
    expect(MARKET_SRC).toContain('food: { sl: "Hrana", en: "Food" }');
    expect(MARKET_SRC).toContain('tour: { sl: "Voden ogled", en: "Guided tour" }');
    expect(MARKET_SRC).toContain('wellness: { sl: "Wellness", en: "Wellness" }');
    // kartica izkušnje uporablja dvojezično preslikavo (ne SL-only vira)
    expect(MARKET_SRC).toContain("EXPERIENCE_CATEGORY_LABELS_L[experience.category][lang]");
  });

  test("trajanje: EN plat prevaja enoto dni (delegacija na skupni formatDuration)", () => {
    expect(MARKET_SRC).toContain('const formatDurationL = (hours: number, lang: "sl" | "en")');
    expect(MARKET_SRC).toContain('base.replace("dni", "days")');
    expect(MARKET_SRC).toContain("formatDurationL(experience.durationHours, lang)");
  });
});

// ---------------------------------------------------------------------------
// 2. BREZ hardcodanih SL markerjev v uporabniško vidnih položajih
// ---------------------------------------------------------------------------
describe("F4-A marketplace: iztrebitev SL-only uhodov", () => {
  const SL_MARKERS = [
    "Izpostavljeni",
    "Ni več na voljo",
    "Vse kategorije",
    "Razvrsti po",
    "Ni na zalogi",
    "Počisti filtre",
    "Ne morem naložiti",
    "Napaka pri pridobivanju",
  ] as const;

  /** Vir brez komentarjev in brez slovarčnih sl-vej — ostanejo LE uporabniško vidni položaji. */
  const visibleOnly = stripComments(MARKET_SRC).replace(/sl:\s*"[^"]*"/g, "");

  for (const marker of SL_MARKERS) {
    test(`hardcodani SL marker "${marker}" ne živi več izven L sl-vej`, () => {
      expect(visibleOnly.includes(marker)).toBe(false);
    });
  }

  test("vrženi/ulovljeni napaki fetcha gresta prek L (ne skozi hardcode)", () => {
    expect(MARKET_SRC).toContain("throw new Error(L.error.productsThrow[lang])");
    expect(MARKET_SRC).toContain("throw new Error(L.error.experiencesThrow[lang])");
    expect(MARKET_SRC).toContain("setProductsError(L.error.products[lang])");
    expect(MARKET_SRC).toContain("setExperiencesError(L.error.experiences[lang])");
  });

  test("toasti umaknjenih vnosov (4×) so dvojezični", () => {
    expect(MARKET_SRC.match(/L\.toast\.gone\[lang\]/g)?.length).toBe(4);
    expect(MARKET_SRC.match(/L\.toast\.experienceRemoved\[lang\]/g)?.length).toBe(2);
    expect(MARKET_SRC.match(/L\.toast\.productRemoved\[lang\]/g)?.length).toBe(2);
  });

  test("števca (izdelki/izkušnje) se izrisujeta prek L.counter v obeh jezikih", () => {
    expect(MARKET_SRC).toContain("L.counter.showing[lang]");
    expect(MARKET_SRC).toContain("L.counter.productOne[lang]");
    expect(MARKET_SRC).toContain("L.counter.experienceOne[lang]");
    expect(stripComments(MARKET_SRC)).not.toMatch(/Prikazujem\s/);
  });
});

// ---------------------------------------------------------------------------
// 3. ZERO-LOSS markerji (marketplace.tsx)
// ---------------------------------------------------------------------------
describe("F4-A marketplace: ZERO-LOSS pogodbe", () => {
  test("prop defaultTab (/dozivetja pripne zavihek izkušenj) ostaja", () => {
    expect(MARKET_SRC).toContain("defaultTab");
    expect(MARKET_SRC).toContain('defaultTab?: Tab');
  });

  test("NO_LIVE_DATA ločitev (TASK 99 §10) + hasActiveFilters veja ohranjena", () => {
    expect(MARKET_SRC).toContain("Ni še živih ponudb (NO_LIVE_DATA)");
    expect(MARKET_SRC).toContain("hasActiveFilters");
    expect(MARKET_SRC).toContain("stanje ponudbe");
  });

  test("modala (ProductModal/ExperienceModal) + wishlist integracija ostajajo", () => {
    expect(MARKET_SRC).toContain(
      'import { ProductModal } from "@/components/sections/product-modal"'
    );
    expect(MARKET_SRC).toContain(
      'import { ExperienceModal } from "@/components/sections/experience-modal"'
    );
    expect(MARKET_SRC).toContain("<ProductModal");
    expect(MARKET_SRC).toContain("<ExperienceModal");
    expect(MARKET_SRC).toContain("WishlistHeartButton");
    expect(MARKET_SRC).toContain("WISHLIST_OPEN_EVENT");
    expect(MARKET_SRC).toContain("WISHLIST_PENDING_KEY");
    expect(MARKET_SRC).toContain("openWishlistItem");
  });

  test("skeleton mreži (dobro hoteni zlati standardi) + add_to_cart lijak", () => {
    expect(MARKET_SRC).toContain("function ProductSkeleton()");
    expect(MARKET_SRC).toContain("function ExperienceSkeleton()");
    expect(MARKET_SRC).toContain("{ length: 6 }");
    expect(MARKET_SRC).toContain('trackFunnel("add_to_cart")');
  });
});

// ---------------------------------------------------------------------------
// 4. FETCH pogodba — API NE podpira lang (dokumentirano), kliči iskreno
// ---------------------------------------------------------------------------
describe("F4-A marketplace: fetch pogodba (API lang podpora)", () => {
  test("seznama /api/products + /api/experiences se klicata nespremenjeno (brez lang=)", () => {
    expect(MARKET_SRC).toContain("`/api/products?${params.toString()}`");
    expect(MARKET_SRC).toContain("`/api/experiences?${params.toString()}`");
    // API routi NE podpirata lang parametra (DB name/description sta enojezični
    // polji) — kličiti lang= bi bilo laganje; priporočila modala imajo SVOJ
    // lang (druga ruta, agent 4-b). Dokumentirano v worklogu Task 4-A.
    expect(MARKET_SRC).not.toMatch(/\/api\/products\?[^\n]*lang=/);
    expect(MARKET_SRC).not.toMatch(/\/api\/experiences\?[^\n]*lang=/);
  });

  test("wishlist globoki povezavi (slug fetch) ostajata nedotaknjeni", () => {
    expect(MARKET_SRC).toContain(
      "`/api/experiences/${encodeURIComponent(detail.slug)}`"
    );
    expect(MARKET_SRC).toContain(
      "`/api/products/${encodeURIComponent(detail.slug)}`"
    );
  });
});

// ---------------------------------------------------------------------------
// 5. /trznica stran — generateMetadata + dvojezična glava (struktura enaka)
// ---------------------------------------------------------------------------
describe("F4-A /trznica stran: EN metadata + hero", () => {
  test("generateMetadata (await getLocale) nadomešča statični metadata", () => {
    expect(PAGE_SRC).toContain("export async function generateMetadata(): Promise<Metadata>");
    expect(PAGE_SRC).toContain("await getLocale()");
    expect(PAGE_SRC).not.toContain("export const metadata:");
  });

  test("L slovar strani ima popolno SL/EN pariteto (vedenjsko)", () => {
    const leaves = assertLeafParity(pageL, "L");
    expect(leaves).toBeGreaterThanOrEqual(6);
  });

  test("metadata: naslov/opis v obeh jezikih, kanonična pot ostaja /trznica", () => {
    const l = pageL as Record<string, { sl: string; en: string }>;
    expect(l.metaTitle.sl).toBe("Tržnica lokalnih izdelkov in doživetij");
    expect(l.metaTitle.en.length).toBeGreaterThan(5);
    expect(l.metaTitle.en).not.toBe(l.metaTitle.sl);
    expect(l.metaDescription.sl).toContain("neposredno od slovenskih ponudnikov");
    expect(PAGE_SRC).toContain('alternates: { canonical: "/trznica" }');
  });

  test("hero: Badge + h1 + podnaslov + zaupanja vrstica se izrisujejo prek L[lang]", () => {
    expect(PAGE_SRC).toContain("{L.badge[lang]}");
    expect(PAGE_SRC).toContain("{L.title[lang]}");
    expect(PAGE_SRC).toContain("{L.subtitle[lang]}");
    expect(PAGE_SRC).toContain("{L.trustLine[lang]}");
  });

  test("struktura strani identična (async komponenta, lupina, jedro)", () => {
    expect(PAGE_SRC).toContain("export default async function MarketplacePage()");
    expect(PAGE_SRC).toContain("<Navigation solid />");
    expect(PAGE_SRC).toContain("<Footer />");
    expect(PAGE_SRC).toContain("<Chatbot />");
    expect(PAGE_SRC).toContain("<Reveal>");
    expect(PAGE_SRC).toContain("<MarketplaceSection />");
    expect(PAGE_SRC).toContain('aria-labelledby="trznica-page-title"');
    expect(PAGE_SRC).not.toContain("sticky-mobile-cta");
  });
});

// ---------------------------------------------------------------------------
// 6. wishlist-sheet — locale-zavedajoč CTA + WL pariteta + zero-loss
// ---------------------------------------------------------------------------
describe("F4-A wishlist-sheet: /trznica href locale-zavedanje + besedje", () => {
  test("CTA praznega stanja dobi locale prefix (EN → /en/trznica) prek localePrefix", () => {
    expect(WISHLIST_SRC).toContain('import { localePrefix } from "@/i18n/routing"');
    expect(WISHLIST_SRC).toContain("href: `${localePrefix(locale)}/trznica`");
  });

  test("identitetni href \"/trznica\" (most v zbirko Moja pot) ostaja dobesedno", () => {
    // wishlistTripItem — isti literali kot lib most (f3cd identitetna pogodba)
    expect(WISHLIST_SRC).toContain('href: "/trznica",');
    expect(WISHLIST_SRC).toContain('source: "priljubljene",');
    expect(WISHLIST_SRC).toContain("kind: entry.type,");
    expect(WISHLIST_SRC).toContain("refId: entry.id,");
  });

  test("WL slovar ima popolno SL/EN pariteto (vedenjsko, ≥19 listov)", () => {
    const leaves = assertLeafParity(wishlistWL, "WL");
    expect(leaves).toBeGreaterThanOrEqual(19);
    const wl = wishlistWL as Record<string, { sl: string; en: string }>;
    expect(wl.exploreCta.sl).toBe("Razišči tržnico");
    expect(wl.exploreCta.en).toBe("Explore the marketplace");
    expect(wl.title.en).toBe("Favorites");
  });

  test("srček: aria/naslov sta dvojezična (isti vir delijo kartice in modali)", () => {
    expect(WISHLIST_SRC).toContain("${WL.heartRemoveVerb[lang]} ${entry.name} ${WL.heartRemoveSuffix[lang]}");
    expect(WISHLIST_SRC).toContain("${WL.heartSaveVerb[lang]} ${entry.name} ${WL.heartSaveSuffix[lang]}");
    expect(WISHLIST_SRC).toContain("WL.heartRemoveTitle[lang]");
    expect(WISHLIST_SRC).toContain("WL.heartSaveTitle[lang]");
  });

  test("vrstica: odpri/odstrani aria + značke vrste so dvojezični (SL predloga ostaja)", () => {
    // SL template literal ostaja dobesedno (task8-d pogodba „Odpri v tržnici")
    expect(WISHLIST_SRC).toContain("sl: `Odpri ${item.name} v tržnici`");
    expect(WISHLIST_SRC).toContain("en: `Open ${item.name} in the marketplace`");
    expect(WISHLIST_SRC).toContain("sl: `Odstrani ${item.name} iz priljubljenih`");
    expect(WISHLIST_SRC).toContain("en: `Remove ${item.name} from favorites`");
    expect(WISHLIST_SRC).toContain("WL.typeExperience[lang]");
    expect(WISHLIST_SRC).toContain("WL.typeProduct[lang]");
  });

  test("list: naslov/števci/noga/aria so dvojezični; ZERO-LOSS mostovi ostajajo", () => {
    expect(WISHLIST_SRC).toContain("{WL.title[lang]}");
    expect(WISHLIST_SRC).toContain("WL.localNote[lang]");
    expect(WISHLIST_SRC).toContain("WL.listAria[lang]");
    expect(WISHLIST_SRC).toContain("WL.openTrigger[lang]");
    // D8-D most v Moja pot + dogodni tok odpiranja (nedotaknjena mehanika)
    expect(WISHLIST_SRC).toContain("<AddToTripButton");
    expect(WISHLIST_SRC).toContain("wishlistTripItem");
    expect(WISHLIST_SRC).toContain("openFromWishlist({ type: item.type, id: item.id, slug: item.slug })");
    expect(WISHLIST_SRC).toContain('label: WL.exploreCta[lang]');
  });

  test("ni več SL-only uporabniškega besedja izven WL sl-vej (vidni položaji)", () => {
    const visibleOnly = stripComments(WISHLIST_SRC)
      .replace(/sl:\s*"[^"]*"/g, "")
      .replace(/sl:\s*`[^`]*`/g, "");
    for (const marker of [
      "Nič shranjenega",
      "Odpri priljubljene",
      "Seznam priljubljenih",
      "Shranjeno lokalno",
      "Klikni srček",
      "Ni še nič shranjenega",
      "Odstrani iz priljubljenih",
      "Shrani v priljubljene",
    ]) {
      expect(visibleOnly.includes(marker)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. I18N varnost — jezik se razrešuje po useLocale (ne po URL-u/potepanju)
// ---------------------------------------------------------------------------
describe("F4-A i18n: jezikovna resolucija (L vzorec, zlati standard)", () => {
  test("vse tri datoteke razrešijo jezik prek useLocale z EN varnimi tipi", () => {
    for (const [name, src] of [
      ["marketplace", MARKET_SRC],
      ["wishlist-sheet", WISHLIST_SRC],
    ] as const) {
      expect(src).toContain("useLocale");
      const langLines = src.match(
        /const lang: "sl" \| "en" = locale === "en" \? "en" : "sl";/g
      );
      // marketplace: sekcija + 2 kartici; wishlist: sheet + srček + vrstica
      expect(langLines?.length).toBeGreaterThanOrEqual(
        name === "marketplace" ? 3 : 3
      );
      void name;
    }
  });

  test("trznica/page razreši jezik strežniško (getLocale, async)", () => {
    expect(PAGE_SRC).toContain('const lang = locale === "en" ? "en" : "sl"');
  });

  test("izris jezikovno odvisen: vsak uporabniški niz gre prek [lang] indeksa", () => {
    // vzorec L.<skupina>.<ključ>[lang] — dovolj ponovitev dokazuje doslednost
    expect((MARKET_SRC.match(/\bL\.[a-zA-Z]+\.[a-zA-Z]+\[lang\]/g) ?? []).length).toBeGreaterThanOrEqual(40);
    expect((WISHLIST_SRC.match(/\bWL\.[a-zA-Z]+(?:\.[a-zA-Z]+)?\[lang\]/g) ?? []).length).toBeGreaterThanOrEqual(12);
    expect((PAGE_SRC.match(/\bL\.[a-zA-Z]+\[lang\]/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });
});
