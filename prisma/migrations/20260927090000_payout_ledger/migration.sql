-- TASK 34 (1.111.0, Tier 2 #2): payout ledger / mesečne poravnave.
--
-- Mandat docs/COMPETITIVE-ANALYSIS.md B3: "Payout ledger / settlement report —
-- računovodstvo ponudnika (kdor je dobil koliko)". DETERMINISTIČNO brez
-- prenosov denarja (B2 — Stripe Connect/PayPal izplačila — ostaja prihodnji
-- korak, enak "najprej funkcionalna celota" pristop kot pri provizijah):
--   - PayoutEntry     — knjigovodska postavka po rezervaciji (snapshot):
--     bruto / stopnja / provizija / neto. Nastane IZKLJUČNO za plačane
--     (paymentStatus "paid"), nepreklicane (confirmed/completed) rezervacije
--     lastnikovih izkušenj (FW1 invariant — demo/unpaid NIKOLI ne vstopi);
--     @@unique("bookingId") varuje eno postavko na rezervacijo (idempotenten
--     sync);
--   - PayoutSettlement — mesečna poravnava (izjava): zajame VSE odprte
--     postavke do vključno poravnanega meseca; @@unique(ownerId, periodStart)
--     varuje eno poravnavo na obdobje. Status pending → settled je knjigovodska
--     potrditev uskladitve — NE prenos denarja.
--
-- Vir resnice zneskov je SNAPSHOT ob nastanku (kot CommissionInvoice.rate);
-- jedro logike je src/lib/payout-ledger.ts. Brez FK relacij (snapshot pristop
-- kot Booking — postavke so izpeljana evidenca).
--
-- Produkcija (Render/Neon): tabele se ustvarijo prek STARTUP shema migracije
-- src/lib/payout-ledger-migration.ts (idempotentno CREATE ... IF NOT EXISTS,
-- ista pot kot experience-availability/journey-booking) — ta SQL je
-- zgodovinsko-vrstična resnica za `prisma migrate deploy` in CI drift vrata.

-- CreateTable
CREATE TABLE "PayoutEntry" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "bookingNumber" TEXT NOT NULL,
    "experienceName" TEXT NOT NULL,
    "bookingDate" TIMESTAMP(3) NOT NULL,
    "groupSize" INTEGER NOT NULL,
    "source" TEXT,
    "grossAmount" DOUBLE PRECISION NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "commissionAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "settlementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),
    CONSTRAINT "PayoutEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutSettlement" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "settlementNumber" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "entryCount" INTEGER NOT NULL DEFAULT 0,
    "grossTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "commissionTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "method" TEXT NOT NULL DEFAULT 'manual',
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayoutSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayoutEntry_bookingId_key" ON "PayoutEntry"("bookingId");
CREATE INDEX "PayoutEntry_ownerId_idx" ON "PayoutEntry"("ownerId");
CREATE INDEX "PayoutEntry_status_idx" ON "PayoutEntry"("status");
CREATE INDEX "PayoutEntry_periodStart_idx" ON "PayoutEntry"("periodStart");
CREATE INDEX "PayoutEntry_settlementId_idx" ON "PayoutEntry"("settlementId");
CREATE UNIQUE INDEX "PayoutSettlement_settlementNumber_key" ON "PayoutSettlement"("settlementNumber");
CREATE UNIQUE INDEX "PayoutSettlement_ownerId_periodStart_key" ON "PayoutSettlement"("ownerId", "periodStart");
CREATE INDEX "PayoutSettlement_ownerId_idx" ON "PayoutSettlement"("ownerId");
CREATE INDEX "PayoutSettlement_status_idx" ON "PayoutSettlement"("status");
CREATE INDEX "PayoutSettlement_periodStart_idx" ON "PayoutSettlement"("periodStart");
