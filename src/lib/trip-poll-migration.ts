/**
 * ZAGONSKA SHEMA MIGRACIJA — F11 SKUPINSKE ANKETE (TripPoll/TripPollVote)
 *
 * Problem: prisma/schema.prisma ima od 1.15.0 dva nova modela (TripPoll,
 * TripPollVote). Build jih NE sinhronizira v obstoječe baze (prisma db push
 * teče SAMO ročno ob nastavitvi Neon baze; skip-worktree past je obenem
 * enkrat tiho zadržala modele pred commitom — glej CHANGELOG 1.15.0) —
 * API /api/poll bi na bazi brez tabel padel s "table does not exist".
 *
 * Ta migracija ob zagonu strežnika (instrumentation.ts) USTVARI manjkajoče
 * tabele + indekse + FK z idempotentnim CREATE ... IF NOT EXISTS:
 *   - Postgres (Vercel/Neon, Render): TIMESTAMP(3) + pg_constraint check za FK
 *   - SQLite (dev / Docker Pot A): DATETIME + FK inline v DDL tabele
 *
 * Lastnosti (enako kot listing-practical-migration):
 *   - IDEMPOTENTNA: drugi zagon ne ustvari ničesar (IF NOT EXISTS);
 *   - ADDITIVE-ONLY: nikoli ne briše ali spreminja obstoječih tabel/podatkov;
 *   - FAIL-OPEN: napaka se zalogira, zagon strežnika se nadaljuje;
 *   - Izklop: DSA_DISABLE_SCHEMA_MIGRATION=1 (skupna zastavica startup
 *     shema migracij).
 */

import type { PrismaClient } from "@prisma/client";

/** Strukturalni tip, ki ga sprejme migracija (omogoča testiranje z lastnim klientom). */
type SchemaDb = Pick<PrismaClient, "$queryRawUnsafe" | "$executeRawUnsafe">;

export interface PollMigrationResult {
  dialect: "sqlite" | "postgres" | "unknown";
  /** Ustvarjene tabele (prazen seznam = vse je že obstajalo). */
  tablesCreated: string[];
}

/** Zazna narečje obstoječe baze (enaka logika kot listing migracija). */
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
 * Ustvari tabeli TripPoll + TripPollVote, če manjkata (+ indeksi, FK).
 * Vedno varna za ponovno poganjanje; nikoli ne meče (fail-open v ovojnici).
 */
export async function migrateTripPollTablesWith(
  client: SchemaDb
): Promise<PollMigrationResult> {
  const dialect = await detectDialect(client);
  if (dialect === "unknown") {
    return { dialect, tablesCreated: [] };
  }

  const tablesCreated: string[] = [];

  // ── TripPoll ─────────────────────────────────────────────────────────────
  // Obstoj preverimo POIZVEDBO (ne z izjemo): CREATE IF NOT EXISTS bi sicer
  // zadostil, a želimo poročati, kaj je bilo ustvarjeno.
  let pollExists = false;
  if (dialect === "sqlite") {
    const rows = (await client.$queryRawUnsafe(
      "PRAGMA table_info(TripPoll)"
    )) as unknown[];
    pollExists = Array.isArray(rows) && rows.length > 0;
  } else {
    const rows = (await client.$queryRawUnsafe(
      "SELECT 1 FROM information_schema.tables WHERE table_name = 'TripPoll' LIMIT 1"
    )) as unknown[];
    pollExists = Array.isArray(rows) && rows.length > 0;
  }

  if (!pollExists) {
    await client.$executeRawUnsafe(
      dialect === "postgres"
        ? `CREATE TABLE "TripPoll" (
             "id" TEXT NOT NULL,
             "shareId" TEXT NOT NULL,
             "question" TEXT NOT NULL,
             "options" TEXT NOT NULL,
             "authorName" TEXT,
             "authorClientId" TEXT NOT NULL,
             "closed" BOOLEAN NOT NULL DEFAULT false,
             "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
             CONSTRAINT "TripPoll_pkey" PRIMARY KEY ("id")
           )`
        : `CREATE TABLE IF NOT EXISTS "TripPoll" (
             "id" TEXT NOT NULL PRIMARY KEY,
             "shareId" TEXT NOT NULL,
             "question" TEXT NOT NULL,
             "options" TEXT NOT NULL,
             "authorName" TEXT,
             "authorClientId" TEXT NOT NULL,
             "closed" BOOLEAN NOT NULL DEFAULT false,
             "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
           )`
    );
    tablesCreated.push("TripPoll");
  }

  // ── TripPollVote ─────────────────────────────────────────────────────────
  let voteExists = false;
  if (dialect === "sqlite") {
    const rows = (await client.$queryRawUnsafe(
      "PRAGMA table_info(TripPollVote)"
    )) as unknown[];
    voteExists = Array.isArray(rows) && rows.length > 0;
  } else {
    const rows = (await client.$queryRawUnsafe(
      "SELECT 1 FROM information_schema.tables WHERE table_name = 'TripPollVote' LIMIT 1"
    )) as unknown[];
    voteExists = Array.isArray(rows) && rows.length > 0;
  }

  if (!voteExists) {
    await client.$executeRawUnsafe(
      dialect === "postgres"
        ? `CREATE TABLE "TripPollVote" (
             "id" TEXT NOT NULL,
             "pollId" TEXT NOT NULL,
             "voterId" TEXT NOT NULL,
             "optionIdx" INTEGER NOT NULL,
             "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
             CONSTRAINT "TripPollVote_pkey" PRIMARY KEY ("id")
           )`
        : `CREATE TABLE IF NOT EXISTS "TripPollVote" (
             "id" TEXT NOT NULL PRIMARY KEY,
             "pollId" TEXT NOT NULL,
             "voterId" TEXT NOT NULL,
             "optionIdx" INTEGER NOT NULL,
             "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
             FOREIGN KEY ("pollId") REFERENCES "TripPoll" ("id") ON DELETE CASCADE ON UPDATE CASCADE
           )`
    );
    tablesCreated.push("TripPollVote");
  }

  // ── Indeksi (obe narečji podpirata IF NOT EXISTS) ────────────────────────
  await client.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "TripPoll_shareId_idx" ON "TripPoll"("shareId")`
  );
  await client.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "TripPoll_createdAt_idx" ON "TripPoll"("createdAt")`
  );
  await client.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "TripPollVote_pollId_idx" ON "TripPollVote"("pollId")`
  );
  await client.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "TripPollVote_pollId_voterId_key" ON "TripPollVote"("pollId", "voterId")`
  );

  // ── FK (samo Postgres — SQLite ga ima inline v DDL) ──────────────────────
  if (dialect === "postgres") {
    await client.$executeRawUnsafe(
      `DO $$ BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM pg_constraint WHERE conname = 'TripPollVote_pollId_fkey'
         ) THEN
           ALTER TABLE "TripPollVote"
           ADD CONSTRAINT "TripPollVote_pollId_fkey"
           FOREIGN KEY ("pollId") REFERENCES "TripPoll"("id")
           ON DELETE CASCADE ON UPDATE CASCADE;
         END IF;
       END $$;`
    );
  }

  return { dialect, tablesCreated };
}

/**
 * Produkcijska ovojnica — uporabi globalni db klient (iz src/lib/db).
 * LAZY uvoz db (enako kot listing migracija).
 */
export async function migrateTripPollTables(): Promise<PollMigrationResult> {
  const { db } = await import("@/lib/db");
  return migrateTripPollTablesWith(db);
}
