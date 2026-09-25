/**
 * Faza 4a E2E seed — provizijski model (Booking-style)
 *
 * Ustvari testnega ownerja (provider4a@test.si / test123) z izkušnjo
 * in DVEEMA atribuiranimi rezervacijami (source="consultation"):
 *   1. v PREJŠNJEM koledarskem mesecu (za izdajo računa) — 120 €
 *   2. v TEKOČEM mesecu (za predogled) — 80 €
 *
 * Zagon: cd /home/z/Discover-Slovenia-AI && DATABASE_URL=file:/home/z/Discover-Slovenia-AI/db/custom.db bun scripts/e2e-4a-seed.ts
 * Čiščenje: bun scripts/e2e-4a-cleanup.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const email = "provider4a@test.si";

  // Počisti morebitne ostanke prejšnjih poskusov
  const old = await db.owner.findUnique({ where: { email } });
  if (old) {
    // SetNull relacija: Listing/Experience postanejo sirote — briši prek izkušenj
    const oldExps = await db.experience.findMany({
      where: { ownerId: old.id },
      select: { id: true },
    });
    for (const e of oldExps) {
      await db.booking.deleteMany({ where: { experienceId: e.id } });
      await db.review.deleteMany({ where: { experienceId: e.id } });
    }
    await db.experience.deleteMany({ where: { ownerId: old.id } });
    const oldListings = await db.listing.findMany({
      where: { ownerId: old.id },
      select: { id: true },
    });
    for (const l of oldListings) {
      await db.listingEvent.deleteMany({ where: { listingId: l.id } });
      await db.sponsorship.deleteMany({ where: { listingId: l.id } });
    }
    await db.listing.deleteMany({ where: { ownerId: old.id } });
    await db.commissionInvoice.deleteMany({ where: { ownerId: old.id } });
    await db.auditLog.deleteMany({ where: { actorId: old.id } });
    await db.owner.delete({ where: { id: old.id } });
    console.log("Počiščeni prejšnji testni podatki.");
  }

  const passwordHash = await bcrypt.hash("test123", 12);
  const owner = await db.owner.create({
    data: {
      email,
      name: "E2E 4a Ponudnik",
      passwordHash,
      businessName: "E2E 4a Testi d.o.o.",
      plan: "free",
      role: "provider",
    },
  });
  console.log("Owner:", owner.email);

  // Izkušnja (rezervacije so vezane nanjo)
  const now = new Date();
  const exp = await db.experience.create({
    data: {
      name: "E2E 4a Test Vožnja",
      slug: "e2e-4a-test-voznja",
      description: "Testna izkušnja za provizijski E2E (Faza 4a).",
      category: "tour",
      pricePerPerson: 40,
      durationHours: 2,
      images: "[]",
      languages: "[]",
      address: "Bled",
      providerName: "E2E 4a Ponudnik",
      providerEmail: email,
      ownerId: owner.id,
      status: "published",
    },
  });
  console.log("Experience:", exp.slug);

  // Mesecne meje (lokalni čas)
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 15, 10, 0, 0);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15, 10, 0, 0);

  // Rezervacija 1: PREJŠNJI mesec — osnova za račun (2 × 40 = 80 €)
  const b1 = await db.booking.create({
    data: {
      bookingNumber: "IF-EXP-4A01",
      guestEmail: "guest4a@test.si",
      guestName: "E2E Gost",
      experienceId: exp.id,
      experienceName: exp.name,
      bookingDate: lastMonth,
      groupSize: 2,
      pricePerPerson: 40,
      total: 80,
      providerName: exp.providerName,
      providerEmail: email,
      source: "consultation",
      status: "confirmed",
      confirmedAt: lastMonth,
      createdAt: lastMonth,
    },
  });
  console.log("Booking (prejšnji mesec):", b1.bookingNumber, b1.total, "€");

  // Rezervacija 2: PREJŠNJI mesec, druga — skupaj 120 € osnove
  const b2 = await db.booking.create({
    data: {
      bookingNumber: "IF-EXP-4A02",
      guestEmail: "guest4a-2@test.si",
      guestName: "E2E Gost 2",
      experienceId: exp.id,
      experienceName: exp.name,
      bookingDate: lastMonth,
      groupSize: 1,
      pricePerPerson: 40,
      total: 40,
      providerName: exp.providerName,
      providerEmail: email,
      source: "consultation",
      status: "confirmed",
      confirmedAt: lastMonth,
      createdAt: lastMonth,
    },
  });
  console.log("Booking (prejšnji mesec):", b2.bookingNumber, b2.total, "€");

  // Rezervacija 3: TEKOČI mesec — predogled (2 × 40 = 80 €)
  const b3 = await db.booking.create({
    data: {
      bookingNumber: "IF-EXP-4A03",
      guestEmail: "guest4a-3@test.si",
      guestName: "E2E Gost 3",
      experienceId: exp.id,
      experienceName: exp.name,
      bookingDate: thisMonth,
      groupSize: 2,
      pricePerPerson: 40,
      total: 80,
      providerName: exp.providerName,
      providerEmail: email,
      source: "consultation",
      status: "confirmed",
      confirmedAt: thisMonth,
      createdAt: thisMonth,
    },
  });
  console.log("Booking (tekoči mesec):", b3.bookingNumber, b3.total, "€");

  // Listing (za popolnost dashboarda)
  const listing = await db.listing.create({
    data: {
      name: "E2E 4a Test Lokal",
      slug: "e2e-4a-test-lokal",
      description: "Testni lokal za provizijski E2E (Faza 4a).",
      category: "activity",
      address: "Bled",
      images: "[]",
      ownerId: owner.id,
      status: "published",
    },
  });
  console.log("Listing:", listing.slug);

  console.log("\n=== SEED KONČAN ===");
  console.log("Prijava: provider4a@test.si / test123");
  console.log("Prejšnji mesec: 2 rezervaciji, osnova 120 € → provizija 14,40 €");
  console.log("Tekoči mesec: 1 rezervacija, osnova 80 € → predvidena provizija 9,60 €");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
