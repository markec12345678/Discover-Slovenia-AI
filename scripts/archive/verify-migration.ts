import { db } from "@/lib/db";

async function main() {
  console.log("=== LISTINGS ===");
  const listings = await db.listing.findMany({
    select: { name: true, status: true, partnerStatus: true, aiRecommendations: true, leadCount: true },
    take: 3,
  });
  console.log(listings);

  console.log("\n=== OWNERS ===");
  const owners = await db.owner.findMany({
    select: { email: true, plan: true, role: true },
    take: 3,
  });
  console.log(owners);

  console.log("\n=== COUNTS ===");
  console.log("Sponsorship:", await db.sponsorship.count());
  console.log("AnalyticsEvent:", await db.analyticsEvent.count());
  console.log("AIUsageLog:", await db.aIUsageLog.count());
  console.log("User:", await db.user.count());
  console.log("SavedItinerary:", await db.savedItinerary.count());
  console.log("ListingEvent:", await db.listingEvent.count());

  console.log("\n=== ✅ ALL TABLES OK ===");
}

main().catch(e => { console.error("❌", e); process.exit(1); }).finally(async () => { await db.$disconnect(); });
