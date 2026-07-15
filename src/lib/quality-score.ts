import { db } from "@/lib/db";
import type { Listing } from "@prisma/client";
import { calculateProfileCompletion } from "@/lib/profile-completion";

// ============================================================================
// PARTNER QUALITY SCORE (0-100)
// ============================================================================
//
// Sestavljen iz 7 signalov:
// 1. Popolnost profila (30%)
// 2. Število in kakovost fotografij (15%)
// 3. Kakovost opisa (15%)
// 4. AI tagi / specialitete (10%)
// 5. Admin verifikacija (10%)
// 6. Rating uporabnikov (10%)
// 7. Svežina podatkov (10%)
//
// Premium paket ne pomeni visokega Quality Score.
// Quality Score se izračuna neodvisno od plačila.
// ============================================================================

export interface QualityScoreBreakdown {
  total: number;
  signals: {
    profileCompletion: number;   // 0-30
    imageQuality: number;        // 0-15
    descriptionQuality: number;  // 0-15
    aiTags: number;              // 0-10
    adminVerification: number;   // 0-10
    rating: number;              // 0-10
    dataFreshness: number;       // 0-10
  };
  details: {
    completionPercentage: number;
    imageCount: number;
    descriptionLength: number;
    longDescriptionLength: number;
    tagCount: number;
    isVerified: boolean;
    ratingValue: number;
    daysSinceUpdate: number;
  };
}

/**
 * Izračuna Partner Quality Score za lokal.
 *
 * @param listing - Listing iz baze (vsa polja)
 * @returns QualityScoreBreakdown s skupnim score (0-100) in razčlenitvijo
 */
export function calculateQualityScore(listing: Partial<Listing>): QualityScoreBreakdown {
  // === 1. PROFILE COMPLETION (0-30) ===
  const completion = calculateProfileCompletion(listing);
  const profileCompletion = Math.round((completion.percentage / 100) * 30);

  // === 2. IMAGE QUALITY (0-15) ===
  let imageCount = 0;
  try {
    imageCount = (JSON.parse(listing.images || "[]") as string[]).length;
  } catch {
    imageCount = 0;
  }
  // 0 slike = 0, 1 = 5, 2 = 8, 3+ = 12, 5+ = 15
  let imageQuality = 0;
  if (imageCount >= 5) imageQuality = 15;
  else if (imageCount >= 3) imageQuality = 12;
  else if (imageCount >= 2) imageQuality = 8;
  else if (imageCount >= 1) imageQuality = 5;

  // === 3. DESCRIPTION QUALITY (0-15) ===
  const descLength = listing.description?.length || 0;
  const longDescLength = listing.longDescription?.length || 0;
  let descriptionQuality = 0;

  // Kratek opis: vsaj 50 znakov = 5, 100+ = 8
  if (descLength >= 100) descriptionQuality += 8;
  else if (descLength >= 50) descriptionQuality += 5;

  // Dolgi opis: vsaj 200 znakov = 4, 500+ = 7
  if (longDescLength >= 500) descriptionQuality += 7;
  else if (longDescLength >= 200) descriptionQuality += 4;

  // === 4. AI TAGS / SPECIALITIES (0-10) ===
  let tagCount = 0;
  try {
    tagCount = (JSON.parse(listing.specialties || "[]") as string[]).length;
  } catch {
    tagCount = 0;
  }
  // 0 tagov = 0, 1-2 = 3, 3-5 = 6, 6+ = 10
  let aiTags = 0;
  if (tagCount >= 6) aiTags = 10;
  else if (tagCount >= 3) aiTags = 6;
  else if (tagCount >= 1) aiTags = 3;

  // === 5. ADMIN VERIFICATION (0-10) ===
  const isVerified = listing.verifiedByAdmin === true;
  const adminVerification = isVerified ? 10 : 0;

  // === 6. RATING (0-10) ===
  const ratingValue = listing.rating || 0;
  // Rating 5.0 = 10, 4.5 = 9, 4.0 = 8, 3.5 = 7, 3.0 = 6, <3 = 0
  let rating = 0;
  if (ratingValue >= 5.0) rating = 10;
  else if (ratingValue >= 4.5) rating = 9;
  else if (ratingValue >= 4.0) rating = 8;
  else if (ratingValue >= 3.5) rating = 7;
  else if (ratingValue >= 3.0) rating = 6;
  else if (ratingValue > 0) rating = 3;

  // === 7. DATA FRESHNESS (0-10) ===
  const updatedAt = listing.updatedAt;
  const daysSinceUpdate = updatedAt
    ? Math.floor((Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24))
    : 999;
  let dataFreshness = 0;
  if (daysSinceUpdate <= 7) dataFreshness = 10;
  else if (daysSinceUpdate <= 30) dataFreshness = 8;
  else if (daysSinceUpdate <= 90) dataFreshness = 5;
  else if (daysSinceUpdate <= 180) dataFreshness = 3;
  // > 180 dni = 0

  // === SKUPNI SCORE ===
  const total = Math.min(
    profileCompletion +
      imageQuality +
      descriptionQuality +
      aiTags +
      adminVerification +
      rating +
      dataFreshness,
    100
  );

  return {
    total,
    signals: {
      profileCompletion,
      imageQuality,
      descriptionQuality,
      aiTags,
      adminVerification,
      rating,
      dataFreshness,
    },
    details: {
      completionPercentage: completion.percentage,
      imageCount,
      descriptionLength: descLength,
      longDescriptionLength: longDescLength,
      tagCount,
      isVerified,
      ratingValue,
      daysSinceUpdate,
    },
  };
}

// ============================================================================
// FEATURED AUTO-QUALIFICATION
// ============================================================================

import { getFeaturedRequirements, canGetPremiumBoost } from "@/lib/ranking-config";

/**
 * Preveri ali lokal izpolnjuje pogoje za Featured status.
 *
 * Pogoji (konfigurabilni):
 * - plan = premium ali enterprise
 * - qualityScore > minQualityScore (default 90)
 * - verifiedByAdmin = true
 *
 * Če kateri pogoj odpade → izgubi Featured.
 */
export function qualifiesForFeatured(
  listing: Partial<Listing>,
  qualityScore: number
): boolean {
  const req = getFeaturedRequirements();

  // Plan check
  if (req.minPlan === "premium" && listing.plan !== "premium" && listing.plan !== "enterprise") {
    return false;
  }
  if (req.minPlan === "enterprise" && listing.plan !== "enterprise") {
    return false;
  }

  // Quality check
  if (qualityScore < req.minQualityScore) {
    return false;
  }

  // Verification check
  if (req.requireAdminVerification && !listing.verifiedByAdmin) {
    return false;
  }

  return true;
}

/**
 * Posodobi partnerStatus glede na Quality Score in pogoje.
 * Za cron job ali ob approve.
 */
export async function recalculatePartnerStatus(listingId: string): Promise<{
  oldStatus: string;
  newStatus: string;
  qualityScore: number;
  changed: boolean;
}> {
  const listing = await db.listing.findUnique({ where: { id: listingId } });
  if (!listing) throw new Error("Listing not found");

  const qualityScore = calculateQualityScore(listing).total;
  const oldStatus = listing.partnerStatus;

  let newStatus = listing.partnerStatus;

  // Featured: samo če izpolnjuje pogoje
  if (qualifiesForFeatured(listing, qualityScore)) {
    newStatus = "featured";
  } else if (listing.plan === "premium" || listing.plan === "enterprise") {
    // Premium: če je plačnik (ne nujno featured)
    newStatus = "premium";
  } else if (listing.verifiedByAdmin) {
    // Verified: admin verificiran
    newStatus = "verified";
  } else {
    newStatus = "standard";
  }

  // Posodobi če se je spremenilo
  const changed = oldStatus !== newStatus;
  if (changed) {
    await db.listing.update({
      where: { id: listingId },
      data: { partnerStatus: newStatus },
    });
    console.log(`[quality-score] ${listing.name}: ${oldStatus} → ${newStatus} (Q=${qualityScore})`);
  }

  return { oldStatus, newStatus, qualityScore, changed };
}
