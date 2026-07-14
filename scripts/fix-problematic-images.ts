/**
 * CILJANA POPRAVKA SLIK — samo za lokalce z očitno napačnimi slikami.
 * Pridobi novo sliko z image-search, preveri z VLM, posodobi bazo.
 */

import { db } from "@/lib/db";
import ZAI from "z-ai-web-dev-sdk";
import { execSync } from "child_process";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Lokalci z očitno napačnimi slikami (iz VLM preverbe)
const problematicListings = [
  {
    slug: "belokranjska-hisa",
    query: "Belokranjska hiša Črnomelj traditional restaurant Slovenia",
  },
  {
    slug: "gostilna-ribic",
    query: "Gostilna Ribič Piran seafood restaurant waterfront Slovenia",
  },
  {
    slug: "penzion-berc",
    query: "Penzion Berc Bled steakhouse restaurant Slovenia",
  },
  {
    slug: "hisa-franko",
    query: "Hiša Franko Kobarid restaurant Ana Roš Slovenia",
  },
  {
    slug: "hotel-vila-bled",
    query: "Hotel Vila Bled Tito residence lake Bled Slovenia",
  },
  {
    slug: "hotel-slovenj-gradec",
    query: "Hotel Slovenj Gradec Koroška town square Slovenia",
  },
  {
    slug: "jamska-kavarna-postojna",
    query: "Jamska kavarna Postojna cave cafe Slovenia",
  },
  {
    slug: "vinska-klet-cvicek",
    query: "Vinska klet Cviček Novo mesto wine cellar Slovenia",
  },
  {
    slug: "vinska-klet-golje",
    query: "Vinska klet Golje Vipava wine cellar Slovenia",
  },
];

async function searchAndGetFirst(query: string): Promise<string> {
  try {
    const result = execSync(
      `z-ai image-search -q "${query.replace(/"/g, '\\"')}" --count 5 --no-rank`,
      { timeout: 120000, stdio: "pipe", encoding: "utf-8" }
    );
    // Parse JSON iz outputa
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return "";
    const data = JSON.parse(jsonMatch[0]);
    if (data.success && Array.isArray(data.results) && data.results.length > 0) {
      return data.results[0].original_url as string;
    }
    return "";
  } catch (error) {
    console.error(`  Image search napaka: ${error instanceof Error ? error.message : "neznan"}`);
    return "";
  }
}

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

async function main() {
  console.log("=== CILJANA POPRAVKA SLIK ===\n");

  const zai = await ZAI.create();

  let updated = 0;
  let failed = 0;

  for (const item of problematicListings) {
    const listing = await db.listing.findUnique({
      where: { slug: item.slug },
      select: { slug: true, name: true, destinationName: true, images: true },
    });

    if (!listing) {
      console.log(`⚠️  ${item.slug}: Ni najden`);
      failed++;
      continue;
    }

    console.log(`\n[${updated + failed + 1}/${problematicListings.length}] ${listing.name} (${listing.destinationName})`);
    console.log(`  Iskanje: "${item.query}"`);

    const newImage = await searchAndGetFirst(item.query);
    if (!newImage) {
      console.log(`  ❌ Ni najdenih slik`);
      failed++;
      await sleep(3000);
      continue;
    }

    console.log(`  VLM preverba...`);
    await sleep(3000); // rate limit
    const vlmResult = await verifyImage(zai, newImage, listing.name, listing.destinationName);
    console.log(`  ${vlmResult.matches ? "✅" : "❌"} ${vlmResult.description}`);

    if (vlmResult.matches) {
      await db.listing.update({
        where: { slug: item.slug },
        data: { images: JSON.stringify([newImage]) },
      });
      console.log(`  ✅ POSODOBLJENO`);
      updated++;
    } else {
      console.log(`  ❌ VLM ni potrdil`);
      failed++;
    }

    await sleep(5000); // rate limit med lokalci
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
