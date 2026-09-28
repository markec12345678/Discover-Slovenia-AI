/**
 * ZAGONSKA SHEMA MIGRACIJA — W2 (Issue #15, 1.131.0): TRIP CHAT AI
 *
 * Doda ADITIVNA stolpca na obstoječo tabelo TripComment:
 *   - "isAI"   BOOLEAN NOT NULL DEFAULT false — vrstica AI svetovalca
 *   - "payload" TEXT NULL — JSON priloga (places/sources) za AI vrstice
 *
 * Vercel/Neon nima ročnega `prisma migrate deploy` koraka v deployu, zato je
 * ta startup pot (instrumentation.ts) DEJANSKI mehanizem aplikacije.
 * Zgodovinsko-vrstična migracija živi v
 * prisma/migrations/20260928120000_trip_chat_ai/.
 *
 * Lastnosti (enako kot ostale startup shema migracije):
 *   - IDEMPOTENTNA: drugi zagon ne ustvari ničesar (preveri obstoj stolpcev);
 *   - ADDITIVE-ONLY: nikoli ne briše ali spreminja obstoječih stolpcev/tabel;
 *   - FAIL-OPEN: napaka se zalogira, zagon strežnika se nadaljuje
 *     (vidno prek /api/health startup korakov);
 *   - Izklop: DSA_DISABLE_SCHEMA_MIGRATION=1 (skupna zastavica).
 */

import type { PrismaClient } from "@prisma/client";

/** Strukturalni tip, ki ga sprejme migracija (testiranje z lastnim klientom). */
type SchemaDb = Pick<PrismaClient, "$queryRawUnsafe" | "$executeRawUnsafe">;

export interface TripChatMigrationResult {
  dialect: "sqlite" | "postgres" | "unknown";
  /** Dodani stolpci (prazen seznam = vse je že obstajalo). */
  columnsAdded: string[];
}

/** Zazna narečje obstoječe baze (ista logika kot user-trip-items-migration). */
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

/** Seznam obstoječih stolpcev tabele (prazen = tabela ne obstaja / napaka). */
async function existingColumns(
  client: SchemaDb,
  dialect: "sqlite" | "postgres",
  table: string
): Promise<Set<string>> {
  if (dialect === "sqlite") {
    const rows = (await client.$queryRawUnsafe(
      `PRAGMA table_info(${table})`
    )) as Array<{ name?: unknown }>;
    return new Set(
      Array.isArray(rows)
        ? rows
            .map((r) => (typeof r.name === "string" ? r.name : null))
            .filter((n): n is string => n !== null)
        : []
    );
  }
  const rows = (await client.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns WHERE table_name = '${table}'`
  )) as Array<{ column_name?: unknown }>;
  return new Set(
    Array.isArray(rows)
      ? rows
          .map((r) =>
            typeof r.column_name === "string" ? r.column_name : null
          )
          .filter((n): n is string => n !== null)
      : []
  );
}

/**
 * Doda stolpca "isAI" + "payload" na TripComment, če manjkata.
 * Vedno varna za ponovno poganjanje; nikoli ne meče (fail-open v ovojnici
 * instrumentation.ts).
 */
export async function migrateTripChatColumnsWith(
  client: SchemaDb
): Promise<TripChatMigrationResult> {
  const dialect = await detectDialect(client);
  if (dialect === "unknown") {
    return { dialect, columnsAdded: [] };
  }

  // Tabela TripComment obstaja od P1-2a — če je (nenavadno) ni, spodnji
  // existingColumns vrne prazen Set in se add poskusi izvesti; napaka se
  // ulovi v ovojnici instrumentation.ts (fail-open), zato tu ne throwamo.
  const cols = await existingColumns(client, dialect, "TripComment");

  const columnsAdded: string[] = [];

  if (!cols.has("isAI")) {
    await client.$executeRawUnsafe(
      dialect === "postgres"
        ? `ALTER TABLE "TripComment" ADD COLUMN IF NOT EXISTS "isAI" BOOLEAN NOT NULL DEFAULT false`
        : `ALTER TABLE "TripComment" ADD COLUMN "isAI" BOOLEAN NOT NULL DEFAULT false`
    );
    columnsAdded.push("isAI");
  }

  if (!cols.has("payload")) {
    await client.$executeRawUnsafe(
      dialect === "postgres"
        ? `ALTER TABLE "TripComment" ADD COLUMN IF NOT EXISTS "payload" TEXT`
        : `ALTER TABLE "TripComment" ADD COLUMN "payload" TEXT`
    );
    columnsAdded.push("payload");
  }

  return { dialect, columnsAdded };
}

/**
 * Produkcijska ovojnica — uporabi globalni db klient (iz src/lib/db).
 * LAZY uvoz db: modul ostane uvozljiv v orodjih/skriptah z lastnim klientom,
 * ne da bi konstruiral glavnega klienta v napačnem okolju.
 */
export async function migrateTripChatColumns(): Promise<TripChatMigrationResult> {
  const { db } = await import("@/lib/db");
  return migrateTripChatColumnsWith(db);
}
