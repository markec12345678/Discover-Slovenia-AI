/**
 * ZAGONSKA SHEMA MIGRACIJA — TASK 33 KOLEDAR RAZPOLOŽLJIVOSTI (Tier 2 #1)
 *
 * Ustvari tabeli ExperienceAvailability (1:1 nastavitve izkušnje: privzeta
 * dnevna kapaciteta + sezonsko okno) in ExperienceAvailabilityDay (dnevni
 * prepis: blackout / izjemni dan s kapaciteto) na obstoječih bazah —
 * Render/Neon nima ročnega `prisma migrate deploy` koraka v deployu, zato je
 * ta startup pot (instrumentation.ts) DEJANSKI mehanizem aplikacije.
 * Zgodovinsko-vrstična migracija živi v
 * prisma/migrations/20260926140000_experience_availability/.
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

export interface ExperienceAvailabilityMigrationResult {
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
 * Ustvari tabeli koledarja razpoložljivosti, če manjkata (+ indeksi).
 * Vedno varna za ponovno poganjanje; nikoli ne meče (fail-open v ovojnici
 * instrumentation.ts).
 */
export async function migrateExperienceAvailabilityTablesWith(
  client: SchemaDb
): Promise<ExperienceAvailabilityMigrationResult> {
  const dialect = await detectDialect(client);
  if (dialect === "unknown") {
    return { dialect, tablesCreated: [] };
  }

  const tablesCreated: string[] = [];

  // ── ExperienceAvailability (nastavitve, 1:1) ─────────────────────────────
  if (!(await tableExists(client, dialect, "ExperienceAvailability"))) {
    await client.$executeRawUnsafe(
      dialect === "postgres"
        ? `CREATE TABLE "ExperienceAvailability" (
             "id" TEXT NOT NULL,
             "experienceId" TEXT NOT NULL,
             "defaultCapacity" INTEGER,
             "seasonStart" TEXT,
             "seasonEnd" TEXT,
             "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
             "updatedAt" TIMESTAMP(3) NOT NULL,
             CONSTRAINT "ExperienceAvailability_pkey" PRIMARY KEY ("id")
           )`
        : `CREATE TABLE IF NOT EXISTS "ExperienceAvailability" (
             "id" TEXT NOT NULL PRIMARY KEY,
             "experienceId" TEXT NOT NULL,
             "defaultCapacity" INTEGER,
             "seasonStart" TEXT,
             "seasonEnd" TEXT,
             "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
             "updatedAt" DATETIME NOT NULL
           )`
    );
    tablesCreated.push("ExperienceAvailability");
  }

  // ── ExperienceAvailabilityDay (dnevni prepis) ────────────────────────────
  if (!(await tableExists(client, dialect, "ExperienceAvailabilityDay"))) {
    await client.$executeRawUnsafe(
      dialect === "postgres"
        ? `CREATE TABLE "ExperienceAvailabilityDay" (
             "id" TEXT NOT NULL,
             "experienceId" TEXT NOT NULL,
             "date" TEXT NOT NULL,
             "status" TEXT NOT NULL DEFAULT 'open',
             "capacity" INTEGER,
             "note" TEXT,
             "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
             "updatedAt" TIMESTAMP(3) NOT NULL,
             CONSTRAINT "ExperienceAvailabilityDay_pkey" PRIMARY KEY ("id")
           )`
        : `CREATE TABLE IF NOT EXISTS "ExperienceAvailabilityDay" (
             "id" TEXT NOT NULL PRIMARY KEY,
             "experienceId" TEXT NOT NULL,
             "date" TEXT NOT NULL,
             "status" TEXT NOT NULL DEFAULT 'open',
             "capacity" INTEGER,
             "note" TEXT,
             "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
             "updatedAt" DATETIME NOT NULL
           )`
    );
    tablesCreated.push("ExperienceAvailabilityDay");
  }

  // ── Indeksi (obe narečji podpirata IF NOT EXISTS) ────────────────────────
  await client.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "ExperienceAvailability_experienceId_key" ON "ExperienceAvailability"("experienceId")`
  );
  await client.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "ExperienceAvailability_experienceId_idx" ON "ExperienceAvailability"("experienceId")`
  );
  await client.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "ExperienceAvailabilityDay_experienceId_date_key" ON "ExperienceAvailabilityDay"("experienceId", "date")`
  );
  await client.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "ExperienceAvailabilityDay_experienceId_idx" ON "ExperienceAvailabilityDay"("experienceId")`
  );

  return { dialect, tablesCreated };
}

/**
 * Produkcijska ovojnica — uporabi globalni db klient (iz src/lib/db).
 * LAZY uvoz db (enako kot ostale migracije).
 */
export async function migrateExperienceAvailabilityTables(): Promise<ExperienceAvailabilityMigrationResult> {
  const { db } = await import("@/lib/db");
  return migrateExperienceAvailabilityTablesWith(db);
}
