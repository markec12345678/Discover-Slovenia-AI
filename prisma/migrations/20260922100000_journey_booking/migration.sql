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

-- CreateTable
CREATE TABLE "JourneyBooking" (
    "id" TEXT NOT NULL,
    "shareId" TEXT,
    "provider" TEXT NOT NULL,
    "providerProductId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerBookingId" TEXT,
    "confirmedPrice" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "confirmationUrl" TEXT,
    "cancellationUrl" TEXT,
    "providerPayload" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "JourneyBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JourneyBooking_shareId_idx" ON "JourneyBooking"("shareId");
CREATE INDEX "JourneyBooking_provider_providerProductId_idx" ON "JourneyBooking"("provider", "providerProductId");
CREATE INDEX "JourneyBooking_status_idx" ON "JourneyBooking"("status");
