/**
 * Migrira obstoječe lokale na nove partner statuse.
 *
 * - featured: true → partnerStatus = "featured"
 * - verified: true → partnerStatus = "verified"
 * - plan: premium/enterprise → partnerStatus = "premium"
 * - drugi → partnerStatus = "standard"
 *
 * Prav tako nastavi partnerSince = createdAt (veljajo kot partnerji od začetka).
 */

import { db } from "@/lib/db";

async function main() {
  console.log("=== MIGRACIJA PARTNER STATUSOV ===\n");

  const listings = await db.listing.findMany({
    select: {
      id: true,
      name: true,
      featured: true,
      verified: true,
      plan: true,
      createdAt: true,
    },
  });

  console.log(`Skupno lokalov za migracijo: ${listings.length}\n`);

  let featured = 0;
  let premium = 0;
  let verified = 0;
  let standard = 0;

  for (const listing of listings) {
    let partnerStatus = "standard";

    if (listing.featured) {
      partnerStatus = "featured";
      featured++;
    } else if (listing.plan === "premium" || listing.plan === "enterprise") {
      partnerStatus = "premium";
      premium++;
    } else if (listing.verified) {
      partnerStatus = "verified";
      verified++;
    } else {
      standard++;
    }

    await db.listing.update({
      where: { id: listing.id },
      data: {
        partnerStatus,
        partnerSince: listing.createdAt,
        verifiedByAdmin: listing.verified,
        // status je že "published" (default v shemi)
      },
    });

    console.log(`✅ ${listing.name} → ${partnerStatus}`);
  }

  console.log(`\n=== POVZETEK ===`);
  console.log(`⭐ Featured: ${featured}`);
  console.log(`👑 Premium: ${premium}`);
  console.log(`✓ Verified: ${verified}`);
  console.log(`• Standard: ${standard}`);
  console.log(`Skupaj: ${featured + premium + verified + standard}`);
}

main()
  .catch((e) => {
    console.error("❌ Napaka:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
