import { db } from "@/lib/db";

// Popravek vseh napačnih in duplikatnih slik v experiences in listings
async function main() {
  console.log("🔧 Fixing mismatched images...\n");

  // === EXPERIENCES ===
  const expFixes: Record<string, string> = {
    "ribolov-na-soci": "https://sfile.chatglm.cn/images-ppt/2716511005d1.jpg",
    "zip-line-ucja": "https://sfile.chatglm.cn/images-ppt/151ae32a2364.jpg",
    "wellness-dan-rogaska": "https://sfile.chatglm.cn/images-ppt/160558ee6972.jpg",
    "delavnica-vina-maribor": "https://sfile.chatglm.cn/images-ppt/194eb486c0e4.jpeg",
    "degustacija-vina-vipava": "https://sfile.chatglm.cn/images-ppt/b6c80c82d67e.jpg",
    "pohod-na-mangart": "https://sfile.chatglm.cn/images-ppt/725e49060b6f.jpg",
    "celje-grad-grofov": "https://sfile.chatglm.cn/images-ppt/f244226aa408.jpg",
    "ptuj-zgodovinski-ogled": "https://sfile.chatglm.cn/images-ppt/1bd5bb894f56.jpg",
    "maribor-staro-mesto-stara-trta": "https://sfile.chatglm.cn/images-ppt/d6a56cfd210d.jpg",
  };

  for (const [slug, newImage] of Object.entries(expFixes)) {
    const exp = await db.experience.findUnique({ where: { slug } });
    if (!exp) { console.log(`  ⚠️  Experience not found: ${slug}`); continue; }
    await db.experience.update({
      where: { id: exp.id },
      data: { images: JSON.stringify([newImage]) },
    });
    console.log(`  ✅ Experience: ${exp.name} → ${newImage.split("/").pop()}`);
  }

  // === LISTINGS ===
  const listingFixes: Record<string, string> = {
    "hotel-triglav-bled": "https://sfile.chatglm.cn/images-ppt/991d03ef53be.jpg",
    "hotel-city-ljubljana": "https://sfile.chatglm.cn/images-ppt/ff17c14ca99c.jpg",
    "hotel-grand-plaza-portoroz": "https://sfile.chatglm.cn/images-ppt/a69da8d76e73.jpg",
    "restavracija-as": "https://sfile.chatglm.cn/images-ppt/9b273f5b3e09.jpg",
    "gostilna-ribic": "https://sfile.chatglm.cn/images-ppt/34f282f4b689.jpg",
    "jamska-kavarna-postojna": "https://sfile.chatglm.cn/images-ppt/ad17fa2a080a.jpg",
  };

  for (const [slug, newImage] of Object.entries(listingFixes)) {
    const listing = await db.listing.findUnique({ where: { slug } });
    if (!listing) { console.log(`  ⚠️  Listing not found: ${slug}`); continue; }
    await db.listing.update({
      where: { id: listing.id },
      data: { images: JSON.stringify([newImage]) },
    });
    console.log(`  ✅ Listing: ${listing.name} → ${newImage.split("/").pop()}`);
  }

  console.log("\n✨ All images fixed!");
}

main().catch(console.error).finally(() => db.$disconnect());
