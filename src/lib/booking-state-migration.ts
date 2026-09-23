/**
 * ZAGONSKA SHEMA MIGRACIJA — TASK 99 BOOKING PAYOUT/CUSTOMER STOLPCI
 * (issue #1 §10 — marketplace payout + customer state)
 *
 * Problem (TASK 100, 1.87.1): stolpca "payoutStatus" in "customerStatus"
 * na tabeli Booking sta bila dodana SAMO v lokalni (sqlite) različici
 * schema.prisma — COMMITANA produkcijska shema (postgresql) ju ni nikoli
 * dobila, zato je Vercel build padal na tipih od 1.86.0 naprej
 * (BookingSelect brez customerStatus, payoutStatus manjka v insertih).
 * Enako velja za zgodovinsko migracijo — ta datoteka zapre vrzel na
 * DEJANSKIH bazah: obstoječi Booking tabeli doda oba stolpca z
 * idempotentnim ALTER (narečno-varnim), enaka pot kot sessionKey v
 * journey-booking-migration.ts (TASK 99 §2).
 *
 * Lastnosti (isti vzorec kot vse startup shema migracije):
 *   - IDEMPOTENTNA: drugi zagon ne stori ničesar (IF NOT EXISTS /
 *     PRAGMA pregled na sqlite; poročilo vedno pove, kaj je bilo storjeno);
 *   - ADDITIVE-ONLY: samo ADD COLUMN z varnimi privzetki — nikoli ne
 *     briše ali spreminja obstoječih podatkov;
 *   - FAIL-OPEN: napaka se zalogira, zagon strežnika se nadaljuje
 *     (vidno prek /api/health → startup-migration-status);
 *   - Izklop: DSA_DISABLE_SCHEMA_MIGRATION=1 (skupna zastavica).
 *
 * Zgodovinsko-vrstična migracija (za `prisma migrate deploy` in CI drift
 * vrata) živi v prisma/migrations/20260923110000_booking_payout_customer/.
 */

import type { PrismaClient } from "@prisma/client";

/** Strukturalni tip, ki ga sprejme migracija (omogoča testiranje z lastnim klientom). */
type SchemaDb = Pick<PrismaClient, "$queryRawUnsafe" | "$executeRawUnsafe">;

export interface BookingStateMigrationResult {
  dialect: "sqlite" | "postgres" | "unknown";
  /** Dodani stolpci (prazen seznam = oba sta že obstajala). */
  columnsAdded: string[];
}

/** Zazna narečje obstoječe baze (ista logika kot journey-booking-migration). */
async function detectDialect(
  client: SchemaDb
): Promise<"sqlite" | "postgres" | "unknown"> {
  // 1) SQLite: PRAGMA uspe SAMO na sqlite (na postgresu sintaksna napaka)
  try {
    const rows = (await client.$queryRawUnsafe(
      "PRAGMA table_info(Booking)"
    )) as unknown;
    if (Array.isArray(rows)) return "sqlite";
  } catch {
    // nadaljuj na postgres preizkus
  }
  // 2) Postgres: information_schema deluje SAMO na postgresu
  try {
    const rows = (await client.$queryRawUnsafe(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'Booking' LIMIT 1"
    )) as unknown;
    if (Array.isArray(rows)) return "postgres";
  } catch {
    // nadaljuj — unknown
  }
  return "unknown";
}

/**
 * Doda payoutStatus + customerStatus na obstoječo Booking tabelo
 * (idempotentno, obe narečji). Prazna/vražja baza: tabelo USTVARI
 * (CREATE TABLE IF NOT EXISTS, additive-only) — enaka obramba kot
 * journey-booking-migration, saj addColumn predpostavlja obstoj.
 */
export async function migrateBookingStateWith(
  client: SchemaDb
): Promise<BookingStateMigrationResult> {
  const dialect = await detectDialect(client);
  const columnsAdded: string[] = [];
  if (dialect === "unknown") {
    return { dialect, columnsAdded };
  }

  // ── Obramba: tabela Booking mora obstajati (baseline od 1.0.0) ────────
  // Če NE obstaja (čudna/prazna baza), jo ustvarimo minimalno-idempotentno,
  // da ADD COLUMN ne vrže — vse ostale stratone (seme/migracije) bodo
  // dopolnile vrstice. Na zdravi produkciji ta veja nikoli ne izvede.
  let exists: boolean;
  if (dialect === "sqlite") {
    const tables = (await client.$queryRawUnsafe(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'Booking'"
    )) as { name?: string }[];
    exists = Array.isArray(tables) && tables.some((t) => t?.name === "Booking");
  } else {
    const tables = (await client.$queryRawUnsafe(
      "SELECT tablename FROM pg_tables WHERE tablename = 'Booking'"
    )) as { tablename?: string }[];
    exists =
      Array.isArray(tables) && tables.some((t) => t?.tablename === "Booking");
  }
  if (!exists) {
    if (dialect === "sqlite") {
      await client.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Booking" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        "status" TEXT NOT NULL,
        "payoutStatus" TEXT NOT NULL DEFAULT 'not_due',
        "customerStatus" TEXT NOT NULL DEFAULT 'none'
      )`);
    } else {
      await client.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Booking" (
        "id" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        "status" TEXT NOT NULL,
        "payoutStatus" TEXT NOT NULL DEFAULT 'not_due',
        "customerStatus" TEXT NOT NULL DEFAULT 'none',
        CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
      )`);
    }
    columnsAdded.push("payoutStatus", "customerStatus");
    return { dialect, columnsAdded };
  }

  // ── ADD COLUMN (idempotentno, narečno-varno) ──────────────────────────
  // SQLite ne podpira IF NOT EXISTS za ADD COLUMN → PRAGMA pregled stolpcev.
  // Stolpca nosita VARNE privzetke ("not_due" / "none") — obstoječe vrstice
  // pošteno ostanejo v izhodiščnem stanju (brez izplačila / brez zahteve).
  const TARGET_COLUMNS: { name: string; ddl: string }[] = [
    {
      name: "payoutStatus",
      ddl: `ALTER TABLE "Booking" ADD COLUMN "payoutStatus" TEXT NOT NULL DEFAULT 'not_due'`,
    },
    {
      name: "customerStatus",
      ddl: `ALTER TABLE "Booking" ADD COLUMN "customerStatus" TEXT NOT NULL DEFAULT 'none'`,
    },
  ];

  for (const col of TARGET_COLUMNS) {
    try {
      if (dialect === "sqlite") {
        const cols = (await client.$queryRawUnsafe(
          "PRAGMA table_info(Booking)"
        )) as { name?: string }[];
        const hasCol =
          Array.isArray(cols) && cols.some((c) => c?.name === col.name);
        if (!hasCol) {
          await client.$executeRawUnsafe(col.ddl);
          columnsAdded.push(col.name);
        }
      } else {
        // Postgres: ADD COLUMN IF NOT EXISTS (9.6+) — idempotentno nativno.
        // Za poročanje o SVEŽEM dodajanju najprej preverimo obstoj — IF NOT
        // EXISTS tiho preskoči že obstoječe (poročilo je informacija, ne
        // pogoj za zagon; sqlite pot poroča natančneje prek PRAGMA).
        const before = (await client.$queryRawUnsafe(
          `SELECT column_name FROM information_schema.columns
           WHERE table_name = 'Booking' AND column_name = '${col.name}'`
        )) as { column_name?: string }[];
        const hadBefore = Array.isArray(before) && before.length > 0;
        await client.$executeRawUnsafe(
          col.ddl.replace("ADD COLUMN", "ADD COLUMN IF NOT EXISTS")
        );
        if (!hadBefore) columnsAdded.push(col.name);
      }
    } catch (error) {
      // FAIL-OPEN: napaka se zalogira, zagon se nadaljuje (isti vzorec)
      console.error(
        `[booking-state-migration] ${col.name} ADD COLUMN:`,
        error
      );
    }
  }

  return { dialect, columnsAdded };
}

/** Produkcijska pot: lastni klient iz lib/db. */
export async function migrateBookingState(): Promise<BookingStateMigrationResult> {
  const { db } = await import("./db");
  return migrateBookingStateWith(db);
}
