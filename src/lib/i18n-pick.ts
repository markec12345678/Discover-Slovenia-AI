/**
 * W1 (Issue #15 V0, 1.126.0): droben 4-jezični izbirnik za komponente z
 * inline nizi (L-vzorec `locale === "en" ? … : …` generaliziran na 4 javne
 * jezike). Neznan/nejavni locale → "sl" (default, izvirnik — P4-8).
 * W12 (smer 2, faza 1 — 1.144.0): razširjen na 6 javnih jezikov (+fr, es).
 *
 * Za namige/mikrocopy v komponentah, kjer ni smiselno plesti next-intl
 * namespace-a; večje nize vedno nosijo messages/<locale>.json.
 */
export type UiLang = "sl" | "en" | "it" | "de" | "fr" | "es";

const UI_LANGS: readonly UiLang[] = ["sl", "en", "it", "de", "fr", "es"];

export function pick(locale: string, strings: Record<UiLang, string>): string {
  const l = UI_LANGS.includes(locale as UiLang) ? (locale as UiLang) : "sl";
  return strings[l] ?? strings.sl;
}
