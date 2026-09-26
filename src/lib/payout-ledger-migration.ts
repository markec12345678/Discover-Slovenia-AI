/**
 * ZAGONSKA SHEMA MIGRACIJA — TASK 34 PAYOUT LEDGER (Tier 2 #2)
 *
 * Ustvari tabeli PayoutEntry (knjigovodska postavka po rezervaciji — snapshot
 * bruto/stopnja/provizija/neto za plačane nepreklicane rezervacije lastnikovih
 * izkušenj) in PayoutSettlement (mesečna poravnava — izjava o uskladitvi
 * evidence, brez prenosov denarja) na obstoječih bazah — Render/Neon nima
 * ročnega `prisma migrate deploy` koraka v deployu, zato je ta startup pot
 * (instrumentation.ts) DEJANSKI mehanizem aplikacije. Zgodovinsko-vrstična
 * migracija živi v prisma/migrations/20260927090000_payout_ledger/.
 *
 * Mandat docs/COMPETITIVE-ANALYSIS.md B3: "Payout ledger / settlement report —
 * računovodstvo ponudnika (kdor je dobil koliko)".
 *
 * Lastnosti (enako kot ostale startup shema migracije):
 *   - IDEMPOTENTNA: drugi zagon ne ustvari ničesar (poizvedba obstoja +
 *     IF NOT EXISTS);
 *   - ADDITIVE-ONLY: nikoli ne briše ali spreminja obstoječih tabel;
 *   - FAIL-OPEN: napaka se zalogira, zagon strežnika se nadaljuje
 *     (vidno prek /api/health startup korakov);
 *   - Izklop: DSA_DISABLE_SCHEMA_MIGRATION=1 (skupna zastavica).
 */

import type { PrismaClient } from "@prisma/client";

/** Strukturalni tip, ki ga sprejme migracija (testiranje z lastnim klientom). */
type SchemaDb = Pick<PrismaClient, "$queryRawUnsafe" | "$executeRawUnsafe">;

export interface PayoutLedgerMigrationResult {
  dialect: "sqlite" | "postgres" | "unknown";
  /** Ustvarjene tabele (prazen seznam = vse je že obstajalo). */
  tablesCreated: string[];
}

/** Zazna narečje obstoječe baze (ista logika kot ostale migracije). */
async function detectDialect(
  client: SchemaDb
): Promise<"sqlite" | "postgres" | "unknown"> {
  // 1) SQLite: PRAGMA uspe SAMO na sqlite (na postgresu sintaksna napaka)
  try {
    const rows = (await client.$queryRawUnsafe(
      "PRAGMA table_info(SavedItinerary)"
    )) as unknown[];
    if (Array.isArray(rows)) return "sqlite";
  } catch {
    // Postgres: PRAGMA je sintaksna napaka → preskusi information_schema
  }

  // 2) Postgres: information_schema uspe na postgres
  try {
    const rows = (await client.$queryRawUnsafe(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'SavedItinerary' LIMIT 1"
    )) as unknown[];
    if (Array.isArray(rows)) return "postgres";
  } catch {
    // fail-open spodaj
  }

  return "unknown";
}

/** Ali tabela obstaja (poizvedba, ne izjema — za poročanje). */
async function tableExists(
  client: SchemaDb,
  dialect: "sqlite" | "postgres",
  table: string
): Promise<boolean> {
  if (dialect === "sqlite") {
    const rows = (await client.$queryRawUnsafe(
      `PRAGMA table_info(${table})`
    )) as unknown[];
    return Array.isArray(rows) && rows.length > 0;
  }
  const rows = (await client.$queryRawUnsafe(
    `SELECT 1 FROM information_schema.tables WHERE table_name = '${table}' LIMIT 1`
  )) as unknown[];
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * Ustvari tabeli payout ledgerja, če manjkata (+ indeksi). Vedno varna za
 * ponovno poganjanje; nikoli ne meče (fail-open v ovojnici
 * instrumentation.ts).
 */
export async function migratePayoutLedgerTablesWith(
  client: SchemaDb
): Promise<PayoutLedgerMigrationResult> {
  const dialect = await detectDialect(client);
  if (dialect === "unknown") {
    return { dialect, tablesCreated: [] };
  }

  const tablesCreated: string[] = [];

  // ── PayoutEntry (knjigovodska postavka po rezervaciji) ───────────────────
  if (!(await tableExists(client, dialect, "PayoutEntry"))) {
    await client.$executeRawUnsafe(
      dialect === "postgres"
        ? `CREATE TABLE "PayoutEntry" (
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
           )`
        : `CREATE TABLE IF NOT EXISTS "PayoutEntry" (
             "id" TEXT NOT NULL PRIMARY KEY,
             "ownerId" TEXT NOT NULL,
             "bookingId" TEXT NOT NULL,
             "bookingNumber" TEXT NOT NULL,
             "experienceName" TEXT NOT NULL,
             "bookingDate" DATETIME NOT NULL,
             "groupSize" INTEGER NOT NULL,
             "source" TEXT,
             "grossAmount" REAL NOT NULL,
             "rate" REAL NOT NULL DEFAULT 0,
             "commissionAmount" REAL NOT NULL DEFAULT 0,
             "netAmount" REAL NOT NULL DEFAULT 0,
             "currency" TEXT NOT NULL DEFAULT 'EUR',
             "periodStart" DATETIME NOT NULL,
             "periodEnd" DATETIME NOT NULL,
             "status" TEXT NOT NULL DEFAULT 'pending',
             "settlementId" TEXT,
             "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
             "settledAt" DATETIME
           )`
    );
    tablesCreated.push("PayoutEntry");
  }

  // ── PayoutSettlement (mesečna poravnava) ─────────────────────────────────
  if (!(await tableExists(client, dialect, "PayoutSettlement"))) {
    await client.$executeRawUnsafe(
      dialect === "postgres"
        ? `CREATE TABLE "PayoutSettlement" (
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
           )`
        : `CREATE TABLE IF NOT EXISTS "PayoutSettlement" (
             "id" TEXT NOT NULL PRIMARY KEY,
             "ownerId" TEXT NOT NULL,
             "settlementNumber" TEXT NOT NULL,
             "periodStart" DATETIME NOT NULL,
             "periodEnd" DATETIME NOT NULL,
             "entryCount" INTEGER NOT NULL DEFAULT 0,
             "grossTotal" REAL NOT NULL DEFAULT 0,
             "commissionTotal" REAL NOT NULL DEFAULT 0,
             "netTotal" REAL NOT NULL DEFAULT 0,
             "currency" TEXT NOT NULL DEFAULT 'EUR',
             "status" TEXT NOT NULL DEFAULT 'pending',
             "method" TEXT NOT NULL DEFAULT 'manual',
             "settledAt" DATETIME,
             "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
           )`
    );
    tablesCreated.push("PayoutSettlement");
  }

  // ── Indeksi (obe narečji podpirata IF NOT EXISTS) ────────────────────────
  await client.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "PayoutEntry_bookingId_key" ON "PayoutEntry"("bookingId")`
  );
  await client.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "PayoutEntry_ownerId_idx" ON "PayoutEntry"("ownerId")`
  );
  await client.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "PayoutEntry_status_idx" ON "PayoutEntry"("status")`
  );
  await client.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "PayoutEntry_periodStart_idx" ON "PayoutEntry"("periodStart")`
  );
  await client.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "PayoutEntry_settlementId_idx" ON "PayoutEntry"("settlementId")`
  );
  await client.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "PayoutSettlement_settlementNumber_key" ON "PayoutSettlement"("settlementNumber")`
  );
  await client.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "PayoutSettlement_ownerId_periodStart_key" ON "PayoutSettlement"("ownerId", "periodStart")`
  );
  await client.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "PayoutSettlement_ownerId_idx" ON "PayoutSettlement"("ownerId")`
  );
  await client.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "PayoutSettlement_status_idx" ON "PayoutSettlement"("status")`
  );
  await client.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "PayoutSettlement_periodStart_idx" ON "PayoutSettlement"("periodStart")`
  );

  return { dialect, tablesCreated };
}

/**
 * Produkcijska ovojnica — uporabi globalni db klient (iz src/lib/db).
 * LAZY uvoz db (enako kot ostale migracije).
 */
export async function migratePayoutLedgerTables(): Promise<PayoutLedgerMigrationResult> {
  const { db } = await import("@/lib/db");
  return migratePayoutLedgerTablesWith(db);
}
