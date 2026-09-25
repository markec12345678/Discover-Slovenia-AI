/**
 * search-result-nav.ts — čista preslikava SmartSearch rezultatov → href.
 *
 * ISSUE #5 T5-B / H1 (fix wave 1): SmartSearch rezultati so bili MRTVI
 * KLIKI — `navigation.tsx` ni podal `onSelectDestination`, listings/
 * izdelki/doživetja pa so imeli onClick = samo `handleClose()` (nobena
 * navigacija). Ta modul je ENA točka resnice za preslikavo vrste
 * rezultata v ciljno pot, tako da jo lahko komponenta in klicalci delita
 * (in jo unit-testiramo brez Reacta).
 *
 * Preslikava (sledi konvencijam spletišča):
 *   - destination → /destinacija/[slug] — hub stran sprejme id ALI slug
 *     (`getDestinationById(slug) || find(d => d.slug === slug)`); 4 od 38
 *     destinacij ima id ≠ slug (npr. postojna → postojnska-jama), zato je
 *     slug PREDNOSTEN, id pa veljavna rezerva (stran ga razreši prek
 *     id-lookupa najprej).
 *   - listing   → /lokali — imenik lokalov odpre modal iz klientnega
 *     stanja (brez globoke povezave), zato je smiselna pot stran imenika.
 *   - product   → /trznica — tržnica (privzeti zavihek izdelkov).
 *   - experience → /dozivetja — stran doživetij (tržnica pod njo ima
 *     pripet zavihek izkušenj, `defaultTab="experiences"`).
 *
 * Modul je namenoma BREZ odvisnosti (0 uvozov) — uporabljajo ga klientne
 * komponente (navigation/smart-search) in regresijski testi.
 */

/** Vrste rezultatov, ki jih vrne /api/smart-search. */
export type SmartSearchResultKind =
  | "destination"
  | "listing"
  | "product"
  | "experience";

/** Sklic na en rezultat iskanja (id + vrsta; slug samo za destinacije). */
export interface SmartSearchResultRef {
  kind: SmartSearchResultKind;
  /** ID zapisa iz odgovora iskanja (destinacija: id iz slovenia-data). */
  id: string;
  /** Slug destinacije (kanonski segment /destinacija/[slug]); null/undef
   *  pomeni "uporabi id" (veljaven tudi — stran najprej išče po id). */
  slug?: string | null;
}

/** Kanonska pot hub strani destinacije (id ali slug — obe razreši SSG hub). */
export function destinationHref(idOrSlug: string): string {
  return `/destinacija/${encodeURIComponent(idOrSlug)}`;
}

/**
 * Href za klik na rezultat iskanja; `null` = neznan tip (klical naj ne
 * navigira — defenzivna rezerva za prihodnje vrste rezultatov).
 */
export function searchResultHref(ref: SmartSearchResultRef): string | null {
  switch (ref.kind) {
    case "destination":
      return destinationHref(ref.slug ?? ref.id);
    case "listing":
      return "/lokali";
    case "product":
      return "/trznica";
    case "experience":
      return "/dozivetja";
    default:
      return null;
  }
}
