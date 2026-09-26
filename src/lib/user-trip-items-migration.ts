/**
 * ZAGONSKA SHEMA MIGRACIJA — TASK 8 / F2-A: USER TRIP ITEMS (Issue #8 Faza 2)
 *
 * Ustvari tabelo UserTripItem — strežniška refleksija zbirke "Moja pot"
 * (localStorage dai:my-trip-items) za prijavljene B2C uporabnike. Ob prijavi
 * se zbirka prenese v račun (union-merge, nikoli destruktivno) → iste ideje
 * so dostopne iz katere koli naprave (Google Maps "Want to go" vzorec).
 *
 * Render/Neon nima ročnega `prisma migrate deploy` koraka v deployu, zato je
 * ta startup pot (instrumentation.ts) DEJANSKI mehanizem aplikacije.
 * Zgodovinsko-vrstična migracija živi v
 * prisma/migrations/20260928100000_user_trip_items/.
 *
 * Lastnosti (enako kot ostale startup shema migracije):
 *   - IDEMPOTENTNA: drugi zagon ne ustvari ničesar (IF NOT EXISTS);
 *   - ADDITIVE-ONLY: nikoli ne briše ali spreminja obstoječih tabel;
 *   - FAIL-OPEN: napaka se zalogira, zagon strežnika se nadaljuje
 *     (vidno prek /api/health startup korakov);
 *   - Izklop: DSA_DISABLE_SCHEMA_MIGRATION=1 (skupna zastavica).
 */

import type { PrismaClient } from "@prisma/client";

/** Strukturalni tip, ki ga sprejme migracija (testiranje z lastnim klientom). */
type SchemaDb = Pick<PrismaClient, "$queryRawUnsafe" | "$executeRawUnsafe">;

export interface UserTripItemsMigrationResult {
  dialect: "sqlite" | "postgres" | "unknown";
  /** Ustvarjene tabele (prazen seznam = vse je že obstajalo). */
  tablesCreated: string[];
}

/** Zazna narečje obstoječe baze (ista logika kot payout-ledger-migration). */
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
 * Ustvari tabelo UserTripItem (+ unikatni/indeksne ključe), če manjka.
 * Vedno varna za ponovno poganjanje; nikoli ne meče (fail-open v ovojnici
 * instrumentation.ts).
 */
export async function migrateUserTripItemsTableWith(
  client: SchemaDb
): Promise<UserTripItemsMigrationResult> {
  const dialect = await detectDialect(client);
  if (dialect === "unknown") {
    return { dialect, tablesCreated: [] };
  }

  const tablesCreated: string[] = [];

  if (!(await tableExists(client, dialect, "UserTripItem"))) {
    await client.$executeRawUnsafe(
      dialect === "postgres"
        ? `CREATE TABLE "UserTripItem" (
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
           )`
        : `CREATE TABLE "UserTripItem" (
             "id" TEXT NOT NULL,
             "userId" TEXT NOT NULL,
             "kind" TEXT NOT NULL,
             "refId" TEXT NOT NULL,
             "title" TEXT NOT NULL,
             "subtitle" TEXT,
             "href" TEXT NOT NULL,
             "image" TEXT,
             "source" TEXT,
             "addedAt" DATETIME NOT NULL,
             "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
             "updatedAt" DATETIME NOT NULL,
             CONSTRAINT "UserTripItem_pkey" PRIMARY KEY ("id")
           )`
    );
    tablesCreated.push("UserTripItem");

    // FK na User (Cascade delete — briše se z računom) + identiteta + indeksi
    if (dialect === "postgres") {
      await client.$executeRawUnsafe(
        `CREATE UNIQUE INDEX "UserTripItem_userId_kind_refId_key" ON "UserTripItem"("userId", "kind", "refId")`
      );
      await client.$executeRawUnsafe(
        `CREATE INDEX "UserTripItem_userId_idx" ON "UserTripItem"("userId")`
      );
      await client.$executeRawUnsafe(
        `ALTER TABLE "UserTripItem" ADD CONSTRAINT "UserTripItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`
      );
    } else {
      await client.$executeRawUnsafe(
        `CREATE UNIQUE INDEX "UserTripItem_userId_kind_refId_key" ON "UserTripItem"("userId", "kind", "refId")`
      );
      await client.$executeRawUnsafe(
        `CREATE INDEX "UserTripItem_userId_idx" ON "UserTripItem"("userId")`
      );
    }
  }

  return { dialect, tablesCreated };
}

/**
 * Produkcijska ovojnica — uporabi globalni db klient (iz src/lib/db).
 * LAZY uvoz db: modul ostane uvozljiv v orodjih/skriptah z lastnim klientom,
 * ne da bi konstruiral glavnega klienta v napačnem okolju.
 */
export async function migrateUserTripItemsTable(): Promise<UserTripItemsMigrationResult> {
  const { db } = await import("@/lib/db");
  return migrateUserTripItemsTableWith(db);
}
