// ADRIA-1 + SLO-LOOP-1 — agregacija vodnikov: 10 jadranskih (cross-border)
// + 4 domači krožni vodniki po Sloveniji. Fizično so podatki razdeljeni v
// part1/part2 (jadran) in slovenija-* (domači krog), logično pa so en sam
// kanon: ADRIA_GUIDES v fiksnem vrstnem redu (ADRIA_SLUGS).

import { ADRIA_GUIDES_PART1 } from "./part1";
import { ADRIA_GUIDES_PART2 } from "./part2";
import { ADRIA_GUIDES_SLOOP_V7 } from "./slovenija-v-7-dneh";
import { ADRIA_GUIDES_SLOOP_V10 } from "./slovenija-v-10-dneh";
import { ADRIA_GUIDES_SLOOP_VIKEND } from "./slovenija-vikend";
import { ADRIA_GUIDES_SLOOP_OTROCI } from "./slovenija-z-otroki";
import { ADRIA_SLUGS, type AdriaGuide, type AdriaSlug } from "./types";

export { ADRIA_SLUGS } from "./types";
export type { AdriaGuide, AdriaSlug } from "./types";

/** Domači krožni vodniki (SLO-LOOP-1) v fiksnem vrstnem redu. */
export const SLOVENIA_LOOP_GUIDES: AdriaGuide[] = [
  ...ADRIA_GUIDES_SLOOP_V7,
  ...ADRIA_GUIDES_SLOOP_V10,
  ...ADRIA_GUIDES_SLOOP_VIKEND,
  ...ADRIA_GUIDES_SLOOP_OTROCI,
];

/** Vseh 14 vodnikov v fiksnem vrstnem redu (ADRIA_SLUGS): 10 jadranskih + 4 domači. */
export const ADRIA_GUIDES: AdriaGuide[] = [
  ...ADRIA_GUIDES_PART1,
  ...ADRIA_GUIDES_PART2,
  ...SLOVENIA_LOOP_GUIDES,
];

/** Vrne vodnik po slugu (ali undefined). */
export function getAdriaGuideBySlug(slug: string): AdriaGuide | undefined {
  return ADRIA_GUIDES.find((g) => g.slug === slug);
}

/** Ali je vodnik domači krog (SLO-LOOP-1; countries = ["SI"]). */
export function isSloveniaLoop(guide: AdriaGuide): boolean {
  return guide.countries.length === 1 && guide.countries[0] === "SI";
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
