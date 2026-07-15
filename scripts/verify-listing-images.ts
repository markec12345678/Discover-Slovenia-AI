/**
 * VERIFIKACIJA SLIK LOKALCEV — preveri ali slike ustrezajo imenu lokalca
 *
 * Za vsak lokal v bazi naredi VLM klic in preveri ali slika prikazuje
 * pravi objekt. Če ne ustreza, ga označi za popravilo.
 */

import { db } from "@/lib/db";
import ZAI from "z-ai-web-dev-sdk";

interface VerificationResult {
  slug: string;
  name: string;
  destinationName: string | null;
  imageUrl: string;
  matches: boolean;
  vlmDescription: string;
  reason: string;
}

async function verifyImage(
  zai: Awaited<ReturnType<typeof ZAI.create>>,
  imageUrl: string,
  listingName: string,
  destinationName: string | null
): Promise<{ matches: boolean; description: string; reason: string }> {
  const prompt = `Ali ta slika prikazuje "${listingName}"${destinationName ? ` v ${destinationName}` : ""}? Odgovori v JSON formatu:
{
  "matches": true/false,
  "description": "kaj dejansko prikazuje slika (1 stavek)",
  "reason": "zakaj ustreza ali ne ustreza (1 stavek)"
}`;

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
        reason: String(parsed.reason || ""),
      };
    }
    return { matches: false, description: content, reason: "Ni JSON odgovora" };
  } catch (error) {
    return {
      matches: false,
      description: "",
      reason: `Napaka: ${error instanceof Error ? error.message : "neznan"}`,
    };
  }
}

async function main() {
  console.log("=== VERIFIKACIJA SLIK LOKALCEV ===\n");

  const zai = await ZAI.create();
  const listings = await db.listing.findMany({
    select: {
      slug: true,
      name: true,
      destinationName: true,
      images: true,
    },
    orderBy: { name: "asc" },
  });

  console.log(`Skupno lokalov za preverbo: ${listings.length}\n`);

  const results: VerificationResult[] = [];

  for (const listing of listings) {
    const images = JSON.parse(listing.images || "[]") as string[];
    const imageUrl = images[0];

    if (!imageUrl) {
      console.log(`⚠️  ${listing.name}: BREZ SLIKE`);
      results.push({
        slug: listing.slug,
        name: listing.name,
        destinationName: listing.destinationName,
        imageUrl: "",
        matches: false,
        vlmDescription: "",
        reason: "Brez slike",
      });
      continue;
    }

    process.stdout.write(`Preverjam: ${listing.name}... `);
    const result = await verifyImage(zai, imageUrl, listing.name, listing.destinationName);

    const status = result.matches ? "✅ USTREZA" : "❌ NE USTREZA";
    console.log(`${status} — ${result.description}`);

    results.push({
      slug: listing.slug,
      name: listing.name,
      destinationName: listing.destinationName,
      imageUrl,
      matches: result.matches,
      vlmDescription: result.description,
      reason: result.reason,
    });
  }

  // Povzetek
  const matching = results.filter((r) => r.matches).length;
  const notMatching = results.filter((r) => !r.matches && r.imageUrl).length;
  const noImage = results.filter((r) => !r.imageUrl).length;

  console.log(`\n=== POVZETEK ===`);
  console.log(`✅ Ustreza: ${matching}`);
  console.log(`❌ Ne ustreza: ${notMatching}`);
  console.log(`⚠️  Brez slike: ${noImage}`);
  console.log(`\n=== NEUSTREZNE SLIKE ===`);
  results
    .filter((r) => !r.matches && r.imageUrl)
    .forEach((r) => {
      console.log(`- ${r.name} (${r.destinationName}): ${r.vlmDescription}`);
    });

  // Shrani rezultate
  const fs = await import("fs/promises");
  await fs.writeFile(
    "/tmp/listing-image-verification.json",
    JSON.stringify(results, null, 2),
    "utf-8"
  );
  console.log(`\nRezultati shranjeni v /tmp/listing-image-verification.json`);
}

main()
  .catch((e) => {
    console.error("❌ Napaka:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
