/**
 * P4-9: Ničeli demo rating/reviewCount (izmišljene ocene "4.9★ (847)").
 *
 * POGOJ ZA ZAGON: najprej mora biti DEPLOYAN commit s pogojnim prikazom ocen
 * (reviewCount > 0) — sicer stara koda na produkciji prikaže "0.0 (0)".
 * Po deployu (commit 718e88f+) poženi:
 *   bun scripts/db/zero-demo-ratings.ts
 *
 * Idempotenten — večkratni zagoni so varni.
 * Prave ocene prihajajo iz Review modela (vez na rezervacije), ne iz teh polj.
 */
import { db } from "@/lib/db";

async function main() {
  const l = await db.listing.updateMany({ data: { rating: 0, reviewCount: 0 } });
  const p = await db.product.updateMany({ data: { rating: 0, reviewCount: 0 } });
  const e = await db.experience.updateMany({ data: { rating: 0, reviewCount: 0 } });
  console.log(`Ničeljeno — Listing: ${l.count}, Product: ${p.count}, Experience: ${e.count}`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => db.$disconnect());
