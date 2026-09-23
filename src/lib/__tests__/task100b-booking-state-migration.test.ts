// ============================================================================
// TASK 99 §10 / TASK 100 (1.87.1) — BOOKING PAYOUT/CUSTOMER MIGRACIJA: testi
// ============================================================================
//
// Vrzel: stolpca Booking.payoutStatus + Booking.customerStatus sta bila
// (v 1.86.0) dodana SAMO v lokalni (sqlite) shemi — produkcijska
// (postgresql) shema in DEJANSKE baze jih niso dobile, zato je Vercel
// build padal na tipih od 1.86.0 naprej. 1.87.1 zapre vrzel trojno:
//   1. COMMITANA postgres shema (isti polji kot lokalna sqlite);
//   2. zgodovinska migracija 20260923110000_booking_payout_customer
//      (prisma migrate deploy / CI drift vrata);
//   3. STARTUP migracija (ta datoteka) — idempotenten ALTER na obstoječih
//      bazah (isti vzorec kot sessionKey v journey-booking-migration).
//
// Pokriva (unit, mock klient — enak vzorec kot task81):
//   - postgres: obstoječa tabela BREZ stolpcev → 2 idempotentna ALTER-a
//     z varnima privzetkoma, poročana dodanitev;
//   - postgres: stolpca ŽE obstajata → nič ni dodanega (idempotentnost);
//   - postgres: tabela manjka → obrambna CREATE TABLE pot;
//   - sqlite: PRAGMA pot — dodajanje SAMO manjkajočih stolpcev;
//   - sqlite: obstoječa → brez izjav;
//   - unknown dialekt → prazno poročilo (fail-open);
//   - FAIL-OPEN: napaka ALTERja ne vrže;
//   - source-contract: commitana shema VSEBUJE obe polji (postgresql),
//     migracijska SQL obstaja in se ujema, instrumentation poveže korak.
// ============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { migrateBookingStateWith } from "../booking-state-migration";

const ROOT = process.cwd();

function source(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

/** Lažni Prisma klient z beleženjem izjav (scripted odgovori). */
function makeDb(script: {
  /** PRAGMA table_info(Booking) odziv (array = sqlite; vrstice = obstoječi stolpci). */
  pragmaBooking?: { name?: string }[];
  pragmaThrows?: boolean;
  /** information_schema poizvedbe (array = postgres). */
  info?: unknown[];
  infoThrows?: boolean;
  /** Odziv obstoja tabele Booking (neprazno = obstaja). */
  tableExists?: boolean;
  /** Obstoječi stolpci za postgres information_schema.columns. */
  existingColumns?: string[];
  /** $executeRawUnsafe: število vrstic ali napaka. */
  exec?: (sql: string) => number | Promise<number>;
}) {
  const calls = { query: [] as string[], exec: [] as string[] };
  const db = {
    async $queryRawUnsafe(sql: string) {
      calls.query.push(sql);
      if (sql.startsWith("PRAGMA")) {
        if (script.pragmaThrows) throw new Error("syntax error near PRAGMA");
        if (sql.includes("table_info(Booking)")) {
          // PRAGMA na Booking = DIALEKT preizkus (array) in hkrati obstoj
          // tabele (neprazno = tabela obstaja)
          if (!script.tableExists) return [];
          return script.pragmaBooking ?? [{ name: "id" }];
        }
        return script.pragmaBooking ?? [];
      }
      if (sql.includes("information_schema.columns")) {
        if (script.infoThrows) throw new Error("connection refused");
        // obstoj stolpcev (postgres pot)
        const wanted = sql.match(/column_name = '(\w+)'/)?.[1];
        const has =
          wanted != null &&
          (script.existingColumns ?? []).includes(wanted);
        return has ? [{ column_name: wanted }] : [];
      }
      if (sql.includes("information_schema")) {
        if (script.infoThrows) throw new Error("connection refused");
        return script.tableExists
          ? [{ tablename: "Booking" }]
          : (script.info ?? []);
      }
      if (sql.includes("pg_tables")) {
        return script.tableExists ? [{ tablename: "Booking" }] : [];
      }
      if (sql.includes("sqlite_master")) {
        return script.tableExists ? [{ name: "Booking" }] : [];
      }
      return script.info ?? [];
    },
    async $executeRawUnsafe(sql: string) {
      calls.exec.push(sql);
      const r = script.exec ? await script.exec(sql) : 0;
      return r;
    },
  };
  return { db, calls };
}

type SchemaDb = Parameters<typeof migrateBookingStateWith>[0];

describe("booking-state-migration (unit)", () => {
  test("postgres, tabela obstaja BREZ stolpcev → 2 idempotentna ALTER-a z varnima privzetkoma", async () => {
    const { db, calls } = makeDb({
      pragmaThrows: true,
      tableExists: true,
      existingColumns: [],
    });
    const r = await migrateBookingStateWith(db as unknown as SchemaDb);
    expect(r.dialect).toBe("postgres");
    expect(r.columnsAdded.sort()).toEqual(["customerStatus", "payoutStatus"]);

    const alters = calls.exec.filter((s) => s.includes("ALTER TABLE"));
    expect(alters).toHaveLength(2);
    for (const a of alters) {
      expect(a).toContain("ADD COLUMN IF NOT EXISTS");
      expect(a).toContain("NOT NULL DEFAULT");
    }
    expect(
      calls.exec.find((s) => s.includes('"payoutStatus"') && s.includes("'not_due'"))
    ).toBeTruthy();
    expect(
      calls.exec.find((s) => s.includes('"customerStatus"') && s.includes("'none'"))
    ).toBeTruthy();
  });

  test("postgres, stolpca ŽE obstajata → nič ni dodanega (idempotentnost)", async () => {
    const { db, calls } = makeDb({
      pragmaThrows: true,
      tableExists: true,
      existingColumns: ["payoutStatus", "customerStatus"],
    });
    const r = await migrateBookingStateWith(db as unknown as SchemaDb);
    expect(r.dialect).toBe("postgres");
    expect(r.columnsAdded).toEqual([]);
    // IF NOT EXISTS se vseeno izvede (poceni/varna), a poročilo je prazno
    expect(calls.exec.filter((s) => s.includes("ALTER TABLE"))).toHaveLength(2);
  });

  test("postgres, tabela manjka → obrambna CREATE TABLE pot (additive-only)", async () => {
    const { db, calls } = makeDb({
      pragmaThrows: true,
      tableExists: false,
    });
    const r = await migrateBookingStateWith(db as unknown as SchemaDb);
    expect(r.dialect).toBe("postgres");
    expect(r.columnsAdded.sort()).toEqual(["customerStatus", "payoutStatus"]);
    const create = calls.exec.find((s) => s.includes('CREATE TABLE IF NOT EXISTS "Booking"'));
    expect(create).toBeTruthy();
    expect(create).toContain("TIMESTAMP(3)");
    expect(create).toContain('CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")');
    // dodatnih ALTER-ov ni (stolpca sta del CREATE)
    expect(calls.exec.filter((s) => s.includes("ALTER TABLE"))).toHaveLength(0);
  });

  test("sqlite, manjkajoča stolpca → SAMO manjkajoči dodani (PRAGMA pot)", async () => {
    const { db, calls } = makeDb({
      tableExists: true,
      pragmaBooking: [{ name: "id" }, { name: "status" }, { name: "payoutStatus" }],
    });
    const r = await migrateBookingStateWith(db as unknown as SchemaDb);
    expect(r.dialect).toBe("sqlite");
    // payoutStatus že obstaja → samo customerStatus se doda
    expect(r.columnsAdded).toEqual(["customerStatus"]);
    const alters = calls.exec.filter((s) => s.includes("ALTER TABLE"));
    expect(alters).toHaveLength(1);
    expect(alters[0]).toContain('"customerStatus"');
    expect(alters[0]).not.toContain("IF NOT EXISTS"); // sqlite: PRAGMA pot
  });

  test("sqlite, oba že obstajata → brez izjav (idempotentnost)", async () => {
    const { db, calls } = makeDb({
      tableExists: true,
      pragmaBooking: [
        { name: "id" },
        { name: "payoutStatus" },
        { name: "customerStatus" },
      ],
    });
    const r = await migrateBookingStateWith(db as unknown as SchemaDb);
    expect(r.dialect).toBe("sqlite");
    expect(r.columnsAdded).toEqual([]);
    expect(calls.exec).toHaveLength(0);
  });

  test("unknown dialekt → prazno poročilo, nič izjav (fail-open)", async () => {
    const { db, calls } = makeDb({ pragmaThrows: true, infoThrows: true });
    const r = await migrateBookingStateWith(db as unknown as SchemaDb);
    expect(r.dialect).toBe("unknown");
    expect(r.columnsAdded).toEqual([]);
    expect(calls.exec).toHaveLength(0);
  });

  test("FAIL-OPEN: napaka posameznega ALTERja ne vrže (nadaljuje z drugim)", async () => {
    const { db, calls } = makeDb({
      pragmaThrows: true,
      tableExists: true,
      existingColumns: [],
      exec: (sql) => {
        if (sql.includes('"payoutStatus"')) {
          throw new Error("simulirana napaka ALTER");
        }
        return 0;
      },
    });
    const r = await migrateBookingStateWith(db as unknown as SchemaDb);
    // payoutStatus je padel (fail-open), customerStatus je uspel
    expect(r.columnsAdded).toEqual(["customerStatus"]);
    expect(calls.exec.filter((s) => s.includes("ALTER TABLE"))).toHaveLength(2);
  });
});

describe("booking-state-migration (source-contract: vrzel 1.86.0 zaprta)", () => {
  test("COMMITANA produkcijska shema (postgresql) vsebuje obe polji", async () => {
    const { execSync } = await import("node:child_process");
    // :prisma/schema.prisma = STAGED (index) različica — preverja to, kar bo
    // NOSIL naslednji commit (HEAD še ne vsebuje popravka med testiranjem).
    const staged = execSync("git show :prisma/schema.prisma", {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(staged).toContain('provider = "postgresql"');
    expect(staged).toContain('payoutStatus    String   @default("not_due")');
    expect(staged).toContain('customerStatus  String   @default("none")');
    expect(staged).toContain("sessionKey        String?");
    expect(staged).toContain("@@index([sessionKey])");
  });

  test("zgodovinska migracija obstaja in vsebuje oba idempotentna ALTER-a", () => {
    const sql = source(
      "prisma/migrations/20260923110000_booking_payout_customer/migration.sql"
    );
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "payoutStatus"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "customerStatus"');
    expect(sql).toContain("DEFAULT 'not_due'");
    expect(sql).toContain("DEFAULT 'none'");
  });

  test("instrumentation poveže startup korak schema:booking-state", () => {
    const instr = source("src/instrumentation.ts");
    // uvoz je lahko razdeljen čez vrstice — preverjamo dele ločeno
    expect(instr).toContain("./lib/booking-state-migration");
    expect(instr).toContain("migrateBookingState");
    expect(instr).toContain('"schema:booking-state"');
    // znotraj skupne zastavice DSA_DISABLE_SCHEMA_MIGRATION
    const guard = instr.indexOf("DSA_DISABLE_SCHEMA_MIGRATION !== ");
    const call = instr.indexOf("migrateBookingState");
    expect(guard).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(guard);
  });
});
