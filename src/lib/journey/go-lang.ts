// ============================================================================
// ISSUE #24 Sklop 8 (1.170.0) — GO MODE I18N, FAZA 2: jezikovni helper
// ============================================================================
// Enakovreden kanonu planner-lang.ts PL() (W1/W12) in i18n-pick.ts pick(),
// a za GO MODE površino (/{locale}/na-poti + vse Go knjižnice):
//
//  - SL = izvirnik, EN = referenčni par — ostajata vedno eksplicitna;
//  - IT/DE/FR/ES so DODANI ključi v slovarjih (faza 2 = polni prevodi);
//  - NEPREVEDEN tuji ključ → EN dedovanje (isti kanon kot faza 1 / W1/W12:
//    "EN je imel vsebino prej, IT/DE/FR/ES jo podedujejo"), NIKOLI SL
//    fallback za tuje uporabnike (P4-8: ne mešaj jezikov);
//  - PODATKOVNI pari ({sl,en} iz shranjenih Go zapisov — providerLabel,
//    dateLabel, statusLabel poti …) se berejo z ISTIM helperjem: tuji
//    uporabnik dobi EN stran para (zapis je jezikovno nevtreren — ni
//    migracij; isto mejo kot faza 1, dokumentirano v analizi);
//  - neznan jezik → SL (nazaj-kompatibilno s starimi površinami).
// ============================================================================

/** Javni jeziki Go Mode površine (isti seznam kot routing.locales). */
export type GoLang = "sl" | "en" | "it" | "de" | "fr" | "es";

/** UI slovar: SL+EN obvezna, tuji prevodi opcijski (EN dedovanje). */
export type GoStrings = {
  sl: string;
  en: string;
  /** Faza 2 (1.170.0): IT prevod — brez njega se deduje EN. */
  it?: string;
  /** Faza 2 (1.170.0): DE prevod — brez njega se deduje EN. */
  de?: string;
  /** Faza 2 (1.170.0): FR prevod — brez njega se deduje EN. */
  fr?: string;
  /** Faza 2 (1.170.0): ES prevod — brez njega se deduje EN. */
  es?: string;
};

/** Funkcijska enota (šablona z interpolacijo) — isti dedni kanon. */
export type GoFn<A extends unknown[], R> = {
  sl: (...args: A) => R;
  en: (...args: A) => R;
  it?: (...args: A) => R;
  de?: (...args: A) => R;
  fr?: (...args: A) => R;
  es?: (...args: A) => R;
};

const GO_LANGS: readonly GoLang[] = ["sl", "en", "it", "de", "fr", "es"];

/**
 * Izberi niz Go Mode površine. Eksplicitni IT/DE/FR/ES prevodi zmagajo;
 * manjkajoč prevod deduje EN (tuji uporabnik NIKOLI ne dobi slovenščine,
 * če ni tako izrecno zapisano — P4-8); neznan podatek → SL.
 */
export function GL(lang: string, strings: GoStrings): string {
  if (lang === "sl") return strings.sl;
  if (lang === "en") return strings.en;
  if (lang === "it") return strings.it !== undefined ? strings.it : strings.en;
  if (lang === "de") return strings.de !== undefined ? strings.de : strings.en;
  if (lang === "fr") return strings.fr !== undefined ? strings.fr : strings.en;
  if (lang === "es") return strings.es !== undefined ? strings.es : strings.en;
  return strings.sl;
}

/**
 * Izberi FUNKCIJSKO enoto (šablono) v jeziku površine — isti dedni kanon
 * kot GL: SL/EN vedno, tuji prevod če obstaja, sicer EN, neznano → SL.
 */
export function GFn<A extends unknown[], R>(
  lang: string,
  fn: GoFn<A, R>
): (...args: A) => R {
  if (lang === "sl") return fn.sl;
  if (lang === "en") return fn.en;
  if (lang !== "it" && lang !== "de" && lang !== "fr" && lang !== "es") {
    return fn.sl;
  }
  const picked = fn[lang];
  return picked !== undefined ? picked : fn.en;
}

/** Locale aplikacije → jezik Go Mode (neznan → SL, izvirnik). */
export function goLangOf(locale: string): GoLang {
  return GO_LANGS.includes(locale as GoLang) ? (locale as GoLang) : "sl";
}

/**
 * Izračunaj funkcijsko enoto v VSEH jezikih hkrati (gradnja {sl,en,it,…}
 * objektov v projekcijskih knjižnicah — guardian/time-reserve/opening-hours
 * gradijo podrobnosti vseh šestih jezikov naenkrat, izris izbere po GL).
 * Manjkajoč tuji prevod → EN (isti dedni kanon).
 */
export function goAll<A extends unknown[]>(
  fn: GoFn<A, string>,
  ...args: A
): GoStrings {
  const out: GoStrings = { sl: fn.sl(...args), en: fn.en(...args) };
  for (const l of ["it", "de", "fr", "es"] as const) {
    const f = fn[l];
    if (f !== undefined) out[l] = f(...args);
    else out[l] = fn.en(...args);
  }
  return out;
}

/**
 * BCP-47 oznaka za lokalno oblikovanje ur/datumov (toLocaleTimeString /
 * toLocaleDateString) in TTS (SpeechSynthesisUtterance.lang — isto
 * preslikavo kot lib/voice.ts speechLanguageTag, a za GoLang tip).
 */
export function goLocaleTag(lang: GoLang): string {
  switch (lang) {
    case "en":
      return "en-GB";
    case "it":
      return "it-IT";
    case "de":
      return "de-DE";
    case "fr":
      return "fr-FR";
    case "es":
      return "es-ES";
    default:
      return "sl-SI";
  }
}
