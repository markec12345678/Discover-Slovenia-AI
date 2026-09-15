/**
 * E2E TEST MIGRACIJE TRŽNIH SLIK — simulira produkcjsko DB s starimi CDN slikami.
 *
 * 1) ustvari testno SQLite bazo s shemo + starimi CDN vrsticami,
 * 2) požene migrateMarketplaceImagesWith(testniKlient),
 * 3) preveri zamenjave + IDEMPOTENTNOST (drugi zagon ne spremeni nič),
 * 4) preveri, da vrstice z NE-demo slikami (lastnikove) ostanejo nedotaknjene.
 *
 * Priprava (1× na stroju): prisma/schema-test.prisma (sqlite kopija sheme,
 *   output node_modules/.prisma/client-test) že v repozitoriju:
 *     DATABASE_URL=file:db/migration-test.db \
 *       bunx prisma generate --schema prisma/schema-test.prisma
 * Zaženi (počisti bazo pred zagonom — skripta NI idempotentna pri setupu):
 *   bun scripts/test-marketplace-migration.ts
 */
import { PrismaClient } from "../node_modules/.prisma/client-test";

// TEST_DB: absolutna pot izpeljana iz lege skripte (bun import.meta.dir) —
// prenosljiva (prej hardcoded /home/z/…). Vrsto modula .prisma/client-test
// pokriva scripts/client-test.d.ts (ambientna deklaracija), da `next build`
// (tsc prek **/*.ts) ne pada tam, kjer testni klient ni generiran.
const TEST_DB = `${import.meta.dir}/../db/migration-test.db`;
const db = new PrismaClient({
  datasources: { db: { url: `file:${TEST_DB}` } },
});

const OLD = (i: number) =>
  JSON.stringify([
    `https://sfile.chatglm.cn/images-ppt/old${i}a.jpg`,
    `https://sfile.chatglm.cn/images-ppt/old${i}b.jpg`,
  ]);
const CUSTOM = JSON.stringify(["https://primer.uporabnika.si/moja.jpg"]);

async function main() {
  // ── Priprava: vrstice s starimi CDN slikami (kot produkcija) ────────────
  const listingSlugs = [
    "gostilna-pri-lipovcu", "penzion-bohinj-ezerca", "kmecki-wellness-hudicevec",
    "soca-avanture-bovec", "soline-piran-trgovina", "vinski-klet-ptuj",
    "planinski-vodnik-triglav-milan", "kavarna-zvezda-ljubljana",
    "postojna-jama-partner", "piran-sunset-kayak",
  ];
  for (let i = 0; i < listingSlugs.length; i++) {
    await db.listing.create({
      data: {
        name: `Test ${listingSlugs[i]}`, slug: listingSlugs[i],
        description: "test", address: "Testna 1",
        category: "other", destinationId: "x", destinationName: "X",
        images: OLD(i), status: "published",
      },
    });
  }
  // lastnikova vrstica z lastnimi slikami — MORA ostati nedotaknjena
  await db.listing.create({
    data: {
      name: "Lastnikov lokal", slug: "lastnikov-lokal",
      description: "test", address: "Testna 2",
      category: "other", destinationId: "x", destinationName: "X",
      images: CUSTOM, status: "published",
    },
  });

  const expSlugs = [
    "rafting-na-soci-tura", "kanjoning-soteska-susec", "degustacija-stajerskih-vin",
    "triglav-v-dveh-dneh", "kmecka-delavnica-sir", "wellness-dan-na-kmetiji",
    "soncni-zahod-kajak-piran", "solinarska-tura-soline",
    "kuharska-delavnica-stajerskih-jedi", "vodeni-ogled-postojnske-jame",
  ];
  for (let i = 0; i < expSlugs.length; i++) {
    await db.experience.create({
      data: {
        name: `Test ${expSlugs[i]}`, slug: expSlugs[i],
        description: "test", address: "Testna 3", providerName: "Test d.o.o.",
        pricePerPerson: 10, durationHours: 1, languages: "[]",
        category: "tour", destinationId: "x", destinationName: "X",
        images: OLD(20 + i), status: "published",
      },
    });
  }

  const prodSlugs = [
    "piranski-solni-cvet-250", "kranjski-med-cvetni-500", "stajersko-bucno-olje-250",
    "refosk-premium-075", "volnena-kapa-triglav", "darilni-paket-soca",
  ];
  for (let i = 0; i < prodSlugs.length; i++) {
    await db.product.create({
      data: {
        name: `Test ${prodSlugs[i]}`, slug: prodSlugs[i],
        description: "test", sellerName: "Test prodajalec",
        category: "other", destinationId: "x", destinationName: "X",
        price: 10, images: OLD(40 + i), status: "published",
      },
    });
  }

  // ── 1. zagon migracije ──────────────────────────────────────────────────
  const { migrateMarketplaceImagesWith } = await import(
    "../src/lib/marketplace-image-migration"
  );
  const r1 = await migrateMarketplaceImagesWith(
    db as unknown as Parameters<typeof migrateMarketplaceImagesWith>[0],
  );
  console.log("Zagon 1:", JSON.stringify(r1));

  const fail: string[] = [];
  const check = (cond: boolean, msg: string) => { if (!cond) fail.push(msg); };

  check(r1.listingsUpdated === 10, `listingsUpdated 10 ≠ ${r1.listingsUpdated}`);
  check(r1.experiencesUpdated === 10, `experiencesUpdated 10 ≠ ${r1.experiencesUpdated}`);
  check(r1.productsUpdated === 6, `productsUpdated 6 ≠ ${r1.productsUpdated}`);

  for (const s of listingSlugs) {
    const row = await db.listing.findUnique({ where: { slug: s } });
    check(
      row?.images.includes("/content/marketplace/") === true &&
        !row?.images.includes("sfile.chatglm.cn"),
      `${s}: ni migriran`,
    );
  }
  // lastnikova vrstica NEDOTAKNJENA
  const custom = await db.listing.findUnique({ where: { slug: "lastnikov-lokal" } });
  check(custom?.images === CUSTOM, "lastnikov-lokal je bil POSEGEN");

  for (const s of expSlugs) {
    const row = await db.experience.findUnique({ where: { slug: s } });
    check(
      row?.images.includes("/content/marketplace/") === true &&
        !row?.images.includes("sfile.chatglm.cn"),
      `${s}: ni migriran`,
    );
  }
  for (const s of prodSlugs) {
    const row = await db.product.findUnique({ where: { slug: s } });
    check(
      row?.images.includes("/content/marketplace/") === true &&
        !row?.images.includes("sfile.chatglm.cn"),
      `${s}: ni migriran`,
    );
  }

  // ── 2. zagon: IDEMPOTENTNOST ────────────────────────────────────────────
  const r2 = await migrateMarketplaceImagesWith(
    db as unknown as Parameters<typeof migrateMarketplaceImagesWith>[0],
  );
  console.log("Zagon 2 (idempotenca):", JSON.stringify(r2));
  check(
    r2.listingsUpdated === 0 && r2.experiencesUpdated === 0 && r2.productsUpdated === 0,
    "drugi zagon je še kaj spreminjal",
  );

  if (fail.length) {
    console.error("NAPAKE:\n  - " + fail.join("\n  - "));
    process.exitCode = 1;
  } else {
    console.log("\n✅ VSE PREVERITVE OK (10+10+6 migriranih, lastnik nedotaknjen, idempotentno)");
  }
}

main()
  .catch((e) => { console.error("FATAL", e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
