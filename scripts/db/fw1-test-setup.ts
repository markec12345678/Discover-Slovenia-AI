// FW1 adversarial test SETUP — ustvari testne entitete na PRODUCT DB (Neon)
// Zagon: cd /home/z/Discover-Slovenia-AI && DATABASE_URL="$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '"')" bun scripts/db/fw1-test-setup.ts
// Čistijo jih: scripts/db/fw1-test-cleanup.ts
//
// Ustvari (vsi z FW1TEST markerji / dsa-test.invalid domeno):
//  1. Consultation (delivered) za fw1-test@dsa-test.invalid, ki priporoča
//     "Rafting na Soči — skupinska tura" (ime v answer + recommendedPartners)
//  2. Test izdelek (published, stock=1, saleCount=0) — za checkout teste
//  3. Test owner (fw1-owner@dsa-test.invalid, bcrypt geslo) + test izkušnjo
//     (published) + 2 rezervaciji (pretekla confirmed + prihodnja confirmed)
import { PrismaClient } from "@prisma/client";
import { hashSync } from "bcryptjs";

const db = new PrismaClient();
const TEST_DOMAIN = "@dsa-test.invalid";
const OWNER_EMAIL = `fw1-owner${TEST_DOMAIN}`;
const GUEST_EMAIL = `fw1-test${TEST_DOMAIN}`;
const OWNER_PASSWORD = "FW1-Test-Geslo-2026";

async function main() {
  const rafting = await db.experience.findFirst({
    where: { name: { contains: "Rafting" }, status: "published" },
    select: { id: true, name: true, ownerId: true },
  });
  if (!rafting) throw new Error("Rafting izkušnja ni najdena");

  // 1. Consultation (delivered) — kot bi jo ustvaril /api/consultations
  await db.consultation.deleteMany({ where: { email: GUEST_EMAIL } });
  const consultation = await db.consultation.create({
    data: {
      email: GUEST_EMAIL,
      question: "Priporočite mi rafting na Soči za družino?",
      answer: `Za družino toplo priporočam ${rafting.name} — varna skupinska tura s certificiranimi vodniki.`,
      answerSource: "ai",
      recommendedPartners: JSON.stringify([
        { name: rafting.name, kind: "experience" },
      ]),
      status: "delivered",
      accessToken: "fw1testtoken0000000000000001",
      destinationName: "Soča",
      deliveredAt: new Date(),
    },
  });
  console.log(`[setup] Consultation: ${consultation.id}`);

  // 2. Test izdelek (published, stock=1)
  await db.product.deleteMany({ where: { slug: "fw1-test-izdelek" } });
  const product = await db.product.create({
    data: {
      name: "FW1 Test Izdelek",
      slug: "fw1-test-izdelek",
      description: "Testni izdelek za FW1 adversarial teste (stock/atomarnost).",
      category: "souvenir",
      price: 10,
      images: "[]",
      stock: 1,
      saleCount: 0,
      sellerName: "FW1 Test",
      status: "published",
      ownerId: rafting.ownerId,
      destinationId: "soca",
      destinationName: "Soča",
    },
  });
  console.log(`[setup] Product: ${product.id} (stock=1)`);

  // 3. Test owner + izkušnja + rezervaciji
  await db.owner.deleteMany({ where: { email: OWNER_EMAIL } });
  const owner = await db.owner.create({
    data: {
      email: OWNER_EMAIL,
      name: "FW1 Test Owner",
      businessName: "FW1 Test Bizus",
      passwordHash: hashSync(OWNER_PASSWORD, 10),
      plan: "free",
      emailVerified: new Date(),
    },
  });
  const experience = await db.experience.create({
    data: {
      name: "FW1 Test Izkušnja",
      slug: "fw1-test-izkusnja",
      description: "Testna izkušnja za FW1 adversarial teste (PUT/cancel).",
      category: "tour",
      pricePerPerson: 20,
      durationHours: 2,
      minGroupSize: 1,
      maxGroupSize: 5,
      languages: "[]",
      address: "Testna 1",
      images: "[]",
      providerName: "FW1 Test Owner",
      providerEmail: OWNER_EMAIL,
      ownerId: owner.id,
      destinationId: "ljubljana",
      destinationName: "Ljubljana",
      status: "published",
    },
  });

  const past = new Date();
  past.setDate(past.getDate() - 7);
  const future = new Date();
  future.setDate(future.getDate() + 30);
  await db.booking.deleteMany({
    where: { guestEmail: { contains: "fw1-cancel" } },
  });
  const pastBooking = await db.booking.create({
    data: {
      bookingNumber: "FW1-CANCEL-PAST-01",
      guestEmail: "fw1-cancel-past@dsa-test.invalid",
      guestName: "Test Past",
      guestPhone: "+38640123456",
      experienceId: experience.id,
      experienceName: experience.name,
      bookingDate: past,
      groupSize: 2,
      pricePerPerson: 20,
      total: 40,
      status: "confirmed",
      paymentMethod: "demo",
      paymentStatus: "paid",
      providerName: "FW1 Test Owner",
      providerEmail: OWNER_EMAIL,
      confirmedAt: past,
    },
  });
  const futureBooking = await db.booking.create({
    data: {
      bookingNumber: "FW1-CANCEL-FUTR-01",
      guestEmail: "fw1-cancel-future@dsa-test.invalid",
      guestName: "Test Future",
      guestPhone: "+38640123457",
      experienceId: experience.id,
      experienceName: experience.name,
      bookingDate: future,
      groupSize: 2,
      pricePerPerson: 20,
      total: 40,
      status: "confirmed",
      paymentMethod: "demo",
      paymentStatus: "paid",
      providerName: "FW1 Test Owner",
      providerEmail: OWNER_EMAIL,
      confirmedAt: new Date(),
    },
  });

  console.log(`[setup] Owner: ${owner.id} (${OWNER_EMAIL})`);
  console.log(`[setup] Experience: ${experience.id} (published)`);
  console.log(`[setup] PastBooking: ${pastBooking.bookingNumber} (${past.toISOString().slice(0, 10)})`);
  console.log(`[setup] FutureBooking: ${futureBooking.bookingNumber} (${future.toISOString().slice(0, 10)})`);
  console.log(`[setup] Geslo ownerja: ${OWNER_PASSWORD}`);
  console.log(`[setup] Rafting: ${rafting.id} (${rafting.name})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
