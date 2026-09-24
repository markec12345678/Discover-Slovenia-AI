/**
 * ZAGONSKA SHEMA MIGRACIJA — ISSUE #4 §22 (val 5): REVIZIJE VSEBINE POTI
 *
 * Doda (additive-only, idempotentno):
 *   - tabela: SavedItineraryRevision (+ 2 indeksa, kot jih ustvari db push)
 *
 * Lastnosti (isti kanon kot trip-documents-migration, dokazano):
 *   - IDEMPOTENTNA (drugi zagon ne doda ničesar);
 *   - ADDITIVE-ONLY (nikoli ne briše/spreminja obstoječih podatkov);
 *   - FAIL-OPEN (napaka se zalogira, zagon se nadaljuje);
 *   - izklop: DSA_DISABLE_SCHEMA_MIGRATION=1 (skupna zastavica).
 */

import type { PrismaClient } from "@prisma/client";

type SchemaDb = Pick<PrismaClient, "$queryRawUnsafe" | "$executeRawUnsafe">;

export interface TripRevisionsSchemaResult {
  dialect: "sqlite" | "postgres" | "unknown";
  tablesCreated: string[];
}

const TRIP_REVISION_DDL = {
  postgres: `CREATE TABLE "SavedItineraryRevision" (
    "id" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "itinerary" TEXT NOT NULL,
    "name" TEXT,
    "authorId" TEXT,
    "authorRole" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavedItineraryRevision_pkey" PRIMARY KEY ("id")
  )`,
  sqlite: `CREATE TABLE IF NOT EXISTS "SavedItineraryRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shareId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "itinerary" TEXT NOT NULL,
    "name" TEXT,
    "authorId" TEXT,
    "authorRole" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  indexes: [
    `CREATE INDEX IF NOT EXISTS "SavedItineraryRevision_shareId_version_idx" ON "SavedItineraryRevision"("shareId", "version")`,
    `CREATE INDEX IF NOT EXISTS "SavedItineraryRevision_createdAt_idx" ON "SavedItineraryRevision"("createdAt")`,
  ],
};

async function detectDialect(
  client: SchemaDb
): Promise<"sqlite" | "postgres" | "unknown"> {
  try {
    const rows = (await client.$queryRawUnsafe(
      "PRAGMA table_info(SavedItinerary)"
    )) as unknown[];
    if (Array.isArray(rows)) return "sqlite";
  } catch {
    // postgres → PRAGMA je sintaksna napaka
  }
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

async function tableExists(
  client: SchemaDb,
  dialect: "sqlite" | "postgres"
): Promise<boolean> {
  if (dialect === "sqlite") {
    try {
      const rows = (await client.$queryRawUnsafe(
        "PRAGMA table_info(SavedItineraryRevision)"
      )) as Array<Record<string, unknown>>;
      return Array.isArray(rows) && rows.length > 0;
    } catch {
      return false;
    }
  }
  try {
    const rows = (await client.$queryRawUnsafe(
      "SELECT 1 FROM information_schema.tables WHERE table_name = 'SavedItineraryRevision' LIMIT 1"
    )) as unknown[];
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

export async function migrateTripRevisionsSchemaWith(
  client: SchemaDb
): Promise<TripRevisionsSchemaResult> {
  const dialect = await detectDialect(client);
  if (dialect === "unknown") {
    return { dialect, tablesCreated: [] };
  }

  const tablesCreated: string[] = [];

  if (!(await tableExists(client, dialect))) {
    const ddl =
      dialect === "postgres"
        ? TRIP_REVISION_DDL.postgres
        : TRIP_REVISION_DDL.sqlite;
    await client.$executeRawUnsafe(ddl);
    for (const idx of TRIP_REVISION_DDL.indexes) {
      await client.$executeRawUnsafe(idx);
    }
    tablesCreated.push("SavedItineraryRevision");
  } else {
    // Tabela obstaja (db push že zagnan) — samo indeksi (idempotentno).
    for (const idx of TRIP_REVISION_DDL.indexes) {
      await client.$executeRawUnsafe(idx);
    }
  }

  return { dialect, tablesCreated };
}

/** Produktijski vnos (privzeti db klient iz @/lib/db). */
export async function migrateTripRevisionsSchema(): Promise<TripRevisionsSchemaResult> {
  const { db } = await import("@/lib/db");
  return migrateTripRevisionsSchemaWith(db);
}
