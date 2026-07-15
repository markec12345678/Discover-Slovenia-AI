/**
 * POSODOBI SLIKE V BAZI — iz /tmp/all-image-candidates.json
 * Za vsak lokal vzame prvo sliko iz kandidatov in posodobi bazo.
 */

import { db } from "@/lib/db";
import { promises as fs } from "fs";

async function main() {
  console.log("=== POSODOBA SLIK V BAZI ===\n");

  const candidates = JSON.parse(
    await fs.readFile("/tmp/all-image-candidates.json", "utf-8")
  ) as Record<string, string[]>;

  let updated = 0;
  let failed = 0;

  for (const [slug, images] of Object.entries(candidates)) {
    if (!images || images.length === 0) {
      console.log(`❌ ${slug}: ni slik`);
      failed++;
      continue;
    }

    const newImage = images[0];
    try {
      await db.listing.update({
        where: { slug },
        data: { images: JSON.stringify([newImage]) },
      });
      console.log(`✅ ${slug}: ${newImage.substring(0, 60)}...`);
      updated++;
    } catch (error) {
      console.log(`❌ ${slug}: ${error}`);
      failed++;
    }
  }

  console.log(`\n=== POVZETEK ===`);
  console.log(`✅ Posodobljenih: ${updated}`);
  console.log(`❌ Neuspešnih: ${failed}`);
}

main()
  .catch((e) => {
    console.error("❌ Napaka:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
