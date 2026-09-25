// ============================================================================
// TASK 32 — TIER 1 #5: EN BLOG + ČIŠČENJE DE/IT (1.109.0)
// ============================================================================
//
// Kontekst: blog (16 člankov, modal na /vodici) je bil SL-only — na /en/vodici
// se ni izrisal (P4-8 mešanje jezikov). TASK 32 ga dela dvojezičnega:
// BLOG_POSTS_EN (isti pogodbeni niz slugov) + t("blogSection") UI nizi.
// Vzporedno: mrtva delna prevoda de.json/it.json (request.ts ju NIKOLI ni
// nalagal — locales so samo sl+en) sta izbrisana; /de in /it URL-ji
// OSTAJOJO 308 legacy preusmeritve (stare povezave ≠ 404).
//
// Ta datoteka varuje:
//   1. PARITETO PODATKOV: EN množica je 1:1 prevod SL — istih 16 slugov,
//      iste kategorije/datumi/readTime/slike/avtorji/relatedDestination;
//      naslovi/izvlečki/vsebine so PREVEDENI (≠ SL besedilo);
//   2. KVALITETO EN VSEBINE: neprazna polja, markdown struktura, angleško
//      besedilo (frekvenčna besedila), smiselne dolžine;
//   3. KATEGORIJE: EN oznake pokrivajo vse vrednosti + "all" (isti vrstni
//      red kot SL);
//   4. SPOROČILNO PARITETO: blogSection obstaja v SL in EN z identičnimi
//      keyseti, nepraznimi vrednostmi in enakimi ICU placeholderji;
//   5. DRIFT GUARD: vsi t() ključi v blog.tsx obstajajo v obeh jezikih;
//   6. SOURCE-CONTRACT: 0 hardcoded UI literalov v blog.tsx (vse iz t()
//      ali podatkovne plasti); /vodici izrisuje BlogSection brezpogojno,
//      AskLocal pa ostaja SL-only;
//   7. DE/IT ČIŠČENJE: mrtvi de.json/it.json NE obstajata (regresijska
//      varovalka), routing.locales ostajata ["sl","en"], 308 legacy
//      preusmeritve za /de in /it pa so V proxy.ts OHRANJENE.
// ============================================================================

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import slMessages from "@/i18n/messages/sl.json";
import enMessages from "@/i18n/messages/en.json";
import {
  BLOG_POSTS,
  BLOG_CATEGORIES,
  getPostBySlug,
  getPostsByCategory,
} from "@/lib/blog-data";
import {
  BLOG_POSTS_EN,
  BLOG_CATEGORIES_EN,
  getPostBySlugEn,
  getPostsByCategoryEn,
} from "@/lib/blog-data-en";
import { routing } from "@/i18n/routing";

function source(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

/** Koda brez komentarjev — literalni testi ne smejo pasti zaradi pojasnil. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

/** Frekvenčne besede angleščine — hevristika da je vsebina RES prevedena. */
const EN_WORD = /\b(the|and|with|from|where|best|visit|guide)\b/gi;

// ============================================================================
// 1. PARITETA PODATKOV (SL ↔ EN)
// ============================================================================
describe("TASK 32: EN blog — pariteta podatkov", () => {
  test("EN množica ima istih 16 slugov kot SL (1:1 prevod, ne podmnožica)", () => {
    const slSlugs = BLOG_POSTS.map((p) => p.slug).sort();
    const enSlugs = BLOG_POSTS_EN.map((p) => p.slug).sort();
    expect(enSlugs).toHaveLength(16);
    expect(slSlugs).toHaveLength(16);
    expect(enSlugs).toEqual(slSlugs);
  });

  test("slugi so unikatni v obeh množicah", () => {
    const dup = (arr: string[]) =>
      arr.filter((s, i) => arr.indexOf(s) !== i);
    expect(dup(BLOG_POSTS.map((p) => p.slug))).toEqual([]);
    expect(dup(BLOG_POSTS_EN.map((p) => p.slug))).toEqual([]);
  });

  test("struktura vsakega EN članka se ujema s SL dvojnikom (kategorija, datum, readTime, slika, avtor, relatedDestination)", () => {
    for (const sl of BLOG_POSTS) {
      const en = BLOG_POSTS_EN.find((p) => p.slug === sl.slug);
      if (!en) throw new Error(`EN dvojnik manjka: ${sl.slug}`);
      expect(en.category).toBe(sl.category);
      expect(en.date).toBe(sl.date);
      expect(en.readTime).toBe(sl.readTime);
      expect(en.image).toBe(sl.image);
      expect(en.author).toBe(sl.author);
      expect(en.relatedDestination ?? null).toBe(
        sl.relatedDestination ?? null
      );
    }
  });

  test("naslovi, izvlečki in vsebine so PREVEDENI (≠ SL besedilo)", () => {
    for (const sl of BLOG_POSTS) {
      const en = getPostBySlugEn(sl.slug);
      if (!en) throw new Error(`EN dvojnik manjka: ${sl.slug}`);
      if (en.title === sl.title)
        throw new Error(`naslov ni preveden: ${sl.slug}`);
      if (en.excerpt === sl.excerpt)
        throw new Error(`izvleček ni preveden: ${sl.slug}`);
      if (en.content === sl.content)
        throw new Error(`vsebina ni prevedena: ${sl.slug}`);
    }
  });
});

// ============================================================================
// 2. KVALITETA EN VSEBINE
// ============================================================================
describe("TASK 32: EN blog — kvaliteta vsebine", () => {
  test("vsak EN članek ima neprazen naslov (≤ 120 znakov) in izvleček (≥ 40 znakov)", () => {
    for (const p of BLOG_POSTS_EN) {
      if (!p.title.trim()) throw new Error(`prazen naslov: ${p.slug}`);
      if (p.title.length > 120)
        throw new Error(`predolg naslov (${p.title.length}): ${p.slug}`);
      if (p.excerpt.trim().length < 40)
        throw new Error(`prekratek izvleček: ${p.slug}`);
    }
  });

  test("vsaka EN vsebina je markdown (začne s ##) in je dovolj dolga (≥ 400 znakov)", () => {
    for (const p of BLOG_POSTS_EN) {
      if (!p.content.startsWith("## "))
        throw new Error(`ni markdown naslova: ${p.slug}`);
      if (p.content.length < 400)
        throw new Error(`prekratka vsebina: ${p.slug}`);
    }
  });

  test("vsaka EN vsebina vsebuje angleška frekvenčna besedila (≥ 5 zadetkov — res je prevod)", () => {
    for (const p of BLOG_POSTS_EN) {
      const hits = (p.title + " " + p.excerpt + " " + p.content).match(
        EN_WORD
      );
      if ((hits?.length ?? 0) < 5)
        throw new Error(`ni angleško besedilo: ${p.slug}`);
    }
  });

  test("EN vsebine ne vsebujejo slovenskih funkcijskih besed (je, ki, brez, tudi, lahko)", () => {
    for (const p of BLOG_POSTS_EN) {
      const slWords = p.content.match(/\b(je|ki|brez|tudi|lahko|najboljši)\b/g);
      if ((slWords?.length ?? 0) >= 3)
        throw new Error(`videti neprevedeno SL besedilo: ${p.slug}`);
    }
  });
});

// ============================================================================
// 3. KATEGORIJE + HELPERJI
// ============================================================================
describe("TASK 32: EN blog — kategorije in helperji", () => {
  test("EN kategorije pokrivajo vse vrednosti + all (isti vrstni red vrednosti kot SL)", () => {
    expect(BLOG_CATEGORIES_EN.map((c) => c.value)).toEqual(
      BLOG_CATEGORIES.map((c) => c.value)
    );
    for (const c of BLOG_CATEGORIES_EN) {
      if (!c.label.trim()) throw new Error(`prazna oznaka: ${c.value}`);
    }
  });

  test("getPostsByCategoryEn('all') vrne vseh 16; vsaka kategorija enako število kot SL filter", () => {
    expect(getPostsByCategoryEn("all")).toHaveLength(16);
    for (const c of BLOG_CATEGORIES_EN) {
      if (c.value === "all") continue;
      const en = getPostsByCategoryEn(c.value);
      const sl = getPostsByCategory(c.value);
      if (en.length !== sl.length)
        throw new Error(
          `kategorija ${c.value}: EN ${en.length} ≠ SL ${sl.length}`
        );
      if (en.length === 0) throw new Error(`prazna kategorija: ${c.value}`);
    }
  });

  test("getPostBySlugEn najde vsak slug; blesav slug → undefined (pri obeh jezikih)", () => {
    for (const p of BLOG_POSTS_EN) {
      if (getPostBySlugEn(p.slug)?.slug !== p.slug)
        throw new Error(`helper ne najde: ${p.slug}`);
    }
    expect(getPostBySlugEn("ne-obstojeci-clanek")).toBeUndefined();
    expect(getPostBySlug("ne-obstojeci-clanek")).toBeUndefined();
  });
});

// ============================================================================
// 4. SPOROČILNA PARITETA blogSection (SL ↔ EN)
// ============================================================================
const slSection = (
  slMessages as unknown as Record<string, Record<string, string>>
)["blogSection"];
const enSection = (
  enMessages as unknown as Record<string, Record<string, string>>
)["blogSection"];

describe("TASK 32: blogSection sporočilna pariteta", () => {
  test("namespace obstaja v obeh jezikih z identičnimi keyseti", () => {
    expect(slSection).toBeDefined();
    expect(enSection).toBeDefined();
    expect(Object.keys(enSection ?? {}).sort()).toEqual(
      Object.keys(slSection ?? {}).sort()
    );
  });

  test("vse vrednosti so neprazne v obeh jezikih", () => {
    for (const [key, value] of Object.entries(slSection ?? {})) {
      if (!value.trim()) throw new Error(`prazna SL vrednost: ${key}`);
    }
    for (const [key, value] of Object.entries(enSection ?? {})) {
      if (!value.trim()) throw new Error(`prazna EN vrednost: ${key}`);
    }
  });

  test("ICU placeholderji so identični med jeziki ({minutes}, {title}, {author})", () => {
    const ph = (s: string) => (s.match(/\{[^}]+\}/g) ?? []).sort().join(",");
    for (const [key, value] of Object.entries(slSection ?? {})) {
      if (ph(value) !== ph(enSection?.[key] ?? ""))
        throw new Error(`placeholderji se razlikujejo: ${key}`);
    }
  });
});

// ============================================================================
// 5. DRIFT GUARD + SOURCE-CONTRACT (blog.tsx)
// ============================================================================
describe("TASK 32: blog.tsx source-contract", () => {
  const code = stripComments(source("src/components/sections/blog.tsx"));

  test("vsak t() ključ v blog.tsx obstaja v obeh blogSection jezikih (drift guard)", () => {
    const keys = [...code.matchAll(/\bt\(\s*"([^"]+)"/g)].map((m) => m[1]);
    if (keys.length < 11)
      throw new Error(`premalokrat t() klicev: ${keys.length}`);
    for (const key of keys) {
      if (!(key in (slSection ?? {})))
        throw new Error(`t("${key}") manjka v SL sporočilih`);
      if (!(key in (enSection ?? {})))
        throw new Error(`t("${key}") manjka v EN sporočilih`);
    }
  });

  test("0 hardcoded UI literalov — stari SL nizi so umaknjeni iz kode", () => {
    const forbidden = [
      "Zgodbe iz Slovenije",
      "Preberi več",
      "min branja",
      "V tej kategoriji ni člankov",
      "Poskusite izbrati drugo kategorijo",
      "Povezana destinacija",
      "Razišči destinacijo",
      "Celoten članek",
      "Vodičniki, nasveti in inspiracije",
    ];
    for (const lit of forbidden) {
      if (code.includes(lit))
        throw new Error(`hardcoded literal ostal v kodi: ${lit}`);
    }
  });

  test("komponenta uporablja useLocale + useTranslations (dvojezična po zasnovi)", () => {
    expect(code.includes("useLocale()")).toBe(true);
    expect(code.includes('useTranslations("blogSection")')).toBe(true);
  });

  test("EN množica se dejansko izbere na EN (BLOG_POSTS_EN uvožen in uporabljen)", () => {
    expect(code.includes("BLOG_POSTS_EN")).toBe(true);
    expect(code.includes("getPostsByCategoryEn")).toBe(true);
  });

  test("i18n Link nadomesa surovi <a href> (EN uporabnik ostane na /en)", () => {
    expect(code.includes('<a href="/destinacije"')).toBe(false);
    expect(code.includes('Link href="/destinacije"')).toBe(true);
  });
});

// ============================================================================
// 6. STRAN /vodici — BlogSection brezpogojno, AskLocal SL-only
// ============================================================================
describe("TASK 32: /vodici stran — izris brezpogojno", () => {
  const page = stripComments(source("src/app/vodici/page.tsx"));

  test("BlogSection se izriše brez locale vrata (EN uporabniki vidijo EN blog)", () => {
    expect(page.includes("<BlogSection />")).toBe(true);
    expect(page.includes('locale !== "en" && <BlogSection')).toBe(false);
  });

  test("AskLocal ostaja SL-only (DB vsebina skupnosti — P4-8 brez mešanja)", () => {
    expect(page.includes('locale !== "en" &&')).toBe(true);
    expect(page.includes("<AskLocal />")).toBe(true);
  });
});

// ============================================================================
// 7. DE/IT ČIŠČENJE
// ============================================================================
describe("TASK 32: čiščenje stare neveljavne vsebine de/it", () => {
  test("mrtvi delni prevodi de.json/it.json NE obstajata (request.ts ju nikoli ni nalagal)", () => {
    expect(existsSync(join(process.cwd(), "src/i18n/messages/de.json"))).toBe(
      false
    );
    expect(existsSync(join(process.cwd(), "src/i18n/messages/it.json"))).toBe(
      false
    );
  });

  test("routing.locales ostajata natanko [sl, en] (default sl)", () => {
    expect(routing.locales).toEqual(["sl", "en"]);
    expect(routing.defaultLocale).toBe("sl");
  });

  test("308 legacy preusmeritve za /de in /it so OHRANJENE v proxy.ts (stare povezave ≠ 404)", () => {
    const proxy = source("src/proxy.ts");
    expect(proxy.includes('LEGACY_LOCALE_PREFIXES = ["/de", "/it"]')).toBe(
      true
    );
    expect(proxy.includes("308")).toBe(true);
  });

  test("request.ts nalaja samo locale iz routing.locales (de/it nikoli ne moreta priti do sporočil)", () => {
    const request = source("src/i18n/request.ts");
    expect(request.includes("routing.locales.includes")).toBe(true);
    expect(request.includes("routing.defaultLocale")).toBe(true);
  });
});
