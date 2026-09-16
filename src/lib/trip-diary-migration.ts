/**
 * ZAGONSKA SHEMA MIGRACIJA — F12 SKUPINSKI POTNI DNEVNIK (TripDiaryEntry)
 *
 * Problem: prisma/schema.prisma ima od 1.16.0 nov model (TripDiaryEntry).
 * Build ga NE sinhronizira v obstoječe baze (prisma db push teče SAMO ročno
 * ob nastavitvi Neon baze) — API /api/diary bi na bazi brez tabele padel s
 * "table does not exist" (enaka past kot F11, glej CHANGELOG 1.15.0).
 *
 * Ta migracija ob zagonu strežnika (instrumentation.ts) USTVARI manjkajočo
 * tabelo + 2 indeksa z idempotentnim CREATE ... IF NOT EXISTS:
 *   - Postgres (Vercel/Neon, Render): TIMESTAMP(3) + pkey omejevalnik
 *   - SQLite (dev / Docker Pot A): DATETIME + PRIMARY KEY inline
 *
 * Lastnosti (enako kot trip-poll-migration / shared-trip-schema-migration):
 *   - IDEMPOTENTNA: drugi zagon ne ustvari ničesar (IF NOT EXISTS);
 *   - ADDITIVE-ONLY: nikoli ne briše ali spreminja obstoječih tabel/podatkov;
 *   - FAIL-OPEN: napaka se zalogira, zagon strežnika se nadaljuje;
 *   - Izklop: DSA_DISABLE_SCHEMA_MIGRATION=1 (skupna zastavica startup
 *     shema migracij).
 */

import type { PrismaClient } from "@prisma/client";

/** Strukturalni tip, ki ga sprejme migracija (omogoča testiranje z lastnim klientom). */
type SchemaDb = Pick<PrismaClient, "$queryRawUnsafe" | "$executeRawUnsafe">;

export interface DiaryMigrationResult {
  dialect: "sqlite" | "postgres" | "unknown";
  /** Ustvarjene tabele (prazen seznam = vse je že obstajalo). */
  tablesCreated: string[];
}

/** Zazna narečje obstoječe baze (enaka logika kot ostale migracije). */
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

/**
 * Ustvari tabelo TripDiaryEntry, če manjka (+ 2 indeksa).
 * Vedno varna za ponovno poganjanje; nikoli ne meče (fail-open v ovojnici).
 */
export async function migrateTripDiaryTableWith(
  client: SchemaDb
): Promise<DiaryMigrationResult> {
  const dialect = await detectDialect(client);
  if (dialect === "unknown") {
    return { dialect, tablesCreated: [] };
  }

  const tablesCreated: string[] = [];

  // ── TripDiaryEntry ───────────────────────────────────────────────────────
  // Obstoj preverimo POIZVEDBO (ne z izjemo): CREATE IF NOT EXISTS bi sicer
  // zadostil, a želimo poročati, kaj je bilo ustvarjeno.
  let exists = false;
  if (dialect === "sqlite") {
    const rows = (await client.$queryRawUnsafe(
      "PRAGMA table_info(TripDiaryEntry)"
    )) as unknown[];
    exists = Array.isArray(rows) && rows.length > 0;
  } else {
    const rows = (await client.$queryRawUnsafe(
      "SELECT 1 FROM information_schema.tables WHERE table_name = 'TripDiaryEntry' LIMIT 1"
    )) as unknown[];
    exists = Array.isArray(rows) && rows.length > 0;
  }

  if (!exists) {
    await client.$executeRawUnsafe(
      dialect === "postgres"
        ? `CREATE TABLE "TripDiaryEntry" (
             "id" TEXT NOT NULL,
             "shareId" TEXT NOT NULL,
             "authorName" TEXT,
             "authorClientId" TEXT NOT NULL,
             "dayIndex" INTEGER,
             "placeName" TEXT,
             "rating" INTEGER,
             "text" TEXT NOT NULL,
             "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
             "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
             CONSTRAINT "TripDiaryEntry_pkey" PRIMARY KEY ("id")
           )`
        : `CREATE TABLE IF NOT EXISTS "TripDiaryEntry" (
             "id" TEXT NOT NULL PRIMARY KEY,
             "shareId" TEXT NOT NULL,
             "authorName" TEXT,
             "authorClientId" TEXT NOT NULL,
             "dayIndex" INTEGER,
             "placeName" TEXT,
             "rating" INTEGER,
             "text" TEXT NOT NULL,
             "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
             "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
           )`
    );
    tablesCreated.push("TripDiaryEntry");
  }

  // ── Indeksi (obe narečji podpirata IF NOT EXISTS) ────────────────────────
  await client.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "TripDiaryEntry_shareId_idx" ON "TripDiaryEntry"("shareId")`
  );
  await client.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "TripDiaryEntry_shareId_authorClientId_idx" ON "TripDiaryEntry"("shareId", "authorClientId")`
  );

  return { dialect, tablesCreated };
}

/**
 * Produkcijska ovojnica — uporabi globalni db klient (iz src/lib/db).
 * LAZY uvoz db (enako kot ostale migracije).
 */
export async function migrateTripDiaryTable(): Promise<DiaryMigrationResult> {
  const { db } = await import("@/lib/db");
  return migrateTripDiaryTableWith(db);
}
