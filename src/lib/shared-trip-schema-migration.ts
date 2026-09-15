/**
 * ZAGONSKA SHEMA MIGRACIJA — SOCIALNA PLAST DELJENIH POTOVANJ (P1 + F7)
 *
 * Problem: produkcijska Neon baza je bila sinhronizirana z `prisma db push`
 * nazadnje v Fazi 4f (b4f89f6). Vse TABELE in STOLPCI, dodani kasneje
 * (P1: TripVote/TripComment/TripLike + SavedItinerary.formData/userId;
 * F7: TripGuide + SavedItinerary.editTokenHash), na njej manjkajo —
 * prisma generate jih pozna (build mine), a runtime poizvedbe padajo
 * ("column does not exist" / "table does not exist"). Živi dokaz:
 * POST /api/itinerary/save na produkciji → 500 (insert rabí formData +
 * editTokenHash), lokalno 200.
 *
 * Ta migracija ob zagonu strežnika (instrumentation.ts) DODA manjkajoče
 * (additive-only):
 *   - stolpci SavedItinerary: formData / editTokenHash / userId
 *   - tabele: TripVote, TripComment, TripLike, TripGuide (+ indeksi/
 *     unique indexi, kot jih ustvari prisma db push)
 *
 * (TripPoll/TripPollVote iz F11 pokriva ločen modul
 * src/lib/trip-poll-migration.ts — enak vzorec.)
 *
 * Lastnosti (enako kot listing-practical-migration, dokazano na produkciji):
 *   - IDEMPOTENTNA: drugi zagon ne doda ničesar;
 *   - ADDITIVE-ONLY: nikoli ne briše ali spreminja obstoječih podatkov;
 *   - FAIL-OPEN: napaka se zalogira, zagon strežnika se nadaljuje;
 *   - Izklop: DSA_DISABLE_SCHEMA_MIGRATION=1 (skupna zastavica).
 *
 * ISKRENA opomba: ta pristop je namenjen ADDITIVNIM spremembam na bazi z
 * obstoječimi podatki. Avtoritativna alternativa (lastnik baze):
  DATABASE_URL iz Vercel Settings → `bunx prisma db push` iz repozitorija.
 */

import type { PrismaClient } from "@prisma/client";

/** Strukturalni tip, ki ga sprejme migracija (testiranje z lastnim klientom). */
type SchemaDb = Pick<PrismaClient, "$queryRawUnsafe" | "$executeRawUnsafe">;

export interface SharedTripSchemaResult {
  dialect: "sqlite" | "postgres" | "unknown";
  /** Dodani stolpci (npr. "SavedItinerary.formData"). */
  columnsAdded: string[];
  /** Ustvarjene tabele (prazen seznam = vse je že obstajalo). */
  tablesCreated: string[];
}

/** Manjkajoči stolpci SavedItinerary (ime → SQL definicija). */
const SAVED_ITINERARY_COLUMNS: Record<string, string> = {
  // JSON PlannerInput — vedno JSON string ("null" pri anonimnem), zato
  // DEFAULT 'null' pokriva obstoječe vrstice pred dodajanjem stolpca.
  formData: "TEXT NOT NULL DEFAULT 'null'",
  // F7: SHA-256 hash editnega žetona (nullable po modelu)
  editTokenHash: "TEXT",
  // P1-2b: povezava z računom popotnika (nullable; FK namerno NE dodajamo —
  // additive-only doktrina, Prisma runtime ga ne potrebuje)
  userId: "TEXT",
};

interface TableSpec {
  name: string;
  /** Postgres DDL (brez IF NOT EXISTS — obstoj preverimo prej). */
  postgres: string;
  /** SQLite DDL (IF NOT EXISTS — poceni varnost). */
  sqlite: string;
  /** Indeksi (obe narečji podpirata CREATE ... IF NOT EXISTS). */
  indexes: string[];
}

/** Manjkajoče tabele socialne plasti (P1 + F7), po prisma db push konvenciji. */
const TABLES: TableSpec[] = [
  {
    name: "TripVote",
    postgres: `CREATE TABLE "TripVote" (
      "id" TEXT NOT NULL,
      "shareId" TEXT NOT NULL,
      "locationKey" TEXT NOT NULL,
      "voterId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "TripVote_pkey" PRIMARY KEY ("id")
    )`,
    sqlite: `CREATE TABLE IF NOT EXISTS "TripVote" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "shareId" TEXT NOT NULL,
      "locationKey" TEXT NOT NULL,
      "voterId" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    indexes: [
      `CREATE UNIQUE INDEX IF NOT EXISTS "TripVote_shareId_locationKey_voterId_key" ON "TripVote"("shareId", "locationKey", "voterId")`,
      `CREATE INDEX IF NOT EXISTS "TripVote_shareId_idx" ON "TripVote"("shareId")`,
    ],
  },
  {
    name: "TripComment",
    postgres: `CREATE TABLE "TripComment" (
      "id" TEXT NOT NULL,
      "shareId" TEXT NOT NULL,
      "authorName" TEXT NOT NULL,
      "text" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "TripComment_pkey" PRIMARY KEY ("id")
    )`,
    sqlite: `CREATE TABLE IF NOT EXISTS "TripComment" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "shareId" TEXT NOT NULL,
      "authorName" TEXT NOT NULL,
      "text" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    indexes: [
      `CREATE INDEX IF NOT EXISTS "TripComment_shareId_idx" ON "TripComment"("shareId")`,
      `CREATE INDEX IF NOT EXISTS "TripComment_createdAt_idx" ON "TripComment"("createdAt")`,
    ],
  },
  {
    name: "TripLike",
    postgres: `CREATE TABLE "TripLike" (
      "id" TEXT NOT NULL,
      "shareId" TEXT NOT NULL,
      "clientId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "TripLike_pkey" PRIMARY KEY ("id")
    )`,
    sqlite: `CREATE TABLE IF NOT EXISTS "TripLike" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "shareId" TEXT NOT NULL,
      "clientId" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    indexes: [
      `CREATE UNIQUE INDEX IF NOT EXISTS "TripLike_shareId_clientId_key" ON "TripLike"("shareId", "clientId")`,
      `CREATE INDEX IF NOT EXISTS "TripLike_shareId_idx" ON "TripLike"("shareId")`,
    ],
  },
  {
    name: "TripGuide",
    postgres: `CREATE TABLE "TripGuide" (
      "id" TEXT NOT NULL,
      "shareId" TEXT NOT NULL,
      "authorName" TEXT NOT NULL,
      "intro" TEXT NOT NULL,
      "verdict" TEXT,
      "tips" TEXT NOT NULL,
      "lang" TEXT NOT NULL DEFAULT 'sl',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "TripGuide_pkey" PRIMARY KEY ("id")
    )`,
    sqlite: `CREATE TABLE IF NOT EXISTS "TripGuide" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "shareId" TEXT NOT NULL,
      "authorName" TEXT NOT NULL,
      "intro" TEXT NOT NULL,
      "verdict" TEXT,
      "tips" TEXT NOT NULL,
      "lang" TEXT NOT NULL DEFAULT 'sl',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    indexes: [
      `CREATE UNIQUE INDEX IF NOT EXISTS "TripGuide_shareId_key" ON "TripGuide"("shareId")`,
    ],
  },
];

/** Zazna narečje (PRAGMA uspe samo na sqlite; information_schema na postgres). */
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

/** Seznam stolpcev tabele (PRAGMA / information_schema) ali null ob napaki. */
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

/** Ali tabela obstaja. */
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

/**
 * Doda manjkajoče stolpce SavedItinerary + ustvari manjkajoče tabele
 * socialne plasti. Vedno varna za ponovno poganjanje; nikoli ne meče
 * (fail-open v ovojnici instrumentation.ts).
 */
export async function migrateSharedTripSchemaWith(
  client: SchemaDb
): Promise<SharedTripSchemaResult> {
  const dialect = await detectDialect(client);
  if (dialect === "unknown") {
    return { dialect, columnsAdded: [], tablesCreated: [] };
  }

  const columnsAdded: string[] = [];
  const tablesCreated: string[] = [];

  // ── 1) Stolpci SavedItinerary (samo če tabela obstaja) ──────────────────
  if (await tableExists(client, dialect, "SavedItinerary")) {
    const existing = await listColumns(client, dialect, "SavedItinerary");
    if (existing !== null) {
      // Narečju primeren quoting (t12 vzorec: sqlite gol, postgres narekovaji)
      const q = (id: string) => (dialect === "postgres" ? `"${id}"` : id);
      for (const [column, definition] of Object.entries(
        SAVED_ITINERARY_COLUMNS
      )) {
        if (existing.includes(column)) continue;
        try {
          await client.$executeRawUnsafe(
            `ALTER TABLE ${q("SavedItinerary")} ADD COLUMN ${q(column)} ${definition}`
          );
          columnsAdded.push(`SavedItinerary.${column}`);
        } catch (error) {
          // Tekmovanje dveh lambd (stolpec pravkar dodan) ali drug vzrok —
          // fail-open: nadaljujemo z ostalimi stolpci/tabelami.
          console.warn(
            `[shared-trip-schema] ADD COLUMN SavedItinerary.${column} ni uspel:`,
            error instanceof Error ? error.message : error
          );
        }
      }
    }
  }

  // ── 2) Tabele socialne plasti ───────────────────────────────────────────
  for (const spec of TABLES) {
    if (await tableExists(client, dialect, spec.name)) continue;
    try {
      await client.$executeRawUnsafe(
        dialect === "postgres" ? spec.postgres : spec.sqlite
      );
      tablesCreated.push(spec.name);
    } catch (error) {
      console.warn(
        `[shared-trip-schema] CREATE TABLE ${spec.name} ni uspel:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  // ── 3) Indeksi (idempotentno, IF NOT EXISTS — vedno) ────────────────────
  for (const spec of TABLES) {
    for (const ddl of spec.indexes) {
      try {
        await client.$executeRawUnsafe(ddl);
      } catch (error) {
        console.warn(
          `[shared-trip-schema] indeks za ${spec.name} ni uspel:`,
          error instanceof Error ? error.message : error
        );
      }
    }
  }

  return { dialect, columnsAdded, tablesCreated };
}

/**
 * Produkcijska ovojnica — uporabi globalni db klient (iz src/lib/db).
 * LAZY uvoz db (enako kot ostale migracije).
 */
export async function migrateSharedTripSchema(): Promise<SharedTripSchemaResult> {
  const { db } = await import("@/lib/db");
  return migrateSharedTripSchemaWith(db);
}
