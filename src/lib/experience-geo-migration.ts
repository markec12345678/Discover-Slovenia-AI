/**
 * ZAGONSKA SHEMA MIGRACIJA — GEO KOORDINATE IZKUŠNJE (TASK 87, 1.78.0)
 *
 * Problem: prisma/schema.prisma ima od TASK 87 dva nova NEOBVEZNA geo
 * stolpca modela Experience (lat/lng — pin izkušnje na supply zemljevidu,
 * src/lib/supply/providers/own/adapter.ts, drugi vir poleg Listing).
 * Build jih NE sinhronizira v obstoječe baze (Render build ne poganja
 * db push) — Prisma poizvedbe, ki izbirajo nova polja, bi na stari bazi
 * padle z "column does not exist" (ISTA past kot t12/praktični podatki
 * in TASK 84/listing geo).
 *
 * Ta migracija ob zagonu strežnika (instrumentation.ts) DODA manjkajoča
 * stolpca z additive-only ALTER TABLE:
 *   - Postgres (Render/Neon, Pot B): information_schema.columns
 *   - SQLite (dev / Vercel demo / Docker Pot A): PRAGMA table_info
 *
 * Lastnosti (vzorec F11/F12/t12/TASK 84 — listing-geo-migration.ts):
 *   - IDEMPOTENTNA: drugi zagon ne doda ničesar (stolpca že obstajata);
 *   - ADDITIVE-ONLY: nikoli ne briše ali spreminja obstoječih stolpcev/
 *     podatkov;
 *   - FAIL-OPEN: napaka se zalogira, zagon strežnika se nadaljuje;
 *   - Izklop: DSA_DISABLE_SCHEMA_MIGRATION=1.
 *
 * Narečna tipa (Prisma Float): postgres DOUBLE PRECISION, sqlite REAL —
 * RazLIČNO od t12 (TEXT povsod), zato je tip odvisen od zaznanega narečja.
 */

import type { PrismaClient } from "@prisma/client";

/** Strukturalni tip, ki ga sprejme migracija (testiranje z lastnim klientom). */
type SchemaDb = Pick<PrismaClient, "$queryRawUnsafe" | "$executeRawUnsafe">;

/** Nova geo stolpca (ime → SQL tip PO narečju). */
const GEO_COLUMNS = ["lat", "lng"] as const;

function sqlTypeFor(dialect: "sqlite" | "postgres"): string {
  // Prisma Float: postgres → DOUBLE PRECISION, sqlite → REAL.
  return dialect === "postgres" ? "DOUBLE PRECISION" : "REAL";
}

export interface ExperienceGeoMigrationResult {
  dialect: "sqlite" | "postgres" | "unknown";
  columnsAdded: string[];
}

/** Seznam obstoječih stolpcev tabele Experience — sqlite PRAGMA ali
 *  postgres information_schema (ista detekcija kot listing-practical). */
async function listExperienceColumns(
  client: SchemaDb
): Promise<{ dialect: "sqlite" | "postgres" | "unknown"; columns: string[] | null }> {
  // 1) SQLite: PRAGMA table_info vrne vrstice { cid, name, type, ... }.
  //    POZOR: identifikatorji brez narekovajev — sqlite so case-insensitive,
  //    dvojne narekovaje v $executeRawUnsafe pa Prisma sqlite driver ubeži.
  try {
    const rows = (await client.$queryRawUnsafe(
      "PRAGMA table_info(Experience)"
    )) as Array<Record<string, unknown>>;
    if (Array.isArray(rows)) {
      const names = rows
        .map((r) => (typeof r.name === "string" ? r.name : null))
        .filter((n): n is string => n !== null);
      // Prazna tabela (neznana) bi vrnila [] — PRAGMA ne vrže napake, tudi
      // če tabela ne obstaja; stolpci prazni → nadaljuj na postgres poizvedbo.
      if (names.length > 0) return { dialect: "sqlite", columns: names };
    }
  } catch {
    // Postgres: PRAGMA je sintaksna napaka → preskusi information_schema
  }

  // 2) Postgres: information_schema.columns (tabela/kolonke so citirane z
  //    veliko začetnico — prisma jih tako ustvari; literali v enojnih narekovajih)
  try {
    const rows = (await client.$queryRawUnsafe(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'Experience'"
    )) as Array<Record<string, unknown>>;
    if (Array.isArray(rows)) {
      const names = rows
        .map((r) =>
          typeof r.column_name === "string" ? r.column_name : null
        )
        .filter((n): n is string => n !== null);
      return { dialect: "postgres", columns: names };
    }
  } catch {
    // fail-open spodaj
  }

  return { dialect: "unknown", columns: null };
}

/**
 * Doda manjkajoča geo stolpca (lat/lng) na tabelo Experience.
 * Vedno varna za ponovno poganjanje; nikoli ne meče (fail-open v ovojnici).
 */
export async function migrateExperienceGeoColumnsWith(
  client: SchemaDb
): Promise<ExperienceGeoMigrationResult> {
  const { dialect, columns } = await listExperienceColumns(client);
  if (columns === null || dialect === "unknown") {
    return { dialect, columnsAdded: [] };
  }

  // Narečju primeren quoting: Postgres ZAHTJEVA dvojne narekovaje (Prisma
  // ustvari citirane identifikatorje z velikimi črkami), sqlite driver pa
  // dvojne narekovaje v raw poizvedbi ubeži — tam so identifikatorji
  // case-insensitive in zadošča goli zapis.
  const q = (id: string) => (dialect === "postgres" ? `"${id}"` : id);
  const type = sqlTypeFor(dialect);

  const columnsAdded: string[] = [];
  for (const column of GEO_COLUMNS) {
    if (columns.includes(column)) continue;
    await client.$executeRawUnsafe(
      `ALTER TABLE ${q("Experience")} ADD COLUMN ${q(column)} ${type}`
    );
    columnsAdded.push(column);
  }

  return { dialect, columnsAdded };
}

/**
 * Produkcijska ovojnica — uporabi globalni db klient (iz src/lib/db).
 * LAZY uvoz db: modul ostane uvozljiv v orodjih/skriptah z lastnim klientom,
 * ne da bi konstruiral glavnega klienta v napačnem okolju.
 */
export async function migrateExperienceGeoColumns(): Promise<ExperienceGeoMigrationResult> {
  const { db } = await import("@/lib/db");
  return migrateExperienceGeoColumnsWith(db);
}
