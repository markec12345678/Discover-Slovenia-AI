/**
 * ZAGONSKA SHEMA MIGRACIJA — PRAKTIČNI PODATKI LOKALCA (t12 faza 1)
 *
 * Problem: prisma/schema.prisma ima od t12 faze 1 tri nova NEOBVEZNA polja
 * modela Listing (seasons, weatherSuitability, parking). Build jih NE sinhro-
 * nizira v obstoječe baze (build-demo-db.sh se izogne pri postgres providerju;
 * Render build ne poganja db push) — Prisma poizvedbe, ki izbirajo nova
 * polja, bi na stari bazi padle z "column does not exist".
 *
 * Ta migracija ob zagonu strežnika (instrumentation.ts) DODA manjkajoče
 * stolpce z additive-only ALTER TABLE:
 *   - Postgres (Render/Neon, Pot B): information_schema.columns
 *   - SQLite (Vercel demo / Docker Pot A): PRAGMA table_info
 *
 * Lastnosti:
 *   - IDEMPOTENTNA: drugi zagon ne doda ničesar (stolpci že obstajajo);
 *   - ADDITIVE-ONLY: nikoli ne briše ali spreminja obstoječih stolpcev/podatkov;
 *   - FAIL-OPEN: napaka se zalogira, zagon strežnika se nadaljuje;
 *   - Izklop: DSA_DISABLE_SCHEMA_MIGRATION=1.
 *
 * Vzorjena na src/lib/marketplace-image-migration.ts (MKT-IMG) — vključno z
 * vbrizganim klientom za E2E testiranje (scripts/test-listing-practical.ts).
 */

import type { PrismaClient } from "@prisma/client";

/** Strukturalni tip, ki ga sprejme migracija (omogoča testiranje z lastnim klientom) */
type SchemaDb = Pick<PrismaClient, "$queryRawUnsafe" | "$executeRawUnsafe">;

/** Nova polja (ime → SQL tip). Dodajanje novih = samo nov vnos v tem seznamu. */
const LISTING_COLUMNS: Record<string, string> = {
  seasons: "TEXT",
  weatherSuitability: "TEXT",
  parking: "TEXT",
};

export interface SchemaMigrationResult {
  dialect: "sqlite" | "postgres" | "unknown";
  columnsAdded: string[];
}

/** Seznam obstoječih stolpcev tabele Listing — sqlite PRAGMA ali postgres information_schema. */
async function listListingColumns(
  client: SchemaDb
): Promise<{ dialect: "sqlite" | "postgres" | "unknown"; columns: string[] | null }> {
  // 1) SQLite: PRAGMA table_info vrne vrstice { cid, name, type, ... }
  //    POZOR: identifikatorji brez narekovajev — sqlite so case-insensitive,
  //    dvojne narekovaje v $executeRawUnsafe pa Prisma sqlite driver ubeži.
  try {
    const rows = (await client.$queryRawUnsafe(
      "PRAGMA table_info(Listing)"
    )) as Array<Record<string, unknown>>;
    if (Array.isArray(rows)) {
      const names = rows
        .map((r) => (typeof r.name === "string" ? r.name : null))
        .filter((n): n is string => n !== null);
      // Prazna tabela (neznana) bi vrnila [] — PRAGMA ne vrže napake, tudi če
      // tabela ne obstaja; stolpci prazni → nadaljuj na postgres poizvedbo.
      if (names.length > 0) return { dialect: "sqlite", columns: names };
    }
  } catch {
    // Postgres: PRAGMA je sintaksna napaka → preskusi information_schema
  }

  // 2) Postgres: information_schema.columns (tabela/kolonke so citirane z
  //    veliko začetnico — prisma jih tako ustvari; literali v enojnih narekovajih)
  try {
    const rows = (await client.$queryRawUnsafe(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'Listing'"
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
 * Doda manjkajoče praktične stolpce na tabelo Listing.
 * Vedno varna za ponovno poganjanje; nikoli ne meče (fail-open v ovojnici).
 */
export async function migrateListingPracticalColumnsWith(
  client: SchemaDb
): Promise<SchemaMigrationResult> {
  const { dialect, columns } = await listListingColumns(client);
  if (columns === null) {
    return { dialect, columnsAdded: [] };
  }

  // Narečju primeren quoting: Postgres ZAHTUVA dvojne narekovaje (Prisma
  // ustvari citirane identifikatorje z velikimi črkami), sqlite driver pa
  // dvojne narekovaje v raw poizvedbi ubeži — tam so identifikatorji
  // case-insensitive in zadošča goli zapis.
  const q = (id: string) => (dialect === "postgres" ? `"${id}"` : id);

  const columnsAdded: string[] = [];
  for (const [column, type] of Object.entries(LISTING_COLUMNS)) {
    if (columns.includes(column)) continue;
    await client.$executeRawUnsafe(
      `ALTER TABLE ${q("Listing")} ADD COLUMN ${q(column)} ${type}`
    );
    columnsAdded.push(column);
  }

  return { dialect, columnsAdded };
}

/**
 * Produkcijska ovojnica — uporabi globalni db klient (iz src/lib/db).
 * LAZY uvoz db: modul ostane uvozljiv v orodjih/skriptah z lastnim klientom
 * (npr. E2E test na schema-test.prisma), ne da bi konstruiral glavnega
 * (postgres) klienta v okolju z file: DATABASE_URL.
 */
export async function migrateListingPracticalColumns(): Promise<SchemaMigrationResult> {
  const { db } = await import("@/lib/db");
  return migrateListingPracticalColumnsWith(db);
}
