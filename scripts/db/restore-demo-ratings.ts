/**
 * P4-9 (ZAČASNO): povrni demo rating/reviewCount, dokler ni deployan commit
 * s pogojnim prikazom ocen. Razlog: DB sem ničeliral PREJ kot je šel deploy
 * skozi — Vercel dnevna kvota deployev je bila izčrpana (reset 2026-09-12
 * 05:33 UTC), stara koda pa bi ~24h+ kazala "0.0 (0)".
 *
 * POTEM KO JE DEPLOYAN 718e88f+ (ali novejši): poženi zero-demo-ratings.ts.
 *
 * Vrednosti = točno stanje pred ničeljenjem (iz scripts/seed-demo.ts).
 */
import { db } from "@/lib/db";

const LISTINGS: Record<string, [number, number]> = {
  "Gostilna Pri Lipovcu": [4.7, 128],
  "Penzion Bohinj Ezerca": [4.5, 89],
  "Kmečki wellness Hudičevec": [4.9, 42],
  "Soča Avanture — Bovec": [4.8, 214],
  "Soline Piran — trgovina": [4.6, 57],
  "Vinski klet Ptuj — degustacije": [4.7, 73],
  "Planinski vodnik Triglav — Milan": [5.0, 31],
  "Kavarna Zvezda — Ljubljana": [4.4, 156],
  "Postojnska jama — partner": [4.5, 302],
  "Piran Sunset Kayak": [4.9, 66],
};

const EXPERIENCES: Record<string, [number, number]> = {
  "Rafting na Soči — skupinska tura": [4.8, 214],
  "Kanjoning v soteski Sušec": [4.9, 98],
  "Degustacija štajerskih vin": [4.7, 73],
  "Triglav v dveh dneh z vodnikom": [5.0, 31],
  "Kmečka delavnica — sir in skuta": [4.9, 42],
  "Wellness dan na kmetiji": [4.9, 28],
  "Sončni zahod s kajakom — Piran": [4.9, 66],
  "Solinarska tura po solinah": [4.6, 57],
  "Kuharska delavnica štajerskih jedi": [4.8, 41],
  "Vodeni ogled Postojnske jame": [4.5, 302],
};

async function main() {
  let n = 0;
  for (const [name, [rating, reviewCount]] of Object.entries(LISTINGS)) {
    const r = await db.listing.updateMany({ where: { name }, data: { rating, reviewCount } });
    n += r.count;
  }
  console.log(`Listingi povrnjeni: ${n}/10`);
  let m = 0;
  for (const [name, [rating, reviewCount]] of Object.entries(EXPERIENCES)) {
    const r = await db.experience.updateMany({ where: { name }, data: { rating, reviewCount } });
    m += r.count;
  }
  console.log(`Izkušnje povrnjene: ${m}/10`);
  console.log("OPOMBA: izdelki (Product) so bili 0 že pred ničeljenjem (seed-demo ne nastavlja ocen).");
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => db.$disconnect());
