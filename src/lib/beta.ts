import { db } from "@/lib/db";

// === BETA MODEL ===
// Platforma je BREZPLAČNA za vse lokale dokler ne dosežemo kritične mase.
// Ko presežemo BETA_THRESHOLD aktivnih lokalov, se monetizacija samodejno vklopi.
// To rešuje "cold start problem" — noben lokal ne plača za prazno platformo.

export const BETA_THRESHOLD = 30; // število lokalov za vklop monetizacije
export const BETA_END_DATE = "2025-12-31"; // backup date če threshold ni dosežen

export interface BetaStatus {
  isActive: boolean; // true = v beta načinu (vse brezplačno)
  listingCount: number;
  remainingToMonetization: number;
  message: string;
  betaEndDate: string;
}

/**
 * Vrne trenutni beta status platforme.
 * Server-side only (uporablja Prisma).
 */
export async function getBetaStatus(): Promise<BetaStatus> {
  let listingCount = 0;
  try {
    listingCount = await db.listing.count();
  } catch {
    // Če baza še ni inicializirana
    listingCount = 0;
  }

  const isActive = listingCount < BETA_THRESHOLD;
  const remaining = Math.max(0, BETA_THRESHOLD - listingCount);

  let message: string;
  if (isActive) {
    message = `Beta obdobje — vse brezplačno. Še ${remaining} ${remaining === 1 ? "lokal" : remaining < 5 ? "lokala" : "lokalov"} do vklopa monetizacije.`;
  } else {
    message = "Monetizacija aktivna — zahvaljujemo se vsem beta uporabnikom!";
  }

  return {
    isActive,
    listingCount,
    remainingToMonetization: remaining,
    message,
    betaEndDate: BETA_END_DATE,
  };
}

/**
 * Client-side konstanta za prikaz (ne more klicat baze).
 * Za real-time števec uporabi API endpoint /api/beta-status
 */
export const BETA_INFO = {
  threshold: BETA_THRESHOLD,
  endDate: BETA_END_DATE,
  isActive: true, // client privzame beta dokler ne pridobi server-side info
  benefits: [
    "Brezplačni premium paket (vrednost €149/mes)",
    "AI priporočila vašega lokala potnikom",
    "Polna statistika in dashboard",
    "Brez obveznosti — lahko odidete kadar",
    "30 dni garancija po prekinitvi beta-ja",
  ],
};

/**
 * Preveri ali je neka funkcija trenutno plačljiva.
 * V beta načinu je VSE brezplačno.
 */
export function isFeaturePaid(betaStatus: BetaStatus, plan: string): boolean {
  // V beta načinu nič ni plačljivo
  if (betaStatus.isActive) return false;
  // Izven beta-ja: free paket ostane brezplačen, premium/enterprise plačljiva
  return plan !== "free";
}
