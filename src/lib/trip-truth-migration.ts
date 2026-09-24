/**
 * ZAGONSKA SHEMA MIGRACIJA — ISSUE #4 §4+§14 (val 3): REZERVACIJE + STROŠKI
 *
 * Doda (additive-only, idempotentno):
 *   - stolpci JourneyBooking: source / importData
 *   - tabela: TripExpense (+ indeksi, kot jih ustvari db push)
 *
 * Lastnosti (isti kanon kot trip-collaborator-migration, dokazano):
 *   - IDEMPOTENTNA (drugi zagon ne doda ničesar);
 *   - ADDITIVE-ONLY (nikoli ne briše/spreminja obstoječih podatkov);
 *   - FAIL-OPEN (napaka se zalogira, zagon se nadaljuje);
 *   - izklop: DSA_DISABLE_SCHEMA_MIGRATION=1 (skupna zastavica).
 */

import type { PrismaClient } from "@prisma/client";

type SchemaDb = Pick<PrismaClient, "$queryRawUnsafe" | "$executeRawUnsafe">;

export interface TripTruthSchemaResult {
  dialect: "sqlite" | "postgres" | "unknown";
  columnsAdded: string[];
  tablesCreated: string[];
}

/** Manjkajoči stolpci JourneyBooking (ime → SQL definicija po narečju). */
const JOURNEY_BOOKING_COLUMNS: Record<
  string,
  { sqlite: string; postgres: string }
> = {
  source: {
    sqlite: "TEXT",
    postgres: "TEXT",
  },
  importData: {
    sqlite: "TEXT",
    postgres: "TEXT",
  },
};

const TRIP_EXPENSE_DDL = {
  postgres: `CREATE TABLE "TripExpense" (
    "id" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "dayIndex" INTEGER,
    "label" TEXT NOT NULL,
    "amountEur" DOUBLE PRECISION NOT NULL,
    "kind" TEXT NOT NULL,
    "authorName" TEXT,
    "authorClientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TripExpense_pkey" PRIMARY KEY ("id")
  )`,
  sqlite: `CREATE TABLE IF NOT EXISTS "TripExpense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shareId" TEXT NOT NULL,
    "dayIndex" INTEGER,
    "label" TEXT NOT NULL,
    "amountEur" REAL NOT NULL,
    "kind" TEXT NOT NULL,
    "authorName" TEXT,
    "authorClientId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  indexes: [
    `CREATE INDEX IF NOT EXISTS "TripExpense_shareId_idx" ON "TripExpense"("shareId")`,
    `CREATE INDEX IF NOT EXISTS "TripExpense_kind_idx" ON "TripExpense"("kind")`,
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

async function listColumns(
  client: SchemaDb,
  dialect: "sqlite" | "postgres",
  table: string
): Promise<string[] | null> {
  try {
    if (dialect === "sqlite") {
      const rows = (await client.$queryRawUnsafe(
        `PRAGMA table_info(${table})`
      )) as Array<Record<string, unknown>>;
      return rows
        .map((r) => (typeof r.name === "string" ? r.name : null))
        .filter((n): n is string => n !== null);
    }
    const rows = (await client.$queryRawUnsafe(
      "SELECT column_name FROM information_schema.columns WHERE table_name = $1",
      table
    )) as Array<Record<string, unknown>>;
    return rows
      .map((r) => (typeof r.column_name === "string" ? r.column_name : null))
      .filter((n): n is string => n !== null);
  } catch {
    return null;
  }
}

async function tableExists(
  client: SchemaDb,
  dialect: "sqlite" | "postgres",
  table: string
): Promise<boolean> {
  if (dialect === "sqlite") {
    const cols = await listColumns(client, dialect, table);
    return cols !== null && cols.length > 0;
  }
  try {
    const rows = (await client.$queryRawUnsafe(
      "SELECT 1 FROM information_schema.tables WHERE table_name = $1 LIMIT 1",
      table
    )) as unknown[];
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

export async function migrateTripTruthSchemaWith(
  client: SchemaDb
): Promise<TripTruthSchemaResult> {
  const dialect = await detectDialect(client);
  if (dialect === "unknown") {
    return { dialect, columnsAdded: [], tablesCreated: [] };
  }

  const columnsAdded: string[] = [];
  const tablesCreated: string[] = [];

  // ── 1) Stolpci JourneyBooking (source/importData) ─────────────────────
  if (await tableExists(client, dialect, "JourneyBooking")) {
    const existing = await listColumns(client, dialect, "JourneyBooking");
    if (existing !== null) {
      const q = (id: string) => (dialect === "postgres" ? `"${id}"` : id);
      for (const [column, definition] of Object.entries(
        JOURNEY_BOOKING_COLUMNS
      )) {
        if (existing.includes(column)) continue;
        try {
          await client.$executeRawUnsafe(
            `ALTER TABLE ${q("JourneyBooking")} ADD COLUMN ${q(column)} ${
              dialect === "postgres" ? definition.postgres : definition.sqlite
            }`
          );
          columnsAdded.push(`JourneyBooking.${column}`);
        } catch (error) {
          console.warn(
            `[trip-truth-schema] ADD COLUMN JourneyBooking.${column} ni uspel:`,
            error instanceof Error ? error.message : error
          );
        }
      }
    }
  }

  // ── 2) Tabela TripExpense ──────────────────────────────────────────────
  if (!(await tableExists(client, dialect, "TripExpense"))) {
    try {
      await client.$executeRawUnsafe(
        dialect === "postgres"
          ? TRIP_EXPENSE_DDL.postgres
          : TRIP_EXPENSE_DDL.sqlite
      );
      tablesCreated.push("TripExpense");
    } catch (error) {
      console.warn(
        "[trip-truth-schema] CREATE TABLE TripExpense ni uspel:",
        error instanceof Error ? error.message : error
      );
    }
  }

  // ── 3) Indeksi (idempotentno) ──────────────────────────────────────────
  for (const ddl of TRIP_EXPENSE_DDL.indexes) {
    try {
      await client.$executeRawUnsafe(ddl);
    } catch (error) {
      console.warn(
        "[trip-truth-schema] indeks ni uspel:",
        error instanceof Error ? error.message : error
      );
    }
  }

  return { dialect, columnsAdded, tablesCreated };
}

/** Produkcijska ovojnica — globalni db klient (lazy uvoz). */
export async function migrateTripTruthSchema(): Promise<TripTruthSchemaResult> {
  const { db } = await import("@/lib/db");
  return migrateTripTruthSchemaWith(db);
}
