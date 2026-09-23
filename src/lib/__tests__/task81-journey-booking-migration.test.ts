/**
 * Testi zagoniske shema migracije JourneyBooking (TASK 81, 1.74.3).
 *
 * Ozadje: model JourneyBooking (TASK 58, 1.59.0) je bil commitan BREZ prisma
 * migracije in BREZ startup koraka — CI "Migration drift check" bi to odkril,
 * a je bil Build job od 1.59.0 stalno SKIPPED (needs: quality; quality je
 * padal na tsc). Rezultat: na Neon produkciji tabela nikoli ni bila ustvarjena
 * in /api/journey/bookings vrača 503 namesto praznega seznama.
 *
 * Tokrat se to ne sme več ponoviti:
 *   1. UNIT testi nad migrateJourneyBookingTableWith (mock klient, obe
 *      narečji, idempotentnost, fail-open unknown);
 *   2. SOURCE-CONTRACT testi (precedent TASK 78/73/80 — trditve nad
 *      DEJANSKO odposlanimi datotekami):
 *      - prisma/migrations/20260922100000_journey_booking/migration.sql
 *        vsebuje NATANČNO tabelo + 3 indekse (drift vrata CI);
 *      - DDL se ujema z modelom v schema.prisma (stolpci po vrsti);
 *      - startup migracija (journey-booking-migration.ts) vsebuje ISTA
 *        imena stolpcev/indeksov kot SQL migracija (skladje obeh poti);
 *      - instrumentation.ts registrira korak schema:journey-booking.
 */

import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { migrateJourneyBookingTableWith } from "../journey-booking-migration";

const ROOT = process.cwd();

/** Lažni Prisma klient z beleženjem izjav (scripted odgovori). */
function makeDb(script: {
  /** Odziv PRAGMA (array = sqlite). */
  pragma?: unknown[];
  pragmaThrows?: boolean;
  /** Odziv information_schema poizvedbe (array = postgres). */
  info?: unknown[];
  infoThrows?: boolean;
  /** Odziv obstoja JourneyBooking tabele (neprazno = obstaja). */
  tableExists?: boolean;
  /** Odziv $executeRawUnsafe: število zadetih vrstic (ali napaka). */
  exec?: (sql: string) => number | Promise<number>;
}) {
  const calls = { query: [] as string[], exec: [] as string[] };
  const db = {
    async $queryRawUnsafe(sql: string) {
      calls.query.push(sql);
      if (sql.startsWith("PRAGMA")) {
        if (script.pragmaThrows) throw new Error("syntax error near PRAGMA");
        // PRAGMA na JourneyBooking = preverba obstoja tabele (neprazno = obstaja)
        if (sql.includes("JourneyBooking")) {
          return script.tableExists ? [{ name: "id" }] : [];
        }
        return script.pragma ?? [];
      }
      if (sql.includes("information_schema.tables")) {
        if (sql.includes("JourneyBooking")) {
          return script.tableExists ? [{ table_name: "JourneyBooking" }] : [];
        }
        if (script.infoThrows) throw new Error("connection refused");
        return script.info ?? [];
      }
      return [];
    },
    async $executeRawUnsafe(sql: string) {
      calls.exec.push(sql);
      const r = script.exec ? await script.exec(sql) : 0;
      return r;
    },
  };
  return { db, calls };
}

type SchemaDb = Parameters<typeof migrateJourneyBookingTableWith>[0];

describe("journey-booking-migration (unit)", () => {
  test("postgres, tabela manjka → CREATE TABLE + 3 indeksi, poročana ustvaritev", async () => {
    const { db, calls } = makeDb({ pragmaThrows: true, info: [{}] });
    const r = await migrateJourneyBookingTableWith(db as unknown as SchemaDb);
    expect(r.dialect).toBe("postgres");
    expect(r.tablesCreated).toEqual(["JourneyBooking"]);

    const create = calls.exec.find((s) => s.includes('CREATE TABLE "JourneyBooking"'));
    expect(create).toBeTruthy();
    // postgres DDL specifike (skladno s prisma postgres konvencijo)
    expect(create).toContain("TIMESTAMP(3)");
    expect(create).toContain('CONSTRAINT "JourneyBooking_pkey" PRIMARY KEY ("id")');
    expect(create).toContain("DOUBLE PRECISION");
    // TASK 99: efemerni obseg seje je del CREATE (nove baze)
    expect(create).toContain('"sessionKey" TEXT');

    const idx = calls.exec.filter((s) => s.startsWith("CREATE INDEX"));
    expect(idx).toHaveLength(4);
    expect(idx.map((s) => s.match(/"JourneyBooking_[a-zA-Z_]+_idx"/)![0]).sort()).toEqual([
      '"JourneyBooking_provider_providerProductId_idx"',
      '"JourneyBooking_sessionKey_idx"',
      '"JourneyBooking_shareId_idx"',
      '"JourneyBooking_status_idx"',
    ]);
  });

  test("postgres, tabela že obstaja → NIČ ni ustvarjeno (idempotentnost)", async () => {
    const { db, calls } = makeDb({
      pragmaThrows: true,
      info: [{}],
      tableExists: true,
    });
    const r = await migrateJourneyBookingTableWith(db as unknown as SchemaDb);
    expect(r.dialect).toBe("postgres");
    expect(r.tablesCreated).toEqual([]);
    expect(calls.exec.filter((s) => s.includes("CREATE TABLE"))).toHaveLength(0);
    // TASK 99: obstoječa tabela dobi idempotentni ALTER ADD COLUMN sessionKey
    expect(
      calls.exec.find((s) =>
        s.includes('ALTER TABLE "JourneyBooking" ADD COLUMN IF NOT EXISTS "sessionKey"'))
    ).toBeTruthy();
    // indeksi vseeno tečejo (IF NOT EXISTS — poceni in varni; TASK 99: 4)
    expect(calls.exec.filter((s) => s.startsWith("CREATE INDEX"))).toHaveLength(4);
  });

  test("sqlite, tabela manjka → sqlite DDL (DATETIME, inline PRIMARY KEY)", async () => {
    const { db, calls } = makeDb({ pragma: [{ name: "id" }] });
    const r = await migrateJourneyBookingTableWith(db as unknown as SchemaDb);
    expect(r.dialect).toBe("sqlite");
    expect(r.tablesCreated).toEqual(["JourneyBooking"]);

    const create = calls.exec.find((s) => s.includes('CREATE TABLE IF NOT EXISTS "JourneyBooking"'));
    expect(create).toBeTruthy();
    expect(create).toContain("DATETIME");
    expect(create).toContain('"id" TEXT NOT NULL PRIMARY KEY');
    expect(create).toContain("REAL");
  });

  test("DB nedosegljiva (unknown) → prazen rezultat, brez DDL (fail-open)", async () => {
    const { db, calls } = makeDb({ pragmaThrows: true, infoThrows: true });
    const r = await migrateJourneyBookingTableWith(db as unknown as SchemaDb);
    expect(r.dialect).toBe("unknown");
    expect(r.tablesCreated).toEqual([]);
    expect(calls.exec).toHaveLength(0);
  });
});

describe("journey-booking-migration (source-contract)", () => {
  const sqlPath = path.join(
    ROOT,
    "prisma/migrations/20260922100000_journey_booking/migration.sql"
  );
  const sql = readFileSync(sqlPath, "utf8");
  const libSrc = readFileSync(
    path.join(ROOT, "src/lib/journey-booking-migration.ts"),
    "utf8"
  );
  const instrumentation = readFileSync(
    path.join(ROOT, "src/instrumentation.ts"),
    "utf8"
  );
  const schema = readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");

  test("migracijska SQL vsebuje tabelo JourneyBooking z vsemi stolpci modela", () => {
    expect(sql).toContain('CREATE TABLE "JourneyBooking"');
    // stolpci iz modela (vrstni red po shemi) — TASK 99: +sessionKey (14)
    const model = schema.match(/model JourneyBooking \{([\s\S]*?)\n\}/)![1];
    const cols = [...model.matchAll(/^\s+([a-zA-Z]+)\s+/gm)].map((m) => m[1]);
    expect(cols.length).toBe(14);
    for (const c of cols) {
      expect(sql).toContain(`"${c}"`);
    }
  });

  test("migracijska SQL vsebuje vse 4 indekse iz modela", () => {
    expect(sql).toContain('CREATE INDEX "JourneyBooking_shareId_idx" ON "JourneyBooking"("shareId")');
    expect(sql).toContain('CREATE INDEX "JourneyBooking_sessionKey_idx" ON "JourneyBooking"("sessionKey")');
    expect(sql).toContain(
      'CREATE INDEX "JourneyBooking_provider_providerProductId_idx" ON "JourneyBooking"("provider", "providerProductId")'
    );
    expect(sql).toContain('CREATE INDEX "JourneyBooking_status_idx" ON "JourneyBooking"("status")');
    // indeksi v modelu (@@index) morajo biti natanko 4 (TASK 99: +sessionKey)
    const idxCount = [...model_indexMatches(schema)].length;
    expect(idxCount).toBe(4);
  });

  function* model_indexMatches(s: string) {
    const m = s.match(/model JourneyBooking \{([\s\S]*?)\n\}/)![1];
    yield* m.matchAll(/@@index\(\[([^\]]+)\]\)/g);
  }

  test("startup migracija (lib) uporablja ISTA imena stolpcev kot SQL migracija", () => {
    // vsak stolpec iz migracijske SQL mora živeti tudi v lib DDL (postgres veja)
    for (const col of [
      "id", "shareId", "sessionKey", "provider", "providerProductId", "status",
      "providerBookingId", "confirmedPrice", "currency", "confirmationUrl",
      "cancellationUrl", "providerPayload", "createdAt", "updatedAt",
    ]) {
      expect(libSrc).toContain(`"${col}"`);
    }
    // ista 4 imena indeksov + idempotentni ALTER za obstoječe baze (TASK 99)
    expect(libSrc).toContain('"JourneyBooking_shareId_idx"');
    expect(libSrc).toContain('"JourneyBooking_sessionKey_idx"');
    expect(libSrc).toContain('"JourneyBooking_provider_providerProductId_idx"');
    expect(libSrc).toContain('"JourneyBooking_status_idx"');
    // idempotentni ALTER za obstoječe baze (TASK 99 + HARDENING H1:
    // zanka po ["shareId", "sessionKey"] — dejanska izvedba je dokazana v
    // unit healing testih z izvedenimi SQL izjavami, tu le source-kontrakt)
    expect(libSrc).toContain('["shareId", "sessionKey"]');
    expect(libSrc).toContain('ADD COLUMN "${column}" TEXT');
  });

  test("instrumentation.ts registrira startup korak schema:journey-booking", () => {
    expect(instrumentation).toContain("./lib/journey-booking-migration");
    expect(instrumentation).toContain('name: "schema:journey-booking"');
    // vsi 4 statusi (ok/unknown/failed + ok-tabela-že-prisotna) so pokriti
    const step = instrumentation.match(
      /schema:journey-booking[\s\S]{0,3000}?fail-open/g
    );
    expect(step!.length).toBeGreaterThanOrEqual(1);
    const statuses = instrumentation.match(/name: "schema:journey-booking"/g)!;
    expect(statuses.length).toBe(4);
  });

  test("drift je res zaprt: vsi modeli iz sheme so v migracijah (baseline + nove)", () => {
    // preštej vse modele in vse CREATE TABLE v migracijskih datotekah
    const models = [...schema.matchAll(/^model ([A-Za-z]+)/gm)].map((m) => m[1]);
    expect(models.length).toBeGreaterThanOrEqual(29);

    const baseline = readFileSync(
      path.join(ROOT, "prisma/migrations/20260916000000_baseline/migration.sql"),
      "utf8"
    );
    const tables = new Set([
      ...[...baseline.matchAll(/CREATE TABLE "([A-Za-z]+)"/g)].map((m) => m[1]),
      ...[...sql.matchAll(/CREATE TABLE "([A-Za-z]+)"/g)].map((m) => m[1]),
    ]);
    const missing = models.filter((m) => !tables.has(m));
    expect(missing).toEqual([]);
  });
});

// ============================================================================
// HARDENING AUDIT (H1/H2/H3) — DDL STRUKTURNE REGRESIJSKE VRATA
// ============================================================================
// Prejšnji source-contract test je trdil "lib vsebuje shareId" — to je
// izpolnil INDEKS (CREATE INDEX ... ON "JourneyBooking"("shareId")), ne
// CREATE TABLE. Posledica: bug 8782d8c (1.86.0) je izbrisal "shareId" TEXT
// iz OBEH CREATE TABLE vej in CI je ostal zelen; sveža Postgres baza je
// dobila tabelo brez stolpca (indeks nanj je padel), sveža SQLite baza pa
// zaradi nedoločenega narekovaja ("confirmedPrice REAL,) NIČ. Tu sedaj:
//   1. POSTGRES DDL iz vira → VSAK stolpec modela mora biti V CREATE TABLE;
//   2. SQLITE DDL iz vira → IZVEDEN proti pravemu bun:sqlite (sintaksa!) in
//      PRAGMA table_info primerja VSEH 14 stolpcev modela;
//   3. vsi 4 indeksi iz vira se izvedejo nad ustvarjeno tabelo (shareId
//      indeks nad tabelo brez shareId bi PADAL — to je bila dejanska napaka).
//   4. healing: obstoječa tabela brez shareId dobi ADD COLUMN.
// ============================================================================
describe("journey-booking-migration (DDL struktura — HARDENING regresija)", () => {
  const libSrcHard = readFileSync(
    path.join(ROOT, "src/lib/journey-booking-migration.ts"),
    "utf8"
  );
  const MODEL_COLUMNS = [
    "id", "shareId", "sessionKey", "provider", "providerProductId", "status",
    "providerBookingId", "confirmedPrice", "currency", "confirmationUrl",
    "cancellationUrl", "providerPayload", "createdAt", "updatedAt",
  ];

  test("POSTGRES CREATE TABLE iz vira vsebuje VSEH 14 stolpcev modela (ne le indeksi)", () => {
    const pgDdl = libSrcHard.match(
      /\? `CREATE TABLE "JourneyBooking" \(([\s\S]+?)\)\s*`/
    )![1];
    // vsaka DDL vrstica stolpca: zamaknjen "ime" TIP
    const ddlCols = [...pgDdl.matchAll(/"([a-zA-Z]+)"/g)].map((m) => m[1]);
    for (const col of MODEL_COLUMNS) {
      expect(ddlCols).toContain(col);
    }
    expect(pgDdl).toContain('CONSTRAINT "JourneyBooking_pkey"');
  });

  test("SQLITE CREATE TABLE iz vira je SINTAKSNO veljaven in vsebuje VSEH 14 stolpcev (izvedba proti pravemu sqlite)", () => {
    const sqliteDdl = libSrcHard.match(
      /: `CREATE TABLE IF NOT EXISTS "JourneyBooking" \(([\s\S]+?)\)\s*`/
    )![1];
    const db = new Database(":memory:");
    // H2 regresija: nedoločen narekovaj ("confirmedPrice REAL,) tu pade
    db.run(`CREATE TABLE IF NOT EXISTS "JourneyBooking" (${sqliteDdl})`);
    const cols = db
      .query('PRAGMA table_info("JourneyBooking")')
      .all() as { name: string }[];
    expect(cols.map((c) => c.name).sort()).toEqual([...MODEL_COLUMNS].sort());
    // vsi 4 indeksi iz vira se izvedejo nad tabelo (H1: shareId indeks bi
    // padel, če stolpec manjka)
    const idxStmts = [
      ...libSrcHard.matchAll(
        /CREATE INDEX IF NOT EXISTS "JourneyBooking_[a-zA-Z_]+_idx" ON "JourneyBooking"\([^)]*\)/g
      ),
    ].map((m) => m[0]);
    expect(idxStmts).toHaveLength(4);
    for (const stmt of idxStmts) db.run(stmt);
    db.close();
  });

  test("healing: obstoječa tabela BREZ shareId dobi idempotenten ADD COLUMN (sqlite)", async () => {
    // PRAGMA table_info(JourneyBooking) vrne le "id" → manjkata shareId + sessionKey
    const { db, calls } = makeDb({ pragma: [{ name: "id" }], tableExists: true });
    const r = await migrateJourneyBookingTableWith(db as unknown as SchemaDb);
    expect(r.dialect).toBe("sqlite");
    expect(r.tablesCreated).toEqual([]);
    // H1 healing: shareId (in sessionKey) ALTER se izvede
    expect(
      calls.exec.find((s) => s.includes('ALTER TABLE "JourneyBooking" ADD COLUMN "shareId" TEXT'))
    ).toBeTruthy();
    expect(
      calls.exec.find((s) => s.includes('ALTER TABLE "JourneyBooking" ADD COLUMN "sessionKey" TEXT'))
    ).toBeTruthy();
  });

  test("healing: postgres obstoječa tabela dobi ADD COLUMN IF NOT EXISTS za shareId", async () => {
    const { db, calls } = makeDb({ pragmaThrows: true, info: [{}], tableExists: true });
    await migrateJourneyBookingTableWith(db as unknown as SchemaDb);
    expect(
      calls.exec.find((s) =>
        s.includes('ALTER TABLE "JourneyBooking" ADD COLUMN IF NOT EXISTS "shareId" TEXT')
      )
    ).toBeTruthy();
  });
});
