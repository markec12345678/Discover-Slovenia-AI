// ============================================================================
// UI PRIMITIVI — sr-only dostopnostni nizi ×6 jezikov (POLISH 1.174.0).
// ============================================================================
// Zakaj: QA obhod žive aplikacije (3. 10. 2026, Render 1.173.4) je odkril,
// da so osnovni UI primitivi vsebovali HARDCODED angleške sr-only nize:
//   • dialog.tsx  „Close"           (~25 dialog komponent — vsaka stran)
//   • sheet.tsx   „Close"           (mobilni meni „Več" — vsak mobilni user)
//   • carousel    „Previous/Next slide"
//   • sidebar     „Toggle Sidebar"
//   • breadcrumb/pagination  „More"/„More pages"
// Bralnik zaslonov na SL/IT/DE/FR/ES strani je slišal angleščino — ista
// vrsta jezikovne nekonzistence kot nav.languageAria (popravljena v
// 1.173.0: „naslovnina je bila VEDNO slovenska").
//
// Kanon: VSAK sr-only niz UI primitiva gre prek tega slovarja — v mapi
// src/components/ui NE SME biti hardcoded uporabniških nizov (trajna
// varovalka: polish-1-174-0-round.test.ts).
//
// Lokali (skupina Lang) so usklajeni z routing.locales (sl, en, it, de,
// fr, es); neznan locale deduje SL (default — isti kanon kot
// pickWishlistLang in ostale L-vzorcne komponente).
// ============================================================================

/** Javni jeziki aplikacije (usklajeno z src/i18n/routing.ts locales). */
const UI_A11Y_LANGS = ["sl", "en", "it", "de", "fr", "es"] as const;

type UiA11yLang = (typeof UI_A11Y_LANGS)[number];

/**
 * Slovar sr-only nizov UI primitivov — vsak jezik govori svoj jezik.
 * Ključi so stabilna imena (ne prevodi): close, previousSlide, …
 */
export const UI_A11Y = {
  /** dialog/sheet: sr-only oznaka X gumba (privzeti zapiralki). */
  close: {
    sl: "Zapri",
    en: "Close",
    it: "Chiudi",
    de: "Schließen",
    fr: "Fermer",
    es: "Cerrar",
  },
  /** carousel: puščica levo. */
  previousSlide: {
    sl: "Prejšnji diapozitiv",
    en: "Previous slide",
    it: "Diapositiva precedente",
    de: "Vorherige Folie",
    fr: "Diapositive précédente",
    es: "Diapositiva anterior",
  },
  /** carousel: puščica desno. */
  nextSlide: {
    sl: "Naslednji diapozitiv",
    en: "Next slide",
    it: "Diapositiva successiva",
    de: "Nächste Folie",
    fr: "Diapositive suivante",
    es: "Diapositiva siguiente",
  },
  /** breadcrumb: elipsa (…). */
  more: {
    sl: "Več",
    en: "More",
    it: "Altro",
    de: "Mehr",
    fr: "Plus",
    es: "Más",
  },
  /** pagination: elipsa (…) med številkami strani. */
  morePages: {
    sl: "Več strani",
    en: "More pages",
    it: "Più pagine",
    de: "Weitere Seiten",
    fr: "Plus de pages",
    es: "Más páginas",
  },
  /** sidebar: gumb za prikaz/skritje stranske vrstice. */
  toggleSidebar: {
    sl: "Preklopi stransko vrstico",
    en: "Toggle Sidebar",
    it: "Attiva/disattiva barra laterale",
    de: "Seitenleiste umschalten",
    fr: "Basculer la barre latérale",
    es: "Alternar barra lateral",
  },
  /** pagination: aria gumba »prejšnja stran«. */
  previousPage: {
    sl: "Prejšnja stran",
    en: "Go to previous page",
    it: "Vai alla pagina precedente",
    de: "Zur vorherigen Seite",
    fr: "Aller à la page précédente",
    es: "Ir a la página anterior",
  },
  /** pagination: aria gumba »naslednja stran«. */
  nextPage: {
    sl: "Naslednja stran",
    en: "Go to next page",
    it: "Vai alla pagina successiva",
    de: "Zur nächsten Seite",
    fr: "Aller à la page suivante",
    es: "Ir a la página siguiente",
  },
  /** pagination: vidno besedilo gumba »prejšnja« (sm+). */
  previous: {
    sl: "Nazaj",
    en: "Previous",
    it: "Precedente",
    de: "Zurück",
    fr: "Précédent",
    es: "Anterior",
  },
  /** pagination: vidno besedilo gumba »naslednja« (sm+). */
  next: {
    sl: "Naprej",
    en: "Next",
    it: "Successiva",
    de: "Weiter",
    fr: "Suivant",
    es: "Siguiente",
  },
} as const satisfies Record<string, Record<UiA11yLang, string>>;

export type UiA11yKey = keyof typeof UI_A11Y;

/**
 * Resolve sr-only niza za trenutni locale; neznan locale → SL (default).
 * Uporaba v primitivu: `uiA11yText("close", useLocale())`.
 */
export function uiA11yText(
  key: UiA11yKey,
  locale: string | undefined
): string {
  const lang: UiA11yLang = UI_A11Y_LANGS.includes(locale as UiA11yLang)
    ? (locale as UiA11yLang)
    : "sl";
  return UI_A11Y[key][lang];
}
