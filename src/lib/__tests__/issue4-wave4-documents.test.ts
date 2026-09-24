// ============================================================================
// ISSUE #4 §15 — DOKUMENTI POTI TESTI (VAL 4, 1.96.0)
// ============================================================================
// Naročnikova zahteva: vsak dokument ima type, source, createdAt,
// trip/reservation povezavo, privacy, deletion, offline availability.
//
// Preverjamo (vzorec task81 — unit nad migracijo + source-contract nad
// DEJANSKIMI datotekami + validacijska logika):
//   1. Zagonška migracija (idempotentna, obe narečji, fail-open);
//   2. Prisma model + baseline SQL + migracijski DDL skladje (drift vrata);
//   3. Instrumentacija registrira schema:trip-documents;
//   4. API validacije (kanonski nabori, https vrata, meje) — prek
//      source-contract + enotne logike;
//   5. UI komponenta obstaja in je pripeta na /pot.
// ============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { migrateTripDocumentsSchemaWith } from "../trip-documents-migration";

const ROOT = process.cwd();

/** Lažni Prisma klient z beleženjem izjav (scripted odgovori). */
function makeDb(script: {
  pragmaThrows?: boolean;
  info?: unknown[];
  infoThrows?: boolean;
  /** PRAGMA table_info(TripDocument) — neprazno = tabela obstaja. */
  tripDocumentExists?: boolean;
  infoTripDocumentExists?: boolean;
}) {
  const calls = { query: [] as string[], exec: [] as string[] };
  const db = {
    async $queryRawUnsafe(sql: string) {
      calls.query.push(sql);
      if (sql.startsWith("PRAGMA")) {
        if (script.pragmaThrows) throw new Error("syntax error near PRAGMA");
        if (sql.includes("TripDocument")) {
          return script.tripDocumentExists ? [{ name: "id" }] : [];
        }
        // PRAGMA SavedItinerary (dialect detekcija) = sqlite
        return [{ name: "id" }];
      }
      if (sql.includes("information_schema.tables")) {
        if (sql.includes("TripDocument")) {
          return script.infoTripDocumentExists ? [{ x: 1 }] : [];
        }
        if (script.infoThrows) throw new Error("connection refused");
        return script.info ?? [{}];
      }
      return [];
    },
    async $executeRawUnsafe(sql: string) {
      calls.exec.push(sql);
      return 0;
    },
  };
  return { db, calls };
}

type SchemaDb = Parameters<typeof migrateTripDocumentsSchemaWith>[0];

describe("§15 trip-documents-migration (unit)", () => {
  test("postgres, tabela manjka → CREATE TABLE + 2 indeksa", async () => {
    const { db, calls } = makeDb({ pragmaThrows: true, info: [{}] });
    const r = await migrateTripDocumentsSchemaWith(db as unknown as SchemaDb);
    expect(r.dialect).toBe("postgres");
    expect(r.tablesCreated).toEqual(["TripDocument"]);
    const ddl = calls.exec.join("\n");
    expect(ddl).toContain('CREATE TABLE "TripDocument"');
    expect(ddl).toContain('"type" TEXT NOT NULL');
    expect(ddl).toContain('"format" TEXT NOT NULL');
    expect(ddl).toContain('"source" TEXT NOT NULL');
    expect(ddl).toContain('"bookingId" TEXT');
    expect(ddl).toContain('"createdAt" TIMESTAMP(3) NOT NULL');
    expect(calls.exec.filter((s) => s.includes("CREATE INDEX"))).toHaveLength(2);
  });

  test("sqlite, tabela manjka → IF NOT EXISTS DDL", async () => {
    const { db, calls } = makeDb({});
    const r = await migrateTripDocumentsSchemaWith(db as unknown as SchemaDb);
    expect(r.dialect).toBe("sqlite");
    expect(r.tablesCreated).toEqual(["TripDocument"]);
    expect(calls.exec[0]).toContain("CREATE TABLE IF NOT EXISTS");
    expect(calls.exec[0]).toContain('"createdAt" DATETIME NOT NULL');
  });

  test("IDEMPOTENTNA: tabela obstaja → NE ustvarja, samo indeksi", async () => {
    const { db, calls } = makeDb({ tripDocumentExists: true });
    const r = await migrateTripDocumentsSchemaWith(db as unknown as SchemaDb);
    expect(r.tablesCreated).toEqual([]);
    expect(calls.exec.some((s) => s.includes("CREATE TABLE"))).toBe(false);
    expect(calls.exec.filter((s) => s.includes("CREATE INDEX"))).toHaveLength(2);
  });

  test("FAIL-OPEN: DB nedosegljiva → unknown, brez izjav", async () => {
    const { db, calls } = makeDb({ pragmaThrows: true, infoThrows: true });
    const r = await migrateTripDocumentsSchemaWith(db as unknown as SchemaDb);
    expect(r.dialect).toBe("unknown");
    expect(r.tablesCreated).toEqual([]);
    expect(calls.exec).toHaveLength(0);
  });
});

describe("§15 — skladje schema.prisma ↔ baseline SQL ↔ migracija (drift vrata)", () => {
  const schema = readFileSync(`${ROOT}/prisma/schema.prisma`, "utf8");
  const baseline = readFileSync(
    `${ROOT}/prisma/migrations/20260916000000_baseline/migration.sql`,
    "utf8"
  );
  const migrationModule = readFileSync(
    `${ROOT}/src/lib/trip-documents-migration.ts`,
    "utf8"
  );

  test("schema.prisma ima model TripDocument z vsemi §15 stolpci", () => {
    const model = schema.slice(
      schema.indexOf("model TripDocument {"),
      schema.indexOf("}", schema.indexOf("model TripDocument {"))
    );
    for (const col of [
      "shareId",
      "type",
      "format",
      "source",
      "title",
      "note",
      "url",
      "bookingId",
      "dayIndex",
      "authorName",
      "authorClientId",
      "createdAt",
    ]) {
      expect(model).toContain(col);
    }
    expect(model).toContain("@@index([shareId])");
    expect(model).toContain("@@index([type])");
  });

  test("baseline SQL vsebuje TripDocument DDL + 2 indeksa", () => {
    expect(baseline).toContain('CREATE TABLE "TripDocument"');
    expect(baseline).toContain(
      'CREATE INDEX "TripDocument_shareId_idx" ON "TripDocument"("shareId")'
    );
    expect(baseline).toContain(
      'CREATE INDEX "TripDocument_type_idx" ON "TripDocument"("type")'
    );
  });

  test("migracijski modul ima ISTA imena stolpcev kot baseline (skladje obeh poti)", () => {
    for (const col of [
      '"type" TEXT NOT NULL',
      '"format" TEXT NOT NULL',
      '"source" TEXT NOT NULL',
      '"bookingId" TEXT',
      '"dayIndex" INTEGER',
      '"authorName" TEXT',
      '"authorClientId" TEXT',
    ]) {
      expect(migrationModule).toContain(col);
    }
  });

  test("instrumentacija registrira korak schema:trip-documents", () => {
    const instrumentation = readFileSync(
      `${ROOT}/src/instrumentation.ts`,
      "utf8"
    );
    expect(instrumentation).toContain("schema:trip-documents");
    expect(instrumentation).toContain("trip-documents-migration");
    // tudi v izklopu (DSA_DISABLE_SCHEMA_MIGRATION)
    expect(
      instrumentation.split("schema:trip-documents").length
    ).toBeGreaterThanOrEqual(3);
  });
});

describe("§15 API — validacijska logika (source-contract)", () => {
  const route = readFileSync(
    `${ROOT}/src/app/api/trip/[shareId]/documents/route.ts`,
    "utf8"
  );

  test("kanonski nabori: vrste (§15 taksonomija) NE prosto besedilo", () => {
    expect(route).toContain('"booking_confirmation"');
    expect(route).toContain('"voucher"');
    expect(route).toContain('"ticket"');
    expect(route).toContain('"receipt"');
    expect(route).toContain('"note"');
  });

  test("zapisi vira: pdf/image/text/link/none", () => {
    for (const f of ['"pdf"', '"image"', '"text"', '"link"', '"none"']) {
      expect(route).toContain(f);
    }
  });

  test("izvor SAMO USER/IMPORTED (ista doktrina kot JourneyBooking.source)", () => {
    expect(route).toContain('DOCUMENT_SOURCES = new Set(["USER", "IMPORTED"]');
  });

  test("url SAMO https (fail-closed — isti vzorec affiliate.ts)", () => {
    expect(route).toContain("isValidHttpsUrl");
    expect(route).toContain('u.protocol === "https:"');
  });

  test("meji smeti: 100 na pot / 25 na avtorja", () => {
    expect(route).toContain("DOCUMENTS_MAX = 100");
    expect(route).toContain("AUTHOR_DOCUMENTS_MAX = 25");
  });

  test("vrata: javna pot branje vsakomur, zasebna ≥ VIEWER (read gate)", () => {
    expect(route).toContain('communityTripGate(shareId, "read")');
    expect(route).toContain('communityTripGate(shareId, "comment")');
  });

  test("brisanje SAMO avtor (clientId — diary vzorec)", () => {
    expect(route).toContain("Dokument lahko izbriše samo avtor");
    expect(route).toContain("existing.authorClientId !== clientId");
  });

  test("bookingId preverjen proti poti (NE tuje rezervacije)", () => {
    expect(route).toContain("Rezervacija ni najdena na tej poti");
  });

  test("audit: TRIP_DOCUMENT_ADDED/REMOVED zapisana", () => {
    expect(route).toContain("AUDIT_ACTIONS.TRIP_DOCUMENT_ADDED");
    expect(route).toContain("AUDIT_ACTIONS.TRIP_DOCUMENT_REMOVED");
  });

  test("kanonske akcije v audit-log.ts", () => {
    const audit = readFileSync(`${ROOT}/src/lib/audit-log.ts`, "utf8");
    expect(audit).toContain('TRIP_DOCUMENT_ADDED: "trip_document_added"');
    expect(audit).toContain('TRIP_DOCUMENT_REMOVED: "trip_document_removed"');
  });
});

describe("§15 agregator + UI (source-contract)", () => {
  test("agregator /api/trip/[shareId] vrača seznam dokumentov (§15 polja)", () => {
    const agg = readFileSync(
      `${ROOT}/src/app/api/trip/[shareId]/route.ts`,
      "utf8"
    );
    expect(agg).toContain("db.tripDocument.findMany");
    expect(agg).toContain("documents: documents.map");
  });

  test("UI komponenta obstaja in je SL-only /pot plast", () => {
    const ui = readFileSync(
      `${ROOT}/src/components/trip-documents-card.tsx`,
      "utf8"
    );
    expect(ui).toContain('"use client"');
    expect(ui).toContain("Dokumenti poti");
    // iskrenost: NE shranjujemo datotek — samo metapodatki + povezava
    expect(ui).toContain("datoteke ostanejo pri tebi");
    // offline iskrenost
    expect(ui).toContain("brez signala");
    // 99-b: enoten vir identitete
    expect(ui).toContain("getVoterId");
  });

  test("/pot stran izrisuje TripDocumentsCard", () => {
    const page = readFileSync(
      `${ROOT}/src/app/pot/[shareId]/page.tsx`,
      "utf8"
    );
    expect(page).toContain("TripDocumentsCard");
    expect(page).toContain("DOKUMENTI POTI");
  });

  test("§15 izrecna zasebnostna odločitev dokumentirana v schemi (NE binarna)", () => {
    const schema = readFileSync(`${ROOT}/prisma/schema.prisma`, "utf8");
    const block = schema.slice(schema.indexOf("ISSUE #4 §15"));
    expect(block).toContain("SAMO METAPODATKE");
    expect(block).toContain("binarna/PDF vsebina ostane pri uporabniku");
  });
});
