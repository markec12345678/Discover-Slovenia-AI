// P9 smoke cleanup — izbris smoke rezervacije/newsletter vrstice + povratek bookingCount
// Zagon: cd /home/z/Discover-Slovenia-AI && DATABASE_URL="$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '"')" bun scripts/db/p9-smoke-cleanup.ts
// Idempotenten: lahko se poganja večkrat.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const EMAIL = "p9-smoke@dsa-test.invalid";

async function main() {
  // 1. Verifikacija smoke rezervacij (pričakovano 1)
  const rows = await db.booking.findMany({
    where: { guestEmail: EMAIL },
    select: { bookingNumber: true, experienceId: true, status: true },
  });
  console.log(
    `[verify] ${EMAIL}: ${rows.length} rezervacij — ${rows
      .map((r) => `${r.bookingNumber} (${r.status})`)
      .join(", ")}`
  );

  // 2. Cleanup rezervacij + povratek bookingCount
  if (rows.length > 0) {
    const del = await db.booking.deleteMany({ where: { guestEmail: EMAIL } });
    console.log("[cleanup] izbrisanih rezervacij:", del.count);
    for (const r of rows) {
      const exp = await db.experience.findUnique({
        where: { id: r.experienceId },
        select: { bookingCount: true },
      });
      if (exp && exp.bookingCount > 0) {
        await db.experience.update({
          where: { id: r.experienceId },
          data: { bookingCount: { decrement: 1 } },
        });
        console.log(
          `[cleanup] bookingCount ${r.experienceId}: ${exp.bookingCount} → ${exp.bookingCount - 1}`
        );
      }
    }
  } else {
    console.log("[cleanup] ni rezervacij za brisanje");
  }

  // 3. Cleanup newsletter vrstice
  const nl = await db.newsletterSubscriber.deleteMany({
    where: { email: EMAIL },
  });
  console.log("[cleanup] newsletter vrstic izbrisanih:", nl.count);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
