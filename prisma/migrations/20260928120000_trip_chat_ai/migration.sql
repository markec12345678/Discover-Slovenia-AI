-- W2 (Issue #15, 1.131.0): SKUPINSKI KLEPET Z @AI na /pot/[shareId].
--
-- TripComment dobi dva ADITIVNA stolpca (nikoli destruktivno):
--   - isAI (BOOLEAN NOT NULL DEFAULT false) — vrstica AI svetovalca;
--     izda jo IZKLJUČNO strežniška pot /api/trip-comments/ai-reply
--     (isti deterministični pogon kot /api/chat — 0 runtime LLM klicev).
--     POST /api/trip-comments zavrne rezervirana imena, da ljudje ne
--     morejo ponarediti značke.
--   - payload (TEXT NULL) — JSON { places, sources } samo za AI vrstice:
--     predlogi krajev za gumb "Dodaj v pot" (isti kanon kot klepet "+")
--     + citati uradnih virov STO. Klient veljavnost ponovno preveri.
--
-- Produkcija (Vercel/Neon): stolpca ustvari STARTUP shema migracija
-- src/lib/trip-chat-migration.ts (idempotentno ADD COLUMN IF NOT EXISTS,
-- ista pot kot user-trip-items/payout-ledger) — ta SQL je zgodovinsko-
-- vrstična resnica za `prisma migrate deploy` in CI drift vrata.

-- AlterTable
ALTER TABLE "TripComment" ADD COLUMN "isAI" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TripComment" ADD COLUMN "payload" TEXT;
