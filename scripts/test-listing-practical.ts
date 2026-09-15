/**
 * E2E TEST PRAKTIČNIH PODATKOV LOKALCA (t12 faza 1) — shema migracija + CRUD.
 *
 * 1) odstrani tri nove stolpce iz Listing (simulira STARO produkcijsko bazo),
 * 2) požene migrateListingPracticalColumnsWith(testniKlient) → stolpci se
 *    dodajo nazaj (additive-only ALTER TABLE),
 * 3) CRUD round-trip: create/read z seasons JSON + weather + parking,
 * 4) IDEMPOTENTNOST: drugi zagon migracije ne doda ničesar,
 * 5) enote: parseSeasons/formatSeasonsLabel/practicalPromptFragment
 *    (samo realni vnosi — prazna polja ne prispejo ničesar).
 *
 * Priprava (1× na stroju): prisma/schema-test.prisma (sqlite kopija sheme,
 *   output node_modules/.prisma/client-test) že v repozitoriju:
 *     DATABASE_URL=file:db/migration-test.db \
 *       bunx prisma generate --schema prisma/schema-test.prisma
 *     DATABASE_URL=file:db/migration-test.db \
 *       bunx prisma db push --schema prisma/schema-test.prisma
 * Zaženi (skripta sama počisti svoje vrstice):
 *   bun scripts/test-listing-practical.ts
 */
import { PrismaClient } from "../node_modules/.prisma/client-test";
import { migrateListingPracticalColumnsWith } from "../src/lib/listing-practical-migration";
import {
  parseSeasons,
  formatSeasonsLabel,
  practicalPromptFragment,
} from "../src/lib/listing-practical";

// TEST_DB: absolutna pot izpeljana iz lege skripte (bun import.meta.dir) —
// prenosljiva (prej hardcoded /home/z/…). Vrsto modula .prisma/client-test
// pokriva scripts/client-test.d.ts (ambientna deklaracija).
const TEST_DB = `${import.meta.dir}/../db/migration-test.db`;
const db = new PrismaClient({
  datasources: { db: { url: `file:${TEST_DB}` } },
});

let failures = 0;
function check(name: string, ok: boolean, detail?: string) {
  const mark = ok ? "✓" : "✗";
  console.log(`  ${mark} ${name}${ok ? "" : ` — ${detail ?? "ni pričakovano"}`}`);
  if (!ok) failures++;
}

async function main() {
  console.log("── 1) Simulacija STARE baze (brez praktičnih stolpcev) ──");
  // SQLite ≥ 3.35 podpira DROP COLUMN; Prisma 6 ima svež SQLite.
  // Identifikatorji brez narekovajev (sqlite je case-insensitive; dvojne
  // narekovaje v raw poizvedbi Prisma sqlite driver ubeži).
  for (const col of ["seasons", "weatherSuitability", "parking"]) {
    try {
      await db.$executeRawUnsafe(`ALTER TABLE Listing DROP COLUMN ${col}`);
    } catch (error) {
      console.warn(
        `  ⚠ DROP COLUMN "${col}" ni uspel (morda sqlite < 3.35): ${String(error)}`
      );
    }
  }

  console.log("── 2) Migracija (additive-only) ──");
  const r1 = await migrateListingPracticalColumnsWith(db);
  check(
    `dialekt prepoznan kot sqlite`,
    r1.dialect === "sqlite",
    `dobili ${r1.dialect}`
  );
  check(
    `dodani vsi trije stolpci`,
    r1.columnsAdded.length === 3 &&
      ["seasons", "weatherSuitability", "parking"].every((c) =>
        r1.columnsAdded.includes(c)
      ),
    `dobili: [${r1.columnsAdded.join(", ")}]`
  );

  console.log("── 3) CRUD round-trip ──");
  await db.listing.deleteMany({ where: { slug: { startsWith: "prakticni-test-" } } });
  const created = await db.listing.create({
    data: {
      name: "Praktični test 1",
      slug: "prakticni-test-1",
      description: "test",
      address: "Testna 1",
      category: "other",
      images: "[]",
      status: "published",
      seasons: JSON.stringify(["spring", "summer", "bogus-key", "summer"]),
      weatherSuitability: "indoor",
      parking: "free",
    },
  });
  const readBack = await db.listing.findUnique({ where: { id: created.id } });
  check("seasons JSON persistiran", readBack?.seasons === JSON.stringify(["spring", "summer", "bogus-key", "summer"]), readBack?.seasons ?? "null");
  check("weatherSuitability persistiran", readBack?.weatherSuitability === "indoor");
  check("parking persistiran", readBack?.parking === "free");

  // Stara vrstica brez podatkov (kakor obstoječa produkcija) ostane nedotaknjena
  const legacy = await db.listing.create({
    data: {
      name: "Praktični test legacy",
      slug: "prakticni-test-legacy",
      description: "test",
      address: "Testna 2",
      category: "other",
      images: "[]",
      status: "published",
    },
  });
  const legacyRead = await db.listing.findUnique({ where: { id: legacy.id } });
  check("legacy vrstica: seasons null", legacyRead?.seasons === null);
  check("legacy vrstica: weatherSuitability null", legacyRead?.weatherSuitability === null);
  check("legacy vrstica: parking null", legacyRead?.parking === null);

  console.log("── 4) Idempotentnost ──");
  const r2 = await migrateListingPracticalColumnsWith(db);
  check("drugi zagon doda 0 stolpcev", r2.columnsAdded.length === 0, `[${r2.columnsAdded.join(", ")}]`);

  console.log("── 5) Parserji / formati / AI fragment ──");
  const parsed = parseSeasons(JSON.stringify(["spring", "summer", "bogus-key", "summer"]));
  check("parseSeasons: dedup + izvoz neveljavnih", parsed.join(",") === "spring,summer", parsed.join(","));
  check("parseSeasons: null → []", parseSeasons(null).length === 0);
  check("parseSeasons: neveljaven JSON → []", parseSeasons("{bogus").length === 0);
  check(
    "formatSeasonsLabel: vse 4 → Celo leto",
    formatSeasonsLabel(["spring", "summer", "autumn", "winter"], "sl") === "Celo leto"
  );
  check(
    "formatSeasonsLabel: 2 sezoni → seznam",
    formatSeasonsLabel(["spring", "summer"], "sl") === "Pomlad, poletje"
  );
  check(
    "formatSeasonsLabel: EN all year",
    formatSeasonsLabel(["spring", "summer", "autumn", "winter"], "en") === "All year"
  );

  const fragmentFull = practicalPromptFragment(
    {
      seasons: JSON.stringify(["spring", "summer", "autumn", "winter"]),
      weatherSuitability: "indoor",
      parking: "free",
    },
    "sl"
  );
  check(
    "AI fragment (poln): sezona + vreme + parkiranje",
    fragmentFull === ", sezona: celo leto, vreme: Notranje (tudi v dežju), parkiranje: Zastonj",
    fragmentFull
  );
  const fragmentEmpty = practicalPromptFragment(
    { seasons: null, weatherSuitability: null, parking: null },
    "sl"
  );
  check("AI fragment (prazen): ničesar ne doda", fragmentEmpty === "");
  const fragmentLegacyRow = practicalPromptFragment(
    { seasons: "[]", weatherSuitability: "bogus", parking: undefined },
    "en"
  );
  check("AI fragment (neveljavni vnosi): ničesar ne doda", fragmentLegacyRow === "");

  // Čiščenje testnih vrstic (baza ostane za ponovne zažene)
  await db.listing.deleteMany({ where: { slug: { startsWith: "prakticni-test-" } } });

  console.log(
    failures === 0
      ? "\nVSI TESTI USPEŠNI ✓"
      : `\n${failures} TESTOV JE PADLO ✗`
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((error) => {
    console.error("Napaka testa:", error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
