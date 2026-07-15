import { db } from "@/lib/db";

async function main() {
  // Delete test sponsorship
  const deleted = await db.sponsorship.deleteMany({});
  console.log(`Deleted ${deleted.count} sponsorships`);

  // Reset listing sponsored status
  const reset = await db.listing.updateMany({
    where: { sponsored: true },
    data: { sponsored: false, sponsoredUntil: null },
  });
  console.log(`Reset ${reset.count} listings`);

  // Clear audit log
  const audit = await db.auditLog.deleteMany({});
  console.log(`Cleared ${audit.count} audit logs`);
}

main().finally(() => db.$disconnect());
