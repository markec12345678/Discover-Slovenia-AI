/**
 * ZAGONSKA SHEMA MIGRACIJA — ISSUE #4 §15 (val 4): DOKUMENTI POTI
 *
 * Doda (additive-only, idempotentno):
 *   - tabela: TripDocument (+ 2 indeksa, kot jih ustvari db push)
 *
 * Lastnosti (isti kanon kot trip-truth-migration, dokazano):
 *   - IDEMPOTENTNA (drugi zagon ne doda ničesar);
 *   - ADDITIVE-ONLY (nikoli ne briše/spreminja obstoječih podatkov);
 *   - FAIL-OPEN (napaka se zalogira, zagon se nadaljuje);
 *   - izklop: DSA_DISABLE_SCHEMA_MIGRATION=1 (skupna zastavica).
 */

import type { PrismaClient } from "@prisma/client";

type SchemaDb = Pick<PrismaClient, "$queryRawUnsafe" | "$executeRawUnsafe">;

export interface TripDocumentsSchemaResult {
  dialect: "sqlite" | "postgres" | "unknown";
  tablesCreated: string[];
}

const TRIP_DOCUMENT_DDL = {
  postgres: `CREATE TABLE "TripDocument" (
    "id" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "url" TEXT,
    "bookingId" TEXT,
    "dayIndex" INTEGER,
    "authorName" TEXT,
    "authorClientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TripDocument_pkey" PRIMARY KEY ("id")
  )`,
  sqlite: `CREATE TABLE IF NOT EXISTS "TripDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shareId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "url" TEXT,
    "bookingId" TEXT,
    "dayIndex" INTEGER,
    "authorName" TEXT,
    "authorClientId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  indexes: [
    `CREATE INDEX IF NOT EXISTS "TripDocument_shareId_idx" ON "TripDocument"("shareId")`,
    `CREATE INDEX IF NOT EXISTS "TripDocument_type_idx" ON "TripDocument"("type")`,
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
        "PRAGMA table_info(TripDocument)"
      )) as Array<Record<string, unknown>>;
      return Array.isArray(rows) && rows.length > 0;
    } catch {
      return false;
    }
  }
  try {
    const rows = (await client.$queryRawUnsafe(
      "SELECT 1 FROM information_schema.tables WHERE table_name = 'TripDocument' LIMIT 1"
    )) as unknown[];
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

export async function migrateTripDocumentsSchemaWith(
  client: SchemaDb
): Promise<TripDocumentsSchemaResult> {
  const dialect = await detectDialect(client);
  if (dialect === "unknown") {
    return { dialect, tablesCreated: [] };
  }

  const tablesCreated: string[] = [];

  if (!(await tableExists(client, dialect))) {
    const ddl =
      dialect === "postgres"
        ? TRIP_DOCUMENT_DDL.postgres
        : TRIP_DOCUMENT_DDL.sqlite;
    await client.$executeRawUnsafe(ddl);
    for (const idx of TRIP_DOCUMENT_DDL.indexes) {
      await client.$executeRawUnsafe(idx);
    }
    tablesCreated.push("TripDocument");
  } else {
    // Tabela obstaja (db push že zagnan) — samo indeksi (idempotentno).
    for (const idx of TRIP_DOCUMENT_DDL.indexes) {
      await client.$executeRawUnsafe(idx);
    }
  }

  return { dialect, tablesCreated };
}

/** Produktijski vnos (privzeti db klient iz @/lib/db). */
export async function migrateTripDocumentsSchema(): Promise<TripDocumentsSchemaResult> {
  const { db } = await import("@/lib/db");
  return migrateTripDocumentsSchemaWith(db);
}
