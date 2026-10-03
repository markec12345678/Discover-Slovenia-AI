import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  routing,
  isEnRoute,
  isItDeRoute,
  isFrEsRoute,
  isLocaleRoute,
} from "@/i18n/routing";
import { buildItineraryGoView } from "@/lib/journey/itinerary-go";
import type { Itinerary } from "@/lib/types";

/**
 * ISSUE #24 Sklop 7 (1.169.0) — GO MODE I18N, FAZA 1 (vodovodarstvo).
 *
 * Analiza UI/UX benchmarka (IMPROVE #3): Go Mode je bil za it/de/fr/es
 * uporabnike nedosegljiv v njihovem jeziku — POJDI zavihek (locale-zavedni
 * Link) jih je pahnil na SL stran, ker /na-poti NI bil na IT/DE/FR/ES
 * whitelistah (proxy 308 na slovensko = dejanska kršitev P4-8 »nikoli ne
 * mešaj jezikov«, ki jo ta sklop popravi).
 *
 * Pogodba FAZE 1 (prehodno obdobje — isti kanon kot W1/W12 za /nacrtuj):
 * - /na-poti je na VSEH šestih whitelistah (sl izvirnik + en/it/de/fr/es);
 * - Go Mode L-vzorec {sl,en} razrešuje SL-FIRST: sl → sl, vsi tuji
 *   (en/it/de/fr/es) → EN — NIKOLI SL (PL prehodni kanon dedovanja);
 * - Go zapis (dai:go-trip) je jezikovno NEVTRALEN — vsi nizi so {sl,en}
 *   pari (izbere jih GoMode po localu ob izrisu);
 * - vhodne točke: gumbi z router.push morajo ciljati po localu
 *   ({locale}/na-poti); Link vhodi (navigacija/noga/zavihek/hub) se
 *   prefixirajo samodejno prek @/i18n/navigation;
 * - offline: NEXT_LOCALE cookie ×6 → EN besedila offline strani (PL
 *   kanon) + Go povezava v uporabnikovi URL poti; SW obravnava vseh 6
 *   Go strani kot občutljivo PLANS predpomnilnik.
 *
 * Iskrena meja (dokumentirana v analizi): Go Mode NIZI ŠE VEDNO obstajajo
 * samo v SL+EN — it/de/fr/es dedijo EN. Celotni prevodi (~260 enot ×4) so
 * lastna naloga (faza 2 po jezikih), ta test varuje vodovodarstvo faze 1.
 */

const ROOT = join(import.meta.dir, "../../..");

function source(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

const GO_MODE_PAGE = "src/app/na-poti/page.tsx";
const GO_MODE = "src/components/sections/go-mode.tsx";
const PLANNER = "src/components/sections/itinerary-planner.tsx";
const SHARED_TRIP = "src/components/shared-trip.tsx";

// ---------------------------------------------------------------------------
// A) ROUTING — /na-poti na vseh šestih whitelistah
// ---------------------------------------------------------------------------

describe("S7 A) routing: Go Mode odprt za vseh 6 jezikov", () => {
  test("① isEnRoute/isItDeRoute/isFrEsRoute — /na-poti je povsod true", () => {
    expect(isEnRoute("/na-poti")).toBe(true);
    expect(isItDeRoute("/na-poti")).toBe(true);
    expect(isFrEsRoute("/na-poti")).toBe(true);
  });

  test("② isLocaleRoute: vsi javni jeziki true, neznan jezik false", () => {
    for (const locale of routing.locales) {
      expect(
        isLocaleRoute("/na-poti", locale),
        `"${locale}" mora imeti Go Mode različico`
      ).toBe(true);
    }
    expect(isLocaleRoute("/na-poti", "xx")).toBe(false);
    expect(isLocaleRoute("/na-poti", "hr")).toBe(false);
  });

  test("③ regresija: sosednje L-vzorčne poti OSTANEJO zaprte (P4-8 varovalo)", () => {
    // /potovanje in /moja-potovanja sta še vedno SL/EN (L vzorec brez
    // whitelista za it/de/fr/es) — Sklop 7 je NAMERNO ozek samo na Go Mode.
    for (const p of ["/potovanje", "/moja-potovanja", "/trznica"]) {
      expect(isItDeRoute(p), `"${p}" NE sme biti IT/DE`).toBe(false);
      expect(isFrEsRoute(p), `"${p}" NE sme biti FR/ES`).toBe(false);
    }
    // EN različice teh poti obstajajo že prej (EN whitelista) — nedotaknjene.
    expect(isEnRoute("/potovanje")).toBe(true);
    expect(isEnRoute("/moja-potovanja")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// B) SL-FIRST RESOLUCIJA — tuji uporabniki dedijo EN, nikoli SL
// ---------------------------------------------------------------------------

describe("S7 B) SL-first jezikovna resolucija (source contract)", () => {
  // SKLOP 8 FAZA 2 (1.170.0): resolucija je bila nadgrajena s SL-first
  // (faza 1: vsi tuji → EN) na goLangOf (faza 2: vsi 6 jezikov ŽIVIJO —
  // polni prevodi; neprevedena enota deduje EN prek GL, nikoli SL).
  // Ta pogodba varuje, da se stara EN-first / SL-first fallback ne vrne.
  test("④ na-poti/page.tsx: goLangOf resolucija ×2 (metadata + stran), 0× stara", () => {
    const page = source(GO_MODE_PAGE);
    const flips = page.split("goLangOf(locale)").length - 1;
    expect(flips).toBe(2);
    // Stara resoluciji bi it/de/fr/es pahnili v napačen jezik (P4-8).
    expect(page).not.toContain('locale === "sl" ? "sl" : "en"');
    expect(page).not.toContain('locale === "en" ? "en" : "sl"');
  });

  test("⑤ go-mode.tsx: goLangOf resolucija (single source celega Go drevesa)", () => {
    const gm = source(GO_MODE);
    expect(gm).toContain("const lang: GoLang = goLangOf(locale)");
    expect(gm).not.toContain('locale === "sl" ? "sl" : "en"');
    expect(gm).not.toContain('locale === "en" ? "en" : "sl"');
  });

  test("⑥ meja: SL/EN-only površje OSTAJAJO EN-first (regresijsko varovalo)", () => {
    // /moja-potovanja in /potovanje nista na it/de/fr/es whitelistah —
    // tam je locale vedno sl|en, EN-first resolucija je še vedno pravilna.
    const hub = source("src/app/moja-potovanja/moja-potovanja-view.tsx");
    expect(hub).toContain('locale === "en" ? "en" : "sl"');
    const journey = source("src/components/sections/journey-planner.tsx");
    expect(journey).toContain('router.push(lang === "en" ? "/en/na-poti" : "/na-poti")');
  });
});

// ---------------------------------------------------------------------------
// C) VNOSNE TOČKE — push po localu; Link vhodi se prefixirajo sami
// ---------------------------------------------------------------------------

describe("S7 C) vnosne točke v Go Mode (source contract)", () => {
  test("⑦ planner: router.push po localu (template `/${lang}/na-poti`)", () => {
    const planner = source(PLANNER);
    expect(planner).toContain('router.push(lang === "sl" ? "/na-poti" : `/${lang}/na-poti`)');
    // Stara vrstica je vse tuje uporabnike silila na EN URL.
    expect(planner).not.toContain('"/en/na-poti")');
  });

  test("⑧ shared-trip: EN uporabnik ne pristane več na SL strani (P4-8)", () => {
    const st = source(SHARED_TRIP);
    expect(st).toContain('router.push(lang === "sl" ? "/na-poti" : "/en/na-poti")');
    // Stari hardcode je EN uporabnika (dvojezična /pot površina od Sklopa 1)
    // pahnil na slovensko /na-poti kljub EN gumbu.
    expect(st).not.toContain('router.push("/na-poti")');
  });

  test("⑨ Link vhodi: locale-zavedni Link iz @/i18n/navigation (avto-prefix)", () => {
    const linkFiles = [
      "src/components/sections/navigation.tsx",
      "src/components/sections/footer.tsx",
      "src/components/mobile-tab-bar.tsx",
      "src/components/my-trip-view.tsx",
      "src/components/trip-profile.tsx",
    ];
    for (const f of linkFiles) {
      const src = source(f);
      expect(src, `${f} mora uvoziti locale-zavedni Link`).toContain(
        'from "@/i18n/navigation"'
      );
      expect(src, `${f} se povezuje na /na-poti`).toContain('"/na-poti"');
    }
  });
});

// ---------------------------------------------------------------------------
// D) GO ZAPIS — jezikovna nevtralnost ({sl,en} pari)
// ---------------------------------------------------------------------------

describe("S7 D) Go zapis je jezikovno nevtralen", () => {
  test("⑩ buildItineraryGoView piše {sl,en} pare neodvisno od lang opcije", () => {
    const itinerary = {
      title: "Testna pot",
      days: [
        {
          day: 1,
          locations: [
            {
              destination_id: "bled",
              destination_name: "Bled",
              time_slot: "09:00-13:00",
              duration: 4,
            },
          ],
          weather: { condition: "sončno", temp: 20 },
        },
      ],
      total_budget: 100,
      recommendations: [],
      tips: [],
      source: "deterministic",
    } as unknown as Itinerary;

    // lang opcija je neuporabljena ostankinja — zapis VEDNO nosi oba jezika,
    // zato lahko it/de/fr/es uporabnik odpre SL-agrajen zapis in dobi EN.
    for (const lang of ["sl", "en"] as const) {
      const view = buildItineraryGoView(itinerary, { lang });
      expect(view.title.sl).toContain("MOJA POT");
      expect(view.title.en).toContain("MY TRIP");
      expect(view.confirmation.note.sl.length).toBeGreaterThan(0);
      expect(view.confirmation.note.en.length).toBeGreaterThan(0);
      const entry = view.days[0].entries[0];
      expect(entry.providerLabel).toEqual({
        sl: "AI načrt potovanja",
        en: "AI travel plan",
      });
    }
  });
});

// ---------------------------------------------------------------------------
// E) OFFLINE — cookie ×6, Go povezava po localu, SW PLANS za vseh 6
// ---------------------------------------------------------------------------

describe("S7 E) offline vodovodarstvo (source contract)", () => {
  test("⑪ offline.html: NEXT_LOCALE ×5 tujih → EN besedila + GO_LOCALE", () => {
    const html = source("public/offline.html");
    expect(html).toContain('loc === "en" || loc === "it" || loc === "de" || loc === "fr" || loc === "es"');
    expect(html).toContain('var GO_LOCALE = "sl";');
    expect(html).toContain('GO_LOCALE = loc;');
    expect(html).toContain('var goHref = GO_LOCALE === "sl" ? "/na-poti" : "/" + GO_LOCALE + "/na-poti";');
  });

  test("⑫ sw.js: vseh 6 Go strani v PLANS obravnavi (GO_PAGE_PATHS)", () => {
    const sw = source("public/sw.js");
    for (const p of [
      '"/na-poti"',
      '"/en/na-poti"',
      '"/it/na-poti"',
      '"/de/na-poti"',
      '"/fr/na-poti"',
      '"/es/na-poti"',
    ]) {
      expect(sw, `sw.js mora vsebovati ${p}`).toContain(p);
    }
    // Varnostna odločitev ostaja: imena cache-a se NE bumpanjo.
    expect(sw).toContain("NAMENOMA ne bumpamo");
  });
});
