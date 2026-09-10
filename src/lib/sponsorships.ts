import { db } from "@/lib/db";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit-log";

/**
 * Aktiviraj sponzorstvo (deljeno jedro).
 *
 * ZAKAJ lib in ne route datoteka: Next.js route datoteke smejo izvažati LE
 * HTTP handlerje (GET/POST/…) in konfiguracijo — poljuben dodaten export
 * (kot je bil prej `export async function activateSponsorship` v
 * /api/owner/sponsorship/route.ts) pri webpack buildu pade s tipovno napako
 * "not a valid Route export field" (Turbopack tega ne preveri — napaka je
 * obstala neopažena, dokler nismo buildali z --webpack).
 *
 * Uporabniki:
 *  - /api/owner/sponsorship POST (demo mode — aktivacija brez Stripe)
 *  - /api/stripe/webhook (production mode — aktivacija po uspešnem plačilu)
 */
export async function activateSponsorship(
  sponsorshipId: string,
  listingId: string,
  ownerId: string,
  level: string,
  endsAt: Date,
  listingName: string
): Promise<void> {
  // 1. Posodobi sponsorship status
  await db.sponsorship.update({
    where: { id: sponsorshipId },
    data: {
      status: "active",
      startsAt: new Date(),
      endsAt,
    },
  });

  // 2. Posodobi listing — sponsored = true + sponsoredUntil
  await db.listing.update({
    where: { id: listingId },
    data: {
      sponsored: true,
      sponsoredUntil: endsAt,
      plan: level === "featured" ? "enterprise" : "premium",
    },
  });

  // 3. Posodobi owner plan
  await db.owner.update({
    where: { id: ownerId },
    data: {
      plan: level === "featured" ? "enterprise" : "premium",
      subscriptionStatus: "active",
      subscriptionEndsAt: endsAt,
    },
  });

  // 4. Audit log
  await logAudit({
    actorId: ownerId,
    actorRole: "system",
    action: AUDIT_ACTIONS.SPONSORSHIP_ACTIVATED,
    resourceType: "sponsorship",
    resourceId: sponsorshipId,
    resourceName: listingName,
    metadata: { level, endsAt: endsAt.toISOString() },
  });

  console.log(`[sponsorship] Aktivirana: ${listingName} (${level}) do ${endsAt.toISOString()}`);
}
