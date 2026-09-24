/**
 * ZAGONSKA SHEMA MIGRACIJA — ISSUE #4 §13 (val 2): TRIP COLLABORATION
 *
 * Doda (additive-only, idempotentno):
 *   - stolpci SavedItinerary: isPublic / contentVersion / updatedAt
 *   - tabela: TripCollaborator (+ indeksi/unique, kot jih ustvari db push)
 *
 * Lastnosti (isti kanon kot shared-trip-schema-migration, dokazano):
 *   - IDEMPOTENTNA (drugi zagon ne doda ničesar);
 *   - ADDITIVE-ONLY (nikoli ne briše/spreminja obstoječih podatkov);
 *   - FAIL-OPEN (napaka se zalogira, zagon se nadaljuje);
 *   - izklop: DSA_DISABLE_SCHEMA_MIGRATION=1 (skupna zastavica).
 */

import type { PrismaClient } from "@prisma/client";

type SchemaDb = Pick<PrismaClient, "$queryRawUnsafe" | "$executeRawUnsafe">;

export interface TripCollaboratorSchemaResult {
  dialect: "sqlite" | "postgres" | "unknown";
  columnsAdded: string[];
  tablesCreated: string[];
}

/** Manjkajoči stolpci SavedItinerary (ime → SQL definicija po narečju). */
const SAVED_ITINERARY_COLUMNS: Record<
  string,
  { sqlite: string; postgres: string }
> = {
  isPublic: {
    sqlite: "BOOLEAN NOT NULL DEFAULT 1",
    postgres: "BOOLEAN NOT NULL DEFAULT true",
  },
  contentVersion: {
    sqlite: "INTEGER NOT NULL DEFAULT 0",
    postgres: "INTEGER NOT NULL DEFAULT 0",
  },
  // POZOR (SQLite): ALTER TABLE ... ADD COLUMN NE sprejma nekonstantnega
  // defaulta (CURRENT_TIMESTAMP) — uporabimo konstanto (datum izdaje vala);
  // @updatedAt prevzame vzdrževanje takoj, ko stolpec obstaja.
  updatedAt: {
    sqlite: "DATETIME NOT NULL DEFAULT '2026-09-24 00:00:00'",
    postgres: "TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP",
  },
};

const TRIP_COLLABORATOR_DDL = {
  postgres: `CREATE TABLE "TripCollaborator" (
    "id" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "userId" TEXT,
    "inviteEmail" TEXT,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "inviteToken" TEXT NOT NULL,
    "invitedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TripCollaborator_pkey" PRIMARY KEY ("id")
  )`,
  sqlite: `CREATE TABLE IF NOT EXISTS "TripCollaborator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shareId" TEXT NOT NULL,
    "userId" TEXT,
    "inviteEmail" TEXT,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "inviteToken" TEXT NOT NULL,
    "invitedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  indexes: [
    `CREATE UNIQUE INDEX IF NOT EXISTS "TripCollaborator_inviteToken_key" ON "TripCollaborator"("inviteToken")`,
    `CREATE INDEX IF NOT EXISTS "TripCollaborator_shareId_status_idx" ON "TripCollaborator"("shareId", "status")`,
    `CREATE INDEX IF NOT EXISTS "TripCollaborator_userId_idx" ON "TripCollaborator"("userId")`,
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

export async function migrateTripCollaboratorSchemaWith(
  client: SchemaDb
): Promise<TripCollaboratorSchemaResult> {
  const dialect = await detectDialect(client);
  if (dialect === "unknown") {
    return { dialect, columnsAdded: [], tablesCreated: [] };
  }

  const columnsAdded: string[] = [];
  const tablesCreated: string[] = [];

  // ── 1) Stolpci SavedItinerary ──────────────────────────────────────────
  if (await tableExists(client, dialect, "SavedItinerary")) {
    const existing = await listColumns(client, dialect, "SavedItinerary");
    if (existing !== null) {
      const q = (id: string) => (dialect === "postgres" ? `"${id}"` : id);
      for (const [column, definition] of Object.entries(
        SAVED_ITINERARY_COLUMNS
      )) {
        if (existing.includes(column)) continue;
        try {
          await client.$executeRawUnsafe(
            `ALTER TABLE ${q("SavedItinerary")} ADD COLUMN ${q(column)} ${
              dialect === "postgres" ? definition.postgres : definition.sqlite
            }`
          );
          columnsAdded.push(`SavedItinerary.${column}`);
        } catch (error) {
          console.warn(
            `[trip-collaborator-schema] ADD COLUMN SavedItinerary.${column} ni uspel:`,
            error instanceof Error ? error.message : error
          );
        }
      }
    }
  }

  // ── 2) Tabela TripCollaborator ─────────────────────────────────────────
  if (!(await tableExists(client, dialect, "TripCollaborator"))) {
    try {
      await client.$executeRawUnsafe(
        dialect === "postgres"
          ? TRIP_COLLABORATOR_DDL.postgres
          : TRIP_COLLABORATOR_DDL.sqlite
      );
      tablesCreated.push("TripCollaborator");
    } catch (error) {
      console.warn(
        "[trip-collaborator-schema] CREATE TABLE TripCollaborator ni uspel:",
        error instanceof Error ? error.message : error
      );
    }
  }

  // ── 3) Indeksi (idempotentno) ──────────────────────────────────────────
  for (const ddl of TRIP_COLLABORATOR_DDL.indexes) {
    try {
      await client.$executeRawUnsafe(ddl);
    } catch (error) {
      console.warn(
        "[trip-collaborator-schema] indeks ni uspel:",
        error instanceof Error ? error.message : error
      );
    }
  }

  return { dialect, columnsAdded, tablesCreated };
}

/** Produkcijska ovojnica — globalni db klient (lazy uvoz). */
export async function migrateTripCollaboratorSchema(): Promise<TripCollaboratorSchemaResult> {
  const { db } = await import("@/lib/db");
  return migrateTripCollaboratorSchemaWith(db);
}
