/**
 * W1-faza-2b (Issue #15): skupni jezikovni helper za PLANNER pogon.
 *
 * Kanon (UX-WORKFLOW-BENCHMARK §4 V0 + faza 2a dedni kanon):
 * - SL = izvirnik, EN = referenčni par — ostajata vedno eksplicitna;
 * - IT/DE sta strojno/ročno dodana ključa v objektu {sl,en,it,de};
 * - W12-faza-2b: FR/ES po istem vzorcu (javna planner ploskva /fr+/es/nacrtuj);
 * - NEPREVEDEN it/de/fr/es ključ → EN dedovanje (isti kanon kot destinacijske
 *   strani v fazi 2a: "EN je imel mezo prej, IT/DE/FR/ES jo podedujejo"),
 *   NIKOLI SL fallback za tuje uporabnike (P4-8: ne mešaj);
 * - neznan jezik → SL (nazaj-kompatibilno s starejšimi shranjenimi načrti).
 *
 * Vzorec je enakovreden chat-domain-fallback L() (klepet) in i18n-pick
 * pick() (komponente) — poenotenje v lib plasti, kjer next-intl slovarjev
 * ni smiselno plesti (deterministični pogon vrača STRUKTURO + nize).
 */
export type PlannerLang = "sl" | "en" | "it" | "de" | "fr" | "es";

export type PlannerStrings = {
  sl: string;
  en: string;
  /** W1-faza-2b: opcijska IT različica — brez nje se deduje EN. */
  it?: string;
  /** W1-faza-2b: opcijska DE različica — brez nje se deduje EN. */
  de?: string;
  /** W12-faza-2b: opcijska FR različica — brez nje se deduje EN. */
  fr?: string;
  /** W12-faza-2b: opcijska ES različica — brez nje se deduje EN. */
  es?: string;
};

/**
 * Izberi niz v jeziku pogona. Eksplicitni IT/DE/FR/ES prevodi zmagajo; mankajoč
 * prevod deduje EN (prehodno obdobje 2b — tuji uporabnik NIKOLI ne dobi
 * slovenščine); neznan podatek → SL.
 */
export function PL(lang: string | undefined | null, strings: PlannerStrings): string {
  if (lang === "en") return strings.en;
  if (lang === "it") return strings.it !== undefined ? strings.it : strings.en;
  if (lang === "de") return strings.de !== undefined ? strings.de : strings.en;
  if (lang === "fr") return strings.fr !== undefined ? strings.fr : strings.en;
  if (lang === "es") return strings.es !== undefined ? strings.es : strings.en;
  return strings.sl;
}

/** Alias z eksplicitnejšim imenom za datoteke, kjer "L" že obstaja. */
export const plannerPick = PL;
