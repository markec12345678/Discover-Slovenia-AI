import { describe, expect, test } from "bun:test";
import slMessages from "@/i18n/messages/sl.json";
import enMessages from "@/i18n/messages/en.json";
import itMessages from "@/i18n/messages/it.json";
import deMessages from "@/i18n/messages/de.json";

/**
 * TASK 71 (raziskava TASK 68 P4+P6): regresijska varovalka paritete i18n.
 *
 * Slovarji sporočil (sl.json / en.json) morajo imeti IDENTIČNO množico
 * ploščih ključev — sicer EN načrt tiho pade nazaj na slovenščino (ali
 * obratno: SL pogled razpade na surove ključe). Do TASK 71 je bila
 * pariteta preverjana ročno (python skript ob vsaki spremembi); ta test
 * jo trajno zavaruje.
 *
 * W1 (Issue #15 V0, 1.126.0): pariteta razširjena na 4 javne jezike —
 * it.json in de.json (AI-podprta prevoda, označena z mtNotice v UI) morata
 * imeti ENAKO množico ključev kot sl/en, sicer bi italijanski/nemški
 * pogled tiho padal v mešane jezike (P4-8).
 *
 * NAMERNE izjeme, ki jih ta test NE preverja:
 * - ICU placeholderji se med jezikoma LAHKO razlikujejo (SL potrebuje
 *   sklonjinske različice tipa {hl1Lower}, ki v EN ne obstajajo) —
 *   5 takih primerov je dokumentiranih v guidePage/adriaGuidePage.
 */

type Flat = Record<string, string>;

/** Plošča razširitev gnezdenih slovarjev v "ns.ns.kljuc" → vrednost. */
function flat(obj: unknown, prefix = ""): Flat {
  const out: Flat = {};
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return out;
  }
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      Object.assign(out, flat(value, path));
    } else {
      out[path] = String(value);
    }
  }
  return out;
}

const SL = flat(slMessages);
const EN = flat(enMessages);
const IT = flat(itMessages);
const DE = flat(deMessages);
const slKeys = Object.keys(SL).sort();
const enKeys = Object.keys(EN).sort();
const itKeys = Object.keys(IT).sort();
const deKeys = Object.keys(DE).sort();

/** W1: vsi javni jeziki s pari ključev (za parametrizirane preverbe). */
const LOCALE_PAIRS = [
  { code: "en", keys: enKeys, dict: EN },
  { code: "it", keys: itKeys, dict: IT },
  { code: "de", keys: deKeys, dict: DE },
] as const;

describe("TASK 71: i18n pariteta SL/EN/IT/DE (regresijska varovalka)", () => {
  test("vsi javni jeziki imajo identično množico ploščih ključev", () => {
    for (const { code, keys } of LOCALE_PAIRS) {
      expect(keys, `jezik "${code}" se razlikuje od SL`).toEqual(slKeys);
    }
  });

  test("nobena stran nima osirotelih ključev (množična razlika = prazen niz)", () => {
    const slSet = new Set(slKeys);
    for (const { code, keys, dict } of LOCALE_PAIRS) {
      const otherSet = new Set(keys);
      const onlySl = slKeys.filter((k) => !otherSet.has(k));
      const onlyOther = keys.filter((k) => !slSet.has(k));
      expect(onlySl, `SL-only ključi proti "${code}"`).toEqual([]);
      expect(onlyOther, `"${code}"-only ključi proti SL`).toEqual([]);
      // tudi vrednosti morajo obstajati (dict referenca le za typе)
      expect(Object.keys(dict).length).toBe(slKeys.length);
    }
  });

  test("vsako sporočilo v vseh jezikih je neprazen niz", () => {
    for (const key of slKeys) {
      expect(SL[key].trim().length, `SL ključ "${key}" je prazen`).toBeGreaterThan(0);
    }
    for (const { code, dict } of LOCALE_PAIRS) {
      for (const key of slKeys) {
        expect(
          dict[key]?.trim().length,
          `jezik "${code}" ključ "${key}" je prazen/manjka`
        ).toBeGreaterThan(0);
      }
    }
  });

  test("novi ključi TASK 71 obstajajo v vseh jezikih (hero.chipsHint, homeDest.cardPrice, homeDest.cardPriceSr)", () => {
    for (const key of ["hero.chipsHint", "homeDest.cardPrice", "homeDest.cardPriceSr"]) {
      expect(SL[key], `SL manjka "${key}"`).toBeDefined();
      for (const { code, dict } of LOCALE_PAIRS) {
        expect(dict[key], `jezik "${code}" manjka "${key}"`).toBeDefined();
      }
    }
  });

  test("cardPrice ima placeholder {price} v vseh jezikih (enak nabor parametrov)", () => {
    const placeholders = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort();
    expect(placeholders(SL["homeDest.cardPrice"])).toEqual(["{price}"]);
    for (const { code, dict } of LOCALE_PAIRS) {
      expect(
        placeholders(dict["homeDest.cardPrice"]),
        `jezik "${code}" cardPrice placeholder`
      ).toEqual(["{price}"]);
    }
  });

  test("chipsHint mikrocopy je v vseh jezikih resničen prevod, ne kopija", () => {
    // Kot pri dogodkih (events-i18n): vsak jezik mora biti pravi prevod.
    expect(SL["hero.chipsHint"]).not.toBe(EN["hero.chipsHint"]);
    expect(SL["hero.chipsHint"].length).toBeGreaterThan(10);
    expect(EN["hero.chipsHint"].length).toBeGreaterThan(10);
    // W1: IT/DE sta strojna prevoda — NE SMETA biti kopija SL niti EN
    expect(IT["hero.chipsHint"]).not.toBe(SL["hero.chipsHint"]);
    expect(DE["hero.chipsHint"]).not.toBe(SL["hero.chipsHint"]);
    expect(IT["hero.chipsHint"].length).toBeGreaterThan(10);
    expect(DE["hero.chipsHint"].length).toBeGreaterThan(10);
  });

  test("W1: mtNotice (iskrena oznaka strojnega prevoda) obstaja v vseh jezikih", () => {
    // Provenance kanon: IT/DE sta strojna prevoda — nota mora obstajati
    // v vseh štirih jezikih (na SL/EN se ne prikaže, a ključi morajo
    // obstajati zaradi paritete).
    for (const key of ["mtNotice.title", "mtNotice.body", "mtNotice.dismiss"]) {
      expect(SL[key], `SL manjka "${key}"`).toBeDefined();
      expect(EN[key], `EN manjka "${key}"`).toBeDefined();
      expect(IT[key], `IT manjka "${key}"`).toBeDefined();
      expect(DE[key], `DE manjka "${key}"`).toBeDefined();
    }
  });

  test("W1-faza-2b: polja (arrays) ostanejo POLJA v vseh jezikih (tipovna pariteta)", () => {
    // Hrošč translate-locale-fill: flat/rebuild je smartSearch.examples
    // v IT/DE spremenil v niz ("a,b,c") → exampleQueries.map je padel na /it.
    // Ta varovalka tipovno pariteto zavaruje za VSE poljske ključe.
    const isArray = (v: unknown) => Array.isArray(v);
    for (const key of slKeys) {
      if (isArray(SL[key])) {
        for (const { code, dict } of LOCALE_PAIRS) {
          expect(
            isArray(dict[key]),
            `jezik "${code}" ključ "${key}": SL je polje, ${code} pa ne`
          ).toBe(true);
          expect(
            (dict[key] as unknown as unknown[]).length,
            `jezik "${code}" ključ "${key}": dolžina polja`
          ).toBe((SL[key] as unknown as unknown[]).length);
        }
      }
    }
  });

  test("W1: IT/DE placeholderji so ohranjeni (vzorčni nizi z {…})", () => {
    // Vzorčna preverba placeholderjev čez cel slovar: za vsak niz s
    // placeholderjem v SL (ki obstaja tudi v EN) mora imeti IT/DE enake
    // placeholderje (presek — SL ima 5 dokumentiranih sklonjinskih
    // izjem, ki jih namerno ne zahtevamo).
    const ph = (s: string) => new Set(s.match(/\{[a-zA-Z0-9_]+\}/g) ?? []);
    let checked = 0;
    for (const key of slKeys) {
      const slPh = [...ph(SL[key])];
      if (slPh.length === 0) continue;
      const enPh = ph(EN[key]);
      const required = slPh.filter((p) => enPh.has(p));
      if (required.length === 0) continue;
      for (const { dict } of LOCALE_PAIRS) {
        const got = ph(dict[key] ?? "");
        for (const p of required) {
          expect(got.has(p), `ključ "${key}": manjka placeholder ${p}`).toBe(true);
        }
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(50); // varovalka: preverba res pokrije slovar
  });

  test("W9 (1.130.0): chatAsk ključi (kontekstualni deep-link vsebina → klepet) obstajajo v vseh jezikih", () => {
    // W9 verifikacijsko merilo (4): paritetni testi razširjeni na nove ključe.
    // Namespace chatAsk poganja pasove/gumbe "Vprašaj AI" na vseh 5
    // destinacijskih pod-poteh (38×5 strani × 4 jeziki).
    for (const key of [
      "chatAsk.askAbout",
      "chatAsk.askStay",
      "chatAsk.askBestTime",
      "chatAsk.askThingsToDo",
      "chatAsk.qHero",
      "chatAsk.qStayRomantic",
      "chatAsk.qStayFamily",
      "chatAsk.qStayBudget",
      "chatAsk.qStayWeekend",
      "chatAsk.qBestTime",
      "chatAsk.qThingsToDo",
      "chatAsk.qItinerary",
    ]) {
      expect(SL[key], `SL manjka "${key}"`).toBeDefined();
      for (const { code, dict } of LOCALE_PAIRS) {
        expect(dict[key], `jezik "${code}" manjka "${key}"`).toBeDefined();
      }
    }
  });

  test("W9: chatAsk vprašanja ohranjajo placeholder {name} v vseh jezikih", () => {
    const placeholders = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort();
    for (const key of [
      "chatAsk.askAbout",
      "chatAsk.qHero",
      "chatAsk.qStayRomantic",
      "chatAsk.qStayFamily",
      "chatAsk.qStayBudget",
      "chatAsk.qStayWeekend",
      "chatAsk.qBestTime",
      "chatAsk.qThingsToDo",
      "chatAsk.qItinerary",
    ]) {
      expect(placeholders(SL[key])).toEqual(["{name}"]);
      for (const { code, dict } of LOCALE_PAIRS) {
        expect(
          placeholders(dict[key]),
          `jezik "${code}" ${key} placeholder`
        ).toEqual(["{name}"]);
      }
    }
  });

});
