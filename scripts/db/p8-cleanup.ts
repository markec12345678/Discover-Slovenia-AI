// P8 E2E cleanup — izbris testne rezervacije + povratek bookingCount
// Zagon: cd /home/z/Discover-Slovenia-AI && DATABASE_URL="$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '"')" bun scripts/db/p8-cleanup.ts
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const EMAILS = [
  "p8-e2e-race@dsa-test.invalid",
  "p8-e2e-race2@dsa-test.invalid",
];
const EXP_ID = "cmtvgsmwa000uq5udhq5sutqr";

async function main() {
  // 1. Verifikacija: točno ENA rezervacija na testni email
  let total = 0;
  for (const email of EMAILS) {
    const rows = await db.booking.findMany({
      where: { guestEmail: email },
      select: { bookingNumber: true, status: true, source: true },
    });
    total += rows.length;
    console.log(
      `[verify] ${email}: ${rows.length} rezervacij — ${rows
        .map((r) => `${r.bookingNumber} (${r.status}, source=${r.source ?? "null"})`)
        .join(", ")}`
    );
  }

  const before = await db.experience.findUnique({
    where: { id: EXP_ID },
    select: { bookingCount: true },
  });
  console.log("[verify] experience bookingCount pred cleanup:", before?.bookingCount);

  // 2. Cleanup
  const del = await db.booking.deleteMany({
    where: { guestEmail: { in: EMAILS } },
  });
  console.log("[cleanup] izbrisanih rezervacij:", del.count);

  if (del.count > 0) {
    await db.experience.update({
      where: { id: EXP_ID },
      data: { bookingCount: { decrement: del.count } },
    });
    const after = await db.experience.findUnique({
      where: { id: EXP_ID },
      select: { bookingCount: true },
    });
    console.log("[cleanup] experience bookingCount po cleanup:", after?.bookingCount);
  }

  if (total !== 2) {
    throw new Error(`PRIČAKOVANO 2 rezervaciji (1 na email), najdeno ${total} — preveri!`);
  }
  console.log("[OK] E2E verifikacija + cleanup zaključena.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
