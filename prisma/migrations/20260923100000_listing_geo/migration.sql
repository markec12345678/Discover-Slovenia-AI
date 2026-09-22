-- TASK 84 (1.75.0): geo stolpca Listing (lat/lng) — pin lastne tržnice na
-- supply zemljevidu (providers/own/adapter.ts). Oba stolpca sta NEOBVEZNA
-- (null = listing brez pina; adapter tak listing iskreno izpusti — nikoli
-- ne izmišljamo lokacije).
--
-- Dvoje poti aplikacije (ista arhitektura kot JourneyBooking/TASK 81):
--  1. TA datoteka: zgodovinsko-vrstična resnica za `prisma migrate deploy`
--     in CI drift vrata (migrations ⇄ schema) — noben avtomatski deploy
--     korak je NE aplicira.
--  2. STARTUP shema migracija src/lib/listing-geo-migration.ts
--     (idempotentna, additive-only, fail-open, obe narečji) — DEJANSKI
--     mehanizem, ki stolpce doda obstoječim bazam ob zagonu (Render/Neon/
--     dev sqlite). Registrirana v instrumentation.ts kot schema:listing-geo.

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN "lat" DOUBLE PRECISION;
ALTER TABLE "Listing" ADD COLUMN "lng" DOUBLE PRECISION;
