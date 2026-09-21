import { describe, expect, test } from "bun:test";
import slMessages from "@/i18n/messages/sl.json";
import enMessages from "@/i18n/messages/en.json";

/**
 * TASK 71 (raziskava TASK 68 P4+P6): regresijska varovalka paritete i18n.
 *
 * Slovarja sporočil (sl.json / en.json) morata imeti IDENTIČNO množico
 * ploščih ključev — sicer EN načrt tiho pade nazaj na slovenščino (ali
 * obratno: SL pogled razpade na surove ključe). Do TASK 71 je bila
 * pariteta preverjana ročno (python skript ob vsaki spremembi); ta test
 * jo trajno zavaruje.
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
const slKeys = Object.keys(SL).sort();
const enKeys = Object.keys(EN).sort();

describe("TASK 71: i18n pariteta SL/EN (regresijska varovalka)", () => {
  test("SL in EN imata identično množico ploščih ključev", () => {
    expect(slKeys).toEqual(enKeys);
  });

  test("nobena stran nima osirotelih ključev (množična razlika = prazen niz)", () => {
    const slSet = new Set(slKeys);
    const enSet = new Set(enKeys);
    const onlySl = slKeys.filter((k) => !enSet.has(k));
    const onlyEn = enKeys.filter((k) => !slSet.has(k));
    expect(onlySl).toEqual([]);
    expect(onlyEn).toEqual([]);
  });

  test("vsako sporočilo v obeh jezikih je neprazen niz", () => {
    for (const key of slKeys) {
      expect(SL[key].trim().length, `SL ključ "${key}" je prazen`).toBeGreaterThan(0);
    }
    for (const key of enKeys) {
      expect(EN[key].trim().length, `EN ključ "${key}" je prazen`).toBeGreaterThan(0);
    }
  });

  test("novi ključi TASK 71 obstajajo v obeh jezikih (hero.chipsHint, homeDest.cardPrice, homeDest.cardPriceSr)", () => {
    for (const key of ["hero.chipsHint", "homeDest.cardPrice", "homeDest.cardPriceSr"]) {
      expect(SL[key], `SL manjka "${key}"`).toBeDefined();
      expect(EN[key], `EN manjka "${key}"`).toBeDefined();
    }
  });

  test("cardPrice ima placeholder {price} v obeh jezikih (enak nabor parametrov)", () => {
    const placeholders = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort();
    expect(placeholders(SL["homeDest.cardPrice"])).toEqual(["{price}"]);
    expect(placeholders(EN["homeDest.cardPrice"])).toEqual(["{price}"]);
  });

  test("chipsHint mikrocopy je v obeh jezikih resničen prevod, ne kopija", () => {
    // Kot pri dogodkih (events-i18n): EN mora biti pravi prevod.
    expect(SL["hero.chipsHint"]).not.toBe(EN["hero.chipsHint"]);
    expect(SL["hero.chipsHint"].length).toBeGreaterThan(10);
    expect(EN["hero.chipsHint"].length).toBeGreaterThan(10);
  });
});
