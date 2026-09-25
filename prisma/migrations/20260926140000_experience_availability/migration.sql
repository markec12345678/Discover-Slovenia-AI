-- TASK 33 (1.110.0, Tier 2 #1): koledar razpoložljivosti izkušnje.
--
-- Mandat docs/COMPETITIVE-ANALYSIS.md (C1 / priporočilo #3): "vsaj
-- kapaciteta/dan + blackout datumi (prepreči overbooking pri 10 ponudnikih)".
-- Dve novi tabeli, ADDITIVE-ONLY, DORMANT brez vrstic (brez nastavitev je
-- rezervacija neomejena — obstoječe obnašanje se NE spremeni):
--   - ExperienceAvailability     — 1:1 nastavitve izkušnje (privzeta dnevna
--     kapaciteta + sezonsko okno; start > end = sezona čez konec leta);
--   - ExperienceAvailabilityDay  — dnevni prepis (blackout "closed" ali
--     izjemni dan "open" s prilagojeno kapaciteto), @@unique(experienceId,
--     date) varuje eno vrstico na dan.
--
-- Zasedenost dneva se šteje iz Booking.groupSize (status ≠ "cancelled") —
-- en vir resnice resolveDayPolicy v src/lib/experience-availability.ts;
-- preverba teče ZNOTRAJ SERIALIZABLE transakcije POST /api/bookings
-- (atomarna preprečitev overbookinga, isti P2034 retry vzorec kot dedup).
--
-- Produkcija (Render/Neon): tabele se ustvarijo prek STARTUP shema migracije
-- src/lib/experience-availability-migration.ts (idempotentno CREATE ... IF
-- NOT EXISTS, ista pot kot journey-booking/review-verified) — ta SQL je
-- zgodovinsko-vrstična resnica za `prisma migrate deploy` in CI drift vrata.

-- CreateTable
CREATE TABLE "ExperienceAvailability" (
    "id" TEXT NOT NULL,
    "experienceId" TEXT NOT NULL,
    "defaultCapacity" INTEGER,
    "seasonStart" TEXT,
    "seasonEnd" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExperienceAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperienceAvailabilityDay" (
    "id" TEXT NOT NULL,
    "experienceId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "capacity" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExperienceAvailabilityDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExperienceAvailability_experienceId_key" ON "ExperienceAvailability"("experienceId");
CREATE INDEX "ExperienceAvailability_experienceId_idx" ON "ExperienceAvailability"("experienceId");
CREATE UNIQUE INDEX "ExperienceAvailabilityDay_experienceId_date_key" ON "ExperienceAvailabilityDay"("experienceId", "date");
CREATE INDEX "ExperienceAvailabilityDay_experienceId_idx" ON "ExperienceAvailabilityDay"("experienceId");
