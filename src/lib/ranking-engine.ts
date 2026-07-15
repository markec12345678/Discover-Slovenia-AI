import { db } from "@/lib/db";
import type { Listing } from "@prisma/client";
import { getRankingWeights, canGetPremiumBoost, MAX_PREMIUM_BOOST } from "@/lib/ranking-config";
import { calculateQualityScore } from "@/lib/quality-score";

// ============================================================================
// RANKING ENGINE
// ============================================================================
//
// Dvostopenjski proces:
// 1. FILTER — trdi kriteriji (status, kategorija, destinacija)
// 2. RANK — izračun score (relevance, quality, rating, distance, premium)
//
// Transparency: za vsak rezultat se zabeleži razlog priporočila.
// ============================================================================

export interface RankingContext {
  destinationId?: string;
  category?: string;
  interests?: string[];
  budget?: number;
  season?: string;
  groupSize?: number;
}

export interface RankedListing {
  listing: Listing;
  totalScore: number;
  scores: {
    relevance: number;   // 0-1
    quality: number;     // 0-1
    rating: number;      // 0-1
    distance: number;    // 0-1
    premium: number;     // 0-1
  };
  qualityScore: number;  // 0-100
  partnerStatus: string;
  recommendationType: "organic" | "sponsored" | "featured";
  transparency: string[]; // razlogi priporočila
}

// ============================================================================
// 1. FILTER — trdi kriteriji
// ============================================================================

/**
 * Filtrira lokale ki sploh lahko sodelujejo v ranking.
 *
 * Pravila:
 * - status = published (samo objavljeni)
 * - partner ni potekel (sponsoredUntil > now ali ni sponsored)
 * - ni arhiviran/izbrisan
 */
export async function filterCandidates(
  context: RankingContext
): Promise<Listing[]> {
  const where: Record<string, unknown> = {
    status: "published",
  };

  // Kategorija filter
  if (context.category) {
    where.category = context.category;
  }

  // Destinacija filter (ne trda omejitev — AI lahko priporoča tudi bližnje)
  // Tudi če iščejo Bled, lahko dobijo Vintgar (v bližini)

  const listings = await db.listing.findMany({
    where,
    orderBy: [{ featured: "desc" }, { rating: "desc" }],
    take: 50, // max 50 kandidatov za ranking
  });

  return listings;
}

// ============================================================================
// 2. SCORE — izračun za posameznega kandidata
// ============================================================================

/**
 * Izračuna relevance score (0-1) glede na kontekst iskanja.
 */
function calculateRelevance(listing: Listing, context: RankingContext): number {
  let score = 0;
  let maxScore = 0;

  // Destinacija (40% relevance)
  maxScore += 40;
  if (context.destinationId && listing.destinationId === context.destinationId) {
    score += 40;
  } else if (context.destinationId && listing.destinationId) {
    // Bližnje destinacije (enostavna hevristika)
    score += 15;
  } else {
    score += 10; // brez destinacijskega filtra = vsi enako
  }

  // Kategorija (30% relevance)
  maxScore += 30;
  if (context.category && listing.category === context.category) {
    score += 30;
  } else {
    score += 10;
  }

  // Interesi (30% relevance)
  maxScore += 30;
  if (context.interests && context.interests.length > 0) {
    const desc = (
      listing.description +
      " " +
      (listing.longDescription || "") +
      " " +
      (listing.specialties || "")
    ).toLowerCase();

    const matches = context.interests.filter((i) =>
      desc.includes(i.toLowerCase())
    ).length;

    score += Math.min(matches * 10, 30);
  } else {
    score += 15;
  }

  return Math.min(score / maxScore, 1);
}

/**
 * Izračuna distance score (0-1) glede na destinacijsko bližino.
 * TODO: implementirati z dejanskimi koordinatami (lat/lng).
 */
function calculateDistance(listing: Listing, context: RankingContext): number {
  if (!context.destinationId) return 0.5; // nevtralno

  if (listing.destinationId === context.destinationId) {
    return 1.0; // ista destinacija
  }

  // Bližnje destinacije (heuristika — lahko razširi z dejanskimi razdaljami)
  const nearbyMap: Record<string, string[]> = {
    bled: ["vintgar", "bohinj", "radovljica"],
    bohinj: ["bled", "vintgar", "triglav"],
    ljubljana: ["vintgar", "bled"],
    piran: ["portoroz"],
    soca: ["kobarid", "bovec"],
  };

  const nearby = nearbyMap[context.destinationId] || [];
  if (nearby.includes(listing.destinationId || "")) {
    return 0.8;
  }

  return 0.3; // druga regija
}

/**
 * Izračuna premium boost (0-1) glede na plan in sponzorstvo.
 * Max boost = MAX_PREMIUM_BOOST (5%).
 * Rule 1: Slabi lokalci (rating < 3.5) ne dobijo boost-a.
 */
function calculatePremiumBoost(listing: Listing): number {
  if (!canGetPremiumBoost(listing.rating)) return 0;

  // Sponsored = najvišji boost
  if (listing.sponsored && listing.sponsoredUntil && listing.sponsoredUntil > new Date()) {
    return MAX_PREMIUM_BOOST;
  }

  // Premium/Enterprise plan
  if (listing.plan === "premium" || listing.plan === "enterprise") {
    return MAX_PREMIUM_BOOST;
  }

  return 0;
}

// ============================================================================
// 3. RANK — score + sort
// ============================================================================

/**
 * Oceni in razvrsti vse kandidate.
 *
 * Process:
 * 1. Filter (trdi kriteriji)
 * 2. Score (vsak dobi 0-1 score po 5 dimenzijah)
 * 3. Weighted sum (glede na konfigurabilne uteži)
 * 4. Sort (descending)
 * 5. Transparency labels
 */
export async function rankListings(
  context: RankingContext,
  customCandidates?: Listing[]
): Promise<RankedListing[]> {
  const weights = getRankingWeights();

  // 1. Filter
  const candidates = customCandidates || (await filterCandidates(context));

  if (candidates.length === 0) {
    return [];
  }

  // 2. Score vsakega kandidata
  const scored: RankedListing[] = candidates.map((listing) => {
    const relevanceScore = calculateRelevance(listing, context);
    const qualityBreakdown = calculateQualityScore(listing);
    const qualityNormalized = qualityBreakdown.total / 100; // 0-1
    const ratingScore = listing.rating / 5; // 0-1
    const distanceScore = calculateDistance(listing, context);
    const premiumScore = calculatePremiumBoost(listing);

    // Weighted sum
    const totalScore =
      relevanceScore * (weights.relevance / 100) +
      qualityNormalized * (weights.quality / 100) +
      ratingScore * (weights.rating / 100) +
      distanceScore * (weights.distance / 100) +
      premiumScore * (weights.premium / 100);

    // Recommendation type
    let recommendationType: "organic" | "sponsored" | "featured" = "organic";
    if (listing.sponsored && listing.sponsoredUntil && listing.sponsoredUntil > new Date()) {
      recommendationType = "sponsored";
    } else if (listing.partnerStatus === "featured") {
      recommendationType = "featured";
    }

    // Transparency labels
    const transparency: string[] = [];
    if (relevanceScore > 0.7) transparency.push("✓ Zelo ustreza iskanju");
    if (listing.verifiedByAdmin) transparency.push("✓ Preverjen partner");
    if (qualityBreakdown.total > 80) transparency.push("✓ Kakovosten profil");
    if (listing.plan === "premium" || listing.plan === "enterprise")
      transparency.push("✓ Premium partner");
    if (listing.sponsored) transparency.push("⭐ Sponzorirano");
    if (listing.rating >= 4.5) transparency.push("✓ Odlične ocene");
    if (transparency.length === 0) transparency.push("✓ Ustreza iskanju");

    return {
      listing,
      totalScore,
      scores: {
        relevance: relevanceScore,
        quality: qualityNormalized,
        rating: ratingScore,
        distance: distanceScore,
        premium: premiumScore,
      },
      qualityScore: qualityBreakdown.total,
      partnerStatus: listing.partnerStatus,
      recommendationType,
      transparency,
    };
  });

  // 3. Sort by total score (descending)
  scored.sort((a, b) => b.totalScore - a.totalScore);

  return scored;
}

// ============================================================================
// 4. TRANSPARENCY — razlogi priporočila
// ============================================================================

/**
 * Generira berljiv opis zakaj je bil lokal priporočen.
 * Za AI prompt in admin debugging.
 */
export function formatTransparency(ranked: RankedListing): string {
  const reasons = ranked.transparency.join(", ");
  const score = (ranked.totalScore * 100).toFixed(1);

  return `${ranked.listing.name} (score: ${score}, Q:${ranked.qualityScore}) — ${reasons}`;
}

/**
 * Generira transparency podatke za AI prompt.
 * AI dobi kontekst zakaj so določeni lokalci priporočeni.
 */
export function buildTransparencyContext(ranked: RankedListing[], maxItems = 10): string {
  if (ranked.length === 0) return "";

  const lines = ranked.slice(0, maxItems).map((r) => {
    const type =
      r.recommendationType === "sponsored"
        ? " [SPONZORIRANO]"
        : r.recommendationType === "featured"
        ? " [FEATURED]"
        : "";

    return `- ${r.listing.name}${type} — Q:${r.qualityScore}/100, R:${r.listing.rating}/5${r.listing.destinationName ? `, ${r.listing.destinationName}` : ""}`;
  });

  return "\n\nPREDLAGANI PARTNERJI (razvrščeni po ustreznosti in kakovosti):\n" + lines.join("\n");
}
