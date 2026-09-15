/**
 * MIGRACIJA TRŽNIH SLIK (tržni val, sept 2026)
 *
 * Problem: demo seed je dodeljeval slike PO INDEKSU iz skupnega CDN seznama
 * (sfile.chatglm.cn) → kartice lokalov/doživetij/izdelkov so prikazovale
 * napačne vnose (kavarna z Dravogradovim gozdom, kajak tura z goro Triglav,
 * penzion s sliko Ptuja …).
 *
 * Popravek: 31 AI-generiranih, VLM-potrjenih slik v public/content/marketplace/
 * (glej scripts/regen-marketplace-images.ts + verify-marketplace-images.ts;
 * seed-demo.ts sedaj dodeljuje slike PER ENTITETI).
 *
 * Ta migracija popravi OBSTOJEČE baze (Render Docker volumen in Vercel demo):
 * - za vsak slug v mapi: če images vsebuje stari CDN URL → zamenjaj z novimi
 *   lokalnimi potmi;
 * - IDENTITENTNA: vrstice brez CDN URL-jev (npr. že popravljene ali lastnikovo
 *   prilagojene) ostanejo nedotaknjene → varno večkratno poganjanje;
 * - nikoli ne meče — napaka se zalogira in zagon strežnika nadaljuje.
 *
 * Izklop: DSA_DISABLE_IMAGE_MIGRATION=1
 */

import { db } from "@/lib/db";
import type { PrismaClient } from "@prisma/client";

const MKT = (id: string) => `/content/marketplace/${id}.jpg`;
const imgs = (...ids: string[]) => JSON.stringify(ids.map(MKT));

/** Strukturalni tip, ki ga sprejme migracija (omogoča testiranje z lastnim klientom) */
type MarketplaceDb = Pick<PrismaClient, "listing" | "experience" | "product">;

/** slug → novi images JSON (identično scripts/seed-demo.ts) */
const LISTING_IMAGES: Record<string, string> = {
  "gostilna-pri-lipovcu": imgs("mp-gostilna", "mp-gostilna-jed"),
  "penzion-bohinj-ezerca": imgs("mp-penzion", "mp-penzion-soba"),
  "kmecki-wellness-hudicevec": imgs("mp-wellness-kmetija", "mp-savna"),
  "soca-avanture-bovec": imgs("mp-rafting", "mp-rafting-akcija"),
  "soline-piran-trgovina": imgs("mp-soline", "mp-sol-izdelki"),
  "vinski-klet-ptuj": imgs("mp-vinska-klet", "mp-degustacija"),
  "planinski-vodnik-triglav-milan": imgs("mp-vodnik", "mp-koca"),
  "kavarna-zvezda-ljubljana": imgs("mp-kavarna", "mp-torta"),
  "postojna-jama-partner": imgs("mp-jama-vlak", "mp-jama-kapniki"),
  "piran-sunset-kayak": imgs("mp-kajak", "mp-kajak-blizu"),
};

const EXPERIENCE_IMAGES: Record<string, string> = {
  "rafting-na-soci-tura": imgs("mp-rafting", "mp-rafting-akcija"),
  "kanjoning-soteska-susec": imgs("mp-kanjoning", "mp-korita"),
  "degustacija-stajerskih-vin": imgs("mp-vinska-klet", "mp-degustacija"),
  "triglav-v-dveh-dneh": imgs("mp-vodnik", "mp-koca"),
  "kmecka-delavnica-sir": imgs("mp-sir", "mp-sir-miza"),
  "wellness-dan-na-kmetiji": imgs("mp-wellness-kmetija", "mp-savna"),
  "soncni-zahod-kajak-piran": imgs("mp-kajak-blizu", "mp-kajak"),
  "solinarska-tura-soline": imgs("mp-soline", "mp-sol-izdelki"),
  "kuharska-delavnica-stajerskih-jedi": imgs("mp-kuharska", "mp-gostilna-jed"),
  "vodeni-ogled-postojnske-jame": imgs("mp-jama-vlak", "mp-jama-kapniki"),
};

const PRODUCT_IMAGES: Record<string, string> = {
  "piranski-solni-cvet-250": imgs("mp-solni-cvet"),
  "kranjski-med-cvetni-500": imgs("mp-med"),
  "stajersko-bucno-olje-250": imgs("mp-bucno-olje"),
  "refosk-premium-075": imgs("mp-refosk"),
  "volnena-kapa-triglav": imgs("mp-kapa"),
  "darilni-paket-soca": imgs("mp-darilni"),
};

const OLD_CDN_MARKER = "sfile.chatglm.cn";

export interface MigrationResult {
  listingsUpdated: number;
  experiencesUpdated: number;
  productsUpdated: number;
  skipped: number;
}

export async function migrateMarketplaceImagesWith(
  client: MarketplaceDb,
): Promise<MigrationResult> {
  const result: MigrationResult = {
    listingsUpdated: 0,
    experiencesUpdated: 0,
    productsUpdated: 0,
    skipped: 0,
  };

  // ── Listingi ─────────────────────────────────────────────────────────────
  for (const [slug, images] of Object.entries(LISTING_IMAGES)) {
    const row = await client.listing.findUnique({ where: { slug } });
    if (!row) { result.skipped++; continue; }
    if (!row.images.includes(OLD_CDN_MARKER)) { result.skipped++; continue; }
    await client.listing.update({ where: { id: row.id }, data: { images } });
    result.listingsUpdated++;
  }

  // ── Izkušnje ─────────────────────────────────────────────────────────────
  for (const [slug, images] of Object.entries(EXPERIENCE_IMAGES)) {
    const row = await client.experience.findUnique({ where: { slug } });
    if (!row) { result.skipped++; continue; }
    if (!row.images.includes(OLD_CDN_MARKER)) { result.skipped++; continue; }
    await client.experience.update({ where: { id: row.id }, data: { images } });
    result.experiencesUpdated++;
  }

  // ── Izdelki ──────────────────────────────────────────────────────────────
  for (const [slug, images] of Object.entries(PRODUCT_IMAGES)) {
    const row = await client.product.findUnique({ where: { slug } });
    if (!row) { result.skipped++; continue; }
    if (!row.images.includes(OLD_CDN_MARKER)) { result.skipped++; continue; }
    await client.product.update({ where: { id: row.id }, data: { images } });
    result.productsUpdated++;
  }

  return result;
}

/** Produkcijski vstop — privzeti klient iz src/lib/db (instrumentation.ts). */
export async function migrateMarketplaceImages(): Promise<MigrationResult> {
  return migrateMarketplaceImagesWith(db);
}
