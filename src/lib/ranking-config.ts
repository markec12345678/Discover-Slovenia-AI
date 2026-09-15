/**
 * Ranking Configuration — konfigurabilne uteži za AI ranking engine.
 *
 * Uteži se seštejejo v 100. Lahko se spreminja brez kode.
 * Za production: lahko se premakne v database ali env variable.
 *
 * Spremembe uteži so dokumentirane v ADR-007.
 */

export interface RankingWeights {
  /** Ujemanje z uporabnikovim queryjem (destinacija, interesi, kategorija) */
  relevance: number;
  /** Partner Quality Score (0-100) — kakovost profila */
  quality: number;
  /** Rating uporabnikov (0-5 zvezdic) */
  rating: number;
  /** Geografska bližina drugim lokacijam v itinererju */
  distance: number;
  /** Premium/Enterprise/Sponsored boost (max 5%) */
  premium: number;
}

export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  relevance: 60,
  quality: 15,
  rating: 10,
  distance: 10,
  premium: 5,
};

/**
 * Pridobi trenutne uteži (iz env ali default).
 * Production: lahko se override-a z env variables.
 */
export function getRankingWeights(): RankingWeights {
  const envWeights = process.env.RANKING_WEIGHTS;
  if (envWeights) {
    try {
      const parsed = JSON.parse(envWeights);
      return { ...DEFAULT_RANKING_WEIGHTS, ...parsed };
    } catch {
      console.warn("[ranking-config] Invalid RANKING_WEIGHTS env, using defaults");
    }
  }
  return DEFAULT_RANKING_WEIGHTS;
}

// ============================================================================
// FEATURED QUALIFICATION — pogoji za Featured status
// ============================================================================

export interface FeaturedRequirements {
  /** Mora biti Premium ali Enterprise */
  minPlan: "premium" | "enterprise";
  /** Quality Score mora biti nad tem pragom */
  minQualityScore: number;
  /** Mora biti admin verificiran */
  requireAdminVerification: boolean;
}

export const DEFAULT_FEATURED_REQUIREMENTS: FeaturedRequirements = {
  minPlan: "premium",
  minQualityScore: 90,
  requireAdminVerification: true,
};

export function getFeaturedRequirements(): FeaturedRequirements {
  const env = process.env.FEATURED_REQUIREMENTS;
  if (env) {
    try {
      const parsed = JSON.parse(env);
      return { ...DEFAULT_FEATURED_REQUIREMENTS, ...parsed };
    } catch {
      console.warn("[ranking-config] Invalid FEATURED_REQUIREMENTS env, using defaults");
    }
  }
  return DEFAULT_FEATURED_REQUIREMENTS;
}

// ============================================================================
// PREMIUM BOOST — max boost za plačane partnerje
// ============================================================================

export const MAX_PREMIUM_BOOST = 0.05; // 5% max (ne more preseči)
export const MIN_RATING_FOR_BOOST = 3.5; // Slabi lokalci ne morejo dobiti boost-a

/**
 * Preveri ali lokal sploh lahko dobi premium boost.
 * Rule 1: AI nikoli ne priporoča slabega lokalca samo ker plača.
 */
export function canGetPremiumBoost(rating: number): boolean {
  return rating >= MIN_RATING_FOR_BOOST;
}
