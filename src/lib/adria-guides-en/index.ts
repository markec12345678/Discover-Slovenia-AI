// ADRIA-EN — agregacija ANGLEŠKIH različic jadranskih vodnikov.
// Zrcali strukturo slovenskega modula (src/lib/adria-guides/index.ts):
// isti slugi (hreflang pari SL ⇄ EN), iste številke/dati/avtorje/slike —
// prevedena je izključno vsebina (naslovi, odstavki, praktične kartice, FAQ).
//
// Struktura: 5 datotek po 2 vodnika (guides-1-2 … guides-9-10) namesto
// slovenskega part1/part1 splita (5+5) — boljša granularnost v gitu,
// enaka agregacija v fiksnem vrstnem redu ADRIA_SLUGS.

import { ADRIA_GUIDES_EN_1_2 } from "./guides-1-2";
import { ADRIA_GUIDES_EN_3_4 } from "./guides-3-4";
import { ADRIA_GUIDES_EN_5_6 } from "./guides-5-6";
import { ADRIA_GUIDES_EN_7_8 } from "./guides-7-8";
import { ADRIA_GUIDES_EN_9_10 } from "./guides-9-10";
import { ADRIA_SLUGS, type AdriaGuide, type AdriaSlug } from "../adria-guides/types";

export { ADRIA_SLUGS } from "../adria-guides/types";
export type { AdriaGuide, AdriaSlug } from "../adria-guides/types";

/** Vseh 10 angleških vodnikov v fiksnem vrstnem redu (ADRIA_SLUGS). */
export const ADRIA_GUIDES_EN: AdriaGuide[] = [
  ...ADRIA_GUIDES_EN_1_2,
  ...ADRIA_GUIDES_EN_3_4,
  ...ADRIA_GUIDES_EN_5_6,
  ...ADRIA_GUIDES_EN_7_8,
  ...ADRIA_GUIDES_EN_9_10,
];

/** EN vodnik po slugu (ali undefined). */
export function getAdriaGuideBySlugEn(slug: string): AdriaGuide | undefined {
  return ADRIA_GUIDES_EN.find((g) => g.slug === slug);
}

/** Angleška imena držav za prikaz (zastavice ostajajo v komponentah). */
export const COUNTRY_LABELS_EN: Record<string, string> = {
  SI: "Slovenia",
  HR: "Croatia",
  BA: "Bosnia and Herzegovina",
  ME: "Montenegro",
  AL: "Albania",
};
