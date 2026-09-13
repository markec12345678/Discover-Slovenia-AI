// ADRIA-EN + SLO-LOOP-EN — agregacija ANGLEŠKIH različic vodnikov
// (10 jadranskih + 4 domači krožni po Sloveniji).
// Zrcali strukturo slovenskega modula (src/lib/adria-guides/index.ts):
// isti slugi (hreflang pari SL ⇄ EN), iste številke/dati/avtorje/slike —
// prevedena je izključno vsebina (naslovi, odstavki, praktične kartice, FAQ).
//
// Struktura: 5 datotek po 2 jadranska vodnika (guides-1-2 … guides-9-10)
// + 4 datoteke po 1 domačem krožnem vodniku (slovenija-*) — enaka
// agregacija v fiksnem vrstnem redu ADRIA_SLUGS (14).

import { ADRIA_GUIDES_EN_1_2 } from "./guides-1-2";
import { ADRIA_GUIDES_EN_3_4 } from "./guides-3-4";
import { ADRIA_GUIDES_EN_5_6 } from "./guides-5-6";
import { ADRIA_GUIDES_EN_7_8 } from "./guides-7-8";
import { ADRIA_GUIDES_EN_9_10 } from "./guides-9-10";
import { ADRIA_GUIDES_EN_SLOOP_V7 } from "./slovenija-v-7-dneh";
import { ADRIA_GUIDES_EN_SLOOP_V10 } from "./slovenija-v-10-dneh";
import { ADRIA_GUIDES_EN_SLOOP_VIKEND } from "./slovenija-vikend";
import { ADRIA_GUIDES_EN_SLOOP_OTROCI } from "./slovenija-z-otroki";
import { ADRIA_SLUGS, type AdriaGuide, type AdriaSlug } from "../adria-guides/types";

export { ADRIA_SLUGS } from "../adria-guides/types";
export type { AdriaGuide, AdriaSlug } from "../adria-guides/types";

/** Domači krožni vodniki (SLO-LOOP-1, EN) v fiksnem vrstnem redu. */
export const SLOVENIA_LOOP_GUIDES_EN: AdriaGuide[] = [
  ...ADRIA_GUIDES_EN_SLOOP_V7,
  ...ADRIA_GUIDES_EN_SLOOP_V10,
  ...ADRIA_GUIDES_EN_SLOOP_VIKEND,
  ...ADRIA_GUIDES_EN_SLOOP_OTROCI,
];

/** Vseh 14 angleških vodnikov v fiksnem vrstnem redu (ADRIA_SLUGS). */
export const ADRIA_GUIDES_EN: AdriaGuide[] = [
  ...ADRIA_GUIDES_EN_1_2,
  ...ADRIA_GUIDES_EN_3_4,
  ...ADRIA_GUIDES_EN_5_6,
  ...ADRIA_GUIDES_EN_7_8,
  ...ADRIA_GUIDES_EN_9_10,
  ...SLOVENIA_LOOP_GUIDES_EN,
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
