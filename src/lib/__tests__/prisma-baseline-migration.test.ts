/**
 * Testi zagoniske baseline migracije (MIGR-HISTORY 1.30.0, poostritev 1.32.0,
 * samoozdravitev 1.100.1).
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
 *
 * SAMOOZDRavitEV (HOTFIX 1.100.1):
 *   · ZGODOVINSKI (git-znan) checksum → optimistični UPDATE na trenutnega
 *     (healed), ne INSERT — proizvodnja se sam uskladi po spremembi
 *     baseline datoteke v novem VAL-u;
 *   · neznan checksum NE sproži heal-a (ostane checksum-mismatch —
 *     pravi drift se ne more prikriti);
 *   · heal je odporen na dirke (0 vrstic → ponovno branje) in napake
 *     (UPDATE meče → čitljivo degraded poročilo z namigom).
 */

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  BASELINE_CHECKSUM,
  BASELINE_MIGRATION_ID,
  HISTORICAL_BASELINE_CHECKSUMS,
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
  /**
   * Zaporedje odgovorov SELECT … FROM _prisma_migrations (po klicu;
   * 1.100.1: healova pot bere DVAKRAT — zastareli, nato ponovno). Če je
   * vrsta izčrpana, pade nazaj na `existing`.
   */
  existingQueue?: unknown[][];
  /** Odziv $executeRawUnsafe: število zadetih vrstic (ali napaka). */
  exec?: (sql: string) => number | Promise<number>;
}) {
  const calls = { query: [] as string[], exec: [] as string[] };
  const queue = [...(script.existingQueue ?? [])];
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
      if (script.existingQueue) {
        return queue.length > 0 ? queue.shift() : (script.existing ?? []);
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

  test("postgres + baseline z NAPAČNIM (NEZNANIM) checksumom → checksum-mismatch (degraded), brez INSERT in brez heal-UPDATE — ne lagamo o varnih vratih", async () => {
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
    // 1.100.1: tuji checksum NE sme sprožiti samoozdravitvenega UPDATE-a —
    // pravi drift se ne more prikriti za heal pot.
    expect(calls.exec.filter((s) => s.startsWith("UPDATE"))).toHaveLength(0);
  });

  // =========================================================================
  // SAMOOZDRavitEV (HOTFIX 1.100.1) — ZGODOVINSKI checksumi
  // =========================================================================

  test("HISTORICAL_BASELINE_CHECKSUMS varovalka: edinstveni, 64-hex, brez sedanje vrednosti BASELINE_CHECKSUM", () => {
    expect(HISTORICAL_BASELINE_CHECKSUMS.length).toBeGreaterThanOrEqual(4);
    const set = new Set(HISTORICAL_BASELINE_CHECKSUMS);
    expect(set.size).toBe(HISTORICAL_BASELINE_CHECKSUMS.length); // brez duplikatov
    for (const c of HISTORICAL_BASELINE_CHECKSUMS) {
      expect(c).toMatch(/^[0-9a-f]{64}$/); // polni sha256
      expect(c).not.toBe(BASELINE_CHECKSUM); // "zgodovina" ne sme vsebovati sedanjosti
    }
  });

  test("postgres + baseline z ZGODOVINSKIM checksumom → healed: optimistični UPDATE (stari AND pogoj), brez INSERT", async () => {
    const stale = HISTORICAL_BASELINE_CHECKSUMS[0];
    const { db, calls } = makeDb({
      pragmaThrows: true,
      info: [{ table_name: "SavedItinerary" }],
      existing: [{ checksum: stale }],
      exec: () => 1,
    });
    const r = await resolvePrismaBaselineWith(db as unknown as SchemaDb);
    expect(r.dialect).toBe("postgres");
    expect(r.action).toBe("healed");
    expect(r.detail).toContain("ZGODOVINSKI");
    expect(r.detail).toContain(stale.slice(0, 8));
    expect(r.detail).toContain(BASELINE_CHECKSUM.slice(0, 8));
    expect(r.detail).toContain("sinhrona");

    const update = calls.exec.find((s) => s.startsWith("UPDATE"));
    expect(update).toBeDefined();
    // Optimistična varovalka: WHERE omeji na točno starem checksumu + imenu
    expect(update!).toContain('UPDATE "_prisma_migrations"');
    expect(update!).toContain(`"checksum" = '${BASELINE_CHECKSUM}'`);
    expect(update!).toContain(`"checksum" = '${stale}'`);
    expect(update!).toContain(`"migration_name" = '${BASELINE_MIGRATION_ID}'`);
    // Heal NE uporablja INSERT poti (vrstica že obstaja)
    expect(calls.exec.filter((s) => s.startsWith("INSERT"))).toHaveLength(0);
  });

  test("vsak ZGODOVINSKI checksum (vse 4 različice) se ozdravi — ne le najstarejša", async () => {
    for (const stale of HISTORICAL_BASELINE_CHECKSUMS) {
      const { db } = makeDb({
        pragmaThrows: true,
        info: [{ table_name: "SavedItinerary" }],
        existing: [{ checksum: stale }],
        exec: () => 1,
      });
      const r = await resolvePrismaBaselineWith(db as unknown as SchemaDb);
      expect(r.action).toBe("healed");
    }
  });

  test("heal dirka: UPDATE vrne 0 vrstic + ponovni SELECT pokaže NOV checksum → already (sočasna instanca je zmagala)", async () => {
    const stale = HISTORICAL_BASELINE_CHECKSUMS[0];
    const { db, calls } = makeDb({
      pragmaThrows: true,
      info: [{ table_name: "SavedItinerary" }],
      existingQueue: [
        [{ checksum: stale }], // prvo branje: zastareli
        [{ checksum: BASELINE_CHECKSUM }], // ponovno branje po 0-vrsticnem UPDATE
      ],
      exec: () => 0,
    });
    const r = await resolvePrismaBaselineWith(db as unknown as SchemaDb);
    expect(r.action).toBe("already");
    expect(r.detail).toContain("sočasne");
    // 1.100.1: ponovno branje se je ZGODILO (dva SELECTa na _prisma_migrations)
    const reads = calls.query.filter(
      (s) => s.includes('FROM "_prisma_migrations"') && s.startsWith("SELECT")
    );
    expect(reads.length).toBe(2);
  });

  test("heal dirka: UPDATE vrne 0 + ponovni SELECT pokaže NEZNAN checksum → checksum-mismatch (stanje se je spremenilo pod nami)", async () => {
    const stale = HISTORICAL_BASELINE_CHECKSUMS[0];
    const { db } = makeDb({
      pragmaThrows: true,
      info: [{ table_name: "SavedItinerary" }],
      existingQueue: [
        [{ checksum: stale }],
        [{ checksum: "cafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabe" }],
      ],
      exec: () => 0,
    });
    const r = await resolvePrismaBaselineWith(db as unknown as SchemaDb);
    expect(r.action).toBe("checksum-mismatch");
    expect(r.detail).toContain("spremenila");
  });

  test("heal odpoved: UPDATE meče (pravice?) → checksum-mismatch z namigom na ročno uskladitev — fail-open proti zagonu, ne proti resnici", async () => {
    const stale = HISTORICAL_BASELINE_CHECKSUMS[0];
    const { db } = makeDb({
      pragmaThrows: true,
      info: [{ table_name: "SavedItinerary" }],
      existing: [{ checksum: stale }],
      exec: (sql) =>
        sql.startsWith("UPDATE")
          ? Promise.reject(new Error("permission denied for table _prisma_migrations"))
          : 1,
    });
    const r = await resolvePrismaBaselineWith(db as unknown as SchemaDb);
    expect(r.action).toBe("checksum-mismatch");
    expect(r.detail).toContain("ni uspela");
    expect(r.detail).toContain("ročno");
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
