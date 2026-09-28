import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import slMessages from "@/i18n/messages/sl.json";
import enMessages from "@/i18n/messages/en.json";
import itMessages from "@/i18n/messages/it.json";
import deMessages from "@/i18n/messages/de.json";
import {
  currentSeason,
  seasonForMonth,
  SEASONS,
  type Season,
} from "@/lib/season";

/**
 * W4 (Issue #15, 1.134.0): SEZONSKI PAS HEROJA — mesec → sezona (0 AI).
 *
 * Verifikacijska merila iz benchmarka (docs/UX-WORKFLOW-BENCHMARK-2026-09-27.md §3 W4):
 *  (1) hero pas dinamiziran po mesecu, 4 vsebinske različice × 4 jeziki
 *      (W1 doslednost), brez nove infrastrukture → SOURCE CONTRACT: Hero
 *      izračuna sezono deterministično (src/lib/season.ts) in izriše
 *      ChatAskCta; opis sezone prihaja iz OBSTOJEČEGA bestTime slovarja
 *      (1 vir resnice — novi so samo ctaLabel + question).
 *  (2) varovala: H1 vprašanje OSTANE (t("title")); čip »Brez gužve« OSTANE
 *      (QUICK_ACTIONS 8 vnosov z noCrowds); enoviti AI vnos ostane dominanten
 *      (pas je dodaten pod njim).
 *  (3) telemetrija KPI »sezonski CTA klik«: obstoječi dogodek
 *      chat_ask_cta_clicked + površina "hero-seasonal" + season prop —
 *      NIČ novih imen (strežniška whitelista nespremenjena).
 *  (4) vprašanja so živo preverjena proti /api/chat: vsa 4 letna časa ×
 *      4 jeziki vračajo DOMENSKI odgovor (Bled / Reka Soča — top-3 ocenjene
 *      destinacije baze), ne iskreni odklon.
 *
 * Dodatno (W1 doslednost na domači strani): oznake zloženih <details>
 * povzetkov so 4-jezične (prej SL/EN — it/de uporabniki so videli SL).
 */

// __tests/ → src/lib/__tests/; koren projekta je TRI ravni višje
const ROOT = new URL("../../../", import.meta.url);
const read = (p: string) =>
  readFileSync(new URL(p, ROOT), "utf-8") as string;

const HERO_SRC = read("src/components/sections/hero.tsx");
const CTA_SRC = read("src/components/chat-ask-cta.tsx");
const PAGE_SRC = read("src/app/page.tsx");
const QUICK_SRC = read("src/components/hero-quick-input.tsx");
const ROUTE_SRC = read("src/app/api/analytics/event/route.ts");

// ---------------------------------------------------------------------------
// 1. Deterministična preslikava mesec → sezona (0 AI, statična mapa)
// ---------------------------------------------------------------------------

describe("W4: season.ts — mesec → sezona (deterministično, totalno)", () => {
  test("vseh 12 mesecev preslikanih po bestTime meji (dec–feb zima, mar–maj pomlad, jun–avg poletje, sep–nov jesen)", () => {
    const expected: Season[] = [
      "zima", // jan
      "zima", // feb
      "pomlad", // mar
      "pomlad", // apr
      "pomlad", // maj
      "poletje", // jun
      "poletje", // jul
      "poletje", // avg
      "jesen", // sep
      "jesen", // okt
      "jesen", // nov
      "zima", // dec
    ];
    for (let month = 0; month < 12; month++) {
      expect(seasonForMonth(month), `mesec ${month}`).toBe(expected[month]);
    }
  });

  test("mejna preslikava dec↔jan: december (11) in januar (0) sta ISTA sezona", () => {
    expect(seasonForMonth(11)).toBe(seasonForMonth(0));
    expect(seasonForMonth(11)).toBe("zima");
  });

  test("totalna funkcija: negativni/veliki/decimalni vhodi se preslikajo po modulu; nikoli ne vrže", () => {
    expect(seasonForMonth(-1)).toBe("zima"); // modul → dec
    expect(seasonForMonth(12)).toBe("zima"); // januar
    expect(seasonForMonth(13)).toBe("zima"); // februar
    expect(seasonForMonth(14)).toBe("pomlad"); // marec
    expect(seasonForMonth(3.7)).toBe("pomlad"); // trunc
    expect(() => seasonForMonth(Number.NaN)).not.toThrow();
    expect(() => seasonForMonth(Number.POSITIVE_INFINITY)).not.toThrow();
  });

  test("currentSeason uporablja mesec datuma (getMonth) — en vir časa", () => {
    expect(currentSeason(new Date("2026-01-15"))).toBe("zima");
    expect(currentSeason(new Date("2026-04-15"))).toBe("pomlad");
    expect(currentSeason(new Date("2026-07-15"))).toBe("poletje");
    expect(currentSeason(new Date("2026-10-15"))).toBe("jesen");
    expect(currentSeason(new Date("2026-12-15"))).toBe("zima");
  });

  test("SEASONS vsebuje vse 4 sezone v kanonskem zaporedju (isti ključi kot bestTime)", () => {
    expect(SEASONS).toEqual(["zima", "pomlad", "poletje", "jesen"]);
  });
});

// ---------------------------------------------------------------------------
// 2. i18n: hero.seasonal × 4 jeziki (task71 pariteta ščiti množico ključev;
//    tu preverimo VSEBINO novih ključev)
// ---------------------------------------------------------------------------

describe("W4: hero.seasonal slovar — 4 sezone × 4 jeziki", () => {
  const LOCALES: Record<string, typeof slMessages> = {
    sl: slMessages,
    en: enMessages,
    it: itMessages,
    de: deMessages,
  };

  for (const [loc, messages] of Object.entries(LOCALES)) {
    test(`${loc}: vse 4 sezone imajo neprazen ctaLabel + question`, () => {
      const seasonal = (messages.hero as Record<string, unknown>).seasonal as Record<
        string,
        Record<string, string>
      >;
      expect(seasonal).toBeDefined();
      for (const season of SEASONS) {
        const entry = seasonal[season];
        expect(entry, `${loc}/${season}`).toBeDefined();
        expect(entry.ctaLabel.trim().length).toBeGreaterThan(0);
        expect(entry.question.trim().length).toBeGreaterThan(0);
        // vprašanje je vprašanje (se konča z ?) — pred-fill klepeta
        expect(entry.question.trim().endsWith("?")).toBe(true);
      }
    });
  }

  test("kicker ne potrebuje novih ključev — opisi sezon živijo v OBSTOJEČEM bestTime slovarju (1 vir resnice)", () => {
    for (const [loc, messages] of Object.entries(LOCALES)) {
      const seasons = (messages.bestTime as Record<string, unknown>).seasons as Record<
        string,
        Record<string, string>
      >;
      for (const season of SEASONS) {
        expect(
          seasons[season]?.desc?.trim().length,
          `${loc}/bestTime.seasons.${season}.desc`
        ).toBeGreaterThan(0);
        expect(
          seasons[season]?.label?.trim().length,
          `${loc}/bestTime.seasons.${season}.label`
        ).toBeGreaterThan(0);
      }
    }
  });

  test("vprašanja so zasidrana na top-3 ocenjene destinacije baze (Bled / Reka Soča) — živo preverjeno proti /api/chat", () => {
    const slSeasonal = (slMessages.hero as Record<string, unknown>).seasonal as Record<
      string,
      Record<string, string>
    >;
    // vsa 4 vprašanja vsebujejo IME destinacije, ki jo chat prepozna
    // (Bled pozimi/jeseni, Reka Soča pomladi/poleti — utemeljeni odgovori)
    expect(slSeasonal.zima.question).toContain("Bled");
    expect(slSeasonal.jesen.question).toContain("Bled");
    expect(slSeasonal.pomlad.question).toContain("Soči");
    expect(slSeasonal.poletje.question).toContain("Soči");
  });
});

// ---------------------------------------------------------------------------
// 3. SOURCE CONTRACT: Hero izrisuje sezonski pas + varovala ZERO FEATURE LOSS
// ---------------------------------------------------------------------------

describe("W4: Hero — sezonski pas (source contract)", () => {
  test("sezona se izračuna deterministično iz currentSeason (0 AI, brez nove infrastrukture)", () => {
    expect(HERO_SRC).toContain('currentSeason, type Season } from "@/lib/season"');
    expect(HERO_SRC).toContain("const season = currentSeason();");
    // opis sezone iz obstoječega bestTime slovarja — ne novi opisi
    expect(HERO_SRC).toContain('getTranslations("bestTime")');
    expect(HERO_SRC).toMatch(/seasons\.\$\{season\}\.desc/);
  });

  test("CTA = W9 kanon: ChatAskCta s površino hero-seasonal + season propom (telemetrija KPI)", () => {
    expect(HERO_SRC).toContain("<ChatAskCta");
    expect(HERO_SRC).toContain('surface="hero-seasonal"');
    expect(HERO_SRC).toContain("season={season}");
    // vprašanje se NE pošlje samodejno (W9 varovalo) — samo pred-fill klepeta
    expect(HERO_SRC).not.toContain("sendMessage");
  });

  test("VAROVALO: H1 vprašanje ostaja (t(\"title\")) + podnaslov + značka nespremenjeni", () => {
    expect(HERO_SRC).toContain('{t("title")}');
    expect(HERO_SRC).toContain('{t("subtitle")}');
    expect(HERO_SRC).toContain('{t("badge")}');
  });

  test("VAROVALO: primarni AI vnos ostaja dominanten — HeroQuickInput se izrisuje NAD sezonskim pasom", () => {
    expect(HERO_SRC).toContain("<HeroQuickInput />");
    const inputIdx = HERO_SRC.indexOf("<HeroQuickInput />");
    const seasonalCtaIdx = HERO_SRC.indexOf("<ChatAskCta", inputIdx);
    expect(seasonalCtaIdx).toBeGreaterThan(inputIdx);
    // pas je zadnji element vsebinskega stolpca (za vrstico zaupanja)
    const trustIdx = HERO_SRC.indexOf('{t("trustUpdated")}');
    expect(seasonalCtaIdx).toBeGreaterThan(trustIdx);
  });

  test("VAROVALO: čip »Brez gužve« ostaja — QUICK_ACTIONS 8 vnosov z noCrowds nespremenjen", () => {
    expect(QUICK_SRC).toContain('labelKey: "noCrowds"');
    expect(QUICK_SRC).toContain('queryKey: "noCrowdsQuery"');
    const quickActionsMatch = QUICK_SRC.match(
      /\{ icon: \w+, labelKey: "\w+", queryKey: "\w+Query" \}/g
    );
    expect(quickActionsMatch?.length).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// 4. SOURCE CONTRACT: ChatAskCta razširitev (varovala obstoječih površin)
// ---------------------------------------------------------------------------

describe("W4: ChatAskCta — season prop (varovala obstoječih površin)", () => {
  test("površina hero-seasonal je član unije; vse obstoječe površine ostanejo", () => {
    for (const surface of [
      '"hero"',
      '"hero-seasonal"',
      '"guide"',
      '"best-time"',
      '"things-to-do"',
      '"itinerary"',
    ]) {
      expect(CTA_SRC).toContain(`| ${surface}`);
    }
  });

  test("season prop je NEOBAVEZEN in se vključi v telemetrijo le, če je podan", () => {
    expect(CTA_SRC).toMatch(/season\?: string/);
    expect(CTA_SRC).toContain("...(season ? { season } : {})");
    // obstoječi klici brez season propa ostanejo tipovno veljavni
    expect(CTA_SRC).toContain('"chat_ask_cta_clicked"');
  });

  test("telemetrija: NIČ novih imen dogodkov — chat_ask_cta_clicked je že v strežniški whitelisti", () => {
    expect(ROUTE_SRC).toContain('"chat_ask_cta_clicked"');
    // površina je PROPS vrednost (prosta oblika), ne ime dogodka — whitelist
    // ostaja nedotaknjena (past iz W3: union ⊆ whitelist)
    expect(CTA_SRC).not.toMatch(/trackPlannerEvent\("(?!chat_ask_cta_clicked)/);
  });
});

// ---------------------------------------------------------------------------
// 5. W1 doslednost domače strani: oznake <details> povzetkov 4-jezične
// ---------------------------------------------------------------------------

describe("W4: page.tsx — W1 doslednost oznak zloženih povzetkov", () => {
  test("COLLAPSIBLE pokriva vse 4 javne jezike + iskren SL fallback", () => {
    for (const loc of ['sl: {', 'en: {', 'it: {', 'de: {']) {
      expect(PAGE_SRC).toContain(`  ${loc}`);
    }
    expect(PAGE_SRC).toContain("const labels = COLLAPSIBLE[locale] ?? COLLAPSIBLE.sl;");
    // stara SL/EN binarna veja je ODSTRANJENA (it/de ne vidijo več SL nizov)
    expect(PAGE_SRC).not.toContain(
      'locale === "en" ? COLLAPSIBLE.en : COLLAPSIBLE.sl'
    );
  });
});
