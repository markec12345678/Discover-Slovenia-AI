import { db } from "@/lib/db";

async function main() {
  console.log("=== ISKANJE DUPLIKATOV SLIK ===\n");

  // Listings
  const listings = await db.listing.findMany({ select: { slug: true, name: true, images: true } });
  const listingMap = new Map<string, string[]>();
  for (const l of listings) {
    const imgs = JSON.parse(l.images || "[]") as string[];
    for (const img of imgs) {
      if (!listingMap.has(img)) listingMap.set(img, []);
      listingMap.get(img)!.push(`listing:${l.name}`);
    }
  }

  // Products
  const products = await db.product.findMany({ select: { slug: true, name: true, images: true } });
  for (const p of products) {
    const imgs = JSON.parse(p.images || "[]") as string[];
    for (const img of imgs) {
      if (!listingMap.has(img)) listingMap.set(img, []);
      listingMap.get(img)!.push(`product:${p.name}`);
    }
  }

  // Experiences
  const experiences = await db.experience.findMany({ select: { slug: true, name: true, images: true } });
  for (const e of experiences) {
    const imgs = JSON.parse(e.images || "[]") as string[];
    for (const img of imgs) {
      if (!listingMap.has(img)) listingMap.set(img, []);
      listingMap.get(img)!.push(`experience:${e.name}`);
    }
  }

  // Najdi duplikate
  const duplicates = Array.from(listingMap.entries()).filter(([, items]) => items.length > 1);

  console.log(`Skupno unikatnih slik: ${listingMap.size}`);
  console.log(`Duplikatov: ${duplicates.length}\n`);

  for (const [img, items] of duplicates) {
    console.log(`Slika: ${img.substring(0, 60)}...`);
    items.forEach((item) => console.log(`  → ${item}`));
    console.log();
  }
}

main().catch(console.error).finally(async () => { await db.$disconnect(); });
