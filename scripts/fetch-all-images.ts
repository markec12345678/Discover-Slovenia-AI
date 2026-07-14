/**
 * PRIDOBIVANJE SLIK — samo image-search za problematične lokalce.
 * Shrani rezultate v /tmp/image-candidates.json za nadaljno obdelavo.
 */

import { execSync } from "child_process";
import { promises as fs } from "fs";

const problematicListings = [
  { slug: "belokranjska-hisa", query: "Belokranjska hiša Črnomelj traditional restaurant Slovenia" },
  { slug: "gostilna-ribic", query: "Gostilna Ribič Piran seafood restaurant Slovenia" },
  { slug: "penzion-berc", query: "Penzion Berc Bled steakhouse restaurant" },
  { slug: "hisa-franko", query: "Hiša Franko Kobarid restaurant Ana Roš" },
  { slug: "hotel-vila-bled", query: "Hotel Vila Bled Tito residence lake" },
  { slug: "hotel-slovenj-gradec", query: "Slovenj Gradec town center Slovenia" },
  { slug: "jamska-kavarna-postojna", query: "Postojna cave entrance cafe Slovenia" },
  { slug: "vinska-klet-cvicek", query: "Cviček wine cellar Novo mesto Dolenjska" },
  { slug: "vinska-klet-golje", query: "Vipava wine cellar tasting Slovenia" },
  { slug: "hotel-park-ljubljana", query: "Hotel Park Ljubljana Tabor building" },
  { slug: "hotel-grad-otocec", query: "Hotel Grad Otočec castle island Krka river" },
  { slug: "grand-hotel-portoroz", query: "Grand Hotel Portorož lifeclass beach" },
  { slug: "piran-boutique-hotel", query: "Piran boutique hotel old town seafront" },
  { slug: "pri-starem-piskru", query: "Pri Starem Piskru Celje gostilna restaurant" },
  { slug: "kmecko-gospodarstvo-novak", query: "Kmečko gospodarstvo farm Ptuj Slovenia" },
  { slug: "prekmurska-kmetija", query: "Prekmurska kmetija farm Murska Sobota" },
  { slug: "bled-taxi-tours", query: "Bled taxi tours transport Slovenia" },
  { slug: "colnarna-bar-ljubljana", query: "Čolnarna bar Ljubljana river cafe" },
  { slug: "vogel-cable-car", query: "Vogel cable car Bohinj lake Slovenia" },
  { slug: "soca-rafting-bovec", query: "Soča rafting Bovec adventure Slovenia" },
  { slug: "restavracija-jb", query: "Restavracija JB Ljubljana fine dining" },
  { slug: "hotel-triglav-bled", query: "Hotel Triglav Bled lake view" },
  { slug: "gostilna-as", query: "Gostilna AS Ljubljana restaurant interior" },
  { slug: "stara-trta", query: "Stara trta Maribor oldest vine restaurant" },
  { slug: "hotel-city-ljubljana", query: "City Hotel Ljubljana Dalmatinova building" },
];

async function searchImage(query: string): Promise<string[]> {
  try {
    const result = execSync(
      `z-ai image-search -q "${query.replace(/"/g, '\\"')}" --count 5 --no-rank`,
      { timeout: 120000, stdio: "pipe", encoding: "utf-8" }
    );
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];
    const data = JSON.parse(jsonMatch[0]);
    if (data.success && Array.isArray(data.results)) {
      return data.results.map((r: { original_url: string }) => r.original_url).filter(Boolean);
    }
    return [];
  } catch {
    return [];
  }
}

async function main() {
  console.log("=== PRIDOBIVANJE SLIK ZA VSE LOKALCE ===\n");

  const results: Record<string, string[]> = {};

  for (let i = 0; i < problematicListings.length; i++) {
    const item = problematicListings[i];
    console.log(`[${i + 1}/${problematicListings.length}] ${item.slug}: "${item.query}"`);

    const candidates = await searchImage(item.query);
    console.log(`  → ${candidates.length} kandidatov`);

    if (candidates.length > 0) {
      results[item.slug] = candidates;
      console.log(`  ✅ ${candidates[0].substring(0, 60)}...`);
    } else {
      results[item.slug] = [];
      console.log(`  ❌ Ni najdenih`);
    }
  }

  await fs.writeFile(
    "/tmp/image-candidates.json",
    JSON.stringify(results, null, 2),
    "utf-8"
  );

  console.log(`\n=== POVZETEK ===`);
  const found = Object.values(results).filter((v) => v.length > 0).length;
  console.log(`✅ Najdenih slik: ${found}/${problematicListings.length}`);
  console.log(`Rezultati: /tmp/image-candidates.json`);
}

main().catch((e) => {
  console.error("❌ Napaka:", e);
  process.exit(1);
});
