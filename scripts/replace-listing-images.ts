/**
 * HITRA NADOMESTITEV SLIK — za vsak lokal pridobi novo sliko z image-search
 * in posodobi bazo. Brez VLM preverbe (image-search že vrne relevantne slike).
 */

import { db } from "@/lib/db";
import { execSync } from "child_process";
import { promises as fs } from "fs";

interface ListingInfo {
  slug: string;
  name: string;
  destinationName: string | null;
  category: string;
}

// Image search za lokalca
async function searchImage(query: string): Promise<string> {
  try {
    const outputFile = `/tmp/img-search-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
    execSync(
      `z-ai image-search -q "${query.replace(/"/g, '\\"')}" --count 3 --no-rank -o ${outputFile}`,
      { timeout: 120000, stdio: "pipe" }
    );
    const data = JSON.parse(await fs.readFile(outputFile, "utf-8"));
    await fs.unlink(outputFile).catch(() => {});
    if (data.success && Array.isArray(data.results) && data.results.length > 0) {
      return data.results[0].original_url as string;
    }
    return "";
  } catch (error) {
    console.error(`  ⚠️  Image search napaka: ${error instanceof Error ? error.message : "neznan"}`);
    return "";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("=== HITRA NADOMESTITEV SLIK LOKALCEV ===\n");

  const listings = await db.listing.findMany({
    select: { slug: true, name: true, destinationName: true, category: true },
    orderBy: { name: "asc" },
  });

  console.log(`Skupno lokalov: ${listings.length}\n`);

  let updated = 0;
  let failed = 0;
  const results: Array<{ slug: string; name: string; newImage: string; status: string }> = [];

  for (const listing of listings) {
    console.log(`[${updated + failed + 1}/${listings.length}] ${listing.name} (${listing.destinationName})`);

    // Query glede na kategorijo
    let query = `${listing.name} ${listing.destinationName || "Slovenija"}`;
    if (listing.category === "hotel") {
      query += " hotel building exterior Slovenia";
    } else if (listing.category === "restaurant") {
      query += " restaurant Slovenia";
    } else if (listing.category === "activity") {
      query += " activity Slovenia";
    } else if (listing.category === "shop") {
      query += " shop Slovenia";
    } else if (listing.category === "bar") {
      query += " bar cafe Slovenia";
    } else if (listing.category === "transport") {
      query += " taxi transport Slovenia";
    }

    const newImage = await searchImage(query);

    if (newImage) {
      await db.listing.update({
        where: { slug: listing.slug },
        data: { images: JSON.stringify([newImage]) },
      });
      console.log(`  ✅ ${newImage.substring(0, 60)}...`);
      updated++;
      results.push({ slug: listing.slug, name: listing.name, newImage, status: "updated" });
    } else {
      console.log(`  ❌ Ni najdenih slik`);
      failed++;
      results.push({ slug: listing.slug, name: listing.name, newImage: "", status: "failed" });
    }

    await sleep(2000); // rate limit
  }

  console.log(`\n=== POVZETEK ===`);
  console.log(`✅ Posodobljenih: ${updated}`);
  console.log(`❌ Neuspešnih: ${failed}`);

  await fs.writeFile(
    "/tmp/listing-image-replacements.json",
    JSON.stringify(results, null, 2),
    "utf-8"
  );
}

main()
  .catch((e) => {
    console.error("❌ Napaka:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
