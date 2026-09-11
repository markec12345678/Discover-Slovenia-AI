/**
 * DEMO SEED — realistični slovenski turistični podatki za razvoj in predstavitev
 *
 * Ustvari:
 *   - 5 partnerjev (owner računi; gesla glej spodaj — P7-A pravila)
 *   - 10 listingov (hoteli, gostilne, atrakcije ...) po slovenskih destinacijah
 *   - 10 izkušenj (tours, degustacije, outdoor ...) z atribuiranimi rezervacijami
 *   - 6 izdelkov tržnice (med, olje, vino, sol ...)
 *   - nekaj rezervacij (del source="consultation" — za provizijski model)
 *   - nekaj ListingEvent zapisov (AI kanal vrednost za tedensje poročilo)
 *
 * GESLA (P7-A, 2026-09-11 — po upokojitvi demo računov iz produkcije):
 *   - Remote DB (postgres/neon): NAKLJUČNA gesla, ki se NE izpišejo — demo
 *     računi so inertni lastniki vsebine (prijava nemogoča).
 *   - Lokalna SQLite (DATABASE_URL=file:…): fiksna gesla SAMO z
 *     DEV_FIXED_DEMO_PASSWORDS=1 (razvojna udobja); sicer naključna + izpis.
 *   - Admin demo račun (super_admin): SAMO z ADMIN_DEMO_SEED=1, NIKOLI s
 *     fiksnim geslom — naključno geslo se izpiše samo na lokalni SQLite.
 *
 * Idempotentno: pred vsodbo počisti vse prejšnje demo podatke (email domene @demo.discoverslovenia.si).
 *
 * Zagon:  cd /home/z/Discover-Slovenia-AI && DATABASE_URL=file:/home/z/Discover-Slovenia-AI/db/custom.db bun scripts/seed-demo.ts
 * Dokumentacija: docs/SEED-STRATEGY.md
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const db = new PrismaClient();

const DEMO_DOMAIN = "@demo.discoverslovenia.si";

// Slike — isti CDN kot src/lib/slovenia-data.ts (provjerjene, javno dostopne)
const IMG = [
  "https://sfile.chatglm.cn/images-ppt/807d1fbe824a.jpg",
  "https://sfile.chatglm.cn/images-ppt/ac493803c4e0.jpg",
  "https://sfile.chatglm.cn/images-ppt/06a0b01bbd2d.jpg",
  "https://sfile.chatglm.cn/images-ppt/0e69d67205a0.jpg",
  "https://sfile.chatglm.cn/images-ppt/1ca2f342127f.jpg",
  "https://sfile.chatglm.cn/images-ppt/217561ec8261.jpg",
  "https://sfile.chatglm.cn/images-ppt/4214e73010ea.jpg",
  "https://sfile.chatglm.cn/images-ppt/5f720abe0af2.jpg",
  "https://sfile.chatglm.cn/images-ppt/76344bd842e2.jpg",
  "https://sfile.chatglm.cn/images-ppt/824e16866694.jpg",
  "https://sfile.chatglm.cn/images-ppt/8f3aa8e1a6c3.jpg",
  "https://sfile.chatglm.cn/images-ppt/9cd8cbe421b4.jpg",
  "https://sfile.chatglm.cn/images-ppt/a50accb13d5e.jpg",
  "https://sfile.chatglm.cn/images-ppt/b44193c1c8f2.jpg",
  "https://sfile.chatglm.cn/images-ppt/bfc1494a06a6.jpg",
  "https://sfile.chatglm.cn/images-ppt/ce5079515d70.jpg",
  "https://sfile.chatglm.cn/images-ppt/e3f47a3c4190.jpg",
  "https://sfile.chatglm.cn/images-ppt/e63eaac243b6.jpg",
  "https://sfile.chatglm.cn/images-ppt/f1fdf5ca02fe.jpg",
  "https://sfile.chatglm.cn/images-ppt/03fcfaa925cc.jpg",
];
const img = (...idx: number[]) => JSON.stringify(idx.map((i) => IMG[i % IMG.length]));

/** Predhodni mesec (DST-varno) — za rezervacije, ki se obračunajo v provizijskem računu */
function previousMonth(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth() - 1, 15, 12, 0, 0);
}

async function cleanup() {
  const demoOwners = await db.owner.findMany({
    where: { email: { endsWith: DEMO_DOMAIN } },
    select: { id: true },
  });
  const ids = demoOwners.map((o) => o.id);
  if (ids.length === 0) return;

  // SetNull relacije: izkušnje/listingi najprej počistijo svoje odvisnike
  const exps = await db.experience.findMany({ where: { ownerId: { in: ids } }, select: { id: true } });
  for (const e of exps) {
    await db.booking.deleteMany({ where: { experienceId: e.id } });
    await db.review.deleteMany({ where: { experienceId: e.id } });
  }
  await db.experience.deleteMany({ where: { ownerId: { in: ids } } });

  const listings = await db.listing.findMany({ where: { ownerId: { in: ids } }, select: { id: true } });
  for (const l of listings) {
    await db.listingEvent.deleteMany({ where: { listingId: l.id } });
    await db.sponsorship.deleteMany({ where: { listingId: l.id } });
  }
  await db.listing.deleteMany({ where: { ownerId: { in: ids } } });
  await db.product.deleteMany({ where: { ownerId: { in: ids } } });
  await db.commissionInvoice.deleteMany({ where: { ownerId: { in: ids } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await db.owner.deleteMany({ where: { id: { in: ids } } });
  console.log(`Počiščenih ${ids.length} prejšnjih demo partnerjev.`);
}

async function main() {
  await cleanup();

  // ─── P7-A pravila gesel ─────────────────────────────────────────────────
  const dbUrl = process.env.DATABASE_URL ?? "";
  const isLocalSqlite = dbUrl.startsWith("file:");
  const isRemote = /^postgres(ql)?:\/\//.test(dbUrl);
  const fixedPartnerPw = isLocalSqlite && process.env.DEV_FIXED_DEMO_PASSWORDS === "1";
  const partnerPwPlain = fixedPartnerPw ? "demo1234" : crypto.randomBytes(32).toString("base64url");
  const pw = await bcrypt.hash(partnerPwPlain, 12);
  // super_admin demo račun: SAMO z ADMIN_DEMO_SEED=1 (privzeto NE) in NIKOLI
  // s fiksnim geslom (P7-A: admin@demo je bil izbrisan iz produkcije).
  const createAdmin = process.env.ADMIN_DEMO_SEED === "1";
  const adminPwPlain = createAdmin ? crypto.randomBytes(32).toString("base64url") : "";
  const adminPw = createAdmin ? await bcrypt.hash(adminPwPlain, 12) : "";
  if (isRemote) {
    console.log(
      "POZOR: seed teče proti REMOTE (postgres) bazi — uporabljena so NAKLJUČNA, neizpisana gesla."
    );
    console.log(
      "         Demo računi bodo inertni lastniki vsebine (prijava nemogoča) — tako kot v produkciji po P7-A."
    );
  }
  const now = new Date();
  const lastMonth = previousMonth();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 1, 12, 0, 0);

  // ─── Partnerji ────────────────────────────────────────────────────────────
  const ana = await db.owner.create({
    data: {
      email: `ana${DEMO_DOMAIN}`, name: "Ana Novak", passwordHash: pw,
      businessName: "Kmečki wellness Hudičevec", plan: "free", phone: "+386 40 123 456",
    },
  });
  const marko = await db.owner.create({
    data: {
      email: `marko${DEMO_DOMAIN}`, name: "Marko Kovač", passwordHash: pw,
      businessName: "Gostilna Pri Lipovcu", plan: "premium",
      subscriptionStatus: "active", subscriptionEndsAt: nextMonth, phone: "+386 41 234 567",
    },
  });
  const tina = await db.owner.create({
    data: {
      email: `tina${DEMO_DOMAIN}`, name: "Tina Zupan", passwordHash: pw,
      businessName: "Soča Avanture d.o.o.", plan: "free", phone: "+386 51 345 678",
    },
  });
  const luka = await db.owner.create({
    data: {
      email: `luka${DEMO_DOMAIN}`, name: "Luka Pirnat", passwordHash: pw,
      businessName: "Primorska trgovina Piran", plan: "free", phone: "+386 5 678 901",
    },
  });
  if (createAdmin) {
    await db.owner.create({
      data: {
        email: `admin${DEMO_DOMAIN}`, name: "Demo Admin", passwordHash: adminPw,
        businessName: "Discover Slovenia AI (demo)", plan: "enterprise", role: "super_admin",
      },
    });
  }
  console.log(
    createAdmin
      ? "Partnerji: ana, marko (premium), tina, luka, admin — vsi @demo.discoverslovenia.si (admin z NAKLJUČNIM geslom)"
      : "Partnerji: ana, marko (premium), tina, luka — vsi @demo.discoverslovenia.si (admin IZPUŠČEN — privzeto P7-A)"
  );

  // ─── Listingi ─────────────────────────────────────────────────────────────
  const L = (data: Parameters<typeof db.listing.create>[0]["data"]) => db.listing.create({ data });

  const lipovec = await L({
    name: "Gostilna Pri Lipovcu", slug: "gostilna-pri-lipovcu",
    description: "Tradicionalna štajerska gostilna z domačimi jedmi iz lokalnih sestavin.",
    longDescription: "Od leta 1986 postrežemo štajerske klasike: bujtl repa, jota, pražen krompir z jajci in domače sladice. Sestavine dobivamo od kmetij v radiju 20 km.",
    category: "restaurant", destinationId: "ptuj", destinationName: "Ptuj",
    address: "Slovenska ulica 12, 2250 Ptuj", phone: "+386 2 748 12 34",
    email: `marko${DEMO_DOMAIN}`, website: "https://pri-lipovcu.demo.si",
    images: img(0, 5), plan: "premium", featured: true, verified: true, partnerStatus: "premium",
    rating: 4.7, reviewCount: 128, priceRange: "€€", openingHours: "Pon–Ned 10:00–22:00",
    specialties: JSON.stringify(["štajerska jota", "bujtl repa", "domače sladice"]),
    ownerId: marko.id, status: "published", partnerSince: lastMonth, verifiedByAdmin: true,
  });

  await L({
    name: "Penzion Bohinj Ezerca", slug: "penzion-bohinj-ezerca",
    description: "Družinski penzion ob Bohinjskem jezeru s pogledom na Komarno Ruto.",
    category: "hotel", destinationId: "bohinj", destinationName: "Bohinj",
    address: "Ribčev Laz 45, 4265 Bohinjsko jezero", phone: "+386 4 572 33 11",
    images: img(1, 6), plan: "free", verified: true, partnerStatus: "verified",
    rating: 4.5, reviewCount: 89, priceRange: "€€", ownerId: ana.id, status: "published",
  });
  await L({
    name: "Kmečki wellness Hudičevec", slug: "kmecki-wellness-hudicevec",
    description: "Sauna, kopel v hladnem potoku in masaže na kmetiji pod Pohorjem.",
    category: "wellness", destinationId: "maribor", destinationName: "Maribor",
    address: "Hudičevec 8, 2312 Orehova vas", phone: "+386 40 123 456",
    images: img(2, 7), plan: "free", rating: 4.9, reviewCount: 42,
    priceRange: "€€", ownerId: ana.id, status: "published",
  });
  await L({
    name: "Soča Avanture — Bovec", slug: "soca-avanture-bovec",
    description: "Vodeni rafting, kajak in kanjoning na Soči z licenciranimi vodniki.",
    category: "activity", destinationId: "soca", destinationName: "Soča",
    address: "Trg svobode 16, 5230 Bovec", phone: "+386 51 345 678",
    images: img(3, 8), plan: "free", verified: true, partnerStatus: "verified",
    rating: 4.8, reviewCount: 214, priceRange: "€€", ownerId: tina.id, status: "published",
  });
  await L({
    name: "Soline Piran — trgovina", slug: "soline-piran-trgovina",
    description: "Piranska sol, solni cvet in lokalni izdelki iz Sečoveljskih solin.",
    category: "shop", destinationId: "piran", destinationName: "Piran",
    address: "Župančičeva ulica 3, 6330 Piran", phone: "+386 5 678 901",
    images: img(4, 9), plan: "free", rating: 4.6, reviewCount: 57,
    priceRange: "€", ownerId: luka.id, status: "published",
  });
  await L({
    name: "Vinski klet Ptuj — degustacije", slug: "vinski-klet-ptuj",
    description: "Degustacije štajerskih vin v srednjeveški kleti pod mestnim jedrom.",
    category: "bar", destinationId: "ptuj", destinationName: "Ptuj",
    address: "Kremenkova ulica 2, 2250 Ptuj", phone: "+386 2 748 55 66",
    images: img(10, 11), plan: "free", rating: 4.7, reviewCount: 73,
    priceRange: "€€", ownerId: marko.id, status: "published",
  });
  await L({
    name: "Planinski vodnik Triglav — Milan", slug: "planinski-vodnik-triglav-milan",
    description: "Certificirani gorski vodnik za vzpone na Triglav in vzponne smeri.",
    category: "activity", destinationId: "triglav", destinationName: "Triglav",
    address: "Kranjska Gora 80, 4280 Kranjska Gora",
    images: img(12, 13), plan: "free", rating: 5.0, reviewCount: 31,
    priceRange: "€€€", ownerId: tina.id, status: "published",
  });
  await L({
    name: "Kavarna Zvezda — Ljubljana", slug: "kavarna-zvezda-ljubljana",
    description: "Kavarna s domačimi sladicami na starem mestnem jedru Ljubljane.",
    category: "bar", destinationId: "ljubljana", destinationName: "Ljubljana",
    address: "Krojaška ulica 5, 1000 Ljubljana",
    images: img(14, 15), plan: "free", rating: 4.4, reviewCount: 156,
    priceRange: "€", ownerId: ana.id, status: "published",
  });
  await L({
    name: "Postojnska jama — partner", slug: "postojna-jama-partner",
    description: "Uradna prodajna točka vstopnic za Postojnsko jamo z lokalnim vodenjem.",
    category: "other", destinationId: "postojna", destinationName: "Postojna",
    address: "Jamska cesta 30, 6230 Postojna",
    images: img(16, 17), plan: "free", rating: 4.5, reviewCount: 302,
    priceRange: "€€", ownerId: luka.id, status: "published",
  });
  await L({
    name: "Piran Sunset Kayak", slug: "piran-sunset-kayak",
    description: "Kajak izleti ob sončnem zahodu ob piranski obali.",
    category: "activity", destinationId: "piran", destinationName: "Piran",
    address: "Pristaniška ulica 9, 6330 Piran",
    images: img(18, 19), plan: "free", rating: 4.9, reviewCount: 66,
    priceRange: "€€", ownerId: luka.id, status: "published",
  });
  console.log("Listingi: 10 (premium gostilna + 9 free partnerjev)");

  // ─── Izkušnje ──────────────────────────────────────────────────────────────
  const E = (data: Parameters<typeof db.experience.create>[0]["data"]) => db.experience.create({ data });

  const rafting = await E({
    name: "Rafting na Soči — skupinska tura", slug: "rafting-na-soci-tura",
    description: "2-urni rafting po mirnejšem delu Soče, primeren za družine in prvekratnike.",
    category: "adventure", destinationId: "soca", destinationName: "Soča",
    pricePerPerson: 45, durationHours: 2.5, minGroupSize: 2, maxGroupSize: 8,
    languages: JSON.stringify(["sl", "en", "de", "it"]),
    meetingPoint: "Soča Avanture center, Trg svobode 16, Bovec",
    address: "Trg svobode 16, 5230 Bovec", images: img(3, 8),
    providerName: "Soča Avanture d.o.o.", providerEmail: `tina${DEMO_DOMAIN}`,
    providerPhone: "+386 51 345 678", plan: "free", verified: true,
    rating: 4.8, reviewCount: 214, familyFriendly: true, bookingCount: 6,
    ownerId: tina.id, status: "published",
  });
  const kanjoning = await E({
    name: "Kanjoning v soteski Sušec", slug: "kanjoning-soteska-susec",
    description: "Spust po naravnih toboganih in skokih v kristalno čisto vodo soteske.",
    category: "adventure", destinationId: "soca", destinationName: "Soča",
    pricePerPerson: 60, durationHours: 3, minGroupSize: 2, maxGroupSize: 6,
    languages: JSON.stringify(["sl", "en"]),
    meetingPoint: "Soča Avanture center, Bovec",
    address: "Trg svobode 16, 5230 Bovec", images: img(8, 3),
    providerName: "Soča Avanture d.o.o.", providerEmail: `tina${DEMO_DOMAIN}`,
    plan: "free", rating: 4.9, reviewCount: 98, bookingCount: 4,
    ownerId: tina.id, status: "published",
  });
  await E({
    name: "Degustacija štajerskih vin", slug: "degustacija-stajerskih-vin",
    description: "7 vin lokalnih vinarjev z blagimi sirevi in štajersko pogačo.",
    category: "tasting", destinationId: "ptuj", destinationName: "Ptuj",
    pricePerPerson: 28, durationHours: 1.5, minGroupSize: 2, maxGroupSize: 12,
    languages: JSON.stringify(["sl", "en", "de"]),
    meetingPoint: "Vinski klet Ptuj, Kremenkova ulica 2",
    address: "Kremenkova ulica 2, 2250 Ptuj", images: img(10, 11),
    providerName: "Gostilna Pri Lipovcu", providerEmail: `marko${DEMO_DOMAIN}`,
    plan: "premium", featured: true, rating: 4.7, reviewCount: 73, bookingCount: 9,
    ownerId: marko.id, status: "published",
  });
  await E({
    name: "Triglav v dveh dneh z vodnikom", slug: "triglav-v-dveh-dneh",
    description: "Klasični vzpon prek Kredarice z nočitvijo v planinskem domu.",
    category: "outdoor", destinationId: "triglav", destinationName: "Triglav",
    pricePerPerson: 220, durationHours: 20, minGroupSize: 2, maxGroupSize: 4,
    languages: JSON.stringify(["sl", "en"]),
    meetingPoint: "Aljažev dom, Vrata",
    address: "Kranjska Gora 80, 4280 Kranjska Gora", images: img(12, 13),
    providerName: "Planinski vodnik Milan", providerEmail: `tina${DEMO_DOMAIN}`,
    plan: "free", rating: 5.0, reviewCount: 31, bookingCount: 2,
    ownerId: tina.id, status: "published",
  });
  await E({
    name: "Kmečka delavnica — sir in skuta", slug: "kmecka-delavnica-sir",
    description: "Pol dneva na kmetiji: molža, priprava sira in degustacija z dobrotami.",
    category: "workshop", destinationId: "bohinj", destinationName: "Bohinj",
    pricePerPerson: 35, durationHours: 3, minGroupSize: 1, maxGroupSize: 10,
    languages: JSON.stringify(["sl", "en"]),
    meetingPoint: "Kmetija Novak, Ribčev Laz",
    address: "Ribčev Laz 45, 4265 Bohinjsko jezero", images: img(1, 6),
    providerName: "Kmečki wellness Hudičevec", providerEmail: `ana${DEMO_DOMAIN}`,
    plan: "free", rating: 4.9, reviewCount: 42, familyFriendly: true, bookingCount: 5,
    ownerId: ana.id, status: "published",
  });
  await E({
    name: "Wellness dan na kmetiji", slug: "wellness-dan-na-kmetiji",
    description: "Finska sauna, hladna kopel v potoku in sproščujoča masaža z lokalnim oljem.",
    category: "wellness", destinationId: "maribor", destinationName: "Maribor",
    pricePerPerson: 85, durationHours: 6, minGroupSize: 1, maxGroupSize: 4,
    languages: JSON.stringify(["sl", "en", "hr"]),
    meetingPoint: "Kmečki wellness Hudičevec, Orehova vas",
    address: "Hudičevec 8, 2312 Orehova vas", images: img(2, 7),
    providerName: "Kmečki wellness Hudičevec", providerEmail: `ana${DEMO_DOMAIN}`,
    plan: "free", rating: 4.9, reviewCount: 28, bookingCount: 7,
    ownerId: ana.id, status: "published",
  });
  await E({
    name: "Sončni zahod s kajakom — Piran", slug: "soncni-zahod-kajak-piran",
    description: "Mirna večerna tura ob piranski obali z bogatim sončnim zahodom.",
    category: "outdoor", destinationId: "piran", destinationName: "Piran",
    pricePerPerson: 39, durationHours: 2, minGroupSize: 2, maxGroupSize: 8,
    languages: JSON.stringify(["sl", "en", "it"]),
    meetingPoint: "Pristanišče Piran",
    address: "Pristaniška ulica 9, 6330 Piran", images: img(18, 19),
    providerName: "Primorska trgovina Piran", providerEmail: `luka${DEMO_DOMAIN}`,
    plan: "free", rating: 4.9, reviewCount: 66, bookingCount: 8,
    ownerId: luka.id, status: "published",
  });
  await E({
    name: "Solinarska tura po solinah", slug: "solinarska-tura-soline",
    description: "Vodena tura po Sečoveljskih solinah z ogledom tradicionalnega pobiranja soli.",
    category: "cultural", destinationId: "piran", destinationName: "Piran",
    pricePerPerson: 18, durationHours: 1.5, minGroupSize: 1, maxGroupSize: 15,
    languages: JSON.stringify(["sl", "en", "it"]),
    meetingPoint: "Soline Piran, trgovina",
    address: "Župančičeva ulica 3, 6330 Piran", images: img(4, 9),
    providerName: "Primorska trgovina Piran", providerEmail: `luka${DEMO_DOMAIN}`,
    plan: "free", rating: 4.6, reviewCount: 57, familyFriendly: true, bookingCount: 3,
    ownerId: luka.id, status: "published",
  });
  const kuharska = await E({
    name: "Kuharska delavnica štajerskih jedi", slug: "kuharska-delavnica-stajerskih-jedi",
    description: "Skupaj z Markom pripravimo joto, bujtl repo in domačo gibanico.",
    category: "workshop", destinationId: "ptuj", destinationName: "Ptuj",
    pricePerPerson: 55, durationHours: 4, minGroupSize: 2, maxGroupSize: 8,
    languages: JSON.stringify(["sl", "en"]),
    meetingPoint: "Gostilna Pri Lipovcu, Ptuj",
    address: "Slovenska ulica 12, 2250 Ptuj", images: img(0, 5),
    providerName: "Gostilna Pri Lipovcu", providerEmail: `marko${DEMO_DOMAIN}`,
    plan: "premium", rating: 4.8, reviewCount: 41, bookingCount: 6,
    ownerId: marko.id, status: "published",
  });
  await E({
    name: "Vodeni ogled Postojnske jame", slug: "vodeni-ogled-postojnske-jame",
    description: "Klasični ogled jame z lokalnim vodnikom in vstopnico brez čakanja.",
    category: "tour", destinationId: "postojna", destinationName: "Postojna",
    pricePerPerson: 32, durationHours: 1.5, minGroupSize: 1, maxGroupSize: 20,
    languages: JSON.stringify(["sl", "en", "de", "it"]),
    meetingPoint: "Glavni vhod, Jamska cesta 30",
    address: "Jamska cesta 30, 6230 Postojna", images: img(16, 17),
    providerName: "Postojnska jama — partner", providerEmail: `luka${DEMO_DOMAIN}`,
    plan: "free", rating: 4.5, reviewCount: 302, familyFriendly: true, accessibility: true, bookingCount: 11,
    ownerId: luka.id, status: "published",
  });
  console.log("Izkušnje: 10");

  // ─── Izdelki tržnice ───────────────────────────────────────────────────────
  const P = (data: Parameters<typeof db.product.create>[0]["data"]) => db.product.create({ data });
  await P({
    name: "Piranski solni cvet 250 g", slug: "piranski-solni-cvet-250",
    description: "Ročno pobran solni cvet iz Sečoveljskih solin.",
    category: "other", destinationId: "piran", destinationName: "Piran",
    price: 12.9, images: img(4), stock: 40, organic: true, handmade: true,
    sellerName: "Primorska trgovina Piran", sellerEmail: `luka${DEMO_DOMAIN}`,
    ownerId: luka.id, status: "published",
  });
  await P({
    name: "Kranjski med cvetni 500 g", slug: "kranjski-med-cvetni-500",
    description: "Nefiltriran cvetni med kranjske sivke iz Bohinja.",
    category: "honey", destinationId: "bohinj", destinationName: "Bohinj",
    price: 14.5, images: img(1), stock: 25, organic: true,
    sellerName: "Kmečki wellness Hudičevec", sellerEmail: `ana${DEMO_DOMAIN}`,
    ownerId: ana.id, status: "published",
  });
  await P({
    name: "Štajersko bučno olje 250 ml", slug: "stajersko-bucno-olje-250",
    description: "Hladno stiskano bučno olje iz štajerske buče.",
    category: "oil", destinationId: "ptuj", destinationName: "Ptuj",
    price: 16.9, compareAtPrice: 19.9, images: img(0), stock: 30, organic: true,
    sellerName: "Gostilna Pri Lipovcu", sellerEmail: `marko${DEMO_DOMAIN}`,
    ownerId: marko.id, status: "published",
  });
  await P({
    name: "Refosk premium 0,75 l", slug: "refosk-premium-075",
    description: "Sortni refošk iz istrskih vinogradov, fermentiran v inoxu.",
    category: "wine", destinationId: "piran", destinationName: "Piran",
    price: 22.0, images: img(18), stock: 18, vegan: true,
    sellerName: "Primorska trgovina Piran", sellerEmail: `luka${DEMO_DOMAIN}`,
    ownerId: luka.id, status: "published",
  });
  await P({
    name: "Volnena pletenina — kapa Triglav", slug: "volnena-kapa-triglav",
    description: "Ročno pletena volnena kapa z motivom Triglava.",
    category: "craft", destinationId: "triglav", destinationName: "Triglav",
    price: 29.0, images: img(12), stock: 12, handmade: true,
    sellerName: "Soča Avanture d.o.o.", sellerEmail: `tina${DEMO_DOMAIN}`,
    ownerId: tina.id, status: "published",
  });
  await P({
    name: "Darilni paket 'Soča' (3 izdelki)", slug: "darilni-paket-soca",
    description: "Nahrbtnik: lokalni sir, med in zeliščni čaj iz Soče doline.",
    category: "souvenir", destinationId: "soca", destinationName: "Soča",
    price: 34.9, images: img(3), stock: 15, local: true,
    sellerName: "Soča Avanture d.o.o.", sellerEmail: `tina${DEMO_DOMAIN}`,
    ownerId: tina.id, status: "published",
  });
  console.log("Izdelki tržnice: 6");

  // ─── Rezervacije (atribucija AI kanala) ────────────────────────────────────
  const B = (data: Parameters<typeof db.booking.create>[0]["data"]) => db.booking.create({ data });
  let bookingIdx = 0;
  const bookingNum = () => `DEMO-${String(++bookingIdx).padStart(4, "0")}`;

  // Prejšnji mesec — Tina (free) → obdelava v provizijski račun (120 € osnove)
  // FW1 (audit R3 🔴 #1): semenske atribuirane rezervacije so PLAČANE
  // (paymentStatus "paid") — nadzorovani demo podatek, da provizijski
  // dashboard ostane živ. ŽIVE demo rezervacije prek /api/bookings so
  // vedno "unpaid" in v osnovo NE vstopijo (glej lib/commissions.ts).
  await B({
    bookingNumber: bookingNum(), guestEmail: "turist1@guest.demo", guestName: "Müller Familie",
    experienceId: rafting.id, experienceName: rafting.name, bookingDate: lastMonth,
    createdAt: lastMonth,
    groupSize: 2, pricePerPerson: 45, total: 90, status: "confirmed",
    paymentStatus: "paid", paymentMethod: "demo",
    providerName: rafting.providerName, providerEmail: `tina${DEMO_DOMAIN}`,
    meetingPoint: rafting.meetingPoint, source: "consultation",
  });
  await B({
    bookingNumber: bookingNum(), guestEmail: "turist2@guest.demo", guestName: "Dupont",
    experienceId: kanjoning.id, experienceName: kanjoning.name, bookingDate: lastMonth,
    createdAt: lastMonth,
    groupSize: 1, pricePerPerson: 60, total: 60, status: "completed",
    paymentStatus: "paid", paymentMethod: "demo",
    providerName: kanjoning.providerName, providerEmail: `tina${DEMO_DOMAIN}`,
    source: "consultation",
  });
  // Prejšnji mesec — Marko (premium → 0 %, samo vrednost v dashboardu)
  await B({
    bookingNumber: bookingNum(), guestEmail: "turist3@guest.demo", guestName: "Kovács",
    experienceId: kuharska.id, experienceName: kuharska.name, bookingDate: lastMonth,
    createdAt: lastMonth,
    groupSize: 2, pricePerPerson: 55, total: 110, status: "completed",
    paymentStatus: "paid", paymentMethod: "demo",
    providerName: kuharska.providerName, providerEmail: `marko${DEMO_DOMAIN}`,
    source: "consultation",
  });
  // Tekoči mesec — predogled provizije (80 € osnove)
  await B({
    bookingNumber: bookingNum(), guestEmail: "turist4@guest.demo", guestName: "Novak",
    experienceId: rafting.id, experienceName: rafting.name, bookingDate: now,
    createdAt: now,
    groupSize: 2, pricePerPerson: 45, total: 90, status: "confirmed",
    paymentStatus: "paid", paymentMethod: "demo",
    providerName: rafting.providerName, providerEmail: `tina${DEMO_DOMAIN}`,
    source: "consultation",
  });
  // Navadna rezervacija (brez atribucije — ne šteje v provizijo)
  await B({
    bookingNumber: bookingNum(), guestEmail: "turist5@guest.demo", guestName: "Horvat",
    experienceId: rafting.id, experienceName: rafting.name, bookingDate: now,
    createdAt: now,
    groupSize: 4, pricePerPerson: 45, total: 180, status: "confirmed",
    providerName: rafting.providerName, providerEmail: `tina${DEMO_DOMAIN}`,
  });
  console.log("Rezervacije: 5 (3 atribuirane prejšnji mesec, 1 tekoči, 1 brez atribucije)");

  // ─── ListingEvent (AI kanal vrednost) ──────────────────────────────────────
  await db.listingEvent.create({
    data: {
      listingId: lipovec.id, type: "ai_recommendation", source: "consultation",
      createdAt: lastMonth,
    },
  });
  console.log("ListingEvent: 1 AI priporočilo iz konzultacije");

  console.log("\n✅ DEMO SEED DOKONČAN");
  if (fixedPartnerPw) {
    console.log("   Prijava partnerja (free, provizija 12 %):  tina@demo.discoverslovenia.si / demo1234");
    console.log("   Prijava partnerja (premium, 0 %):          marko@demo.discoverslovenia.si / demo1234");
    console.log("   (fiksna gesla — SAMO lokalna SQLite + DEV_FIXED_DEMO_PASSWORDS=1)");
  } else if (isLocalSqlite) {
    console.log("   Partnerji: ana/marko/tina/luka @demo.discoverslovenia.si");
    console.log(`   Naključno geslo (vsak zase, izpis samo lokalno): ${[partnerPwPlain].join(", ")}`);
  } else {
    console.log("   Partnerji: ana/marko/tina/luka @demo.discoverslovenia.si — gesla NAKLJUČNA in neizpisana (remote DB)");
  }
  if (createAdmin) {
    if (isLocalSqlite) {
      console.log(`   Admin (super_admin): admin@demo.discoverslovenia.si / ${adminPwPlain}`);
    } else {
      console.log("   Admin (super_admin): admin@demo.discoverslovenia.si — geslo NAKLJUČNO in neizpisano (remote DB)");
    }
  } else {
    console.log("   Admin demo račun: IZPUŠČEN (privzeto; ustvari ga samo ADMIN_DEMO_SEED=1)");
  }
}

main()
  .catch((e) => {
    console.error("SEED NAPAKA:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
