/**
 * ZAGONSKA SHEMA MIGRACIJA — TASK 58 JOURNEYBOOKING (kanonska potrditev
 * rezervacije zunanjega ponudnika, §19)
 *
 * Problem (TASK 81, 1.74.3): model JourneyBooking je bil commitan v
 * schema.prisma v 1.59.0 BREZ prisma migracije in BREZ startup koraka —
 * na produkciji (Neon) tabela NI bila nikoli ustvarjena, zato
 * GET /api/journey/bookings?shareId=… (edini bralec tabele) vrača 503
 * »Baza potrditev trenutno ni dosegljiva« namesto iskrenega praznega
 * seznama. CI vrata (Migration drift check) bi drift odkrila, a je bil
 * Build job od 1.59.0 stalno SKIPPED (needs: quality; quality je padla
 * na tsc — zaprto v isti nalogi 1.74.3).
 *
 * Ta migracija ob zagonu strežnika (instrumentation.ts) USTVARI manjkajočo
 * tabelo + 3 indekse z idempotentnim CREATE ... IF NOT EXISTS — enaka pot
 * kot F11 (trip-poll) / F12 (trip-diary) / socialna plast:
 *   - Postgres (Vercel/Neon, Render): TIMESTAMP(3) + pkey omejevalnik
 *   - SQLite (dev / Docker Pot A): DATETIME + PRIMARY KEY inline
 *
 * Zgodovinsko-vrstična migracija (za `prisma migrate deploy` in CI drift
 * vrata) živi v prisma/migrations/20260922100000_journey_booking/ — ta
 * startup pot je DEJANSki mehanizem aplikacije na obstoječih bazah.
 *
 * Lastnosti (enako kot ostale startup shema migracije):
 *   - IDEMPOTENTNA: drugi zagon ne ustvari ničesar (IF NOT EXISTS +
 *     poizvedba za poročanje);
 *   - ADDITIVE-ONLY: nikoli ne briše ali spreminja obstoječih tabel;
 *   - FAIL-OPEN: napaka se zalogira, zagon strežnika se nadaljuje
 *     (vidno prek /api/health, glej startup-migration-status);
 *   - Izklop: DSA_DISABLE_SCHEMA_MIGRATION=1 (skupna zastavica).
 */

import type { PrismaClient } from "@prisma/client";

/** Strukturalni tip, ki ga sprejme migracija (omogoča testiranje z lastnim klientom). */
type SchemaDb = Pick<PrismaClient, "$queryRawUnsafe" | "$executeRawUnsafe">;

export interface JourneyBookingMigrationResult {
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
 * Ustvari tabelo JourneyBooking, če manjka (+ 3 indekse).
 * Vedno varna za ponovno poganjanje; nikoli ne meče (fail-open v ovojnici).
 */
export async function migrateJourneyBookingTableWith(
  client: SchemaDb
): Promise<JourneyBookingMigrationResult> {
  const dialect = await detectDialect(client);
  if (dialect === "unknown") {
    return { dialect, tablesCreated: [] };
  }

  const tablesCreated: string[] = [];

  // ── JourneyBooking ───────────────────────────────────────────────────────
  // Obstoj preverimo POIZVEDBO (ne z izjemo): CREATE IF NOT EXISTS bi sicer
  // zadostil, a želimo poročati, kaj je bilo ustvarjeno.
  let exists = false;
  if (dialect === "sqlite") {
    const rows = (await client.$queryRawUnsafe(
      "PRAGMA table_info(JourneyBooking)"
    )) as unknown[];
    exists = Array.isArray(rows) && rows.length > 0;
  } else {
    const rows = (await client.$queryRawUnsafe(
      "SELECT 1 FROM information_schema.tables WHERE table_name = 'JourneyBooking' LIMIT 1"
    )) as unknown[];
    exists = Array.isArray(rows) && rows.length > 0;
  }

  if (!exists) {
    await client.$executeRawUnsafe(
      dialect === "postgres"
        ? `CREATE TABLE "JourneyBooking" (
             "id" TEXT NOT NULL,
             "shareId" TEXT,
             "sessionKey" TEXT,
             "provider" TEXT NOT NULL,
             "providerProductId" TEXT NOT NULL,
             "status" TEXT NOT NULL,
             "providerBookingId" TEXT,
             "confirmedPrice" DOUBLE PRECISION,
             "currency" TEXT NOT NULL DEFAULT 'EUR',
             "confirmationUrl" TEXT,
             "cancellationUrl" TEXT,
             "providerPayload" TEXT,
             "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
             "updatedAt" TIMESTAMP(3) NOT NULL,
             CONSTRAINT "JourneyBooking_pkey" PRIMARY KEY ("id")
           )`
        : `CREATE TABLE IF NOT EXISTS "JourneyBooking" (
             "id" TEXT NOT NULL PRIMARY KEY,
             "shareId" TEXT,
             "sessionKey" TEXT,
             "provider" TEXT NOT NULL,
             "providerProductId" TEXT NOT NULL,
             "status" TEXT NOT NULL,
             "providerBookingId" TEXT,
             "confirmedPrice" REAL,
             "currency" TEXT NOT NULL DEFAULT 'EUR',
             "confirmationUrl" TEXT,
             "cancellationUrl" TEXT,
             "providerPayload" TEXT,
             "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
             "updatedAt" DATETIME NOT NULL
           )`
    );
    tablesCreated.push("JourneyBooking");
  }

  // ── Indeksi (obe narečji podpirata IF NOT EXISTS) ────────────────────────
  // ── TASK 99: sessionKey na OBSTOJEČIH tabelah (idempotentno) ───────────
  // Baze, ki so tabelo dobile pred TASK 99, stolpca še nimajo — dodamo ga
  // z narečno-varnim ADD COLUMN (SQLite ne podpira IF NOT EXISTS).
  //
  // ── HARDENING AUDIT (H1): shareId na OBSTOJEČIH tabelah ─────────────────
  // Bug 8782d8c (1.86.0) je "shareId" TEXT pomotoma IZBRISAL iz obeh
  // CREATE TABLE vej — sveža baza, ki je tabelo ustvarila s to različico,
  // ima tabelo BREZ shareId (ustvarjanje indeksa JourneyBooking_shareId_idx
  // je nato padlo, fail-open pa pustil pokvarjeno tabelo živeti → vsi
  // where: { shareId } klici 503). Healing: idempotenten ADD COLUMN za
  // obe manjkajoča stolpca (shareId + sessionKey) na obstoječih tabelah.
  if (exists) {
    for (const column of ["shareId", "sessionKey"] as const) {
      try {
        if (dialect === "sqlite") {
          const cols = (await client.$queryRawUnsafe(
            "PRAGMA table_info(JourneyBooking)"
          )) as { name?: string }[];
          const hasCol =
            Array.isArray(cols) && cols.some((c) => c?.name === column);
          if (!hasCol) {
            await client.$executeRawUnsafe(
              `ALTER TABLE "JourneyBooking" ADD COLUMN "${column}" TEXT`
            );
          }
        } else {
          await client.$executeRawUnsafe(
            `ALTER TABLE "JourneyBooking" ADD COLUMN IF NOT EXISTS "${column}" TEXT`
          );
        }
      } catch (error) {
        // FAIL-OPEN: napaka se zalogira, zagon se nadaljuje (isti vzorec)
        console.error(
          `[journey-booking-migration] ${column} ADD COLUMN:`,
          error
        );
      }
    }
  }

  await client.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "JourneyBooking_shareId_idx" ON "JourneyBooking"("shareId")`
  );
  await client.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "JourneyBooking_sessionKey_idx" ON "JourneyBooking"("sessionKey")`
  );
  await client.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "JourneyBooking_provider_providerProductId_idx" ON "JourneyBooking"("provider", "providerProductId")`
  );
  await client.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "JourneyBooking_status_idx" ON "JourneyBooking"("status")`
  );

  return { dialect, tablesCreated };
}

/**
 * Produkcijska ovojnica — uporabi globalni db klient (iz src/lib/db).
 * LAZY uvoz db (enako kot ostale migracije).
 */
export async function migrateJourneyBookingTable(): Promise<JourneyBookingMigrationResult> {
  const { db } = await import("@/lib/db");
  return migrateJourneyBookingTableWith(db);
}
