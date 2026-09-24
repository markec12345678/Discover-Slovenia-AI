-- TASK 58 (1.59.0): kanonična potrditev rezervacije ZUNANJEGA ponudnika (§19).
--
-- Drift zaprt v 1.74.3 (TASK 81): model JourneyBooking je bil commitan v
-- schema.prisma BREZ migracije — CI vrata "Migration drift check
-- (migrations ⇄ schema)" bi to odkrila, a je bil Build job od 1.59.0 naprej
-- stalno SKIPPED (needs: quality; quality je padal na tsc), zato je drift
-- tiho živel 16+ verzij. Poglej CHANGELOG 1.74.3.
--
-- Produkcija (Neon): tabela se ustvari prek STARTUP shema migracije
-- src/lib/journey-booking-migration.ts (idempotentno CREATE ... IF NOT
-- EXISTS, ista pot kot F11/F12) — te SQL datoteke NE aplicira noben
-- avtomatski deploy korak; je zgodovinsko-vrstična resnica za
-- `prisma migrate deploy` in CI drift vrata.
--
-- TASK 99 (issue #1 §2): dodan stolpec "sessionKey" (efemerni obseg seje
-- za MY TRIP prekrivko — vrstice brez shareId ne puščajo med uporabniki)
-- + 4. indeks. Obstoječe baze dobijo stolpec z idempotentnim ALTER prek
-- startup migracije (ADD COLUMN IF NOT EXISTS / narečno-varno).
--
-- ISSUE #4 §4 (val 3): dodana stolpca "source" (izvor zapisa:
-- USER/IMPORTED/PROVIDER/null-legacy) in "importData" (ekstrahirani/
-- ročni podatki rezervacije) + 5. indeks (source). Obstoječe baze: startup
-- migracija journey-booking-migration.ts (idempotenten healing ALTER).

-- CreateTable
CREATE TABLE "JourneyBooking" (
    "id" TEXT NOT NULL,
    "shareId" TEXT,
    "sessionKey" TEXT,
    "provider" TEXT NOT NULL,
    "providerProductId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerBookingId" TEXT,
    "confirmedPrice" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "confirmationUrl" TEXT,
    "cancellationUrl" TEXT,
    "providerPayload" TEXT,
    "source" TEXT,
    "importData" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "JourneyBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JourneyBooking_shareId_idx" ON "JourneyBooking"("shareId");
CREATE INDEX "JourneyBooking_sessionKey_idx" ON "JourneyBooking"("sessionKey");
CREATE INDEX "JourneyBooking_provider_providerProductId_idx" ON "JourneyBooking"("provider", "providerProductId");
CREATE INDEX "JourneyBooking_status_idx" ON "JourneyBooking"("status");
CREATE INDEX "JourneyBooking_source_idx" ON "JourneyBooking"("source");
