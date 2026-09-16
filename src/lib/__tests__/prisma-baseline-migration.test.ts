/**
 * Testi zagoniske baseline migracije (MIGR-HISTORY 1.30.0, poostritev 1.32.0).
 *
 * Najpomembnejši test je varovalka CHECKSUM: BASELINE_CHECKSUM konstanta mora
 * biti natanko sha256(prisma/migrations/20260916000000_baseline/migration.sql)
 * — tiha sprememba baseline datoteke (ki bi povzročila drift glede na
 * produkcijo) takoj pade na rdečem testu.
 *
 * Poostritev (revizija 1.32.0, uporabnikovi trditvi 1+2):
 *   · obstoječa vrstica se preveri po CHECKSUMU — napačen checksum →
 *     checksum-mismatch (ne "already", ki bi lagal o varnih vratih);
 *   · dvojne vrstice → duplicate;
 *   · neuspešen unique indeks → index-failed in NO INSERT (dirkalno-nevarna
 *     WHERE NOT EXISTS pot je umaknjena).
 */

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  BASELINE_CHECKSUM,
  BASELINE_MIGRATION_ID,
  resolvePrismaBaselineWith,
  type BaselineResolveResult,
} from "../prisma-baseline-migration";

/** Lažni Prisma klient z beleženjem izjav (scripted odgovori). */
function makeDb(script: {
  /** Odziv PRAGMA (array = sqlite). */
  pragma?: unknown[];
  pragmaThrows?: boolean;
  /** Odziv information_schema poizvedbe (array = postgres). */
  info?: unknown[];
  infoThrows?: boolean;
  /** Odziv SELECT … FROM _prisma_migrations (neprazno = baseline obstaja). */
  existing?: unknown[];
  /** Odziv $executeRawUnsafe: število zadetih vrstic (ali napaka). */
  exec?: (sql: string) => number | Promise<number>;
}) {
  const calls = { query: [] as string[], exec: [] as string[] };
  const db = {
    async $queryRawUnsafe(sql: string) {
      calls.query.push(sql);
      if (sql.startsWith("PRAGMA")) {
        if (script.pragmaThrows) throw new Error("syntax error near PRAGMA");
        return script.pragma ?? [];
      }
      if (sql.includes("information_schema")) {
        if (script.infoThrows) throw new Error("connection refused");
        return script.info ?? [];
      }
      return script.existing ?? [];
    },
    async $executeRawUnsafe(sql: string) {
      calls.exec.push(sql);
      const r = script.exec ? await script.exec(sql) : 0;
      return r;
    },
  };
  return { db, calls };
}

type SchemaDb = Parameters<typeof resolvePrismaBaselineWith>[0];

describe("prisma-baseline-migration", () => {
  test("BASELINE_CHECKSUM je sha256 baseline migration.sql (varovalka proti tihi spremembi)", () => {
    const file = path.join(
      process.cwd(),
      "prisma/migrations",
      BASELINE_MIGRATION_ID,
      "migration.sql"
    );
    const sum = createHash("sha256").update(readFileSync(file)).digest("hex");
    expect(sum).toBe(BASELINE_CHECKSUM);
  });

  test("sqlite (dev/Docker/demo) → skipped, brez pisanja", async () => {
    const { db, calls } = makeDb({ pragma: [{ name: "id" }] });
    const r: BaselineResolveResult = await resolvePrismaBaselineWith(
      db as unknown as SchemaDb
    );
    expect(r.dialect).toBe("sqlite");
    expect(r.action).toBe("skipped");
    expect(r.detail).toContain("db push");
    expect(calls.exec).toHaveLength(0);
  });

  test("DB nedosegljiva → unknown, brez pisanja", async () => {
    const { db, calls } = makeDb({ pragmaThrows: true, infoThrows: true });
    const r = await resolvePrismaBaselineWith(db as unknown as SchemaDb);
    expect(r.dialect).toBe("unknown");
    expect(r.action).toBe("skipped");
    expect(calls.exec).toHaveLength(0);
  });

  test("postgres + baseline že zabeležen z PRAVIM checksumom → already, brez INSERT", async () => {
    const { db, calls } = makeDb({
      pragmaThrows: true,
      info: [{ table_name: "SavedItinerary" }],
      existing: [{ checksum: BASELINE_CHECKSUM }],
    });
    const r = await resolvePrismaBaselineWith(db as unknown as SchemaDb);
    expect(r.dialect).toBe("postgres");
    expect(r.action).toBe("already");
    expect(r.detail).toContain("se ujema");
    expect(r.detail).toContain(BASELINE_CHECKSUM.slice(0, 8));
    expect(calls.exec.filter((s) => s.startsWith("INSERT"))).toHaveLength(0);
  });

  test("postgres + baseline z NAPAČNIM checksumom → checksum-mismatch (degraded), brez INSERT — ne lagamo o varnih vratih", async () => {
    const { db, calls } = makeDb({
      pragmaThrows: true,
      info: [{ table_name: "SavedItinerary" }],
      existing: [{ checksum: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" }],
    });
    const r = await resolvePrismaBaselineWith(db as unknown as SchemaDb);
    expect(r.dialect).toBe("postgres");
    expect(r.action).toBe("checksum-mismatch");
    expect(r.detail).toContain("drift");
    expect(r.detail).toContain("NISO varna");
    expect(calls.exec.filter((s) => s.startsWith("INSERT"))).toHaveLength(0);
  });

  test("postgres + dvojne vrstice baseline-a → duplicate (degraded), brez INSERT", async () => {
    const { db, calls } = makeDb({
      pragmaThrows: true,
      info: [{ table_name: "SavedItinerary" }],
      existing: [
        { checksum: BASELINE_CHECKSUM },
        { checksum: BASELINE_CHECKSUM },
      ],
    });
    const r = await resolvePrismaBaselineWith(db as unknown as SchemaDb);
    expect(r.dialect).toBe("postgres");
    expect(r.action).toBe("duplicate");
    expect(r.detail).toContain("2 vrstic");
    expect(calls.exec.filter((s) => s.startsWith("INSERT"))).toHaveLength(0);
  });

  test("postgres + manjkajoč baseline → recorded: tabela, unique indeks in INSERT z ON CONFLICT", async () => {
    const { db, calls } = makeDb({
      pragmaThrows: true,
      info: [{ table_name: "SavedItinerary" }],
      existing: [],
      exec: () => 1,
    });
    const r = await resolvePrismaBaselineWith(db as unknown as SchemaDb);
    expect(r.dialect).toBe("postgres");
    expect(r.action).toBe("recorded");
    expect(r.detail).toContain(BASELINE_CHECKSUM.slice(0, 8));

    // Vrstni red pripravljalnih izjav
    expect(calls.exec[0]).toContain('CREATE TABLE IF NOT EXISTS "_prisma_migrations"');
    expect(calls.exec[1]).toContain("CREATE UNIQUE INDEX");

    // INSERT z enakovredno vrstico migrate resolve --applied
    const insert = calls.exec.find((s) => s.startsWith("INSERT"));
    expect(insert).toBeDefined();
    expect(insert!).toContain(BASELINE_MIGRATION_ID);
    expect(insert!).toContain(BASELINE_CHECKSUM);
    expect(insert!).toContain('ON CONFLICT ("migration_name") DO NOTHING');
    expect(insert!).toContain("applied_steps_count");
    expect(insert!).toContain("now()");
  });

  test("dirka: INSERT vrne 0 vrstic (sočasna instanca je zmagala) → already", async () => {
    const { db } = makeDb({
      pragmaThrows: true,
      info: [],
      existing: [],
      exec: () => 0,
    });
    const r = await resolvePrismaBaselineWith(db as unknown as SchemaDb);
    expect(r.action).toBe("already");
    expect(r.detail).toContain("sočasn");
  });

  test("neuspešen unique indeks → index-failed (degraded) in NO INSERT — dirkalno-nevarna WHERE NOT EXISTS pot je umaknjena", async () => {
    const { db, calls } = makeDb({
      pragmaThrows: true,
      info: [],
      existing: [],
      exec: (sql) =>
        sql.includes("CREATE UNIQUE INDEX")
          ? Promise.reject(new Error("could not create unique index"))
          : 1,
    });
    const r = await resolvePrismaBaselineWith(db as unknown as SchemaDb);
    expect(r.dialect).toBe("postgres");
    expect(r.action).toBe("index-failed");
    expect(r.detail).toContain("NI zapisan");
    expect(r.detail).toContain("idempotenten");

    // KLJUČNA trditev revizije: brez unique varovalke NE vstavljamo ničesar
    const insert = calls.exec.find((s) => s.startsWith("INSERT"));
    expect(insert).toBeUndefined();
  });

  test("index-failed je samozdravilen: prehodna napaka indeksa + uspešen naslednji zagon → recorded", async () => {
    // Prvi zagon: indeks odpove → nič ni zapisanega (zgornji test). Drugi
    // zagon: indeks uspe, vrstice še ni → normalna ON CONFLICT vstavitev.
    // (Simuliramo samo drugi zagon — prvi je pokrit zgoraj.)
    const { db, calls } = makeDb({
      pragmaThrows: true,
      info: [],
      existing: [],
      exec: () => 1,
    });
    const r = await resolvePrismaBaselineWith(db as unknown as SchemaDb);
    expect(r.action).toBe("recorded");
    const insert = calls.exec.find((s) => s.startsWith("INSERT"));
    expect(insert).toBeDefined();
    expect(insert!).toContain('ON CONFLICT ("migration_name") DO NOTHING');
    expect(insert!).not.toContain("WHERE NOT EXISTS");
  });
});
