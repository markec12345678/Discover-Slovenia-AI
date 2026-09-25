/**
 * ZAGONSKA SHEMA MIGRACIJA — VERIFIED ZASTAVICA UGC MNENJA (TASK 28, 1.106.0)
 *
 * Problem: prisma/schema.prisma ima od TASK 28 nov OBVEZNI stolpec z
 * privzetkom `Review.verified` (GYG-model »overjena rezervacija« —
 * SNIMAK ob objavi mnenja, izračunan v POST /api/reviews). Build ne
 * sinhronizira sheme v obstoječe baze (Render build ne poganja
 * `prisma migrate deploy` samodejno) — Prisma poizvedbe, ki izbirajo
 * `verified`, bi na stari bazi padle s "column does not exist"
 * (ISTA past kot TASK 84/87 geo stolpci).
 *
 * Ta migracija ob zagonu strežnika (instrumentation.ts) DODA manjkajoči
 * stolpec z additive-only ALTER TABLE:
 *   - Postgres (Render/Neon, Pot B): information_schema.columns
 *   - SQLite (dev / Vercel demo / Docker Pot A): PRAGMA table_info
 *
 * Lastnosti (vzorec F11/F12/t12/TASK 84/87 — experience-geo-migration.ts):
 *   - IDEMPOTENTNA: drugi zagon ne doda ničesar (stolpec že obstaja);
 *   - ADDITIVE-ONLY: nikoli ne briše ali spreminja obstoječih stolpcev/
 *     podatkov (NOT NULL DEFAULT false — obstoječa mnenja ostanejo
 *     neoverjena, zgodovinsko resnično);
 *   - FAIL-OPEN: napaka se zalogira, zagon strežnika se nadaljuje;
 *   - Izklop: DSA_DISABLE_SCHEMA_MIGRATION=1.
 *
 * Dvoje poti (ista arhitektura kot TASK 87):
 *  1. TA datoteka: samoozdravitvena pot ob zagonu;
 *  2. prisma/migrations/20260926100000_review_verified/migration.sql:
 *     zgodovinsko-vrstična resnica za `prisma migrate deploy` in CI
 *     drift vrata (migrations ⇄ schema).
 */

import type { PrismaClient } from "@prisma/client";

/** Strukturalni tip, ki ga sprejme migracija (testiranje z lastnim klientom). */
type SchemaDb = Pick<PrismaClient, "$queryRawUnsafe" | "$executeRawUnsafe">;

export interface ReviewVerifiedMigrationResult {
  dialect: "sqlite" | "postgres" | "unknown";
  columnAdded: boolean;
}

/** Ali tabela Review že ima stolpec `verified` — sqlite PRAGMA ali
 *  postgres information_schema (ista detekcija kot experience-geo). */
async function hasVerifiedColumn(
  client: SchemaDb
): Promise<{ dialect: "sqlite" | "postgres" | "unknown"; has: boolean | null }> {
  // 1) SQLite: PRAGMA table_info vrne vrstice { cid, name, type, ... }.
  //    POZOR: identifikatorji brez narekovajev — sqlite so case-insensitive,
  //    dvojne narekovaje v $executeRawUnsafe pa Prisma sqlite driver ubeži.
  try {
    const rows = (await client.$queryRawUnsafe(
      "PRAGMA table_info(Review)"
    )) as Array<Record<string, unknown>>;
    if (Array.isArray(rows) && rows.length > 0) {
      const names = rows
        .map((r) => (typeof r.name === "string" ? r.name : null))
        .filter((n): n is string => n !== null);
      return { dialect: "sqlite", has: names.includes("verified") };
    }
  } catch {
    // Postgres: PRAGMA je sintaksna napaka → preskusi information_schema
  }

  // 2) Postgres: information_schema.columns (tabela/kolonke citirane z
  //    veliko začetnico — prisma jih tako ustvari; literali v enojnih
  //    narekovajih).
  try {
    const rows = (await client.$queryRawUnsafe(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'Review'"
    )) as Array<Record<string, unknown>>;
    if (Array.isArray(rows)) {
      const names = rows
        .map((r) =>
          typeof r.column_name === "string" ? r.column_name : null
        )
        .filter((n): n is string => n !== null);
      return { dialect: "postgres", has: names.includes("verified") };
    }
  } catch {
    // fail-open spodaj
  }

  return { dialect: "unknown", has: null };
}

/**
 * Doda manjkajoči stolpec `verified` na tabelo Review (NOT NULL DEFAULT
 * false — obstoječa mnenja ostanejo neoverjena). Vedno varna za ponovno
 * poganjanje; nikoli ne meče (fail-open v ovojnici instrumentation).
 */
export async function migrateReviewVerifiedColumnWith(
  client: SchemaDb
): Promise<ReviewVerifiedMigrationResult> {
  const { dialect, has } = await hasVerifiedColumn(client);
  if (dialect === "unknown" || has === null) {
    return { dialect, columnAdded: false };
  }
  if (has === true) {
    return { dialect, columnAdded: false };
  }

  // Narečju primeren quoting: Postgres ZAHTJEVA dvojne narekovaje (Prisma
  // ustvari citirane identifikatorje), sqlite driver pa dvojne narekovaje
  // v raw poizvedbi ubeži — tam zadošča goli zapis (case-insensitive).
  if (dialect === "postgres") {
    await client.$executeRawUnsafe(
      'ALTER TABLE "Review" ADD COLUMN "verified" BOOLEAN NOT NULL DEFAULT false'
    );
  } else {
    await client.$executeRawUnsafe(
      "ALTER TABLE Review ADD COLUMN verified BOOLEAN NOT NULL DEFAULT false"
    );
  }
  return { dialect, columnAdded: true };
}

/**
 * Produkcijska ovojnica — uporabi globalni db klient (iz src/lib/db).
 * LAZY uvoz db: modul ostane uvozljiv v orodjih/skriptah z lastnim klientom,
 * ne da bi konstruiral glavnega klienta v napačnem okolju.
 */
export async function migrateReviewVerifiedColumn(): Promise<ReviewVerifiedMigrationResult> {
  const { db } = await import("@/lib/db");
  return migrateReviewVerifiedColumnWith(db);
}
