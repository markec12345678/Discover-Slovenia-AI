// ADRIA-1 — agregacija jadranskih (cross-border) vodnikov.
// Fizično so podatki razdeljeni v part1/part2 (velike content datoteke),
// logično pa so en sam kanon: ADRIA_GUIDES v fiksnem vrstnem redu.

import { ADRIA_GUIDES_PART1 } from "./part1";
import { ADRIA_GUIDES_PART2 } from "./part2";
import { ADRIA_SLUGS, type AdriaGuide, type AdriaSlug } from "./types";

export { ADRIA_SLUGS } from "./types";
export type { AdriaGuide, AdriaSlug } from "./types";

/** Vseh 10 jadranskih vodnikov v fiksnem vrstnem redu (ADRIA_SLUGS). */
export const ADRIA_GUIDES: AdriaGuide[] = [...ADRIA_GUIDES_PART1, ...ADRIA_GUIDES_PART2];

/** Vrne vodnik po slugu (ali undefined). */
export function getAdriaGuideBySlug(slug: string): AdriaGuide | undefined {
  return ADRIA_GUIDES.find((g) => g.slug === slug);
}

/** Sorodni jadranski vodniki po relatedSlugs (v vrstnem redu definicije). */
export function getRelatedAdriaGuides(guide: AdriaGuide): AdriaGuide[] {
  return guide.relatedSlugs
    .map((s) => getAdriaGuideBySlug(s))
    .filter((g): g is AdriaGuide => Boolean(g));
}

/** Kratko ime države za prikaz (zastavice so v komponentah). */
export const COUNTRY_LABELS: Record<string, string> = {
  SI: "Slovenija",
  HR: "Hrvaška",
  BA: "Bosna in Hercegovina",
  ME: "Črna gora",
  AL: "Albanija",
};
