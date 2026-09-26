-- TASK 8 / F2-A (Issue #8 Faza 2): strežniška refleksija zbirke "Moja pot".
--
-- Tabela UserTripItem — ena vrstica = en predmet zbirke referenc
-- (localStorage dai:my-trip-items), ki se ob prijavi B2C uporabnika prenese
-- v račun (union-merge, nikoli destruktivno) → iste ideje so dostopne iz
-- katere koli naprave (Google Maps "Want to go" vzorec). Odstranjevanja se
-- širijo z eksplicitnimi DELETE (diff-sync v src/lib/my-trip-sync.ts).
--
-- Isti kanon sanitizacije kot klient (src/lib/my-trip.ts): kind whitelist,
-- dolžine nizov, SAMO notranji href (startsWith "/"). Brez PII — samo javni
-- povzetki, ki so tako ali tako vidni na karticah odkrivanja. FIFO kapa 200
-- na uporabnika (najstarejša addedAt odpade — enako kot localStorage).
--
-- Produkcija (Render/Neon): tabelo ustvari STARTUP shema migracija
-- src/lib/user-trip-items-migration.ts (idempotentno CREATE ... IF NOT EXISTS,
-- ista pot kot payout-ledger/experience-availability) — ta SQL je
-- zgodovinsko-vrstična resnica za `prisma migrate deploy` in CI drift vrata.

-- CreateTable
CREATE TABLE "UserTripItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "href" TEXT NOT NULL,
    "image" TEXT,
    "source" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTripItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserTripItem_userId_kind_refId_key" ON "UserTripItem"("userId", "kind", "refId");
CREATE INDEX "UserTripItem_userId_idx" ON "UserTripItem"("userId");

-- AddForeignKey
ALTER TABLE "UserTripItem" ADD CONSTRAINT "UserTripItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
