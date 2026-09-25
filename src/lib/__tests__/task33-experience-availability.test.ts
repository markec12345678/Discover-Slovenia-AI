// ============================================================================
// TASK 33 (Tier 2 #1, 1.110.0) — KOLEDAR RAZPOLOŽLJIVOSTI IZKUŠNJE
// ----------------------------------------------------------------------------
// Mandat docs/COMPETITIVE-ANALYSIS.md (C1/priporočilo #3): "vsaj
// kapaciteta/dan + blackout datumi (prepreči overbooking)". Sklopi:
//  1. UNIT — čista domena (isValidDateKey/isWithinSeason/resolveDayPolicy/
//     capacitySufficient/expandDateRange/monthDayKeys/refusalMessage);
//  2. UNIT — startup migracija z vbrizganim klientom (sqlite/postgres/
//     unknown — idempotenca, poročanje);
//  3. SOURCE-CONTRACT — shema + migracija SQL + instrumentation + guard V
//     TRANSAKCIJI (POST /api/bookings) + javna/lastniška ruta + modal +
//     dashboard (lastniške rute NE kličemo funkcionalno: getServerSession
//     vrže izven request scope — kanon „NO mock.module", Task 28);
//  4. FUNKCIONALNO — javni GET mesečni pogled + POST /api/bookings guard
//     (blackout 409 / kapaciteta 409 / dormant 200) — samo, če je DB
//     dosegljiva (dbReachable varovalka, vzorec task31).
// ============================================================================
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "@/lib/db";
// TASK 76 higiena: funkcionalni blok dinamično uvaža route handler prek
// @/app/api → troši žetone deljenega omejevalnika runnerja → okno OBVEZNO
// počistimo (konvencija suite-a, glej task76-suite-hygiene.test.ts).
import { clearProviderRateLimits } from "@/lib/supply/search";
import {
  AVAILABILITY_DAY_STATUSES,
  CAPACITY_NON_OCCUPYING_STATUSES,
  MAX_RANGE_DAYS,
  capacitySufficient,
  expandDateRange,
  isWithinSeason,
  isValidDateKey,
  isValidMonthKey,
  monthDayKeys,
  refusalMessage,
  resolveDayPolicy,
  toDayKey,
} from "@/lib/experience-availability";
import {
  migrateExperienceAvailabilityTablesWith,
} from "@/lib/experience-availability-migration";

const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const schemaSrc = read("prisma/schema.prisma");
const instrumentationSrc = read("src/instrumentation.ts");
const bookingRouteSrc = read("src/app/api/bookings/route.ts");
const publicRouteSrc = read("src/app/api/experiences/[slug]/availability/route.ts");
const ownerRouteSrc = read(
  "src/app/api/owner/experiences/[id]/availability/route.ts"
);
const daysRouteSrc = read(
  "src/app/api/owner/experiences/[id]/availability/days/route.ts"
);
const modalSrc = read("src/components/sections/experience-modal.tsx");
const dashboardSrc = read("src/app/owner/dashboard/page.tsx");
const migrationSql = read(
  "prisma/migrations/20260926140000_experience_availability/migration.sql"
);

// ─────────────────────────────────────────────────────────────────────────
// 1. UNIT — čista domena
// ─────────────────────────────────────────────────────────────────────────

describe("TASK 33: domena — isValidDateKey (pravi koledarski dnevi)", () => {
  test("veljavni dnevi", () => {
    expect(isValidDateKey("2026-07-12")).toBe(true);
    expect(isValidDateKey("2026-01-01")).toBe(true);
    expect(isValidDateKey("2026-12-31")).toBe(true);
    // prestopno leto
    expect(isValidDateKey("2028-02-29")).toBe(true);
    expect(isValidDateKey("2024-02-29")).toBe(true);
  });

  test("neveljavni dnevi (format, meseci, dnevi v mesecu)", () => {
    expect(isValidDateKey("2026-7-12")).toBe(false); // ni zero-padded
    expect(isValidDateKey("2026-13-01")).toBe(false); // mesec 13
    expect(isValidDateKey("2026-00-10")).toBe(false); // mesec 0
    expect(isValidDateKey("2026-02-30")).toBe(false); // februar nima 30
    expect(isValidDateKey("2027-02-29")).toBe(false); // 2027 ni prestopno
    expect(isValidDateKey("2026-04-31")).toBe(false); // april nima 31
    expect(isValidDateKey("2026-07-00")).toBe(false); // dan 0
    expect(isValidDateKey("12.07.2026")).toBe(false); // slovenski zapis
    expect(isValidDateKey("")).toBe(false);
    expect(isValidDateKey(null)).toBe(false);
    expect(isValidDateKey(20260712)).toBe(false);
    expect(isValidDateKey(undefined)).toBe(false);
  });
});

describe("TASK 33: domena — isValidMonthKey / toDayKey / monthDayKeys", () => {
  test("month ključi YYYY-MM", () => {
    expect(isValidMonthKey("2026-07")).toBe(true);
    expect(isValidMonthKey("2026-01")).toBe(true);
    expect(isValidMonthKey("2026-12")).toBe(true);
    expect(isValidMonthKey("2026-7")).toBe(false);
    expect(isValidMonthKey("2026-13")).toBe(false);
    expect(isValidMonthKey("2026-00")).toBe(false);
    expect(isValidMonthKey("26-07")).toBe(false);
    expect(isValidMonthKey("abcd")).toBe(false);
    expect(isValidMonthKey(null)).toBe(false);
  });

  test("toDayKey — UTC komponente (enolično, ne odvisno od TZ)", () => {
    expect(toDayKey(new Date("2026-07-12T22:30:00.000Z"))).toBe("2026-07-12");
    expect(toDayKey(new Date("2026-07-12"))).toBe("2026-07-12");
    expect(toDayKey(new Date(Date.UTC(2026, 0, 1)))).toBe("2026-01-01");
  });

  test("monthDayKeys — dolžine mesecev (prestopna vključno)", () => {
    expect(monthDayKeys("2026-02")).toHaveLength(28);
    expect(monthDayKeys("2028-02")).toHaveLength(29); // prestopno
    expect(monthDayKeys("2026-07")).toHaveLength(31);
    expect(monthDayKeys("2026-04")).toHaveLength(30);
    expect(monthDayKeys("2026-07")[0]).toBe("2026-07-01");
    expect(monthDayKeys("2026-07")[30]).toBe("2026-07-31");
    expect(monthDayKeys("neveljavno")).toEqual([]);
  });
});

describe("TASK 33: domena — isWithinSeason (vključno + čezletna)", () => {
  test("brez omejitev", () => {
    expect(isWithinSeason("2026-07-12", null, null)).toBe(true);
  });

  test("navadna sezona (poletje)", () => {
    expect(isWithinSeason("2026-07-12", "2026-06-01", "2026-09-30")).toBe(true);
    expect(isWithinSeason("2026-06-01", "2026-06-01", "2026-09-30")).toBe(true); // vključno
    expect(isWithinSeason("2026-09-30", "2026-06-01", "2026-09-30")).toBe(true); // vključno
    expect(isWithinSeason("2026-05-31", "2026-06-01", "2026-09-30")).toBe(false);
    expect(isWithinSeason("2026-10-01", "2026-06-01", "2026-09-30")).toBe(false);
  });

  test("ČEZLETNA (zimska) sezona: start > end", () => {
    // 15.11.2026 → 15.3.2027
    expect(isWithinSeason("2026-12-25", "2026-11-15", "2027-03-15")).toBe(true);
    expect(isWithinSeason("2027-02-01", "2026-11-15", "2027-03-15")).toBe(true);
    expect(isWithinSeason("2026-11-15", "2026-11-15", "2027-03-15")).toBe(true); // vključno
    expect(isWithinSeason("2027-07-01", "2026-11-15", "2027-03-15")).toBe(false);
    expect(isWithinSeason("2026-10-01", "2026-11-15", "2027-03-15")).toBe(false);
  });

  test("enostranske meje", () => {
    expect(isWithinSeason("2026-05-15", "2026-06-01", null)).toBe(false);
    expect(isWithinSeason("2026-06-01", "2026-06-01", null)).toBe(true);
    expect(isWithinSeason("2027-01-01", "2026-06-01", null)).toBe(true);
    expect(isWithinSeason("2026-10-02", null, "2026-10-01")).toBe(false);
    expect(isWithinSeason("2026-10-01", null, "2026-10-01")).toBe(true);
  });
});

describe("TASK 33: domena — resolveDayPolicy (en vir resnice)", () => {
  test("1. DORMANT: brez nastavitev in brez prepisa → unrestricted", () => {
    const p = resolveDayPolicy({
      dateKey: "2026-07-12",
      settings: null,
      dayOverride: null,
    });
    expect(p).toEqual({ kind: "unrestricted" });
  });

  test("2. nastavitve brez sezone/kapacitete → open (neomejeno)", () => {
    const p = resolveDayPolicy({
      dateKey: "2026-07-12",
      settings: { defaultCapacity: null, seasonStart: null, seasonEnd: null },
      dayOverride: null,
    });
    expect(p).toEqual({ kind: "open", capacity: null });
  });

  test("3. privzeta kapaciteta", () => {
    const p = resolveDayPolicy({
      dateKey: "2026-07-12",
      settings: { defaultCapacity: 12, seasonStart: null, seasonEnd: null },
      dayOverride: null,
    });
    expect(p).toEqual({ kind: "open", capacity: 12 });
  });

  test("4. izven sezone → closed/out-of-season", () => {
    const p = resolveDayPolicy({
      dateKey: "2026-05-15",
      settings: { defaultCapacity: 12, seasonStart: "2026-06-01", seasonEnd: "2026-09-30" },
      dayOverride: null,
    });
    expect(p).toEqual({ kind: "closed", reason: "out-of-season" });
  });

  test("5. v sezoni → open s kapaciteto", () => {
    const p = resolveDayPolicy({
      dateKey: "2026-07-01",
      settings: { defaultCapacity: 12, seasonStart: "2026-06-01", seasonEnd: "2026-09-30" },
      dayOverride: null,
    });
    expect(p).toEqual({ kind: "open", capacity: 12 });
  });

  test("6. čezletna sezona deluje", () => {
    const settings = {
      defaultCapacity: 10,
      seasonStart: "2026-11-15",
      seasonEnd: "2027-03-15",
    };
    expect(
      resolveDayPolicy({ dateKey: "2027-01-10", settings, dayOverride: null })
    ).toEqual({ kind: "open", capacity: 10 });
    expect(
      resolveDayPolicy({ dateKey: "2027-07-01", settings, dayOverride: null })
    ).toEqual({ kind: "closed", reason: "out-of-season" });
  });

  test("7. BLACKOUT ima prednost (v sezoni in zunaj nje)", () => {
    const settings = {
      defaultCapacity: 12,
      seasonStart: "2026-06-01",
      seasonEnd: "2026-09-30",
    };
    // v sezoni
    expect(
      resolveDayPolicy({
        dateKey: "2026-07-12",
        settings,
        dayOverride: { date: "2026-07-12", status: "closed", capacity: null },
      })
    ).toEqual({ kind: "closed", reason: "blackout" });
    // zunaj sezone (blackout je še vedno blackout, ne out-of-season)
    expect(
      resolveDayPolicy({
        dateKey: "2026-05-15",
        settings,
        dayOverride: { date: "2026-05-15", status: "closed", capacity: null },
      })
    ).toEqual({ kind: "closed", reason: "blackout" });
    // tudi brez nastavitev
    expect(
      resolveDayPolicy({
        dateKey: "2026-07-12",
        settings: null,
        dayOverride: { date: "2026-07-12", status: "closed", capacity: null },
      })
    ).toEqual({ kind: "closed", reason: "blackout" });
  });

  test("8. IZJEMNI DAN (open prepis) prepiše sezono", () => {
    const settings = {
      defaultCapacity: 12,
      seasonStart: "2026-06-01",
      seasonEnd: "2026-09-30",
    };
    // zunaj sezone, s kapaciteto prepisa
    expect(
      resolveDayPolicy({
        dateKey: "2026-05-15",
        settings,
        dayOverride: { date: "2026-05-15", status: "open", capacity: 8 },
      })
    ).toEqual({ kind: "open", capacity: 8 });
    // zunaj sezone, brez kapacitete prepisa, brez defaulta
    expect(
      resolveDayPolicy({
        dateKey: "2026-05-15",
        settings: null,
        dayOverride: { date: "2026-05-15", status: "open", capacity: null },
      })
    ).toEqual({ kind: "open", capacity: null });
    // v sezoni: kapaciteta prepisa ZAMENJA default
    expect(
      resolveDayPolicy({
        dateKey: "2026-07-12",
        settings,
        dayOverride: { date: "2026-07-12", status: "open", capacity: 20 },
      })
    ).toEqual({ kind: "open", capacity: 20 });
    // v sezoni: prepis brez kapacitete podeduje default
    expect(
      resolveDayPolicy({
        dateKey: "2026-07-12",
        settings,
        dayOverride: { date: "2026-07-12", status: "open", capacity: null },
      })
    ).toEqual({ kind: "open", capacity: 12 });
  });
});

describe("TASK 33: domena — capacitySufficient (meja je vključna)", () => {
  test("null kapaciteta = neomejeno", () => {
    expect(
      capacitySufficient({ capacity: null, booked: 1000, groupSize: 100 })
    ).toBe(true);
  });

  test("vključna meja — zadnje mesto gre skozi", () => {
    expect(capacitySufficient({ capacity: 5, booked: 4, groupSize: 1 })).toBe(true);
    expect(capacitySufficient({ capacity: 5, booked: 0, groupSize: 5 })).toBe(true);
    expect(capacitySufficient({ capacity: 5, booked: 4, groupSize: 2 })).toBe(false);
    expect(capacitySufficient({ capacity: 5, booked: 5, groupSize: 1 })).toBe(false);
  });
});

describe("TASK 33: domena — expandDateRange (varovalka obsega)", () => {
  test("3-dnevni obseg", () => {
    expect(expandDateRange("2026-07-01", "2026-07-03")).toEqual([
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
    ]);
  });

  test("en dan", () => {
    expect(expandDateRange("2026-07-01", "2026-07-01")).toEqual(["2026-07-01"]);
  });

  test("obrnjen obseg → null", () => {
    expect(expandDateRange("2026-07-03", "2026-07-01")).toBeNull();
  });

  test("neveljavni datumi → null", () => {
    expect(expandDateRange("2026-02-30", "2026-03-01")).toBeNull();
    expect(expandDateRange("abc", "2026-03-01")).toBeNull();
  });

  test("varovalka MAX_RANGE_DAYS (366)", () => {
    // navadno leto 2026 = 365 dni → v redu
    expect(expandDateRange("2026-01-01", "2026-12-31")).toHaveLength(365);
    // prestopno leto 2028 = 366 dni → natanko meja, še dovoljeno
    expect(expandDateRange("2028-01-01", "2028-12-31")).toHaveLength(366);
    // 367 dni (čez leto + 1) → zavrnjeno s privzetim max
    expect(expandDateRange("2028-01-01", "2029-01-01")).toBeNull();
    expect(MAX_RANGE_DAYS).toBe(366);
  });
});

describe("TASK 33: domena — refusalMessage + konstante (semantika zasedenosti)", () => {
  test("iskrena slovenska sporočila po vzroku", () => {
    expect(
      refusalMessage({ kind: "closed", reason: "blackout" }, 0)
    ).toContain("zaprl");
    expect(
      refusalMessage({ kind: "closed", reason: "out-of-season" }, 0)
    ).toContain("sezone");
    expect(refusalMessage({ kind: "open", capacity: 5 }, 5)).toContain("zaseden");
    // fallback je iskren, nikoli lažno zelen
    expect(refusalMessage({ kind: "unrestricted" }, 0)).toContain("ni na voljo");
  });

  test("kapaciteto zasedajo VSI statusi razen preklicane", () => {
    expect(CAPACITY_NON_OCCUPYING_STATUSES).toEqual(["cancelled"]);
    // pending (Stripe v teku) in completed (opravljeno) DRŽITA mesto
    expect(CAPACITY_NON_OCCUPYING_STATUSES).not.toContain("pending");
    expect(CAPACITY_NON_OCCUPYING_STATUSES).not.toContain("confirmed");
    expect(CAPACITY_NON_OCCUPYING_STATUSES).not.toContain("completed");
  });

  test("AVAILABILITY_DAY_STATUSES — open/closed whitelist", () => {
    expect(AVAILABILITY_DAY_STATUSES).toEqual(["open", "closed"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. UNIT — startup migracija z vbrizganim klientom (vzorec task28/87)
// ─────────────────────────────────────────────────────────────────────────

describe("TASK 33: startup migracija — unit z vbrizganim klientom", () => {
  function sqliteClient(tables: {
    availability: boolean;
    availabilityDay: boolean;
  }) {
    const executed: string[] = [];
    return {
      client: {
        $queryRawUnsafe: async (sql: string) => {
          if (sql === "PRAGMA table_info(SavedItinerary)") {
            return [{ cid: 0, name: "id", type: "TEXT" }];
          }
          if (sql === "PRAGMA table_info(ExperienceAvailability)") {
            return tables.availability
              ? [{ cid: 0, name: "id", type: "TEXT" }]
              : [];
          }
          if (sql === "PRAGMA table_info(ExperienceAvailabilityDay)") {
            return tables.availabilityDay
              ? [{ cid: 0, name: "id", type: "TEXT" }]
              : [];
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

  function postgresClient(tables: {
    availability: boolean;
    availabilityDay: boolean;
  }) {
    const executed: string[] = [];
    return {
      client: {
        $queryRawUnsafe: async (sql: string) => {
          if (sql.includes("table_name = 'SavedItinerary'")) {
            return [{ table_name: "SavedItinerary" }];
          }
          if (sql.includes("table_name = 'ExperienceAvailabilityDay'")) {
            return tables.availabilityDay ? [{ table_name: "x" }] : [];
          }
          if (sql.includes("table_name = 'ExperienceAvailability'")) {
            return tables.availability ? [{ table_name: "x" }] : [];
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
      availability: false,
      availabilityDay: false,
    });
    const r = await migrateExperienceAvailabilityTablesWith(client);
    expect(r.dialect).toBe("sqlite");
    expect(r.tablesCreated).toEqual([
      "ExperienceAvailability",
      "ExperienceAvailabilityDay",
    ]);
    // ustvarjeni sta z IF NOT EXISTS (idempotentnost)
    const creates = executed.filter((s) => s.includes("CREATE TABLE"));
    expect(creates).toHaveLength(2);
    for (const c of creates) {
      expect(c).toContain("IF NOT EXISTS");
    }
    // unikatni indeks dneva varuje eno vrstico na (izkušnja, dan)
    expect(
      executed.some((s) =>
        s.includes("ExperienceAvailabilityDay_experienceId_date_key")
      )
    ).toBe(true);
  });

  test("sqlite: tabeli že obstajata → ničesar ne ustvari (idempotentno)", async () => {
    const { client, executed } = sqliteClient({
      availability: true,
      availabilityDay: true,
    });
    const r = await migrateExperienceAvailabilityTablesWith(client);
    expect(r.tablesCreated).toEqual([]);
    expect(executed.filter((s) => s.includes("CREATE TABLE"))).toHaveLength(0);
    // indeksi se varno ponovijo (IF NOT EXISTS)
    expect(executed.length).toBeGreaterThan(0);
  });

  test("postgres: manjkata → CREATE brez IF NOT EXISTS na tabelah", async () => {
    const { client, executed } = postgresClient({
      availability: false,
      availabilityDay: false,
    });
    const r = await migrateExperienceAvailabilityTablesWith(client);
    expect(r.dialect).toBe("postgres");
    expect(r.tablesCreated).toHaveLength(2);
    const creates = executed.filter((s) => s.includes("CREATE TABLE"));
    expect(creates).toHaveLength(2);
    // postgres pot uporablja TIMESTAMP(3) + pkey omejevalnik (vzorec JB)
    expect(creates[0]).toContain("TIMESTAMP(3)");
    expect(creates[0]).toContain("ExperienceAvailability_pkey");
  });

  test("postgres: obstajata → idempotentno", async () => {
    const { client, executed } = postgresClient({
      availability: true,
      availabilityDay: true,
    });
    const r = await migrateExperienceAvailabilityTablesWith(client);
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
    const r = await migrateExperienceAvailabilityTablesWith(client);
    expect(r.dialect).toBe("unknown");
    expect(r.tablesCreated).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. SOURCE-CONTRACT — shema, migracija, instrumentation, rute, UI
// ─────────────────────────────────────────────────────────────────────────

describe("TASK 33: source-contract — shema + migracija + instrumentation", () => {
  test("Prisma shema vsebuje oba modela z varovalkami", () => {
    expect(schemaSrc).toContain("model ExperienceAvailability {");
    expect(schemaSrc).toContain("model ExperienceAvailabilityDay {");
    // 1:1 veza + en vrstica na dan
    expect(schemaSrc).toContain('experienceId    String   @unique');
    expect(schemaSrc).toContain("@@unique([experienceId, date])");
    // dormant semantika je dokumentirana v shemi
    expect(schemaSrc).toContain("DORMANT dokler ponudnik ne nastavi ničesar");
  });

  test("zgodovinska migracija SQL (drift vrata)", () => {
    expect(migrationSql).toContain('CREATE TABLE "ExperienceAvailability"');
    expect(migrationSql).toContain('CREATE TABLE "ExperienceAvailabilityDay"');
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX "ExperienceAvailabilityDay_experienceId_date_key"'
    );
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX "ExperienceAvailability_experienceId_key"'
    );
  });

  test("instrumentation registrira startup korak", () => {
    expect(instrumentationSrc).toContain("schema:experience-availability");
    expect(instrumentationSrc).toContain(
      "experience-availability-migration"
    );
  });
});

describe("TASK 33: source-contract — POST /api/bookings guard (V TRANSAKCIJI)", () => {
  test("preverba teče na transakcijskem klientu (atomarno)", () => {
    // ključna varovalka: guard uporablja tx (SERIALIZABLE), ne izven
    expect(bookingRouteSrc).toContain("checkDayAvailability({");
    expect(bookingRouteSrc).toContain("db: tx,");
    expect(bookingRouteSrc).toContain("refusalMessage(policy, booked)");
  });

  test("zavrnitev vrača 409 z iskrenim sporočilom", () => {
    expect(bookingRouteSrc).toContain("outcome.refused");
    expect(bookingRouteSrc).toContain("status: 409");
  });

  test("guard je urejen ZA dedup in PRED create (isti blok transakcije)", () => {
    const dedupPos = bookingRouteSrc.indexOf("tx.booking.findFirst");
    const guardPos = bookingRouteSrc.indexOf("checkDayAvailability({");
    const createPos = bookingRouteSrc.indexOf("tx.booking.create");
    expect(dedupPos).toBeGreaterThan(0);
    expect(guardPos).toBeGreaterThan(dedupPos);
    expect(createPos).toBeGreaterThan(guardPos);
  });
});

describe("TASK 33: source-contract — javni GET /availability", () => {
  test("samo objavljene izkušnje (enoten 404) + rate limit", () => {
    expect(publicRouteSrc).toContain('status !== "published"');
    expect(publicRouteSrc).toContain('"published"');
    expect(publicRouteSrc).toContain("experience-availability");
    expect(publicRouteSrc).toContain("rateLimit");
  });

  test("NOTE (razlog zaprtja) se javno NE razkriva", () => {
    // javni odgovor vsebuje date/past/available/reason/capacity/booked/
    // remaining — polje note/override NE obstaja v odgovoru te rute
    // (funkcionalni test spodaj preverja tudi dejanski JSON)
    expect(publicRouteSrc).not.toContain("note:");
    expect(publicRouteSrc).not.toContain("override:");
  });
});

describe("TASK 33: source-contract — lastniške rute", () => {
  test("nastavitve: session + lastništvo + audit + validacija", () => {
    expect(ownerRouteSrc).toContain("getServerSession");
    expect(ownerRouteSrc).toContain("getOwnedExperience");
    expect(ownerRouteSrc).toContain("owner-api");
    expect(ownerRouteSrc).toContain("availability_settings_updated");
    expect(ownerRouteSrc).toContain("availability_settings_cleared");
    // validacijske meje so v izvorni kodi (iskrene napake)
    expect(ownerRouteSrc).toContain("10 000");
  });

  test("dnevi: upsert + delete + varovalka obsega + closed/kapaciteta", () => {
    expect(daysRouteSrc).toContain("availability_day_upserted");
    expect(daysRouteSrc).toContain("availability_day_deleted");
    expect(daysRouteSrc).toContain("expandDateRange");
    expect(daysRouteSrc).toContain("Zaprt dan nima kapacitete");
    expect(daysRouteSrc).toContain("getServerSession");
  });
});

describe("TASK 33: source-contract — UI (modal + dashboard)", () => {
  test("modal: mesečni fetch + proaktivni status dneva", () => {
    expect(modalSrc).toContain("availability?month=");
    expect(modalSrc).toContain("selectedAvail");
    expect(modalSrc).toContain("Preverjam razpoložljivost");
    expect(modalSrc).toContain("prostih mest");
    expect(modalSrc).toContain("izven sezone ponudnika");
    // blokada submita pri zaprtem/zasedenem dnevu
    expect(modalSrc).toContain("Ta datum je zaprt");
    expect(modalSrc).toContain("kapaciteta dneva je dosežena");
    // skupina ne sme preseči prostih mest
    expect(modalSrc).toContain("prostih le");
  });

  test("dashboard: gumb Koledar + dialog na kartici izkušnje", () => {
    expect(dashboardSrc).toContain("ExperienceAvailabilityDialog");
    expect(dashboardSrc).toContain("Koledar");
    expect(dashboardSrc).toContain("onAvailability");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. FUNKCIONALNO — javni GET + POST /api/bookings (dbReachable varovalka)
// ─────────────────────────────────────────────────────────────────────────

const RUN = `t33av${Date.now().toString(36)}`;
const createdExperienceIds: string[] = [];
let ipSeq = 0;

// DOSTOPNOST DB (isti vzorec kot task31): CI quality job nima baze →
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

// TASK 76: počisti okno deljenega omejevalnika pred vsakim testom
beforeEach(() => {
  clearProviderRateLimits();
});

afterAll(async () => {
  if (!dbReachable) return;
  try {
    if (createdExperienceIds.length > 0) {
      await db.booking.deleteMany({
        where: { experienceId: { in: createdExperienceIds } },
      });
      await db.experienceAvailabilityDay.deleteMany({
        where: { experienceId: { in: createdExperienceIds } },
      });
      await db.experienceAvailability.deleteMany({
        where: { experienceId: { in: createdExperienceIds } },
      });
      await db.experience.deleteMany({
        where: { id: { in: createdExperienceIds } },
      });
    }
  } catch {
    // čiščenje je best-effort
  }
});

// Prihodnji dan (~2 meseca) — vedno veljaven za POST /api/bookings
const futureDate = (() => {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + 2);
  return d.toISOString().slice(0, 10);
})();
const futureMonth = futureDate.slice(0, 7);

/** Ustvari objavljeno izkušnjo (seed) z unikatnim slugom. */
async function seedExperience(n: number, opts?: { maxGroup?: number }) {
  const exp = await db.experience.create({
    data: {
      name: `Task33 testna izkušnja ${n} ${RUN}`,
      slug: `${RUN}-exp${n}`,
      description: "Testna izkušnja za koledar razpoložljivosti (task33).",
      category: "tour",
      pricePerPerson: 25,
      durationHours: 2,
      minGroupSize: 1,
      maxGroupSize: opts?.maxGroup ?? 10,
      languages: "[]",
      address: "Testna 1, Ljubljana",
      images: "[]",
      providerName: "Testni ponudnik",
      status: "published",
    },
  });
  createdExperienceIds.push(exp.id);
  return exp;
}

function bookingPost(
  experienceId: string,
  date: string,
  groupSize: number,
  email: string
) {
  ipSeq += 1;
  return import("@/app/api/bookings/route").then(({ POST }) =>
    POST(
      new Request("http://localhost/api/bookings", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `10.33.77.${ipSeq % 250}`,
        },
        body: JSON.stringify({
          experienceId,
          groupSize,
          bookingDate: date,
          guest: {
            name: "Test Testović",
            email,
            phone: "+386 40 123 456",
            notes: "",
          },
        }),
      })
    )
  );
}

function availabilityGet(identifier: string, query: string) {
  ipSeq += 1;
  return import("@/app/api/experiences/[slug]/availability/route").then(
    ({ GET }) =>
      GET(
        new Request(
          `http://localhost/api/experiences/${identifier}/availability?${query}`,
          { headers: { "x-forwarded-for": `10.33.78.${ipSeq % 250}` } }
        ),
        { params: Promise.resolve({ slug: identifier }) }
      )
  );
}

describe("TASK 33: funkcionalno — javni GET mesečni pogled", () => {
  test("mesečni pogled: blackout dan + NOTE se ne razkriva + remaining", async () => {
    if (!dbReachable) {
      console.log("[task33-availability] DB ni dosegljiva — preskakujem");
      return;
    }
    const exp = await seedExperience(1);
    await db.experienceAvailability.create({
      data: { experienceId: exp.id, defaultCapacity: 6 },
    });
    await db.experienceAvailabilityDay.create({
      data: {
        experienceId: exp.id,
        date: futureDate,
        status: "closed",
        note: "zasebni-dogodek-t33",
      },
    });

    const res = await availabilityGet(exp.id, `month=${futureMonth}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      month: string;
      defaultCapacity: number | null;
      days: Array<{
        date: string;
        past: boolean;
        available: boolean;
        reason: string | null;
        capacity: number | null;
        booked: number;
        remaining: number | null;
        note?: unknown;
      }>;
    };
    expect(body.month).toBe(futureMonth);
    expect(body.defaultCapacity).toBe(6);

    const day = body.days.find((d) => d.date === futureDate);
    expect(day).toBeDefined();
    expect(day?.available).toBe(false);
    expect(day?.reason).toBe("blackout");
    // LASTNIŠKI note se javno NE razkriva
    expect(day && "note" in day).toBe(false);
    expect(JSON.stringify(body)).not.toContain("zasebni-dogodek-t33");

    // odprt dan v istem mesecu: kapaciteta 6, rezervacij 0
    const openDay = body.days.find(
      (d) => d.available && d.date !== futureDate && !d.past
    );
    expect(openDay?.capacity).toBe(6);
    expect(openDay?.booked).toBe(0);
    expect(openDay?.remaining).toBe(6);

    // ista izkušnja po SLUGU (javna stran)
    const resSlug = await availabilityGet(exp.slug, `month=${futureMonth}`);
    expect(resSlug.status).toBe(200);
  });

  test("invalid month → 400; neobstoječa izkušnja → 404", async () => {
    if (!dbReachable) return;
    const bad = await availabilityGet("whatever", "month=2026-7");
    expect(bad.status).toBe(400);

    const missing = await availabilityGet(`${RUN}-neobstojec`, `month=${futureMonth}`);
    expect(missing.status).toBe(404);
  });
});

describe("TASK 33: funkcionalno — POST /api/bookings guard (preprečitev overbookinga)", () => {
  test("BLACKOUT dan → 409 z iskrenim sporočilom", async () => {
    if (!dbReachable) {
      console.log("[task33-availability] DB ni dosegljiva — preskakujem");
      return;
    }
    const exp = await seedExperience(2);
    await db.experienceAvailabilityDay.create({
      data: {
        experienceId: exp.id,
        date: futureDate,
        status: "closed",
        note: "vzdrževanje",
      },
    });

    const res = await bookingPost(
      exp.id,
      futureDate,
      2,
      `${RUN}-a@test.example`
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toContain("zaprl");
    // zavrnjena rezervacija NI nastala
    const count = await db.booking.count({
      where: { experienceId: exp.id, guestEmail: `${RUN}-a@test.example` },
    });
    expect(count).toBe(0);
  });

  test("KAPACITETA/DAN: prekoračitev → 409; zadnje mesto → 200", async () => {
    if (!dbReachable) return;
    const exp = await seedExperience(3);
    await db.experienceAvailability.create({
      data: { experienceId: exp.id, defaultCapacity: 5 },
    });
    // obstoječa rezervacija: 4 od 5 mest (status confirmed)
    await db.booking.create({
      data: {
        bookingNumber: `IF-EXP-${RUN}1`,
        guestEmail: `${RUN}-seed@test.example`,
        guestName: "Obstoječi Gost",
        experienceId: exp.id,
        experienceName: exp.name,
        bookingDate: new Date(`${futureDate}T00:00:00.000Z`),
        groupSize: 4,
        pricePerPerson: 25,
        total: 100,
        status: "confirmed",
        providerName: exp.providerName,
        providerEmail: "ni-na-voljo@discoverslovenia.ai",
      },
    });

    // prekoračitev (4 + 2 > 5) → 409
    const over = await bookingPost(
      exp.id,
      futureDate,
      2,
      `${RUN}-b@test.example`
    );
    expect(over.status).toBe(409);
    const overBody = (await over.json()) as { error: string };
    expect(overBody.error).toContain("zaseden");

    // zadnje mesto (4 + 1 = 5) → uspeh
    const fit = await bookingPost(
      exp.id,
      futureDate,
      1,
      `${RUN}-c@test.example`
    );
    expect(fit.status).toBe(200);
    const fitBody = (await fit.json()) as { success: boolean; bookingNumber: string };
    expect(fitBody.success).toBe(true);
    expect(fitBody.bookingNumber).toMatch(/^IF-EXP-/);

    // sedaj je dan poln (5/5) → naslednja → 409
    const full = await bookingPost(
      exp.id,
      futureDate,
      1,
      `${RUN}-d@test.example`
    );
    expect(full.status).toBe(409);
    const fullBody = (await full.json()) as { error: string };
    expect(fullBody.error).toContain("zaseden");
  });

  test("DORMANT: izkušnja brez nastavitev → neomejeno (obnašanje nespremenjeno)", async () => {
    if (!dbReachable) return;
    const exp = await seedExperience(4);

    const res = await bookingPost(
      exp.id,
      futureDate,
      3,
      `${RUN}-e@test.example`
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);
  });

  test("IZVEN SEZONE → 409", async () => {
    if (!dbReachable) return;
    const exp = await seedExperience(5);
    // sezona, ki se je končala pred futureDate
    await db.experienceAvailability.create({
      data: {
        experienceId: exp.id,
        seasonStart: "2020-01-01",
        seasonEnd: "2020-12-31",
      },
    });

    const res = await bookingPost(
      exp.id,
      futureDate,
      2,
      `${RUN}-f@test.example`
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("sezone");
  });

  test("preklicana rezervacija NE zaseda kapacitete", async () => {
    if (!dbReachable) return;
    const exp = await seedExperience(6);
    await db.experienceAvailability.create({
      data: { experienceId: exp.id, defaultCapacity: 2 },
    });
    // preklicana rezervacija za 100 oseb — NE šteje
    await db.booking.create({
      data: {
        bookingNumber: `IF-EXP-${RUN}2`,
        guestEmail: `${RUN}-cancelled@test.example`,
        guestName: "Preklicani Gost",
        experienceId: exp.id,
        experienceName: exp.name,
        bookingDate: new Date(`${futureDate}T00:00:00.000Z`),
        groupSize: 100,
        pricePerPerson: 25,
        total: 2500,
        status: "cancelled",
        providerName: exp.providerName,
        providerEmail: "ni-na-voljo@discoverslovenia.ai",
      },
    });

    const res = await bookingPost(
      exp.id,
      futureDate,
      2,
      `${RUN}-g@test.example`
    );
    expect(res.status).toBe(200);
  });
});
