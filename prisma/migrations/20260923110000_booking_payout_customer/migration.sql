-- TASK 99 (issue #1 §10 — 1.87.1): Booking payout + customer state.
--
-- Vrzel odkrita v TASK 100: stolpca sta bila dodana SAMO v lokalni (sqlite)
-- različici schema.prisma — produkcijska (postgresql) shema in ta migracija
-- sta nastala šele v 1.87.1, zato je Vercel build padal na tipih od 1.86.0
-- (BookingSelect brez customerStatus; payoutStatus manjka v insertih).
--
-- Produkcija (Neon): stolpca na obstoječih bazah doda STARTUP shema
-- migracija src/lib/booking-state-migration.ts (idempotenten
-- ADD COLUMN IF NOT EXISTS / narečno-varna PRAGMA pot) — ta SQL datoteka
-- je zgodovinsko-vrstična resnica za `prisma migrate deploy` in CI drift
-- vrata (migrations ⇄ schema).
--
-- Privzetka sta VARNA in ISKRENA za obstoječe vrstice:
--   payoutStatus   'not_due'  — brez Stripe checkouta v produkciji ostane
--                               vsem iskreno "not_due" (demo/unpaid NIKOLI
--                               ne vstopi v provizijsko osnovo);
--   customerStatus 'none'     — noben gost ni zahteval preklica.

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "payoutStatus" TEXT NOT NULL DEFAULT 'not_due';
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "customerStatus" TEXT NOT NULL DEFAULT 'none';
