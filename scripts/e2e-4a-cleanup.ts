/**
 * Faza 4a E2E cleanup — počisti vse testne podatke provizijskega E2E.
 * Vrstni red pomemben (SetNull relacije!): Booking → Experience →
 * ListingEvent → Listing → CommissionInvoice → AuditLog → Owner.
 *
 * Zagon: cd /home/z/Discover-Slovenia-AI && DATABASE_URL=file:/home/z/Discover-Slovenia-AI/db/custom.db bun scripts/e2e-4a-cleanup.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const email = "provider4a@test.si";
  const owner = await db.owner.findUnique({ where: { email } });
  if (!owner) {
    console.log("Ni testnega ownerja — nič za čistiti.");
    return;
  }

  const bookings = await db.booking.deleteMany({
    where: { bookingNumber: { in: ["IF-EXP-4A01", "IF-EXP-4A02", "IF-EXP-4A03"] } },
  });
  console.log("Brisani bookingi:", bookings.count);

  const reviews = await db.review.deleteMany({
    where: { experience: { ownerId: owner.id } },
  });
  console.log("Brisane recenzije:", reviews.count);

  const experiences = await db.experience.deleteMany({
    where: { ownerId: owner.id },
  });
  console.log("Brisane izkušnje:", experiences.count);

  const events = await db.listingEvent.deleteMany({
    where: { listing: { ownerId: owner.id } },
  });
  console.log("Brisani listing eventi:", events.count);

  const sponsorships = await db.sponsorship.deleteMany({
    where: { ownerId: owner.id },
  });
  console.log("Brisana sponzorstva:", sponsorships.count);

  const listings = await db.listing.deleteMany({
    where: { ownerId: owner.id },
  });
  console.log("Brisani lokalci:", listings.count);

  const invoices = await db.commissionInvoice.deleteMany({
    where: { ownerId: owner.id },
  });
  console.log("Brisani provizijski računi:", invoices.count);

  const audits = await db.auditLog.deleteMany({
    where: { actorId: owner.id },
  });
  console.log("Brisani audit logi:", audits.count);

  await db.owner.delete({ where: { id: owner.id } });
  console.log("Brisan owner:", email);

  // Dokaz čistoče
  const leftover = await Promise.all([
    db.owner.count({ where: { email } }),
    db.experience.count({ where: { slug: "e2e-4a-test-voznja" } }),
    db.listing.count({ where: { slug: "e2e-4a-test-lokal" } }),
    db.booking.count({ where: { bookingNumber: { startsWith: "IF-EXP-4A" } } }),
    db.commissionInvoice.count({ where: { invoiceNumber: { startsWith: "INV-202608-" } } }),
  ]);
  console.log("Ostanki (owner/exp/listing/booking/invoice):", leftover.join("/"));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
