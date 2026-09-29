import { describe, expect, test } from "bun:test";
import slMessages from "@/i18n/messages/sl.json";
import enMessages from "@/i18n/messages/en.json";
import itMessages from "@/i18n/messages/it.json";
import deMessages from "@/i18n/messages/de.json";
import frMessages from "@/i18n/messages/fr.json";
import esMessages from "@/i18n/messages/es.json";

/**
 * W12-2b-1: regresijska varovalka PREVODSKE KVALITETE messages slovarjev.
 *
 * ZAKAJ TA TEST OBSTAJA:
 * Prevajalni skript iz W12 faze 1 (1.144.0) je poročal „0 fallbackov", ker je
 * gledal samo prazne vrednosti in EN-identične nize. Kvalitetna vrzela, ki jo
 * je ta merilec zamudil: 173 nizov (fr 21 + es 101 + it 19 + de 32) je bilo
 * BITNO-BIT identičnih slovenskemu viru — na FR/ES straneh se je tako izrisala
 * celotna slovenščina (homeExp/affiliate razdelki, planCheck, vodiciPage …).
 * W12-2b-1 jih je prevedel; ta test trajno zavaruje, da se tak regresijski
 * razkroj „tihega SL fallbacka" ne more več ponoviti (enako kot task71
 * zavaruje pariteto KLJUČEV, ta zavaruje pariteto PREVODOV).
 *
 * Pravila:
 * 1. „Nepreveden" niz = vrednost identična SL viru IN ni jezikovno nevtralna.
 *    Nevtralnost se izračuna DINAMIČNO:
 *    a) vrednost je identična v VSEH 6 jezikih (kumulativni dokaz nevtralnosti),
 *    b) po odstranitvi ICU placeholderjev {…} v nizu ne ostane nobena črka
 *       (številke/simboli: „≈ {price} €", „{value} %", „12 %", „0 %" …).
 * 2. NAMERNE izjeme (proper nouns / besede, ki so hkrati veljavne v ciljnem
 *    jeziku) so hardkodirane spodaj z utemeljitvijo — vsaka nova izjema
 *    zahteva utemeljitev v PR/opisu.
 * 3. ICU argumenti ({price}, {value}, {count, plural, …}) morajo biti v
 *    fr/es/it/de IDENTIČNA množica kot v SL viru — sicer prevod ob izrisu
 *    razpade (manjkajoči argument → next-intl napaka, odvečni → smet).
 */

type Flat = Record<string, string>;
type TargetLang = "fr" | "es" | "it" | "de";

/** Plošča razširitev gnezdenih slovarjev v "ns.ns.kljuc" → vrednost (kot v task71). */
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
const ALL: Record<TargetLang | "en", Flat> = {
  en: flat(enMessages),
  fr: flat(frMessages),
  es: flat(esMessages),
  it: flat(itMessages),
  de: flat(deMessages),
};
const LANGS: TargetLang[] = ["fr", "es", "it", "de"];

/** Množica ključev, katerih vrednost je identična v VSEH 6 jezikih → jezikovno nevtralna. */
const NEUTRAL_IN_ALL_SIX = new Set<string>(
  Object.keys(SL).filter((key) =>
    (["en", "fr", "es", "it", "de"] as const).every((lang) => ALL[lang][key] === SL[key])
  )
);

const PLACEHOLDER_RE = /\{[^{}]*\}/g;
const LETTER_RE = /\p{L}/u;

/** Niz brez črk po odstranitvi ICU placeholderjev („≈ {price} €", „12 %") → jezikovno nevtralen. */
function isSymbolOnly(value: string): boolean {
  return !LETTER_RE.test(value.replace(PLACEHOLDER_RE, ""));
}

/**
 * Izlušči imena ICU argumentov ({name}, {name, plural, …}) iz sporočila.
 * Pluralne veje (one/two/few/other) in '#' NISO argumenti — zavestno
 * preprosta implementacija, ki pokriva vse vzorce v messages/*.json.
 */
function extractIcuArgs(src: string): Set<string> {
  const args = new Set<string>();
  let i = 0;
  while (i < src.length) {
    if (src[i] !== "{") {
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < src.length && /[A-Za-z0-9_]/.test(src[j] as string)) {
      j += 1;
    }
    const token = src.slice(i + 1, j);
    if (token.length > 0 && j < src.length && (src[j] === "}" || src[j] === ",")) {
      args.add(token);
      // nadaljuj ZA imenom — Scanner tako najde tudi gnezdene argumente
      // znotraj pluralnih vej (npr. „other {… {km} km}").
      i = j;
      continue;
    }
    i += 1;
  }
  return args;
}

/** Krajevna imena v predgeneriranih itinererjih so proper nouns (W12 kanon). */
const PROPER_NOUN_KEY_RE = /^pregenTrips\.trips\.[^.]+\.dest\d+$/;

/**
 * NAMERNE izjeme — ključi, katerih SL-identičnost je utemeljena:
 * - proper noun (Kolpa = reka), ali
 * - beseda, ki je hkrati veljavna beseda ciljnega jezika (kot „Transport" v FR/DE),
 *   oz. uveljavljena izposojenka („Newsletter", „Transfer", „Partner", „Repo:").
 */
const ALLOWED_IDENTICAL: Record<TargetLang, string[]> = {
  fr: [
    "contact.cards.emailTitle", // „Email" — uveljavljena francoska raba (kanon W12-2b-1)
    "guidePage.guideTypes.budget.shortLabel", // „Budget" — enaka francoska beseda
    "planner.booking.tabTransport", // „Transport" — veljavna francoska beseda
    "privacy.sections.s3.title", // „3. Newsletter" — uveljavljena izposojenka v fr
  ],
  es: [
    "adriaGuidePage.credit.photo", // „Foto:" — enaka španska beseda
    "planner.booking.ctaTransfer", // „Transfer" — uveljavljena potniška izposojenka
  ],
  it: [
    "about.dataRepo", // „Repo:" — tehnična oznaka (razvijalska izposojenka)
    "adriaGuidePage.credit.photo", // „Foto:" — enaka italijanska beseda
    "affiliate.badgeShort", // „Partner" — W12 kanon (IT partner)
    "homeDest.filters", // „Filtri" — slučajno identična veljavna italijanska beseda
    "planner.booking.ctaTransfer", // „Transfer" — uveljavljena potniška izposojenka
    "pregenTrips.trips.bela-krajina.hl3", // "Kolpa" — reka, proper noun
    "privacy.sections.s3.title", // "3. Newsletter" — uveljavljena izposojenka v it
  ],
  de: [
    "about.contactTitle", // „Kontakt" — veljavna nemška beseda
    "about.dataRepo", // „Repo:" — tehnična oznaka (razvijalska izposojenka)
    "adriaGuidePage.credit.photo", // „Foto:" — enaka nemška beseda
    "affiliate.badgeShort", // „Partner" — W12 kanon (DE Partner)
    "collections.items.adventure.title", // „Adrenalin" — enaka nemška beseda
    "common.filter", // „Filter" — enaka nemška beseda
    "comparison.table.rows.focus.label", // „Fokus" — uveljavljena nemška beseda
    "contact.meta.title", // „Kontakt" — enaka nemška beseda
    "contact.title", // „Kontakt" — enaka nemška beseda
    "footer.legalContact", // „Kontakt" — enaka nemška beseda
    "planner.booking.ctaTransfer", // „Transfer" — veljavna nemška beseda
    "planner.booking.tabTransport", // „Transport" — veljavna nemška beseda
    "pregenTrips.trips.bela-krajina.hl3", // „Kolpa" — reka, proper noun
    "privacy.sections.s3.title", // „3. Newsletter" — uveljavljena izposojenka v de
    "privacy.sections.s9.title", // „9. Kontakt" — enaka nemška beseda
    "terms.sections.s10.title", // „10. Kontakt" — enaka nemška beseda
  ],
};

const ALLOWED_SETS: Record<TargetLang, Set<string>> = {
  fr: new Set(ALLOWED_IDENTICAL.fr),
  es: new Set(ALLOWED_IDENTICAL.es),
  it: new Set(ALLOWED_IDENTICAL.it),
  de: new Set(ALLOWED_IDENTICAL.de),
};

/** Seznam neprevedenih nizov za jezik (identični SL viru, a ne nevtralni in ne izjemljeni). */
function untranslatedKeys(lang: TargetLang): string[] {
  const target = ALL[lang];
  return Object.keys(SL).filter((key) => {
    if (target[key] !== SL[key]) {
      return false;
    }
    if (NEUTRAL_IN_ALL_SIX.has(key) || isSymbolOnly(SL[key] as string)) {
      return false;
    }
    if (ALLOWED_SETS[lang].has(key) || PROPER_NOUN_KEY_RE.test(key)) {
      return false;
    }
    return true;
  });
}

describe("W12 prevajalska kvaliteta", () => {
  test("fr nima neprevedenih (SL-identičnih) nizov", () => {
    expect(untranslatedKeys("fr")).toEqual([]);
  });

  test("es nima neprevedenih (SL-identičnih) nizov", () => {
    expect(untranslatedKeys("es")).toEqual([]);
  });

  test("it nima neprevedenih (SL-identičnih) nizov — W12-2b-1 jih je popravil", () => {
    expect(untranslatedKeys("it")).toEqual([]);
  });

  test("de nima neprevedenih (SL-identičnih) nizov — W12-2b-1 jih je popravil", () => {
    expect(untranslatedKeys("de")).toEqual([]);
  });

  test("ICU placeholderji so v fr/es/it/de identična množica kot v SL viru", () => {
    const problems: string[] = [];
    for (const lang of LANGS) {
      const target = ALL[lang];
      for (const [key, slValue] of Object.entries(SL)) {
        const targetValue = target[key];
        if (typeof targetValue !== "string") {
          continue; // manjkajoči ključi so varovani v task71 (pariteta ključev)
        }
        const slArgs = extractIcuArgs(slValue as string);
        const targetArgs = extractIcuArgs(targetValue);
        if (slArgs.size !== targetArgs.size || [...slArgs].some((a) => !targetArgs.has(a))) {
          problems.push(
            `${lang}.${key}: SL={${[...slArgs].join(",")}} ${lang}={${[...targetArgs].join(",")}}`
          );
        }
      }
    }
    expect(problems).toEqual([]);
  });

  test("izjeme ALLOWED_IDENTICAL so dejansko SL-identične (sicer je seznam zastarel)", () => {
    // Varovalka za samo varovalko: če kdo ključ iz izjem prevede (ali SL vir
    // spremeni), zastareli vnos razkrijemo, da seznam ne tiho razpada.
    const stale: string[] = [];
    for (const lang of LANGS) {
      for (const key of ALLOWED_IDENTICAL[lang]) {
        if (ALL[lang][key] !== SL[key]) {
          stale.push(`${lang}.${key} ni več SL-identičen — odstrani iz izjem`);
        }
      }
    }
    expect(stale).toEqual([]);
  });
});
