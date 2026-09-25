import { promises as fs } from "fs";
import { db } from "@/lib/db";

async function main() {
  console.log("=== POSODOBA SLIK IZKUŠENJ ===\n");

  const batches = ["/tmp/exp-batch1.json", "/tmp/exp-batch2.json", "/tmp/exp-batch3.json"];
  const merged: Record<string, string[]> = {};

  for (const file of batches) {
    try {
      const data = JSON.parse(await fs.readFile(file, "utf-8"));
      for (const [slug, images] of Object.entries(data)) {
        merged[slug] = images as string[];
      }
    } catch { console.log(`Skip ${file}`); }
  }

  console.log(`Skupno izkušenj za posodobitev: ${Object.keys(merged).length}\n`);

  let updated = 0;
  let failed = 0;

  for (const [slug, images] of Object.entries(merged)) {
    if (!images || images.length === 0) {
      console.log(`❌ ${slug}: ni slik`);
      failed++;
      continue;
    }

    const newImage = images[0];
    try {
      await db.experience.update({
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

main().catch((e) => { console.error("❌", e); process.exit(1); }).finally(async () => { await db.$disconnect(); });
