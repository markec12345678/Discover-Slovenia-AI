// ============================================================================
// TASK 34 (Tier 2 #2, 1.111.0) — PAYOUT LEDGER / MESEČNE PORAVNAVE
// ----------------------------------------------------------------------------
// Mandat docs/COMPETITIVE-ANALYSIS.md B3: "Payout ledger / settlement report
// — računovodstvo ponudnika (kdor je dobil koliko)". Sklopi:
//  1. UNIT — čista domena (settlementNumberFor/payoutRateForBooking/
//     payoutAmountsFor/isLedgerEligibleBooking/monthRangeFor/monthKeyFor/
//     sumPayoutEntries);
//  2. UNIT — startup migracija z vbrizganim klientom (sqlite/postgres/
//     unknown — idempotenca, poročanje);
//  3. SOURCE-CONTRACT — shema + migracija SQL + instrumentation + domena
//     (en vir resnice 0.12, FW1 invariant, sweep, anti-race) + rute
//     (session/rate-limit/akcije) + CSV poročilo + dashboard zavihek
//     (lastniške rute NE kličemo funkcionalno: getServerSession vrže izven
//     request scope — kanon „NO mock.module", Task 28);
//  4. FUNKCIONALNO — lib funkcije direktno nad DB (sync idempotenca, FW1
//     izključitve, izdaja+sweep, duplicate, settle/already/not_found,
//     premium stopnja 0, audit sled) — samo, če je DB dosegljiva
//     (dbReachable varovalka, vzorec task31/33).
// ============================================================================
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "@/lib/db";
import {
  PAYOUT_ENTRY_STATUSES,
  PAYOUT_SETTLEMENT_STATUSES,
  isLedgerEligibleBooking,
  payoutAmountsFor,
  payoutRateForBooking,
  settlementNumberFor,
  sumPayoutEntries,
} from "@/lib/payout-ledger";
import { monthRange, monthRangeFor, monthKeyFor } from "@/lib/commissions";
import { migratePayoutLedgerTablesWith } from "@/lib/payout-ledger-migration";
import type { PayoutEntry } from "@prisma/client";

const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const schemaSrc = read("prisma/schema.prisma");
const instrumentationSrc = read("src/instrumentation.ts");
const commissionsSrc = read("src/lib/commissions.ts");
const ledgerSrc = read("src/lib/payout-ledger.ts");
const routeSrc = read("src/app/api/owner/payouts/route.ts");
const csvSrc = read("src/app/api/owner/payouts/report.csv/route.ts");
const dashboardSrc = read("src/app/owner/dashboard/page.tsx");
const panelSrc = read("src/components/owner/payout-ledger-panel.tsx");
const auditSrc = read("src/lib/audit-log.ts");
const migrationSql = read(
  "prisma/migrations/20260927090000_payout_ledger/migration.sql"
);

const freeOwner = {
  id: "owner-free",
  name: "Free Lastnik",
  plan: "free",
  subscriptionStatus: "none",
  subscriptionEndsAt: null,
};

const premiumOwner = {
  id: "owner-premium",
  name: "Premium Lastnik",
  plan: "premium",
  subscriptionStatus: "active",
  subscriptionEndsAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
};

// ─────────────────────────────────────────────────────────────────────────
// 1. UNIT — čista domena
// ─────────────────────────────────────────────────────────────────────────

describe("TASK 34: domena — settlementNumberFor / monthKeyFor", () => {
  test("PAYOUT-YYYYMM-XXXXXX (6 velikih hex)", () => {
    const n = settlementNumberFor(new Date("2026-08-01T00:00:00Z"));
    expect(n).toMatch(/^PAYOUT-202608-[0-9A-F]{6}$/);
    // dva klica → različna sufiksa (entropija)
    expect(settlementNumberFor(new Date("2026-08-01T00:00:00Z"))).not.toBe(n);
  });

  test("monthKeyFor — LJ stenska ura (nikoli čas procesa)", () => {
    // 2026-09-30T22:30Z = 1. oktober 00:30 po Ljubljani (CEST +2)
    expect(monthKeyFor(new Date("2026-09-30T22:30:00.000Z"))).toBe("202610");
    // 2026-09-30T21:30Z = 30. september 23:30 po Ljubljani
    expect(monthKeyFor(new Date("2026-09-30T21:30:00.000Z"))).toBe("202609");
    // 2026-03-01T00:30Z = 1. marec 01:30 po Ljubljani (CET +1)
    expect(monthKeyFor(new Date("2026-03-01T00:30:00.000Z"))).toBe("202603");
  });
});

describe("TASK 34: domena — monthRangeFor (obdobje poravnave postavke)", () => {
  test("mesec vsebuje trenutek (meje po Europe/Ljubljana)", () => {
    // Sredina marca 2026 → marec; začetek = 1. marec 00:00 CET = 28. feb 23:00Z
    const r = monthRangeFor(new Date("2026-03-15T12:00:00.000Z"));
    expect(r.start.toISOString()).toBe("2026-02-28T23:00:00.000Z");
    // konec = 1. april 00:00 CEST (prehod 29. 3.) = 31. marec 22:00Z
    expect(r.end.toISOString()).toBe("2026-03-31T22:00:00.000Z");
  });

  test("oktober (CEST) — DST-varne meje", () => {
    const r = monthRangeFor(new Date("2026-10-15T12:00:00.000Z"));
    // 1. oktober 00:00 CEST (+2) = 30. september 22:00Z
    expect(r.start.toISOString()).toBe("2026-09-30T22:00:00.000Z");
    // 1. november 00:00 CET (+1, prehod 25. 10.) = 31. oktober 23:00Z
    expect(r.end.toISOString()).toBe("2026-10-31T23:00:00.000Z");
  });

  test("zadnji trenutek meseca pade še v isti mesec, prvi naslednjega v naslednji", () => {
    // 31. marec 21:59:59.999Z = 23:59:59.999 po LJ (CEST) → marec
    const march = monthRangeFor(new Date("2026-03-31T21:59:59.999Z"));
    // 31. marec 22:00:00Z = 1. april 00:00 po LJ (CEST) → april
    const april = monthRangeFor(new Date("2026-03-31T22:00:00.000Z"));
    expect(march.end.getTime()).toBe(april.start.getTime());
    expect(march.start.getTime()).toBeLessThan(april.start.getTime());
  });

  test("dolžina meseca je celo število dni (28–31)", () => {
    for (const ts of [
      "2026-01-15T00:00:00Z",
      "2026-02-15T00:00:00Z",
      "2026-04-15T00:00:00Z",
      "2026-07-15T00:00:00Z",
      "2026-12-15T00:00:00Z",
    ]) {
      const { start, end } = monthRangeFor(new Date(ts));
      const days = (end.getTime() - start.getTime()) / (24 * 3600 * 1000);
      expect(Number.isInteger(days)).toBe(true);
      expect(days).toBeGreaterThanOrEqual(28);
      expect(days).toBeLessThanOrEqual(31);
    }
  });
});

describe("TASK 34: domena — payoutRateForBooking (stopnja postavke)", () => {
  test("AI kanal + free partner → 12 %", () => {
    expect(payoutRateForBooking({ source: "consultation" }, freeOwner)).toBe(0.12);
  });

  test("AI kanal + premium partner → 0 % (vključeno v naročnino)", () => {
    expect(payoutRateForBooking({ source: "consultation" }, premiumOwner)).toBe(0);
  });

  test("direktna rezervacija → 0 % ne glede na paket", () => {
    expect(payoutRateForBooking({ source: null }, freeOwner)).toBe(0);
    expect(payoutRateForBooking({ source: null }, premiumOwner)).toBe(0);
    expect(payoutRateForBooking({ source: "website" }, freeOwner)).toBe(0);
  });

  test("pretekla premium naročnina ne šteje več (isti princip kot provizije)", () => {
    const expired = { ...premiumOwner, subscriptionEndsAt: new Date(Date.now() - 1000) };
    expect(payoutRateForBooking({ source: "consultation" }, expired)).toBe(0.12);
    const canceled = { ...premiumOwner, subscriptionStatus: "canceled" };
    expect(payoutRateForBooking({ source: "consultation" }, canceled)).toBe(0.12);
  });
});

describe("TASK 34: domena — payoutAmountsFor (zaokrožitve na cent)", () => {
  test(" čisti zneski", () => {
    expect(payoutAmountsFor(260, 0.12)).toEqual({
      commissionAmount: 31.2,
      netAmount: 228.8,
    });
    expect(payoutAmountsFor(100, 0)).toEqual({
      commissionAmount: 0,
      netAmount: 100,
    });
  });

  test("zaokrožitev na cent (99,99 × 0,12 = 12,00)", () => {
    const { commissionAmount, netAmount } = payoutAmountsFor(99.99, 0.12);
    expect(commissionAmount).toBe(12);
    expect(netAmount).toBe(87.99);
  });
});

describe("TASK 34: domena — isLedgerEligibleBooking (FW1 invariant)", () => {
  test("samo plačane + nepreklicane rezervacije vstopijo", () => {
    expect(isLedgerEligibleBooking({ status: "completed", paymentStatus: "paid" })).toBe(true);
    expect(isLedgerEligibleBooking({ status: "confirmed", paymentStatus: "paid" })).toBe(true);
  });

  test("demo/unpaid, preklicane, refundirane, pending IZVEN", () => {
    expect(isLedgerEligibleBooking({ status: "confirmed", paymentStatus: "unpaid" })).toBe(false);
    expect(isLedgerEligibleBooking({ status: "pending", paymentStatus: "paid" })).toBe(false);
    expect(isLedgerEligibleBooking({ status: "cancelled", paymentStatus: "paid" })).toBe(false);
    expect(isLedgerEligibleBooking({ status: "completed", paymentStatus: "refunded" })).toBe(false);
  });
});

describe("TASK 34: domena — statusni seznami + sumPayoutEntries", () => {
  test("whitelisti statusov", () => {
    expect(PAYOUT_ENTRY_STATUSES).toEqual(["pending", "settled"]);
    expect(PAYOUT_SETTLEMENT_STATUSES).toEqual(["pending", "settled"]);
  });

  test("sumPayoutEntries — skupne zneske z zaokrožitvijo", () => {
    const entries = [
      { grossAmount: 260, commissionAmount: 31.2, netAmount: 228.8 },
      { grossAmount: 99.99, commissionAmount: 12, netAmount: 87.99 },
      { grossAmount: 100, commissionAmount: 0, netAmount: 100 },
    ] as unknown as PayoutEntry[];
    const sums = sumPayoutEntries(entries);
    expect(sums.entryCount).toBe(3);
    expect(sums.grossTotal).toBe(459.99);
    expect(sums.commissionTotal).toBe(43.2);
    expect(sums.netTotal).toBe(416.79);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. UNIT — startup migracija z vbrizganim klientom (vzorec task28/33/87)
// ─────────────────────────────────────────────────────────────────────────

describe("TASK 34: startup migracija — unit z vbrizganim klientom", () => {
  function sqliteClient(tables: { payoutEntry: boolean; payoutSettlement: boolean }) {
    const executed: string[] = [];
    return {
      client: {
        $queryRawUnsafe: async (sql: string) => {
          if (sql === "PRAGMA table_info(SavedItinerary)") {
            return [{ cid: 0, name: "id", type: "TEXT" }];
          }
          if (sql === "PRAGMA table_info(PayoutEntry)") {
            return tables.payoutEntry ? [{ cid: 0, name: "id", type: "TEXT" }] : [];
          }
          if (sql === "PRAGMA table_info(PayoutSettlement)") {
            return tables.payoutSettlement ? [{ cid: 0, name: "id", type: "TEXT" }] : [];
          }
          throw new Error("neočekivana poizvedba: " + sql);
        },
        $executeRawUnsafe: async (sql: string) => {
          executed.push(sql);
          return 1;
        },
      } as never,
      executed,
    };
  }

  function postgresClient(tables: { payoutEntry: boolean; payoutSettlement: boolean }) {
    const executed: string[] = [];
    return {
      client: {
        $queryRawUnsafe: async (sql: string) => {
          if (sql.includes("table_name = 'SavedItinerary'")) {
            return [{ table_name: "SavedItinerary" }];
          }
          if (sql.includes("table_name = 'PayoutEntry'")) {
            return tables.payoutEntry ? [{ table_name: "x" }] : [];
          }
          if (sql.includes("table_name = 'PayoutSettlement'")) {
            return tables.payoutSettlement ? [{ table_name: "x" }] : [];
          }
          throw new Error("neočekivana poizvedba: " + sql);
        },
        $executeRawUnsafe: async (sql: string) => {
          executed.push(sql);
          return 1;
        },
      } as never,
      executed,
    };
  }

  test("sqlite: obe tabeli manjkata → CREATE + poročilo", async () => {
    const { client, executed } = sqliteClient({
      payoutEntry: false,
      payoutSettlement: false,
    });
    const r = await migratePayoutLedgerTablesWith(client);
    expect(r.dialect).toBe("sqlite");
    expect(r.tablesCreated).toEqual(["PayoutEntry", "PayoutSettlement"]);
    const creates = executed.filter((s) => s.includes("CREATE TABLE"));
    expect(creates).toHaveLength(2);
    for (const c of creates) {
      expect(c).toContain("IF NOT EXISTS");
    }
    // unikatni indeks postavke varuje eno vrstico na rezervacijo (idempotenca synca)
    expect(executed.some((s) => s.includes("PayoutEntry_bookingId_key"))).toBe(true);
  });

  test("sqlite: tabeli že obstajata → ničesar ne ustvari (idempotentno)", async () => {
    const { client, executed } = sqliteClient({
      payoutEntry: true,
      payoutSettlement: true,
    });
    const r = await migratePayoutLedgerTablesWith(client);
    expect(r.tablesCreated).toEqual([]);
    expect(executed.filter((s) => s.includes("CREATE TABLE"))).toHaveLength(0);
    // indeksi se varno ponovijo (IF NOT EXISTS)
    expect(executed.length).toBeGreaterThan(0);
  });

  test("postgres: manjkata → CREATE s TIMESTAMP(3) + pkey omejevalnikom", async () => {
    const { client, executed } = postgresClient({
      payoutEntry: false,
      payoutSettlement: false,
    });
    const r = await migratePayoutLedgerTablesWith(client);
    expect(r.dialect).toBe("postgres");
    expect(r.tablesCreated).toHaveLength(2);
    const creates = executed.filter((s) => s.includes("CREATE TABLE"));
    expect(creates).toHaveLength(2);
    expect(creates[0]).toContain("TIMESTAMP(3)");
    expect(creates[0]).toContain("PayoutEntry_pkey");
    expect(creates[1]).toContain("PayoutSettlement_pkey");
  });

  test("postgres: obstajata → idempotentno", async () => {
    const { client, executed } = postgresClient({
      payoutEntry: true,
      payoutSettlement: true,
    });
    const r = await migratePayoutLedgerTablesWith(client);
    expect(r.tablesCreated).toEqual([]);
    expect(executed.filter((s) => s.includes("CREATE TABLE"))).toHaveLength(0);
  });

  test("unknown narečje (DB nedosegljiva) → fail-open preskok", async () => {
    const client = {
      $queryRawUnsafe: async () => {
        throw new Error("DB down");
      },
      $executeRawUnsafe: async () => {
        throw new Error("DB down");
      },
    } as never;
    const r = await migratePayoutLedgerTablesWith(client);
    expect(r.dialect).toBe("unknown");
    expect(r.tablesCreated).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. SOURCE-CONTRACT — shema, migracija, instrumentation, domena, rute, UI
// ─────────────────────────────────────────────────────────────────────────

describe("TASK 34: source-contract — shema + migracija + instrumentation", () => {
  test("Prisma shema vsebuje oba modela z varovalkami", () => {
    expect(schemaSrc).toContain("model PayoutEntry {");
    expect(schemaSrc).toContain("model PayoutSettlement {");
    // idempotenca postavke: ena na rezervacijo
    expect(schemaSrc).toContain("bookingId        String    @unique");
    // idempotenca poravnave: ena na obdobje
    expect(schemaSrc).toContain("@@unique([ownerId, periodStart])");
    // dormant + FW1 semantika je dokumentirana v shemi
    expect(schemaSrc).toContain("FW1 invariant: demo/unpaid NIKOLI ne vstopi");
    expect(schemaSrc).toContain("DORMANT (brez vrstic, dokler lastnik ne odpre");
  });

  test("zgodovinska migracija SQL (drift vrata — task81 bere vse mape)", () => {
    expect(migrationSql).toContain('CREATE TABLE "PayoutEntry"');
    expect(migrationSql).toContain('CREATE TABLE "PayoutSettlement"');
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX "PayoutEntry_bookingId_key"'
    );
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX "PayoutSettlement_ownerId_periodStart_key"'
    );
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX "PayoutSettlement_settlementNumber_key"'
    );
  });

  test("instrumentation registrira startup korak", () => {
    expect(instrumentationSrc).toContain("schema:payout-ledger");
    expect(instrumentationSrc).toContain("payout-ledger-migration");
  });
});

describe("TASK 34: source-contract — domena (en vir resnice)", () => {
  test("stopnja 0.12 NI podvojena — uvožena iz lib/commissions", () => {
    // en vir resnice provizijske stopnje (0.12 živi samo v commissions.ts)
    expect(ledgerSrc).toContain('COMMISSION_RATE,\n  isPremiumOwner');
    expect(ledgerSrc).not.toMatch(/COMMISSION_RATE\s*=\s*0\.12/);
  });

  test("FW1 invariant: sync zajame SAMO plačane nepreklicane rezervacije", () => {
    expect(ledgerSrc).toContain('status: { in: ["confirmed", "completed"] }');
    expect(ledgerSrc).toContain('paymentStatus: "paid"');
  });

  test("sweep: poravnava zajame VSE odprto do vključno poravnanega meseca", () => {
    expect(ledgerSrc).toContain("periodEnd: { lte: last.end }");
    // sync ob izdaji teče z mejo upTo: last.end (ne zajame prihodnjosti)
    expect(ledgerSrc).toContain("syncPayoutEntries(owner, { upTo: last.end })");
  });

  test("anti-race settle: pogojni updateMany (isti vzorec kot owner bookings)", () => {
    expect(ledgerSrc).toContain(
      'where: { id: settlementId, ownerId, status: "pending" }'
    );
  });

  test("audit akciji + honest metod", () => {
    expect(ledgerSrc).toContain('"payout_settlement_generated"');
    expect(ledgerSrc).toContain('"payout_settlement_settled"');
    expect(ledgerSrc).toContain('method: "manual"');
  });

  test("commissions.ts izvaža nova obdobja (additive, brez spremembe starih)", () => {
    expect(commissionsSrc).toContain("export function monthRangeFor");
    expect(commissionsSrc).toContain("export function monthKeyFor");
  });

  test("audit-log.ts: novi resursni tip (additive union)", () => {
    expect(auditSrc).toContain('| "payout_settlement"');
  });
});

describe("TASK 34: source-contract — API rute", () => {
  test("GET/POST: rate limit + session + lastništvo (kanon owner rute)", () => {
    expect(routeSrc).toContain('key: "owner-api"');
    expect(routeSrc).toContain("getServerSession(authOptions)");
    expect(routeSrc).toContain('session.user.accountType === "user"');
    expect(routeSrc).toContain("Lastnik ni najden");
  });

  test("POST akciji: generate | settle", () => {
    expect(routeSrc).toContain('action === "generate"');
    expect(routeSrc).toContain('action === "settle"');
    expect(routeSrc).toContain("Manjka settlementId");
    expect(routeSrc).toContain(
      "Dovoljeno: generate | settle"
    );
  });

  test("GET samo-zdravi evidenco pred agregati (vrstni red)", () => {
    const syncIdx = routeSrc.indexOf("await syncPayoutEntries(owner)");
    const aggIdx = routeSrc.indexOf("db.payoutEntry.aggregate");
    expect(syncIdx).toBeGreaterThan(-1);
    expect(aggIdx).toBeGreaterThan(syncIdx);
  });

  test("CSV poročilo: text/csv + BOM + ; ločila + attachment + lastništvo", () => {
    expect(csvSrc).toContain('"text/csv; charset=utf-8"');
    expect(csvSrc).toContain("\\uFEFF");
    expect(csvSrc).toContain('attachment; filename="${settlement.settlementNumber}.csv"');
    expect(csvSrc).toContain("settlement.ownerId !== owner.id");
    expect(csvSrc).toContain("Manjka settlementId");
  });
});

describe("TASK 34: source-contract — dashboard zavihek", () => {
  test("8. zavihek Izplačila + uvoz panela", () => {
    expect(dashboardSrc).toContain('value="izplacila"');
    expect(dashboardSrc).toContain("PayoutLedgerPanel");
    expect(dashboardSrc).toContain("sm:grid-cols-8");
  });

  test("panel: SL-only inline + fetch vzorec + AlertDialog potrditev", () => {
    expect(panelSrc).toContain('fetch("/api/owner/payouts", { cache: "no-store" })');
    expect(panelSrc).toContain("Potrdi poravnavo");
    expect(panelSrc).toContain("knjigovodska potrditev");
    expect(panelSrc).toContain("report.csv?settlementId=");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. FUNKCIONALNO — lib funkcije direktno nad DB (dbReachable varovalka)
//    (lastniške rute NE kličemo funkcionalno — getServerSession vrže izven
//    request scope, kanon Task 28 „NO mock.module"; pokrite so zgoraj.)
// ─────────────────────────────────────────────────────────────────────────

const RUN = `t34pl${Date.now().toString(36)}`;
const createdOwnerIds: string[] = [];
const createdExperienceIds: string[] = [];

// DOSTOPNOST DB (isti vzorec kot task31/33): CI quality job nima baze →
// DB-goste teste pošteno preskočimo (lokalno/Build pot z bazo pa tečejo).
let dbReachable = false;

beforeAll(async () => {
  try {
    await db.savedItinerary.count();
    dbReachable = true;
  } catch {
    dbReachable = false;
  }
});

afterAll(async () => {
  if (!dbReachable) return;
  try {
    // Postavke/poravnave po lastniku (evidence je vezana nanj)
    await db.payoutEntry.deleteMany({
      where: { ownerId: { in: createdOwnerIds } },
    });
    await db.payoutSettlement.deleteMany({
      where: { ownerId: { in: createdOwnerIds } },
    });
    // Audit sledi testnih virov (akciji task34, vezani na lastnike)
    await db.auditLog.deleteMany({
      where: {
        action: {
          in: ["payout_settlement_generated", "payout_settlement_settled"],
        },
        actorId: { in: createdOwnerIds },
      },
    });
    if (createdExperienceIds.length > 0) {
      await db.booking.deleteMany({
        where: { experienceId: { in: createdExperienceIds } },
      });
      await db.experience.deleteMany({
        where: { id: { in: createdExperienceIds } },
      });
    }
    if (createdOwnerIds.length > 0) {
      await db.owner.deleteMany({
        where: { id: { in: createdOwnerIds } },
      });
    }
  } catch {
    // čiščenje je best-effort
  }
});

let ownerSeq = 0;
let bookingSeq = 0;

/** Prvi sejani lastnik (deterministično po unikatnem e-poštnem naslovu). */
async function firstOwner() {
  const owner = await db.owner.findUnique({
    where: { email: `${RUN}-owner1@example.com` },
  });
  expect(owner).toBeDefined();
  return owner!;
}

async function seedOwner(opts?: { plan?: string; premium?: boolean }) {
  ownerSeq += 1;
  const owner = await db.owner.create({
    data: {
      email: `${RUN}-owner${ownerSeq}@example.com`,
      name: `Task34 Lastnik ${ownerSeq}`,
      passwordHash: "not-a-real-hash",
      businessName: `Task34 Podjetje ${ownerSeq}`,
      plan: opts?.plan ?? "free",
      subscriptionStatus: opts?.premium ? "active" : "none",
      subscriptionEndsAt: opts?.premium
        ? new Date(Date.now() + 30 * 24 * 3600 * 1000)
        : null,
    },
  });
  createdOwnerIds.push(owner.id);
  return owner;
}

async function seedExperience(ownerId: string, n: number) {
  const exp = await db.experience.create({
    data: {
      name: `Task34 testna izkušnja ${n} ${RUN}`,
      slug: `${RUN}-exp${n}`,
      description: "Testna izkušnja za payout ledger (task34).",
      category: "tour",
      pricePerPerson: 65,
      durationHours: 2,
      minGroupSize: 1,
      maxGroupSize: 10,
      languages: "[]",
      address: "Testna 1, Ljubljana",
      images: "[]",
      providerName: "Testni ponudnik",
      status: "published",
      ownerId,
    },
  });
  createdExperienceIds.push(exp.id);
  return exp;
}

type SeedBookingOpts = {
  status?: string;
  paymentStatus?: string;
  source?: string | null;
  total?: number;
  groupSize?: number;
  createdAt: Date;
};

async function seedBooking(
  exp: { id: string; name: string },
  opts: SeedBookingOpts
) {
  bookingSeq += 1;
  return db.booking.create({
    data: {
      bookingNumber: `IF-EXP-${RUN}${bookingSeq}`,
      guestEmail: `${RUN}-guest${bookingSeq}@example.com`,
      guestName: "Test Testović",
      experienceId: exp.id,
      experienceName: exp.name,
      bookingDate: opts.createdAt,
      groupSize: opts.groupSize ?? 4,
      pricePerPerson: 65,
      total: opts.total ?? 260,
      status: opts.status ?? "completed",
      paymentStatus: opts.paymentStatus ?? "paid",
      source: opts.source ?? null,
      providerName: "Testni ponudnik",
      providerEmail: "provider@example.com",
      createdAt: opts.createdAt,
    },
  });
}

describe("TASK 34: funkcionalno — sync evidence (idempotenca + FW1)", () => {
  test("sync ustvari postavke SAMO za plačane nepreklicane rezervacije", async () => {
    if (!dbReachable) {
      console.log("[task34-payout] DB ni dosegljiva — preskakujem");
      return;
    }
    const { syncPayoutEntries } = await import("@/lib/payout-ledger");
    const owner = await seedOwner();
    const exp = await seedExperience(owner.id, 1);

    const prev = monthRange(-1);
    const prevMid = new Date(prev.start.getTime() + 15 * 24 * 3600 * 1000);

    // A: completed + paid + AI kanal (provizija 12 %)
    await seedBooking(exp, {
      status: "completed",
      paymentStatus: "paid",
      source: "consultation",
      total: 260,
      createdAt: prevMid,
    });
    // B: confirmed + paid + direktna (brez provizije)
    await seedBooking(exp, {
      status: "confirmed",
      paymentStatus: "paid",
      source: null,
      total: 100,
      createdAt: prevMid,
    });
    // C: demo unpaid — NIKOLI v ledger (FW1)
    await seedBooking(exp, {
      status: "confirmed",
      paymentStatus: "unpaid",
      source: "consultation",
      total: 500,
      createdAt: prevMid,
    });
    // D: preklicana (plačana) — IZVEN (P7-C3)
    await seedBooking(exp, {
      status: "cancelled",
      paymentStatus: "paid",
      source: "consultation",
      total: 300,
      createdAt: prevMid,
    });

    const r = await syncPayoutEntries(owner);
    expect(r.created).toBe(2);

    const entries = await db.payoutEntry.findMany({
      where: { ownerId: owner.id },
      orderBy: { grossAmount: "desc" },
    });
    expect(entries).toHaveLength(2);

    // Postavka A: bruto 260, stopnja 0.12, provizija 31.2, neto 228.8
    const a = entries.find((e) => e.grossAmount === 260);
    expect(a).toBeDefined();
    expect(a!.rate).toBe(0.12);
    expect(a!.commissionAmount).toBe(31.2);
    expect(a!.netAmount).toBe(228.8);
    expect(a!.source).toBe("consultation");
    expect(a!.status).toBe("pending");
    expect(a!.settlementId).toBeNull();
    // Obdobje postavke = mesec REZERVACIJE (LJ), ne čas synca
    expect(a!.periodStart.getTime()).toBe(prev.start.getTime());
    expect(a!.periodEnd.getTime()).toBe(prev.end.getTime());

    // Postavka B: bruto 100, stopnja 0, neto 100 (direktna rezervacija)
    const b = entries.find((e) => e.grossAmount === 100);
    expect(b).toBeDefined();
    expect(b!.rate).toBe(0);
    expect(b!.commissionAmount).toBe(0);
    expect(b!.netAmount).toBe(100);
    expect(b!.source).toBeNull();
  });

  test("ponovni sync je idempotenten (0 novih, brez podvajanja)", async () => {
    if (!dbReachable) return;
    const { syncPayoutEntries } = await import("@/lib/payout-ledger");
    const owner = await firstOwner();
    const before = await db.payoutEntry.count({
      where: { ownerId: owner.id },
    });
    const r = await syncPayoutEntries(owner);
    expect(r.created).toBe(0);
    const after = await db.payoutEntry.count({
      where: { ownerId: owner.id },
    });
    expect(after).toBe(before);
  });
});

describe("TASK 34: funkcionalno — izdaja poravnave (sweep + idempotenca)", () => {
  test("izdaja zajame vse odprto do vključno prejšnjega meseca + veže postavke", async () => {
    if (!dbReachable) return;
    const { issuePayoutSettlement } = await import("@/lib/payout-ledger");
    const owner = await firstOwner();
    const prev = monthRange(-1);
    const prev2 = monthRange(-2);
    const prev2Mid = new Date(prev2.start.getTime() + 15 * 24 * 3600 * 1000);
    const experiences = await db.experience.findMany({
      where: { ownerId: owner.id },
    });

    // E: pozneje plačana rezervacija iz pred-prejšnjega meseca (sweep jo
    // zajame v poravnavo za prejšnji mesec)
    await seedBooking(experiences[0], {
      status: "completed",
      paymentStatus: "paid",
      source: "consultation",
      total: 50,
      createdAt: prev2Mid,
    });

    const result = await issuePayoutSettlement(owner);
    if (result.status !== "issued") {
      throw new Error(`pričakovano "issued", dobil ${result.status}`);
    }
    const s = result.settlement;
    expect(s.settlementNumber).toMatch(/^PAYOUT-\d{6}-[0-9A-F]{6}$/);
    expect(s.periodStart.getTime()).toBe(prev.start.getTime());
    expect(s.periodEnd.getTime()).toBe(prev.end.getTime());
    expect(s.status).toBe("pending");
    expect(s.method).toBe("manual");

    // 3 postavke: A (260) + B (100) + E (50) → bruto 410, provizija 37.2, neto 372.8
    expect(s.entryCount).toBe(3);
    expect(s.grossTotal).toBe(410);
    expect(s.commissionTotal).toBe(37.2);
    expect(s.netTotal).toBe(372.8);

    // Postavke so VEZANE na poravnavo (settledId + še pending)
    const entries = await db.payoutEntry.findMany({
      where: { settlementId: s.id },
    });
    expect(entries).toHaveLength(3);
    for (const e of entries) {
      expect(e.status).toBe("pending");
      expect(e.settledAt).toBeNull();
    }

    // Audit sled izdaje
    const audit = await db.auditLog.findFirst({
      where: { action: "payout_settlement_generated", resourceId: s.id },
    });
    expect(audit).toBeDefined();
    expect(audit!.actorRole).toBe("owner");
    expect(audit!.resourceType).toBe("payout_settlement");
  });

  test("druga izdaja istega obdobja → duplicate (idempotenca)", async () => {
    if (!dbReachable) return;
    const { issuePayoutSettlement } = await import("@/lib/payout-ledger");
    const owner = await firstOwner();
    const first = await db.payoutSettlement.findFirst({
      where: { ownerId: owner.id },
    });
    const result = await issuePayoutSettlement(owner);
    if (result.status !== "duplicate") {
      throw new Error(`pričakovano "duplicate", dobil ${result.status}`);
    }
    expect(result.settlementNumber).toBe(first!.settlementNumber);
  });

  test("lastnik brez upravičenih rezervacij → no_entries", async () => {
    if (!dbReachable) return;
    const { issuePayoutSettlement } = await import("@/lib/payout-ledger");
    const owner = await seedOwner();
    await seedExperience(owner.id, 2);
    const result = await issuePayoutSettlement(owner);
    expect(result.status).toBe("no_entries");
  });
});

describe("TASK 34: funkcionalno — settle (potrditev uskladitve)", () => {
  test("settle: poravnava + postavke preidejo v settled; ponovitev → already", async () => {
    if (!dbReachable) return;
    const { settlePayoutSettlement } = await import("@/lib/payout-ledger");
    const owner = await firstOwner();
    const s = await db.payoutSettlement.findFirst({
      where: { ownerId: owner.id },
    });

    const r = await settlePayoutSettlement(owner.id, s!.id);
    if (r.status !== "settled") {
      throw new Error(`pričakovano "settled", dobil ${r.status}`);
    }
    expect(r.entriesSettled).toBe(3);
    expect(r.settlement.status).toBe("settled");
    expect(r.settlement.settledAt).not.toBeNull();

    const entries = await db.payoutEntry.findMany({
      where: { settlementId: s!.id },
    });
    for (const e of entries) {
      expect(e.status).toBe("settled");
      expect(e.settledAt).not.toBeNull();
    }

    // Audit sled potrditve
    const audit = await db.auditLog.findFirst({
      where: { action: "payout_settlement_settled", resourceId: s!.id },
    });
    expect(audit).toBeDefined();

    // Ponovna potrditev → already (anti-race semantika)
    const again = await settlePayoutSettlement(owner.id, s!.id);
    expect(again.status).toBe("already");
  });

  test("settle tujega lastnika → not_found (lastništvo)", async () => {
    if (!dbReachable) return;
    const { settlePayoutSettlement } = await import("@/lib/payout-ledger");
    const owner = await firstOwner();
    const s = await db.payoutSettlement.findFirst({
      where: { ownerId: owner.id },
    });
    const stranger = await seedOwner();
    const r = await settlePayoutSettlement(stranger.id, s!.id);
    expect(r.status).toBe("not_found");
  });
});

describe("TASK 34: funkcionalno — premium partner (stopnja 0, poravnava velja)", () => {
  test("premium lastnik: postavka s stopnjo 0 + poravnava z neto = bruto", async () => {
    if (!dbReachable) return;
    const { syncPayoutEntries, issuePayoutSettlement } = await import(
      "@/lib/payout-ledger"
    );
    const owner = await seedOwner({ plan: "premium", premium: true });
    const exp = await seedExperience(owner.id, 3);
    const prev = monthRange(-1);
    const prevMid = new Date(prev.start.getTime() + 15 * 24 * 3600 * 1000);

    await seedBooking(exp, {
      status: "completed",
      paymentStatus: "paid",
      source: "consultation",
      total: 200,
      createdAt: prevMid,
    });

    await syncPayoutEntries(owner);
    const entry = await db.payoutEntry.findFirst({
      where: { ownerId: owner.id },
    });
    expect(entry).toBeDefined();
    expect(entry!.rate).toBe(0);
    expect(entry!.commissionAmount).toBe(0);
    expect(entry!.netAmount).toBe(200);

    // Premium lastnik PRVIJO poravnave (ni „premium" kratke poti kot pri računih)
    const result = await issuePayoutSettlement(owner);
    if (result.status !== "issued") {
      throw new Error(`pričakovano "issued", dobil ${result.status}`);
    }
    expect(result.settlement.commissionTotal).toBe(0);
    expect(result.settlement.netTotal).toBe(200);
  });
});
