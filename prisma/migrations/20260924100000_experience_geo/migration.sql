-- TASK 87 (1.78.0): geo stolpca Experience (lat/lng) — pin izkušnje na
-- supply zemljevidu (providers/own/adapter.ts, drugi vir poleg Listing).
-- Oba stolpca sta NEOBVEZNA (null = izkušnja brez pina; adapter tak
-- zapis iskreno izpusti — nikoli ne izmišljamo lokacije).
--
-- Dvoje poti aplikacije (ista arhitektura kot TASK 84/listing_geo):
--  1. TA datoteka: zgodovinsko-vrstična resnica za `prisma migrate deploy`
--     in CI drift vrata (migrations ⇄ schema) — noben avtomatski deploy
--     korak je NE aplicira.
--  2. STARTUP shema migracija src/lib/experience-geo-migration.ts
--     (idempotentna, additive-only, fail-open, obe narečji) — DEJANSKI
--     mehanizem, ki stolpce doda obstoječim bazam ob zagonu (Render/Neon/
--     dev sqlite). Registrirana v instrumentation.ts kot
--     schema:experience-geo.

-- AlterTable
ALTER TABLE "Experience" ADD COLUMN "lat" DOUBLE PRECISION;
ALTER TABLE "Experience" ADD COLUMN "lng" DOUBLE PRECISION;
