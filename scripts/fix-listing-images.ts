/**
 * POPRAVI SLIKE LOKALCEV — za vsak lokal pridobi novo sliko z image-search,
 * preveri z VLM in posodobi bazo.
 *
 * Strategija:
 * 1. Za vsak lokal naredi image-search query
 * 2. Vzami prvega kandidata
 * 3. VLM preveri ali slika ustreza
 * 4. Če ustreza → posodobi bazo
 * 5. Če ne → poskusi naslednjega kandidata (do 3)
 * 6. Če noben ne ustreza → pusti staro sliko + zabeleži
 */

import { db } from "@/lib/db";
import ZAI from "z-ai-web-dev-sdk";
import { execSync } from "child_process";
import { promises as fs } from "fs";
import path from "path";

interface ListingToFix {
  slug: string;
  name: string;
  destinationName: string | null;
  category: string;
  currentImage: string;
}

// Image search za lokalca
async function searchImage(query: string): Promise<string[]> {
  try {
    const outputFile = `/tmp/img-search-${Date.now()}.json`;
    execSync(
      `z-ai image-search -q "${query.replace(/"/g, '\\"')}" --count 5 --no-rank -o ${outputFile}`,
      { timeout: 120000, stdio: "pipe" }
    );
    const data = JSON.parse(await fs.readFile(outputFile, "utf-8"));
    await fs.unlink(outputFile).catch(() => {});
    if (data.success && Array.isArray(data.results)) {
      return data.results.map((r: { original_url: string }) => r.original_url).filter(Boolean);
    }
    return [];
  } catch (error) {
    console.error(`  ⚠️  Image search napaka: ${error instanceof Error ? error.message : "neznan"}`);
    return [];
  }
}

// VLM preverba slike
async function verifyImage(
  zai: Awaited<ReturnType<typeof ZAI.create>>,
  imageUrl: string,
  listingName: string,
  destinationName: string | null
): Promise<{ matches: boolean; description: string }> {
  const prompt = `Ali ta slika prikazuje "${listingName}"${destinationName ? ` v ${destinationName} (Slovenija)` : " (Slovenija)"}? Odgovori v JSON:
{"matches": true/false, "description": "kaj prikazuje slika (1 stavek)"}`;

  try {
    const response = await zai.chat.completions.createVision({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      thinking: { type: "disabled" },
    });

    const content = response.choices[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        matches: Boolean(parsed.matches),
        description: String(parsed.description || ""),
      };
    }
    return { matches: false, description: content };
  } catch (error) {
    return {
      matches: false,
      description: `Napaka: ${error instanceof Error ? error.message : "neznan"}`,
    };
  }
}

// Sleep za rate limiting
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("=== POPRAVLJANJE SLIK LOKALCEV ===\n");

  const zai = await ZAI.create();
  const listings = await db.listing.findMany({
    select: {
      slug: true,
      name: true,
      destinationName: true,
      category: true,
      images: true,
    },
    orderBy: { name: "asc" },
  });

  const toFix: ListingToFix[] = listings.map((l) => ({
    slug: l.slug,
    name: l.name,
    destinationName: l.destinationName,
    category: l.category,
    currentImage: (JSON.parse(l.images || "[]") as string[])[0] || "",
  }));

  console.log(`Skupno lokalov: ${toFix.length}\n`);

  const results: Array<{
    slug: string;
    name: string;
    oldImage: string;
    newImage: string;
    verified: boolean;
    description: string;
  }> = [];

  let updated = 0;
  let failed = 0;

  for (const listing of toFix) {
    console.log(`\n--- ${listing.name} (${listing.destinationName}) ---`);

    // Image search query
    const query = `${listing.name} ${listing.destinationName || "Slovenia"} ${listing.category === "hotel" ? "hotel building exterior" : listing.category === "restaurant" ? "restaurant" : ""}`.trim();
    console.log(`  Iskanje: "${query}"`);

    const candidates = await searchImage(query);
    if (candidates.length === 0) {
      console.log(`  ❌ Ni najdenih slik`);
      results.push({
        slug: listing.slug,
        name: listing.name,
        oldImage: listing.currentImage,
        newImage: "",
        verified: false,
        description: "Ni najdenih slik",
      });
      failed++;
      continue;
    }

    // Preveri prve 3 kandidate z VLM
    let verified = false;
    let verifiedImage = "";
    let verifiedDescription = "";

    for (let i = 0; i < Math.min(3, candidates.length); i++) {
      const candidate = candidates[i];
      console.log(`  Preverjam kandidata ${i + 1}/${Math.min(3, candidates.length)}...`);

      // Sleep za rate limit
      await sleep(2000);

      const result = await verifyImage(zai, candidate, listing.name, listing.destinationName);
      console.log(`    ${result.matches ? "✅" : "❌"} ${result.description}`);

      if (result.matches) {
        verified = true;
        verifiedImage = candidate;
        verifiedDescription = result.description;
        break;
      }
    }

    if (verified) {
      // Posodobi bazo
      await db.listing.update({
        where: { slug: listing.slug },
        data: { images: JSON.stringify([verifiedImage]) },
      });
      console.log(`  ✅ POSODOBLJENO: ${verifiedImage.substring(0, 60)}...`);
      updated++;
      results.push({
        slug: listing.slug,
        name: listing.name,
        oldImage: listing.currentImage,
        newImage: verifiedImage,
        verified: true,
        description: verifiedDescription,
      });
    } else {
      console.log(`  ❌ Noben kandidat ni ustrezal`);
      failed++;
      results.push({
        slug: listing.slug,
        name: listing.name,
        oldImage: listing.currentImage,
        newImage: "",
        verified: false,
        description: "Noben kandidat ni ustrezal",
      });
    }

    // Sleep med lokalci za rate limit
    await sleep(3000);
  }

  // Povzetek
  console.log(`\n=== POVZETEK ===`);
  console.log(`✅ Posodobljenih: ${updated}`);
  console.log(`❌ Neuspešnih: ${failed}`);

  await fs.writeFile(
    "/tmp/listing-image-fixes.json",
    JSON.stringify(results, null, 2),
    "utf-8"
  );
  console.log(`Rezultati: /tmp/listing-image-fixes.json`);
}

main()
  .catch((e) => {
    console.error("❌ Napaka:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
