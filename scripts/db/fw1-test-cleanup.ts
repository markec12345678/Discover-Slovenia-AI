// FW1 adversarial test CLEANUP — počisti vse FW1 testne entitete (idempotenten)
// Zagon: cd /home/z/Discover-Slovenia-AI && DATABASE_URL="$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '"')" bun scripts/db/fw1-test-cleanup.ts
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  // 1. Konzultacija + rezervacija testa A (povrnitev bookingCount na raftingu)
  const testBooking = await db.booking.findFirst({
    where: { guestEmail: "fw1-test@dsa-test.invalid" },
    select: { id: true, experienceId: true },
  });
  if (testBooking) {
    await db.booking.delete({ where: { id: testBooking.id } });
    await db.experience.update({
      where: { id: testBooking.experienceId },
      data: { bookingCount: { decrement: 1 } },
    });
    console.log("[cleanup] TEST A rezervacija izbrisana, bookingCount povrnjen");
  }
  await db.consultation.deleteMany({
    where: { email: "fw1-test@dsa-test.invalid" },
  });
  await db.booking.deleteMany({
    where: { guestEmail: { contains: "fw1-" } },
  });

  // 2. Naročila + testni izdelek (checkout testi)
  const deletedOrders = await db.order.deleteMany({
    where: { buyerEmail: { contains: "fw1-" } },
  });
  console.log(`[cleanup] ${deletedOrders.count} FW1 naročil izbrisanih`);
  await db.product.deleteMany({ where: { slug: "fw1-test-izdelek" } });

  // 3. Test owner + izkušnja + audit vrstice
  await db.auditLog.deleteMany({
    where: { actorEmail: "fw1-owner@dsa-test.invalid" },
  });
  await db.experience.deleteMany({ where: { slug: "fw1-test-izkusnja" } });
  await db.owner.deleteMany({
    where: { email: { contains: "fw1-" } },
  });

  // 4. Lead testi + dvoumni ownerji
  await db.lead.deleteMany({
    where: { email: { contains: "fw1-" } },
  });

  // 5. Poročilo — konsola
  const remaining = await db.booking.count({
    where: { guestEmail: { contains: "fw1-" } },
  });
  const remainingOrders = await db.order.count({
    where: { buyerEmail: { contains: "fw1-" } },
  });
  const remainingOwners = await db.owner.count({
    where: { email: { contains: "fw1-" } },
  });
  console.log(
    `[cleanup] Ostanki: bookings=${remaining}, orders=${remainingOrders}, owners=${remainingOwners} (pričakovano 0/0/0)`
  );
  console.log("[done] FW1 cleanup zaključen.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
